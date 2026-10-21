import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const path=new URL('../../public/tham-dinh-thuc-te/entry-paste.js',import.meta.url);
const ctx={window:{},structuredClone};vm.createContext(ctx);
// Bộ dán dùng chung luật của entry-checks.js (nạp trước như trên trang).
const checksPath=new URL('../../public/tham-dinh-thuc-te/entry-checks.js',import.meta.url);
if(existsSync(checksPath))vm.runInContext(readFileSync(checksPath,'utf8'),ctx);
if(existsSync(path))vm.runInContext(readFileSync(path,'utf8'),ctx);
const columns=[{key:'value',label:'Giá trị (°C)',type:'number',unit:'°C'},{key:'date',label:'Ngày đo',type:'date'}];
const targets=[{point:'P.1',trial:1,values:{}},{point:'P2',trial:1,values:{value:'0'}}];
const schema={columns,targets,decimal:','};
const header='Điểm\tLần đo\tGiá trị (°C)\tNgày đo';
const parse=(text,options=schema)=>{assert.equal(typeof ctx.window.CPC1EntryPaste?.parse,'function','paste parser must be available');return ctx.window.CPC1EntryPaste.parse(text,options);};
test('preserves comma decimal source strings, zero, dates, and dotted point IDs without mutating targets',()=>{
 const result=parse(header+'\r\nP.1\t1\t-0,1250\t2026-10-02\r\nP2\t1\t0\t');
 assert.equal(result.errors.length,0);assert.equal(result.changes.length,2);assert.equal(result.changes[0].value,'-0,1250');assert.equal(result.changes[0].point,'P.1');assert.equal(targets[0].values.value,undefined);
});
test('blank fields do not become zero or delete existing values',()=>{const r=parse(header+'\nP2\t1\t\t');assert.equal(r.errors.length,0);assert.equal(r.changes.length,0);});
test('existing values cannot be overwritten and changes are atomic',()=>{const r=parse(header+'\nP.1\t1\t5\t\nP2\t1\t6\t');assert.match(r.errors.map(e=>e.message).join(),/đã có/);assert.equal(r.changes.length,0);});
test('rejects wrong point, unknown trial and duplicate rows',()=>{
 for(const lines of ['NO\t1\t5\t','P.1\t4\t5\t','P.1\t1\t5\t\nP.1\t1\t6\t']){const r=parse(header+'\n'+lines);assert.ok(r.errors.length);assert.equal(r.changes.length,0);}
});
test('numeric convention is explicit, no thousands, NaN, infinity or exponent guessing',()=>{
 for(const value of ['1.234','1,234.5','1 234','NaN','Infinity','1e3','=2+3'])assert.ok(parse(header+'\nP.1\t1\t'+value+'\t').errors.length,value);
 assert.equal(parse(header+'\nP.1\t1\t1.25\t',{...schema,decimal:'.'}).errors.length,0);
 assert.equal(parse(header+'\nP.1\t1\t0,125\t').changes[0].value,'0,125');
});
test('số dễ nhầm hàng nghìn bị chặn tại ô dán, theo cả hai quy ước dấu thập phân',()=>{
 for(const [value,decimal] of [['4,000',','],['1,500',','],['-2,000',','],['4.000','.'],['12.345','.']]){const r=parse(header+'\nP.1\t1\t'+value+'\t',{...schema,decimal});assert.equal(r.changes.length,0,value);assert.deepEqual(JSON.parse(JSON.stringify(r.errors.map(e=>e.message))),['Số dễ nhầm hàng nghìn — gõ 4000 hoặc 4,0'],value);}
 for(const [value,decimal] of [['0,500',','],['4,0',','],['4000',','],['0.125','.']])assert.equal(parse(header+'\nP.1\t1\t'+value+'\t',{...schema,decimal}).errors.length,0,value);
});
test('ô không áp dụng ghi “—” trong bảng mẫu và được hiểu là ô trống',()=>{
 const na={columns,targets:[{point:'P.1',trial:1,values:{},editable:{value:true,date:false},reasons:{date:'Trường này không áp dụng tại điểm lấy mẫu này.'}}]};
 assert.equal(ctx.window.CPC1EntryPaste.template(na),header+'\nP.1\t1\t\t—');
 const r=parse(header+'\nP.1\t1\t5\t—',{...na,decimal:','});
 assert.equal(r.errors.length,0);assert.deepEqual(JSON.parse(JSON.stringify(r.changes)),[{point:'P.1',trial:1,key:'value',value:'5'}]);
});
test('rejects impossible dates and malformed header/cell count with column errors',()=>{
 for(const date of ['2026-02-30','02/10/2026','2026-13-01']){const r=parse(header+'\nP.1\t1\t5\t'+date);assert.ok(r.errors.some(e=>e.column==='Ngày đo'));}
 assert.ok(parse('Điểm\tSai\tGiá trị (°C)\tNgày đo\nP.1\t1\t5\t').errors.length);
 assert.ok(parse(header+'\nP.1\t1\t5').errors.length);
});
test('respects locked fields and denies dangerous keys, excessive size and rows',()=>{
 assert.ok(parse(header+'\nP.1\t1\t5\t',{...schema,targets:[{...targets[0],editable:{value:false}}]}).errors.length);
 assert.ok(parse('Điểm\tLần đo\tX\nP.1\t1\t5',{...schema,columns:[{key:'__proto__',label:'X',type:'number'}]}).errors.length);
 assert.ok(parse('x'.repeat(1048577)).errors.length);
 assert.ok(parse(header+'\n'+Array(1001).fill('P.1\t1\t5\t').join('\n')).errors.length);
});
test('template includes all permitted point/trial rows and exact headers',()=>{parse('');const text=ctx.window.CPC1EntryPaste.template(schema);assert.equal(text,header+'\nP.1\t1\t\t\nP2\t1\t\t');});

test('patch makes dense steam trials on a clone and rejects stale, denied, or populated targets',()=>{
 const context={identity:'v1',allowed:true,columns:[{key:'vg'}],targets:[{point:'P.2',trial:3,paths:{vg:['bm01','P.2',2,'vg']},editable:{vg:true}}]};
 const changes=[{point:'P.2',trial:3,key:'vg',value:'0'}],data={bm01:{}};
 const next=ctx.window.CPC1EntryPaste.patch(data,context,changes,'v1');
 assert.deepEqual(data,{bm01:{}});assert.equal(next.bm01['P.2'].length,3);assert.deepEqual(JSON.parse(JSON.stringify(next.bm01['P.2'])),[{},{},{vg:'0'}]);
 assert.throws(()=>ctx.window.CPC1EntryPaste.patch(data,context,changes,'v2'),/đã thay đổi/);
 assert.throws(()=>ctx.window.CPC1EntryPaste.patch(data,{...context,allowed:false},changes,'v1'),/đã thay đổi/);
 assert.throws(()=>ctx.window.CPC1EntryPaste.patch(next,context,changes,'v1'),/đã có/);
});
test('cột kg và µS/cm được miễn luật hàng nghìn khi dán',()=>{
 const kg={columns:[{key:'me',label:'Me (kg)',type:'number',unit:'kg'}],targets:[{point:'P.1',trial:1,values:{}}]};
 const r=parse('Điểm\tLần đo\tMe (kg)\nP.1\t1\t1,311',{...kg,decimal:','});
 assert.equal(r.errors.length,0);assert.equal(r.changes[0].value,'1,311');
});
test('hộp dán báo đúng lý do theo bộ luật nhập (âm, %, ngày, dấu so sánh, chữ) thay vì câu chung',()=>{
 const cols=[{key:'vg',label:'Vg (mL)',type:'number',unit:'mL'},{key:'purity',label:'Độ tinh khiết (%)',type:'number',unit:'%'},{key:'date',label:'Ngày đo',type:'date'}];
 const head='Điểm\tLần đo\tVg (mL)\tĐộ tinh khiết (%)\tNgày đo';
 const one=(cells)=>{const r=parse(head+'\nP.1\t1\t'+cells,{columns:cols,targets:[{point:'P.1',trial:1,values:{}}],decimal:','});return r.errors.map(e=>e.column+': '+e.message).join(' | ');};
 assert.match(one('-5\t\t'),/Vg \(mL\): .*âm/);
 assert.match(one('<1\t\t'),/so sánh/);
 assert.match(one('abc\t\t'),/Nhập một số/);
 assert.match(one('\t120\t'),/0 đến 100/);
 assert.match(one('\t\t2019-05-01'),/2020/);
 assert.match(one('12.5\t\t'),/dấu phẩy/,'quy ước dấu thập phân đã chọn vẫn được giữ');
 const micro=parse('Điểm\tLần đo\tKết quả vi sinh (CFU/m³)\nP.1\t1\t1,5',{columns:[{key:'microbial',label:'Kết quả vi sinh (CFU/m³)',type:'text',unit:'CFU/m³'}],targets:[{point:'P.1',trial:1,values:{}}],decimal:','});
 assert.match(micro.errors.map(e=>e.message).join(),/nguyên/);
});

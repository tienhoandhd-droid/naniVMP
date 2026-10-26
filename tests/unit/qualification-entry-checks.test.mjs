import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';

const file=new URL('../../public/tham-dinh-thuc-te/entry-checks.js',import.meta.url);
const ctx={window:{},console};vm.createContext(ctx);
if(existsSync(file))vm.runInContext(readFileSync(file,'utf8'),ctx,{filename:'entry-checks.js'});
const checks=()=>{assert.equal(typeof ctx.window.CPC1EntryChecks?.check,'function','entry-checks.js must expose CPC1EntryChecks');return ctx.window.CPC1EntryChecks;};
const plain=value=>JSON.parse(JSON.stringify(value));
const today='2026-10-21';
const particles={type:'number',unit:'hạt/m³',key:'p05',label:'Tiểu phân ≥ 0,5 µm'};
const volume={type:'number',unit:'mL',key:'vg',label:'Vg'};
const temperature={type:'number',unit:'°C',key:'dewpoint',label:'Điểm sương'};
const purity={type:'number',unit:'%',key:'purity',label:'Độ tinh khiết nitơ'};
const measured={type:'date',key:'execution_date',label:'Ngày thực hiện'};
const expiry={type:'date',key:'expiry',label:'Hạn hiệu chuẩn'};

test('số có dấu phân cách theo sau đúng 3 chữ số với phần nguyên khác 0 bị từ chối vì dễ nhầm hàng nghìn',()=>{
 const c=checks();
 for(const value of ['4.000','1,500','-2,000','12.345','+7,250'])assert.equal(c.check(value,volume,{today}),'Số dễ nhầm hàng nghìn — gõ 4000 hoặc 4,0',value);
 for(const value of ['0,5','0.5','0.125','4,0','4000','12,50','0,000'])assert.equal(c.check(value,volume,{today}),'',value);
 assert.equal(c.check('-0,125',temperature,{today}),'');
 assert.equal(c.thousandAmbiguous('4.000'),true);assert.equal(c.thousandAmbiguous('0.125'),false);
});

test('chặn ô không đọc được thành số, dấu so sánh, số mũ, nhiều dấu phân cách',()=>{
 const c=checks();
 for(const value of ['<1','> 5','1e3','2E-1','abc','1.234,5','1,2,3','NaN','Infinity','12 5','=2+3'])assert.notEqual(c.check(value,volume,{today}),'',value);
 assert.match(c.check('<1',volume,{today}),/dấu so sánh/);
 assert.match(c.check('1e3',volume,{today}),/số mũ/);
});

test('kiểu trường lấy từ đơn vị trong cấu hình: âm chỉ ở °C, đếm phải nguyên, phần trăm 0–100',()=>{
 const c=checks();
 assert.match(c.check('-5',volume,{today}),/âm/);assert.equal(c.check('-40,5',temperature,{today}),'');
 assert.match(c.check('12,5',particles,{today}),/nguyên/);assert.equal(c.check('12',particles,{today}),'');assert.equal(c.check('12,0',particles,{today}),'');
 assert.match(c.check('3,5',{type:'number',unit:'CFU/100 mL',key:'microbial'},{today}),/nguyên/);
 assert.match(c.check('100,1',purity,{today}),/0 đến 100/);assert.equal(c.check('99,95',purity,{today}),'');
 assert.deepEqual(plain(c.kind(particles)),{count:true,percent:false,signed:false});
 // Không đánh giá tiêu chí: giá trị vượt giới hạn vẫn là đầu vào hợp lệ.
 assert.equal(c.check('999999',particles,{today}),'');
 // Trường chữ (ví dụ vi sinh nhận KPH) không bị ép thành số.
 assert.equal(c.check('KPH',{type:'text',unit:'CFU/m³',key:'microbial'},{today}),'');
});

test('ngày đo phải đúng lịch, từ 2020-01-01 đến hôm nay + 1; ngày hạn chỉ chặn quá khứ xa',()=>{
 const c=checks();
 assert.equal(c.check('2026-10-21',measured,{today}),'');assert.equal(c.check('2026-10-22',measured,{today}),'');
 assert.match(c.check('2026-10-23',measured,{today}),/sau ngày/);
 assert.match(c.check('2019-12-31',measured,{today}),/2020/);
 for(const value of ['22026-03-10','2026-02-30','31/10/2026'])assert.match(c.check(value,measured,{today}),/Ngày không hợp lệ/,value);
 assert.equal(c.check('2028-01-31',expiry,{today}),'');
 assert.deepEqual(plain(c.dateBounds(measured,{today})),{min:'2020-01-01',max:'2026-10-22'});
 assert.deepEqual(plain(c.dateBounds(expiry,{today})),{min:'2020-01-01',max:'2099-12-31'});
});

test('ô trống luôn hợp lệ; kiểm cả bộ trả từng đường dẫn ô sai theo thứ tự',()=>{
 const c=checks();
 assert.equal(c.check('',volume,{today}),'');assert.equal(c.check('   ',volume,{today}),'');
 const problems=c.checkAll([{path:['forms','bm01','A','p05'],value:'4.000',spec:particles},{path:['forms','bm01','A','p5'],value:'',spec:particles},{path:['forms','bm04','A','sampling_date'],value:'2030-01-01',spec:measured}],{today});
 assert.deepEqual(plain(problems.map(p=>p.path)),[['forms','bm01','A','p05'],['forms','bm04','A','sampling_date']]);
});

test('người thực hiện + thời gian do máy chủ tự ghi: nhận đúng ô, không kiểm như ô nhập tay, hiển thị ngày giờ',()=>{
 const c=checks();
 assert.equal(c.autoField(['forms','bm01','A','executed_by']),'name');
 assert.equal(c.autoField(['forms','bm01','A','execution_date']),'time');
 assert.equal(c.autoField(['forms','bm04','A','result_date']),'time');
 assert.equal(c.autoField(['forms','bm04','A','sampling_date']),'','ngày lấy mẫu vẫn nhập tay');
 assert.equal(c.autoField(['forms','bm04','A','sampled_by']),'','người lấy mẫu vẫn nhập tay');
 assert.equal(c.autoField(['controls','executed_by']),'name');
 assert.equal(c.autoField(['bm01','S1',0,'executor']),'name');
 assert.equal(c.autoField(['bm02','S1','date']),'time');
 assert.equal(c.autoField(['meta','execution_date']),'time');
 assert.equal(c.autoField(['meta','report_date']),'','ngày báo cáo vẫn nhập tay');
 assert.equal(c.autoField(['equipment','balance_due']),'');
 assert.equal(c.stampText('2026-10-26T09:42:05+07:00'),'26/10/2026 09:42');
 assert.equal(c.stampText('2026-09-27'),'27/09/2026','hồ sơ cũ chỉ có ngày');
 assert.equal(c.stampText(''),'');
 assert.deepEqual(plain(c.checkAll([{path:['forms','bm01','A','execution_date'],value:'2026-10-26T09:42:05+07:00',spec:measured}],{today})),[]);
});

test('lỗi chặn từ máy chủ: giữ thông báo và đọc mọi dạng danh sách đường dẫn ô',()=>{
 const c=checks();
 const plainError=Object.assign(new Error('Đợt đã chốt hoặc hồ sơ đã có phiên bản mới. Tải lại trước khi lưu.'),{code:'PT409'});
 assert.deepEqual(plain(c.serverProblems(plainError)),{message:'Đợt đã chốt hoặc hồ sơ đã có phiên bản mới. Tải lại trước khi lưu.',cells:[]});
 const listed=Object.assign(new Error('Số liệu không hợp lệ'),{details:JSON.stringify({cells:[{path:['forms','bm01','E1.R1-C1','p05'],reason:'Số dễ nhầm hàng nghìn'}]})});
 assert.deepEqual(plain(c.serverProblems(listed).cells),[{path:['forms','bm01','E1.R1-C1','p05'],message:'Số dễ nhầm hàng nghìn'}]);
 // Hợp đồng PT422 của migration 20261021100000: details là chuỗi JSON {code, issues:[{path, field, value, rule, reason}]}.
 const pt422=Object.assign(new Error('Còn 1 ô nhập sai'),{code:'PT422',hint:'INVALID_INPUT',details:JSON.stringify({code:'INVALID_INPUT',issues:[{path:['bm01','E1.R2-P1','0','vg'],field:'vg',value:'4.000',rule:'thousand_ambiguous',reason:'Số dễ nhầm hàng nghìn — gõ 4000 hoặc 4,0'}]})});
 assert.deepEqual(plain(c.serverProblems(pt422).cells),[{path:['bm01','E1.R2-P1','0','vg'],message:'Số dễ nhầm hàng nghìn — gõ 4000 hoặc 4,0'}]);
 const paths=Object.assign(new Error('Ô sai'),{paths:[['bm01','P.1',0,'vg']]});
 assert.deepEqual(plain(c.serverProblems(paths).cells),[{path:['bm01','P.1',0,'vg'],message:'Ô sai'}]);
});

test('câu thông báo nối với lý do máy chủ không bị hai dấu chấm',()=>{
 const c=checks();
 assert.equal(c.sentence('Tải lại trước khi lưu.'),'Tải lại trước khi lưu.');
 assert.equal(c.sentence('Mạng tạm thời'),'Mạng tạm thời.');
 assert.equal(c.sentence('Sai?  '),'Sai?');
});

test('chủ dự án miễn luật hàng nghìn cho kg và µS/cm; vi sinh nhận KPH/KFH khi trường cho phép',()=>{
 const c=checks();
 assert.equal(c.check('1,311',{type:'number',unit:'kg',key:'me'},{today}),'');
 assert.equal(c.check('1.250',{type:'number',unit:'µS/cm',key:'conductivity'},{today}),'');
 assert.equal(c.check('1,311',{type:'number',unit:'mL',key:'vg'},{today}),'Số dễ nhầm hàng nghìn — gõ 4000 hoặc 4,0');
 const steamMicrobial={type:'number',unit:'CFU/100 mL',key:'microbial',notDetected:true};
 for(const value of ['KPH','kph','KFH'])assert.equal(c.check(value,steamMicrobial,{today}),'',value);
 assert.equal(c.check('3',steamMicrobial,{today}),'');assert.match(c.check('2,5',steamMicrobial,{today}),/nguyên/);
 assert.notEqual(c.check('KPH',{type:'number',unit:'CFU/100 mL',key:'microbial'},{today}),'','chỉ trường được đánh dấu mới nhận KPH');
});

test('nội độc tố (EU/mL) chỉ cảnh báo mềm, không chặn lưu — chủ dự án chưa quyết cách ghi gel-clot',()=>{
 const c=checks();
 const endotoxin={type:'number',unit:'EU/mL',key:'endotoxin',label:'Nội độc tố'};
 assert.equal(c.soft(endotoxin),true);assert.equal(c.soft({type:'number',unit:'mL',key:'vg'}),false);
 const problems=c.checkAll([{path:['bm02','P','endotoxin'],value:'<0,25',spec:endotoxin},{path:['bm02','P','toc'],value:'1e3',spec:{type:'number',unit:'ppb',key:'toc'}}],{today});
 assert.deepEqual(plain(problems.map(p=>[p.path.at(-1),p.soft])),[['endotoxin',true],['toc',false]]);
 assert.deepEqual(plain(c.blocking(problems).map(p=>p.path.at(-1))),['toc']);
 assert.match(c.SOFT_ENDOTOXIN,/Chưa chấm được — cần QA quyết cách ghi; chưa ký/);
});

test('trước khi lưu: cắt khoảng trắng đầu/cuối mọi ô, ô chỉ có khoảng trắng thành trống, không đổi dữ liệu gốc',()=>{
 const c=checks();
 const data={forms:{bm01:{A:{p05:' 12 ',p5:'   ',executed_by:'QA  An '}}},bm01:{S:[{vg:'\t5\n'},{}]},meta:{note:'x'}};
 const before=JSON.stringify(data);
 assert.deepEqual(plain(c.trimAll(data)),{forms:{bm01:{A:{p05:'12',p5:'',executed_by:'QA  An'}}},bm01:{S:[{vg:'5'},{}]},meta:{note:'x'}});
 assert.equal(JSON.stringify(data),before);
});

test('vi sinh khí nén/nitơ (ô chữ, đơn vị CFU/m³) được kiểm như máy chủ: KPH/KFH hoặc số nguyên không âm',()=>{
 const c=checks();
 const microbial={type:'text',unit:'CFU/m³',key:'microbial',label:'Kết quả vi sinh'};
 for(const value of ['KPH','KFH','kph','0','12'])assert.equal(c.check(value,microbial,{today}),'',value);
 assert.match(c.check('1,5',microbial,{today}),/nguyên/);
 assert.match(c.check('-1',microbial,{today}),/âm/);
 assert.equal(c.check('4.000',microbial,{today}),'Số dễ nhầm hàng nghìn — gõ 4000 hoặc 4,0');
 assert.notEqual(c.check('nhiều',microbial,{today}),'');
 assert.equal(c.check('Đạt',{type:'text',unit:'',key:'status'},{today}),'','ô chữ thường không bị ép thành số');
});

test('thông báo máy chủ không lộ đường dẫn kỹ thuật: tách “Ô a › b › c: lý do” thành ô cần đánh dấu',()=>{
 const c=checks();
 const error=Object.assign(new Error('Còn 1 ô nhập sai — sửa trước khi lưu. Ô forms › bm04 › E1.R1-C1 › microbial: Số đếm phải là số nguyên.'),{code:'PT422'});
 const result=plain(c.serverProblems(error));
 assert.equal(result.message,'Còn 1 ô nhập sai — sửa trước khi lưu.');
 assert.deepEqual(result.cells,[{path:['forms','bm04','E1.R1-C1','microbial'],message:'Số đếm phải là số nguyên.'}]);
 assert.doesNotMatch(result.message,/›|forms/);
});

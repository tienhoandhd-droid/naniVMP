import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const context={window:{}};
for(const file of ['trend-limits','summary-model']){const path=new URL(`../../public/tham-dinh-thuc-te/${file}.js`,import.meta.url);if(existsSync(path))vm.runInNewContext(readFileSync(path,'utf8'),context);}
const api=()=>{assert.ok(context.window.CPC1SummaryModel,'summary model must exist');return context.window.CPC1SummaryModel;};
const run={id:'run',status:'open'},item={system:'air',record_id:'rec',version:2,scope:{bm01:['P1','P2']}};
const snapshot=()=>({created_at:'2026-11-25T01:00:00Z',data:{system:'air',forms:{bm01:{P1:{p05:'0',p5:'8',executed_by:'An',execution_date:'2026-11-24'}}}},evaluation:{source_context:{config:{system:'air',forms:[{id:'bm01',locations:[{id:'P1',name:'C1.A01 Phòng pha',limits:{p05:100,p5:5}},{id:'P2',name:'C2.A02 Phòng chiết',limits:{p05:100,p5:5}}]}]}},forms:{bm01:{rows:{P1:{status:'fail',parameters:{p05:'pass',p5:'fail'},values:{p05:"0",p5:"8"}},P2:{status:'incomplete',values:{}}}}}}});
test('area derives unique saved room code, explicit area takes priority and ambiguous names remain unknown',()=>{
 const {areaFor}=api();assert.equal(areaFor({name:'C1.A01 Phòng chiết'}),'C1');assert.equal(areaFor({name:'C12.A01 · C12.A02'}),'C12');assert.equal(areaFor({name:'c2.a01'}),'C2');assert.equal(areaFor({name:'C1.A01 / C2.A01'}),'Chưa xác định khu');assert.equal(areaFor({id:'C4-P1',name:'Điểm 1'}),'Chưa xác định khu');assert.equal(areaFor({area:'C3',name:'C1.A01'}),'C3');
});
test('missing scoped points stay in denominator, zero is saved, particle channels stay independent',()=>{
 const rows=api().buildRows(run,item,snapshot());assert.equal(rows.length,4);assert.equal(rows.find(r=>r.point==='P1'&&r.metric==='p05').state,'pass');assert.equal(rows.find(r=>r.point==='P1'&&r.metric==='p05').values[0],'0');assert.equal(rows.find(r=>r.point==='P1'&&r.metric==='p5').state,'fail');
 const s=api().summarize(rows);assert.deepEqual([s.total,s.complete,s.pass,s.fail,s.missing,s.points,s.percent],[2,1,0,1,1,2,50]);
});
test('filters intersect and do not mutate snapshot; declared performer is not presented as updater',()=>{
 const before=snapshot(),raw=JSON.stringify(before),rows=api().buildRows(run,item,before),filtered=api().filterRows(rows,{system:'air',area:'C1',metric:'bm01:p5',state:'fail'});assert.equal(filtered.length,1);assert.equal(filtered[0].performer,'An');assert.equal(filtered[0].date,'2026-11-24');assert.equal(filtered[0].savedAt,before.created_at);assert.equal(JSON.stringify(before),raw);assert.equal(api().filterRows(rows,{system:'nitrogen'}).length,0);
});
test('steam requires all three trials, failing trial wins, non-applicable endotoxin excluded',()=>{
 const data={system:'steam',bm03:{P1:[{date:'2026-11-24'}]},bm02:{P1:{conductivity:'1',toc:'2',microbial:'3'}}};
 const evaluation={source_context:{config:{locations:[{id:'P1',name:'C4.A01',endotoxin:false}]},criteria:{dryness_min:.95}},forms:{bm03:{rows:{P1:[{status:'pass',values:{result:.98,raw_result:'.98'}},{status:'incomplete',values:{}},{status:'pass',values:{result:.98,raw_result:'0.98'}}]}}}};
 const rows=api().buildRows(run,{...item,system:'steam',scope:{bm03:['P1'],bm02:['P1']}},{data,evaluation});assert.equal(rows.some(r=>r.metric==='endotoxin'),false);assert.equal(rows.find(r=>r.form==='bm03').state,'missing');assert.equal(rows.find(r=>r.form==='bm03').complete,false);
 evaluation.forms.bm03.rows.P1[0]={status:'fail',values:{result:.9,raw_result:'0.9'}};assert.equal(api().buildRows(run,{...item,system:'steam',scope:{bm03:['P1']}},{data,evaluation})[0].state,'fail');
});
test('missing snapshots and invalid numeric values never imply completion or pass',()=>{
 const rows=api().buildRows(run,item,null);assert.ok(rows.every(r=>r.state==='unknown'));assert.equal(api().summarize(rows).complete,0);
 const s=snapshot();s.evaluation.forms.bm01.rows.P1.values.p05=null;assert.equal(api().buildRows(run,item,s).find(r=>r.point==='P1'&&r.metric==='p05').state,'unknown');
});
test('explicit saved parameter verdict is preserved even when numeric comparison metadata is missing',()=>{
 const s=snapshot();delete s.evaluation.source_context.config.forms[0].locations[0].limits;const row=api().buildRows(run,item,s)[0];assert.equal(row.state,'pass');assert.equal(row.complete,true);
});

test('steam performer is taken from each saved trial executor, never the report summary author',()=>{
 const s={data:{bm03:{P1:[{executor:'Người đo',date:'2026-11-20'}]},meta:{executed_by:'Người tổng hợp'}},evaluation:{source_context:{config:{locations:[{id:'P1',name:'C1.A01'}]}}}};
 const row=api().buildRows(run,{...item,system:'steam',scope:{bm03:['P1']}},s)[0];assert.equal(row.performer,'Người đo');assert.equal(row.date,'2026-11-20');
});

test('issued room-point IDs provide area even when steam names omit room code or DOCX names are flattened',()=>{
 const {areaFor}=api();assert.equal(areaFor({id:'C1.R28-P1',name:'Máy BFS Weiler'}),'C1');assert.equal(areaFor({id:'E1.R1-N1',name:'Sau tank chứa khí nitơ'}),'E1');assert.equal(areaFor({id:'C2.R28-C1',name:'C2.R28Phòng máy BFS'}),'C2');assert.equal(areaFor({id:'C1.R28-P1',name:'C2.R21 Phòng cân'}),'Chưa xác định khu');
});

test('a failed partial task remains in unfinished counts and the missing filter',()=>{
 const rows=[{system:'steam',point:'P1',state:'fail',complete:false,metricKey:'bm03:result'}];assert.equal(api().summarize(rows).missing,1);assert.equal(api().summarize(rows).fail,1);assert.equal(api().filterRows(rows,{state:'missing'}).length,1);
});

test('microbial executor is paired with result date rather than another persons sampling date',()=>{
 const s=snapshot();s.data.forms.bm04={P1:{microbial:'2',sampled_by:'Lấy mẫu',sampling_date:'2026-11-20',executed_by:'Kiểm nghiệm',result_date:'2026-11-24'}};
 const row=api().buildRows(run,{...item,scope:{bm04:['P1']}},s)[0];assert.equal(row.performer,'Kiểm nghiệm');assert.equal(row.date,'2026-11-24');assert.equal(row.sampledBy,'Lấy mẫu');assert.equal(row.samplingDate,'2026-11-20');
});


test('numeric text is the server contract: valid strings preserve saved values and terminal verdicts',()=>{
 const s=snapshot();s.data.forms.bm01.P1.p05='0';s.evaluation.forms.bm01.rows.P1.values={p05:'0',p5:'8'};
 const rows=api().buildRows(run,item,s),zero=rows.find(r=>r.point==='P1'&&r.metric==='p05'),fail=rows.find(r=>r.point==='P1'&&r.metric==='p5');
 assert.equal(zero.state,'pass');assert.equal(zero.complete,true);assert.equal(zero.values[0],'0');assert.equal(fail.state,'fail');assert.equal(fail.complete,true);
});
test('negative and fractional numeric text is interpreted without losing the exact saved text',()=>{
 const s={data:{system:'air',forms:{bm02:{P1:{dewpoint:'-10.00001'}}}},evaluation:{}};s.evaluation.source_context={config:{system:'air',forms:[{id:'bm02',locations:[{id:'P1',limits:{dewpoint:-10}}]}]}};s.evaluation.forms={bm02:{rows:{P1:{status:'pass',values:{result:'-10.00001',raw_result:'-10.00001'}}}}};
 const row=api().buildRows(run,{...item,scope:{bm02:['P1']}},s)[0];assert.equal(row.state,'pass');assert.equal(row.complete,true);assert.equal(row.values[0],'-10.00001');
});
test('blank and malformed numeric text never become zero or a passing result',()=>{
 for(const value of ['', ' ', 'abc', '1,2,3', 'Infinity']){const s=snapshot();s.evaluation.forms.bm01.rows.P1.values.p05=value;const row=api().buildRows(run,item,s)[0];assert.equal(row.complete,false,value);assert.notEqual(row.state,'pass',value);}
});
test('qualitative endotoxin retains explicit saved parameter conclusion instead of requiring a number',()=>{
 for(const [text,status]of [['Đạt','pass'],['Không đạt','fail']]){
  const s={data:{bm02:{P1:{endotoxin:text}}},evaluation:{}};s.evaluation.source_context={config:{locations:[{id:'P1',name:'C1.R1-P1',endotoxin:true}]},criteria:{endotoxin_max:.25}};s.evaluation.forms={bm02:{rows:{P1:{status,parameters:{endotoxin:status},values:{endotoxin:text}}}}};
  const row=api().buildRows(run,{...item,system:'steam',scope:{bm02:['P1']}},s).find(r=>r.metric==='endotoxin');assert.equal(row.state,status);assert.equal(row.complete,true);assert.equal(row.values[0],text);
 }
});


test('steam microbial KPH preserves its saved pass verdict and original source text',()=>{
 const s={data:{bm02:{P1:{microbial:'KPH'}}},evaluation:{}};
 s.evaluation.source_context={config:{locations:[{id:'P1',endotoxin:false}]},criteria:{microbial_max:10}};
 s.evaluation.forms={bm02:{rows:{P1:{status:'pass',parameters:{microbial:'pass'},values:{microbial:'0'}}}}};
 const row=api().buildRows(run,{...item,system:'steam',scope:{bm02:['P1']}},s).find(r=>r.metric==='microbial');assert.equal(row.state,'pass');assert.equal(row.complete,true);assert.equal(row.values[0],'KPH');assert.deepEqual(Array.from(row.limits),['≤ 10']);
});
test('a saved single-criterion verdict is not lost when legacy snapshot lacks chart criteria',()=>{
 const s={data:{system:'air',forms:{bm02:{P1:{dewpoint:'-12'}}}},evaluation:{forms:{bm02:{rows:{P1:{status:'pass',values:{result:'-12',raw_result:'-12'}}}}}}};
 const row=api().buildRows(run,{...item,scope:{bm02:['P1']}},s)[0];assert.equal(row.state,'pass');assert.equal(row.complete,true);
});
test('a composite particle failure never marks the passing particle channel as failed',()=>{
 const s=snapshot();delete s.evaluation.forms.bm01.rows.P1.parameters;
 const rows=api().buildRows(run,item,s);assert.equal(rows[0].state,'pass');assert.equal(rows[1].state,'fail');
});
test('a composite failure without enough comparison metadata remains unresolved for its individual channels',()=>{
 const s=snapshot();delete s.evaluation.forms.bm01.rows.P1.parameters;delete s.evaluation.source_context.config.forms[0].locations[0].limits;
 const rows=api().buildRows(run,item,s);assert.equal(rows[0].state,'unknown');assert.equal(rows[1].state,'unknown');
});

test('legacy steam BM02 combined failure is not copied to its other parameters',()=>{
 const s={data:{bm02:{P1:{conductivity:'2',toc:'100',microbial:'0'}}},evaluation:{}};
 s.evaluation.source_context={config:{locations:[{id:'P1',endotoxin:false}]},criteria:{conductivity_max:1.3,toc_max:500,microbial_max:10}};
 s.evaluation.forms={bm02:{rows:{P1:{status:'fail',values:{conductivity:'2',toc:'100',microbial:'0'}}}}};
 const rows=api().buildRows(run,{...item,system:'steam',scope:{bm02:['P1']}},s);assert.equal(rows.find(r=>r.metric==='conductivity').state,'fail');assert.equal(rows.find(r=>r.metric==='toc').state,'pass');assert.equal(rows.find(r=>r.metric==='microbial').state,'pass');
});

test('particle sizes are one measurement in progress while both indicator verdicts remain visible',()=>{
 const rows=api().buildRows(run,item,snapshot());assert.equal(rows.length,4);
 const s=api().summarize(rows);assert.deepEqual([s.total,s.complete,s.fail,s.missing,s.percent],[2,1,1,1,50]);
});
test('one particle size filter cannot manufacture completion when its sibling is missing',()=>{
 const s=snapshot();s.evaluation.forms.bm01.rows.P1={status:'incomplete',parameters:{p05:'pass',p5:'incomplete'},values:{p05:'0'}};
 const rows=api().buildRows(run,item,s),small=api().filterRows(rows,{area:'C1',metric:'bm01:p05'});
 assert.equal(small[0].state,'pass');assert.equal(api().summarize(small).complete,0);assert.equal(api().filterRows(rows,{area:'C1',state:'missing'}).length,2);
});
test('both failed particle sizes count once, but separate runs and systems remain separate measurements',()=>{
 const s=snapshot();s.evaluation.forms.bm01.rows.P1.parameters={p05:'fail',p5:'fail'};s.evaluation.forms.bm01.rows.P1.values.p05='120';s.data.forms.bm01.P1.p05='120';
 const rows=api().buildRows(run,{...item,scope:{bm01:['P1']}},s);assert.equal(api().summarize(rows).fail,1);
 const anotherRun=rows.map(r=>({...r,run:'another'})),anotherSystem=rows.map(r=>({...r,system:'nitrogen'})),anotherRecord=rows.map(r=>({...r,record:'another-record'}));assert.equal(api().summarize([...rows,...anotherRun,...anotherSystem,...anotherRecord]).total,4);
});
test('other indicators keep their individual counts',()=>{
 const rows=[{run:'run',record:'s',system:'steam',form:'bm02',point:'P1',metric:'toc',state:'pass',complete:true},{run:'run',record:'s',system:'steam',form:'bm02',point:'P1',metric:'microbial',state:'pass',complete:true}];assert.equal(api().summarize(rows).total,2);
});
test('metric options are grouped in form order with plain labels and distinct steam/gas meanings',()=>{
 assert.equal(typeof api().metricOptions,'function');
 const rows=[{system:'steam',form:'bm03',metric:'result',metricKey:'bm03:result',label:'Độ khô'},{system:'air',form:'bm01',metric:'p5',metricKey:'bm01:p5',label:'Tiểu phân ≥ 5 µm'},{system:'air',form:'bm03',metric:'result',metricKey:'bm03:result',label:'Hàm lượng dầu'},{system:'nitrogen',form:'bm01',metric:'p5',metricKey:'bm01:p5',label:'Tiểu phân ≥ 5 µm'}];
 const options=api().metricOptions(rows);assert.equal(options.length,3);assert.deepEqual(Array.from(options,o=>o.form),['bm01','bm03','bm03']);assert.ok(options.every(o=>!o.label.includes('BM')));assert.notEqual(options.find(o=>o.label==='Độ khô').value,options.find(o=>o.label==='Hàm lượng dầu').value);assert.deepEqual(Array.from(api().filterRows(rows,{metric:options.find(o=>o.label==='Độ khô').value}),r=>r.label),['Độ khô']);assert.deepEqual(Array.from(api().filterRows(rows,{metric:options.find(o=>o.label==='Hàm lượng dầu').value}),r=>r.label),['Hàm lượng dầu']);
});

import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const context={window:{}};
for(const file of ['trend-limits','summary-model']){const path=new URL(`../../public/tham-dinh-thuc-te/${file}.js`,import.meta.url);if(existsSync(path))vm.runInNewContext(readFileSync(path,'utf8'),context);}
const api=()=>{assert.ok(context.window.CPC1SummaryModel,'summary model must exist');return context.window.CPC1SummaryModel;};
const run={id:'run',status:'open'},item={system:'air',record_id:'rec',version:2,scope:{bm01:['P1','P2']}};
const snapshot=()=>({created_at:'2026-11-25T01:00:00Z',data:{system:'air',forms:{bm01:{P1:{p05:'0',p5:'8',executed_by:'An',execution_date:'2026-11-24'}}}},evaluation:{source_context:{config:{system:'air',forms:[{id:'bm01',locations:[{id:'P1',name:'C1.A01 Phòng pha',limits:{p05:100,p5:5}},{id:'P2',name:'C2.A02 Phòng chiết',limits:{p05:100,p5:5}}]}]}},forms:{bm01:{rows:{P1:{status:'fail',parameters:{p05:'pass',p5:'fail'},values:{p05:0,p5:8}},P2:{status:'incomplete',values:{}}}}}}});
test('area derives unique saved room code, explicit area takes priority and ambiguous names remain unknown',()=>{
 const {areaFor}=api();assert.equal(areaFor({name:'C1.A01 Phòng chiết'}),'C1');assert.equal(areaFor({name:'C12.A01 · C12.A02'}),'C12');assert.equal(areaFor({name:'c2.a01'}),'C2');assert.equal(areaFor({name:'C1.A01 / C2.A01'}),'Chưa xác định khu');assert.equal(areaFor({id:'C4-P1',name:'Điểm 1'}),'Chưa xác định khu');assert.equal(areaFor({area:'C3',name:'C1.A01'}),'C3');
});
test('missing scoped points stay in denominator, zero is saved, particle channels stay independent',()=>{
 const rows=api().buildRows(run,item,snapshot());assert.equal(rows.length,4);assert.equal(rows.find(r=>r.point==='P1'&&r.metric==='p05').state,'pass');assert.equal(rows.find(r=>r.point==='P1'&&r.metric==='p05').values[0],'0');assert.equal(rows.find(r=>r.point==='P1'&&r.metric==='p5').state,'fail');
 const s=api().summarize(rows);assert.deepEqual([s.total,s.complete,s.pass,s.fail,s.missing,s.points,s.percent],[4,2,1,1,2,2,50]);
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
test('unknown criteria preserve saved completion but never show a passing verdict',()=>{
 const s=snapshot();delete s.evaluation.source_context.config.forms[0].locations[0].limits;const row=api().buildRows(run,item,s)[0];assert.equal(row.state,'unknown');assert.equal(row.complete,true);
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

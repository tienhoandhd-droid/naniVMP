import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const context={window:{}};
for(const file of ['box-stats','pq-charts'])vm.runInNewContext(readFileSync(new URL(`../../public/tham-dinh-thuc-te/${file}.js`,import.meta.url),'utf8'),context);
const api=context.window.CPC1PQCharts,plain=v=>JSON.parse(JSON.stringify(v));
const row=(point,value,state='within',extra={})=>({form:'bm01',metric:'p05',label:'Tiểu phân ≥ 0,5 µm',unit:'hạt/m³',point_id:point,trial:1,value,action:{state,plotValue:value,rawValue:String(value),limit:100,direction:'max'},...extra});
const group=(rows,options)=>api.prepare(rows,options)[0];
const sum=(group,options)=>{assert.equal(typeof api.summarize,'function','per-metric point summary must exist');return api.summarize(group,options);};
test('two particle channels have separate extrema, limits and point counts',()=>{
 const rows=[row('P1',80),row('P2',120,'above'),row('P1',8,'above',{metric:'p5',label:'Tiểu phân ≥ 5 µm',action:{state:'above',plotValue:8,rawValue:'8',limit:5,direction:'max'}}),row('P2',2,'within',{metric:'p5',action:{state:'within',plotValue:2,rawValue:'2',limit:5,direction:'max'}})];
 const [small,large]=api.prepare(rows,{system:'air'}),a=sum(small),b=sum(large);
 assert.equal(a.min.value,80);assert.equal(a.max.value,120);assert.equal(b.min.value,2);assert.equal(b.max.value,8);
 assert.deepEqual(plain(a.points),{pass:['P1'],fail:['P2'],unknown:[]});assert.deepEqual(plain(b.points),{pass:['P2'],fail:['P1'],unknown:[]});
 assert.equal(small.rows[0].action.limit,100);assert.equal(large.rows[0].action.limit,5);
});
test('point counts count each location once, fail wins and missing/uncertain cannot pass',()=>{
 const g=group([row('P1',3),row('P1',5,'within',{trial:2}),row('P2',120,'above'),row('P2',null,'unknown',{trial:2}),row('P3',1),row('P3',2,'within',{trial:2,uncertain:true}),row('P4',null,'unknown')]);
 const s=sum(g);assert.deepEqual([s.total,s.pass,s.fail,s.unknown],[4,1,1,2]);
 assert.deepEqual(plain(s.points),{pass:['P1'],fail:['P2'],unknown:['P3','P4']});
});
test('extrema include zero and all tied point/trial locations, exclude null and uncertain',()=>{
 const s=sum(group([row('P10',0),row('P2',0),row('P2',0,'within',{trial:2}),row('P3',7),row('P4',null,'unknown'),row('P5',900,'within',{uncertain:true})]));
 assert.equal(s.min.value,0);assert.equal(s.max.value,7);
 assert.deepEqual(plain(s.min.rows.map(r=>[r.point_id,r.trial])),[['P2',1],['P2',2],['P10',1]]);
 assert.deepEqual(plain(s.max.rows.map(r=>r.point_id)),['P3']);
});
test('extrema use precise saved values, not rounded history values or PQ limit',()=>{
 const s=sum(group([row('P1',-10,'within',{action:{state:'within',plotValue:-10.001,rawValue:'-10.001',limit:-5,direction:'max'}}),row('P2',-10,'above',{action:{state:'above',plotValue:-9.999,rawValue:'-9.999',limit:-10,direction:'max'}})]));
 assert.equal(s.min.value,-10.001);assert.equal(s.max.value,-9.999);assert.equal(s.max.rows[0].action.rawValue,'-9.999');
});
test('pending comparison suppresses cached pass/fail while preserving numeric extrema',()=>{
 const s=sum(group([row('P1',3),row('P2',120,'above')]),{pending:true});
 assert.deepEqual([s.total,s.pass,s.fail,s.unknown],[2,0,0,2]);assert.equal(s.max.value,120);
});
test('a missing saved trial does not turn a partial point into a passing point',()=>{
 const snapshot={evaluation:{forms:{bm03:{rows:{P1:[{status:'pass'},{status:'incomplete'},{status:'pass'}]}}}}};
 const g=group([row('P1',.96,'within',{form:'bm03',metric:'result',unit:'D'}),row('P1',.98,'within',{form:'bm03',metric:'result',unit:'D',trial:3})]);
 assert.deepEqual(plain(sum(g,{snapshot}).points),{pass:[],fail:[],unknown:['P1']});
});
test('scope includes a location absent from saved trend, while a point filter narrows it',()=>{
 const snapshot={evaluation:{run_scope:{bm01:['P1','P2','P3']}}};
 const gs=api.prepare([row('P1',5),row('P2',150,'above')],{system:'air',snapshot});
 assert.deepEqual(Array.from(gs[0].points),['P1','P2','P3']);assert.deepEqual([sum(gs[0]).pass,sum(gs[0]).fail,sum(gs[0]).unknown],[1,1,1]);
 const [filtered]=api.prepare([row('P2',150,'above')],{system:'air',snapshot,point:'P2'});assert.equal(sum(filtered).total,1);
});
test('a missing particle channel gets its own empty chart, not the sibling values',()=>{
 const [small,large]=api.prepare([row('P1',6)],{system:'air'});
 assert.equal(large?.metric,'p5');assert.equal(large.label,'Tiểu phân ≥ 5 µm');assert.equal(large.rows.length,0);
 assert.deepEqual([sum(large).total,sum(large).pass,sum(large).unknown],[1,0,1]);assert.equal(sum(large).min,null);assert.equal(sum(small).min.value,6);
});
test('different unit groups never borrow canonical particle data',()=>{
 const groups=api.prepare([row('P1',10),row('P1',2,'unknown',{unit:'khác'})],{system:'air'});
 assert.equal(groups.length,3);const noncanonical=groups.find(g=>g.unit==='khác');assert.equal(sum(noncanonical).min.value,2);assert.equal(sum(noncanonical).unknown,1);
});
test('preferred plot types distinguish particle channels/conductivity from negative/near-unit metrics',()=>{
 assert.equal(typeof api.chartKind,'function');
 for(const metric of ['p05','p5'])assert.equal(api.chartKind('air',{form:'bm01',metric,unit:'hạt/m³'}),'bar');
 assert.equal(api.chartKind('steam',{form:'bm02',metric:'conductivity',unit:'µS/cm'}),'bar');
 assert.equal(api.chartKind('air',{form:'bm02',metric:'result',unit:'°C'}),'individual');
 assert.equal(api.chartKind('steam',{form:'bm03',metric:'result',unit:'D'}),'individual');
 assert.equal(api.chartKind('air',{form:'bm01',metric:'p05',unit:'unknown'}),'individual');
});
test('summary never changes source rows or fills an all-missing group with zeros',()=>{
 const rows=[row('P1',null,'unknown'),row('P2',100,'unknown',{uncertain:true})],before=JSON.stringify(rows);
 const s=sum(group(rows));assert.equal(s.min,null);assert.equal(s.max,null);assert.equal(s.unknown,2);assert.equal(JSON.stringify(rows),before);
});
test('extrema distinguish exact saved decimals beyond Number precision and tie equivalent decimals',()=>{
 const precise=(p,raw)=>row(p,1,'within',{action:{state:'within',plotValue:Number(raw),rawValue:raw,limit:2,direction:'max'}});
 const s=sum(group([precise('P1','1.00000000000000001'),precise('P2','1.00000000000000002'),precise('P3','1.000000000000000020')]));
 assert.deepEqual(plain(s.min.rows.map(r=>r.point_id)),['P1']);assert.deepEqual(plain(s.max.rows.map(r=>r.point_id)),['P2','P3']);
});
test('saved scope does not add non-applicable endotoxin locations as missing measurements',()=>{
 const snapshot={evaluation:{run_scope:{bm02:['P1','P2']},source_context:{config:{locations:[{id:'P1',endotoxin:true},{id:'P2',endotoxin:false}]}}}};
 const g=group([row('P1',.1,'within',{form:'bm02',metric:'endotoxin',unit:'EU/mL'})],{system:'steam',snapshot});
 assert.equal(sum(g).total,1);assert.equal(sum(g).unknown,0);
});
test('filtering to one particle channel never fabricates an empty sibling',()=>{
 for(const metric of ['p05','p5']){
  const groups=api.prepare([row('P1',4,'within',{metric})],{system:'air',selectedMetric:metric});
  assert.equal(groups.length,1);assert.equal(groups[0].metric,metric);assert.equal(sum(groups[0]).min.value,4);
 }
});
test('selecting a scoped point with no measurements retains empty metric summaries',()=>{
 const snapshot={evaluation:{run_scope:{bm01:['P1','P2']}}};
 const groups=api.prepare([],{system:'air',snapshot,point:'P2',groupRows:[row('P1',8)]});
 assert.equal(groups.length,2);for(const g of groups){const s=sum(g);assert.equal(s.total,1);assert.equal(s.unknown,1);assert.equal(s.min,null);}
});

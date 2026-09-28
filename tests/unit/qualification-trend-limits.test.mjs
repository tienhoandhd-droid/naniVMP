import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const ctx={window:{}};vm.runInNewContext(readFileSync(new URL('../../public/tham-dinh-thuc-te/trend-limits.js',import.meta.url),'utf8'),ctx);const api=ctx.window.CPC1TrendLimits;
const gas=(form,metric,value,limit,{point='P1',status='pass',raw=value}={})=>({row:{form,point_id:point,metric,unit:form==='bm01'?'hạt/m³':form==='bm02'?'°C':form==='bm03'?'mg/m³':form==='bm05'?'%':'CFU/m³',value:Number(value)},snapshot:{data:{system:'air',forms:{[form]:{[point]:{[metric]:raw}}}},evaluation:{forms:{[form]:{rows:{[point]:{status,values:{[metric]:value,raw_result:raw}}}}},source_context:{config:{system:'air',forms:[{id:form,locations:[{id:point,limits:{[form==='bm01'?metric:({bm02:'dewpoint',bm03:'oil',bm05:'purity'})[form]]:limit}}]}]}}}}});
const annotate=x=>api.annotate('air',x.row,x.snapshot);
test('protocol upper bound is inclusive; compare original precision, not rounded display',()=>{
 let x=gas('bm01','p05','10','10');assert.equal(annotate(x).state,'within');
 x=gas('bm01','p05','10','10',{status:'fail',raw:'10.00000000000000001'});assert.equal(annotate(x).state,'above');
 assert.equal(annotate(gas('bm01','p05','9','10')).state,'within');
});
test('lower bound and negative upper bound use correct direction',()=>{
 assert.equal(annotate(gas('bm05','result','99.8','99.9',{status:'fail'})).state,'below');
 assert.equal(annotate(gas('bm05','result','99.9','99.9')).state,'within');
 assert.equal(annotate(gas('bm02','result','-12','-10')).state,'within');
 assert.equal(annotate(gas('bm02','result','-9','-10',{status:'fail'})).state,'above');
});
test('limits are point specific and never borrowed from another location or current config',()=>{
 const x=gas('bm01','p05','20','10');x.snapshot.evaluation.source_context.config.forms[0].locations.push({id:'P2',limits:{p05:30}});
 assert.equal(annotate(x).limit,10);x.row.point_id='P3';assert.equal(annotate(x).state,'unknown');
 x.row.point_id='P1';delete x.snapshot.evaluation.source_context;assert.equal(annotate(x).state,'unknown');
});
test('unit/system mismatch, uncertain and invalid cannot become outside or passing',()=>{
 const x=gas('bm01','p05','20','10');x.row.unit='hạt/L';assert.equal(annotate(x).state,'unknown');
 x.row.unit='hạt/m³';x.row.uncertain=true;assert.equal(annotate(x).plotValue,null);
 x.row.uncertain=false;x.snapshot.evaluation.forms.bm01.rows.P1.status='invalid';assert.equal(annotate(x).state,'unknown');assert.equal(annotate(x).plotValue,null);
 x.snapshot.evaluation.source_context.config.system='nitrogen';assert.equal(annotate(x).state,'unknown');
});
test('composite particle fail does not mark a different parameter outside',()=>{
 const x=gas('bm01','p05','8','10',{status:'fail'});assert.equal(annotate(x).state,'within');
});
test('steam uses saved raw result; no invented lower bound on superheat',()=>{
 const row={form:'bm04',point_id:'S1',trial:1,metric:'result',unit:'°C',value:-3};
 const snapshot={data:{bm04:{S1:[{}]}},evaluation:{source_context:{criteria:{superheat_max:25},config:{}},forms:{bm04:{rows:{S1:[{status:'fail',values:{result:'-3',raw_result:'-3',delta:'4'}}]}}}}};
 const a=api.annotate('steam',row,snapshot);assert.equal(a.state,'within');assert.equal(a.direction,'max');assert.equal(a.limit,25);
 row.metric='delta';row.value=3;snapshot.evaluation.source_context.criteria.delta_max=3;snapshot.evaluation.forms.bm04.rows.S1[0].values.delta='3';
 assert.equal(api.annotate('steam',row,snapshot).state,'unknown','rounded boundary and composite fail stays uncertain');
});
test('valid steam parameter remains chartable when a different parameter is invalid',()=>{
 const row={form:'bm02',point_id:'S1',metric:'toc',unit:'ppb',value:500};const snapshot={data:{bm02:{S1:{toc:'500'}}},evaluation:{source_context:{criteria:{toc_max:500},config:{}},forms:{bm02:{rows:{S1:{status:'invalid',parameters:{toc:'pass'},values:{toc:'500'}}}}}}};
 assert.equal(api.annotate('steam',row,snapshot).state,'within');
});
test('missing observation stays missing even if another value exists in the snapshot',()=>{
 const x=gas('bm01','p05','20','10');x.row.value=null;assert.equal(annotate(x).plotValue,null);
});
test('oil uses saved exact server decision when division raw_result rounds onto the boundary',()=>{
 const x=gas('bm03','result','0.1','0.1',{status:'fail',raw:'0.10000000000000000000'});
 assert.equal(annotate(x).state,'above','server cross-multiplication decision takes precedence over rounded quotient');
});

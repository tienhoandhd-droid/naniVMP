import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const context={window:{}};
vm.runInNewContext(readFileSync(new URL('../../public/tham-dinh-thuc-te/box-stats.js',import.meta.url),'utf8'),context);
vm.runInNewContext(readFileSync(new URL('../../public/tham-dinh-thuc-te/pq-charts.js',import.meta.url),'utf8'),context);
const layout=(ys,gap)=>{
  assert.equal(typeof context.window.CPC1PQCharts.swarm,'function','a deterministic dot layout must exist');
  return Array.from(context.window.CPC1PQCharts.swarm(ys,gap));
};
function separated(xs,ys,gap){
  assert.equal(xs.length,ys.length,'every observation remains present');
  for(let i=0;i<xs.length;i++)for(let j=i+1;j<xs.length;j++){
    assert.ok(Math.hypot(xs[i]-xs[j],ys[i]-ys[j])>=gap-1e-7,`observations ${i}/${j} occlude each other`);
  }
}
test('eight identical observations remain individually visible and deterministic',()=>{
  const ys=Object.freeze(Array(8).fill(150)),xs=layout(ys,12);
  separated(xs,ys,12);
  assert.deepEqual(layout(ys,12),xs);
  assert.deepEqual(ys,Array(8).fill(150));
  assert.equal(Math.min(...xs),-Math.max(...xs),'a tied cluster is centered');
});
test('packing keeps Y and source order while avoiding near-neighbor collisions',()=>{
  const ys=Object.freeze([100,0,5,0,1000,9,9,13]),xs=layout(ys,11);
  separated(xs,ys,11);
  assert.equal(xs[0],0,'isolated observation keeps the category center');
  assert.equal(xs[4],0,'distant observation keeps the category center');
  assert.deepEqual(ys,[100,0,5,0,1000,9,9,13]);
});
test('empty, singleton and vertically separated observations need no jitter',()=>{
  assert.deepEqual(layout([],12),[]);
  assert.deepEqual(layout([50],12),[0]);
  assert.deepEqual(layout([0,12,24,100],12),[0,0,0,0]);
});
test('sampling IDs use natural numerical order in both plots and their stats table',()=>{
  const rows=['P10','P2','P1','P17'].map(point_id=>({form:'bm02',metric:'result',unit:'°C',point_id,value:-20}));
  const groups=context.window.CPC1PQCharts.prepare(rows);
  assert.deepEqual(Array.from(groups[0].points),['P1','P2','P10','P17']);
  assert.deepEqual(rows.map(r=>r.point_id),['P10','P2','P1','P17'],'source observations retain original order');
});

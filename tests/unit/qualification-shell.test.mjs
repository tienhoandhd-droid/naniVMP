import test from 'node:test';
import assert from 'node:assert/strict';
import {
  qualificationTarget,
  qualificationHref,
  isQualificationNavigationCurrent,
} from '../../src/features/qualification/shellRoute.ts';
import { qualificationNavigationForSystems } from '../../src/components/layout/QualificationNavigation.tsx';
import { QualificationAccessController, qualificationAccessFromContext, qualificationAuthEventRequiresRevoke } from '../../src/features/qualification/useQualificationAccess.ts';
const base='https://example.test/vmp/';
test('qualification targets canonicalize the retired library route to runs and accept only known entry context',()=>{
 for(const path of ['steam.html','gas.html?system=air','gas.html?system=nitrogen','runs.html','steam.html?view=records','gas.html?system=air&view=records','runs.html?view=trend&system=steam','runs.html?view=trend&system=air','runs.html?view=trend&system=nitrogen']) {
  assert.equal(qualificationTarget(path,base),path);
  assert.equal(new URL(qualificationHref(path,base)).pathname,'/vmp/');
 }
 assert.equal(qualificationTarget('index.html',base),'runs.html');
 assert.equal(qualificationTarget(base+'tham-dinh-thuc-te/steam.html?form=BM03',base),'steam.html?form=BM03');
 assert.equal(qualificationTarget('./',base),'runs.html');
});
test('reject external, traversal, unknown files, duplicate or unsupported parameters',()=>{
 for(const path of ['https://evil.test/steam.html','//evil.test/steam.html','../index.html','%2e%2e/index.html','cloud.js','steam.html?redirect=evil','gas.html?system=steam','gas.html?system=air&system=nitrogen','steam.html?run=bad','index.html?view=records','gas.html?view=edit','runs.html?view=trend&system=oxygen','runs.html?view=trend&system=steam&form=bm01','steam.html?view=trend&system=steam','javascript:alert(1)']) assert.equal(qualificationTarget(path,base),null,path);
});

test('navigation filters systems fail-closed, keeps archive-only access, and has no library destination',()=>{
 const groups=qualificationNavigationForSystems(['steam','nitrogen']);
 assert.deepEqual(groups.map((group)=>group.label),['Đợt thẩm định','Hơi tinh khiết','Khí nitơ']);
 assert.equal(groups.some((group)=>group.target==='index.html'),false);
 assert.ok(groups.find((group)=>group.system==='steam')?.links.some((link)=>link.label==='BM03 — Độ khô'));
 assert.ok(groups.find((group)=>group.system==='nitrogen')?.links.some((link)=>link.label==='Sơ đồ xu hướng khí nitơ'));
 assert.deepEqual(qualificationAccessFromContext({
   can_view:true,
   systems:{air:{can_view_current:false,can_view_archive:true},steam:{can_view_current:false,can_view_archive:false}},
 }),['air']);
 assert.deepEqual(qualificationAccessFromContext({can_view:false,systems:{air:{can_view_current:true}}}),[]);
 assert.deepEqual(qualificationAccessFromContext({can_view:true,systems:{air:{can_view_current:'true'}}}),[]);
});

test('nested navigation matches parsed identity while allowing bound run arguments',()=>{
 assert.equal(isQualificationNavigationCurrent('gas.html?system=air&form=bm01','gas.html?run=11111111-1111-1111-1111-111111111111&system=air&form=bm01'),true);
 assert.equal(isQualificationNavigationCurrent('gas.html?system=air&form=bm01','gas.html?system=air&form=bm02'),false);
 assert.equal(isQualificationNavigationCurrent('runs.html?view=trend&system=steam','runs.html?view=trend&system=steam&record=11111111-1111-1111-1111-111111111111'),true);
  assert.equal(isQualificationNavigationCurrent('runs.html','runs.html?view=trend&system=air'),false);
});

test('newer access denial and unmount invalidation reject stale context responses',()=>{
 const controller=new QualificationAccessController();
 const first=controller.begin();
 const second=controller.begin();
 assert.equal(controller.commitError(second,'Quyền đã đổi.'),true);
 assert.equal(controller.commitReady(first,['steam']),false);
 assert.deepEqual(controller.state,{status:'error',systems:[],error:'Quyền đã đổi.'});
 const final=controller.begin();
 controller.invalidate();
 assert.equal(controller.commitReady(final,['air']),false);
  assert.deepEqual(controller.state,{status:'loading',systems:[],error:null});
});

test('same-actor token refresh retains allowed systems while sign-out and identity changes revoke them',()=>{
 const controller=new QualificationAccessController();
 const ready=controller.begin();
 controller.commitReady(ready,['steam']);
 const oldResponse=controller.begin();
 controller.supersede();
 assert.deepEqual(controller.state,{status:'loading',systems:['steam'],error:null});
 assert.equal(controller.commitError(oldResponse,'cũ'),false);
 assert.equal(qualificationAuthEventRequiresRevoke({actor:'A',token:'old'},{actor:'A',token:'new'},true),false);
 assert.equal(qualificationAuthEventRequiresRevoke({actor:'A',token:'old'},null,true),true);
 assert.equal(qualificationAuthEventRequiresRevoke({actor:'A',token:'old'},{actor:'B',token:'new'},true),true);
});
test('every shell route entry point can filter the target against current permitted systems',async()=>{
 const {permittedQualificationTarget}=await import('../../src/features/qualification/shellRoute.ts');
 for(const target of ['steam.html?form=bm01','gas.html?system=nitrogen','runs.html?view=trend&system=steam'])assert.equal(permittedQualificationTarget(target,base,['air']),null);
 assert.equal(permittedQualificationTarget('gas.html?system=air&form=bm01',base,['air']),'gas.html?system=air&form=bm01');
 assert.equal(permittedQualificationTarget('runs.html',base,[]),null);
 assert.equal(permittedQualificationTarget('runs.html',base,['air']),'runs.html');
});
test('a form run binding must include both run and record identifiers',()=>{
 const id='11111111-1111-4111-8111-111111111111';
 for(const target of [`steam.html?run=${id}`,`gas.html?system=air&record=${id}`])assert.equal(qualificationTarget(target,base),null);
 const target=`gas.html?system=air&run=${id}&record=${id}`;assert.equal(qualificationTarget(target,base),target);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBackend } from '../../src/features/qualification/backend.js';

const settings={url:'https://vmp-test.supabase.co',publishableKey:'sb_publishable_test'};
const context=(overrides={})=>({can_view:true,can_enter:true,record_scope:'pq',systems:{
  steam:{can_view:false,can_enter:false,pq_codes:[]},
  air:{can_view:true,can_enter:true,pq_codes:['PQ-AIR']},
  nitrogen:{can_view:true,can_enter:false,pq_codes:['PQ-N2']}
},...overrides});
const denied=system=>Object.assign(new Error(`Không có quyền với ${system}.`),{code:'42501'});

test('PQ context is fail-closed and exposes permission only for its system',async()=>{
  const client={auth:{getSession:async()=>({data:{session:{user:{id:'qa'}}}})},rpc:async()=>({data:context()})};
  const api=makeBackend(settings,client);
  await api.getSession();
  assert.deepEqual(api.permissionsFor('air'),{...context().systems.air,can_view_current:true,can_view_archive:false,can_edit_archive:true});
  assert.deepEqual(api.permissionsFor('steam'),{can_view:false,can_enter:false,can_view_current:false,can_view_archive:false,can_edit_archive:false,pq_codes:[]});
  assert.throws(()=>api.permissionsFor('invalid'),/Hệ thống/);

  const missing={auth:{getSession:async()=>({data:{session:{user:{id:'qa'}}}})},rpc:async()=>({data:{can_view:true}})};
  await assert.rejects(makeBackend(settings,missing).getSession(),/quyền PQ/i);
});

test('a current PQ context blocks unauthorized config and entry before the RPC',async()=>{
  const calls=[];
  const client={auth:{getSession:async()=>({data:{session:{user:{id:'qa'}}}})},rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='cpc1_context'?context():{ok:true}};}};
  const api=makeBackend(settings,client);
  await api.getSession();
  await assert.rejects(api.getConfig(),error=>error.code==='42501');
  await assert.rejects(api.evaluate({system:'nitrogen'}),error=>error.code==='42501');
  await assert.rejects(api.save({system:'nitrogen'}),error=>error.code==='42501');
  assert.deepEqual(calls.map(([name])=>name),['cpc1_context','cpc1_context','cpc1_context']);
});

test('uninitialized, revoked and draft access checks always refresh PQ context before data RPCs',async()=>{
  const calls=[],record='00000000-0000-4000-8000-000000000002';
  const contexts=[context(),context({systems:{...context().systems,air:{can_view:true,can_enter:false,pq_codes:['PQ-AIR']}}})];
  const client={auth:{getSession:async()=>({data:{session:{user:{id:'qa'}}}})},rpc:async(name,args)=>{
    calls.push([name,args]);if(name==='cpc1_context')return {data:contexts.shift()};return {data:{id:record,data:{system:'air'}}};
  }};
  const api=makeBackend(settings,client);
  await assert.rejects(api.getConfig(),error=>error.code==='42501');
  assert.deepEqual(calls.map(([name])=>name),['cpc1_context']);
  await assert.rejects(api.checkDraftAccess(record,'air'),error=>error.code==='42501');
  assert.deepEqual(calls.map(([name])=>name),['cpc1_context','cpc1_context']);
  assert.equal(api.permissions,null);
});

test('missing session and sign-out clear cached context before another protected request',async()=>{
  let signedIn=true,contextCalls=0;
  const client={auth:{getSession:async()=>({data:{session:signedIn?{user:{id:'qa'}}:null}}),signOut:async()=>({})},rpc:async(name)=>{
    if(name==='cpc1_context'){contextCalls++;return {data:context()};}
    throw Error('protected RPC must not run without a session');
  }};
  const api=makeBackend(settings,client);await api.getSession();assert.equal(contextCalls,1);
  signedIn=false;assert.equal(await api.getSession(),null);assert.equal(api.permissions,null);
  await assert.rejects(api.listRuns(),error=>error.code==='42501');
  signedIn=true;await api.getSession();await api.signOut();assert.equal(api.permissions,null);
});

test('archive-only PQ context keeps a bound historical run visible without enabling new-form config',async()=>{
  const run='00000000-0000-4000-8000-000000000001',record='00000000-0000-4000-8000-000000000002',calls=[];
  const archived=context({systems:{...context().systems,air:{can_view:true,can_enter:false,can_view_current:false,can_view_archive:true,can_edit_archive:true,pq_codes:[]}}});
  const client={auth:{getSession:async()=>({data:{session:{user:{id:'qa'}}}})},rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='cpc1_context'?archived:{system:'air',forms:[]}};}};
  const api=makeBackend(settings,client);api.bindSystem('air');api.bindRun(run,record);
  await api.getGasConfig('air');
  assert.equal(api.permissionsFor('air').can_view_current,false);
  assert.equal(api.permissionsFor('air').can_view_archive,true);
  assert.deepEqual(calls.at(-1),['cpc1_run_config',{p_run_id:run,p_system:'air'}]);
  await api.evaluate({system:'air'});assert.equal(calls.at(-1)[0],'cpc1_run_evaluate');
});

test('a view-only PQ user may request a saved PDF snapshot but cannot save',async()=>{
  const viewOnly=context({systems:{...context().systems,air:{can_view:true,can_enter:false,pq_codes:['PQ-AIR']}}});
  const client={auth:{getSession:async()=>({data:{session:{user:{id:'qa'}}}})},rpc:async()=>({data:viewOnly})};
  const api=makeBackend(settings,client);await api.getSession();api.bindSystem('air');
  await assert.rejects(api.save({system:'air'}),error=>error.code==='42501');
  await assert.rejects(api.report('bm01',{system:'air'}),/Lưu Supabase trước khi in/);
});

test('library and runs UI use the scoped context without requesting denied configurations',()=>{
  const home=readFileSync(new URL('../../public/tham-dinh-thuc-te/home.js',import.meta.url),'utf8');
  const runs=readFileSync(new URL('../../public/tham-dinh-thuc-te/runs.js',import.meta.url),'utf8');
  const bootstrap=readFileSync(new URL('../../src/features/qualification/bootstrap.js',import.meta.url),'utf8');
  const print=readFileSync(new URL('../../public/tham-dinh-thuc-te/entry-tools.js',import.meta.url),'utf8');
  const recovery=readFileSync(new URL('../../public/tham-dinh-thuc-te/draft-recovery.js',import.meta.url),'utf8');
  assert.match(home,/permissionsFor\(system\)/);
  assert.match(runs,/availableSystems\(backend\)/);
  assert.doesNotMatch(runs,/Promise\.all\(\[backend\.getConfig\(\),backend\.getGasConfig\('air'\),backend\.getGasConfig\('nitrogen'\)/);
  assert.match(runs,/run\.can_close === true/);
  assert.match(bootstrap,/bindSystem\(activeSystem\)/);
  assert.match(bootstrap,/addEventListener\('focus'/);
  assert.match(bootstrap,/addEventListener\('online'/);
  assert.match(print,/const canView=/);
  assert.match(print,/print-review-generate'\)\.disabled=offline\|\|s\.dirty\|\|!s\.recordId\|\|!canView\(\)/);
  assert.match(recovery,/checkDraftAccess\(snapshot\.recordId,system\)/);
});

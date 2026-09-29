import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBackend} from '../../src/features/qualification/backend.js';

const settings={url:'https://pq-fixture.supabase.co',publishableKey:'sb_publishable_fixture'};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const context=(nitrogen=false)=>({can_view:true,can_enter:true,record_scope:'pq',systems:Object.fromEntries(['air','nitrogen','steam'].map(system=>{
 const allowed=system==='air'||system==='nitrogen'&&nitrogen;
 return [system,{can_view:allowed,can_enter:allowed,can_view_current:allowed,can_view_archive:allowed,can_edit_archive:allowed,pq_codes:allowed?[`FIXTURE-${system}`]:[]}];
}))});
function harness(){
 let actor='qa-A';const requests=[];
 const client={auth:{getSession:async()=>({data:{session:actor?{user:{id:actor}}:null}})},rpc:async(name)=>{
  assert.equal(name,'cpc1_context');const request=deferred();requests.push(request);return request.promise;
 }};
 return {api:makeBackend(settings,client),requests,setActor:value=>{actor=value;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('an older broad context cannot overwrite a newer narrowed context',async()=>{
 const h=harness();const older=h.api.refreshContext();const olderResult=older.catch(e=>e);
 await tick();assert.equal(h.requests.length,1);
 const newer=h.api.refreshContext();await tick();assert.equal(h.requests.length,2);
 h.requests[1].resolve({data:context(false)});await newer;
 assert.equal(h.api.permissionsFor('nitrogen').can_view,false);
 h.requests[0].resolve({data:context(true)});const session=await olderResult;
 assert.equal(h.api.permissionsFor('nitrogen').can_view,false);
 assert.equal(session.user.id,'qa-A');
});

test('context fetched for an old identity is never installed for another actor',async()=>{
 const h=harness();const old=h.api.getSession();const result=old.catch(e=>e);await tick();
 h.setActor('qa-B');h.requests[0].resolve({data:context(true)});
 const error=await result;assert.equal(error.code,'42501');assert.equal(h.api.permissions,null);
 const next=h.api.getSession();await tick();h.requests[1].resolve({data:context(false)});await next;
 assert.equal(h.api.permissionsFor('nitrogen').can_view,false);
});

test('parallel initialization shares one context request for the same actor',async()=>{
 const h=harness();const a=h.api.getSession(),b=h.api.getSession();await tick();
 assert.equal(h.requests.length,1);h.requests[0].resolve({data:context(false)});
 const sessions=await Promise.all([a,b]);assert.ok(sessions.every(s=>s.user.id==='qa-A'));
});

test('a superseded loader waits for the replacement context still in flight',async()=>{
 const h=harness();let oldSettled=false;
 const older=h.api.getSession().then(session=>{oldSettled=true;return session;});await tick();
 const newer=h.api.refreshContext();await tick();
 h.requests[0].resolve({data:context(true)});await tick();
 assert.equal(oldSettled,false,'Old broad response must not release a form before new scope is known');
 h.requests[1].resolve({data:context(false)});await Promise.all([older,newer]);
 assert.equal(h.api.permissionsFor('nitrogen').can_view,false);
});

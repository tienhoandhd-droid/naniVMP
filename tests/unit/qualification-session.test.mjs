import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackend } from '../../src/features/qualification/backend.js';
const settings={url:'https://vmp-test.supabase.co',publishableKey:'sb_publishable_test'};
test('existing VMP session is verified by qualification RPC without a second login',async()=>{
 const calls=[]; const session={user:{id:'actor'}};
 const client={auth:{getSession:async()=>({data:{session}})},rpc:async(name,args)=>{calls.push([name,args]);return {data:{can_enter:true}}}};
 const api=makeBackend(settings,client);
 assert.equal(await api.getSession(),session);assert.equal(calls[0][0],'cpc1_context');
});
test('expired, disabled or ungranted VMP actor cannot open qualification',async()=>{
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'actor'}}}})},rpc:async()=>({error:{message:'Không có quyền',code:'42501'}})};
 await assert.rejects(makeBackend(settings,client).getSession(),/Không có quyền/);
});
test('missing VMP session does not fetch private configuration',async()=>{
 const client={auth:{getSession:async()=>({data:{session:null}})},rpc:()=>{throw Error('must not call')}};
 assert.equal(await makeBackend(settings,client).getSession(),null);
});
test('same request retries keep idempotency key; changed payload gets another key',async()=>{
 const calls=[];let first=true;
 const client={rpc:async(name,args)=>{calls.push(structuredClone(args));if(first){first=false;return {error:{message:'network'}}}return {data:{id:'r',version:1,data:args.p_data}}}};
 const api=makeBackend(settings,client);
 await assert.rejects(api.save({meta:{remarks:'draft'}}));await api.save({meta:{remarks:'draft'}});await api.save({meta:{remarks:'edited'}});
 assert.equal(calls[0].p_request_id,calls[1].p_request_id);assert.notEqual(calls[1].p_request_id,calls[2].p_request_id);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackend } from '../../src/features/qualification/backend.js';
const settings={url:'https://vmp-test.supabase.co',publishableKey:'sb_publishable_test'};
const context={can_view:true,can_enter:true,record_scope:'pq',systems:{steam:{can_view:true,can_enter:true,pq_codes:['PQ-STEAM']},air:{can_view:true,can_enter:true,pq_codes:['PQ-AIR']},nitrogen:{can_view:true,can_enter:true,pq_codes:['PQ-N2']}}};
const authenticated=client=>({
 ...client,
 auth:{getSession:async()=>({data:{session:{user:{id:'actor'}}}}),...(client.auth||{})},
 rpc:async(name,args)=>name==='cpc1_context'?{data:context}:client.rpc(name,args)
});
test('existing VMP session is verified by qualification RPC without a second login',async()=>{
 const calls=[]; const session={user:{id:'actor'}};
 const client={auth:{getSession:async()=>({data:{session}})},rpc:async(name,args)=>{calls.push([name,args]);return {data:context}}};
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
 const client=authenticated({rpc:async(name,args)=>{calls.push(structuredClone(args));if(first){first=false;return {error:{message:'network'}}}return {data:{id:'r',version:1,data:args.p_data}}}});
 const api=makeBackend(settings,client);api.bindSystem('steam');
 await assert.rejects(api.save({meta:{remarks:'draft'}}));await api.save({meta:{remarks:'draft'}});await api.save({meta:{remarks:'edited'}});
 assert.equal(calls[0].p_request_id,calls[1].p_request_id);assert.notEqual(calls[1].p_request_id,calls[2].p_request_id);
});
for (const mismatch of ['version','id','data']) test(`PDF rejects a mismatched ${mismatch} before downloading private assets`,async()=>{
 let downloads=0;const calls=[];
 const snapshot={id:'record-a',version:3,data:{meta:{remarks:'approved input'}},evaluation:{}};
 const client=authenticated({rpc:async(name,args)=>{calls.push([name,args]);if(name==='cpc1_save')return {data:structuredClone(snapshot)};const wrong=structuredClone(snapshot);if(mismatch==='version')wrong.version=2;if(mismatch==='id')wrong.id='record-b';if(mismatch==='data')wrong.data.meta.remarks='different';return {data:wrong};},storage:{from:()=>({download:async()=>{downloads++;throw Error('must not download')}})}});
 const api=makeBackend(settings,client);api.bindSystem('steam');await api.save(snapshot.data);
 await assert.rejects(api.report('bm01',snapshot.data),/Phiên bản hồ sơ trả về không khớp/);
 assert.deepEqual(calls.at(-1),['cpc1_load',{p_record_id:'record-a',p_version:3}]);assert.equal(downloads,0);
});

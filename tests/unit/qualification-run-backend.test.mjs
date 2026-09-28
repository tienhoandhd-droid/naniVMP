import test from 'node:test';import assert from 'node:assert/strict';
import {makeBackend} from '../../src/features/qualification/backend.js';
const settings={url:'https://test.supabase.co',publishableKey:'sb_publishable_test'};
const run='00000000-0000-4000-8000-000000000001',record='00000000-0000-4000-8000-000000000002';
test('run binding scopes config, evaluate, load and retries without creating another record',async()=>{
 const calls=[];let fail=true;const saved={id:record,version:2,data:{system:'air'}};
 const client={rpc:async(name,args)=>{calls.push([name,structuredClone(args)]);if(name==='cpc1_run_save'&&fail){fail=false;return {error:{message:'offline'}}}return {data:saved}}};
 const api=makeBackend(settings,client);api.bindRun(run,record);
 await api.getGasConfig('air');await api.evaluate(saved.data);await api.load(record);
 await assert.rejects(api.save(saved.data));await api.save(saved.data);
 assert.equal(calls[0][0],'cpc1_run_config');assert.equal(calls[1][0],'cpc1_run_evaluate');assert.equal(calls[2][0],'cpc1_run_load');
 assert.equal(calls[3][1].p_record_id,record);assert.equal(calls[3][1].p_expected_version,2);assert.equal(calls[3][1].p_request_id,calls[4][1].p_request_id);
 await assert.rejects(api.load('other'),/đợt/);
});
test('invalid run links cannot silently use an unscoped backend',()=>{const api=makeBackend(settings,{});assert.throws(()=>api.bindRun('bad',record));assert.throws(()=>api.bindRun(run,null));});
test('PDF source must have a content address and verify downloaded bytes',async()=>{
 const bytes=new TextEncoder().encode('%PDF-test');const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
 const api=makeBackend(settings,{storage:{from:b=>({download:async p=>{assert.equal(b,'cpc1-history');return {data:new Blob([bytes])}}})}});
 assert.equal((await api.downloadHistorySource(hash+'.pdf')).size,bytes.length);await assert.rejects(api.downloadHistorySource('..%2fsecret'));
 await assert.rejects(api.downloadHistorySource('a'.repeat(64)+'.pdf'),/khớp/);
});
test('history snapshot reads exact revision, validates response and does not bind entry current',async()=>{
 const calls=[];let mismatch=false;
 const api=makeBackend(settings,{rpc:async(name,args)=>{calls.push([name,args]);return {data:{id:record,version:mismatch?3:2,data:{system:'air'},evaluation:{source_context:{}}}};}});
 await api.historySnapshot(record,2);assert.deepEqual(calls[0],['cpc1_load',{p_record_id:record,p_version:2}]);
 assert.doesNotThrow(()=>api.bindRun(run,record),'read-only history does not replace entry current');
 mismatch=true;await assert.rejects(api.historySnapshot(record,2),/phiên bản/i);
 await assert.rejects(api.historySnapshot('bad',2));await assert.rejects(api.historySnapshot(record,0));
});

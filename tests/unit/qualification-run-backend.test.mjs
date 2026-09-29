import test from 'node:test';import assert from 'node:assert/strict';
import {makeBackend} from '../../src/features/qualification/backend.js';
const settings={url:'https://test.supabase.co',publishableKey:'sb_publishable_test'};
const run='00000000-0000-4000-8000-000000000001',record='00000000-0000-4000-8000-000000000002';
const context={can_view:true,can_enter:true,record_scope:'pq',systems:{steam:{can_view:true,can_enter:true,pq_codes:['PQ-STEAM']},air:{can_view:true,can_enter:true,pq_codes:['PQ-AIR']},nitrogen:{can_view:true,can_enter:true,pq_codes:['PQ-N2']}}};
const authenticated=client=>({...client,auth:{getSession:async()=>({data:{session:{user:{id:'actor'}}}}),...(client.auth||{})},rpc:async(name,args)=>name==='cpc1_context'?{data:context}:client.rpc(name,args)});
test('run binding scopes config, evaluate, load and retries without creating another record',async()=>{
 const calls=[];let fail=true;const saved={id:record,version:2,data:{system:'air'}};
 const client=authenticated({rpc:async(name,args)=>{calls.push([name,structuredClone(args)]);if(name==='cpc1_run_save'&&fail){fail=false;return {error:{message:'offline'}}}return {data:saved}}});
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
 const api=makeBackend(settings,authenticated({rpc:async()=>({data:{}}),storage:{from:b=>({download:async p=>{assert.equal(b,'cpc1-history');return {data:new Blob([bytes])}}})}}));
 assert.equal((await api.downloadHistorySource(hash+'.pdf')).size,bytes.length);await assert.rejects(api.downloadHistorySource('..%2fsecret'));
 await assert.rejects(api.downloadHistorySource('a'.repeat(64)+'.pdf'),/khớp/);
});
test('history snapshot reads exact revision, validates response and does not bind entry current',async()=>{
 const calls=[];let mismatch=false;
 const api=makeBackend(settings,authenticated({rpc:async(name,args)=>{calls.push([name,args]);return {data:{id:record,version:mismatch?3:2,data:{system:'air'},evaluation:{source_context:{}}}};}}));
 await api.historySnapshot(record,2);assert.deepEqual(calls[0],['cpc1_load',{p_record_id:record,p_version:2}]);
 assert.doesNotThrow(()=>api.bindRun(run,record),'read-only history does not replace entry current');
 mismatch=true;await assert.rejects(api.historySnapshot(record,2),/phiên bản/i);
 await assert.rejects(api.historySnapshot('bad',2));await assert.rejects(api.historySnapshot(record,0));
});
test('unbound forms can read configuration but cannot evaluate or save',async()=>{
 const calls=[];const api=makeBackend(settings,authenticated({rpc:async(name,args)=>{calls.push([name,args]);return {data:{}};}}));api.bindSystem('air');
 await api.getGasConfig('air');assert.equal(api.canSaveActive(),false);assert.equal(api.canEvaluateActive(),false);
 await assert.rejects(api.save({system:'air'}),/Chọn đợt/);await assert.rejects(api.evaluate({system:'air'}),/Chọn đợt/);
 assert.deepEqual(calls.map(x=>x[0]),['cpc1_gas_config']);
});
test('correction reason participates in retry identity and point history binds the selected record',async()=>{
 const calls=[];const api=makeBackend(settings,authenticated({rpc:async(name,args)=>{calls.push([name,structuredClone(args)]);if(name==='cpc1_run_save')return {error:{message:'offline'}};return {data:[]};}}));api.bindSystem('air');api.bindRun(run,record);
 const options={expectedVersion:4,reason:'Đính chính số đọc'};
 await assert.rejects(api.save({system:'air'},options));await assert.rejects(api.save({system:'air'},options));await assert.rejects(api.save({system:'air'},{...options,reason:'Đổi lý do'}));
 assert.equal(calls[0][1].p_reason,options.reason);assert.equal(calls[0][1].p_request_id,calls[1][1].p_request_id);assert.notEqual(calls[1][1].p_request_id,calls[2][1].p_request_id);
 await api.pointHistory('bm02','A1');assert.deepEqual(calls.at(-1),['cpc1_point_history',{p_record_id:record,p_form:'bm02',p_point:'A1'}]);
});
test('device requirements and metadata updates use explicit server contracts',async()=>{
 const calls=[];const api=makeBackend(settings,authenticated({rpc:async(name,args)=>{calls.push([name,args]);return {data:[]};}}));
 const scope=[{system:'air',forms:{bm02:['A1']}}],cal={'air:bm02:expiry':{name:'Thiết bị',due_on:'2026-12-31'}};
 await api.runRequirements(scope);await api.updateRunCalibration(run,2,cal,'Thay thiết bị',record);
 assert.deepEqual(calls,[['cpc1_run_requirements',{p_scope:scope}],['cpc1_run_calibration_update',{p_run_id:run,p_expected_version:2,p_calibration:cal,p_reason:'Thay thiết bị',p_request_id:record}]]);
});
test('archive-only unbound selector reads a permitted frozen config without binding or current config access',async()=>{
 const calls=[],archived=structuredClone(context);Object.assign(archived.systems.air,{can_view_current:false,can_view_archive:true,can_enter:false,can_edit_archive:false});
 const api=makeBackend(settings,{auth:{getSession:async()=>({data:{session:{user:{id:'actor'}}}})},rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='cpc1_context'?archived:name==='cpc1_run_list'?[{id:run,items:[{system:'air',record_id:record}]}]:{system:'air',forms:[],_run:{id:run},_scope:{bm02:['A1']}}};}});api.bindSystem('air');
 assert.deepEqual(await api.getGasConfig('air'),{system:'air',forms:[]});assert.equal(api.runBinding,null);assert.equal(api.canSaveActive(),false);assert.equal(calls.some(([name])=>name==='cpc1_gas_config'),false);
 assert.deepEqual(calls.at(-1),['cpc1_run_config',{p_run_id:run,p_system:'air'}]);
});

// Headless PQ acceptance with the actual backend/bootstrap bundle and an injected local client.
// It never reaches a Supabase project: every request outside qualification.test is aborted.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const root=new URL('../..',import.meta.url).pathname;
const fixtures=process.env.CPC1_UI_FIXTURES;
if(!fixtures)throw Error('Set CPC1_UI_FIXTURES to a private fixture directory.');
const fixtureFile=fixtures+'/config.json';
const config=JSON.parse(await readFile(fixtureFile,'utf8'));
const access=(air={can_view:true,can_enter:true,pq_codes:['PQ-AIR']})=>({can_view:true,can_enter:air.can_enter,record_scope:'pq',systems:{
  steam:{can_view:false,can_enter:false,pq_codes:[]},air,nitrogen:{can_view:false,can_enter:false,pq_codes:[]}
}});
const broadAccess=access();broadAccess.systems.nitrogen={can_view:true,can_enter:true,pq_codes:['PQ-NITROGEN']};
const steamAccess=access({can_view:false,can_enter:false,pq_codes:[]});steamAccess.can_enter=true;steamAccess.systems.steam={can_view:true,can_enter:true,pq_codes:['HT-14/2026.01-PQ','HT-15/2026.01-PQ']};
const fakeSupabase=`export const createClient=()=>window.__cpc1Fixture.client;`;
const bundle=(await build({entryPoints:[root+'/src/features/qualification/bootstrap.js'],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',plugins:[{name:'fixture-supabase',setup(p){p.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'fixture-supabase',namespace:'fixture'}));p.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fakeSupabase,loader:'js'}));}}]})).outputFiles[0].text;
const fixtureClient=`
if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=> '00000000-0000-4000-8000-000000000099'});
window.__cpc1Fixture={mode:location.search.includes('steam-access=1')?'steam':location.search.includes('scope-race=1')?'broad':'enter',saved:null,calls:[],config:${JSON.stringify(config)}};
const ctx=()=>window.__cpc1Fixture.mode==='steam'?${JSON.stringify(steamAccess)}:window.__cpc1Fixture.mode==='broad'?${JSON.stringify(broadAccess)}:window.__cpc1Fixture.mode==='revoked'?${JSON.stringify(access({can_view:false,can_enter:false,pq_codes:[]}))}:window.__cpc1Fixture.mode==='view'?${JSON.stringify(access({can_view:true,can_enter:false,pq_codes:['PQ-AIR']}))}:${JSON.stringify(access())};
window.__cpc1Fixture.client={auth:{getSession:async()=>({data:{session:{user:{id:'synthetic-qa'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},rpc:async(name,args={})=>{
 const f=window.__cpc1Fixture;f.calls.push(name);
 if(name==='cpc1_context'&&location.search.includes('context-race=1')&&!f.deferred){f.deferred=true;return new Promise(resolve=>{f.releaseContext=()=>resolve({data:ctx()});});}
 if(name==='cpc1_context')return {data:ctx()};
 if(name==='cpc1_run_list'){
  if(f.failLists)return {error:{message:'Simulated list network failure',code:'08006'}};
  const rows=[{id:'00000000-0000-4000-8000-000000000011',title:'AUTHORIZED_AIR',status:'closed',mode:'single',started_on:'2026-03-01',items:[],progress:{}}];
  if(f.mode==='broad')rows.push({id:'00000000-0000-4000-8000-000000000012',title:'PRIVATE_NITROGEN',status:'closed',mode:'single',started_on:'2026-03-01',items:[],progress:{}});
  if(f.deferRuns){f.deferRuns=false;return new Promise(resolve=>{f.releaseRuns=()=>resolve({data:rows});});}
  return {data:rows};
 }
 if(name==='cpc1_gas_config')return {data:f.config.gas_settings.find(x=>x.system===args.p_system).config};
 if(name==='cpc1_run_config'){const c=f.config.gas_settings.find(x=>x.system===args.p_system).config;return {data:{...c,_run:{id:args.p_run_id,title:'Đợt giả đã đóng',status:'closed',items:[{system:'air',record_id:'00000000-0000-4000-8000-000000000002'}]}}};}
 if(name==='cpc1_config')return {data:f.config.settings};
 if(name==='cpc1_evaluate')return {data:{forms:{},overall:'incomplete'}};
 if(name==='cpc1_save'){f.saved={id:'00000000-0000-4000-8000-000000000001',version:1,system:args.p_data.system,title:'Hồ sơ giả',data:structuredClone(args.p_data),evaluation:{}};return {data:f.saved};}
 if(name==='cpc1_list')return {data:f.saved?[f.saved]:[]};
 if(name==='cpc1_load')return {data:f.saved};
 if(name==='cpc1_run_load')return {data:{id:'00000000-0000-4000-8000-000000000002',version:1,data:{system:'air',meta:{},equipment:{},forms:{},controls:{},trend:{}},evaluation:{}}};
 return {data:[]};
}};`;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext();
const base='http://qualification.test';
const browserErrors=[];
async function page(){
 const p=await context.newPage();p.setDefaultTimeout(8000);p.on('pageerror',error=>browserErrors.push(error.message));
 await p.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!==base)return route.abort();
  if(u.pathname.endsWith('runtime-config.js'))return route.fulfill({contentType:'text/javascript',body:`window.CPC1_SETTINGS={url:'https://fixture.supabase.co',publishableKey:'sb_publishable_fixture'};${fixtureClient}`});
  if(u.pathname.endsWith('cloud.js'))return route.fulfill({contentType:'text/javascript',body:bundle});
  try {const file=root+'/public'+u.pathname;const ext=file.split('.').at(-1);return route.fulfill({body:await readFile(file),contentType:({html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',png:'image/png'})[ext]||'application/octet-stream'});}catch{return route.fulfill({status:404});}
 });return p;
}
try {
 const race=await page();await race.goto(base+'/tham-dinh-thuc-te/index.html?context-race=1');
 await race.waitForFunction(()=>typeof window.__cpc1Fixture?.releaseContext==='function');
 await race.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await race.waitForFunction(()=>window.CPC1Backend.permissions?.can_view===true);
 await race.evaluate(()=>window.__cpc1Fixture.releaseContext());
 await race.locator('body[data-qualification-gate="ready"]').waitFor();
 assert.equal(await race.locator('.qualification-gate').count(),0,'superseded startup must not deny the newer context');
 await race.waitForFunction(()=>document.querySelectorAll('.form-result').length===6);
 const runs=await page();await runs.goto(base+'/tham-dinh-thuc-te/runs.html?scope-race=1');
 await runs.locator('#run-list').getByText('PRIVATE_NITROGEN').waitFor();
 await runs.evaluate(()=>window.__cpc1Fixture.deferRuns=true);await runs.locator('#reload-runs').click();
 await runs.waitForFunction(()=>typeof window.__cpc1Fixture.releaseRuns==='function');
 await runs.evaluate(()=>{window.__cpc1Fixture.mode='enter';window.dispatchEvent(new Event('focus'));});
 await runs.locator('#run-list').getByText('AUTHORIZED_AIR').waitFor();
 await runs.evaluate(()=>window.__cpc1Fixture.releaseRuns());await runs.waitForTimeout(50);
 assert.equal(await runs.locator('#run-list').getByText('PRIVATE_NITROGEN').count(),0,'late broad runs must not restore revoked scope');
 await runs.evaluate(()=>{window.__cpc1Fixture.mode='broad';window.dispatchEvent(new Event('focus'));});
 await runs.locator('#run-list').getByText('PRIVATE_NITROGEN').waitFor();
 await runs.evaluate(()=>{window.__cpc1Fixture.mode='enter';window.__cpc1Fixture.failLists=true;window.dispatchEvent(new Event('focus'));});
 await runs.locator('#runs-status').getByText(/Simulated list network failure/).waitFor();
 assert.equal(await runs.locator('#run-list').getByText('PRIVATE_NITROGEN').count(),0,'revoked runs cleared even if replacement load fails');
 const steam=await page();await steam.goto(base+'/tham-dinh-thuc-te/steam.html?steam-access=1');
 await steam.locator('body[data-qualification-gate="ready"]').waitFor();
 await steam.locator('#qualification-pq-context').getByText(/Biểu mẫu hơi dùng chung.*hoặc/).waitFor();
 await steam.waitForFunction(()=>document.querySelectorAll('#form-body input:not([readonly])').length>0);
 const steamInput=steam.locator('#form-body input:not([readonly])').first();await steamInput.fill('12');
 await steam.locator('#evaluate').click();await steam.locator('#message').getByText(/Máy chủ đã trả kết quả/).waitFor();
 await steam.locator('#record-save').click();await steam.locator('#message').getByText(/Đã lưu hồ sơ Supabase/).waitFor();
 assert.equal(await steamInput.inputValue(),'12','shared steam input preserved by save');
 const library=await page();await library.goto(base+'/tham-dinh-thuc-te/index.html');
 await library.locator('body[data-qualification-gate="ready"]').waitFor();
 await library.waitForFunction(()=>document.querySelectorAll('.form-result').length===6);
 assert.equal(await library.locator('.form-result').count(),6,'air-only library exposes six air forms');
 assert.equal(await library.locator('[data-system-filter="steam"], [data-system-filter="nitrogen"]').evaluateAll(nodes=>nodes.filter(node=>!node.hidden).length),0,'library hides denied filters');

 const denied=await page();await denied.goto(base+'/tham-dinh-thuc-te/gas.html?system=nitrogen');
 await denied.locator('body[data-qualification-gate="denied"]').waitFor();

 const form=await page();await form.goto(base+'/tham-dinh-thuc-te/gas.html?system=air');
 await form.locator('body[data-qualification-gate="ready"]').waitFor();
 await form.waitForFunction(()=>document.querySelectorAll('#form-body input').length>0);
 assert.match(await form.locator('#qualification-pq-context').textContent(),/PQ-AIR/,'current writer sees the linked PQ code');
 for(const selector of ['#evaluate','#record-save','#print'])assert.equal(await form.locator(selector).isDisabled(),false,selector+' enabled for can_enter');
 const input=form.locator('#form-body input:not([readonly])').first();await input.fill('12');
 await form.locator('#evaluate').click();await form.locator('#message').getByText(/Máy chủ đã trả kết quả/).waitFor();
 await form.locator('#record-save').click();await form.waitForTimeout(100);assert.match(await form.locator('#message').textContent(),/Đã lưu hồ sơ Supabase/);
 await form.locator('.file-actions summary').click();await form.locator('#record-load').click();await form.locator('.saved-record').first().click();await form.locator('#message').getByText(/Đã mở hồ sơ từ Supabase/).waitFor();
 await form.evaluate(()=>{const rpc=window.__cpc1Fixture.client.rpc;window.__cpc1Fixture.client.rpc=async(name,args)=>name==='cpc1_evaluate'?new Promise(resolve=>{window.__cpc1Fixture.releaseEvaluate=()=>resolve({data:{forms:{},overall:'incomplete'}});}):rpc(name,args);});
 await form.locator('#evaluate').click();await form.waitForFunction(()=>typeof window.__cpc1Fixture.releaseEvaluate==='function');
 await context.setOffline(true);await form.evaluate(()=>window.__cpc1Fixture.releaseEvaluate());
 await form.locator('#message').getByText(/Máy chủ đã trả kết quả/).waitFor();
 for(const selector of ['#evaluate','#record-save','#print'])assert.equal(await form.locator(selector).isDisabled(),true,'pending response must preserve offline lock '+selector);
 await context.setOffline(false);await form.waitForFunction(()=>window.CPC1Backend.permissionsFor('air').can_enter);
 const before=await input.inputValue();await form.evaluate(()=>window.__cpc1Fixture.client.rpc=async(name,args={})=>name==='cpc1_context'?{data:ctx()}:name==='cpc1_evaluate'?{error:{message:'Mạng tạm thời'}}:{data:[]});
 await form.locator('#evaluate').click();await form.locator('#message').getByText(/Không thể tính/).waitFor();
 assert.equal(await input.inputValue(),before,'temporary network failure retains entered draft');
 await form.evaluate(()=>window.__cpc1Fixture.mode='view');await form.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await form.locator('#qualification-access-note').waitFor();
 for(const selector of ['#evaluate','#record-save'])assert.equal(await form.locator(selector).isDisabled(),true,selector+' disabled for view-only');
 assert.equal(await form.locator('#print').isDisabled(),false,'print stays enabled for a view-only record');
 await form.locator('#print').click();await form.locator('#print-review').waitFor({state:'visible'});

 await form.evaluate(()=>{window.__cpc1Fixture.mode='revoked';window.dispatchEvent(new Event('focus'));});
 await form.locator('body').getByText('Quyền PQ đã thay đổi').waitFor();assert.equal(await form.locator('#form-body').count(),0,'revocation clears form content');
 const pendingForm=await page();await pendingForm.goto(base+'/tham-dinh-thuc-te/gas.html?system=air');
 await pendingForm.waitForFunction(()=>document.querySelectorAll('#form-body input').length>0);
 await pendingForm.locator('#form-body input:not([readonly])').first().fill('13');
 await pendingForm.evaluate(()=>{const rpc=window.__cpc1Fixture.client.rpc;window.__cpc1Fixture.client.rpc=async(name,args)=>name==='cpc1_evaluate'?new Promise(resolve=>{window.__cpc1Fixture.releaseEvaluate=()=>resolve({data:{forms:{},overall:'incomplete'}});}):rpc(name,args);});
 await pendingForm.locator('#evaluate').click();await pendingForm.waitForFunction(()=>typeof window.__cpc1Fixture.releaseEvaluate==='function');
 await pendingForm.evaluate(()=>{window.__cpc1Fixture.mode='revoked';window.dispatchEvent(new Event('focus'));});
 await pendingForm.getByText('Quyền PQ đã thay đổi').waitFor();
 await pendingForm.evaluate(()=>window.__cpc1Fixture.releaseEvaluate());await pendingForm.waitForTimeout(50);
 assert.equal(await pendingForm.locator('#form-body').count(),0,'late evaluate cannot repopulate a revoked page');
 const closed=await page();await closed.goto(base+'/tham-dinh-thuc-te/gas.html?system=air&run=00000000-0000-4000-8000-000000000001&record=00000000-0000-4000-8000-000000000002');
 await closed.locator('body[data-qualification-gate="ready"]').waitFor();await closed.waitForFunction(()=>document.body.dataset.runClosed==='true');
 for(const selector of ['#evaluate','#record-save'])assert.equal(await closed.locator(selector).isDisabled(),true,selector+' stays disabled for a closed run');
 assert.equal(await closed.locator('#print').isDisabled(),false,'closed run keeps snapshot print available');
 await library.evaluate(()=>{window.__cpc1Fixture.mode='revoked';window.dispatchEvent(new Event('focus'));});
 await library.waitForFunction(()=>document.querySelectorAll('.form-result').length===0);
 assert.deepEqual(browserErrors,[]);console.log('PASS startup/context and runs refresh races; air-only scope; populated save/reopen/print-review; network and pending/offline/revoke locks; closed-run controls; zero pageerrors');
} finally {if(browserErrors.length)console.error(JSON.stringify(browserErrors));await context.close();await browser.close();}

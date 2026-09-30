// Headless acceptance for the static qualification run workspace.
// All browser requests are fulfilled locally; no Supabase or business write is used.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const root=new URL('../..',import.meta.url).pathname;
const fixtureFile=process.env.CPC1_UI_FIXTURES?process.env.CPC1_UI_FIXTURES+'/config.json':root+'/tests/fixtures/qualification-config.json';
const source=JSON.parse(await readFile(fixtureFile,'utf8'));
const air=source.gas_settings.find(row=>row.system==='air').config;
const nitrogen=source.gas_settings.find(row=>row.system==='nitrogen').config;
const steam=source.settings;
const run=(id,title,status,record,system='air',scope)=>({id,title,status,mode:'single',started_on:'2026-09-27',version:2,can_close:false,
 calibration:system==='air'?{'air:bm01:expiry':{name:'Máy đếm tiểu phân 01',due_on:'2026-09-26'}}:{},
 calibration_requirements:system==='air'?[{key:'air:bm01:expiry',system:'air',form:'bm01',name:'Máy đếm tiểu phân',kind:'calibration',label:'Hạn hiệu chuẩn',payload_path:['equipment','bm01','expiry']}]:[],
 items:[{system,record_id:record,scope:scope||{bm01:[(system==='steam'?steam.locations:system==='air'?air.forms[0].locations:nitrogen.forms[0].locations)[0].id]}}],progress:{complete:0,total:1,fail:0,invalid:0}});
const open=run('00000000-0000-4000-8000-000000000101','Đợt ba ngày','open','00000000-0000-4000-8000-000000000201');
open.can_close=true;
const closed=run('00000000-0000-4000-8000-000000000102','Đợt đã khóa','closed','00000000-0000-4000-8000-000000000202');
const partial=run('00000000-0000-4000-8000-000000000103','Đợt chỉ được nhập điểm','open','00000000-0000-4000-8000-000000000203');
const steamOpen=run('00000000-0000-4000-8000-000000000111','Đợt hơi nhiều ngày','open','00000000-0000-4000-8000-000000000211','steam');
const nitrogenOther=run('00000000-0000-4000-8000-000000000121','Đợt nitơ chỉ tiểu phân','open','00000000-0000-4000-8000-000000000221','nitrogen');
const nitrogenBm05=run('00000000-0000-4000-8000-000000000122','Đợt nitơ độ tinh khiết','open','00000000-0000-4000-8000-000000000222','nitrogen',{bm05:[nitrogen.forms.find(form=>form.id==='bm05').locations[0].id]});
const point=air.forms.find(form=>form.id==='bm01').locations[0].id;
const fixture=`
if(!crypto.randomUUID){let syntheticUuid=900;Object.defineProperty(crypto,'randomUUID',{value:()=> '00000000-0000-4000-8000-'+String(++syntheticUuid).padStart(12,'0')});}
window.__fixture={created:null,updated:null,requirementsCalls:0};
const runs=${JSON.stringify([open,closed,partial,steamOpen,nitrogenOther,nitrogenBm05])};
const configs={air:${JSON.stringify(air)},nitrogen:${JSON.stringify(nitrogen)},steam:${JSON.stringify(steam)}};
const point=${JSON.stringify(point)};
const selected=()=>new URLSearchParams(location.search).get('run');
const selectedRun=()=>runs.find(item=>item.id===selected());
window.__fixture.setCalibrationDue=due=>sessionStorage.setItem('fixture-calibration-due',due);
window.__fixture.deferLoad=()=>sessionStorage.setItem('fixture-defer-load','1');
const recordData=id=>{
 if(id==='${steamOpen.items[0].record_id}')return {meta:{},equipment:{},bm01:{'${steam.locations[0].id}':[{vg:'5',vc:'5',executor:'QA',date:'2026-09-27'},{vg:'6',vc:'',executor:'QA',date:'2026-09-28'},{vg:'',vc:'',executor:'QA',date:'2026-09-29'}]},bm02:{},bm03:{},bm04:{}};
 if(id==='${nitrogenBm05.items[0].record_id}')return {system:'nitrogen',meta:{},equipment:{},forms:{bm05:{'${nitrogen.forms.find(form=>form.id==='bm05').locations[0].id}':{purity:'99.95',executed_by:'QA',execution_date:'2026-09-27'}}},controls:{positive_count:'',executed_by:'',result_date:''},trend:{}};
 return {system:'air',meta:{},equipment:{bm01:{expiry:'2026-09-26'}},forms:{bm01:{[point]:{p05:'12',p5:'',executed_by:'QA',execution_date:'2026-09-27'}}},controls:{positive_count:'',executed_by:'',result_date:''},trend:{}};
};
window.CPC1Backend={
 capabilities:{persistence:true,auth:true},mode:'cloud',permissions:{can_view:true,can_enter:true},
 permissionsFor:()=>({can_view:true,can_view_current:true,can_enter:true}),
 canSaveActive:()=>selectedRun()?.status==='open',canEvaluateActive:()=>selectedRun()?.status==='open',
 getSession:async()=>({user:{id:'synthetic-qa'}}),signIn:async()=>{},signOut:async()=>{},openLogin(){},
 getGasConfig:async system=>{const current=selectedRun(),base=configs[system],due=sessionStorage.getItem('fixture-calibration-due');if(current?.id===runs[0].id&&due)current.calibration['air:bm01:expiry'].due_on=due;return current&&current.items[0].system===system?{...structuredClone(base),_scope:current.items[0].scope,_run:structuredClone(current)}:structuredClone(base)},
 getConfig:async()=>{const current=selectedRun(),base=configs.steam;return current&&current.items[0].system==='steam'?{...structuredClone(base),_scope:current.items[0].scope,_run:structuredClone(current)}:structuredClone(base)},
 listRuns:async()=>structuredClone(runs),listHistory:async()=>[{run_id:runs[1].id,record_id:runs[1].items[0].record_id,version:3,system:'air',period:'2026-09-01',trend:[{form:'bm01',point_id:point,trial:1,metric:'particles',label:'Tiểu phân ≥ 0,5 µm',unit:'hạt/m³',value:12,uncertain:false}]}],historySnapshot:async()=>({evaluation:{}}),
 runRequirements:async scope=>{window.__fixture.requirementsCalls++;return scope.some(item=>item.system==='air'&&item.forms.bm01)?structuredClone(runs[0].calibration_requirements):[]},
 createRun:async definition=>{window.__fixture.created=structuredClone(definition);return {...structuredClone(runs[0]),...definition,id:'00000000-0000-4000-8000-000000000103'}},
 updateRunCalibration:async(id,version,calibration,reason)=>{window.__fixture.updated={id,version,calibration:structuredClone(calibration),reason};return {...structuredClone(runs.find(item=>item.id===id)),version:version+1,calibration}},
 transitionRun:async()=>{},downloadHistorySource:async()=>new Blob(),
 load:async id=>{if(sessionStorage.getItem('fixture-defer-load')==='1'){sessionStorage.removeItem('fixture-defer-load');await new Promise(resolve=>{window.__fixture.releaseLoad=resolve;});}return {id,version:3,data:JSON.parse(sessionStorage.getItem('qualification-record:'+id)||JSON.stringify(recordData(id))),evaluation:{forms:{}}}},
 list:async()=>[],evaluate:async()=>({forms:{},overall:'incomplete'}),save:async(data,options)=>{window.__fixture.saveCalls??=[];window.__fixture.saveCalls.push(structuredClone(options));if(window.__fixture.failNextSave){window.__fixture.failNextSave=false;throw Error('Mạng tạm thời');}if(window.__fixture.deferNextSave){window.__fixture.deferNextSave=false;await new Promise(resolve=>{window.__fixture.releaseSave=resolve;});}sessionStorage.setItem('qualification-record:'+options.recordId,JSON.stringify(data));return {id:options.recordId,version:4,data:structuredClone(data),evaluation:{forms:{}}}},
 pointHistory:async()=>[{version:3,created_at:'2026-09-27T08:00:00Z',actor_name:'QA Fixture <script>',reason:null,measurement_dates:['2026-09-27'],changes:[{path:['forms','bm01',point,'p05'],before:'',after:'12'}]}],
 report:async()=>new Blob()
};
document.body.dataset.qualificationGate='ready';`;

const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||chromium.executablePath()});
const context=await browser.newContext({viewport:{width:390,height:844}});
const errors=[];
async function localPage(){
 const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!=='http://qualification.test')return route.abort();if(url.pathname.endsWith('/cloud.js'))return route.fulfill({contentType:'text/javascript',body:fixture});if(url.pathname.endsWith('/runtime-config.js'))return route.fulfill({contentType:'text/javascript',body:'window.CPC1_SETTINGS={};'});try{const file=root+'/public'+url.pathname,ext=file.split('.').at(-1);return route.fulfill({body:await readFile(file),contentType:({html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',png:'image/png'})[ext]||'application/octet-stream'});}catch{return route.fulfill({status:404});}});
 return page;
}

try{
 const form=await localPage();
 await form.goto('http://qualification.test/tham-dinh-thuc-te/gas.html?system=air&form=bm01');
 await form.locator('#run-selector').waitFor();
 assert.equal(await form.locator('#record-save').isDisabled(),true,'unbound save is locked');
 assert.equal(await form.locator('#form-body input:not([readonly]):not([disabled])').count(),0,'unbound fields are locked');
 await form.evaluate(()=>window.__fixture.deferLoad());
 await form.locator('#run-select').selectOption(open.id);
 await form.waitForURL(url=>url.searchParams.get('run')===open.id&&url.searchParams.get('record')===open.items[0].record_id&&url.searchParams.get('form')==='bm01');
 await form.waitForFunction(()=>typeof window.__fixture.releaseLoad==='function');
 assert.equal(await form.locator('#record-save').isDisabled(),true,'bound controls stay locked while the selected record is loading');
 assert.equal(await form.locator('#form-body input:not([readonly]):not([disabled])').count(),0,'blank pre-load fields cannot race the selected record');
 await form.evaluate(()=>window.__fixture.releaseLoad());
 await form.locator('#run-context').getByText('Máy đếm tiểu phân 01').waitFor();
 await form.locator('#entry-mode-warning').waitFor();
 await form.locator('.calibration-warning').getByText(/2026-09-26.*2026-09-27/).waitFor();
 await form.locator('#entry-continue').click();
 const p05=form.locator('[name="forms.bm01.'+point+'.p05"]'),p5=form.locator('[name="forms.bm01.'+point+'.p5"]');
 assert.equal(await p05.isEditable(),false,'existing value stays locked in continuation');
 assert.equal(await p5.isEditable(),true,'blank value can be added in continuation');
 await p5.fill('1');
 await form.evaluate(()=>{window.__fixture.deferNextSave=true;});
 await form.locator('#record-save').click();
 await form.waitForFunction(()=>typeof window.__fixture.releaseSave==='function');
 assert.equal(await form.locator('#correction-reason-dialog[open]').count(),0,'blank addition does not request a correction reason');
 await p5.fill('2');
 await form.evaluate(()=>window.__fixture.releaseSave());
 await form.locator('#message').getByText(/phiên trước.*thay đổi mới hơn/).waitFor();
 await form.locator('#record-save').click();
 await form.locator('#correction-reason-dialog[open]').waitFor();
 assert.match(await form.locator('#correction-preview').textContent(),/forms\.bm01\..*\.p5.*1.*2/s,'correction dialog shows old and new values');
 await form.locator('#correction-reason').press('Escape');
 await form.locator('#correction-reason-dialog').waitFor({state:'hidden'});
 await form.locator('#record-save').click();
 await form.locator('#correction-reason-dialog[open]').waitFor();
 await form.locator('#correction-reason').fill('Bổ sung trong lúc phiên trước đang lưu');
 await form.locator('#correction-reason-dialog button[type="submit"]').click();
 await form.locator('#message').getByText(/Đã lưu hồ sơ Supabase/).waitFor();
 await form.locator('#entry-view-history').click();
 await form.locator('#entry-history-dialog').getByText('QA Fixture <script>').waitFor();
 await form.locator('#entry-history-dialog').getByText('Không ghi nhận').waitFor();
 await form.locator('#entry-history-dialog').getByText('2026-09-27',{exact:true}).waitFor();
 await form.locator('#entry-history-dialog button[aria-label="Đóng"]').click();
 await form.locator('#entry-change').click();
 await p05.fill('');
 await form.evaluate(()=>{window.__fixture.failNextSave=true;});
 await form.locator('#record-save').click();
 await form.locator('#correction-reason-dialog[open]').waitFor();
 await form.locator('#correction-reason').fill('Đính chính số đọc theo phiếu gốc');
 await form.locator('#correction-reason-dialog button[type="submit"]').click();
 await form.locator('#message').getByText(/Mạng tạm thời/).waitFor();
 assert.equal(await p05.inputValue(),'','failed correction retains the cleared draft');
 const firstRequest=await form.evaluate(()=>window.__fixture.saveCalls.at(-1).requestId);
 await form.locator('#record-save').click();
 await form.locator('#message').getByText(/Đã lưu hồ sơ Supabase/).waitFor();
 const retry=await form.evaluate(()=>window.__fixture.saveCalls.slice(-2));
 assert.equal(retry[0].requestId,firstRequest);
 assert.equal(retry[1].requestId,firstRequest,'network retry reuses the idempotency key');
 assert.equal(retry[1].reason,'Đính chính số đọc theo phiếu gốc');
 await form.locator('#entry-change').click();
 await p5.fill('3');
 await form.evaluate(()=>{window.__fixture.failNextSave=true;});
 await form.locator('#record-save').click();
 await form.locator('#correction-reason-dialog[open]').waitFor();
 await form.locator('#correction-reason').fill('Đính chính lần đo thứ hai');
 await form.locator('#correction-reason-dialog button[type="submit"]').click();
 await form.locator('#message').getByText(/Mạng tạm thời/).waitFor();
 const failedDifferentRequest=await form.evaluate(()=>window.__fixture.saveCalls.at(-1).requestId);
 const executor=form.locator('[name="forms.bm01.'+point+'.executed_by"]');
 await executor.fill('QA cập nhật');
 await form.locator('#record-save').click();
 await form.locator('#correction-reason-dialog[open]').waitFor();
 assert.equal(await form.locator('#correction-reason').inputValue(),'','a changed correction diff cannot reuse the prior reason');
 await form.locator('#correction-reason').fill('Đính chính số đọc và người thực hiện');
 await form.locator('#correction-reason-dialog button[type="submit"]').click();
 await form.locator('#message').getByText(/Đã lưu hồ sơ Supabase/).waitFor();
 const changedDiffSave=await form.evaluate(()=>window.__fixture.saveCalls.at(-1));
 assert.notEqual(changedDiffSave.requestId,failedDifferentRequest,'editing after failure creates a new idempotency key');
 assert.equal(changedDiffSave.reason,'Đính chính số đọc và người thực hiện');
 await form.reload();
 await form.locator('#entry-mode-warning').waitFor();
 assert.equal(await form.locator('[name="forms.bm01.'+point+'.p05"]').inputValue(),'','reload keeps the accepted cleared reading');
 await form.evaluate(()=>window.__fixture.setCalibrationDue('2026-12-30'));
 await form.reload();
 await form.locator('#message').getByText(/Đã đồng bộ hạn thiết bị/).waitFor();
 const expiry=form.locator('[name="equipment.bm01.expiry"]');
 assert.equal(await expiry.inputValue(),'2026-12-30');
 assert.equal(await expiry.isEditable(),false,'mapped run calibration stays read only in the record');
 await form.locator('#record-save').click();
 await form.locator('#correction-reason-dialog[open]').waitFor();
 assert.match(await form.locator('#correction-preview').textContent(),/equipment\.bm01\.expiry.*2026-09-26.*2026-12-30/s);
 await form.locator('#correction-reason-dialog button[value="cancel"]').click();

 const locked=await localPage();
 await locked.goto('http://qualification.test/tham-dinh-thuc-te/gas.html?system=air&form=bm01&run='+closed.id+'&record='+closed.items[0].record_id);
 await locked.waitForFunction(()=>document.body.dataset.runClosed==='true');
 assert.equal(await locked.locator('#record-save').isDisabled(),true);
 assert.equal(await locked.locator('#entry-change').count(),0,'closed record offers no correction action');
 assert.equal(await locked.locator('#print').isDisabled(),false,'closed record keeps its saved PDF review action');

 const steamForm=await localPage();
 await steamForm.goto('http://qualification.test/tham-dinh-thuc-te/steam.html?form=bm01');
 await steamForm.locator('#run-select').selectOption(steamOpen.id);
 await steamForm.locator('#entry-mode-warning').waitFor();
 await steamForm.locator('#entry-continue').click();
 const steamVg=steamForm.locator('[name="bm01.'+steam.locations[0].id+'.0.vg"]'),steamVc=steamForm.locator('[name="bm01.'+steam.locations[0].id+'.1.vc"]'),thirdDay=steamForm.locator('[name="bm01.'+steam.locations[0].id+'.2.vg"]');
 assert.equal(await steamVg.isEditable(),false,'steam saved trial value is locked in continuation');
 assert.equal(await steamVc.isEditable(),true,'steam blank field on the second day remains editable');
 assert.equal(await thirdDay.isEditable(),true,'steam third-day blank remains editable when revisiting the point');

 const nitrogenForm=await localPage();
 await nitrogenForm.goto('http://qualification.test/tham-dinh-thuc-te/gas.html?system=nitrogen&form=bm05');
 await nitrogenForm.waitForFunction(()=>document.querySelectorAll('#run-select option').length>1);
 const nitrogenOptions=await nitrogenForm.locator('#run-select option').allTextContents();
 assert.equal(nitrogenOptions.some(text=>text.includes('Đợt nitơ chỉ tiểu phân')),false,'nitrogen BM05 is a measurement and excludes unrelated runs');
 assert.equal(nitrogenOptions.some(text=>text.includes('Đợt nitơ độ tinh khiết')),true);
 await nitrogenForm.locator('#run-select').selectOption(nitrogenBm05.id);
 await nitrogenForm.locator('#entry-mode-warning').waitFor();

 const runsPage=await localPage();
 await runsPage.goto('http://qualification.test/tham-dinh-thuc-te/runs.html');
 const openCard=runsPage.locator('.run-card').filter({hasText:'Đợt ba ngày'}),closedCard=runsPage.locator('.run-card').filter({hasText:'Đợt đã khóa'}),partialCard=runsPage.locator('.run-card').filter({hasText:'Đợt chỉ được nhập điểm'});
 assert.equal(await openCard.getByRole('button',{name:'Sửa thông tin thiết bị'}).count(),1);
 assert.equal(await closedCard.getByRole('button',{name:'Sửa thông tin thiết bị'}).count(),0,'closed run has no calibration editor');
 assert.equal(await partialCard.getByRole('button',{name:'Sửa thông tin thiết bị'}).count(),0,'partial writer without all-run authority has no calibration editor');
 await openCard.getByRole('button',{name:'Sửa thông tin thiết bị'}).click();
 await openCard.locator('.calibration-editor input[type="date"]').fill('2026-12-29');
 await openCard.getByRole('button',{name:'Lưu thông tin thiết bị'}).click();
 await openCard.locator('.calibration-editor .form-error').getByText(/Nhập lý do/).waitFor();
 await openCard.locator('.calibration-editor textarea').fill('Đổi thiết bị theo phiếu giao nhận');
 await openCard.getByRole('button',{name:'Lưu thông tin thiết bị'}).click();
 await runsPage.waitForFunction(()=>window.__fixture.updated?.reason);
 assert.equal(await runsPage.evaluate(()=>window.__fixture.updated.reason),'Đổi thiết bị theo phiếu giao nhận');
 await runsPage.locator('input[name="mode"][value="single"]').check();
 await runsPage.locator('#single-system').selectOption('air');
 await runsPage.locator('#scope-picker .scope-form').first().locator(':scope > label input').check();
 await runsPage.locator('#scope-picker .scope-form').first().locator('.point-choices input').first().check();
 await runsPage.locator('#calibration-fields input[type="date"]').waitFor();
 await runsPage.locator('#run-title').fill('Đợt tháng 10');
 await runsPage.locator('#create-submit').click();
 await runsPage.locator('#create-error').getByText(/Nhập tên thiết bị/).waitFor();
 assert.equal(await runsPage.locator('#run-title').inputValue(),'Đợt tháng 10','invalid create preserves entered title');
 await runsPage.locator('#calibration-fields input[type="text"]').fill('Máy đếm 02');
 await runsPage.locator('#calibration-fields input[type="date"]').fill('2026-12-30');
 await runsPage.locator('#create-submit').click();
 await runsPage.waitForFunction(()=>window.__fixture.created?.calibration);
 assert.deepEqual(await runsPage.evaluate(()=>window.__fixture.created.calibration),{'air:bm01:expiry':{name:'Máy đếm 02',due_on:'2026-12-30'}});
 assert.equal(await runsPage.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true,'mobile page does not overflow');

 const trend=await localPage();
 await trend.goto('http://qualification.test/tham-dinh-thuc-te/runs.html?view=trend&system=air');
 await trend.getByRole('tab',{name:'Qua các đợt đã đóng',exact:true}).click();
 await trend.locator('#multi-data-details summary').click();
 await trend.locator('#multi-trend-data tbody tr').waitFor();
 assert.equal(await trend.locator('.page-tabs').isHidden(),true,'dedicated trend route hides combined tabs');
 assert.equal(await trend.locator('#trend-system-control').isHidden(),true,'dedicated trend route pins the system');
 assert.match(await trend.locator('#multi-trend-status').textContent(),/1 hồ sơ đã đóng/);
 assert.equal(await trend.locator('#multi-trend-data').getByText('Nitơ').count(),0,'air trend contains no cross-system data');
 assert.deepEqual(errors,[]);
 console.log('PASS mandatory selector + delayed-load lock; air and steam continuation; nitrogen BM05 scope; correction preview/Escape/retry/baseline; device-date sync; safe history; closed lock; requirements/editor authority; pinned closed-run trend; mobile width');
}finally{await context.close();await browser.close();}

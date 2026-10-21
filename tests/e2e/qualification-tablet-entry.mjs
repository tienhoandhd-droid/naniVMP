// Headless acceptance for the static qualification run workspace.
// All browser requests are fulfilled locally; no Supabase or business write is used.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const root=new URL('../..',import.meta.url).pathname;
const fixtureFile=process.env.CPC1_UI_FIXTURES?process.env.CPC1_UI_FIXTURES+'/config.json':root+'/tests/fixtures/qualification-config.json';
const source=JSON.parse(await readFile(fixtureFile,'utf8'));
const air=source.gas_settings.find(row=>row.system==='air').config;
if(air.forms[0].locations.length<2)air.forms[0].locations.push({...air.forms[0].locations[0],id:'SYN-AIR-02',name:'Điểm khí tổng hợp 02'});
const nitrogen=source.gas_settings.find(row=>row.system==='nitrogen').config;
const steam=source.settings;
const run=(id,title,status,record,system='air',scope)=>({id,title,status,mode:'single',started_on:'2026-09-27',version:2,can_close:false,
 calibration:system==='air'?{'air:bm01:expiry':{name:'Máy đếm tiểu phân 01',due_on:'2026-09-26'}}:{},
 calibration_requirements:system==='air'?[{key:'air:bm01:expiry',system:'air',form:'bm01',name:'Máy đếm tiểu phân',kind:'calibration',label:'Hạn hiệu chuẩn',payload_path:['equipment','bm01','expiry']}]:[],
 items:[{system,record_id:record,scope:scope||{bm01:[(system==='steam'?steam.locations:system==='air'?air.forms[0].locations:nitrogen.forms[0].locations)[0].id]}}],progress:{complete:0,total:1,fail:0,invalid:0}});
const open=run('00000000-0000-4000-8000-000000000101','Đợt ba ngày','open','00000000-0000-4000-8000-000000000201');
open.can_close=true;open.items[0].scope.bm01=air.forms[0].locations.slice(0,2).map(p=>p.id);
const closed=run('00000000-0000-4000-8000-000000000102','Đợt đã khóa','closed','00000000-0000-4000-8000-000000000202');
const partial=run('00000000-0000-4000-8000-000000000103','Đợt chỉ được nhập điểm','open','00000000-0000-4000-8000-000000000203');
const steamOpen=run('00000000-0000-4000-8000-000000000111','Đợt hơi nhiều ngày','open','00000000-0000-4000-8000-000000000211','steam');
steamOpen.items[0].scope.bm03=[steam.locations[0].id];steamOpen.items[0].scope.bm02=[steam.locations[0].id];
steamOpen.calibration={'steam:balance':{name:'Cân 01',due_on:'2026-12-30'}};
steamOpen.calibration_requirements=[{key:'steam:balance',system:'steam',form:'bm03',name:'Cân',kind:'calibration',payload_path:['equipment','balance_due']}];
const steamClosed=structuredClone(steamOpen);steamClosed.id='00000000-0000-4000-8000-000000000112';steamClosed.status='closed';steamClosed.items[0].record_id='00000000-0000-4000-8000-000000000212';steamClosed.calibration={'steam:metadata':{name:'Dụng cụ khí',due_on:'2026-09-01'}};steamClosed.calibration_requirements=[{key:'steam:metadata',system:'steam',form:'bm01',name:'Dụng cụ khí',kind:'calibration',payload_path:[]}];
const nitrogenOther=run('00000000-0000-4000-8000-000000000121','Đợt nitơ chỉ tiểu phân','open','00000000-0000-4000-8000-000000000221','nitrogen');
const nitrogenBm05=run('00000000-0000-4000-8000-000000000122','Đợt nitơ độ tinh khiết','open','00000000-0000-4000-8000-000000000222','nitrogen',{bm05:[nitrogen.forms.find(form=>form.id==='bm05').locations[0].id]});
const point=air.forms.find(form=>form.id==='bm01').locations[0].id;
const fixture=`
if(!crypto.randomUUID){let syntheticUuid=900;Object.defineProperty(crypto,'randomUUID',{value:()=> '00000000-0000-4000-8000-'+String(++syntheticUuid).padStart(12,'0')});}
window.__fixture={created:null,updated:null,requirementsCalls:0};
const runs=${JSON.stringify([open,closed,partial,steamOpen,steamClosed,nitrogenOther,nitrogenBm05])};
const configs={air:${JSON.stringify(air)},nitrogen:${JSON.stringify(nitrogen)},steam:${JSON.stringify(steam)}};
const point=${JSON.stringify(point)};
const selected=()=>new URLSearchParams(location.search).get('run');
const selectedRun=()=>runs.find(item=>item.id===selected());
window.__fixture.setCalibrationDue=due=>sessionStorage.setItem('fixture-calibration-due',due);
window.__fixture.deferLoad=()=>sessionStorage.setItem('fixture-defer-load','1');
const recordData=id=>{
 if(['${steamOpen.items[0].record_id}','${steamClosed.items[0].record_id}'].includes(id))return {meta:{},equipment:{balance_due:'2026-12-30'},bm01:{'${steam.locations[0].id}':[{vg:'5',vc:'5',executor:'QA',date:'2026-09-27'},{vg:'6',vc:'',executor:'QA',date:'2026-09-28'},{vg:'',vc:'',executor:'QA',date:'2026-09-29'}]},bm02:{},bm03:{},bm04:{}};
 if(id==='${nitrogenBm05.items[0].record_id}')return {system:'nitrogen',meta:{},equipment:{},forms:{bm05:{'${nitrogen.forms.find(form=>form.id==='bm05').locations[0].id}':{purity:'99.95',executed_by:'QA',execution_date:'2026-09-27'}}},controls:{positive_count:'',executed_by:'',result_date:''},trend:{}};
 return {system:'air',meta:{},equipment:{bm01:{expiry:id==='${closed.items[0].record_id}'?'2026-08-01':'2026-09-26'}},forms:{bm01:{[point]:{p05:'12',p5:'',executed_by:'QA',execution_date:'2026-09-27'}}},controls:{positive_count:'',executed_by:'',result_date:''},trend:{}};
};
window.CPC1Backend={
 capabilities:{persistence:true,auth:true},mode:'cloud',permissions:{can_view:true,can_enter:true},
 permissionsFor:()=>({can_view:true,can_view_current:true,can_enter:true}),
 canSaveActive:()=>selectedRun()?.status==='open',canEvaluateActive:()=>selectedRun()?.status==='open',
 getSession:async()=>({user:{id:'synthetic-qa'}}),signIn:async()=>{},signOut:async()=>{},openLogin(){},
 getGasConfig:async system=>{const current=selectedRun(),base=configs[system],due=sessionStorage.getItem('fixture-calibration-due');if(current?.id===runs[0].id&&due)current.calibration['air:bm01:expiry'].due_on=due==='missing'?'':due;return current&&current.items[0].system===system?{...structuredClone(base),_scope:current.items[0].scope,_run:structuredClone(current)}:structuredClone(base)},
 getConfig:async()=>{const current=selectedRun(),base=configs.steam;return current&&current.items[0].system==='steam'?{...structuredClone(base),_scope:current.items[0].scope,_run:structuredClone(current)}:structuredClone(base)},
 listRuns:async()=>structuredClone(runs),listHistory:async()=>[{run_id:runs[1].id,record_id:runs[1].items[0].record_id,version:3,system:'air',period:'2026-09-01',trend:[{form:'bm01',point_id:point,trial:1,metric:'particles',label:'Tiểu phân ≥ 0,5 µm',unit:'hạt/m³',value:12,uncertain:false}]}],historySnapshot:async()=>({evaluation:{}}),
 runRequirements:async scope=>{window.__fixture.requirementsCalls++;return scope.some(item=>item.system==='air'&&item.forms.bm01)?structuredClone(runs[0].calibration_requirements):[]},
 createRun:async definition=>{window.__fixture.created=structuredClone(definition);return {...structuredClone(runs[0]),...definition,id:'00000000-0000-4000-8000-000000000103'}},
 updateRunCalibration:async(id,version,calibration,reason)=>{window.__fixture.updated={id,version,calibration:structuredClone(calibration),reason};return {...structuredClone(runs.find(item=>item.id===id)),version:version+1,calibration}},
 transitionRun:async()=>{},downloadHistorySource:async()=>new Blob(),
 load:async id=>{if(sessionStorage.getItem('fixture-defer-load')==='1'){sessionStorage.removeItem('fixture-defer-load');await new Promise(resolve=>{window.__fixture.releaseLoad=resolve;});}return {id,version:3,data:JSON.parse(sessionStorage.getItem('qualification-record:'+id)||JSON.stringify(recordData(id))),evaluation:{forms:{}}}},
 list:async()=>[],evaluate:async()=>({forms:{},overall:'incomplete'}),save:async(data,options)=>{window.__fixture.saveCalls??=[];window.__fixture.saveCalls.push(structuredClone(options));if(window.__fixture.failNextSave){window.__fixture.failNextSave=false;throw Error('Mạng tạm thời');}if(window.__fixture.rejectCells){const blocked=Object.assign(Error('Số liệu bị chặn. Tải lại trước khi lưu.'),{code:'22023',details:JSON.stringify({cells:window.__fixture.rejectCells})});window.__fixture.rejectCells=null;throw blocked;}if(window.__fixture.deferNextSave){window.__fixture.deferNextSave=false;await new Promise(resolve=>{window.__fixture.releaseSave=resolve;});}sessionStorage.setItem('qualification-record:'+options.recordId,JSON.stringify(data));return {id:options.recordId,version:4,data:structuredClone(data),evaluation:{forms:{}}}},
 pointHistory:async()=>[{version:3,created_at:'2026-09-27T08:00:00Z',actor_name:'QA Fixture <script>',reason:null,measurement_dates:['2026-09-27'],changes:[{path:['forms','bm01',point,'p05'],before:'',after:'12'}]}],
 report:async()=>new Blob()
};
document.body.dataset.qualificationGate='ready';`;

const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||chromium.executablePath()});
const context=await browser.newContext({viewport:{width:390,height:844}});
const errors=[];
async function localPage(target=context){
 const page=await target.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!=='http://qualification.test')return route.abort();if(url.pathname.endsWith('/cloud.js'))return route.fulfill({contentType:'text/javascript',body:fixture});if(url.pathname.endsWith('/runtime-config.js'))return route.fulfill({contentType:'text/javascript',body:'window.CPC1_SETTINGS={};'});try{const file=(process.env.CPC1_TABLET_PUBLIC_ROOT||root+'/public')+url.pathname,ext=file.split('.').at(-1);return route.fulfill({body:await readFile(file),contentType:({html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',png:'image/png'})[ext]||'application/octet-stream'});}catch{return route.fulfill({status:404});}});
 return page;
}

try {
 const reviewFailures=[];const reviewCheck=fn=>{try{fn();}catch(error){reviewFailures.push(error.message);}};
 for(const [width,height] of [[768,1024],[820,1180],[1024,768],[1180,820],[390,844],[1440,1000]]) {
  for(const [system,run] of [['air',open],['steam',steamOpen]]) {
   const page=await localPage();await page.setViewportSize({width,height});
   await page.goto(`http://qualification.test/tham-dinh-thuc-te/${system==='steam'?'steam':'gas'}.html?system=${system}&form=bm01&run=${run.id}&record=${run.items[0].record_id}`);
   await page.locator('#entry-continue').click();await page.evaluate(()=>scrollTo(0,0));
   const first=page.locator('#form-body input[inputmode="decimal"]').first(), box=await first.boundingBox();
   if(width>=768)assert(box.y+box.height<height,`${system} ${width}: first number below initial viewport (${box.y})`);
   if(width>=768&&width<1200){const bar=await page.locator('.actionbar,.action-bar').boundingBox();assert(bar.y+bar.height<=height+1,'tablet save toolbar remains visible');assert(box.y+box.height<=bar.y,`${system} ${width}: first field ${box.y+box.height} covered by toolbar ${bar.y}`);}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
   if(system==='air') {
    assert.equal(await page.locator('input[name="equipment.bm01.expiry"]').count(),0,'bound calibration date is shown once in run summary');
    await page.locator('#run-context summary').click();
    await page.locator('#run-context').getByText('Máy đếm tiểu phân 01').waitFor();
    assert.match(await page.locator('#run-context').textContent(),/26\/09\/2026/);
    await page.locator('.calibration-warning').waitFor();
   }
   if(system==='air')await page.locator('#run-context summary').click();
   if(process.env.CPC1_TABLET_SCREENSHOTS){await mkdir(process.env.CPC1_TABLET_SCREENSHOTS,{recursive:true});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${process.env.CPC1_TABLET_SCREENSHOTS}/final-${system}-${width}.png`,fullPage:true});}
   if(width===1024&&system==='air') {
    const input=page.locator(`[name="forms.bm01.${point}.p5"]`);await input.fill('0');
    await page.locator('#point-next').click();await page.locator('#point-previous').click();
    assert.equal(await input.inputValue(),'0','point navigation keeps unsaved zero');
    await page.evaluate(()=>window.__fixture.failNextSave=true);await page.locator('#record-save').click();
    await page.locator('#message').getByText(/Mạng tạm thời/).waitFor();assert.equal(await input.inputValue(),'0');
    await page.locator('#record-save').click();await page.waitForFunction(id=>sessionStorage.getItem('qualification-record:'+id),open.items[0].record_id);
    const saved=await page.evaluate(id=>JSON.parse(sessionStorage.getItem('qualification-record:'+id)),open.items[0].record_id);
    assert.equal(saved.equipment.bm01.expiry,'2026-09-26','calibration remains in exact payload path');
    await page.reload();await page.locator('#entry-continue').click();assert.equal(await input.inputValue(),'0','saved measurement survives reload');
    await input.focus();await page.waitForTimeout(50);const focusNormal=await input.boundingBox(),normalBar=await page.locator('.actionbar').boundingBox();assert(focusNormal.y+focusNormal.height<=normalBar.y,'focused field scrolls above toolbar');
    await page.setViewportSize({width:1024,height:400});await input.focus();await input.evaluate(node=>node.scrollIntoView({block:'center'}));
    const focused=await input.boundingBox();assert(focused.y>=0&&focused.y+focused.height<=400,'reduced viewport focused field is unobscured');
    assert(await input.evaluate(node=>{const r=node.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===node;}));
   }
   for(const selector of ['#record-save','#evaluate','#point-next']){const target=await page.locator(selector).boundingBox();assert(target.height>=48,'primary touch control is at least48px');}
   await page.close();
  }
 }
 const closedPage=await localPage();await closedPage.goto(`http://qualification.test/tham-dinh-thuc-te/gas.html?system=air&form=bm01&run=${closed.id}&record=${closed.items[0].record_id}`);
 await closedPage.locator('#entry-mode-warning').waitFor();await closedPage.locator('#run-context summary').click();
 assert.match(await closedPage.locator('#run-context').textContent(),/01\/08\/2026/,'closed summary shows saved due date, not current run due');
 const warning=await closedPage.locator('.calibration-warning').textContent();reviewCheck(()=>assert.match(warning,/hết hạn 01\/08\/2026 trước ngày đo 27\/09\/2026/,'closed warning uses saved due date'));
 assert.equal(await closedPage.locator('#record-save').isDisabled(),true);
 await closedPage.evaluate(async id=>{const record=await window.CPC1Backend.load(id);delete record.data.equipment.bm01.expiry;sessionStorage.setItem('qualification-record:'+id,JSON.stringify(record.data));},closed.items[0].record_id);await closedPage.reload();
 await closedPage.locator('#run-context summary').getByText(/Thiếu tên hoặc hạn/).waitFor();assert.equal(await closedPage.locator('.calibration-warning').count(),0,'missing closed mapped date does not fall back to run metadata');await closedPage.close();
 const missing=await localPage();await missing.goto(`http://qualification.test/tham-dinh-thuc-te/gas.html?system=air&form=bm01&run=${open.id}&record=${open.items[0].record_id}`);
 await missing.locator('#entry-mode-warning').waitFor();await missing.evaluate(()=>window.__fixture.setCalibrationDue('missing'));await missing.reload();
 await missing.locator('#run-context summary').getByText(/Thiếu tên hoặc hạn/).waitFor();
 assert.equal(await missing.locator('#run-context details').getAttribute('open'),'');
 await missing.evaluate(()=>sessionStorage.removeItem('fixture-calibration-due'));await missing.close();
 const metaClosed=await localPage();await metaClosed.goto(`http://qualification.test/tham-dinh-thuc-te/steam.html?form=bm01&run=${steamClosed.id}&record=${steamClosed.items[0].record_id}`);
 await metaClosed.locator('#entry-mode-warning').waitFor();await metaClosed.locator('#run-context summary').click();
 const closedText=await metaClosed.locator('#run-context').textContent();reviewCheck(()=>assert.match(closedText,/Hạn hiệu chuẩn: 01\/09\/2026/,'metadata-only closed due remains run metadata'));await metaClosed.close();
 const savePage=await localPage();await savePage.setViewportSize({width:1024,height:768});await savePage.goto(`http://qualification.test/tham-dinh-thuc-te/steam.html?form=bm01&run=${steamOpen.id}&record=${steamOpen.items[0].record_id}`);
 await savePage.locator('#entry-continue').click();const steamInput=savePage.locator('#form-body input[name$=".1.vc"]');await steamInput.fill('7');
 await savePage.locator('#form-body input[inputmode="decimal"]').first().evaluate(node=>node.scrollIntoView({block:'center'}));
 await savePage.evaluate(()=>window.__fixture.failNextSave=true);await savePage.locator('#record-save').click();await savePage.locator('#message').getByText(/Mạng tạm thời/).waitFor();
 const errorBox=await savePage.locator('#message').boundingBox();reviewCheck(()=>assert(errorBox.y>=0&&errorBox.y+errorBox.height<=768,'failed save message visible beside toolbar on long steam form'));
 assert(await savePage.locator('#message').evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'save error is not hidden under another element');
 assert.equal(await steamInput.inputValue(),'7');await savePage.locator('#record-save').click();await savePage.waitForFunction(id=>sessionStorage.getItem('qualification-record:'+id),steamOpen.items[0].record_id);
 const successBox=await savePage.locator('#message').boundingBox();assert(successBox.y>=0&&successBox.y+successBox.height<=768,'save success remains visible beside toolbar');
 await savePage.setViewportSize({width:820,height:1180});await savePage.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:700});visualViewport.dispatchEvent(new Event('resize'));});
 const keyboardPosition=await savePage.locator('.action-bar').evaluate(node=>getComputedStyle(node).position);reviewCheck(()=>assert.equal(keyboardPosition,'static','relative keyboard shrink disables fixed toolbar'));
 await steamInput.focus();await steamInput.evaluate(node=>node.scrollIntoView({block:'center'}));await steamInput.blur();await steamInput.focus();await savePage.waitForTimeout(50);
 const keyboardField=await steamInput.boundingBox();assert(keyboardField.y>=0&&keyboardField.y+keyboardField.height<=700,'field reachable inside shrunken visual viewport');
 await savePage.close();
 const equipment=await localPage();await equipment.goto(`http://qualification.test/tham-dinh-thuc-te/steam.html?form=bm03&run=${steamOpen.id}&record=${steamOpen.items[0].record_id}`);
 await equipment.locator('#run-context summary').waitFor();
 assert.equal(await equipment.locator('[name="equipment.balance_due"]').count(),0);
 assert.equal(await equipment.locator('[name="equipment.balance_status"]').count(),1,'equipment condition remains available');
 assert.equal(await equipment.locator('[name="equipment.thermometer_due"]').count(),1,'legacy unbound date remains available');
 await equipment.close();
 const nitrogenPage=await localPage();await nitrogenPage.setViewportSize({width:820,height:1180});await nitrogenPage.goto(`http://qualification.test/tham-dinh-thuc-te/gas.html?system=nitrogen&form=bm05&run=${nitrogenBm05.id}&record=${nitrogenBm05.items[0].record_id}`);
 await nitrogenPage.locator('#entry-continue').click();const nitrogenInput=nitrogenPage.locator('#form-body input[inputmode="decimal"]').first();await nitrogenPage.evaluate(()=>scrollTo(0,0));
 const nitrogenBox=await nitrogenInput.boundingBox();assert(nitrogenBox.y+nitrogenBox.height<1180,'nitrogen number visible on tablet');
 await nitrogenPage.evaluate(()=>{document.body.style.zoom='2';});await nitrogenPage.waitForTimeout(50);
 assert.equal(await nitrogenPage.locator('.actionbar').evaluate(node=>getComputedStyle(node).position),'static','CSS zoom200% toolbar follows document');
 await nitrogenInput.evaluate(node=>node.scrollIntoView({block:'center'}));await nitrogenInput.focus();await nitrogenPage.waitForTimeout(50);
 assert.equal(await nitrogenPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'CSS zoom200% has no horizontal page overflow');
 assert(await nitrogenInput.evaluate(node=>{const r=node.getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===node;}),'CSS zoom200% focused field visible and uncovered');await nitrogenPage.close();
 // Nhập trên máy tính bảng: chặn số sai trước khi lưu, Enter sang ô kế, lưu xong nhập tiếp, trạng thái lưu 3 bước.
 const guard=await localPage();await guard.setViewportSize({width:768,height:1024});
 await guard.goto(`http://qualification.test/tham-dinh-thuc-te/gas.html?system=air&form=bm01&run=${open.id}&record=${open.items[0].record_id}`);
 await guard.locator('#entry-continue').click();
 const second=air.forms[0].locations[1].id,cell=(p,k)=>guard.locator(`[name="forms.bm01.${p}.${k}"]`);
 await guard.evaluate(()=>{window.__evaluations=0;const original=GasAPI.evaluate;GasAPI.evaluate=(...args)=>{window.__evaluations++;return original(...args);};});
 const bar=guard.locator('.point-bar');
 assert.equal(await bar.evaluate(n=>getComputedStyle(n).position),'sticky','point header stays visible while scrolling');
 assert.match(await bar.textContent(),new RegExp(`${point}.*1/${air.forms[0].locations.length}.*Lần đo 1.*3520`,'s'),'sticky header: point, position, trial and the configured limits');
 assert.equal(await cell(point,'p5').getAttribute('enterkeyhint'),'done','last number of the point finishes with Enter');
 await cell(point,'p5').focus();await guard.keyboard.type('4.000');await guard.keyboard.press('Enter');
 await guard.waitForFunction(p=>document.activeElement?.name===`forms.bm01.${p}.p05`,second);
 assert.equal(await guard.evaluate(()=>window.__evaluations),0,'Enter never submits calculation');
 assert.match(await bar.textContent(),new RegExp(`${second}.*2/`,'s'));
 assert.equal(await cell(second,'p05').getAttribute('enterkeyhint'),'next');
 await guard.keyboard.type('-3');await guard.keyboard.press('Enter');
 assert.equal(await guard.evaluate(()=>document.activeElement?.name),`forms.bm01.${second}.p5`,'Enter moves to the next field');
 await cell(second,'execution_date').fill('2019-05-01');await cell(second,'execution_date').blur();
 assert.match(await guard.locator(`#${await cell(second,'execution_date').getAttribute('id')}-error`).textContent(),/2020/,'old date is flagged beside the field');
 assert.equal(await cell(second,'execution_date').getAttribute('min'),'2020-01-01');
 await cell(second,'execution_date').fill('');
 await guard.locator('#record-save').click();
 await guard.locator('#error-summary').getByText('Còn 2 ô cần sửa.').waitFor();
 assert.equal(await guard.evaluate(()=>window.__fixture.saveCalls?.length||0),0,'invalid input is not sent');
 assert.equal(await guard.evaluate(()=>document.activeElement?.name),`forms.bm01.${point}.p5`,'focus moves to the first invalid field');
 assert.equal(await cell(point,'p5').getAttribute('aria-invalid'),'true');
 assert.equal(await cell(point,'p5').inputValue(),'4.000','draft is kept');
 assert.match(await guard.locator(`#${await cell(point,'p5').getAttribute('id')}-error`).textContent(),/Số dễ nhầm hàng nghìn — gõ 4000 hoặc 4,0/);
 assert.match(await guard.locator('#record-state').textContent(),/Chưa lưu — còn ô nhập sai/);
 await cell(point,'p5').fill('4000');
 assert.equal(await cell(point,'p5').getAttribute('aria-invalid'),null,'typing clears this field only');
 await guard.locator('#error-summary').getByText('Còn 1 ô cần sửa.').waitFor();
 await guard.locator('#error-summary a').click();
 await guard.waitForFunction(p=>document.activeElement?.name===`forms.bm01.${p}.p05`,second);
 assert.equal(await cell(second,'p05').getAttribute('aria-invalid'),'true','summary link opens the other point and marks its field');
 await cell(second,'p05').fill('3');await cell(second,'p5').focus();
 await guard.evaluate(()=>{window.__fixture.deferNextSave=true;});await guard.locator('#record-save').click();
 await guard.waitForFunction(()=>typeof window.__fixture.releaseSave==='function');
 assert.equal(await guard.locator('#record-state').textContent(),'Đang lưu…');
 await guard.evaluate(()=>window.__fixture.releaseSave());
 await guard.locator('#record-state').getByText(/^Đã lưu lúc \d\d:\d\d · phiên bản 4$/).waitFor();
 assert.equal(await guard.evaluate(()=>document.activeElement?.name),`forms.bm01.${second}.p5`,'focus returns to the field being entered');
 assert.equal(await cell(second,'p5').isEditable(),true,'blank fields stay open after saving');
 assert.equal(await cell(second,'p05').isEditable(),false,'saved number is locked');
 assert.match(await cell(second,'p05').evaluate(n=>getComputedStyle(n).backgroundImage),/repeating-linear-gradient/,'locked field looks different');
 await cell(second,'p05').click();
 await guard.locator('.entry-mode-panel.attention .entry-lock-hint').getByText(/Thay đổi/).waitFor();
 await cell(second,'p5').fill('2');
 await guard.evaluate(()=>window.__fixture.failNextSave=true);await guard.locator('#record-save').click();
 await guard.locator('#record-state').getByText('Chưa lưu — lỗi khi lưu').waitFor();
 await guard.locator('#record-save-retry').click();
 await guard.locator('#record-state').getByText(/^Đã lưu lúc/).waitFor();
 assert.equal(await guard.locator('#record-save-retry').isHidden(),true);
 await cell(second,'execution_date').fill('2026-09-28');
 await guard.evaluate(p=>{window.__fixture.rejectCells=[{path:['forms','bm01',p,'execution_date'],reason:'Ngày đo sau ngày đóng đợt'}];},second);
 await guard.locator('#record-save').click();
 await guard.locator('#message').getByText(/Tải lại trước khi lưu\. Dữ liệu/).waitFor();
 assert.doesNotMatch(await guard.locator('#message').textContent(),/\.\./,'no doubled full stop');
 assert.equal(await cell(second,'execution_date').getAttribute('aria-invalid'),'true','server-listed field is marked');
 assert.match(await guard.locator(`#${await cell(second,'execution_date').getAttribute('id')}-error`).textContent(),/sau ngày đóng đợt/);
 assert.equal(await cell(second,'execution_date').inputValue(),'2026-09-28');
 // Tính thử bị máy chủ chặn (PT422, details = JSON issues): đánh dấu đúng ô, giữ số đang nhập.
 await guard.evaluate(p=>{GasAPI.evaluate=async()=>{throw Object.assign(Error('Còn 1 ô nhập sai — sửa trước khi tính'),{code:'PT422',hint:'INVALID_INPUT',details:JSON.stringify({code:'INVALID_INPUT',issues:[{path:['forms','bm01',p,'p5'],field:'p5',value:'2',rule:'evaluation_invalid',reason:'Máy chủ không tính được ô này'}]})});};},second);
 await guard.locator('#evaluate').click();
 await guard.locator('#message').getByText(/Không thể tính: Còn 1 ô nhập sai — sửa trước khi tính\. Dữ liệu/).waitFor();
 assert.equal(await cell(second,'p5').getAttribute('aria-invalid'),'true','evaluation issue is mapped to its field');
 assert.match(await guard.locator(`#${await cell(second,'p5').getAttribute('id')}-error`).textContent(),/Máy chủ không tính được ô này/);
 assert.equal(await guard.evaluate(()=>getComputedStyle(document.querySelector('#point-list small')).fontSize.replace('px','')>=12),true,'grade label at least 12px');
 assert.equal(await guard.evaluate(()=>{const n=document.getElementById('form-tabs');return n.scrollWidth<=n.clientWidth+1;}),true,'form tabs wrap at 768px');
 const headings=await new AxeBuilder({page:guard}).withRules(['heading-order']).analyze();assert.deepEqual(headings.violations.map(v=>v.id),[]);
 await guard.close();
 const steamLabels=await localPage();await steamLabels.goto(`http://qualification.test/tham-dinh-thuc-te/steam.html?form=bm01&run=${steamOpen.id}&record=${steamOpen.items[0].record_id}`);
 await steamLabels.locator('#entry-continue').click();
 assert.match(await steamLabels.locator(`label[for="${await steamLabels.locator('#form-body input[name$=".1.vc"]').getAttribute('id')}"]`).textContent(),/\(mL\)/,'steam unit belongs to its label');
 assert.match(await steamLabels.locator('#record-state').textContent(),/^Đã mở · phiên bản 3$/,'open state matches gas wording');
 const steamVc=steamLabels.locator('#form-body input[name$=".1.vc"]'),steamThird=steamLabels.locator('#form-body input[name$=".2.vg"]');
 await steamVc.fill('1.500');await steamLabels.locator('#record-save').click();
 await steamLabels.locator('#error-summary').getByText('Còn 1 ô cần sửa.').waitFor();
 assert.equal(await steamVc.getAttribute('aria-invalid'),'true');assert.equal(await steamLabels.evaluate(()=>document.activeElement?.name?.endsWith('.1.vc')),true);
 assert.equal(await steamLabels.evaluate(()=>window.__fixture.saveCalls?.length||0),0,'steam invalid input is not sent');
 await steamVc.fill('1500');await steamThird.focus();await steamThird.fill('2');await steamLabels.locator('#record-save').click();
 await steamLabels.locator('#record-state').getByText(/^Đã lưu lúc \d\d:\d\d · phiên bản 4$/).waitFor();
 assert.equal(await steamLabels.locator('#form-body input[name$=".2.vc"]').isEditable(),true,'steam keeps continuation after saving');
 assert.equal(await steamThird.isEditable(),false,'steam saved number is locked');
 await steamLabels.goto(`http://qualification.test/tham-dinh-thuc-te/steam.html?form=bm02&run=${steamOpen.id}&record=${steamOpen.items[0].record_id}`);
 const microbial=steamLabels.locator('#form-body [name$=".microbial"]');
 assert.notEqual(await microbial.getAttribute('inputmode'),'decimal','steam microbial accepts letters like gas (KPH)');
 await microbial.fill('KPH');
 // Nội độc tố gel-clot: cảnh báo mềm tại ô, không chặn Lưu. Khoảng trắng đầu/cuối bị cắt trước khi gửi.
 const endotoxin=steamLabels.locator('#form-body [name$=".endotoxin"]');await endotoxin.fill('<0,25');await endotoxin.blur();
 assert.match(await steamLabels.locator(`[id="${await endotoxin.getAttribute('id')}-error"]`).textContent(),/Chưa chấm được — cần QA quyết cách ghi; chưa ký/);
 assert.equal(await endotoxin.getAttribute('aria-invalid'),null,'soft warning does not mark the field invalid');
 await steamLabels.locator('#form-body [name$=".toc"]').fill('  5 ');await steamLabels.locator('#form-body [name$=".sample_chem"]').fill('   ');
 await steamLabels.locator('#record-save').click();
 await steamLabels.locator('#record-state').getByText(/^Đã lưu lúc/).waitFor();
 const savedWater=await steamLabels.evaluate(id=>Object.values(JSON.parse(sessionStorage.getItem('qualification-record:'+id)).bm02)[0],steamOpen.items[0].record_id);
 assert.deepEqual([savedWater.microbial,savedWater.endotoxin,savedWater.toc,savedWater.sample_chem],['KPH','<0,25','5',''],'KPH accepted, endotoxin not blocked, cells trimmed');
 await steamLabels.close();
 // Máy tính bảng: ô sai rời tiêu điểm không được đẩy nút Lưu — lần chạm Lưu đầu tiên phải có phản hồi.
 // 768×1024 cảm ứng (thanh công cụ cố định) và 1440×900 (thanh công cụ nằm sau biểu mẫu — nơi diễn tập thấy nút dịch 29px).
 for(const [width,height] of [[768,1024],[1440,900]]){
 const touch=await browser.newContext({viewport:{width,height},hasTouch:true});
 for(const [system,run,selector,bad] of [['air',open,`[name="forms.bm01.${air.forms[0].locations[1].id}.p05"]`,'4.000'],['steam',steamOpen,'#form-body input[name$=".2.vc"]','-3']]){
  const tp=await localPage(touch);
  await tp.goto(`http://qualification.test/tham-dinh-thuc-te/${system==='steam'?'steam':'gas'}.html?system=${system}&form=bm01&run=${run.id}&record=${run.items[0].record_id}`);
  await tp.locator('#entry-continue').tap();
  if(system==='air'){await tp.locator('#point-next').tap();}
  const field=tp.locator(selector);await field.tap();await tp.keyboard.type(bad);
  const before=await tp.locator('#record-save').boundingBox();
  await field.evaluate(n=>n.blur());
  const after=await tp.locator('#record-save').boundingBox();
  assert(Math.abs(after.y-before.y)<=1&&Math.abs(after.x-before.x)<=1,`${system} ${width}: Save moved ${before.y}->${after.y} when the error appeared`);
  await field.tap();await tp.locator('#record-save').tap();
  await tp.locator('#message').getByText(/Chưa lưu: còn 1 ô nhập sai/).waitFor({timeout:1500});
  await tp.close();
 }
 await touch.close();
 }
 // Lỗi máy chủ chỉ có câu thông báo (không có details): không lộ đường dẫn, đổi thành tên điểm + tên trường.
 const raw=await localPage();await raw.setViewportSize({width:1024,height:768});
 await raw.goto(`http://qualification.test/tham-dinh-thuc-te/gas.html?system=air&form=bm01&run=${open.id}&record=${open.items[0].record_id}`);
 await raw.locator('#entry-continue').click();
 await raw.evaluate(p=>{GasAPI.save=async()=>{throw Object.assign(Error(`Còn 1 ô nhập sai — sửa trước khi lưu. Ô forms › bm01 › ${p} › p5: Số đếm phải là số nguyên.`),{code:'PT422'});};},point);
 await raw.locator(`[name="forms.bm01.${point}.p5"]`).fill('3');await raw.locator('#record-save').click();
 await raw.locator('#error-summary').getByText(/Số đếm phải là số nguyên/).waitFor();
 const shown=await raw.evaluate(()=>document.getElementById('message').textContent+' '+document.getElementById('error-summary').textContent);
 assert.doesNotMatch(shown,/›|forms/,'no technical path is shown');
 assert.match(shown,new RegExp(`${air.forms[0].locations[0].name}.*Tiểu phân ≥ 5,0 µm`),'point name and form field label');
 assert.equal(await raw.locator(`[name="forms.bm01.${point}.p5"]`).getAttribute('aria-invalid'),'true');
 await raw.close();
 assert.deepEqual(reviewFailures,[]);
 assert.deepEqual(errors,[]);console.log('qualification tablet entry: PASS');
}finally{await browser.close();}

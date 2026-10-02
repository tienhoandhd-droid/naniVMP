import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const root=new URL('../..',import.meta.url).pathname;
const publicRoot=process.env.CPC1_PASTE_PUBLIC_ROOT||root+'/public';
const evidence=process.env.CPC1_PASTE_EVIDENCE;
if(evidence)await mkdir(evidence,{recursive:true});
const configs=JSON.parse(await readFile(root+'/tests/fixtures/qualification-config.json','utf8'));
const fixture=`
const source=${JSON.stringify(configs)};
const query=new URLSearchParams(location.search),system=query.get('system')||'steam';
const record=system+'-record',runId=system+'-run';
const scope={bm01:['P.1','P2'],bm02:['P.1','P2'],bm03:['P.1','P2'],bm04:['P.1','P2'],bm05:['P.1','P2']};
const run={id:runId,title:'Đợt kiểm tra nhập bảng',status:query.get('closed')?'closed':'open',version:1,items:[{system,record_id:record,scope}],calibration_requirements:[]};
const blank=()=>system==='steam'?{meta:{},equipment:{},bm01:{},bm02:{},bm03:{},bm04:{}}:{system,meta:{},equipment:{},forms:{},controls:{},trend:{}};
const data=()=>JSON.parse(sessionStorage.getItem(record)||JSON.stringify(blank()));
const session={user:{id:'fixture-entry'}};
window.__pasteFixture={saves:0,allow:true,serverAllow:true,fail:false,session,run,refreshes:0};
const config=()=>{
 const base=structuredClone(system==='steam'?source.settings:source.gas_settings.find(x=>x.system===system).config);
 const locations=[{id:'P.1',name:'Điểm một'},{id:'P2',name:'Điểm hai'},{id:'OUT',name:'Ngoài phạm vi'}];
 if(system==='steam')base.locations=locations;else base.forms.forEach(f=>{if(f.kind==='measurement')f.locations=locations;});
 return {...base,_run:run,_scope:scope};
};
window.CPC1Backend={mode:'cloud',capabilities:{auth:true,persistence:true},permissionsFor:()=>({can_view:true,can_view_current:true,can_enter:!query.has('archive')&&window.__pasteFixture.allow,can_edit_archive:window.__pasteFixture.allow}),
 canSaveActive:()=>window.__pasteFixture.allow&&run.status==='open',canEvaluateActive:()=>window.__pasteFixture.allow&&run.status==='open',
 refreshAccess:async(s,action)=>{window.__pasteFixture.refreshes++;if(s!==system||action!=='archive-edit')throw Error('Sai phạm vi kiểm quyền');if(window.__pasteFixture.deferAccess)await new Promise(resolve=>window.__pasteFixture.releaseAccess=resolve);window.__pasteFixture.allow=window.__pasteFixture.serverAllow;if(!window.__pasteFixture.allow){if(window.__pasteFixture.replaceOnDeny){const heading=document.createElement('h1');heading.textContent='Quyền đã thay đổi';document.body.replaceChildren(heading);}throw Error('Không còn quyền nhập');}return {can_edit_archive:true};},
 getSession:async()=>window.__pasteFixture.session,signIn:async()=>{},signOut:async()=>{},onSessionChange:fn=>{window.__pasteFixture.sessionChanged=fn;},
 getConfig:async()=>config(),getGasConfig:async()=>config(),listRuns:async()=>[run],list:async()=>[],
 load:async()=>{if(query.get('defer'))await new Promise(resolve=>window.__pasteFixture.release=resolve);return {id:record,version:Number(sessionStorage.getItem(record+'-version')||1),data:data(),evaluation:{forms:{}}};},
 evaluate:async()=>({forms:{}}),report:async()=>new Blob(),pointHistory:async()=>[],
 save:async(value,opts)=>{window.__pasteFixture.saves++;if(window.__pasteFixture.fail)throw Error('Mất kết nối thử nghiệm');sessionStorage.setItem(record,JSON.stringify(value));sessionStorage.setItem(record+'-version','2');return {id:record,version:2,data:structuredClone(value),evaluation:{forms:{}}};},
 listHistory:async()=>[{run_id:runId,record_id:record,version:2,system,period:'2026-10-02',trend:['P.1','P2'].map(point=>({form:'bm01',metric:'p05',label:'Tiểu phân',unit:'hạt/m³',point_id:point,trial:1,value:Number(String(data().forms?.bm01?.[point]?.p05??'').replace(',','.')),source_value:data().forms?.bm01?.[point]?.p05}))}],
 historySnapshot:async()=>({data:data(),evaluation:{forms:{},source_context:{config:config()}}}),runRequirements:async()=>[],downloadHistorySource:async()=>new Blob()
};document.body.dataset.qualificationGate='ready';`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||chromium.executablePath()});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const errors=[],external=[],writes=[];
async function pageFor(system,form='bm01',extra=''){
 const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!=='http://qualification.test'){external.push(url.href);return route.abort();}if(route.request().method()!=='GET')writes.push(url.href);if(url.pathname.endsWith('/cloud.js'))return route.fulfill({contentType:'text/javascript',body:fixture});if(url.pathname.endsWith('/runtime-config.js'))return route.fulfill({contentType:'text/javascript',body:'window.CPC1_SETTINGS={};'});try{const ext=url.pathname.split('.').at(-1);await route.fulfill({body:await readFile(publicRoot+url.pathname),contentType:({html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',png:'image/png'})[ext]||'application/octet-stream'});}catch{await route.fulfill({status:404});}});
 await page.goto('http://qualification.test/tham-dinh-thuc-te/'+(system==='steam'?'steam':'gas')+'.html?system='+system+'&form='+form+'&run='+system+'-run&record='+system+'-record'+extra);return page;
}
async function table(page,rows){await page.locator('#entry-paste-template').click();const template=await page.locator('#entry-paste-text').inputValue();const lines=template.split('\n'),header=lines[0].split('\t');return [lines[0],...rows.map(({point,trial=1,values})=>[point,String(trial),...header.slice(2).map(h=>values[h]??'')].join('\t'))].join('\n');}
async function preview(page,text){await page.locator('#entry-paste-text').fill(text);await page.locator('#entry-paste-preview').click();}
try{
 for(const system of ['air','nitrogen','steam']){
  const page=await pageFor(system);await page.locator('#entry-paste-open').click();
  await page.locator('#entry-paste-dialog[open]').waitFor();
  const number=system==='steam'?'Vg (mL)':'Tiểu phân ≥ 0,5 µm (hạt/m³)';
  // Use the actual template labels, whose gas configuration may phrase the field differently.
  await page.locator('#entry-paste-template').click();const header=(await page.locator('#entry-paste-text').inputValue()).split('\n')[0].split('\t');
  const numericLabel=system==='steam'?header.find(h=>h.startsWith('Vg')):header.find(h=>h.includes('0,5'));
  assert.ok(numericLabel,'existing measurement column in template');
  let text=await table(page,[{point:'OUT',values:{[numericLabel]:'5'}}]);await preview(page,text);
  assert.equal(await page.locator('#entry-paste-apply').isDisabled(),true);assert.match(await page.locator('#entry-paste-errors').textContent(),/phạm vi/);
  text=await table(page,[{point:'P.1',values:{[numericLabel]:'0'}},{point:'P2',trial:system==='steam'?3:1,values:{[numericLabel]:'12,50'}}]);
  await preview(page,text);assert.equal(await page.locator('#entry-paste-apply').isEnabled(),true);
  assert.match(await page.locator('#entry-paste-result').textContent(),/12,50/);
  const axe=await new AxeBuilder({page}).include('#entry-paste-dialog').analyze();assert.deepEqual(axe.violations.map(v=>v.id),[]);
  if(evidence)await page.screenshot({path:evidence+'/'+system+'-paste-desktop.png'});
  await page.locator('#entry-paste-apply').click();await page.locator('#entry-paste-dialog').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.__pasteFixture.saves),0,'paste does not save');
  assert.match(await page.locator('#record-state').textContent(),/chưa lưu/);
  await page.evaluate(()=>window.__pasteFixture.fail=true);await page.locator('#record-save').click();await page.locator('#message').getByText(/Không thể lưu/).waitFor();
  const field=system==='steam'?'[name="bm01.P__dot__1.0.vg"]':'[name="forms.bm01.P.1.p05"]';assert.equal(await page.locator(field).inputValue(),'0','failed save retains zero');
  await page.evaluate(()=>window.__pasteFixture.fail=false);await page.locator('#record-save').click();await page.locator('#message').getByText(/Đã lưu hồ sơ/).waitFor();
  await page.reload();await page.locator('#entry-paste-open').waitFor();assert.equal(await page.locator(field).inputValue(),'0');
  if(system==='steam'){
    await page.locator('.workspace-navigation>summary').click();await page.locator('#location-list button').filter({hasText:'P2'}).click();
    assert.equal(await page.locator('.trial-group').count(),3,'pasting only trial 3 retains three editable trial rows');
    assert.equal(await page.locator('[name="bm01.P2.2.vg"]').inputValue(),'12,50');
    await page.locator('.workspace-navigation>summary').click();await page.locator('#location-list button').filter({hasText:'P.1'}).click();
  }else{
    await page.locator('.workspace-navigation>summary').click();await page.locator('#point-list button').filter({hasText:'P2'}).click();assert.equal(await page.locator('[name="forms.bm01.P2.p05"]').inputValue(),'12,50');
    await page.locator('.workspace-navigation>summary').click();await page.locator('#point-list button').filter({hasText:'P.1'}).click();
  }
  if(system!=='steam'){
    const entryUrl=page.url();await page.goto('http://qualification.test/tham-dinh-thuc-te/runs.html?view=trend&system='+system);
    await page.locator('[data-chart="individual"] .individual-value').first().waitFor();
    assert.equal(await page.locator('[data-chart="individual"] .individual-value').count(),2,'saved pasted values reach chart');
    assert.match(await page.locator('[data-chart="individual"]').textContent(),/12,5/);
    await page.goto(entryUrl);await page.locator('#entry-paste-open').waitFor();
  }
  await page.locator('#entry-paste-open').click();text=await table(page,[{point:'P.1',values:{[numericLabel]:'9'}}]);await preview(page,text);assert.equal(await page.locator('#entry-paste-apply').isDisabled(),true);assert.match(await page.locator('#entry-paste-errors').textContent(),/đã có/);
  await page.locator('#entry-paste-close').click();
  // Existing correction flow remains available after imported data has been saved.
  await page.locator('#entry-change').click();await page.locator(field).fill('1');await page.locator('#record-save').click();await page.locator('#correction-reason-dialog[open]').waitFor();await page.locator('#correction-reason').press('Escape');
  await page.close();
 }
 const water=await pageFor('steam','bm02');await water.locator('#entry-paste-open').click();await water.locator('#entry-paste-template').click();
 const waterHead=(await water.locator('#entry-paste-text').inputValue()).split('\n')[0].split('\t'),endo=waterHead.find(x=>x.startsWith('Nội độc tố'));
 await preview(water,await table(water,[{point:'P.1',values:{[endo]:'1'}}]));assert.equal(await water.locator('#entry-paste-apply').isDisabled(),true,'inapplicable endotoxin cannot be pasted');assert.match(await water.locator('#entry-paste-errors').textContent(),/không áp dụng/);await water.close();
 const mobile=await pageFor('air');await mobile.setViewportSize({width:320,height:800});await mobile.locator('#entry-paste-open').click();
 await mobile.locator('#entry-paste-template').click();const h=(await mobile.locator('#entry-paste-text').inputValue()).split('\n')[0].split('\t');const col=h.find(x=>x.includes('0,5'));let text=await table(mobile,[{point:'P.1',values:{[col]:'7'}}]);await preview(mobile,text);
 assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 if(evidence)await mobile.screenshot({path:evidence+'/paste-mobile.png'});
 await mobile.evaluate(()=>window.__pasteFixture.serverAllow=false);await mobile.locator('#entry-paste-apply').click();assert.match(await mobile.locator('#entry-paste-status').textContent(),/quyền|khóa/);assert.equal(await mobile.evaluate(()=>window.__pasteFixture.saves),0);
 await mobile.close();
 const removed=await pageFor('air');await removed.locator('#entry-paste-open').click();text=await table(removed,[{point:'P.1',values:{[col]:'7'}}]);await preview(removed,text);await removed.evaluate(()=>{window.__pasteFixture.serverAllow=false;window.__pasteFixture.replaceOnDeny=true;});await removed.locator('#entry-paste-apply').click();await removed.getByRole('heading',{name:'Quyền đã thay đổi'}).waitFor();await removed.close();
 const race=await pageFor('air');await race.locator('#entry-paste-open').click();text=await table(race,[{point:'P.1',values:{[col]:'7'}}]);await preview(race,text);await race.evaluate(()=>window.__pasteFixture.deferAccess=true);await race.locator('#entry-paste-apply').click();await race.waitForFunction(()=>typeof window.__pasteFixture.releaseAccess==='function');await race.locator('#entry-paste-close').click();await race.evaluate(()=>window.__pasteFixture.releaseAccess());assert.equal(await race.locator('[name="forms.bm01.P.1.p05"]').inputValue(),'');await race.close();
 const archive=await pageFor('air','bm01','&archive=1');await archive.locator('#entry-paste-open').click();text=await table(archive,[{point:'P.1',values:{[col]:'7'}}]);await preview(archive,text);await archive.locator('#entry-paste-apply').click();await archive.locator('#entry-paste-dialog').waitFor({state:'hidden'});assert.equal(await archive.locator('[name="forms.bm01.P.1.p05"]').inputValue(),'7');await archive.close();
 const expired=await pageFor('air');await expired.locator('#entry-paste-open').click();text=await table(expired,[{point:'P.1',values:{[col]:'7'}}]);await preview(expired,text);await expired.evaluate(()=>window.__pasteFixture.session=null);await expired.locator('#entry-paste-apply').click();assert.match(await expired.locator('#entry-paste-status').textContent(),/đăng nhập|phiên/i);await expired.close();
 const stale=await pageFor('air');await stale.locator('#entry-paste-open').click();text=await table(stale,[{point:'P.1',values:{[col]:'7'}}]);await preview(stale,text);
 await stale.evaluate(()=>{const field=document.querySelector('[name="forms.bm01.P.1.p05"]');field.value='8';field.dispatchEvent(new Event('input',{bubbles:true}));});
 await stale.locator('#entry-paste-apply').click();assert.match(await stale.locator('#entry-paste-status').textContent(),/đã đổi/);assert.equal(await stale.locator('[name="forms.bm01.P.1.p05"]').inputValue(),'8');await stale.close();
 const themed=await pageFor('steam','bm03');await themed.setViewportSize({width:390,height:844});await themed.evaluate(()=>document.documentElement.dataset.theme='dark');await themed.locator('#entry-paste-open').click();await themed.locator('#entry-paste-template').click();
 const themedHead=(await themed.locator('#entry-paste-text').inputValue()).split('\n')[0].split('\t');await preview(themed,await table(themed,[{point:'P2',trial:2,values:{[themedHead[2]]:'2,5'}}]));
 assert.deepEqual((await new AxeBuilder({page:themed}).include('#entry-paste-dialog').analyze()).violations.map(v=>v.id),[]);if(evidence)await themed.screenshot({path:evidence+'/paste-dark-mobile.png'});
 await themed.evaluate(()=>document.documentElement.style.zoom='2');assert.equal(await themed.evaluate(()=>{const r=document.querySelector('#entry-paste-dialog').getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;}),true,'paste dialog fits at 200% zoom');await themed.close();
 const closed=await pageFor('air','bm01','&closed=1');await closed.locator('#run-context').waitFor();await closed.waitForTimeout(100);assert.equal(await closed.locator('#entry-paste-open').isDisabled(),true);await closed.close();
 const deferred=await pageFor('air','bm01','&defer=1');await deferred.waitForFunction(()=>typeof window.__pasteFixture.release==='function');assert.equal(await deferred.locator('#entry-paste-open:not([disabled])').count(),0);await deferred.evaluate(()=>window.__pasteFixture.release());await deferred.locator('#entry-paste-open').click();await deferred.locator('#entry-paste-text').fill('draft');await deferred.locator('#entry-paste-text').press('Escape');assert.equal(await deferred.locator('#entry-paste-open').evaluate(n=>n===document.activeElement),true);await deferred.close();
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(writes,[]);
 console.log('PASS paste/preview/error/zero/multiple points and steam trials/save failure/reload/correction, permissions/session/closed/load, mobile/axe; no external writes');
}finally{await browser.close();}

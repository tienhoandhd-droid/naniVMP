// Isolated UI acceptance: synthetic fixtures and mocked backend; blocks external requests.
import {chromium} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const fixtures=process.env.CPC1_UI_FIXTURES;
if(!fixtures || !process.env.CPC1_UI_OUTPUT)throw Error('Set CPC1_UI_FIXTURES and CPC1_UI_OUTPUT to private existing directories. See the UX plan.');
const out=resolve(process.env.CPC1_UI_OUTPUT);
const source=JSON.parse(await readFile(resolve(fixtures,'config.json'),'utf8'));
const browser=await chromium.launch({headless:true}); const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();page.setDefaultTimeout(8000);
const errors=[],checks=[],axes=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const base='http://qualification.test';
await page.context().route('**/*',async r=>{
 const u=new URL(r.request().url());if(u.origin!==base)throw Error('Unexpected network '+u.origin);
 if(u.pathname.endsWith('runtime-config.js'))return r.fulfill({body:'',contentType:'text/javascript'});
 if(u.pathname.endsWith('cloud.js'))return r.fulfill({contentType:'text/javascript',body:`
 document.body.dataset.qualificationGate='ready';
 const source=${JSON.stringify(source)};
 window.uiTest={calls:[],fail:false,saved:null,listeners:[]};
 const pause=()=>new Promise(r=>setTimeout(r,300));
 window.CPC1Backend={permissions:{can_enter:localStorage.getItem('test-readonly')!=='1'},onSessionChange:cb=>{uiTest.listeners.push(cb);return {};},getSession:async()=>({user:{id:localStorage.getItem('test-actor')||'synthetic-ui'}}),getConfig:async()=>source.settings,getGasConfig:async s=>source.gas_settings.find(x=>x.system===s).config,
 evaluate:async data=>{uiTest.calls.push({action:'evaluate',data});await pause();if(uiTest.fail)throw Error('Lỗi mạng mô phỏng');return uiTest.validation||{forms:{},overall:'incomplete'};},
 save:async (data,options={})=>{uiTest.calls.push({action:'save',data,options});if(uiTest.delaySave)await new Promise(r=>uiTest.saveRelease=r);await pause();if(uiTest.fail)throw Error('Lỗi mạng mô phỏng');uiTest.saved={id:options.recordId||'synthetic-only',version:(options.expectedVersion||0)+1,system:data.system||'steam',title:'Dữ liệu giả kiểm giao diện',data};return uiTest.saved;},
 list:async()=>{await pause();return uiTest.saved?[uiTest.saved]:[];},load:async()=>uiTest.saved,
 report:async(form,data)=>{uiTest.calls.push({action:'report',form,data});if(uiTest.delayReport)await new Promise(r=>uiTest.reportRelease=r);return new Blob(['%PDF-1.4\\n%%EOF'],{type:'application/pdf'});},signIn:async()=>{},signOut:async()=>{},openLogin:()=>{}};`});
 try {const file=root+'/public'+u.pathname;const ext=file.split('.').pop();return r.fulfill({body:await readFile(file),contentType:({html:'text/html',js:'text/javascript',css:'text/css',woff2:'font/woff2',svg:'image/svg+xml',png:'image/png'})[ext]||'application/octet-stream'});}catch{return r.fulfill({status:404});}
});
async function axe(label){await page.waitForFunction(()=>!document.getAnimations().some(a=>a instanceof CSSTransition&&a.playState==='running')); await page.addScriptTag({path:root+'/node_modules/axe-core/axe.min.js'});const v=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));axes.push({label,violations:v});}
try{
 await page.goto(base+'/tham-dinh-thuc-te/index.html');await page.locator('.form-result').nth(17).waitFor();
 assert.ok(await page.locator('img.company-logo').count(),'Original company logo present');await page.waitForFunction(()=>document.querySelector('img.company-logo').naturalWidth>0);
 assert.ok(await page.getByText('Hệ giám sát thẩm định',{exact:true}).isVisible());
 const systemBounds=await page.locator('.system-links a').evaluateAll(xs=>xs.slice(0,2).map(x=>x.getBoundingClientRect().toJSON()));assert.ok(Math.abs(systemBounds[0].x-systemBounds[1].x)<3&&systemBounds[1].y>systemBounds[0].y,'Desktop systems vertical');
 for(const width of [360,390,768,1024,1280,1440,1920]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'home overflow '+width);}
 await page.setViewportSize({width:1440,height:1000});await axe('catalogue');await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await axe('catalogue-dark');await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+'/catalogue-desktop.png',fullPage:true,animations:'disabled'});
 await page.locator('#form-search').fill('zzzzzz');await page.locator('#empty-results:visible').waitFor();await page.locator('#form-search').fill('do kho');assert.equal(await page.locator('.form-result').count(),1);await page.locator('#form-search').fill('');
 for(const [system,count] of [['steam',5],['air',6],['nitrogen',7],['all',18]]){await page.locator(`[data-system-filter="${system}"]`).click();assert.equal(await page.locator('.form-result').count(),count);}
 await page.locator('#form-search').fill('khí nén dầu');assert.equal(await page.locator('.form-result').count(),1);await page.locator('#form-search').fill('');
 await page.evaluate(()=>{localStorage.setItem('vmp-theme','dark');dispatchEvent(new StorageEvent('storage',{key:'vmp-theme'}));});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 await page.evaluate(()=>{localStorage.removeItem('vmp-theme');dispatchEvent(new StorageEvent('storage',{key:'vmp-theme'}));});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 await page.setViewportSize({width:390,height:900});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+'/catalogue-mobile.png',fullPage:true,animations:'disabled'});
 for(const [system,file,count] of [['steam','hoi-tinh-khiet',5],['air','khi-nen',6],['nitrogen','nito',7]]){
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/tham-dinh-thuc-te/'+(system==='steam'?'steam.html':'gas.html?system='+system));
  await page.waitForFunction(()=>!document.querySelector('#evaluate').disabled);
  await page.locator('#draft-file').setInputFiles(resolve(fixtures,system+'.json'));await page.waitForFunction(()=>[...document.querySelectorAll('#form-body input')].some(x=>x.value));
  const nav=system==='steam'?'#form-nav button':'#form-tabs button';
  const navBounds=await page.locator(nav).evaluateAll(xs=>xs.slice(0,2).map(x=>x.getBoundingClientRect().toJSON()));assert.ok(Math.abs(navBounds[0].x-navBounds[1].x)<3 && navBounds[1].y>navBounds[0].y,'Desktop BM navigation is vertical');
  await page.locator(nav).first().focus();await page.keyboard.press('ArrowDown');await page.waitForFunction(sel=>document.querySelectorAll(sel)[1]===document.activeElement,nav);await page.keyboard.press('ArrowUp');await page.waitForFunction(sel=>document.querySelector(sel)===document.activeElement,nav);
  await page.setViewportSize({width:1440,height:720});await page.locator(nav).first().focus();await page.keyboard.press('End');await page.waitForFunction(sel=>document.querySelector(sel+':last-child')===document.activeElement,nav);assert.ok(await page.locator(nav).last().evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'Last desktop form visible in short viewport');await page.setViewportSize({width:1440,height:1000});
  await page.locator(nav).nth(2).focus();await page.keyboard.press('Enter');await page.waitForFunction(sel=>document.querySelectorAll(sel)[2]===document.activeElement,nav);
  for(let i=0;i<count;i++){
   await page.setViewportSize({width:1440,height:1000});await page.locator(nav).nth(i).click();
   const filled=await page.locator('#form-body input,#form-body textarea').evaluateAll(xs=>xs.filter(x=>x.value).length);assert.ok(filled>0,system+' '+i+' filled');
   assert.ok((await page.locator(nav).nth(i).innerText()).length>6,'descriptive nav');
   for(const width of [360,390,768,1024,1280,1440,1920]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,system+' '+i+' overflow '+width);checks.push({system,form:i+1,width,filled});}
  }
  await page.setViewportSize({width:1440,height:1000});await page.locator(nav).nth(2).click();
  if(system==='steam'){const boxes=await page.locator('.trial-group').evaluateAll(xs=>xs.map(x=>({x:x.getBoundingClientRect().x,y:x.getBoundingClientRect().y})));assert.ok(boxes[1].x>boxes[0].x&&Math.abs(boxes[1].y-boxes[0].y)<3,'Wide-screen trials align side by side');}
  const metadata=page.locator('.metadata-section').first();await metadata.locator('summary').click();const metadataValue=await metadata.locator('input').first().inputValue();
  await page.locator('#evaluate').click();await page.locator('#evaluate[aria-busy=true]').waitFor();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Máy chủ đã trả kết quả'));
  await page.waitForFunction(()=>document.querySelector('.metadata-section').open);assert.equal(await metadata.locator('input').first().inputValue(),metadataValue);await metadata.locator('summary').click();
  await axe(system);await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await axe(system+'-dark');await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+'/'+system+'-dark.png',fullPage:true,animations:'disabled'});await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+'/'+system+'-desktop.png',fullPage:true,animations:'disabled'});
  const validationPoint=system==='steam'?source.settings.locations[0].id:source.gas_settings.find(x=>x.system===system).config.forms.find(x=>x.id==='bm03').locations[0].id;
  const validationField=system==='steam'?'me':'flow';
  const invalidRow={status:'invalid',errors:{[validationField]:'Số đo chưa hợp lệ — dữ liệu giả kiểm giao diện'}};
  await page.evaluate(result=>uiTest.validation=result,{forms:{bm03:{status:'invalid',rows:{[validationPoint]:system==='steam'?[invalidRow]:invalidRow}}}});
  await page.locator('#evaluate').click();await page.locator('#error-summary:visible').waitFor();assert.ok(await page.locator('[aria-invalid=true]').count()>0);assert.ok(await page.locator('#error-summary').evaluate(e=>e===document.activeElement));
  await page.locator('#error-summary a').first().click();assert.ok(await page.locator('[aria-invalid=true]').first().evaluate(e=>e===document.activeElement));
  await page.evaluate(()=>uiTest.validation=null);
  const inp=page.locator('#form-body input:not([readonly])').first();const before=await inp.inputValue();await page.evaluate(()=>uiTest.fail=true);await page.locator('#evaluate').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Lỗi mạng mô phỏng'));assert.equal(await inp.inputValue(),before,'error retains input');await page.evaluate(()=>uiTest.fail=false);
  await page.locator('.file-actions summary').click();await page.keyboard.press('Escape');assert.equal(await page.locator('.file-actions').getAttribute('open'),null);assert.ok(await page.locator('.file-actions summary').evaluate(e=>e===document.activeElement));
  await page.locator('.file-actions summary').click();await page.locator('#record-load').click();await page.locator('#records-list').getByText(/Chưa có hồ sơ/).waitFor();await page.keyboard.press('Escape');assert.ok(await page.locator('.file-actions summary').evaluate(e=>e===document.activeElement),'Record dialog restores focus to visible disclosure');
  await page.locator('#record-save').click();await page.waitForFunction(()=>document.querySelector('#record-state').textContent.includes('synthetic-only'));
  await page.locator('.file-actions summary').click();await page.locator('#record-load').click();await page.locator('#records-list button').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Đã mở hồ sơ'));assert.equal(await inp.inputValue(),before,'reload retains data');assert.equal(await page.locator('#error-summary').isVisible(),false,'Loaded record must not retain previous validation errors');
  await page.locator('#print').click();await page.locator('#print-review-generate').click();await page.locator('#print-review-download[href^="blob:"]').waitFor();assert.ok(await page.evaluate(()=>uiTest.calls.some(c=>c.action==='report')));
  await axe(system+'-print-desktop');
  if(system==='air')await page.screenshot({path:out+'/print-desktop.png',animations:'disabled'});
  await page.setViewportSize({width:360,height:800});
  assert.ok(await page.locator('#print-review').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),'Print dialog fits mobile');
  await axe(system+'-print-mobile');
  if(system==='air')await page.screenshot({path:out+'/print-mobile.png',animations:'disabled'});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#print-review').isVisible(),false);assert.equal(await page.locator('#print').evaluate(el=>document.activeElement===el),true,'Print dialog returns focus');
  await page.setViewportSize({width:1440,height:1000});
  if(system==='steam'){await page.locator(nav).nth(3).click();assert.equal(await page.locator('input.readonly').count(),3);assert.ok(await page.locator('input.readonly').first().inputValue());}
  await page.locator(nav).nth(2).click();await page.setViewportSize({width:390,height:900});
  const mobileBounds=await page.locator(nav).evaluateAll(xs=>xs.slice(0,2).map(x=>x.getBoundingClientRect().toJSON()));assert.ok(Math.abs(mobileBounds[0].y-mobileBounds[1].y)<3&&mobileBounds[1].x>mobileBounds[0].x,'Mobile BM navigation horizontal');
  assert.ok(await page.locator('img.company-logo').evaluate(i=>i.naturalWidth>0),'Workspace company logo loaded');
  await page.locator(nav).nth(0).focus();await page.keyboard.press('End');await page.waitForFunction(sel=>document.querySelector(sel+':last-child')===document.activeElement,nav);
  assert.ok(await page.locator(nav).last().evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),'Active last form visible after keyboard navigation');
  await page.keyboard.press('Home');await page.waitForFunction(sel=>document.querySelector(sel)===document.activeElement,nav);
  await page.keyboard.press('ArrowRight');await page.waitForFunction(sel=>document.querySelectorAll(sel)[1]===document.activeElement,nav);
  await page.locator(nav).nth(2).click();
  await page.locator('.workspace-navigation summary').click();
  await page.locator(system==='steam'?'#location-list button':'#point-list button').first().click();
  await page.waitForFunction(()=>!document.querySelector('.workspace-navigation').open&&document.querySelector('#form-title')===document.activeElement);
  await page.waitForFunction(()=>{const b=document.querySelector('.form-navigation [aria-current="page"]');const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;});
  await page.locator('.session-info summary').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Open account menu overflow');await page.keyboard.press('Escape');
  for(const summary of await page.locator('.metadata-section > summary').all())await summary.click();
  await axe(system+'-expanded-mobile');
  for(const width of [360,390,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Expanded metadata overflow');}
  for(const summary of await page.locator('.metadata-section > summary').all())await summary.click();await page.setViewportSize({width:390,height:900});
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+'/'+system+'-mobile.png',fullPage:true,animations:'disabled'});
  await page.locator('.workspace-navigation summary').click();await page.locator(system==='steam'?'#location-search':'#point-search').fill('zzzzz');await page.getByText('Không tìm thấy điểm. Thử mã hoặc tên khác.').waitFor();
 }
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#evaluate').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 if(process.env.CPC1_RECOVERY_CHECK==='1'){const {checkRecovery}=await import('./check-recovery-flows.mjs');await checkRecovery(page,base,fixtures);}
 assert.deepEqual(errors,[]);assert.ok(axes.every(x=>!x.violations.length),'Accessibility violations');
 await writeFile(out+'/browser-results.json',JSON.stringify({backend:'MOCKED; synthetic data; no network or production writes',checks,axes,errors},null,2));console.log(JSON.stringify({checks:checks.length,violations:axes.map(x=>[x.label,x.violations.map(v=>v.id)]),errors}));
}finally{await writeFile(out+'/axe-partial.json',JSON.stringify(axes,null,2));await browser.close();}

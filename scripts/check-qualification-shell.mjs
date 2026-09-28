// Filled, isolated shared-shell acceptance. All remote requests are mocked or blocked.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {CHROME,CHROME_GL_ARGS} from '../tests/e2e/chrome-path.mjs';
import {dungKhoDuLieu,traLoi,phienGia,layRef} from '../tests/e2e/gia-lap-supabase.mjs';
const require=createRequire(import.meta.url),puppeteer=require('puppeteer-core');
const fixtures=process.env.CPC1_UI_FIXTURES,out=process.env.CPC1_UI_OUTPUT;
if(!fixtures||!out)throw Error('Provide private CPC1_UI_FIXTURES and CPC1_UI_OUTPUT directories');
const source=JSON.parse(await readFile(fixtures+'/config.json','utf8'));
const settings=(await readFile('.env.local','utf8')).match(/^VITE_SUPABASE_URL=(.+)$/m)[1].trim();
const host=new URL(settings).host,base='http://127.0.0.1:8882/';
const mock=`document.body.dataset.qualificationGate='ready';const source=${JSON.stringify(source)};window.uiTest={saved:null,calls:[]};
window.CPC1Backend={permissions:{can_enter:true},onSessionChange:()=>{},getSession:async()=>({user:{id:'synthetic-ui'}}),getConfig:async()=>source.settings,getGasConfig:async s=>source.gas_settings.find(x=>x.system===s).config,
evaluate:async data=>({forms:{},overall:'incomplete'}),save:async(data,options={})=>{uiTest.saved={id:'synthetic-only',version:1,system:data.system||'steam',data};return uiTest.saved;},list:async()=>uiTest.saved?[uiTest.saved]:[],load:async()=>uiTest.saved,
report:async()=>{uiTest.calls.push('report');return new Blob(['%PDF-1.4\\n%%EOF'],{type:'application/pdf'});},listRuns:async()=>[],listHistory:async()=>[],signIn:async()=>{},signOut:async()=>{},openLogin:()=>CPC1Embedded.goHome()};`;
const browser=await puppeteer.launch({executablePath:CHROME,headless:true,args:['--no-sandbox',...CHROME_GL_ARGS]});
const page=await browser.newPage(),errors=[],checks=[],kho=dungKhoDuLieu('day');
page.on('pageerror',e=>errors.push(e.message));let accept=false,dialogs=0;
page.on('dialog',async d=>{dialogs++;if(accept)await d.accept();else await d.dismiss();});
page.setDefaultTimeout(10000);await page.setRequestInterception(true);
let blockFrame=false;
page.on('request',r=>{const u=new URL(r.url());if(u.host===host)return void r.respond(traLoi(kho,u,r));if(u.origin===new URL(base).origin){if(u.pathname.endsWith('/cloud.js'))return void r.respond({contentType:'text/javascript',body:mock});if(blockFrame&&u.pathname.endsWith('/runs.html'))return void r.abort();return void r.continue();}if(['blob:','data:'].includes(u.protocol))return void r.continue();void r.abort();});
await page.evaluateOnNewDocument((origin,key,session)=>{if(location.origin!==origin)return;localStorage.setItem(key,JSON.stringify(session));localStorage.setItem('vmp-theme','light');},new URL(base).origin,'sb-'+layRef(settings)+'-auth-token',phienGia());
const waitFrame=async file=>{await page.waitForFunction(file=>{const f=document.querySelector('#vmp-qualification-frame');return f?.src.includes(file)&&f.style.visibility==='visible'&&f.contentDocument?.readyState==='complete';},{timeout:10000},file);return (await page.$('#vmp-qualification-frame')).contentFrame();};
const nav=target=>'.vmp-sidebar a[href="?qualification='+encodeURIComponent(target)+'"]';
try {
 await page.setViewport({width:1440,height:1000});await page.goto(base+'#v=today');await page.waitForSelector(nav('index.html'));
 assert.equal(await page.$eval('.vmp-sidebar nav',n=>n.lastElementChild.dataset.navGroup),'qualification');
 await page.click(nav('index.html'));let f=await waitFrame('index.html');await f.waitForSelector('.form-result');
 assert.ok(page.url().includes('?qualification=index.html'));
 assert.equal(await f.$eval('.site-header',n=>getComputedStyle(n).display),'none');
 await f.click('.saved-records summary');await f.click('a[href="./steam.html?view=records"]');f=await waitFrame('steam.html');await f.waitForSelector('#records-dialog[open]');await page.evaluate(()=>history.back());f=await waitFrame('index.html');
 // In-module link must navigate the parent route, keeping VMP sidebar.
 await f.click('.form-result[href*="gas.html?system=air"]');f=await waitFrame('gas.html');await f.waitForSelector('#draft-file');
 await (await f.$('#draft-file')).uploadFile(fixtures+'/air.json');await f.waitForFunction(()=>[...document.querySelectorAll('#form-body input')].some(n=>n.value));
 const dirty=await f.evaluate(()=>CPC1Embedded.isDirty());assert.equal(dirty,true);
 const before=await f.$eval('#form-body input',n=>n.value);const beforeUrl=page.url();
 // Spoofed source, origin and external URL are rejected.
 await page.evaluate(()=>window.postMessage({channel:'vmp-qualification',type:'navigate',target:'runs.html'},location.origin));
 await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.test',source:document.querySelector('iframe').contentWindow,data:{channel:'vmp-qualification',type:'home'}})));
 await f.evaluate(()=>parent.postMessage({channel:'vmp-qualification',type:'navigate',target:'https://evil.test/'},location.origin));
 assert.equal(page.url(),beforeUrl);
 await page.click(nav('steam.html'));assert.equal(page.url(),beforeUrl);assert.equal(await f.$eval('#form-body input',n=>n.value),before);assert.equal(dialogs,1);
 // Form / generated PDF review remains inside the visible workspace.
 await f.click('#print');await f.waitForSelector('#print-review[open]');
 const box=await f.$eval('#print-review',n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight};});assert.ok(box.top>=0&&box.bottom<=box.height,'Print dialog fits frame');
 await f.click('#print-review-save');await f.waitForFunction(()=>!document.querySelector('#print-review-generate').disabled);await f.click('#print-review-generate');await f.waitForSelector('#print-review-download[href^="blob:"]');await page.keyboard.press('Escape');await (await f.$('#draft-file')).uploadFile(fixtures+'/air.json');await f.waitForFunction(()=>CPC1Embedded.isDirty());
 for(const width of [360,390,768,1024,1280,1440,1920]){await page.setViewport({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'parent overflow '+width);assert.equal(await f.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'frame overflow '+width);assert.ok(await page.$eval('#vmp-qualification-frame',n=>n.clientHeight>500),'frame fills viewport '+width);checks.push(width);}
 await page.setViewport({width:1440,height:1000});await page.screenshot({path:out+'/shared-filled-desktop.png'});
 // Browser Back cancellation preserves DOM and URL.
 await page.evaluate(()=>history.back());await page.waitForFunction(url=>location.href===url,{},beforeUrl);assert.equal(page.url(),beforeUrl);assert.equal(await f.$eval('#form-body input',n=>n.value),before);
 accept=true;await page.click(nav('steam.html'));f=await waitFrame('steam.html');assert.equal(dialogs,3,'one warning per dirty departure');
 await page.reload();f=await waitFrame('steam.html');await f.waitForSelector('#draft-file');
 await page.click(nav('gas.html?system=nitrogen'));f=await waitFrame('gas.html');await f.waitForSelector('#draft-file');
 await page.evaluate(()=>history.back());f=await waitFrame('steam.html');await f.waitForSelector('#draft-file');await (await f.$('#draft-file')).uploadFile(fixtures+'/steam.json');await f.waitForFunction(()=>CPC1Embedded.isDirty());const steamUrl=page.url();accept=false;await page.evaluate(()=>history.forward());await page.waitForFunction(u=>location.href===u,{},steamUrl);assert.equal(await f.evaluate(()=>CPC1Embedded.isDirty()),true);accept=true;await page.evaluate(()=>history.forward());await waitFrame('gas.html');
 // Fill second system and verify narrow-screen navigation.
 f=await waitFrame('gas.html');await (await f.$('#draft-file')).uploadFile(fixtures+'/nitrogen.json');await f.waitForFunction(()=>[...document.querySelectorAll('#form-body input')].some(n=>n.value));
 await page.setViewport({width:390,height:844});await page.screenshot({path:out+'/shared-filled-mobile.png'});await page.click('[aria-label="Mở menu"]');
 assert.equal(await page.$eval('#vmp-mobile-drawer nav',n=>n.lastElementChild.dataset.navGroup),'qualification');
 await page.click('#vmp-mobile-drawer a[href="?qualification=runs.html"]');f=await waitFrame('runs.html');await f.waitForSelector('#run-title');
 await f.type('#run-title','Đợt kiểm thử giao diện — dữ liệu giả');assert.equal(await f.evaluate(()=>CPC1Embedded.isDirty()),true);
 accept=false;await page.click('[aria-label="Mở menu"]');await page.click('#vmp-mobile-drawer [data-view="today"]');assert.ok(page.url().includes('runs.html'));assert.equal(await f.$eval('#run-title',n=>n.value),'Đợt kiểm thử giao diện — dữ liệu giả');
 accept=true;await page.setViewport({width:1440,height:1000});await page.click('.vmp-sidebar [data-view="overview"]');await page.waitForFunction(()=>!document.querySelector('#vmp-qualification-frame'));assert.equal(new URL(page.url()).searchParams.has('qualification'),false);
 await page.waitForFunction(()=>document.querySelector('main')?.dataset.vmpView==='overview');await page.evaluate(()=>history.back());await waitFrame('runs.html');await page.evaluate(()=>history.forward());await page.waitForFunction(()=>!document.querySelector('#vmp-qualification-frame')&&document.querySelector('main')?.dataset.vmpView==='overview');
 // Failure offers a recoverable action; no blank unbounded loader.
 blockFrame=true;await page.click(nav('runs.html'));await page.waitForFunction(()=>document.querySelector('[aria-label="Nội dung thẩm định thực tế"] [role="alert"]'),{timeout:24000});blockFrame=false;await page.click('[aria-label="Nội dung thẩm định thực tế"] button');await waitFrame('runs.html');
 // Shared logout must clear opt-in drafts before the iframe is removed.
 await page.click(nav('gas.html?system=air'));f=await waitFrame('gas.html');await f.waitForSelector('#draft-file');await (await f.$('#draft-file')).uploadFile(fixtures+'/air.json');await f.waitForFunction(()=>CPC1Embedded.isDirty());await f.click('#local-draft-enable');await f.waitForFunction(()=>document.querySelector('#local-draft-status').textContent.includes('Đã lưu tạm'));
 const scope=await f.evaluate(()=>JSON.stringify([CPC1_SETTINGS.url,'synthetic-ui']));await page.addScriptTag({url:base+'tham-dinh-thuc-te/draft-store.js'});assert.ok(await page.evaluate(async scope=>(await CPC1DraftStore.read(scope,'air'))?.payload,scope));
 accept=false;await page.evaluate(()=>[...document.querySelectorAll('.vmp-sidebar button')].find(n=>n.textContent.trim()==='Thoát').click());assert.ok(await page.$('#vmp-qualification-frame'));
 accept=true;await page.evaluate(()=>[...document.querySelectorAll('.vmp-sidebar button')].find(n=>n.textContent.trim()==='Thoát').click());await page.waitForFunction(()=>!document.querySelector('.vmp-sidebar'));assert.equal(await page.evaluate(async scope=>(await CPC1DraftStore.read(scope,'air'))?.payload??null,scope),null);
 // Unexpected local cleanup failure must not trap the account in a signed-in state.
 await page.goto(base+'?qualification=gas.html%3Fsystem%3Dair');f=await waitFrame('gas.html');await f.waitForSelector('#draft-file');await f.evaluate(()=>{window.CPC1Embedded={...CPC1Embedded,endSession:()=>Promise.reject(new Error('Synthetic cleanup failure'))};});await page.evaluate(()=>[...document.querySelectorAll('.vmp-sidebar button')].find(n=>n.textContent.trim()==='Thoát').click());await page.waitForFunction(()=>!document.querySelector('.vmp-sidebar'));
 assert.deepEqual(errors,[]);
 await writeFile(out+'/browser-receipt.json',JSON.stringify({checks,filled:true,sharedShell:true,dirtyCancel:true,backForward:true,printPreview:true,spoofRejected:true,errorRetry:true,logoutDraftCleanup:true,dialogs,errors},null,2));console.log('PASS shared shell: filled forms, 7 widths, dirty guards, history, print, mobile, origin/source, retry');
} catch(error){console.error('State',JSON.stringify({url:page.url(),errors,dialogs,frames:page.frames().map(f=>f.url())}));throw error;} finally {await browser.close();}

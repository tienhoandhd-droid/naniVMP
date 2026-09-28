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
try {
 for(const [system,file,count] of [['steam','steam.html',5],['air','gas.html?system=air',6],['nitrogen','gas.html?system=nitrogen',7]]){
  await page.goto(base+'/tham-dinh-thuc-te/'+file);
  await page.waitForFunction(()=>!document.querySelector('#evaluate').disabled);
  await page.locator('#draft-file').setInputFiles(resolve(fixtures,system+'.json'));
  await page.waitForFunction(()=>[...document.querySelectorAll('#form-body input')].some(x=>x.value));
  const nav=system==='steam'?'#form-nav button':'#form-tabs button';
  const search=page.locator(system==='steam'?'#location-search':'#point-search');
  const list=page.locator(system==='steam'?'#location-list':'#point-list');
  await page.locator(nav).first().click();
  await page.locator('.workspace-navigation').evaluate(e=>e.open=true);
  const chosen=await page.locator('.selected-point').innerText();
  await search.fill('not-a-real-point');
  assert.equal(await page.locator('.selected-point').innerText(),chosen,'Search must not erase selected point label');
  await search.fill('');
  await list.locator('button').nth(1).click();
  await page.waitForFunction(()=>!document.querySelector('.workspace-navigation').open);
  assert.notEqual(await page.locator('.selected-point').innerText(),chosen);
  for(let i=0;i<count;i++){
   await page.locator(nav).nth(i).click();
   await page.locator('.workspace-navigation').evaluate(e=>e.open=true);
   const names=await list.locator('button').allTextContents();
   for(const n of names){assert.doesNotMatch(n,/ · [·]|— · |[A-Z]\d+\.[A-Z]\d+[À-ỹ]/);}
   if(system!=='steam'&&i>=count-2)assert.equal(await page.locator('.selected-point').innerText(),'Biểu mẫu không có điểm lấy mẫu');
  }
  await page.locator(nav).first().click();
  await page.locator('.workspace-navigation').evaluate(e=>e.open=true);
  for(const width of [360,1440]){
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No overflow');
   assert.equal(await list.evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'Point names wrap inside list');
   await axe(system+'-points-'+width);
   await page.screenshot({path:out+'/'+system+'-points-'+width+'.png',fullPage:true,animations:'disabled'});
  }
 }
 assert.deepEqual(errors,[]);assert.ok(axes.every(x=>!x.violations.length));
 await writeFile(out+'/point-results.json',JSON.stringify({axes,errors},null,2));
 console.log('PASS: all 18 forms, search retains selection, no-point labels, 3 systems at 360/1440, six axe views.');
}finally{await browser.close();}

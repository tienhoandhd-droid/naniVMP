// Headless acceptance for runs.html. Uses private synthetic fixtures only; never contacts Supabase.
import {chromium} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const fixtures=process.env.CPC1_UI_FIXTURES;
const out=process.env.CPC1_UI_OUTPUT;
if(!fixtures||!out)throw Error('Set CPC1_UI_FIXTURES and CPC1_UI_OUTPUT to private directories.');
await mkdir(out,{recursive:true});
const config=JSON.parse(await readFile(resolve(fixtures,'config.json'),'utf8'));
const steamDraft=JSON.parse(await readFile(resolve(fixtures,'steam.json'),'utf8'));
const airDraft=JSON.parse(await readFile(resolve(fixtures,'air.json'),'utf8'));
const base='http://qualification.test', widths=[360,390,768,1024,1280,1440,1920];
const syntheticHistory=[
  {id:'h-aug',run_id:'run-seed',record_id:'record-steam',version:1,system:'steam',period:'2026-08-01',comparison:[],issues:['Dữ liệu giả kiểm giao diện'],sources:[{source_id:'synthetic-aug',object_path:'synthetic/aug.pdf',title:'PDF giả tháng 8'}],trend:[{form:'bm03',point_id:'S1',trial:1,metric:'result',label:'Độ khô',unit:'D',value:95,source_value:'95',computed_status:'pass',uncertain:false}]},
  {id:'h-sep-air',run_id:'run-air',record_id:'record-air',version:1,system:'air',period:'2026-09-01',comparison:[],issues:[],sources:[],trend:[{form:'bm01',point_id:'A1',trial:null,metric:'p05',label:'Tiểu phân',unit:'hạt/m³',value:11,source_value:'11',computed_status:'pass',uncertain:false}]},
  {id:'h-oct',run_id:'run-seed',record_id:'record-steam',version:2,system:'steam',period:'2026-10-01',comparison:[],issues:[],sources:[{source_id:'synthetic-oct',object_path:'synthetic/oct.pdf',title:'PDF giả tháng 10'}],trend:[{form:'bm03',point_id:'S1',trial:1,metric:'result',label:'Độ khô',unit:'D',value:97,source_value:'97',computed_status:'pass',uncertain:false},{form:'bm03',point_id:'S1',trial:2,metric:'result',label:'Độ khô',unit:'D',value:96,source_value:'96',computed_status:'pass',uncertain:false},{form:'bm03',point_id:'S1',trial:1,metric:'result',label:'Độ khô',unit:'D',value:null,source_value:'',computed_status:'incomplete',uncertain:false},{form:'bm03',point_id:'S1',trial:1,metric:'result',label:'Độ khô',unit:'D',value:98,source_value:'98',computed_status:'pass',uncertain:true}]}
];
// Multiple points in the same system/type must be visible together by default.
for (const h of syntheticHistory.filter(h=>h.system==='steam')) h.trend.push({form:'bm03',point_id:'S2',trial:1,metric:'result',label:'Độ khô',unit:'D',value:h.id==='h-aug'?91:92,source_value:h.id==='h-aug'?'91':'92',computed_status:'pass',uncertain:false});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
page.setDefaultTimeout(10000);const errors=[], axes=[], checks=[];page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==base)throw Error('Unexpected network '+url.origin);
  if(url.pathname.endsWith('runtime-config.js'))return route.fulfill({body:'',contentType:'text/javascript'});
  if(url.pathname.endsWith('cloud.js'))return route.fulfill({contentType:'text/javascript',body:`
document.body.dataset.qualificationGate='ready';
if(!crypto.randomUUID)crypto.randomUUID=()=>('synthetic-'+Math.random().toString(36).slice(2));
const cfg=${JSON.stringify(config)}, history=${JSON.stringify(syntheticHistory)};
const steamDraft=${JSON.stringify(steamDraft)}, airDraft=${JSON.stringify(airDraft)};
const query=new URLSearchParams(location.search), runQuery=query.get('run'), recordQuery=query.get('record'), entrySystem=query.get('system')||'steam', runStatus=query.get('closed')==='1'?'closed':'open';
const scopeFor=x=>entrySystem==='steam'?{bm03:['E1.R2-P1']}:{bm03:[x.forms.find(f=>f.id==='bm03').locations[0].id]};
const scoped=function(x){if(!runQuery)return x;const scope=scopeFor(x);let forms=x.forms;if(entrySystem!=='steam'){const form=x.forms.find(f=>f.id==='bm03');forms=[Object.assign({},form,{locations:form.locations.filter(p=>scope.bm03.includes(p.id))})];}return Object.assign({},x,{locations:entrySystem==='steam'?x.locations.filter(p=>scope.bm03.includes(p.id)):x.locations,forms,_scope:scope,_run:{id:runQuery,title:'Đợt phạm vi giả '+runQuery,status:runStatus,items:[{system:entrySystem,record_id:recordQuery,scope:scope,version:1}]}});};
const loaded=()=>{if(entrySystem==='steam'){const point='E1.R2-P1',d=steamDraft.data;return {meta:d.meta,equipment:d.equipment,bm01:{},bm02:{},bm03:{[point]:d.bm03[point]},bm04:{}};}const point=cfg.gas_settings.find(x=>x.system===entrySystem).config.forms.find(f=>f.id==='bm03').locations[0].id,d=airDraft.data;return {system:entrySystem,meta:d.meta,equipment:{bm03:d.equipment?.bm03||{}},forms:{bm03:{[point]:d.forms.bm03?.[point]||{}}},controls:d.controls,trend:{}};};
window.uiRuns={calls:[],runs:[{id:'run-seed',title:'Đợt đã lưu có dữ liệu giả',mode:'single',started_on:'2026-08-01',status:'open',version:1,close_reason:null,items:[{system:'steam',record_id:'record-steam',scope:{bm03:['S1']},version:1}],progress:{complete:1,total:1,fail:0,invalid:0,controls_ready:true,ready:true}}],history,failCreate:false,readonly:localStorage.getItem('runs-readonly')==='1'};
const id=()=>String(uiRuns.runs.length+1).padStart(4,'0');
window.CPC1Backend={historySnapshot:async(id,version)=>{
 if(uiRuns.failSnapshot)throw Error('Lỗi tải tiêu chí mô phỏng');
 if(uiRuns.delaySnapshot)await new Promise(resolve=>setTimeout(resolve,500));
 const h=history.find(x=>x.record_id===id&&x.version===version);
 if(h.system==='air')return {id,version,data:{system:'air',forms:{bm01:{A1:{p05:'11'}}}},evaluation:{source_context:{config:{system:'air',forms:[{id:'bm01',locations:[{id:'A1',limits:{p05:10}}]}]}},forms:{bm01:{rows:{A1:{status:'fail',values:{p05:'11'}}}}}}};
 const rows={};for(const r of h.trend){if(r.value===null||r.uncertain)continue;(rows[r.point_id]||=[])[(r.trial||1)-1]={status:r.value<93?'fail':'pass',values:{result:String(r.value),raw_result:String(r.value)}};}
 return {id,version,data:{bm03:{}},evaluation:{source_context:{config:{},criteria:{dryness_min:93}},forms:{bm03:{rows}}}};
 },get permissions(){return {can_enter:!uiRuns.readonly};},getSession:async()=>({user:{id:'synthetic-qa'}}),getConfig:async()=>scoped(cfg.settings),getGasConfig:async s=>scoped(cfg.gas_settings.find(x=>x.system===s).config),load:async id=>({id,version:1,data:loaded(),evaluation:{forms:{},overall:'incomplete'}}),list:async()=>[],evaluate:async()=>({forms:{},overall:'incomplete'}),save:async(data,options={})=>{uiRuns.calls.push({action:'save',data,options});return {id:options.recordId||'synthetic-save',version:(options.expectedVersion||0)+1,data,evaluation:{forms:{},overall:'incomplete'}};},report:async()=>new Blob(['synthetic PDF'],{type:'application/pdf'}),signIn:async()=>{},signOut:async()=>{},openLogin:()=>{},listRuns:async()=>uiRuns.runs,listHistory:async()=>uiRuns.history,
createRun:async(definition,requestId)=>{uiRuns.calls.push({action:'create',definition,requestId});if(uiRuns.failCreate)throw Error('Lỗi mạng mô phỏng');const run={id:'run-'+id(),title:definition.title,mode:definition.mode,started_on:definition.started_on,status:'open',version:1,close_reason:null,items:definition.scope.map(s=>({system:s.system,record_id:'record-'+s.system+'-'+id(),scope:s.forms,version:1})),progress:{complete:0,total:definition.scope.reduce((n,s)=>n+Object.values(s.forms).flat().length,0),fail:0,invalid:0,controls_ready:true,ready:false}};uiRuns.runs.unshift(run);return run;},
transitionRun:async(id,version,status,reason,requestId)=>{uiRuns.calls.push({action:'transition',id,version,status,reason,requestId});const run=uiRuns.runs.find(r=>r.id===id);if(status==='closed'&&!reason)throw Error('Thiếu lý do');Object.assign(run,{status,close_reason:status==='closed'?reason:null,version:version+1});return run;},downloadHistorySource:async path=>{uiRuns.calls.push({action:'download',path});return new Blob(['synthetic PDF'],{type:'application/pdf'});},onSessionChange:()=>({})};`});
  try {const file=root+'/public'+url.pathname,ext=file.split('.').pop();return route.fulfill({body:await readFile(file),contentType:({html:'text/html',js:'text/javascript',css:'text/css',woff2:'font/woff2',svg:'image/svg+xml',png:'image/png'})[ext]||'application/octet-stream'});} catch {return route.fulfill({status:404});}
});
async function axe(label){await page.addScriptTag({path:root+'/node_modules/axe-core/axe.min.js'});const violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,impact:v.impact,target:v.nodes.map(n=>n.target)})));axes.push({label,violations});}
const noOverflow=async label=>{for(const width of widths){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${label} overflow ${width}`);checks.push({label,width});}};
try {
  await page.goto(base+'/tham-dinh-thuc-te/runs.html');
  try { await page.getByRole('heading',{name:'Đợt đã lưu có dữ liệu giả',exact:true}).waitFor(); } catch (error) { throw Error(`Initial runs load failed: ${await page.locator('body').innerText()} :: ${errors.join(' | ')}`); }
  assert.equal(await page.locator('#run-list a[href*="steam.html?run=run-seed"]').count(),1,'saved run links to scoped steam record');
  await noOverflow('runs');await page.setViewportSize({width:1440,height:1000});await axe('runs-desktop');await page.setViewportSize({width:390,height:900});await axe('runs-mobile');
  await page.setViewportSize({width:1440,height:1000});await page.locator('#run-title').fill('Đợt đầy đủ giả');await page.locator('#run-started').fill('2026-11-01');
  await page.locator('#create-run').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>uiRuns.calls.filter(x=>x.action==='create').length===1);
  const campaign=await page.evaluate(()=>uiRuns.calls.find(x=>x.action==='create'));assert.equal(campaign.definition.mode,'campaign');assert.equal(campaign.definition.scope.length,3);assert.ok(Object.keys(campaign.definition.scope.find(x=>x.system==='steam').forms).includes('bm04'));
  await page.locator('input[value="single"]').check();await page.locator('#single-system').selectOption('steam');
  const formCheckbox=page.locator('#scope-picker .scope-form').filter({hasText:'BM03'}).locator(':scope > label input');await formCheckbox.check();await page.locator('#scope-picker .scope-form').filter({hasText:'BM03'}).locator('.point-choices input').first().check();
  await page.locator('#run-title').fill('Đợt chọn riêng');await page.locator('#run-started').fill('2026-12-01');await page.evaluate(()=>uiRuns.failCreate=true);await page.locator('#create-run').evaluate(f=>f.requestSubmit());await page.getByText('Lỗi mạng mô phỏng').waitFor();
  assert.equal(await page.locator('#run-title').inputValue(),'Đợt chọn riêng','network failure retains title');assert.equal(await formCheckbox.isChecked(),true,'network failure retains chosen scope');
  const failedId=await page.evaluate(()=>uiRuns.calls.at(-1).requestId);await page.evaluate(()=>uiRuns.failCreate=false);await page.locator('#create-run').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>uiRuns.calls.filter(x=>x.action==='create').length===3);assert.equal(await page.evaluate(()=>uiRuns.calls.at(-1).requestId),failedId,'same payload retry keeps idempotency key');
  await page.locator('#run-title').fill('Đợt chọn riêng đã đổi');await page.locator('#create-run').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>uiRuns.calls.filter(x=>x.action==='create').length===4);assert.notEqual(await page.evaluate(()=>uiRuns.calls.at(-1).requestId),failedId,'changed payload has new idempotency key');
  await page.getByRole('heading',{name:'Đợt đã lưu có dữ liệu giả',exact:true}).locator('..').getByRole('button',{name:'Kết thúc có lý do'}).click();const reason=page.getByLabel('Lý do kết thúc đợt Đợt đã lưu có dữ liệu giả');await reason.fill('Dữ liệu giả đóng đợt để kiểm giao diện');await page.getByRole('button',{name:'Xác nhận kết thúc'}).click();await page.locator('.run-card .tag.closed').waitFor();assert.equal(await page.evaluate(()=>uiRuns.runs.find(r=>r.id==='run-seed').close_reason),'Dữ liệu giả đóng đợt để kiểm giao diện');
  await page.locator('#trend-tab').click();
  assert.equal(await page.locator('#trend-record').count(),1,'choose a saved execution record instead of monthly x axis');
  await page.locator('#trend-chart rect[data-point]').first().waitFor();
  assert.equal(await page.locator('#trend-chart text').filter({hasText:'S1'}).count(),1,'X is sampling location');
  assert.equal(await page.locator('#trend-chart text').filter({hasText:/^0$/}).count(),1,'positive bars start at a labelled zero baseline');
  assert.equal(await page.locator('#trend-chart text').filter({hasText:'2026-10'}).count(),0,'month is not X');
  assert.equal(await page.locator('#trend-point').inputValue(),'','all points default');
  assert.equal(await page.locator('#chart-legend input[type=checkbox]').count(),2);
  assert.equal(await page.locator('#limit-chart .action-outside').count(),1,'saved upper action limit detects S2');
  assert.match(await page.locator('#limit-summary').innerText(),/1 kết quả ngoài/);
  await page.locator('#chart-legend input[value="S2"]').uncheck();assert.equal(await page.locator('#trend-chart rect[data-point="S2"]').count(),0);
  assert.match(await page.locator('#trend-data tbody').innerText(),/S2/,'full data remains after hiding chart point');
  await page.locator('#chart-legend input[value="S1"]').uncheck();assert.equal(await page.locator('#trend-chart rect[data-point]').count(),0);
  await page.locator('#trend-show-all').click();assert.equal(await page.locator('#chart-legend input:checked').count(),2);
  await page.locator('#chart-legend input[value="S2"]').focus();assert.equal(await page.locator('#trend-chart .chart-muted[data-point="S1"]').count()>0,true);
  await page.keyboard.press('Space');assert.equal(await page.locator('#trend-chart rect[data-point="S2"]').count(),0);await page.keyboard.press('Space');
  await page.locator('#trend-point').selectOption('S2');assert.equal(await page.locator('#trend-chart rect[data-point="S1"]').count(),0);
  await page.locator('#trend-point').selectOption('');await page.locator('#trend-point').focus();
  await noOverflow('trend');await page.setViewportSize({width:1440,height:1000});await axe('trend-desktop');await page.screenshot({path:resolve(out,'locations-1440.png'),fullPage:true});await page.setViewportSize({width:390,height:900});await axe('trend-mobile');await page.screenshot({path:resolve(out,'locations-390.png'),fullPage:true});
  await page.evaluate(()=>uiRuns.failSnapshot=true);await page.locator('#trend-record').selectOption('record-steam:1');await page.getByText('Không tải được tiêu chí:',{exact:false}).waitFor();
  assert.equal(await page.locator('#limit-chart .action-limit').count(),0,'failed revision must not reuse previous bounds');assert.equal(await page.locator('#trend-chart rect[data-point]').count(),0);
  await page.evaluate(()=>uiRuns.failSnapshot=false);await page.locator('#limits-retry').click();await page.locator('#trend-chart rect[data-point]').first().waitFor();
  await page.evaluate(()=>uiRuns.delaySnapshot=true);await page.locator('#trend-system').selectOption('air');await page.locator('#trend-system').selectOption('steam');await page.waitForTimeout(600);
  assert.equal(await page.locator('#trend-system').inputValue(),'steam');assert.equal(await page.locator('#limit-chart [data-point="A1"]').count(),0,'slow previous response must not replace selected system');
  await page.locator('#trend-system').selectOption('air');await page.locator('#limit-chart .action-outside').first().waitFor();assert.match(await page.locator('#limit-exceptions').innerText(),/Vượt giới hạn trên/);
  await page.locator('#trend-system').selectOption('nitrogen');await page.getByText('Chưa có hồ sơ đã lưu cho hệ thống này.').waitFor();
  await page.goto(base+'/tham-dinh-thuc-te/steam.html?run=run-open&record=record-steam');await page.waitForFunction(()=>document.querySelector('#record-state')?.textContent.includes('record-steam'));assert.deepEqual(await page.locator('#form-nav button').allTextContents(),['BM03 — Độ khô','BM05 — Tổng hợp đánh giá'],'open Steam navigation is limited to BM03 and summary');assert.equal(await page.locator('#location-list button').count(),1,'open Steam has one in-scope point');assert.ok(await page.locator('#form-body input').evaluateAll(inputs=>inputs.some(input=>input.value)),'scoped Steam record autoloads only allowed filled values');assert.equal(await page.locator('#evaluate').isDisabled(),false,'open scoped run permits evaluation');const steamInput=page.locator('#form-body .trial-groups input:not([readonly])').first();await steamInput.fill('4');await page.locator('#record-save').click();await page.waitForFunction(()=>uiRuns.calls.some(c=>c.action==='save'));const saveCall=await page.evaluate(()=>uiRuns.calls.find(c=>c.action==='save'));assert.equal(saveCall.options.recordId,'record-steam','open save keeps bound record');assert.equal(saveCall.options.expectedVersion,1,'open save uses bound version');
  await page.goto(base+'/tham-dinh-thuc-te/steam.html?run=run-closed&record=record-steam&closed=1');await page.waitForFunction(()=>document.body.dataset.runClosed==='true');assert.equal(await page.locator('#form-nav button').count(),2,'closed Steam navigation remains scoped');assert.equal(await page.locator('#location-list button').count(),1,'closed Steam retains one scoped point');assert.equal(await page.locator('#evaluate').isDisabled(),true,'closed run disables evaluation');assert.equal(await page.locator('#record-save').isDisabled(),true,'closed run disables save');assert.equal(await page.locator('#print').isDisabled(),false,'closed run allows PDF reproduction');assert.ok(await page.locator('#form-body input').evaluateAll(inputs=>inputs.every(input=>input.readOnly)),'closed run fields are read-only');
  await page.goto(base+'/tham-dinh-thuc-te/gas.html?system=air&run=run-air&record=record-air');await page.waitForFunction(()=>document.querySelector('#record-state')?.textContent.includes('record-air'));assert.equal(await page.locator('#form-tabs button').count(),1,'scoped Air navigation is limited to BM03');assert.equal(await page.locator('#point-list button').count(),1,'scoped Air has one real point');assert.ok(await page.locator('#form-body input,#form-body textarea').evaluateAll(inputs=>inputs.some(input=>input.value)),'scoped Air record autoloads only allowed filled values');
  await page.goto(base+'/tham-dinh-thuc-te/runs.html');await page.getByRole('heading',{name:'Đợt đã lưu có dữ liệu giả',exact:true}).waitFor();
  await page.evaluate(()=>localStorage.setItem('runs-readonly','1'));await page.reload();await page.getByRole('heading',{name:'Đợt đã lưu có dữ liệu giả',exact:true}).waitFor();assert.equal(await page.locator('#create-run').isHidden(),true,'read-only QA can view history but cannot create');assert.equal(await page.getByRole('button',{name:'Kết thúc có lý do'}).count(),0,'read-only QA has no transition action');
  assert.deepEqual(errors,[],'page errors');assert.ok(axes.every(a=>a.violations.length===0),'axe violations');
  await writeFile(resolve(out,'runs-browser-results.json'),JSON.stringify({backend:'MOCKED; synthetic data; no production or external network writes',checks,axes,errors},null,2));
  console.log(`PASS ${checks.length} responsive checks; ${axes.length} axe scans.`);
} finally {await writeFile(resolve(out,'runs-axe-partial.json'),JSON.stringify(axes,null,2));await browser.close();}

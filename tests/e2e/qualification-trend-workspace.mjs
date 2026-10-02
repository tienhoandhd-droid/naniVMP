// Exercise the actual static workspace with saved-record fixtures and blocked external traffic.
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const root=new URL('../..',import.meta.url).pathname;
const publicRoot=process.env.CPC1_TREND_PUBLIC_ROOT||root+'/public';
const evidence=process.env.CPC1_TREND_EVIDENCE;
if(evidence)await mkdir(evidence,{recursive:true});
const configs=JSON.parse(await readFile(root+'/tests/fixtures/qualification-config.json','utf8'));
const fixture=`
const configs=${JSON.stringify(configs)};
const variant=new URLSearchParams(location.search).get('fixture');
const systems=['air','nitrogen','steam'],locations=Array.from({length:variant==='many-points'?17:3},(_,i)=>({id:'P'+(i+1),name:'Điểm lấy mẫu tại khu vực sản xuất '+(i+1)}));
const settings=system=>system==='steam'?{...configs.settings,locations}:{...configs.gas_settings.find(c=>c.system===system).config,system,forms:[{id:'bm02',title:'Điểm sương',kind:'measurement',locations:locations.map(p=>({...p,limits:{dewpoint:variant==='segmented-equal-bound'&&p.id==='P3'?-20:variant==='different'&&p.id==='P2'?-12:-10}}))},{id:'bm01',title:'Tiểu phân',kind:'measurement',locations:locations.map(p=>({...p,limits:{p05:100}}))}]};
const rows=(system,early=false)=>{
 const steam=system==='steam',form=steam?'bm03':'bm02',unit=steam?'D':'°C',label=steam?'Độ khô':'Điểm sương';
 let values=steam?[[.93,.94,.95,.96,.97,.98,.99,1.10],[.92,.93,.94,.95,.96,.97,.98,1.09],[.95]]:[[-22,-21,-20,-19,-18,-17,-16,-1],[-35,-34,-33,-32,-31,-30,-29,-18],[-20]];
 if(variant==='many-points')values=locations.map((p,i)=>Array.from({length:3},(_,j)=>steam?.95+i*.001+j*.002:-22-(i%4)*3+j*.5));
 if(variant==='duplicates')values[0]=Array(8).fill(steam?.95:-20);
 const out=values.flatMap((vals,i)=>vals.map((value,j)=>({form,metric:'result',unit,label,point_id:'P'+(i+1),trial:j+1,value:early?value+(steam?.001:-.01):value,source_value:String(value),computed_status:'pass'})));
 if(variant==='equal-bound'&&!steam){out.at(-1).value=-10;out.at(-1).source_value='-10';}
 out.push({...out.at(-1),trial:2,value:steam?.96:-21,uncertain:true},{...out.at(-1),trial:3,value:null,source_value:'Không đọc được'});
 for(const [metric,label,unit,vals] of steam?[['conductivity','Độ dẫn điện','µS/cm',[1,2,6]],['toc','TOC','ppb',[100,200,300]]]:[['p05','Tiểu phân ≥ 0,5 µm','hạt/m³',[10,50,150]]])vals.forEach((value,i)=>out.push({form:steam?'bm02':'bm01',metric,label,unit,point_id:'P'+(i+1),trial:1,value,source_value:String(value),computed_status:'pass'}));
 if(variant==='mixed-unit'&&!steam)out.push({...out[0],unit:'K',value:293,source_value:'293'});
 return out;
};
const runs=systems.flatMap(system=>[1,2,3].map(i=>({id:system+'-run-'+i,title:'Đợt '+i,status:i===3?'open':'closed',items:[],progress:{},mode:'single',started_on:'2026-03-01',version:1})));
const history=systems.flatMap(system=>[1,2,3].map(i=>({run_id:system+'-run-'+i,record_id:system+'-record-'+i,version:1,system,period:i===1?'2026-03-01':i===2?'2026-05-01':'2026-02-01',trend:rows(system,i===1),sources:[],issues:[]})));
const snapshots=Object.fromEntries(history.map(item=>{
 const steam=item.system==='steam',main=steam?'bm03':'bm02',forms={},raw={};
 for(const form of [...new Set(item.trend.map(r=>r.form))]){const measured={};raw[form]={};for(const p of locations){const pointRows=item.trend.filter(r=>r.form===form&&r.point_id===p.id);if(form===main)measured[p.id]=pointRows.map(r=>({status:r.uncertain||r.value===null?'invalid':'pass',values:{raw_result:String(r.value)}}));else{measured[p.id]={status:'pass',parameters:Object.fromEntries(pointRows.map(r=>[r.metric,'pass']))};raw[form][p.id]=Object.fromEntries(pointRows.map(r=>[r.metric,String(r.value)]));}}forms[form]={rows:measured};}
 if(variant==='raw-precision'&&!steam)forms[main].rows.P1[0].values.raw_result='-9.999';
 const data=steam?{system:'steam',bm02:raw.bm02}:{system:item.system,forms:raw};
 const source_context=variant==='unknown'?{}:steam?{criteria:{dryness_min:.94,conductivity_max:5,toc_max:500}}:{config:settings(item.system)};
 return [item.record_id,{data,evaluation:{formula_version:'fixture-1',source_context,forms}}];
}));
window.__trendFixture={snapshots,calls:0,fail:variant==='error'};
window.CPC1Backend={permissionsFor:system=>({can_view:!(variant==='restricted'&&system==='air'),can_view_current:!(variant==='restricted'&&system==='air'),can_enter:false}),getSession:async()=>({user:{id:'fixture-qa'}}),getConfig:async()=>settings('steam'),getGasConfig:async s=>settings(s),listRuns:async()=>structuredClone(runs),listHistory:async()=>variant==='empty'?[]:structuredClone(history),runRequirements:async()=>[],historySnapshot:async(id)=>{window.__trendFixture.calls++;if(variant==='pending'&&!window.__trendFixture.released)await new Promise(resolve=>window.__trendFixture.release=()=>{window.__trendFixture.released=true;resolve();});if(window.__trendFixture.fail)throw Error('Tiêu chí tạm thời chưa tải được');return structuredClone(snapshots[id]);},downloadHistorySource:async()=>new Blob()};
document.body.dataset.qualificationGate='ready';`;
new Function(fixture);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||chromium.executablePath()});
const context=await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true});
const errors=[],writes=[],external=[];
async function pageFor(system,extra=''){
 const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(req.method()!=='GET')writes.push(req.url());if(url.origin!=='http://qualification.test'){external.push(url.origin);return route.abort();}if(url.pathname.endsWith('/cloud.js'))return route.fulfill({contentType:'text/javascript',body:fixture});if(url.pathname.endsWith('/runtime-config.js'))return route.fulfill({contentType:'text/javascript',body:'window.CPC1_SETTINGS={};'});try{const ext=url.pathname.split('.').at(-1);return route.fulfill({body:await readFile(publicRoot+url.pathname),contentType:({html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',png:'image/png'})[ext]||'application/octet-stream'});}catch{return route.fulfill({status:404});}});
 await page.goto('http://qualification.test/tham-dinh-thuc-te/runs.html?view=trend&system='+system+extra);
 try{await page.locator('#runs-status').getByText('Đã tải dữ liệu đợt và xu hướng.').waitFor();}catch(error){console.log('fixture diagnostic',await page.locator('#runs-status').textContent(),errors);throw error;}
 return page;
}
try{
 for(const [system,title] of [['air','Khí nén'],['nitrogen','Khí nitơ'],['steam','Hơi tinh khiết']]){
  const page=await pageFor(system),outside=system==='steam'?'3':'1';
  await page.waitForFunction(expected=>document.querySelector('#summary-outside')?.textContent===expected,outside);
  assert.match(await page.locator('h1').textContent(),new RegExp('Xu hướng.*'+title));
  assert.match(await page.locator('#assessment-scope').textContent(),/2026-05.*Đợt 2.*v1/);
  await page.locator('#trend-record').selectOption(system+'-record-1:1');
  await page.waitForFunction(()=>document.querySelector('#limit-source').textContent.includes('fixture-1'));
  assert.match(await page.locator('#assessment-scope').textContent(),/2026-03.*Đợt 1.*v1/);
  assert.equal(await page.locator('[data-chart=individual] .individual-value').count(),17,'record switch stays in the selected run');
  assert.match(await page.locator('[data-chart=individual] .individual-value').first().getAttribute('aria-label'),system==='steam'?/0\.931/:/-22\.01/);
  await page.locator('#trend-record').selectOption(system+'-record-2:1');
  await page.waitForFunction(expected=>document.querySelector('#summary-outside').textContent===expected,outside);
  assert.equal(await page.locator('.pq-metric-card').count(),1,'one pair per selected form + metric + unit');
  assert.equal(await page.locator('svg[data-chart]:visible').count(),2,'Both plots are visible together');
  assert.deepEqual(await page.locator('.pq-plot-heading h3').allTextContents(),['Số đo theo điểm','Phân bố số đo']);
  assert.match(await page.locator('.pq-key').textContent(),/Số đo khác biệt/);
  assert.equal(await page.locator('#summary-points').textContent(),'3');
  assert.equal(await page.locator('#summary-samples').textContent(),'19');
  assert.equal(await page.locator('#summary-unknown').textContent(),'2');
  assert.match(await page.locator('#trend-assessment').textContent(),/giới hạn cho phép/);
  assert.doesNotMatch(await page.locator('#trend-assessment').textContent(),/cơ sở|hành động|tiêu chí/);
  assert.equal(await page.locator('#summary-outliers').textContent(),'2','IQR outliers differ from PQ failures');
  assert.equal(await page.locator('[data-chart=individual] .individual-value').count(),17,'single run values never pool other records');
  assert.equal(await page.locator('[data-chart=individual] .pq-outside').count(),Number(outside));
  assert.equal(await page.locator('[data-chart=individual] .stat-outlier').count(),2);
  assert.equal(await page.locator('[data-chart=boxplot] .box-summary[data-point=P1]').getAttribute('data-n'),'8');
  assert.equal(await page.locator('[data-chart=boxplot] .box-summary[data-point=P3]').getAttribute('data-n'),'1');
  assert.equal(await page.locator('[data-chart=boxplot] .box-summary[data-point=P3] .box-body').count(),0,'n=1 has no manufactured box');
  assert.equal(await page.locator('[data-chart=boxplot] .box-summary[data-point=P3] .box-median').count(),1);
  assert.equal(await page.locator('.pq-limit[data-scope=shared]').count(),2,'horizontal saved PQ limit on both plots');
  const domains=await page.locator('svg[data-chart]').evaluateAll(nodes=>nodes.map(n=>[n.dataset.yMin,n.dataset.yMax]));assert.deepEqual(domains[0],domains[1]);
  const figures=await page.locator('.pq-figure').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};}));
  assert.equal(figures[1].top>=figures[0].bottom,true,'full-width chart rows are vertically aligned');
  assert.equal(Math.abs(figures[0].left-figures[1].left)<1&&Math.abs(figures[0].right-figures[1].right)<1,true,'both plots share the full content width');
  const guideX=await page.locator('svg[data-chart]').evaluateAll(nodes=>nodes.map(n=>[...n.querySelectorAll('.pq-point-guide')].map(g=>g.getAttribute('x1'))));assert.deepEqual(guideX[0],guideX[1],'category columns align across plots');
  const separate=await page.locator('[data-chart=boxplot]').evaluate(chart=>[...chart.querySelectorAll('.box-summary[data-n="8"]')].every(box=>{const b=box.querySelector('.box-body').getBoundingClientRect();return [...chart.querySelectorAll('.box-value')].filter(n=>n.dataset.point===box.dataset.point).every(n=>n.getBoundingClientRect().left>b.right+1);}));assert.equal(separate,true,'original observations do not cover quartile boxes or medians');
  assert.equal(await page.locator('[data-chart=individual] .pq-value-label[data-point=P3]').textContent(),system==='steam'?'0,95':'-20','one-observation location exposes its value visibly');
  await page.locator('[data-chart=individual] .individual-value').first().focus();
  assert.match(await page.locator('#chart-inspection').textContent(),/P1.*lần 1/);
  const tooltip=page.locator('.pq-tooltip:not([hidden])');await tooltip.waitFor();assert.match(await tooltip.textContent(),system==='steam'?/0\.93/:/-22/,'nearby tooltip preserves the raw saved value');
  assert.match(await tooltip.textContent(),system==='steam'?/PQ đã lưu ≥ 0,94 D/:/PQ đã lưu ≤ -10 °C/,'observation tooltip states the saved criterion with direction and unit');
  assert.match(await tooltip.textContent(),/Không được đánh dấu khác biệt với số liệu hiện có/,'ordinary observation has separate IQR status');
  await page.locator('[data-chart=boxplot] .box-value').first().hover();assert.equal(await tooltip.count(),1,'only one observation tooltip is open across the pair');
  await page.keyboard.press('Escape');assert.equal(await tooltip.count(),0,'Escape dismisses the nearby tooltip even when mouse and keyboard target different plots');
  await page.locator('[data-chart=individual] .individual-value[data-point=P3]').scrollIntoViewIfNeeded();
  const single=await page.locator('[data-chart=individual] .individual-value[data-point=P3]').boundingBox();await page.touchscreen.tap(single.x+single.width/2+18,single.y+single.height/2);await tooltip.waitFor();assert.match(await tooltip.textContent(),/P3.*lần 1/s,'chart touch selects a nearby observation without needing to hit its small dot');
  await page.keyboard.press('Escape');
  await page.locator('[data-chart=boxplot] .box-value[data-point=P3]').scrollIntoViewIfNeeded();const boxSingle=await page.locator('[data-chart=boxplot] .box-value[data-point=P3]').boundingBox();await page.touchscreen.tap(boxSingle.x+boxSingle.width/2+18,boxSingle.y+boxSingle.height/2);await tooltip.waitFor();assert.match(await tooltip.textContent(),/P3.*lần 1/s,'touch near co-located singleton Boxplot glyph opens raw observation, not summary');assert.match(await tooltip.textContent(),/PQ đã lưu/);
  await page.keyboard.press('Escape');
  const boxSummary=page.locator('[data-chart=boxplot] .box-summary[data-point=P1]');await page.keyboard.press('Tab');await boxSummary.focus();await page.keyboard.press('Escape');
  const boxFocus=await boxSummary.locator('.box-body').evaluate(n=>({strokeWidth:getComputedStyle(n).strokeWidth,filter:getComputedStyle(n).filter}));assert.equal(boxFocus.strokeWidth,'3px','focused summary has a visible child stroke after tooltip dismissal');assert.notEqual(boxFocus.filter,'none','focused summary has a visible focus halo');
  await page.locator('#trend-data-details summary').click();
  assert.equal(await page.locator('#trend-data tbody tr').count(),19,'all source rows remain including exclusions');
  assert.match(await page.locator('#trend-data tbody').textContent(),/Không đọc được/);
  assert.match(await page.locator('.pq-stats-table').textContent(),/P1.*8/s);
  assert.equal(await page.locator('.pq-stats-table th').filter({hasText:/^IQR$/}).count(),1,'statistics table includes explicit IQR');
  assert.equal(await page.locator('.pq-stats-table tbody tr[data-point=P1] td').nth(5).textContent(),system==='steam'?'0,035':'3,5','IQR magnitude is literal and auditable');
  await page.locator('#point-visibility summary').click();
  await page.locator('#chart-legend input[value=P1]').uncheck();
  assert.equal(await page.locator('svg[data-chart] [data-point=P1]').count(),0,'hiding affects both plots');
  assert.equal(await page.locator('#summary-outliers').textContent(),'2');
  assert.equal(await page.locator('#trend-data tbody tr').count(),19);
  await page.locator('#trend-show-all').click();
  await page.locator('#trend-form').selectOption('');
  assert.equal(await page.locator('.pq-metric-card').count(),system==='steam'?3:2,'all forms retain separate metrics and units');
  assert.equal(await page.locator('svg[data-chart]').count(),system==='steam'?6:4);
  await page.locator('#history-chart-details summary').first().click();
  const historyMetric=page.locator('#history-metric');
  assert.equal(await historyMetric.locator('option').count(),system==='steam'?3:2);
  const alternate=JSON.stringify(system==='steam'?['bm02','toc','ppb']:['bm01','p05','hạt/m³']);
  await historyMetric.selectOption(alternate);
  assert.match(await page.locator('#multi-trend-status').textContent(),system==='steam'?/TOC.*ppb/:/Tiểu phân.*hạt\/m³/);
  assert.equal(await page.locator('#multi-trend-chart .multi-point').count(),6,'history switches to the explicitly selected series');
  assert.equal(await page.locator('.pq-metric-card').count(),system==='steam'?3:2,'history choice leaves current-run charts unchanged');
  await page.locator('#trend-record').selectOption(system+'-record-1:1');
  assert.equal(await historyMetric.inputValue(),alternate,'history metric survives record change');
  await page.locator('#trend-record').selectOption(system+'-record-2:1');
  await page.locator('#trend-form').selectOption(system==='steam'?'bm03':'bm02');
  assert.equal(await historyMetric.inputValue(),alternate,'history metric does not silently follow the first filtered group');
  await historyMetric.selectOption(JSON.stringify([system==='steam'?'bm03':'bm02','result',system==='steam'?'D':'°C']));
  assert.match(await page.locator('#multi-trend-status').textContent(),/2 hồ sơ đã đóng/);
  await page.locator('#multi-data-details summary').click();
  assert.equal(await page.locator('#multi-trend-data tbody tr[data-source-state=uncertain]').count(),2);
  assert.equal(await page.locator('#multi-trend-data tbody tr[data-source-state=missing]').count(),2);
  assert.match(await page.locator('#multi-trend-data tbody').textContent(),new RegExp(system+'-record-1.*v1'));
  if(evidence)await page.locator('#history-chart-details').screenshot({path:evidence+'/'+system+'-history.png'});
  await page.locator('#multi-data-details summary').click();
  await page.locator('#point-visibility summary').click();
  await page.locator('#trend-data-details summary').click();
  for(const theme of ['light','dark'])for(const width of [1440,390,320]){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:950});
   await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true,theme+' '+width+' overflow');
   const limitReadable=await page.locator('.pq-figure').evaluateAll(figures=>figures.every(figure=>{const caption=figure.querySelector('.pq-rule-caption:not([hidden])'),tag=caption||figure.querySelector('.pq-limit-tag'),surface=caption?figure:figure.querySelector('.pq-chart-scroll');if(!tag)return false;const a=tag.getBoundingClientRect(),b=surface.getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1;}));
   assert.equal(limitReadable,true,theme+' '+width+' saved common PQ limit is fully readable without scrolling');
   if(width===1440)assert.equal(await page.locator('.pq-chart-scroll').evaluateAll(nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1)),true,'three sampling groups fit full desktop width');
   const axe=await new AxeBuilder({page}).include('#trend-panel').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
   assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,details:n.failureSummary}))})),[],system+' '+theme+' '+width+' axe');
   if(evidence){await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:evidence+'/'+system+'-'+theme+'-'+width+'.png',fullPage:true});}
  }
  await page.close();
 }
 for(const variant of ['many-points','duplicates','different','unknown','pending','error','empty','restricted','mixed-unit','raw-precision','equal-bound','segmented-equal-bound']){
  const page=await pageFor('air','&fixture='+variant);
  if(['many-points','duplicates'].includes(variant)){
   await page.waitForFunction(()=>document.querySelector('#limit-source').textContent.includes('fixture-1'));
   if(variant==='many-points'){assert.equal(await page.locator('#summary-points').textContent(),'17');assert.equal(await page.locator('[data-chart=individual] .individual-value').count(),51);assert.equal(await page.locator('[data-chart=boxplot] .box-summary').count(),17);}
   else{const spaced=await page.locator('[data-chart=individual]').evaluate(chart=>{const marks=[...chart.querySelectorAll('.individual-value[data-point=P1]')].map(n=>({x:Number(n.getAttribute('cx')),y:Number(n.getAttribute('cy'))}));return marks.length===8&&marks.every((a,i)=>marks.slice(i+1).every(b=>Math.hypot(a.x-b.x,a.y-b.y)>=10));});assert.equal(spaced,true,'eight equal saved values are individually visible');}
   for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true,variant+' '+width+' has no page overflow');if(width===1440&&variant==='many-points')assert.equal(await page.locator('.pq-chart-scroll').evaluateAll(ns=>ns.every(n=>n.scrollWidth<=n.clientWidth+1)),true,'17 short sampling IDs fit full desktop width');if(evidence)await page.locator('.pq-metric-card').screenshot({path:evidence+'/'+variant+'-'+width+'.png'});}
  }
  if(variant==='segmented-equal-bound'){await page.waitForFunction(()=>document.querySelector('#summary-outside').textContent==='1');await page.setViewportSize({width:320,height:950});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const collision=await page.locator('[data-chart=individual]').evaluate(chart=>{const a=chart.querySelector('.pq-value-label[data-point=P3]').getBoundingClientRect(),b=[...chart.querySelectorAll('.pq-limit-label')].find(n=>n.textContent==='≤ -20').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});assert.equal(collision,false,'singleton at point-specific PQ boundary must not overlap the segment label');if(evidence)await page.locator('.pq-plots').screenshot({path:evidence+'/segmented-equal-bound-320.png'});}
  if(variant==='equal-bound'){await page.waitForFunction(()=>document.querySelector('#summary-outside').textContent==='1');const collision=await page.locator('.pq-figure').first().evaluate(figure=>{const a=figure.querySelector('.pq-value-label[data-point=P3]').getBoundingClientRect(),b=figure.querySelector('.pq-rule-caption').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});assert.equal(collision,false,'numeric value at saved PQ boundary must not collide with its rule label');}
  if(variant==='mixed-unit'){await page.waitForFunction(()=>document.querySelector('#summary-outside').textContent==='1');assert.equal(await page.locator('.pq-metric-card').count(),2,'same metric with different units gets separate pair');assert.equal(await page.locator('.pq-metric-card').nth(1).locator('.pq-limit').count(),0,'no limit borrowed for incompatible unit');assert.match(await page.locator('.pq-metric-card').nth(1).textContent(),/K/);}
  if(variant==='raw-precision'){await page.waitForFunction(()=>document.querySelector('#summary-outside').textContent==='2');assert.match(await page.locator('[data-chart=individual] .individual-value').first().getAttribute('aria-label'),/-9\.999/,'plot and PQ decision use precise saved snapshot value');}
  if(variant==='different'){await page.waitForFunction(()=>document.querySelector('#summary-outside').textContent==='1');assert.equal(await page.locator('.pq-limit[data-scope=shared]').count(),0);assert.equal(await page.locator('.pq-limit[data-scope=point]').count(),6);}
  if(['unknown','pending','error'].includes(variant)){assert.equal(await page.locator('[data-chart=individual] .individual-value').count(),17,'numeric source remains readable without loaded PQ criteria');assert.equal(await page.locator('.pq-outside').count(),0);}
  if(variant==='unknown'){await page.waitForFunction(()=>document.querySelector('#summary-unknown').textContent==='19');assert.equal(await page.locator('.pq-limit').count(),0);}
  if(variant==='pending'){assert.equal(await page.locator('#summary-outside').textContent(),'—');await page.evaluate(()=>window.__trendFixture.release());await page.waitForFunction(()=>document.querySelector('#summary-outside').textContent==='1');}
  if(variant==='error'){await page.locator('#limits-retry').waitFor();assert.equal(await page.locator('#summary-outside').textContent(),'—');await page.evaluate(()=>window.__trendFixture.fail=false);await page.locator('#limits-retry').click();await page.waitForFunction(()=>document.querySelector('#summary-outside').textContent==='1');}
  if(variant==='empty'){assert.equal(await page.locator('.pq-metric-card').count(),0);assert.equal(await page.locator('#summary-outside').textContent(),'—');}
  if(variant==='restricted'){assert.equal(await page.locator('#trend-system option').count(),0);assert.equal(await page.locator('.pq-metric-card').count(),0);assert.equal(await page.evaluate(()=>window.__trendFixture.calls),0);}
  await page.close();
 }
 assert.deepEqual(errors,[],'no JavaScript errors');assert.deepEqual(writes,[],'no network writes');assert.deepEqual(external,[],'no external requests');
 console.log('PASS readable chart pair and explicit historical metric across three systems; saved-run grouping, PQ/IQR distinction, small samples, raw sources, limits, access, retry, history, 18 theme/viewport axe checks');
}finally{await context.close();await browser.close();}

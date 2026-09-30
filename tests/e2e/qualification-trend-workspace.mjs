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
const systems=['air','nitrogen','steam'];
const settings=system=>system==='steam'?{...configs.settings,locations:[{id:'P1',name:'Điểm một'},{id:'P2',name:'Điểm hai'}]}:{...configs.gas_settings.find(c=>c.system===system).config,system,forms:[{id:'bm01',title:'Tiểu phân',kind:'measurement',locations:[{id:'P1',name:'Điểm một',limits:{p05:10}},{id:'P2',name:'Điểm hai',limits:{p05:10}}]}]};
const spec=system=>system==='steam'?{form:'bm03',metric:'result',label:'Độ khô',unit:'D',values:[.8,.95,.96]}:{form:'bm01',metric:'p05',label:'Tiểu phân ≥ 0,5 µm',unit:'hạt/m³',values:[12,5,3]};
const rows=(system,early=false)=>{const s=spec(system);return ['P1','P2','P2'].map((point,i)=>({form:s.form,metric:s.metric,label:s.label,unit:s.unit,point_id:point,trial:i===2?2:1,value:early?s.values[i]-.01:s.values[i],uncertain:i===2,source_value:String(s.values[i]),computed_status:i===0?'fail':i===2?'invalid':'pass'}));};
const runs=systems.flatMap(system=>[1,2,3].map(i=>({id:system+'-run-'+i,title:'Đợt '+i,status:i===3?'open':'closed',items:[],progress:{total:0,complete:0},mode:'single',started_on:'2026-03-01',version:1})));
const history=systems.flatMap(system=>[1,2,3].map(i=>({run_id:system+'-run-'+i,record_id:system+'-record-'+i,version:1,system,period:i===1?'2026-03-01':i===2?'2026-05-01':'2026-02-01',trend:rows(system,i===1),sources:[],issues:[]})));
if(new URLSearchParams(location.search).get('fixture')==='historical-point')history.find(item=>item.record_id==='air-record-1').trend.push({...rows('air')[0],point_id:'P3',value:8},{...rows('air')[0],point_id:'P3',trial:2,value:null,source_value:'Không đọc được'});
const snapshots=Object.fromEntries(history.map(item=>{
 const steam=item.system==='steam',s=spec(item.system),a=item.trend[0].value,b=item.trend[1].value;
 const measured=steam?{P1:[{status:'fail',values:{raw_result:String(a)}}],P2:[{status:'pass',values:{raw_result:String(b)}},{status:'invalid'}]}:{P1:{status:'fail',parameters:{p05:'fail'}},P2:{status:'pass',parameters:{p05:'pass'}}};
 const data=steam?{system:'steam'}:{system:item.system,forms:{bm01:{P1:{p05:String(a)},P2:{p05:String(b)}}}};
 const source_context=steam?{criteria:{dryness_min:.9}}:{config:settings(item.system)};
 return [item.record_id,{data,evaluation:{formula_version:'fixture-1',source_context,forms:{[s.form]:{rows:measured}}}}];
}));
window.__trendFixture={snapshots,calls:0,fail:new URLSearchParams(location.search).get('fixture')==='error'};
window.CPC1Backend={permissionsFor:system=>({can_view:!(new URLSearchParams(location.search).get('fixture')==='restricted'&&system==='air'),can_view_current:!(new URLSearchParams(location.search).get('fixture')==='restricted'&&system==='air'),can_enter:false}),getSession:async()=>({user:{id:'fixture-qa'}}),getConfig:async()=>settings('steam'),getGasConfig:async s=>settings(s),listRuns:async()=>structuredClone(runs),listHistory:async()=>new URLSearchParams(location.search).get('fixture')==='empty'?[]:structuredClone(history),runRequirements:async()=>[],historySnapshot:async(id)=>{window.__trendFixture.calls++;if(new URLSearchParams(location.search).get('fixture')==='pending'&&!window.__trendFixture.released)await new Promise(resolve=>window.__trendFixture.release=()=>{window.__trendFixture.released=true;resolve();});if(window.__trendFixture.fail)throw Error('Tiêu chí tạm thời chưa tải được');return structuredClone(snapshots[id]);},downloadHistorySource:async()=>new Blob()};
document.body.dataset.qualificationGate='ready';`;
new Function(fixture);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||chromium.executablePath()});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
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
  const page=await pageFor(system);
  if(evidence)await page.screenshot({path:evidence+'/'+system+'-initial.png',fullPage:true});
  assert.match(await page.locator('h1').textContent(),new RegExp('Xu hướng.*'+title),'dedicated page identifies its system');
  try{await page.waitForFunction(()=>document.querySelector('#summary-outside')?.textContent==='1');}catch(error){console.log('comparison diagnostic',await page.evaluate(()=>({snapshot:window.__trendFixture.snapshots['air-record-2'],cells:document.querySelector('#trend-data tbody').textContent})));throw error;}
  assert.equal(await page.locator('#summary-points').textContent(),'2');
  assert.equal(await page.locator('#summary-samples').textContent(),'3');
  assert.equal(await page.locator('#summary-unknown').textContent(),'1');
  assert.match(await page.locator('#assessment-scope').textContent(),/2026-05.*Đợt 2/);
  assert.equal(await page.locator('#trend-panel svg:visible').count(),1,'one shared chart shown');
  assert.equal(await page.locator('#trend-chart .action-limit').count(),2,'saved location-specific limits share the value chart');
  assert.equal(await page.locator('#trend-chart .outside-marker').count(),1,'outside result has a shape as well as color');
  const selected=await page.locator('#trend-record').inputValue();
  const modes=page.getByRole('tablist',{name:'Cách xem biểu đồ'});
  await modes.getByRole('tab',{name:'Theo điểm lấy mẫu',exact:true}).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await modes.getByRole('tab',{name:'Giới hạn hành động',exact:true}).getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#limit-chart').isVisible(),true);
  await page.keyboard.press('End');
  assert.equal(await page.locator('#multi-trend-chart').isVisible(),true);
  assert.equal(await page.locator('#trend-record').inputValue(),selected,'mode change retains selection');
  assert.match(await page.locator('#multi-trend-status').textContent(),/2 hồ sơ đã đóng/);
  assert.match(await page.locator('#assessment-scope').textContent(),/đợt đang chọn/i,'comparison scope remains explicit in history mode');
  assert.equal(await page.locator('#multi-trend-legend').getByText(/P1.*lần 1/).count(),1,'historical lines have a readable legend');
  const paths=await page.locator('#multi-trend-chart .multi-line[data-point="P1"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('d')));
  assert.equal(paths.length,2,'missing April breaks the line into separate segments');
  assert.equal(paths.some(path=>path.includes('L')),false);
  await page.locator('#chart-legend input[value="P1"]').uncheck();
  assert.equal(await page.locator('#multi-trend-chart [data-point="P1"]').count(),0,'hiding a point affects history chart');
  await page.locator('#multi-data-details summary').click();
  assert.equal(await page.locator('#multi-trend-data tbody tr').filter({hasText:'P1'}).count(),3,'hidden point remains in source table with missing month');
  const uncertainRows=page.locator('#multi-trend-data tbody tr[data-source-state=uncertain]');
  assert.equal(await uncertainRows.count(),2,'both saved uncertain trial-2 observations remain in the history table');
  assert.match(await uncertainRows.first().textContent(),/P2.*2.*chưa chắc chắn/i);
  assert.match(await uncertainRows.first().textContent(),new RegExp(system+'-record-1.*v1'),'source table identifies its saved snapshot');
  await page.locator('#chart-legend input[value="P2"]').uncheck();
  assert.match(await page.locator('#multi-trend-chart .chart-empty').textContent(),/Đã ẩn tất cả điểm/);
  assert.equal(await page.locator('#summary-outside').textContent(),'1','chart visibility never hides outside count');
  assert.equal(await page.locator('#multi-trend-data tbody tr[data-source-state=uncertain]').count(),2,'uncertain source rows remain even when all chart points are hidden');
  await page.locator('#trend-show-all').click();
  assert.equal(await page.locator('#chart-legend input:checked').count(),2);
  await page.locator('#trend-point').selectOption('P2');
  assert.equal(await page.locator('#summary-points').textContent(),'1');
  assert.equal(await page.locator('#summary-outside').textContent(),'0');
  assert.equal(await page.locator('#multi-trend-chart [data-point="P1"]').count(),0);
  await page.locator('#trend-point').selectOption('');
  await modes.getByRole('tab',{name:'Theo điểm lấy mẫu',exact:true}).click();
  await page.locator('#trend-chart [tabindex="0"]').first().focus();
  assert.match(await page.locator('#trend-chart [tabindex="0"]').first().getAttribute('aria-label'),/P1.*lần 1/);
  for(const theme of ['light','dark']){
   await modes.getByRole('tab',{name:'Theo điểm lấy mẫu',exact:true}).click();
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:950});
    await page.evaluate(async()=>{getComputedStyle(document.querySelector('#view-points')).backgroundColor;await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true,theme+' '+width+' does not overflow');
    const axe=await new AxeBuilder({page}).include('#trend-panel').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,details:n.failureSummary}))})),[],system+' '+theme+' '+width+' axe');
    if(evidence&&system==='air'){await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});} 
    if(evidence&&system==='air')await page.screenshot({path:evidence+'/'+theme+'-'+width+'.png',fullPage:true});
   }
   await page.setViewportSize({width:1440,height:950});
   for(const name of ['Giới hạn hành động','Qua các đợt đã đóng']){
    await modes.getByRole('tab',{name,exact:true}).click();
    await page.evaluate(async()=>{getComputedStyle(document.querySelector('#view-points')).backgroundColor;await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
    const axe=await new AxeBuilder({page}).include('#trend-panel').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    assert.deepEqual(axe.violations.map(v=>v.id),[],system+' '+theme+' '+name+' axe');
    if(evidence){await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:evidence+'/'+system+'-'+theme+'-'+(name==='Giới hạn hành động'?'limits':'history')+'.png',fullPage:true});}
   }
  }
  await page.close();
 }
 const historical=await pageFor('air','&fixture=historical-point');
 await historical.getByRole('tab',{name:'Qua các đợt đã đóng',exact:true}).click();
 assert.equal(await historical.locator('#chart-legend input[value="P3"]').count(),1,'history-only point is selectable');
 assert.equal(await historical.locator('#multi-trend-chart [data-point="P3"]').count()>0,true);
 await historical.locator('#chart-legend input[value="P3"]').uncheck();
 assert.equal(await historical.locator('#multi-trend-chart [data-point="P3"]').count(),0);
 await historical.locator('#multi-data-details summary').click();
 assert.equal(await historical.locator('#multi-trend-data tbody tr[data-source-state=missing]').count(),1,'saved missing value remains in full source table');
 assert.match(await historical.locator('#multi-trend-data tbody tr[data-source-state=missing]').textContent(),/P3.*Không đọc được.*Thiếu giá trị số/);
 await historical.close();
 const empty=await pageFor('air','&fixture=empty');
 assert.equal(await empty.locator('#summary-outside').textContent(),'—');
 assert.equal(await empty.locator('#summary-samples').textContent(),'0');
 assert.match(await empty.locator('#trend-assessment').textContent(),/Chưa có dữ liệu/);
 await empty.close();
 const restricted=await pageFor('air','&fixture=restricted');
 assert.equal(await restricted.locator('#trend-system option').count(),0,'a dedicated route never substitutes a different system if access is unavailable');
 assert.equal(await restricted.locator('#trend-data tbody tr').count(),0);
 assert.equal(await restricted.evaluate(()=>window.__trendFixture.calls),0);
 await restricted.close();
 const pending=await pageFor('air','&fixture=pending');
 assert.equal(await pending.locator('#summary-outside').textContent(),'—','pending cannot present zero outside');
 assert.match(await pending.locator('#trend-assessment').textContent(),/Đang/);
 await pending.evaluate(()=>window.__trendFixture.release());
 await pending.waitForFunction(()=>document.querySelector('#summary-outside').textContent==='1');
 await pending.close();
 const failed=await pageFor('air','&fixture=error');
 await failed.locator('#limits-retry').waitFor();
 assert.equal(await failed.locator('#summary-outside').textContent(),'—','failed criteria cannot present zero outside');
 assert.match(await failed.locator('#trend-assessment').textContent(),/chưa.*đối chiếu/i);
 assert.doesNotMatch(await failed.locator('#limit-summary').textContent(),/^0 kết quả ngoài/,'failed criteria must not announce a zero-outside verdict');
 await failed.evaluate(()=>window.__trendFixture.fail=false);
 await failed.locator('#limits-retry').click();
 await failed.waitForFunction(()=>document.querySelector('#summary-outside').textContent==='1');
 await failed.close();
 assert.deepEqual(errors,[],'no JavaScript errors');assert.deepEqual(writes,[],'no network writes');assert.deepEqual(external,[],'no external requests');
 console.log('PASS three systems; shared values/limits; saved scope/counts; keyboard modes; history gaps/legend; point hide/reset/table; pending/error/retry; historical-only point; empty/restricted/pending/error/retry; 30 mode/theme/viewport axe checks; zero errors or network writes');
}finally{await context.close();await browser.close();}

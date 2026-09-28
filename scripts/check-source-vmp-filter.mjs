import puppeteer from 'puppeteer-core';import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {CHROME,CHROME_GL_ARGS} from '../tests/e2e/chrome-path.mjs';
import {caiGiaLap,nhetPhien} from '../tests/e2e/gia-lap-supabase.mjs';
const out=process.env.CPC1_UI_OUTPUT;if(!out)throw Error('Set private CPC1_UI_OUTPUT');
const supabaseUrl=(await readFile('.env.local','utf8')).match(/^VITE_SUPABASE_URL=(.+)$/m)[1].trim(),base='http://127.0.0.1:8882/';
const browser=await puppeteer.launch({headless:true,executablePath:CHROME,args:['--no-sandbox',...CHROME_GL_ARGS]});const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await caiGiaLap(page,{supabaseUrl,kichBan:'day',mangNghiemNgat:true,previewOrigin:base,suaKho:store=>{
  const first=store.vmp_source_objects[0];store.vmp_source_objects=Array.from({length:40},(_,i)=>({...first,id:`91000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,object_kind:'Thiết bị',object_code:'DATE-'+String(i+1).padStart(3,'0'),object_name:'Thiết bị kiểm thử '+(i+1),date:i<30?'2026-03-15':'2026-09-15'}));
  for(const key of ['rpc_list_source_objects','rpc_export_source_objects']){
   const original=store[key];store[key]=body=>{calls.push({key,body:structuredClone(body)});const rows=store.vmp_source_objects;const f=body.p_filters||{};store.vmp_source_objects=rows.filter(r=>(!f.vmp_from||r.date>=f.vmp_from)&&(!f.vmp_to||r.date<=f.vmp_to));try{return original(body);}finally{store.vmp_source_objects=rows;}};
  }
 }});await nhetPhien(page,{supabaseUrl});await page.setViewport({width:1440,height:1000});await page.goto(base+'#v=source');await page.waitForSelector('[data-cw-export-count="40"]');await page.click('[data-cw-filter-toggle]');
 const set=async(key,value)=>{await page.$eval(`[data-cw-filter="${key}"]`,(n,value)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(n,value);n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));},value);};
 await set('vmp-from','2026-03-01');await set('vmp-to','2026-03-31');await page.waitForSelector('[data-cw-export-count="30"]');
 assert.ok(calls.some(x=>x.body.p_filters.vmp_from==='2026-03-01'&&x.body.p_filters.vmp_to==='2026-03-31'));
 await page.click('.cw-pager button:last-child');await page.waitForFunction(()=>document.querySelector('.cw-pager')?.textContent.includes('26–30'));
 await page.click('[data-cw-tools] summary');await page.click('[data-cw-export-count]');await page.waitForFunction(()=>document.body.textContent.includes('Đã xuất 30 dòng Source.'));
 assert.equal(calls.filter(x=>x.key==='rpc_export_source_objects').at(-1).body.p_filters.vmp_to,'2026-03-31');
 await set('vmp-from','2026-04-01');await page.waitForSelector('#cw-vmp-date-error');assert.equal(await page.$eval('[data-cw-export-count]',n=>n.disabled),true);
 assert.equal(calls.some(x=>x.body.p_filters.vmp_from==='2026-04-01'&&x.body.p_filters.vmp_to==='2026-03-31'),false,'Invalid range never queried');
 await set('vmp-to','2026-09-30');await set('vmp-from','2026-09-01');await page.waitForSelector('[data-cw-export-count="10"]');assert.equal(await page.$('.cw-pager'),null,'Changed range resets cursor');
 await page.screenshot({path:out+'/source-vmp-desktop.png'});
 for(const width of [390,768,1440]){await page.setViewport({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'overflow '+width);}
 await page.setViewport({width:390,height:1000});await page.screenshot({path:out+'/source-vmp-mobile.png'});
 await page.click('[data-cw-clear-filters]');await page.waitForSelector('[data-cw-export-count="40"]');assert.equal(await page.$eval('[data-cw-filter="vmp-from"]',n=>n.value),'');assert.equal(await page.$eval('[data-cw-filter="vmp-to"]',n=>n.value),'');
 await set('vmp-from','2030-01-01');await page.waitForFunction(()=>document.body.textContent.includes('Không có dòng nào khớp'));assert.deepEqual(errors,[]);
 await writeFile(out+'/browser.json',JSON.stringify({synthetic:true,rows:40,filtered:30,exportRows:30,rangeReset:true,invalidBlocked:true,empty:true,widths:[390,768,1440],errors},null,2));console.log('PASS populated Source date filter, pagination/export, invalid range, reset/empty, 3 widths');
}catch(e){console.log('Debug',JSON.stringify({errors,calls:calls.filter(x=>x.key.includes('export')),text:(await page.$eval('body',n=>n.innerText)).slice(-1400)}));throw e;}finally{await browser.close();}

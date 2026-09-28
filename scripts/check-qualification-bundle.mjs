// Verify the generated browser backend, with every request intercepted.
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();let downloads=0, mismatch='version';const unexpected=[];
 const snapshot={id:'synthetic-record',version:3,data:{meta:{remarks:'input'}},evaluation:{}};
 await page.route('**/*',r=>{
  const u=new URL(r.request().url());
  if(u.origin==='https://bundle.test')return r.fulfill({body:'<!doctype html><title>Isolated bundle test</title>'});
  if(u.hostname==='vmp-test.supabase.co'&&u.pathname==='/rest/v1/rpc/cpc1_save')return r.fulfill({json:snapshot});
  if(u.hostname==='vmp-test.supabase.co'&&u.pathname==='/rest/v1/rpc/cpc1_load'){
   const data=structuredClone(snapshot);if(mismatch==='version')data.version=2;if(mismatch==='id')data.id='wrong';if(mismatch==='data')data.data.meta.remarks='wrong';
   return r.fulfill({json:data});
  }
  if(u.pathname.includes('/storage/'))downloads++;
  unexpected.push(u.origin+u.pathname);return r.fulfill({status:500,body:'Blocked unexpected request'});
 });
 await page.goto('https://bundle.test');
 await page.evaluate(()=>window.CPC1_SETTINGS={url:'https://vmp-test.supabase.co',publishableKey:'sb_publishable_fixture'});
 await page.addScriptTag({content:await readFile(new URL('../dist/tham-dinh-thuc-te/cloud.js',import.meta.url),'utf8')});
 for(mismatch of ['version','id','data']) {
  const message=await page.evaluate(async()=>{const data={meta:{remarks:'input'}};await CPC1Backend.save(data);try{await CPC1Backend.report('bm01',data);return 'unexpected success';}catch(e){return e.message;}});
  assert.match(message,/Phiên bản hồ sơ trả về không khớp/);
 }
 assert.equal(downloads,0);assert.deepEqual(unexpected,[]);
 console.log('Built cloud.js rejects wrong PDF id/version/data before any private asset download. No external requests.');
}finally{await browser.close();}

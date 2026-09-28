import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 await page.route('**/*',r=>r.fulfill({body:'<!doctype html><title>Draft storage test</title>'}));
 await page.goto('http://draft.test');
 await page.addScriptTag({content:await readFile(new URL('../public/tham-dinh-thuc-te/draft-store.js',import.meta.url),'utf8').catch(()=> '')});
 assert.equal(await page.evaluate(()=>typeof window.CPC1DraftStore),'object','Recovery storage exists');
 const result=await page.evaluate(async()=>{
  const s=window.CPC1DraftStore, scope='test-project/actor-a', snap={data:{meta:{remarks:'1,25 — Tiếng Việt'}},recordId:null,version:null,form:'bm03',point:'P1'};
  const empty=await s.read(scope,'steam');
  const first=await s.write(scope,'steam',0,snap,true);
  const raw=await s.read(scope,'steam');
  const other=await s.read('test-project/actor-b','steam');
  const system=await s.read(scope,'air');
  const writes=await Promise.allSettled([s.write(scope,'steam',first.revision,snap,true),s.write(scope,'steam',first.revision,{...snap,data:{meta:{remarks:'other'}}},true)]);
  let unsafe=false;try{await s.write(scope,'air',0,{...snap,data:JSON.parse('{"__proto__":{"polluted":true}}')},true)}catch{unsafe=true}
  let large=false;try{await s.write(scope,'air',0,{...snap,data:{text:'x'.repeat(1048577)}},true)}catch{large=true}
  const latest=await s.read(scope,'steam');await s.write(scope,'steam',latest.revision,null,false);
  let stale=false;try{await s.write(scope,'steam',latest.revision,snap,true)}catch{stale=true}
  await s.write('test-project/actor-b','steam',0,snap,true);
  const runA='steam:00000000-0000-4000-8000-000000000001',runB='steam:00000000-0000-4000-8000-000000000002';
  await s.write(scope,runA,0,snap,true);
  if(await s.read(scope,runB)!==null)throw Error('Draft leaked across runs');
  await s.write(scope,runB,0,{...snap,data:{meta:{remarks:'another run'}}},true);
  if((await s.read(scope,runA)).payload.data.meta.remarks!=='1,25 — Tiếng Việt')throw Error('Draft overwritten across runs');
  await s.clearActor(scope);
  if(await s.read(scope,runA)!==null || await s.read(scope,runB)!==null)throw Error('Run drafts retained after actor clear');
  return {empty,raw,other,system,writes:writes.map(x=>x.status),unsafe,large,stale,cleared:await s.read(scope,'steam'),retained:!!(await s.read('test-project/actor-b','steam'))};
 });
 assert.equal(result.empty,null);assert.equal(result.raw.payload.data.meta.remarks,'1,25 — Tiếng Việt');assert.equal(result.other,null);assert.equal(result.system,null);
 assert.deepEqual(result.writes.sort(),['fulfilled','rejected']);assert.ok(result.unsafe&&result.large&&result.stale);assert.equal(result.cleared,null);assert.ok(result.retained);
 console.log('Draft store: raw strings, actor/system partition, atomic conflict, unsafe/size rejection, disable tombstone and scoped clear passed.');
} finally {await browser.close();}

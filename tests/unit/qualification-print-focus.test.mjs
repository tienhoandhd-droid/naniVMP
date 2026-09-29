import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const script=await readFile(new URL('../../public/tham-dinh-thuc-te/entry-tools.js',import.meta.url),'utf8');
test('print intent waits for current PQ authorization and rejects stale or denied completions',async t=>{
  // CI installs the bundled browser with --no-shell; use its Chromium channel.
  const browser=await chromium.launch({channel:'chromium',headless:true});
  try {
    for(const scenario of ['allowed','denied','network','changed','signed-out','different-actor'])await t.test(scenario,async()=>{
      const page=await browser.newPage();
      page.setDefaultTimeout(2000);
      try {
        await page.setContent('<div class="action-bar"><button id="print">In biểu mẫu</button><button id="record-save">Lưu</button><button id="evaluate">Tính</button></div><div id="form-body"><input value="12.5"></div>');
        await page.evaluate(()=>{
          window.state={userId:'qa-1',system:'air',form:'bm03',generation:1,recordId:'saved-record',version:2,dirty:false};
          window.allowed=false;
          window.pendingSession=new Promise((resolve,reject)=>{window.resolveSession=resolve;window.rejectSession=reject;});
          window.CPC1Backend={permissionsFor:()=>({can_view:window.allowed,can_enter:false}),canSaveActive:()=>false,canEvaluateActive:()=>false,getSession:()=>window.pendingSession,onSessionChange:()=>{}};
        });
        await page.addScriptTag({content:script});
        await page.evaluate(()=>{
          CPC1EntryTools.attach({get:()=>window.state,save:()=>{},report:()=>{throw Error('No PDF request before review');}});
          window.opening=CPC1EntryTools.show();
        });
        assert.equal(await page.locator('#print-review').evaluate(d=>d.open),false,'never open while authorization is unresolved');
        await page.evaluate(async scenario=>{
          if(scenario==='changed'){window.state.generation++;CPC1EntryTools.changed();}
          if(scenario==='signed-out'){window.CPC1_SESSION_ENDED=true;CPC1EntryTools.end();}
          if(scenario==='network')window.rejectSession(Error('Network unavailable'));
          else {window.allowed=scenario!=='denied';window.resolveSession({user:{id:scenario==='different-actor'?'qa-2':'qa-1'}});}
          // Observe both the producer and the consumer, including pre-fix code which returned void.
          await window.pendingSession.catch(()=>{});await window.opening;
        },scenario);
        assert.equal(await page.locator('#print-review').evaluate(d=>d.open),scenario==='allowed','only the unchanged authorized request can open the review');
        assert.equal(await page.locator('#form-body input').inputValue(),'12.5','permission refresh never changes entered data');
        if(scenario==='network')assert.match(await page.locator('#entry-print-status').textContent(),/thử lại/i);
        if(scenario==='denied')assert.match(await page.locator('#entry-print-status').textContent(),/quyền/i);
      } finally {await page.close();}
    });
  } finally {await browser.close();}
});

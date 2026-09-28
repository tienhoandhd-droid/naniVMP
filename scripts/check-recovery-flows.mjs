import assert from 'node:assert/strict';
export async function checkRecovery(page, base, fixtures) {
 for (const system of ['steam','air','nitrogen']) {
  const url=base+'/tham-dinh-thuc-te/'+(system==='steam'?'steam.html':'gas.html?system='+system);
  await page.goto(url);await page.waitForFunction(()=>!document.querySelector('#evaluate').disabled);
  assert.equal(await page.locator('#local-draft-enable').count(),1,'Device recovery control exists');
  await page.locator('#draft-file').setInputFiles(fixtures+'/'+system+'.json');
  await page.waitForFunction(()=>[...document.querySelectorAll('#form-body input')].some(x=>x.value));
  await page.locator('#local-draft-enable').check();
  const input=page.locator('#form-body input:not([readonly])').first();
  const name=await input.getAttribute('name');await input.fill('12,345');
  await page.waitForFunction(()=>document.querySelector('#local-draft-status').textContent.startsWith('Đã lưu tạm'));
  await page.reload();await page.locator('#local-draft-restore:visible').waitFor();
  await page.locator('#local-draft-restore').click();
  assert.equal(await page.locator(`[name="${name}"]`).inputValue(),'12,345','Raw local draft restored');
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});dispatchEvent(new Event('offline'));});
  await page.locator(`[name="${name}"]`).fill('23,456');
  await page.waitForFunction(()=>document.querySelector('#local-draft-status').textContent.startsWith('Đã lưu tạm'));
  assert.match(await page.locator('#entry-network').innerText(),/Mất mạng/);
  assert.equal(await page.locator('#record-save').isDisabled(),true);
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:true});dispatchEvent(new Event('online'));});
  await page.locator('#print').click();await page.locator('#print-review[open]').waitFor();
  assert.match(await page.locator('#print-review-state').innerText(),/Lưu hồ sơ/);
  assert.equal(await page.locator('#print-review-generate').isDisabled(),true);
  await page.locator('#print-review-close').click();
  await page.evaluate(()=>uiTest.delaySave=true);await page.locator('#record-save').click();
  await page.waitForFunction(()=>typeof uiTest.saveRelease==='function');await page.locator(`[name="${name}"]`).fill('24,567');
  await page.evaluate(()=>{uiTest.saveRelease();uiTest.delaySave=false;});
  await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('các thay đổi mới hơn'));
  await page.locator('#record-save').click();await page.waitForFunction(()=>document.querySelector('#record-state').textContent.includes('phiên bản 2'));
  assert.equal(await page.evaluate(()=>uiTest.calls.filter(x=>x.action==='save').at(-1).options.recordId),'synthetic-only','Save after typing updates acknowledged record');
  await page.locator('#print').click();await page.locator('#print-review-generate').click();
  await page.locator('#print-review-download[href^="blob:"]').waitFor();await page.locator('#print-review-close').click();
  await page.evaluate(()=>uiTest.delayReport=true);
  await page.locator('#print').click();await page.locator('#print-review-generate').click();
  await page.waitForFunction(()=>typeof uiTest.reportRelease==='function');await page.locator('#print-review-close').click();
  await page.locator(`[name="${name}"]`).fill('33,333');await page.evaluate(()=>{uiTest.reportRelease();uiTest.delayReport=false;});
  await page.waitForFunction(()=>!document.querySelector('#print-review-generate').hasAttribute('aria-busy'));
  assert.equal(await page.locator('#print-review-download').getAttribute('href'),null,'Edited input invalidates in-flight PDF');
  await page.locator(`[name="${name}"]`).fill('34,567');
  await page.waitForFunction(()=>document.querySelector('#local-draft-status').textContent.startsWith('Đã lưu tạm'));
  await page.evaluate(()=>window.CPC1Recovery.end());
  await page.reload();await page.waitForFunction(()=>!document.querySelector('#evaluate').disabled);
  assert.equal(await page.locator('#local-draft-enable').isChecked(),false,'Signout clears device recovery');
  assert.equal(await page.locator('#local-draft-restore').isVisible(),false);
 }
 // Reject unexpected fields and cross-system import before replacing current raw data.
 await page.goto(base+'/tham-dinh-thuc-te/gas.html?system=air');await page.waitForFunction(()=>!document.querySelector('#evaluate').disabled);
 await page.locator('#draft-file').setInputFiles(fixtures+'/air.json');await page.waitForFunction(()=>[...document.querySelectorAll('#form-body input')].some(x=>x.value));
 const beforeImport=await page.locator('#form-body input').first().inputValue();
 await page.locator('#draft-file').setInputFiles(fixtures+'/nitrogen.json');await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('hệ thống khác'));
 assert.equal(await page.locator('#form-body input').first().inputValue(),beforeImport);
 await page.locator('#draft-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,data:{system:'air',meta:{token:'must-reject'},equipment:{},forms:{},controls:{},trend:{}}}))});
 await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('không đúng định dạng'));
 assert.equal(await page.locator('#form-body input').first().inputValue(),beforeImport);
 // Two real tabs: neither may silently replace the other's committed recovery slot.
 const steam=base+'/tham-dinh-thuc-te/steam.html';await page.goto(steam);
 await page.waitForFunction(()=>!document.querySelector('#evaluate').disabled);
 await page.locator('#draft-file').setInputFiles(fixtures+'/steam.json');
 await page.waitForFunction(()=>[...document.querySelectorAll('#form-body input')].some(x=>x.value));
 await page.locator('#local-draft-enable').check();await page.locator('#form-body input').first().fill('41');
 await page.waitForFunction(()=>document.querySelector('#local-draft-status').textContent.startsWith('Đã lưu tạm'));
 const second=await page.context().newPage();second.on('dialog',d=>d.accept());
 await second.goto(steam);await second.locator('#local-draft-restore:visible').click();await second.locator('#form-body input').first().fill('42');
 await second.waitForFunction(()=>document.querySelector('#local-draft-status').textContent.startsWith('Đã lưu tạm'));
 await page.locator('#form-body input').first().fill('43');
 await page.waitForFunction(()=>document.querySelector('#local-draft-status').textContent.includes('tab khác'));
 assert.equal(await page.locator('#form-body input').first().inputValue(),'43');
 await second.reload();await second.locator('#local-draft-restore:visible').click();assert.equal(await second.locator('#form-body input').first().inputValue(),'42');
 // Same origin, another account must not receive the first account's draft.
 await second.evaluate(()=>localStorage.setItem('test-actor','synthetic-other'));await second.reload();await second.locator('#local-draft-enable').waitFor();
 assert.equal(await second.locator('#local-draft-restore').isVisible(),false);
 await second.evaluate(()=>{localStorage.removeItem('test-actor');localStorage.setItem('test-readonly','1');});await second.reload();await second.locator('#evaluate').waitFor();
 assert.equal(await second.locator('#local-draft-enable').count(),0,'Read-only user cannot access recovery');
 await second.evaluate(()=>localStorage.removeItem('test-readonly'));await second.close();
 await page.evaluate(async()=>{for(const cb of uiTest.listeners)cb('SIGNED_OUT',null);await window.CPC1Recovery.end();});
 await page.reload();await page.locator('#local-draft-enable').waitFor();assert.equal(await page.locator('#local-draft-restore').isVisible(),false);
 // Blocked device storage degrades to explicit JSON download without breaking form entry.
 await page.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('blocked','SecurityError');}});});
 await page.reload();await page.waitForFunction(()=>document.querySelector('#local-draft-status')?.textContent.includes('Không mở được'));
 await page.locator('#form-body input').first().fill('44');assert.equal(await page.locator('#form-body input').first().inputValue(),'44');
 console.log('Recovery UI: 3 systems raw input/reload/manual restore/offline capture/saved-only PDF/scoped signout passed.');
}

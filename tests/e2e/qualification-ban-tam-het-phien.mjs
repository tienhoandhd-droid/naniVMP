// C1 (rà soát 10/11): hết phiên / mất quyền → lưu nốt bản tạm của đúng tài khoản, KHÔNG xoá.
// Headless, mọi request phục vụ tại chỗ; trang thử tối giản gồm draft-store.js + draft-recovery.js
// với máy chủ giả. Bản tạm gắn scope = [url, userId] nên tài khoản khác không thấy.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const root = new URL('../..', import.meta.url).pathname;
const trang = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Thử bản tạm</title></head>
<body><main><div class="action-bar"></div><form id="entry-form"><div id="form-body"></div></form></main>
<script src="./gia-lap.js"></script><script src="./draft-store.js"></script><script src="./draft-recovery.js"></script></body></html>`;
// Máy chủ giả + trang nhập giả: người dùng lấy từ sessionStorage để "đăng nhập lại" bằng cách tải lại trang.
const giaLap = `
window.CPC1_SETTINGS={url:'https://vmp.test'};
window.__nghe=[];window.__coQuyen=true;
window.CPC1Backend={canSaveActive:()=>window.__coQuyen,onSessionChange:cb=>{window.__nghe.push(cb);return {};},
 checkDraftAccess:async()=>{},refreshAccess:async()=>{},runBinding:null};
window.__state={system:'steam',runId:null,userId:sessionStorage.getItem('nguoi')||'user-a',dirty:false,generation:0,
 snapshot:{data:{meta:{remarks:''}},recordId:null,version:null,form:'bm01',point:'P1'}};
window.__adapter={get:()=>window.__state,restore:async s=>{window.__state.snapshot=s;window.__restored=s;}};
window.__go=value=>{const s=window.__state;s.snapshot={...s.snapshot,data:{meta:{remarks:value}}};s.dirty=true;s.generation++;window.CPC1Recovery.changed();};
window.__hetPhien=()=>{window.CPC1_SESSION_ENDED=true;for(const cb of window.__nghe)cb('SIGNED_OUT',null);};
window.__docBanTam=async user=>(await window.CPC1DraftStore.read(JSON.stringify(['https://vmp.test',user]),'steam'))?.payload?.data?.meta?.remarks??null;`;

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || chromium.executablePath() });
const context = await browser.newContext({ locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
const errors = [];
const page = await context.newPage(); page.setDefaultTimeout(8000);
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', d => d.accept());
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== 'http://qualification.test') return route.abort();
  if (url.pathname.endsWith('/thu-ban-tam.html')) return route.fulfill({ contentType: 'text/html', body: trang });
  if (url.pathname.endsWith('/gia-lap.js')) return route.fulfill({ contentType: 'text/javascript', body: giaLap });
  try { return route.fulfill({ body: await readFile(root + '/public' + url.pathname), contentType: 'text/javascript' }); }
  catch { return route.fulfill({ status: 404, body: '' }); }
});
const URL_THU = 'http://qualification.test/tham-dinh-thuc-te/thu-ban-tam.html';
async function moVoi(nguoi) {
  await page.evaluate(n => sessionStorage.setItem('nguoi', n), nguoi);
  await page.goto(URL_THU);
  await page.evaluate(() => window.CPC1Recovery.start(window.__adapter));
  await page.locator('#local-draft-status').waitFor(); // start() chờ đọc xong bộ nhớ máy rồi mới trả về
}
await page.goto(URL_THU);

// 1) Gõ một ô rồi hết phiên NGAY (trước khi hẹn giờ 250 ms lưu tạm chạy) → bản tạm vẫn được lưu nốt, không bị xoá.
await moVoi('user-a');
await page.evaluate(() => window.__go('12,345'));
await page.evaluate(() => window.__hetPhien());
await page.waitForFunction(() => !document.getElementById('local-draft-panel'));
await page.waitForTimeout(400);
assert.equal(await page.evaluate(() => window.__docBanTam('user-a')), '12,345', 'C1: hết phiên thì lưu nốt bản tạm, không xoá');

// 2) Đăng nhập lại đúng người → có thông báo "Có bản đang nhập…" và khôi phục được số vừa gõ.
await moVoi('user-a');
await page.locator('#local-draft-status').getByText(/^Có bản đang nhập từ /).waitFor();
assert.equal(await page.locator('#local-draft-restore').isVisible(), true);
await page.click('#local-draft-restore');
await page.waitForFunction(() => window.__restored);
assert.equal(await page.evaluate(() => window.__restored.data.meta.remarks), '12,345');

// 3) Người khác đăng nhập trên cùng máy → không thấy bản tạm của user-a.
await moVoi('user-b');
assert.equal(await page.locator('#local-draft-restore').isVisible(), false, 'C1: tài khoản khác không thấy bản tạm');
assert.doesNotMatch(await page.locator('#local-draft-status').textContent(), /Có bản đang nhập/);
assert.equal(await page.evaluate(() => window.__docBanTam('user-b')), null);

// 4) Mất quyền nhập giữa chừng (cpc1:permissions) → cũng lưu nốt bản tạm của user-b, không xoá.
await page.evaluate(() => window.__go('7,5'));
await page.evaluate(() => { window.__coQuyen = false; window.dispatchEvent(new Event('cpc1:permissions')); });
await page.waitForFunction(() => !document.getElementById('local-draft-panel'));
await page.waitForTimeout(400);
assert.equal(await page.evaluate(() => window.__docBanTam('user-b')), '7,5', 'C1: mất quyền thì lưu nốt bản tạm, không xoá');
assert.equal(await page.evaluate(() => window.__docBanTam('user-a')), '12,345', 'C1: bản tạm của user-a vẫn còn');

// 5) Nút "Xóa bản tạm trên máy" vẫn xoá tay được.
await moVoi('user-a');
await page.locator('#local-draft-clear').click();
await page.locator('#local-draft-status').getByText('Đã xóa bản tạm trên máy. Tự lưu vẫn bật.').waitFor();
assert.equal(await page.evaluate(() => window.__docBanTam('user-a')), null);

assert.deepEqual(errors, []);
await browser.close();
console.log('PASS ban-tam-het-phien: hết phiên/mất quyền lưu nốt bản tạm đúng tài khoản, người khác không thấy, xoá tay vẫn được');

// Trang Nhật ký thay đổi (gói 2, 16/10) — headless, mọi request phục vụ tại chỗ.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const root = new URL('../..', import.meta.url).pathname;
const rows = [
  { thoi_diem: '2026-10-16T02:30:00Z', loai: 'sua', he_thong: 'air', dot: 'Đợt tháng 10', ho_so: 'r1', phien_ban: 3, nguoi: 'QA Một', ly_do: 'Nhập nhầm đơn vị', thay_doi: [{ path: ['forms', 'bm01', 'P1', 'p05'], before: '12', after: '15' }], chi_tiet: null },
  { thoi_diem: '2026-10-16T03:00:00Z', loai: 'in', he_thong: 'air', dot: 'Đợt tháng 10', ho_so: 'r1', phien_ban: 3, nguoi: 'QA Một', ly_do: null, thay_doi: null, chi_tiet: 'BM01 · SHA-256 abcdef012345' },
  { thoi_diem: '2026-09-28T05:00:00Z', loai: 'dot', he_thong: 'steam', dot: 'Đợt tháng 9', ho_so: null, phien_ban: null, nguoi: 'Admin', ly_do: null, thay_doi: null, chi_tiet: 'history_imported' },
];
const fixture = `
window.__calls=[];
window.CPC1Backend={getSession:async()=>({user:{id:'qa'}}),permissionsFor:()=>({can_view:true}),
 auditTrail:async f=>{window.__calls.push(f);const k=sessionStorage.getItem('kich-ban');
  if(k==='loi')throw new Error('mất mạng');if(k==='rong')return {ok:true,rows:[]};return {ok:true,rows:${JSON.stringify(rows)}};}};
document.body.dataset.qualificationGate='ready';`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
const errors = [];
async function mo(kichBan) {
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://qualification.test') return route.abort();
    if (url.pathname.endsWith('/cloud.js')) return route.fulfill({ contentType: 'text/javascript', body: fixture });
    if (url.pathname.endsWith('/runtime-config.js')) return route.fulfill({ contentType: 'text/javascript', body: 'window.CPC1_SETTINGS={};' });
    try {
      const file = root + '/public' + url.pathname, ext = file.split('.').at(-1);
      return route.fulfill({ body: await readFile(file), contentType: ({ html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png' })[ext] || 'application/octet-stream' });
    } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await page.addInitScript(k => sessionStorage.setItem('kich-ban', k), kichBan);
  await page.goto('http://qualification.test/tham-dinh-thuc-te/nhat-ky.html');
  return page;
}

// Có dữ liệu: nhãn tiếng Việt, giá trị cũ → mới, ngày dd/mm/yyyy, CSV
const page = await mo('du-lieu');
await page.locator('#nk-bang tbody tr').first().waitFor();
const bang = await page.locator('#nk-bang tbody tr').evaluateAll(trs => trs.map(tr => [...tr.cells].map(td => td.textContent)));
assert.equal(bang.length, 3);
assert.equal(bang[0][0], '16/10/2026 09:30', 'thời điểm dd/mm/yyyy HH:mm theo giờ VN (02:30Z = 09:30)');
assert.deepEqual([bang[0][2], bang[0][6], bang[0][7]], ['Sửa số liệu', 'forms › bm01 › P1 › p05: 12 → 15', 'Nhập nhầm đơn vị']);
assert.equal(bang[1][2], 'In PDF');
assert.deepEqual([bang[2][2], bang[2][3], bang[2][6]], ['Sự kiện đợt', 'Hơi tinh khiết', 'Nhập dữ liệu lịch sử']);
assert.match(await page.locator('#nk-trang-thai').textContent(), /^3 sự kiện/);
await page.selectOption('#nk-he-thong', 'air');
await page.fill('#nk-tu', '2026-10-01');
await page.fill('#nk-den', '2026-10-16');
await page.click('#nhat-ky-loc button[type=submit]');
await page.waitForFunction(() => window.__calls.length === 2);
assert.deepEqual(await page.evaluate(() => window.__calls.at(-1)), { system: 'air', from: '2026-10-01', to: '2026-10-16' });
const [taiVe] = await Promise.all([page.waitForEvent('download'), page.click('#nk-xuat')]);
const csv = await readFile(await taiVe.path(), 'utf8');
assert.ok(csv.startsWith('﻿"Thời điểm","Người","Hành động"'), 'CSV có BOM và tiêu đề tiếng Việt');
assert.match(csv, /"Nhập nhầm đơn vị"/);

// Trống
const rong = await mo('rong');
await rong.locator('#nk-trang-thai').getByText('Không có sự kiện nào').waitFor();
assert.equal(await rong.locator('#nk-bang').isHidden(), true);
assert.equal(await rong.locator('#nk-xuat').isDisabled(), true);

// Lỗi
const loi = await mo('loi');
await loi.locator('#nk-trang-thai').getByText('Không tải được nhật ký: mất mạng').waitFor();
assert.equal(await loi.locator('#nk-xuat').isDisabled(), true);

assert.deepEqual(errors, []);
await browser.close();
console.log('PASS audit trail page: Vietnamese labels, before→after with reason, dd/mm time, filters, CSV with BOM, empty and error states');

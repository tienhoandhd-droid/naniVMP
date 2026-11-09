// Tab Tổng quan của Thẩm định thực tế (09/11/2026) — headless, mọi request phục vụ tại chỗ,
// backend giả lập (không gọi Supabase). Kiểm: số liệu, đợt gần nhất + đợt cũ, liên kết mở hồ sơ,
// 4 trạng thái (đang tải / lỗi + thử lại / rỗng / có dữ liệu), bàn phím, không cuộn ngang, axe.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const root = new URL('../..', import.meta.url).pathname;
const YEAR = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 4));
const p = (total, complete, fail = 0, invalid = 0) => ({ total, complete, fail, invalid, controls_ready: true, ready: total === complete });
const data = { year: YEAR, systems: [
  { system: 'air', objects: ['HT-12'], pq_items: [{ id: `HT-12/${YEAR}.01-PQ`, object_code: 'HT-12', status_validation: 'in_progress', status_validation_text: 'Đang thực hiện' }],
    runs: [
      { run_id: 'run-11', title: 'Đợt tháng 11', started_on: `${YEAR}-11-03`, status: 'open', record_id: 'rec-air-11', version: 2, progress: p(24, 18, 1), sign_state: 'chua_ky' },
      { run_id: 'run-03', title: 'Đợt tháng 03', started_on: `${YEAR}-03-01`, status: 'closed', record_id: 'rec-air-03', version: 2, progress: p(24, 24), sign_state: 'da_duyet' },
    ] },
  { system: 'nitrogen', objects: ['HT-13'], pq_items: [{ id: `HT-13/${YEAR}.01-PQ`, object_code: 'HT-13', status_validation: 'completed', status_validation_text: 'Hoàn thành' }],
    runs: [{ run_id: 'run-11', title: 'Đợt tháng 11', started_on: `${YEAR}-11-03`, status: 'open', record_id: 'rec-n2-11', version: 1, progress: p(12, 12, 0, 1), sign_state: 'da_kiem_tra' }] },
  { system: 'steam', objects: ['HT-14', 'HT-15'], pq_items: [], runs: [] },
] };
const empty = { year: YEAR, systems: data.systems.map(s => ({ ...s, pq_items: [], runs: [] })) };

const fixture = `
window.__calls=[];
window.CPC1Backend={getSession:async()=>({user:{id:'qa'}}),permissionsFor:()=>({can_view:false,can_view_current:false,can_enter:false}),
 listRuns:async()=>[],listHistory:async()=>[],
 overview:async year=>{window.__calls.push(year);const k=sessionStorage.getItem('kich-ban');
  if(k==='cham')await new Promise(r=>setTimeout(r,600));
  if(k==='loi'&&window.__calls.length===1)throw new Error('Mất kết nối máy chủ.');
  return k==='rong'?${JSON.stringify(empty)}:${JSON.stringify(data)};}};
document.body.dataset.qualificationGate='ready';`;

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || chromium.executablePath() });
const context = await browser.newContext({ locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', viewport: { width: 1440, height: 1000 } });
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
  await page.goto('http://qualification.test/tham-dinh-thuc-te/runs.html');
  return page;
}
const text = (page, sel) => page.locator(sel).innerText();

try {
  // 1. Có dữ liệu — chưa gọi máy chủ cho tới khi mở tab.
  let page = await mo('cham');
  await page.getByRole('tab', { name: 'Đợt thực hiện' }).waitFor();
  assert.equal(await page.evaluate(() => window.__calls.length), 0, 'chỉ tải tổng quan khi mở tab');
  await page.getByRole('tab', { name: 'Tổng quan' }).click();
  await page.locator('#overview-body', { hasText: 'Đang tải' }).waitFor();
  await page.locator('[data-overview-system="air"]').waitFor();
  assert.deepEqual(await page.evaluate(() => window.__calls), [YEAR]);
  assert.equal(await text(page, '#overview-title'), `Tổng quan thẩm định thực tế ${YEAR}`);
  const stats = (await text(page, '.ov-stats')).replace(/\s+/g, ' ');
  assert.match(stats, /Đợt đang mở 1/, 'một đợt chung hai hệ thống chỉ đếm một lần');
  assert.match(stats, /Hồ sơ đã duyệt 1\/3/);
  assert.match(stats, /Điểm không đạt 1/);
  const air = (await text(page, '[data-overview-system="air"]')).replace(/\s+/g, ' ');
  assert.match(air, /Khí nén · HT-12/);
  assert.match(air, new RegExp(`HT-12/${YEAR}\\.01-PQ Đang thực hiện`));
  assert.match(air, /Đợt tháng 11 03\/11\//, 'đợt gần nhất hiện trước, ngày dd/mm/yyyy');
  assert.match(air, /Đã có kết quả 18\/24 \(75%\) · Không đạt 1/);
  assert.match(air, /Chưa ký/);
  assert.match(air, /Các đợt khác trong năm \(1\)/);
  assert.equal(await page.locator('[data-overview-system="air"] > .ov-run a').getAttribute('href'), './gas.html?system=air&run=run-11&record=rec-air-11');
  assert.equal(await page.locator('[data-overview-system="air"] .ov-more .ov-run').isVisible(), false, 'đợt cũ thu gọn');
  const n2 = (await text(page, '[data-overview-system="nitrogen"]')).replace(/\s+/g, ' ');
  assert.match(n2, /Cần kiểm tra 1/);
  assert.match(n2, /Đã kiểm tra/);
  const steam = (await text(page, '[data-overview-system="steam"]')).replace(/\s+/g, ' ');
  assert.match(steam, /Hơi tinh khiết · HT-14 \/ HT-15/);
  assert.match(steam, new RegExp(`Chưa có đợt trong năm ${YEAR}`));
  assert.match(steam, new RegExp(`Không có PQ ${YEAR} trong phạm vi của bạn`));
  // Mở lại tab không gọi lại máy chủ; nút Tải lại thì gọi.
  await page.getByRole('tab', { name: 'Đợt thực hiện' }).click();
  await page.getByRole('tab', { name: 'Tổng quan' }).click();
  assert.equal(await page.evaluate(() => window.__calls.length), 1);
  await page.locator('#reload-overview').click();
  await page.waitForFunction(() => window.__calls.length === 2);
  // Bàn phím: ← từ Tổng quan về Biểu đồ, End về Tổng quan.
  await page.getByRole('tab', { name: 'Tổng quan' }).focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.getByRole('tab', { name: 'Biểu đồ lấy mẫu' }).getAttribute('aria-selected'), 'true');
  await page.keyboard.press('End');
  assert.equal(await page.getByRole('tab', { name: 'Tổng quan' }).getAttribute('aria-selected'), 'true');
  // Không cuộn ngang ở các bề rộng thường gặp.
  await page.locator('[data-overview-system="air"]').waitFor();
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `cuộn ngang ở ${width}px`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addScriptTag({ path: root + '/node_modules/axe-core/axe.min.js' });
  const violations = await page.evaluate(async () => (await axe.run(document.querySelector('#overview-panel'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target).join(',')}`));
  assert.deepEqual(violations, [], 'axe');
  if (process.env.OV_SHOT) await page.locator('#overview-panel').screenshot({ path: process.env.OV_SHOT });
  await page.close();

  // 2. Lỗi → báo lỗi, không hiện số; bấm Thử lại thì tải được.
  page = await mo('loi');
  await page.getByRole('tab', { name: 'Tổng quan' }).click();
  await page.getByRole('alert').filter({ hasText: 'Mất kết nối máy chủ.' }).waitFor();
  assert.equal(await page.locator('.ov-stats').count(), 0);
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await page.locator('[data-overview-system="air"]').waitFor();
  await page.close();

  // 3. Rỗng → mỗi hệ thống báo chưa có đợt, số liệu = 0.
  page = await mo('rong');
  await page.getByRole('tab', { name: 'Tổng quan' }).click();
  await page.locator('[data-overview-system="steam"]').waitFor();
  assert.match((await text(page, '.ov-stats')).replace(/\s+/g, ' '), /Đợt đang mở 0 Hồ sơ đã duyệt 0\/0 Điểm không đạt 0/);
  assert.equal(await page.getByText(`Chưa có đợt trong năm ${YEAR}`).count(), 3);
  await page.close();

  assert.deepEqual(errors, [], 'lỗi JavaScript trên trang');
  console.log('qualification overview E2E: pass');
} finally {
  await browser.close();
}

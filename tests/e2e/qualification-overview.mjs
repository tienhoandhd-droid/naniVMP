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
const airCfg = { forms: [
  { id: 'bm01', title: 'Tiểu phân', fields: [{ key: 'p05', label: 'Tiểu phân ≥ 0,5 µm', unit: 'hạt/m³' }, { key: 'executed_by', label: 'Người thực hiện', unit: '' }], locations: [{ id: 'A1', name: 'Tank chứa khí nén' }, { id: 'A2', name: 'Phòng pha chế' }] },
  { id: 'bm02', title: 'Vi sinh', fields: [{ key: 'cfu', label: 'Vi sinh', unit: 'CFU/m³' }], locations: [{ id: 'A1', name: 'Tank chứa khí nén' }, { id: 'A2', name: 'Phòng pha chế' }] }] };
const snapshots = {
  'rec-air-11': { id: 'rec-air-11', version: 2, data: { forms: { bm01: { A1: { p05: '330', executed_by: 'Hoàn' }, A2: { p05: '4100' } }, bm02: { A1: { cfu: 'KPH' } } } },
    evaluation: { forms: { bm01: { rows: { A1: { status: 'pass', errors: {} }, A2: { status: 'fail', errors: {} } } }, bm02: { rows: { A1: { status: 'invalid', errors: { cfu: 'Nhập số thập phân hợp lệ.' } } } } }, source_context: { config: airCfg } } },
  'rec-n2-11': { id: 'rec-n2-11', version: 1, data: { forms: { bm01: { N1: { p05: '12' } } } },
    evaluation: { forms: { bm01: { rows: { N1: { status: 'pass', errors: {} } } } }, source_context: { config: { forms: [{ id: 'bm01', title: 'Tiểu phân', fields: [{ key: 'p05', label: 'Tiểu phân ≥ 0,5 µm', unit: 'hạt/m³' }], locations: [{ id: 'N1', name: 'Bồn nitơ' }] }] } } } },
};
const runList = [
  { id: 'run-11', items: [{ system: 'air', record_id: 'rec-air-11', scope: { bm01: ['A1', 'A2'], bm02: ['A1', 'A2'] } }, { system: 'nitrogen', record_id: 'rec-n2-11', scope: { bm01: ['N1'] } }] },
  { id: 'run-03', items: [{ system: 'air', record_id: 'rec-air-03', scope: { bm01: ['A1'] } }] },
];
const empty = { year: YEAR, systems: data.systems.map(s => ({ ...s, pq_items: [], runs: [] })) };

const fixture = `
window.__calls=[];
window.CPC1Backend={getSession:async()=>({user:{id:'qa'}}),permissionsFor:()=>({can_view:false,can_view_current:false,can_enter:false}),
 listRuns:async()=>${JSON.stringify(runList)},listHistory:async()=>[],
 historySnapshot:async(id,version)=>{window.__snaps=(window.__snaps||0)+1;if(sessionStorage.getItem('kich-ban')==='loi-diem'&&window.__snaps===1)throw new Error('Không tải được hồ sơ.');const s=${JSON.stringify(snapshots)}[id];if(!s||s.version!==version)throw new Error('Không có hồ sơ '+id);return s;},
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
  // Bảng điểm: mặc định đợt gần nhất của hệ thống đầu tiên có đợt (khí nén).
  await page.locator('.ov-point-table').waitFor();
  assert.equal(await page.locator('#ov-grid-system').inputValue(), 'air');
  assert.equal(await page.locator('#ov-grid-run').inputValue(), 'run-11');
  assert.match((await text(page, '.ov-point-table caption')).replace(/\s+/g, ' '), /Đã có kết quả 2\/4 · Không đạt 1 · Cần kiểm tra 1 · Chưa có kết quả 1/);
  assert.deepEqual(await page.locator('.ov-point-table thead th').allInnerTexts(), ['Điểm', 'BM01 · Tiểu phân', 'BM02 · Vi sinh']);
  assert.deepEqual(await page.locator('.ov-point-table tbody tr').evaluateAll(rows => rows.map(r => [...r.querySelectorAll('td button')].map(b => b.textContent))), [['✓', '!'], ['✗', '—']]);
  await page.getByRole('button', { name: 'A1 · BM02: Cần kiểm tra' }).click();
  const chiTiet = (await text(page, '#ov-point-detail')).replace(/\s+/g, ' ');
  assert.match(chiTiet, /A1 · Vi sinh/);
  assert.match(chiTiet, /Vi sinh KPH CFU\/m³/, 'hiện số gốc đã nhập kèm đơn vị');
  assert.match(chiTiet, /Vi sinh: Nhập số thập phân hợp lệ\./, 'hiện lý do cần kiểm tra');
  await page.getByRole('button', { name: 'A1 · BM01: Đạt' }).click();
  assert.match((await text(page, '#ov-point-detail')).replace(/\s+/g, ' '), /Tiểu phân ≥ 0,5 µm 330 hạt\/m³ Người thực hiện Hoàn/);
  assert.equal(await page.getByRole('button', { name: 'A1 · BM01: Đạt' }).getAttribute('aria-pressed'), 'true');
  // Đổi hệ thống → đợt gần nhất của nitơ.
  await page.locator('#ov-grid-system').selectOption('nitrogen');
  await page.locator('.ov-point-table caption', { hasText: 'Đã có kết quả 1/1' }).waitFor();
  assert.equal(await page.locator('#ov-grid-run').inputValue(), 'run-11');
  // Nút "Xem bảng điểm" trên thẻ khí nén đưa bảng về khí nén.
  await page.locator('[data-overview-system="air"] .ov-open-grid').click();
  await page.locator('.ov-point-table caption', { hasText: 'Đã có kết quả 2/4' }).waitFor();
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

  // 2b. Lỗi tải hồ sơ của bảng điểm → báo lỗi trong khung bảng, bấm Thử lại thì hiện bảng.
  page = await mo('loi-diem');
  await page.getByRole('tab', { name: 'Tổng quan' }).click();
  await page.locator('#ov-grid [role="alert"]', { hasText: 'Không tải được hồ sơ.' }).waitFor();
  assert.equal(await page.locator('[data-overview-system="air"]').count(), 1, 'lỗi bảng điểm không làm mất phần tổng');
  await page.locator('#ov-grid').getByRole('button', { name: 'Thử lại' }).click();
  await page.locator('.ov-point-table').waitFor();
  await page.close();

  // 3. Rỗng → mỗi hệ thống báo chưa có đợt, số liệu = 0.
  page = await mo('rong');
  await page.getByRole('tab', { name: 'Tổng quan' }).click();
  await page.locator('[data-overview-system="steam"]').waitFor();
  assert.match((await text(page, '.ov-stats')).replace(/\s+/g, ' '), /Đợt đang mở 0 Hồ sơ đã duyệt 0\/0 Điểm không đạt 0/);
  assert.equal(await page.getByText(`Chưa có đợt trong năm ${YEAR}`).count(), 3);
  assert.match(await text(page, '#ov-grid'), /Chưa có đợt để xem\./);
  await page.close();

  assert.deepEqual(errors, [], 'lỗi JavaScript trên trang');
  console.log('qualification overview E2E: pass');
} finally {
  await browser.close();
}

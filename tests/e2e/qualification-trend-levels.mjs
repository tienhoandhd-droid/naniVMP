// Ngưỡng cảnh báo / hành động trên biểu đồ qua các đợt (gói 4, 16/10) — headless, mọi request phục vụ tại chỗ.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const root = new URL('../..', import.meta.url).pathname;
// 3 đợt đã đóng; điểm sương khí nén (giới hạn trên). Ngưỡng chung: cảnh báo -15, hành động -10.
// P1: -20 → -14 → -13 (vượt cảnh báo 2 đợt liên tiếp) · P2: vượt hành động ở 07/2026 · P3, P4 trong ngưỡng.
const giaTri = { P1: [-20, -14, -13], P2: [-30, -31, -8], P3: [-25, -24, -26], P4: [-28, -27, -29] };
const thang = ['2026-03-01', '2026-05-01', '2026-07-01'];
const runs = thang.map((_, i) => ({ id: `run-${i}`, title: `Đợt ${i + 1}`, status: 'closed', items: [], progress: {}, mode: 'single', started_on: thang[i], version: 1 }));
const history = thang.map((period, i) => ({
  run_id: `run-${i}`, record_id: `rec-${i}`, version: 1, system: 'air', period, sources: [], issues: [],
  trend: Object.entries(giaTri).map(([point_id, v]) => ({ form: 'bm02', metric: 'result', unit: '°C', label: 'Điểm sương', point_id, trial: 1, value: v[i], source_value: String(v[i]), computed_status: 'pass' })),
}));
const nguong = { form: 'bm02', metric: 'result', point_id: '', unit: '°C', direction: 'max', alert: -15, action: -10, hieu_luc_tu: '2026-01-01', ly_do: 'Theo số liệu PQ 2025', phien_ban: 1, nguoi: 'Admin', luc: '2026-01-01T00:00:00Z', hien_hanh: true };
const fixture = `
const kichBan=sessionStorage.getItem('kich-ban');
window.__set=[];let rows=${JSON.stringify([nguong])};
const cauHinh={system:'air',forms:[{id:'bm02',title:'Điểm sương',kind:'measurement',locations:['P1','P2','P3','P4'].map((id,i)=>({id,name:'Phòng '+(i+1)}))}]};
window.CPC1Backend={permissionsFor:()=>({can_view:true,can_view_current:true,can_enter:false}),getSession:async()=>({user:{id:'u'}}),getConfig:async()=>({locations:[]}),getGasConfig:async()=>cauHinh,
 listRuns:async()=>${JSON.stringify(runs)},listHistory:async()=>${JSON.stringify(history)},runRequirements:async()=>[],
 historySnapshot:async(id,version)=>({id,version,data:{system:'air',forms:{}},evaluation:{forms:{},source_context:{}}}),
 trendLimits:async()=>{if(kichBan==='loi')throw new Error('mất mạng');return {ok:true,co_the_dat:kichBan==='admin',rows};},
 setTrendLimit:async limit=>{window.__set.push(limit);rows=[{...${JSON.stringify(nguong)},point_id:limit.pointId,hieu_luc_tu:limit.from,alert:limit.alert,action:limit.action,ly_do:limit.reason,phien_ban:1}, ...rows];return {ok:true,phien_ban:1};}};
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
  await page.goto('http://qualification.test/tham-dinh-thuc-te/runs.html?view=trend&system=air');
  await page.locator('#runs-status').getByText('Đã tải dữ liệu đợt và xu hướng.').waitFor();
  return page;
}

// QA: thấy đường cảnh báo/hành động, điểm vượt, cảnh báo xu hướng; xem bảng ngưỡng nhưng không có ô nhập.
const qa = await mo('qa');
await qa.locator('#multi-trend-chart line.alert-line').waitFor({ state: 'attached' }); // đường ngang cao 0px nên Playwright coi là ẩn
assert.equal(await qa.locator('#multi-trend-chart line.alert-line').getAttribute('data-level'), 'alert:-15');
assert.equal(await qa.locator('#multi-trend-chart line.action-line').getAttribute('data-level'), 'action:-10');
assert.equal(await qa.locator('#multi-trend-chart circle[data-muc="action"]').count(), 1, 'P2 tháng 07 vượt hành động');
assert.equal(await qa.locator('#multi-trend-chart circle[data-muc="alert"]').count(), 2, 'P1 tháng 05 và 07 vượt cảnh báo');
assert.match(await qa.locator('#multi-trend-chart circle[data-muc="action"] title').textContent(), /-8 °C · vượt mức hành động$/);
const canhBao = await qa.locator('#multi-trend-signals li').allTextContents();
assert.deepEqual(canhBao, ['P2 — Phòng 2 · 07/2026: vượt mức hành động — cần điều tra.', 'P1 — Phòng 1: vượt mức cảnh báo 2 đợt liên tiếp (05/2026–07/2026) — xem xét xu hướng.']);
await qa.locator('#history-chart-details > summary').click();
await qa.locator('#nguong-panel summary').click();
assert.match(await qa.locator('#nguong-trang-thai').textContent(), /^1 ngưỡng đang áp dụng/);
assert.deepEqual(await qa.locator('#nguong-bang tbody td').allTextContents(),
  ['BM02 · Điểm sương (°C) · giới hạn trên', 'Tất cả điểm', '-15', '-10', '01/01/2026', 'v1 · đang áp dụng', 'Admin', 'Theo số liệu PQ 2025']);
assert.equal(await qa.locator('#nguong-form').isHidden(), true, 'QA không có ô nhập ngưỡng');

// Admin: gợi ý từ 12 kết quả, dùng gợi ý chỉ điền ô (không tự lưu), bắt lý do, lưu đúng tham số.
const admin = await mo('admin');
await admin.locator('#history-chart-details > summary').click();
await admin.locator('#nguong-panel summary').click();
await admin.locator('#nguong-form').waitFor();
assert.match(await admin.locator('#nguong-goi-y').textContent(), /^Gợi ý từ 12 kết quả: trung bình .* Chỉ là gợi ý; QA xem xét trước khi áp\.$/);
await admin.click('#nguong-dung-goi-y');
assert.notEqual(await admin.inputValue('#nguong-canh-bao'), '');
assert.deepEqual(await admin.evaluate(() => window.__set), [], 'dùng gợi ý không tự lưu');
await admin.selectOption('#nguong-diem', 'P1');
assert.match(await admin.locator('#nguong-goi-y').textContent(), /Cần ít nhất 10 kết quả để gợi ý \(hiện có 3\)/);
await admin.fill('#nguong-canh-bao', '-12');
await admin.fill('#nguong-hanh-dong', '-16');
await admin.fill('#nguong-ly-do', 'Siết riêng cho P1');
await admin.click('#nguong-form button[type=submit]');
assert.equal(await admin.locator('#nguong-loi').textContent(), 'Ngưỡng cảnh báo phải nhỏ hơn ngưỡng hành động.');
await admin.fill('#nguong-canh-bao', '-18');
await admin.fill('#nguong-hanh-dong', '-14,5');
await admin.fill('#nguong-ly-do', '');
await admin.click('#nguong-form button[type=submit]');
assert.equal(await admin.locator('#nguong-loi').textContent(), 'Ghi lý do đặt ngưỡng.');
await admin.fill('#nguong-ly-do', 'Siết riêng cho P1');
await admin.fill('#nguong-hieu-luc', '2026-04-01');
await admin.click('#nguong-form button[type=submit]');
await admin.locator('#runs-status').getByText('Đã lưu ngưỡng (phiên bản v1).').waitFor();
assert.deepEqual(await admin.evaluate(() => window.__set), [{ system: 'air', form: 'bm02', metric: 'result', pointId: 'P1', unit: '°C', direction: 'max', alert: -18, action: -14.5, from: '2026-04-01', reason: 'Siết riêng cho P1' }]);
// Ngưỡng riêng P1 hiệu lực từ 04/2026: tháng 03 (-20) vẫn dùng ngưỡng chung; 05 (-14) và 07 (-13) vượt hành động mới.
await admin.waitForFunction(() => document.querySelectorAll('#multi-trend-chart circle[data-muc="action"]').length === 3);
assert.equal(await admin.locator('#nguong-bang tbody tr').count(), 2);

// Lỗi tải ngưỡng: báo rõ, biểu đồ vẫn vẽ, không có đường ngưỡng.
const loi = await mo('loi');
await loi.locator('#nguong-trang-thai').getByText('Không tải được ngưỡng: mất mạng').waitFor({ state: 'attached' }); // mục đang thu gọn
assert.equal(await loi.locator('#multi-trend-chart circle').count(), 12);
assert.equal(await loi.locator('#multi-trend-chart line.alert-line').count(), 0);
assert.equal(await loi.locator('#multi-trend-signals li').count(), 0);

assert.deepEqual(errors, []);
await browser.close();
console.log('PASS trend levels: alert/action lines, excursion marks, trend signals, admin-only form, suggestion fills without saving, validation, effective-date per month, load error');

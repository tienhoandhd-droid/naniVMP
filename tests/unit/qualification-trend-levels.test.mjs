import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Gói 4 (16/10): ngưỡng cảnh báo / hành động — chọn phiên bản, so sánh, phát hiện xu hướng, gợi ý.
const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../../public/tham-dinh-thuc-te/trend-limits.js', import.meta.url), 'utf8'), ctx);
const api = ctx.window.CPC1TrendLimits;
const muc = (point_id, phien_ban, hieu_luc_tu, alert, action, direction = 'max') => ({ form: 'bm01', metric: 'p05', unit: 'hạt/m³', point_id, phien_ban, hieu_luc_tu, alert, action, direction });

test('chọn đúng phiên bản theo tháng; ngưỡng riêng của điểm thắng ngưỡng chung', () => {
  const levels = [muc('', 1, '2026-01-01', 100, 200), muc('', 2, '2026-09-15', 80, 150), muc('P2', 1, '2026-01-01', 50, 90)];
  assert.equal(api.levelFor(levels, 'bm01', 'p05', 'hạt/m³', 'P1', '2026-08').phien_ban, 1, 'trước ngày hiệu lực bản 2 thì dùng bản 1');
  assert.equal(api.levelFor(levels, 'bm01', 'p05', 'hạt/m³', 'P1', '2026-09').alert, 80, 'bản 2 hiệu lực từ giữa tháng 9');
  assert.equal(api.levelFor(levels, 'bm01', 'p05', 'hạt/m³', 'P1', null).phien_ban, 2, 'không chỉ tháng thì lấy bản mới nhất');
  assert.equal(api.levelFor(levels, 'bm01', 'p05', 'hạt/m³', 'P2', '2026-10').alert, 50);
  assert.equal(api.levelFor(levels, 'bm01', 'p05', 'hạt/L', 'P1', null), null, 'khác đơn vị thì không áp');
  assert.equal(api.levelFor(levels, 'bm01', 'p05', 'hạt/m³', 'P1', '2025-12'), null, 'chưa có ngưỡng hiệu lực');
});

test('so sánh hai chiều; bằng ngưỡng chưa tính là vượt', () => {
  const tren = muc('', 1, '2026-01-01', 80, 150), duoi = muc('', 1, '2026-01-01', 99.5, 99, 'min');
  assert.deepEqual([79, 80, 81, 150, 151].map(v => api.classify(v, tren)), ['ok', 'ok', 'alert', 'alert', 'action']);
  assert.deepEqual([99.9, 99.5, 99.4, 99, 98.9].map(v => api.classify(v, duoi)), ['ok', 'ok', 'alert', 'alert', 'action']);
  assert.equal(api.classify(500, null), 'ok', 'chưa đặt ngưỡng thì không báo');
});

test('xu hướng: vượt hành động luôn báo; cảnh báo từ 2 đợt có số liệu liên tiếp, tháng trống không cắt chuỗi', () => {
  const s = api.signals([
    { label: 'P1', months: [{ month: '2026-07', state: 'alert' }, { month: '2026-08', state: null }, { month: '2026-09', state: 'alert' }, { month: '2026-10', state: 'ok' }] },
    { label: 'P2', months: [{ month: '2026-09', state: 'alert' }, { month: '2026-10', state: 'ok' }] },
    { label: 'P3', months: [{ month: '2026-10', state: 'action' }] },
  ]);
  assert.equal(s.length, 2);
  assert.deepEqual([s[0].muc, s[0].text], ['action', 'P3 · 10/2026: vượt mức hành động — cần điều tra.']);
  assert.deepEqual([s[1].muc, s[1].text], ['alert', 'P1: vượt mức cảnh báo 2 đợt liên tiếp (07/2026–09/2026) — xem xét xu hướng.']);
});

test('gợi ý: đủ 10 kết quả mới gợi ý; hoá lý ±2SD/3SD, vi sinh phân vị 95/99', () => {
  assert.equal(api.suggest([1, 2, 3], 'max', '°C').du, false);
  assert.match(api.suggest([1, 2, 3], 'max', '°C').text, /ít nhất 10 kết quả để gợi ý \(hiện có 3\)/);
  const hoaLy = api.suggest([10, 12, 11, 13, 9, 10, 12, 11, 10, 12], 'max', 'µS/cm');
  assert.deepEqual([hoaLy.du, hoaLy.alert, hoaLy.action], [true, 13.5, 14.7]);
  const duoi = api.suggest([99.9, 99.8, 99.9, 99.7, 99.9, 99.8, 99.9, 99.8, 99.9, 99.9], 'min', '%');
  assert.ok(duoi.alert > duoi.action, 'giới hạn dưới: cảnh báo cao hơn hành động');
  const viSinh = api.suggest([0, 0, 1, 0, 2, 0, 1, 0, 3, 0, 5, 0, 0, 1, 0, 0, 2, 0, 0, 8], 'max', 'CFU/m³');
  assert.deepEqual([viSinh.du, viSinh.alert, viSinh.action], [true, 5, 8]);
  assert.equal(api.suggest(Array(10).fill(4), 'max', '°C').du, false, 'không dao động thì không gợi ý');
});

test('backend: đọc và đặt ngưỡng gọi đúng RPC với đúng tham số; hệ thống lạ bị chặn trước khi gọi', async () => {
  const { makeBackend } = await import('../../src/features/qualification/backend.js');
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'actor' } } } }) },
    rpc: async (name, args) => { calls.push([name, args]); return { data: name === 'cpc1_context' ? { can_view: true, can_enter: false, record_scope: 'pq', systems: Object.fromEntries(['steam', 'air', 'nitrogen'].map(s => [s, { can_view: true, can_enter: false, pq_codes: ['PQ-' + s] }])) } : { ok: true } }; },
  };
  globalThis.window = { dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} };
  const api = makeBackend({ url: 'https://vmp-test.supabase.co', publishableKey: 'sb_publishable_test' }, client);
  await api.trendLimits('air');
  await api.setTrendLimit({ system: 'steam', form: 'bm02', metric: 'toc', pointId: '', unit: 'ppb', direction: 'max', alert: 300, action: 400, from: '2026-10-16', reason: 'PQ 2026' });
  await assert.rejects(api.trendLimits('oxy'), /Hệ thống thẩm định không hợp lệ/);
  assert.deepEqual(calls.filter(([name]) => name !== 'cpc1_context'), [
    ['cpc1_trend_limits', { p_system: 'air' }],
    ['cpc1_trend_limit_set', { p_system: 'steam', p_form: 'bm02', p_metric: 'toc', p_point_id: '', p_unit: 'ppb', p_direction: 'max', p_alert: 300, p_action: 400, p_hieu_luc_tu: '2026-10-16', p_ly_do: 'PQ 2026' }],
  ]);
});

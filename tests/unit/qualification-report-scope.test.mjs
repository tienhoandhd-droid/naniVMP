import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackend } from '../../src/features/qualification/backend.js';

// Đợt C rà soát 10/11:
//  C5  PDF trong đợt in kết quả đã lọc theo phạm vi đợt (như cpc1_run_load), không in kết quả toàn hệ thống.
//  C6  Chặn in bản cũ: máy chủ đã có phiên bản mới hơn thì không tạo PDF.
const settings = { url: 'https://vmp-test.supabase.co', publishableKey: 'sb_publishable_test' };
const run = '00000000-0000-4000-8000-000000000001', record = '00000000-0000-4000-8000-000000000002';
const context = { can_view: true, can_enter: true, record_scope: 'pq', systems: { steam: { can_view: true, can_enter: true, pq_codes: ['PQ-STEAM'] }, air: { can_view: true, can_enter: true, pq_codes: ['PQ-AIR'] }, nitrogen: { can_view: true, can_enter: true, pq_codes: ['PQ-N2'] } } };
const fonts = ['Arial.ttf', 'Arial_Bold.ttf', 'Arial_Italic.ttf', 'Arial_Bold_Italic.ttf', 'Times_New_Roman.ttf', 'Times_New_Roman_Bold.ttf', 'Times_New_Roman_Italic.ttf', 'Times_New_Roman_Bold_Italic.ttf'];
const PDF = new Uint8Array([37, 80, 68, 70, 1, 2, 3]);
const sourceContext = {
  asset_path: 'v1', template_sha256: { bm01: 'x', bm05: 'x' }, asset_sha256: Object.fromEntries(['print-layout.json', ...fonts].map((n) => [n, 'x'])),
  config: { system: 'air', summary_form: 'bm05', trend_form: 'bm06', forms: [{ id: 'bm01', locations: [{ id: 'A1' }, { id: 'A2' }, { id: 'A3' }] }, { id: 'bm05', locations: [] }] },
};
const data = { system: 'air', forms: { bm01: { A1: { p05: '10', p5: '0' }, A2: { p05: '99999', p5: '0' } } } };
// Toàn hệ thống: A3 (ngoài phạm vi đợt) chưa đo → tổng "chưa đủ".
const unscoped = {
  source_context: sourceContext, overall: 'incomplete',
  forms: {
    bm01: { status: 'incomplete', rows: { A1: { status: 'pass' }, A2: { status: 'pass' }, A3: { status: 'incomplete' } }, summary: { total: 3, sampled: 2, pass: 2, fail: 0, failed_codes: '' } },
    bm05: { status: 'incomplete', rows: {} },
  },
};
// Theo phạm vi đợt (A1, A2): mọi điểm Đạt → tổng "pass".
const scoped = {
  ...unscoped, overall: 'pass', run_scope: { bm01: ['A1', 'A2'] },
  forms: {
    bm01: { status: 'pass', rows: { A1: { status: 'pass' }, A2: { status: 'pass' } }, locations: { A1: 'pass', A2: 'pass' }, summary: { total: 2, sampled: 2, pass: 2, fail: 0, invalid: 0, incomplete: 0 } },
    bm05: { status: 'pass', rows: {} },
  },
};

function dung({ latestVersion = 4, scopedEvaluation = scoped } = {}) {
  const calls = [], rendered = [];
  const saved = { id: record, version: 4, data, evaluation: unscoped, created_at: '2026-11-10T01:00:00Z' };
  const latest = latestVersion === 4 ? saved : { ...saved, version: latestVersion, data: { ...data, forms: { bm01: { A1: { p05: '11', p5: '0' } } } } };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'actor' } } } }) },
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'cpc1_context') return { data: context };
      if (name === 'cpc1_run_save') return { data: structuredClone(saved) };
      if (name === 'cpc1_load') return { data: structuredClone(args.p_version == null || args.p_version === latest.version ? latest : saved) };
      if (name === 'cpc1_run_load') return { data: structuredClone({ ...latest, run: { id: run }, evaluation: latest.version === 4 ? scopedEvaluation : latest.evaluation }) };
      if (name === 'cpc1_print_log') return { data: { ok: true } };
      return { data: null };
    },
    storage: { from: () => ({ download: async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(4) } }) }) },
  };
  globalThis.window = {
    CPC1Pdf: { renderPdf: async () => PDF, renderGasPdf: async (form, d, evaluation) => { rendered.push({ form, d, evaluation }); return PDF; } },
    dispatchEvent: () => true, addEventListener() {}, removeEventListener() {},
  };
  const api = makeBackend(settings, client);
  api.bindSystem('air'); api.bindRun(run, record);
  return { api, calls, rendered };
}

test('C5 PDF trong đợt dùng kết quả theo phạm vi đợt: ô Đạt của BM05 khí nén được tick', async () => {
  const { api, rendered } = dung();
  await api.save(data);
  await api.report('bm05', data);
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].evaluation.overall, 'pass');
  assert.equal(rendered[0].evaluation.forms.bm05.status, 'pass');
  assert.deepEqual(Object.keys(rendered[0].evaluation.forms.bm01.rows), ['A1', 'A2'], 'không in điểm ngoài phạm vi');
  assert.equal(rendered[0].evaluation.report_context.version, 4);
});

test('C5 bản in theo phạm vi vẫn có danh sách điểm không đạt (theo thứ tự cấu hình)', async () => {
  const failing = structuredClone(scoped);
  failing.overall = 'fail'; failing.forms.bm01.status = 'fail';
  failing.forms.bm01.locations = { A2: 'fail', A1: 'fail' };
  const { api, rendered } = dung({ scopedEvaluation: failing });
  await api.save(data);
  await api.report('bm01', data);
  assert.equal(rendered[0].evaluation.forms.bm01.summary.failed_codes, 'A1, A2');
});

test('C6 máy chủ đã có phiên bản mới hơn → không tạo PDF, không ghi nhận lần in', async () => {
  const { api, calls, rendered } = dung({ latestVersion: 5 });
  await api.save(data);
  await assert.rejects(api.report('bm05', data), /Hồ sơ đã có phiên bản 5 mới hơn\. Tải lại rồi in\./);
  assert.equal(rendered.length, 0);
  assert.equal(calls.some(([name]) => name === 'cpc1_print_log'), false);
});

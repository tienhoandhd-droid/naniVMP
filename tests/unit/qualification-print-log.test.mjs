import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeBackend } from '../../src/features/qualification/backend.js';

// Gói 2 (16/10): mỗi lần in PDF phải được ghi nhận (cpc1_print_log) trước khi giao file.
const settings = { url: 'https://vmp-test.supabase.co', publishableKey: 'sb_publishable_test' };
const run = '00000000-0000-4000-8000-000000000001', record = '00000000-0000-4000-8000-000000000002';
const context = { can_view: true, can_enter: true, record_scope: 'pq', systems: { steam: { can_view: true, can_enter: true, pq_codes: ['PQ-STEAM'] }, air: { can_view: true, can_enter: true, pq_codes: ['PQ-AIR'] }, nitrogen: { can_view: true, can_enter: true, pq_codes: ['PQ-N2'] } } };
const fonts = ['Arial.ttf', 'Arial_Bold.ttf', 'Arial_Italic.ttf', 'Arial_Bold_Italic.ttf', 'Times_New_Roman.ttf', 'Times_New_Roman_Bold.ttf', 'Times_New_Roman_Italic.ttf', 'Times_New_Roman_Bold_Italic.ttf'];
const PDF = new Uint8Array([37, 80, 68, 70, 1, 2, 3]);

function dung(printLogResult) {
  const calls = [];
  const snapshot = {
    id: record, version: 3, data: { meta: { remarks: 'đã lưu' } },
    evaluation: { source_context: { asset_path: 'v1', template_sha256: { bm01: 'x' }, asset_sha256: Object.fromEntries(['print-layout.json', ...fonts].map((n) => [n, 'x'])) } },
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'actor' } } } }) },
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'cpc1_context') return { data: context };
      if (name === 'cpc1_run_save') return { data: structuredClone(snapshot) };
      if (name === 'cpc1_load') return { data: structuredClone(snapshot) };
      if (name === 'cpc1_print_log') return printLogResult;
      return { data: null };
    },
    storage: { from: () => ({ download: async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(4) } }) }) },
  };
  globalThis.window = { CPC1Pdf: { renderPdf: async () => PDF, renderGasPdf: async () => PDF }, dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} };
  const api = makeBackend(settings, client);
  api.bindSystem('steam'); api.bindRun(run, record);
  return { api, calls, snapshot };
}

test('in thành công: ghi nhận đúng hồ sơ, phiên bản, biểu mẫu và SHA-256 của file', async () => {
  const { api, calls, snapshot } = dung({ data: { ok: true } });
  await api.save(snapshot.data);
  const blob = await api.report('bm01', snapshot.data);
  assert.equal(blob.type, 'application/pdf');
  const log = calls.find(([name]) => name === 'cpc1_print_log');
  assert.deepEqual(log[1], { p_record_id: record, p_version: 3, p_form: 'bm01', p_pdf_sha256: createHash('sha256').update(PDF).digest('hex') });
});

test('không ghi nhận được lần in thì không xuất PDF', async () => {
  const { api, snapshot } = dung({ error: { message: 'mất mạng' } });
  await api.save(snapshot.data);
  await assert.rejects(api.report('bm01', snapshot.data), /Không ghi nhận được lần in nên chưa xuất PDF.*mất mạng/);
});

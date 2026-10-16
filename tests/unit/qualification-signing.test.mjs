import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackend } from '../../src/features/qualification/backend.js';

// Gói 3 (16/10): ký = đăng nhập lại bằng mật khẩu trong một phiên RIÊNG rồi gọi RPC ký bằng
// chính phiên đó (máy chủ kiểm JWT vừa xác thực mật khẩu); xong thì đóng phiên tạm.
const settings = { url: 'https://vmp-test.supabase.co', publishableKey: 'sb_publishable_test' };
const R = '00000000-0000-4000-8000-0000000000aa';
const context = { can_view: true, can_enter: false, record_scope: 'pq', systems: Object.fromEntries(['steam', 'air', 'nitrogen'].map(s => [s, { can_view: true, can_enter: false, pq_codes: ['PQ-' + s] }])) };

function dung({ dangNhap = { data: { user: { id: 'actor' }, session: { user: { id: 'actor' } } }, error: null }, ky = { data: { ok: true, trang_thai: 'da_kiem_tra' }, error: null } } = {}) {
  const goi = { chinh: [], rieng: [], dangNhap: [], dangXuat: 0, taoPhien: 0 };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'actor', email: 'qa@example.test' } } }, error: null }) },
    rpc: async (name, args) => { goi.chinh.push([name, args]); return { data: name === 'cpc1_context' ? context : { ok: true, trang_thai: 'chua_ky' }, error: null }; },
  };
  const phienKy = () => {
    goi.taoPhien++;
    return {
      auth: {
        signInWithPassword: async cred => { goi.dangNhap.push(cred); return dangNhap; },
        signOut: async opts => { assert.deepEqual(opts, { scope: 'local' }); goi.dangXuat++; return { error: null }; },
      },
      rpc: async (name, args) => { goi.rieng.push([name, args]); return ky; },
    };
  };
  globalThis.window = { dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} };
  return { api: makeBackend(settings, client, phienKy), goi };
}
const KY = { recordId: R, version: 3, meaning: 'kiem_tra', password: 'mat-khau', reason: null, deviation: 'DV-1' };

test('ký: đăng nhập lại bằng email của phiên đang dùng, gọi RPC ký bằng phiên riêng, rồi đóng phiên riêng', async () => {
  const { api, goi } = dung();
  assert.deepEqual(await api.signRecord(KY), { ok: true, trang_thai: 'da_kiem_tra' });
  assert.deepEqual(goi.dangNhap, [{ email: 'qa@example.test', password: 'mat-khau' }]);
  assert.deepEqual(goi.rieng, [['cpc1_record_sign', { p_record_id: R, p_version: 3, p_y_nghia: 'kiem_tra', p_ly_do: null, p_ma_deviation: 'DV-1' }]]);
  assert.equal(goi.chinh.some(([name]) => name === 'cpc1_record_sign'), false, 'không ký bằng phiên chính');
  assert.equal(goi.dangXuat, 1);
});

test('sai mật khẩu: báo tiếng Việt, không gọi RPC ký, không có phiên để đóng', async () => {
  const { api, goi } = dung({ dangNhap: { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } } });
  await assert.rejects(api.signRecord(KY), /^Error: Mật khẩu không đúng\.$/);
  assert.deepEqual(goi.rieng, []);
  assert.equal(goi.dangXuat, 0);
});

test('máy chủ từ chối (vd người nhập tự kiểm tra): báo đúng lý do và vẫn đóng phiên riêng', async () => {
  const { api, goi } = dung({ ky: { data: { ok: false, error_code: 'SAME_PERSON', error: 'Người nhập không tự kiểm tra hồ sơ của mình.' }, error: null } });
  await assert.rejects(api.signRecord(KY), /Người nhập không tự kiểm tra hồ sơ của mình\./);
  assert.equal(goi.dangXuat, 1);
});

test('tài khoản đăng nhập lại khác người đang dùng: không ký', async () => {
  const { api, goi } = dung({ dangNhap: { data: { user: { id: 'nguoi-khac' }, session: { user: { id: 'nguoi-khac' } } }, error: null } });
  await assert.rejects(api.signRecord(KY), /Tài khoản ký không khớp/);
  assert.deepEqual(goi.rieng, []);
  assert.equal(goi.dangXuat, 1);
});

test('kiểm đầu vào trước khi tạo phiên ký', async () => {
  const { api, goi } = dung();
  await assert.rejects(api.signRecord({ ...KY, password: '' }), /Nhập mật khẩu để ký/);
  await assert.rejects(api.signRecord({ ...KY, meaning: 'xoa' }), /Ý nghĩa ký không hợp lệ/);
  await assert.rejects(api.signRecord({ ...KY, recordId: 'abc' }), /Hồ sơ không hợp lệ/);
  assert.equal(goi.taoPhien, 0);
});

test('xem trạng thái ký gọi cpc1_record_signatures bằng phiên chính', async () => {
  const { api, goi } = dung();
  await api.recordSignatures(R);
  assert.deepEqual(goi.chinh.filter(([name]) => name !== 'cpc1_context'), [['cpc1_record_signatures', { p_record_id: R }]]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { loadAccountAdministrationSnapshot } from "../../src/features/accountAdministration/AccountAdministrationPanel.tsx";

const account = (overrides = {}) => ({ pid: "p1", user_id: "u1", ten: "A", email: "a@test", bo_phan: "QA", bo_phan_nguoi: "QA", bo_phan_tai_khoan: "QA", vai: null, pham_vi_rieng: null, muc: null, co_tai_khoan: true, tk_hoat_dong: true, so_sua_duoc: 0, so_dung_ten: 0, so_phan_cong: 1, ...overrides });
const person = { person_id: "p1", user_id: "u1", employee_code: null, full_name: "A", department: "QA", email: "a@test", account_status: "active", access_class: null, scope_departments: [], scope_factory_ids: [], scope_area_ids: [], scope_line_ids: [], version: 1, access_areas: [], email_sent_confirmed: true, is_active: true, match_status: "matched" };

test("roles lỗi vẫn giữ account rows và báo nguồn chưa xác minh", async () => {
  const snapshot = await loadAccountAdministrationSnapshot({ loadAccounts: async () => ({ tongHangMuc: 0, nguoi: [account()] }), loadRoles: async () => { throw new Error("roles down"); }, loadDirectory: async () => [person] });
  assert.equal(snapshot.rows.length, 1); assert.equal(snapshot.errors.roles, "roles down");
});
test("accounts lỗi là lỗi chính nhưng không làm vỡ snapshot", async () => {
  const snapshot = await loadAccountAdministrationSnapshot({ loadAccounts: async () => { throw new Error("accounts down"); }, loadRoles: async () => [], loadDirectory: async () => [] });
  assert.deepEqual(snapshot.rows, []); assert.equal(snapshot.errors.accounts, "accounts down");
});
test("directory lỗi vẫn giữ rows và không suy đoán nối hồ sơ", async () => {
  const snapshot = await loadAccountAdministrationSnapshot({ loadAccounts: async () => ({ tongHangMuc: 0, nguoi: [account()] }), loadRoles: async () => [{ user_id: "u1", email: "a@test", business_role: "qa_staff", unresolved_reason: null }], loadDirectory: async () => { throw new Error("directory down"); } });
  assert.equal(snapshot.rows.length, 1); assert.equal(snapshot.errors.directory, "directory down"); assert.equal(snapshot.rows[0].readiness.find((x) => x.key === "person_link").state, "missing");
});

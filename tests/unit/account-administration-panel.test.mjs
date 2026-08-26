import test from "node:test";
import assert from "node:assert/strict";
import { loadAccountAdministrationSnapshot, activateAccount, applySourceUncertainty, stableRowKey } from "../../src/features/accountAdministration/AccountAdministrationPanel.tsx";

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
  assert.equal(snapshot.rows.length, 1); assert.equal(snapshot.errors.directory, "directory down");
  assert.equal(applySourceUncertainty(snapshot.rows, snapshot.errors)[0].readiness.find((x) => x.key === "person_link").state, "unknown");
});

test("activation writes once, trims reason, and reports reload failure without retry", async () => {
  const calls = []; const result = await activateAccount({ userId: "u1", nextActive: false, reason: "  approved  ", mutate: async (...args) => { calls.push(args); return { ok: true }; }, reload: async () => { throw new Error("reload down"); }, isCurrent: () => true });
  assert.deepEqual(calls, [["u1", false, "approved"]]); assert.equal(result.kind, "written_unverified");
});
test("stale activation completion cannot close a newer draft", async () => {
  let current = "new"; let resolve; const pending = new Promise((r) => { resolve = r; });
  const resultPromise = activateAccount({ userId: "u1", nextActive: false, reason: "x", mutate: async () => { await pending; return { ok: true }; }, reload: async () => null, isCurrent: () => current === "old" });
  current = "new"; resolve(); assert.equal((await resultPromise).kind, "stale");
});
test("duplicate activation submissions are rejected by operation token", async () => {
  let calls = 0; let resolve; const pending = new Promise((r) => { resolve = r; }); const operation = { token: 1 };
  const first = activateAccount({ userId: "u1", nextActive: false, reason: "x", mutate: async () => { calls++; await pending; return { ok: true }; }, reload: async () => null, isCurrent: () => true, operation });
  const second = activateAccount({ userId: "u1", nextActive: false, reason: "x", mutate: async () => { calls++; return { ok: true }; }, reload: async () => null, isCurrent: () => true, operation });
  assert.equal((await second).kind, "busy"); resolve(); await first; assert.equal(calls, 1);
});
test("stable row key is unique for unidentified rows", () => { assert.notEqual(stableRowKey({ key: "account:unidentified" }, 0), stableRowKey({ key: "account:unidentified" }, 1)); });

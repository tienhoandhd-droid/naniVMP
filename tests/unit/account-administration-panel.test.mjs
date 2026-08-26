import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadAccountAdministrationSnapshot, activateAccount, applySourceUncertainty, stableRowKey, createActivationCoordinator, resolveReloadedAccount, createActivationUiState, AccountAdministrationContent, ActivationDialog } from "../../src/features/accountAdministration/AccountAdministrationPanel.tsx";

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
test("coordinator serializes calls and checks capability before mutation", async () => {
  let calls = 0; let resolve; const pending = new Promise((r) => { resolve = r; }); const coordinator = createActivationCoordinator();
  const first = coordinator.run({ userId: "u1", nextActive: false, reason: "x", canManage: () => true, mutate: async () => { calls++; await pending; return { ok: true }; }, reload: async () => ({ userId: "u1", accountActive: false }), });
  assert.equal((await coordinator.run({ userId: "u1", nextActive: false, reason: "x", canManage: () => true, mutate: async () => { calls++; return { ok: true }; }, reload: async () => ({ userId: "u1", accountActive: false }) })).kind, "busy"); resolve(); assert.equal((await first).kind, "verified"); assert.equal(calls, 1);
});
test("coordinator returns stale after capability changes or reload race", async () => {
  let allowed = true; const coordinator = createActivationCoordinator();
  const result = await coordinator.run({ userId: "u1", nextActive: false, reason: "x", canManage: () => allowed, mutate: async () => { allowed = false; return { ok: true }; }, reload: async () => ({ userId: "u1", accountActive: false }) });
  assert.equal(result.kind, "stale");
});
test("coordinator requires exact user and active state for verification", async () => {
  const coordinator = createActivationCoordinator(); const result = await coordinator.run({ userId: "u1", nextActive: false, reason: "x", canManage: () => true, mutate: async () => ({ ok: true }), reload: async () => ({ userId: "other", accountActive: false }) });
  assert.equal(result.kind, "written_unverified");
});
test("reload resolver rejects superseded generations and source errors", () => {
  const row = { userId: "u1", accountActive: false }; const snapshot = { rows: [row], errors: {} };
  assert.equal(resolveReloadedAccount(snapshot, "u1", () => false), null);
  assert.equal(resolveReloadedAccount({ rows: [row], errors: { roles: "down" } }, "u1", () => true), null);
  assert.equal(resolveReloadedAccount(snapshot, "u1", () => true), row);
});
test("activation reload rejection is written_unverified, not rejected", async () => {
  const coordinator = createActivationCoordinator(); const result = await coordinator.run({ userId: "u1", nextActive: false, reason: "x", canManage: () => true, mutate: async () => ({ ok: true }), reload: async () => { throw new Error("reload down"); } });
  assert.equal(result.kind, "written_unverified");
});
test("ui operation token allows cancel to release only its own in-flight state", () => {
  const state = createActivationUiState(); const first = state.begin(); assert.equal(state.isCurrent(first), true); state.cancel(first); assert.equal(state.isCurrent(first), false); const second = state.begin(); assert.notEqual(first, second); assert.equal(state.isCurrent(second), true);
});

test("nội dung panel hiện đủ sáu mục, badge và ẩn controls với người không có quyền", () => {
  const snapshot = awaitSnapshotForMarkup();
  const html = renderToStaticMarkup(React.createElement(AccountAdministrationContent, {
    snapshot,
    rows: applySourceUncertainty(snapshot.rows, snapshot.errors),
    loading: false,
    canManageAccounts: false,
    reload: async () => null,
    onRetry: () => {},
    onStartActivation: () => {},
  }));
  for (const label of ["Tài khoản", "Nối hồ sơ", "Vai nghiệp vụ", "Bộ phận", "Phạm vi", "Phân công"]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /Không hoạt động/);
  assert.match(html, /Chưa xác minh/);
  assert.match(html, /Tải lại/);
  assert.doesNotMatch(html, /Sửa vai/);
  assert.doesNotMatch(html, />Bật lại</);
});

test("manager chỉ thấy Sửa vai khi có callback", () => {
  const snapshot = awaitSnapshotForMarkup();
  const base = {
    snapshot,
    rows: applySourceUncertainty(snapshot.rows, snapshot.errors),
    loading: false,
    canManageAccounts: true,
    reload: async () => null,
    onRetry: () => {},
    onStartActivation: () => {},
  };
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(AccountAdministrationContent, base)), /Sửa vai/);
  assert.match(renderToStaticMarkup(React.createElement(AccountAdministrationContent, { ...base, onEditRole: () => {} })), /Sửa vai/);
});

test("panel hiện nhãn tiếng Việt từ catalog, không lộ mã vai kỹ thuật", () => {
  const [baseRow] = loadFixtureRows();
  const row = { ...baseRow, businessRole: "qa_staff", unresolvedReason: null };
  const snapshot = { rows: [row], errors: {} };
  const html = renderToStaticMarkup(React.createElement(AccountAdministrationContent, {
    snapshot,
    rows: snapshot.rows,
    loading: false,
    canManageAccounts: false,
    reload: async () => null,
    onRetry: () => {},
    onStartActivation: () => {},
  }));

  assert.match(html, /Vai: Nhân viên QA/);
  assert.doesNotMatch(html, /qa_staff/);
});

test("không thể hủy dialog sau khi mutation bắt đầu", () => {
  const html = renderToStaticMarkup(React.createElement(ActivationDialog, {
    draft: { row: { userId: "u1" }, next: false, reason: "Lý do", token: 1 },
    status: null,
    submitting: true,
    onReason: () => {},
    onCancel: () => {},
    onConfirm: () => {},
  }));
  assert.match(html, /<button disabled="">Hủy<\/button>/);
  assert.match(html, /<button disabled="">Xác nhận<\/button>/);
});

function awaitSnapshotForMarkup() {
  const rows = loadFixtureRows();
  return { rows, errors: { roles: "roles down" } };
}

function loadFixtureRows() {
  return applySourceUncertainty([
    {
      key: "user:u1", userId: "u1", personId: "p1", name: "A", email: "a@test",
      accountDepartment: "QA", personDepartment: "QA", accountActive: false,
      businessRole: null, unresolvedReason: "role_source_missing", scopeMode: null,
      scopeSummary: "Chưa xác minh vai trò", sourceAccount: account({ tk_hoat_dong: false }),
      directoryPerson: person,
      readiness: [
        ["account", "Tài khoản", "missing"], ["person_link", "Nối hồ sơ", "ready"],
        ["business_role", "Vai nghiệp vụ", "unknown"], ["department", "Bộ phận", "unknown"],
        ["scope", "Phạm vi", "unknown"], ["assignment", "Phân công", "unknown"],
      ].map(([key, label, state]) => ({ key, label, state, detail: label, nextAction: null })),
    },
  ], { roles: "roles down" });
}

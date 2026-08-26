import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildAccountAdministrationRows } from "../../src/features/accountAdministration/accountAdministrationModel.ts";
import AccountRoleEditor, { commitRoleDraft } from "../../src/features/accountAdministration/AccountRoleEditor.tsx";

function row(overrides = {}) {
  const {
    userId = "user-a",
    personId = "person-a",
    email = "same@vmp.test",
    businessRole = "qa_staff",
  } = overrides;
  return buildAccountAdministrationRows({
    accounts: [{
      pid: personId,
      user_id: userId,
      ten: "Nguyễn An",
      email,
      bo_phan: "qa",
      bo_phan_nguoi: "qa",
      bo_phan_tai_khoan: "qa",
      vai: "department_user",
      pham_vi_rieng: null,
      muc: null,
      co_tai_khoan: true,
      tk_hoat_dong: true,
      so_sua_duoc: 0,
      so_dung_ten: 0,
      so_phan_cong: 1,
    }],
    roles: [{
      user_id: userId,
      email,
      business_role: businessRole,
      unresolved_reason: null,
    }],
    directory: [{
      person_id: personId,
      user_id: userId,
      employee_code: "NV-01",
      full_name: "Nguyễn An",
      department: "qa",
      email,
      account_status: "linked",
      access_class: "qa_progress_editor",
      scope_departments: [],
      scope_factory_ids: [],
      scope_area_ids: [],
      scope_line_ids: [],
      version: 1,
      access_areas: [],
      email_sent_confirmed: true,
      is_active: true,
      match_status: "unique",
    }],
  })[0];
}

const draft = (overrides = {}) => ({
  targetUserId: "user-a",
  originalRole: "qa_staff",
  nextRole: "qa_manager",
  department: "qa",
  reason: "Điều chuyển",
  ...overrides,
});

test("lý do trống không thể gọi mutation", async () => {
  let mutations = 0;
  const outcome = await commitRoleDraft({
    draft: draft({ reason: "   " }),
    mutate: async () => { mutations += 1; return { ok: true }; },
    reload: async () => row({ businessRole: "qa_manager" }),
    isCurrent: () => true,
  });

  assert.equal(mutations, 0);
  assert.deepEqual(outcome, { kind: "rejected", message: "Cần nhập lý do để lưu thay đổi." });
});

test("lưu gọi mutation một lần với UUID rồi đối chiếu lại", async () => {
  const calls = [];
  const outcome = await commitRoleDraft({
    draft: draft(),
    mutate: async (...args) => { calls.push(args); return { ok: true }; },
    reload: async () => row({ businessRole: "qa_manager" }),
    isCurrent: (id) => id === "user-a",
  });

  assert.deepEqual(calls, [["user-a", "qa_manager", "qa", "Điều chuyển"]]);
  assert.equal(outcome.kind, "verified");
});

test("mutation bị từ chối giữ lỗi mà không reload", async () => {
  let reloaded = false;
  const outcome = await commitRoleDraft({
    draft: draft(),
    mutate: async () => ({ ok: false, error: "Không có quyền" }),
    reload: async () => { reloaded = true; return row(); },
    isCurrent: () => true,
  });

  assert.deepEqual(outcome, { kind: "rejected", message: "Không có quyền" });
  assert.equal(reloaded, false);
});

test("reload lỗi sau khi ghi cảnh báo đã ghi và không retry mutation", async () => {
  let mutations = 0;
  const outcome = await commitRoleDraft({
    draft: draft(),
    mutate: async () => { mutations += 1; return { ok: true }; },
    reload: async () => { throw new Error("Mất kết nối"); },
    isCurrent: () => true,
  });

  assert.equal(mutations, 1);
  assert.deepEqual(outcome, {
    kind: "written_unverified",
    message: "Đã ghi thay đổi nhưng chưa đối chiếu lại được: Mất kết nối",
  });
});

test("reload trả vai khác thì báo mismatch", async () => {
  const outcome = await commitRoleDraft({
    draft: draft(),
    mutate: async () => ({ ok: true }),
    reload: async () => row({ businessRole: "qa_staff" }),
    isCurrent: () => true,
  });

  assert.deepEqual(outcome, { kind: "mismatch", actualRole: "qa_staff" });
});

test("kết quả A không ghi đè khi editor đã chuyển sang B", async () => {
  let currentUserId = "user-a";
  let mutations = 0;
  let resolveReload;
  const pendingReload = new Promise((resolve) => { resolveReload = resolve; });
  const outcomePromise = commitRoleDraft({
    draft: draft({ targetUserId: "user-a" }),
    mutate: async () => { mutations += 1; return { ok: true }; },
    reload: async () => pendingReload,
    isCurrent: (id) => id === currentUserId,
  });
  currentUserId = "user-b";
  resolveReload(row());

  assert.equal(mutations, 1);
  assert.deepEqual(await outcomePromise, { kind: "stale" });
});

test("editor SSR nêu đối chiếu, lý do bắt buộc, hủy và lưu", () => {
  const html = renderToStaticMarkup(React.createElement(AccountRoleEditor, {
    row: row(),
    canEdit: true,
    mutateRole: async () => ({ ok: true }),
    reloadByUserId: async () => row(),
    onVerified: () => {},
  }));

  assert.match(html, /Đối chiếu thay đổi/);
  assert.match(html, /Lý do/);
  assert.match(html, /Hủy/);
  assert.match(html, /Lưu thay đổi/);
});

test("editor giữ vai chưa giải được ở trạng thái chưa chọn", () => {
  const html = renderToStaticMarkup(React.createElement(AccountRoleEditor, {
    row: row({ businessRole: null }),
    canEdit: true,
    mutateRole: async () => ({ ok: true }),
    reloadByUserId: async () => row(),
    onVerified: () => {},
  }));

  assert.match(html, /<option value="" selected="">Chọn vai nghiệp vụ<\/option>/);
  assert.match(html, /Chưa chọn vai nghiệp vụ/);
  assert.doesNotMatch(html, /<option value="qa_staff" selected="">/);
});

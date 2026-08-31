import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAccountAdministrationRows,
  buildRoleControlRows,
  filterAndSortAccountControlRows,
  planBusinessRoleChange,
} from "../../src/features/accountAdministration/accountAdministrationModel.ts";

function account(overrides = {}) {
  return {
    pid: "person-a",
    user_id: "user-a",
    ten: "Nguyễn An",
    email: "an@vmp.test",
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
    ...overrides,
  };
}

function role(overrides = {}) {
  return {
    user_id: "user-a",
    email: "an@vmp.test",
    business_role: "qa_staff",
    unresolved_reason: null,
    ...overrides,
  };
}

function person(overrides = {}) {
  return {
    person_id: "person-a",
    user_id: "user-a",
    employee_code: "NV-01",
    full_name: "Nguyễn An",
    department: "qa",
    email: "an@vmp.test",
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
    ...overrides,
  };
}

function readiness(row, key) {
  const item = row.readiness.find((candidate) => candidate.key === key);
  assert.ok(item, `thiếu mục readiness ${key}`);
  return item;
}

test("không ghép hai tài khoản trùng email bằng email", () => {
  const rows = buildAccountAdministrationRows({
    accounts: [account({ user_id: "user-a", pid: "person-a", email: "same@vmp.test" })],
    roles: [role({ user_id: "user-b", email: "same@vmp.test", business_role: "qa_manager" })],
    directory: [person({ person_id: "person-a", user_id: "user-a" })],
  });

  assert.equal(rows[0].businessRole, null);
  assert.equal(rows[0].unresolvedReason, "role_source_missing");
  assert.equal(readiness(rows[0], "business_role").state, "unknown");
});

test("hai role cùng user_id luôn không giải vai, bất kể thứ tự nguồn", () => {
  const sources = {
    accounts: [account()],
    directory: [person()],
  };
  const firstThenSecond = buildAccountAdministrationRows({
    ...sources,
    roles: [role({ business_role: "qa_staff" }), role({ business_role: "qa_manager" })],
  })[0];
  const secondThenFirst = buildAccountAdministrationRows({
    ...sources,
    roles: [role({ business_role: "qa_manager" }), role({ business_role: "qa_staff" })],
  })[0];

  for (const row of [firstThenSecond, secondThenFirst]) {
    assert.equal(row.businessRole, null);
    assert.equal(row.unresolvedReason, "role_source_ambiguous");
    assert.equal(readiness(row, "business_role").state, "unknown");
  }
});

test("hai hồ sơ cùng person_id luôn không xác nhận nối, bất kể thứ tự nguồn", () => {
  const sources = {
    accounts: [account()],
    roles: [role()],
  };
  const firstThenSecond = buildAccountAdministrationRows({
    ...sources,
    directory: [person({ full_name: "Người A" }), person({ full_name: "Người B", department: "workshop" })],
  })[0];
  const secondThenFirst = buildAccountAdministrationRows({
    ...sources,
    directory: [person({ full_name: "Người B", department: "workshop" }), person({ full_name: "Người A" })],
  })[0];

  for (const row of [firstThenSecond, secondThenFirst]) {
    assert.equal(row.directoryPerson, null);
    assert.equal(readiness(row, "person_link").state, "unknown");
    assert.equal(readiness(row, "department").state, "unknown");
  }
});

test("tài khoản inactive được đánh dấu thiếu và có hành động khôi phục", () => {
  const row = buildAccountAdministrationRows({
    accounts: [account({ tk_hoat_dong: false })],
    roles: [role()],
    directory: [person()],
  })[0];

  assert.equal(row.accountActive, false);
  assert.equal(readiness(row, "account").state, "missing");
  assert.ok(readiness(row, "account").nextAction);
});

test("tài khoản chưa nối hồ sơ vẫn hiện với readiness thiếu", () => {
  const row = buildAccountAdministrationRows({
    accounts: [account({ pid: null })],
    roles: [role()],
    directory: [person()],
  })[0];

  assert.equal(row.directoryPerson, null);
  assert.equal(readiness(row, "person_link").state, "missing");
  assert.ok(readiness(row, "person_link").nextAction);
});

test("vai server chưa giải được giữ lý do và yêu cầu phân loại lại", () => {
  const row = buildAccountAdministrationRows({
    accounts: [account()],
    roles: [role({ business_role: null, unresolved_reason: "department_mismatch" })],
    directory: [person()],
  })[0];

  assert.equal(row.businessRole, null);
  assert.equal(row.unresolvedReason, "department_mismatch");
  assert.equal(readiness(row, "business_role").state, "missing");
  assert.ok(readiness(row, "business_role").nextAction);
});

test("nhân viên QA không diễn giải scope rỗng thành hierarchy", () => {
  const row = buildAccountAdministrationRows({
    accounts: [account({ so_phan_cong: 0 })],
    roles: [role({ business_role: "qa_staff" })],
    directory: [person({ scope_departments: [], scope_factory_ids: [], scope_area_ids: [], scope_line_ids: [] })],
  })[0];

  assert.equal(row.scopeMode, "qa_assignment");
  assert.equal(row.scopeSummary, "Theo Dữ liệu nguồn");
  assert.equal(readiness(row, "scope").state, "not_applicable");
  assert.equal(readiness(row, "assignment").state, "not_applicable");
  assert.match(readiness(row, "assignment").detail, /Dữ liệu nguồn/);
});

test("vai xưởng lấy phạm vi từ Dữ liệu nguồn thay vì scope legacy trên hồ sơ", () => {
  const row = buildAccountAdministrationRows({
    accounts: [account({ bo_phan_nguoi: "workshop", bo_phan_tai_khoan: "workshop", so_phan_cong: 0 })],
    roles: [role({ business_role: "workshop_staff" })],
    directory: [person({ department: "workshop", access_class: "workshop_staff", scope_departments: [], scope_factory_ids: [], scope_area_ids: [], scope_line_ids: [] })],
  })[0];

  assert.equal(row.scopeSummary, "Theo phạm vi Dữ liệu nguồn");
  assert.equal(readiness(row, "scope").state, "not_applicable");
  assert.equal(readiness(row, "assignment").state, "not_applicable");
});

test("directory có person_id đúng nhưng user_id khác không được coi là nối đúng", () => {
  const row = buildAccountAdministrationRows({
    accounts: [account({ user_id: "user-a", pid: "person-a" })],
    roles: [role({ user_id: "user-a" })],
    directory: [person({ person_id: "person-a", user_id: "user-b" })],
  })[0];

  assert.equal(row.directoryPerson?.user_id, "user-b");
  assert.equal(readiness(row, "person_link").state, "missing");
  assert.equal(readiness(row, "department").state, "unknown");
});

test("người trong danh bạ chưa có tài khoản không xuất hiện trong bảng tài khoản", () => {
  const rows = buildAccountAdministrationRows({
    accounts: [account({ user_id: null, pid: null, co_tai_khoan: false, ten: "Chưa có tài khoản" })],
    roles: [role({ user_id: "user-a" })],
    directory: [person()],
  });

  assert.equal(rows.length, 0);
});

test("bảng tài khoản không coi số phân công legacy là điều kiện sẵn sàng", () => {
  const rows = buildAccountAdministrationRows({
    accounts: [
      account({ user_id: "admin-user", pid: "admin-person", so_phan_cong: 0 }),
      account({ user_id: "manager-user", pid: "manager-person", so_phan_cong: 0 }),
      account({ user_id: "staff-ready", pid: "staff-ready-person", so_phan_cong: 2 }),
      account({ user_id: "staff-missing", pid: "staff-missing-person", so_phan_cong: 0 }),
    ],
    roles: [
      role({ user_id: "admin-user", business_role: "admin" }),
      role({ user_id: "manager-user", business_role: "qa_manager" }),
      role({ user_id: "staff-ready", business_role: "qa_staff" }),
      role({ user_id: "staff-missing", business_role: "workshop_staff" }),
    ],
    directory: [
      person({ person_id: "admin-person", user_id: "admin-user" }),
      person({ person_id: "manager-person", user_id: "manager-user" }),
      person({ person_id: "staff-ready-person", user_id: "staff-ready" }),
      person({ person_id: "staff-missing-person", user_id: "staff-missing", department: "workshop", access_class: "workshop_staff", scope_departments: ["workshop"], scope_factory_ids: ["factory"], scope_area_ids: ["area"], scope_line_ids: ["line"] }),
    ],
  });

  assert.equal(readiness(rows[0], "assignment").state, "not_applicable");
  assert.equal(readiness(rows[1], "assignment").state, "not_applicable");
  assert.equal(readiness(rows[2], "assignment").state, "not_applicable");
  assert.equal(readiness(rows[3], "assignment").state, "not_applicable");
});

test("kế hoạch đổi vai luôn chọn UUID và bộ phận resolver tương ứng", () => {
  const row = buildAccountAdministrationRows({
    accounts: [account({ bo_phan_nguoi: "workshop", bo_phan_tai_khoan: "workshop" })],
    roles: [role({ business_role: "workshop_staff" })],
    directory: [person({ department: "workshop", access_class: "workshop_staff", scope_departments: ["workshop"], scope_factory_ids: ["factory"], scope_area_ids: ["area"], scope_line_ids: ["line"] })],
  })[0];

  const plan = planBusinessRoleChange(row, "qa_manager");
  assert.deepEqual(plan, {
    userId: "user-a",
    currentRole: "workshop_staff",
    nextRole: "qa_manager",
    department: "qa",
    scopeMode: "role_policy",
    canSave: true,
    blocker: null,
  });
});

test("đổi vai bị chặn khi dòng không có user_id", () => {
  const row = {
    ...buildAccountAdministrationRows({ accounts: [account()], roles: [role()], directory: [person()] })[0],
    userId: null,
  };

  const plan = planBusinessRoleChange(row, "admin");
  assert.equal(plan.userId, "");
  assert.equal(plan.canSave, false);
  assert.ok(plan.blocker);
});

test("bảng kiểm soát luôn có đủ năm vai và đếm trạng thái tài khoản theo vai", () => {
  const ready = {
    key: "user:admin", name: "Admin", businessRole: "admin", accountActive: true,
    readiness: [{ state: "ready" }, { state: "not_applicable" }],
  };
  const attention = {
    key: "user:qa", name: "QA", businessRole: "qa_staff", accountActive: true,
    readiness: [{ state: "ready" }, { state: "missing" }],
  };
  const unknown = {
    key: "user:unknown", name: "Chưa rõ", businessRole: null, accountActive: true,
    readiness: [{ state: "unknown" }],
  };

  assert.deepEqual(buildRoleControlRows([ready, attention, unknown]), [
    { id: "admin", label: "Quản trị", scopeLabel: "Theo chính sách vai", total: 1, active: 1, ready: 1, attention: 0, unknown: 0 },
    { id: "qa_manager", label: "Quản lý QA", scopeLabel: "Theo chính sách vai", total: 0, active: 0, ready: 0, attention: 0, unknown: 0 },
    { id: "qa_staff", label: "Nhân viên QA", scopeLabel: "Theo Dữ liệu nguồn", total: 1, active: 1, ready: 0, attention: 1, unknown: 0 },
    { id: "workshop_manager", label: "Quản lý xưởng", scopeLabel: "Theo phạm vi nguồn", total: 0, active: 0, ready: 0, attention: 0, unknown: 0 },
    { id: "workshop_staff", label: "Nhân viên xưởng", scopeLabel: "Theo phạm vi nguồn", total: 0, active: 0, ready: 0, attention: 0, unknown: 0 },
  ]);
});

test("bảng tài khoản đưa dòng cần xử lý lên trước và lọc đúng vai", () => {
  const rows = [
    { key: "ready", name: "An", businessRole: "qa_staff", accountActive: true, readiness: [{ state: "ready" }] },
    { key: "unknown", name: "Bình", businessRole: "qa_staff", accountActive: true, readiness: [{ state: "unknown" }] },
    { key: "attention", name: "Cường", businessRole: "qa_staff", accountActive: true, readiness: [{ state: "missing" }] },
    { key: "admin", name: "Dũng", businessRole: "admin", accountActive: true, readiness: [{ state: "ready" }] },
  ];

  assert.deepEqual(
    filterAndSortAccountControlRows(rows, "qa_staff").map((row) => row.key),
    ["attention", "unknown", "ready"],
  );
  assert.deepEqual(
    filterAndSortAccountControlRows(rows, "attention").map((row) => row.key),
    ["attention"],
  );
});

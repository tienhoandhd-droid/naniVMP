import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAccountAdministrationRows,
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
  assert.equal(row.scopeSummary, "Theo phân công QA");
  assert.equal(readiness(row, "scope").state, "not_applicable");
  assert.equal(readiness(row, "assignment").state, "missing");
  assert.ok(readiness(row, "assignment").nextAction);
});

test("vai xưởng thiếu mỗi tầng canonical đều chưa sẵn sàng", () => {
  const scopeFields = [
    "scope_departments",
    "scope_factory_ids",
    "scope_area_ids",
    "scope_line_ids",
  ];

  for (const missingField of scopeFields) {
    const scopes = {
      scope_departments: ["workshop-a"],
      scope_factory_ids: ["factory-a"],
      scope_area_ids: ["area-a"],
      scope_line_ids: ["line-a"],
      [missingField]: [],
    };
    const row = buildAccountAdministrationRows({
      accounts: [account({ bo_phan_nguoi: "workshop", bo_phan_tai_khoan: "workshop", so_phan_cong: 1 })],
      roles: [role({ business_role: "workshop_staff" })],
      directory: [person({ department: "workshop", access_class: "workshop_staff", ...scopes })],
    })[0];

    assert.equal(readiness(row, "scope").state, "missing", missingField);
    assert.ok(readiness(row, "scope").nextAction, missingField);
  }
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

test("dòng không có user_id vẫn được giữ để xử lý", () => {
  const rows = buildAccountAdministrationRows({
    accounts: [account({ user_id: null, pid: null, co_tai_khoan: false, ten: "Chưa có tài khoản" })],
    roles: [role({ user_id: "user-a" })],
    directory: [person()],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Chưa có tài khoản");
  assert.equal(readiness(rows[0], "account").state, "missing");
  assert.equal(readiness(rows[0], "person_link").state, "missing");
});

test("phân công của admin và quản lý là không áp dụng còn staff cần bằng chứng", () => {
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
  assert.equal(readiness(rows[2], "assignment").state, "ready");
  assert.equal(readiness(rows[3], "assignment").state, "missing");
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
  const row = buildAccountAdministrationRows({
    accounts: [account({ user_id: null, pid: null, co_tai_khoan: false })],
    roles: [],
    directory: [],
  })[0];

  const plan = planBusinessRoleChange(row, "admin");
  assert.equal(plan.userId, "");
  assert.equal(plan.canSave, false);
  assert.ok(plan.blocker);
});

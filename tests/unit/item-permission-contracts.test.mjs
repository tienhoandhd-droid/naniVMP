import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

async function loadContracts() {
  try {
    return await import("../../src/features/itemPermissions/types.ts");
  } catch (error) {
    assert.fail(`Chưa có hợp đồng phân quyền có thể nạp: ${error.message}`);
  }
}

test("phân loại tạo đúng quyền sửa ở từng nhóm timeline", async () => {
  const {
    ACCESS_CLASSES,
    QA_TIMELINE_FIELDS,
    EQUIPMENT_TIMELINE_FIELDS,
  } = await loadContracts();

  assert.deepEqual(ACCESS_CLASSES.map((item) => item.id), [
    "view_only",
    "qa_progress_editor",
    "qa_manager",
    "equipment_scheduler",
    "equipment_manager",
  ]);
  assert.equal(QA_TIMELINE_FIELDS.length, 8);
  assert.deepEqual(EQUIPMENT_TIMELINE_FIELDS, ["scheduled_at"]);
  assert.deepEqual(
    QA_TIMELINE_FIELDS.filter((field) => EQUIPMENT_TIMELINE_FIELDS.includes(field)),
    [],
  );
});

test("khớp tên giữ nguyên dấu và chỉ chuẩn hóa khoảng trắng, hoa thường", async () => {
  const { normalizePersonName } = await loadContracts();

  assert.equal(normalizePersonName("  Đặng   Thị Hồng Ngọc "), "đặng thị hồng ngọc");
  assert.notEqual(
    normalizePersonName("Đặng Thị Hồng Ngọc"),
    normalizePersonName("Dang Thi Hong Ngoc"),
  );
});

test("decoder tài khoản ứng viên và args nối tài khoản giữ hợp đồng RPC chuẩn", async () => {
  const { decodeAccountCandidate, createLinkPermissionAccountArgs } = await import(
    "../../src/features/itemPermissions/api.ts"
  );
  const candidate = {
    user_id: "user-1",
    email: "qa@vmp.local",
    full_name: "QA A",
    role: "viewer",
    department: "qa",
    is_active: true,
    linked_person_id: null,
  };

  assert.deepEqual(decodeAccountCandidate(candidate), candidate);
  assert.deepEqual(
    createLinkPermissionAccountArgs("person-1", "user-1", "Nối tài khoản", 3),
    {
      p_person_id: "person-1",
      p_user_id: "user-1",
      p_reason: "Nối tài khoản",
      p_expected_version: 3,
    },
  );
});

test("chỉ Admin nhìn thấy thao tác nối tài khoản", async () => {
  const { default: AccountLinkPanel } = await import(
    "../../src/features/itemPermissions/AccountLinkPanel.tsx"
  );
  const person = {
    person_id: "person-1",
    user_id: null,
    employee_code: null,
    full_name: "QA A",
    department: "qa",
    email: null,
    account_status: "unlinked",
    access_class: "qa_manager",
    scope_departments: [],
    scope_factory_ids: [],
    scope_area_ids: [],
    scope_line_ids: [],
    access_areas: [],
    version: 3,
    email_sent_confirmed: false,
    is_active: true,
    match_status: "unique",
  };

  const denied = renderToStaticMarkup(React.createElement(AccountLinkPanel, {
    person,
    canManageAccounts: false,
    onLinked: () => {},
  }));
  const admin = renderToStaticMarkup(React.createElement(AccountLinkPanel, {
    person,
    canManageAccounts: true,
    onLinked: () => {},
  }));

  assert.equal(denied, "");
  assert.match(admin, /Tìm tài khoản để nối/);
  assert.match(admin, /Lý do nối tài khoản/);
});

test("tải lại danh bạ sau nối chọn lại đúng person_id khi trùng tên", async () => {
  const { reloadSelectedDirectoryPerson } = await import(
    "../../src/features/itemPermissions/StaffDirectoryPanel.tsx"
  );
  const selected = { person_id: "person-2", full_name: "QA Trùng Tên" };
  const other = { person_id: "person-1", full_name: "QA Trùng Tên" };
  let searched = "";

  const refreshed = await reloadSelectedDirectoryPerson(selected, async (query) => {
    searched = query;
    return [other, selected];
  });

  assert.equal(searched, "QA Trùng Tên");
  assert.equal(refreshed, selected);
});

test("QA manager được phân công nhưng không được sửa danh bạ hoặc nối tài khoản", async () => {
  const source = await readFile("src/pages/PhanQuyenPage.tsx", "utf8");

  assert.match(source, /const canManageDirectory = isAdmin \|\| user\?\.role === "admin"/);
  assert.match(source, /const canManageQaAssignments = canManageDirectory\s*\|\| user\?\.role === "qa_manager"\s*\|\| user\?\.accessClass === "qa_manager"/);
  assert.match(source, /<AssignmentPanel person=\{person\} canEdit=\{canManageQaAssignments\}/);
  assert.doesNotMatch(source, /lienKetTaiKhoan/);
});

test("decoder danh bạ giữ dòng legacy thiếu cấu hình để có thể sửa", async () => {
  const { decodeDirectoryPerson } = await import(
    "../../src/features/itemPermissions/api.ts"
  );
  const valid = {
    person_id: "11111111-1111-1111-1111-111111111111",
    user_id: null,
    employee_code: null,
    full_name: "Đặng Thị Hồng Ngọc",
    department: "rd",
    email: null,
    account_status: "unlinked",
    access_class: "view_only",
    scope_departments: ["rd"],
    scope_factory_ids: ["factory-1"],
    scope_area_ids: ["area-1"],
    scope_line_ids: ["line-1"],
    access_areas: ["A1"],
    version: 3,
    email_sent_confirmed: false,
    is_active: true,
    match_status: "unique",
  };

  assert.deepEqual(decodeDirectoryPerson(valid), valid);
  assert.deepEqual(decodeDirectoryPerson({
    ...valid,
    department: null,
    access_class: null,
    scope_departments: null,
    scope_factory_ids: null,
    scope_area_ids: null,
    scope_line_ids: null,
    access_areas: null,
  }), {
    ...valid,
    department: null,
    access_class: null,
    scope_departments: [],
    scope_factory_ids: [],
    scope_area_ids: [],
    scope_line_ids: [],
    access_areas: [],
  });

  const missingLegacyFields = { ...valid };
  delete missingLegacyFields.department;
  delete missingLegacyFields.access_class;
  delete missingLegacyFields.scope_departments;
  delete missingLegacyFields.scope_factory_ids;
  delete missingLegacyFields.scope_area_ids;
  delete missingLegacyFields.scope_line_ids;
  delete missingLegacyFields.access_areas;
  assert.deepEqual(decodeDirectoryPerson(missingLegacyFields), {
    ...valid,
    department: null,
    access_class: null,
    scope_departments: [],
    scope_factory_ids: [],
    scope_area_ids: [],
    scope_line_ids: [],
    access_areas: [],
  });

  for (const field of ["scope_factory_ids", "scope_area_ids", "scope_line_ids"]) {
    assert.throws(() => decodeDirectoryPerson({ ...valid, [field]: [7] }), new RegExp(field));
  }
  assert.throws(() => decodeDirectoryPerson({ ...valid, version: "3" }), /version/);
});

test("decoder danh mục đổi khóa cha từ RPC sang ScopeCatalog và bắt dữ liệu sai", async () => {
  const { decodeScopeCatalog } = await import(
    "../../src/features/itemPermissions/api.ts"
  );
  const payload = {
    departments: [{ id: "qa", code: "QA", label: "Đảm bảo chất lượng" }],
    factories: [{ id: "factory-1", code: "X1", label: "Xưởng 1", department_id: "qa" }],
    areas: [{ id: "area-1", code: "KV1", label: "Khu vực 1", factory_id: "factory-1" }],
    lines: [{ id: "line-1", code: "L1", label: "Line 1", area_id: "area-1" }],
  };

  assert.deepEqual(decodeScopeCatalog(payload), {
    departments: payload.departments,
    factories: [{ id: "factory-1", code: "X1", label: "Xưởng 1", parentId: "qa" }],
    areas: [{ id: "area-1", code: "KV1", label: "Khu vực 1", parentId: "factory-1" }],
    lines: [{ id: "line-1", code: "L1", label: "Line 1", parentId: "area-1" }],
  });
  assert.throws(
    () => decodeScopeCatalog({ ...payload, factories: [{ ...payload.factories[0], department_id: null }] }),
    /department_id/,
  );
});

test("tham số lưu tách expected version khỏi patch allowlist", async () => {
  const { createSavePermissionPersonArgs } = await import(
    "../../src/features/itemPermissions/api.ts"
  );
  const patch = {
    full_name: "Nguyễn Văn A",
    department: "qa",
    access_class: "qa_manager",
    scope_departments: ["qa"],
    scope_factory_ids: ["factory-1"],
    scope_area_ids: ["area-1"],
    scope_line_ids: ["line-1"],
  };

  assert.deepEqual(createSavePermissionPersonArgs("person-1", patch, "Cập nhật", 7), {
    p_person_id: "person-1",
    p_patch: patch,
    p_reason: "Cập nhật",
    p_expected_version: 7,
  });
  assert.equal(
    createSavePermissionPersonArgs(null, patch, "Tạo mới", null).p_expected_version,
    0,
  );
  assert.equal("expected_version" in patch, false);
});

test("decoder danh bạ vẫn bắt buộc định danh và họ tên", async () => {
  const { decodeDirectoryPerson } = await import(
    "../../src/features/itemPermissions/api.ts"
  );
  const valid = {
    person_id: "11111111-1111-1111-1111-111111111111",
    user_id: null,
    employee_code: null,
    full_name: "Đặng Thị Hồng Ngọc",
    department: null,
    email: null,
    account_status: "unlinked",
    access_class: null,
    scope_departments: null,
    scope_factory_ids: null,
    scope_area_ids: null,
    scope_line_ids: null,
    access_areas: null,
    version: 1,
    email_sent_confirmed: false,
    is_active: true,
    match_status: "unique",
  };

  for (const key of ["person_id", "full_name"]) {
    const invalid = { ...valid };
    delete invalid[key];
    assert.throws(() => decodeDirectoryPerson(invalid), new RegExp(key));
  }
});

test("hồ sơ legacy chưa đủ bị khóa phân công cho tới khi bổ sung đủ", async () => {
  const { isDirectoryPersonComplete } = await loadContracts();
  const complete = {
    person_id: "11111111-1111-1111-1111-111111111111",
    user_id: null,
    employee_code: null,
    full_name: "Đặng Thị Hồng Ngọc",
    department: "rd",
    email: null,
    account_status: "unlinked",
    access_class: "view_only",
    scope_departments: ["rd"],
    scope_factory_ids: ["factory-1"],
    scope_area_ids: ["area-1"],
    scope_line_ids: ["line-1"],
    access_areas: ["A1"],
    version: 1,
    email_sent_confirmed: false,
    is_active: true,
    match_status: "unique",
  };

  assert.equal(isDirectoryPersonComplete(complete), true);
  assert.equal(isDirectoryPersonComplete({ ...complete, department: null }), false);
  assert.equal(isDirectoryPersonComplete({ ...complete, access_class: null }), false);
  assert.equal(isDirectoryPersonComplete({ ...complete, scope_departments: [] }), false);
  assert.equal(isDirectoryPersonComplete({ ...complete, scope_factory_ids: [] }), false);
  assert.equal(isDirectoryPersonComplete({ ...complete, scope_area_ids: [] }), false);
  assert.equal(isDirectoryPersonComplete({ ...complete, scope_line_ids: [] }), false);
});

test("QA không cần phạm vi phân cấp còn nhóm thiết bị thì cần đủ phạm vi", async () => {
  const {
    isQaAccessClass,
    requiresHierarchyScope,
    isDirectoryPersonComplete,
  } = await loadContracts();
  const complete = {
    person_id: "11111111-1111-1111-1111-111111111111",
    user_id: null,
    employee_code: null,
    full_name: "Đặng Thị Hồng Ngọc",
    department: "rd",
    email: null,
    account_status: "unlinked",
    access_class: "view_only",
    scope_departments: ["rd"],
    scope_factory_ids: ["factory-1"],
    scope_area_ids: ["area-1"],
    scope_line_ids: ["line-1"],
    access_areas: ["A1"],
    version: 1,
    email_sent_confirmed: false,
    is_active: true,
    match_status: "unique",
  };
  const qa = {
    ...complete,
    department: "qa",
    access_class: "qa_progress_editor",
    scope_departments: [],
    scope_factory_ids: [],
    scope_area_ids: [],
    scope_line_ids: [],
  };

  assert.equal(isQaAccessClass(qa.access_class), true);
  assert.equal(requiresHierarchyScope(qa.access_class), false);
  assert.equal(isDirectoryPersonComplete(qa), true);
  assert.equal(isDirectoryPersonComplete({ ...qa, department: "rd" }), false);

  const equipment = { ...complete, access_class: "equipment_scheduler" };
  assert.equal(requiresHierarchyScope(equipment.access_class), true);
  assert.equal(isDirectoryPersonComplete({ ...equipment, scope_line_ids: [] }), false);
});

test("decoder phân công nhận vai trò QA hợp lệ và từ chối vai trò ngoài hợp đồng", async () => {
  const { decodeAssignment } = await import("../../src/features/itemPermissions/api.ts");
  const valid = {
    assignment_id: "assignment-1",
    validation_code: "VAL-001",
    person_id: "person-1",
    user_id: null,
    staff_name: "Đặng Thị Hồng Ngọc",
    employee_code: null,
    assignment_kind: "qa",
    assignment_role: "primary",
    source: "manual",
    source_text: null,
    unresolved_reason: null,
    expires_at: null,
    is_active: true,
    grants_access: true,
    object_department: "qa",
    area: null,
    line: null,
  };

  assert.deepEqual(decodeAssignment(valid), valid);
  assert.throws(
    () => decodeAssignment({ ...valid, assignment_role: "owner" }),
    /assignment_role/,
  );
});

test("migration bắt buộc hierarchy trong quyền hiệu lực và chặn các đường ghi legacy", async () => {
  const sql = await readFile(new URL(
    "../../supabase/migrations/20260810160000_pham_vi_xuong_khu_vuc_line_va_person_id.sql",
    import.meta.url,
  ), "utf8");

  assert.match(sql, /create or replace function public\.vmp_item_scope_matches/);
  assert.match(sql, /'factory_match', scope\.factory_match/);
  assert.match(sql, /'line_match', scope\.line_match/);
  assert.match(sql, /'error_code', 'VERSION_REQUIRED'/);
  assert.match(sql, /'error_code', 'PERSON_ID_REQUIRED'/);
  assert.match(sql, /raise exception 'IMPORT_ROW_FAILED:/);
  assert.match(sql, /alter function public\.rpc_set_item_performer\(text, text\)\s+security invoker/);
  assert.match(sql, /revoke all on function public\.rpc_set_item_performer\(text, text\)/);
});

test("chọn kết quả lưu theo person_id dù hai dòng trùng tên", async () => {
  const { findDirectoryPersonById } = await loadContracts();
  const people = [
    { person_id: "person-first", full_name: "Nguyễn Văn Trùng" },
    { person_id: "person-saved", full_name: "Nguyễn Văn Trùng" },
  ];

  assert.equal(findDirectoryPersonById(people, "person-saved"), people[1]);
  assert.equal(findDirectoryPersonById(people, "person-missing"), null);
});

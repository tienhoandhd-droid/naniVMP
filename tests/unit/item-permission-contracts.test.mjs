import test from "node:test";
import assert from "node:assert/strict";

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

test("chọn kết quả lưu theo person_id dù hai dòng trùng tên", async () => {
  const { findDirectoryPersonById } = await loadContracts();
  const people = [
    { person_id: "person-first", full_name: "Nguyễn Văn Trùng" },
    { person_id: "person-saved", full_name: "Nguyễn Văn Trùng" },
  ];

  assert.equal(findDirectoryPersonById(people, "person-saved"), people[1]);
  assert.equal(findDirectoryPersonById(people, "person-missing"), null);
});

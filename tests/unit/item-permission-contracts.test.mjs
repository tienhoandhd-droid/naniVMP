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
    access_areas: ["A1"],
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
    access_areas: null,
  }), {
    ...valid,
    department: null,
    access_class: null,
    scope_departments: [],
    access_areas: [],
  });

  const missingLegacyFields = { ...valid };
  delete missingLegacyFields.department;
  delete missingLegacyFields.access_class;
  delete missingLegacyFields.scope_departments;
  delete missingLegacyFields.access_areas;
  assert.deepEqual(decodeDirectoryPerson(missingLegacyFields), {
    ...valid,
    department: null,
    access_class: null,
    scope_departments: [],
    access_areas: [],
  });
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
    access_areas: null,
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
    access_areas: ["A1"],
    email_sent_confirmed: false,
    is_active: true,
    match_status: "unique",
  };

  assert.equal(isDirectoryPersonComplete(complete), true);
  assert.equal(isDirectoryPersonComplete({ ...complete, department: null }), false);
  assert.equal(isDirectoryPersonComplete({ ...complete, access_class: null }), false);
  assert.equal(isDirectoryPersonComplete({ ...complete, scope_departments: [] }), false);
  assert.equal(isDirectoryPersonComplete({ ...complete, access_areas: [] }), false);
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

import test from "node:test";
import assert from "node:assert/strict";

async function loadSelection() {
  try {
    return await import("../../src/features/itemPermissions/performerSelection.ts");
  } catch (error) {
    assert.fail(`Chưa có logic chọn người thực hiện có thể nạp: ${error.message}`);
  }
}

const choices = [
  {
    personId: "person-first",
    fullName: "Nguyễn Văn Trùng",
    email: "first@example.com",
    department: "qa",
    employeeCode: null,
  },
  {
    personId: "person-second",
    fullName: "Nguyễn Văn Trùng",
    email: "second@example.com",
    department: "rd",
    employeeCode: null,
  },
];

test("chỉ chấp nhận person_id có trong danh sách và giữ được người trùng tên", async () => {
  const { resolvePerformerChoice } = await loadSelection();

  assert.equal(resolvePerformerChoice("person-second", choices), choices[1]);
  assert.equal(resolvePerformerChoice("Nguyễn Văn Trùng", choices), null);
  assert.equal(resolvePerformerChoice("person-missing", choices), null);
  assert.equal(resolvePerformerChoice(null, choices), null);
});

test("danh sách gán chỉ gồm người đang hoạt động và không gộp người trùng tên", async () => {
  const { buildActivePerformerChoices } = await loadSelection();
  const result = buildActivePerformerChoices([
    { id: "person-first", performer_name: "Nguyễn Văn Trùng", email: "first@example.com", department: "qa", employee_code: null, is_active: true },
    { id: "person-second", performer_name: "Nguyễn Văn Trùng", email: "second@example.com", department: "rd", employee_code: null, is_active: true },
    { id: "person-inactive", performer_name: "Người đã nghỉ", email: null, department: null, employee_code: null, is_active: false },
  ]);

  assert.deepEqual(result, choices);
});

test("bản nháp danh mục nguồn lưu cả ID và tên chuẩn chỉ khi lập payload", async () => {
  const { buildSourcePerformerPatch } = await loadSelection();

  assert.deepEqual(buildSourcePerformerPatch("owner_name", "person-second", choices), {
    owner_person_id: "person-second",
    owner_name: "Nguyễn Văn Trùng",
  });
  assert.deepEqual(buildSourcePerformerPatch("support_name", null, choices), {
    support_person_id: null,
    support_name: "",
  });
  assert.throws(
    () => buildSourcePerformerPatch("owner_name", "person-missing", choices),
    /không còn hoạt động hoặc không tồn tại/i,
  );
});

test("gán người cho hạng mục gửi ID và lý do, không gửi tên", async () => {
  const { buildSetItemPerformerByIdArgs } = await loadSelection();

  assert.deepEqual(
    buildSetItemPerformerByIdArgs("VAL-2026-001", "person-second", "Điều chỉnh phân công"),
    {
      p_validation_code: "VAL-2026-001",
      p_person_id: "person-second",
      p_reason: "Điều chỉnh phân công",
    },
  );
  assert.deepEqual(
    buildSetItemPerformerByIdArgs("VAL-2026-001", null, "Bỏ phân công"),
    {
      p_validation_code: "VAL-2026-001",
      p_person_id: null,
      p_reason: "Bỏ phân công",
    },
  );
});

test("chỉ suy ra ID từ tên legacy khi khớp duy nhất", async () => {
  const { resolveUniquePerformerIdByName } = await loadSelection();

  assert.equal(
    resolveUniquePerformerIdByName("  Trần   Thị An ", [
      ...choices,
      { personId: "person-an", fullName: "Trần Thị An", email: null, department: "qa", employeeCode: null },
    ]),
    "person-an",
  );
  assert.equal(resolveUniquePerformerIdByName("Nguyễn Văn Trùng", choices), null);
  assert.equal(resolveUniquePerformerIdByName("Người không có", choices), null);
});

test("nhãn lựa chọn luôn có hậu tố ID và thêm mã nhân viên khi có", async () => {
  const { formatPerformerOptionLabel } = await loadSelection();
  const common = {
    fullName: "Nguyễn Văn Trùng",
    email: "same@example.com",
    department: "qa",
  };

  assert.equal(formatPerformerOptionLabel({
    ...common,
    personId: "11111111-1111-1111-1111-1111aaaa0001",
    employeeCode: "NV-001",
  }), "Nguyễn Văn Trùng · same@example.com · qa · Mã NV NV-001 · ID …aaaa0001");
  assert.equal(formatPerformerOptionLabel({
    ...common,
    personId: "11111111-1111-1111-1111-1111bbbb0002",
    employeeCode: null,
  }), "Nguyễn Văn Trùng · same@example.com · qa · ID …bbbb0002");
});

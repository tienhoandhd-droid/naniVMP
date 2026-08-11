import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const scopeCatalog = {
  departments: [
    { id: "qa", code: "QA", label: "Đảm bảo chất lượng" },
    { id: "qc", code: "QC", label: "Kiểm tra chất lượng" },
  ],
  factories: [
    { id: "factory-1", code: "X1", label: "Xưởng 1", parentId: "qa" },
    { id: "factory-2", code: "X2", label: "Xưởng 2", parentId: "qc" },
  ],
  areas: [
    { id: "area-1", code: "KV1", label: "Khu vực 1", parentId: "factory-1" },
    { id: "area-2", code: "KV2", label: "Khu vực 2", parentId: "factory-2" },
  ],
  lines: [
    { id: "line-1", code: "L1", label: "Line 1", parentId: "area-1" },
    { id: "line-2", code: "L2", label: "Line 2", parentId: "area-2" },
  ],
};

test("file Excel phân quyền có đúng 11 cột, validation và hướng dẫn", async () => {
  const { createPermissionWorkbook } = await import("../../scripts/permission-workbook.mjs");
  const ExcelJS = (await import("exceljs")).default;
  const directory = await mkdtemp(path.join(tmpdir(), "vmp-permission-workbook-"));
  const output = path.join(directory, "phan-quyen-vmp.xlsx");

  try {
    await createPermissionWorkbook(output);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(output);

    assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Trang tính1", "Hướng dẫn"]);
    const dataSheet = workbook.getWorksheet("Trang tính1");
    const headers = dataSheet.getRow(1).values.slice(1);
    assert.deepEqual(headers, [
      "STT", "Bộ phận", "Mã nhân viên", "Họ và tên", "Phân loại",
      "Phạm vi bộ phận", "Phạm vi xưởng", "Phạm vi khu vực", "Phạm vi line",
      "Email nhận tài khoản", "Xác nhận gửi email",
    ]);
    assert.equal(headers.length, 11);

    const classificationValidation = dataSheet.getCell("E2").dataValidation;
    assert.equal(classificationValidation.type, "list");
    assert.match(classificationValidation.formulae[0], /QA – Cập nhật 4 mốc hoàn thành/);

    const guideSheet = workbook.getWorksheet("Hướng dẫn");
    const guideText = guideSheet.getColumn(1).values.join("\n");
    assert.match(guideText, /Mã nhân viên.*không bắt buộc/s);
    assert.match(guideText, /dấu chấm phẩy/s);
    assert.match(guideText, /QA để trống bốn cột phạm vi/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("parser cho QA để trống bốn cột phạm vi", async () => {
  const { parsePermissionRows, PERMISSION_HEADERS } = await import(
    "../../src/features/itemPermissions/permissionWorkbook.ts"
  );
  const qaWithoutScope = parsePermissionRows([
    PERMISSION_HEADERS,
    [1, "QA", "NV01", "Nguyễn Văn A", "QA – Cập nhật 4 mốc hoàn thành", "", "", "", "", "a@vmp.local", "Có"],
  ], { scopeCatalog });
  assert.deepEqual(qaWithoutScope.errors, []);
  assert.deepEqual(qaWithoutScope.rows[0].scope_departments, []);
  assert.deepEqual(qaWithoutScope.rows[0].scope_factory_ids, []);
  assert.deepEqual(qaWithoutScope.rows[0].scope_area_ids, []);
  assert.deepEqual(qaWithoutScope.rows[0].scope_line_ids, []);
});

test("parser đổi bốn tầng mã sang ID và chấp nhận mã nhân viên trống cho non-QA", async () => {
  const { parsePermissionRows, PERMISSION_HEADERS } = await import(
    "../../src/features/itemPermissions/permissionWorkbook.ts"
  );
  const valid = parsePermissionRows([
    PERMISSION_HEADERS,
    [1, "QA", "", "Nguyễn Văn A", "Bộ phận quản lý thiết bị – Xếp lịch thẩm định", "QA", "X1", "KV1", "L1", "a@vmp.local", "Có"],
  ], { scopeCatalog });
  assert.equal(valid.errors.length, 0);
  assert.equal(valid.rows[0].employee_code, null);
  assert.deepEqual(valid.rows[0].scope_departments, ["qa"]);
  assert.deepEqual(valid.rows[0].scope_factory_ids, ["factory-1"]);
  assert.deepEqual(valid.rows[0].scope_area_ids, ["area-1"]);
  assert.deepEqual(valid.rows[0].scope_line_ids, ["line-1"]);
});

test("parser bắt equipment_scheduler nhập đủ bốn tầng phạm vi", async () => {
  const { parsePermissionRows, PERMISSION_HEADERS } = await import(
    "../../src/features/itemPermissions/permissionWorkbook.ts"
  );
  const missingScope = parsePermissionRows([
    PERMISSION_HEADERS,
    [1, "QA", "NV01", "Nguyễn Văn A", "Bộ phận quản lý thiết bị – Xếp lịch thẩm định", "", "", "", "", "", "Không"],
  ], { scopeCatalog });
  assert.deepEqual(missingScope.rows, []);
  assert.deepEqual(missingScope.errors.map((error) => error.message), [
    "Phạm vi bộ phận không được để trống",
    "Phạm vi xưởng không được để trống",
    "Phạm vi khu vực không được để trống",
    "Phạm vi line không được để trống",
  ]);
});

test("parser báo đúng dòng khi mã lạ hoặc quan hệ cha con sai", async () => {
  const { parsePermissionRows, PERMISSION_HEADERS } = await import(
    "../../src/features/itemPermissions/permissionWorkbook.ts"
  );

  const invalidCode = parsePermissionRows([
    PERMISSION_HEADERS,
    [2, "QA", "NV02", "Nguyễn Văn B", "Bộ phận quản lý thiết bị – Xếp lịch thẩm định", "QA", "X-KHONG-CO", "KV1", "L1", "", "Không"],
  ], { scopeCatalog });
  assert.equal(invalidCode.rows.length, 0);
  assert.equal(invalidCode.errors[0].rowNumber, 2);
  assert.match(invalidCode.errors.map((error) => error.message).join(" "), /Mã phạm vi không tồn tại/);

  const invalidRelationship = parsePermissionRows([
    PERMISSION_HEADERS,
    [3, "QA", "NV03", "Nguyễn Văn C", "Bộ phận quản lý thiết bị – Xếp lịch thẩm định", "QA", "X1", "KV1", "L2", "", "Không"],
  ], { scopeCatalog });
  assert.equal(invalidRelationship.rows.length, 0);
  assert.equal(invalidRelationship.errors[0].rowNumber, 2);
  assert.match(invalidRelationship.errors.map((error) => error.message).join(" "), /Quan hệ phạm vi không hợp lệ/);

  const blankTemplateRows = parsePermissionRows([
    PERMISSION_HEADERS,
    [1, "", "", "", "", "", "", "", "", "", ""],
    [2, "", "", "", "", "", "", "", "", "", ""],
  ], { scopeCatalog });
  assert.deepEqual(blankTemplateRows, { rows: [], errors: [] });
});

test("parser từ chối file quá 5 MiB trước khi đọc nội dung", async () => {
  const { parsePermissionWorkbook } = await import(
    "../../src/features/itemPermissions/permissionWorkbook.ts"
  );
  let arrayBufferCalled = false;
  const result = await parsePermissionWorkbook({
    size: 5 * 1024 * 1024 + 1,
    async arrayBuffer() {
      arrayBufferCalled = true;
      throw new Error("không được đọc file quá lớn");
    },
  });

  assert.equal(arrayBufferCalled, false);
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0].message, /5 MiB/);
});

test("parser từ chối workbook quá 1.000 dòng hoặc 20.000 ô trước khi tạo matrix", async () => {
  const { parsePermissionWorkbook } = await import(
    "../../src/features/itemPermissions/permissionWorkbook.ts"
  );
  const ExcelJS = (await import("exceljs")).default;
  const parseWorkbook = async (workbook) => {
    const bytes = await workbook.xlsx.writeBuffer();
    return parsePermissionWorkbook({
      size: bytes.byteLength,
      async arrayBuffer() { return bytes; },
    });
  };

  const tooManyRows = new ExcelJS.Workbook();
  tooManyRows.addWorksheet("Trang tính1").getCell("A1001").value = "dư dòng";
  const rowResult = await parseWorkbook(tooManyRows);
  assert.equal(rowResult.rows.length, 0);
  assert.match(rowResult.errors[0].message, /tối đa 1\.000 dòng/);

  const tooManyCells = new ExcelJS.Workbook();
  const cellSheet = tooManyCells.addWorksheet("Trang tính1");
  for (let row = 1; row <= 1000; row += 1) {
    cellSheet.getRow(row).values = Array.from({ length: 20 }, () => "x");
  }
  cellSheet.getCell("U1").value = "ô thứ 20.001";
  const cellResult = await parseWorkbook(tooManyCells);
  assert.equal(cellResult.rows.length, 0);
  assert.match(cellResult.errors[0].message, /tối đa 20\.000 ô/);
});

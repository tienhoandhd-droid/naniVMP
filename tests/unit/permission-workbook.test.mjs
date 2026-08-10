import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("file Excel phân quyền có đúng 9 cột, validation và hướng dẫn", async () => {
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
      "Phạm vi", "Khu vực phân quyền", "Email nhận tài khoản", "Xác nhận gửi email",
    ]);
    assert.equal(headers.length, 9);

    const classificationValidation = dataSheet.getCell("E2").dataValidation;
    assert.equal(classificationValidation.type, "list");
    assert.match(classificationValidation.formulae[0], /QA – Cập nhật 4 mốc hoàn thành/);

    const guideSheet = workbook.getWorksheet("Hướng dẫn");
    const guideText = guideSheet.getColumn(1).values.join("\n");
    assert.match(guideText, /Mã nhân viên.*không bắt buộc/s);
    assert.match(guideText, /dấu chấm phẩy/s);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("parser chấp nhận mã nhân viên trống và chặn phân loại/khu vực lạ", async () => {
  const { parsePermissionRows, PERMISSION_HEADERS } = await import(
    "../../src/features/itemPermissions/permissionWorkbook.ts"
  );
  const valid = parsePermissionRows([
    PERMISSION_HEADERS,
    [1, "QA", "", "Nguyễn Văn A", "QA – Cập nhật 4 mốc hoàn thành", "QA;QC", "A1;A2", "a@vmp.local", "Có"],
  ], { validAreas: ["A1", "A2"] });
  assert.equal(valid.errors.length, 0);
  assert.equal(valid.rows[0].employee_code, null);
  assert.deepEqual(valid.rows[0].scope_departments, ["qa", "qc"]);

  const invalid = parsePermissionRows([
    PERMISSION_HEADERS,
    [2, "QA", "NV02", "Nguyễn Văn B", "Quyền tự chế", "QA", "KHU-LA", "", "Không"],
  ], { validAreas: ["A1", "A2"] });
  assert.equal(invalid.rows.length, 0);
  assert.match(invalid.errors.map((error) => error.message).join(" "), /Phân loại.*không hợp lệ|Khu vực.*không hợp lệ/);
});

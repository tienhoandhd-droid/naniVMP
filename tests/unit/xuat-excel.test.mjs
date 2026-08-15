/* =====================================================================
 *  xuat-excel.test.mjs — helper xuất Excel dùng chung (Đợt B Task 13)
 *  ---------------------------------------------------------------------
 *  Ra đời khi gỡ SheetJS/xlsx (2 lỗ hổng runtime không có bản vá npm):
 *  mọi chỗ XUẤT Excel đi qua một helper ExcelJS duy nhất — cùng thư viện
 *  với đường đọc, một hợp đồng, một chỗ làm sạch tên sheet.
 * ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import { dungWorkbookAoa, lamSachTenSheet } from "../../src/lib/xuatExcel.ts";

test("tên sheet bị làm sạch ký tự cấm và cắt về 31 ký tự", () => {
  assert.equal(lamSachTenSheet("Ky sau tháng 8/2026"), "Ky sau tháng 8-2026");
  assert.equal(lamSachTenSheet("a?b*c[d]e\\f:g/h"), "a-b-c-d-e-f-g-h");
  assert.equal(lamSachTenSheet("x".repeat(40)).length, 31);
});

test("workbook nhiều sheet đọc lại đúng từng ô, số vẫn là số", async () => {
  const buf = await dungWorkbookAoa([
    { ten: "Tổng quan", dong: [["Chỉ số", "Giá trị"], ["Tổng", 461], ["Tỷ lệ (%)", 25.5]] },
    { ten: "Theo tháng/2026", dong: [["Tháng", "Số"], ["T1", 3]] },
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  assert.equal(wb.worksheets.length, 2);
  assert.equal(wb.worksheets[0].name, "Tổng quan");
  assert.equal(wb.worksheets[1].name, "Theo tháng-2026");
  assert.equal(wb.worksheets[0].getCell("B2").value, 461);
  assert.equal(wb.worksheets[0].getCell("B3").value, 25.5);
  assert.equal(wb.worksheets[1].getCell("A2").value, "T1");
});

test("chuỗi bắt đầu bằng = được lưu là chữ, không phải công thức", async () => {
  const buf = await dungWorkbookAoa([
    { ten: "S", dong: [["A"], ["=HYPERLINK(\"http://xau\",\"bam\")"]] },
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const o = wb.worksheets[0].getCell("A2");
  assert.equal(typeof o.value, "string");
  assert.equal(o.formula, undefined);
});

test("null/undefined thành ô trống, không thành chữ 'null'", async () => {
  const buf = await dungWorkbookAoa([
    { ten: "S", dong: [["A", "B"], [null, undefined]] },
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const a2 = wb.worksheets[0].getCell("A2").value;
  const b2 = wb.worksheets[0].getCell("B2").value;
  assert.ok(a2 === null || a2 === undefined || a2 === "");
  assert.ok(b2 === null || b2 === undefined || b2 === "");
});

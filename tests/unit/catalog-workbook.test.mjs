/* =====================================================================
 *  catalog-workbook.test.mjs — hợp đồng mẫu Excel chính thức (Đợt B Task 8)
 *  ---------------------------------------------------------------------
 *  Kiểm bằng workbook ExcelJS THẬT, không mock: sinh file chuẩn rồi đột
 *  biến từng thứ một (đổi meta, đổi header, thêm dòng, nhét công thức…)
 *  và khẳng định parser từ chối đúng mã lỗi. Một parser file người dùng
 *  tải lên mà chỉ được kiểm bằng dữ liệu tự bịa là một parser chưa kiểm.
 * ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import {
  CATALOG_TEMPLATE_VERSION,
  TEMPLATE_CONTRACTS,
  generateCatalogWorkbook,
  parseCatalogWorkbook,
} from "../../src/features/catalogWorkspace/catalogWorkbook.ts";
import {
  SOURCE_OBJECT_HEADERS,
  PRODUCT_GMP_HEADERS,
} from "../../src/features/catalogWorkspace/definitions.ts";

/* ---------------- Dụng cụ ---------------- */

/** Bọc buffer thành hình dạng File mà parser nhận. */
const fileTu = (data, { name = "mau.xlsx", size } = {}) => ({
  name,
  size: size ?? data.byteLength,
  arrayBuffer: async () => data,
});

/** Nạp buffer → đột biến workbook → ghi lại buffer. */
async function dotBien(buffer, sua) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  await sua(wb);
  return wb.xlsx.writeBuffer();
}

const DONG_MAU = [
  {
    object_kind: "Thiết bị", object_code: "TB-100", object_name: "Máy dập viên",
    department: "xsx", area_code: "A1", validate_flag: "y",
    frequency_months: 12, first_month: 3, year_ref: 2024,
    workdays: 4, note: "ghi chú", is_active: true,
  },
  {
    object_kind: "Kho", object_code: "KHO-01", object_name: "Kho lạnh",
    department: "kho", validate_flag: "n", is_active: true,
  },
];

/* ---------------- Hợp đồng literal ---------------- */

test("header là hợp đồng literal — đổi thứ tự là đổi phiên bản mẫu", () => {
  assert.deepEqual([...SOURCE_OBJECT_HEADERS], [
    "Loại đối tượng", "Mã đối tượng", "Tên đối tượng", "Bộ phận quản lý",
    "Mã khu vực", "Dây chuyền", "Có thẩm định (y/n)", "Tần suất (tháng)",
    "Tháng đầu tiên", "Năm tham chiếu", "Nhóm báo cáo", "Nhóm công việc",
    "Số ngày công", "Điểm phức tạp", "Điểm ảnh hưởng chất lượng",
    "Ghi chú", "Đang dùng (y/n)",
  ]);
  assert.deepEqual([...PRODUCT_GMP_HEADERS], [
    "Mã BFO", "Tên sản phẩm", "Hoạt chất", "Hàm lượng", "Dạng bào chế",
    "Dây chuyền", "Bao bì sơ cấp", "Cỡ lô", "Bồn pha", "Cỡ lô thành phẩm",
    "Ghi chú", "Đang dùng (y/n)",
  ]);
  assert.equal(CATALOG_TEMPLATE_VERSION, "1");
  assert.equal(TEMPLATE_CONTRACTS.source_objects.fingerprint, "vmp-source-objects-v1");
  assert.equal(TEMPLATE_CONTRACTS.products_gmp.fingerprint, "vmp-products-gmp-v1");
  assert.equal(TEMPLATE_CONTRACTS.source_objects.sheet, "DU_LIEU");
});

/* ---------------- Chấp nhận ---------------- */

test("mẫu trống chính thức được chấp nhận, không dòng dữ liệu", async () => {
  const buf = await generateCatalogWorkbook("source_objects", []);
  const kq = await parseCatalogWorkbook(fileTu(buf));
  assert.equal(kq.ok, true, kq.error);
  assert.equal(kq.dataset, "source_objects");
  assert.equal(kq.rows.length, 0);
});

test("xuất dữ liệu hiện tại đọc lại đúng dòng, số và boolean được chuẩn hoá", async () => {
  const buf = await generateCatalogWorkbook("source_objects", DONG_MAU);
  const kq = await parseCatalogWorkbook(fileTu(buf));
  assert.equal(kq.ok, true, kq.error);
  assert.equal(kq.rows.length, 2);
  const [r1, r2] = kq.rows;
  assert.equal(r1.businessKey, "TB-100");
  assert.equal(r1.objectKind, "Thiết bị");
  assert.equal(r1.values.frequency_months, 12);
  assert.equal(r1.values.validate_flag, true);
  assert.equal(r1.errors.length, 0);
  assert.equal(r2.businessKey, "KHO-01");
  assert.equal(r2.values.validate_flag, false);
});

test("mẫu Sản phẩm GMP cũng đi trọn vòng sinh → đọc", async () => {
  const buf = await generateCatalogWorkbook("products_gmp", [
    { bfo_code: "BFO-200", product_name: "Paracetamol 500mg", dosage_form: "Viên nén", is_active: true },
  ]);
  const kq = await parseCatalogWorkbook(fileTu(buf, { name: "sp.xlsx" }));
  assert.equal(kq.ok, true, kq.error);
  assert.equal(kq.dataset, "products_gmp");
  assert.equal(kq.rows[0].businessKey, "BFO-200");
});

test("chuỗi bắt đầu bằng = + - @ được lưu là chữ, không phải công thức", async () => {
  const buf = await generateCatalogWorkbook("source_objects", [{
    object_kind: "Thiết bị", object_code: "TB-900",
    object_name: "=HYPERLINK(\"http://xau.example\",\"bấm\")",
    note: "+1-2@3",
  }]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const o = wb.getWorksheet("DU_LIEU").getCell("C2");
  assert.equal(typeof o.value, "string", "ô tên phải là chuỗi thuần");
  assert.equal(o.formula, undefined);
  // Và đọc lại qua parser vẫn ra nguyên văn.
  const kq = await parseCatalogWorkbook(fileTu(buf));
  assert.equal(kq.rows[0].values.object_name, "=HYPERLINK(\"http://xau.example\",\"bấm\")");
});

/* ---------------- Từ chối cấu trúc ---------------- */

test("từ chối file không phải .xlsx trước khi đọc", async () => {
  const kq = await parseCatalogWorkbook(fileTu(new ArrayBuffer(8), { name: "mau.xls" }));
  assert.equal(kq.ok, false);
  assert.equal(kq.errorCode, "FILE_KIND");
});

test("từ chối file quá 5 MiB trước khi đọc", async () => {
  const kq = await parseCatalogWorkbook(
    fileTu(new ArrayBuffer(8), { size: 5 * 1024 * 1024 + 1 }));
  assert.equal(kq.ok, false);
  assert.equal(kq.errorCode, "FILE_TOO_LARGE");
});

test("từ chối file không đọc được thành workbook", async () => {
  const rac = new TextEncoder().encode("day khong phai xlsx").buffer;
  const kq = await parseCatalogWorkbook(fileTu(rac));
  assert.equal(kq.ok, false);
  assert.equal(kq.errorCode, "WORKBOOK_UNREADABLE");
});

test("từ chối khi thiếu _VMP_META", async () => {
  const goc = await generateCatalogWorkbook("source_objects", []);
  const buf = await dotBien(goc, (wb) => { wb.removeWorksheet("_VMP_META"); });
  const kq = await parseCatalogWorkbook(fileTu(buf));
  assert.equal(kq.ok, false);
  assert.equal(kq.errorCode, "META_MISSING");
});

for (const [truong, o] of [["dataset", "B1"], ["version", "B2"], ["fingerprint", "B3"]]) {
  test(`từ chối khi meta sai ${truong}`, async () => {
    const goc = await generateCatalogWorkbook("source_objects", []);
    const buf = await dotBien(goc, (wb) => {
      wb.getWorksheet("_VMP_META").getCell(o).value = "gia-mao";
    });
    const kq = await parseCatalogWorkbook(fileTu(buf));
    assert.equal(kq.ok, false);
    assert.equal(kq.errorCode, "META_MISMATCH");
  });
}

test("từ chối khi sheet dữ liệu bị đổi tên", async () => {
  const goc = await generateCatalogWorkbook("source_objects", []);
  const buf = await dotBien(goc, (wb) => { wb.getWorksheet("DU_LIEU").name = "Sheet1"; });
  const kq = await parseCatalogWorkbook(fileTu(buf));
  assert.equal(kq.ok, false);
  assert.equal(kq.errorCode, "SHEET_MISSING");
});

for (const [ten, sua] of [
  ["đổi tên một header", (sheet) => { sheet.getCell("A1").value = "Loại"; }],
  ["đổi chỗ hai header", (sheet) => {
    const a = sheet.getCell("A1").value;
    sheet.getCell("A1").value = sheet.getCell("B1").value;
    sheet.getCell("B1").value = a;
  }],
  ["xoá header cuối", (sheet) => { sheet.getCell(1, SOURCE_OBJECT_HEADERS.length).value = null; }],
  ["thêm header thừa", (sheet) => { sheet.getCell(1, SOURCE_OBJECT_HEADERS.length + 1).value = "Cột lạ"; }],
]) {
  test(`từ chối khi ${ten}`, async () => {
    const goc = await generateCatalogWorkbook("source_objects", []);
    const buf = await dotBien(goc, (wb) => { sua(wb.getWorksheet("DU_LIEU")); });
    const kq = await parseCatalogWorkbook(fileTu(buf));
    assert.equal(kq.ok, false);
    assert.equal(kq.errorCode, "HEADER_MISMATCH");
  });
}

test("từ chối 2.001 dòng dữ liệu", async () => {
  const goc = await generateCatalogWorkbook("source_objects", []);
  const buf = await dotBien(goc, (wb) => {
    const sheet = wb.getWorksheet("DU_LIEU");
    for (let i = 0; i < 2001; i += 1) {
      sheet.addRow(["Thiết bị", `TB-${i}`, `Máy ${i}`]);
    }
  });
  const kq = await parseCatalogWorkbook(fileTu(buf));
  assert.equal(kq.ok, false);
  assert.equal(kq.errorCode, "TOO_MANY_ROWS");
});

test("từ chối quá 8 worksheet", async () => {
  const goc = await generateCatalogWorkbook("source_objects", []);
  const buf = await dotBien(goc, (wb) => {
    for (let i = 0; i < 6; i += 1) wb.addWorksheet(`THUA_${i}`);
  });
  const kq = await parseCatalogWorkbook(fileTu(buf));
  assert.equal(kq.ok, false);
  assert.equal(kq.errorCode, "TOO_MANY_SHEETS");
});

test("từ chối quá 64 cột trên sheet dữ liệu", async () => {
  const goc = await generateCatalogWorkbook("source_objects", []);
  const buf = await dotBien(goc, (wb) => {
    wb.getWorksheet("DU_LIEU").getCell(3, 65).value = "tràn";
  });
  const kq = await parseCatalogWorkbook(fileTu(buf));
  assert.equal(kq.ok, false);
  assert.equal(kq.errorCode, "TOO_MANY_COLUMNS");
});

test("từ chối quá 150.000 ô phải duyệt", async () => {
  const goc = await generateCatalogWorkbook("source_objects", []);
  const buf = await dotBien(goc, (wb) => {
    const sheet = wb.addWorksheet("NHOI");
    const dong = Array.from({ length: 64 }, (_, i) => `o${i}`);
    for (let i = 0; i < 2400; i += 1) sheet.addRow(dong);
  });
  const kq = await parseCatalogWorkbook(fileTu(buf));
  assert.equal(kq.ok, false);
  assert.equal(kq.errorCode, "TOO_MANY_CELLS");
});

/* ---------------- Lỗi theo dòng (cấu trúc vẫn hợp lệ) ---------------- */

test("ô công thức là lỗi chặn của dòng, không được tính giá trị", async () => {
  const goc = await generateCatalogWorkbook("source_objects", DONG_MAU);
  const buf = await dotBien(goc, (wb) => {
    wb.getWorksheet("DU_LIEU").getCell("C2").value = { formula: "1+1", result: 2 };
  });
  const kq = await parseCatalogWorkbook(fileTu(buf));
  assert.equal(kq.ok, true, kq.error);
  assert.ok(kq.rows[0].errors.some((e) => e.code === "CONG_THUC"),
    JSON.stringify(kq.rows[0].errors));
});

test("khoá trùng: dòng sau bị đánh dấu lỗi", async () => {
  const buf = await generateCatalogWorkbook("source_objects", [
    DONG_MAU[0], { ...DONG_MAU[1], object_code: "TB-100" },
  ]);
  const kq = await parseCatalogWorkbook(fileTu(buf));
  assert.equal(kq.ok, true, kq.error);
  assert.equal(kq.rows[0].errors.length, 0);
  assert.ok(kq.rows[1].errors.some((e) => e.code === "TRUNG_KHOA"));
});

test("số không hợp lệ và loại đối tượng lạ là lỗi dòng, không im lặng thành null", async () => {
  const goc = await generateCatalogWorkbook("source_objects", DONG_MAU);
  const buf = await dotBien(goc, (wb) => {
    const sheet = wb.getWorksheet("DU_LIEU");
    sheet.getCell("H2").value = "mười hai";   // Tần suất (tháng)
    sheet.getCell("A3").value = "Loại lạ";     // Loại đối tượng
  });
  const kq = await parseCatalogWorkbook(fileTu(buf));
  assert.equal(kq.ok, true, kq.error);
  assert.ok(kq.rows[0].errors.some((e) => e.code === "SO_KHONG_HOP_LE"));
  assert.ok(kq.rows[1].errors.some((e) => e.code === "LOAI_KHONG_HOP_LE"));
});

test("thiếu khoá nghiệp vụ và thiếu trường bắt buộc là lỗi dòng", async () => {
  const goc = await generateCatalogWorkbook("source_objects", DONG_MAU);
  const buf = await dotBien(goc, (wb) => {
    const sheet = wb.getWorksheet("DU_LIEU");
    sheet.getCell("B2").value = null;   // Mã đối tượng
    sheet.getCell("C3").value = null;   // Tên đối tượng (required)
  });
  const kq = await parseCatalogWorkbook(fileTu(buf));
  assert.equal(kq.ok, true, kq.error);
  assert.ok(kq.rows[0].errors.some((e) => e.code === "THIEU_KHOA"));
  assert.ok(kq.rows[1].errors.some((e) => e.code === "THIEU_BAT_BUOC"));
});

test("dòng trống hoàn toàn được bỏ qua, không thành lỗi", async () => {
  const goc = await generateCatalogWorkbook("source_objects", DONG_MAU);
  const buf = await dotBien(goc, (wb) => {
    wb.getWorksheet("DU_LIEU").addRow(["", "", ""]);
  });
  const kq = await parseCatalogWorkbook(fileTu(buf));
  assert.equal(kq.ok, true, kq.error);
  assert.equal(kq.rows.length, 2);
});

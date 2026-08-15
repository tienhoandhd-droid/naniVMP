/* =====================================================================
 *  tao-mau-catalog.mjs — dựng file Excel mẫu cho bộ kiểm catalog-workspace
 *  ---------------------------------------------------------------------
 *  Chạy bằng: node --import tsx tests/e2e/tao-mau-catalog.mjs <thư mục ra>
 *  (bộ kiểm e2e gọi qua execFileSync — cần tsx vì generator là TypeScript).
 *
 *  Dùng CHÍNH generateCatalogWorkbook của app để sinh file hợp lệ, rồi đột
 *  biến một bản để làm file sai fingerprint. Dữ liệu bám theo kho giả lập
 *  (gia-lap-supabase.mjs): TB-100 sửa tên · TB-101 giữ nguyên · TB-999 mới
 *  · TB-998 thiếu tên (lỗi).
 * ===================================================================== */
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";

import { generateCatalogWorkbook } from "../../src/features/catalogWorkspace/catalogWorkbook.ts";

const thuMuc = process.argv[2];
if (!thuMuc) throw new Error("Thiếu tham số: thư mục ghi file mẫu");

/* Khớp dungDoiTuong(i) trong gia-lap-supabase.mjs:
 *   TB-100 (i=0): tên "Máy dập viên xoay tròn" · dept xsx · first_month 1
 *   TB-101 (i=1): tên "Máy đóng nang tự động"  · dept cd  · first_month 2
 * Cả hai: validate_flag y · frequency_months 12 · is_active true. */
const DONG = [
  { object_kind: "Thiết bị", object_code: "TB-100", object_name: "Máy dập viên đã đổi tên",
    department: "xsx", validate_flag: "y", frequency_months: 12, first_month: 1, is_active: true },
  { object_kind: "Thiết bị", object_code: "TB-101", object_name: "Máy đóng nang tự động",
    department: "cd", validate_flag: "y", frequency_months: 12, first_month: 2, is_active: true },
  { object_kind: "Thiết bị", object_code: "TB-999", object_name: "Máy mới toanh",
    department: "qa", validate_flag: "y", frequency_months: 12, first_month: 5, is_active: true },
  { object_kind: "Thiết bị", object_code: "TB-998", object_name: "",
    department: "qa", validate_flag: "n", is_active: true },
];

const hopLe = Buffer.from(await generateCatalogWorkbook("source_objects", DONG));
writeFileSync(`${thuMuc}/hop-le.xlsx`, hopLe);

const wb = new ExcelJS.Workbook();
await wb.xlsx.load(hopLe);
wb.getWorksheet("_VMP_META").getCell("B3").value = "fingerprint-gia-mao";
writeFileSync(`${thuMuc}/sai-fingerprint.xlsx`, Buffer.from(await wb.xlsx.writeBuffer()));

console.log("da ghi hop-le.xlsx va sai-fingerprint.xlsx");

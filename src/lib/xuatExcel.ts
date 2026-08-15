/* =====================================================================
 *  xuatExcel.ts — MỘT đường xuất Excel cho cả app (Đợt B Task 13)
 *  ---------------------------------------------------------------------
 *  Ra đời khi gỡ SheetJS/xlsx: bản npm của nó dừng ở 0.18.5 và mang hai
 *  lỗ hổng runtime (ReDoS + prototype pollution) KHÔNG có bản vá trên
 *  npm. Đường đọc file người dùng đã dùng ExcelJS từ trước — nay đường
 *  xuất cũng vậy: một thư viện, một hợp đồng, một chỗ làm sạch tên sheet.
 *
 *  Giá trị luôn được ghi là chữ/số thuần — chuỗi bắt đầu bằng = + - @
 *  không bao giờ thành công thức chạy được trong file xuất ra.
 * ===================================================================== */

export interface SheetAoa {
  ten: string;
  dong: ReadonlyArray<ReadonlyArray<unknown>>;
}

/** Tên sheet Excel cấm / \ ? * [ ] : và tối đa 31 ký tự. Không làm sạch
 *  thì "tháng 8/2026" làm hỏng cả file — người dùng chỉ thấy "file lỗi". */
export function lamSachTenSheet(ten: string): string {
  return ten.replace(/[/\\?*[\]:]/g, "-").slice(0, 31);
}

/** Dựng workbook từ các sheet dạng mảng-dòng. Dòng đầu là header (in đậm). */
export async function dungWorkbookAoa(sheets: readonly SheetAoa[]): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(lamSachTenSheet(sheet.ten));
    for (const dong of sheet.dong) {
      ws.addRow(dong.map((o) => (o === null || o === undefined ? "" : o)));
    }
    ws.getRow(1).font = { bold: true };
  }
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/** Dựng rồi tải xuống ngay — dùng ở trình duyệt. */
export async function xuatExcelAoa(sheets: readonly SheetAoa[], tenFile: string): Promise<void> {
  const buf = await dungWorkbookAoa(sheets);
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = tenFile;
  a.click();
  URL.revokeObjectURL(a.href);
}

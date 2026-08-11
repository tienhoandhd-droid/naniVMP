import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PERMISSION_HEADERS = [
  "STT",
  "Bộ phận",
  "Mã nhân viên",
  "Họ và tên",
  "Phân loại",
  "Phạm vi bộ phận",
  "Phạm vi xưởng",
  "Phạm vi khu vực",
  "Phạm vi line",
  "Email nhận tài khoản",
  "Xác nhận gửi email",
];

export const ACCESS_CLASS_LABELS = [
  "Chỉ xem",
  "QA – Cập nhật 4 mốc hoàn thành",
  "Quản lý QA",
  "Bộ phận quản lý thiết bị – Xếp lịch thẩm định",
  "Quản lý bộ phận quản lý thiết bị",
];

const DEPARTMENT_LABELS = ["QA", "XSX", "CĐ", "Kho", "QC", "RD"];

export async function createPermissionWorkbook(outputPath) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VMP Monitor";
  workbook.subject = "Danh bạ nhân sự và quyền theo từng hạng mục VMP";
  workbook.created = new Date("2026-08-10T00:00:00Z");

  const sheet = workbook.addWorksheet("Trang tính1", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 22 },
  });
  sheet.addRow(PERMISSION_HEADERS);
  sheet.columns = [
    { key: "stt", width: 8 },
    { key: "department", width: 18 },
    { key: "employeeCode", width: 18 },
    { key: "fullName", width: 30 },
    { key: "accessClass", width: 52 },
    { key: "scopeDepartments", width: 24 },
    { key: "scopeFactories", width: 24 },
    { key: "scopeAreas", width: 24 },
    { key: "scopeLines", width: 24 },
    { key: "email", width: 32 },
    { key: "emailSent", width: 24 },
  ];

  const header = sheet.getRow(1);
  header.height = 34;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6B315F" } };
  header.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: "FFE3CADB" } },
      left: { style: "thin", color: { argb: "FFE3CADB" } },
      bottom: { style: "thin", color: { argb: "FFE3CADB" } },
      right: { style: "thin", color: { argb: "FFE3CADB" } },
    };
  });
  sheet.autoFilter = { from: "A1", to: "K501" };

  const classFormula = `"${ACCESS_CLASS_LABELS.join(",")}"`;
  const departmentFormula = `"${DEPARTMENT_LABELS.join(",")}"`;
  for (let row = 2; row <= 501; row += 1) {
    sheet.getCell(`A${row}`).value = row - 1;
    sheet.getCell(`B${row}`).dataValidation = {
      type: "list", allowBlank: false, formulae: [departmentFormula],
      showErrorMessage: true, errorTitle: "Bộ phận không hợp lệ",
      error: "Chọn một bộ phận trong danh sách.",
    };
    sheet.getCell(`E${row}`).dataValidation = {
      type: "list", allowBlank: false, formulae: [classFormula],
      showErrorMessage: true, errorTitle: "Phân loại không hợp lệ",
      error: "Chọn một trong năm phân loại quyền chuẩn.",
    };
    sheet.getCell(`K${row}`).dataValidation = {
      type: "list", allowBlank: true, formulae: ['"Có,Không"'],
    };
    const fill = row % 2 === 0 ? "FFFFF9FC" : "FFFFFFFF";
    sheet.getRow(row).eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: "FFE8DCE4" } } };
    });
  }

  const guide = workbook.addWorksheet("Hướng dẫn", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  guide.getColumn(1).width = 110;
  const guideRows = [
    "HƯỚNG DẪN NHẬP DANH BẠ NHÂN SỰ & QUYỀN VMP",
    "Mỗi người một dòng. Không đổi tên, thứ tự hoặc thêm bớt 11 cột ở Trang tính1.",
    "Mã nhân viên hiện không bắt buộc; có thể để trống và bổ sung sau. Hệ thống tạm khớp bằng Họ và tên có dấu, không phân biệt hoa thường và khoảng trắng.",
    "Nhân sự QA để trống bốn cột phạm vi; quyền QA phát sinh từ phân công từng hạng mục.",
    "Các phân loại ngoài QA vẫn phải nhập đủ bộ phận, xưởng, khu vực và line.",
    "Với phân loại ngoài QA, bốn cột phạm vi nhập mã danh mục chuẩn, nhiều giá trị cách nhau bằng dấu chấm phẩy. Mỗi xưởng phải thuộc một bộ phận đã chọn, mỗi khu vực thuộc một xưởng đã chọn và mỗi line thuộc một khu vực đã chọn.",
    "Email chỉ dùng nhận diện ứng viên; Admin phải nối tài khoản trên web trước khi quyền có hiệu lực.",
    "Xác nhận gửi email: chọn Có sau khi đã gửi thông tin tài khoản; không có chức năng tự động gửi email trong file này.",
    "Năm phân loại quyền:",
    ...ACCESS_CLASS_LABELS.map((label, index) => `${index + 1}. ${label}`),
    "QA chỉ cập nhật bốn mốc hoàn thành: đề cương, thẩm định thực tế, báo cáo và VMP (ngày + trạng thái).",
    "Bộ phận quản lý thiết bị chỉ cập nhật cột xếp lịch thẩm định có đủ ngày giờ; bộ phận này không mặc định là Xưởng.",
    "File này không có macro. Dữ liệu được kiểm tra và xem trước trên web trước khi Admin nhập; chế độ quyền thật vẫn chưa bật.",
  ];
  guideRows.forEach((text) => guide.addRow([text]));
  guide.getRow(1).font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  guide.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6B315F" } };
  guide.eachRow((row, index) => {
    row.height = index === 1 ? 34 : 30;
    row.getCell(1).alignment = { vertical: "middle", wrapText: true };
    if (index >= 8 && index <= 13) row.getCell(1).font = { bold: true };
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await workbook.xlsx.writeFile(outputPath);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const output = path.resolve(process.argv[2] || "public/templates/phan-quyen-vmp.xlsx");
  await createPermissionWorkbook(output);
  console.log(`Đã tạo ${output}`);
}

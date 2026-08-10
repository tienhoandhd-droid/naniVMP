import { DEPTS } from "../../constants/vmp.ts";
import type { AccessClass, PermissionPersonPatch } from "./types.ts";

export const PERMISSION_HEADERS = [
  "STT", "Bộ phận", "Mã nhân viên", "Họ và tên", "Phân loại",
  "Phạm vi", "Khu vực phân quyền", "Email nhận tài khoản", "Xác nhận gửi email",
] as const;

const ACCESS_CLASS_BY_LABEL: Record<string, AccessClass> = {
  "chỉ xem": "view_only",
  view_only: "view_only",
  "qa – cập nhật 4 mốc hoàn thành": "qa_progress_editor",
  "qa - cập nhật 4 mốc hoàn thành": "qa_progress_editor",
  qa_progress_editor: "qa_progress_editor",
  "quản lý qa": "qa_manager",
  qa_manager: "qa_manager",
  "bộ phận quản lý thiết bị – xếp lịch thẩm định": "equipment_scheduler",
  "bộ phận quản lý thiết bị - xếp lịch thẩm định": "equipment_scheduler",
  equipment_scheduler: "equipment_scheduler",
  "quản lý bộ phận quản lý thiết bị": "equipment_manager",
  equipment_manager: "equipment_manager",
};

const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const key = (value: unknown) => normalize(value).toLocaleLowerCase("vi");
const split = (value: unknown) => [...new Set(normalize(value).split(";").map((item) => item.trim()).filter(Boolean))];

const DEPARTMENT_BY_LABEL = new Map<string, string>();
for (const department of DEPTS) {
  for (const label of [department.id, department.short, department.name]) {
    DEPARTMENT_BY_LABEL.set(key(label), department.id);
  }
}

export interface PermissionWorkbookError {
  rowNumber: number;
  message: string;
}

export interface ParsedPermissionRow extends PermissionPersonPatch {
  row_number: number;
}

export interface PermissionWorkbookResult {
  rows: ParsedPermissionRow[];
  errors: PermissionWorkbookError[];
}

export function parsePermissionRows(
  matrix: unknown[][],
  options: { validAreas?: readonly string[] } = {},
): PermissionWorkbookResult {
  const errors: PermissionWorkbookError[] = [];
  const rows: ParsedPermissionRow[] = [];
  const headers = (matrix[0] || []).map(normalize);
  if (headers.length !== PERMISSION_HEADERS.length
      || PERMISSION_HEADERS.some((header, index) => headers[index] !== header)) {
    return { rows: [], errors: [{ rowNumber: 1, message: "File phải giữ đúng chín tiêu đề và đúng thứ tự của mẫu chuẩn" }] };
  }

  const validAreas = new Set((options.validAreas || []).map(key));
  for (let index = 1; index < matrix.length; index += 1) {
    const source = matrix[index] || [];
    // File mẫu điền sẵn STT cho 500 dòng; STT một mình vẫn là dòng trống.
    if (source.slice(1, PERMISSION_HEADERS.length).every((value) => normalize(value) === "")) continue;
    const rowNumber = index + 1;
    const department = DEPARTMENT_BY_LABEL.get(key(source[1]));
    const accessClass = ACCESS_CLASS_BY_LABEL[key(source[4])];
    const scope = split(source[5]).map((item) => item === "*" ? "*" : DEPARTMENT_BY_LABEL.get(key(item)) || "");
    const areas = split(source[6]);
    const rowErrors: string[] = [];

    if (!department) rowErrors.push(`Bộ phận không hợp lệ: ${normalize(source[1]) || "(trống)"}`);
    if (!normalize(source[3])) rowErrors.push("Họ và tên không được để trống");
    if (!accessClass) rowErrors.push(`Phân loại không hợp lệ: ${normalize(source[4]) || "(trống)"}`);
    if (!scope.length || scope.some((item) => !item)) rowErrors.push("Phạm vi không hợp lệ; dùng mã bộ phận và dấu chấm phẩy");
    if (!areas.length) rowErrors.push("Khu vực phân quyền không được để trống");
    const unknownAreas = areas.filter((area) => area !== "*" && validAreas.size > 0 && !validAreas.has(key(area)));
    if (unknownAreas.length) rowErrors.push(`Khu vực không hợp lệ: ${unknownAreas.join(", ")}`);
    const email = normalize(source[7]).toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) rowErrors.push(`Email không hợp lệ: ${email}`);
    const confirmation = key(source[8]);
    if (confirmation && !["có", "co", "không", "khong"].includes(confirmation)) {
      rowErrors.push("Xác nhận gửi email chỉ nhận Có hoặc Không");
    }

    if (rowErrors.length) {
      errors.push(...rowErrors.map((message) => ({ rowNumber, message })));
      continue;
    }
    rows.push({
      row_number: rowNumber,
      employee_code: normalize(source[2]) || null,
      full_name: normalize(source[3]),
      department: department!,
      access_class: accessClass!,
      scope_departments: scope,
      access_areas: areas,
      email: email || null,
      email_sent_confirmed: ["có", "co"].includes(confirmation),
      is_active: true,
    });
  }
  return { rows, errors };
}

export async function parsePermissionWorkbook(
  file: File,
  options: { validAreas?: readonly string[] } = {},
): Promise<PermissionWorkbookResult> {
  // Không dùng SheetJS/xlsx cho file người dùng tải lên: phiên bản npm hiện
  // có advisory prototype-pollution/ReDoS. ExcelJS cũng là thư viện dùng để
  // sinh chính file mẫu, nên đường đọc/ghi cùng một hợp đồng workbook.
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const firstSheet = workbook.getWorksheet("Trang tính1") || workbook.worksheets[0];
  if (!firstSheet) return { rows: [], errors: [{ rowNumber: 1, message: "File không có trang dữ liệu" }] };
  const matrix: unknown[][] = [];
  firstSheet.eachRow({ includeEmpty: true }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    matrix.push(values.map((value) => {
      if (value && typeof value === "object" && "text" in value) return value.text;
      if (value && typeof value === "object" && "result" in value) return value.result;
      return value ?? "";
    }));
  });
  return parsePermissionRows(matrix, options);
}

import { DEPTS } from "../../constants/vmp.ts";
import { resolveScopeCodes, type ScopeCatalog, type ScopeResolution } from "./scopeHierarchy.ts";
import { isQaAccessClass, type AccessClass, type PermissionPersonPatch } from "./types.ts";

export const PERMISSION_HEADERS = [
  "STT", "Bộ phận", "Mã nhân viên", "Họ và tên", "Phân loại",
  "Phạm vi bộ phận", "Phạm vi xưởng", "Phạm vi khu vực", "Phạm vi line",
  "Email nhận tài khoản", "Xác nhận gửi email",
] as const;

const MAX_PERMISSION_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PERMISSION_WORKBOOK_ROWS = 1000;
const MAX_PERMISSION_WORKBOOK_CELLS = 20_000;

const ACCESS_CLASS_BY_LABEL: Record<string, AccessClass> = {
  "chỉ xem": "view_only",
  view_only: "view_only",
  "qa – cập nhật 4 mốc hoàn thành": "qa_progress_editor",
  "qa - cập nhật 4 mốc hoàn thành": "qa_progress_editor",
  qa_progress_editor: "qa_progress_editor",
  "quản lý qa": "qa_manager",
  qa_manager: "qa_manager",
  "nhân viên xưởng – ghi ngày thẩm định thực tế": "workshop_staff",
  "nhân viên xưởng - ghi ngày thẩm định thực tế": "workshop_staff",
  workshop_staff: "workshop_staff",
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

export interface PermissionWorkbookOptions {
  scopeCatalog: ScopeCatalog;
}

export function parsePermissionRows(
  matrix: unknown[][],
  options: PermissionWorkbookOptions,
): PermissionWorkbookResult {
  const errors: PermissionWorkbookError[] = [];
  const rows: ParsedPermissionRow[] = [];
  const headers = (matrix[0] || []).map(normalize);
  if (headers.length !== PERMISSION_HEADERS.length
      || PERMISSION_HEADERS.some((header, index) => headers[index] !== header)) {
    return { rows: [], errors: [{ rowNumber: 1, message: "File phải giữ đúng 11 tiêu đề và đúng thứ tự của mẫu chuẩn" }] };
  }

  for (let index = 1; index < matrix.length; index += 1) {
    const source = matrix[index] || [];
    // File mẫu điền sẵn STT cho 500 dòng; STT một mình vẫn là dòng trống.
    if (source.slice(1, PERMISSION_HEADERS.length).every((value) => normalize(value) === "")) continue;
    const rowNumber = index + 1;
    const department = DEPARTMENT_BY_LABEL.get(key(source[1]));
    const accessClass = ACCESS_CLASS_BY_LABEL[key(source[4])];
    const scopeCodes = {
      departments: split(source[5]),
      factories: split(source[6]),
      areas: split(source[7]),
      lines: split(source[8]),
    };
    const rowErrors: string[] = [];

    if (!department) rowErrors.push(`Bộ phận không hợp lệ: ${normalize(source[1]) || "(trống)"}`);
    if (!normalize(source[3])) rowErrors.push("Họ và tên không được để trống");
    if (!accessClass) rowErrors.push(`Phân loại không hợp lệ: ${normalize(source[4]) || "(trống)"}`);
    const qaWithoutHierarchy = accessClass ? isQaAccessClass(accessClass) : false;
    if (qaWithoutHierarchy && department && department !== "qa") {
      rowErrors.push("Phân loại QA chỉ được dùng cho bộ phận QA");
    }
    let resolved: ScopeResolution = {
      ok: true,
      selection: { departments: [], factories: [], areas: [], lines: [] },
    };
    if (!qaWithoutHierarchy) {
      for (const [scopeKey, label] of [
        ["departments", "bộ phận"], ["factories", "xưởng"],
        ["areas", "khu vực"], ["lines", "line"],
      ] as const) {
        if (!scopeCodes[scopeKey].length) rowErrors.push(`Phạm vi ${label} không được để trống`);
      }
      resolved = resolveScopeCodes(options.scopeCatalog, scopeCodes);
      if (!resolved.ok) rowErrors.push(resolved.error);
    }
    const email = normalize(source[9]).toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) rowErrors.push(`Email không hợp lệ: ${email}`);
    const confirmation = key(source[10]);
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
      scope_departments: resolved.ok ? resolved.selection.departments : [],
      scope_factory_ids: resolved.ok ? resolved.selection.factories : [],
      scope_area_ids: resolved.ok ? resolved.selection.areas : [],
      scope_line_ids: resolved.ok ? resolved.selection.lines : [],
      email: email || null,
      email_sent_confirmed: ["có", "co"].includes(confirmation),
      is_active: true,
    });
  }
  return { rows, errors };
}

export async function parsePermissionWorkbook(
  file: File,
  options: PermissionWorkbookOptions,
): Promise<PermissionWorkbookResult> {
  if (file.size > MAX_PERMISSION_FILE_BYTES) {
    return { rows: [], errors: [{ rowNumber: 1, message: "File Excel không được lớn hơn 5 MiB" }] };
  }
  // Không dùng SheetJS/xlsx cho file người dùng tải lên: phiên bản npm hiện
  // có advisory prototype-pollution/ReDoS. ExcelJS cũng là thư viện dùng để
  // sinh chính file mẫu, nên đường đọc/ghi cùng một hợp đồng workbook.
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const workbookRows = workbook.worksheets.reduce((total, sheet) => total + sheet.rowCount, 0);
  if (workbookRows > MAX_PERMISSION_WORKBOOK_ROWS) {
    return { rows: [], errors: [{ rowNumber: 1, message: "Workbook chỉ được có tối đa 1.000 dòng" }] };
  }
  let workbookCells = 0;
  for (const sheet of workbook.worksheets) {
    sheet.eachRow({ includeEmpty: true }, (row) => { workbookCells += row.cellCount; });
  }
  if (workbookCells > MAX_PERMISSION_WORKBOOK_CELLS) {
    return { rows: [], errors: [{ rowNumber: 1, message: "Workbook chỉ được có tối đa 20.000 ô" }] };
  }
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

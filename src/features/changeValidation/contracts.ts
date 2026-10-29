/* Hợp đồng dữ liệu của tab "Thay đổi" (thẩm định do thay đổi).
 * RPC trả jsonb; ở đây đọc lại từng trường để giao diện không nhận dữ liệu lạ. */

type UnknownRecord = Record<string, unknown>;

export type ChangeHandlingStatus = "cho_xu_ly" | "dang_tham_dinh" | "da_xong" | "khong_ap_dung";

export const HANDLING_STATUS_LABEL: Record<ChangeHandlingStatus, string> = {
  cho_xu_ly: "Chờ xử lý",
  dang_tham_dinh: "Đang thẩm định",
  da_xong: "Đã xong",
  khong_ap_dung: "Không áp dụng",
};
const HANDLING_STATUSES = Object.keys(HANDLING_STATUS_LABEL) as ChangeHandlingStatus[];

export interface ChangeObject {
  code: string;
  name: string | null;
  department: string | null;
  area: string | null;
  line: string | null;
}

export interface ChangePlanItem {
  id: string;
  validationCode: string;
  objectCode: string;
  validationType: string;
  year: number | null;
  computedStatus: string | null;
  deadlineValidation: string | null;
  linked: boolean;
}

/** Nguồn của phiếu: sheet Tổng hợp thay đổi hay sổ quản lý sai lệch. */
export type ChangeRecordKind = "thay_doi" | "sai_lech";

export interface ChangeRecord {
  id: string;
  recordKind: ChangeRecordKind;
  sourceTab: string;
  changeCode: string;
  sourceRow: number | null;
  openedText: string | null;
  department: string | null;
  changeClass: string | null;
  changeType: string | null;
  changeContent: string | null;
  sheetStatus: string | null;
  ownerText: string | null;
  folderLink: string | null;
  needsValidation: boolean;
  validationContent: string | null;
  deadlineRaw: string | null;
  deadlineSheet: string | null;
  deadlineOverride: string | null;
  deadline: string | null;
  removedFromSheetAt: string | null;
  handlingStatus: ChangeHandlingStatus;
  note: string | null;
  version: number;
  updatedAt: string | null;
  objects: ChangeObject[];
  planItems: ChangePlanItem[];
}

export type ChangeSyncStatus = "cho" | "dang_chay" | "xong" | "loi";

export interface ChangeSyncInfo {
  lastOkAt: string | null;
  lastStatus: ChangeSyncStatus | null;
  lastTrigger: string | null;
  lastRequestedAt: string | null;
  lastFinishedAt: string | null;
  lastError: string | null;
}

export interface ChangeListResult {
  canEdit: boolean;
  /** Tạo đợt mới theo luật có sẵn: chỉ Admin/Quản lý QA. */
  canCreatePlan: boolean;
  records: ChangeRecord[];
  sync: ChangeSyncInfo;
}

export type ChangeWriteResult =
  | { ok: true; version: number; validationCode?: string }
  | { ok: false; errorCode: string; error: string; codes?: string[] };

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} phải là object`);
  return value as UnknownRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} phải là chuỗi`);
  return value;
}

function optText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function optDate(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} phải là ngày`);
  return value;
}

function optInt(value: unknown): number | null {
  return Number.isSafeInteger(value) ? value as number : null;
}

export function decodeObject(value: unknown): ChangeObject {
  const raw = record(value, "thiết bị");
  return {
    code: text(raw.code, "mã thiết bị"), name: optText(raw.name), department: optText(raw.department),
    area: optText(raw.area), line: optText(raw.line),
  };
}

function decodePlanItem(value: unknown): ChangePlanItem {
  const raw = record(value, "đợt thẩm định");
  return {
    id: text(raw.id, "mã đợt"),
    validationCode: text(raw.validation_code, "mã thẩm định"),
    objectCode: text(raw.object_code, "mã thiết bị của đợt"),
    validationType: text(raw.validation_type, "loại thẩm định"),
    year: optInt(raw.year),
    computedStatus: optText(raw.computed_status),
    deadlineValidation: optDate(raw.deadline_validation, "hạn thẩm định"),
    linked: raw.linked === true,
  };
}

export function decodeChangeRecord(value: unknown): ChangeRecord {
  const raw = record(value, "phiếu thay đổi");
  const status = raw.handling_status;
  if (typeof status !== "string" || !HANDLING_STATUSES.includes(status as ChangeHandlingStatus)) {
    throw new Error("trạng thái xử lý không hợp lệ");
  }
  if (!Number.isSafeInteger(raw.version) || (raw.version as number) < 1) throw new Error("phiên bản không hợp lệ");
  if (!Array.isArray(raw.objects) || !Array.isArray(raw.plan_items)) throw new Error("thiếu danh sách liên kết");
  return {
    id: text(raw.id, "id"),
    recordKind: raw.record_kind === "sai_lech" ? "sai_lech" : "thay_doi",
    sourceTab: text(raw.source_tab, "tab nguồn"),
    changeCode: text(raw.change_code, "mã thay đổi"),
    sourceRow: optInt(raw.source_row),
    openedText: optText(raw.opened_text),
    department: optText(raw.department),
    changeClass: optText(raw.change_class),
    changeType: optText(raw.change_type),
    changeContent: optText(raw.change_content),
    sheetStatus: optText(raw.sheet_status),
    ownerText: optText(raw.owner_text),
    folderLink: optText(raw.folder_link),
    needsValidation: raw.needs_validation === true,
    validationContent: optText(raw.validation_content),
    deadlineRaw: optText(raw.deadline_raw),
    deadlineSheet: optDate(raw.deadline_sheet, "hạn trên sheet"),
    deadlineOverride: optDate(raw.deadline_override, "hạn trên web"),
    deadline: optDate(raw.deadline, "hạn"),
    removedFromSheetAt: optText(raw.removed_from_sheet_at),
    handlingStatus: status as ChangeHandlingStatus,
    note: optText(raw.note),
    version: raw.version as number,
    updatedAt: optText(raw.updated_at),
    objects: raw.objects.map(decodeObject),
    planItems: raw.plan_items.map(decodePlanItem),
  };
}

const SYNC_STATUSES = new Set<ChangeSyncStatus>(["cho", "dang_chay", "xong", "loi"]);

/** Máy chủ từ chối (tài khoản tắt, chưa có vai...): thông báo đọc được cho người dùng. */
export class ChangeRefusedError extends Error {}

export function decodeChangeList(value: unknown): ChangeListResult {
  const raw = record(value, "kết quả danh sách");
  if (raw.ok !== true) {
    throw new ChangeRefusedError(optText(raw.error) ?? "Không tải được danh sách thay đổi.");
  }
  if (!Array.isArray(raw.records)) throw new Error("thiếu danh sách phiếu");
  const sync = record(raw.sync, "trạng thái đồng bộ");
  const lastStatus = typeof sync.last_status === "string" && SYNC_STATUSES.has(sync.last_status as ChangeSyncStatus)
    ? sync.last_status as ChangeSyncStatus : null;
  return {
    canEdit: raw.can_edit === true,
    canCreatePlan: raw.can_create_plan === true,
    records: raw.records.map(decodeChangeRecord),
    sync: {
      lastOkAt: optText(sync.last_ok_at),
      lastStatus,
      lastTrigger: optText(sync.last_trigger),
      lastRequestedAt: optText(sync.last_requested_at),
      lastFinishedAt: optText(sync.last_finished_at),
      lastError: optText(sync.last_error),
    },
  };
}

export function decodeChangeWrite(value: unknown): ChangeWriteResult {
  const raw = record(value, "kết quả lưu");
  if (raw.ok === true) {
    if (!Number.isSafeInteger(raw.version)) throw new Error("kết quả lưu thiếu phiên bản");
    return {
      ok: true,
      version: raw.version as number,
      validationCode: optText(raw.validation_code) ?? undefined,
    };
  }
  const codes = Array.isArray(raw.codes) ? raw.codes.filter((c): c is string => typeof c === "string") : undefined;
  return {
    ok: false,
    errorCode: optText(raw.error_code) ?? "UNKNOWN",
    error: optText(raw.error) ?? "Không lưu được.",
    codes,
  };
}

/** Hạn đã qua so với hôm nay (ngày theo giờ VN, dạng yyyy-mm-dd). */
export function isOverdue(row: Pick<ChangeRecord, "deadline" | "handlingStatus" | "removedFromSheetAt">, today: string): boolean {
  if (!row.deadline || row.removedFromSheetAt) return false;
  if (row.handlingStatus === "da_xong" || row.handlingStatus === "khong_ap_dung") return false;
  return row.deadline < today;
}

export type ChangeFilter = "open" | "unlinked" | "overdue" | "all";

export function filterChanges(rows: readonly ChangeRecord[], filter: ChangeFilter, query: string, today: string): ChangeRecord[] {
  const q = query.trim().toLocaleLowerCase("vi");
  return rows.filter((row) => {
    if (filter === "open" && (row.removedFromSheetAt
      || row.handlingStatus === "da_xong" || row.handlingStatus === "khong_ap_dung")) return false;
    if (filter === "unlinked" && (row.objects.length > 0 || row.removedFromSheetAt)) return false;
    if (filter === "overdue" && !isOverdue(row, today)) return false;
    if (!q) return true;
    return [row.changeCode, row.changeContent, row.validationContent, ...row.objects.map((o) => o.code)]
      .some((v) => (v ?? "").toLocaleLowerCase("vi").includes(q));
  });
}

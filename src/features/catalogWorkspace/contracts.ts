/* =====================================================================
 *  contracts.ts — kiểu dùng chung của workspace Danh mục
 *  ---------------------------------------------------------------------
 *  Một nơi duy nhất định nghĩa hình dạng dữ liệu danh mục. Ba màn con
 *  (đối tượng nguồn, sản phẩm GMP, người nhận cảnh báo) khác nhau ở danh
 *  sách trường chứ không khác ở cách vận hành, nên chúng dùng chung bộ
 *  kiểu này thay vì mỗi màn tự khai một kiểu gần giống.
 * ===================================================================== */

/** Ba dataset của màn Danh mục. Tên khớp tham số `p_dataset` của RPC. */
export type CatalogDatasetId = "objects" | "products" | "alerts";

/** Một bản ghi danh mục, phẳng theo tên cột của bảng. */
export type CatalogRecord = Record<string, unknown>;

/** Kiểu dữ liệu của một trường — quyết định cách chuẩn hoá và cách dựng ô nhập. */
export type CatalogFieldKind = "text" | "number" | "boolean" | "date" | "select" | "combobox";

export interface CatalogFieldDefinition {
  key: string;
  label: string;
  kind: CatalogFieldKind;
  /** Không ghi được: khoá nghiệp vụ, cột hệ thống, cột suy diễn. */
  readonly?: boolean;
  /** Bắt buộc khi tạo mới. */
  required?: boolean;
  /** Lựa chọn cho `kind: "select"`. */
  options?: Array<{ value: string; label: string }>;
  /** Câu ngắn giải thích, hiện dưới ô nhập. */
  hint?: string;
  /** Sửa trường này thì phải nêu lý do — server cũng kiểm, đây chỉ là để
   *  giao diện hỏi trước thay vì để người dùng bấm Lưu rồi mới bị chặn. */
  reasonRequired?: boolean;
}

/** Một dòng trong danh sách, đã chuẩn hoá khỏi hình dạng thô của từng bảng. */
export interface CatalogListRow {
  dataset: CatalogDatasetId;
  recordId: string;
  /** Khoá người dùng nhìn thấy: mã đối tượng, mã BFO, email. */
  businessKey: string;
  version: number;
  updatedAt: string;
  data: CatalogRecord;
}

export interface CatalogListFilters {
  departments: string[];
  areas: string[];
  values: Record<string, string | string[]>;
}

export interface CatalogListResult {
  ok: boolean;
  total: number;
  rows: CatalogListRow[];
  errorCode?: string;
  error?: string;
}

export interface CatalogSaveResult {
  ok: boolean;
  version?: number;
  recordId?: string;
  errorCode?: string;
  error?: string;
  /** Server trả về khi khoá lạc quan chặn — dùng để mời tải lại. */
  currentVersion?: number;
}

/** Một dòng khác biệt giữa bản trước và bản sau, để dựng bảng đối chiếu. */
export interface CatalogDiffEntry {
  key: string;
  label: string;
  before: unknown;
  after: unknown;
  changed: boolean;
}

/** Thay đổi đang chờ áp vào timeline. */
export interface CatalogChangeRow {
  id: string;
  object_kind: string;
  object_code: string;
  status: string;
  source_version: number | null;
  timeline_revision: number | null;
  created_at: string;
  created_by_name: string;
  has_impact: boolean;
  apply_reason: string | null;
  last_error: string | null;
}

/* ---------------------------------------------------------------------
 *  Nhập Excel theo lô (Đợt B Task 8+10; RPC staging thật thuộc Task 9)
 * ------------------------------------------------------------------- */

/** Một dòng gửi lên staging — đúng hình dạng ParsedCatalogRow đã chuẩn hoá. */
export interface CatalogImportRowPayload {
  rowNumber: number;
  businessKey: string;
  objectKind: string | null;
  values: CatalogRecord;
}

export type CatalogImportBatchStatus =
  | "uploaded" | "validated" | "committed" | "failed" | "expired";

export interface CatalogImportBatch {
  id: string;
  status: CatalogImportBatchStatus;
  total: number;
}

export interface CatalogImportCommitResult {
  ok: boolean;
  created?: number;
  updated?: number;
  unchanged?: number;
  pendingChangeIds?: string[];
  errorCode?: string;
  error?: string;
}

/** Một dòng lịch sử — TÓM TẮT, không kèm JSON đầy đủ. */
export interface CatalogAuditRow {
  id: string;
  created_at: string;
  actor: string;
  effective_business_role: string;
  action: string;
  table_name: string | null;
  record_id: string | null;
  changed_fields: string[] | null;
  reason: string | null;
  source: string | null;
  has_detail: boolean;
}

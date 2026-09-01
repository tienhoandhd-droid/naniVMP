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

export interface CatalogSourceFacetOption {
  value: string;
  count: number;
}

export interface CatalogSourceOwnerFacet extends CatalogSourceFacetOption {
  personId: string;
  name: string;
}

export interface CatalogSourceFacetsSuccess {
  ok: true;
  departments: CatalogSourceFacetOption[];
  areas: CatalogSourceFacetOption[];
  owners: CatalogSourceOwnerFacet[];
  validation: Array<CatalogSourceFacetOption & { value: "outside" | "validated" }>;
  firstMonth: Array<CatalogSourceFacetOption & { value: "missing" | "present" }>;
  ownership: Array<CatalogSourceFacetOption & { value: "assigned" | "unassigned" }>;
  frequency: Array<CatalogSourceFacetOption & { value: "gt12" | "lte12" }>;
}

export interface CatalogSourceFacetsFailure {
  ok: false;
  errorCode: "ACCOUNT_DISABLED" | "ROLE_UNRESOLVED" | "INVALID_FILTERS";
  error: string;
}

export type CatalogSourceFacetsResult = CatalogSourceFacetsSuccess | CatalogSourceFacetsFailure;

type UnknownRecord = Record<string, unknown>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function contractRecord(value: unknown, label: string): UnknownRecord {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error(`${label} must be an object`);
  return value as UnknownRecord;
}

function contractExactKeys(value: UnknownRecord, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const approved = [...expected].sort();
  if (actual.length !== approved.length || actual.some((key, index) => key !== approved[index])) {
    throw new Error(`${label} must contain the exact approved keys`);
  }
}

function contractString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a nonblank string`);
  return value.trim();
}

function contractCount(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} count must be a non-negative integer`);
  return value as number;
}

function facetArray(value: unknown, label: string): CatalogSourceFacetOption[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => {
    const row = contractRecord(entry, `${label}[${index}]`);
    contractExactKeys(row, ["value", "count"], `${label}[${index}]`);
    return {
      value: contractString(row.value, `${label}[${index}].value`),
      count: contractCount(row.count, `${label}[${index}].count`),
    };
  });
}

function fixedFacetArray<const T extends string>(
  value: unknown,
  label: string,
  expected: readonly T[],
): Array<CatalogSourceFacetOption & { value: T }> {
  const rows = facetArray(value, label);
  const allowed = new Set<string>(expected);
  if (rows.length !== expected.length || rows.some((row) => !allowed.has(row.value))
      || new Set(rows.map((row) => row.value)).size !== expected.length) {
    throw new Error(`${label} must contain exactly ${expected.join(", ")}`);
  }
  return rows as Array<CatalogSourceFacetOption & { value: T }>;
}

/** Strict runtime boundary for the rights-filtered Source facet RPC. */
export function decodeCatalogSourceFacetsResponse(value: unknown): CatalogSourceFacetsResult {
  const raw = contractRecord(value, "Source facets response");
  if (raw.ok === false) {
    contractExactKeys(raw, ["ok", "error_code", "error"], "Source facets error response");
    const errorCode = contractString(raw.error_code, "Source facets error_code");
    if (errorCode !== "ACCOUNT_DISABLED" && errorCode !== "ROLE_UNRESOLVED" && errorCode !== "INVALID_FILTERS") {
      throw new Error("Source facets error_code is invalid");
    }
    return { ok: false, errorCode, error: contractString(raw.error, "Source facets error") };
  }
  if (raw.ok !== true) throw new Error("Source facets response.ok must be boolean");
  contractExactKeys(raw, [
    "ok", "departments", "areas", "owners", "validation", "first_month", "ownership", "frequency",
  ], "Source facets response");
  if (!Array.isArray(raw.owners)) throw new Error("Source facets owners must be an array");
  const owners = raw.owners.map((entry, index): CatalogSourceOwnerFacet => {
    const row = contractRecord(entry, `Source facets owners[${index}]`);
    contractExactKeys(row, ["value", "person_id", "name", "count"], `Source facets owners[${index}]`);
    const personId = contractString(row.person_id, `Source facets owners[${index}].person_id`);
    if (!UUID_PATTERN.test(personId)) throw new Error(`Source facets owners[${index}].person_id must be UUID`);
    const ownerValue = contractString(row.value, `Source facets owners[${index}].value`);
    if (!ownerValue.startsWith("owner:") || !ownerValue.slice("owner:".length)) {
      throw new Error(`Source facets owners[${index}].value is invalid`);
    }
    return {
      value: ownerValue,
      personId,
      name: contractString(row.name, `Source facets owners[${index}].name`),
      count: contractCount(row.count, `Source facets owners[${index}].count`),
    };
  });
  return {
    ok: true,
    departments: facetArray(raw.departments, "Source facets departments"),
    areas: facetArray(raw.areas, "Source facets areas"),
    owners,
    validation: fixedFacetArray(raw.validation, "Source facets validation", ["outside", "validated"]),
    firstMonth: fixedFacetArray(raw.first_month, "Source facets first_month", ["missing", "present"]),
    ownership: fixedFacetArray(raw.ownership, "Source facets ownership", ["assigned", "unassigned"]),
    frequency: fixedFacetArray(raw.frequency, "Source facets frequency", ["gt12", "lte12"]),
  };
}

export interface CatalogSourcePage<T> {
  ok: true;
  rows: T[];
  authorizedTotal: number;
  nextCursor: { objectCode: string; id: string } | null;
}

/** Consume the audited export endpoint page-by-page without accepting cursor
 * loops, total drift, partial success, or a terminal short export. */
export async function collectCatalogSourceExportPages<T>(
  fetchPage: (cursor: { objectCode: string; id: string } | null) => Promise<CatalogSourcePage<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: { objectCode: string; id: string } | null = null;
  let expectedTotal: number | null = null;
  for (let page = 0; page < 10_000; page += 1) {
    const result = await fetchPage(cursor);
    if (!Number.isSafeInteger(result.authorizedTotal) || result.authorizedTotal < 0) {
      throw new Error("Source export total is invalid");
    }
    if (expectedTotal === null) expectedTotal = result.authorizedTotal;
    else if (result.authorizedTotal !== expectedTotal) throw new Error("Source export total changed between pages");
    rows.push(...result.rows);
    if (rows.length > expectedTotal) throw new Error("Source export returned more rows than total");
    if (!result.nextCursor) {
      if (rows.length !== expectedTotal) throw new Error("Source export terminal page does not match total");
      return rows;
    }
    const cursorKey = `${result.nextCursor.objectCode}\u0000${result.nextCursor.id}`;
    if (seenCursors.has(cursorKey)) throw new Error("Source export cursor repeated");
    seenCursors.add(cursorKey);
    cursor = result.nextCursor;
  }
  throw new Error("Source export exceeded the safe page limit");
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
  committedAt?: string;
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

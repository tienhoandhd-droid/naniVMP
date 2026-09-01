export const CATALOG_IMPORT_PREVIEW_FIELDS = [
  "object_code", "object_name", "department", "area_code", "line",
  "validate_flag", "frequency_months", "first_month", "year_ref",
  "report_class", "work_group", "workdays", "complexity_score",
  "quality_impact_score", "note", "is_active",
] as const;

export type CatalogImportClassification = "create" | "update" | "unchanged" | "error";
export type CatalogImportPreviewBatchStatus =
  | "uploaded" | "validated" | "committed" | "failed" | "expired";
export type CatalogImportPreviewErrorCode =
  | "INVALID_ARGUMENT" | "SESSION_INACTIVE" | "BATCH_NOT_FOUND"
  | "FORBIDDEN" | "BATCH_EXPIRED" | "NOT_AVAILABLE" | "RPC_ERROR";

export interface CatalogImportPreviewCounts {
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
}

export interface CatalogImportPreviewBatch {
  id: string;
  dataset: "source_objects";
  status: CatalogImportPreviewBatchStatus;
  total: number;
  counts: CatalogImportPreviewCounts;
  createdAt: string;
  committedAt: string | null;
}

export interface CatalogImportPreviewRowError {
  code: string;
  message: string;
  field: string | null;
}

export type CatalogImportPreviewRecord = Record<string, string | number | boolean | null>;

export interface CatalogImportPreviewRow {
  rowNumber: number;
  businessKey: string;
  objectKind: string | null;
  classification: CatalogImportClassification;
  currentSnapshot: CatalogImportPreviewRecord | null;
  patch: CatalogImportPreviewRecord;
  errors: CatalogImportPreviewRowError[];
  rowReason: string | null;
}

export interface CatalogImportPreviewPage {
  batch: CatalogImportPreviewBatch;
  rows: CatalogImportPreviewRow[];
  nextCursor: number | null;
}

export type CatalogImportPreviewResult =
  | { ok: true; page: CatalogImportPreviewPage }
  | { ok: false; errorCode: CatalogImportPreviewErrorCode; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELD_SET = new Set<string>(CATALOG_IMPORT_PREVIEW_FIELDS);
const CLASSIFICATIONS = new Set<CatalogImportClassification>(["create", "update", "unchanged", "error"]);
const STATUSES = new Set<CatalogImportPreviewBatchStatus>(["uploaded", "validated", "committed", "failed", "expired"]);
const SERVER_ERROR_CODES = new Set<CatalogImportPreviewErrorCode>([
  "INVALID_ARGUMENT", "SESSION_INACTIVE", "BATCH_NOT_FOUND", "FORBIDDEN", "BATCH_EXPIRED",
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain exact keys: ${wanted.join(", ")}`);
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

function nullableText(value: unknown, label: string): string | null {
  return value === null ? null : text(value, label);
}

function count(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}`);
  }
  return Number(value);
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label);
  if (!result.includes("T") || Number.isNaN(Date.parse(result))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return result;
}

function catalogRecord(value: unknown, label: string): CatalogImportPreviewRecord {
  const source = record(value, label);
  const result: CatalogImportPreviewRecord = {};
  for (const [key, item] of Object.entries(source)) {
    if (!FIELD_SET.has(key)) throw new Error(`${label} contains an invalid catalog field: ${key}`);
    if (item !== null && typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") {
      throw new Error(`${label}.${key} must be a scalar value`);
    }
    result[key] = item as CatalogImportPreviewRecord[string];
  }
  return result;
}

function decodeCounts(value: unknown): CatalogImportPreviewCounts {
  const source = record(value, "preview batch counts");
  exactKeys(source, ["created", "updated", "unchanged", "errors"], "preview batch counts");
  return {
    created: count(source.created, "counts.created"),
    updated: count(source.updated, "counts.updated"),
    unchanged: count(source.unchanged, "counts.unchanged"),
    errors: count(source.errors, "counts.errors"),
  };
}

function decodeBatch(value: unknown): CatalogImportPreviewBatch {
  const source = record(value, "preview batch");
  exactKeys(source, ["id", "dataset", "status", "total", "counts", "created_at", "committed_at"], "preview batch");
  const id = text(source.id, "batch.id");
  if (!UUID.test(id)) throw new Error("batch.id must be UUID");
  if (source.dataset !== "source_objects") throw new Error("batch.dataset must be source_objects");
  const status = text(source.status, "batch.status") as CatalogImportPreviewBatchStatus;
  if (!STATUSES.has(status)) throw new Error("batch.status is invalid");
  const total = count(source.total, "batch.total");
  const counts = decodeCounts(source.counts);
  if (counts.created + counts.updated + counts.unchanged + counts.errors !== total) {
    throw new Error("preview batch counts total does not match batch.total");
  }
  return {
    id,
    dataset: "source_objects",
    status,
    total,
    counts,
    createdAt: timestamp(source.created_at, "batch.created_at"),
    committedAt: source.committed_at === null ? null : timestamp(source.committed_at, "batch.committed_at"),
  };
}

function decodeRowError(value: unknown, index: number): CatalogImportPreviewRowError {
  const source = record(value, `row.errors[${index}]`);
  exactKeys(source, ["code", "message", "field"], `row.errors[${index}]`);
  return {
    code: text(source.code, `row.errors[${index}].code`),
    message: text(source.message, `row.errors[${index}].message`),
    field: nullableText(source.field, `row.errors[${index}].field`),
  };
}

function decodeRow(value: unknown): CatalogImportPreviewRow {
  const source = record(value, "preview row");
  exactKeys(source, [
    "row_number", "business_key", "object_kind", "classification",
    "current_snapshot", "patch", "errors", "row_reason",
  ], "preview row");
  const classification = text(source.classification, "row.classification") as CatalogImportClassification;
  if (!CLASSIFICATIONS.has(classification)) throw new Error("row.classification is invalid");
  if (!Array.isArray(source.errors)) throw new Error("row.errors must be an array");
  return {
    rowNumber: count(source.row_number, "row.row_number", 1),
    businessKey: text(source.business_key, "row.business_key"),
    objectKind: nullableText(source.object_kind, "row.object_kind"),
    classification,
    currentSnapshot: source.current_snapshot === null
      ? null : catalogRecord(source.current_snapshot, "row.current_snapshot"),
    patch: catalogRecord(source.patch, "row.patch"),
    errors: source.errors.map(decodeRowError),
    rowReason: nullableText(source.row_reason, "row.row_reason"),
  };
}

function decodeError(source: Record<string, unknown>): CatalogImportPreviewResult {
  exactKeys(source, ["ok", "error_code", "error"], "preview error response");
  const errorCode = text(source.error_code, "preview error_code") as CatalogImportPreviewErrorCode;
  if (!SERVER_ERROR_CODES.has(errorCode)) throw new Error("preview error_code is invalid");
  return { ok: false, errorCode, error: text(source.error, "preview error") };
}

export function decodeCatalogImportPreview(value: unknown): CatalogImportPreviewResult {
  const source = record(value, "catalog import preview response");
  if (source.ok === false) return decodeError(source);
  if (source.ok !== true) throw new Error("catalog import preview response.ok must be boolean");
  exactKeys(source, ["ok", "batch", "rows", "next_cursor"], "catalog import preview response");
  if (!Array.isArray(source.rows)) throw new Error("preview rows must be an array");
  const rows = source.rows.map(decodeRow);
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].rowNumber <= rows[index - 1].rowNumber) {
      throw new Error("preview row_number must increase strictly");
    }
  }
  const nextCursor = source.next_cursor === null
    ? null : count(source.next_cursor, "preview next_cursor", 1);
  if (nextCursor !== null && (rows.length === 0 || nextCursor !== rows.at(-1)?.rowNumber)) {
    throw new Error("preview next_cursor must equal the last row_number");
  }
  const batch = decodeBatch(source.batch);
  if (rows.length > batch.total) throw new Error("preview rows exceed batch.total");
  return { ok: true, page: { batch, rows, nextCursor } };
}

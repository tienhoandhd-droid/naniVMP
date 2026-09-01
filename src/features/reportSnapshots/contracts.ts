type UnknownRecord = Record<string, unknown>;

export type ReportExportFormat = "xlsx" | "html" | "pdf";
export type ReportPeriod = "monthly" | "quarterly" | "annual" | "custom";

export interface ReportSnapshotReceipt {
  snapshotId: string;
  contentHash: string;
  periodLabel: string;
  status: "draft" | "approved" | "archived";
  createdAt: string;
}

export interface CreateReportSnapshotInput {
  reportPeriod: ReportPeriod;
  year: number;
  month?: number;
  quarter?: number;
  filters: Record<string, unknown>;
  templateVersion: string;
}

export interface ReportExportPreparation {
  receiptId: string;
  contentHash: string;
  snapshot: UnknownRecord;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const PERIODS = new Set<ReportPeriod>(["monthly", "quarterly", "annual", "custom"]);
const FORMATS = new Set<ReportExportFormat>(["xlsx", "html", "pdf"]);
const FILTER_KEYS = new Set([
  "department", "owner_person_id", "status", "criticality", "object_kind",
  "validation_type", "date_from", "date_to",
]);

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as UnknownRecord;
}

function exactKeys(value: UnknownRecord, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const approved = [...expected].sort();
  if (actual.length !== approved.length || actual.some((key, index) => key !== approved[index])) {
    throw new Error(`${label} must contain exact approved keys`);
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be text`);
  return value;
}

function uuid(value: unknown, label: string): string {
  const result = text(value, label);
  if (!UUID.test(result)) throw new Error(`${label} must be UUID`);
  return result;
}

function hash(value: unknown): string {
  if (typeof value !== "string" || !HASH.test(value)) throw new Error("content hash must be lowercase SHA-256");
  return value;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be ISO timestamp`);
  }
  return value;
}

function boundedInteger(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${label} must be an integer ${min}..${max}`);
  }
  return value as number;
}

function validateFilterValue(value: unknown, key: string): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) return [...value];
  throw new Error(`filter ${key} has an unsupported value`);
}

export function validateCreateReportSnapshotInput(value: CreateReportSnapshotInput): CreateReportSnapshotInput {
  const raw = record(value, "snapshot input");
  const allowedInputKeys = new Set(["reportPeriod", "year", "month", "quarter", "filters", "templateVersion"]);
  if (Object.keys(raw).some((key) => !allowedInputKeys.has(key))) throw new Error("snapshot input has extra keys");
  if (typeof raw.reportPeriod !== "string" || !PERIODS.has(raw.reportPeriod as ReportPeriod)) {
    throw new Error("report period is invalid");
  }
  const reportPeriod = raw.reportPeriod as ReportPeriod;
  const year = boundedInteger(raw.year, "year", 2000, 2200);
  const filtersRaw = record(raw.filters, "filters");
  const filters: Record<string, unknown> = {};
  for (const key of Object.keys(filtersRaw).sort()) {
    if (!FILTER_KEYS.has(key)) throw new Error(`filter ${key} is not allowed`);
    filters[key] = validateFilterValue(filtersRaw[key], key);
  }
  const templateVersion = text(raw.templateVersion, "template version").trim();
  if (templateVersion.length > 64) throw new Error("template version is too long");

  if (reportPeriod === "monthly") {
    if (raw.quarter !== undefined) throw new Error("monthly report does not accept quarter");
    return { reportPeriod, year, month: boundedInteger(raw.month, "month", 1, 12), filters, templateVersion };
  }
  if (reportPeriod === "quarterly") {
    if (raw.month !== undefined) throw new Error("quarterly report does not accept month");
    return { reportPeriod, year, quarter: boundedInteger(raw.quarter, "quarter", 1, 4), filters, templateVersion };
  }
  if (raw.month !== undefined || raw.quarter !== undefined) throw new Error(`${reportPeriod} report does not accept month or quarter`);
  return { reportPeriod, year, filters, templateVersion };
}

export function decodeReportSnapshotReceipt(value: unknown): ReportSnapshotReceipt {
  const raw = record(value, "snapshot receipt");
  exactKeys(raw, ["snapshot_id", "content_hash", "period_label", "status", "created_at"], "snapshot receipt");
  if (raw.status !== "draft" && raw.status !== "approved" && raw.status !== "archived") {
    throw new Error("snapshot status is invalid");
  }
  return {
    snapshotId: uuid(raw.snapshot_id, "snapshot id"),
    contentHash: hash(raw.content_hash),
    periodLabel: text(raw.period_label, "period label"),
    status: raw.status,
    createdAt: timestamp(raw.created_at, "created_at"),
  };
}

export function decodeReportExportPreparation(value: unknown, format: ReportExportFormat): ReportExportPreparation {
  if (!FORMATS.has(format)) throw new Error("export format is invalid");
  const raw = record(value, "export preparation");
  exactKeys(raw, ["receipt_id", "content_hash", "snapshot"], "export preparation");
  return {
    receiptId: uuid(raw.receipt_id, "receipt id"),
    contentHash: hash(raw.content_hash),
    snapshot: record(raw.snapshot, "snapshot payload"),
  };
}

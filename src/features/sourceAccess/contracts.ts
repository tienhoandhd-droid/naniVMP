/**
 * Runtime contracts for Source access RPCs. Generated Supabase types are not
 * yet refreshed while this feature is being built, so every browser payload is
 * decoded here before it is allowed into UI state.
 */
export type SourceQaCandidateErrorCode =
  | "ACCOUNT_DISABLED"
  | "ROLE_UNRESOLVED"
  | "FORBIDDEN"
  | "INVALID_LIMIT"
  | "INVALID_CURSOR"
  | "CURSOR_EXPIRED"
  | "NETWORK"
  | "NOT_CONFIGURED"
  | "MALFORMED_RESPONSE";

export interface SourceQaCandidateDisplay {
  personId: string;
  fullName: string | null;
  normalizedFullName: string | null;
  email: string | null;
  department: string | null;
}

/** Eligible directory rows always have a complete identity. */
export interface SourceQaCandidate extends SourceQaCandidateDisplay {
  fullName: string;
  normalizedFullName: string;
  roleName: string;
}

export type SourceQaCandidateIneligibilityReason =
  | "PERSON_NOT_FOUND"
  | "PERFORMER_INACTIVE"
  | "ACCOUNT_UNLINKED"
  | "ACCOUNT_DISABLED"
  | "ROLE_INELIGIBLE";

/** A current assignment may survive its personnel row so it can be removed safely. */
export interface IncludedSourceQaCandidate extends SourceQaCandidateDisplay {
  eligible: boolean;
  ineligibilityReason: SourceQaCandidateIneligibilityReason | null;
}

export interface SourceQaCandidateCursor {
  normalizedFullName: string;
  personId: string;
}

export interface SourceQaCandidatesSuccess {
  ok: true;
  rows: SourceQaCandidate[];
  includedCurrent: IncludedSourceQaCandidate[];
  authorizedTotal: number;
  nextCursor: SourceQaCandidateCursor | null;
}

export interface SourceQaCandidatesFailure {
  ok: false;
  errorCode: SourceQaCandidateErrorCode | string;
  error: string;
}

export type SourceQaCandidatesResult = SourceQaCandidatesSuccess | SourceQaCandidatesFailure;

export interface SourceObjectListRow {
  id: string;
  objectKind: "Thiết bị" | "Quy trình" | "Kho" | "Hệ thống phụ trợ" | "Vận chuyển";
  objectCode: string;
  sourceTab: string;
  sourceRow: number;
  extra: JsonValue;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  editedOnWeb: boolean;
  criticalitySource: "auto" | "manual";
  version: number;
  timelineRevision: number;
  timelineAppliedRevision: number;
  objectName: string | null;
  department: string | null;
  areaCode: string | null;
  line: string | null;
  status: string | null;
  showFlag: string | null;
  validateFlag: string | null;
  validateReason: string | null;
  reportClass: string | null;
  criticalPoint: string | null;
  note: string | null;
  ownerName: string | null;
  supportName: string | null;
  workGroup: string | null;
  frequencyMonths: number | null;
  workdays: number | null;
  firstMonth: number | null;
  yearRef: number | null;
  complexityScore: number | null;
  qualityImpactScore: number | null;
  criticalityScore: number | null;
  updatedBy: string | null;
  ownerPersonId: string | null;
  supportPersonId: string | null;
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface SourceObjectListSuccess {
  ok: true;
  rows: SourceObjectListRow[];
  authorizedTotal: number;
  nextCursor: { objectCode: string; id: string } | null;
}

export interface SourceObjectListFailure {
  ok: false;
  errorCode: "ACCOUNT_DISABLED" | "ROLE_UNRESOLVED" | "INVALID_LIMIT" | "INVALID_FILTERS" | "INVALID_CURSOR" | "CURSOR_EXPIRED";
  error: string;
}

export type SourceObjectListResult = SourceObjectListSuccess | SourceObjectListFailure;

export interface WorkshopScopeGrantSuccess {
  ok: true;
  grantId: string;
  version: number;
  isActive: boolean;
}

export interface WorkshopScopeGrantFailure {
  ok: false;
  errorCode: "FORBIDDEN" | "REASON_REQUIRED" | "INVALID_ACTIVE_STATE" | "GRANT_NOT_FOUND" | "INVALID_SCOPE" | "SCOPE_NOT_FOUND" | "VERSION_CONFLICT" | "PERSON_NOT_ELIGIBLE" | "DUPLICATE_ACTIVE_SCOPE";
  error: string;
  currentVersion?: number;
}

export type WorkshopScopeGrantResult = WorkshopScopeGrantSuccess | WorkshopScopeGrantFailure;

export interface WorkshopScopeGrant {
  id: string;
  performerId: string;
  department: string;
  departmentKey: string;
  areaCode: string;
  areaKey: string;
  line: string | null;
  lineKey: string | null;
  validFrom: string;
  expiresAt: string | null;
  isActive: boolean;
  version: number;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  changeReason: string;
}

export interface SourceWorkshopCoveragePerson {
  personId: string;
  fullName: string;
  normalizedFullName: string;
  email: string | null;
  department: string | null;
  roleName: "workshop_manager" | "workshop_staff";
  grants: WorkshopScopeGrant[];
}

export interface SourceWorkshopCoverageCursor {
  normalizedFullName: string;
  personId: string;
}

export interface SourceWorkshopCoverageSuccess {
  ok: true;
  rows: SourceWorkshopCoveragePerson[];
  authorizedTotal: number;
  nextCursor: SourceWorkshopCoverageCursor | null;
}

export interface SourceWorkshopCoverageFailure {
  ok: false;
  errorCode: "FORBIDDEN" | "INVALID_LIMIT" | "INVALID_CURSOR" | "NETWORK" | "NOT_CONFIGURED" | "MALFORMED_RESPONSE";
  error: string;
}

export type SourceWorkshopCoverageResult = SourceWorkshopCoverageSuccess | SourceWorkshopCoverageFailure;

export interface SourceWorkshopScopeChoice {
  department: string;
  areaCode: string;
  line: string | null;
}

export interface SourceWorkshopScopeChoicesCursor {
  department: string;
  areaCode: string;
  line: string | null;
}

export interface SourceWorkshopScopeChoicesSuccess {
  ok: true;
  rows: SourceWorkshopScopeChoice[];
  nextCursor: SourceWorkshopScopeChoicesCursor | null;
}

export interface SourceWorkshopScopeChoicesFailure {
  ok: false;
  errorCode: "FORBIDDEN" | "INVALID_LIMIT" | "INVALID_CURSOR" | "NETWORK" | "NOT_CONFIGURED" | "MALFORMED_RESPONSE";
  error: string;
}

export type SourceWorkshopScopeChoicesResult = SourceWorkshopScopeChoicesSuccess | SourceWorkshopScopeChoicesFailure;

export interface WorkshopScopeDraft {
  department: string;
  areaCode: string;
  line: string | null;
  reason: string;
}

export class SourceAccessContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceAccessContractError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INELIGIBLE_REASONS = new Set<SourceQaCandidateIneligibilityReason>([
  "PERSON_NOT_FOUND", "PERFORMER_INACTIVE", "ACCOUNT_UNLINKED", "ACCOUNT_DISABLED", "ROLE_INELIGIBLE",
]);
const SOURCE_OBJECT_KINDS = new Set<SourceObjectListRow["objectKind"]>([
  "Thiết bị", "Quy trình", "Kho", "Hệ thống phụ trợ", "Vận chuyển",
]);
const LIST_ERROR_CODES = new Set<SourceObjectListFailure["errorCode"]>([
  "ACCOUNT_DISABLED", "ROLE_UNRESOLVED", "INVALID_LIMIT", "INVALID_FILTERS", "INVALID_CURSOR", "CURSOR_EXPIRED",
]);
const GRANT_ERROR_CODES = new Set<WorkshopScopeGrantFailure["errorCode"]>([
  "FORBIDDEN", "REASON_REQUIRED", "INVALID_ACTIVE_STATE", "GRANT_NOT_FOUND", "INVALID_SCOPE", "SCOPE_NOT_FOUND",
  "VERSION_CONFLICT", "PERSON_NOT_ELIGIBLE", "DUPLICATE_ACTIVE_SCOPE",
]);
const WORKSHOP_SCOPE_GRANT_KEYS = [
  "id", "performer_id", "department", "department_key", "area_code", "area_key", "line", "line_key",
  "valid_from", "expires_at", "is_active", "version", "created_at", "created_by", "updated_at", "updated_by",
  "change_reason",
] as const;
const SOURCE_LIST_ROW_KEYS = [
  "id", "object_kind", "object_code", "source_tab", "source_row", "extra", "created_at", "updated_at",
  "is_active", "edited_on_web", "criticality_source", "version", "timeline_revision", "timeline_applied_revision",
  "object_name", "department", "area_code", "line", "status", "show_flag", "validate_flag", "validate_reason",
  "report_class", "critical_point", "note", "owner_name", "support_name", "work_group", "frequency_months",
  "workdays", "first_month", "year_ref", "complexity_score", "quality_impact_score", "criticality_score",
  "updated_by", "owner_person_id", "support_person_id",
] as const;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new SourceAccessContractError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new SourceAccessContractError(`${label} must be a string.`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return string(value, label);
}

function uuid(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!UUID.test(parsed)) throw new SourceAccessContractError(`${label} must be a UUID.`);
  return parsed;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new SourceAccessContractError(`${label} must be an array.`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new SourceAccessContractError(`${label} must be an integer.`);
  return value as number;
}

function nullableInteger(value: unknown, label: string): number | null {
  if (value === null) return null;
  return integer(value, label);
}

function nullableUuid(value: unknown, label: string): string | null {
  if (value === null) return null;
  return uuid(value, label);
}

function exactKeys(raw: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(raw).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new SourceAccessContractError(`${label} must contain exactly ${expected.length} approved keys.`);
  }
}

function json(value: unknown, label: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new SourceAccessContractError(`${label} must be JSON.`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => json(entry, `${label}[${index}]`));
  const raw = record(value, label);
  return Object.fromEntries(Object.entries(raw).map(([key, entry]) => [key, json(entry, `${label}.${key}`)]));
}

function candidateIdentity(value: unknown, label: string): SourceQaCandidateDisplay & {
  fullName: string;
  normalizedFullName: string;
} {
  const raw = record(value, label);
  return {
    personId: uuid(raw.person_id, `${label}.person_id`),
    fullName: string(raw.performer_name, `${label}.performer_name`),
    normalizedFullName: string(raw.normalized_full_name, `${label}.normalized_full_name`),
    email: nullableString(raw.email, `${label}.email`),
    department: nullableString(raw.department, `${label}.department`),
  };
}

function candidateDisplay(value: unknown, label: string): SourceQaCandidateDisplay {
  const raw = record(value, label);
  return {
    personId: uuid(raw.person_id, `${label}.person_id`),
    fullName: nullableString(raw.performer_name, `${label}.performer_name`),
    normalizedFullName: nullableString(raw.normalized_full_name, `${label}.normalized_full_name`),
    email: nullableString(raw.email, `${label}.email`),
    department: nullableString(raw.department, `${label}.department`),
  };
}

function candidate(value: unknown, label: string): SourceQaCandidate {
  const raw = record(value, label);
  return { ...candidateIdentity(raw, label), roleName: string(raw.role_name, `${label}.role_name`) };
}

function candidateCursor(value: unknown): SourceQaCandidateCursor | null {
  if (value === null) return null;
  const raw = record(value, "Source QA candidate response.next_cursor");
  return {
    normalizedFullName: string(raw.normalized_full_name, "Source QA candidate response.next_cursor.normalized_full_name"),
    personId: uuid(raw.person_id, "Source QA candidate response.next_cursor.person_id"),
  };
}

/** Decode the exact public candidate RPC. Any malformed success fails closed. */
export function decodeSourceQaCandidatesResponse(value: unknown): SourceQaCandidatesResult {
  const raw = record(value, "Source QA candidate response");
  if (raw.ok === false) {
    return {
      ok: false,
      errorCode: string(raw.error_code, "Source QA candidate response.error_code"),
      error: string(raw.error, "Source QA candidate response.error"),
    };
  }
  if (raw.ok !== true) throw new SourceAccessContractError("Source QA candidate response.ok must be boolean.");
  if (!Number.isSafeInteger(raw.authorized_total) || (raw.authorized_total as number) < 0) {
    throw new SourceAccessContractError("Source QA candidate response.authorized_total must be a non-negative integer.");
  }
  const includedCurrent = array(raw.included_current, "Source QA candidate response.included_current")
    .map((entry, index): IncludedSourceQaCandidate => {
      const included = record(entry, `Source QA candidate response.included_current[${index}]`);
      if (typeof included.eligible !== "boolean") {
        throw new SourceAccessContractError(`Source QA candidate response.included_current[${index}].eligible must be boolean.`);
      }
      const reason = included.ineligibility_reason;
      if (reason !== null && (typeof reason !== "string" || !INELIGIBLE_REASONS.has(reason as SourceQaCandidateIneligibilityReason))) {
        throw new SourceAccessContractError(`Source QA candidate response.included_current[${index}].ineligibility_reason is invalid.`);
      }
      if (included.eligible !== (reason === null)) {
        throw new SourceAccessContractError(`Source QA candidate response.included_current[${index}] has inconsistent eligibility.`);
      }
      return {
        ...candidateDisplay(included, `Source QA candidate response.included_current[${index}]`),
        eligible: included.eligible,
        ineligibilityReason: reason as SourceQaCandidateIneligibilityReason | null,
      };
    });
  return {
    ok: true,
    rows: array(raw.rows, "Source QA candidate response.rows")
      .map((entry, index) => candidate(entry, `Source QA candidate response.rows[${index}]`)),
    includedCurrent,
    authorizedTotal: raw.authorized_total as number,
    nextCursor: candidateCursor(raw.next_cursor),
  };
}

/** Render identity without inventing a name for a deleted personnel record. */
export function sourceQaCandidateLabel(person: SourceQaCandidateDisplay): string {
  if (!person.fullName) return `ID …${person.personId.slice(-8)}`;
  const identity = [person.fullName, person.email ?? "chưa có email", person.department ?? "chưa có bộ phận"];
  identity.push(`ID …${person.personId.slice(-8)}`);
  return identity.join(" · ");
}

function sourceListRow(value: unknown, label: string): SourceObjectListRow {
  const raw = record(value, label);
  exactKeys(raw, SOURCE_LIST_ROW_KEYS, label);
  const objectKind = string(raw.object_kind, `${label}.object_kind`) as SourceObjectListRow["objectKind"];
  if (!SOURCE_OBJECT_KINDS.has(objectKind)) throw new SourceAccessContractError(`${label}.object_kind is invalid.`);
  const criticalitySource = string(raw.criticality_source, `${label}.criticality_source`);
  if (criticalitySource !== "auto" && criticalitySource !== "manual") {
    throw new SourceAccessContractError(`${label}.criticality_source is invalid.`);
  }
  return {
    id: uuid(raw.id, `${label}.id`), objectKind, objectCode: string(raw.object_code, `${label}.object_code`),
    sourceTab: string(raw.source_tab, `${label}.source_tab`), sourceRow: integer(raw.source_row, `${label}.source_row`),
    extra: json(raw.extra, `${label}.extra`), createdAt: string(raw.created_at, `${label}.created_at`),
    updatedAt: string(raw.updated_at, `${label}.updated_at`), isActive: (() => {
      if (typeof raw.is_active !== "boolean") throw new SourceAccessContractError(`${label}.is_active must be boolean.`);
      return raw.is_active;
    })(),
    editedOnWeb: (() => {
      if (typeof raw.edited_on_web !== "boolean") throw new SourceAccessContractError(`${label}.edited_on_web must be boolean.`);
      return raw.edited_on_web;
    })(),
    criticalitySource,
    version: integer(raw.version, `${label}.version`),
    timelineRevision: integer(raw.timeline_revision, `${label}.timeline_revision`),
    timelineAppliedRevision: integer(raw.timeline_applied_revision, `${label}.timeline_applied_revision`),
    objectName: nullableString(raw.object_name, `${label}.object_name`),
    department: nullableString(raw.department, `${label}.department`), areaCode: nullableString(raw.area_code, `${label}.area_code`),
    line: nullableString(raw.line, `${label}.line`), status: nullableString(raw.status, `${label}.status`),
    showFlag: nullableString(raw.show_flag, `${label}.show_flag`), validateFlag: nullableString(raw.validate_flag, `${label}.validate_flag`),
    validateReason: nullableString(raw.validate_reason, `${label}.validate_reason`), reportClass: nullableString(raw.report_class, `${label}.report_class`),
    criticalPoint: nullableString(raw.critical_point, `${label}.critical_point`), note: nullableString(raw.note, `${label}.note`),
    ownerName: nullableString(raw.owner_name, `${label}.owner_name`), supportName: nullableString(raw.support_name, `${label}.support_name`),
    workGroup: nullableString(raw.work_group, `${label}.work_group`), frequencyMonths: nullableInteger(raw.frequency_months, `${label}.frequency_months`),
    workdays: nullableInteger(raw.workdays, `${label}.workdays`), firstMonth: nullableInteger(raw.first_month, `${label}.first_month`),
    yearRef: nullableInteger(raw.year_ref, `${label}.year_ref`), complexityScore: nullableInteger(raw.complexity_score, `${label}.complexity_score`),
    qualityImpactScore: nullableInteger(raw.quality_impact_score, `${label}.quality_impact_score`), criticalityScore: nullableInteger(raw.criticality_score, `${label}.criticality_score`),
    updatedBy: nullableUuid(raw.updated_by, `${label}.updated_by`), ownerPersonId: nullableUuid(raw.owner_person_id, `${label}.owner_person_id`),
    supportPersonId: nullableUuid(raw.support_person_id, `${label}.support_person_id`),
  };
}

/** Exact, fail-closed boundary for Task 6's paged Source reader. */
export function decodeSourceObjectListResponse(value: unknown): SourceObjectListResult {
  const raw = record(value, "Source list response");
  if (raw.ok === false) {
    exactKeys(raw, ["ok", "error_code", "error"], "Source list error response");
    const errorCode = string(raw.error_code, "Source list response.error_code") as SourceObjectListFailure["errorCode"];
    if (!LIST_ERROR_CODES.has(errorCode)) throw new SourceAccessContractError("Source list response.error_code is invalid.");
    return { ok: false, errorCode, error: string(raw.error, "Source list response.error") };
  }
  if (raw.ok !== true) throw new SourceAccessContractError("Source list response.ok must be boolean.");
  exactKeys(raw, ["ok", "rows", "authorized_total", "next_cursor"], "Source list response");
  const authorizedTotal = integer(raw.authorized_total, "Source list response.authorized_total");
  if (authorizedTotal < 0) throw new SourceAccessContractError("Source list response.authorized_total must be non-negative.");
  const nextCursor = raw.next_cursor === null ? null : (() => {
    const cursor = record(raw.next_cursor, "Source list response.next_cursor");
    exactKeys(cursor, ["object_code", "id"], "Source list response.next_cursor");
    return { objectCode: string(cursor.object_code, "Source list response.next_cursor.object_code"), id: uuid(cursor.id, "Source list response.next_cursor.id") };
  })();
  return { ok: true, rows: array(raw.rows, "Source list response.rows").map((row, index) => sourceListRow(row, `Source list response.rows[${index}]`)), authorizedTotal, nextCursor };
}

/** Exact, fail-closed boundary for Task 6's coverage writer. */
export function decodeWorkshopScopeGrantResponse(value: unknown): WorkshopScopeGrantResult {
  const raw = record(value, "Workshop scope grant response");
  if (raw.ok === false) {
    const errorCode = string(raw.error_code, "Workshop scope grant response.error_code") as WorkshopScopeGrantFailure["errorCode"];
    if (!GRANT_ERROR_CODES.has(errorCode)) throw new SourceAccessContractError("Workshop scope grant response.error_code is invalid.");
    const keys = errorCode === "VERSION_CONFLICT" && raw.current_version !== undefined
      ? ["ok", "error_code", "error", "current_version"]
      : ["ok", "error_code", "error"];
    exactKeys(raw, keys, "Workshop scope grant error response");
    const currentVersion = raw.current_version === undefined ? undefined : integer(raw.current_version, "Workshop scope grant response.current_version");
    return { ok: false, errorCode, error: string(raw.error, "Workshop scope grant response.error"), ...(currentVersion === undefined ? {} : { currentVersion }) };
  }
  if (raw.ok !== true) throw new SourceAccessContractError("Workshop scope grant response.ok must be boolean.");
  exactKeys(raw, ["ok", "grant_id", "version", "is_active"], "Workshop scope grant response");
  const version = integer(raw.version, "Workshop scope grant response.version");
  if (version < 1) throw new SourceAccessContractError("Workshop scope grant response.version must be positive.");
  if (typeof raw.is_active !== "boolean") throw new SourceAccessContractError("Workshop scope grant response.is_active must be boolean.");
  return { ok: true, grantId: uuid(raw.grant_id, "Workshop scope grant response.grant_id"), version, isActive: raw.is_active };
}

function timestamp(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (Number.isNaN(Date.parse(parsed))) throw new SourceAccessContractError(`${label} must be an ISO timestamp.`);
  return parsed;
}

function workshopScopeGrant(value: unknown, label: string): WorkshopScopeGrant {
  const raw = record(value, label);
  exactKeys(raw, WORKSHOP_SCOPE_GRANT_KEYS, label);
  const line = nullableString(raw.line, `${label}.line`);
  const lineKey = nullableString(raw.line_key, `${label}.line_key`);
  if ((line === null) !== (lineKey === null)) {
    throw new SourceAccessContractError(`${label}.line and line_key must both be null or both be populated.`);
  }
  if ((line !== null && !line.trim()) || (lineKey !== null && !lineKey.trim())) {
    throw new SourceAccessContractError(`${label}.line must be null or nonblank.`);
  }
  const version = integer(raw.version, `${label}.version`);
  if (version < 1) throw new SourceAccessContractError(`${label}.version must be positive.`);
  if (typeof raw.is_active !== "boolean") throw new SourceAccessContractError(`${label}.is_active must be boolean.`);
  return {
    id: uuid(raw.id, `${label}.id`), performerId: uuid(raw.performer_id, `${label}.performer_id`),
    department: string(raw.department, `${label}.department`), departmentKey: string(raw.department_key, `${label}.department_key`),
    areaCode: string(raw.area_code, `${label}.area_code`), areaKey: string(raw.area_key, `${label}.area_key`),
    line, lineKey, validFrom: timestamp(raw.valid_from, `${label}.valid_from`),
    expiresAt: raw.expires_at === null ? null : timestamp(raw.expires_at, `${label}.expires_at`),
    isActive: raw.is_active, version, createdAt: timestamp(raw.created_at, `${label}.created_at`),
    createdBy: nullableUuid(raw.created_by, `${label}.created_by`), updatedAt: timestamp(raw.updated_at, `${label}.updated_at`),
    updatedBy: nullableUuid(raw.updated_by, `${label}.updated_by`), changeReason: string(raw.change_reason, `${label}.change_reason`),
  };
}

function workshopCoverageCursor(value: unknown, label: string): SourceWorkshopCoverageCursor | null {
  if (value === null) return null;
  const raw = record(value, label);
  exactKeys(raw, ["normalized_full_name", "person_id"], label);
  return {
    normalizedFullName: string(raw.normalized_full_name, `${label}.normalized_full_name`),
    personId: uuid(raw.person_id, `${label}.person_id`),
  };
}

/** Decode the exact, manager-only paged workshop coverage directory. */
export function decodeSourceWorkshopCoverageResponse(value: unknown): SourceWorkshopCoverageResult {
  const raw = record(value, "Workshop coverage response");
  if (raw.ok === false) {
    exactKeys(raw, ["ok", "error_code", "error"], "Workshop coverage error response");
    const errorCode = string(raw.error_code, "Workshop coverage response.error_code");
    if (errorCode !== "FORBIDDEN" && errorCode !== "INVALID_LIMIT" && errorCode !== "INVALID_CURSOR") {
      throw new SourceAccessContractError("Workshop coverage response.error_code is invalid.");
    }
    return { ok: false, errorCode, error: string(raw.error, "Workshop coverage response.error") };
  }
  if (raw.ok !== true) throw new SourceAccessContractError("Workshop coverage response.ok must be boolean.");
  exactKeys(raw, ["ok", "rows", "authorized_total", "next_cursor"], "Workshop coverage response");
  const authorizedTotal = integer(raw.authorized_total, "Workshop coverage response.authorized_total");
  if (authorizedTotal < 0) throw new SourceAccessContractError("Workshop coverage response.authorized_total must be non-negative.");
  return {
    ok: true,
    rows: array(raw.rows, "Workshop coverage response.rows").map((entry, index) => {
      const row = record(entry, `Workshop coverage response.rows[${index}]`);
      exactKeys(row, ["person_id", "performer_name", "normalized_full_name", "email", "department", "role_name", "grants"], `Workshop coverage response.rows[${index}]`);
      const roleName = string(row.role_name, `Workshop coverage response.rows[${index}].role_name`);
      if (roleName !== "workshop_manager" && roleName !== "workshop_staff") {
        throw new SourceAccessContractError(`Workshop coverage response.rows[${index}].role_name is invalid.`);
      }
      return {
        personId: uuid(row.person_id, `Workshop coverage response.rows[${index}].person_id`),
        fullName: string(row.performer_name, `Workshop coverage response.rows[${index}].performer_name`),
        normalizedFullName: string(row.normalized_full_name, `Workshop coverage response.rows[${index}].normalized_full_name`),
        email: nullableString(row.email, `Workshop coverage response.rows[${index}].email`),
        department: nullableString(row.department, `Workshop coverage response.rows[${index}].department`),
        roleName,
        grants: array(row.grants, `Workshop coverage response.rows[${index}].grants`).map((grant, grantIndex) => workshopScopeGrant(grant, `Workshop coverage response.rows[${index}].grants[${grantIndex}]`)),
      };
    }),
    authorizedTotal,
    nextCursor: workshopCoverageCursor(raw.next_cursor, "Workshop coverage response.next_cursor"),
  };
}

/** Decode Source's real department/area/optional-line tuples. */
export function decodeSourceWorkshopScopeChoicesResponse(value: unknown): SourceWorkshopScopeChoicesResult {
  const raw = record(value, "Workshop scope choices response");
  if (raw.ok === false) {
    exactKeys(raw, ["ok", "error_code", "error"], "Workshop scope choices error response");
    const errorCode = string(raw.error_code, "Workshop scope choices response.error_code");
    if (errorCode !== "FORBIDDEN" && errorCode !== "INVALID_LIMIT" && errorCode !== "INVALID_CURSOR") {
      throw new SourceAccessContractError("Workshop scope choices response.error_code is invalid.");
    }
    return { ok: false, errorCode, error: string(raw.error, "Workshop scope choices response.error") };
  }
  if (raw.ok !== true) throw new SourceAccessContractError("Workshop scope choices response.ok must be boolean.");
  exactKeys(raw, ["ok", "rows", "next_cursor"], "Workshop scope choices response");
  const decodeChoice = (entry: unknown, label: string): SourceWorkshopScopeChoice => {
    const row = record(entry, label);
    exactKeys(row, ["department", "area_code", "line"], label);
    const department = string(row.department, `${label}.department`).trim();
    const areaCode = string(row.area_code, `${label}.area_code`).trim();
    if (!department || !areaCode) throw new SourceAccessContractError(`${label}.department and area_code must be nonblank.`);
    const line = nullableString(row.line, `${label}.line`);
    if (line !== null && !line.trim()) throw new SourceAccessContractError(`${label}.line must be null or nonblank.`);
    return { department, areaCode, line };
  };
  const cursor = raw.next_cursor === null ? null : (() => {
    const row = decodeChoice(raw.next_cursor, "Workshop scope choices response.next_cursor");
    return row;
  })();
  return {
    ok: true,
    rows: array(raw.rows, "Workshop scope choices response.rows").map((entry, index) => decodeChoice(entry, `Workshop scope choices response.rows[${index}]`)),
    nextCursor: cursor,
  };
}

/** Client-side validation only improves feedback; the RPC repeats every check. */
export function normalizeWorkshopScopeDraft(value: { department: string; areaCode: string; line: string; reason: string }): WorkshopScopeDraft {
  const department = value.department.trim();
  const areaCode = value.areaCode.trim();
  const reason = value.reason.trim();
  if (!department || !areaCode) throw new SourceAccessContractError("Cần chọn bộ phận và khu vực Source.");
  if (!reason) throw new SourceAccessContractError("Cần nhập lý do thay đổi phạm vi xưởng.");
  return { department, areaCode, line: value.line.trim() || null, reason };
}

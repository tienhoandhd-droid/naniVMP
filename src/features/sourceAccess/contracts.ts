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

export interface SourceQaCandidateIdentity {
  personId: string;
  fullName: string;
  normalizedFullName: string;
  email: string | null;
  department: string | null;
}

export interface SourceQaCandidate extends SourceQaCandidateIdentity {
  roleName: string;
}

export type SourceQaCandidateIneligibilityReason =
  | "PERSON_NOT_FOUND"
  | "PERFORMER_INACTIVE"
  | "ACCOUNT_UNLINKED"
  | "ACCOUNT_DISABLED"
  | "ROLE_INELIGIBLE";

export interface IncludedSourceQaCandidate extends SourceQaCandidateIdentity {
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

export interface SourceObjectListSuccess {
  ok: true;
  rows: Record<string, unknown>[];
  nextCursor: Record<string, unknown> | null;
}

export interface WorkshopScopeGrantResult {
  ok: true;
  grant: { id: string } & Record<string, unknown>;
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

function candidateIdentity(value: unknown, label: string): SourceQaCandidateIdentity {
  const raw = record(value, label);
  return {
    personId: uuid(raw.person_id, `${label}.person_id`),
    fullName: string(raw.performer_name, `${label}.performer_name`),
    normalizedFullName: string(raw.normalized_full_name, `${label}.normalized_full_name`),
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
        ...candidateIdentity(included, `Source QA candidate response.included_current[${index}]`),
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

/** Shared strict boundary for Task 6's paged Source reader. */
export function decodeSourceObjectListResponse(value: unknown): SourceObjectListSuccess {
  const raw = record(value, "Source list response");
  if (raw.ok !== true) throw new SourceAccessContractError("Source list response.ok must be true.");
  const rows = array(raw.rows, "Source list response.rows").map((row, index) =>
    record(row, `Source list response.rows[${index}]`));
  if (raw.next_cursor !== null && (!raw.next_cursor || Array.isArray(raw.next_cursor) || typeof raw.next_cursor !== "object")) {
    throw new SourceAccessContractError("Source list response.next_cursor must be an object or null.");
  }
  return { ok: true, rows, nextCursor: raw.next_cursor as Record<string, unknown> | null };
}

/** Shared strict boundary for Task 6's coverage writer. */
export function decodeWorkshopScopeGrantResponse(value: unknown): WorkshopScopeGrantResult {
  const raw = record(value, "Workshop scope grant response");
  if (raw.ok !== true) throw new SourceAccessContractError("Workshop scope grant response.ok must be true.");
  const grant = record(raw.grant, "Workshop scope grant response.grant");
  return { ok: true, grant: { ...grant, id: uuid(grant.id, "Workshop scope grant response.grant.id") } };
}

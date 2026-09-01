type UnknownRecord = Record<string, unknown>;

export type RevalidationProposalStatus = "pending" | "confirmed" | "dismissed" | "obsolete";

export interface RevalidationProposal {
  id: string;
  planItemId: string;
  validationCode: string;
  objectCode: string;
  validationType: string;
  actualCompletedDate: string;
  frequencyMonths: number;
  dueDate: string;
  status: RevalidationProposalStatus;
  version: number;
  createdPlanValidationCode: string | null;
  decisionReason: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RevalidationDecisionInput {
  proposalId: string;
  reason: string;
  expectedVersion: number;
}

export type RevalidationDecisionResult =
  | { ok: true; proposalId: string; version: number; validationCode?: string }
  | { ok: false; errorCode: string; currentVersion?: number; error?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set<RevalidationProposalStatus>(["pending", "confirmed", "dismissed", "obsolete"]);

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

function nullableText(value: unknown, label: string): string | null {
  if (value === null) return null;
  return text(value, label);
}

function uuid(value: unknown, label: string): string {
  const result = text(value, label);
  if (!UUID.test(result)) throw new Error(`${label} must be UUID`);
  return result;
}

function isoDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be ISO date`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${label} must be valid`);
  return value;
}

function timestamp(value: unknown, label: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be ISO timestamp`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${label} must be a positive integer`);
  return value as number;
}

export function decodeRevalidationProposals(value: unknown): RevalidationProposal[] {
  if (!Array.isArray(value)) throw new Error("revalidation proposals must be an array");
  return value.map((entry, index) => {
    const raw = record(entry, `proposals[${index}]`);
    exactKeys(raw, [
      "id", "plan_item_id", "validation_code", "object_code", "validation_type",
      "actual_completed_date", "frequency_months", "due_date", "status", "version",
      "created_plan_validation_code", "decision_reason", "decided_at", "created_at", "updated_at",
    ], `proposals[${index}]`);
    if (typeof raw.status !== "string" || !STATUSES.has(raw.status as RevalidationProposalStatus)) {
      throw new Error(`proposals[${index}].status is invalid`);
    }
    return {
      id: uuid(raw.id, `proposals[${index}].id`),
      planItemId: text(raw.plan_item_id, `proposals[${index}].plan_item_id`),
      validationCode: text(raw.validation_code, `proposals[${index}].validation_code`),
      objectCode: text(raw.object_code, `proposals[${index}].object_code`),
      validationType: text(raw.validation_type, `proposals[${index}].validation_type`),
      actualCompletedDate: isoDate(raw.actual_completed_date, `proposals[${index}].actual_completed_date`),
      frequencyMonths: positiveInteger(raw.frequency_months, `proposals[${index}].frequency_months`),
      dueDate: isoDate(raw.due_date, `proposals[${index}].due_date`),
      status: raw.status as RevalidationProposalStatus,
      version: positiveInteger(raw.version, `proposals[${index}].version`),
      createdPlanValidationCode: nullableText(raw.created_plan_validation_code, `proposals[${index}].created_plan_validation_code`),
      decisionReason: nullableText(raw.decision_reason, `proposals[${index}].decision_reason`),
      decidedAt: timestamp(raw.decided_at, `proposals[${index}].decided_at`, true),
      createdAt: timestamp(raw.created_at, `proposals[${index}].created_at`) as string,
      updatedAt: timestamp(raw.updated_at, `proposals[${index}].updated_at`) as string,
    };
  });
}

export function validateRevalidationDecision(input: RevalidationDecisionInput): RevalidationDecisionInput {
  const proposalId = uuid(input.proposalId, "proposal id");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length < 5) throw new Error("Lý do phải có ít nhất 5 ký tự");
  const expectedVersion = positiveInteger(input.expectedVersion, "expected version");
  return { proposalId, reason, expectedVersion };
}

export function decodeRevalidationDecisionResult(value: unknown): RevalidationDecisionResult {
  const raw = record(value, "decision result");
  if (raw.ok === false) {
    const allowed = raw.error_code === "VERSION_CONFLICT"
      ? ["ok", "error_code", "current_version"]
      : (Object.hasOwn(raw, "error") ? ["ok", "error_code", "error"] : ["ok", "error_code"]);
    exactKeys(raw, allowed, "decision result");
    return {
      ok: false,
      errorCode: text(raw.error_code, "decision error_code"),
      ...(Object.hasOwn(raw, "current_version")
        ? { currentVersion: positiveInteger(raw.current_version, "decision current_version") }
        : {}),
      ...(Object.hasOwn(raw, "error") ? { error: text(raw.error, "decision error") } : {}),
    };
  }
  if (raw.ok !== true) throw new Error("decision ok must be boolean");
  const hasValidationCode = Object.hasOwn(raw, "validation_code");
  exactKeys(raw, hasValidationCode
    ? ["ok", "proposal_id", "validation_code", "version"]
    : ["ok", "proposal_id", "version"], "decision result");
  return {
    ok: true,
    proposalId: uuid(raw.proposal_id, "decision proposal_id"),
    version: positiveInteger(raw.version, "decision version"),
    ...(hasValidationCode ? { validationCode: text(raw.validation_code, "decision validation_code") } : {}),
  };
}

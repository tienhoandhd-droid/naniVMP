import type { Activity, ActivityStatus, VmpObject } from "../../types/domain.ts";
import type { ServerKpi } from "../../lib/supabaseData.ts";

type UnknownRecord = Record<string, unknown>;

export class CanonicalDashboardContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalDashboardContractError";
  }
}

export interface CanonicalActivityStatus {
  status: ActivityStatus;
  canonicalDeadline: string | null;
  daysLeft: number | null;
  statusAsOf: string;
}

export type CanonicalActivity = Activity & {
  canonicalDeadline: string | null;
  daysLeft: number | null;
  statusAsOf: string;
};

export interface CanonicalDashboardPayload {
  contractVersion: 1;
  year: number;
  updatedAt: string;
  authorizationRevision: string;
  objects: VmpObject[];
  activities: CanonicalActivity[];
  kpi: ServerKpi;
}

function fail(message: string): never {
  throw new CanonicalDashboardContractError(message);
}

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail(`${label} must be an object`);
  }
  return value as UnknownRecord;
}

function exactKeys(value: UnknownRecord, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} must contain the exact approved keys`);
  }
}

function isoDate(value: unknown, label: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fail(`${label} must be an ISO date`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return fail(`${label} must be a valid ISO date`);
  }
  return value;
}

function isoTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) {
    return fail(`${label} must be an ISO timestamp`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return fail(`${label} must be a non-negative integer`);
  }
  return value as number;
}

function nullableInteger(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value)) return fail(`${label} must be an integer or null`);
  return value as number;
}

const ACTIVITY_STATUSES = new Set<ActivityStatus>(["plan", "todo", "prog", "done", "over"]);

function activity(value: unknown, index: number): CanonicalActivity {
  const raw = record(value, `activities[${index}]`);
  for (const key of ["st", "canonical_deadline", "days_left", "status_as_of"] as const) {
    if (!Object.hasOwn(raw, key)) fail(`activities[${index}].${key} is required`);
  }
  if (typeof raw.st !== "string" || !ACTIVITY_STATUSES.has(raw.st as ActivityStatus)) {
    fail(`activities[${index}].st is invalid`);
  }
  const {
    canonical_deadline: _canonicalDeadline,
    days_left: _daysLeft,
    status_as_of: _statusAsOf,
    ...uiFields
  } = raw;
  return {
    ...(uiFields as Activity),
    st: raw.st as ActivityStatus,
    canonicalDeadline: isoDate(raw.canonical_deadline, `activities[${index}].canonical_deadline`, true),
    daysLeft: nullableInteger(raw.days_left, `activities[${index}].days_left`),
    statusAsOf: isoDate(raw.status_as_of, `activities[${index}].status_as_of`) as string,
  };
}

function kpiSection(value: unknown, label: string): ServerKpi["validation"] {
  const raw = record(value, label);
  exactKeys(raw, ["done", "over", "todo", "total"], label);
  const result = {
    done: nonNegativeInteger(raw.done, `${label}.done`),
    over: nonNegativeInteger(raw.over, `${label}.over`),
    todo: nonNegativeInteger(raw.todo, `${label}.todo`),
    total: nonNegativeInteger(raw.total, `${label}.total`),
  };
  if (result.total !== result.done + result.over + result.todo) {
    fail(`${label} total must equal done + over + todo`);
  }
  return result;
}

function kpi(value: unknown, updatedAt: string): ServerKpi {
  const raw = record(value, "kpi");
  exactKeys(raw, ["validation", "documentation", "mismatch_count"], "kpi");
  return {
    updated_at: updatedAt,
    validation: kpiSection(raw.validation, "validation"),
    documentation: kpiSection(raw.documentation, "documentation"),
    mismatch_count: nonNegativeInteger(raw.mismatch_count, "kpi.mismatch_count"),
  };
}

export function decodeCanonicalDashboard(value: unknown): CanonicalDashboardPayload {
  const raw = record(value, "canonical dashboard response");
  exactKeys(raw, [
    "contract_version",
    "year",
    "updated_at",
    "authorization_revision",
    "objects",
    "activities",
    "kpi",
  ], "canonical dashboard response");
  if (raw.contract_version !== 1) fail("contract_version must be 1");
  if (!Number.isSafeInteger(raw.year) || (raw.year as number) < 2000 || (raw.year as number) > 2200) {
    fail("year must be an integer between 2000 and 2200");
  }
  if (typeof raw.authorization_revision !== "string" || !/^[1-9]\d*$/.test(raw.authorization_revision)) {
    fail("authorization_revision must be a positive integer string");
  }
  if (!Array.isArray(raw.objects) || !Array.isArray(raw.activities)) {
    fail("objects and activities must be arrays");
  }
  const updatedAt = isoTimestamp(raw.updated_at, "updated_at");
  return {
    contractVersion: 1,
    year: raw.year as number,
    updatedAt,
    authorizationRevision: raw.authorization_revision,
    objects: raw.objects.map((entry, index) => record(entry, `objects[${index}]`) as VmpObject),
    activities: raw.activities.map(activity),
    kpi: kpi(raw.kpi, updatedAt),
  };
}

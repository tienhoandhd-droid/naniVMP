import type { Activity, VmpObject } from "../types/domain.ts";

type UnknownRecord = Record<string, unknown>;

export interface AuthorizedDashboardPayload {
  objects: VmpObject[];
  activities: Activity[];
  source: "supabase";
  updatedAt: string;
  authorizationRevision: number;
  year: number;
}

export interface AuthorizationWatermark {
  year: number;
  planItems: number;
  objects: number;
  updatedAt: string;
  authorizationRevision: number;
}

function record(value: unknown, label: string): UnknownRecord {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${label} must be an object`);
  }
  return value as UnknownRecord;
}

function exactKeys(value: UnknownRecord, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const approved = [...expected].sort();
  if (actual.length !== approved.length || actual.some((key, index) => key !== approved[index])) {
    throw new Error(`${label} must contain the exact approved keys`);
  }
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value as number;
}

function count(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value as number;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a timestamp`);
  }
  return value;
}

export function decodeAuthorizedDashboard(value: unknown): AuthorizedDashboardPayload {
  const raw = record(value, "dashboard response");
  exactKeys(raw, [
    "objects", "activities", "source", "updated_at", "authorization_revision", "year",
  ], "dashboard response");
  if (!Array.isArray(raw.objects) || !Array.isArray(raw.activities)) {
    throw new Error("dashboard objects and activities must be arrays");
  }
  if (raw.source !== "supabase") throw new Error("dashboard source must be supabase");
  return {
    objects: raw.objects as VmpObject[],
    activities: raw.activities as Activity[],
    source: "supabase",
    updatedAt: timestamp(raw.updated_at, "dashboard updated_at"),
    authorizationRevision: positiveInteger(raw.authorization_revision, "dashboard authorization revision"),
    year: positiveInteger(raw.year, "dashboard year"),
  };
}

export function decodeAuthorizationWatermark(value: unknown): AuthorizationWatermark {
  const raw = record(value, "watermark response");
  exactKeys(raw, [
    "year", "plan_items", "objects", "updated_at", "authorization_revision",
  ], "watermark response");
  return {
    year: positiveInteger(raw.year, "watermark year"),
    planItems: count(raw.plan_items, "watermark plan_items"),
    objects: count(raw.objects, "watermark objects"),
    updatedAt: timestamp(raw.updated_at, "watermark updated_at"),
    authorizationRevision: positiveInteger(raw.authorization_revision, "watermark authorization revision"),
  };
}

/** The UI may commit protected rows only when both independently fetched
 * server payloads describe the same authorization snapshot. */
export function matchedAuthorizationRevision(
  dashboard: Pick<AuthorizedDashboardPayload, "year" | "authorizationRevision">,
  watermark: Pick<AuthorizationWatermark, "year" | "authorizationRevision">,
): number {
  if (dashboard.year !== watermark.year) throw new Error("dashboard/watermark year mismatch");
  if (dashboard.authorizationRevision !== watermark.authorizationRevision) {
    throw new Error("dashboard/watermark authorization revision mismatch");
  }
  return dashboard.authorizationRevision;
}

/** Contract v2 serializes bigint revisions as text so JSON cannot lose precision.
 * Existing write guards still use a JavaScript number until their RPC contract migrates. */
export function canonicalAuthorizationRevisionToNumber(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error("canonical authorization revision is invalid");
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision <= 0) {
    throw new Error("canonical authorization revision exceeds the safe client range");
  }
  return revision;
}

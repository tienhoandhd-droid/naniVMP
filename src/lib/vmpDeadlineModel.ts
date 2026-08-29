import type { Activity } from "../types/domain.ts";
import { wlIsDone } from "../utils/helpers.ts";

export type VmpDeadlineKind = "done" | "missing" | "overdue" | "today" | "soon" | "future";

export interface VmpDeadlineState {
  kind: VmpDeadlineKind;
  date: string | null;
  daysRemaining: number | null;
}

type ActivityRecord = Record<string, unknown>;

const DAY_MS = 86_400_000;
const BANGKOK_OFFSET_MS = 7 * 3_600_000;

function recordOf(activity: Activity): ActivityRecord {
  return (activity && typeof activity === "object" ? activity : {}) as ActivityRecord;
}

function rawOf(activity: Activity): ActivityRecord {
  const raw = recordOf(activity)._raw;
  return raw && typeof raw === "object" ? raw as ActivityRecord : {};
}

function firstValue(activity: Activity, keys: readonly string[]): unknown {
  const source = recordOf(activity);
  const raw = rawOf(activity);
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") return raw[key];
  }
  return null;
}

function firstIsoDate(activity: Activity, keys: readonly string[]): string | null {
  const source = recordOf(activity);
  const raw = rawOf(activity);
  for (const values of [source, raw]) {
    for (const key of keys) {
      const date = isoDate(values[key]);
      if (date !== null) return date;
    }
  }
  return null;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? value
    : null;
}

/** The sole source of planned VMP deadlines; report/protocol dates are not fallbacks. */
export function vmpDeadlineDate(activity: Activity): string | null {
  return firstIsoDate(activity, ["dlVmp", "deadline_vmp", "dl_vmp"]);
}

/** VMP completion accepts the canonical status, actual date, and legacy raw flags. */
export function isVmpComplete(activity: Activity): boolean {
  if (activity?.st === "done") return true;
  if (firstIsoDate(activity, ["actVmp", "actual_vmp_date", "ngay_vmp"]) !== null) return true;
  if (firstValue(activity, ["vmp_done"]) === true) return true;
  return wlIsDone(firstValue(activity, ["tt_vmp", "status_vmp"]));
}

function bangkokDay(now: Date): string {
  return new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

function daysBetween(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

export function classifyVmpDeadline(
  activity: Activity,
  now: Date,
  soonDays: number,
): VmpDeadlineState {
  const date = vmpDeadlineDate(activity);
  if (isVmpComplete(activity) || String(activity?.state ?? "active") !== "active") {
    return { kind: "done", date, daysRemaining: null };
  }
  if (date === null) return { kind: "missing", date: null, daysRemaining: null };

  const daysRemaining = daysBetween(date, bangkokDay(now));
  if (daysRemaining < 0) return { kind: "overdue", date, daysRemaining };
  if (daysRemaining === 0) return { kind: "today", date, daysRemaining };
  if (daysRemaining <= soonDays) return { kind: "soon", date, daysRemaining };
  return { kind: "future", date, daysRemaining };
}

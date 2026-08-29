import type { BusinessRole } from "../../lib/businessRoles.ts";

export interface TeamOverviewSummary {
  ok: true;
  year: number;
  total: number;
  completed: number;
  rate: number;
  updated_at: string | null;
}

export type TeamOverviewSummaryResult =
  | { ok: true; data: TeamOverviewSummary }
  | { ok: false; error: string };

const SUMMARY_KEYS = ["completed", "ok", "rate", "total", "updated_at", "year"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
    && Number.isInteger(value) && value >= 0;
}

/** Decode the aggregate at the network boundary; every malformed or expanded
 * payload is rejected so detail fields cannot accidentally become UI state. */
export function decodeTeamOverviewSummary(input: unknown): TeamOverviewSummaryResult {
  if (!isRecord(input)) return { ok: false, error: "Phản hồi tiến độ nhóm không hợp lệ." };
  const keys = Object.keys(input).sort();
  if (keys.length !== SUMMARY_KEYS.length
      || keys.some((key, index) => key !== SUMMARY_KEYS[index])) {
    return { ok: false, error: "Phản hồi tiến độ nhóm không đúng hợp đồng." };
  }
  if (input.ok !== true
      || !Number.isInteger(input.year)
      || !isNonNegativeInteger(input.total)
      || !isNonNegativeInteger(input.completed)
      || input.completed > input.total
      || !isNonNegativeInteger(input.rate)
      || (input.updated_at !== null && typeof input.updated_at !== "string")) {
    return { ok: false, error: "Phản hồi tiến độ nhóm không hợp lệ." };
  }
  const expectedRate = input.total === 0 ? 0 : Math.round(input.completed * 100 / input.total);
  if (input.rate !== expectedRate) {
    return { ok: false, error: "Tỷ lệ tiến độ nhóm không khớp tổng số." };
  }
  return { ok: true, data: input as unknown as TeamOverviewSummary };
}

export function shouldRequestTeamOverviewSummary(
  businessRole: BusinessRole | null,
  canViewOverview: boolean,
): boolean {
  return canViewOverview
    && businessRole !== null
    && businessRole !== "admin"
    && businessRole !== "qa_manager";
}

export function teamOverviewRequestKey({
  identity,
  businessRole,
  canViewOverview,
  year,
}: {
  identity: string;
  businessRole: BusinessRole | null;
  canViewOverview: boolean;
  year: number;
}): string {
  return `${identity}|${businessRole ?? "none"}|${canViewOverview}|${year}`;
}

/** Render-time identity gate matching the app access boundary: changing role,
 * permission, or year invalidates old promise handlers before effects run. */
export class TeamOverviewRequestGate {
  #key = "";
  #generation = 0;

  ensureKey(key: string): boolean {
    if (this.#key === key) return false;
    this.#key = key;
    this.#generation += 1;
    return true;
  }

  begin(key: string): number {
    this.ensureKey(key);
    this.#generation += 1;
    return this.#generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.#generation;
  }

  invalidate(generation: number): void {
    if (this.isCurrent(generation)) this.#generation += 1;
  }
}

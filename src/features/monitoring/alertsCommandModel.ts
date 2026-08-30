import type { Activity } from "../../types/domain.ts";
import { qrmLevel, qrmRpn } from "../../utils/helpers.ts";

export type AlertKind = "over" | "soon" | "requal" | "risk";

export interface AlertRow {
  a: Activity;
  kind: AlertKind;
  dleft: number;
  date: Date | null;
  stage: string;
}

export interface AlertsHotspot {
  department: string;
  count: number;
  share: number;
  overdueCount: number;
  highRiskCount: number;
}

export interface AlertsCommandModel {
  queue: AlertRow[];
  totalUnique: number;
  overdueRate: number;
  highRiskRate: number;
  unassignedCount: number;
  hotspots: AlertsHotspot[];
}

const KIND_URGENCY: Record<AlertKind, number> = {
  over: 0,
  risk: 1,
  soon: 2,
  requal: 3,
};

function identityOf(row: AlertRow): string {
  return String(row.a.id || row.a.code || `${row.kind}:${row.stage}:${row.dleft}`);
}

function percent(part: number, total: number): number {
  return total > 0 ? Math.round(part / total * 100) : 0;
}

export function buildAlertsCommandModel(
  rows: readonly AlertRow[],
  limit = 5,
): AlertsCommandModel {
  const unique = new Map<string, AlertRow>();
  for (const row of rows) {
    const identity = identityOf(row);
    const current = unique.get(identity);
    if (!current || KIND_URGENCY[row.kind] < KIND_URGENCY[current.kind]) {
      unique.set(identity, row);
    }
  }

  const ordered = [...unique.values()].sort((left, right) =>
    qrmRpn(right.a) - qrmRpn(left.a)
    || left.dleft - right.dleft
    || identityOf(left).localeCompare(identityOf(right), "vi"));
  const totalUnique = ordered.length;
  const overdueCount = ordered.filter((row) => row.dleft < 0).length;
  const highRiskCount = ordered.filter((row) => qrmLevel(qrmRpn(row.a)) === "cao").length;
  const unassignedCount = ordered.filter((row) => {
    const owner = String(row.a.owner ?? "").trim();
    return !owner || owner === "—";
  }).length;

  const departments = new Map<string, AlertRow[]>();
  for (const row of ordered) {
    const department = String(row.a.dept ?? "").trim() || "unassigned";
    const group = departments.get(department);
    if (group) group.push(row);
    else departments.set(department, [row]);
  }
  const hotspots = [...departments.entries()]
    .map(([department, departmentRows]) => ({
      department,
      count: departmentRows.length,
      share: percent(departmentRows.length, totalUnique),
      overdueCount: departmentRows.filter((row) => row.dleft < 0).length,
      highRiskCount: departmentRows.filter((row) => qrmLevel(qrmRpn(row.a)) === "cao").length,
    }))
    .sort((left, right) =>
      right.count - left.count
      || right.overdueCount - left.overdueCount
      || left.department.localeCompare(right.department, "vi"));

  return {
    queue: ordered.slice(0, Math.max(0, limit)),
    totalUnique,
    overdueRate: percent(overdueCount, totalUnique),
    highRiskRate: percent(highRiskCount, totalUnique),
    unassignedCount,
    hotspots,
  };
}

import { DEPTS } from "../constants/vmp.ts";
import type { Activity } from "../types/domain.ts";

export interface WorkloadCell {
  month: number;
  departmentId: string;
  departmentIndex: number;
  total: number;
  completed: number;
  overdue: number;
  completionRate: number;
}

function clampRate(rate: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(rate) ? rate : 0));
}

export function buildWorkloadMap(activities: Activity[], year: number): WorkloadCell[] {
  const cells = new Map<string, WorkloadCell>();

  for (const activity of activities) {
    if ((activity.state || "active") !== "active") continue;
    const deadline = String((activity._raw as Record<string, unknown> | undefined)?.dl_vmp || "");
    if (deadline.slice(0, 4) !== String(year)) continue;

    const month = Number(deadline.slice(5, 7));
    if (!(month >= 1 && month <= 12)) continue;

    const departmentIds = (activity.depts && activity.depts.length ? activity.depts : [activity.dept])
      .filter(Boolean) as string[];
    for (const departmentId of departmentIds) {
      const departmentIndex = DEPTS.findIndex((department) => department.id === departmentId);
      if (departmentIndex < 0) continue;

      const key = `${month}|${departmentIndex}`;
      let cell = cells.get(key);
      if (!cell) {
        cell = { month, departmentId, departmentIndex, total: 0, completed: 0, overdue: 0, completionRate: 0 };
        cells.set(key, cell);
      }

      cell.total++;
      if (activity.st === "done") cell.completed++;
      if (activity.alert?.kind === "over" || activity.st === "over") cell.overdue++;
    }
  }

  for (const cell of cells.values()) {
    cell.completionRate = clampRate(cell.completed / cell.total);
  }
  return [...cells.values()];
}

export function workloadCellColor(completionRate: number): string {
  const rate = clampRate(completionRate);
  const red = Math.round(214 + (42 - 214) * rate);
  const green = Math.round(72 + (158 - 72) * rate);
  const blue = Math.round(109 + (130 - 109) * rate);
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

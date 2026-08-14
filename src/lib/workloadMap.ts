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

function srgbToLinear(channel: number): number {
  return channel < 0.04045
    ? channel * 0.0773993808
    : Math.pow(channel * 0.9478672986 + 0.0521327014, 2.4);
}

function linearToSrgb(channel: number): number {
  return channel < 0.0031308
    ? channel * 12.92
    : 1.055 * Math.pow(channel, 0.41666) - 0.055;
}

function interpolateLinearLight(start: number, end: number, rate: number): number {
  const linear = srgbToLinear(start / 255) + (srgbToLinear(end / 255) - srgbToLinear(start / 255)) * rate;
  return Math.round(Math.max(0, Math.min(1, linearToSrgb(linear))) * 255);
}

const RASPBERRY: [number, number, number] = [0xD6, 0x48, 0x6D];
// Brand plum-grey is an intentional semantic midpoint; mixing the endpoints
// directly produces a taupe that falls outside the approved purple palette.
const PLUM_GREY: [number, number, number] = [0x7C, 0x5A, 0x93];
const MINT: [number, number, number] = [0x2A, 0x9E, 0x82];

export function buildWorkloadMap(activities: Activity[], year: number): WorkloadCell[] {
  const cells = new Map<string, WorkloadCell>();

  for (const activity of activities) {
    if ((activity.state || "active") !== "active") continue;
    const deadline = String((activity._raw as Record<string, unknown> | undefined)?.dl_vmp || "");
    const deadlineParts = deadline.match(/^(\d{4})([-/])(0[1-9]|1[0-2])\2(0[1-9]|[12]\d|3[01])$/);
    if (!deadlineParts || Number(deadlineParts[1]) !== year) continue;
    const month = Number(deadlineParts[3]);

    const departmentIds = [...new Set((activity.depts && activity.depts.length ? activity.depts : [activity.dept])
      .filter(Boolean) as string[])];
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
  const [start, end, segmentRate] = rate <= .5
    ? [RASPBERRY, PLUM_GREY, rate * 2]
    : [PLUM_GREY, MINT, (rate - .5) * 2];
  const channels = start.map((channel, index) => interpolateLinearLight(channel, end[index], segmentRate));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

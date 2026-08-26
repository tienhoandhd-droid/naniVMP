import { SOON_DAYS, vmpToday } from "../../constants/vmp.ts";
import { milestones, parseD, wlIsDone } from "../../utils/helpers.ts";
import { issueLevel, laSapDenHan } from "./timelineSummaryModel.ts";
import type { Activity } from "../../types/domain.ts";

export type TimelineFilters = {
  cls: string;
  dept: string;
  status: string;
  q: string;
  type: string;
  owner: string;
  phase: string;
  readiness: string;
};

export const TIMELINE_FILTER_DEFAULTS: TimelineFilters = {
  cls: "all", dept: "all", status: "all", q: "", type: "all", owner: "all", phase: "all", readiness: "all",
};

type Range = { start: Date; end: Date };
const rawOf = (a: Activity) => (a._raw || {}) as Record<string, unknown>;
const text = (value: unknown) => String(value == null ? "" : value).trim();
const norm = (value: unknown) => text(value).toLocaleLowerCase("vi");
const usableOwner = (value: unknown) => {
  const valueText = text(value);
  return valueText && valueText !== "—" ? valueText : "";
};

export function timelineOwnerOf(a: Activity): string {
  const raw = rawOf(a);
  return [a.owner, raw.qa, raw.ns_khac, raw.secondary_owner, raw.owner_name, a.secondary_owner, a.owner_name]
    .map(usableOwner).find(Boolean) || "—";
}

const statusDone = (a: Activity, ...keys: string[]) => keys.some((key) => wlIsDone(rawOf(a)[key]));
export function timelinePhaseOf(a: Activity): string {
  if (a.st === "done" || statusDone(a, "tt_vmp", "status_vmp")) return "done";
  if (!statusDone(a, "tt_de_cuong", "status_protocol")) return "protocol";
  if (!statusDone(a, "tt_tham_dinh", "status_validation")) return "validation";
  if (!statusDone(a, "tt_bao_cao", "status_report")) return "report";
  return "vmp";
}

const deadlineValues = (a: Activity) => {
  const raw = rawOf(a);
  return [
    a.dlProtocol ?? raw.deadline_protocol ?? raw.dl_de_cuong,
    a.dlValidation ?? raw.deadline_validation ?? raw.dl_tham_dinh,
    a.dlReport ?? raw.deadline_report ?? raw.dl_bao_cao,
    a.dlVmp ?? raw.deadline_vmp ?? raw.dl_vmp,
  ].map(text);
};

const active = (a: Activity) => String(a.state ?? rawOf(a).state ?? "active") === "active";
const matchesStatus = (a: Activity, status: string) => status === "all"
  || (status === "soon" ? laSapDenHan(a) : issueLevel(a) === status);

function baseMatches(a: Activity, filters: TimelineFilters): boolean {
  if (!active(a)) return false;
  if (filters.cls !== "all" && norm(a.cls) !== norm(filters.cls)) return false;
  if (filters.dept !== "all" && norm(a.dept) !== norm(filters.dept)) return false;
  if (filters.type !== "all" && norm(a.vtype) !== norm(filters.type)) return false;
  const owner = timelineOwnerOf(a);
  if (filters.owner === "assigned" && owner === "—") return false;
  if (filters.owner === "unassigned" && owner !== "—") return false;
  if (!["all", "assigned", "unassigned"].includes(filters.owner) && norm(owner) !== norm(filters.owner)) return false;
  if (filters.phase !== "all" && timelinePhaseOf(a) !== filters.phase) return false;
  const deadlines = deadlineValues(a);
  if (filters.readiness === "ready" && deadlines.some((value) => !value)) return false;
  if (filters.readiness === "missing" && deadlines.every(Boolean)) return false;
  const needle = norm(filters.q);
  if (needle && ![a.code, a.name, owner, a.id, a.vtype, a.dep, a.crit]
    .some((value) => norm(value).includes(needle))) return false;
  return true;
}

function windowFor(a: Activity) {
  const m = a.m || milestones(a);
  return { start: m.protocol, end: m.target };
}
function intersects(a: Activity, range: Range): boolean {
  const { start, end } = windowFor(a);
  return Boolean(start && end && end >= range.start && start <= range.end);
}

function nextPendingDue(a: Activity): Date | null {
  const raw = rawOf(a);
  const m = a.m || milestones(a);
  const stages: Array<{ keys: string[]; due: Date | null | undefined }> = [
    { keys: ["tt_de_cuong", "status_protocol"], due: m.protocol },
    { keys: ["tt_tham_dinh", "status_validation"], due: m.validation },
    { keys: ["tt_vmp", "status_vmp"], due: m.target },
  ];
  for (const stage of stages) {
    if (!stage.keys.some((key) => wlIsDone(raw[key]))) return stage.due || parseD(a.target);
  }
  return null;
}
function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  return Math.round((date.getTime() - vmpToday().getTime()) / 86_400_000);
}
function priority(a: Activity): number {
  if (issueLevel(a) === "done") return 3;
  const left = daysUntil(nextPendingDue(a));
  if (issueLevel(a) === "over" || (left != null && left < 0)) return 0;
  if (left != null && left <= SOON_DAYS) return 1;
  return 2;
}
export function compareTimelineOrder(a: Activity, b: Activity): number {
  const order = priority(a) - priority(b);
  if (order) return order;
  const at = (nextPendingDue(a) || parseD(a.target) || new Date(2999, 0, 1)).getTime();
  const bt = (nextPendingDue(b) || parseD(b.target) || new Date(2999, 0, 1)).getTime();
  return at - bt || String(a.code || a.id).localeCompare(String(b.code || b.id), "vi");
}

export function buildTimelineFilterSets({ activities, filters, range }: {
  activities: readonly Activity[];
  filters: TimelineFilters;
  range: Range;
}) {
  const summaryBase = activities.filter((a) => baseMatches(a, filters));
  const explorer = summaryBase.filter((a) => matchesStatus(a, filters.status));
  const display = explorer.filter((a) => Boolean(a.target) && intersects(a, range)).slice().sort(compareTimelineOrder);
  return { summaryBase, explorer, display };
}

const CHIP_LABELS: Record<string, (value: string) => string> = {
  cls: (value) => `Nhóm: ${value}`,
  dept: (value) => `Bộ phận: ${value}`,
  status: (value) => `Tình trạng: ${value}`,
  q: (value) => `Tìm: ${value}`,
  type: (value) => `Loại: ${value}`,
  owner: (value) => `Người phụ trách: ${value}`,
  phase: (value) => `Pha: ${value}`,
  readiness: (value) => `Sẵn sàng: ${value}`,
};
export function timelineFilterChips(filters: TimelineFilters) {
  return (Object.keys(filters) as Array<keyof TimelineFilters>)
    .filter((key) => key === "q" ? Boolean(filters[key].trim()) : filters[key] !== "all")
    .map((key) => ({ key, label: CHIP_LABELS[key](filters[key]) }));
}
export const timelineActiveFilterCount = (filters: TimelineFilters) => timelineFilterChips(filters).length;

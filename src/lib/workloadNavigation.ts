import type { ScreenId } from "./access.ts";
import type { WorkloadCell } from "./workloadMap.ts";

type WorkloadNavigationSetters = {
  setDeptSel: (departmentIds: string[]) => void;
  setPeriodFilter: (period: "custom") => void;
  setCustomFrom: (date: string) => void;
  setCustomTo: (date: string) => void;
  setView: (view: ScreenId) => void;
};

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Applies the already-authorized workload navigation. Permission resolution
 * deliberately stays at the App boundary; a null target is a complete no-op. */
export function applyWorkloadCellNavigation({
  cell, year, target, setDeptSel, setPeriodFilter, setCustomFrom, setCustomTo, setView,
}: { cell: WorkloadCell; year: number; target: ScreenId | null } & WorkloadNavigationSetters): boolean {
  if (!target) return false;
  const first = new Date(year, cell.month - 1, 1);
  const last = new Date(year, cell.month, 0);
  setDeptSel([cell.departmentId]);
  setPeriodFilter("custom");
  setCustomFrom(localDate(first));
  setCustomTo(localDate(last));
  setView(target);
  return true;
}

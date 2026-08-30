const DETAILED_PROGRESS_FIXES = new Set([
  "done_no_date",
  "no_deadline",
  "no_owner",
  "mismatch",
]);

export interface ProgressAdvancedFilterState {
  fix: string;
  status: string;
  stage: string;
  period: string;
  showStopped: boolean;
}

export function isDetailedProgressFix(fix: string): boolean {
  return DETAILED_PROGRESS_FIXES.has(fix);
}

export function countProgressAdvancedFilters({
  fix,
  status,
  stage,
  period,
  showStopped,
}: ProgressAdvancedFilterState): number {
  return Number(isDetailedProgressFix(fix))
    + Number(status !== "all")
    + Number(stage !== "all")
    + Number(period !== "all")
    + Number(showStopped);
}

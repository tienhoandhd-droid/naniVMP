import type { Activity } from "../../types/domain.ts";
import { isTodayActivityMine } from "./todayModel.ts";

export interface TodayScopeOptions {
  areas: readonly string[];
  departments: readonly string[];
  onlyMine: boolean;
  currentPersonId: string | null;
}

/** Applies the shell's global scope without adding a time predicate. */
export function filterTodayScope(
  activities: readonly Activity[],
  options: TodayScopeOptions,
): Activity[] {
  return activities.filter((activity) => {
    const matchesArea = options.areas.length === 0
      || options.areas.includes(String(activity.area || "").trim());
    const matchesDepartment = options.departments.length === 0
      || (activity.depts || [activity.dept]).some((department) =>
        department != null && options.departments.includes(department));
    const matchesPerson = !options.onlyMine
      || (options.currentPersonId !== null && isTodayActivityMine(activity, options.currentPersonId));
    return matchesArea && matchesDepartment && matchesPerson;
  });
}

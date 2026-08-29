import { SOON_DAYS, vmpToday } from "../../constants/vmp.ts";
import {
  classifyVmpDeadline,
  isVmpComplete,
  vmpDeadlineDate,
} from "../../lib/vmpDeadlineModel.ts";
import type { Activity } from "../../types/domain.ts";

export interface VmpMonthBand {
  month: number;
  label: string;
  count: number;
  done: number;
  overdue: number;
  rate: number;
}

const MONTH_LABELS = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

/** Groups activities by their canonical VMP deadline, never a fallback target date. */
export function buildVmpMonthBands(items: readonly Activity[], year: number): VmpMonthBand[] {
  const bands = MONTH_LABELS.map((label, month) => ({
    month, label, count: 0, done: 0, overdue: 0, rate: 0,
  }));
  const now = vmpToday();

  for (const activity of items) {
    const deadline = vmpDeadlineDate(activity);
    if (deadline === null || Number(deadline.slice(0, 4)) !== year) continue;

    const month = Number(deadline.slice(5, 7)) - 1;
    const band = bands[month];
    if (!band) continue;

    band.count += 1;
    if (isVmpComplete(activity)) band.done += 1;
    if (classifyVmpDeadline(activity, now, SOON_DAYS).kind === "overdue") band.overdue += 1;
  }

  return bands.map((band) => ({
    ...band,
    rate: band.count ? Math.round((band.done / band.count) * 100) : 0,
  }));
}

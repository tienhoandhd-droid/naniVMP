import { SOON_DAYS, vmpToday } from "../../constants/vmp.ts";
import { buildTimelineSummary } from "../timeline/timelineSummaryModel.ts";
import { classifyVmpDeadline } from "../../lib/vmpDeadlineModel.ts";
import type { Activity } from "../../types/domain.ts";
import { qrmLevel, qrmRpn } from "../../utils/helpers.ts";

export type MonitoringScreenId = "overview" | "timeline" | "alerts";

export interface MonitoringSignatureMetrics {
  vmpOverdue: number;
  phaseOverdue: number;
  highRisk: number;
}

/* 21/10: bỏ câu mô tả từng màn; tên màn khớp menu, nhãn số dùng thuật ngữ chuẩn. */
export const MONITORING_SCREEN_COPY = {
  overview: { title: "Tổng quan VMP", metricLabel: "Quá hạn đích VMP" },
  timeline: { title: "Dòng thời gian VMP", metricLabel: "Giai đoạn quá hạn" },
  alerts: { title: "Cảnh báo & ưu tiên", metricLabel: "Rủi ro cao" },
} as const;

export function buildMonitoringSignatureMetrics(
  acts: readonly Activity[],
  now: Date = vmpToday(),
): MonitoringSignatureMetrics {
  return {
    vmpOverdue: acts.filter((a) => a.statusSource === "server"
      ? a.st === "over"
      : classifyVmpDeadline(a, now, SOON_DAYS).kind === "overdue").length,
    phaseOverdue: buildTimelineSummary(acts, now).quaHan,
    highRisk: acts.filter((a) => qrmLevel(qrmRpn(a)) === "cao").length,
  };
}

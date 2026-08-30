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

export const MONITORING_SCREEN_COPY = {
  overview: { title: "Tổng quan VMP", metricLabel: "Trễ đích VMP", description: "Có chuyện gì?" },
  timeline: { title: "Dòng thời gian", metricLabel: "Có pha bị trễ", description: "Kẹt ở đâu, khi nào?" },
  alerts: { title: "Cảnh báo & ưu tiên", metricLabel: "Rủi ro cao cần xem", description: "Cần xử lý gì trước?" },
} as const;

export function buildMonitoringSignatureMetrics(
  acts: readonly Activity[],
  now: Date = vmpToday(),
): MonitoringSignatureMetrics {
  return {
    vmpOverdue: acts.filter((a) => classifyVmpDeadline(a, now, SOON_DAYS).kind === "overdue").length,
    phaseOverdue: buildTimelineSummary(acts, now).quaHan,
    highRisk: acts.filter((a) => qrmLevel(qrmRpn(a)) === "cao").length,
  };
}

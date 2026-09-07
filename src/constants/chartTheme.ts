/**
 * Chart-only semantic colors. These are deliberately separate from the
 * product palette: a color identifies a measured stage everywhere a chart
 * uses it, while terracotta remains reserved for an overdue signal.
 */
export const CHART_STAGE = {
  protocol: { color: "var(--chart-protocol)", text: "var(--chart-protocol-text)", soft: "var(--chart-protocol-soft)" },
  validation: { color: "var(--chart-validation)", text: "var(--chart-validation-text)", soft: "var(--chart-validation-soft)" },
  report: { color: "var(--chart-report)", text: "var(--chart-report-text)", soft: "var(--chart-report-soft)" },
  vmp: { color: "var(--chart-complete)", text: "var(--chart-complete-text)", soft: "var(--chart-complete-soft)" },
} as const;

export const CHART_STATUS = {
  complete: CHART_STAGE.vmp,
  overdue: { color: "var(--chart-overdue)", text: "var(--chart-overdue-text)", soft: "var(--chart-overdue-soft)" },
  pending: { color: "var(--chart-pending)", text: "var(--chart-pending-text)", soft: "var(--chart-pending-soft)" },
  missing: { color: "var(--chart-missing)", text: "var(--chart-missing-text)", soft: "var(--chart-missing-soft)" },
} as const;

export function chartCssVar(stage: keyof typeof CHART_STAGE): string {
  return CHART_STAGE[stage].color;
}

import type { Activity } from "../../types/domain.ts";
import { wlIsDone } from "../../utils/helpers.ts";

export const ANALYSIS_STAGES = [
  { id: "protocol", label: "Hoàn thành đề cương", short: "Đề cương", field: "tt_de_cuong" },
  { id: "validation", label: "Thẩm định thực tế", short: "Thực tế", field: "tt_tham_dinh" },
  { id: "report", label: "Hoàn thành hồ sơ", short: "Hồ sơ", field: "tt_bao_cao" },
  { id: "vmp", label: "Hoàn thành VMP", short: "VMP", field: "tt_vmp" },
] as const;

export type AnalysisStageId = (typeof ANALYSIS_STAGES)[number]["id"];

export interface CompletionStage {
  id: AnalysisStageId;
  label: string;
  short: string;
  done: number;
  total: number;
  rate: number;
  deltaFromPrevious: number | null;
}

export interface CompletionBottleneck {
  from: AnalysisStageId;
  to: AnalysisStageId;
  fromRate: number;
  toRate: number;
  drop: number;
}

export interface CompletionFlow {
  stages: CompletionStage[];
  bottleneck: CompletionBottleneck | null;
}

const isActive = (activity: Activity): boolean => (activity.state || "active") === "active";

function isStageDone(activity: Activity, stage: (typeof ANALYSIS_STAGES)[number]): boolean {
  const raw = (activity._raw || {}) as Record<string, unknown>;
  if (stage.id === "vmp" && activity.st === "done") return true;
  return wlIsDone(raw[stage.field]);
}

export function buildCompletionFlow(activities: Activity[]): CompletionFlow {
  const active = activities.filter(isActive);
  const total = active.length;
  let previousRate: number | null = null;
  const stages: CompletionStage[] = ANALYSIS_STAGES.map((stage, index) => {
    const done = active.filter((activity) => isStageDone(activity, stage)).length;
    const rate = total ? Math.round((done / total) * 100) : 0;
    const completionStage: CompletionStage = {
      id: stage.id,
      label: stage.label,
      short: stage.short,
      done,
      total,
      rate,
      deltaFromPrevious: index === 0 || previousRate == null ? null : rate - previousRate,
    };
    previousRate = rate;
    return completionStage;
  });

  if (!total) return { stages, bottleneck: null };

  let bottleneck: CompletionBottleneck | null = null;
  for (let index = 1; index < stages.length; index += 1) {
    const from = stages[index - 1];
    const to = stages[index];
    const drop = Math.max(0, from.rate - to.rate);
    if (!bottleneck || drop > bottleneck.drop) {
      bottleneck = {
        from: from.id,
        to: to.id,
        fromRate: from.rate,
        toRate: to.rate,
        drop,
      };
    }
  }

  return { stages, bottleneck };
}

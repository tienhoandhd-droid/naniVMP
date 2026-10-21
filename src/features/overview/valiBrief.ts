export type ValiBriefMood = "guide" | "concern" | "celebrate";
export type ValiBriefTone = "danger" | "warning" | "info" | "success";
export type ValiBriefMetricKind = "progress" | "documents" | "overdue" | "soon";
export type ValiBriefObservationKind = "todo" | "mismatched";

export interface ValiBriefStats {
  rate?: number;
  done?: number;
  total?: number;
  todo?: number;
  documentRate?: number;
  documentDone?: number;
  documentTotal?: number;
  overdue?: number;
  soon?: number;
  mismatched?: number;
}

export interface ValiBriefMetric {
  kind: ValiBriefMetricKind;
  label: string;
  value: string;
  detail: string;
  tone: ValiBriefTone;
}

export interface ValiBriefObservation {
  kind: ValiBriefObservationKind;
  text: string;
  tone: ValiBriefTone;
}

export interface ValiBrief {
  mood: ValiBriefMood;
  moodLabel: string;
  rate: number;
  headline: string;
  metrics: ValiBriefMetric[];
  observations: ValiBriefObservation[];
  action: string;
}

function normalizedCount(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0;
}

function normalizedRate(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value as number))) : 0;
}

function normalizedDone(doneValue: number | undefined, total: number): number {
  if (total === 0) return 0;
  return Math.min(normalizedCount(doneValue), total);
}

export function buildValiBrief(stats: ValiBriefStats = {}): ValiBrief {
  const rate = normalizedRate(stats.rate);
  const total = normalizedCount(stats.total);
  const done = normalizedDone(stats.done, total);
  const todo = normalizedCount(stats.todo);
  const documentRate = normalizedRate(stats.documentRate);
  const documentTotal = normalizedCount(stats.documentTotal);
  const documentDone = normalizedDone(stats.documentDone, documentTotal);
  const overdue = normalizedCount(stats.overdue);
  const soon = normalizedCount(stats.soon);
  const mismatched = normalizedCount(stats.mismatched);

  const mood: ValiBriefMood = overdue >= 3 || rate < 30
    ? "concern"
    : overdue === 0 && rate >= 70
      ? "celebrate"
      : "guide";
  const moodLabel = mood === "concern" ? "đang lo" : mood === "celebrate" ? "nhẹ nhõm" : "dẫn đường";

  const headline = overdue > 0
    ? `${overdue} hạng mục quá hạn đích VMP.`
    : soon > 0
      ? `Không có hạng mục quá hạn. ${soon} hạng mục tới hạn 30 ngày.`
      : `Tiến độ VMP ${rate}%. Không có hạng mục quá hạn.`;

  const metrics: ValiBriefMetric[] = [
    {
      kind: "progress",
      label: "Tiến độ VMP",
      value: `${rate}%`,
      detail: `${done}/${total} hoàn thành`,
      tone: rate >= 70 ? "success" : rate < 30 ? "warning" : "info",
    },
    {
      kind: "documents",
      label: "Hồ sơ hoàn thiện",
      value: `${documentRate}%`,
      detail: `${documentDone}/${documentTotal} hoàn thiện`,
      tone: documentRate >= 70 ? "success" : documentRate < 30 ? "warning" : "info",
    },
    {
      kind: "overdue",
      label: "Quá hạn",
      value: String(overdue),
      detail: overdue > 0 ? "Cần xử lý ngay" : "Không có hạng mục quá hạn",
      tone: overdue > 0 ? "danger" : "success",
    },
    {
      kind: "soon",
      label: "Tới hạn 30 ngày",
      value: String(soon),
      detail: soon > 0 ? "Cần theo dõi" : "Chưa có mốc gần",
      tone: soon > 0 ? "warning" : "success",
    },
  ];

  const observations: ValiBriefObservation[] = [
    {
      kind: "todo",
      text: `${todo} hạng mục chưa hoàn tất`,
      tone: todo > 0 ? "warning" : "success",
    },
    {
      kind: "mismatched",
      text: `${mismatched} hạng mục lệch pha`,
      tone: mismatched > 0 ? "info" : "success",
    },
  ];

  const action = overdue > 0
    ? "Xử lý hạng mục quá hạn trước."
    : soon > 0
      ? "Theo dõi hạng mục tới hạn 30 ngày."
      : mismatched > 0
        ? "Rà hạng mục lệch pha."
        : "Duy trì tiến độ.";

  return { mood, moodLabel, rate, headline, metrics, observations, action };
}

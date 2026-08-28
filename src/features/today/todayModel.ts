import type { Activity } from "../../types/domain.ts";
import type { EditableProgressRight } from "../progress/editableProgressRights.ts";
import type { EditableTimelineField } from "../itemPermissions/types.ts";

export type TodayReasonKind =
  | "overdue" | "due_today" | "due_7d"
  | "missing_owner" | "missing_actual_completion" | "missing_schedule";
export type TodaySection = "overdue" | "today" | "upcoming" | "incomplete";
export type TodayRightsStatus = "loading" | "ready" | "error";

export interface TodayReason {
  kind: TodayReasonKind;
  label: string;
  stage?: string;
  daysRemaining?: number;
}

export interface TodayActionRow {
  validationCode: string;
  title: string;
  department: string;
  ownerName: string;
  criticality: string;
  criticalityScore: number | null;
  blockingStage: string;
  deadlineStage: string | null;
  daysRemaining: number | null;
  reasons: TodayReason[];
  section: TodaySection;
  canEditProgress: boolean;
  editableFields: readonly EditableTimelineField[];
  permissionReason: string;
}

export interface TodayActionModel {
  rows: TodayActionRow[];
  sections: Record<TodaySection, TodayActionRow[]>;
  kpis: { overdue: number; today: number; upcoming: number; dataQuality: number };
  nextAction: TodayActionRow | null;
}

export interface ProgressDeepLink {
  validationCode: string;
  source: "today";
  reasons: TodayReasonKind[];
  /** Compatibility for the old command-center adapter; new callers use reasons. */
  quickFilter?: TodayReasonKind | TodayRowKind;
}

const DAY_MS = 86_400_000;
const BANGKOK_OFFSET_MS = 7 * 3_600_000;
const STAGES = [
  { deadline: "dlProtocol", actual: "actProtocol", rawDeadline: ["deadline_protocol", "dl_protocol"], rawActual: ["actual_protocol_date", "ngay_de_cuong"], done: "protocol_done", label: "Đề cương" },
  { deadline: "dlValidation", actual: "actValidation", rawDeadline: ["deadline_validation", "dl_validation"], rawActual: ["actual_validation_date", "ngay_tham_dinh"], done: "validation_done", label: "Thẩm định" },
  { deadline: "dlReport", actual: "actReport", rawDeadline: ["deadline_report", "dl_report"], rawActual: ["actual_report_date", "ngay_bao_cao"], done: "report_done", label: "Báo cáo" },
  { deadline: "dlVmp", actual: "actVmp", rawDeadline: ["deadline_vmp", "dl_vmp"], rawActual: ["actual_vmp_date", "ngay_vmp"], done: "vmp_done", label: "Đích VMP" },
] as const;
type Raw = Record<string, unknown>;

function rawOf(activity: Activity): Raw { return activity._raw ?? {}; }

function firstValue(activity: Activity, primary: string, aliases: readonly string[]): unknown {
  const source = activity as unknown as Raw;
  for (const key of [primary, ...aliases]) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  const raw = rawOf(activity);
  for (const key of [primary, ...aliases]) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") return raw[key];
  }
  return null;
}

function asDateString(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = value.slice(0, 10);
  return Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? null : date;
}

function bangkokDay(now: Date): string {
  return new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

function daysBetween(date: string, today: string): number {
  return Math.round((Date.parse(date) - Date.parse(today)) / DAY_MS);
}

function stageComplete(activity: Activity, stage: typeof STAGES[number]): boolean {
  if (asDateString(firstValue(activity, stage.actual, stage.rawActual))) return true;
  return rawOf(activity)[stage.done] === true;
}

function activityState(activity: Activity): string {
  return String(activity.state ?? rawOf(activity).state ?? "active");
}

function validationCode(activity: Activity): string | null {
  const source = activity as unknown as Raw;
  const raw = rawOf(activity);
  for (const key of ["validationCode", "validation_code", "id", "code"]) {
    for (const values of [source, raw]) {
      const value = values[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function title(activity: Activity): string {
  const value = firstValue(activity, "objName", ["name", "object_name", "code", "validationCode", "id"]);
  return typeof value === "string" && value.trim() ? value.trim() : validationCode(activity) ?? "";
}

function department(activity: Activity): string {
  const value = firstValue(activity, "dept", ["department", "object_department"]);
  if (typeof value === "string" && value.trim()) return value.trim();
  const depts = (activity as unknown as Raw).depts;
  return Array.isArray(depts) ? depts.filter((x): x is string => typeof x === "string").join(", ") : "";
}

function ownerName(activity: Activity): string {
  const value = firstValue(activity, "owner_name", ["owner", "performer_name"]);
  return typeof value === "string" && value.trim() ? value.trim() : "Chưa phân công";
}

function ownerPersonId(activity: Activity): string | null {
  const value = firstValue(activity, "ownerPersonId", ["owner_person_id"]);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function supportPersonId(activity: Activity): string | null {
  const value = firstValue(activity, "supportPersonId", ["support_person_id"]);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isTodayActivityMine(activity: Activity, personId: string): boolean {
  if (typeof personId !== "string" || !personId.trim()) return false;
  const id = personId.trim();
  return ownerPersonId(activity) === id || supportPersonId(activity) === id;
}

function criticality(activity: Activity): string {
  const value = firstValue(activity, "criticality", ["crit", "criticality_label"]);
  return value === null ? "" : String(value);
}

function criticalityScore(activity: Activity): number | null {
  const value = firstValue(activity, "score", ["criticality_score", "grade"]);
  if (value === null) return null;
  const score = typeof value === "number" ? value : Number(value);
  return Number.isFinite(score) ? score : null;
}

function unfinishedStages(activity: Activity): Array<{ label: string; deadline: string | null }> {
  return STAGES.filter((stage) => !stageComplete(activity, stage)).map((stage) => ({
    label: stage.label,
    deadline: asDateString(firstValue(activity, stage.deadline, stage.rawDeadline)),
  }));
}

function permission(options: {
  rights: ReadonlyMap<string, EditableProgressRight>;
  rightsStatus: TodayRightsStatus;
}, code: string): Pick<TodayActionRow, "canEditProgress" | "editableFields" | "permissionReason"> {
  if (options.rightsStatus !== "ready") {
    return {
      canEditProgress: false,
      editableFields: [],
      permissionReason: options.rightsStatus === "loading"
        ? "Đang tải quyền cập nhật tiến độ"
        : "Không tải được quyền cập nhật tiến độ",
    };
  }
  const right = options.rights.get(code);
  if (!right) return { canEditProgress: false, editableFields: [], permissionReason: "Không có quyền cập nhật tiến độ" };
  return { canEditProgress: true, editableFields: [...right.editableFields], permissionReason: right.reason };
}

function buildReasons(
  deadlineStage: string | null,
  daysRemaining: number | null,
  hasOwner: boolean,
  needsActualCompletion: boolean,
  needsSchedule: boolean,
): TodayReason[] {
  const reasons: TodayReason[] = [];
  if (deadlineStage && daysRemaining !== null) {
    if (daysRemaining < 0) reasons.push({ kind: "overdue", label: "Quá hạn", stage: deadlineStage, daysRemaining });
    else if (daysRemaining === 0) reasons.push({ kind: "due_today", label: "Đến hạn hôm nay", stage: deadlineStage, daysRemaining });
    else if (daysRemaining <= 7) reasons.push({ kind: "due_7d", label: "Đến hạn trong 7 ngày", stage: deadlineStage, daysRemaining });
  }
  if (!hasOwner) reasons.push({ kind: "missing_owner", label: "Chưa phân công" });
  if (needsActualCompletion) reasons.push({ kind: "missing_actual_completion", label: "Thiếu ngày hoàn thành", stage: "Đích VMP" });
  if (needsSchedule) reasons.push({ kind: "missing_schedule", label: "Chưa lên lịch" });
  return reasons;
}

function sectionFor(daysRemaining: number | null, hasQualityIssue: boolean): TodaySection | null {
  if (daysRemaining !== null && daysRemaining < 0) return "overdue";
  if (daysRemaining === 0) return "today";
  if (daysRemaining !== null && daysRemaining <= 7) return "upcoming";
  return hasQualityIssue ? "incomplete" : null;
}

function makeRow(activity: Activity, today: string, options: {
  rights: ReadonlyMap<string, EditableProgressRight>;
  rightsStatus: TodayRightsStatus;
}): TodayActionRow | null {
  if (activityState(activity) !== "active") return null;
  const code = validationCode(activity);
  if (!code) return null;
  const unfinished = unfinishedStages(activity);
  const blockingStage = unfinished[0]?.label ?? "Đích VMP";
  const dated = unfinished.find((stage) => stage.deadline !== null);
  const deadlineStage = dated?.label ?? null;
  const daysRemaining = dated?.deadline ? daysBetween(dated.deadline, today) : null;
  const hasOwner = ownerPersonId(activity) !== null;
  const isDone = activity.st === "done";
  const finalActual = asDateString(firstValue(activity, "actVmp", ["actual_vmp_date", "ngay_vmp"]));
  const needsActualCompletion = isDone && finalActual === null;
  const needsSchedule = !isDone && unfinished.length > 0 && dated === undefined;
  const reasons = buildReasons(deadlineStage, daysRemaining, hasOwner, needsActualCompletion, needsSchedule);
  const section = sectionFor(daysRemaining, reasons.some((reason) =>
    reason.kind === "missing_owner" || reason.kind === "missing_actual_completion" || reason.kind === "missing_schedule"));
  if (section === null) return null;
  return {
    validationCode: code, title: title(activity), department: department(activity),
    ownerName: ownerName(activity), criticality: criticality(activity), criticalityScore: criticalityScore(activity),
    blockingStage, deadlineStage, daysRemaining, reasons, section, ...permission(options, code),
  };
}

const SECTION_RANK: Record<TodaySection, number> = { overdue: 0, today: 1, upcoming: 2, incomplete: 3 };

/** Approved deterministic order: urgency → score → editability → days → Vietnamese code. */
function compareRows(a: TodayActionRow, b: TodayActionRow): number {
  const aDays = a.daysRemaining ?? Number.POSITIVE_INFINITY;
  const bDays = b.daysRemaining ?? Number.POSITIVE_INFINITY;
  return SECTION_RANK[a.section] - SECTION_RANK[b.section]
    || (b.criticalityScore ?? Number.NEGATIVE_INFINITY) - (a.criticalityScore ?? Number.NEGATIVE_INFINITY)
    || Number(b.canEditProgress) - Number(a.canEditProgress)
    || aDays - bDays
    || a.validationCode.localeCompare(b.validationCode, "vi");
}

export function buildTodayActionModel(
  activities: readonly Activity[],
  options: { now: Date; rights: ReadonlyMap<string, EditableProgressRight>; rightsStatus: TodayRightsStatus },
): TodayActionModel {
  const today = bangkokDay(options.now);
  const rows = (activities ?? []).map((activity) => makeRow(activity, today, options))
    .filter((row): row is TodayActionRow => row !== null).sort(compareRows);
  const sections: Record<TodaySection, TodayActionRow[]> = {
    overdue: rows.filter((row) => row.section === "overdue"),
    today: rows.filter((row) => row.section === "today"),
    upcoming: rows.filter((row) => row.section === "upcoming"),
    incomplete: rows.filter((row) => row.section === "incomplete"),
  };
  const qualityKinds = new Set<TodayReasonKind>(["missing_owner", "missing_actual_completion", "missing_schedule"]);
  return {
    rows, sections,
    kpis: {
      overdue: sections.overdue.length, today: sections.today.length, upcoming: sections.upcoming.length,
      dataQuality: rows.filter((row) => row.reasons.some((reason) => qualityKinds.has(reason.kind))).length,
    },
    nextAction: rows[0] ?? null,
  };
}

/* Legacy adapter retained while the command-center presentation migrates to
 * TodayActionRow. The actionable model above is the canonical API. */
export type TodayRowKind = "overdue" | "due_7d" | "incomplete_record";
export interface TodayRow {
  validationCode: string;
  title: string;
  milestoneLabel: string;
  daysRemaining: number | null;
  kind: TodayRowKind;
  reasons: TodayReasonKind[];
}
export interface TodayModel {
  overdue: TodayRow[];
  dueSoon: TodayRow[];
  incomplete: TodayRow[];
  nextAction: TodayRow | null;
}
function legacyRow(row: TodayActionRow): TodayRow {
  const kind: TodayRowKind = row.section === "overdue" ? "overdue" : row.section === "incomplete" ? "incomplete_record" : "due_7d";
  return {
    validationCode: row.validationCode, title: row.title,
    milestoneLabel: row.reasons.find((reason) => reason.stage)?.stage ?? row.blockingStage,
    daysRemaining: row.daysRemaining, kind,
    reasons: row.reasons.map((reason) => reason.kind),
  };
}
export function buildTodayModel(activities: Activity[], now: Date): TodayModel {
  const model = buildTodayActionModel(activities, { now, rights: new Map(), rightsStatus: "error" });
  const overdue = model.sections.overdue.map(legacyRow);
  const dueSoon = [...model.sections.today, ...model.sections.upcoming].map(legacyRow);
  const incomplete = model.sections.incomplete.map(legacyRow);
  return { overdue, dueSoon, incomplete, nextAction: model.nextAction ? legacyRow(model.nextAction) : null };
}

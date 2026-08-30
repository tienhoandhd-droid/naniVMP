import { SOON_DAYS } from "../../constants/vmp.ts";
import {
  bangkokCalendarDate,
  classifyVmpDeadline,
  isVmpComplete,
  vmpDeadlineDate,
} from "../../lib/vmpDeadlineModel.ts";
import type { Activity } from "../../types/domain.ts";
import { wlIsDone } from "../../utils/helpers.ts";

export type LongMonRaceStage =
  | "catfish"
  | "betta"
  | "carp"
  | "angelfish"
  | "arowana"
  | "puffer";

export interface LongMonStageMeta {
  id: LongMonRaceStage;
  species: string;
  label: string;
  shortLabel: string;
  spriteX: "0%" | "50%" | "100%";
  spriteY: "0%" | "100%";
}

export interface LongMonRaceFish {
  activity: Activity;
  deadline: string;
  stage: LongMonRaceStage;
  weekKey: string;
  weekIndex: number;
  weekLabel: string;
  xPct: number;
  yPct: number;
  yPx: number;
  lane: number;
  renderOffsetXPx: number;
  renderOffsetYPx: number;
  renderScale: number;
  renderRotateDeg: number;
  schoolRow: number;
  schoolSize: number;
}

export interface LongMonMonthBand {
  year: number;
  month: number;
  label: string;
  shortLabel: string;
  startPct: number;
  widthPct: number;
}

export interface LongMonWeekBand {
  key: string;
  index: number;
  label: string;
  startPct: number;
  widthPct: number;
}

export interface LongMonRaceModel {
  bands: LongMonMonthBand[];
  weeks: LongMonWeekBand[];
  fish: LongMonRaceFish[];
  laneCount: number;
  densityScale: number;
  todayPct: number | null;
  missingDeadlineCount: number;
  stageCounts: Record<LongMonRaceStage, number>;
}

export interface LongMonRaceLayoutOptions {
  audience?: "team" | "personal";
}

export const LONG_MON_STAGE_META: readonly LongMonStageMeta[] = [
  { id: "catfish", species: "Cá trê xám", label: "Chưa hoàn thành đề cương", shortLabel: "Chưa xong đề cương", spriteX: "0%", spriteY: "0%" },
  { id: "betta", species: "Cá lia thia lam", label: "Hoàn thành đề cương", shortLabel: "Xong đề cương", spriteX: "50%", spriteY: "0%" },
  { id: "carp", species: "Cá chép ngọc", label: "Hoàn thành thẩm định thực tế", shortLabel: "Xong thực tế", spriteX: "100%", spriteY: "0%" },
  { id: "angelfish", species: "Cá thần tiên tím", label: "Hoàn thành báo cáo", shortLabel: "Xong báo cáo", spriteX: "0%", spriteY: "100%" },
  { id: "arowana", species: "Cá rồng vàng", label: "Hoàn thành VMP", shortLabel: "Xong VMP", spriteX: "50%", spriteY: "100%" },
  { id: "puffer", species: "Cá nóc chu sa", label: "Quá hạn VMP", shortLabel: "Quá hạn VMP", spriteX: "100%", spriteY: "100%" },
] as const;

const DAY_MS = 86_400_000;
const MIN_CANVAS_WIDTH_PX = 820;
const LONG_MON_SCENE_HEIGHT_PX = 520;
export const LONG_MON_COLLISION_WIDTH_PX = 84;
export const LONG_MON_COLLISION_HEIGHT_PX = 78;
const TEAM_DENSITY_LEVELS = [1, .91, .82] as const;

interface PlacementRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface PlacementPoint {
  xPx: number;
  yPx: number;
  rotateDeg: number;
}

interface PlacementResult {
  positions: Map<string, PlacementPoint>;
  densityScale: number;
}

function utcOfIso(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function rawOf(activity: Activity): Record<string, unknown> {
  return activity._raw && typeof activity._raw === "object" ? activity._raw : {};
}

function valuesFor(activity: Activity, keys: readonly string[]): unknown[] {
  const source = activity as Record<string, unknown>;
  const raw = rawOf(activity);
  return keys.flatMap((key) => [source[key], raw[key]]);
}

function phaseComplete(
  activity: Activity,
  statusKeys: readonly string[],
  actualKeys: readonly string[],
  flagKeys: readonly string[],
): boolean {
  if (valuesFor(activity, statusKeys).some(wlIsDone)) return true;
  if (valuesFor(activity, flagKeys).some((value) => value === true)) return true;
  return valuesFor(activity, actualKeys).some((value) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isActive(activity: Activity): boolean {
  const raw = rawOf(activity);
  return String(activity.state ?? raw.state ?? "active") === "active";
}

export function longMonStageOf(activity: Activity, now: Date): LongMonRaceStage {
  if (isVmpComplete(activity)) return "arowana";
  if (classifyVmpDeadline(activity, now, SOON_DAYS).kind === "overdue") return "puffer";
  if (phaseComplete(
    activity,
    ["tt_bao_cao", "status_report"],
    ["actReport", "actual_report_date", "ngay_bao_cao"],
    ["report_done"],
  )) return "angelfish";
  if (phaseComplete(
    activity,
    ["tt_tham_dinh", "status_validation"],
    ["actValidation", "actual_validation_date", "ngay_tham_dinh"],
    ["validation_done"],
  )) return "carp";
  if (phaseComplete(
    activity,
    ["tt_de_cuong", "status_protocol"],
    ["actProtocol", "actual_protocol_date", "ngay_de_cuong"],
    ["protocol_done"],
  )) return "betta";
  return "catfish";
}

function rangeAround(now: Date): { start: number; endExclusive: number; today: number } {
  const [year, month, day] = bangkokCalendarDate(now).split("-").map(Number);
  return {
    start: Date.UTC(year, month - 2, 1),
    endExclusive: Date.UTC(year, month + 1, 1),
    today: Date.UTC(year, month - 1, day),
  };
}

function percentInRange(time: number, start: number, endExclusive: number): number {
  return Math.max(0, Math.min(100, ((time - start) / (endExclusive - start - DAY_MS)) * 100));
}

function monthBands(start: number, endExclusive: number): LongMonMonthBand[] {
  const bands: LongMonMonthBand[] = [];
  for (let index = 0; index < 3; index += 1) {
    const date = new Date(start);
    const bandStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + index, 1);
    const bandEnd = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + index + 1, 1);
    const month = new Date(bandStart).getUTCMonth() + 1;
    const year = new Date(bandStart).getUTCFullYear();
    bands.push({
      year,
      month,
      label: `Tháng ${month}`,
      shortLabel: `${String(month).padStart(2, "0")}/${year}`,
      startPct: ((bandStart - start) / (endExclusive - start)) * 100,
      widthPct: ((bandEnd - bandStart) / (endExclusive - start)) * 100,
    });
  }
  return bands;
}

function emptyStageCounts(): Record<LongMonRaceStage, number> {
  return {
    catfish: 0,
    betta: 0,
    carp: 0,
    angelfish: 0,
    arowana: 0,
    puffer: 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isoDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function startOfUtcWeek(time: number): number {
  const date = new Date(time);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return time - daysSinceMonday * DAY_MS;
}

function shortDay(time: number): string {
  const date = new Date(time);
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function weekBands(start: number, endExclusive: number): LongMonWeekBand[] {
  const weeks: LongMonWeekBand[] = [];
  const duration = endExclusive - start;
  for (let weekStart = startOfUtcWeek(start); weekStart < endExclusive; weekStart += 7 * DAY_MS) {
    const visibleStart = Math.max(start, weekStart);
    const visibleEnd = Math.min(endExclusive, weekStart + 7 * DAY_MS);
    weeks.push({
      key: isoDate(weekStart),
      index: weeks.length,
      label: `${shortDay(weekStart)}–${shortDay(weekStart + 6 * DAY_MS)}`,
      startPct: (visibleStart - start) / duration * 100,
      widthPct: (visibleEnd - visibleStart) / duration * 100,
    });
  }
  return weeks;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return hash >>> 0;
}

function stableUnit(activity: Activity, salt: string): number {
  const identity = String(activity.id || activity.code || "fish");
  return stableHash(`${salt}:${identity}`) / 0xffff_ffff;
}

function stableRange(activity: Activity, salt: string, min: number, max: number): number {
  return min + stableUnit(activity, salt) * (max - min);
}

function fishIdentity(fish: LongMonRaceFish): string {
  return String(fish.activity.id || fish.activity.code || `${fish.weekKey}:${fish.deadline}`);
}

function rectAt(xPx: number, yPx: number, scale: number): PlacementRect {
  const halfWidth = LONG_MON_COLLISION_WIDTH_PX * scale / 2;
  const halfHeight = LONG_MON_COLLISION_HEIGHT_PX * scale / 2;
  return {
    left: xPx - halfWidth,
    right: xPx + halfWidth,
    top: yPx - halfHeight,
    bottom: yPx + halfHeight,
  };
}

function overlapsAny(rect: PlacementRect, placed: readonly PlacementRect[]): boolean {
  return placed.some((other) =>
    rect.left < other.right
    && rect.right > other.left
    && rect.top < other.bottom
    && rect.bottom > other.top);
}

function tryTeamPlacement(
  fish: readonly LongMonRaceFish[],
  weeks: readonly LongMonWeekBand[],
  scale: number,
): Map<string, PlacementPoint> | null {
  const groups = Map.groupBy(fish, (item) => item.weekKey);
  const orderedGroups = [...groups.entries()].sort((left, right) =>
    right[1].length - left[1].length
    || left[1][0].weekIndex - right[1][0].weekIndex);
  const collisionWidth = LONG_MON_COLLISION_WIDTH_PX * scale;
  const collisionHeight = LONG_MON_COLLISION_HEIGHT_PX * scale;
  const halfWidth = collisionWidth / 2;
  const halfHeight = collisionHeight / 2;
  const xByIdentity = new Map<string, number>();

  for (const [, group] of orderedGroups) {
    const orderedFish = [...group].sort((left, right) =>
      left.deadline.localeCompare(right.deadline)
      || fishIdentity(left).localeCompare(fishIdentity(right), "vi"));
    const week = weeks[orderedFish[0].weekIndex];
    const weekCenterPx = (week.startPct + week.widthPct / 2) / 100 * MIN_CANVAS_WIDTH_PX;
    const weekWidthPx = week.widthPct / 100 * MIN_CANVAS_WIDTH_PX;
    const xRadius = Math.max(50, weekWidthPx * .95);
    let leftColumn = clamp(weekCenterPx - xRadius, halfWidth, MIN_CANVAS_WIDTH_PX - halfWidth);
    let rightColumn = clamp(weekCenterPx + xRadius, halfWidth, MIN_CANVAS_WIDTH_PX - halfWidth);
    const minimumColumnGap = collisionWidth + 4;
    if (rightColumn - leftColumn < minimumColumnGap) {
      if (leftColumn <= halfWidth + .5) {
        rightColumn = Math.min(MIN_CANVAS_WIDTH_PX - halfWidth, leftColumn + minimumColumnGap);
      } else {
        leftColumn = Math.max(halfWidth, rightColumn - minimumColumnGap);
      }
    }
    const flipColumns = stableHash(week.key) % 2;
    orderedFish.forEach((item, index) => {
      const isRight = (index + flipColumns) % 2 === 1;
      const baseX = orderedFish.length === 1
        ? clamp(weekCenterPx, halfWidth, MIN_CANVAS_WIDTH_PX - halfWidth)
        : (isRight ? rightColumn : leftColumn);
      const jitter = stableRange(item.activity, `${item.weekKey}:x-column`, -1.5, 1.5);
      xByIdentity.set(fishIdentity(item), clamp(baseX + jitter, halfWidth, MIN_CANVAS_WIDTH_PX - halfWidth));
    });
  }

  const orderedByInterval = [...fish].sort((left, right) => {
    const leftX = xByIdentity.get(fishIdentity(left)) ?? 0;
    const rightX = xByIdentity.get(fishIdentity(right)) ?? 0;
    return leftX - rightX
      || left.deadline.localeCompare(right.deadline)
      || fishIdentity(left).localeCompare(fishIdentity(right), "vi");
  });
  const rowRights: number[] = [];
  const rowByIdentity = new Map<string, number>();

  for (const item of orderedByInterval) {
    const xPx = xByIdentity.get(fishIdentity(item))!;
    const left = xPx - halfWidth;
    const right = xPx + halfWidth;
    let row = rowRights.findIndex((lastRight) => lastRight <= left);
    if (row === -1) {
      row = rowRights.length;
      rowRights.push(right);
    } else {
      rowRights[row] = right;
    }
    rowByIdentity.set(fishIdentity(item), row);
  }

  const maxRows = Math.max(1, Math.floor(LONG_MON_SCENE_HEIGHT_PX / collisionHeight));
  if (rowRights.length > maxRows) return null;

  const positions = new Map<string, PlacementPoint>();
  const rowSpacing = rowRights.length <= 1
    ? 0
    : (LONG_MON_SCENE_HEIGHT_PX - collisionHeight) / (rowRights.length - 1);
  const spareBetweenRows = Math.max(0, rowSpacing - collisionHeight);
  const waveAmplitude = Math.min(12, spareBetweenRows / 3);

  for (const item of fish) {
    const xPx = xByIdentity.get(fishIdentity(item))!;
    const row = rowByIdentity.get(fishIdentity(item))!;
    const baseY = rowRights.length <= 1
      ? LONG_MON_SCENE_HEIGHT_PX / 2
      : halfHeight + row * rowSpacing;
    const flowY = Math.sin(xPx / MIN_CANVAS_WIDTH_PX * Math.PI * 3.4 + row * .47) * waveAmplitude;
    const yPx = clamp(baseY + flowY, halfHeight, LONG_MON_SCENE_HEIGHT_PX - halfHeight);
    positions.set(fishIdentity(item), {
      xPx,
      yPx,
      rotateDeg: Number((
        Math.cos(xPx / MIN_CANVAS_WIDTH_PX * Math.PI * 3.4 + row * .47) * 2.2
        + stableRange(item.activity, "pose", -1.4, 1.4)
      ).toFixed(2)),
    });
  }

  const finalRects = [...positions.values()].map((point) => rectAt(point.xPx, point.yPx, scale));
  if (finalRects.some((rect, index) => overlapsAny(rect, finalRects.slice(index + 1)))) return null;
  return positions;
}

function buildTeamPlacement(
  fish: readonly LongMonRaceFish[],
  weeks: readonly LongMonWeekBand[],
): PlacementResult {
  for (const scale of TEAM_DENSITY_LEVELS) {
    const positions = tryTeamPlacement(fish, weeks, scale);
    if (positions) return { positions, densityScale: scale };
  }
  return { positions: new Map(), densityScale: TEAM_DENSITY_LEVELS.at(-1)! };
}

function applyPlacement(
  fish: LongMonRaceFish[],
  weeks: readonly LongMonWeekBand[],
): { laneCount: number; densityScale: number } {
  const weekCounts = new Map<string, number>();
  for (const item of fish) weekCounts.set(item.weekKey, (weekCounts.get(item.weekKey) ?? 0) + 1);
  const placement = buildTeamPlacement(fish, weeks);

  for (const item of fish) {
    const point = placement.positions.get(fishIdentity(item));
    if (!point) continue;
    item.xPct = point.xPx / MIN_CANVAS_WIDTH_PX * 100;
    item.yPct = point.yPx / LONG_MON_SCENE_HEIGHT_PX * 100;
    item.yPx = point.yPx;
    item.lane = Math.max(0, Math.round(point.yPx / LONG_MON_COLLISION_HEIGHT_PX));
    item.renderOffsetXPx = 0;
    item.renderOffsetYPx = 0;
    item.renderScale = placement.densityScale;
    item.renderRotateDeg = point.rotateDeg;
    item.schoolRow = item.lane;
    item.schoolSize = weekCounts.get(item.weekKey) ?? 1;
  }

  return { laneCount: 1, densityScale: placement.densityScale };
}

export function buildLongMonRaceModel(
  activities: readonly Activity[],
  now: Date,
  _options: LongMonRaceLayoutOptions = {},
): LongMonRaceModel {
  const { start, endExclusive, today } = rangeAround(now);
  const weeks = weekBands(start, endExclusive);
  const weekIndexByKey = new Map(weeks.map((week) => [week.key, week.index]));
  const active = activities.filter(isActive);
  let missingDeadlineCount = 0;
  const candidates: LongMonRaceFish[] = [];

  for (const activity of active) {
    const deadline = vmpDeadlineDate(activity);
    if (deadline === null) {
      missingDeadlineCount += 1;
      continue;
    }
    const time = utcOfIso(deadline);
    if (time < start || time >= endExclusive) continue;
    const weekKey = isoDate(startOfUtcWeek(time));
    const weekIndex = weekIndexByKey.get(weekKey);
    if (weekIndex === undefined) continue;
    candidates.push({
      activity,
      deadline,
      stage: longMonStageOf(activity, now),
      weekKey,
      weekIndex,
      weekLabel: weeks[weekIndex].label,
      xPct: 0,
      yPct: 0,
      yPx: 0,
      lane: 0,
      renderOffsetXPx: 0,
      renderOffsetYPx: 0,
      renderScale: 1,
      renderRotateDeg: 0,
      schoolRow: 0,
      schoolSize: 1,
    });
  }

  candidates.sort((left, right) =>
    left.deadline.localeCompare(right.deadline)
    || String(left.activity.code || left.activity.id).localeCompare(
      String(right.activity.code || right.activity.id),
      "vi",
    ));

  const { laneCount, densityScale } = applyPlacement(candidates, weeks);

  const stageCounts = emptyStageCounts();
  for (const fish of candidates) stageCounts[fish.stage] += 1;

  return {
    bands: monthBands(start, endExclusive),
    weeks,
    fish: candidates,
    laneCount,
    densityScale,
    todayPct: today >= start && today < endExclusive
      ? percentInRange(today, start, endExclusive)
      : null,
    missingDeadlineCount,
    stageCounts,
  };
}

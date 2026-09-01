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

export interface LongMonPeriodBand {
  id: "past" | "future";
  label: string;
  startPct: number;
  widthPct: number;
}

export interface LongMonRaceModel {
  periods: LongMonPeriodBand[];
  bands: LongMonMonthBand[];
  weeks: LongMonWeekBand[];
  fish: LongMonRaceFish[];
  laneCount: number;
  densityScale: number;
  sceneWidthPx: number;
  sceneHeightPx: number;
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
const TEAM_CANVAS_WIDTH_PX = 960;
const LONG_MON_SCENE_HEIGHT_PX = 560;
export const LONG_MON_COLLISION_WIDTH_PX = 62;
export const LONG_MON_COLLISION_HEIGHT_PX = 54;
const LONG_MON_VISUAL_SCALE_MAX = 1.04;
const TEAM_DENSITY_LEVELS = [1, .91, .82, .74, .66, .58, .5, .44] as const;

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
  sceneWidthPx: number;
  sceneHeightPx: number;
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
  const today = Date.UTC(year, month - 1, day);
  return {
    start: today - 30 * DAY_MS,
    endExclusive: today + 30 * DAY_MS,
    today,
  };
}

function percentInWeightedWeeks(
  time: number,
  weeks: readonly LongMonWeekBand[],
  start: number,
  endExclusive: number,
): number {
  if (time <= start) return 0;
  if (time >= endExclusive) return 100;
  const week = weeks.find((item) => {
    const weekStart = utcOfIso(item.key);
    return time >= Math.max(start, weekStart)
      && time < Math.min(endExclusive, weekStart + 7 * DAY_MS);
  });
  if (!week) return 0;
  const weekStart = utcOfIso(week.key);
  const visibleStart = Math.max(start, weekStart);
  const visibleEnd = Math.min(endExclusive, weekStart + 7 * DAY_MS);
  const progress = (time - visibleStart) / (visibleEnd - visibleStart);
  return week.startPct + clamp(progress, 0, 1) * week.widthPct;
}

function monthBands(
  start: number,
  endExclusive: number,
  weeks: readonly LongMonWeekBand[],
): LongMonMonthBand[] {
  const bands: LongMonMonthBand[] = [];
  const first = new Date(start);
  for (
    let monthStart = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
    monthStart < endExclusive;
    monthStart = Date.UTC(
      new Date(monthStart).getUTCFullYear(),
      new Date(monthStart).getUTCMonth() + 1,
      1,
    )
  ) {
    const monthEnd = Date.UTC(
      new Date(monthStart).getUTCFullYear(),
      new Date(monthStart).getUTCMonth() + 1,
      1,
    );
    const month = new Date(monthStart).getUTCMonth() + 1;
    const year = new Date(monthStart).getUTCFullYear();
    const startPct = percentInWeightedWeeks(Math.max(start, monthStart), weeks, start, endExclusive);
    const endPct = percentInWeightedWeeks(Math.min(endExclusive, monthEnd), weeks, start, endExclusive);
    bands.push({
      year,
      month,
      label: `Tháng ${month}`,
      shortLabel: `${String(month).padStart(2, "0")}/${year}`,
      startPct,
      widthPct: endPct - startPct,
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

function weightedWeekBands(
  weeks: readonly LongMonWeekBand[],
  counts: ReadonlyMap<string, number>,
  start: number,
  today: number,
  endExclusive: number,
): LongMonWeekBand[] {
  const weighted = weeks.map((week) => {
    const count = counts.get(week.key) ?? 0;
    const densityWeight = count === 0
      ? .58
      : 1 + Math.min(.8, Math.log2(count + 1) * .16);
    const weekStart = utcOfIso(week.key);
    const visibleStart = Math.max(start, weekStart);
    const visibleEnd = Math.min(endExclusive, weekStart + 7 * DAY_MS);
    const pastMs = Math.max(0, Math.min(visibleEnd, today) - visibleStart);
    const futureMs = Math.max(0, visibleEnd - Math.max(visibleStart, today));
    return {
      week,
      pastRaw: pastMs * densityWeight,
      futureRaw: futureMs * densityWeight,
    };
  });
  const pastTotal = weighted.reduce((sum, item) => sum + item.pastRaw, 0);
  const futureTotal = weighted.reduce((sum, item) => sum + item.futureRaw, 0);
  let cursor = 0;
  return weighted.map(({ week, pastRaw, futureRaw }) => {
    const widthPct = (pastTotal ? pastRaw / pastTotal * 50 : 0)
      + (futureTotal ? futureRaw / futureTotal * 50 : 0);
    const weighted = { ...week, startPct: cursor, widthPct };
    cursor += widthPct;
    return weighted;
  });
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
  const reservedScale = scale * LONG_MON_VISUAL_SCALE_MAX;
  const halfWidth = LONG_MON_COLLISION_WIDTH_PX * reservedScale / 2;
  const halfHeight = LONG_MON_COLLISION_HEIGHT_PX * reservedScale / 2;
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

function teamYCandidates(
  item: LongMonRaceFish,
  xPx: number,
  sceneWidthPx: number,
  sceneHeightPx: number,
  scale: number,
): number[] {
  const reservedScale = scale * LONG_MON_VISUAL_SCALE_MAX;
  const halfHeight = LONG_MON_COLLISION_HEIGHT_PX * reservedScale / 2;
  const minY = halfHeight;
  const maxY = sceneHeightPx - halfHeight;
  const phase = stableHash(item.weekKey) % 628 / 100;
  const flow = .5 + Math.sin(xPx / sceneWidthPx * Math.PI * 3.1 + phase) * .23;
  const preferred = clamp(
    (flow + stableRange(item.activity, "school-depth", -.24, .24)) * sceneHeightPx,
    minY,
    maxY,
  );
  const step = LONG_MON_COLLISION_HEIGHT_PX * reservedScale + 10;
  const candidates = [preferred];

  for (let distance = 1; distance <= 6; distance += 1) {
    const signFirst = stableHash(`${fishIdentity(item)}:team-y:${distance}`) % 2 === 0 ? -1 : 1;
    candidates.push(clamp(preferred + signFirst * distance * step, minY, maxY));
    candidates.push(clamp(preferred - signFirst * distance * step, minY, maxY));
  }

  const bandCount = 13;
  const bandOffset = stableHash(`${fishIdentity(item)}:team-band`) % bandCount;
  for (let band = 0; band < bandCount; band += 1) {
    const bandIndex = (band + bandOffset) % bandCount;
    candidates.push(minY + bandIndex / (bandCount - 1) * (maxY - minY));
  }

  return [...new Set(candidates.map((value) => Number(value.toFixed(4))))];
}

function tryTeamPlacement(
  fish: readonly LongMonRaceFish[],
  weeks: readonly LongMonWeekBand[],
  scale: number,
  sceneWidthPx: number,
  sceneHeightPx: number = LONG_MON_SCENE_HEIGHT_PX,
): PlacementResult | null {
  const groups = new Map<string, LongMonRaceFish[]>();
  for (const item of fish) {
    const group = groups.get(item.weekKey);
    if (group) group.push(item);
    else groups.set(item.weekKey, [item]);
  }
  const orderedGroups = [...groups.entries()].sort((left, right) =>
    right[1].length - left[1].length
    || left[1][0].weekIndex - right[1][0].weekIndex);
  const collisionWidth = LONG_MON_COLLISION_WIDTH_PX * scale * LONG_MON_VISUAL_SCALE_MAX;
  const halfWidth = collisionWidth / 2;
  const xByIdentity = new Map<string, number>();

  for (const [, group] of orderedGroups) {
    const orderedFish = [...group].sort((left, right) =>
      left.deadline.localeCompare(right.deadline)
      || fishIdentity(left).localeCompare(fishIdentity(right), "vi"));
    const week = weeks[orderedFish[0].weekIndex];
    const weekCenterPx = (week.startPct + week.widthPct / 2) / 100 * sceneWidthPx;
    const weekWidthPx = week.widthPct / 100 * sceneWidthPx;
    const weekStartPx = week.startPct / 100 * sceneWidthPx;
    const weekEndPx = weekStartPx + weekWidthPx;
    const safeWeekStart = Math.max(halfWidth, weekStartPx + halfWidth);
    const safeWeekEnd = Math.min(sceneWidthPx - halfWidth, weekEndPx - halfWidth);
    const minColumnX = safeWeekStart <= safeWeekEnd
      ? safeWeekStart
      : clamp(weekCenterPx, halfWidth, sceneWidthPx - halfWidth);
    const maxColumnX = safeWeekStart <= safeWeekEnd ? safeWeekEnd : minColumnX;
    const maximumColumns = Math.max(
      1,
      Math.floor((maxColumnX - minColumnX) / (collisionWidth + 4)) + 1,
    );
    const columnCount = Math.min(orderedFish.length, maximumColumns);
    const columns = Array.from({ length: columnCount }, (_, columnIndex) =>
      columnCount === 1
        ? clamp(weekCenterPx, halfWidth, sceneWidthPx - halfWidth)
        : minColumnX + columnIndex / (columnCount - 1) * (maxColumnX - minColumnX));
    const columnOffset = stableHash(week.key) % columnCount;
    orderedFish.forEach((item, index) => {
      const baseX = columns[(index + columnOffset) % columnCount];
      const jitter = stableRange(item.activity, `${item.weekKey}:x-column`, -1.5, 1.5);
      xByIdentity.set(fishIdentity(item), clamp(baseX + jitter, minColumnX, maxColumnX));
    });
  }

  const positions = new Map<string, PlacementPoint>();
  const placedRects: PlacementRect[] = [];
  const placementOrder = orderedGroups.flatMap(([, group]) => [...group].sort((left, right) => {
    const leftX = xByIdentity.get(fishIdentity(left)) ?? 0;
    const rightX = xByIdentity.get(fishIdentity(right)) ?? 0;
    return leftX - rightX || fishIdentity(left).localeCompare(fishIdentity(right), "vi");
  }));

  for (const item of placementOrder) {
    const xPx = xByIdentity.get(fishIdentity(item))!;
    const yPx = teamYCandidates(item, xPx, sceneWidthPx, sceneHeightPx, scale)
      .find((candidateY) => !overlapsAny(rectAt(xPx, candidateY, scale), placedRects));
    if (yPx === undefined) return null;
    const phase = stableHash(item.weekKey) % 628 / 100;
    const flowHeading = Math.cos(xPx / sceneWidthPx * Math.PI * 3.1 + phase) * 6.5;
    const rotateDeg = clamp(
      flowHeading + stableRange(item.activity, "pose", -4.5, 4.5),
      -12,
      12,
    );
    positions.set(fishIdentity(item), {
      xPx,
      yPx,
      rotateDeg: Number(rotateDeg.toFixed(2)),
    });
    placedRects.push(rectAt(xPx, yPx, scale));
  }

  return { positions, densityScale: scale, sceneWidthPx, sceneHeightPx };
}

/* Thang CHIỀU CAO của hồ. Sự cố production 31/08: 126 cá dồn ba tuần
 * (80+18+28) trong cửa sổ dài làm cạn cả tám bậc mật độ ở hồ 560px —
 * model NÉM lỗi và cả màn Dòng thời gian trắng xoá. Giờ hết bậc mật độ
 * thì hồ SÂU THÊM một bậc rồi thử lại từ đầu; viewport chuyển sang cuộn
 * dọc khi hồ sâu hơn màn (long-mon-race.css). Bậc sâu nhất 2240px chứa
 * cỡ 500+ cá — vượt xa mọi kế hoạch VMP thực tế. */
const TEAM_HEIGHT_LEVELS = [
  LONG_MON_SCENE_HEIGHT_PX, 700, 860, 1060, 1300, 1600, 1920, 2240,
] as const;

function buildTeamPlacement(
  fish: readonly LongMonRaceFish[],
  weeks: readonly LongMonWeekBand[],
  sceneWidthPx = TEAM_CANVAS_WIDTH_PX,
): PlacementResult {
  for (const sceneHeightPx of TEAM_HEIGHT_LEVELS) {
    for (const scale of TEAM_DENSITY_LEVELS) {
      const placement = tryTeamPlacement(fish, weeks, scale, sceneWidthPx, sceneHeightPx);
      if (placement) return placement;
    }
  }
  /* KHẨN CẤP — không bao giờ ném vì đông cá (chốt 31/08 sau sự cố
   * production làm trắng màn): xếp lưới cứng theo tuần, hàng nối hàng,
   * hồ sâu đúng bằng số hàng cần. Mất chất thơ của dòng chảy nhưng mọi
   * con cá vẫn đúng tuần, đúng thứ tự hạn, và TRANG LUÔN SỐNG. */
  return emergencyGridPlacement(fish, weeks, sceneWidthPx);
}

function emergencyGridPlacement(
  fish: readonly LongMonRaceFish[],
  weeks: readonly LongMonWeekBand[],
  sceneWidthPx: number,
): PlacementResult {
  const scale = TEAM_DENSITY_LEVELS[TEAM_DENSITY_LEVELS.length - 1];
  const cellW = LONG_MON_COLLISION_WIDTH_PX * scale * LONG_MON_VISUAL_SCALE_MAX + 4;
  const cellH = LONG_MON_COLLISION_HEIGHT_PX * scale * LONG_MON_VISUAL_SCALE_MAX + 6;
  const positions = new Map<string, PlacementPoint>();
  let maxRows = 1;
  for (const week of weeks) {
    const inWeek = fish
      .filter((item) => item.weekKey === week.key)
      .sort((a, b) => a.deadline.localeCompare(b.deadline)
        || fishIdentity(a).localeCompare(fishIdentity(b), "vi"));
    if (!inWeek.length) continue;
    const startPx = week.startPct / 100 * sceneWidthPx + cellW / 2;
    const endPx = (week.startPct + week.widthPct) / 100 * sceneWidthPx - cellW / 2;
    const cols = Math.max(1, Math.floor((endPx - startPx) / cellW) + 1);
    inWeek.forEach((item, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      maxRows = Math.max(maxRows, row + 1);
      positions.set(fishIdentity(item), {
        xPx: clamp(startPx + col * cellW, cellW / 2, sceneWidthPx - cellW / 2),
        yPx: cellH * (row + 1),
        rotateDeg: 0,
      });
    });
  }
  const sceneHeightPx = Math.max(LONG_MON_SCENE_HEIGHT_PX, Math.ceil(cellH * (maxRows + 1.5)));
  return { positions, densityScale: scale, sceneWidthPx, sceneHeightPx };
}

function personalPreferredY(index: number, count: number, activity: Activity): number {
  if (count === 1) return LONG_MON_SCENE_HEIGHT_PX * .5;
  const progress = index / (count - 1);
  if (count <= 4) {
    const centered = progress * 2 - 1;
    return LONG_MON_SCENE_HEIGHT_PX * (.42 + centered * centered * .21);
  }
  return LONG_MON_SCENE_HEIGHT_PX * (
    .5
    + Math.sin(progress * Math.PI * 2 - Math.PI / 2) * .27
    + (stableUnit(activity, "personal-row") - .5) * .025
  );
}

function personalYCandidates(
  preferredY: number,
  scale: number,
  activity: Activity,
): number[] {
  const halfHeight = LONG_MON_COLLISION_HEIGHT_PX * scale / 2;
  const minY = halfHeight;
  const maxY = LONG_MON_SCENE_HEIGHT_PX - halfHeight;
  const step = LONG_MON_COLLISION_HEIGHT_PX * scale + 8;
  const candidates = [clamp(preferredY, minY, maxY)];
  for (let distance = 1; distance <= 6; distance += 1) {
    const signFirst = stableHash(`${activity.id}:personal-sign:${distance}`) % 2 === 0 ? -1 : 1;
    candidates.push(clamp(preferredY + signFirst * distance * step, minY, maxY));
    candidates.push(clamp(preferredY - signFirst * distance * step, minY, maxY));
  }
  for (let row = 0; row < 9; row += 1) {
    candidates.push(minY + row / 8 * (maxY - minY));
  }
  return [...new Set(candidates.map((value) => Number(value.toFixed(4))))]
    .sort((left, right) => Math.abs(left - preferredY) - Math.abs(right - preferredY));
}

function tryPersonalPlacement(
  fish: readonly LongMonRaceFish[],
  weeks: readonly LongMonWeekBand[],
  scale: number,
): Map<string, PlacementPoint> | null {
  const base = tryTeamPlacement(fish, weeks, scale, MIN_CANVAS_WIDTH_PX);
  if (!base) return null;
  const ordered = [...fish].sort((left, right) =>
    left.deadline.localeCompare(right.deadline)
    || fishIdentity(left).localeCompare(fishIdentity(right), "vi"));
  const positions = new Map<string, PlacementPoint>();
  const placedRects: PlacementRect[] = [];

  ordered.forEach((item, index) => {
    const basePoint = base.positions.get(fishIdentity(item));
    if (!basePoint) return;
    const preferredY = personalPreferredY(index, ordered.length, item.activity);
    const yPx = personalYCandidates(preferredY, scale, item.activity).find((candidateY) =>
      !overlapsAny(rectAt(basePoint.xPx, candidateY, scale), placedRects));
    if (yPx === undefined) return;
    const point = {
      xPx: basePoint.xPx,
      yPx,
      rotateDeg: Number((basePoint.rotateDeg + stableRange(item.activity, "personal-pose", -.8, .8)).toFixed(2)),
    };
    positions.set(fishIdentity(item), point);
    placedRects.push(rectAt(point.xPx, point.yPx, scale));
  });

  return positions.size === fish.length ? positions : null;
}

function buildPersonalPlacement(
  fish: readonly LongMonRaceFish[],
  weeks: readonly LongMonWeekBand[],
): PlacementResult {
  if (fish.length > 12) return buildTeamPlacement(fish, weeks, MIN_CANVAS_WIDTH_PX);
  const preferredScale = fish.length <= 4 ? 1.06 : 1.02;
  for (const scale of [preferredScale, 1, .91, .82]) {
    const positions = tryPersonalPlacement(fish, weeks, scale);
    if (positions) return {
      positions,
      densityScale: scale,
      sceneWidthPx: MIN_CANVAS_WIDTH_PX,
      sceneHeightPx: LONG_MON_SCENE_HEIGHT_PX,
    };
  }
  const fallback = buildTeamPlacement(fish, weeks, MIN_CANVAS_WIDTH_PX);
  const reflected = new Map(
    [...fallback.positions].map(([identity, point]) => [identity, {
      ...point,
      yPx: fallback.sceneHeightPx - point.yPx,
    }]),
  );
  return {
    positions: reflected,
    densityScale: fallback.densityScale,
    sceneWidthPx: MIN_CANVAS_WIDTH_PX,
    sceneHeightPx: fallback.sceneHeightPx,
  };
}

function applyPlacement(
  fish: LongMonRaceFish[],
  weeks: readonly LongMonWeekBand[],
  audience: "team" | "personal",
): { laneCount: number; densityScale: number; sceneWidthPx: number; sceneHeightPx: number } {
  const weekCounts = new Map<string, number>();
  for (const item of fish) weekCounts.set(item.weekKey, (weekCounts.get(item.weekKey) ?? 0) + 1);
  const placement = audience === "personal"
    ? buildPersonalPlacement(fish, weeks)
    : buildTeamPlacement(fish, weeks);

  for (const item of fish) {
    const point = placement.positions.get(fishIdentity(item));
    if (!point) continue;
    item.xPct = point.xPx / placement.sceneWidthPx * 100;
    item.yPct = point.yPx / placement.sceneHeightPx * 100;
    item.yPx = point.yPx;
    item.lane = Math.max(0, Math.round(point.yPx / LONG_MON_COLLISION_HEIGHT_PX));
    item.renderOffsetXPx = 0;
    item.renderOffsetYPx = 0;
    item.renderScale = Number((
      placement.densityScale * stableRange(item.activity, "school-scale", .88, LONG_MON_VISUAL_SCALE_MAX)
    ).toFixed(3));
    item.renderRotateDeg = point.rotateDeg;
    item.schoolRow = item.lane;
    item.schoolSize = weekCounts.get(item.weekKey) ?? 1;
  }

  return {
    laneCount: 1,
    densityScale: placement.densityScale,
    sceneWidthPx: placement.sceneWidthPx,
    sceneHeightPx: placement.sceneHeightPx,
  };
}

export function buildLongMonRaceModel(
  activities: readonly Activity[],
  now: Date,
  options: LongMonRaceLayoutOptions = {},
): LongMonRaceModel {
  const { start, endExclusive, today } = rangeAround(now);
  const baseWeeks = weekBands(start, endExclusive);
  const weekIndexByKey = new Map(baseWeeks.map((week) => [week.key, week.index]));
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
      weekLabel: baseWeeks[weekIndex].label,
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

  const weekCounts = new Map<string, number>();
  for (const fish of candidates) {
    weekCounts.set(fish.weekKey, (weekCounts.get(fish.weekKey) ?? 0) + 1);
  }
  const weeks = weightedWeekBands(baseWeeks, weekCounts, start, today, endExclusive);

  const { laneCount, densityScale, sceneWidthPx, sceneHeightPx } = applyPlacement(
    candidates,
    weeks,
    options.audience ?? "team",
  );

  const stageCounts = emptyStageCounts();
  for (const fish of candidates) stageCounts[fish.stage] += 1;

  return {
    periods: [
      { id: "past", label: "30 ngày đã qua", startPct: 0, widthPct: 50 },
      { id: "future", label: "30 ngày sắp tới", startPct: 50, widthPct: 50 },
    ],
    bands: monthBands(start, endExclusive, weeks),
    weeks,
    fish: candidates,
    laneCount,
    densityScale,
    sceneWidthPx,
    sceneHeightPx,
    todayPct: 50,
    missingDeadlineCount,
    stageCounts,
  };
}

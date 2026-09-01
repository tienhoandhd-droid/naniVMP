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

export type LongMonSchoolFormation =
  | "solo"
  | "arc"
  | "double-stream"
  | "teardrop"
  | "branches";

export type LongMonMotionProfile =
  | "glide"
  | "rise"
  | "s-curve"
  | "stream-tilt"
  | "follow"
  | "tail-drift";

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
  deadlinePct: number;
  renderXPct: number;
  renderYPct: number;
  ownerStartPct: number;
  ownerEndPct: number;
  schoolFormation: LongMonSchoolFormation;
  schoolIndex: number;
  motionProfile: LongMonMotionProfile;
  /** Alias trình bày cũ; bằng renderXPct để các consumer chuyển dần. */
  xPct: number;
  /** Alias trình bày cũ; bằng renderYPct để các consumer chuyển dần. */
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
const LONG_MON_HIT_TARGET_WIDTH_PX = 44;
const LONG_MON_HIT_TARGET_HEIGHT_PX = 44;
const TEAM_DENSITY_LEVELS = [1, .91, .82, .74, .66, .58, .5, .44] as const;
const MOTION_ENVELOPE_X_PX = 4;
const MOTION_ENVELOPE_Y_PX = 5;
const COLLISION_SAFETY_GAP_PX = .5;
const MOTION_PROFILES: readonly LongMonMotionProfile[] = [
  "glide", "rise", "s-curve", "stream-tilt", "follow", "tail-drift",
];

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

function percentInWindow(time: number, start: number, endExclusive: number): number {
  return clamp((time - start) / (endExclusive - start) * 100, 0, 100);
}

function monthBands(
  start: number,
  endExclusive: number,
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
    const startPct = percentInWindow(Math.max(start, monthStart), start, endExclusive);
    const endPct = percentInWindow(Math.min(endExclusive, monthEnd), start, endExclusive);
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

function formationOf(count: number): LongMonSchoolFormation {
  if (count === 1) return "solo";
  if (count <= 5) return "arc";
  if (count <= 12) return "double-stream";
  if (count <= 30) return "teardrop";
  return "branches";
}

function ownerHalfSpanPct(count: number): number {
  if (count === 1) return 2;
  if (count <= 5) return 5;
  if (count <= 12) return 7.5;
  if (count <= 30) return 10;
  if (count <= 60) return 14;
  return 26;
}

function groupByDeadline(fish: readonly LongMonRaceFish[]): Map<string, LongMonRaceFish[]> {
  const groups = new Map<string, LongMonRaceFish[]>();
  for (const item of fish) {
    const group = groups.get(item.deadline);
    if (group) group.push(item);
    else groups.set(item.deadline, [item]);
  }
  return groups;
}

function prepareDeadlineSchools(fish: LongMonRaceFish[]): void {
  const groups = groupByDeadline(fish);
  const deadlines = [...groups.keys()].sort((left, right) => left.localeCompare(right));
  deadlines.forEach((deadline, deadlineIndex) => {
    const group = [...(groups.get(deadline) ?? [])].sort((left, right) =>
      String(left.activity.code || left.activity.id).localeCompare(
        String(right.activity.code || right.activity.id),
        "vi",
      ) || fishIdentity(left).localeCompare(fishIdentity(right), "vi"));
    if (!group.length) return;
    const deadlinePct = group[0].deadlinePct;
    const previous = deadlineIndex > 0 ? groups.get(deadlines[deadlineIndex - 1])?.[0] : undefined;
    const next = deadlineIndex < deadlines.length - 1
      ? groups.get(deadlines[deadlineIndex + 1])?.[0]
      : undefined;
    const halfSpanPct = ownerHalfSpanPct(group.length);
    const midpointStart = previous ? (previous.deadlinePct + deadlinePct) / 2 : 0;
    const midpointEnd = next ? (deadlinePct + next.deadlinePct) / 2 : 100;
    const ownerStartPct = Math.max(midpointStart, deadlinePct - halfSpanPct);
    const ownerEndPct = Math.min(midpointEnd, deadlinePct + halfSpanPct);
    const schoolFormation = formationOf(group.length);
    group.forEach((item, schoolIndex) => {
      item.ownerStartPct = ownerStartPct;
      item.ownerEndPct = ownerEndPct;
      item.schoolFormation = schoolFormation;
      item.schoolIndex = schoolIndex;
      item.schoolSize = group.length;
      item.motionProfile = MOTION_PROFILES[
        stableHash(`${deadline}:${fishIdentity(item)}:motion`) % MOTION_PROFILES.length
      ];
    });
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

function reservedSize(scale: number): { width: number; height: number } {
  const reservedScale = scale * LONG_MON_VISUAL_SCALE_MAX;
  return {
    width: Math.max(
      LONG_MON_HIT_TARGET_WIDTH_PX,
      LONG_MON_COLLISION_WIDTH_PX * reservedScale + MOTION_ENVELOPE_X_PX * 2,
    ) + COLLISION_SAFETY_GAP_PX,
    height: Math.max(
      LONG_MON_HIT_TARGET_HEIGHT_PX,
      LONG_MON_COLLISION_HEIGHT_PX * reservedScale + MOTION_ENVELOPE_Y_PX * 2,
    ) + COLLISION_SAFETY_GAP_PX,
  };
}

function safeAxisXPx(percent: number, sceneWidthPx: number, scale: number): number {
  const halfWidth = reservedSize(scale).width / 2;
  return halfWidth + percent / 100 * Math.max(0, sceneWidthPx - halfWidth * 2);
}

function rectAt(xPx: number, yPx: number, scale: number): PlacementRect {
  const size = reservedSize(scale);
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
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

function formationPreferredPoint(
  item: LongMonRaceFish,
  sceneWidthPx: number,
  sceneHeightPx: number,
  scale: number,
): { xPx: number; yPx: number } {
  const size = reservedSize(scale);
  const halfHeight = size.height / 2;
  const ownerStartPx = safeAxisXPx(item.ownerStartPct, sceneWidthPx, scale);
  const ownerEndPx = safeAxisXPx(item.ownerEndPct, sceneWidthPx, scale);
  const minX = ownerStartPx;
  const maxX = ownerEndPx;
  const anchorX = safeAxisXPx(item.deadlinePct, sceneWidthPx, scale);
  const minY = halfHeight;
  const maxY = sceneHeightPx - halfHeight;
  const count = item.schoolSize;
  const index = item.schoolIndex;
  const progress = count <= 1 ? .5 : index / (count - 1);
  const centered = progress * 2 - 1;
  const ownerSpan = Math.max(0, maxX - minX);
  const phase = stableHash(item.deadline) % 628 / 100;
  let xPx = clamp(anchorX, minX, maxX);
  let yUnit = .5;

  switch (item.schoolFormation) {
    case "solo":
      yUnit = .5 + Math.sin(phase) * .12;
      break;
    case "arc":
      xPx = clamp(anchorX + centered * ownerSpan * .42, minX, maxX);
      yUnit = .39 + centered * centered * .25;
      break;
    case "double-stream": {
      const stream = index % 2;
      const rowCount = Math.ceil(count / 2);
      const row = Math.floor(index / 2);
      const rowProgress = rowCount <= 1 ? .5 : row / (rowCount - 1);
      xPx = minX + ownerSpan * clamp(.16 + rowProgress * .68 + (stream ? .025 : -.025), 0, 1);
      yUnit = .35 + stream * .3 + Math.sin(rowProgress * Math.PI * 2 + phase) * .07;
      break;
    }
    case "teardrop": {
      const branch = index % 2 === 0 ? -1 : 1;
      const rowCount = Math.ceil(count / 2);
      const row = Math.floor(index / 2);
      const rowProgress = rowCount <= 1 ? .5 : row / (rowCount - 1);
      const spread = Math.sin(rowProgress * Math.PI);
      xPx = minX + ownerSpan * clamp(.16 + rowProgress * .68 + branch * spread * .035, 0, 1);
      yUnit = .5 + branch * spread * .3;
      break;
    }
    case "branches": {
      const branchCount = count > 48 ? 5 : 4;
      const branch = index % branchCount;
      const rowCount = Math.ceil(count / branchCount);
      const row = Math.floor(index / branchCount);
      const rowProgress = rowCount <= 1 ? .5 : row / (rowCount - 1);
      const branchCenter = branch - (branchCount - 1) / 2;
      xPx = minX + ownerSpan * clamp(.14 + rowProgress * .72 + branchCenter * .018, 0, 1);
      yUnit = .5 + branchCenter * .155 + Math.sin(rowProgress * Math.PI * 2 + phase) * .045;
      break;
    }
  }

  return {
    xPx: clamp(xPx, minX, maxX),
    yPx: clamp(yUnit * sceneHeightPx, minY, maxY),
  };
}

function xCandidates(
  item: LongMonRaceFish,
  preferredX: number,
  sceneWidthPx: number,
  scale: number,
): number[] {
  const ownerStartPx = safeAxisXPx(item.ownerStartPct, sceneWidthPx, scale);
  const ownerEndPx = safeAxisXPx(item.ownerEndPct, sceneWidthPx, scale);
  const minX = ownerStartPx;
  const maxX = ownerEndPx;
  const candidates = [clamp(preferredX, minX, maxX)];
  const bandCount = Math.max(3, Math.min(17, item.schoolSize));
  const offset = stableHash(`${fishIdentity(item)}:x-band`) % bandCount;
  for (let band = 0; band < bandCount; band += 1) {
    const bandIndex = (band + offset) % bandCount;
    candidates.push(minX + bandIndex / Math.max(1, bandCount - 1) * (maxX - minX));
  }
  return [...new Set(candidates.map((value) => Number(value.toFixed(4))))];
}

function yCandidates(
  item: LongMonRaceFish,
  preferredY: number,
  sceneHeightPx: number,
  scale: number,
): number[] {
  const size = reservedSize(scale);
  const halfHeight = size.height / 2;
  const artInset = item.schoolSize > 30
    ? Math.min(42, sceneHeightPx * .075)
    : Math.min(84, sceneHeightPx * .15);
  const minY = Math.max(halfHeight, artInset);
  const maxY = Math.min(sceneHeightPx - halfHeight, sceneHeightPx - artInset);
  const step = size.height + 10;
  const candidates = [clamp(preferredY, minY, maxY)];

  for (let distance = 1; distance <= 8; distance += 1) {
    const signFirst = stableHash(`${fishIdentity(item)}:team-y:${distance}`) % 2 === 0 ? -1 : 1;
    const first = preferredY + signFirst * distance * step;
    const second = preferredY - signFirst * distance * step;
    if (first >= minY && first <= maxY) candidates.push(first);
    if (second >= minY && second <= maxY) candidates.push(second);
  }

  const bandCount = Math.max(21, Math.floor((maxY - minY) / (size.height + 1)) + 1);
  const bandOffset = stableHash(`${fishIdentity(item)}:team-band`) % bandCount;
  const bands = Array.from({ length: bandCount }, (_, bandIndex) => ({
    bandIndex,
    y: minY + bandIndex / Math.max(1, bandCount - 1) * (maxY - minY),
  })).sort((left, right) =>
    Math.abs(left.y - preferredY) - Math.abs(right.y - preferredY)
    || (left.bandIndex + bandOffset) % bandCount - (right.bandIndex + bandOffset) % bandCount);
  for (const band of bands) candidates.push(band.y);

  return [...new Set(candidates.map((value) => Number(value.toFixed(4))))];
}

function tryTeamPlacement(
  fish: readonly LongMonRaceFish[],
  scale: number,
  sceneWidthPx: number,
  sceneHeightPx: number = LONG_MON_SCENE_HEIGHT_PX,
): PlacementResult | null {
  const groups = new Map<string, LongMonRaceFish[]>();
  for (const item of fish) {
    const group = groups.get(item.deadline);
    if (group) group.push(item);
    else groups.set(item.deadline, [item]);
  }
  const orderedGroups = [...groups.entries()].sort((left, right) =>
    right[1].length - left[1].length
    || left[0].localeCompare(right[0]));

  const positions = new Map<string, PlacementPoint>();
  const placedRects: PlacementRect[] = [];
  const placementOrder = orderedGroups.flatMap(([, group]) =>
    [...group].sort((left, right) => left.schoolIndex - right.schoolIndex));

  for (const item of placementOrder) {
    const preferred = formationPreferredPoint(item, sceneWidthPx, sceneHeightPx, scale);
    let selected: { xPx: number; yPx: number } | undefined;
    for (const candidateX of xCandidates(item, preferred.xPx, sceneWidthPx, scale)) {
      const candidateY = yCandidates(item, preferred.yPx, sceneHeightPx, scale)
        .find((value) => !overlapsAny(rectAt(candidateX, value, scale), placedRects));
      if (candidateY !== undefined) {
        selected = { xPx: candidateX, yPx: candidateY };
        break;
      }
    }
    if (!selected) return null;
    const phase = stableHash(item.deadline) % 628 / 100;
    const { xPx, yPx } = selected;
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
  sceneWidthPx = TEAM_CANVAS_WIDTH_PX,
): PlacementResult {
  for (const sceneHeightPx of TEAM_HEIGHT_LEVELS) {
    for (const scale of TEAM_DENSITY_LEVELS) {
      const placement = tryTeamPlacement(fish, scale, sceneWidthPx, sceneHeightPx);
      if (placement) return placement;
    }
  }
  /* KHẨN CẤP — không bao giờ ném vì đông cá (chốt 31/08 sau sự cố
   * production làm trắng màn): xếp lưới cứng theo tuần, hàng nối hàng,
   * hồ sâu đúng bằng số hàng cần. Mất chất thơ của dòng chảy nhưng mọi
   * con cá vẫn đúng tuần, đúng thứ tự hạn, và TRANG LUÔN SỐNG. */
  return emergencyGridPlacement(fish, sceneWidthPx);
}

function emergencyGridPlacement(
  fish: readonly LongMonRaceFish[],
  sceneWidthPx: number,
): PlacementResult {
  const scale = TEAM_DENSITY_LEVELS[TEAM_DENSITY_LEVELS.length - 1];
  const size = reservedSize(scale);
  const sceneHeightPx = TEAM_HEIGHT_LEVELS[TEAM_HEIGHT_LEVELS.length - 1];
  const rowStep = size.height + .25;
  const rowCount = Math.max(1, Math.floor((sceneHeightPx - size.height) / rowStep) + 1);
  const rowY = Array.from({ length: rowCount }, (_, row) =>
    size.height / 2 + row * rowStep);
  const positions = new Map<string, PlacementPoint>();
  const placedRects: PlacementRect[] = [];
  const groups = [...groupByDeadline(fish).entries()].sort((left, right) => {
    const leftWidth = left[1][0].ownerEndPct - left[1][0].ownerStartPct;
    const rightWidth = right[1][0].ownerEndPct - right[1][0].ownerStartPct;
    return leftWidth - rightWidth
      || right[1].length - left[1].length
      || left[0].localeCompare(right[0]);
  });

  for (const [, group] of groups) {
    const ordered = [...group].sort((a, b) => a.schoolIndex - b.schoolIndex);
    const minX = safeAxisXPx(ordered[0].ownerStartPct, sceneWidthPx, scale);
    const maxX = safeAxisXPx(ordered[0].ownerEndPct, sceneWidthPx, scale);
    const slotCount = maxX - minX < 1
      ? 1
      : Math.min(21, Math.ceil((maxX - minX) / 4) + 1);
    const xSlots = Array.from({ length: slotCount }, (_, slot) =>
      slotCount === 1 ? minX : minX + slot / (slotCount - 1) * (maxX - minX));

    for (const item of ordered) {
      const rowOffset = stableHash(`${fishIdentity(item)}:emergency-row`) % rowCount;
      const candidates = xSlots.map((xPx) => {
        const freeRows = rowY.filter((yPx) =>
          !overlapsAny(rectAt(xPx, yPx, scale), placedRects));
        return { xPx, freeRows };
      }).sort((left, right) =>
        right.freeRows.length - left.freeRows.length
        || Math.abs(left.xPx - item.deadlinePct / 100 * sceneWidthPx)
          - Math.abs(right.xPx - item.deadlinePct / 100 * sceneWidthPx));
      const column = candidates.find((candidate) => candidate.freeRows.length > 0);
      if (!column) continue;
      const yPx = column.freeRows[rowOffset % column.freeRows.length];
      positions.set(fishIdentity(item), {
        xPx: column.xPx,
        yPx,
        rotateDeg: 0,
      });
      placedRects.push(rectAt(column.xPx, yPx, scale));
    }
  }

  /* Siêu dữ liệu bất thường vượt cả lưới 2240px: vẫn trả đủ cá theo một
     cột nối tiếp để trang không trắng. Gate mật độ thực tế phải giữ nhánh
     này không được chạm tới. */
  if (positions.size < fish.length) {
    let overflowRow = rowCount;
    for (const item of fish) {
      if (positions.has(fishIdentity(item))) continue;
      const xPx = clamp(
        safeAxisXPx(item.deadlinePct, sceneWidthPx, scale),
        size.width / 2,
        sceneWidthPx - size.width / 2,
      );
      positions.set(fishIdentity(item), {
        xPx,
        yPx: size.height / 2 + overflowRow * size.height,
        rotateDeg: 0,
      });
      overflowRow += 1;
    }
    return {
      positions,
      densityScale: scale,
      sceneWidthPx,
      sceneHeightPx: Math.ceil(size.height * overflowRow),
    };
  }
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
  const size = reservedSize(scale);
  const halfHeight = size.height / 2;
  const minY = halfHeight;
  const maxY = LONG_MON_SCENE_HEIGHT_PX - halfHeight;
  const step = size.height + 8;
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
  scale: number,
): Map<string, PlacementPoint> | null {
  const base = tryTeamPlacement(fish, scale, MIN_CANVAS_WIDTH_PX);
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
): PlacementResult {
  if (fish.length > 12) return buildTeamPlacement(fish, MIN_CANVAS_WIDTH_PX);
  const preferredScale = fish.length <= 4 ? 1.06 : 1.02;
  for (const scale of [preferredScale, 1, .91, .82]) {
    const positions = tryPersonalPlacement(fish, scale);
    if (positions) return {
      positions,
      densityScale: scale,
      sceneWidthPx: MIN_CANVAS_WIDTH_PX,
      sceneHeightPx: LONG_MON_SCENE_HEIGHT_PX,
    };
  }
  const fallback = buildTeamPlacement(fish, MIN_CANVAS_WIDTH_PX);
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
  audience: "team" | "personal",
): { laneCount: number; densityScale: number; sceneWidthPx: number; sceneHeightPx: number } {
  const placement = audience === "personal"
    ? buildPersonalPlacement(fish)
    : buildTeamPlacement(fish);

  for (const item of fish) {
    const point = placement.positions.get(fishIdentity(item));
    if (!point) continue;
    const ownerStartPct = safeAxisXPx(
      item.ownerStartPct,
      placement.sceneWidthPx,
      placement.densityScale,
    ) / placement.sceneWidthPx * 100;
    const ownerEndPct = safeAxisXPx(
      item.ownerEndPct,
      placement.sceneWidthPx,
      placement.densityScale,
    ) / placement.sceneWidthPx * 100;
    item.renderXPct = clamp(
      point.xPx / placement.sceneWidthPx * 100,
      ownerStartPct,
      ownerEndPct,
    );
    item.ownerStartPct = ownerStartPct;
    item.ownerEndPct = ownerEndPct;
    item.renderYPct = point.yPx / placement.sceneHeightPx * 100;
    item.xPct = item.renderXPct;
    item.yPct = item.renderYPct;
    item.yPx = point.yPx;
    item.lane = Math.max(0, Math.round(point.yPx / LONG_MON_COLLISION_HEIGHT_PX));
    item.renderOffsetXPx = 0;
    item.renderOffsetYPx = 0;
    item.renderScale = Number((
      placement.densityScale * stableRange(item.activity, "school-scale", .88, LONG_MON_VISUAL_SCALE_MAX)
    ).toFixed(3));
    item.renderRotateDeg = point.rotateDeg;
    item.schoolRow = item.lane;
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
  const { start, endExclusive } = rangeAround(now);
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
      deadlinePct: percentInWindow(time, start, endExclusive),
      renderXPct: 0,
      renderYPct: 0,
      ownerStartPct: 0,
      ownerEndPct: 100,
      schoolFormation: "solo",
      schoolIndex: 0,
      motionProfile: "glide",
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

  prepareDeadlineSchools(candidates);
  const weeks = baseWeeks;

  const { laneCount, densityScale, sceneWidthPx, sceneHeightPx } = applyPlacement(
    candidates,
    options.audience ?? "team",
  );

  const stageCounts = emptyStageCounts();
  for (const fish of candidates) stageCounts[fish.stage] += 1;

  return {
    periods: [
      { id: "past", label: "30 ngày đã qua", startPct: 0, widthPct: 50 },
      { id: "future", label: "30 ngày sắp tới", startPct: 50, widthPct: 50 },
    ],
    bands: monthBands(start, endExclusive),
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

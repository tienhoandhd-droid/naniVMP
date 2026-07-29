/* TimelinePage.jsx — Modern Gantt Timeline VMP */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  GanttChartSquare,
  LayoutGrid,
  Network,
  Search,
  Table2,
} from "lucide-react";
import { C, TEXT, NUM, GRAD } from "../constants/theme.ts";
import { CLS, DEPTS, CRIT, MONTHS, PHASE_COLOR, SOON_DAYS, vmpToday, PROG } from "../constants/vmp.ts";
import { parseD, fmtVN, milestones, phaseStates, addDays, clamp, wlIsDone } from "../utils/helpers.ts";
import { useDebounce } from "../hooks/index.ts";
import { Card, Tag, Modal, Pill, phaseTag } from "../components/ui/Primitives.tsx";
import { buildVisualModel } from "../lib/visualModel.ts";
import { DiagramPanel, DashboardPanel, TablePanel } from "./VisualExplorerPage.tsx";
import type { ReactNode } from "react";
import type { Activity, Milestones, VmpObject } from "../types/domain.ts";

// Các "không gian làm việc" gộp chung dưới menu Timeline VMP: timeline sâu +
// 3 góc nhìn phân tích (sơ đồ luồng, bố cục dashboard, bảng dữ liệu).
const WORKSPACES = [
  { id: "overview", label: "Tổng quan", icon: BarChart3 },
  { id: "timeline", label: "Timeline", icon: GanttChartSquare },
  { id: "diagram", label: "Sơ đồ", icon: Network },
  { id: "dashboard", label: "Bố cục", icon: LayoutGrid },
  { id: "table", label: "Bảng", icon: Table2 },
];

const DAY_MS = 86400000;
const MONTH_NAMES = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

const VIEW_LABELS = {
  month: "Tháng",
  quarter: "Quý",
  year: "Năm",
};

const SCOPE_LABELS = {
  period: "Trong kỳ",
  year: "Tất cả năm",
};

const DENSITY_LABELS = {
  compact: "Gọn",
  comfortable: "Đầy đủ",
};

const CHART_LABELS = {
  table: "Bảng ngày tổng hợp",
  stage: "Sơ đồ 3 mốc",
  hybrid: "Sơ đồ + Gantt",
};

const TABLE_STAGE_LABELS = {
  all: "Tổng hợp",
  protocol: "Đề cương",
  validation: "Thẩm định thực tế",
  vmp: "Hoàn thành VMP",
};

const TABLE_STAGE_SHORT_LABELS = {
  all: "Tổng hợp",
  protocol: "Đề cương",
  validation: "Thẩm định",
  vmp: "VMP",
};

const PHASES = [
  { key: "p", id: "protocol", label: "Đề cương", short: "ĐC", from: "protocol", to: "validation" },
  { key: "v", id: "validation", label: "Thẩm định thực tế", short: "TT", from: "validation", to: "report" },
  { key: "r", id: "report", label: "Báo cáo", short: "BC", from: "report", to: "target" },
];

const MAP_STAGES = [
  { id: "protocol", label: "Đề cương", short: "ĐC", field: "tt_de_cuong", actual: "ngay_de_cuong", due: "protocol" },
  { id: "validation", label: "Thẩm định thực tế", short: "TT", field: "tt_tham_dinh", actual: "ngay_tham_dinh", due: "validation" },
  { id: "vmp", label: "Hoàn thành VMP", short: "VMP", field: "tt_vmp", actual: "ngay_vmp", due: "target" },
];

const MILESTONES = [
  { id: "protocol", label: "Hạn đề cương", short: "ĐC", color: C.sky },
  { id: "validation", label: "Hạn thẩm định thực tế", short: "TT", color: C.marigold },
  { id: "report", label: "Hạn báo cáo", short: "BC", color: C.pink },
  { id: "target", label: "Đích VMP", short: "VMP", color: C.lav },
];

/** Khoảng thời gian đang hiển thị trên trục timeline. */
export interface TimeRange {
  view: string;
  year: number;
  start: Date;
  end: Date;
  title: string;
  kicker: string;
  /** Số ngày (bao gồm cả hai đầu) của khoảng. */
  days: number;
  bands: Array<{ label: string; start: Date; end: Date; [k: string]: unknown }>;
  [k: string]: unknown;
}

function startOfDay(d: Date | null | undefined): Date | null {
  if (!d) return null;
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function maxDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function minDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function safeDate(d: Date | null | undefined, fallback: Date): Date {
  return d && !isNaN(d.getTime()) ? d : fallback;
}

function daysInclusive(start: Date, end: Date): number {
  return Math.max(1, Math.round(
    ((startOfDay(end)?.getTime() ?? 0) - (startOfDay(start)?.getTime() ?? 0)) / DAY_MS) + 1);
}

function pctInRange(date: Date | null | undefined, range: TimeRange): number {
  if (!date) return 0;
  const d = startOfDay(date)!.getTime();
  const start = startOfDay(range.start)!.getTime();
  const endExclusive = addDays(startOfDay(range.end)!, 1).getTime();
  return clamp(((d - start) / Math.max(DAY_MS, endExclusive - start)) * 100, 0, 100);
}

function inRange(date: Date | null | undefined, range: { start: Date; end: Date }): boolean {
  if (!date) return false;
  const d = startOfDay(date)!;
  return d >= startOfDay(range.start)! && d <= startOfDay(range.end)!;
}

function intersectsRange(
  start: Date | null | undefined,
  end: Date | null | undefined,
  range: { start: Date; end: Date },
): boolean {
  if (!start || !end) return false;
  const s = startOfDay(start)!;
  const e = startOfDay(end)!;
  return e >= startOfDay(range.start)! && s <= startOfDay(range.end)!;
}

function chartWidthFor(view: string, density: string): number {
  const compact = density === "compact";
  if (view === "month") return compact ? 900 : 1040;
  if (view === "quarter") return compact ? 980 : 1120;
  return compact ? 1120 : 1320;
}

function rangeFor(view: string, focusMonth: number | null, year: number): TimeRange {
  const todayMonth = vmpToday().getMonth();
  const m: number = Number.isFinite(focusMonth) ? (focusMonth as number) : todayMonth;
  let start: Date;
  let end: Date;
  let title: string;
  let kicker: string;
  let bands: TimeRange["bands"] = [];

  if (view === "month") {
    start = new Date(year, m, 1);
    end = new Date(year, m + 1, 0);
    title = `${MONTH_NAMES[m]} / ${year}`;
    kicker = "Theo tuần trong tháng";

    let cursor = start;
    let week = 1;
    while (cursor <= end) {
      const next = minDate(addDays(cursor, 7), addDays(end, 1))!;
      bands.push({
        start: cursor,
        end: addDays(next, -1),
        label: `Tuần ${week}`,
        sub: `${fmtVN(cursor).slice(0, 5)}–${fmtVN(addDays(next, -1)).slice(0, 5)}`,
      });
      cursor = next;
      week += 1;
    }
  } else if (view === "quarter") {
    const qStart = Math.floor(m / 3) * 3;
    start = new Date(year, qStart, 1);
    end = new Date(year, qStart + 3, 0);
    title = `Quý ${Math.floor(qStart / 3) + 1} / ${year}`;
    kicker = "Theo tháng trong quý";

    bands = [0, 1, 2].map((i) => {
      const month = qStart + i;
      return {
        start: new Date(year, month, 1),
        end: new Date(year, month + 1, 0),
        label: MONTHS[month],
        sub: MONTH_NAMES[month],
      };
    });
  } else {
    start = new Date(year, 0, 1);
    end = new Date(year, 11, 31);
    title = `Năm ${year}`;
    kicker = "Theo tháng trong năm";

    bands = Array.from({ length: 12 }, (_, month) => ({
      start: new Date(year, month, 1),
      end: new Date(year, month + 1, 0),
      label: MONTHS[month],
      sub: MONTH_NAMES[month],
    }));
  }

  return { view, year, start, end, title, kicker, bands, days: daysInclusive(start, end) };
}

function taskWindow(a: Activity) {
  const m = a.m || milestones(a);
  const fallback = parseD(a.target) ?? vmpToday();
  const start = safeDate(m.protocol, fallback);
  const end = safeDate(m.target, fallback);
  return { m, start, end };
}

function phaseProgress(a: Activity): number {
  const r = (a._raw || {}) as Record<string, unknown>;
  if (a.st === "done" || wlIsDone(r.tt_vmp)) return 100;
  if (wlIsDone(r.tt_bao_cao)) return 82;
  if (wlIsDone(r.tt_tham_dinh)) return 58;
  if (wlIsDone(r.tt_de_cuong)) return 34;
  return (PROG as Record<string, number>)[a.st] || 8;
}

function issueLevel(a: Activity): string {
  const ps = phaseStates(a);
  const hasOverPhase = [ps.p, ps.v, ps.r].includes("over");
  if (a.st === "over" || hasOverPhase) return "over";
  if (a.st === "done") return "done";
  if (a.st === "prog") return "prog";
  return "todo";
}

function ownerOf(a: Activity): string {
  const raw = (a._raw || {}) as Record<string, unknown>;
  const values = [
    a.owner,
    raw.qa,
    raw.ns_khac,
    raw.secondary_owner,
    raw.owner_name,
    a.secondary_owner,
    a.owner_name,
  ];
  return values.map((v) => String(v == null ? "" : v).trim()).find((v) => v && v !== "—") || "—";
}



function ControlButton({ active, children, onClick, title }: {
  active?: boolean; children?: ReactNode; onClick?: () => void; title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        border: active ? "none" : `1.5px solid ${C.pinkSoft}`,
        background: active ? GRAD : "rgba(255,255,255,.88)",
        color: active ? "#fff" : C.plum,
        borderRadius: 999,
        padding: "9px 14px",
        cursor: "pointer",
        fontFamily: TEXT,
        fontSize: 12.5,
        fontWeight: 900,
        boxShadow: active ? "0 8px 18px rgba(142,111,208,.23)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function ScopeButton({ active, children, onClick, title }: {
  active?: boolean; children?: ReactNode; onClick?: () => void; title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`timeline-scope-btn ${active ? "timeline-scope-btn--active" : ""}`}
    >
      {children}
    </button>
  );
}

export function RangeStat({ label, value, tone = "plum", sub }: {
  label: ReactNode; value: ReactNode; tone?: string; sub?: ReactNode;
}) {
  const map = {
    plum: [C.plum, C.pinkMist],
    over: [C.raspText, C.raspSoft],
    done: [C.mintText, C.mintSoft],
    work: [C.lavText, C.lavSoft],
  };
  const [color, bg] = (map as Record<string, string[]>)[tone] || map.plum;
  return (
    <div style={{
      minWidth: 128,
      flex: "1 1 128px",
      borderRadius: 18,
      padding: "13px 14px",
      background: bg,
      border: "1px solid rgba(255,255,255,.7)",
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: .35, textTransform: "uppercase", color }}>{label}</div>
      <div className="tnum" style={{ fontFamily: NUM, fontSize: 27, lineHeight: 1.02, fontWeight: 900, color, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, fontWeight: 700, color: C.plumSoft, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function daysUntil(date: Date | null | undefined): number | null {
  if (!date) return null;
  return Math.round(
    ((startOfDay(date)?.getTime() ?? 0) - (startOfDay(vmpToday())?.getTime() ?? 0)) / DAY_MS);
}

function heatForDue(date: Date | null | undefined, done = false) {
  if (done) return "done";
  const left = daysUntil(date);
  if (left == null) return "steady";
  if (left < 0) return "over";
  if (left <= 7) return "urgent";
  if (left <= SOON_DAYS) return "soon";
  return "steady";
}

function heatText(step: {
  heat?: string; daysLeft?: number | null; due?: Date | null;
}): string {
  if (step.heat === "done") return "Đã hoàn tất";
  const left = step.daysLeft;
  if (left == null) return "Chưa có mốc hạn";
  if (left < 0) return `Trễ ${Math.abs(left)} ngày`;
  if (left === 0) return "Đến hạn hôm nay";
  return `Còn ${left} ngày`;
}

function targetTime(a: Activity): number {
  return (parseD(a.target) || new Date(2999, 0, 1)).getTime();
}

function compareByTarget(a: Activity, b: Activity): number {
  const diff = targetTime(a) - targetTime(b);
  if (diff) return diff;
  return String(a.code || a.id || "").localeCompare(String(b.code || b.id || ""), "vi");
}

function stageState(a: Activity, stage: (typeof MAP_STAGES)[number]) {
  const raw = (a._raw || {}) as Record<string, unknown>;
  const m = a.m || milestones(a);
  const done = stage.id === "vmp"
    ? (a.st === "done" || wlIsDone(raw.tt_vmp))
    : wlIsDone(raw[stage.field]);
  const due = (m as unknown as Record<string, Date | null>)[stage.due] || parseD(a.target);
  const actual = parseD(raw[stage.actual]);
  const heat = heatForDue(due, done);
  return {
    done,
    due,
    actual,
    heat,
    daysLeft: daysUntil(due),
    label: done ? "Xong" : heatText({ heat, daysLeft: daysUntil(due), due }),
  };
}

function activeMapStep(a: Activity) {
  const states = MAP_STAGES.map((stage: (typeof MAP_STAGES)[number]) => ({ stage, state: stageState(a, stage) }));
  const next = states.find((entry) => !entry.state.done);
  if (!next) {
    return { stage: MAP_STAGES[2], label: "Hoàn tất VMP" };
  }
  return { stage: next.stage, label: `Đang ở: ${next.stage.label}` };
}

function nextPendingMilestone(a: Activity) {
  for (const stage of MAP_STAGES) {
    const state = stageState(a, stage);
    if (!state.done) return { stage, state };
  }
  return null;
}

function compareByNextMilestone(a: Activity, b: Activity): number {
  const today = startOfDay(vmpToday())!.getTime();
  const aNext = nextPendingMilestone(a);
  const bNext = nextPendingMilestone(b);
  const aTime = aNext?.state.due?.getTime();
  const bTime = bNext?.state.due?.getTime();
  const bucket = (next: unknown, time?: number): number =>
    !next || !Number.isFinite(time) ? 2 : (time as number) >= today ? 0 : 1;
  const aBucket = bucket(aNext, aTime);
  const bBucket = bucket(bNext, bTime);
  if (aBucket !== bBucket) return aBucket - bBucket;
  if (aBucket === 0 && aTime !== bTime) return (aTime as number) - (bTime as number);
  if (aBucket === 1 && aTime !== bTime) return (bTime as number) - (aTime as number);
  return compareByTarget(a, b);
}

export function compareByStageMilestone(stageId: string) {
  const stage = MAP_STAGES.find((entry) => entry.id === stageId);
  if (!stage) return compareByNextMilestone;
  const today = startOfDay(vmpToday())!.getTime();
  return (a: Activity, b: Activity): number => {
    const aState = stageState(a, stage);
    const bState = stageState(b, stage);
    const aDate = aState.done && aState.actual ? aState.actual : aState.due;
    const bDate = bState.done && bState.actual ? bState.actual : bState.due;
    const aTime = aDate?.getTime();
    const bTime = bDate?.getTime();
    const bucket = (state: { done: boolean }, time?: number): number => {
      if (!Number.isFinite(time)) return 3;
      if (!state.done && (time as number) >= today) return 0;
      if (!state.done) return 1;
      return 2;
    };
    const aBucket = bucket(aState, aTime);
    const bBucket = bucket(bState, bTime);
    if (aBucket !== bBucket) return aBucket - bBucket;
    if (aBucket === 0 && aTime !== bTime) return (aTime as number) - (bTime as number);
    if (aTime !== bTime) return (bTime as number) - (aTime as number);
    return compareByTarget(a, b);
  };
}

/* Thứ tự hiển thị timeline theo yêu cầu vận hành:
 *  0 Quá hạn (quá hạn nhiều/lâu nhất lên trước) → 1 Tới hạn (gần hạn trước)
 *  → 2 Còn hạn/đang làm → 3 Đã hoàn thành (đẩy xuống cuối).
 * Trong cùng nhóm: sắp theo NGÀY của mốc kế tiếp (hoặc đích VMP), cũ→mới. */
function timelinePriority(a: Activity): number {
  if (issueLevel(a) === "done") return 3;
  const next = nextPendingMilestone(a);
  const left = next ? daysUntil(next.state.due) : null;
  // Quá hạn (nhóm 0): trạng thái tổng 'over' HOẶC mốc kế tiếp đã trễ ngày
  // (vd đề cương đã quá hạn) — luôn xếp trên các mục mới "sắp tới hạn".
  if (issueLevel(a) === "over" || (left != null && left < 0)) return 0;
  if (left != null && left <= SOON_DAYS) return 1; // tới hạn (0..SOON_DAYS ngày)
  return 2; // còn hạn / đang làm
}
function timelineRefTime(a: Activity): number {
  const next = nextPendingMilestone(a);
  const d = (next && next.state.due) || parseD(a.target) || new Date(2999, 0, 1);
  return d.getTime();
}
function compareTimelineOrder(a: Activity, b: Activity): number {
  const pa = timelinePriority(a);
  const pb = timelinePriority(b);
  if (pa !== pb) return pa - pb;
  const da = timelineRefTime(a);
  const db = timelineRefTime(b);
  if (da !== db) return da - db;
  return String(a.code || a.id || "").localeCompare(String(b.code || b.id || ""), "vi");
}

/* Cùng thứ tự ưu tiên nhưng theo MỘT mốc cụ thể (dùng cho tab Đề cương /
 * Thẩm định thực tế / Hoàn thành VMP): quá hạn → tới hạn → còn hạn → xong (cuối). */
function stagePriority(a: Activity, stage: (typeof MAP_STAGES)[number]): number {
  const h = stageState(a, stage).heat;
  if (h === "done") return 3;
  if (h === "over") return 0;
  if (h === "urgent" || h === "soon") return 1;
  return 2; // steady / chưa có mốc
}
function stageRefTime(a: Activity, stage: (typeof MAP_STAGES)[number]): number {
  const st = stageState(a, stage);
  const d = (st.done && st.actual ? st.actual : st.due) || parseD(a.target) || new Date(2999, 0, 1);
  return d.getTime();
}
function compareStageOrder(stageId: string) {
  const stage = MAP_STAGES.find((entry) => entry.id === stageId);
  if (!stage) return compareTimelineOrder;
  return (a: Activity, b: Activity): number => {
    const pa = stagePriority(a, stage);
    const pb = stagePriority(b, stage);
    if (pa !== pb) return pa - pb;
    const da = stageRefTime(a, stage);
    const db = stageRefTime(b, stage);
    if (da !== db) return da - db;
    return String(a.code || a.id || "").localeCompare(String(b.code || b.id || ""), "vi");
  };
}

export function TimelineMapSummary({ items }: { items: Activity[] }) {
  const rows = MAP_STAGES.map((stage: (typeof MAP_STAGES)[number]) => {
    const states = items.map((a: Activity) => stageState(a, stage));
    const done = states.filter((state) => state.done).length;
    const urgent = states.filter((state) => !state.done && ["over", "urgent", "soon"].includes(state.heat)).length;
    return {
      stage,
      done,
      pending: Math.max(0, items.length - done),
      urgent,
    };
  });

  return (
    <div className="timeline-map-summary">
      {rows.map((row) => (
        <div key={row.stage.id} className={`timeline-map-summary__item timeline-map-summary__item--${row.stage.id}`}>
          <span>{row.stage.label}</span>
          <strong className="tnum">{row.done}</strong>
          <small>{row.pending} chưa xong · {row.urgent} cần chú ý</small>
        </div>
      ))}
    </div>
  );
}

function bandItems(items: Activity[], band: { start: Date; end: Date }): Activity[] {
  return items.filter((a: Activity) => inRange(parseD(a.target), band));
}

function bandSummary(items: Activity[], range: TimeRange) {
  return range.bands.map((band: TimeRange["bands"][number]) => {
    const rows = bandItems(items, band);
    const done = rows.filter((a: Activity) => issueLevel(a) === "done").length;
    const over = rows.filter((a: Activity) => issueLevel(a) === "over").length;
    const prog = rows.filter((a: Activity) => issueLevel(a) === "prog").length;
    return {
      ...band,
      rows,
      count: rows.length,
      done,
      over,
      prog,
      rate: rows.length ? Math.round((done / rows.length) * 100) : 0,
    };
  });
}

export function TimelineInsightStrip({ items, stats, range }: {
  items: Activity[]; stats: Record<string, number>; range: TimeRange;
}) {
  const bands = bandSummary(items, range);
  const peak = [...bands].sort((a, b) => b.count - a.count || b.over - a.over)[0];
  const stageLoads = MAP_STAGES.map((stage: (typeof MAP_STAGES)[number]) => {
    const states = items.map((a: Activity) => stageState(a, stage));
    return {
      stage,
      urgent: states.filter((state) => !state.done && ["over", "urgent", "soon"].includes(state.heat)).length,
      pending: states.filter((state) => !state.done).length,
    };
  }).sort((a, b) => b.urgent - a.urgent || b.pending - a.pending);
  const hotStage = stageLoads[0];

  return (
    <div className="timeline-insight-strip">
      <div className="timeline-insight-card timeline-insight-card--primary">
        <span>Khung quan sát</span>
        <strong>{range.title}</strong>
        <small>{items.length} hạng mục đang nằm trong bản đồ</small>
      </div>
      <div className="timeline-insight-card timeline-insight-card--peak">
        <span>Cao điểm deadline</span>
        <strong>{peak?.label || "—"}</strong>
        <small>{peak?.count || 0} đích VMP · {peak?.over || 0} cần chú ý</small>
      </div>
      <div className="timeline-insight-card timeline-insight-card--stage">
        <span>Mốc nóng</span>
        <strong>{hotStage?.stage.label || "—"}</strong>
        <small>{hotStage?.urgent || 0} cần chú ý · {hotStage?.pending || 0} chưa xong</small>
      </div>
      <div className="timeline-insight-card timeline-insight-card--done">
        <span>Nhịp hoàn thành</span>
        <strong className="tnum">{stats.rate}%</strong>
        <small>{stats.done} xong · {stats.owners} người liên quan</small>
      </div>
    </div>
  );
}

export function TimelineRangeRail({ items, range, view, onFocusBand }: {
  items: Activity[]; range: TimeRange; view: string;
  onFocusBand?: (band: { label: string; start: Date; end: Date; [k: string]: unknown }) => void;
}) {
  const bands = bandSummary(items, range);
  const maxCount = Math.max(1, ...bands.map((band) => band.count));
  const today = vmpToday();
  const todayVisible = inRange(today, range);
  const modeLabel = view === "month" ? "tuần" : "tháng";

  return (
    <div className={`timeline-range-rail timeline-range-rail--${view}`}>
      <div className="timeline-range-rail__head">
        <div>
          <strong>Biểu đồ cột theo thời gian · {range.title}</strong>
          <span>Chiều cao là tổng deadline theo {modeLabel}; màu cột thể hiện trạng thái xử lý</span>
        </div>
        <div className="timeline-range-rail__legend">
          <span><i className="timeline-range-rail__legend-done" />Hoàn thành</span>
          <span><i className="timeline-range-rail__legend-over" />Cần chú ý</span>
          <span><i className="timeline-range-rail__legend-work" />Đang chạy</span>
        </div>
      </div>

      <div className="timeline-range-rail__track">
        {todayVisible && (
          <i className="timeline-range-rail__today" style={{ left: `${pctInRange(today, range)}%` }}>
            <span>Hôm nay</span>
          </i>
        )}
        {bands.map((band, index) => {
          const canFocus = view !== "month";
          const load = Math.max(4, Math.round((band.count / maxCount) * 100));
          const doneW = band.count ? Math.round((band.done / band.count) * 100) : 0;
          const overW = band.count ? Math.round((band.over / band.count) * 100) : 0;
          const progW = band.count ? Math.round((band.prog / band.count) * 100) : 0;
          return (
            <button
              type="button"
              key={`${band.label}-${index}`}
              className={`timeline-range-rail__band ${band.over ? "timeline-range-rail__band--over" : ""} ${band.count ? "" : "timeline-range-rail__band--empty"}`}
              onClick={() => { if (canFocus) onFocusBand?.(band); }}
              disabled={!canFocus}
              title={`${band.label}: ${band.count} đích VMP, ${band.done} hoàn thành, ${band.over} cần chú ý`}
              aria-label={`${band.label}: ${band.count} đích VMP, ${band.done} hoàn thành, ${band.over} cần chú ý`}
              style={{
                "--load": `${load}%`, "--done": `${doneW}%`,
                "--over": `${overW}%`, "--prog": `${progW}%`,
              } as React.CSSProperties}
            >
              <span className="timeline-range-rail__plot" aria-hidden="true">
                <strong className="timeline-range-rail__value tnum">{band.count}</strong>
                <span className="timeline-range-rail__column">
                  <i className="timeline-range-rail__over" />
                  <i className="timeline-range-rail__prog" />
                  <i className="timeline-range-rail__done" />
                </span>
              </span>
              <span className="timeline-range-rail__caption">
                <span>{band.label}</span>
                <small>{band.rate}% xong</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimelineMapStage({ a, stage }: { a: Activity; stage: (typeof MAP_STAGES)[number] }) {
  const state = stageState(a, stage);
  const date = state.done ? (state.actual || state.due) : state.due;
  return (
    <div
      className={`timeline-map-stage timeline-map-stage--${stage.id} timeline-map-stage--${state.heat}`}
      title={`${stage.label}: ${state.label} · Mốc ${fmtVN(state.due)}`}
    >
      <span>{stage.short}</span>
      <strong>{state.label}</strong>
      <small className="tnum">{fmtVN(date)}</small>
    </div>
  );
}

function TimelineMapRowContent({ a }: { a: Activity }) {
  const cls = (CLS as Record<string, typeof CLS.tb>)[String(a.cls ?? "tb")] || CLS.tb;
  const dept = DEPTS.find((d) => d.id === a.dept);
  const target = parseD(a.target);
  const owner = ownerOf(a);

  return (
    <div className="timeline-map-content">
      <div className="timeline-map-target">
        <span>Đích VMP</span>
        <strong className="tnum">{fmtVN(target)}</strong>
      </div>

      <div className="timeline-map-info">
        <div className="timeline-map-info__top">
          <Tag color={cls.text} bg={cls.soft}>{a.vtype}</Tag>
          <span className="timeline-card-code">{a.code}</span>
        </div>
        <div className="timeline-map-name">{a.name}</div>
        <div className="timeline-map-meta">
          <span>{owner}</span>
          <span>{dept?.short || a.dept || "—"}</span>
          <span>{a.crit || "TB"}</span>
        </div>
      </div>

      <div className="timeline-map-stages">
        {MAP_STAGES.map((stage: (typeof MAP_STAGES)[number]) => (
          <TimelineMapStage key={stage.id} a={a} stage={stage} />
        ))}
      </div>
    </div>
  );
}

function timelineCalendarWidth(range: TimeRange, density: string): number {
  const pxPerDay = range.view === "month"
    ? (density === "compact" ? 29 : 34)
    : range.view === "quarter"
      ? (density === "compact" ? 16 : 19)
      : (density === "compact" ? 9 : 11);
  return Math.max(920, Math.round(range.days * pxPerDay));
}

function timelineDateTicks(range: TimeRange) {
  const step = range.view === "month" ? 1 : range.view === "quarter" ? 7 : 14;
  const ticks: Array<Record<string, unknown> & { date: Date }> = [];
  for (let index = 0; index < range.days; index += 1) {
    const date = addDays(range.start, index);
    const major = date.getDate() === 1;
    if (index === 0 || index === range.days - 1 || major || index % step === 0) {
      ticks.push({
        date,
        major,
        edge: index === 0 ? "start" : index === range.days - 1 ? "end" : "",
        label: `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`,
        left: pctInRange(date, range),
      });
    }
  }
  return ticks;
}

function timelineStagePoint(
  state: { done: boolean; actual: Date | null; due: Date | null; [k: string]: unknown },
  range: TimeRange,
) {
  const date = state.done && state.actual ? state.actual : state.due;
  const before = !!date && date < startOfDay(range.start)!;
  const after = !!date && date > startOfDay(range.end)!;
  return {
    date,
    edge: before ? "before" : after ? "after" : "inside",
    left: before ? 1 : after ? 99 : pctInRange(date, range),
  };
}

function TimelineTableStageLabel({ a, stage }: { a: Activity; stage: (typeof MAP_STAGES)[number] }) {
  const state = stageState(a, stage);
  return (
    <div
      className={`timeline-day-stage timeline-day-stage--${stage.id} timeline-day-stage--${state.heat}`}
      title={`${stage.label}: ${state.label} · ${fmtVN(state.done && state.actual ? state.actual : state.due)}`}
    >
      <i />
      <span>
        <strong>{stage.short}</strong>
        <small>{state.label}</small>
      </span>
    </div>
  );
}

const FLOW_Y = {
  protocol: 24,
  validation: 50,
  vmp: 76,
};

function TimelineTableFlowCell({ a, range, stages = MAP_STAGES }: {
  a: Activity; range: TimeRange; stages?: typeof MAP_STAGES;
}) {
  const singleStage = stages.length === 1;
  const entries = stages.map((stage: (typeof MAP_STAGES)[number]) => {
    const state = stageState(a, stage);
    const point = timelineStagePoint(state, range);
    return {
      stage, state, point,
      y: singleStage ? 50 : ((FLOW_Y as Record<string, number>)[stage.id] || 50),
    };
  }).filter((entry) => entry.point.date);
  if (!entries.length) {
    return (
      <div className="timeline-day-flow timeline-day-flow--empty">
        <ScaleBands range={range} />
        <span>Chưa có ngày mốc</span>
      </div>
    );
  }
  const left = Math.min(...entries.map((entry) => entry.point.left));
  const right = Math.max(...entries.map((entry) => entry.point.left));

  return (
    <div className={`timeline-day-flow ${singleStage ? "timeline-day-flow--single" : ""}`}>
      <ScaleBands range={range} />
      {!singleStage && (
        <span
          className="timeline-day-flow__window"
          style={{ left: `${left}%`, width: `${Math.max(1, right - left)}%` }}
        />
      )}
      <svg className="timeline-day-flow__path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {entries.slice(1).map((entry, index) => {
          const prev = entries[index];
          return (
            <line
              key={`${prev.stage.id}-${entry.stage.id}`}
              x1={prev.point.left}
              y1={prev.y}
              x2={entry.point.left}
              y2={entry.y}
              vectorEffect="non-scaling-stroke"
              className={`timeline-day-flow__segment timeline-day-flow__segment--${prev.stage.id} ${prev.state.done ? "timeline-day-flow__segment--done" : ""}`}
            />
          );
        })}
      </svg>
      {entries.map(({ stage, state, point, y }) => {
        const actualText = state.actual ? ` · Thực tế ${fmtVN(state.actual)}` : "";
        const edgeText = point.edge === "before" ? " · Trước kỳ" : point.edge === "after" ? " · Sau kỳ" : "";
        return (
          <span
            key={stage.id}
            className={`timeline-day-flow__node timeline-day-flow__node--${stage.id} timeline-day-flow__node--${state.heat} timeline-day-flow__node--${point.edge}`}
            style={{ left: `${point.left}%`, top: `${y}%` }}
            title={`${stage.label}: ${state.label} · hạn ${fmtVN(state.due)}${actualText}${edgeText}`}
          >
            <b>{state.done ? "✓" : stage.short}</b>
            <small>{stage.short}</small>
            <em className="tnum">{fmtVN(point.date).slice(0, 5)}</em>
          </span>
        );
      })}
    </div>
  );
}

/* Tổng hợp theo mốc cho 1 stage: xong / quá hạn / sắp tới hạn. */
function stageAgg(items: Activity[], stage: (typeof MAP_STAGES)[number]) {
  const states = items.map((a: Activity) => stageState(a, stage));
  const done = states.filter((s) => s.done).length;
  const over = states.filter((s) => !s.done && s.heat === "over").length;
  const soon = states.filter((s) => !s.done && (s.heat === "urgent" || s.heat === "soon")).length;
  return { done, over, soon, total: items.length };
}

/* Panel "Tình hình thẩm định" — trả lời trực tiếp các câu hỏi vận hành:
 *  · Đề cương / Thẩm định tới đâu?  → thanh tiến độ done/total mỗi mốc
 *  · Sắp thẩm định thực tế chưa?    → số "sắp hạn" của mốc Thẩm định
 *  · Mục nào quá hạn / bị trôi?     → chip "quá hạn" (bấm để lọc)
 *  · Kế hoạch quý tới?              → thẻ "quý tới" (bấm để nhảy tới quý sau) */
function TimelineStageProgress({ items, year, onOverdue, onNextQuarter }: {
  items: Activity[]; year: number; onOverdue?: () => void; onNextQuarter?: () => void;
}) {
  const cards = MAP_STAGES.map((stage: (typeof MAP_STAGES)[number]) => ({ stage, ...stageAgg(items, stage) }));
  const curQ = Math.floor(vmpToday().getMonth() / 3);
  const nextInYear = curQ + 1 <= 3;
  const nqIndex = nextInYear ? curQ + 1 : 0;
  const nqYear = nextInYear ? year : year + 1;
  const nextQCount = items.filter((a: Activity) => {
    const t = parseD(a.target);
    return t && t.getFullYear() === nqYear && Math.floor(t.getMonth() / 3) === nqIndex;
  }).length;
  const nqLabel = `Quý ${nqIndex + 1}/${nqYear}`;

  return (
    <div className="timeline-stage-progress" aria-label="Tình hình thẩm định theo mốc">
      {cards.map(({ stage, done, over, soon, total }) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        return (
          <div key={stage.id} className={`tsp-card tsp-card--${stage.id}`}>
            <div className="tsp-card__head">
              <span className="tsp-card__label">{stage.label}</span>
              <span className="tsp-card__count tnum"><b>{done}</b>/{total}</span>
            </div>
            <div className="tsp-bar"><i style={{ width: `${pct}%` }} /></div>
            <div className="tsp-card__foot">
              {over > 0 && (
                <button type="button" className="tsp-chip tsp-chip--over" onClick={onOverdue} title="Lọc các mục quá hạn">
                  {over} quá hạn
                </button>
              )}
              {soon > 0 && <span className="tsp-chip tsp-chip--soon">{soon} sắp hạn</span>}
              {over === 0 && soon === 0 && <span className="tsp-chip tsp-chip--ok">đúng nhịp</span>}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="tsp-card tsp-card--next"
        onClick={onNextQuarter}
        disabled={!nextInYear}
        title={nextInYear ? `Xem kế hoạch ${nqLabel}` : "Quý tới thuộc năm sau"}
      >
        <div className="tsp-card__head">
          <span className="tsp-card__label">Kế hoạch quý tới</span>
        </div>
        <div className="tsp-next__value tnum">{nextQCount}</div>
        <div className="tsp-next__sub">đích VMP · {nqLabel}{nextInYear ? " →" : ""}</div>
      </button>
    </div>
  );
}

/* Chú giải bảng dòng thời gian — tách rõ 2 chiều:
 *  · Chữ ĐC/TT/VMP = MỐC nào (danh tính, không dựa màu)
 *  · Màu chấm = TRẠNG THÁI theo hạn (nhất quán mọi mốc, luôn kèm nhãn) */
function TimelineFlowLegend() {
  const stages = [
    ["ĐC", "Đề cương"],
    ["TT", "Thẩm định thực tế"],
    ["VMP", "Hoàn thành VMP"],
  ];
  const states = [
    ["done", "✓", "Đã xong"],
    ["over", "●", "Trễ / gấp"],
    ["soon", "●", "Sắp đến hạn"],
    ["steady", "●", "Đúng nhịp"],
  ];
  return (
    <div className="timeline-flow-legend" aria-label="Chú giải biểu đồ dòng thời gian">
      <div className="timeline-flow-legend__group">
        <b>Mốc</b>
        {stages.map(([short, label]) => (
          <span key={short} className="timeline-flow-legend__stage" title={label}>
            <i>{short}</i>{label}
          </span>
        ))}
      </div>
      <div className="timeline-flow-legend__group">
        <b>Trạng thái</b>
        {states.map(([key, glyph, label]) => (
          <span key={key} className="timeline-flow-legend__state">
            <i className={`timeline-flow-legend__dot timeline-flow-legend__dot--${key}`}>{glyph}</i>{label}
          </span>
        ))}
      </div>
    </div>
  );
}

function TimelineTableBoard({ items, onOpen, density, range, tableStage = "all" }: {
  items: Activity[]; onOpen: (a: Activity) => void; density: string;
  range: TimeRange; tableStage?: string;
}) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const calendarWidth = timelineCalendarWidth(range, density);
  const today = vmpToday();
  const todayVisible = inRange(today, range);
  const selectedStage = MAP_STAGES.find((stage) => stage.id === tableStage);
  const visibleStages = selectedStage ? [selectedStage] : MAP_STAGES;
  const tableItems = useMemo(
    () => [...items].sort(tableStage === "all" ? compareTimelineOrder : compareStageOrder(tableStage)),
    [items, tableStage],
  );
  const nextUpcomingDate = tableItems
    .map((item) => selectedStage ? stageState(item, selectedStage).due : nextPendingMilestone(item)?.state.due)
    .find((date) => date && date >= startOfDay(today)! && inRange(date, range));
  const nextUpcomingTime = nextUpcomingDate?.getTime() || null;

  useEffect(() => {
    const board = boardRef.current;
    if (!board || !todayVisible) return;
    const centerToday = () => {
      const itemHead = board.querySelector<HTMLElement>(".timeline-day-head-item");
      const stageHead = board.querySelector<HTMLElement>(".timeline-day-head-stages");
      const calendarHead = board.querySelector<HTMLElement>(".timeline-day-head-calendar");
      const itemWidth = itemHead?.offsetWidth || 0;
      const stageIsHorizontallySticky = stageHead && getComputedStyle(stageHead).left !== "auto";
      const stickyWidth = itemWidth + (stageIsHorizontallySticky ? stageHead.offsetWidth : 0);
      const availableWidth = Math.max(0, board.clientWidth - stickyWidth);
      const focusDate = availableWidth < 180 && nextUpcomingTime ? new Date(nextUpcomingTime) : today;
      const focusX = (calendarHead?.offsetLeft || 0) + ((calendarHead?.offsetWidth || calendarWidth) * pctInRange(focusDate, range)) / 100;
      const focusOffset = stickyWidth + Math.max(34, availableWidth * (availableWidth < 180 ? 0.62 : 0.45));
      board.scrollLeft = Math.max(0, focusX - focusOffset);
    };
    const frame = requestAnimationFrame(centerToday);
    window.addEventListener("resize", centerToday);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", centerToday);
    };
  }, [calendarWidth, nextUpcomingTime, range, todayVisible]);

  if (!items.length) {
    return (
      <div className="timeline-card-board-empty">
        Không có hạng mục nào trong khung thời gian/bộ lọc hiện tại.
      </div>
    );
  }

  const ticks = timelineDateTicks(range);
  const daySize = `${100 / range.days}%`;

  return (
    <div ref={boardRef} className={`timeline-day-board timeline-day-board--${density} ${selectedStage ? "timeline-day-board--single" : ""} vmp-scroll`}>
      <table
        className="timeline-day-table"
        style={{
          "--calendar-width": `${calendarWidth}px`, "--day-size": daySize,
        } as React.CSSProperties}
      >
        <thead>
          <tr>
            <th className="timeline-day-head-item">Hạng mục</th>
            <th className="timeline-day-head-stages">{selectedStage ? selectedStage.label : "3 mốc"}</th>
            <th className="timeline-day-head-calendar">
              <div className="timeline-day-axis" style={{ width: `${calendarWidth}px` }}>
                {todayVisible && <i className="timeline-day-axis__today" style={{ left: `${pctInRange(today, range)}%` }}><span>Hôm nay</span></i>}
                {ticks.map((tick) => (
                  <span
                    key={tick.date.getTime()}
                    className={`timeline-day-axis__tick ${tick.major ? "timeline-day-axis__tick--major" : ""} ${tick.edge ? `timeline-day-axis__tick--${tick.edge}` : ""}`}
                    style={{ left: `${tick.left}%` }}
                  >
                    {String(tick.label ?? "")}
                  </span>
                ))}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {tableItems.map((a: Activity) => {
            const cls = (CLS as Record<string, typeof CLS.tb>)[String(a.cls ?? "tb")] || CLS.tb;
            const dept = DEPTS.find((d) => d.id === a.dept);
            const level = issueLevel(a);
            const owner = ownerOf(a);
            const step = activeMapStep(a);
            const stepState = stageState(a, step.stage);
            return (
              <tr
                key={a.id}
                className={`timeline-day-row timeline-day-row--${level}`}
                onClick={() => onOpen && onOpen(a)}
                title={`${a.code} · ${a.name}\nĐích VMP: ${fmtVN(parseD(a.target))}`}
              >
                <td className="timeline-day-item">
                  <div className="timeline-table-item__top">
                    <Tag color={cls.text} bg={cls.soft}>{a.vtype}</Tag>
                    <span className="timeline-card-code">{a.code}</span>
                    <span className="timeline-day-item__status"><Pill s={a.st} small /></span>
                  </div>
                  <div className="timeline-table-item__name">{a.name}</div>
                  <div className="timeline-day-item__footer" title={`${owner} · ${dept?.name || a.dept || "Chưa có bộ phận"}`}>
                    <span className={`timeline-day-item__next timeline-day-item__next--${stepState.heat}`}>
                      {step.stage.short} · {stepState.label}
                    </span>
                    <span className="timeline-day-item__target tnum">VMP {fmtVN(parseD(a.target))}</span>
                  </div>
                </td>
                <td className="timeline-day-stages-cell">
                  <div className={`timeline-day-stages ${selectedStage ? "timeline-day-stages--single" : ""}`}>
                    {visibleStages.map((stage: (typeof MAP_STAGES)[number]) => <TimelineTableStageLabel key={stage.id} a={a} stage={stage} />)}
                  </div>
                </td>
                <td className="timeline-day-calendar-cell" style={{ width: `${calendarWidth}px` }}>
                  {todayVisible && <i className="timeline-day-calendar__today" style={{ left: `${pctInRange(today, range)}%` }} />}
                  <TimelineTableFlowCell a={a} range={range} stages={visibleStages} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TimelineStageBoard({ items, onOpen, density }: {
  items: Activity[]; onOpen: (a: Activity) => void; density: string;
}) {
  if (!items.length) {
    return (
      <div className="timeline-card-board-empty">
        Không có hạng mục nào trong khung thời gian/bộ lọc hiện tại.
      </div>
    );
  }

  return (
    <div className={`timeline-map-board timeline-map-board--${density}`}>
      <div className="timeline-map-list vmp-scroll">
        {items.map((a: Activity) => (
          <button
            type="button"
            key={a.id}
            className={`timeline-map-row timeline-map-row--${issueLevel(a)}`}
            onClick={() => onOpen && onOpen(a)}
            title={`${a.code} · ${a.name}\nĐích VMP: ${fmtVN(parseD(a.target))}`}
          >
            <TimelineMapRowContent a={a} />
          </button>
        ))}
      </div>
    </div>
  );
}

function HybridChartCell({ a, range, width }: { a: Activity; range: TimeRange; width: number }) {
  const ps = phaseStates(a);
  const { m, start, end } = taskWindow(a);

  return (
    <div className="timeline-chart-cell timeline-hybrid-chart" style={{ width, flexBasis: width }}>
      <ScaleBands range={range} />
      <TodayLine range={range} />
      <div className="timeline-task-window" style={{
        left: `${pctInRange(start, range)}%`,
        width: `${Math.max(.8, pctInRange(end, range) - pctInRange(start, range))}%`,
      }} />
      {PHASES.map((seg) => <PhaseSegment key={seg.id} seg={seg} ps={ps} m={m} range={range} />)}
      {MILESTONES.map((ms) => (
        <MilestoneDot key={ms.id} milestone={ms}
          date={(m as unknown as Record<string, Date | null>)[ms.id]} range={range} />
      ))}
      <ProgressPin a={a} start={start} end={end} range={range} />
    </div>
  );
}

function TimelineHybridBoard({ range, items, width, onOpen, density }: {
  range: TimeRange; items: Activity[]; width: number;
  onOpen: (a: Activity) => void; density: string;
}) {
  if (!items.length) {
    return (
      <div className="timeline-card-board-empty">
        Không có hạng mục nào trong khung thời gian/bộ lọc hiện tại.
      </div>
    );
  }

  const leftWidth = density === "compact" ? 520 : 600;

  return (
    <div className={`timeline-hybrid-board timeline-hybrid-board--${density} vmp-scroll`}>
      <div style={{ minWidth: leftWidth + width }}>
        <div className="timeline-hybrid-row timeline-hybrid-header">
          <div className="timeline-hybrid-left timeline-hybrid-left--header" style={{ width: leftWidth, flexBasis: leftWidth }}>
            Hạng mục · 3 mốc hoàn thành
          </div>
          <div className="timeline-chart-cell timeline-chart-cell--header timeline-hybrid-chart" style={{ width, flexBasis: width }}>
            <ScaleBands range={range} />
            <TodayLine range={range} label />
            {range.bands.map((band: TimeRange["bands"][number], i: number) => {
              const left = pctInRange(band.start, range);
              const right = pctInRange(addDays(band.end, 1), range);
              return (
                <div
                  key={`hybrid-label-${band.label}-${i}`}
                  className="timeline-band-label"
                  style={{ left: `${left}%`, width: `${Math.max(.3, right - left)}%` }}
                >
                  <strong>{band.label}</strong>
                  <small>{String(band.sub ?? "")}</small>
                </div>
              );
            })}
          </div>
        </div>

        {items.map((a: Activity) => (
          <button
            type="button"
            key={a.id}
            className={`timeline-hybrid-row timeline-hybrid-item timeline-hybrid-item--${issueLevel(a)}`}
            onClick={() => onOpen && onOpen(a)}
            title={`${a.code} · ${a.name}\nĐích VMP: ${fmtVN(parseD(a.target))}`}
          >
            <div className="timeline-hybrid-left" style={{ width: leftWidth, flexBasis: leftWidth }}>
              <TimelineMapRowContent a={a} />
            </div>
            <HybridChartCell a={a} range={range} width={width} />
          </button>
        ))}
      </div>
    </div>
  );
}

function ScaleBands({ range }: { range: TimeRange }) {
  return (
    <>
      {range.bands.map((band: TimeRange["bands"][number], i: number) => {
        const left = pctInRange(band.start, range);
        const right = pctInRange(addDays(band.end, 1), range);
        return (
          <div
            key={`${band.label}-${i}`}
            className="timeline-band"
            style={{
              left: `${left}%`,
              width: `${Math.max(.3, right - left)}%`,
              background: i % 2 ? "rgba(252,227,239,.34)" : "rgba(237,231,252,.26)",
            }}
          />
        );
      })}
      {range.bands.map((band: TimeRange["bands"][number], i: number) => (
        <div
          key={`line-${band.label}-${i}`}
          className="timeline-grid-line"
          style={{ left: `${pctInRange(band.start, range)}%` }}
        />
      ))}
      <div className="timeline-grid-line timeline-grid-line--end" style={{ left: "100%" }} />
    </>
  );
}

function TodayLine({ range, label = false }: { range: TimeRange; label?: boolean }) {
  const today = vmpToday();
  if (!inRange(today, range)) return null;
  return (
    <div className="timeline-today-line" style={{ left: `${pctInRange(today, range)}%` }}>
      {label && <span>Hôm nay</span>}
    </div>
  );
}

function PhaseSegment({ seg, ps, m, range }: {
  seg: { id: string; from: string; to: string; key?: string; [k: string]: unknown };
  /** Kết quả phaseStates(): p/v/r là trạng thái, m là mốc thời gian. */
  ps: { p: string; v: string; r: string; [k: string]: unknown };
  m: Milestones;
  range: TimeRange;
}) {
  const mm = m as unknown as Record<string, Date | null>;
  const from = mm[seg.from];
  const to = mm[seg.to];
  if (!from || !to || !intersectsRange(from, to, range)) return null;
  const left = pctInRange(maxDate(from, range.start), range);
  const right = pctInRange(minDate(to, addDays(range.end, 1)), range);
  const status = String(ps[String(seg.key)] ?? "future");
  return (
    <div
      className={`timeline-phase timeline-phase--${status}`}
      title={`${seg.label}: ${fmtVN(from)} → ${fmtVN(to)}`}
      style={{
        left: `${left}%`,
        width: `${Math.max(.6, right - left)}%`,
        background: (PHASE_COLOR as Record<string, string>)[status] || PHASE_COLOR.future,
      }}
    />
  );
}

function MilestoneDot({ milestone, date, range }: {
  milestone: { id: string; label: string; color?: string; [k: string]: unknown };
  date: Date | null;
  range: TimeRange;
}) {
  if (!inRange(date, range)) return null;
  return (
    <span
      className="timeline-milestone"
      title={`${milestone.label}: ${fmtVN(date)}`}
      style={{
        left: `${pctInRange(date, range)}%`,
        borderColor: milestone.color,
        color: milestone.color,
      }}
      aria-label={`${milestone.label}: ${fmtVN(date)}`}
    />
  );
}

function ProgressPin({ a, start, end, range }: {
  a: Activity; start: Date; end: Date; range: TimeRange;
}) {
  const pct = phaseProgress(a);
  const startPct = pctInRange(start, range);
  const endPct = pctInRange(end, range);
  const visibleLeft = Math.min(startPct, endPct);
  const visibleWidth = Math.max(0, Math.abs(endPct - startPct));
  const absolute = visibleLeft + (visibleWidth * pct / 100);
  const level = issueLevel(a);
  return (
    <span
      className={`timeline-progress-pin timeline-progress-pin--${level}`}
      title="Vị trí hiện tại trong chuỗi mốc"
      style={{ left: `${clamp(absolute, 2.4, 97.6)}%` }}
      aria-label="Vị trí hiện tại trong chuỗi mốc"
    />
  );
}

function ActivityDetailModal({ a, onClose }: { a: Activity | null; onClose: () => void }) {
  if (!a) return null;
  const r = a._raw || {};
  const m = a.m || milestones(a);
  const cls = (CLS as Record<string, typeof CLS.tb>)[String(a.cls ?? "tb")] || CLS.tb;
  const dp = DEPTS.find((d) => d.id === a.dept);
  const ct = (CRIT as Record<string, typeof CRIT.TB>)[String(a.crit ?? "TB")] || CRIT.TB;
  const dShow = (v: unknown): string => { const t = String(v == null ? "" : v).trim(); return t || "—"; };
  const has = (v: unknown): boolean => String(v == null ? "" : v).trim() !== "";
  const info = [
    ["Phân loại", cls.label], ["Bộ phận", dp ? dp.name : dShow(r.bo_phan)], ["Line", dShow(r.line)],
    ["Khu vực", dShow(r.khu_vuc)], ["Tình trạng", dShow(r.tinh_trang)], ["Tần suất", has(r.tan_suat) ? dShow(r.tan_suat) + " tháng" : "—"],
    ["PL báo cáo", dShow(a.dep)], ["Ngày công", a.effort != null ? String(a.effort) : "—"], ["Điểm trọng yếu", a.score != null ? a.score + " / 9" : "—"],
  ];
  const phases = [
    { ic: "📝", label: "Đề cương", note: "Hạn T‑60", dl: has(r.dl_de_cuong) ? dShow(r.dl_de_cuong) : fmtVN(m.protocol), act: r.ngay_de_cuong, st: r.tt_de_cuong },
    { ic: "🔬", label: "Thẩm định thực tế", note: "Hạn T‑5‑BC", dl: has(r.dl_tham_dinh) ? dShow(r.dl_tham_dinh) : fmtVN(m.validation), act: r.ngay_tham_dinh, st: r.tt_tham_dinh, sched: r.lich_td },
    { ic: "📄", label: "Báo cáo", note: "Hạn T‑5", dl: has(r.dl_bao_cao) ? dShow(r.dl_bao_cao) : fmtVN(m.report), act: r.ngay_bao_cao, st: r.tt_bao_cao },
    { ic: "🏁", label: "Hoàn tất VMP", note: "Đích VMP (T)", dl: has(r.dl_vmp) ? dShow(r.dl_vmp) : fmtVN(m.target), act: r.ngay_vmp, st: r.tt_vmp },
  ];
  return (
    <Modal onClose={onClose} title="Chi tiết hạng mục" icon={FileText} wide>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: cls.text, background: cls.soft, padding: "4px 10px", borderRadius: 9 }}>{a.code}</span>
        <Tag color={cls.text} bg={cls.soft}>{a.vtype}</Tag>
        <Tag color={ct.text} bg={ct.soft}>Rủi ro {a.crit}</Tag>
        <Pill s={a.st} small />
      </div>
      <div style={{ fontFamily: TEXT, fontSize: 18, fontWeight: 800, color: C.plum, marginBottom: 16 }}>{a.name}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9, marginBottom: 14 }}>
        {info.map(([k, v]) => <div key={k} style={{ background: C.surface, borderRadius: 11, padding: "8px 11px" }}><div style={{ fontSize: 10, color: C.plumSoft, fontWeight: 800, textTransform: "uppercase", letterSpacing: .3 }}>{k}</div><div style={{ fontSize: 13.5, color: C.plum, fontWeight: 700, marginTop: 2 }}>{v}</div></div>)}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 190, background: C.pinkSoft, borderRadius: 12, padding: "10px 13px" }}><div style={{ fontSize: 10, color: C.pinkText, fontWeight: 800, textTransform: "uppercase" }}>QA phụ trách</div><div style={{ fontSize: 14, color: C.plum, fontWeight: 800, marginTop: 2 }}>{dShow(r.qa)}</div>{has(r.email_qa) && <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600 }}>{String(r.email_qa ?? "")}</div>}</div>
        <div style={{ flex: 1, minWidth: 190, background: C.lavSoft, borderRadius: 12, padding: "10px 13px" }}><div style={{ fontSize: 10, color: C.lavText, fontWeight: 800, textTransform: "uppercase" }}>NS bộ phận khác</div><div style={{ fontSize: 14, color: C.plum, fontWeight: 800, marginTop: 2 }}>{dShow(r.ns_khac)}</div>{has(r.email_khac) && <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600 }}>{String(r.email_khac ?? "")}</div>}</div>
      </div>
      <div style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plum, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}><CalendarClock size={17} color={C.pink} /> Vòng đời thẩm định</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {phases.map((p, i) => (
          <div key={i} style={{ background: C.surface, borderRadius: 14, padding: "11px 14px", borderLeft: `4px solid ${has(p.act) ? C.mint : C.pinkSoft}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ fontSize: 18 }}>{p.ic}</span><div><div style={{ fontSize: 14, fontWeight: 800, color: C.plum }}>{p.label}</div><div style={{ fontSize: 10.5, color: C.plumSoft, fontWeight: 600 }}>{p.note}</div></div></div>
              {phaseTag(String(p.st ?? ""))}
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 8, flexWrap: "wrap", fontSize: 12.5 }}>
              <span style={{ color: C.plumSoft, fontWeight: 600 }}>Hạn: <b style={{ color: C.plum }}>{dShow(p.dl)}</b></span>
              <span style={{ color: C.plumSoft, fontWeight: 600 }}>Thực tế: <b style={{ color: has(p.act) ? C.mintText : "#C9B6C7" }}>{dShow(p.act)}</b></span>
              {p.sched != null && has(p.sched) && <span style={{ color: C.plumSoft, fontWeight: 600 }}>Lịch xếp: <b style={{ color: C.plum }}>{dShow(p.sched)}</b></span>}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ===================== TỔNG QUAN (overview-first) =====================
 * Biểu đồ tải VMP theo tháng (chiều cao = khối lượng, màu = trạng thái) +
 * KPI + sức khoẻ theo bộ phận. Bấm cột/bộ phận -> drill xuống chi tiết.
 * Tính từ dữ liệu hiện có (a.st, a.target, a.dept) — không đổi luồng dữ liệu. */
const OV_COLOR = { done: C.mint, over: C.rasp, prog: C.marigold, chua: C.sky };
const OV_STATUS = [
  { k: "done", label: "Hoàn thành" },
  { k: "over", label: "Quá hạn" },
  { k: "prog", label: "Đang thực hiện" },
  { k: "chua", label: "Chưa / Kế hoạch" },
];
const ovBucket = (st: string): string => (st === "done" || st === "over" || st === "prog") ? st : "chua";

function OvKpi({ k, v, sub, color, small }: {
  k: ReactNode; v: ReactNode; sub?: ReactNode; color?: string; small?: boolean;
}) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.pinkSoft}`, borderRadius: 16, padding: "13px 16px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.plumSoft }}>{k}</div>
      <div style={{ fontSize: small ? 21 : 27, fontWeight: 800, color, fontFamily: NUM, letterSpacing: "-.02em", marginTop: 2 }}>{v}</div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.plumSoft }}>{sub}</div>
    </div>
  );
}

function TimelineOverview({ acts, year, onPickMonth, onPickDept }: {
  acts: Activity[]; year: number;
  onPickMonth?: (m: number) => void; onPickDept?: (d: string) => void;
}) {
  const { months, noDeadline, deptRows, kpi } = useMemo(() => {
    const months = Array.from({ length: 12 }, () => ({ done: 0, over: 0, prog: 0, chua: 0, total: 0 }));
    const deptM = new Map();
    let noDeadline = 0;
    for (const a of acts) {
      const b = ovBucket(a.st);
      const d = a.dept || "qa";
      const dm = deptM.get(d) || { total: 0, done: 0, over: 0 };
      dm.total++; if (b === "done") dm.done++; else if (b === "over") dm.over++;
      deptM.set(d, dm);
      const t = a.target ? parseD(a.target) : null;
      if (!t) { noDeadline++; continue; }
      if (t.getFullYear() !== year) continue;
      const m = months[t.getMonth()] as unknown as Record<string, number>;
      m.total++; m[b]++;
    }
    const deptRows = DEPTS
      .map((d) => ({ id: d.id, code: d.short, name: d.name, ...(deptM.get(d.id) || { total: 0, done: 0, over: 0 }) }))
      .filter((r) => r.total > 0)
      .sort((x, y) => y.total - x.total);
    const nowM = vmpToday().getMonth();
    let peakI = 0;
    months.forEach((m, i) => { if (m.total > months[peakI].total) peakI = i; });
    const overAll = acts.filter((a: Activity) => a.st === "over").length;
    const kpi = { totalAll: acts.length, overAll, thisMonth: months[nowM].total, nowM, peakI, peak: months[peakI].total };
    return { months, noDeadline, deptRows, kpi };
  }, [acts, year]);

  const maxT = Math.max(1, ...months.map((m) => m.total));
  const H = 210, nowM = vmpToday().getMonth();
  const maxDeptTotal = deptRows.length ? deptRows[0].total : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(148px,1fr))", gap: 12 }}>
        <OvKpi k="Tổng hạng mục" v={kpi.totalAll} sub={noDeadline ? `${noDeadline} chưa có deadline` : "trong bộ lọc"} color={C.plum} />
        <OvKpi k="Quá hạn" v={kpi.overAll} sub={kpi.totalAll ? `${Math.round(kpi.overAll / kpi.totalAll * 100)}% tổng` : "0%"} color={C.raspText} />
        <OvKpi k="Đến hạn tháng này" v={kpi.thisMonth} sub={MONTHS[kpi.nowM]} color={C.marigoldText} />
        <OvKpi k="Tháng cao điểm" v={`${MONTHS[kpi.peakI]} · ${kpi.peak}`} sub="khối lượng lớn nhất" color={C.pinkText} small />
      </div>

      {/* Biểu đồ tháng */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <strong style={{ fontFamily: TEXT, fontSize: 15, color: C.plum }}>Tải VMP theo tháng · {year}</strong>
          <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>Bấm một cột để xem chi tiết tháng đó</span>
        </div>
        <div className="vmp-scroll" style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(44px,1fr))", gap: 10, alignItems: "end", height: H + 46, minWidth: 620, paddingTop: 20 }}>
            {months.map((m, i) => {
              const barH = m.total / maxT * H;
              const isNow = i === nowM;
              return (
                <button key={i} type="button" onClick={() => onPickMonth?.(i)}
                  title={`${MONTHS[i]}: ${m.total} hạng mục — Xong ${m.done} · Quá hạn ${m.over} · Đang ${m.prog} · Chưa ${m.chua}`}
                  style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", position: "relative", border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
                  <span style={{ position: "absolute", top: -18, left: 0, right: 0, textAlign: "center", fontSize: 12, fontWeight: 800, color: C.plum, fontFamily: NUM }}>{m.total || ""}</span>
                  <div style={{ display: "flex", flexDirection: "column-reverse", borderRadius: "8px 8px 3px 3px", overflow: "hidden", height: barH, minHeight: m.total ? 4 : 0, outline: isNow ? `2px solid ${C.pink}` : "none", outlineOffset: 2 }}>
                    {OV_STATUS.map((s) => {
                      const mm = m as unknown as Record<string, number>;
                      return mm[s.k] > 0
                        ? <div key={s.k} style={{
                            height: mm[s.k] / mm.total * barH,
                            background: (OV_COLOR as Record<string, string>)[s.k],
                          }} />
                        : null;
                    })}
                  </div>
                  <span style={{ marginTop: 8, textAlign: "center", fontSize: 12, fontWeight: 800, color: isNow ? C.pinkText : C.plumSoft }}>{MONTHS[i]}{isNow ? " ●" : ""}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 14 }}>
          {OV_STATUS.map((s) => (
            <span key={s.k} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: C.plumSoft }}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: (OV_COLOR as Record<string, string>)[s.k] }} />{s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Sức khoẻ theo bộ phận */}
      {deptRows.length > 0 && (
        <div>
          <strong style={{ fontFamily: TEXT, fontSize: 15, color: C.plum }}>Sức khoẻ theo bộ phận quản lý</strong>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 10 }}>
            {deptRows.map((r) => {
              const rest = r.total - r.done - r.over;
              const pc = (n: number): string => (n / r.total * 100) + "%";
              return (
                <button key={r.id} type="button" onClick={() => onPickDept?.(r.id)}
                  title={`${r.name}: ${r.total} — xong ${r.done}, quá hạn ${r.over}`}
                  style={{ display: "grid", gridTemplateColumns: "58px 1fr 92px", alignItems: "center", gap: 12, border: "none", background: "transparent", cursor: "pointer", padding: 0, textAlign: "left" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.plum }}>{r.code}</span>
                  <span style={{ height: 20, borderRadius: 7, background: C.pinkMist, overflow: "hidden", display: "flex", width: (r.total / maxDeptTotal * 100) + "%" }}>
                    <span style={{ width: pc(r.done), background: C.mint }} />
                    <span style={{ width: pc(r.over), background: C.rasp }} />
                    <span style={{ width: pc(rest), background: C.sky }} />
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.plumSoft, textAlign: "right", fontFamily: NUM }}>{r.total} · <b style={{ color: C.raspText }}>{r.over} QH</b></span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TimelineView({ acts, objects = [] }: {
  acts: Activity[]; objects?: VmpObject[];
}) {
  const year = vmpToday().getFullYear();
  const [workspace, setWorkspace] = useState("overview");
  const [view, setView] = useState("year");
  const [scope, setScope] = useState("year");
  const [chartMode, setChartMode] = useState("table");
  const [tableStage, setTableStage] = useState("all");
  const [density, setDensity] = useState("compact");
  const [focusMonth, setFocusMonth] = useState(vmpToday().getMonth());
  const [cls, setCls] = useState("all");
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Activity | null>(null);
  const dq = useDebounce(q, 300);

  const range = useMemo(() => rangeFor(view, focusMonth, year), [view, focusMonth, year]);
  const chartWidth = chartWidthFor(view, density);

  const setViewMode = (mode: string) => {
    setView(mode);
    if (mode === "year") setScope("year");
    else setScope("period");
  };

  const setScopeMode = (mode: string) => {
    setScope(mode);
    if (mode === "year") setView("year");
    else if (view === "year") setView("month");
  };

  const filtered = useMemo(() => {
    const needle = dq.trim().toLowerCase();
    return acts
      .filter((a: Activity) => {
        if (!a.target) return false;
        if ((a.state || "active") !== "active") return false;
        if (cls !== "all" && a.cls !== cls) return false;
        if (dept !== "all" && a.dept !== dept) return false;
        if (status !== "all" && issueLevel(a) !== status) return false;

        const { start, end } = taskWindow(a);
        if (!intersectsRange(start, end, range)) return false;

        if (needle) {
          const hay = [a.code, a.name, ownerOf(a), a.id, a.vtype, a.dep, a.crit]
            .map((x) => String(x || "").toLowerCase());
          if (!hay.some((x) => x.includes(needle))) return false;
        }
        return true;
      })
      .sort(compareTimelineOrder);
  }, [acts, cls, dept, dq, range, status]);

  // Tập dữ liệu cho các tab phân tích (Sơ đồ/Bố cục/Bảng): cùng bộ lọc nhưng
  // KHÔNG giới hạn theo khung tháng/quý — để nhìn toàn cảnh.
  const explorerActs = useMemo(() => {
    const needle = dq.trim().toLowerCase();
    return acts.filter((a: Activity) => {
      if ((a.state || "active") !== "active") return false;
      if (cls !== "all" && a.cls !== cls) return false;
      if (dept !== "all" && a.dept !== dept) return false;
      if (status !== "all" && issueLevel(a) !== status) return false;
      if (needle) {
        const hay = [a.code, a.name, ownerOf(a), a.id, a.vtype, a.dep, a.crit].map((x) => String(x || "").toLowerCase());
        if (!hay.some((x) => x.includes(needle))) return false;
      }
      return true;
    });
  }, [acts, cls, dept, dq, status]);

  const visualModel = useMemo(
    () => buildVisualModel({ objects, activities: explorerActs }),
    [objects, explorerActs],
  );
  const isTimeline = workspace === "timeline";

  const resetFilters = () => {
    setCls("all");
    setDept("all");
    setStatus("all");
    setQ("");
  };

  const shiftRange = (delta: number) => {
    if (view === "year") return;
    const step = view === "quarter" ? 3 : 1;
    setFocusMonth((m) => clamp(m + delta * step, 0, 11));
  };

  const setQuarter = (qIndex: number) => setFocusMonth(qIndex * 3);
  const goNextQuarter = () => {
    const nq = Math.floor(vmpToday().getMonth() / 3) + 1;
    if (nq > 3) return;
    setView("quarter");
    setScope("period");
    setFocusMonth(nq * 3);
  };
  // Dựng sẵn cho TimelineRangeRail (bấm vào một dải thời gian để zoom vào
  // tháng đó). Rail chưa được gắn vào bố cục hiện tại — giữ để nối sau.
  const focusBand = (band: { start: Date; [k: string]: unknown }) => {
    setFocusMonth(band.start.getMonth());
    setView("month");
    setScope("period");
  };
  void focusBand;
  const hasFilters = cls !== "all" || dept !== "all" || status !== "all" || q.trim();

  return (
    <div className="timeline-page-shell">
      <Card variant="strong" cls="timeline-workbench">
        <div className="timeline-workbench-head">
          <div className="timeline-title-block">
            <span className="timeline-title-icon">
              <GanttChartSquare size={21} />
            </span>
            <div>
              <div className="timeline-title-kicker">Timeline intelligence</div>
              <div className="timeline-title">Timeline VMP{isTimeline ? ` · ${range.title}` : ""}</div>
              <div className="timeline-subtitle">
                {isTimeline
                  ? "Theo dõi 3 mốc Đề cương · Thẩm định · Hoàn thành VMP trên dòng thời gian, có vạch ngày hôm nay"
                  : "Sơ đồ luồng, bố cục dashboard và bảng dữ liệu — cùng một bộ lọc, từ dữ liệu Supabase hiện có"}
              </div>
            </div>
          </div>

          <div className="timeline-board-tools">
            <div className="timeline-mode-controls" aria-label="Không gian làm việc">
              {WORKSPACES.map((w) => {
                const Icon = w.icon;
                return (
                  <ScopeButton key={w.id} active={workspace === w.id} onClick={() => setWorkspace(w.id)}>
                    <Icon size={14} style={{ marginRight: 5, verticalAlign: "-2px" }} />{w.label}
                  </ScopeButton>
                );
              })}
            </div>
            {isTimeline && (
              <div className="timeline-mode-controls" aria-label="Kiểu bản đồ timeline">
                {Object.entries(CHART_LABELS).map(([k, label]) => (
                  <ScopeButton
                    key={k}
                    active={chartMode === k}
                    onClick={() => setChartMode(k)}
                    title={k === "table"
                      ? "Bảng timeline có hàng/cột rõ để quan sát sơ đồ"
                      : k === "stage"
                        ? "Sơ đồ gọn theo đích VMP và 3 mốc chính"
                        : "Sơ đồ gọn kết hợp trục timeline cũ"}
                  >
                    {label}
                  </ScopeButton>
                ))}
              </div>
            )}
            {(isTimeline || workspace === "table") && (
              <div className="timeline-density-controls" aria-label="Mật độ hiển thị">
                {Object.entries(DENSITY_LABELS).map(([k, label]) => (
                  <ScopeButton
                    key={k}
                    active={density === k}
                    onClick={() => setDensity(k)}
                    title={k === "compact" ? "Hiển thị nhiều hạng mục hơn" : "Hiển thị thoáng và dễ đọc hơn"}
                  >
                    {label}
                  </ScopeButton>
                ))}
              </div>
            )}
          </div>
        </div>

        {isTimeline && (
        <div className="timeline-command-bar">
          <div className="timeline-view-controls">
            {Object.entries(VIEW_LABELS).map(([k, label]) => (
              <ControlButton key={k} active={view === k} onClick={() => setViewMode(k)}>
                {label}
              </ControlButton>
            ))}
          </div>

          <div className="timeline-range-controls">
            <button
              type="button"
              onClick={() => shiftRange(-1)}
              disabled={view === "year" || focusMonth === 0}
              className="timeline-icon-btn"
              title="Lùi kỳ"
            >
              <ChevronLeft size={16} />
            </button>
            {view === "month" && (
              <select
                value={focusMonth}
                onChange={(e) => setFocusMonth(Number(e.target.value))}
                className="timeline-select"
                aria-label="Chọn tháng"
              >
                {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
            )}
            {view === "quarter" && (
              <div className="timeline-quarter-controls">
                {[0, 1, 2, 3].map((qIndex) => (
                  <ControlButton
                    key={qIndex}
                    active={Math.floor(focusMonth / 3) === qIndex}
                    onClick={() => setQuarter(qIndex)}
                  >
                    Quý {qIndex + 1}
                  </ControlButton>
                ))}
              </div>
            )}
            {view === "year" && (
              <span className="timeline-year-chip">Toàn năm {year}</span>
            )}
            <button
              type="button"
              onClick={() => shiftRange(1)}
              disabled={view === "year" || focusMonth >= (view === "quarter" ? 9 : 11)}
              className="timeline-icon-btn"
              title="Tiến kỳ"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="timeline-scope-inline" aria-label="Phạm vi hiển thị timeline">
            {Object.entries(SCOPE_LABELS).map(([k, label]) => (
              <ScopeButton key={k} active={scope === k} onClick={() => setScopeMode(k)}>
                {label}
              </ScopeButton>
            ))}
          </div>
        </div>
        )}

        <div className="timeline-filter-row timeline-filter-row--workbench">
          <div className="timeline-filter-label">
            <Filter size={15} />
            <span>Lọc</span>
          </div>
          <select value={cls} onChange={(e) => setCls(e.target.value)} className="timeline-select">
            <option value="all">Tất cả nhóm</option>
            {Object.keys(CLS).map((k) => (
              <option key={k} value={k}>{(CLS as Record<string, { label: string }>)[k].label}</option>
            ))}
          </select>
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="timeline-select">
            <option value="all">Tất cả bộ phận</option>
            {DEPTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="timeline-select">
            <option value="all">Tất cả tình trạng</option>
            <option value="over">Cần chú ý</option>
            <option value="prog">Đang chạy</option>
            <option value="todo">Kế hoạch</option>
            <option value="done">Đã xong</option>
          </select>
          <div className="timeline-search">
            <Search size={15} color={C.pink} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm mã, tên, QA, loại thẩm định…"
            />
          </div>
          {hasFilters && (
            <button type="button" onClick={resetFilters} className="timeline-clear-btn">
              Xoá lọc
            </button>
          )}
        </div>

        {workspace === "overview" ? (
          <TimelineOverview
            acts={explorerActs}
            year={year}
            onPickMonth={(m) => { setFocusMonth(m); setView("month"); setWorkspace("timeline"); }}
            onPickDept={(d) => { setDept(d); setWorkspace("timeline"); }}
          />
        ) : isTimeline ? (
        <>
        <TimelineStageProgress
          items={filtered}
          year={year}
          onOverdue={() => setStatus("over")}
          onNextQuarter={goNextQuarter}
        />

        <div className="timeline-map-surface">
          <div className="timeline-map-surface__head">
            <div>
              <strong>
                {chartMode === "table"
                  ? tableStage === "all"
                    ? "Sơ đồ dòng thời gian tổng hợp"
                    : `Bảng ${(TABLE_STAGE_LABELS as Record<string, string>)[tableStage]}`
                  : chartMode === "stage"
                    ? "Sơ đồ 3 mốc"
                    : "Sơ đồ 3 mốc + trục thời gian"}
              </strong>
              <span>
                {filtered.length} hạng mục · {chartMode === "table" && tableStage !== "all"
                  ? `${(TABLE_STAGE_LABELS as Record<string, string>)[tableStage]} · sắp xếp theo thời gian, mốc sắp tới trước`
                  : "Đề cương / Thẩm định thực tế / Hoàn thành VMP · ưu tiên mốc sắp tới"}
              </span>
            </div>
            {chartMode === "table" ? (
              <div className="timeline-table-tabs" aria-label="Chọn bảng timeline theo mốc">
                {Object.entries(TABLE_STAGE_LABELS).map(([key, label]) => (
                  <button
                    type="button"
                    key={key}
                    data-short={(TABLE_STAGE_SHORT_LABELS as Record<string, string>)[key]}
                    className={`timeline-table-tab timeline-table-tab--${key} ${tableStage === key ? "is-active" : ""}`}
                    onClick={() => setTableStage(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="timeline-map-legend">
                {MAP_STAGES.map((stage: (typeof MAP_STAGES)[number]) => (
                  <span key={stage.id} className={`timeline-map-legend__item timeline-map-legend__item--${stage.id}`}>
                    <i />{stage.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {chartMode === "table" && <TimelineFlowLegend />}

          {chartMode === "table" ? (
            <TimelineTableBoard
              items={filtered}
              onOpen={setDetail}
              density={density}
              range={range}
              tableStage={tableStage}
            />
          ) : chartMode === "stage" ? (
            <TimelineStageBoard items={filtered} onOpen={setDetail} density={density} />
          ) : (
            <TimelineHybridBoard
              range={range}
              items={filtered}
              width={chartWidth}
              onOpen={setDetail}
              density={density}
            />
          )}
        </div>
        </>
        ) : workspace === "diagram" ? (
          <DiagramPanel nodes={visualModel.diagramNodes} edges={visualModel.diagramEdges} onSelectNode={() => {}} selectedNodeId="" />
        ) : workspace === "dashboard" ? (
          <DashboardPanel
            metrics={visualModel.dashboardMetrics}
            events={visualModel.timelineEvents}
            onSelectStatus={(s) => { setStatus(["over", "prog", "todo", "done"].includes(s) ? s : "all"); setWorkspace("timeline"); }}
          />
        ) : (
          <TablePanel events={visualModel.timelineEvents} selectedId=""
            onSelect={(ev) => setDetail((ev.raw as Activity) ?? null)} density={density} />
        )}
      </Card>

      <ActivityDetailModal a={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

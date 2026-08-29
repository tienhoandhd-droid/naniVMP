/* TimelinePage.jsx — Modern Gantt Timeline VMP */
import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import {
  BarChart3,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  GanttChartSquare,
  Search,
} from "lucide-react";
import { C, TEXT, NUM, GRAD } from "../constants/theme.ts";
import { CLS, DEPTS, CRIT, MONTHS, SOON_DAYS, vmpToday } from "../constants/vmp.ts";
import { parseD, fmtVN, milestones, addDays, clamp, wlIsDone } from "../utils/helpers.ts";
import { useDebounce } from "../hooks/index.ts";
import { Card, CardTitle, Tag, Modal, Pill, phaseTag, CauKetLuan } from "../components/ui/Primitives.tsx";
import { btnPrimary } from "../constants/theme.ts";
import MetricGrid from "../components/ui/MetricGrid.tsx";
import {
  buildTimelineSummary, issueLevel, timDiemNong, timNutThat,
} from "../features/timeline/timelineSummaryModel.ts";
import {
  buildTimelineFilterSets, TIMELINE_FILTER_DEFAULTS, timelineActiveFilterCount, timelineFilterChips, timelineOwnerOf,
} from "../features/timeline/timelineFilterModel.ts";
import { buildVmpMonthBands } from "../features/timeline/timelineYearModel.ts";
import TimelineInspector from "../features/timeline/TimelineInspector.tsx";
import PlannedDeadlineDialog from "../features/timeline/PlannedDeadlineDialog.tsx";
import { canPresentPlannedDeadlineEdit } from "../features/timeline/plannedDeadlineEditModel.ts";
import BieuDoKiemSoat from "../components/dashboard/BieuDoKiemSoat.tsx";
// Khối 3D nạp theo yêu cầu — chung chunk three.js với các màn khác.
import { nhapCoThuLai } from "../lib/tailMan.ts";
const WorkloadSpace3D = lazy(nhapCoThuLai(() => import("../components/three/WorkloadSpace3D.tsx")));
import type { ReactNode } from "react";
import type { Activity } from "../types/domain.ts";
import type { WorkloadCell } from "../lib/workloadMap.ts";

// Các "không gian làm việc" gộp chung dưới menu Timeline VMP: timeline sâu +
// Chỉ hai góc nhìn. Ba tab "Sơ đồ · Bố cục · Bảng" đã bỏ (29/07/2026):
// cả ba vẽ lại cùng bộ dữ liệu mà tab Timeline đã hiện đầy đủ hơn — Sơ đồ
// và Bố cục chỉ đổi cách bày, còn Bảng thì trùng hẳn với chế độ bảng có
// sẵn trong Timeline. Năm tab cho hai nội dung chỉ làm người dùng phải
// thử từng cái mới biết cái nào có thứ mình cần.
const WORKSPACES = [
  { id: "overview", label: "Tổng quan", icon: BarChart3 },
  { id: "timeline", label: "Dòng thời gian", icon: GanttChartSquare },
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

/* Dọn 16/08 (nghiên cứu 1+2): hai kiểu vẽ "Sơ đồ 3 mốc" và "Sơ đồ +
 * Gantt" đã BỎ — cả ba cùng vẽ một bộ dữ liệu, bảng ngày tổng hợp là
 * mặt duy nhất; logic đáng giữ của chúng đã nằm trong bảng + strip. */

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

const MAP_STAGES = [
  { id: "protocol", label: "Đề cương", short: "ĐC", field: "tt_de_cuong", actual: "ngay_de_cuong", due: "protocol" },
  { id: "validation", label: "Thẩm định thực tế", short: "TT", field: "tt_tham_dinh", actual: "ngay_tham_dinh", due: "validation" },
  { id: "vmp", label: "Hoàn thành VMP", short: "VMP", field: "tt_vmp", actual: "ngay_vmp", due: "target" },
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

function minDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
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

/* issueLevel đã DỜI sang features/timeline/timelineSummaryModel.ts (bước
 * Foundation của nghiên cứu Timeline 16/08) — một nguồn chân lý cho cả
 * strip KPI, bộ lọc tình trạng và unit test. */

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
        background: active ? GRAD : C.surface,
        color: active ? "#fff" : C.plum,
        borderRadius: 999,
        padding: "9px 14px",
        cursor: "pointer",
        fontFamily: TEXT,
        fontSize: 12,
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
      borderRadius: 14,
      padding: "13px 14px",
      background: bg,
      border: "1px solid rgba(255,255,255,.7)",
    }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: .35, textTransform: "uppercase", color }}>{label}</div>
      <div className="tnum" style={{ fontFamily: NUM, fontSize: 28, lineHeight: 1.02, fontWeight: 900, color, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, fontWeight: 700, color: C.plumSoft, marginTop: 3 }}>{sub}</div>}
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

export function TimelineRangeRail({ items, range, view, onFocusBand, monthBands }: {
  items: Activity[]; range: TimeRange; view: string;
  onFocusBand?: (band: { label: string; start: Date; end: Date; [k: string]: unknown }) => void;
  monthBands?: Array<{ month: number; label: string; count: number; done: number; overdue: number; rate: number }>;
}) {
  const bands = monthBands || bandSummary(items, range);
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
          const over = "overdue" in band ? band.overdue : band.over;
          const prog = "prog" in band ? band.prog : Math.max(0, band.count - band.done - over);
          const load = Math.max(4, Math.round((band.count / maxCount) * 100));
          const doneW = band.count ? Math.round((band.done / band.count) * 100) : 0;
          const overW = band.count ? Math.round((over / band.count) * 100) : 0;
          const progW = band.count ? Math.round((prog / band.count) * 100) : 0;
          return (
            <button
              type="button"
              key={`${band.label}-${index}`}
              data-timeline-month-action={"month" in band ? band.month : undefined}
              className={`timeline-range-rail__band ${over ? "timeline-range-rail__band--over" : ""} ${band.count ? "" : "timeline-range-rail__band--empty"}`}
              onClick={() => {
                if (!canFocus) return;
                onFocusBand?.({
                  ...band,
                  start: "start" in band ? band.start : new Date(range.year, band.month, 1),
                  end: "end" in band ? band.end : new Date(range.year, band.month + 1, 0),
                });
              }}
              disabled={!canFocus}
              title={`${band.label}: ${band.count} đích VMP, ${band.done} hoàn thành, ${over} cần chú ý`}
              aria-label={`${band.label}: ${band.count} đích VMP, ${band.done} hoàn thành, ${over} cần chú ý${canFocus ? ". Mở tháng" : ""}`}
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
                {canFocus && <em className="timeline-range-rail__action">Mở tháng</em>}
              </span>
            </button>
          );
        })}
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

/* ===================== LỚP THUYẾT MINH TRÊN GANTT =====================
 * Gantt bên dưới là biểu đồ KHÁM PHÁ: 461 dòng, ai cần tra hạng mục nào
 * thì tra. Nó làm tốt việc đó. Nhưng nó không trả lời được câu hỏi mà
 * người xem mang tới khi vừa mở trang: "có gì đang cháy không, cháy tới
 * mức nào, và tôi phải động vào cái gì trước".
 *
 * Muốn biết bằng Gantt thì phải rà 461 dòng bằng mắt — đúng thứ mà biểu
 * đồ sinh ra để khỏi phải làm.
 *
 * Lớp này trả lời đúng câu đó, theo ba luật của explanatory visualization:
 *  1. Tiêu đề nói KẾT LUẬN kèm số, không nói chủ đề
 *  2. Màu để CHỈ TAY — chỉ nhóm quá hạn có màu nhấn, phần còn lại xám;
 *     mức trễ mã hoá bằng ĐỘ ĐẬM của cùng một màu, không đổi sang màu khác
 *  3. Chỉ hiện thứ cần hành động; phần đúng nhịp gộp thành một dòng chữ
 *
 * Không 3D hoá: dữ liệu ở đây chỉ có hai chiều (thời gian × số lượng).
 * Thêm chiều thứ ba là thêm một lớp phải giải mã trước khi đọc được số,
 * đúng thứ chống lại "rút ngắn thời gian tiếp nhận".
 */
const FOCUS_NHOM = [
  { id: "tre30", label: "Trễ trên 30 ngày", ngan: "> 30 ng", dam: 1, test: (d: number) => d < -30 },
  { id: "tre8", label: "Trễ 8–30 ngày", ngan: "8–30 ng", dam: 0.74, test: (d: number) => d >= -30 && d <= -8 },
  { id: "tre1", label: "Trễ 1–7 ngày", ngan: "1–7 ng", dam: 0.5, test: (d: number) => d >= -7 && d <= -1 },
  { id: "homnay", label: "Đến hạn hôm nay", ngan: "hôm nay", dam: 0.34, test: (d: number) => d === 0 },
  { id: "toi7", label: "Còn 1–7 ngày", ngan: "1–7 ng", dam: 0, test: (d: number) => d >= 1 && d <= 7 },
  { id: "toi30", label: "Còn 8–30 ngày", ngan: "8–30 ng", dam: 0, test: (d: number) => d >= 8 && d <= SOON_DAYS },
];

function focusItems(items: Activity[]) {
  const canhBao: Array<{ a: Activity; con: number; stage: (typeof MAP_STAGES)[number] }> = [];
  let dungNhip = 0;
  let xong = 0;
  for (const a of items) {
    if (issueLevel(a) === "done") { xong += 1; continue; }
    const next = nextPendingMilestone(a);
    const con = next ? daysUntil(next.state.due) : null;
    if (next && con != null && con <= SOON_DAYS) canhBao.push({ a, con, stage: next.stage });
    else dungNhip += 1;
  }
  canhBao.sort((x, y) => x.con - y.con || compareByTarget(x.a, y.a));
  return { canhBao, dungNhip, xong };
}

function TimelineFocusLayer({ items, onOpen, onLocQuaHan }: {
  items: Activity[];
  onOpen: (a: Activity) => void;
  onLocQuaHan?: () => void;
}) {
  const { canhBao, dungNhip, xong } = useMemo(() => focusItems(items), [items]);

  const nhom = useMemo(
    () => FOCUS_NHOM.map((n) => ({ ...n, rows: canhBao.filter((c) => n.test(c.con)) })),
    [canhBao],
  );
  const daTre = canhBao.filter((c) => c.con < 0);
  const toiHan = canhBao.filter((c) => c.con >= 0);
  const maxN = Math.max(1, ...nhom.map((n) => n.rows.length));

  /* Nút thắt nằm ở mốc nào — câu này quyết định hành động khác hẳn nhau:
     kẹt ở Đề cương là kẹt giấy tờ, kẹt ở Thẩm định thực tế là kẹt hiện trường. */
  const nutThat = useMemo(() => {
    const dem = new Map<string, number>();
    for (const c of daTre) dem.set(c.stage.id, (dem.get(c.stage.id) || 0) + 1);
    const top = [...dem.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    const stage = MAP_STAGES.find((s) => s.id === top[0]);
    return stage ? { label: stage.label, n: top[1] } : null;
  }, [daTre]);

  const ketLuan = useMemo(() => {
    if (!items.length) {
      return { chinh: "Không có hạng mục nào trong bộ lọc hiện tại.", phu: "", tone: "ok" as const };
    }
    if (!canhBao.length) {
      return {
        chinh: `Không có hạng mục nào trễ hạn hay tới hạn trong ${SOON_DAYS} ngày tới.`,
        phu: `${dungNhip} hạng mục còn hạn xa và ${xong} đã xong — không có việc phải xử gấp.`,
        tone: "ok" as const,
      };
    }
    const nang = daTre[0];
    if (daTre.length) {
      return {
        chinh: `${daTre.length} hạng mục đã trễ hạn — nặng nhất là ${nang.a.code} trễ ${Math.abs(nang.con)} ngày ở mốc ${nang.stage.label.toLowerCase()}.`
          + (toiHan.length ? ` Thêm ${toiHan.length} hạng mục tới hạn trong ${SOON_DAYS} ngày.` : ""),
        phu: nutThat && nutThat.n > 1
          ? `Phần lớn chỗ tắc nằm ở mốc ${nutThat.label} (${nutThat.n}/${daTre.length}) — xử một mốc gỡ được nhiều hạng mục hơn là xử từng hạng mục.`
          : "Danh sách dưới đây xếp theo mức trễ, trễ nhất lên trước.",
        tone: "over" as const,
      };
    }
    const gan = toiHan[0];
    return {
      chinh: `Chưa hạng mục nào trễ, nhưng ${toiHan.length} hạng mục tới hạn trong ${SOON_DAYS} ngày — sớm nhất là ${gan.a.code}, còn ${gan.con} ngày.`,
      phu: `${dungNhip} hạng mục khác còn hạn xa, ${xong} đã xong.`,
      tone: "warn" as const,
    };
  }, [items.length, canhBao.length, daTre, toiHan, dungNhip, xong, nutThat]);

  const HIEN = 6;

  return (
    <section className="tl-focus" aria-label="Lớp thuyết minh — việc cần xử trước">
      <CauKetLuan chinh={ketLuan.chinh} phu={ketLuan.phu} tone={ketLuan.tone} />

      {canhBao.length > 0 && (
        <>
          {/* Làn đếm ngược. Trục ngang là thời gian tính từ hôm nay: bên
              trái đã trễ, bên phải sắp tới. Chiều cao là số hạng mục.
              Đọc một lần là biết "gánh nặng đang nằm ở quá khứ hay tương
              lai" — điều mà danh sách 461 dòng không nói được. */}
          <div className="tl-focus-lan" role="group" aria-label="Phân bố theo mức trễ và mức gấp">
            {nhom.map((n) => {
              const cao = Math.round((n.rows.length / maxN) * 100);
              const treHan = n.dam > 0 || n.id === "homnay";
              return (
                <div key={n.id} className={`tl-focus-o ${treHan ? "tl-focus-o--tre" : ""} ${n.rows.length ? "" : "tl-focus-o--rong"}`}>
                  <b className="tnum">{n.rows.length || ""}</b>
                  <span className="tl-focus-cot">
                    <i style={{
                      height: `${Math.max(n.rows.length ? 5 : 0, cao)}%`,
                      // Mức trễ mã hoá bằng ĐỘ ĐẬM của một màu, không đổi
                      // sang màu khác — đây là thang cường độ, không phải
                      // các loại khác nhau.
                      opacity: treHan ? 0.42 + n.dam * 0.58 : 1,
                    }} />
                  </span>
                  <small>{n.label}</small>
                </div>
              );
            })}
            <span className="tl-focus-moc" aria-hidden="true">hôm nay</span>
          </div>

          {/* Danh sách việc phải động vào trước. Sáu dòng, không phải bốn
              trăm — quá số này thì thành bảng tra cứu, mà bảng tra cứu đã
              nằm ngay bên dưới rồi. */}
          <ol className="tl-focus-ds">
            {canhBao.slice(0, HIEN).map(({ a, con, stage }) => {
              const dept = DEPTS.find((d) => d.id === a.dept);
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => onOpen(a)}
                    title={`${a.code} · ${a.name}\n${stage.label}: hạn ${fmtVN(nextPendingMilestone(a)?.state.due)}`}>
                    <span className={`tl-focus-ngay ${con < 0 ? "is-tre" : "is-toi"}`}>
                      {con < 0 ? `trễ ${Math.abs(con)}` : con === 0 ? "hôm nay" : `còn ${con}`}
                      {con !== 0 && <small>ngày</small>}
                    </span>
                    <span className="tl-focus-ten">
                      <b>{a.code}</b>
                      <span>{a.name}</span>
                    </span>
                    <span className="tl-focus-meta">
                      {stage.short} · {dept?.short || a.dept || "—"} · {ownerOf(a)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="tl-focus-chan">
            {canhBao.length > HIEN && (
              <button type="button" className="tl-focus-them" onClick={onLocQuaHan}>
                Còn {canhBao.length - HIEN} hạng mục nữa cần chú ý — lọc để xem hết
              </button>
            )}
            <span>
              {dungNhip} hạng mục còn hạn xa · {xong} đã xong — tra chi tiết ở bảng bên dưới.
            </span>
          </div>
        </>
      )}
    </section>
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

  /* ẢO HOÁ HÀNG (đợt 4 — hiệu năng, nghiên cứu 4+5): dữ liệu thật ~460
     hạng mục × hàng chục ô mỗi hàng làm cuộn giật. Vượt NGƯỠNG 100 dòng
     thì chỉ dựng lát đang thấy (+8 hàng đệm mỗi phía); hai hàng đệm
     rỗng giữ nguyên tổng chiều cao nên thanh cuộn không nhảy. Dưới
     ngưỡng giữ nguyên đường cũ. Chiều cao hàng ĐO từ hàng thật đầu
     tiên — ước lượng ban đầu chỉ dùng cho khung hình đầu. */
  const AO_HOA_TU = 100;
  const aoHoa = tableItems.length > AO_HOA_TU;
  const [cuon, setCuon] = useState(0);
  const [caoKhung, setCaoKhung] = useState(600);
  const caoHang = useRef(density === "compact" ? 64 : 78);
  useEffect(() => {
    if (!aoHoa) return;
    const el = boardRef.current;
    if (!el) return;
    const capNhat = () => { setCuon(el.scrollTop); setCaoKhung(el.clientHeight); };
    capNhat();
    let khung = 0;
    const nghe = () => {
      if (khung) return;
      khung = requestAnimationFrame(() => { khung = 0; capNhat(); });
    };
    el.addEventListener("scroll", nghe, { passive: true });
    const ro = new ResizeObserver(capNhat);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", nghe);
      ro.disconnect();
      if (khung) cancelAnimationFrame(khung);
    };
  }, [aoHoa]);
  useEffect(() => {
    if (!aoHoa) return;
    const hang = boardRef.current?.querySelector<HTMLTableRowElement>("tbody tr.timeline-day-row");
    const cao = hang?.getBoundingClientRect().height;
    if (cao && cao > 20) caoHang.current = cao;
  });
  const hangDau = aoHoa ? Math.max(0, Math.floor(cuon / caoHang.current) - 8) : 0;
  const hangCuoi = aoHoa
    ? Math.min(tableItems.length, Math.ceil((cuon + caoKhung) / caoHang.current) + 8)
    : tableItems.length;
  const hangHienThi = aoHoa ? tableItems.slice(hangDau, hangCuoi) : tableItems;
  const demTren = hangDau * caoHang.current;
  const demDuoi = (tableItems.length - hangCuoi) * caoHang.current;

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
          {aoHoa && demTren > 0 && (
            <tr aria-hidden="true" style={{ height: demTren }}>
              <td colSpan={3} style={{ padding: 0, border: 0 }} />
            </tr>
          )}
          {hangHienThi.map((a: Activity) => {
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
          {aoHoa && demDuoi > 0 && (
            <tr aria-hidden="true" style={{ height: demDuoi }}>
              <td colSpan={3} style={{ padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
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

function ActivityDetailModal({ a, onClose, canEditPlannedDeadlines, onEditPlannedDeadlines }: { a: Activity | null; onClose: () => void; canEditPlannedDeadlines:boolean; onEditPlannedDeadlines:(a:Activity)=>void }) {
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
        <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 800, color: cls.text, background: cls.soft, padding: "4px 10px", borderRadius: 8 }}>{a.code}</span>
        <Tag color={cls.text} bg={cls.soft}>{a.vtype}</Tag>
        <Tag color={ct.text} bg={ct.soft}>Rủi ro {a.crit}</Tag>
        <Pill s={a.st} small />
      </div>
      <div style={{ fontFamily: TEXT, fontSize: 16, fontWeight: 800, color: C.plum, marginBottom: 16 }}>{a.name}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9, marginBottom: 14 }}>
        {info.map(([k, v]) => <div key={k} style={{ background: C.surface, borderRadius: 14, padding: "8px 11px" }}><div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 800, textTransform: "uppercase", letterSpacing: .3 }}>{k}</div><div style={{ fontSize: 14, color: C.plum, fontWeight: 700, marginTop: 2 }}>{v}</div></div>)}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 190, background: C.pinkSoft, borderRadius: 14, padding: "10px 13px" }}><div style={{ fontSize: 12, color: C.pinkText, fontWeight: 800, textTransform: "uppercase" }}>QA phụ trách</div><div style={{ fontSize: 14, color: C.plum, fontWeight: 800, marginTop: 2 }}>{dShow(r.qa)}</div>{has(r.email_qa) && <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>{String(r.email_qa ?? "")}</div>}</div>
        <div style={{ flex: 1, minWidth: 190, background: C.lavSoft, borderRadius: 14, padding: "10px 13px" }}><div style={{ fontSize: 12, color: C.lavText, fontWeight: 800, textTransform: "uppercase" }}>NS bộ phận khác</div><div style={{ fontSize: 14, color: C.plum, fontWeight: 800, marginTop: 2 }}>{dShow(r.ns_khac)}</div>{has(r.email_khac) && <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>{String(r.email_khac ?? "")}</div>}</div>
      </div>
      <div style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plum, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}><CalendarClock size={17} color={C.pink} /> Vòng đời thẩm định</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {phases.map((p, i) => (
          <div key={i} style={{ background: C.surface, borderRadius: 14, padding: "11px 14px", borderLeft: `4px solid ${has(p.act) ? C.mint : C.pinkSoft}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ fontSize: 16 }}>{p.ic}</span><div><div style={{ fontSize: 14, fontWeight: 800, color: C.plum }}>{p.label}</div><div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>{p.note}</div></div></div>
              {phaseTag(String(p.st ?? ""))}
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 8, flexWrap: "wrap", fontSize: 12 }}>
              <span style={{ color: C.plumSoft, fontWeight: 600 }}>Hạn: <b style={{ color: C.plum }}>{dShow(p.dl)}</b></span>
              <span style={{ color: C.plumSoft, fontWeight: 600 }}>Thực tế: <b style={{ color: has(p.act) ? C.mintText : "#C9B6C7" }}>{dShow(p.act)}</b></span>
              {p.sched != null && has(p.sched) && <span style={{ color: C.plumSoft, fontWeight: 600 }}>Lịch xếp: <b style={{ color: C.plum }}>{dShow(p.sched)}</b></span>}
            </div>
          </div>
        ))}
      </div>
      {canEditPlannedDeadlines && <button type="button" data-timeline-edit-planned-deadlines onClick={() => onEditPlannedDeadlines(a)}>Chỉnh deadline kế hoạch</button>}
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
    <div style={{ background: C.surface, border: `1px solid ${C.pinkSoft}`, borderRadius: 14, padding: "13px 16px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.plumSoft }}>{k}</div>
      <div style={{ fontSize: small ? 21 : 27, fontWeight: 800, color, fontFamily: NUM, letterSpacing: "-.02em", marginTop: 2 }}>{v}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.plumSoft }}>{sub}</div>
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
      /* MỘT luật quá hạn cho cả trang (dọn 16/08): trước đây Tổng quan
         đếm theo a.st thuần còn strip/bộ lọc đếm theo issueLevel (pha
         trễ thắng trạng thái tổng) — hai con số "Quá hạn" khác nhau trên
         cùng màn hình là điều cấm với dữ liệu GMP. */
      const b = ovBucket(issueLevel(a));
      // Một hạng mục thuộc NHIỀU bộ phận. Bản trước chỉ đọc a.dept (một giá
      // trị), nên bộ phận nào không bao giờ đứng tên chính thì biến mất khỏi
      // biểu đồ — RD có 21 hạng mục mà không hiện dòng nào. Mọi chỗ khác
      // trong app đã đếm theo a.depts; chỗ này lệch luật.
      const ds = (a.depts && a.depts.length ? a.depts : [a.dept || "qa"]).filter(Boolean) as string[];
      for (const d of ds) {
        const dm = deptM.get(d) || { total: 0, done: 0, over: 0 };
        dm.total++; if (b === "done") dm.done++; else if (b === "over") dm.over++;
        deptM.set(d, dm);
      }
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
    const overAll = acts.filter((a: Activity) => issueLevel(a) === "over").length;
    const kpi = { totalAll: acts.length, overAll, thisMonth: months[nowM].total, nowM, peakI, peak: months[peakI].total };
    return { months, noDeadline, deptRows, kpi };
  }, [acts, year]);

  const maxT = Math.max(1, ...months.map((m) => m.total));
  const H = 210, nowM = vmpToday().getMonth();
  const maxDeptTotal = deptRows.length ? deptRows[0].total : 1;

  /* Câu kết luận của biểu đồ tháng. So tháng cao điểm với mức trung bình
     tháng — "80 hạng mục" tự nó không nói lên gì, "gấp đôi mức thường"
     thì nói ngay là có phải giãn lịch hay không. */
  const klThang = useMemo(() => {
    const coMoc = months.filter((m) => m.total > 0);
    if (!coMoc.length) {
      return { chinh: "Chưa hạng mục nào có mốc đích VMP trong năm nay.", phu: "", tone: "warn" as const };
    }
    const tb = coMoc.reduce((s, m) => s + m.total, 0) / coMoc.length;
    const lan = tb > 0 ? months[kpi.peakI].total / tb : 0;
    const quaHanDinh = months[kpi.peakI].over;
    const trong = months.map((m, i) => ({ m, i })).filter((x) => x.m.total === 0).map((x) => MONTHS[x.i]);
    return {
      chinh: lan >= 1.3
        ? `${MONTH_NAMES[kpi.peakI]} dồn ${kpi.peak} hạng mục — gấp ${lan.toFixed(1)} lần mức trung bình tháng (${Math.round(tb)}).`
        : `Khối lượng rải khá đều: tháng nặng nhất (${MONTH_NAMES[kpi.peakI]}, ${kpi.peak} hạng mục) chỉ hơn mức trung bình ${Math.round((lan - 1) * 100)}%.`,
      phu: [
        quaHanDinh > 0 ? `Riêng tháng đó đã có ${quaHanDinh} hạng mục quá hạn.` : "",
        trong.length >= 2 ? `${trong.join(", ")} chưa có hạng mục nào — còn chỗ để giãn bớt.` : "",
        "Bấm một cột để mở đúng tháng đó trên timeline.",
      ].filter(Boolean).join(" "),
      tone: lan >= 1.5 || quaHanDinh > 0 ? ("warn" as const) : ("ok" as const),
    };
  }, [months, kpi.peakI, kpi.peak]);

  /* Câu kết luận của biểu đồ bộ phận: chênh lệch tỉ lệ hoàn thành giữa
     bộ phận đứng đầu và đứng cuối — con số quyết định có phải điều phối
     lại nguồn lực hay không. */
  const klBoPhan = useMemo(() => {
    const co = deptRows.filter((r) => r.total >= 5)
      .map((r) => ({ ...r, rate: Math.round((r.done / r.total) * 100) }))
      .sort((a, b) => b.rate - a.rate);
    if (co.length < 2) return null;
    const dau = co[0], cuoi = co[co.length - 1];
    const nhieuQh = [...deptRows].sort((a, b) => b.over - a.over)[0];
    return {
      chinh: `${cuoi.name} đang chậm nhất: ${cuoi.rate}% xong trên ${cuoi.total} hạng mục, kém ${dau.code} (${dau.rate}%) ${dau.rate - cuoi.rate} điểm.`,
      phu: nhieuQh && nhieuQh.over > 0
        ? `${nhieuQh.name} giữ nhiều hạng mục quá hạn nhất (${nhieuQh.over}). Bấm một thanh để lọc theo bộ phận đó.`
        : "Bấm một thanh để lọc theo bộ phận đó.",
      tone: (dau.rate - cuoi.rate >= 25 ? "warn" : "ok") as "warn" | "ok",
    };
  }, [deptRows]);

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
          <strong style={{ fontFamily: TEXT, fontSize: 14, color: C.plum }}>Tải VMP theo tháng · {year}</strong>
        </div>
        <CauKetLuan chinh={klThang.chinh} phu={klThang.phu} tone={klThang.tone} />
        {/* Trục thời gian 12 tháng: cuộn ngang là CHỦ Ý, vì nén 12 cột vào
            390px thì mỗi cột còn 30px và biểu đồ hết đọc được. Thuộc ngoại
            lệ "bố cục hai chiều" của WCAG 1.4.10. */}
        <div className="vmp-scroll" style={{ overflowX: "auto" }} data-lp-scroll="ngang">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(44px,1fr))", gap: 10, alignItems: "end", height: H + 46, minWidth: 620, paddingTop: 20 }}>
            {months.map((m, i) => {
              const barH = m.total / maxT * H;
              const isNow = i === nowM;
              // Nhấn CHỌN LỌC chứ không giấu số. Biểu đồ này không có trục
              // giá trị và cũng không có bảng số kèm theo, nên bỏ nhãn đi là
              // đẩy mọi con số vào tooltip — người dùng bàn phím và bản in
              // mất hẳn đường đọc. Cách đúng: giữ đủ số, nhưng để số thường
              // chìm xuống nền và chỉ cho tháng cao điểm / tháng hiện tại
              // nổi lên. Mắt vẫn bắt được điểm cần nhìn ngay.
              const nhan = i === kpi.peakI || isNow;
              return (
                <button key={i} type="button" onClick={() => onPickMonth?.(i)}
                  title={`${MONTHS[i]}: ${m.total} hạng mục — Xong ${m.done} · Quá hạn ${m.over} · Đang ${m.prog} · Chưa ${m.chua}`}
                  style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", position: "relative", border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
                  <span style={{
                    position: "absolute", top: -18, left: 0, right: 0, textAlign: "center",
                    fontFamily: NUM,
                    fontSize: nhan ? 13 : 12,
                    fontWeight: nhan ? 900 : 700,
                    color: i === kpi.peakI ? C.raspText : C.plumSoft,
                    opacity: nhan ? 1 : 0.72,
                  }}>{m.total || ""}</span>
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
            <span key={s.k} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: C.plumSoft }}>
              <span style={{ width: 12, height: 12, borderRadius: 8, background: (OV_COLOR as Record<string, string>)[s.k] }} />{s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Biểu đồ kiểm soát — trả lời câu mà biểu đồ cột ở trên KHÔNG trả
          lời được: tháng tụt kia là dao động bình thường hay quy trình đã
          hỏng ở tháng đó. Không có nó thì mắt luôn thấy "tháng thấp nhất"
          và người ta đi truy nguyên một tháng vốn chỉ đang dao động. */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <strong style={{ fontFamily: TEXT, fontSize: 14, color: C.plum }}>
            Biểu đồ kiểm soát · tỉ lệ hoàn thành theo tháng
          </strong>
          <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>
            Shewhart p-chart · giới hạn ±3σ
          </span>
        </div>
        <BieuDoKiemSoat acts={acts} nam={year} />
      </div>

      {/* Tiến độ theo bộ phận quản lý */}
      {deptRows.length > 0 && (
        <div>
          <strong style={{ fontFamily: TEXT, fontSize: 14, color: C.plum }}>Tiến độ theo bộ phận quản lý</strong>
          <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 3 }}>
            Chiều dài thanh = số hạng mục · <span style={{ color: C.mintText }}>xanh: đã xong</span>
            {" · "}<span style={{ color: C.raspText }}>đỏ: quá hạn</span>
            {" · "}<span style={{ color: C.skyText }}>lam: còn lại</span> — bấm để lọc theo bộ phận
          </div>
          {klBoPhan && <div style={{ marginTop: 10 }}>
            <CauKetLuan chinh={klBoPhan.chinh} phu={klBoPhan.phu} tone={klBoPhan.tone} />
          </div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 10 }}>
            {deptRows.map((r) => {
              const rest = r.total - r.done - r.over;
              const pc = (n: number): string => (n / r.total * 100) + "%";
              return (
                <button key={r.id} type="button" onClick={() => onPickDept?.(r.id)}
                  title={`${r.name}: ${r.total} — xong ${r.done}, quá hạn ${r.over}`}
                  style={{ display: "grid", gridTemplateColumns: "58px 1fr 92px", alignItems: "center", gap: 12, border: "none", background: "transparent", cursor: "pointer", padding: 0, textAlign: "left" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: C.plum }}>{r.code}</span>
                  <span style={{ height: 26, borderRadius: 8, background: C.pinkMist, overflow: "hidden", display: "flex", width: (r.total / maxDeptTotal * 100) + "%" }}>
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

export default function TimelineView({ acts, onOpenWorkloadCell, businessRole = null, onReload = () => {} }: {
  acts: Activity[];
  onOpenWorkloadCell?: (cell: WorkloadCell) => void;
  businessRole?: string | null; onReload?: () => void;
}) {
  const year = vmpToday().getFullYear();
  const giamChuyenDong = useMemo(
    () => typeof window !== "undefined"
      && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const [workspace, setWorkspace] = useState("overview");
  const [view, setView] = useState("year");
  const [scope, setScope] = useState("year");
  const [tableStage, setTableStage] = useState("all");
  const [density, setDensity] = useState("compact");
  const [focusMonth, setFocusMonth] = useState(vmpToday().getMonth());
  /* Tab "Khám phá 3D" có trí nhớ: three.js chỉ tải khi người dùng thật sự
     mở, và ai đã quen dùng thì không phải bấm lại mỗi lần vào màn. */
  const [kham3D, setKham3D] = useState(() => {
    try { return localStorage.getItem("vmp-timeline-3d") === "mo"; }
    catch { return false; }
  });
  const doiKham3D = (mo: boolean) => {
    setKham3D(mo);
    try { localStorage.setItem("vmp-timeline-3d", mo ? "mo" : "dong"); } catch { /* riêng tư */ }
  };
  const [cls, setCls] = useState("all");
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [readinessFilter, setReadinessFilter] = useState("all");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [detail, setDetail] = useState<Activity | null>(null);
  const [plannedEdit, setPlannedEdit] = useState<Activity | null>(null);
  const canEditPlannedDeadlines = canPresentPlannedDeadlineEdit(import.meta.env.VITE_MANUAL_PLANNED_DEADLINES_ENABLED, businessRole);
  /* Supporting pane ≥1600 (nghiên cứu đợt 2): màn rộng thì bấm hàng đổ
     chi tiết sang pane bên phải; màn hẹp giữ modal như cũ. */
  const [chon, setChon] = useState<Activity | null>(null);
  const [manRong, setManRong] = useState(() =>
    typeof window !== "undefined" && !!window.matchMedia?.("(min-width: 1600px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1600px)");
    const nghe = () => setManRong(mq.matches);
    mq.addEventListener("change", nghe);
    return () => mq.removeEventListener("change", nghe);
  }, []);
  const moHoSo = (a: Activity) => { if (manRong) setChon(a); else setDetail(a); };
  const dq = useDebounce(q, 300);

  const range = useMemo(() => rangeFor(view, focusMonth, year), [view, focusMonth, year]);
  const typeOptions = useMemo(() => [...new Set(acts.map((a) => String(a.vtype || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "vi")), [acts]);
  const ownerOptions = useMemo(() => [...new Set(acts.map(timelineOwnerOf).filter((owner) => owner !== "—"))]
    .sort((a, b) => a.localeCompare(b, "vi")), [acts]);

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

  const timelineFilters = useMemo(() => ({
    ...TIMELINE_FILTER_DEFAULTS,
    cls, dept, status, q: dq, type: typeFilter, owner: ownerFilter, phase: phaseFilter, readiness: readinessFilter,
  }), [cls, dept, status, dq, typeFilter, ownerFilter, phaseFilter, readinessFilter]);
  const timelineSets = useMemo(() => buildTimelineFilterSets({ activities: acts, filters: timelineFilters, range }),
    [acts, timelineFilters, range]);
  const filtered = timelineSets.display;
  const explorerActs = timelineSets.explorer;
  const vmpMonthBands = useMemo(
    () => buildVmpMonthBands(timelineSets.summaryBase, year),
    [timelineSets.summaryBase, year],
  );

  /* Strip bốn dải tình trạng — đếm SAU các bộ lọc khác, TRƯỚC bộ lọc
     tình trạng, trên cùng một model với chính bộ lọc. */
  const tomTat = useMemo(
    () => buildTimelineSummary(timelineSets.summaryBase),
    [timelineSets.summaryBase]);

  /* Action narrative (nghiên cứu đợt 2): một câu kết luận thay vì thêm
     biểu đồ — hạng mục trễ nặng nhất và pha nút thắt, cùng quần thể đếm
     với strip nên các con số đối chiếu được. */
  const diemNong = useMemo(
    () => timDiemNong(timelineSets.summaryBase),
    [timelineSets.summaryBase]);
  const nutThat = useMemo(
    () => timNutThat(timelineSets.summaryBase),
    [timelineSets.summaryBase]);

  const isTimeline = workspace === "timeline";

  const resetFilters = () => {
    setCls("all");
    setDept("all");
    setStatus("all");
    setQ("");
    setTypeFilter("all");
    setOwnerFilter("all");
    setPhaseFilter("all");
    setReadinessFilter("all");
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
  const filterChips = timelineFilterChips({ ...timelineFilters, q });
  const hasFilters = filterChips.length > 0;
  const clearOneFilter = (key: string) => {
    if (key === "cls") setCls("all");
    else if (key === "dept") setDept("all");
    else if (key === "status") setStatus("all");
    else if (key === "q") setQ("");
    else if (key === "type") setTypeFilter("all");
    else if (key === "owner") setOwnerFilter("all");
    else if (key === "phase") setPhaseFilter("all");
    else if (key === "readiness") setReadinessFilter("all");
  };
  useEffect(() => {
    if (chon && !filtered.some((a) => a.id === chon.id)) setChon(null);
  }, [chon, filtered]);

  return (
    <div className="timeline-page-shell">
      {/* Strip bốn dải tình trạng (nghiên cứu Timeline đợt 1): hero duy
          nhất là Quá hạn; bấm ô nào là bộ lọc tình trạng nhảy đúng giá
          trị đó — cùng model với bộ lọc nên số trên ô = số dòng lọc ra. */}
      <MetricGrid
        label="Tình trạng dòng thời gian"
        items={[
          { id: "qua-han", label: "Quá hạn", value: tomTat.quaHan,
            priority: "hero", tone: "danger",
            hint: "trạng thái tổng hoặc bất kỳ pha nào trễ — bấm để lọc",
            onActivate: () => setStatus("over") },
          { id: "sap-den-han", label: "Sắp đến hạn", value: tomTat.sapDenHan,
            priority: "supporting", tone: "warning",
            hint: `đích VMP trong ${SOON_DAYS} ngày tới`,
            onActivate: () => setStatus("soon") },
          { id: "dang-lam", label: "Đang thực hiện", value: tomTat.dangThucHien,
            priority: "supporting", tone: "info",
            hint: "đang chạy, hạn còn xa",
            onActivate: () => setStatus("prog") },
          { id: "hoan-thanh", label: "Hoàn thành", value: tomTat.hoanThanh,
            priority: "supporting", tone: "success",
            hint: "đã đóng hồ sơ VMP",
            onActivate: () => setStatus("done") },
        ]}
      />

      {/* Action narrative (nghiên cứu đợt 2): câu kết luận, không phải
          biểu đồ mới — trễ nặng nhất ở đâu và pha nào đang là nút thắt. */}
      {diemNong && nutThat && (
        <p className="tl-narrative">
          Nặng nhất:{" "}
          <button type="button" className="tl-narrative__ma tnum"
            onClick={() => moHoSo(diemNong.act)}>
            {diemNong.act.code}
          </button>{" "}
          — trễ {diemNong.treNgay} ngày ở mốc {diemNong.mocTre}.
          {" "}Nút thắt: <b>{nutThat.ten}</b> — {nutThat.so}/{nutThat.tongQuaHan} hạng
          mục quá hạn đang kẹt ở pha này.
        </p>
      )}

      {/* Địa hình tải việc — TAB KHÁM PHÁ, không phải mặt chính (hiến pháp
          Atelier §6): 2D bên dưới trả lời mọi tác vụ; 3D chỉ dựng khi
          người dùng mở, và three.js chỉ tải lúc đó. Lựa chọn được nhớ —
          người xếp lịch mở nó mỗi tuần không phải bấm lại mỗi lần. */}
      <Card variant="strong" data-timeline-3d>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <CardTitle icon={GanttChartSquare}
            sub={kham3D
              ? "Trục ngang X là 12 tháng theo mốc đích VMP · trục sâu Z là bộ phận · chiều cao là số hạng mục đến hạn"
              : "Bản đồ ba chiều Tháng × Bộ phận × Số hạng mục — để thấy tháng nào bộ phận nào bị dồn việc"}>
            Địa hình tải việc {year}
          </CardTitle>
          <div style={{ flex: 1 }} />
          <button type="button" aria-pressed={kham3D}
            onClick={() => doiKham3D(!kham3D)}
            style={{ ...btnPrimary, padding: "9px 16px",
                     background: kham3D ? C.surface : undefined,
                     color: kham3D ? C.plum : undefined,
                     border: kham3D ? `1.5px solid ${C.pinkSoft}` : "none" }}>
            {kham3D ? "Thu gọn 3D" : "Xem bản đồ 3D"}
          </button>
        </div>
        {kham3D && (
          <Suspense fallback={<div style={{ height: 420 }} />}>
            {/* Trước truyền `acts` thô — bấm KPI (Quá hạn/Sắp đến hạn/Đang thực
                hiện/Hoàn thành) đổi `status` phía trên nhưng bản đồ 3D vẫn vẽ
                nguyên năm không đổi gì, đúng cảm giác "chỉ hiện quá hạn mãi"
                người dùng báo. Nay dùng `filtered` — cùng danh sách đã qua
                status/cls/dept/tìm kiếm mà KPI và bảng bên dưới đang dùng, để
                bấm một KPI là cả trang đổi theo cùng một nghĩa. */}
            <WorkloadSpace3D acts={filtered} nam={year} giamChuyenDong={giamChuyenDong} macDinh3D
              onOpenCell={onOpenWorkloadCell} />
          </Suspense>
        )}
      </Card>

      <Card variant="strong" cls="timeline-workbench">
        <div className="timeline-workbench-head">
          <div className="timeline-title-block">
            <span className="timeline-title-icon">
              <GanttChartSquare size={21} />
            </span>
            <div>
              {/* "Timeline intelligence" đã BỎ (nghiên cứu 5): tiếng Anh
                  trang trí không mang thông tin nào cho người dùng Việt. */}
              <div className="timeline-title">Kế hoạch VMP{isTimeline ? ` · ${range.title}` : ""}</div>
              <div className="timeline-subtitle">
                {isTimeline
                  ? "Theo dõi 3 mốc Đề cương · Thẩm định · Hoàn thành VMP trên dòng thời gian, có vạch ngày hôm nay"
                  : "Tổng quan năm và dòng thời gian chi tiết — cùng một bộ lọc, từ dữ liệu Supabase hiện hành"}
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
          <select value={cls} onChange={(e) => setCls(e.target.value)} className="timeline-select" aria-label="Lọc theo nhóm đối tượng">
            <option value="all">Tất cả nhóm</option>
            {Object.keys(CLS).map((k) => (
              <option key={k} value={k}>{(CLS as Record<string, { label: string }>)[k].label}</option>
            ))}
          </select>
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="timeline-select" aria-label="Lọc theo bộ phận">
            <option value="all">Tất cả bộ phận</option>
            {DEPTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="timeline-select" aria-label="Lọc theo tình trạng">
            <option value="all">Tất cả tình trạng</option>
            <option value="over">Cần chú ý</option>
            <option value="soon">Sắp đến hạn</option>
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
              aria-label="Tìm trong timeline"
            />
          </div>
          <button
            type="button"
            className="timeline-advanced-filter-toggle"
            data-timeline-filter-toggle
            aria-expanded={advancedFiltersOpen}
            aria-controls="timeline-advanced-filter-panel"
            onClick={() => setAdvancedFiltersOpen((open) => !open)}
          >
            Bộ lọc nâng cao ({timelineActiveFilterCount({ ...timelineFilters, q })})
          </button>
          {hasFilters && (
            <button type="button" onClick={resetFilters} className="timeline-clear-btn" data-timeline-clear-filters>
              Xoá lọc
            </button>
          )}
        </div>
        {advancedFiltersOpen && (
          <div id="timeline-advanced-filter-panel" className="timeline-advanced-filter-panel" data-timeline-filter-panel>
            <label>
              Loại thẩm định
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} data-timeline-filter="type">
                <option value="all">Tất cả loại</option>
                {typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label>
              Người phụ trách
              <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} data-timeline-filter="owner">
                <option value="all">Tất cả người phụ trách</option>
                <option value="assigned">Đã phân công</option>
                <option value="unassigned">Chưa phân công</option>
                {ownerOptions.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
              </select>
            </label>
            <label>
              Pha sớm nhất chưa xong
              <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)} data-timeline-filter="phase">
                <option value="all">Tất cả pha</option>
                <option value="protocol">Đề cương</option>
                <option value="validation">Thẩm định</option>
                <option value="report">Báo cáo</option>
                <option value="vmp">VMP</option>
                <option value="done">Đã hoàn thành</option>
              </select>
            </label>
            <label>
              Sẵn sàng deadline
              <select value={readinessFilter} onChange={(e) => setReadinessFilter(e.target.value)} data-timeline-filter="readiness">
                <option value="all">Tất cả mức sẵn sàng</option>
                <option value="ready">Đủ 4 deadline</option>
                <option value="missing">Thiếu deadline</option>
              </select>
            </label>
          </div>
        )}
        <div className="timeline-filter-chips" role="group" aria-label="Bộ lọc đang áp dụng">
          {filterChips.map((chip) => (
            <button key={chip.key} type="button" data-timeline-filter-chip aria-label={`Bỏ ${chip.label}`}
              onClick={() => clearOneFilter(chip.key)}>
              {chip.label} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
        <p className="timeline-filter-count" data-timeline-filter-count aria-live="polite">
          {filtered.length} hạng mục hiển thị
        </p>

        {workspace === "overview" ? (
          <TimelineOverview
            acts={explorerActs}
            year={year}
            onPickMonth={(m) => { setFocusMonth(m); setView("month"); setWorkspace("timeline"); }}
            onPickDept={(d) => { setDept(d); setWorkspace("timeline"); }}
          />
        ) : isTimeline ? (
        view === "year" ? (
        <TimelineRangeRail
          items={timelineSets.summaryBase}
          range={range}
          view={view}
          monthBands={vmpMonthBands}
          onFocusBand={focusBand}
        />
        ) : (
        <div data-timeline-detail-board>
        {/* Lớp thuyết minh đặt TRƯỚC mọi thứ khác của tab này: nó là câu
            trả lời, phần còn lại là bằng chứng và chỗ tra cứu. */}
        <TimelineFocusLayer
          items={filtered}
          onOpen={moHoSo}
          onLocQuaHan={() => setStatus("over")}
        />

        <TimelineStageProgress
          items={filtered}
          year={year}
          onOverdue={() => setStatus("over")}
          onNextQuarter={goNextQuarter}
        />

        {/* Supporting pane ≥1600: chỉ chia 8/4 khi ĐÃ chọn một hạng mục —
            chưa chọn thì bảng dùng trọn bề ngang (màn GMP, dữ liệu trước). */}
        <div className={manRong && chon ? "lp-supporting-layout" : undefined}>
        <div className="timeline-map-surface">
          <div className="timeline-map-surface__head">
            <div>
              <strong>
                {tableStage === "all"
                  ? "Sơ đồ dòng thời gian tổng hợp"
                  : `Bảng ${(TABLE_STAGE_LABELS as Record<string, string>)[tableStage]}`}
              </strong>
              <span>
                {filtered.length} hạng mục · {tableStage !== "all"
                  ? `${(TABLE_STAGE_LABELS as Record<string, string>)[tableStage]} · sắp xếp theo thời gian, mốc sắp tới trước`
                  : "Đề cương / Thẩm định thực tế / Hoàn thành VMP · ưu tiên mốc sắp tới"}
              </span>
            </div>
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
          </div>

          <TimelineFlowLegend />

          <TimelineTableBoard
            items={filtered}
            onOpen={moHoSo}
            density={density}
            range={range}
            tableStage={tableStage}
          />
        </div>
        {manRong && chon && (
          <TimelineInspector
            a={chon}
            chuSoHuu={ownerOf(chon)}
            onDong={() => setChon(null)}
            onHoSo={setDetail}
            canEditPlannedDeadlines={canEditPlannedDeadlines} onEditPlannedDeadlines={setPlannedEdit}
          />
        )}
        </div>
        </div>
        )
        ) : null}
      </Card>

      <ActivityDetailModal a={detail} onClose={() => setDetail(null)} canEditPlannedDeadlines={canEditPlannedDeadlines} onEditPlannedDeadlines={setPlannedEdit} />
      {plannedEdit && <PlannedDeadlineDialog a={plannedEdit} onClose={() => setPlannedEdit(null)} onReload={onReload} />}
    </div>
  );
}

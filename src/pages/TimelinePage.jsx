/* TimelinePage.jsx — Modern Gantt Timeline VMP */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  GanttChartSquare,
  Search,
} from "lucide-react";
import { C, TEXT, NUM, GRAD } from "../constants/theme.js";
import { CLS, DEPTS, CRIT, MONTHS, PHASE_COLOR, SOON_DAYS, vmpToday, PROG } from "../constants/vmp.js";
import { parseD, fmtVN, milestones, phaseStates, addDays, clamp, wlIsDone } from "../utils/helpers.js";
import { useDebounce } from "../hooks/index.js";
import { Card, Tag, Modal, Pill, phaseTag } from "../components/ui/Primitives.jsx";

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

function startOfDay(d) {
  if (!d) return null;
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function maxDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function minDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function safeDate(d, fallback) {
  return d && !isNaN(d) ? d : fallback;
}

function daysInclusive(start, end) {
  return Math.max(1, Math.round((startOfDay(end) - startOfDay(start)) / DAY_MS) + 1);
}

function pctInRange(date, range) {
  if (!date) return 0;
  const d = startOfDay(date);
  const start = startOfDay(range.start);
  const endExclusive = addDays(startOfDay(range.end), 1);
  return clamp(((d - start) / Math.max(DAY_MS, endExclusive - start)) * 100, 0, 100);
}

function inRange(date, range) {
  if (!date) return false;
  const d = startOfDay(date);
  return d >= startOfDay(range.start) && d <= startOfDay(range.end);
}

function intersectsRange(start, end, range) {
  if (!start || !end) return false;
  const s = startOfDay(start);
  const e = startOfDay(end);
  return e >= startOfDay(range.start) && s <= startOfDay(range.end);
}

function chartWidthFor(view, density) {
  const compact = density === "compact";
  if (view === "month") return compact ? 900 : 1040;
  if (view === "quarter") return compact ? 980 : 1120;
  return compact ? 1120 : 1320;
}

function rangeFor(view, focusMonth, year) {
  const todayMonth = vmpToday().getMonth();
  const m = Number.isFinite(focusMonth) ? focusMonth : todayMonth;
  let start;
  let end;
  let title;
  let kicker;
  let bands = [];

  if (view === "month") {
    start = new Date(year, m, 1);
    end = new Date(year, m + 1, 0);
    title = `${MONTH_NAMES[m]} / ${year}`;
    kicker = "Theo tuần trong tháng";

    let cursor = start;
    let week = 1;
    while (cursor <= end) {
      const next = minDate(addDays(cursor, 7), addDays(end, 1));
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

function taskWindow(a) {
  const m = a.m || milestones(a);
  const fallback = parseD(a.target);
  const start = safeDate(m.protocol, fallback);
  const end = safeDate(m.target, fallback);
  return { m, start, end };
}

function phaseProgress(a) {
  const r = a._raw || {};
  if (a.st === "done" || wlIsDone(r.tt_vmp)) return 100;
  if (wlIsDone(r.tt_bao_cao)) return 82;
  if (wlIsDone(r.tt_tham_dinh)) return 58;
  if (wlIsDone(r.tt_de_cuong)) return 34;
  return PROG[a.st] || 8;
}

function issueLevel(a) {
  const ps = phaseStates(a);
  const hasOverPhase = [ps.p, ps.v, ps.r].includes("over");
  if (a.st === "over" || hasOverPhase) return "over";
  if (a.st === "done") return "done";
  if (a.st === "prog") return "prog";
  return "todo";
}

function ownerOf(a) {
  const raw = a._raw || {};
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

function countBy(list, fn) {
  const m = new Map();
  list.forEach((item) => {
    const key = fn(item);
    m.set(key, (m.get(key) || 0) + 1);
  });
  return m;
}

function ControlButton({ active, children, onClick, title }) {
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

function ScopeButton({ active, children, onClick, title }) {
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

function RangeStat({ label, value, tone = "plum", sub }) {
  const map = {
    plum: [C.plum, C.pinkMist],
    over: [C.raspText, C.raspSoft],
    done: [C.mintText, C.mintSoft],
    work: [C.lavText, C.lavSoft],
  };
  const [color, bg] = map[tone] || map.plum;
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

function daysUntil(date) {
  if (!date) return null;
  return Math.round((startOfDay(date) - startOfDay(vmpToday())) / DAY_MS);
}

function heatForDue(date, done = false) {
  if (done) return "done";
  const left = daysUntil(date);
  if (left == null) return "steady";
  if (left < 0) return "over";
  if (left <= 7) return "urgent";
  if (left <= SOON_DAYS) return "soon";
  return "steady";
}

function heatText(step) {
  if (step.heat === "done") return "Đã hoàn tất";
  const left = step.daysLeft;
  if (left == null) return "Chưa có mốc hạn";
  if (left < 0) return `Trễ ${Math.abs(left)} ngày`;
  if (left === 0) return "Đến hạn hôm nay";
  return `Còn ${left} ngày`;
}

function targetTime(a) {
  return (parseD(a.target) || new Date(2999, 0, 1)).getTime();
}

function compareByTarget(a, b) {
  const diff = targetTime(a) - targetTime(b);
  if (diff) return diff;
  return String(a.code || a.id || "").localeCompare(String(b.code || b.id || ""), "vi");
}

function stageState(a, stage) {
  const raw = a._raw || {};
  const m = a.m || milestones(a);
  const done = stage.id === "vmp"
    ? (a.st === "done" || wlIsDone(raw.tt_vmp))
    : wlIsDone(raw[stage.field]);
  const due = m[stage.due] || parseD(a.target);
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

function activeMapStep(a) {
  const states = MAP_STAGES.map((stage) => ({ stage, state: stageState(a, stage) }));
  const next = states.find((entry) => !entry.state.done);
  if (!next) {
    return { stage: MAP_STAGES[2], label: "Hoàn tất VMP" };
  }
  return { stage: next.stage, label: `Đang ở: ${next.stage.label}` };
}

function nextPendingMilestone(a) {
  for (const stage of MAP_STAGES) {
    const state = stageState(a, stage);
    if (!state.done) return { stage, state };
  }
  return null;
}

function compareByNextMilestone(a, b) {
  const today = startOfDay(vmpToday()).getTime();
  const aNext = nextPendingMilestone(a);
  const bNext = nextPendingMilestone(b);
  const aTime = aNext?.state.due?.getTime();
  const bTime = bNext?.state.due?.getTime();
  const bucket = (next, time) => !next || !Number.isFinite(time) ? 2 : time >= today ? 0 : 1;
  const aBucket = bucket(aNext, aTime);
  const bBucket = bucket(bNext, bTime);
  if (aBucket !== bBucket) return aBucket - bBucket;
  if (aBucket === 0 && aTime !== bTime) return aTime - bTime;
  if (aBucket === 1 && aTime !== bTime) return bTime - aTime;
  return compareByTarget(a, b);
}

function TimelineMapSummary({ items }) {
  const rows = MAP_STAGES.map((stage) => {
    const states = items.map((a) => stageState(a, stage));
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

function bandItems(items, band) {
  return items.filter((a) => inRange(parseD(a.target), band));
}

function bandSummary(items, range) {
  return range.bands.map((band) => {
    const rows = bandItems(items, band);
    const done = rows.filter((a) => issueLevel(a) === "done").length;
    const over = rows.filter((a) => issueLevel(a) === "over").length;
    const prog = rows.filter((a) => issueLevel(a) === "prog").length;
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

function TimelineInsightStrip({ items, stats, range }) {
  const bands = bandSummary(items, range);
  const peak = [...bands].sort((a, b) => b.count - a.count || b.over - a.over)[0];
  const stageLoads = MAP_STAGES.map((stage) => {
    const states = items.map((a) => stageState(a, stage));
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

function TimelineRangeRail({ items, range, view, onFocusBand }) {
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
              onClick={() => canFocus && onFocusBand(band)}
              disabled={!canFocus}
              title={`${band.label}: ${band.count} đích VMP, ${band.done} hoàn thành, ${band.over} cần chú ý`}
              aria-label={`${band.label}: ${band.count} đích VMP, ${band.done} hoàn thành, ${band.over} cần chú ý`}
              style={{ "--load": `${load}%`, "--done": `${doneW}%`, "--over": `${overW}%`, "--prog": `${progW}%` }}
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

function TimelineMapStage({ a, stage }) {
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

function TimelineMapRowContent({ a }) {
  const cls = CLS[a.cls] || CLS.tb;
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
        {MAP_STAGES.map((stage) => (
          <TimelineMapStage key={stage.id} a={a} stage={stage} />
        ))}
      </div>
    </div>
  );
}

function timelineCalendarWidth(range, density) {
  const pxPerDay = range.view === "month"
    ? (density === "compact" ? 29 : 34)
    : range.view === "quarter"
      ? (density === "compact" ? 16 : 19)
      : (density === "compact" ? 9 : 11);
  return Math.max(920, Math.round(range.days * pxPerDay));
}

function timelineDateTicks(range) {
  const step = range.view === "month" ? 1 : range.view === "quarter" ? 7 : 14;
  const ticks = [];
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

function timelineStagePoint(state, range) {
  const date = state.done && state.actual ? state.actual : state.due;
  const before = date && date < startOfDay(range.start);
  const after = date && date > startOfDay(range.end);
  return {
    date,
    edge: before ? "before" : after ? "after" : "inside",
    left: before ? 1 : after ? 99 : pctInRange(date, range),
  };
}

function TimelineTableStageLabel({ a, stage }) {
  const state = stageState(a, stage);
  return (
    <div className={`timeline-day-stage timeline-day-stage--${stage.id} timeline-day-stage--${state.heat}`}>
      <i />
      <span>
        <strong>{stage.label}</strong>
        <small>{state.label}</small>
      </span>
    </div>
  );
}

function TimelineTableDateLane({ a, stage, range }) {
  const state = stageState(a, stage);
  const point = timelineStagePoint(state, range);
  const actualText = state.actual ? ` · Thực tế ${fmtVN(state.actual)}` : "";
  const edgeText = point.edge === "before" ? " · Trước kỳ" : point.edge === "after" ? " · Sau kỳ" : "";

  return (
    <div className={`timeline-day-lane timeline-day-lane--${stage.id}`}>
      {point.date && (
        <span
          className={`timeline-day-marker timeline-day-marker--${state.heat} timeline-day-marker--${point.edge}`}
          style={{ left: `${point.left}%` }}
          title={`${stage.label}: hạn ${fmtVN(state.due)}${actualText}${edgeText}`}
        >
          <b>{state.done ? "✓" : stage.short}</b>
          <small className="tnum">{fmtVN(point.date).slice(0, 5)}</small>
        </span>
      )}
    </div>
  );
}

function TimelineTableBoard({ items, onOpen, density, range }) {
  const boardRef = useRef(null);
  const calendarWidth = timelineCalendarWidth(range, density);
  const today = vmpToday();
  const todayVisible = inRange(today, range);
  const tableItems = useMemo(() => [...items].sort(compareByNextMilestone), [items]);
  const nextUpcomingDate = tableItems
    .map((item) => nextPendingMilestone(item)?.state.due)
    .find((date) => date && date >= startOfDay(today) && inRange(date, range));
  const nextUpcomingTime = nextUpcomingDate?.getTime() || null;

  useEffect(() => {
    const board = boardRef.current;
    if (!board || !todayVisible) return;
    const centerToday = () => {
      const itemHead = board.querySelector(".timeline-day-head-item");
      const stageHead = board.querySelector(".timeline-day-head-stages");
      const calendarHead = board.querySelector(".timeline-day-head-calendar");
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
    <div ref={boardRef} className={`timeline-day-board timeline-day-board--${density} vmp-scroll`}>
      <table
        className="timeline-day-table"
        style={{ minWidth: `${510 + calendarWidth}px`, "--calendar-width": `${calendarWidth}px`, "--day-size": daySize }}
      >
        <thead>
          <tr>
            <th className="timeline-day-head-item">Hạng mục · ưu tiên mốc sắp tới</th>
            <th className="timeline-day-head-stages">3 mốc hoàn thành</th>
            <th className="timeline-day-head-calendar">
              <div className="timeline-day-axis" style={{ width: `${calendarWidth}px` }}>
                {todayVisible && <i className="timeline-day-axis__today" style={{ left: `${pctInRange(today, range)}%` }}><span>Hôm nay</span></i>}
                {ticks.map((tick) => (
                  <span
                    key={tick.date.getTime()}
                    className={`timeline-day-axis__tick ${tick.major ? "timeline-day-axis__tick--major" : ""} ${tick.edge ? `timeline-day-axis__tick--${tick.edge}` : ""}`}
                    style={{ left: `${tick.left}%` }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {tableItems.map((a) => {
            const cls = CLS[a.cls] || CLS.tb;
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
                    <Pill s={a.st} small />
                  </div>
                  <div className="timeline-table-item__name">{a.name}</div>
                  <div className="timeline-table-item__meta">
                    <span className="tnum">VMP {fmtVN(parseD(a.target))}</span>
                    <span>{owner}</span>
                    <span>{dept?.short || a.dept || "—"}</span>
                  </div>
                  <div className={`timeline-day-item__next timeline-day-item__next--${stepState.heat}`}>
                    {step.label} · {stepState.label}
                  </div>
                </td>
                <td className="timeline-day-stages-cell">
                  <div className="timeline-day-stages">
                    {MAP_STAGES.map((stage) => <TimelineTableStageLabel key={stage.id} a={a} stage={stage} />)}
                  </div>
                </td>
                <td className="timeline-day-calendar-cell" style={{ width: `${calendarWidth}px` }}>
                  {todayVisible && <i className="timeline-day-calendar__today" style={{ left: `${pctInRange(today, range)}%` }} />}
                  <div className="timeline-day-lanes">
                    {MAP_STAGES.map((stage) => (
                      <TimelineTableDateLane key={stage.id} a={a} stage={stage} range={range} />
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TimelineStageBoard({ items, onOpen, density }) {
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
        {items.map((a) => (
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

function HybridChartCell({ a, range, width }) {
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
      {MILESTONES.map((ms) => <MilestoneDot key={ms.id} milestone={ms} date={m[ms.id]} range={range} />)}
      <ProgressPin a={a} start={start} end={end} range={range} />
    </div>
  );
}

function TimelineHybridBoard({ range, items, width, onOpen, density }) {
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
            {range.bands.map((band, i) => {
              const left = pctInRange(band.start, range);
              const right = pctInRange(addDays(band.end, 1), range);
              return (
                <div
                  key={`hybrid-label-${band.label}-${i}`}
                  className="timeline-band-label"
                  style={{ left: `${left}%`, width: `${Math.max(.3, right - left)}%` }}
                >
                  <strong>{band.label}</strong>
                  <small>{band.sub}</small>
                </div>
              );
            })}
          </div>
        </div>

        {items.map((a) => (
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

function ScaleBands({ range }) {
  return (
    <>
      {range.bands.map((band, i) => {
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
      {range.bands.map((band, i) => (
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

function TodayLine({ range, label = false }) {
  const today = vmpToday();
  if (!inRange(today, range)) return null;
  return (
    <div className="timeline-today-line" style={{ left: `${pctInRange(today, range)}%` }}>
      {label && <span>Hôm nay</span>}
    </div>
  );
}

function PhaseSegment({ seg, ps, m, range }) {
  const from = m[seg.from];
  const to = m[seg.to];
  if (!from || !to || !intersectsRange(from, to, range)) return null;
  const left = pctInRange(maxDate(from, range.start), range);
  const right = pctInRange(minDate(to, addDays(range.end, 1)), range);
  const status = ps[seg.key] || "future";
  return (
    <div
      className={`timeline-phase timeline-phase--${status}`}
      title={`${seg.label}: ${fmtVN(from)} → ${fmtVN(to)}`}
      style={{
        left: `${left}%`,
        width: `${Math.max(.6, right - left)}%`,
        background: PHASE_COLOR[status] || PHASE_COLOR.future,
      }}
    />
  );
}

function MilestoneDot({ milestone, date, range }) {
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

function ProgressPin({ a, start, end, range }) {
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

function ActivityDetailModal({ a, onClose }) {
  if (!a) return null;
  const r = a._raw || {};
  const m = a.m || milestones(a);
  const cls = CLS[a.cls] || CLS.tb;
  const dp = DEPTS.find((d) => d.id === a.dept);
  const ct = CRIT[a.crit] || CRIT.TB;
  const dShow = (v) => { const t = String(v == null ? "" : v).trim(); return t || "—"; };
  const has = (v) => String(v == null ? "" : v).trim() !== "";
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
        {info.map(([k, v]) => <div key={k} style={{ background: "#fff", borderRadius: 11, padding: "8px 11px" }}><div style={{ fontSize: 10, color: C.plumSoft, fontWeight: 800, textTransform: "uppercase", letterSpacing: .3 }}>{k}</div><div style={{ fontSize: 13.5, color: C.plum, fontWeight: 700, marginTop: 2 }}>{v}</div></div>)}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 190, background: C.pinkSoft, borderRadius: 12, padding: "10px 13px" }}><div style={{ fontSize: 10, color: C.pinkText, fontWeight: 800, textTransform: "uppercase" }}>QA phụ trách</div><div style={{ fontSize: 14, color: C.plum, fontWeight: 800, marginTop: 2 }}>{dShow(r.qa)}</div>{has(r.email_qa) && <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600 }}>{r.email_qa}</div>}</div>
        <div style={{ flex: 1, minWidth: 190, background: C.lavSoft, borderRadius: 12, padding: "10px 13px" }}><div style={{ fontSize: 10, color: C.lavText, fontWeight: 800, textTransform: "uppercase" }}>NS bộ phận khác</div><div style={{ fontSize: 14, color: C.plum, fontWeight: 800, marginTop: 2 }}>{dShow(r.ns_khac)}</div>{has(r.email_khac) && <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600 }}>{r.email_khac}</div>}</div>
      </div>
      <div style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plum, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}><CalendarClock size={17} color={C.pink} /> Vòng đời thẩm định</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {phases.map((p, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "11px 14px", borderLeft: `4px solid ${has(p.act) ? C.mint : C.pinkSoft}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ fontSize: 18 }}>{p.ic}</span><div><div style={{ fontSize: 14, fontWeight: 800, color: C.plum }}>{p.label}</div><div style={{ fontSize: 10.5, color: C.plumSoft, fontWeight: 600 }}>{p.note}</div></div></div>
              {phaseTag(p.st)}
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

export default function TimelineView({ acts }) {
  const year = vmpToday().getFullYear();
  const [view, setView] = useState("year");
  const [scope, setScope] = useState("year");
  const [chartMode, setChartMode] = useState("table");
  const [density, setDensity] = useState("compact");
  const [focusMonth, setFocusMonth] = useState(vmpToday().getMonth());
  const [cls, setCls] = useState("all");
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);
  const dq = useDebounce(q, 300);

  const range = useMemo(() => rangeFor(view, focusMonth, year), [view, focusMonth, year]);
  const chartWidth = chartWidthFor(view, density);

  const setViewMode = (mode) => {
    setView(mode);
    if (mode === "year") setScope("year");
    else setScope("period");
  };

  const setScopeMode = (mode) => {
    setScope(mode);
    if (mode === "year") setView("year");
    else if (view === "year") setView("month");
  };

  const filtered = useMemo(() => {
    const needle = dq.trim().toLowerCase();
    return acts
      .filter((a) => {
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
      .sort((x, y) => {
        return compareByTarget(x, y);
      });
  }, [acts, cls, dept, dq, range, status]);

  const stats = useMemo(() => {
    const statusMap = countBy(filtered, issueLevel);
    const targets = filtered.filter((a) => inRange(parseD(a.target), range)).length;
    const owners = new Set(filtered.map(ownerOf).filter((x) => x && x !== "—")).size;
    const done = statusMap.get("done") || 0;
    const rate = filtered.length ? Math.round(done / filtered.length * 100) : 0;
    return {
      total: filtered.length,
      targets,
      owners,
      over: statusMap.get("over") || 0,
      done,
      rate,
    };
  }, [filtered, range]);

  const resetFilters = () => {
    setCls("all");
    setDept("all");
    setStatus("all");
    setQ("");
  };

  const shiftRange = (delta) => {
    if (view === "year") return;
    const step = view === "quarter" ? 3 : 1;
    setFocusMonth((m) => clamp(m + delta * step, 0, 11));
  };

  const setQuarter = (qIndex) => setFocusMonth(qIndex * 3);
  const focusBand = (band) => {
    setFocusMonth(band.start.getMonth());
    setView("month");
    setScope("period");
  };
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
              <div className="timeline-title">Bản đồ timeline VMP · {range.title}</div>
              <div className="timeline-subtitle">
                Hybrid Gantt + stage map · marker hôm nay · dữ liệu đồng bộ từ Supabase
              </div>
            </div>
          </div>

          <div className="timeline-board-tools">
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
            <div className="timeline-density-controls" aria-label="Mật độ dòng timeline">
              {Object.entries(DENSITY_LABELS).map(([k, label]) => (
                <ScopeButton
                  key={k}
                  active={density === k}
                  onClick={() => setDensity(k)}
                  title={k === "compact" ? "Hiển thị nhiều hạng mục hơn" : "Hiển thị hạng mục thoáng và dễ đọc hơn"}
                >
                  {label}
                </ScopeButton>
              ))}
            </div>
          </div>
        </div>

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

        <TimelineInsightStrip items={filtered} stats={stats} range={range} />
        <TimelineRangeRail items={filtered} range={range} view={view} onFocusBand={focusBand} />

        <div className="timeline-filter-row timeline-filter-row--workbench">
          <div className="timeline-filter-label">
            <Filter size={15} />
            <span>Lọc</span>
          </div>
          <select value={cls} onChange={(e) => setCls(e.target.value)} className="timeline-select">
            <option value="all">Tất cả nhóm</option>
            {Object.keys(CLS).map((k) => <option key={k} value={k}>{CLS[k].label}</option>)}
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

        <div className="timeline-kpi-strip">
          <RangeStat label="Đang hiển thị" value={stats.total} sub="hạng mục active" />
          <RangeStat label="Đích trong kỳ" value={stats.targets} sub="deadline VMP" tone="work" />
          <RangeStat label="Cần chú ý" value={stats.over} sub="quá hạn / lệch nhịp" tone="over" />
          <RangeStat label="Hoàn thành" value={`${stats.rate}%`} sub={`${stats.done} hạng mục`} tone="done" />
        </div>

        <TimelineMapSummary items={filtered} />

        <div className="timeline-map-surface">
          <div className="timeline-map-surface__head">
            <div>
              <strong>
                {chartMode === "table"
                  ? "Bảng timeline quan sát"
                  : chartMode === "stage"
                    ? "Sơ đồ 3 mốc"
                    : "Sơ đồ 3 mốc + trục thời gian"}
              </strong>
              <span>{filtered.length} hạng mục · Đề cương / Thẩm định thực tế / Hoàn thành VMP · ưu tiên mốc sắp tới</span>
            </div>
            <div className="timeline-map-legend">
              {MAP_STAGES.map((stage) => (
                <span key={stage.id} className={`timeline-map-legend__item timeline-map-legend__item--${stage.id}`}>
                  <i />{stage.label}
                </span>
              ))}
            </div>
          </div>

          {chartMode === "table" ? (
            <TimelineTableBoard items={filtered} onOpen={setDetail} density={density} range={range} />
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
      </Card>

      <ActivityDetailModal a={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

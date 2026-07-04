/* TimelinePage.jsx — Modern Gantt Timeline VMP */
import { useMemo, useState } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  GanttChartSquare,
  Layers3,
  Search,
} from "lucide-react";
import { C, TEXT, NUM, GRAD } from "../constants/theme.js";
import { CLS, DEPTS, CRIT, MONTHS, PHASE_COLOR, vmpToday, PROG } from "../constants/vmp.js";
import { parseD, fmtVN, milestones, phaseStates, addDays, clamp, wlIsDone } from "../utils/helpers.js";
import { useDebounce } from "../hooks/index.js";
import { Card, CardTitle, Tag, Modal, Pill, phaseTag } from "../components/ui/Primitives.jsx";

const DAY_MS = 86400000;
const LEFT_COL = 322;
const RIGHT_COL = 144;
const MONTH_NAMES = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

const VIEW_LABELS = {
  month: "Tháng",
  quarter: "Quý",
  year: "Năm",
};

const PHASES = [
  { key: "p", id: "protocol", label: "Đề cương", short: "ĐC", from: "protocol", to: "validation" },
  { key: "v", id: "validation", label: "Thẩm định thực tế", short: "TT", from: "validation", to: "report" },
  { key: "r", id: "report", label: "Báo cáo", short: "BC", from: "report", to: "target" },
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

function chartWidthFor(view) {
  if (view === "month") return 1040;
  if (view === "quarter") return 1080;
  return 1240;
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

function statusLabel(a) {
  const level = issueLevel(a);
  if (level === "over") return "Cần chú ý";
  if (level === "done") return "Đã xong";
  if (level === "prog") return "Đang chạy";
  return "Kế hoạch";
}

function ownerOf(a) {
  return String(a.owner || a._raw?.qa || a._raw?.ns_khac || "—").trim() || "—";
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

function TimelineHeader({ range, width }) {
  return (
    <div className="timeline-board-row timeline-board-header">
      <div className="timeline-task-cell timeline-task-cell--header" style={{ width: LEFT_COL, flexBasis: LEFT_COL }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Layers3 size={15} color={C.pinkText} />
          <span>Hạng mục / phụ trách</span>
        </div>
      </div>
      <div className="timeline-chart-cell timeline-chart-cell--header" style={{ width, flexBasis: width }}>
        <ScaleBands range={range} />
        <TodayLine range={range} label />
        {range.bands.map((band, i) => {
          const left = pctInRange(band.start, range);
          const right = pctInRange(addDays(band.end, 1), range);
          return (
            <div
              key={`label-${band.label}-${i}`}
              className="timeline-band-label"
              style={{ left: `${left}%`, width: `${Math.max(.3, right - left)}%` }}
            >
              <strong>{band.label}</strong>
              <small>{band.sub}</small>
            </div>
          );
        })}
      </div>
      <div className="timeline-end-cell timeline-end-cell--header" style={{ width: RIGHT_COL, flexBasis: RIGHT_COL }}>
        Đích / tình trạng
      </div>
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
    >
      <span>{seg.short}</span>
    </div>
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
    >
      <b>{milestone.short}</b>
    </span>
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
      title={`Tiến độ ước tính: ${Math.round(pct)}%`}
      style={{ left: `${clamp(absolute, 2.4, 97.6)}%` }}
    >
      {Math.round(pct)}
    </span>
  );
}

function GanttRow({ a, idx, range, width, onOpen }) {
  const ps = phaseStates(a);
  const { m, start, end } = taskWindow(a);
  const cls = CLS[a.cls] || CLS.tb;
  const dept = DEPTS.find((d) => d.id === a.dept);
  const level = issueLevel(a);
  const target = parseD(a.target);
  const owner = ownerOf(a);
  const rowTitle = `${a.code} · ${a.name} · ${fmtVN(target)}`;

  return (
    <button
      type="button"
      className={`timeline-board-row timeline-row timeline-row--${level}`}
      onClick={() => onOpen && onOpen(a)}
      title={`${rowTitle}\nBấm để xem chi tiết`}
      style={{ animationDelay: `${Math.min(idx, 18) * 18}ms` }}
    >
      <div className="timeline-task-cell" style={{ width: LEFT_COL, flexBasis: LEFT_COL }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <Tag color={cls.text} bg={cls.soft}>{a.vtype}</Tag>
          <span className="timeline-code">{a.code}</span>
          <span className={`timeline-status-dot timeline-status-dot--${level}`} />
        </div>
        <div className="timeline-task-name">{a.name}</div>
        <div className="timeline-task-meta">
          <span>{owner}</span>
          <span>•</span>
          <span>{dept?.short || a.dept || "—"}</span>
          <span>•</span>
          <span>{a.crit || "TB"}</span>
        </div>
      </div>

      <div className="timeline-chart-cell" style={{ width, flexBasis: width }}>
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

      <div className="timeline-end-cell" style={{ width: RIGHT_COL, flexBasis: RIGHT_COL }}>
        <div className="tnum" style={{ fontFamily: NUM, fontSize: 15.5, fontWeight: 900, color: level === "over" ? C.raspText : C.plum }}>
          {fmtVN(target)}
        </div>
        <div style={{ marginTop: 5 }}>
          <Pill s={a.st} small />
        </div>
        <div className={`timeline-end-note timeline-end-note--${level}`}>{statusLabel(a)}</div>
      </div>
    </button>
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
  const [view, setView] = useState("month");
  const [focusMonth, setFocusMonth] = useState(vmpToday().getMonth());
  const [cls, setCls] = useState("all");
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);
  const dq = useDebounce(q, 300);

  const range = useMemo(() => rangeFor(view, focusMonth, year), [view, focusMonth, year]);
  const chartWidth = chartWidthFor(view);

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
        const lx = issueLevel(x) === "over" ? -1 : 0;
        const ly = issueLevel(y) === "over" ? -1 : 0;
        if (lx !== ly) return lx - ly;
        return (parseD(x.target) || new Date(2999, 0, 1)) - (parseD(y.target) || new Date(2999, 0, 1));
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
  const hasFilters = cls !== "all" || dept !== "all" || status !== "all" || q.trim();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Card variant="strong">
        <div className="timeline-hero">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{
                width: 42,
                height: 42,
                borderRadius: 16,
                display: "grid",
                placeItems: "center",
                color: "#fff",
                background: GRAD,
                boxShadow: "0 12px 24px rgba(142,111,208,.22)",
              }}>
                <GanttChartSquare size={21} />
              </span>
              <div>
                <div style={{ fontFamily: TEXT, fontSize: 22, fontWeight: 900, color: C.plum }}>
                  Timeline VMP · {range.title}
                </div>
                <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 800, marginTop: 2 }}>
                  {range.kicker} · Sheet là nguồn chuẩn, Supabase chỉ là bản đọc
                </div>
              </div>
            </div>
          </div>
          <div className="timeline-view-controls">
            {Object.entries(VIEW_LABELS).map(([k, label]) => (
              <ControlButton key={k} active={view === k} onClick={() => setView(k)}>
                {label}
              </ControlButton>
            ))}
          </div>
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
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
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

        <div className="timeline-stat-grid">
          <RangeStat label="Đang hiển thị" value={stats.total} sub="hạng mục active" />
          <RangeStat label="Đích trong kỳ" value={stats.targets} sub="deadline VMP" tone="work" />
          <RangeStat label="Cần chú ý" value={stats.over} sub="quá hạn / lệch nhịp" tone="over" />
          <RangeStat label="Hoàn thành" value={`${stats.rate}%`} sub={`${stats.done} hạng mục`} tone="done" />
          <RangeStat label="Người liên quan" value={stats.owners} sub="QA / phụ trách" />
        </div>
      </Card>

      <Card>
        <div className="timeline-filter-row">
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.plumSoft }}>
            <Filter size={15} />
            <span style={{ fontSize: 13, fontWeight: 900 }}>Lọc</span>
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
              ✕ Xoá lọc
            </button>
          )}
        </div>

        <div className="timeline-legend">
          {[
            ["Hoàn thành", PHASE_COLOR.done],
            ["Đang/tới hạn", PHASE_COLOR.current],
            ["Quá hạn", PHASE_COLOR.over],
            ["Kế hoạch", PHASE_COLOR.future],
          ].map(([label, color]) => (
            <span key={label}><i style={{ background: color }} />{label}</span>
          ))}
          <span><b className="timeline-legend-diamond" />Mốc hạn</span>
          <span><em className="timeline-legend-pin">%</em>Tiến độ ước tính</span>
        </div>
      </Card>

      <Card variant="strong">
        <CardTitle
          icon={GanttChartSquare}
          sub={`${filtered.length} hạng mục trong ${range.title} · bấm vào một dòng để xem chi tiết`}
        >
          Bản đồ timeline VMP
        </CardTitle>

        <div className="timeline-board vmp-scroll" style={{ maxHeight: view === "month" ? 680 : 760 }}>
          <div style={{ minWidth: LEFT_COL + chartWidth + RIGHT_COL }}>
            <TimelineHeader range={range} width={chartWidth} />
            {filtered.map((a, i) => (
              <GanttRow
                key={a.id}
                a={a}
                idx={i}
                range={range}
                width={chartWidth}
                onOpen={setDetail}
              />
            ))}
            {filtered.length === 0 && (
              <div className="timeline-empty">
                Không có hạng mục nào trong khung thời gian/bộ lọc hiện tại.
              </div>
            )}
          </div>
        </div>
      </Card>

      <ActivityDetailModal a={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

/* TimelinePage.jsx — Modern Gantt Timeline VMP */
import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  FileText,
} from "lucide-react";
import { C, TEXT, NUM } from "../constants/theme.ts";
import { CLS, DEPTS, CRIT, SOON_DAYS, vmpToday } from "../constants/vmp.ts";
import { parseD, fmtVN, milestones, addDays, clamp, wlIsDone } from "../utils/helpers.ts";
import { Tag, Modal, Pill, phaseTag } from "../components/ui/Primitives.tsx";
import { issueLevel } from "../features/timeline/timelineSummaryModel.ts";
import PlannedDeadlineDialog from "../features/timeline/PlannedDeadlineDialog.tsx";
import { canPresentPlannedDeadlineEdit } from "../features/timeline/plannedDeadlineEditModel.ts";
import LongMonRace from "../features/monitoring/LongMonRace.tsx";
import {
  canChooseLongMonAudience,
  filterLongMonScopeActivities,
  resolveLongMonAudience,
  type LongMonAudience,
} from "../features/monitoring/longMonRaceScope.ts";
// Khối 3D nạp theo yêu cầu — chung chunk three.js với các màn khác.
import type { ReactNode } from "react";
import type { Activity } from "../types/domain.ts";
import type { WorkloadCell } from "../lib/workloadMap.ts";
import { vmpDeadlineDate } from "../lib/vmpDeadlineModel.ts";
import { buildPersonProgressChoices } from "../lib/personProgressScope.ts";

// Các "không gian làm việc" gộp chung dưới menu Timeline VMP: timeline sâu +
// Chỉ hai góc nhìn. Ba tab "Sơ đồ · Bố cục · Bảng" đã bỏ (29/07/2026):
// cả ba vẽ lại cùng bộ dữ liệu mà tab Timeline đã hiện đầy đủ hơn — Sơ đồ
// và Bố cục chỉ đổi cách bày, còn Bảng thì trùng hẳn với chế độ bảng có
// sẵn trong Timeline. Năm tab cho hai nội dung chỉ làm người dùng phải
// thử từng cái mới biết cái nào có thứ mình cần.

const DAY_MS = 86400000;




/* Dọn 16/08 (nghiên cứu 1+2): hai kiểu vẽ "Sơ đồ 3 mốc" và "Sơ đồ +
 * Gantt" đã BỎ — cả ba cùng vẽ một bộ dữ liệu, bảng ngày tổng hợp là
 * mặt duy nhất; logic đáng giữ của chúng đã nằm trong bảng + strip. */



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


/* issueLevel đã DỜI sang features/timeline/timelineSummaryModel.ts (bước
 * Foundation của nghiên cứu Timeline 16/08) — một nguồn chân lý cho cả
 * strip KPI, bộ lọc tình trạng và unit test. */






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

/* Cùng thứ tự ưu tiên nhưng theo MỘT mốc cụ thể (dùng cho tab Đề cương /
 * Thẩm định thực tế / Hoàn thành VMP): quá hạn → tới hạn → còn hạn → xong (cuối). */

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

export function TimelineRangeRail({ items, range, view, today, onFocusBand, monthBands }: {
  items: Activity[]; range: TimeRange; view: string;
  today: Date;
  onFocusBand?: (band: { label: string; start: Date; end: Date; [k: string]: unknown }) => void;
  monthBands?: Array<{ month: number; label: string; count: number; done: number; overdue: number; rate: number }>;
}) {
  const bands = monthBands || bandSummary(items, range);
  const maxCount = Math.max(1, ...bands.map((band) => band.count));
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



/* Tổng hợp theo mốc cho 1 stage: xong / quá hạn / sắp tới hạn. */

/* Panel "Tình hình thẩm định" — trả lời trực tiếp các câu hỏi vận hành:
 *  · Đề cương / Thẩm định tới đâu?  → thanh tiến độ done/total mỗi mốc
 *  · Sắp thẩm định thực tế chưa?    → số "sắp hạn" của mốc Thẩm định
 *  · Mục nào quá hạn / bị trôi?     → chip "quá hạn" (bấm để lọc)
 *  · Kế hoạch quý tới?              → thẻ "quý tới" (bấm để nhảy tới quý sau) */

/* Chú giải bảng dòng thời gian — tách rõ 2 chiều:
 *  · Chữ ĐC/TT/VMP = MỐC nào (danh tính, không dựa màu)
 *  · Màu chấm = TRẠNG THÁI theo hạn (nhất quán mọi mốc, luôn kèm nhãn) */



function ActivityDetailModal({ a, onClose, canEditPlannedDeadlines, onEditPlannedDeadlines }: { a: Activity | null; onClose: () => void; canEditPlannedDeadlines:boolean; onEditPlannedDeadlines:(a:Activity)=>void }) {
  if (!a) return null;
  const r = a._raw || {};
  const m = a.m || milestones(a);
  const cls = (CLS as Record<string, typeof CLS.tb>)[String(a.cls ?? "tb")] || CLS.tb;
  const dp = DEPTS.find((d) => d.id === a.dept);
  const ct = (CRIT as Record<string, typeof CRIT.TB>)[String(a.crit ?? "TB")] || CRIT.TB;
  const dShow = (v: unknown): string => { const t = String(v == null ? "" : v).trim(); return t || "—"; };
  const has = (v: unknown): boolean => String(v == null ? "" : v).trim() !== "";
  const canonicalVmpDeadline = vmpDeadlineDate(a);
  const info = [
    ["Phân loại", cls.label], ["Bộ phận", dp ? dp.name : dShow(r.bo_phan)], ["Line", dShow(r.line)],
    ["Khu vực", dShow(r.khu_vuc)], ["Tình trạng", dShow(r.tinh_trang)], ["Tần suất", has(r.tan_suat) ? dShow(r.tan_suat) + " tháng" : "—"],
    ["PL báo cáo", dShow(a.dep)], ["Ngày công", a.effort != null ? String(a.effort) : "—"], ["Điểm trọng yếu", a.score != null ? a.score + " / 9" : "—"],
  ];
  const phases = [
    { ic: "📝", label: "Đề cương", note: "Hạn T‑60", dl: has(r.dl_de_cuong) ? dShow(r.dl_de_cuong) : fmtVN(m.protocol), act: r.ngay_de_cuong, st: r.tt_de_cuong },
    { ic: "🔬", label: "Thẩm định thực tế", note: "Hạn T‑5‑BC", dl: has(r.dl_tham_dinh) ? dShow(r.dl_tham_dinh) : fmtVN(m.validation), act: r.ngay_tham_dinh, st: r.tt_tham_dinh, sched: r.lich_td },
    { ic: "📄", label: "Báo cáo", note: "Hạn T‑5", dl: has(r.dl_bao_cao) ? dShow(r.dl_bao_cao) : fmtVN(m.report), act: r.ngay_bao_cao, st: r.tt_bao_cao },
    { ic: "🏁", label: "Hoàn tất VMP", note: "Đích VMP (T)", dl: canonicalVmpDeadline ? fmtVN(parseD(canonicalVmpDeadline)) : fmtVN(m.target), act: r.ngay_vmp, st: r.tt_vmp },
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



export default function TimelineView({ acts, businessRole = null, currentPersonId = null, onReload = () => {} }: {
  acts: Activity[];
  onOpenWorkloadCell?: (cell: WorkloadCell) => void;
  businessRole?: string | null;
  currentPersonId?: string | null;
  onReload?: () => void;
}) {
  const now = new Date();
  /* Tab "Khám phá 3D" có trí nhớ: three.js chỉ tải khi người dùng thật sự
     mở, và ai đã quen dùng thì không phải bấm lại mỗi lần vào màn. */
  const [longMonAudience, setLongMonAudience] = useState<LongMonAudience>(() =>
    businessRole === "qa_staff" ? "personal" : "team");
  const [selectedLongMonPersonId, setSelectedLongMonPersonId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Activity | null>(null);
  const [plannedEdit, setPlannedEdit] = useState<Activity | null>(null);
  const canEditPlannedDeadlines = canPresentPlannedDeadlineEdit(import.meta.env.VITE_MANUAL_PLANNED_DEADLINES_ENABLED, businessRole);
  /* Inspector pane ≥1600 đã bỏ cùng workbench — bấm cá LUÔN mở modal hồ
     sơ. Nhánh manRong cũ trỏ vào setChon của inspector không còn render:
     màn rộng bấm cá sẽ không thấy gì cả. */
  const moHoSo = (a: Activity) => setDetail(a);

  const longMonPeople = useMemo(() => buildPersonProgressChoices(acts), [acts]);
  const canChooseRaceAudience = canChooseLongMonAudience(businessRole);
  const resolvedLongMonAudience = resolveLongMonAudience(businessRole, longMonAudience);
  useEffect(() => {
    if (!canChooseRaceAudience || resolvedLongMonAudience !== "personal") return;
    if (longMonPeople.some((person) => person.personId === selectedLongMonPersonId)) return;
    const fallback = longMonPeople.find((person) => person.personId === currentPersonId)
      ?? longMonPeople[0]
      ?? null;
    setSelectedLongMonPersonId(fallback?.personId ?? null);
  }, [canChooseRaceAudience, currentPersonId, longMonPeople, resolvedLongMonAudience, selectedLongMonPersonId]);



  /* Bộ lọc + range của workbench cũ đã bỏ hẳn (31/08): Ngư đồ nhận TRỌN
     danh sách theo quyền — cửa sổ 90 ngày do CHÍNH model Long Môn cắt
     (rangeAround), không cắt trước ở đây. Bản đầu còn cho ăn qua
     explorerActs (lọc theo range MỘT THÁNG của Gantt cũ) nên cá ngoài
     tháng hiện tại biến mất — trường đua 90 ngày mà trống trơn. */
  const longMonActivities = useMemo(() => filterLongMonScopeActivities({
    activities: acts,
    businessRole,
    currentPersonId,
    audience: resolvedLongMonAudience,
    selectedPersonId: selectedLongMonPersonId,
  }), [acts, businessRole, currentPersonId, resolvedLongMonAudience, selectedLongMonPersonId]);
  const selectedLongMonPerson = longMonPeople.find(
    (person) => person.personId === selectedLongMonPersonId) ?? null;
  const longMonScopeLabel = businessRole === "qa_staff"
    ? "Ngư đồ của tôi"
    : canChooseRaceAudience
      ? resolvedLongMonAudience === "team"
        ? "Cả nhóm QA"
        : selectedLongMonPerson?.fullName ?? "Cá nhân QA"
      : "Phạm vi được cấp";
  const longMonEmptyMessage = businessRole === "qa_staff" && !currentPersonId
    ? "Tài khoản chưa liên kết hồ sơ nhân sự; nhờ Admin nối hồ sơ để xem ngư đồ của bạn."
    : canChooseRaceAudience && resolvedLongMonAudience === "personal" && longMonPeople.length === 0
      ? "Chưa có phân công QA trong dữ liệu hiện tại."
      : null;
  /* Strip bốn dải tình trạng — đếm SAU các bộ lọc khác, TRƯỚC bộ lọc
     tình trạng, trên cùng một model với chính bộ lọc. */

  /* Action narrative (nghiên cứu đợt 2): một câu kết luận thay vì thêm
     biểu đồ — hạng mục trễ nặng nhất và pha nút thắt, cùng quần thể đếm
     với strip nên các con số đối chiếu được. */





  return (
    <div className="timeline-page-shell">
      {/* =====================================================================
          Man Dong thoi gian THU GON (31/08, chu du an chot): chi con Long Mon.
          Cac khoi cu — MetricGrid tinh trang, cau ket luan diem nong, ban do
          tai viec 3D, va toan bo workbench Gantt/bang (timeline-day-board,
          TimelineInspector, bo loc, mode/density) — da XOA khoi man nay theo
          yeu cau "chi de lai Long Mon, bo cac muc khac".
          Duong lam viec con lai: bam mot con ca -> ActivityDetailModal;
          sua han ke hoach van di qua PlannedDeadlineDialog trong modal do,
          nen tinh nang deadline override (spec 26/08) KHONG mat.
          ===================================================================== */}
      <LongMonRace
        activities={longMonActivities}
        now={now}
        onOpen={moHoSo}
        scopeControl={{
          canChooseAudience: canChooseRaceAudience,
          audience: resolvedLongMonAudience,
          scopeLabel: longMonScopeLabel,
          people: longMonPeople,
          selectedPersonId: selectedLongMonPersonId,
          emptyMessage: longMonEmptyMessage,
          onAudienceChange: setLongMonAudience,
          onPersonChange: setSelectedLongMonPersonId,
        }}
      />

      <ActivityDetailModal a={detail} onClose={() => setDetail(null)} canEditPlannedDeadlines={canEditPlannedDeadlines} onEditPlannedDeadlines={setPlannedEdit} />
      {plannedEdit && <PlannedDeadlineDialog a={plannedEdit} onClose={() => setPlannedEdit(null)} onReload={onReload} />}
    </div>
  );
}

/* =====================================================================
 *  lib/reportModel.ts — Mô hình tính toán cho Báo cáo quản lý (2026-07-30)
 *  ---------------------------------------------------------------------
 *  Toàn bộ hàm ở đây THUẦN (không gọi mạng, không side-effect): nhận
 *  Activity[] đã tải sẵn (từ Supabase qua useVmpData), trả về số đã tính.
 *  Cùng một Activity[] luôn ra đúng một kết quả — không có chỗ cho AI
 *  hay số liệu tự chế len vào lớp này.
 *
 *  ĐỊNH NGHĨA MỤC TIÊU 50%/THÁNG (chốt với người dùng 2026-07-30):
 *    tỷ lệ tháng M = (số hạng mục ĐÃ HOÀN THÀNH có mốc đích VMP rơi vào
 *                     tháng M) / (tổng số hạng mục CẦN HOÀN THÀNH trong
 *                     tháng M, tức có mốc đích VMP rơi vào tháng M)
 *    mục tiêu: tỷ lệ tháng ≥ 50%.
 *  Tháng chưa có hạng mục nào đến hạn (due=0) → rate=null, KHÔNG phải 0%
 *  (0% đọc như "trễ hết", trong khi thực ra là "chưa tới lượt").
 * ===================================================================== */
import type { Activity } from "../types/domain.ts";
import { parseD, wlIsDone, tally, docTally, stageOf } from "../utils/helpers.ts";
import { DEPTS, STAGES, vmpToday } from "../constants/vmp.ts";

const isActive = (a: Activity): boolean => (a.state || "active") === "active";

/** "yyyy-mm-dd" -> [năm, tháng] hoặc null. Tách chuỗi trực tiếp như inPeriod()
 *  trong helpers.ts để tránh lệch múi giờ khi new Date() phân tích ISO. */
function ymOf(target?: string | null): [number, number] | null {
  if (!target) return null;
  const parts = String(target).split("-").map(Number);
  const y = parts[0], m = parts[1];
  if (!y || !m) return null;
  return [y, m];
}

/* ======================== 1. TỔNG QUAN NĂM (YTD) ======================== */

export interface StageCount { id: string; label: string; count: number }

export interface StageTally { done: number; over: number; todo: number; total: number; rate: number }

export interface YtdSummary {
  total: number;
  /** Bốn giai đoạn của một hạng mục, mỗi giai đoạn đọc ĐÚNG cột của nó.
   *  Vì mỗi giai đoạn là tiền đề của giai đoạn sau, bốn số này phải giảm
   *  dần — nếu không thì dữ liệu có mâu thuẫn, xem mục Chất lượng dữ liệu. */
  protocol: StageTally;    // tt_de_cuong
  validation: StageTally;  // tt_tham_dinh
  documentation: StageTally; // tt_bao_cao (dùng docTally sẵn có của app)
  vmp: StageTally;         // tt_vmp — trùng với tally() toàn app
  byStage: StageCount[];
}

/**
 * Đếm hoàn thành/quá hạn cho MỘT giai đoạn, đọc đúng cặp cột trạng thái +
 * hạn của giai đoạn đó.
 *
 * Trước đây trang báo cáo dùng tally() (vốn dựa trên trạng thái TỔNG a.st,
 * tức cột tt_vmp) rồi gắn nhãn "Thẩm định thực tế" — làm ô thẩm định hiện
 * 83 thay vì 146, thấp hơn cả ô báo cáo, một phễu không thể có thật.
 */
export function stageTally(acts: Activity[], ttKey: string, dlKey: string): StageTally {
  const A = acts.filter(isActive);
  const today = vmpToday();
  const isDone = (a: Activity) => wlIsDone(((a._raw || {}) as Record<string, unknown>)[ttKey]);
  const done = A.filter(isDone).length;
  const over = A.filter((a) => {
    if (isDone(a)) return false;
    const dl = parseD(((a._raw || {}) as Record<string, unknown>)[dlKey] as string);
    return !!dl && dl < today;
  }).length;
  const total = A.length;
  return { done, over, todo: total - done - over, total, rate: total ? Math.round((done / total) * 100) : 0 };
}

export function ytdSummary(acts: Activity[]): YtdSummary {
  const A = acts.filter(isActive);
  const byStage: StageCount[] = STAGES.map((s) => ({
    id: s.id, label: s.label, count: A.filter((a) => stageOf(a) === s.id).length,
  }));
  return {
    total: A.length,
    protocol: stageTally(A, "tt_de_cuong", "dl_de_cuong"),
    validation: stageTally(A, "tt_tham_dinh", "dl_tham_dinh"),
    // docTally là bản dùng chung toàn app cho "hồ sơ" (lùi về dl_vmp khi
    // thiếu dl_bao_cao) — giữ nguyên để số trên báo cáo khớp màn Tổng quan.
    documentation: docTally(A),
    vmp: tally(A),
    byStage,
  };
}

/* ======================== 2 & 3. THEO THÁNG + MỤC TIÊU 50% ======================== */

/** Kỳ của một tháng so với hôm nay. Phân biệt này BẮT BUỘC cho tính trung
 *  thực của báo cáo: tháng chưa tới thì 0% hoàn thành là chuyện đương nhiên,
 *  KHÔNG phải "chưa đạt mục tiêu". Chấm điểm một kỳ chưa xảy ra là bịa kết
 *  luận — và đó là thứ thanh tra bắt lỗi ngay. */
export type MonthPhase = "da_qua" | "dang_dien_ra" | "chua_toi";

export interface MonthTargetRow {
  month: number;          // 1..12
  phase: MonthPhase;
  due: number;            // số hạng mục có mốc đích VMP rơi vào tháng này
  done: number;           // trong số đó, đã hoàn thành (bất kể xong sớm/đúng hạn)
  /** % hoàn thành. null khi KHÔNG có tỷ lệ nào đọc được: due=0 (chưa có hạng
   *  mục), hoặc tháng chưa tới kỳ (0% ở kỳ chưa xảy ra không phải một tỷ lệ,
   *  nó chỉ là "chưa bắt đầu"). Để null thay vì 0 nhằm chặn tận gốc việc một
   *  chỗ hiển thị nào đó lỡ vẽ ra "0% — chưa đạt". */
  rate: number | null;
  target: number;         // mục tiêu %, mặc định 50
  /** rate >= target. null khi KHÔNG được phép kết luận: due=0, hoặc tháng
   *  chưa tới kỳ. Tháng đang diễn ra vẫn chấm, nhưng kèm phase để người đọc
   *  biết đây là số giữa kỳ. */
  meets: boolean | null;
  gap: number | null;     // rate - target
}

export function monthlyTargetTable(acts: Activity[], year: number, targetPct = 50): MonthTargetRow[] {
  const A = acts.filter(isActive);
  const today = vmpToday();
  const curYear = today.getFullYear();
  const curMonth = today.getMonth() + 1;
  const rows: MonthTargetRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const phase: MonthPhase =
      year < curYear || (year === curYear && m < curMonth) ? "da_qua"
        : year === curYear && m === curMonth ? "dang_dien_ra"
          : "chua_toi";
    const due = A.filter((a) => {
      const ym = ymOf(a.target);
      return !!ym && ym[0] === year && ym[1] === m;
    });
    const done = due.filter((a) => a.st === "done").length;
    const rate = (due.length && phase !== "chua_toi")
      ? Math.round((done / due.length) * 100)
      : null;
    rows.push({
      month: m, phase, due: due.length, done, rate, target: targetPct,
      meets: rate == null ? null : rate >= targetPct,
      gap: rate == null ? null : rate - targetPct,
    });
  }
  return rows;
}

export interface CurrentMonthSummary {
  year: number;
  month: number;
  cur: MonthTargetRow;
  prev: MonthTargetRow | null;
  table: MonthTargetRow[];
}

export function currentMonthSummary(acts: Activity[], targetPct = 50): CurrentMonthSummary {
  const today = vmpToday();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const table = monthlyTargetTable(acts, year, targetPct);
  return {
    year, month,
    cur: table[month - 1],
    prev: month > 1 ? table[month - 2] : null,
    table,
  };
}

/* ======================== 4. BẤT CẬP THEO BỘ PHẬN (nghẽn ở giai đoạn nào) ======================== */

export interface DeptBottleneckRow {
  dept: string;
  label: string;
  total: number;
  overProtocol: number;    // chậm đề cương: quá hạn đề cương mà chưa xong đề cương
  overValidation: number;  // chậm thẩm định thực tế
  overReport: number;      // chậm báo cáo
  overVmp: number;         // tổng số đang quá hạn VMP (st === 'over')
  onTimeRate: number;      // % đã hoàn thành VMP trong bộ phận
}

const DEPT_LABEL: Record<string, string> = Object.fromEntries(DEPTS.map((d) => [d.id, d.name]));

export function stageBottleneck(acts: Activity[]): DeptBottleneckRow[] {
  const today = vmpToday();
  const A = acts.filter(isActive);
  const byDept = new Map<string, Activity[]>();
  for (const a of A) {
    const depts = (Array.isArray(a.depts) && a.depts.length) ? a.depts : [a.dept || "qa"];
    for (const d of depts) {
      if (!byDept.has(d)) byDept.set(d, []);
      byDept.get(d)!.push(a);
    }
  }

  const overStage = (list: Activity[], dlKey: string, ttKey: string): number =>
    list.filter((a) => {
      const r = (a._raw || {}) as Record<string, unknown>;
      if (wlIsDone(r[ttKey])) return false;
      const dl = parseD(r[dlKey] as string);
      return !!dl && dl < today;
    }).length;

  const rows: DeptBottleneckRow[] = [];
  for (const [dept, list] of byDept) {
    const overProtocol = overStage(list, "dl_de_cuong", "tt_de_cuong");
    const overValidation = overStage(list, "dl_tham_dinh", "tt_tham_dinh");
    const overReport = overStage(list, "dl_bao_cao", "tt_bao_cao");
    const overVmp = list.filter((a) => a.st === "over").length;
    const done = list.filter((a) => a.st === "done").length;
    rows.push({
      dept, label: DEPT_LABEL[dept] || dept, total: list.length,
      overProtocol, overValidation, overReport, overVmp,
      onTimeRate: list.length ? Math.round((done / list.length) * 100) : 0,
    });
  }
  // Bộ phận nghẽn nặng nhất (tổng 3 giai đoạn chậm) lên đầu — đúng ý "bộ phận nào chậm".
  return rows.sort((a, b) =>
    (b.overProtocol + b.overValidation + b.overReport) - (a.overProtocol + a.overValidation + a.overReport));
}

/* ======================== 5. VIỆC DỰ KIẾN THÁNG TỚI ======================== */

export interface NextMonthItem {
  id: string; code: string; name: string; depts: string[];
  target: string; owner: string; crit: string;
}

export interface NextMonthByDept { dept: string; label: string; count: number }

export interface NextMonthWork {
  monthLabel: string;
  total: number;
  items: NextMonthItem[];
  byDept: NextMonthByDept[];
}

export function nextMonthWork(acts: Activity[]): NextMonthWork {
  const today = vmpToday();
  const first = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const firstAfter = new Date(today.getFullYear(), today.getMonth() + 2, 1);
  const A = acts.filter((a) => isActive(a) && a.st !== "done");
  const items: NextMonthItem[] = A.filter((a) => {
    const t = parseD(a.target);
    return !!t && t >= first && t < firstAfter;
  }).map((a) => ({
    id: a.id, code: a.code, name: a.name || a.code,
    depts: (Array.isArray(a.depts) && a.depts.length) ? a.depts : [a.dept || "qa"],
    target: a.target || "", owner: a.owner || "Chưa phân công", crit: a.crit || "TB",
  })).sort((x, y) => x.target.localeCompare(y.target));

  const countByDept = new Map<string, number>();
  for (const it of items) for (const d of it.depts) countByDept.set(d, (countByDept.get(d) || 0) + 1);
  const byDept: NextMonthByDept[] = [...countByDept.entries()]
    .map(([dept, count]) => ({ dept, label: DEPT_LABEL[dept] || dept, count }))
    .sort((a, b) => b.count - a.count);

  return { monthLabel: `${first.getMonth() + 1}/${first.getFullYear()}`, total: items.length, items, byDept };
}

/* ======================== DỮ LIỆU THÔ (xuất Excel/CSV) ======================== */

export interface RawRow {
  ma: string; ten: string; loai: string; bo_phan: string; khu_vuc: string;
  nguoi_thuc_hien: string; trong_yeu: string;
  tt_de_cuong: string; tt_tham_dinh: string; tt_bao_cao: string; tt_vmp: string;
  dl_de_cuong: string; dl_tham_dinh: string; dl_bao_cao: string; dl_vmp: string;
  ngay_de_cuong: string; ngay_tham_dinh: string; ngay_bao_cao: string; ngay_vmp: string;
  trang_thai: string;
}

const rawStr = (v: unknown): string => (v == null ? "" : String(v));

export function buildRawRows(acts: Activity[]): RawRow[] {
  return acts.filter(isActive).map((a) => {
    const r = (a._raw || {}) as Record<string, unknown>;
    return {
      ma: a.code || a.id, ten: a.name || a.code || "", loai: a.vtype || a.type || "",
      bo_phan: (Array.isArray(a.depts) ? a.depts : [a.dept || ""]).join("+"),
      khu_vuc: rawStr(r.khu_vuc) || rawStr(a.area) || "",
      nguoi_thuc_hien: a.owner || "Chưa phân công", trong_yeu: a.crit || "",
      tt_de_cuong: rawStr(r.tt_de_cuong_goc ?? r.tt_de_cuong),
      tt_tham_dinh: rawStr(r.tt_tham_dinh_goc ?? r.tt_tham_dinh),
      tt_bao_cao: rawStr(r.tt_bao_cao_goc ?? r.tt_bao_cao),
      tt_vmp: rawStr(r.tt_vmp_goc ?? r.tt_vmp),
      dl_de_cuong: rawStr(r.dl_de_cuong), dl_tham_dinh: rawStr(r.dl_tham_dinh),
      dl_bao_cao: rawStr(r.dl_bao_cao), dl_vmp: rawStr(r.dl_vmp),
      ngay_de_cuong: rawStr(r.ngay_de_cuong), ngay_tham_dinh: rawStr(r.ngay_tham_dinh),
      ngay_bao_cao: rawStr(r.ngay_bao_cao), ngay_vmp: rawStr(r.ngay_vmp),
      trang_thai: a.st,
    };
  });
}

/* =====================================================================
 *  timelineSummaryModel.ts — dải tình trạng của màn Timeline
 *  (đợt 1 áp nghiên cứu docs/nghien-cuu/2026-08-16-deep-research-timeline-3d.md)
 *  ---------------------------------------------------------------------
 *  Bước Foundation của nghiên cứu: TÁCH derivation khỏi TimelinePage
 *  (97KB) để có một nguồn chân lý kiểm được bằng node --test. issueLevel
 *  được DỜI từ trang sang đây nguyên văn — trang import lại, không còn
 *  hai bản luật.
 *
 *  Bốn dải phân hoạch (mỗi hạng mục active thuộc đúng một dải, xếp theo
 *  ưu tiên): quá hạn → sắp đến hạn (đích ≤ SOON_DAYS) → đang thực hiện
 *  → còn lại; "hoàn thành" đứng riêng. Strip KPI và bộ lọc tình trạng
 *  đọc CÙNG các hàm này nên bấm ô nào danh sách ra đúng bấy nhiêu dòng.
 * ===================================================================== */
import { SOON_DAYS, vmpToday } from "../../constants/vmp.ts";
import { parseD, phaseStates } from "../../utils/helpers.ts";
import type { Activity } from "../../types/domain.ts";

/** Tình trạng gộp của một hạng mục — luật DỜI NGUYÊN VĂN từ TimelinePage:
 *  một pha trễ (đề cương/thẩm định/báo cáo) thắng trạng thái tổng. */
export function issueLevel(a: Activity): string {
  const ps = phaseStates(a);
  const hasOverPhase = [ps.p, ps.v, ps.r].includes("over");
  if (a.st === "over" || hasOverPhase) return "over";
  if (a.st === "done") return "done";
  if (a.st === "prog") return "prog";
  return "todo";
}

const laActive = (a: Activity): boolean =>
  String(a.state ?? (a._raw as Record<string, unknown> | undefined)?.state ?? "active") === "active";

/** Đích VMP còn trong cửa sổ SOON_DAYS và hạng mục CHƯA rơi vào quá hạn
 *  hay hoàn thành. Quá hạn được loại ở đây để bốn dải không giẫm nhau. */
export function laSapDenHan(a: Activity, now: Date = vmpToday()): boolean {
  const muc = issueLevel(a);
  if (muc === "over" || muc === "done") return false;
  const dich = parseD(a.target);
  if (!dich) return false;
  const conLai = Math.round((dich.getTime() - now.getTime()) / 86_400_000);
  return conLai >= 0 && conLai <= SOON_DAYS;
}

export interface TimelineSummary {
  tong: number;
  quaHan: number;
  sapDenHan: number;
  dangThucHien: number;
  hoanThanh: number;
  conLai: number;
}

/* ------- Action narrative (nghiên cứu đợt 2): điểm nóng & nút thắt -----
 * Mỗi hạng mục quá hạn được quy về MỘT mốc trễ sớm nhất của nó (đề cương/
 * thẩm định/báo cáo/đích VMP). "Nặng nhất" = hạng mục có mốc đó xa nhất
 * về quá khứ; "nút thắt" = pha gom nhiều hạng mục trễ nhất. Cùng nguồn
 * luật với strip nên các con số đối chiếu được với bộ lọc. */

export interface DiemNong { act: Activity; mocTre: string; treNgay: number; }
export interface NutThat { ten: string; so: number; tongQuaHan: number; }

const NGAY_MS = 86_400_000;

/** Mốc trễ sớm nhất của một hạng mục quá hạn; null nếu không quá hạn. */
function mocTreSomNhat(a: Activity, now: Date): { ten: string; ngay: Date } | null {
  if (issueLevel(a) !== "over") return null;
  const ps = phaseStates(a);
  const m = ps.m;
  const cac: Array<{ ten: string; ngay: Date | null | undefined }> = [
    { ten: "Đề cương", ngay: ps.p === "over" ? m.protocol : null },
    { ten: "Thẩm định", ngay: ps.v === "over" ? m.validation : null },
    { ten: "Báo cáo", ngay: ps.r === "over" ? m.report : null },
    { ten: "Đích VMP", ngay: a.st === "over" && m.target && m.target < now ? m.target : null },
  ];
  let som: { ten: string; ngay: Date } | null = null;
  for (const c of cac) {
    if (c.ngay && (!som || c.ngay < som.ngay)) som = { ten: c.ten, ngay: c.ngay };
  }
  return som;
}

/** Hạng mục trễ nặng nhất (mốc trễ sớm nhất xa nhất về quá khứ). */
export function timDiemNong(
  acts: readonly Activity[], now: Date = vmpToday(),
): DiemNong | null {
  let kq: DiemNong | null = null;
  for (const a of acts) {
    if (!laActive(a)) continue;
    const moc = mocTreSomNhat(a, now);
    if (!moc) continue;
    const treNgay = Math.round((now.getTime() - moc.ngay.getTime()) / NGAY_MS);
    if (!kq || treNgay > kq.treNgay) kq = { act: a, mocTre: moc.ten, treNgay };
  }
  return kq;
}

/** Pha gom nhiều hạng mục trễ nhất (mỗi hạng mục tính một lần). */
export function timNutThat(
  acts: readonly Activity[], now: Date = vmpToday(),
): NutThat | null {
  const dem = new Map<string, number>();
  let tong = 0;
  for (const a of acts) {
    if (!laActive(a)) continue;
    const moc = mocTreSomNhat(a, now);
    if (!moc) continue;
    tong += 1;
    dem.set(moc.ten, (dem.get(moc.ten) ?? 0) + 1);
  }
  if (!tong) return null;
  let ten = "", so = 0;
  for (const [t, s] of dem) if (s > so) { ten = t; so = s; }
  return { ten, so, tongQuaHan: tong };
}

export function buildTimelineSummary(
  acts: readonly Activity[], now: Date = vmpToday(),
): TimelineSummary {
  const active = acts.filter(laActive);
  const kq: TimelineSummary = {
    tong: active.length, quaHan: 0, sapDenHan: 0,
    dangThucHien: 0, hoanThanh: 0, conLai: 0,
  };
  for (const a of active) {
    const muc = issueLevel(a);
    if (muc === "over") kq.quaHan += 1;
    else if (muc === "done") kq.hoanThanh += 1;
    else if (laSapDenHan(a, now)) kq.sapDenHan += 1;
    else if (muc === "prog") kq.dangThucHien += 1;
    else kq.conLai += 1;
  }
  return kq;
}

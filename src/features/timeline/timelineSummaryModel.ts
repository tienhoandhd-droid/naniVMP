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

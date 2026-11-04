/* Số liệu tóm tắt phiếu Thay đổi / Sai lệch cho Tổng quan và Báo cáo.
 *
 * Luật đã chốt với chủ dự án (04/11/2026):
 *  · Hoàn thành = trạng thái xử lý "Đã xong".
 *  · Chỉ tính phiếu có hạn rơi vào năm đang xem; phiếu chưa có hạn đếm riêng.
 *  · Bỏ phiếu "Không áp dụng" và phiếu đã gỡ khỏi sổ.
 * Đây là chỉ số BỔ SUNG, không trộn vào tỉ lệ hoàn thành VMP. */
import { isOverdue, type ChangeRecord, type ChangeRecordKind } from "./contracts.ts";

export interface ChangeKindSummary {
  total: number;
  done: number;
  open: number;
  overdue: number;
  /** Phiếu chưa có hạn — không vào tỉ lệ vì không biết thuộc năm nào. */
  noDeadline: number;
  /** null khi không có phiếu nào (hiển thị "—", không phải 0%). */
  rate: number | null;
}

export type ChangeSummary = Record<ChangeRecordKind, ChangeKindSummary>;

type SummaryInput = Pick<ChangeRecord, "recordKind" | "deadline" | "handlingStatus" | "removedFromSheetAt">;

function summarizeKind(rows: readonly SummaryInput[], year: number, today: string): ChangeKindSummary {
  const counted = rows.filter((row) => !row.removedFromSheetAt && row.handlingStatus !== "khong_ap_dung");
  const noDeadline = counted.filter((row) => !row.deadline).length;
  const inYear = counted.filter((row) => row.deadline && Number(row.deadline.slice(0, 4)) === year);
  const done = inYear.filter((row) => row.handlingStatus === "da_xong").length;
  return {
    total: inYear.length,
    done,
    open: inYear.length - done,
    overdue: inYear.filter((row) => isOverdue(row, today)).length,
    noDeadline,
    rate: inYear.length ? Math.round((done / inYear.length) * 100) : null,
  };
}

export function summarizeChanges(rows: readonly SummaryInput[], year: number, today: string): ChangeSummary {
  return {
    thay_doi: summarizeKind(rows.filter((row) => row.recordKind === "thay_doi"), year, today),
    sai_lech: summarizeKind(rows.filter((row) => row.recordKind === "sai_lech"), year, today),
  };
}

export const CHANGE_KIND_LABEL: Record<ChangeRecordKind, string> = {
  thay_doi: "Thay đổi",
  sai_lech: "Sai lệch",
};

/** Dòng phụ ngắn dưới con số, dùng chung cho thẻ trên màn và bản in. */
export function changeSummarySub(s: ChangeKindSummary): string {
  if (!s.total) return s.noDeadline ? `${s.noDeadline} phiếu chưa có hạn` : "Không có phiếu";
  const parts = [`${s.done}/${s.total} đã xong`];
  if (s.overdue) parts.push(`quá hạn ${s.overdue}`);
  if (s.noDeadline) parts.push(`${s.noDeadline} chưa có hạn`);
  return parts.join(" · ");
}

/* =====================================================================
 *  hanChot.ts — MỘT nguồn sự thật cho phép so "hạn vs hôm nay" phía client
 *  ---------------------------------------------------------------------
 *  Trước 31/08, "quá hạn" được tính ở BA chỗ với ba kiểu ngày khác nhau
 *  (Date local, chuỗi ISO, lịch Bangkok) — soi toàn web bắt được cảnh hai
 *  màn báo hai con số cho cùng một hạng mục. A3 đã kéo tất cả về lịch
 *  Bangkok; file này gom PHÉP SO về một chỗ để lần sửa luật sau chỉ sửa
 *  một nơi.
 *
 *  Phạm vi cố ý hẹp: chỉ số học ngày + chọn mốc kế tiếp. Việc MỖI MÀN chọn
 *  nhìn mốc nào (chỉ đích VMP, cả bốn mốc, hay theo a.st) là ngữ nghĩa
 *  màn đó — đổi nó là đổi nghiệp vụ, phải có QA chốt, không giấu trong lib.
 *  Nguồn sự thật TỐI THƯỢNG là computed_status phía server (đợt sau).
 * ===================================================================== */

export type TinhTrangHan = "overdue" | "today" | "soon" | "future" | "missing";

const DAY_MS = 86_400_000;
const BANGKOK_OFFSET_MS = 7 * 3_600_000;

/** Ngày lịch Bangkok của một thời điểm — trùng bangkokCalendarDate (vmpDeadlineModel). */
export function ngayLichBangkok(luc: Date): string {
  return new Date(luc.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/** Số ngày từ hôm nay (Bangkok) đến hạn — âm là đã quá. null nếu thiếu hạn. */
export function soNgayConLai(hanISO: string | null | undefined, homNay: Date): number | null {
  if (!hanISO || !/^\d{4}-\d{2}-\d{2}$/.test(hanISO)) return null;
  return Math.round(
    (Date.parse(`${hanISO}T00:00:00Z`) - Date.parse(`${ngayLichBangkok(homNay)}T00:00:00Z`)) / DAY_MS,
  );
}

/** Phân loại một hạn đơn lẻ theo hôm nay Bangkok. */
export function tinhTrangHan(
  hanISO: string | null | undefined,
  homNay: Date,
  soonDays: number,
): { kind: TinhTrangHan; daysRemaining: number | null } {
  const con = soNgayConLai(hanISO, homNay);
  if (con === null) return { kind: "missing", daysRemaining: null };
  if (con < 0) return { kind: "overdue", daysRemaining: con };
  if (con === 0) return { kind: "today", daysRemaining: con };
  if (con <= soonDays) return { kind: "soon", daysRemaining: con };
  return { kind: "future", daysRemaining: con };
}

export interface MocDangKy {
  /** protocol | validation | report | vmp — hoặc id tuỳ màn. */
  id: string;
  hanISO: string | null;
  xong: boolean;
}

/** Mốc CHƯA XONG có hạn SỚM NHẤT — định nghĩa "hạn đang treo" của hạng mục.
 *  Mốc xong bị loại; mốc chưa xong nhưng thiếu hạn không thắng được mốc có
 *  hạn (thiếu dữ liệu không được che một hạn thật đang trễ). */
export function mocKeTiep(mocs: readonly MocDangKy[]): MocDangKy | null {
  const chuaXong = mocs.filter((m) => !m.xong);
  if (chuaXong.length === 0) return null;
  const coHan = chuaXong
    .filter((m) => !!m.hanISO)
    .sort((a, b) => String(a.hanISO).localeCompare(String(b.hanISO)));
  return coHan[0] ?? chuaXong[0];
}

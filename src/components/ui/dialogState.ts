/* =====================================================================
 *  dialogState.ts — phần logic thuần của hộp thoại
 *  ---------------------------------------------------------------------
 *  Tách khỏi component để `node --test` chạy được mà không cần DOM. Hai
 *  thứ ở đây đều là chỗ dễ sai mà lại khó nhìn ra bằng mắt: thứ tự vòng
 *  tiêu điểm, và sổ đăng ký "form đang có thay đổi chưa lưu".
 * ===================================================================== */

/** Lý do hộp thoại đóng — nơi gọi cần biết để xử lý khác nhau. */
export type ViewportDialogCloseReason = "escape" | "backdrop" | "button" | "completed";

/**
 * Vị trí tiêu điểm kế tiếp trong một vòng khép kín.
 *
 * Tab ở phần tử cuối quay về đầu; Shift+Tab ở phần tử đầu nhảy xuống cuối.
 * Không có vòng này thì tiêu điểm thoát ra sau lưng lớp phủ, và người dùng
 * bàn phím rơi vào một trang họ không nhìn thấy.
 */
export function nextDialogFocus(hienTai: number, tong: number, nguoc: boolean): number {
  if (tong <= 0) return 0;
  const buoc = nguoc ? -1 : 1;
  return ((hienTai + buoc) % tong + tong) % tong;
}

/**
 * Cập nhật sổ "đang có thay đổi chưa lưu".
 *
 * Trả về Set MỚI chứ không sửa tại chỗ: React so sánh tham chiếu để quyết
 * định render lại, sửa tại chỗ thì màn hình không cập nhật.
 */
export function updateDirtyRegistry(hienTai: ReadonlySet<string>, khoa: string, ban: boolean): Set<string> {
  const moi = new Set(hienTai);
  if (ban) moi.add(khoa);
  else moi.delete(khoa);
  return moi;
}

/** Có form nào đang dở không, và là những form nào. */
export function summarizeDirty(reg: ReadonlySet<string>): { hasDirty: boolean; keys: string[] } {
  return { hasDirty: reg.size > 0, keys: [...reg].sort() };
}

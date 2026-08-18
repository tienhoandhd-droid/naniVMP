/* =====================================================================
 *  toastQueue.ts — luật hàng đợi thông báo, tách khỏi React
 *  ---------------------------------------------------------------------
 *  Không import React: luật phải kiểm được mà không cần dựng trình duyệt.
 *
 *  Hai điều dễ làm sai và là lý do file này tồn tại:
 *
 *  1. Thao tác dài (lưu, ghi lô Excel) mở một toast "đang chạy" rồi CHỐT
 *     nó thành thành công hay thất bại. Chốt phải sửa TẠI CHỖ — bỏ đi rồi
 *     thêm mới sẽ làm dòng nhảy vị trí ngay lúc người dùng đang đọc.
 *  2. Bấm liên tục thì hàng đợi phải có trần. Không có trần thì mười thao
 *     tác nhanh phủ kín màn hình và che mất chính cái bảng vừa ghi.
 * ===================================================================== */
export type LoaiToast = "dang" | "thanhCong" | "loi" | "canhBao";

export interface Toast {
  id: string;
  loai: LoaiToast;
  noiDung: string;
}

/** Mili giây trước khi tự tắt. 0 nghĩa là chờ chốt, không tự tắt. */
export const THOI_LUONG: Record<LoaiToast, number> = {
  dang: 0,
  thanhCong: 2500,
  canhBao: 5000,
  loi: 6000,
};

/** Nhiều hơn ngần này thì toast che mất nội dung nó vừa báo là đã ghi. */
export const TOI_DA = 4;

export function themToast(ds: readonly Toast[], t: Toast): Toast[] {
  const moi = [...ds, t];
  return moi.length > TOI_DA ? moi.slice(moi.length - TOI_DA) : moi;
}

export function chotToast(
  ds: readonly Toast[], id: string, loai: LoaiToast, noiDung: string,
): Toast[] {
  if (!ds.some((t) => t.id === id)) return themToast(ds, { id, loai, noiDung });
  return ds.map((t) => (t.id === id ? { id, loai, noiDung } : t));
}

export function boToast(ds: readonly Toast[], id: string): Toast[] {
  return ds.filter((t) => t.id !== id);
}

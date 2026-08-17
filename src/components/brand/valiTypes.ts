/* =====================================================================
 *  valiTypes.ts — API chung của hai nhân vật thương hiệu
 *  ---------------------------------------------------------------------
 *  Công chúa (nền sáng) và Dũng sĩ (nền tối) dùng CHUNG ba mood và chung
 *  bộ cỡ. Tách ra file riêng để hai file vẽ không phải import lẫn nhau —
 *  và để `node --test` nạp được kiểu mà không kéo theo JSX.
 * ===================================================================== */

/** Ba trạng thái DUY NHẤT (ADR-VALI-001) — quyết định nhân vật xuất hiện
 *  ở đâu, không phải để trang trí:
 *    guide     — hướng dẫn, empty state, chưa chọn gì
 *    concern   — dữ liệu cần xử lý (KHÔNG dùng cho lỗi hệ thống)
 *    celebrate — trạng thái tốt thật sự */
export type ValiMood = "guide" | "concern" | "celebrate";

export const NHAN_MOOD: Record<ValiMood, string> = {
  guide: "đang hướng dẫn",
  concern: "nhắc có việc cần xử lý",
  celebrate: "chúc mừng",
};

/** Cỡ đặt sẵn theo ngữ cảnh (§5) — hero cho trang trống lớn, small cho
 *  chỗ chật. Component vẫn nhận số px cụ thể. */
export const CO_SAN = { hero: 230, empty: 180, small: 140 } as const;

export type ValiSize = keyof typeof CO_SAN | number;

export interface ValiProps {
  mood?: ValiMood;
  size?: ValiSize;
  /** Trang trí thuần tuý (mặc định): ẩn khỏi trình đọc màn hình. */
  decorative?: boolean;
  className?: string;
}

export const rongTheoCo = (size: ValiSize | undefined): number =>
  typeof size === "number" ? size : CO_SAN[size ?? "empty"];

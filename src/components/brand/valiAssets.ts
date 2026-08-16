/* =====================================================================
 *  valiAssets.ts — luật chọn ảnh theo mood (Vali V2, phương án C)
 *  ---------------------------------------------------------------------
 *  Ba mood guide/concern/celebrate là API cố định (ADR-VALI-001); ảnh
 *  thì đến dần theo asset chủ dự án cấp. Luật: mood chưa có ảnh RIÊNG
 *  rơi về guide — không bao giờ vỡ ảnh, không cần đổi code nơi dùng.
 *
 *  Khi nhận ảnh mới: tách nền → nén WebP alpha ≤80KB → đặt vào
 *  src/assets/brand/vali/vali-<mood>.webp → thêm tên vào MOOD_CO_ANH.
 *  (Không dùng import.meta.glob để node --test vẫn chạy được file này.)
 * ===================================================================== */

/** Mood đã có ảnh riêng trên đĩa. */
export const MOOD_CO_ANH: readonly string[] = ["guide"];

export function chonFileVali(mood: string): string {
  return MOOD_CO_ANH.includes(mood) ? mood : "guide";
}

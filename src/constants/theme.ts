/* =====================================================================
 *  constants/theme.ts — Hệ token thiết kế · VMP Monitor
 *  ---------------------------------------------------------------------
 *  Thiết kế lại 29/07/2026 theo hướng 2026: chiều sâu là TÍN HIỆU PHÂN
 *  CẤP chứ không phải trang trí, kính mờ tiết chế, chuyển động có mục
 *  đích, và có chế độ tối thật sự.
 *
 *  ĐIỂM MẤU CHỐT: giá trị màu nay là `var(--c-*)` chứ không phải mã hex.
 *  Nhờ vậy đổi cả bảng màu (sáng ↔ tối) chỉ cần đổi biến trong CSS —
 *  không phải sờ tới ~990 style nội tuyến rải khắp 16 nghìn dòng. Tên
 *  token giữ nguyên nên toàn bộ code cũ chạy y như trước.
 *
 *  Giá trị thật của từng biến nằm ở src/index.css, khối `:root` (sáng)
 *  và `[data-theme="dark"]` (tối).
 * ===================================================================== */

import type { CSSProperties } from "react";

export const C = {
  bg1: "var(--c-bg1)", bg2: "var(--c-bg2)",

  /** Nền của thẻ / bảng / ô nhập. Sáng là trắng, tối là than tím. */
  surface: "var(--c-surface)",
  /** Nền chìm hơn surface một bậc — dùng cho vùng phụ, ô nhập trong thẻ. */
  surfaceSunk: "var(--c-surface-sunk)",
  /** Nền nổi hơn surface một bậc — dùng cho hộp thoại, menu nổi. */
  surfaceRaised: "var(--c-surface-raised)",

  pink: "var(--c-pink)", pinkDeep: "var(--c-pink-deep)", pinkText: "var(--c-pink-text)",
  pinkSoft: "var(--c-pink-soft)", pinkMist: "var(--c-pink-mist)",
  lav: "var(--c-lav)", lavText: "var(--c-lav-text)", lavSoft: "var(--c-lav-soft)",
  mint: "var(--c-mint)", mintText: "var(--c-mint-text)", mintSoft: "var(--c-mint-soft)",
  sky: "var(--c-sky)", skyText: "var(--c-sky-text)", skySoft: "var(--c-sky-soft)",
  rasp: "var(--c-rasp)", raspText: "var(--c-rasp-text)", raspSoft: "var(--c-rasp-soft)",
  marigold: "var(--c-marigold)", marigoldText: "var(--c-marigold-text)",
  marigoldSoft: "var(--c-marigold-soft)",
  gold: "var(--c-gold)", silver: "var(--c-silver)", bronze: "var(--c-bronze)",

  /** Chữ chính / chữ phụ. Tên giữ từ bản cũ để không phải sửa code. */
  plum: "var(--c-ink)", plumSoft: "var(--c-ink-soft)",
  white: "var(--c-surface)", line: "var(--c-line)",
};

export const TEXT = "'Quicksand', system-ui, -apple-system, sans-serif";
export const NUM = "'Baloo 2', 'Quicksand', system-ui, sans-serif";
export const GRAD = "var(--grad)";
export const GRAD_SOFT = "var(--grad-soft)";

/* ---------------------------------------------------------------------
 * Thang độ nổi (elevation).
 *
 * Bốn bậc, không hơn. Mỗi bậc = một mức phân cấp, không phải một mức
 * "đẹp hơn". Bóng gồm hai lớp: một lớp sát viền cho cạnh sắc, một lớp
 * toả xa cho chiều sâu — bóng một lớp luôn trông bẹt.
 * ------------------------------------------------------------------- */
export const E = {
  /** Bậc 0 — nằm phẳng trên nền, chỉ có đường viền. */
  flat: "none",
  /** Bậc 1 — thẻ thường. */
  low: "var(--e-low)",
  /** Bậc 2 — thẻ được nhấn, thẻ đang trỏ chuột. */
  mid: "var(--e-mid)",
  /** Bậc 3 — menu nổi, popover. */
  high: "var(--e-high)",
  /** Bậc 4 — hộp thoại phủ toàn màn. */
  modal: "var(--e-modal)",
};

/** Bo góc — thang 4 bậc, dùng nhất quán thay vì tuỳ hứng mỗi chỗ một số. */
export const R = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 };

/* ---------------------------------------------------------------------
 * Chuyển động.
 *
 * Có mục đích: báo đổi trạng thái, dẫn mắt, giải thích nhân–quả. Không
 * dùng để trang trí. Toàn bộ tự tắt khi người dùng bật "giảm chuyển
 * động" trong hệ điều hành (xử lý ở index.css).
 * ------------------------------------------------------------------- */
export const MO = {
  /** Phản hồi tức thì: đổi màu, hiện viền focus. */
  fast: "120ms",
  /** Chuyển cảnh thường: thẻ nổi lên, menu mở. */
  base: "220ms",
  /** Chuyển cảnh lớn: đổi trang, hộp thoại. */
  slow: "380ms",
  /** Ease chuẩn — chậm dần, giống vật thể có quán tính. */
  ease: "cubic-bezier(.22,.61,.36,1)",
  /** Ease nảy nhẹ — chỉ dùng cho thứ người dùng vừa bấm. */
  spring: "cubic-bezier(.34,1.4,.64,1)",
};

export const cardDefault: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.line}`,
  borderRadius: R.xl,
  boxShadow: E.low,
};
export const cardStrong: CSSProperties = {
  background: C.surface,
  border: `1px solid var(--c-line-strong)`,
  borderRadius: R.xl,
  boxShadow: E.mid,
};
export const cardSoft: CSSProperties = {
  background: C.surfaceSunk,
  border: `1px solid ${C.line}`,
  borderRadius: R.lg,
  boxShadow: E.flat,
};
/** Kính mờ tiết chế — đủ để tách lớp, không đủ để làm nhiễu chữ bên dưới. */
export const glass: CSSProperties = {
  background: "var(--c-glass)",
  backdropFilter: "blur(16px) saturate(1.4)",
  WebkitBackdropFilter: "blur(16px) saturate(1.4)",
  border: `1px solid var(--c-glass-line)`,
  borderRadius: R.md,
  boxShadow: E.low,
};
export const btnPrimary: CSSProperties = {
  background: GRAD, color: "#fff", border: "none", cursor: "pointer",
  fontFamily: TEXT, fontWeight: 700, fontSize: 13.5,
  borderRadius: R.sm,
  boxShadow: "var(--e-accent)",
  transition: `transform ${MO.fast} ${MO.spring}, box-shadow ${MO.base} ${MO.ease}`,
};
export const INP: CSSProperties = {
  width: "100%", padding: "11px 14px", borderRadius: R.sm,
  border: `1px solid ${C.line}`, background: C.surfaceSunk,
  fontFamily: TEXT, fontSize: 13.5, color: C.plum, fontWeight: 600, outline: "none",
  transition: `border-color ${MO.fast} ${MO.ease}, box-shadow ${MO.fast} ${MO.ease}`,
};
export const FIELD: CSSProperties = { display: "flex", flexDirection: "column", gap: 5 };
export const LBL: CSSProperties = { fontSize: 11.5, fontWeight: 800, color: C.plumSoft };

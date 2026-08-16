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

import { LOTUS_RADII } from "../lib/visualContract";

export const C = {
  bg1: "var(--c-bg1)", bg2: "var(--c-bg2)",

  /** Nền của thẻ / bảng / ô nhập. Sáng là trắng, tối là than tím. */
  surface: "var(--c-surface)",
  /** Nền chìm hơn surface một bậc — dùng cho vùng phụ, ô nhập trong thẻ. */
  surfaceSunk: "var(--c-surface-sunk)",
  /** Nền nổi hơn surface một bậc — dùng cho hộp thoại, menu nổi. */
  surfaceRaised: "var(--c-surface-raised)",
  /** Nền kính mờ — ĐỔI theo chế độ sáng/tối. Dùng token này thay vì gõ
   *  rgba(255,255,255,...) cứng: nền trắng cứng ở chế độ tối biến thanh
   *  công cụ thành một dải sáng và chữ trên đó gần như biến mất. */
  glass: "var(--c-glass)",

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

/* ---------------------------------------------------------------------
 * BỘ ĐÔI PHÔNG CHỮ — hiển thị + thân bài.
 *
 * TEXT dùng cho MỌI thứ đọc thật: bảng, nhãn, thân bài, chú thích.
 * Be Vietnam Pro do người Việt thiết kế riêng cho tiếng Việt — dấu được
 * vẽ và canh chuẩn ở cỡ nhỏ, chiều cao chữ thường lớn, và có chữ số đều
 * bề rộng. Ba thứ đó đúng là ba thứ một dashboard số liệu cần.
 *
 * DISPLAY (Quicksand) chỉ còn dùng cho logo, tiêu đề và số KPI lớn — tức
 * là "giọng nói thương hiệu". Bản trước dùng nó cho toàn bộ bảng số 10–13px
 * kèm dấu tiếng Việt: font tròn hình học, x-height thấp, chữ 'a' một tầng,
 * đặt ở cỡ đó thì dấu chồng lên nhau và mắt phải căng ra đọc.
 *
 * NUM dùng cho con số trong bảng và nhãn — cùng phông thân bài.
 *
 * LƯU Ý một điều trái với chú thích cũ ở đây: Be Vietnam Pro KHÔNG có bảng
 * chữ số đều bề rộng. Đo ở 13px cho "111" 16.19px, "000" 27px — và
 * `tabular-nums` không đổi được. Cột số thẳng hàng là nhờ CĂN PHẢI
 * (`.tnum--cot`), không phải nhờ phông.
 * ------------------------------------------------------------------- */
export const TEXT = "'Be Vietnam Pro', system-ui, -apple-system, sans-serif";
/** Phông kể chuyện — Cormorant Garamond, chỉ dùng cho logo, H1, section
 *  title lớn và số KPI hero. Đặt nó vào bảng hay nhãn là sai vai trò: nét
 *  thanh của serif ở cỡ 12–14 px kèm dấu tiếng Việt sẽ mảnh tới mức mờ. */
export const DISPLAY = "'Cormorant Garamond', 'Be Vietnam Pro', Georgia, serif";
export const NUM = "'Be Vietnam Pro', system-ui, -apple-system, sans-serif";
/** Số KPI cỡ lớn — chỗ duy nhất dùng phông hiển thị cho chữ số.
 *
 *  Đo trong Chrome ở cỡ 42px (2026-08-15): Cormorant Garamond cho "111",
 *  "000" và "789" ĐỀU rộng 61.88px — tức chữ số của nó đều bề rộng, cột số
 *  thẳng hàng. Be Vietnam Pro cho 52.30 / 87.20 / 81.70px, và
 *  `font-variant-numeric: tabular-nums` KHÔNG đổi được con số đó vì bản
 *  Google Fonts của nó không kèm bảng `tnum`.
 *
 *  Nên với KPI lớn, serif vừa đúng spec §6.3 vừa là lựa chọn đọc tốt hơn.
 *  Chữ nhỏ trong bảng vẫn dùng NUM (sans): ở 13px thì nét thanh của serif
 *  kèm dấu tiếng Việt mảnh tới mức mờ. */
export const NUM_HERO = "'Cormorant Garamond', 'Be Vietnam Pro', Georgia, serif";
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

/* Bo góc — nay ánh xạ sang thang Lotus Pearl ở spec §6.4, giữ nguyên bốn
 * tên cũ để code cũ không vỡ:
 *   sm  → control 10 px  (nút, ô nhập, chip nhỏ)
 *   md  → card    18 px  (thẻ nội dung)
 *   lg  → card    18 px  (tên cũ, cùng vai trò thẻ)
 *   xl  → panel   24 px  (panel hero, hộp thoại)
 * Nguồn số là LOTUS_RADII trong src/lib/visualContract.ts — đừng gõ lại
 * con số ở nơi khác, lệch một chỗ là hỏng nhịp toàn app. */
export const R = {
  sm: LOTUS_RADII.control,
  md: LOTUS_RADII.card,
  lg: LOTUS_RADII.card,
  xl: LOTUS_RADII.panel,
  pill: LOTUS_RADII.pill,
};

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
  /* v3 (nghiên cứu 5): nút chính ĐẶC màu plum, không gradient — gradient
   * dành cho hero/lacquer surface; control phẳng và rõ (tinh thần
   * Stripe/Linear). on-plum tự đảo đúng ở dark mode. */
  background: "var(--lp-plum)", color: "var(--lp-on-plum)", border: "none", cursor: "pointer",
  fontFamily: TEXT, fontWeight: 700, fontSize: 14,
  /* Padding và chiều cao tối thiểu nằm SẴN trong kiểu nền, không để mỗi
   * nơi gọi tự nhớ. Trước đây thiếu hai dòng này nên nút nào quên đặt
   * padding sẽ cao đúng 23px — dưới ngưỡng vùng chạm 24px của WCAG 2.5.8,
   * và không ai phát hiện vì trông vẫn "gọn gàng". */
  padding: "0 16px",
  minHeight: 42,
  borderRadius: R.sm,
  boxShadow: "var(--e-accent)",
  transition: `transform ${MO.fast} ${MO.spring}, box-shadow ${MO.base} ${MO.ease}`,
};
export const INP: CSSProperties = {
  /* Chiều cao 42px theo bảng component token của báo cáo nghiên cứu. Đặt ở
     đây thay vì từng ô nhập: một chỗ sửa, mọi form theo. */
  width: "100%", minHeight: 42, padding: "0 14px", borderRadius: R.sm,
  border: `1px solid ${C.line}`, background: C.surfaceSunk,
  fontFamily: TEXT, fontSize: 14, color: C.plum, fontWeight: 600, outline: "none",
  transition: `border-color ${MO.fast} ${MO.ease}, box-shadow ${MO.fast} ${MO.ease}`,
};
export const FIELD: CSSProperties = { display: "flex", flexDirection: "column", gap: 5 };
export const LBL: CSSProperties = { fontSize: 12, fontWeight: 800, color: C.plumSoft };

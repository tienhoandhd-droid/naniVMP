/* =====================================================================
 *  CrownMark — vương miện hình học, thay emoji 👑 trong shell
 *  ---------------------------------------------------------------------
 *  Ba lý do không dùng emoji cho dấu hiệu thương hiệu: mỗi hệ điều hành
 *  vẽ một kiểu, nó không ăn theo màu ngữ cảnh, và ở cỡ nhỏ nó thành một
 *  khối màu bẹt. Nét ở đây dùng `currentColor` nên đổi màu theo chỗ đặt.
 *
 *  Cùng hình với src/assets/brand/crown-mark.svg — bản React này để
 *  nhúng inline khi cần ăn màu; bản .svg để dùng làm ảnh/mask.
 * ===================================================================== */
export default function CrownMark({ size = 24, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 48 36" fill="none"
      role={title ? "img" : "presentation"} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d="M4 30 L9 11 L17 20 L24 6 L31 20 L39 11 L44 30 Z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M7 33.4 H41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="24" cy="14.6" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="9" cy="11" r="1.2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="39" cy="11" r="1.2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

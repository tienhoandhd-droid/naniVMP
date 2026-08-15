/* =====================================================================
 *  ValiIllustration — chân dung Công chúa Vali (final art v1, 16/08/2026)
 *  ---------------------------------------------------------------------
 *  Đúng như ghi chú vòng 1 của hiến pháp Atelier: SVG trước đây là
 *  PROTOTYPE cấu trúc, "thay file là xong vì API component không đổi".
 *  Chủ dự án đã cung cấp chân dung chính thức — diadem sen vàng champagne,
 *  ngọc trai, áo polo CPC1HN — đúng brief §5 (editorial, không manga).
 *
 *  Giữ nguyên hợp đồng cũ:
 *   · props (mood / size / decorative / className) không đổi;
 *   · `data-lp-vali={mood}` — bộ kiểm atelier đếm đúng thuộc tính này;
 *   · khung 4:5 (rộng = size, cao = size × 1.25) như bản SVG;
 *   · lớp `.lp-vali-enter` cho hoạt ảnh vào (tự tắt theo reduced-motion).
 *
 *  Ba mood hiện dùng CHUNG một chân dung — mapping ngữ nghĩa (guide/
 *  concern/celebrate quyết định Vali XUẤT HIỆN Ở ĐÂU) vẫn nguyên; biến
 *  thể nét mặt theo mood là việc của designer khi có bộ ảnh đủ ba trạng
 *  thái, chỉ cần thay file cùng tên.
 *
 *  Ảnh: src/assets/brand/vali-chan-dung.jpg — 512×640 JPEG ~64KB (ngân
 *  sách ≤80KB/trạng thái), nền trắng sứ; khung bo 24px (radius hero) +
 *  viền token nên đặt trên theme tối vẫn là "chân dung trên nền sứ" có
 *  chủ đích, không phải sticker.
 * ===================================================================== */
/* Tham chiếu ảnh bằng new URL thay vì `import ... from "*.jpg"`: Vite
 * vẫn nhận diện và bundle như thường, còn `node --test` (không có loader
 * ảnh) chỉ tạo một chuỗi URL — hai unit test của Workload từng chết vì
 * import chuỗi tài sản này. */
const chanDung = new URL("../../assets/brand/vali-chan-dung.jpg", import.meta.url).href;

export type ValiMood = "guide" | "concern" | "celebrate";

const NHAN_MOOD: Record<ValiMood, string> = {
  guide: "đang hướng dẫn",
  concern: "nhắc có việc cần xử lý",
  celebrate: "chúc mừng",
};

const CO_SAN = { hero: 230, empty: 180, small: 140 } as const;

export default function ValiIllustration({
  mood = "guide", size = "empty", decorative = true, className,
}: {
  mood?: ValiMood;
  /** Cỡ đặt sẵn theo ngữ cảnh (§5) hoặc số px cụ thể. */
  size?: keyof typeof CO_SAN | number;
  /** Trang trí thuần tuý (mặc định): ẩn khỏi trình đọc màn hình. */
  decorative?: boolean;
  className?: string;
}) {
  const rong = typeof size === "number" ? size : CO_SAN[size];

  return (
    <img
      src={chanDung}
      width={rong}
      height={rong * 1.25}
      className={`lp-vali-enter${className ? ` ${className}` : ""}`}
      data-lp-vali={mood}
      alt={decorative ? "" : `Công chúa Vali ${NHAN_MOOD[mood]}`}
      aria-hidden={decorative ? true : undefined}
      loading="lazy"
      style={{
        display: "block",
        objectFit: "cover",
        borderRadius: 24,
        border: "1px solid var(--lp-line)",
        background: "var(--lp-porcelain)",
      }}
    />
  );
}

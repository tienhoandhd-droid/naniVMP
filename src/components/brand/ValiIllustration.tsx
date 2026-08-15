/* =====================================================================
 *  ValiIllustration — Công chúa Vali, phiên bản Lotus Pearl Atelier
 *  ---------------------------------------------------------------------
 *  Thay hoàn toàn `Mascot` cũ (manga/chibi trong Primitives.tsx). Brief
 *  từ nghiên cứu 15/08 (docs/design/lotus-pearl-atelier.md §5):
 *
 *    · editorial illustration bán thân, KHÔNG chibi, không mắt manga;
 *    · tóc plum-black mảng lớn sạch, 1–2 highlight ngọc trai;
 *    · lotus diadem 3 cánh champagne gold — không jewel cầu vồng;
 *    · line 1.5–2px kiểu Art Nouveau; màu chỉ lấy từ palette token;
 *    · KHÔNG bob vô hạn — chỉ một nhịp xuất hiện, tôn trọng
 *      prefers-reduced-motion (lớp .lp-vali-enter trong lotus-art.css).
 *
 *  Ba trạng thái DUY NHẤT và ngữ nghĩa của chúng:
 *    guide     — hướng dẫn, empty state, chưa chọn gì
 *    concern   — dữ liệu cần xử lý (không phải lỗi hệ thống!)
 *    celebrate — trạng thái tốt thật sự
 *
 *  Không dùng ở: audit log, lỗi xác thực, modal xoá, cảnh báo compliance
 *  nghiêm trọng. Bộ kiểm `npm run atelier` sẽ soát chỗ đặt.
 *
 *  Đây là prototype cấu trúc đúng brief; designer sẽ thay final art sau,
 *  API component giữ nguyên.
 * ===================================================================== */
import { useId } from "react";

export type ValiMood = "guide" | "concern" | "celebrate";

/* Màu lấy đúng giá trị token light (nhân vật là brand art, không đảo màu
   theo chế độ tối — như một bức tranh treo tường không đổi màu theo đèn). */
const MAU = {
  toc: "#3E213E",          // plum-900
  tocSang: "#5A3158",      // plum-700 — highlight mảng tóc
  ngocTrai: "#F4E4EA",     // rose-soft — ánh mother-of-pearl trên tóc
  da: "#F4D8C8",
  vang: "#C7A15B",         // gold — diadem, halo, cổ áo
  moi: "#A74F72",          // rose-600
  net: "#3E213E",
  vienVay: "#5A3158",
} as const;

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
  const uid = useId().replace(/:/g, "");
  const rong = typeof size === "number" ? size : CO_SAN[size];

  return (
    <svg
      viewBox="0 0 320 400"
      width={rong}
      height={rong * 1.25}
      className={`lp-vali-enter${className ? ` ${className}` : ""}`}
      data-lp-vali={mood}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : "Công chúa Vali"}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={`vali-dress-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFDFC" />
          <stop offset=".72" stopColor="#F4E4EA" />
          <stop offset="1" stopColor="#DFC7D1" />
        </linearGradient>
      </defs>

      {/* Halo Art Nouveau — một đường vàng mảnh, rất nhẹ */}
      <path d="M45 315C30 205 62 89 164 42C229 12 286 63 275 129"
        fill="none" stroke={MAU.vang} strokeWidth="1.5" opacity=".34" />

      {/* Tóc — mảng lớn, không sợi manga */}
      <path d="M92 134C91 75 126 46 169 47C225 49 243 95 230 157
               L239 295C214 325 108 325 78 291L92 134Z" fill={MAU.toc} />
      {/* hai highlight: một plum sáng, một ánh ngọc trai */}
      <path d="M110 96C118 66 148 52 176 56C150 62 128 78 120 108L116 150L108 148Z"
        fill={MAU.tocSang} opacity=".55" />
      <path d="M222 120C228 150 230 200 226 244C220 200 216 158 212 130Z"
        fill={MAU.ngocTrai} opacity=".38" />

      {/* Gương mặt */}
      <path d="M117 105C128 79 203 76 218 111C224 156 205 198 166 202
               C130 199 111 161 117 105Z" fill={MAU.da} />

      {/* Chân mày — concern thì hơi thu vào */}
      {mood === "concern" ? (
        <path d="M131 128Q145 122 157 128M178 128Q190 122 204 128"
          fill="none" stroke={MAU.net} strokeWidth="1.8" strokeLinecap="round" />
      ) : (
        <path d="M131 125Q144 120 156 125M179 125Q191 120 204 125"
          fill="none" stroke={MAU.net} strokeWidth="1.6" strokeLinecap="round" opacity=".85" />
      )}

      {/* Mắt hạnh nhân nhỏ — celebrate là mắt cười khép */}
      {mood === "celebrate" ? (
        <path d="M133 141Q145 133 157 141M178 141Q190 133 202 141"
          fill="none" stroke={MAU.net} strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M133 137Q145 130 156 137Q145 142 133 137Z
                 M179 137Q191 130 202 137Q191 142 179 137Z" fill={MAU.net} />
      )}

      {/* Miệng — kín, trưởng thành */}
      {mood === "concern" ? (
        <path d="M158 172Q167 170 176 172" fill="none"
          stroke={MAU.moi} strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M157 169Q167 176 177 169" fill="none"
          stroke={MAU.moi} strokeWidth="2" strokeLinecap="round" />
      )}

      {/* Lotus diadem 3 cánh — champagne gold, không jewel */}
      <path d="M126 83Q143 57 161 76Q170 43 180 76Q200 57 218 83Q172 96 126 83Z"
        fill="none" stroke={MAU.vang} strokeWidth="3" />

      {/* Cổ */}
      <path d="M150 198L150 222L184 222L184 198C174 206 160 206 150 198Z" fill={MAU.da} />

      {/* Váy editorial — cổ đứng gợi cánh sen */}
      <path d="M93 382C96 271 118 214 166 211C218 215 240 274 245 382Z"
        fill={`url(#vali-dress-${uid})`} stroke={MAU.vienVay} strokeWidth="2" />
      <path d="M127 224Q148 249 166 232Q184 249 205 224"
        fill="none" stroke={MAU.vang} strokeWidth="2.5" />

      {/* Cử chỉ theo trạng thái — cảm xúc nằm ở tay, không ở sticker */}
      {mood === "guide" && (
        /* tay phải nâng nhẹ, hướng về nội dung */
        <g>
          <path d="M238 262C258 250 272 234 278 214" fill="none"
            stroke={MAU.vienVay} strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="281" cy="208" rx="7" ry="9" fill={MAU.da}
            stroke={MAU.vienVay} strokeWidth="1.5" transform="rotate(24 281 208)" />
        </g>
      )}
      {mood === "concern" && (
        /* tay đặt nhẹ trước ngực */
        <g>
          <path d="M232 270C216 262 200 258 186 260" fill="none"
            stroke={MAU.vienVay} strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="180" cy="262" rx="8" ry="6" fill={MAU.da}
            stroke={MAU.vienVay} strokeWidth="1.5" />
        </g>
      )}
      {mood === "celebrate" && (
        /* cầm một nhánh sen nhỏ */
        <g>
          <path d="M240 268C252 252 258 236 258 218" fill="none"
            stroke={MAU.vienVay} strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="258" cy="214" rx="7" ry="8" fill={MAU.da}
            stroke={MAU.vienVay} strokeWidth="1.5" />
          <path d="M258 208C254 188 258 170 268 156" fill="none"
            stroke={MAU.vang} strokeWidth="2" strokeLinecap="round" />
          <path d="M262 152C254 140 256 126 266 116C276 128 276 142 270 154Z"
            fill="none" stroke={MAU.moi} strokeWidth="2" />
        </g>
      )}
    </svg>
  );
}

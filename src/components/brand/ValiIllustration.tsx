/* =====================================================================
 *  ValiIllustration — Công chúa Vali, bản SVG hoạt hình (17/08/2026)
 *  ---------------------------------------------------------------------
 *  Quay về lối VẼ TRÊN WEB của prototype Lotus Pearl (trước final art v1)
 *  theo yêu cầu chủ dự án 17/08: bỏ ảnh chân dung webp, trở lại SVG vẽ
 *  bằng code nhưng ĐẨY THEO HƯỚNG HOẠT HÌNH — mặt tròn, mắt to có ánh
 *  sáng, má hồng. Điều này ĐÈ lên brief §5 cũ ("editorial, không manga"):
 *  chủ dự án đã đổi ý, ghi lại ở đây để khỏi "sửa ngược" về sau.
 *
 *  Được gì khi về SVG:
 *   · ba mood guide/concern/celebrate khác nhau THẬT (mắt, mày, miệng,
 *     cử chỉ tay) — bộ webp cũ ba file chung một dáng;
 *   · không tốn ~45KB/ảnh, không lo tách nền, sắc nét mọi cỡ.
 *
 *  Hợp đồng cũ giữ nguyên:
 *   · props (mood / size / decorative / className) không đổi;
 *   · `data-lp-vali={mood}` — bộ kiểm atelier đếm đúng thuộc tính này;
 *   · khung 4:5 (rộng = size, cao = size × 1.25);
 *   · lớp `.lp-vali-enter` cho hoạt ảnh vào (tự tắt theo reduced-motion).
 *
 *  Màu lấy đúng giá trị token light (nhân vật là brand art, không đảo màu
 *  theo chế độ tối — như một bức tranh treo tường không đổi màu theo đèn).
 * ===================================================================== */
import { useId } from "react";

export type ValiMood = "guide" | "concern" | "celebrate";

const MAU = {
  toc: "#3E213E",          // plum-900
  tocSang: "#5A3158",      // plum-700 — highlight mảng tóc
  ngocTrai: "#F4E4EA",     // rose-soft — ánh mother-of-pearl trên tóc
  da: "#F9E2D2",
  daVien: "#D9A98F",       // viền nét da — mềm hơn nét tóc
  vang: "#C7A15B",         // gold — diadem, halo, viền cổ áo
  moi: "#A74F72",          // rose-600
  ma: "#F2B8C6",           // má hồng hoạt hình
  net: "#3E213E",
  vienVay: "#5A3158",
} as const;

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
      aria-label={decorative ? undefined : `Công chúa Vali ${NHAN_MOOD[mood]}`}
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
      <path d="M40 320C24 210 56 84 160 40C232 12 292 66 278 136"
        fill="none" stroke={MAU.vang} strokeWidth="1.5" opacity=".3" />

      {/* Tóc lớp SAU — hai lọn ôm vai, đầu tròn kiểu hoạt hình */}
      <path d="M84 150C74 74 118 38 162 38C214 38 250 80 240 156
               C252 226 246 282 232 308C224 322 208 318 206 304
               L200 240L124 240L118 304C116 318 100 322 92 308
               C78 282 74 220 84 150Z" fill={MAU.toc} />

      {/* Gương mặt — tròn đầy, cằm nhỏ */}
      <path d="M104 132C104 88 130 66 162 66C194 66 220 88 220 132
               C220 176 196 208 162 208C128 208 104 176 104 132Z"
        fill={MAU.da} stroke={MAU.daVien} strokeWidth="1.5" />

      {/* Mái tóc TRƯỚC — chẽ giữa, hai cánh cong che trán */}
      <path d="M104 140C100 84 128 56 162 56C196 56 224 84 220 140
               C216 108 200 96 178 92C170 90 166 84 162 76
               C158 84 154 90 146 92C124 96 108 108 104 140Z" fill={MAU.toc} />
      {/* highlight ngọc trai trên mái */}
      <path d="M126 78C138 66 152 62 164 63C148 68 136 76 128 90Z"
        fill={MAU.ngocTrai} opacity=".45" />
      <path d="M234 170C238 210 236 258 230 288C226 250 224 210 224 178Z"
        fill={MAU.tocSang} opacity=".6" />

      {/* Lotus diadem 3 cánh — champagne gold, đặt trên mái */}
      <g transform="translate(0 -2)">
        <path d="M138 56Q150 36 162 52Q168 26 176 52Q188 36 198 56Q168 66 138 56Z"
          fill={MAU.vang} opacity=".9" />
        <circle cx="168" cy="60" r="3.4" fill={MAU.ngocTrai} stroke={MAU.vang} strokeWidth="1" />
      </g>

      {/* Chân mày — concern nhíu chéo, còn lại cong nhẹ */}
      {mood === "concern" ? (
        <path d="M126 122Q140 118 152 126M198 126Q210 118 224 122"
          fill="none" stroke={MAU.net} strokeWidth="2.4" strokeLinecap="round" />
      ) : (
        <path d="M126 120Q140 113 153 119M197 119Q210 113 224 120"
          fill="none" stroke={MAU.net} strokeWidth="2.2" strokeLinecap="round" opacity=".9" />
      )}

      {/* Mắt hoạt hình — to, có đồng tử và hai chấm sáng.
          celebrate: mắt cười khép hình vòng cung ^^ */}
      {mood === "celebrate" ? (
        <path d="M126 146Q140 132 154 146M196 146Q210 132 224 146"
          fill="none" stroke={MAU.net} strokeWidth="3.4" strokeLinecap="round" />
      ) : (
        <g>
          <ellipse cx="140" cy="144" rx="13" ry={mood === "concern" ? 14 : 16} fill={MAU.net} />
          <ellipse cx="210" cy="144" rx="13" ry={mood === "concern" ? 14 : 16} fill={MAU.net} />
          <circle cx="144.5" cy="138" r="4.6" fill="#FFFFFF" />
          <circle cx="214.5" cy="138" r="4.6" fill="#FFFFFF" />
          <circle cx="136" cy="149" r="2.2" fill="#FFFFFF" opacity=".85" />
          <circle cx="206" cy="149" r="2.2" fill="#FFFFFF" opacity=".85" />
        </g>
      )}

      {/* Má hồng — dấu hiệu hoạt hình rõ nhất, mood nào cũng có */}
      <ellipse cx="122" cy="168" rx="11" ry="6.5" fill={MAU.ma} opacity=".7" />
      <ellipse cx="228" cy="168" rx="11" ry="6.5" fill={MAU.ma} opacity=".7" />

      {/* Mũi — một chấm nhỏ */}
      <path d="M173 162Q175 166 172 168" fill="none"
        stroke={MAU.daVien} strokeWidth="1.8" strokeLinecap="round" />

      {/* Miệng theo mood: guide cười kín, concern chúm "o" lo lắng,
          celebrate cười mở */}
      {mood === "concern" && (
        <ellipse cx="172" cy="184" rx="6" ry="7" fill={MAU.moi} opacity=".9" />
      )}
      {mood === "guide" && (
        <path d="M158 181Q172 192 186 181" fill="none"
          stroke={MAU.moi} strokeWidth="3" strokeLinecap="round" />
      )}
      {mood === "celebrate" && (
        <path d="M152 178Q172 200 192 178Q172 186 152 178Z" fill={MAU.moi} />
      )}

      {/* Cổ */}
      <path d="M148 204L148 226L180 226L180 204C170 212 158 212 148 204Z" fill={MAU.da} />

      {/* Váy — dáng chuông tròn hoạt hình, cổ sen vàng */}
      <path d="M92 384C94 280 116 220 164 216C214 220 236 280 240 384
               C196 396 136 396 92 384Z"
        fill={`url(#vali-dress-${uid})`} stroke={MAU.vienVay} strokeWidth="2.5" />
      <path d="M124 232Q146 256 164 238Q182 256 204 232"
        fill="none" stroke={MAU.vang} strokeWidth="2.5" strokeLinecap="round" />
      {/* ba nút ngọc trai giữa thân váy */}
      <circle cx="165" cy="286" r="3.2" fill={MAU.ngocTrai} stroke={MAU.vienVay} strokeWidth="1" />
      <circle cx="165" cy="310" r="3.2" fill={MAU.ngocTrai} stroke={MAU.vienVay} strokeWidth="1" />
      <circle cx="165" cy="334" r="3.2" fill={MAU.ngocTrai} stroke={MAU.vienVay} strokeWidth="1" />

      {/* Cử chỉ theo mood — tay tròn mập kiểu hoạt hình */}
      {mood === "guide" && (
        /* tay phải giơ lên chào, hướng về nội dung */
        <g>
          <path d="M236 280C258 268 272 248 276 224" fill="none"
            stroke={MAU.vienVay} strokeWidth="9" strokeLinecap="round" />
          <circle cx="279" cy="216" r="10" fill={MAU.da}
            stroke={MAU.daVien} strokeWidth="1.5" />
        </g>
      )}
      {mood === "concern" && (
        /* hai tay ấp trước ngực */
        <g>
          <path d="M232 286C216 272 198 264 184 262" fill="none"
            stroke={MAU.vienVay} strokeWidth="9" strokeLinecap="round" />
          <circle cx="178" cy="262" r="10" fill={MAU.da}
            stroke={MAU.daVien} strokeWidth="1.5" />
          <path d="M100 286C116 272 134 264 148 262" fill="none"
            stroke={MAU.vienVay} strokeWidth="9" strokeLinecap="round" />
          <circle cx="154" cy="262" r="10" fill={MAU.da}
            stroke={MAU.daVien} strokeWidth="1.5" />
        </g>
      )}
      {mood === "celebrate" && (
        /* tay vung cao cầm nhánh sen */
        <g>
          <path d="M238 278C254 258 262 238 262 218" fill="none"
            stroke={MAU.vienVay} strokeWidth="9" strokeLinecap="round" />
          <circle cx="262" cy="210" r="10" fill={MAU.da}
            stroke={MAU.daVien} strokeWidth="1.5" />
          <path d="M262 202C258 182 262 164 272 150" fill="none"
            stroke={MAU.vang} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M266 146C258 134 260 118 272 108C282 120 282 136 276 148Z"
            fill={MAU.ma} stroke={MAU.moi} strokeWidth="2" />
        </g>
      )}
    </svg>
  );
}

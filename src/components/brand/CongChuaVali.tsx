/* =====================================================================
 *  CongChuaVali — nhân vật của GIAO DIỆN SÁNG, Art Nouveau (17/08/2026)
 *  ---------------------------------------------------------------------
 *  Giao diện tối có nhân vật riêng (DungSiVali). Bộ chọn theo theme nằm ở
 *  ValiIllustration.tsx — file này chỉ lo phần vẽ.
 *
 *  Chủ dự án chốt hướng 17/08: giữ lối VẼ SVG trên web, theo trường phái
 *  Art Nouveau (Mucha) — đúng tinh thần brief gốc Lotus Pearl Atelier
 *  ("line 1.5–2px kiểu Art Nouveau") nhưng làm tới nơi thay vì chỉ một
 *  đường halo:
 *
 *   · chân dung đặt trong MEDALLION — vòng tròn vàng kép đặc trưng Mucha;
 *   · tóc mảng lớn uốn "whiplash", lọn trước ĐÈ LÊN vòng, mảng sau nằm
 *     DƯỚI vòng — hiệu ứng đan xuyên khung là chữ ký của trường phái;
 *   · vài đường vàng mảnh chảy theo lọn tóc (kim tuyến kiểu Mucha);
 *   · diadem sen 3 cánh champagne + ngọc trai, cổ áo cánh sen.
 *
 *  Ba mood khác nhau ở mắt/mày/miệng/cử chỉ:
 *    guide     — mắt mở dịu, cười kín, tay nâng hướng về nội dung
 *    concern   — mày chau, miệng chúm nhỏ, tay ấp trước ngực
 *    celebrate — mắt cười khép, cười mở, tay nâng đoá sen
 *
 *  Khung 4:5, `data-lp-vali={mood}` (bộ kiểm atelier đếm thuộc tính này),
 *  lớp `.lp-vali-enter` cho hoạt ảnh vào (tự tắt theo reduced-motion).
 *
 *  Màu lấy đúng giá trị token SÁNG — bản này chỉ xuất hiện ở nền sáng.
 * ===================================================================== */
import { useId } from "react";
import { NHAN_MOOD, rongTheoCo } from "./valiTypes.ts";
import type { ValiProps } from "./valiTypes.ts";

const MAU = {
  toc: "#3E213E",          // plum-900
  tocSang: "#5A3158",      // plum-700 — lọn tóc bắt sáng
  ngocTrai: "#F4E4EA",     // rose-soft — ánh mother-of-pearl
  da: "#F8E3D4",
  daVien: "#D9A98F",       // nét viền da — mềm hơn nét tóc
  vang: "#C7A15B",         // gold — medallion, diadem, kim tuyến tóc
  moi: "#A74F72",          // rose-600
  ma: "#EFB9C7",           // má hồng — rất nhẹ, kiểu tranh in
  net: "#3E213E",
  vienVay: "#5A3158",
} as const;

export default function CongChuaVali({
  mood = "guide", size = "empty", decorative = true, className,
}: ValiProps) {
  const uid = useId().replace(/:/g, "");
  const rong = rongTheoCo(size);

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

      {/* ---- Mảng tóc SAU — nằm DƯỚI medallion ---------------------- */}
      <path d="M160 50
               C116 50 92 84 92 124
               C92 160 100 196 88 232
               C78 262 86 296 72 330
               C66 346 76 360 90 352
               C110 340 106 296 114 258
               L206 258
               C214 296 210 340 230 352
               C244 360 254 346 248 330
               C234 296 242 262 232 232
               C220 196 228 160 228 124
               C228 84 204 50 160 50 Z" fill={MAU.toc} />

      {/* ---- Medallion vàng kép — chữ ký Mucha ---------------------- */}
      <circle cx="160" cy="138" r="104" fill="none"
        stroke={MAU.vang} strokeWidth="2.4" opacity=".65" />
      <circle cx="160" cy="138" r="96" fill="none"
        stroke={MAU.vang} strokeWidth="1" opacity=".4" />
      {/* ngọc trai điểm trên vòng — bốn hướng, kiểu khung tranh in */}
      {[[160, 34], [56, 138], [264, 138], [86, 64], [234, 64]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" fill={MAU.ngocTrai}
          stroke={MAU.vang} strokeWidth="1" opacity=".9" />
      ))}

      {/* ---- Hai lọn tóc TRƯỚC — whiplash đè lên vòng --------------- */}
      <path d="M100 118
               C96 168 106 204 92 244
               C80 280 92 316 76 352
               C70 368 82 380 94 370
               C112 354 104 308 116 268
               C126 232 116 190 118 150 Z" fill={MAU.toc} />
      <path d="M220 118
               C224 168 214 204 228 244
               C240 280 228 316 244 352
               C250 368 238 380 226 370
               C208 354 216 308 204 268
               C194 232 204 190 202 150 Z" fill={MAU.toc} />
      {/* lọn bắt sáng + kim tuyến vàng chảy theo tóc */}
      <path d="M104 130C100 180 110 224 98 268C92 292 98 320 88 348"
        fill="none" stroke={MAU.tocSang} strokeWidth="4" strokeLinecap="round" opacity=".6" />
      <path d="M216 130C220 180 210 224 222 268C228 292 222 320 232 348"
        fill="none" stroke={MAU.tocSang} strokeWidth="4" strokeLinecap="round" opacity=".6" />
      <path d="M110 140C107 184 115 224 104 262C98 286 104 314 94 340"
        fill="none" stroke={MAU.vang} strokeWidth="1.2" opacity=".7" />
      <path d="M210 140C213 184 205 224 216 262C222 286 216 314 226 340"
        fill="none" stroke={MAU.vang} strokeWidth="1.2" opacity=".7" />

      {/* ---- Gương mặt — tròn đầy, cằm thon nhẹ ---------------------- */}
      <path d="M110 122
               C110 84 132 66 160 66
               C188 66 210 84 210 122
               C210 158 192 188 160 190
               C128 188 110 158 110 122 Z"
        fill={MAU.da} stroke={MAU.daVien} strokeWidth="1.5" />

      {/* ---- Mái tóc trước — chẽ giữa, hai cánh cong phủ thấp trán --- */}
      <path d="M110 134
               C104 76 130 52 160 52
               C190 52 216 76 210 134
               C208 108 196 100 178 97
               C168 95 163 88 160 76
               C157 88 152 95 142 97
               C124 100 112 108 110 134 Z" fill={MAU.toc} />
      <path d="M126 72C136 61 149 56 160 57C147 62 136 71 130 84Z"
        fill={MAU.ngocTrai} opacity=".4" />

      {/* ---- Diadem sen 3 cánh + ngọc trai --------------------------- */}
      <g>
        <path d="M140 54Q150 36 160 50Q165 28 172 50Q182 36 192 54Q166 62 140 54Z"
          fill={MAU.vang} opacity=".92" />
        <circle cx="166" cy="57" r="3" fill={MAU.ngocTrai}
          stroke={MAU.vang} strokeWidth="1" />
      </g>

      {/* ---- Chân mày — nhích lên 2px nhường chỗ cho mắt to ---------- */}
      {mood === "concern" ? (
        <path d="M129 120Q142 115 153 122M167 122Q178 115 191 120"
          fill="none" stroke={MAU.net} strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M129 117Q141 110 153 116M167 116Q179 110 191 117"
          fill="none" stroke={MAU.net} strokeWidth="1.8" strokeLinecap="round" opacity=".9" />
      )}

      {/* ---- Mắt hạnh nhân có tròng — celebrate là mắt cười khép -----
           Tròng to cần lòng trắng: hai chấm đen r6.2 đặt thẳng lên da mặt
           trông như lỗ thủng, không phải mắt. Ellipse trắng nằm dưới tròng
           và bị vòm mí ôm lấy, nên mắt vẫn là hạnh nhân chứ không tròn xoe. */}
      {mood === "celebrate" ? (
        <path d="M126 141Q140 128 154 141M166 141Q180 128 194 141"
          fill="none" stroke={MAU.net} strokeWidth="2.8" strokeLinecap="round" />
      ) : (
        <g>
          <ellipse cx="140" cy="139" rx="12" ry="8.4" fill="#FFFFFF" opacity=".92" />
          <ellipse cx="180" cy="139" rx="12" ry="8.4" fill="#FFFFFF" opacity=".92" />
          <circle cx="140" cy="139" r="6.2" fill={MAU.net} />
          <circle cx="180" cy="139" r="6.2" fill={MAU.net} />
          <circle cx="142.4" cy="136.4" r="2.2" fill="#FFFFFF" />
          <circle cx="182.4" cy="136.4" r="2.2" fill="#FFFFFF" />
          <path d="M126 139Q140 125 154 139" fill="none"
            stroke={MAU.net} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M166 139Q180 125 194 139" fill="none"
            stroke={MAU.net} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}

      {/* ---- Má hồng rất nhẹ + mũi ----------------------------------- */}
      <ellipse cx="127" cy="158" rx="8" ry="4.5" fill={MAU.ma} opacity=".45" />
      <ellipse cx="193" cy="158" rx="8" ry="4.5" fill={MAU.ma} opacity=".45" />
      <path d="M160 148Q162 154 159 157" fill="none"
        stroke={MAU.daVien} strokeWidth="1.6" strokeLinecap="round" />

      {/* ---- Miệng theo mood — lớn hơn bản trước ~35% ----------------- */}
      {mood === "concern" && (
        <ellipse cx="160" cy="173" rx="6" ry="7" fill={MAU.moi} opacity=".9" />
      )}
      {mood === "guide" && (
        <path d="M145 169Q160 181 175 169" fill="none"
          stroke={MAU.moi} strokeWidth="2.8" strokeLinecap="round" />
      )}
      {mood === "celebrate" && (
        <path d="M141 167Q160 190 179 167Q160 176 141 167Z" fill={MAU.moi} />
      )}

      {/* ---- Cổ + váy cánh sen --------------------------------------- */}
      <path d="M148 190L148 218L176 218L176 190C167 198 157 198 148 190Z" fill={MAU.da} />
      <path d="M98 384
               C102 288 122 218 160 214
               C198 218 218 288 222 384
               C180 394 140 394 98 384 Z"
        fill={`url(#vali-dress-${uid})`} stroke={MAU.vienVay} strokeWidth="2" />
      {/* cổ áo cánh sen + nếp váy Art Nouveau */}
      <path d="M124 232Q142 254 160 236Q178 254 196 232"
        fill="none" stroke={MAU.vang} strokeWidth="2" strokeLinecap="round" />
      <path d="M138 262C136 300 138 340 134 376M182 262C184 300 182 340 186 376"
        fill="none" stroke={MAU.vienVay} strokeWidth="1.2" opacity=".5" />
      <circle cx="160" cy="278" r="2.6" fill={MAU.ngocTrai} stroke={MAU.vienVay} strokeWidth=".8" />
      <circle cx="160" cy="304" r="2.6" fill={MAU.ngocTrai} stroke={MAU.vienVay} strokeWidth=".8" />
      <circle cx="160" cy="330" r="2.6" fill={MAU.ngocTrai} stroke={MAU.vienVay} strokeWidth=".8" />

      {/* ---- Cử chỉ theo mood — tay mảnh, nét thanh ------------------ */}
      {mood === "guide" && (
        <g>
          <path d="M218 276C242 264 258 246 264 222" fill="none"
            stroke={MAU.vienVay} strokeWidth="6.5" strokeLinecap="round" />
          <circle cx="266" cy="214" r="8" fill={MAU.da}
            stroke={MAU.daVien} strokeWidth="1.4" />
        </g>
      )}
      {mood === "concern" && (
        /* hai tay chắp hờ trước eo — dáng lo âu kín đáo kiểu tranh cổ */
        <g>
          <path d="M220 282C212 296 196 306 172 308" fill="none"
            stroke={MAU.vienVay} strokeWidth="6.5" strokeLinecap="round" />
          <path d="M100 282C108 296 124 306 148 308" fill="none"
            stroke={MAU.vienVay} strokeWidth="6.5" strokeLinecap="round" />
          <circle cx="154" cy="308" r="7.5" fill={MAU.da}
            stroke={MAU.daVien} strokeWidth="1.4" />
          <circle cx="167" cy="308" r="7.5" fill={MAU.da}
            stroke={MAU.daVien} strokeWidth="1.4" />
        </g>
      )}
      {mood === "celebrate" && (
        <g>
          <path d="M220 280C238 262 248 242 250 220" fill="none"
            stroke={MAU.vienVay} strokeWidth="6.5" strokeLinecap="round" />
          <circle cx="252" cy="212" r="8" fill={MAU.da}
            stroke={MAU.daVien} strokeWidth="1.4" />
          {/* nhánh sen — cuống vàng, đoá hồng viền rose */}
          <path d="M254 204C250 184 254 166 264 152" fill="none"
            stroke={MAU.vang} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M258 148C250 136 252 120 264 110C274 122 274 138 268 150Z"
            fill={MAU.ma} stroke={MAU.moi} strokeWidth="1.8" />
          <path d="M264 146C260 134 262 124 264 116" fill="none"
            stroke={MAU.moi} strokeWidth="1" opacity=".6" />
        </g>
      )}
    </svg>
  );
}

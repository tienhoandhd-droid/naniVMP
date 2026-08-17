/* =====================================================================
 *  DungSiVali — nhân vật của GIAO DIỆN TỐI, chibi (17/08/2026)
 *  ---------------------------------------------------------------------
 *  Chủ dự án chốt 17/08: nền sáng là Công chúa, nền tối là DŨNG SĨ — mô
 *  phỏng chibi từ ảnh chụp chủ dự án cấp, KHÔNG cắt ghép ảnh. Vẽ SVG cùng
 *  lối với công chúa để hai nhân vật là một bộ, không phải hai phong cách
 *  dán cạnh nhau; và để đổi cử chỉ chỉ cần sửa vài đường path.
 *
 *  Ba nét nhận dạng lấy thẳng từ ảnh: tóc đen ngắn rẽ mái, KÍNH RÂM đen,
 *  áo polo trắng cổ bẻ. Ba cử chỉ cũng lấy từ chính dáng trong ảnh:
 *    guide     — tay chỉnh gọng kính (dáng chính trong ảnh), tay kia chỉ hướng
 *    concern   — khoanh tay, đầu hơi nghiêng
 *    celebrate — giơ ngón cái (dáng thứ hai trong ảnh)
 *
 *  Vì sao chibi mà vẫn hợp bộ với công chúa Art Nouveau: giữ nguyên hai
 *  chữ ký của bộ — MEDALLION vàng kép sau đầu và chi tiết sen — nên hai
 *  nhân vật đọc ra cùng một thế giới dù tỉ lệ người khác nhau.
 *
 *  Màu lấy token TỐI (--c-* của [data-theme="dark"]): nhân vật chỉ xuất
 *  hiện trên nền tối nên da/áo phải hạ sáng, tóc phải có viền bắt sáng tím
 *  lavender — tóc đen tuyền trên nền #131019 sẽ mất hình.
 * ===================================================================== */
import { useId } from "react";
import { NHAN_MOOD, rongTheoCo } from "./valiTypes.ts";
import type { ValiProps } from "./valiTypes.ts";

const MAU = {
  toc: "#241C2E",          // đen ngả tím — không tuyệt đối đen
  tocVien: "#7E6AA0",      // viền bắt sáng, tách tóc khỏi nền tối
  da: "#EBC7AC",           // hạ sáng so với bản sáng để không chói trên nền tối
  daBong: "#D3A688",
  daVien: "#A8795C",
  kinh: "#15111C",         // tròng kính
  kinhGong: "#F0BE55",     // gọng vàng — dark gold token
  ao: "#E8E2EE",           // polo trắng ngà, không trắng literal
  aoBong: "#C3BAD0",
  aoVien: "#8E82A6",
  vang: "#F0BE55",
  lav: "#A991EA",          // lavender — điểm nhấn giao diện tối
  net: "#1B1522",
} as const;

export default function DungSiVali({
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
      aria-label={decorative ? undefined : `Dũng sĩ Vali ${NHAN_MOOD[mood]}`}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={`ds-ao-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F3EEF7" />
          <stop offset=".7" stopColor={MAU.ao} />
          <stop offset="1" stopColor={MAU.aoBong} />
        </linearGradient>
      </defs>

      {/* ---- Medallion vàng kép — chữ ký chung với công chúa --------- */}
      <circle cx="160" cy="150" r="100" fill="none"
        stroke={MAU.vang} strokeWidth="2.2" opacity=".5" />
      <circle cx="160" cy="150" r="92" fill="none"
        stroke={MAU.vang} strokeWidth="1" opacity=".3" />
      {[[160, 50], [68, 150], [252, 150], [95, 85], [225, 85]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" fill={MAU.lav}
          stroke={MAU.vang} strokeWidth=".9" opacity=".85" />
      ))}

      {/* =============== THÂN — chibi: thân nhỏ, vai hẹp =============== */}
      {/* Áo polo trắng, gấu áo cong nhẹ */}
      <path d="M112 262
               C112 240 130 226 160 226
               C190 226 208 240 208 262
               L214 350
               C196 358 124 358 106 350 Z"
        fill={`url(#ds-ao-${uid})`} stroke={MAU.aoVien} strokeWidth="1.8" />
      {/* Cổ bẻ polo — hai vạt chữ V, nét nhận dạng của áo trong ảnh */}
      <path d="M146 228L160 250L174 228" fill="none"
        stroke={MAU.aoVien} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M141 230L156 252L152 258L134 238Z" fill={MAU.ao}
        stroke={MAU.aoVien} strokeWidth="1.4" />
      <path d="M179 230L164 252L168 258L186 238Z" fill={MAU.ao}
        stroke={MAU.aoVien} strokeWidth="1.4" />
      {/* nẹp khuy + hai khuy nhỏ */}
      <path d="M160 252L160 276" fill="none" stroke={MAU.aoVien} strokeWidth="1.2" />
      <circle cx="160" cy="258" r="1.8" fill={MAU.vang} opacity=".9" />
      <circle cx="160" cy="270" r="1.8" fill={MAU.vang} opacity=".9" />

      {/* Không giáp vai: kính râm đã là điểm nhấn: thêm một mảng vàng lệch
          một bên chỉ làm nhân vật mất cân. "Dũng sĩ" nằm ở tư thế và ở
          medallion, không ở phụ kiện. */}

      {/* Cổ */}
      <path d="M148 210L148 232C154 236 166 236 172 232L172 210Z"
        fill={MAU.daBong} />

      {/* =============== ĐẦU — chibi: to, tròn ======================== */}
      <path d="M96 150
               C96 100 122 76 160 76
               C198 76 224 100 224 150
               C224 194 198 220 160 220
               C122 220 96 194 96 150 Z"
        fill={MAU.da} stroke={MAU.daVien} strokeWidth="1.6" />

      {/* Tai */}
      <ellipse cx="96" cy="156" rx="8" ry="11" fill={MAU.da} stroke={MAU.daVien} strokeWidth="1.4" />
      <ellipse cx="224" cy="156" rx="8" ry="11" fill={MAU.da} stroke={MAU.daVien} strokeWidth="1.4" />

      {/* Tóc đen ngắn rẽ mái — mảng DÀY phủ kín đỉnh đầu và hai thái
          dương, chân tóc xuống sát gọng kính. Bản đầu mảng quá mỏng nên
          nhân vật đọc ra là "hói", không phải "tóc ngắn". */}
      <path d="M94 158
               C86 104 118 66 160 66
               C202 66 234 104 226 158
               C224 142 220 130 214 122
               C210 136 206 142 200 144
               C198 128 192 120 182 116
               C170 126 150 130 134 124
               C124 132 116 144 112 158
               C106 150 100 148 94 158 Z"
        fill={MAU.toc} />
      {/* mái loà xoà rẽ lệch — nhịp phá đối xứng, lấy từ ảnh */}
      <path d="M134 124C146 112 166 108 182 116C170 118 156 122 146 130Z"
        fill={MAU.toc} />
      <path d="M104 146C110 120 128 102 152 98" fill="none"
        stroke={MAU.tocVien} strokeWidth="2.6" strokeLinecap="round" opacity=".8" />
      <path d="M196 104C210 114 220 132 222 152" fill="none"
        stroke={MAU.tocVien} strokeWidth="2.2" strokeLinecap="round" opacity=".6" />
      <path d="M138 118C150 108 166 104 178 108" fill="none"
        stroke={MAU.tocVien} strokeWidth="1.6" strokeLinecap="round" opacity=".5" />

      {/* ---- KÍNH RÂM — nét nhận dạng số một ------------------------ */}
      <g>
        {/* gọng ngang + càng kính hai bên */}
        <path d="M112 156L208 156" fill="none" stroke={MAU.kinhGong} strokeWidth="2.4" />
        <path d="M104 152L112 156M216 152L208 156" fill="none"
          stroke={MAU.kinhGong} strokeWidth="2.2" strokeLinecap="round" />
        {/* hai tròng bo góc, hơi vuông kiểu kính trong ảnh */}
        <path d="M116 150h34a4 4 0 0 1 4 4v14a10 10 0 0 1-10 10h-22a10 10 0 0 1-10-10v-14a4 4 0 0 1 4-4z"
          fill={MAU.kinh} stroke={MAU.kinhGong} strokeWidth="2" />
        <path d="M170 150h34a4 4 0 0 1 4 4v14a10 10 0 0 1-10 10h-22a10 10 0 0 1-10-10v-14a4 4 0 0 1 4-4z"
          fill={MAU.kinh} stroke={MAU.kinhGong} strokeWidth="2" />
        {/* ánh sáng loé trên tròng — cho kính "có mặt kính", không phải hai ô đen */}
        <path d="M122 154L134 154L124 172L118 168Z" fill={MAU.lav} opacity=".38" />
        <path d="M176 154L188 154L178 172L172 168Z" fill={MAU.lav} opacity=".38" />
        {/* concern: kính trễ xuống một chút, lộ nhíu mày phía trên */}
        {mood === "concern" && (
          <path d="M132 142Q142 137 152 141M168 141Q178 137 188 142" fill="none"
            stroke={MAU.net} strokeWidth="2.2" strokeLinecap="round" opacity=".75" />
        )}
      </g>

      {/* Mũi + miệng theo mood */}
      <path d="M160 182Q163 188 158 190" fill="none"
        stroke={MAU.daVien} strokeWidth="1.6" strokeLinecap="round" />
      {mood === "guide" && (
        <path d="M148 198Q160 207 172 198" fill="none"
          stroke={MAU.net} strokeWidth="2.4" strokeLinecap="round" />
      )}
      {mood === "concern" && (
        <path d="M150 202Q160 197 170 202" fill="none"
          stroke={MAU.net} strokeWidth="2.4" strokeLinecap="round" />
      )}
      {mood === "celebrate" && (
        <path d="M145 195Q160 213 175 195Q160 202 145 195Z" fill={MAU.net} />
      )}

      {/* =============== CỬ CHỈ — lấy từ dáng trong ảnh ================ */}
      {mood === "guide" && (
        /* tay phải ĐƯA LÊN CHẠM GỌNG KÍNH — dáng chính trong ảnh; tay
           trái buông xuôi, ngón trỏ chỉ về nội dung bên dưới */
        <g>
          <path d="M204 266C224 254 226 218 218 186" fill="none"
            stroke={MAU.ao} strokeWidth="11" strokeLinecap="round" />
          {/* bàn tay đặt ngay cạnh gọng kính, ngón cái vươn vào gọng */}
          <circle cx="217" cy="176" r="9.5" fill={MAU.da} stroke={MAU.daVien} strokeWidth="1.4" />
          <path d="M210 170C206 164 206 158 210 154" fill="none"
            stroke={MAU.da} strokeWidth="5.5" strokeLinecap="round" />
          <path d="M210 154L211 152" fill="none"
            stroke={MAU.daVien} strokeWidth="1.2" strokeLinecap="round" />
          <path d="M116 270C102 284 98 306 102 324" fill="none"
            stroke={MAU.ao} strokeWidth="11" strokeLinecap="round" />
          <circle cx="103" cy="330" r="9" fill={MAU.da} stroke={MAU.daVien} strokeWidth="1.4" />
          <path d="M103 338L103 350" fill="none"
            stroke={MAU.da} strokeWidth="5.5" strokeLinecap="round" />
        </g>
      )}
      {mood === "concern" && (
        /* khoanh tay trước ngực — hai cẳng tay chồng nhau, bàn tay giấu
           dưới khuỷu như người thật khoanh tay */
        <g>
          {/* Hai cẳng tay CHÉO nhau chứ không song song ngang: hai đường
              ngang chồng nhau đọc thành cái thắt lưng, không phải tay. */}
          {/* cẳng tay dưới: từ khuỷu phải chếch xuống trái, tông đậm */}
          <path d="M208 272C186 284 152 294 124 296" fill="none"
            stroke={MAU.aoBong} strokeWidth="15" strokeLinecap="round" />
          <path d="M208 272C186 284 152 294 124 296" fill="none"
            stroke={MAU.aoVien} strokeWidth="1.4" opacity=".65" />
          <path d="M124 289C114 288 109 292 109 297C109 303 116 305 125 302Z"
            fill={MAU.da} stroke={MAU.daVien} strokeWidth="1.4" />
          {/* cẳng tay trên: từ khuỷu trái chếch lên phải, tông sáng — đè lên */}
          <path d="M112 276C136 284 172 288 200 284" fill="none"
            stroke={MAU.ao} strokeWidth="15" strokeLinecap="round" />
          <path d="M112 276C136 284 172 288 200 284" fill="none"
            stroke={MAU.aoVien} strokeWidth="1.4" opacity=".65" />
          <path d="M200 277C210 275 216 278 216 284C216 290 209 292 200 290Z"
            fill={MAU.da} stroke={MAU.daVien} strokeWidth="1.4" />
        </g>
      )}
      {mood === "celebrate" && (
        /* giơ NGÓN CÁI — dáng thứ hai trong ảnh: nắm tay đặc, ngón cái
           dựng lên rõ hình, ba tia mừng */
        <g>
          {/* Cánh tay vươn CHÉO RA NGOÀI, không dựng sát mặt — bản trước
              nắm tay đè lên má, đọc thành "gãi tai" chứ không phải khen. */}
          <path d="M208 272C232 268 250 254 258 236" fill="none"
            stroke={MAU.ao} strokeWidth="11" strokeLinecap="round" />
          <path d="M116 270C102 284 98 306 102 324" fill="none"
            stroke={MAU.ao} strokeWidth="11" strokeLinecap="round" />
          <circle cx="103" cy="330" r="9" fill={MAU.da} stroke={MAU.daVien} strokeWidth="1.4" />
          {/* nắm tay: khối bo tròn, có ba nếp ngón gập */}
          <path d="M252 232C252 224 258 219 266 219C274 219 280 224 280 232
                   C280 242 274 248 266 248C258 248 252 242 252 232 Z"
            fill={MAU.da} stroke={MAU.daVien} strokeWidth="1.5" />
          <path d="M258 228L276 228M258 235L276 235M260 242L274 242" fill="none"
            stroke={MAU.daVien} strokeWidth="1.1" opacity=".55" />
          {/* ngón cái dựng thẳng lên */}
          <path d="M256 220C253 210 255 200 261 195C267 199 268 210 265 220Z"
            fill={MAU.da} stroke={MAU.daVien} strokeWidth="1.5" />
          {/* ba tia mừng — dấu hiệu duy nhất của mood này */}
          <path d="M284 210L294 204M276 190L281 180M288 226L300 224" fill="none"
            stroke={MAU.vang} strokeWidth="2.6" strokeLinecap="round" opacity=".85" />
        </g>
      )}
    </svg>
  );
}

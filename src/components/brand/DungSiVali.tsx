/* =====================================================================
 *  DungSiVali — nhân vật của GIAO DIỆN TỐI, chibi (17/08/2026)
 *  ---------------------------------------------------------------------
 *  Chủ dự án chốt 17/08: nền sáng là Công chúa, nền tối là DŨNG SĨ — mô
 *  phỏng chibi từ ảnh chụp chủ dự án cấp, KHÔNG cắt ghép ảnh. Vẽ SVG cùng
 *  lối với công chúa để hai nhân vật là một bộ, không phải hai phong cách
 *  dán cạnh nhau; và để đổi cử chỉ chỉ cần sửa vài đường path.
 *
 *  Cập nhật 17/08 (vòng 2): chủ dự án gửi thêm ảnh KHÔNG đeo kính và yêu
 *  cầu vẽ giống khuôn mặt. Đã bỏ kính râm — kính che mất đúng bốn nét làm
 *  nên khuôn mặt ấy: lông mày đậm gần thẳng, mắt cười híp thành cung, nụ
 *  cười rộng khoe hàm răng trên, gò má nổi khi cười.
 *
 *  Nét nhận dạng còn lại lấy từ ảnh: tóc đen ngắn rẽ mái, áo polo trắng cổ
 *  bẻ. Ba cử chỉ:
 *    guide     — giơ tay chào, tay kia chỉ về nội dung
 *    concern   — khoanh tay
 *    celebrate — giơ ngón cái + cười khoe răng (đúng ảnh nhất)
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
      <ellipse cx="97" cy="164" rx="8" ry="10" fill={MAU.da} stroke={MAU.daVien} strokeWidth="1.4" />
      <ellipse cx="223" cy="164" rx="8" ry="10" fill={MAU.da} stroke={MAU.daVien} strokeWidth="1.4" />

      {/* Tóc đen ngắn rẽ mái — mảng DÀY phủ kín đỉnh đầu và hai thái
          dương, chân tóc xuống sát gọng kính. Bản đầu mảng quá mỏng nên
          nhân vật đọc ra là "hói", không phải "tóc ngắn". */}
      <path d="M94 158
               C86 104 118 66 160 66
               C202 66 234 104 226 158
               C227 150 222 136 212 130
               C196 130 172 126 148 118
               C126 124 114 138 112 158
               C106 150 100 148 94 158 Z"
        fill={MAU.toc} />
      {/* Mái rẽ lệch trái→phải, đổ xuống trán — nhịp phá đối xứng lấy từ
          ảnh. Vẽ như một MẢNG liền, không phải mũi nhọn: bản trước đường
          chân tóc bên phải thắt lại thành gai chĩa xuống che tai. */}
      <path d="M126 122
               C142 102 180 98 208 116
               C206 126 206 134 206 144
               C190 130 158 120 126 122 Z" fill={MAU.toc} />
      {/* Tóc mai bên phải — nối mảng mái với viền ngoài, bịt khe da hình
          lưỡi liềm ở thái dương (mái rẽ lệch nên bên này tóc dài xuống). */}
      <path d="M196 106
               C212 114 224 132 227 156
               C220 150 210 138 200 126
               C198 120 196 112 196 106 Z" fill={MAU.toc} />
      <path d="M104 146C110 120 128 102 152 98" fill="none"
        stroke={MAU.tocVien} strokeWidth="2.6" strokeLinecap="round" opacity=".8" />
      <path d="M196 104C210 114 220 132 222 152" fill="none"
        stroke={MAU.tocVien} strokeWidth="2.2" strokeLinecap="round" opacity=".6" />
      <path d="M138 118C150 108 166 104 178 108" fill="none"
        stroke={MAU.tocVien} strokeWidth="1.6" strokeLinecap="round" opacity=".5" />

      {/* ---- MẶT: bốn nét lấy từ ảnh chủ dự án cấp (17/08) -----------
          Bỏ kính râm để lộ khuôn mặt, vì bốn nét dưới đây mới là thứ làm
          nhân vật "giống người thật"; kính chỉ che mất chúng:
            1. lông mày ĐẬM, gần thẳng, đuôi hơi xếch
            2. mắt cười HÍP thành đường cong (nét mạnh nhất trong ảnh)
            3. nụ cười RỘNG, khoé kéo cao, khoe hàm răng trên
            4. gò má nổi khi cười                                        */}

      {/* Lông mày — đậm và gần thẳng ở mọi mood, chỉ đổi độ chau */}
      {mood === "concern" ? (
        <path d="M124 143Q140 136 154 144M166 144Q180 136 196 143" fill="none"
          stroke={MAU.net} strokeWidth="4.6" strokeLinecap="round" />
      ) : (
        <path d="M124 141Q140 133 155 138M165 138Q180 133 196 141" fill="none"
          stroke={MAU.net} strokeWidth="4.6" strokeLinecap="round" />
      )}

      {/* Mắt */}
      {mood === "celebrate" ? (
        /* mắt cười híp — đúng ảnh: hai cung ngửa lên, đuôi mắt kéo dài */
        <g>
          <path d="M124 164Q140 148 156 163" fill="none"
            stroke={MAU.net} strokeWidth="4.4" strokeLinecap="round" />
          <path d="M164 163Q180 148 196 164" fill="none"
            stroke={MAU.net} strokeWidth="4.4" strokeLinecap="round" />
        </g>
      ) : mood === "concern" ? (
        /* mắt mở tròn hơn, tròng nhìn lên — lo lắng */
        <g>
          <ellipse cx="140" cy="160" rx="9" ry="10" fill={MAU.net} />
          <ellipse cx="180" cy="160" rx="9" ry="10" fill={MAU.net} />
          <circle cx="142.5" cy="156.5" r="3" fill="#FFFFFF" opacity=".9" />
          <circle cx="182.5" cy="156.5" r="3" fill="#FFFFFF" opacity=".9" />
        </g>
      ) : (
        /* mắt hạnh nhân hơi híp — dáng mắt lúc không cười to */
        <g>
          <path d="M126 158Q140 149 155 158Q140 168 126 158Z" fill={MAU.net} />
          <path d="M165 158Q180 149 194 158Q180 168 165 158Z" fill={MAU.net} />
          <circle cx="143" cy="156" r="2.4" fill="#FFFFFF" opacity=".85" />
          <circle cx="183" cy="156" r="2.4" fill="#FFFFFF" opacity=".85" />
        </g>
      )}

      {/* Mũi — sống thấp, cánh mũi nhẹ */}
      <path d="M159 172Q164 182 156 185" fill="none"
        stroke={MAU.daVien} strokeWidth="1.8" strokeLinecap="round" />

      {/* Gò má nổi — chỉ ở hai mood cười, vì má chỉ nổi khi cười */}
      {mood !== "concern" && (
        <>
          <ellipse cx="124" cy="180" rx="10" ry="5.5" fill={MAU.daBong} opacity=".55" />
          <ellipse cx="196" cy="180" rx="10" ry="5.5" fill={MAU.daBong} opacity=".55" />
        </>
      )}

      {/* Miệng */}
      {mood === "celebrate" && (
        /* nụ cười rộng khoe hàm răng trên — nét đặc trưng nhất của ảnh */
        <g>
          <path d="M136 196Q160 222 184 196Q160 206 136 196Z"
            fill={MAU.net} stroke={MAU.net} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M139 197Q160 204 181 197Q160 202 139 197Z" fill="#FFFFFF" />
          {/* nếp cười hai bên khoé — kéo má lên */}
          <path d="M132 190Q130 198 135 204M188 190Q190 198 185 204" fill="none"
            stroke={MAU.daVien} strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
        </g>
      )}
      {mood === "guide" && (
        /* cười mỉm rộng, khoé kéo cao nhưng chưa hở răng */
        <g>
          <path d="M141 197Q160 211 179 197" fill="none"
            stroke={MAU.net} strokeWidth="3" strokeLinecap="round" />
          <path d="M137 193Q136 199 140 203M183 193Q184 199 180 203" fill="none"
            stroke={MAU.daVien} strokeWidth="1.5" strokeLinecap="round" opacity=".6" />
        </g>
      )}
      {mood === "concern" && (
        <path d="M148 204Q160 198 172 204" fill="none"
          stroke={MAU.net} strokeWidth="3" strokeLinecap="round" />
      )}

      {/* =============== CỬ CHỈ — lấy từ dáng trong ảnh ================ */}
      {mood === "guide" && (
        /* tay phải giơ lên CHÀO, bàn tay xoè; tay trái buông xuôi, ngón
           trỏ chỉ về nội dung bên dưới. (Bản trước là "chỉnh gọng kính" —
           bỏ kính thì cử chỉ ấy mất nghĩa.) */
        <g>
          <path d="M206 268C226 258 236 236 238 214" fill="none"
            stroke={MAU.ao} strokeWidth="11" strokeLinecap="round" />
          <path d="M232 200C226 194 228 186 236 186C244 186 250 192 250 200
                   C250 210 244 216 238 216C232 216 230 208 232 200 Z"
            fill={MAU.da} stroke={MAU.daVien} strokeWidth="1.5" />
          {/* bốn ngón xoè — cho ra bàn tay chào, không phải nắm đấm */}
          <path d="M234 190L232 180M240 188L240 178M246 191L249 182" fill="none"
            stroke={MAU.da} strokeWidth="5" strokeLinecap="round" />
          <path d="M234 190L232 180M240 188L240 178M246 191L249 182" fill="none"
            stroke={MAU.daVien} strokeWidth="1.1" strokeLinecap="round" opacity=".5" />
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

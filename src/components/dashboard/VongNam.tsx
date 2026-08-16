/* =====================================================================
 *  VongNam.tsx — Vòng năm: cả năm thẩm định trong một vòng khép kín
 *  ---------------------------------------------------------------------
 *  Thay cho vương miện 3D từng đứng ở đây. Vương miện mã hoá bốn tỉ lệ vào
 *  ĐỘ SÁNG của bốn viên ngọc — mà độ sáng là kênh mắt người đọc kém nhất.
 *  Bằng chứng là chính bố cục cũ: phần đọc được thật nằm ở bảng chú giải
 *  bên cạnh, còn khối 3D chỉ để nhìn. Một hero không đọc được là một hero
 *  chiếm chỗ.
 *
 *  Vì sao là VÒNG chứ không phải dải cột ngang:
 *
 *  Bố cục tròn thường bị chê đúng — so độ dài trên cung khó hơn trên đường
 *  thẳng. Nhưng nó có một trường hợp dùng chính đáng: khi trục phân loại
 *  TỰ NÓ tuần hoàn. Tháng 12 nối liền tháng 1; cắt vòng ra thành dải thẳng
 *  là cắt mất chính điều đó. Và câu mà hero này phải trả lời là câu tuần
 *  hoàn: "đi tới đâu trong năm rồi, phần còn lại nặng nhẹ thế nào".
 *
 *  Hai điều giữ cho nó vẫn đọc được, không thành đồ trang trí:
 *   · Góc mỗi tháng CỐ ĐỊNH 30°. Khối lượng mã hoá bằng ĐỘ DÀI vươn ra từ
 *     một vòng gốc chung — không phải bằng diện tích hay góc quạt. So độ
 *     dài từ cùng một mốc là phép so mắt làm được.
 *   · Màu là TRẠNG THÁI, không phải nhận dạng, và dùng đúng bốn màu trạng
 *     thái sẵn có của app: xong (xanh lá) · đã tới hạn mà chưa xong (đỏ,
 *     CHỈ cho tháng đã qua) · tháng đang chạy (cam) · chưa tới hạn (lam).
 *     Tô đỏ phần chưa xong của tháng 11 là vu oan — tháng đó chưa tới hạn.
 *
 *  Kim "hôm nay" chỉ đúng vị trí trong năm. Mọi con số nằm ở lớp HTML và
 *  ở bảng số bật được — không có giá trị nào chỉ đọc được bằng cách rê chuột.
 * ===================================================================== */
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { C, NUM_HERO, TEXT } from "../../constants/theme.ts";
import { MONTHS, vmpToday } from "../../constants/vmp.ts";
import { parseD } from "../../utils/helpers.ts";
import { CauKetLuan } from "../ui/Primitives.tsx";
import type { Activity } from "../../types/domain.ts";

export interface OThangNam {
  thang: number;   // 0..11
  tong: number;
  xong: number;
  /** Tháng đã trôi qua hoàn toàn (mốc đích đã tới hạn). */
  daQua: boolean;
  dangChay: boolean;
}

export function dungVongNam(acts: Activity[], nam: number): OThangNam[] {
  const homNay = vmpToday();
  const thangNay = homNay.getFullYear() === nam ? homNay.getMonth() : (nam < homNay.getFullYear() ? 12 : -1);
  const o = Array.from({ length: 12 }, (_, thang) => ({
    thang, tong: 0, xong: 0,
    daQua: thang < thangNay,
    dangChay: thang === thangNay,
  }));
  for (const a of acts) {
    if ((a.state || "active") !== "active") continue;
    const t = a.target ? parseD(a.target) : null;
    if (!t || t.getFullYear() !== nam) continue;
    o[t.getMonth()].tong += 1;
    if (a.st === "done") o[t.getMonth()].xong += 1;
  }
  return o;
}

/* Khung rộng hơn vòng để chừa chỗ cho nhãn tháng. Bản trước S=268 với nhãn
   đặt ở bán kính 131 — chữ "T10" neo giữa nên tràn ra ngoài mép trái và bị
   cắt mất chữ T. */
const S = 300;
const CX = S / 2;
const CY = S / 2;
const R0 = 76;      // vòng gốc — mọi cột đo từ đây (đủ rộng cho chữ giữa vòng)
const RMAX = 120;
const KHE = 1.5;    // khe hở giữa hai tháng, tính bằng độ

const toaDo = (r: number, doc: number): [number, number] => {
  const rad = (doc * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
};

/** Hình quạt vành khuyên từ r0 tới r1, giữa hai góc. */
function quat(r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = toaDo(r1, a0);
  const [x1, y1] = toaDo(r1, a1);
  const [x2, y2] = toaDo(r0, a1);
  const [x3, y3] = toaDo(r0, a0);
  return `M ${x0} ${y0} A ${r1} ${r1} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 0 0 ${x3} ${y3} Z`;
}

/** Góc bắt đầu của một tháng — tháng 1 ở đỉnh vòng, chạy theo chiều kim đồng hồ. */
const gocThang = (i: number): number => -90 + i * 30;

export default function VongNam({ acts, rate, total, ben }: {
  acts: Activity[];
  /** Tỉ lệ hoàn thành VMP in giữa vòng — dùng chung phép đếm với KPI trang. */
  rate: number;
  total: number;
  /** Cột chữ bên phải vòng (tiêu đề + phân bố trạng thái) do trang Tổng quan
   *  truyền vào. Để nguyên chỗ cũ thay vì bê vào đây: dữ liệu của nó thuộc
   *  về trang, không thuộc về biểu đồ này. */
  ben?: ReactNode;
}) {
  const nam = vmpToday().getFullYear();
  const o = useMemo(() => dungVongNam(acts, nam), [acts, nam]);
  const [bang, setBang] = useState(false);

  const caoNhat = Math.max(1, ...o.map((x) => x.tong));
  const dinh = o.reduce((m, x) => (x.tong > m.tong ? x : m), o[0]);
  const homNay = vmpToday();
  const trongNam = homNay.getFullYear() === nam;

  /* Kim "hôm nay": vị trí thật trong năm, tính cả phần tháng đã trôi. */
  const gocHomNay = trongNam
    ? gocThang(homNay.getMonth())
      + 30 * ((homNay.getDate() - 1) / new Date(nam, homNay.getMonth() + 1, 0).getDate())
    : null;

  /* CÂU KẾT LUẬN — câu tổng quát nhất về cả năm: nhịp đã đi so với nhịp
     còn phải đi. Đây là con số quyết định "có kịp không", và không biểu đồ
     nào khác trong app đang nói ra. */
  const ketLuan = useMemo(() => {
    const daQua = o.filter((x) => x.daQua);
    const tongNam = o.reduce((s, x) => s + x.tong, 0);
    const xongNam = o.reduce((s, x) => s + x.xong, 0);
    if (!tongNam) {
      return { chinh: `Chưa hạng mục nào có mốc đích VMP trong năm ${nam}.`, phu: "", tone: "warn" as const };
    }
    if (!trongNam || !daQua.length) {
      return {
        chinh: `Cả năm ${nam} có ${tongNam} hạng mục, đã hoàn thành ${xongNam} (${Math.round((xongNam / tongNam) * 100)}%).`,
        phu: `Tháng ${dinh.thang + 1} nặng nhất với ${dinh.tong} hạng mục.`,
        tone: "ok" as const,
      };
    }

    const tongDaQua = daQua.reduce((s, x) => s + x.tong, 0);
    const xongDaQua = daQua.reduce((s, x) => s + x.xong, 0);
    const soThangQua = daQua.length;
    const soThangConLai = 12 - soThangQua;
    const conPhaiXong = tongNam - xongNam;
    const nhipQua = xongDaQua / Math.max(1, soThangQua);
    const nhipCan = conPhaiXong / Math.max(1, soThangConLai);
    const lan = nhipQua > 0 ? nhipCan / nhipQua : Infinity;

    return {
      chinh: `${soThangQua} tháng đã qua gánh ${tongDaQua} hạng mục và mới xong ${xongDaQua}`
        + ` (${Math.round((xongDaQua / Math.max(1, tongDaQua)) * 100)}%).`
        + ` Còn ${conPhaiXong} hạng mục phải xong trong ${soThangConLai} tháng cuối.`,
      phu: Number.isFinite(lan) && lan > 1.2
        ? `Tức là ${Math.round(nhipCan)} hạng mục/tháng — gấp ${lan.toFixed(1)} lần nhịp ${Math.round(nhipQua)}/tháng vừa đi. `
          + `Tháng ${dinh.thang + 1} nặng nhất với ${dinh.tong} hạng mục.`
        : `Tức là ${Math.round(nhipCan)} hạng mục/tháng, ngang nhịp đang đi. Tháng ${dinh.thang + 1} nặng nhất với ${dinh.tong} hạng mục.`,
      tone: (Number.isFinite(lan) && lan > 2 ? "over" : lan > 1.2 ? "warn" : "ok") as "over" | "warn" | "ok",
    };
  }, [o, nam, trongNam, dinh]);

  const moTa = `Vòng năm ${nam}: ${ketLuan.chinh} ${ketLuan.phu}`;

  return (
    <div className="vmp-vongnam">
      <CauKetLuan chinh={ketLuan.chinh} phu={ketLuan.phu} tone={ketLuan.tone} />

      <div className="vmp-vongnam-than">
        <div className="vmp-vongnam-vong">
          <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={moTa} className="vmp-vongnam-svg">
            {/* Rãnh nền: bề rộng tối đa của một tháng. Có rãnh thì mắt biết
                cột dài tới đâu là "đầy", không có thì không có mốc so. */}
            {/* Rãnh phải THOẢNG như trước token v3 (yêu cầu chủ dự án
                16/08): surface-2 đậm lên làm cả vòng thành hình tròn đặc
                đối xứng, nuốt mất các cánh dài ngắn — mà độ dài cánh mới
                là nội dung. Hạ opacity trả lại thế bất đối xứng. */}
            {o.map((x) => (
              <path key={`ranh-${x.thang}`}
                d={quat(R0, RMAX, gocThang(x.thang) + KHE, gocThang(x.thang + 1) - KHE)}
                fill={C.surfaceSunk} opacity={0.45} />
            ))}

            {o.map((x) => {
              if (!x.tong) return null;
              const a0 = gocThang(x.thang) + KHE;
              const a1 = gocThang(x.thang + 1) - KHE;
              const dai = ((x.tong / caoNhat) * (RMAX - R0));
              const rXong = R0 + dai * (x.xong / x.tong);
              // Phần chưa xong dùng ĐÚNG bốn màu trạng thái mà cả app đang
              // dùng (xong · quá hạn · đang chạy · chưa tới), không phát minh
              // thang màu riêng cho hero. Đỏ CHỈ dành cho tháng đã qua — tô
              // đỏ phần chưa xong của tháng 11 là vu oan, tháng đó chưa tới hạn.
              const mauConLai = x.daQua ? C.rasp : x.dangChay ? C.marigold : C.sky;
              return (
                <g key={`cot-${x.thang}`}>
                  <title>
                    {`${MONTHS[x.thang]}: ${x.tong} hạng mục đến hạn, ${x.xong} đã xong`
                      + ` (${Math.round((x.xong / x.tong) * 100)}%)`
                      + (x.daQua ? " · tháng đã qua" : x.dangChay ? " · tháng đang chạy" : " · chưa tới hạn")}
                  </title>
                  <path d={quat(rXong, R0 + dai, a0, a1)} fill={mauConLai} opacity={x.daQua ? 0.92 : 0.7} />
                  {x.xong > 0 && <path d={quat(R0, rXong, a0, a1)} fill={C.mint} />}
                </g>
              );
            })}

            {/* Nhãn tháng chạy quanh vành. Tháng nặng nhất và tháng hiện tại
                được ghi kèm số — hai chỗ mắt cần, không phải cả mười hai. */}
            {o.map((x) => {
              const giua = gocThang(x.thang) + 15;
              const [tx, ty] = toaDo(RMAX + 16, giua);
              const nhan = x.thang === dinh.thang || x.dangChay;
              return (
                <text key={`nhan-${x.thang}`} x={tx} y={ty + 3.4} textAnchor="middle"
                  fontFamily={TEXT} fontSize={nhan ? 13 : 12}
                  fontWeight={nhan ? 900 : 700}
                  fill={x.thang === dinh.thang ? C.raspText : C.plumSoft}>
                  {MONTHS[x.thang]}{nhan ? ` ${x.tong}` : ""}
                </text>
              );
            })}

            {/* Kim hôm nay — mốc duy nhất cho biết đang đứng ở đâu trong vòng. */}
            {gocHomNay != null && (
              <g>
                <line
                  x1={toaDo(R0 - 7, gocHomNay)[0]} y1={toaDo(R0 - 7, gocHomNay)[1]}
                  x2={toaDo(RMAX + 5, gocHomNay)[0]} y2={toaDo(RMAX + 5, gocHomNay)[1]}
                  stroke={C.pinkText} strokeWidth={2} strokeLinecap="round" />
                <circle cx={toaDo(RMAX + 5, gocHomNay)[0]} cy={toaDo(RMAX + 5, gocHomNay)[1]}
                  r={3.2} fill={C.pinkText} />
              </g>
            )}
          </svg>

          {/* Số nằm ở lớp HTML giữa vòng: bôi-chép được, trình đọc màn hình
              đọc được, và không nhoè như chữ vẽ trong canvas. */}
          <div className="vmp-vongnam-loi">
            <div style={{ fontFamily: NUM_HERO, fontSize: 42, fontWeight: 800, color: C.plum, lineHeight: 1 }}>
              {rate}%
            </div>
            <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 800, letterSpacing: ".1em", marginTop: 3 }}>
              HOÀN THÀNH VMP
            </div>
            <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>
              trên {total} hạng mục
            </div>
          </div>
        </div>

        <div className="vmp-vongnam-ben">
          {ben}

          <div className="vmp-vongnam-chu">
            <span><i style={{ background: C.mint }} />Đã xong</span>
            <span><i style={{ background: C.rasp }} />Đã tới hạn, chưa xong</span>
            <span><i style={{ background: C.sky, opacity: 0.7 }} />Chưa tới hạn</span>
            <span><i className="vmp-vongnam-kim" />Hôm nay</span>
          </div>

          <button type="button" className="vmp-ctrl-bangbtn vmp-vongnam-nut"
            onClick={() => setBang((v) => !v)}>
            {bang ? "Ẩn bảng số" : "Xem bảng số 12 tháng"}
          </button>
        </div>
      </div>

      {bang && (
        <div className="vmp-ctrl-bang vmp-scroll">
          <table>
            <thead>
              <tr><th>Tháng</th><th>Đến hạn</th><th>Đã xong</th><th>Tỉ lệ</th><th>Trạng thái</th></tr>
            </thead>
            {/* Không tô đỏ dòng nào: bảy trên mười hai tháng đã qua đều còn
                việc, tô hết thì đỏ không còn là tín hiệu. Cột trạng thái đã
                nói đủ. */}
            <tbody>
              {o.map((x) => (
                <tr key={x.thang}>
                  <td>{MONTHS[x.thang]}</td>
                  <td className="tnum">{x.tong}</td>
                  <td className="tnum">{x.xong}</td>
                  <td className="tnum">{x.tong ? `${Math.round((x.xong / x.tong) * 100)}%` : "—"}</td>
                  <td>{x.daQua ? "Đã qua" : x.dangChay ? "Đang chạy" : "Chưa tới hạn"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

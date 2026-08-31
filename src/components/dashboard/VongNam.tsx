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
 *   · Góc mỗi tháng CỐ ĐỊNH 30°. Khối lượng mã hoá bằng ĐỘ DÀI cánh tính
 *     từ một vòng gốc chung; dữ liệu đổi thì hình hoa thị đổi theo.
 *   · Phần đã xong nằm phía trong. Trạng thái thời gian chỉ là lớp tín hiệu
 *     tiết chế: nắp đỏ cho quá hạn, viền vàng cho tháng hiện tại, độ mờ cho
 *     tháng tương lai — không biến vòng thành một bảng màu cạnh tranh.
 *
 *  Kim "hôm nay" chỉ nằm trên vành dữ liệu. Mọi con số nằm ngoài cánh,
 *  trong lõi HTML và ở bảng số bật được — không cần rê chuột để đọc.
 * ===================================================================== */
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { NUM_HERO, TEXT } from "../../constants/theme.ts";
import { MONTHS } from "../../constants/vmp.ts";
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

export interface DongHoThangNam extends OThangNam {
  tiLeXong: number;
  tiLeKhoiLuong: number;
  trangThai: "past" | "current" | "future";
}

export function dungDongHoNam(o: readonly OThangNam[]): DongHoThangNam[] {
  const theoThang = new Map(o.map((x) => [x.thang, x]));
  const months = Array.from({ length: 12 }, (_, thang) => {
    const x = theoThang.get(thang) ?? {
      thang,
      tong: 0,
      xong: 0,
      daQua: false,
      dangChay: false,
    };
    const tiLeXong = x.tong > 0 ? Math.min(1, Math.max(0, x.xong / x.tong)) : 0;
    return { ...x, thang, tiLeXong };
  });
  const caoNhat = Math.max(1, ...months.map((x) => Math.max(0, x.tong)));
  return months.map((x) => ({
    ...x,
    tiLeKhoiLuong: Math.max(0, x.tong) / caoNhat,
    trangThai: x.dangChay ? "current" : x.daQua ? "past" : "future",
  }));
}

export function dungVongNam(acts: Activity[], nam: number, bangkokToday: string): OThangNam[] {
  const currentYear = Number(bangkokToday.slice(0, 4));
  const currentMonth = Number(bangkokToday.slice(5, 7)) - 1;
  const thangNay = currentYear === nam ? currentMonth : (nam < currentYear ? 12 : -1);
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

/* Khung rộng hơn cánh tối đa 62 đơn vị để nhãn hai dòng luôn ở ngoài vòng. */
const S = 388;
const CX = S / 2;
const CY = S / 2;
const R0 = 78;
const RMAX = 132;
const R_NHAN = 162;
const KHE = 2;

const toaDo = (r: number, doc: number): [number, number] => {
  const rad = (doc * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
};

/** Hình quạt vành khuyên cho rãnh, cánh và phần trạng thái. */
function quat(r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = toaDo(r1, a0);
  const [x1, y1] = toaDo(r1, a1);
  const [x2, y2] = toaDo(r0, a1);
  const [x3, y3] = toaDo(r0, a0);
  return `M ${x0} ${y0} A ${r1} ${r1} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 0 0 ${x3} ${y3} Z`;
}

/** Góc bắt đầu của một tháng — tháng 1 ở đỉnh vòng, chạy theo chiều kim đồng hồ. */
const gocThang = (i: number): number => -90 + i * 30;

export function VongNamTable({ months }: { months: readonly OThangNam[] }) {
  return (
    <table>
      <caption className="lp-visually-hidden">Tiến độ thẩm định theo tháng</caption>
      <thead>
        <tr><th scope="col">Tháng</th><th scope="col">Đến hạn</th><th scope="col">Đã xong</th><th scope="col">Tỉ lệ</th><th scope="col">Trạng thái</th></tr>
      </thead>
      {/* Không tô đỏ dòng nào: bảy trên mười hai tháng đã qua đều còn
          việc, tô hết thì đỏ không còn là tín hiệu. Cột trạng thái đã
          nói đủ. */}
      <tbody>
        {months.map((x) => (
          <tr key={x.thang}>
            <th scope="row">{MONTHS[x.thang]}</th>
            <td className="tnum">{x.tong}</td>
            <td className="tnum">{x.xong}</td>
            <td className="tnum">{x.tong ? `${Math.round((x.xong / x.tong) * 100)}%` : "—"}</td>
            <td>{x.daQua ? "Đã qua" : x.dangChay ? "Đang chạy" : "Chưa tới hạn"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function VongNam({ acts, rate, total, year, bangkokToday, ben }: {
  acts: Activity[];
  /** Tỉ lệ hoàn thành VMP in giữa vòng — dùng chung phép đếm với KPI trang. */
  rate: number;
  total: number;
  year: number;
  bangkokToday: string;
  /** Cột chữ bên phải vòng (tiêu đề + phân bố trạng thái) do trang Tổng quan
   *  truyền vào. Để nguyên chỗ cũ thay vì bê vào đây: dữ liệu của nó thuộc
   *  về trang, không thuộc về biểu đồ này. */
  ben?: ReactNode;
}) {
  const nam = year;
  const o = useMemo(() => dungVongNam(acts, nam, bangkokToday), [acts, bangkokToday, nam]);
  const dongHo = useMemo(() => dungDongHoNam(o), [o]);
  const [bang, setBang] = useState(false);

  const dinh = o.reduce((m, x) => (x.tong > m.tong ? x : m), o[0]);
  const currentYear = Number(bangkokToday.slice(0, 4));
  const currentMonth = Number(bangkokToday.slice(5, 7)) - 1;
  const currentDay = Number(bangkokToday.slice(8, 10));
  const trongNam = currentYear === nam;

  /* Kim "hôm nay": vị trí thật trong năm, tính cả phần tháng đã trôi. */
  const gocHomNay = trongNam
    ? gocThang(currentMonth)
      + 30 * ((currentDay - 1) / new Date(Date.UTC(nam, currentMonth + 1, 0)).getUTCDate())
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
      <div className="vmp-vongnam-than">
        <div className="vmp-vongnam-vong">
          <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={moTa}
            className="vmp-vongnam-svg" data-vongnam-max-radius={RMAX}>
            <circle className="vmp-vongnam-vien" cx={CX} cy={CY} r={RMAX + 9} aria-hidden="true" />
            {dongHo.map((x) => {
              const a0 = gocThang(x.thang) + KHE;
              const a1 = gocThang(x.thang + 1) - KHE;
              const r1 = R0 + x.tiLeKhoiLuong * (RMAX - R0);
              const rXong = R0 + (r1 - R0) * x.tiLeXong;
              const rNap = Math.max(rXong, r1 - 9);
              const coDuLieu = x.tong > 0 && r1 > R0;
              return (
                <g key={`thang-${x.thang}`} data-vongnam-month={x.thang + 1}>
                  <title>
                    {`${MONTHS[x.thang]}: ${x.tong} hạng mục đến hạn, ${x.xong} đã xong`
                      + ` (${Math.round(x.tiLeXong * 100)}%)`
                      + (x.daQua ? " · tháng đã qua" : x.dangChay ? " · tháng đang chạy" : " · chưa tới hạn")}
                  </title>
                  <path data-vongnam-track="" className="vmp-vongnam-ranh"
                    d={quat(R0, RMAX, a0, a1)} aria-hidden="true" />
                  {coDuLieu && x.tiLeXong < 1 && (
                    <path data-vongnam-bar="" data-vongnam-status={x.trangThai}
                      className={`vmp-vongnam-canh vmp-vongnam-canh--${x.trangThai}`}
                      d={quat(rXong, r1, a0, a1)} />
                  )}
                  {coDuLieu && x.trangThai === "past" && x.tiLeXong < 1 && rNap < r1 && (
                    <path className="vmp-vongnam-nap-quahan"
                      d={quat(rNap, r1, a0, a1)} aria-hidden="true" />
                  )}
                  {coDuLieu && x.tiLeXong > 0 && (
                    <path data-vongnam-bar="" data-vongnam-status="done"
                      className="vmp-vongnam-canh vmp-vongnam-canh--done"
                      d={quat(R0, rXong, a0, a1)} />
                  )}
                </g>
              );
            })}

            <circle className="vmp-vongnam-loi-mat" cx={CX} cy={CY} r={R0 - 2} aria-hidden="true" />

            {/* Nhãn hai dòng luôn dùng cùng bán kính ngoài cánh. Không neo chữ
                vào mép cánh: số hai chữ số vẫn không thể chèn vào dữ liệu. */}
            {dongHo.map((x) => {
              const giua = gocThang(x.thang) + 15;
              const [tx, ty] = toaDo(R_NHAN, giua);
              return (
                <g key={`nhan-${x.thang}`} transform={`translate(${tx} ${ty})`}
                  data-vongnam-label="" data-radius={R_NHAN}
                  className={x.dangChay ? "vmp-vongnam-nhan vmp-vongnam-nhan--hientai" : "vmp-vongnam-nhan"}>
                  {x.dangChay && <rect x={-19} y={-19} width={38} height={40} rx={13} aria-hidden="true" />}
                  <text textAnchor="middle" fontFamily={TEXT}>
                    <tspan x={0} y={-2} className="vmp-vongnam-nhan-thang">{MONTHS[x.thang]}</tspan>
                    <tspan x={0} y={14} className="vmp-vongnam-nhan-so">{x.tong}</tspan>
                  </text>
                </g>
              );
            })}

            {/* Kim ngắn chỉ nằm trên vành dữ liệu; không cắt qua lõi hoặc chữ. */}
            {gocHomNay != null && (
              <g data-vongnam-today="" className="vmp-vongnam-homnay">
                <line
                  x1={toaDo(R0 + 7, gocHomNay)[0]} y1={toaDo(R0 + 7, gocHomNay)[1]}
                  x2={toaDo(RMAX - 3, gocHomNay)[0]} y2={toaDo(RMAX - 3, gocHomNay)[1]} />
                <circle cx={toaDo(RMAX - 3, gocHomNay)[0]} cy={toaDo(RMAX - 3, gocHomNay)[1]} r={3.4} />
              </g>
            )}
          </svg>

          {/* Số nằm ở lớp HTML giữa vòng: bôi-chép được, trình đọc màn hình
              đọc được, và không nhoè như chữ vẽ trong canvas. */}
          <div className="vmp-vongnam-loi">
            <div className="vmp-vongnam-loi-tyle" style={{ fontFamily: NUM_HERO }}>
              {rate}%
            </div>
            <div className="vmp-vongnam-loi-nhan">
              HOÀN THÀNH VMP
            </div>
            <div className="vmp-vongnam-loi-tong">
              trên {total} hạng mục
            </div>
          </div>
        </div>

        <div className="vmp-vongnam-ben">
          <div className="vmp-vongnam-ketluan">
            <CauKetLuan chinh={ketLuan.chinh} phu={ketLuan.phu} tone={ketLuan.tone} />
          </div>

          {ben}

          <div className="vmp-vongnam-chu">
            <span><i className="vmp-vongnam-chu--done" />Đã xong</span>
            <span><i className="vmp-vongnam-chu--over" />Đã tới hạn, chưa xong</span>
            <span><i className="vmp-vongnam-chu--future" />Chưa tới hạn</span>
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
          <VongNamTable months={o} />
        </div>
      )}
    </div>
  );
}

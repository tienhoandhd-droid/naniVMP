/* =====================================================================
 *  BieuDoKiemSoat.tsx — Biểu đồ kiểm soát Shewhart (p-chart) cho tỉ lệ
 *  hoàn thành VMP theo tháng.
 *  ---------------------------------------------------------------------
 *  Câu hỏi mà KHÔNG biểu đồ nào khác trong app đang trả lời:
 *
 *      "Tháng này tỉ lệ tụt — là dao động bình thường của một quy trình
 *       vẫn đang chạy đúng, hay là quy trình đã hỏng ở tháng đó?"
 *
 *  Biểu đồ cột thường không trả lời được, vì cột nào cũng khác cột nào và
 *  mắt luôn thấy "tháng thấp nhất" — kể cả khi tất cả đều bình thường.
 *  Truy nguyên một tháng chỉ vì nó thấp nhất là dạng lãng phí Deming gọi
 *  là "can thiệp vào nhiễu" (tampering): tốn công mà còn làm quy trình
 *  loạn thêm.
 *
 *  Cách phân định: đường giới hạn ±3σ. Điểm nằm TRONG giới hạn là nhiễu
 *  chung của hệ (common cause) — muốn nâng thì phải đổi cả cách làm.
 *  Điểm nằm NGOÀI là nguyên nhân riêng (special cause) — tháng đó có
 *  chuyện, đáng truy.
 *
 *  Vì sao là p-chart chứ không phải X-chart: dữ liệu ở đây là TỈ LỆ trên
 *  một mẫu có kích thước khác nhau mỗi tháng (tháng 8 có 80 hạng mục,
 *  tháng 2 có 12). Sai số chuẩn của tỉ lệ phụ thuộc vào cỡ mẫu, nên giới
 *  hạn phải HẸP lại ở tháng nhiều hạng mục và RỘNG ra ở tháng ít —
 *  đường giới hạn vì thế có dạng bậc thang, không phải đường thẳng.
 *
 *      σᵢ = √( p̄(1−p̄) / nᵢ )     UCLᵢ = p̄ + 3σᵢ     LCLᵢ = p̄ − 3σᵢ
 *
 *  Ba luật Western Electric được cài: vượt 3σ (luật 1), 8 điểm cùng phía
 *  đường tâm (luật 4 — lệch hệ thống), 6 điểm đơn điệu (xu hướng trôi).
 * ===================================================================== */
import { useMemo, useState } from "react";
import { C, TEXT, NUM } from "../../constants/theme.ts";
import { MONTHS, vmpToday } from "../../constants/vmp.ts";
import { parseD } from "../../utils/helpers.ts";
import { CauKetLuan } from "../ui/Primitives.tsx";
import type { Activity } from "../../types/domain.ts";

export interface DiemKiemSoat {
  /** Tháng 0..11. */
  thang: number;
  /** Số hạng mục có đích VMP trong tháng. */
  n: number;
  xong: number;
  /** Tỉ lệ hoàn thành 0..1. */
  p: number;
  ucl: number;
  lcl: number;
  sigma: number;
  /** Tháng hiện tại: chưa trọn tháng nên điểm vẽ rỗng, có chú thích riêng. */
  dangChay: boolean;
  /** Vượt giới hạn ±3σ — tín hiệu nguyên nhân riêng. */
  vuot: boolean;
}

export interface KetQuaKiemSoat {
  diem: DiemKiemSoat[];
  /** Đường tâm p̄ = tổng xong / tổng hạng mục (KHÔNG phải trung bình các tỉ lệ). */
  pTb: number;
  vuot: DiemKiemSoat[];
  /** Chuỗi ≥8 điểm liên tiếp cùng phía đường tâm, nếu có. */
  chuoiLech: { phia: "duoi" | "tren"; dai: number; tu: number; den: number } | null;
  /** Chuỗi ≥6 điểm đơn điệu, nếu có. */
  xuHuong: { chieu: "len" | "xuong"; dai: number; tu: number; den: number } | null;
}

/** Tổng hợp theo tháng rồi tính giới hạn. Chỉ lấy tháng ĐÃ TỚI: tháng
 *  tương lai chưa tới hạn nên tỉ lệ 0% là vô nghĩa, đưa vào chỉ kéo tụt
 *  đường tâm và làm giới hạn sai. */
export function tinhKiemSoat(acts: Activity[], nam: number): KetQuaKiemSoat {
  const homNay = vmpToday();
  const thangCuoi = nam === homNay.getFullYear() ? homNay.getMonth() : 11;

  const oThang = Array.from({ length: 12 }, () => ({ n: 0, xong: 0 }));
  for (const a of acts) {
    if ((a.state || "active") !== "active") continue;
    const t = a.target ? parseD(a.target) : null;
    if (!t || t.getFullYear() !== nam) continue;
    const i = t.getMonth();
    if (i > thangCuoi) continue;
    oThang[i].n += 1;
    if (a.st === "done") oThang[i].xong += 1;
  }

  const dung = oThang
    .map((o, thang) => ({ ...o, thang }))
    .filter((o) => o.n > 0);

  const tongN = dung.reduce((s, o) => s + o.n, 0);
  const tongXong = dung.reduce((s, o) => s + o.xong, 0);
  const pTb = tongN ? tongXong / tongN : 0;

  const diem: DiemKiemSoat[] = dung.map((o) => {
    const sigma = Math.sqrt(Math.max(0, pTb * (1 - pTb)) / o.n);
    const ucl = Math.min(1, pTb + 3 * sigma);
    const lcl = Math.max(0, pTb - 3 * sigma);
    const p = o.xong / o.n;
    const dangChay = nam === homNay.getFullYear() && o.thang === homNay.getMonth();
    return {
      thang: o.thang, n: o.n, xong: o.xong, p, ucl, lcl, sigma, dangChay,
      // Tháng đang chạy chưa đủ dữ kiện để kết tội — nó luôn thấp vì phần
      // lớn hạng mục chưa tới hạn. Vẽ nhưng không tính là tín hiệu.
      vuot: !dangChay && (p > ucl + 1e-9 || p < lcl - 1e-9),
    };
  });

  /* Luật 4 Western Electric — 8 điểm liên tiếp cùng một phía đường tâm.
     Không điểm nào vượt giới hạn mà vẫn là tín hiệu: xác suất 8 lần liên
     tiếp cùng phía do ngẫu nhiên là 1/128, quá hiếm để bỏ qua. */
  let chuoiLech: KetQuaKiemSoat["chuoiLech"] = null;
  {
    let dai = 0;
    let phia: "duoi" | "tren" | null = null;
    for (let i = 0; i < diem.length; i += 1) {
      const p = diem[i].p;
      const ph = p > pTb ? "tren" : p < pTb ? "duoi" : null;
      if (ph && ph === phia) dai += 1;
      else { phia = ph; dai = ph ? 1 : 0; }
      if (dai >= 8 && phia) {
        chuoiLech = { phia, dai, tu: diem[i - dai + 1].thang, den: diem[i].thang };
      }
    }
  }

  /* Xu hướng — 6 điểm đơn điệu liên tiếp. Quy trình đang trôi đều một
     chiều, thường do một yếu tố tích luỹ (người nghỉ, tồn đọng dồn). */
  let xuHuong: KetQuaKiemSoat["xuHuong"] = null;
  {
    let dai = 1;
    let chieu: "len" | "xuong" | null = null;
    for (let i = 1; i < diem.length; i += 1) {
      const ch = diem[i].p > diem[i - 1].p ? "len" : diem[i].p < diem[i - 1].p ? "xuong" : null;
      if (ch && ch === chieu) dai += 1;
      else { chieu = ch; dai = ch ? 2 : 1; }
      if (dai >= 6 && chieu) {
        xuHuong = { chieu, dai, tu: diem[i - dai + 1].thang, den: diem[i].thang };
      }
    }
  }

  return { diem, pTb, vuot: diem.filter((d) => d.vuot), chuoiLech, xuHuong };
}

const pc = (v: number): string => `${Math.round(v * 100)}%`;

/** Câu kết luận đặt TRÊN hình — biểu đồ phải tự nói ra điều nó phát hiện. */
function dungKetLuan(kq: KetQuaKiemSoat): { chinh: string; phu: string; tone: "ok" | "warn" | "over" } {
  const { diem, pTb, vuot, chuoiLech, xuHuong } = kq;
  if (diem.length < 3) {
    return {
      chinh: "Chưa đủ tháng có dữ liệu để dựng giới hạn kiểm soát.",
      phu: "Cần ít nhất 3 tháng đã tới hạn; với dưới 8 tháng thì giới hạn còn rộng, đọc tham khảo.",
      tone: "warn",
    };
  }

  if (vuot.length) {
    const x = [...vuot].sort((a, b) => Math.abs(b.p - pTb) - Math.abs(a.p - pTb))[0];
    const duoi = x.p < pTb;
    return {
      chinh: `${MONTHS[x.thang]} ${duoi ? "tuột khỏi" : "vượt lên trên"} giới hạn kiểm soát: ${pc(x.p)} xong `
        + `(${x.xong}/${x.n}) so với mức thường ${pc(pTb)}${vuot.length > 1 ? ` — và còn ${vuot.length - 1} tháng nữa cũng vượt` : ""}.`,
      phu: duoi
        ? "Đây là nguyên nhân riêng, không phải dao động ngẫu nhiên — tháng đó có chuyện đã xảy ra, đáng truy nguyên."
        : "Vượt lên trên cũng là tín hiệu: tháng đó có gì làm khác thường, tìm ra để nhân rộng.",
      tone: duoi ? "over" : "warn",
    };
  }

  if (chuoiLech) {
    return {
      chinh: `Không tháng nào vượt giới hạn, nhưng ${chuoiLech.dai} tháng liên tiếp `
        + `(${MONTHS[chuoiLech.tu]}–${MONTHS[chuoiLech.den]}) đều nằm ${chuoiLech.phia === "duoi" ? "dưới" : "trên"} mức trung bình ${pc(pTb)}.`,
      phu: "Tám lần liên tiếp cùng phía chỉ có xác suất 1/128 nếu là ngẫu nhiên — mức nền đã dịch, không phải nhiễu.",
      tone: chuoiLech.phia === "duoi" ? "over" : "ok",
    };
  }

  if (xuHuong) {
    return {
      chinh: `Tỉ lệ hoàn thành ${xuHuong.chieu === "len" ? "tăng" : "giảm"} liên tục ${xuHuong.dai} tháng `
        + `(${MONTHS[xuHuong.tu]}→${MONTHS[xuHuong.den]}), hiện ${pc(diem[diem.length - 1].p)}.`,
      phu: xuHuong.chieu === "xuong"
        ? "Trôi đều một chiều thường do yếu tố tích luỹ — tồn đọng dồn, nhân sự hụt — chứ không phải sự cố một tháng."
        : "Xu hướng đang tốt lên đều đặn; giữ nguyên cách đang làm.",
      tone: xuHuong.chieu === "xuong" ? "warn" : "ok",
    };
  }

  const thap = [...diem].sort((a, b) => a.p - b.p)[0];
  return {
    chinh: `Mọi tháng đều nằm trong giới hạn kiểm soát quanh mức ${pc(pTb)} — chênh lệch giữa các tháng là dao động ngẫu nhiên.`,
    phu: `Kể cả ${MONTHS[thap.thang]} (${pc(thap.p)}, thấp nhất) cũng chưa phải tháng "hỏng": truy riêng tháng đó là truy vào nhiễu. `
      + `Muốn nâng tỉ lệ phải đổi cách làm cho cả năm, không phải xử một tháng.`,
    tone: "ok",
  };
}

const W = 780;
const H = 300;
const M = { t: 18, r: 18, b: 46, l: 48 };

/** Nhãn của một đường kẻ, có đế nền màu mặt phẳng để đường không cắt chữ.
 *  Bề rộng ước lượng theo số ký tự — SVG tĩnh không đo được chữ, mà ba
 *  nhãn ở đây đều là chuỗi cố định nên ước lượng là đủ. */
function NhanDuong({ x, y, mau, co = 10.5, children }: {
  x: number; y: number; mau: string; co?: number; children: string;
}) {
  const rong = children.length * co * 0.56 + 10;
  return (
    <g>
      <rect x={x - rong} y={y - co} width={rong} height={co + 5} rx={4}
        fill={C.surface} opacity={0.88} />
      <text x={x - 5} y={y} textAnchor="end"
        fontFamily={TEXT} fontSize={co} fontWeight={800} fill={mau}>
        {children}
      </text>
    </g>
  );
}

export default function BieuDoKiemSoat({ acts, nam }: { acts: Activity[]; nam: number }) {
  const kq = useMemo(() => tinhKiemSoat(acts, nam), [acts, nam]);
  const ketLuan = useMemo(() => dungKetLuan(kq), [kq]);
  const [bang, setBang] = useState(false);
  const { diem, pTb } = kq;

  if (!diem.length) {
    return (
      <div className="vmp-ctrl">
        <CauKetLuan tone="warn" chinh={`Chưa có hạng mục nào đã tới hạn trong năm ${nam}.`} />
      </div>
    );
  }

  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;
  const buoc = plotW / diem.length;
  const x = (i: number): number => M.l + (i + 0.5) * buoc;
  const xTrai = (i: number): number => M.l + i * buoc;
  const y = (v: number): number => M.t + plotH * (1 - v);

  /* Đường giới hạn dạng bậc thang: mỗi tháng một mức, vì cỡ mẫu mỗi tháng
     một khác. Vẽ liền một nét bằng H/V để mắt đọc được là "một đường". */
  const bacThang = (lay: (d: DiemKiemSoat) => number): string =>
    diem
      .map((d, i) => `${i === 0 ? `M ${xTrai(0)} ${y(lay(d))}` : `V ${y(lay(d))}`} H ${xTrai(i + 1)}`)
      .join(" ");

  const duongDiem = diem.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.p)}`).join(" ");

  /* Vùng nằm giữa hai giới hạn, tô rất nhạt. Mục đích: "trong tầm kiểm
     soát" phải đọc được như MỘT VÙNG, không phải hai đường rời — mắt bắt
     điểm-nằm-ngoài-vùng nhanh hơn nhiều so với so từng điểm với hai đường. */
  const vungKiemSoat = [
    `M ${xTrai(0)} ${y(diem[0].ucl)}`,
    ...diem.flatMap((d, i) => [`L ${xTrai(i)} ${y(d.ucl)}`, `L ${xTrai(i + 1)} ${y(d.ucl)}`]),
    ...[...diem].reverse().flatMap((d, k) => {
      const i = diem.length - 1 - k;
      return [`L ${xTrai(i + 1)} ${y(d.lcl)}`, `L ${xTrai(i)} ${y(d.lcl)}`];
    }),
    "Z",
  ].join(" ");

  return (
    <div className="vmp-ctrl">
      <CauKetLuan chinh={ketLuan.chinh} phu={ketLuan.phu} tone={ketLuan.tone} />

      <div className="vmp-ctrl-khung vmp-scroll">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="vmp-ctrl-svg"
          role="img"
          aria-label={`Biểu đồ kiểm soát tỉ lệ hoàn thành VMP theo tháng năm ${nam}. ${ketLuan.chinh}`}
        >
          {/* Lưới ngang 0/25/50/75/100% — mốc đọc, giữ mờ để không tranh
              chấp với đường giới hạn. */}
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke={C.line} strokeWidth={1} />
              <text x={M.l - 8} y={y(v) + 4} textAnchor="end"
                fontFamily={NUM} fontSize={11} fontWeight={700} fill={C.plumSoft}>
                {pc(v)}
              </text>
            </g>
          ))}

          <path d={vungKiemSoat} fill={C.mintSoft} opacity={0.5} />

          <path d={bacThang((d) => d.ucl)} fill="none" stroke={C.raspText}
            strokeWidth={1.6} strokeDasharray="7 5" opacity={0.75} />
          <path d={bacThang((d) => d.lcl)} fill="none" stroke={C.raspText}
            strokeWidth={1.6} strokeDasharray="7 5" opacity={0.75} />
          <line x1={M.l} x2={W - M.r} y1={y(pTb)} y2={y(pTb)}
            stroke={C.plum} strokeWidth={1.8} />

          {/* Nhãn đường có ĐẾ nền. Không có đế thì chính đường kẻ chạy xuyên
              qua chữ — nét đứt cắt ngang chữ nhỏ là chỗ đọc sai đầu tiên. */}
          <NhanDuong x={W - M.r - 2} y={y(pTb) - 6} mau={C.plum} co={11}>
            {`Mức thường ${pc(pTb)}`}
          </NhanDuong>
          <NhanDuong x={W - M.r - 2} y={y(diem[diem.length - 1].ucl) - 7} mau={C.raspText}>
            Giới hạn trên (+3σ)
          </NhanDuong>
          <NhanDuong x={W - M.r - 2} y={y(diem[diem.length - 1].lcl) + 15} mau={C.raspText}>
            Giới hạn dưới (−3σ)
          </NhanDuong>

          <path d={duongDiem} fill="none" stroke={C.plumSoft} strokeWidth={2}
            strokeLinejoin="round" opacity={0.55} />

          {diem.map((d, i) => {
            const nhan = `${MONTHS[d.thang]}: ${pc(d.p)} xong (${d.xong}/${d.n})`
              + ` · giới hạn ${pc(d.lcl)}–${pc(d.ucl)}`
              + (d.dangChay ? " · tháng chưa trọn, chưa tính là tín hiệu" : "")
              + (d.vuot ? " · VƯỢT giới hạn" : "");
            return (
              <g key={d.thang}>
                <title>{nhan}</title>
                {d.vuot && (
                  <circle cx={x(i)} cy={y(d.p)} r={11} fill={C.rasp} opacity={0.22} />
                )}
                <circle
                  cx={x(i)} cy={y(d.p)} r={d.vuot ? 6.5 : 5}
                  fill={d.dangChay ? C.surface : d.vuot ? C.rasp : C.plumSoft}
                  stroke={d.vuot ? C.raspText : d.dangChay ? C.plumSoft : C.surface}
                  strokeWidth={d.dangChay ? 2 : 1.5}
                  strokeDasharray={d.dangChay ? "3 2" : undefined}
                />
                {d.vuot && (
                  <text x={x(i)} y={y(d.p) + (d.p < pTb ? 26 : -16)} textAnchor="middle"
                    fontFamily={NUM} fontSize={12} fontWeight={900} fill={C.raspText}>
                    {pc(d.p)}
                  </text>
                )}
                <text x={x(i)} y={H - M.b + 18} textAnchor="middle"
                  fontFamily={TEXT} fontSize={11.5}
                  fontWeight={d.vuot ? 900 : 700}
                  fill={d.vuot ? C.raspText : C.plumSoft}>
                  {MONTHS[d.thang]}
                </text>
                <text x={x(i)} y={H - M.b + 33} textAnchor="middle"
                  fontFamily={NUM} fontSize={10} fontWeight={700} fill={C.plumSoft} opacity={0.75}>
                  n={d.n}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="vmp-ctrl-chu">
        <span><i className="vmp-ctrl-chu__tam" />Đường tâm p̄ — mức hoàn thành thường thấy</span>
        <span><i className="vmp-ctrl-chu__gh" />Giới hạn ±3σ · rộng hẹp theo số hạng mục của tháng</span>
        <span><i className="vmp-ctrl-chu__vuot" />Tháng vượt giới hạn — có nguyên nhân riêng</span>
        <span><i className="vmp-ctrl-chu__nay" />Tháng đang chạy — chưa trọn, chưa tính</span>
        <button type="button" className="vmp-ctrl-bangbtn" onClick={() => setBang((v) => !v)}>
          {bang ? "Ẩn bảng số" : "Xem bảng số"}
        </button>
      </div>

      {/* Bảng số liệu — mọi giá trị trên hình đều đọc được bằng chữ, không
          bắt phải rê chuột mới thấy. Cũng là bản dùng được với trình đọc
          màn hình và khi in ra giấy. */}
      {bang && (
        <div className="vmp-ctrl-bang vmp-scroll">
          <table>
            <thead>
              <tr>
                <th>Tháng</th><th>Đến hạn</th><th>Xong</th><th>Tỉ lệ</th>
                <th>Giới hạn dưới</th><th>Giới hạn trên</th><th>Nhận định</th>
              </tr>
            </thead>
            <tbody>
              {diem.map((d) => (
                <tr key={d.thang} className={d.vuot ? "is-vuot" : ""}>
                  <td>{MONTHS[d.thang]}</td>
                  <td className="tnum">{d.n}</td>
                  <td className="tnum">{d.xong}</td>
                  <td className="tnum">{pc(d.p)}</td>
                  <td className="tnum">{pc(d.lcl)}</td>
                  <td className="tnum">{pc(d.ucl)}</td>
                  <td>{d.dangChay ? "Tháng chưa trọn" : d.vuot ? "Vượt giới hạn" : "Trong kiểm soát"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

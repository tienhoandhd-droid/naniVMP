/* =====================================================================
 *  BanDoNhiet.tsx — Bản đồ nhiệt 2D, bản song sinh của các khối 3D
 *  ---------------------------------------------------------------------
 *  Mỗi khối 3D trong app nay có một bản 2D tương đương, đổi qua lại bằng
 *  một nút. Không phải để thay thế: khối 3D trả lời câu "chỗ nào nhô cao"
 *  nhanh hơn bất cứ bảng nào, còn bản đồ nhiệt trả lời câu "ô này bao
 *  nhiêu" chính xác hơn — vì con số nằm thẳng trong ô, không phải ước
 *  lượng theo chiều cao cột.
 *
 *  Ba việc mà bản 2D làm được còn 3D thì không:
 *   · IN RA GIẤY. WebGL không vào được PDF; hồ sơ GMP thì phải in.
 *   · ĐỌC CHÍNH XÁC. Không có phối cảnh, không có cột che cột.
 *   · MÁY YẾU / KHÔNG WEBGL vẫn xem được đủ số.
 *
 *  Màu là thang TUẦN TỰ một sắc (nhạt → đậm theo số lượng), không phải
 *  bảng màu rời: đại lượng ở đây là độ lớn, không phải danh tính. Con số
 *  luôn in trong ô nên màu chỉ là kênh phụ — người mù màu vẫn đọc đủ.
 * ===================================================================== */
import { C, NUM, TEXT } from "../../constants/theme.ts";

export interface ONhiet {
  /** Chỉ số hàng (0..). */
  hang: number;
  /** Chỉ số cột (0..). */
  cot: number;
  /** Giá trị chính — quyết định độ đậm và con số in trong ô. */
  gt: number;
  /** Giá trị phụ hiện ở dòng nhỏ trong ô (vd "chưa xong"). */
  phu?: number;
  /** Chú thích khi rê chuột. */
  ghiChu?: string;
}

export default function BanDoNhiet({
  tenHang, tenCot, o, nhanHang, nhanCot, donVi = "", phuLabel, sacDo = C.rasp,
  hauTo = "", congTong = true,
}: {
  /** Tên trục dọc, vd "Bộ phận". */
  tenHang: string;
  /** Tên trục ngang, vd "Tháng". */
  tenCot: string;
  o: ONhiet[];
  nhanHang: string[];
  nhanCot: string[];
  donVi?: string;
  /** Nhãn của giá trị phụ, vd "chưa xong". */
  phuLabel?: string;
  sacDo?: string;
  /** Hậu tố của giá trị chính, vd "%" — bảng nào đo tỉ lệ thì cần. */
  hauTo?: string;
  /** Có cộng tổng theo hàng/cột không. Tỉ lệ thì KHÔNG cộng được: cộng
   *  bốn cái 50% ra 200% là con số vô nghĩa. */
  congTong?: boolean;
}) {
  const bang = new Map<string, ONhiet>();
  for (const x of o) bang.set(`${x.hang}|${x.cot}`, x);
  const caoNhat = Math.max(1, ...o.map((x) => x.gt));

  /* Thang tuần tự: một sắc, đổi độ đậm theo giá trị. Năm bậc là đủ — quá
     năm bậc thì hai bậc cạnh nhau không phân biệt được bằng mắt, mà con số
     đã nằm sẵn trong ô rồi. */
  const doDam = (v: number): number => {
    if (v <= 0) return 0;
    const t = v / caoNhat;
    return t > 0.8 ? 0.92 : t > 0.6 ? 0.72 : t > 0.4 ? 0.5 : t > 0.2 ? 0.3 : 0.15;
  };
  const chuTren = (d: number): string => (d >= 0.5 ? "#fff" : C.plum);

  return (
    <div className="vmp-nhiet vmp-scroll">
      <table className="vmp-nhiet-bang">
        <thead>
          <tr>
            <th className="vmp-nhiet-goc">{tenHang} \\ {tenCot}</th>
            {nhanCot.map((c) => <th key={c}>{c}</th>)}
            {congTong && <th className="vmp-nhiet-tong">Tổng</th>}
          </tr>
        </thead>
        <tbody>
          {nhanHang.map((h, i) => {
            const cua = nhanCot.map((_, j) => bang.get(`${i}|${j}`));
            const tong = cua.reduce((s, x) => s + (x?.gt || 0), 0);
            return (
              <tr key={h}>
                <th scope="row">{h}</th>
                {cua.map((x, j) => {
                  const v = x?.gt || 0;
                  const d = doDam(v);
                  return (
                    <td key={j} title={x?.ghiChu || `${h} · ${nhanCot[j]}: ${v} ${donVi}`}>
                      <div className="vmp-nhiet-o" style={{
                        background: v > 0 ? `color-mix(in srgb, ${sacDo} ${Math.round(d * 100)}%, transparent)` : "transparent",
                        color: v > 0 ? chuTren(d) : C.plumSoft,
                      }}>
                        <b className="tnum" style={{ fontFamily: NUM }}>{v ? `${v}${hauTo}` : "·"}</b>
                        {x?.phu != null && x.phu > 0 && (
                          <small>{x.phu} {phuLabel}</small>
                        )}
                      </div>
                    </td>
                  );
                })}
                {congTong && <td className="vmp-nhiet-tong tnum" style={{ fontFamily: NUM }}>{tong}</td>}
              </tr>
            );
          })}
        </tbody>
        {congTong && (
        <tfoot>
          <tr>
            <th scope="row">Tổng</th>
            {nhanCot.map((_, j) => {
              const t = nhanHang.reduce((s, _h, i) => s + (bang.get(`${i}|${j}`)?.gt || 0), 0);
              return <td key={j} className="tnum" style={{ fontFamily: NUM }}>{t || "·"}</td>;
            })}
            <td className="vmp-nhiet-tong tnum" style={{ fontFamily: NUM }}>
              {o.reduce((s, x) => s + x.gt, 0)}
            </td>
          </tr>
        </tfoot>
        )}
      </table>
      <div className="vmp-nhiet-chu" style={{ fontFamily: TEXT }}>
        <span>Nhạt</span>
        {[0.15, 0.3, 0.5, 0.72, 0.92].map((d) => (
          <i key={d} style={{ background: `color-mix(in srgb, ${sacDo} ${Math.round(d * 100)}%, transparent)` }} />
        ))}
        <span>Đậm — càng nhiều {donVi || "hạng mục"}</span>
      </div>
    </div>
  );
}

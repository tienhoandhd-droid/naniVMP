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
  selected, onSelect,
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
  /** Cho phép một bản đồ chủ quản lưu lựa chọn mà không buộc các nơi dùng khác phải tương tác. */
  selected?: Pick<ONhiet, "hang" | "cot">;
  onSelect?: (cell: ONhiet) => void;
}) {
  const bang = new Map<string, ONhiet>();
  for (const x of o) bang.set(`${x.hang}|${x.cot}`, x);
  const caoNhat = Math.max(1, ...o.map((x) => x.gt));

  /* Thang tuần tự: một sắc, đổi độ đậm theo giá trị. Năm bậc là đủ — quá
     năm bậc thì hai bậc cạnh nhau không phân biệt được bằng mắt, mà con số
     đã nằm sẵn trong ô rồi. */
  /* Bốn bậc, và các mốc pha KHÔNG tuỳ ý.
   *
   * Thang cũ (0.15 / 0.3 / 0.5 / 0.72 / 0.92) có hai bậc giữa rơi đúng vào
   * vùng chết: nền pha 60–80% quá sáng cho chữ sứ và quá tối cho chữ mực,
   * nên KHÔNG màu chữ nào đạt 4.5:1 — đo được 3.05:1 và 4.35:1. Bốn mốc
   * dưới đây được chọn để mỗi bậc có ít nhất một màu chữ đạt chuẩn ở cả
   * chế độ sáng lẫn tối; bậc đỉnh dùng sắc đặc thay vì pha. */
  const doDam = (v: number): number => {
    if (v <= 0) return 0;
    const t = v / caoNhat;
    return t > 0.75 ? 1 : t > 0.45 ? 0.55 : t > 0.2 ? 0.28 : 0.14;
  };
  /* Màu chữ trên ô nhiệt.
   *
   * Không thể chọn bằng một ngưỡng cứng như bản cũ (`d >= 0.5 ? "#fff" : ink`),
   * vì cùng một bậc đậm cho ra hai độ sáng khác nhau ở hai chế độ: nền pha
   * với nền trang, mà nền trang thì một bên trắng một bên than. Ở bậc giữa,
   * chữ trắng chỉ đạt 2.7–4.4:1 — dưới ngưỡng AA.
   *
   * Nên việc chọn màu chữ giao cho CSS, nơi biết mình đang ở chế độ nào:
   * component chỉ nói ô này thuộc bậc mấy. */
  const bacCua = (d: number): 0 | 1 | 2 | 3 => {
    if (d <= 0) return 0;
    if (d >= 1) return 3;
    if (d >= 0.45) return 2;
    return 1;
  };

  /* Ma trận bộ phận × tháng không xếp dọc được: bỏ một chiều là mất chính
     thứ nó dùng để so sánh. Nên cuộn ngang ở đây là CHỦ Ý — khai báo bằng
     data-lp-scroll để luật A7 của bộ kiểm thẩm mỹ biết mà bỏ qua. */
  return (
    <div className="vmp-nhiet vmp-scroll" data-lp-scroll="ngang">
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
                  const isSelected = !!x && selected?.hang === i && selected?.cot === j;
                  return (
                    <td key={j} title={x?.ghiChu || `${h} · ${nhanCot[j]}: ${v} ${donVi}`}>
                      {x && onSelect ? <button type="button"
                        className={`vmp-nhiet-o vmp-nhiet-chon vmp-nhiet-bac-${bacCua(d)}`}
                        data-workload-cell={`${i}-${j}`} aria-pressed={isSelected} onClick={() => onSelect(x)} style={{
                        background: v > 0 ? `color-mix(in srgb, ${sacDo} ${Math.round(d * 100)}%, transparent)` : "transparent",
                        outline: isSelected ? `2px solid ${C.pink}` : undefined,
                        outlineOffset: isSelected ? 2 : undefined,
                      }}>
                        <b className="tnum" style={{ fontFamily: NUM }}>{v ? `${v}${hauTo}` : "·"}</b>
                        {x.phu != null && x.phu > 0 && <small>{x.phu} {phuLabel}</small>}
                      </button> : <div className={`vmp-nhiet-o vmp-nhiet-bac-${bacCua(d)}`} style={{
                        background: v > 0 ? `color-mix(in srgb, ${sacDo} ${Math.round(d * 100)}%, transparent)` : "transparent",
                      }}>
                        <b className="tnum" style={{ fontFamily: NUM }}>{v ? `${v}${hauTo}` : "·"}</b>
                        {x?.phu != null && x.phu > 0 && (
                          <small>{x.phu} {phuLabel}</small>
                        )}
                      </div>}
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
        {[0.14, 0.28, 0.55, 1].map((d) => (
          <i key={d} style={{ background: `color-mix(in srgb, ${sacDo} ${Math.round(d * 100)}%, transparent)` }} />
        ))}
        <span>Đậm — càng nhiều {donVi || "hạng mục"}</span>
      </div>
    </div>
  );
}

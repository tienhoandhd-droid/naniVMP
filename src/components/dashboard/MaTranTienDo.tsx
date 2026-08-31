/* =====================================================================
 *  MaTranTienDo.tsx — Ma trận trạng thái + chất lượng dữ liệu + điểm nóng
 *  ---------------------------------------------------------------------
 *  Học từ dashboard BMS (Hơi tinh khiết / Khí) của cùng nhà máy. Ba thứ
 *  bên đó làm đúng mà VMP còn thiếu:
 *
 *  1. BA TRẠNG THÁI, KHÔNG PHẢI HAI. BMS tách "thiếu dữ liệu" thành
 *     trạng thái riêng, không gộp vào "không đạt" — vì hai chuyện khác
 *     hẳn nhau: một bên là làm mà không đạt, một bên là KHÔNG BIẾT.
 *     VMP đang gộp hạng mục thiếu ngày/thiếu hạn vào "chưa hoàn thành",
 *     nên nhìn số không ra được chỗ nào là lỗ hổng hồ sơ.
 *
 *  2. MA TRẬN TRẠNG THÁI. Bảng vị trí × chỉ tiêu, mỗi ô một màu, bấm ô
 *     ra chi tiết. Với VMP: bộ phận × bốn giai đoạn (Đề cương → Thẩm
 *     định → Báo cáo → Đích). Nhìn một cái thấy ngay bộ phận nào tắc ở
 *     khâu nào — thứ mà danh sách phẳng không bao giờ cho thấy.
 *
 *  3. ĐIỂM CHẤT LƯỢNG DỮ LIỆU đặt ngay cạnh KPI chính, kèm ngưỡng rõ
 *     ràng (>=95% tốt · >=80% cần chú ý · dưới nữa là kém) và câu giải
 *     thích. Không có nó thì mọi tỷ lệ phần trăm khác đều đáng ngờ.
 * ===================================================================== */
import { useMemo, useState } from "react";
import { LayoutGrid, ShieldAlert, Flame, CheckCircle2, AlertTriangle, Clock, HelpCircle } from "lucide-react";
import { C, TEXT, NUM } from "../../constants/theme.ts";
import { DEPTS, vmpToday } from "../../constants/vmp.ts";
import { parseD, fmtVN, wlIsDone, nguoiPhuTrach, qrmRpn } from "../../utils/helpers.ts";
import { Card, CardTitle, Tag } from "../ui/Primitives.tsx";
import ViewportDialog from "../ui/ViewportDialog.tsx";
import type { Activity } from "../../types/domain.ts";

/** Trạng thái một giai đoạn của một hạng mục — bốn khả năng, trong đó
 *  "thieu" là chỗ dữ liệu không nói được gì chứ không phải chưa làm. */
type TrangThai = "xong" | "tre" | "chua" | "thieu";

/* Icon đi kèm màu — không phải trang trí. Bốn màu (xanh lá/đỏ/xanh dương/
   cam) đứng cạnh nhau trong thanh 8px hoặc ô nhỏ vẫn có thể khó phân biệt
   với mắt kém phân biệt màu hoặc chỉ liếc nhanh; icon là kênh THỨ HAI
   không phụ thuộc màu, đúng luật B4 (đã đo/ghi trong luat-tham-my.md):
   "mỗi vùng mang trạng thái phải có chữ hoặc biểu tượng đi kèm, không chỉ
   màu". */
const MAU: Record<TrangThai, { nhan: string; Icon: typeof CheckCircle2 }> = {
  xong:  { nhan: "Đã xong", Icon: CheckCircle2 },
  tre:   { nhan: "Trễ hạn", Icon: AlertTriangle },
  chua:  { nhan: "Chưa tới hạn", Icon: Clock },
  thieu: { nhan: "Thiếu dữ liệu", Icon: HelpCircle },
};

const THU_TU_TRANG_THAI: TrangThai[] = ["xong", "tre", "thieu", "chua"];

const GIAI_DOAN = [
  { id: "de_cuong",  ten: "Đề cương",   tt: "tt_de_cuong",   ngay: "ngay_de_cuong",   han: "dl_de_cuong" },
  { id: "tham_dinh", ten: "Thẩm định",  tt: "tt_tham_dinh",  ngay: "ngay_tham_dinh",  han: "dl_tham_dinh" },
  { id: "bao_cao",   ten: "Báo cáo",    tt: "tt_bao_cao",    ngay: "ngay_bao_cao",    han: "dl_bao_cao" },
  { id: "vmp",       ten: "Đích VMP",   tt: "tt_vmp",        ngay: "ngay_vmp",        han: "dl_vmp" },
] as const;

/** Chấm trạng thái một giai đoạn. Thiếu hạn thì KHÔNG đoán bừa là chưa
 *  làm — trả "thiếu dữ liệu" để nó hiện ra thành việc phải đi điền. */
function chamGiaiDoan(a: Activity, gd: (typeof GIAI_DOAN)[number]): TrangThai {
  const raw = (a._raw || {}) as Record<string, unknown>;
  const tt = raw[gd.tt];
  const ngay = parseD(raw[gd.ngay]);
  const han = parseD(raw[gd.han]);

  if (wlIsDone(tt)) return ngay ? "xong" : "thieu";   // xong mà không có ngày = hồ sơ hổng
  if (!han) return "thieu";                            // không có mốc thì không chấm được
  return han < vmpToday() ? "tre" : "chua";
}

/* Trục hàng đổi được. Cùng một bộ dữ liệu, đổi trục là đổi câu hỏi:
   theo bộ phận trả lời "ai đang tắc", theo đối tượng trả lời "máy nào
   đang kẹt", theo người trả lời "ai đang gánh", theo loại thẩm định trả
   lời "khâu IQ/OQ/PQ nào đang chậm". */
const TRUC = [
  { id: "bo_phan", ten: "Bộ phận" },
  { id: "khu_vuc", ten: "Khu vực" },
  { id: "nhom_viec", ten: "Nhóm công việc" },
  { id: "doi_tuong", ten: "Đối tượng" },
  { id: "nguoi", ten: "Người thực hiện" },
  { id: "loai", ten: "Loại thẩm định" },
] as const;
type TrucId = (typeof TRUC)[number]["id"];

/* Cột đổi được nữa: bốn giai đoạn trả lời "tắc ở khâu nào", mười hai
   tháng trả lời "dồn việc vào lúc nào" — cùng một bảng, hai câu hỏi. */
const COT = [
  { id: "giai_doan", ten: "Bốn giai đoạn" },
  { id: "thang", ten: "12 tháng" },
] as const;
type CotId = (typeof COT)[number]["id"];

const THANG = Array.from({ length: 12 }, (_, i) => ({ id: "t" + (i + 1), ten: "T" + (i + 1), so: i + 1 }));

/** Chấm một hạng mục theo MỐC ĐÍCH của nó (dùng cho cột tháng). */
function chamHangMuc(a: Activity): TrangThai {
  const raw = (a._raw || {}) as Record<string, unknown>;
  if (a.st === "done") return parseD(raw.ngay_vmp) ? "xong" : "thieu";
  const dich = parseD(a.target);
  if (!dich) return "thieu";
  return dich < vmpToday() ? "tre" : "chua";
}

export function MatrixDetailDialog({ detail, onClose }: {
  detail: { ten: string; ds: Activity[] };
  onClose: () => void;
}) {
  return (
    <ViewportDialog open onRequestClose={() => onClose()} maxWidth={620} icon={LayoutGrid} title={detail.ten}
      footer={(
        <button type="button" onClick={onClose} style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plumSoft,
          background: C.surface, border: `1.5px solid ${C.pinkSoft}`, borderRadius: 14, padding: "11px 18px", cursor: "pointer" }}>
          Đóng
        </button>
      )}>
      <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700, marginBottom: 12 }}>
        {detail.ds.length} hạng mục
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {detail.ds.slice(0, 40).map((a) => (
          <div key={a.id} style={{ padding: "9px 12px", borderRadius: 14, background: C.surface, border: `1px solid ${C.pinkSoft}` }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.plum }}>{a.name}</div>
            <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>
              {a.id} · {nguoiPhuTrach(a.owner)} · đích {a.target ? fmtVN(parseD(a.target)) : "chưa có"}
              {a.score != null ? ` · trọng yếu ${a.score}/9` : ""}
            </div>
          </div>
        ))}
        {detail.ds.length > 40 && (
          <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700, textAlign: "center", padding: 8 }}>
            … và {detail.ds.length - 40} hạng mục nữa
          </div>
        )}
      </div>
    </ViewportDialog>
  );
}

export default function MaTranTienDo({ acts }: { acts: Activity[] }) {
  const [oDangXem, setODangXem] = useState<{ ten: string; ds: Activity[] } | null>(null);
  const [truc, setTruc] = useState<TrucId>("bo_phan");
  const [cot, setCot] = useState<CotId>("giai_doan");
  const [soHang, setSoHang] = useState(12);

  const { luoi, chatLuong, diemNong, tong } = useMemo(() => {
    const A = acts.filter((a) => (a.state || "active") === "active");

    // Gom hạng mục theo trục hàng đang chọn
    const nhom = new Map<string, { ten: string; phu: string; ds: Activity[] }>();
    const them = (khoa: string, ten: string, phu: string, a: Activity) => {
      if (!nhom.has(khoa)) nhom.set(khoa, { ten, phu, ds: [] });
      nhom.get(khoa)!.ds.push(a);
    };
    A.forEach((a) => {
      if (truc === "bo_phan") {
        const bps = a.depts?.length ? a.depts : [a.dept || "qa"];
        // Một hạng mục thuộc nhiều bộ phận thì đếm ở CẢ HAI — đúng như bộ lọc
        // bộ phận vẫn làm, nên tổng các hàng có thể lớn hơn tổng hạng mục.
        bps.forEach((id) => {
          const bp = DEPTS.find((d) => d.id === id);
          them(String(id), bp?.short || String(id), bp?.name || "", a);
        });
      } else if (truc === "khu_vuc") {
        const kv = String((a._raw as Record<string, unknown> | undefined)?.khu_vuc || a.area || "").trim();
        them(kv || "(chưa ghi khu vực)", kv || "(chưa ghi khu vực)", "", a);
      } else if (truc === "nhom_viec") {
        const ng = String(a.group || "").trim();
        them(ng || "(chưa xếp nhóm)", ng || "(chưa xếp nhóm)", "", a);
      } else if (truc === "doi_tuong") {
        them(String(a.code || "—"), String(a.code || "—"), String(a.name || ""), a);
      } else if (truc === "nguoi") {
        const ng = nguoiPhuTrach(a.owner);
        them(ng, ng, "", a);
      } else {
        const l = String(a.vtype || "—");
        them(l, l, "", a);
      }
    });

    const luoi = [...nhom.entries()]
      .map(([khoa, v]) => {
        const o = cot === "giai_doan"
          ? GIAI_DOAN.map((gd) => {
              const dem: Record<TrangThai, Activity[]> = { xong: [], tre: [], chua: [], thieu: [] };
              v.ds.forEach((a) => dem[chamGiaiDoan(a, gd)].push(a));
              return { id: gd.id, ten: gd.ten, dem };
            })
          : THANG.map((th) => {
              const dem: Record<TrangThai, Activity[]> = { xong: [], tre: [], chua: [], thieu: [] };
              v.ds.forEach((a) => {
                const d = parseD(a.target);
                if (d && d.getMonth() + 1 === th.so) dem[chamHangMuc(a)].push(a);
              });
              return { id: th.id, ten: th.ten, dem };
            });
        const tre = o.reduce((n, x) => n + x.dem.tre.length, 0);
        const thieu = o.reduce((n, x) => n + x.dem.thieu.length, 0);
        return { khoa, ten: v.ten, phu: v.phu, tong: v.ds.length, o, tre, thieu };
      })
      // Hàng có vấn đề nặng nhất lên trước — trục nào cũng đọc từ trên xuống.
      .sort((x, y) => (y.tre * 3 + y.thieu) - (x.tre * 3 + x.thieu) || y.tong - x.tong)
      .filter((h) => h.tong > 0);

    // Điểm chất lượng dữ liệu: bao nhiêu phần trăm ô chấm được
    let oTong = 0, oThieu = 0;
    A.forEach((a) => GIAI_DOAN.forEach((gd) => {
      oTong++;
      if (chamGiaiDoan(a, gd) === "thieu") oThieu++;
    }));
    const diem = oTong ? Math.round(((oTong - oThieu) / oTong) * 100) : 0;
    const chatLuong = {
      diem, oTong, oThieu,
      muc: diem >= 95 ? "Tốt" : diem >= 80 ? "Cần chú ý" : "Kém",
      mau: diem >= 95 ? C.mintText : diem >= 80 ? C.marigoldText : C.raspText,
      nen: diem >= 95 ? C.mintSoft : diem >= 80 ? C.marigoldSoft : C.raspSoft,
    };

    // Điểm nóng: đối tượng cần chú ý nhất (giống "Top 10 vị trí" của BMS)
    const theoDoiTuong = new Map<string, { ten: string; ds: Activity[] }>();
    A.forEach((a) => {
      const k = String(a.code || a.obj || "—");
      if (!theoDoiTuong.has(k)) theoDoiTuong.set(k, { ten: String(a.name || k), ds: [] });
      theoDoiTuong.get(k)!.ds.push(a);
    });
    const diemNong = [...theoDoiTuong.entries()]
      .map(([ma, v]) => {
        const tre = v.ds.filter((a) => a.st === "over").length;
        const thieu = v.ds.reduce((n, a) => n + GIAI_DOAN.filter((gd) => chamGiaiDoan(a, gd) === "thieu").length, 0);
        const rpnMax = Math.max(0, ...v.ds.map(qrmRpn));
        return { ma, ten: v.ten, ds: v.ds, tre, thieu, rpnMax, diem: tre * 3 + thieu + rpnMax / 3 };
      })
      .filter((x) => x.tre > 0 || x.thieu > 0)
      .sort((x, y) => y.diem - x.diem)
      .slice(0, 10);

    return { luoi, chatLuong, diemNong, tong: A.length };
  }, [acts, truc, cot]);

  const O = ({ dem, ten }: { dem: Record<TrangThai, Activity[]>; ten: string }) => {
    const tong = (Object.keys(dem) as TrangThai[]).reduce((n, k) => n + dem[k].length, 0);
    if (!tong) return (
      <td className="analysis-matrix-cell-wrap">
        <div className="analysis-matrix-cell analysis-matrix-cell--empty" aria-label={`${ten}. Không có hạng mục`} />
      </td>
    );
    const noiBat: TrangThai = dem.tre.length ? "tre" : dem.thieu.length ? "thieu" : dem.chua.length ? "chua" : "xong";
    const m = MAU[noiBat];
    const NoiBatIcon = m.Icon;
    const moTaDayDu = THU_TU_TRANG_THAI
      .filter((k) => dem[k].length)
      .map((k) => `${MAU[k].nhan} ${dem[k].length}`)
      .join(", ");
    return (
      <td className="analysis-matrix-cell-wrap">
        <button
          type="button"
          className={`analysis-matrix-cell analysis-matrix-cell--${noiBat}`}
          data-analysis-matrix-cell
          data-matrix-primary-status={noiBat}
          aria-label={`${ten}. Trạng thái chính ${m.nhan}: ${dem[noiBat].length} trên ${tong}. Cơ cấu: ${moTaDayDu}.`}
          onClick={() => setODangXem({ ten, ds: dem[noiBat] })}
          title={`${ten} — ${moTaDayDu}`}>
          <span className="analysis-matrix-cell__summary">
            <span className="analysis-matrix-cell__icon">
              <NoiBatIcon size={15} aria-hidden="true" />
            </span>
            <span className="analysis-matrix-cell__reading">
              <small>{m.nhan}</small>
              <strong>
                {dem[noiBat].length}<em>/{tong}</em>
              </strong>
            </span>
          </span>
          <span className="analysis-matrix-cell__mix" aria-hidden="true">
            {THU_TU_TRANG_THAI.map((k) => (
              dem[k].length
                ? <span key={k}
                    className={`analysis-matrix-cell__segment analysis-matrix-cell__segment--${k}`}
                    data-matrix-segment={k}
                    style={{ width: `${(dem[k].length / tong) * 100}%` }} />
                : null
            ))}
          </span>
        </button>
      </td>
    );
  };

  return (
    <section className="analysis-matrix" data-analysis-matrix aria-labelledby="overview-analysis-matrix-title">
      <div className="overview-analysis-layer__heading">
        <span className="overview-analysis-layer__index" aria-hidden="true">02</span>
        <div>
          <h3 id="overview-analysis-matrix-title">Ma trận điểm nghẽn</h3>
          <p>Đổi trục để tìm nơi đang trễ, thiếu dữ liệu hoặc dồn tải theo giai đoạn.</p>
        </div>
      </div>

      <Card variant="strong" cls="analysis-matrix__card">
        <div className="analysis-matrix__masthead">
          <CardTitle icon={LayoutGrid}
            sub="Màu theo trạng thái nặng nhất trong ô · bấm ô để xem danh sách hạng mục"
            right={(
              <div className="analysis-quality-badge" data-analysis-quality-badge
                aria-label={`Chất lượng dữ liệu ${chatLuong.diem}%, mức ${chatLuong.muc}; thiếu ${chatLuong.oThieu} trên ${chatLuong.oTong} ô`}>
                <ShieldAlert size={18} aria-hidden="true" />
                <span>
                  <small>Chất lượng dữ liệu</small>
                  <strong>{chatLuong.diem}% · {chatLuong.muc}</strong>
                </span>
                <em>{chatLuong.oThieu.toLocaleString("vi-VN")}/{chatLuong.oTong.toLocaleString("vi-VN")} ô thiếu</em>
              </div>
            )}>
            Bản đồ trạng thái
          </CardTitle>
        </div>

        {/* Đổi trục là đổi câu hỏi — cùng một bộ dữ liệu, bốn cách nhìn */}
        <div className="analysis-matrix__toolbar">
          <div className="analysis-matrix__choice" role="group" aria-label="Xem theo">
            <span>Xem theo</span>
            {TRUC.map((t) => {
              const on = truc === t.id;
              return (
                <button key={t.id} type="button" aria-pressed={on}
                  onClick={() => { setTruc(t.id); setSoHang(12); }}>
                  {t.ten}
                </button>
              );
            })}
          </div>
          <div className="analysis-matrix__choice" role="group" aria-label="Cột">
            <span>Cột</span>
            {COT.map((c) => {
              const on = cot === c.id;
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => setCot(c.id)}>
                  {c.ten}
                </button>
              );
            })}
          </div>
          <span className="analysis-matrix__hint">
            {cot === "thang"
              ? "Cột tháng xếp theo MỐC ĐÍCH của hạng mục — ô trống là tháng đó không có việc"
              : truc === "bo_phan"
                ? "Một hạng mục thuộc nhiều bộ phận sẽ đếm ở cả hai hàng"
                : "Hàng có nhiều hạng mục trễ / thiếu dữ liệu xếp lên trước"}
          </span>
        </div>

        <div className="analysis-matrix-legend" aria-label="Chú giải trạng thái">
          {(Object.keys(MAU) as TrangThai[]).map((k) => {
            const { Icon } = MAU[k];
            return (
              <span key={k} className={`analysis-matrix-legend__item analysis-matrix-legend__item--${k}`}
                data-matrix-legend-status={k}>
                <span className="analysis-matrix-legend__dot" aria-hidden="true" />
                <Icon size={14} aria-hidden="true" />
                {MAU[k].nhan}
              </span>
            );
          })}
          <span className="analysis-matrix-legend__total">{tong} hạng mục</span>
        </div>

        <div className="vmp-scroll analysis-matrix-scroll" data-analysis-matrix-table style={{ overflowX: "auto" }}>
          <table className="analysis-matrix-table" style={{ minWidth: cot === "giai_doan" ? 720 : 1120 }}>
            <thead>
              <tr>
                <th scope="col" className="analysis-matrix-table__head analysis-matrix-table__corner">
                  {TRUC.find((t) => t.id === truc)?.ten}
                </th>
                {(cot === "giai_doan" ? GIAI_DOAN.map((g) => ({ id: g.id, ten: g.ten })) : THANG).map((g) => (
                  <th key={g.id} scope="col" className="analysis-matrix-table__head">{g.ten}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {luoi.slice(0, soHang).map((h) => (
                <tr key={h.khoa} className="analysis-matrix-table__row">
                  <th scope="row" className="analysis-matrix-row-head">
                    <div className="analysis-matrix-row-head__name">{h.ten}</div>
                    <div className="analysis-matrix-row-head__meta">
                      {h.phu ? h.phu + " · " : ""}{h.tong} hạng mục
                    </div>
                  </th>
                  {h.o.map((o) => <O key={o.id} dem={o.dem} ten={`${h.ten} · ${o.ten}`} />)}
                </tr>
              ))}
              {luoi.length > soHang && (
                <tr><td colSpan={cot === "giai_doan" ? 5 : 13} style={{ padding: "10px 8px" }}>
                  <button type="button" onClick={() => setSoHang((n) => n + 20)}
                    style={{ fontFamily: TEXT, fontSize: 12, fontWeight: 700, color: C.plum,
                             border: `1.5px solid ${C.pinkSoft}`, background: C.surface,
                             borderRadius: 999, padding: "7px 14px", cursor: "pointer" }}>
                    Hiện thêm — đang xem {soHang}/{luoi.length} hàng
                  </button>
                </td></tr>
              )}
              {!luoi.length && (
                <tr><td colSpan={cot === "giai_doan" ? 5 : 13} style={{ padding: 24, textAlign: "center", color: C.plumSoft, fontWeight: 600 }}>Không có hạng mục nào trong phạm vi đang lọc.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="analysis-matrix__hotspots">
        <Card variant="soft" cls="analysis-matrix__hotspot-card">
          <CardTitle icon={Flame} sub="Nhiều hạng mục trễ, nhiều ô thiếu dữ liệu, điểm rủi ro cao">
            Đối tượng cần chú ý nhất
          </CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {diemNong.map((d) => (
              <button key={d.ma} type="button" onClick={() => setODangXem({ ten: `${d.ma} · ${d.ten}`, ds: d.ds })}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 14,
                         background: C.surface, border: `1px solid ${C.pinkSoft}`, cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontFamily: NUM, fontSize: 12, fontWeight: 800, color: C.plum, background: C.pinkMist, borderRadius: 8, padding: "3px 8px" }}>{d.ma}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: C.plum, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.ten}</span>
                {d.tre > 0 && <Tag color={C.raspText} bg={C.raspSoft}>{d.tre} trễ</Tag>}
                {d.thieu > 0 && <Tag color={C.marigoldText} bg={C.marigoldSoft}>{d.thieu} thiếu</Tag>}
              </button>
            ))}
            {!diemNong.length && (
              <div style={{ textAlign: "center", padding: 22, color: C.mintText, fontWeight: 700 }}>
                Không có đối tượng nào trễ hạn hay thiếu dữ liệu.
              </div>
            )}
          </div>
        </Card>
      </div>

      {oDangXem && <MatrixDetailDialog detail={oDangXem} onClose={() => setODangXem(null)} />}
    </section>
  );
}

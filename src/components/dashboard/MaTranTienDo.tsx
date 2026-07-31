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
import { LayoutGrid, ShieldAlert, Flame } from "lucide-react";
import { C, TEXT, NUM } from "../../constants/theme.ts";
import { DEPTS, vmpToday } from "../../constants/vmp.ts";
import { parseD, fmtVN, wlIsDone, nguoiPhuTrach, qrmRpn } from "../../utils/helpers.ts";
import { Card, CardTitle, Tag, Modal } from "../ui/Primitives.tsx";
import type { Activity } from "../../types/domain.ts";

/** Trạng thái một giai đoạn của một hạng mục — bốn khả năng, trong đó
 *  "thieu" là chỗ dữ liệu không nói được gì chứ không phải chưa làm. */
type TrangThai = "xong" | "tre" | "chua" | "thieu";

const MAU: Record<TrangThai, { nhan: string; mau: string; nen: string }> = {
  xong:  { nhan: "Đã xong", mau: C.mintText, nen: C.mintSoft },
  tre:   { nhan: "Trễ hạn", mau: C.raspText, nen: C.raspSoft },
  chua:  { nhan: "Chưa tới hạn", mau: C.skyText, nen: C.skySoft },
  thieu: { nhan: "Thiếu dữ liệu", mau: C.marigoldText, nen: C.marigoldSoft },
};

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
    if (!tong) return <td style={{ padding: 6 }}><div style={{ height: 44, borderRadius: 8, background: C.pinkMist }} /></td>;
    const noiBat: TrangThai = dem.tre.length ? "tre" : dem.thieu.length ? "thieu" : dem.chua.length ? "chua" : "xong";
    const m = MAU[noiBat];
    return (
      <td style={{ padding: 6 }}>
        <button
          onClick={() => setODangXem({ ten, ds: dem[noiBat] })}
          title={`${ten} — ${(Object.keys(dem) as TrangThai[]).filter((k) => dem[k].length).map((k) => `${MAU[k].nhan} ${dem[k].length}`).join(" · ")}`}
          style={{ width: "100%", border: `1.5px solid ${m.mau}22`, background: m.nen, borderRadius: 8,
                   padding: "6px 8px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 14, color: m.mau, lineHeight: 1 }}>
            {dem[noiBat].length}
            <span style={{ fontSize: 12, fontWeight: 700, color: C.plumSoft }}> / {tong}</span>
          </span>
          {/* Thanh ba màu: xong · trễ · thiếu — đúng kiểu stacked bar của BMS */}
          <span style={{ display: "flex", height: 5, borderRadius: 999, overflow: "hidden", background: C.surface }}>
            {(["xong", "tre", "thieu", "chua"] as TrangThai[]).map((k) => (
              dem[k].length ? <span key={k} style={{ width: `${(dem[k].length / tong) * 100}%`, background: MAU[k].mau }} /> : null
            ))}
          </span>
        </button>
      </td>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card variant="strong">
        <CardTitle icon={LayoutGrid}
          sub="Trục hàng đổi được · màu theo trạng thái nặng nhất trong ô · bấm ô để xem danh sách hạng mục">
          Ma trận tiến độ theo giai đoạn
        </CardTitle>

        {/* Đổi trục là đổi câu hỏi — cùng một bộ dữ liệu, bốn cách nhìn */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft }}>Xem theo</span>
          {TRUC.map((t) => {
            const on = truc === t.id;
            return (
              <button key={t.id} onClick={() => { setTruc(t.id); setSoHang(12); }}
                style={{ fontFamily: TEXT, fontSize: 12, fontWeight: on ? 800 : 600,
                         color: on ? C.plum : C.plumSoft, borderRadius: 999, padding: "7px 14px",
                         cursor: "pointer", border: `1.5px solid ${on ? C.pink : C.pinkSoft}`,
                         background: on ? C.pinkSoft : C.surface }}>
                {t.ten}
              </button>
            );
          })}
          <span style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft, marginLeft: 10 }}>Cột</span>
          {COT.map((c) => {
            const on = cot === c.id;
            return (
              <button key={c.id} onClick={() => setCot(c.id)}
                style={{ fontFamily: TEXT, fontSize: 12, fontWeight: on ? 800 : 600,
                         color: on ? C.plum : C.plumSoft, borderRadius: 999, padding: "7px 14px",
                         cursor: "pointer", border: `1.5px solid ${on ? C.lav : C.pinkSoft}`,
                         background: on ? C.lavSoft : C.surface }}>
                {c.ten}
              </button>
            );
          })}
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>
            {cot === "thang"
              ? "Cột tháng xếp theo MỐC ĐÍCH của hạng mục — ô trống là tháng đó không có việc"
              : truc === "bo_phan"
                ? "Một hạng mục thuộc nhiều bộ phận sẽ đếm ở cả hai hàng"
                : "Hàng có nhiều hạng mục trễ / thiếu dữ liệu xếp lên trước"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          {(Object.keys(MAU) as TrangThai[]).map((k) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: C.plumSoft }}>
              <span style={{ width: 12, height: 12, borderRadius: 8, background: MAU[k].mau }} />{MAU[k].nhan}
            </span>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>{tong} hạng mục</span>
        </div>

        <div className="vmp-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, minWidth: cot === "giai_doan" ? 620 : 1000 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontSize: 12, fontWeight: 800, color: C.plumSoft, padding: "0 8px 8px" }}>
                  {TRUC.find((t) => t.id === truc)?.ten}
                </th>
                {(cot === "giai_doan" ? GIAI_DOAN.map((g) => ({ id: g.id, ten: g.ten })) : THANG).map((g) => (
                  <th key={g.id} style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft, padding: "0 8px 8px" }}>{g.ten}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {luoi.slice(0, soHang).map((h) => (
                <tr key={h.khoa}>
                  <td style={{ padding: "6px 8px", maxWidth: 210 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.plum, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.ten}</div>
                    <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {h.phu ? h.phu + " · " : ""}{h.tong} hạng mục
                    </div>
                  </td>
                  {h.o.map((o) => <O key={o.id} dem={o.dem} ten={`${h.ten} · ${o.ten}`} />)}
                </tr>
              ))}
              {luoi.length > soHang && (
                <tr><td colSpan={cot === "giai_doan" ? 5 : 13} style={{ padding: "10px 8px" }}>
                  <button onClick={() => setSoHang((n) => n + 20)}
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 }}>
        <Card>
          <CardTitle icon={ShieldAlert} sub="Bao nhiêu phần trăm ô trong ma trận chấm được từ dữ liệu thật">
            Chất lượng dữ liệu
          </CardTitle>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ padding: "14px 20px", borderRadius: 14, background: chatLuong.nen, minWidth: 120, textAlign: "center" }}>
              <div style={{ fontFamily: NUM, fontSize: 28, fontWeight: 800, color: chatLuong.mau, lineHeight: 1 }}>{chatLuong.diem}%</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: chatLuong.mau, marginTop: 4 }}>{chatLuong.muc}</div>
            </div>
            <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: C.plumSoft, fontWeight: 600, lineHeight: 1.7 }}>
              <b style={{ color: C.plum }}>{chatLuong.oThieu.toLocaleString("vi-VN")}</b> trên {chatLuong.oTong.toLocaleString("vi-VN")} ô
              không chấm được: thiếu mốc hạn, hoặc ghi hoàn thành mà không có ngày thực tế.
              <div style={{ marginTop: 6 }}>
                Ngưỡng: <b style={{ color: C.mintText }}>≥95% tốt</b> · <b style={{ color: C.marigoldText }}>≥80% cần chú ý</b> · dưới nữa là kém.
              </div>
            </div>
          </div>
        </Card>

        <Card variant="soft">
          <CardTitle icon={Flame} sub="Nhiều hạng mục trễ, nhiều ô thiếu dữ liệu, điểm rủi ro cao">
            Đối tượng cần chú ý nhất
          </CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {diemNong.map((d) => (
              <button key={d.ma} onClick={() => setODangXem({ ten: `${d.ma} · ${d.ten}`, ds: d.ds })}
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

      {oDangXem && (
        <Modal onClose={() => setODangXem(null)} wide icon={LayoutGrid} title={oDangXem.ten}>
          <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700, marginBottom: 12 }}>
            {oDangXem.ds.length} hạng mục
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {oDangXem.ds.slice(0, 40).map((a) => (
              <div key={a.id} style={{ padding: "9px 12px", borderRadius: 14, background: C.surface, border: `1px solid ${C.pinkSoft}` }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.plum }}>{a.name}</div>
                <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>
                  {a.id} · {nguoiPhuTrach(a.owner)} · đích {a.target ? fmtVN(parseD(a.target)) : "chưa có"}
                  {a.score != null ? ` · trọng yếu ${a.score}/9` : ""}
                </div>
              </div>
            ))}
            {oDangXem.ds.length > 40 && (
              <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700, textAlign: "center", padding: 8 }}>
                … và {oDangXem.ds.length - 40} hạng mục nữa
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

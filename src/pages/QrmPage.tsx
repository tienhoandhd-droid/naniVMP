/* QrmPage.jsx — Ma trận rủi ro thẩm định (QRM / ICH Q9) */
import { useMemo, lazy, Suspense } from "react";
import { C, TEXT, NUM } from "../constants/theme.ts";
import { CLS, CRIT } from "../constants/vmp.ts";
import { valStatus, qrmRpn, qrmLevel } from "../utils/helpers.ts";
import { Card, CardTitle, Tag, Donut, Pill, CauKetLuan } from "../components/ui/Primitives.tsx";
import { ShieldAlert, AlertCircle, Trophy } from "lucide-react";
import type { Activity } from "../types/domain.ts";

/* ----------------------------------------------------------------
 * Tiến độ theo mức trọng yếu (trước ở trang Tổng quan, chuyển về đây
 * cho cùng chỗ với ma trận rủi ro).
 *
 * ICH Q9 và Annex 15 đều đòi xếp lịch theo rủi ro, nhưng trước giờ không
 * màn nào trả lời được câu hỏi kiểm tra sẽ hỏi: "nhóm trọng yếu cao có
 * được làm TRƯỚC không?". Biểu đồ này so tỷ lệ hoàn thành giữa các mức
 * điểm — nhóm 9 điểm mà tụt sau nhóm 3 điểm là dấu hiệu xếp lịch đang
 * chạy theo thứ tự danh sách chứ không theo rủi ro.
 * -------------------------------------------------------------- */
function RiskProgress({ acts }: { acts: Activity[] }) {
  const bands = useMemo(() => {
    const defs = [
      { id: "9", label: "9 điểm", hint: "phức tạp cao × ảnh hưởng trực tiếp", c: C.rasp, t: C.raspText, test: (n: number) => n >= 7 },
      { id: "6", label: "4–6 điểm", hint: "trung bình", c: C.marigold, t: C.marigoldText, test: (n: number) => n >= 4 && n < 7 },
      { id: "3", label: "1–3 điểm", hint: "thấp", c: C.mint, t: C.mintText, test: (n: number) => n < 4 },
    ];
    return defs.map((d) => {
      const items = acts.filter((a) => a.score != null && d.test(Number(a.score)));
      const done = items.filter((a) => a.st === "done").length;
      const over = items.filter((a) => a.st === "over").length;
      return { ...d, total: items.length, done, over,
               rate: items.length ? Math.round((done / items.length) * 100) : 0 };
    });
  }, [acts]);

  const cao = bands[0], thap = bands[2];
  const nguoc = cao.total > 0 && thap.total > 0 && cao.rate + 5 < thap.rate;
  const chuaCham = acts.filter((a) => a.score == null).length;

  return (
    <Card variant="strong">
      <CardTitle icon={ShieldAlert}
        sub="Điểm trọng yếu = mức độ phức tạp × ảnh hưởng chất lượng sản phẩm (1…9)">
        Tiến độ theo mức trọng yếu
      </CardTitle>

      {/* Kết luận đặt TRÊN hình, cùng một khối với mọi biểu đồ khác trong
          app — trước đây khối này nằm dưới và mang kiểu riêng, nên mỗi
          trang lại nói một giọng khác nhau. */}
      <CauKetLuan
        tone={nguoc ? "over" : "ok"}
        chinh={nguoc
          ? `Đang làm ngược thứ tự rủi ro: nhóm trọng yếu cao mới xong ${cao.rate}% trong khi nhóm thấp đã ${thap.rate}%.`
          : `Thứ tự ưu tiên hợp lý: nhóm trọng yếu cao đang ở ${cao.rate}%, không tụt sau nhóm thấp (${thap.rate}%).`}
        phu={[
          nguoc ? "ICH Q9 và Annex 15 đòi làm nhóm rủi ro cao trước — chênh này là thứ thanh tra hỏi đầu tiên." : "",
          chuaCham > 0 ? `Còn ${chuaCham} hạng mục chưa có điểm trọng yếu, chưa tính vào biểu đồ này.` : "",
        ].filter(Boolean).join(" ")}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {bands.map((b) => (
          <div key={b.id}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 5,
                          fontFamily: TEXT, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: b.t }}>{b.label}</span>
              <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>{b.hint}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>
                {b.done}/{b.total} xong
                {b.over > 0 && <span style={{ color: C.raspText }}> · {b.over} quá hạn</span>}
              </span>
              <span style={{ fontFamily: NUM, fontSize: 16, fontWeight: 800, color: b.t,
                             width: 50, textAlign: "right" }}>{b.rate}%</span>
            </div>
            <div style={{ height: 13, borderRadius: 999, background: C.pinkMist, overflow: "hidden",
                          display: "flex" }}>
              <div style={{ width: `${b.rate}%`, background: b.c }} />
              <div style={{ width: `${b.total ? (b.over / b.total) * 100 : 0}%`, background: C.raspText }} />
            </div>
          </div>
        ))}
      </div>

    </Card>
  );
}

/** Ô ma trận: danh sách hạng mục theo (mức tới hạn × trạng thái). */
type RiskGrid = Record<string, Record<string, Activity[]>>;

// Khối rủi ro 3D nạp theo yêu cầu — không ai mở trang này thì không tải three.js.
import { nhapCoThuLai } from "../lib/tailMan.ts";
const RiskSpace3D = lazy(nhapCoThuLai(() => import("../components/three/RiskSpace3D.tsx")));

export default function QrmView({ acts }: { acts: Activity[] }) {
  const giamChuyenDong = useMemo(
    () => typeof window !== "undefined"
      && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const cols = ["Đạt", "Chưa/Đang", "Quá hạn"];
  const rowsC = ["Cao", "TB", "Thấp"];
  const grid: RiskGrid = {};
  rowsC.forEach((r) => { grid[r] = {}; cols.forEach((c) => { grid[r][c] = []; }); });
  acts.forEach((a) => {
    const k = String(a.crit ?? "");
    if (grid[k]) grid[k][valStatus(a)].push(a);
  });
  const CRITMAP = CRIT as Record<string, {
    color: string; text: string; soft: string; w: number;
  }>;
  const cellRisk = (crit: string, col: string) => { const base = CRITMAP[crit].w; const sc = col === "Quá hạn" ? 3 : col === "Chưa/Đang" ? 2 : 1; const r = base * sc; return r >= 7 ? C.rasp : r >= 4 ? C.marigold : C.mint; };
  const cellText = (col: string) => col === C.mint ? C.mintText : col === C.marigold ? C.marigoldText : C.raspText;
  const critCount = rowsC.map((r) => ({ k: r, n: acts.filter((a) => a.crit === r).length }));
  // Điểm rủi ro dùng CHUNG với danh sách cảnh báo (helpers.qrmRpn) — hai chỗ
  // chấm khác nhau thì người dùng không biết tin bên nào.
  const top = acts.filter((a) => a.st !== "done")
    .map((a) => ({ a, score: qrmRpn(a) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, 8);

  /* Vòng tròn phân bố tự nó chỉ nói "có ba nhóm". Điều đáng nói là nhóm
     ảnh hưởng Cao chiếm bao nhiêu và trong đó bao nhiêu còn chưa xong —
     vì đó mới là phần quyết định thứ tự làm theo ICH Q9. */
  const klPhanBo = useMemo(() => {
    const tong = acts.length;
    if (!tong) return null;
    const cao = acts.filter((a) => a.crit === "Cao");
    const caoChua = cao.filter((a) => a.st !== "done").length;
    const ty = Math.round((cao.length / tong) * 100);
    return {
      chinh: `${cao.length}/${tong} hạng mục thuộc mức ảnh hưởng Cao (${ty}%), trong đó ${caoChua} chưa hoàn thành.`,
      phu: caoChua > 0
        ? "Đây là nhóm phải xong trước theo ICH Q9 — xem thứ tự thực tế ở biểu đồ tiến độ phía trên."
        : "Toàn bộ nhóm ảnh hưởng Cao đã hoàn thành.",
      tone: (caoChua > cao.length * 0.5 ? "warn" : "ok") as "warn" | "ok",
    };
  }, [acts]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Card>
        <CardTitle icon={ShieldAlert} sub="ICH Q9 / EU GMP Annex 15 — ưu tiên đối tượng ảnh hưởng GxP cao">Ma trận rủi ro thẩm định (QRM)</CardTitle>
        {/* Khối 3D: hai trục Q9 giữ nguyên, chiều cao là SỐ HẠNG MỤC — trả
            lời được câu bản 2D không trả lời nổi: ô đỏ kia có một hạng mục
            hay có bốn mươi. */}
        <Suspense fallback={<div style={{ height: 420 }} />}>
          <RiskSpace3D acts={acts} giamChuyenDong={giamChuyenDong} />
        </Suspense>
        <div style={{ overflowX: "auto", marginTop: 8 }} className="vmp-scroll">
          <table style={{ borderCollapse: "separate", borderSpacing: 8, margin: "0 auto" }}>
            <thead><tr><th></th>{cols.map((c) => <th key={c} style={{ fontFamily: TEXT, fontSize: 12, fontWeight: 800, color: C.plumSoft, padding: "0 8px" }}>{c}</th>)}</tr></thead>
            <tbody>{rowsC.map((rc) => (
              <tr key={rc}>
                <td style={{ fontFamily: TEXT, fontSize: 12, fontWeight: 800, color: CRITMAP[rc].text, paddingRight: 8, whiteSpace: "nowrap" }}>Ảnh hưởng {rc}</td>
                {cols.map((c) => { const items = grid[rc][c]; const col = cellRisk(rc, c); return (
                  <td key={c}><div style={{ width: 100, height: 74, borderRadius: 14, background: col + "26", border: `2px solid ${col}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontFamily: NUM, fontSize: 28, fontWeight: 800, color: cellText(col) }}>{items.length}</span>
                    <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>hạng mục</span>
                  </div></td>
                ); })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
          {[[C.mint, "Rủi ro thấp"], [C.marigold, "Rủi ro TB"], [C.rasp, "Rủi ro cao — ưu tiên"]].map(([c, l]) => <span key={l} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: C.plum }}><span style={{ width: 14, height: 14, borderRadius: 8, background: c }} />{l}</span>)}
        </div>
      </Card>
      <RiskProgress acts={acts} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 24 }}>
        <Card variant="soft">
          <CardTitle icon={Trophy}>Phân bố mức tới hạn</CardTitle>
          {klPhanBo && <CauKetLuan chinh={klPhanBo.chinh} phu={klPhanBo.phu} tone={klPhanBo.tone} />}
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <Donut size={140} segments={critCount.map((x) => ({ value: x.n, color: CRITMAP[x.k].color }))} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
              {critCount.map((x) => <div key={x.k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: C.plum }}><span style={{ width: 11, height: 11, borderRadius: 999, background: CRITMAP[x.k].color }} />Ảnh hưởng {x.k}</span><span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 16, color: CRITMAP[x.k].text }}>{x.n}</span></div>)}
            </div>
          </div>
        </Card>
        <Card variant="strong">
          <CardTitle icon={AlertCircle} sub="GxP cao nhưng chưa hoàn thành">Rủi ro ưu tiên xử lý</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {top.map((x) => { const cls = (CLS as Record<string, typeof CLS.tb>)[String(x.a.cls ?? "tb")] ?? CLS.tb; return (
              <div key={x.a.id} className="vmp-row vmp-lift" style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", borderRadius: 14, background: C.surface, border: `1px solid ${C.raspSoft}` }}>
                <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 10px", borderRadius: 999, color: qrmLevel(x.score) === "cao" ? "var(--lp-on-danger)" : qrmLevel(x.score) === "tb" ? "var(--lp-on-warning)" : "var(--lp-on-success)", background: qrmLevel(x.score) === "cao" ? C.raspText : qrmLevel(x.score) === "tb" ? C.marigoldText : C.mintText }}>RPN {x.score}</span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}><Tag color={cls.text} bg={cls.soft}>{x.a.vtype}</Tag><span style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plum }}>{x.a.name}</span></div><div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 1 }}>{x.a.id} · {x.a.dep}</div></div>
                <Pill s={x.a.st} small />
              </div>
            ); })}
            {top.length === 0 && <div style={{ textAlign: "center", padding: 20, color: C.mintText, fontWeight: 700 }}>Không còn rủi ro cao 🎉</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

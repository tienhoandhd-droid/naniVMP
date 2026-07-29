/* QrmPage.jsx — Ma trận rủi ro thẩm định (QRM / ICH Q9) */
import { C, TEXT, NUM } from "../constants/theme.ts";
import { CLS, CRIT } from "../constants/vmp.ts";
import { valStatus, qrmRpn, qrmLevel } from "../utils/helpers.ts";
import { Card, CardTitle, Tag, Donut, Pill } from "../components/ui/Primitives.tsx";
import { ShieldAlert, AlertCircle, Trophy } from "lucide-react";
import type { Activity } from "../types/domain.ts";

/** Ô ma trận: danh sách hạng mục theo (mức tới hạn × trạng thái). */
type RiskGrid = Record<string, Record<string, Activity[]>>;

export default function QrmView({ acts }: { acts: Activity[] }) {
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Card>
        <CardTitle icon={ShieldAlert} sub="ICH Q9 / EU GMP Annex 15 — ưu tiên đối tượng ảnh hưởng GxP cao">Ma trận rủi ro thẩm định (QRM)</CardTitle>
        <div style={{ overflowX: "auto" }} className="vmp-scroll">
          <table style={{ borderCollapse: "separate", borderSpacing: 8, margin: "0 auto" }}>
            <thead><tr><th></th>{cols.map((c) => <th key={c} style={{ fontFamily: TEXT, fontSize: 12.5, fontWeight: 800, color: C.plumSoft, padding: "0 8px" }}>{c}</th>)}</tr></thead>
            <tbody>{rowsC.map((rc) => (
              <tr key={rc}>
                <td style={{ fontFamily: TEXT, fontSize: 12.5, fontWeight: 800, color: CRITMAP[rc].text, paddingRight: 8, whiteSpace: "nowrap" }}>Ảnh hưởng {rc}</td>
                {cols.map((c) => { const items = grid[rc][c]; const col = cellRisk(rc, c); return (
                  <td key={c}><div style={{ width: 100, height: 74, borderRadius: 16, background: col + "26", border: `2px solid ${col}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontFamily: NUM, fontSize: 26, fontWeight: 800, color: cellText(col) }}>{items.length}</span>
                    <span style={{ fontSize: 10, color: C.plumSoft, fontWeight: 700 }}>hạng mục</span>
                  </div></td>
                ); })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
          {[[C.mint, "Rủi ro thấp"], [C.marigold, "Rủi ro TB"], [C.rasp, "Rủi ro cao — ưu tiên"]].map(([c, l]) => <span key={l} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: C.plum }}><span style={{ width: 14, height: 14, borderRadius: 5, background: c }} />{l}</span>)}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 24 }}>
        <Card variant="soft">
          <CardTitle icon={Trophy}>Phân bố mức tới hạn</CardTitle>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <Donut size={140} segments={critCount.map((x) => ({ value: x.n, color: CRITMAP[x.k].color }))} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
              {critCount.map((x) => <div key={x.k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: C.plum }}><span style={{ width: 11, height: 11, borderRadius: 999, background: CRITMAP[x.k].color }} />Ảnh hưởng {x.k}</span><span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 16, color: CRITMAP[x.k].text }}>{x.n}</span></div>)}
            </div>
          </div>
        </Card>
        <Card variant="strong">
          <CardTitle icon={AlertCircle} sub="GxP cao nhưng chưa hoàn thành">Rủi ro ưu tiên xử lý</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {top.map((x) => { const cls = (CLS as Record<string, typeof CLS.tb>)[String(x.a.cls ?? "tb")] ?? CLS.tb; return (
              <div key={x.a.id} className="vmp-row vmp-lift" style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", borderRadius: 14, background: C.surface, border: `1px solid ${C.raspSoft}` }}>
                <span style={{ fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 999, color: "#fff", background: qrmLevel(x.score) === "cao" ? C.raspText : qrmLevel(x.score) === "tb" ? C.marigoldText : C.mintText }}>RPN {x.score}</span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}><Tag color={cls.text} bg={cls.soft}>{x.a.vtype}</Tag><span style={{ fontFamily: TEXT, fontSize: 13, fontWeight: 800, color: C.plum }}>{x.a.name}</span></div><div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600, marginTop: 1 }}>{x.a.id} · {x.a.dep}</div></div>
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

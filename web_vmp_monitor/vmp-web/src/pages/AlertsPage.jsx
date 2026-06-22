/* AlertsPage.jsx — Cảnh báo tới hạn / quá hạn & tái thẩm định */
import { useState } from "react";
import { AlertCircle, CalendarClock } from "lucide-react";
import { C, TEXT, NUM, GRAD } from "../constants/theme.js";
import { CLS, CRIT, SOON_DAYS } from "../constants/vmp.js";
import { parseD, fmtVN, daysBetween, addMonths } from "../utils/helpers.js";
import { Card, CardTitle, Tag, KpiCard, Pill } from "../components/ui/Primitives.jsx";
import { vmpToday } from "../constants/vmp.js";

export default function AlertsView({ acts }) {
  const withAlert = acts.map((a) => ({ a, al: a.alert })).filter((x) => x.al && x.al.kind);
  const overdue = withAlert.filter((x) => x.al.kind === "over").sort((a, b) => a.al.dleft - b.al.dleft);
  const soon = withAlert.filter((x) => x.al.kind === "soon").sort((a, b) => a.al.dleft - b.al.dleft);
  const requal = acts.filter((a) => a.st === "done" && a.freq > 0).map((a) => { const next = addMonths(parseD(a.target), a.freq); return { a, next, dleft: daysBetween(next, vmpToday()) }; }).filter((x) => x.dleft >= -30).sort((a, b) => a.dleft - b.dleft).slice(0, 8);
  const Row = ({ a, al }) => {
    const cls = CLS[a.cls];
    return (
      <div className="vmp-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 13px", borderRadius: 16, background: "#fff", border: `1px solid ${al.kind === "over" ? C.raspSoft : C.marigoldSoft}` }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0, background: al.kind === "over" ? C.raspSoft : C.marigoldSoft, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}><span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 17, color: al.kind === "over" ? C.raspText : C.marigoldText, lineHeight: 1 }}>{Math.abs(al.dleft)}</span><span style={{ fontSize: 9, color: C.plumSoft, fontWeight: 700 }}>ngày {al.kind === "over" ? "trễ" : "nữa"}</span></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}><Tag color={cls.text} bg={cls.soft}>{a.vtype}</Tag><span style={{ fontFamily: TEXT, fontSize: 13.5, fontWeight: 800, color: C.plum }}>{a.name}</span></div>
          <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>{a.id} · Mốc <b style={{ color: al.kind === "over" ? C.raspText : C.marigoldText }}>{al.stage}</b> · hạn {fmtVN(al.date)} · BC: {a.dep}</div>
        </div>
        <Tag color={al.kind === "over" ? C.raspText : C.marigoldText} bg={al.kind === "over" ? C.raspSoft : C.marigoldSoft}>{al.kind === "over" ? "Quá hạn" : "Tới hạn"}</Tag>
      </div>
    );
  };
  const [f, setF] = useState("over");
  const cards = [
    { id: "over", emoji: "🚨", bg: C.raspSoft, color: C.raspText, ring: C.rasp, value: overdue.length, label: "Hạng mục quá hạn", sub: "Cần xử lý ngay" },
    { id: "soon", emoji: "⏰", bg: C.marigoldSoft, color: C.marigoldText, ring: C.marigold, value: soon.length, label: `Tới hạn (≤ ${SOON_DAYS} ngày)`, sub: "Theo dõi sát" },
    { id: "requal", emoji: "🔁", bg: C.lavSoft, color: C.lavText, ring: C.lav, value: requal.length, label: "Tái thẩm định sắp tới", sub: "Theo tần suất" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 24 }}>
        {cards.map((c) => (
          <div key={c.id} onClick={() => setF(c.id)} style={{ cursor: "pointer", borderRadius: 24, boxShadow: f === c.id ? `0 0 0 3px ${c.ring}` : "none", transition: "box-shadow .2s" }}>
            <KpiCard emoji={c.emoji} bg={c.bg} color={c.color} value={c.value} label={c.label} sub={f === c.id ? "● Đang xem" : c.sub} subColor={c.color} />
          </div>
        ))}
      </div>
      {f !== "requal" && (
        <Card variant="strong">
          <CardTitle icon={AlertCircle} sub="Quy tắc: Đề cương T‑60 · Báo cáo T‑5">{f === "over" ? `Quá hạn (${overdue.length})` : `Tới hạn (${soon.length})`}</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {f === "over" && (overdue.length ? overdue.map((x) => <Row key={x.a.id} {...x} />) : <div style={{ textAlign: "center", padding: 30, color: C.mintText, fontWeight: 700 }}>🎉 Không có hạng mục quá hạn!</div>)}
            {f === "soon" && (soon.length ? soon.map((x) => <Row key={x.a.id} {...x} />) : <div style={{ textAlign: "center", padding: 30, color: C.mintText, fontWeight: 700 }}>🎉 Không có hạng mục tới hạn!</div>)}
          </div>
        </Card>
      )}
      {f === "requal" && (
        <Card variant="soft">
          <CardTitle icon={CalendarClock} sub="Dự báo từ ngày hoàn thành + tần suất">Lịch tái thẩm định ({requal.length})</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {requal.map((x) => { const cls = CLS[x.a.cls]; return (
              <div key={x.a.id} className="vmp-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 16, background: "#fff", border: `1px solid ${C.pinkSoft}` }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: x.dleft <= 30 ? C.raspSoft : C.skySoft, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 16, color: x.dleft <= 30 ? C.raspText : C.skyText }}>{x.dleft < 0 ? "!" : x.dleft}</span><span style={{ fontSize: 9, color: C.plumSoft, fontWeight: 700 }}>ngày</span></div>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 7 }}><Tag color={cls.text} bg={cls.soft}>{x.a.vtype}</Tag><span style={{ fontFamily: TEXT, fontSize: 13.5, fontWeight: 800, color: C.plum }}>{x.a.name}</span></div><div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>Tái thẩm định dự kiến {fmtVN(x.next)} · chu kỳ {x.a.freq} tháng</div></div>
              </div>
            ); })}
            {requal.length === 0 && <div style={{ textAlign: "center", padding: 20, color: C.plumSoft, fontWeight: 600 }}>Chưa có lịch tái thẩm định.</div>}
          </div>
        </Card>
      )}
    </div>
  );
}

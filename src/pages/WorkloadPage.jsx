/* WorkloadPage.jsx — Ma trận tải công việc Người × Tháng */
import { useState, useMemo } from "react";
import { Activity, BarChart3, ShieldAlert, AlertCircle, Flag } from "lucide-react";
import { C, TEXT, NUM, GRAD } from "../constants/theme.js";
import { CLS, CRIT, WL_MONTHS, WL_QUARTERS, CAP_MONTH, CAP_HOSO_MONTH, vmpToday } from "../constants/vmp.js";
import { parseD, fmtVN, clamp, wlIsDone, wlMonthOf, wlScore, wlPending, congConLai, hoSoConLai } from "../utils/helpers.js";
import { Card, CardTitle, Tag, Modal, Donut, Mascot, Pill } from "../components/ui/Primitives.jsx";

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

function WorkloadDetailModal({ detail, onClose }) {
  const tasks = [...detail.tasks].sort((a, b) => parseD(a.target) - parseD(b.target));
  const PhaseChip = ({ label, done, cong }) => <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999, color: done ? C.mintText : C.marigoldText, background: done ? C.mintSoft : C.marigoldSoft }}>{done ? "✓" : "⏳"} {label}{!done && cong != null ? ` ${cong}nc` : ""}</span>;
  return (
    <Modal onClose={onClose} title={detail.title} icon={Activity} wide>
      <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 700, marginBottom: 14 }}>{tasks.length} hạng mục · còn lại <b style={{ color: C.lavText }}>{sum(tasks.map(congConLai))} ngày công</b> · <b style={{ color: C.pinkText }}>{tasks.filter(hoSoConLai).length} hồ sơ</b></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {tasks.map((a) => {
          const ph = wlPending(a);
          return (
            <div key={a.id} style={{ background: "#fff", border: `1.5px solid ${C.pinkSoft}`, borderRadius: 14, padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 7 }}>
                <Tag color={C.lavText} bg={C.lavSoft}>{a.vtype}</Tag>
                <span style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plum }}>{a.name}</span>
                <Pill s={a.st} small />
              </div>
              <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600, marginBottom: 9 }}>{a.code} · {a.owner} · đích {a.target ? fmtVN(parseD(a.target)) : "—"} · còn <b style={{ color: C.lavText }}>{congConLai(a)} nc</b></div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                <PhaseChip label="Đề cương" done={!ph.p} />
                <PhaseChip label="Thẩm định" done={!ph.v} cong={Number(a.effort) > 0 ? Number(a.effort) : null} />
                <PhaseChip label="Báo cáo" done={!ph.r} />
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export default function WorkloadView({ acts }) {
  const [scope, setScope] = useState("month");
  const [metric, setMetric] = useState("cong");
  const [detail, setDetail] = useState(null);

  const pend = useMemo(() => acts.filter((a) => a.st !== "done" && wlMonthOf(a) >= 0), [acts]);

  const people = useMemo(() => {
    const map = {};
    pend.forEach((a) => {
      const mi = wlMonthOf(a);
      const owner = a.owner || "—";
      if (!map[owner]) map[owner] = { name: owner, months: Array.from({ length: 12 }, () => ({ tasks: [], cong: 0, hoso: 0 })), congTotal: 0, hosoTotal: 0, count: 0, over: 0, critCao: 0 };
      const o = map[owner], cell = o.months[mi];
      const c = congConLai(a), h = hoSoConLai(a) ? 1 : 0;
      cell.tasks.push(a); cell.cong += c; cell.hoso += h;
      o.congTotal += c; o.hosoTotal += h; o.count++;
      if (a.st === "over") o.over++;
      if (a.crit === "Cao") o.critCao++;
    });
    return Object.values(map).sort((x, y) => y.congTotal - x.congTotal);
  }, [pend]);

  const cols = scope === "month" ? WL_MONTHS : scope === "quarter" ? WL_QUARTERS : ["Cả năm"];
  const unitMonths = scope === "month" ? 1 : scope === "quarter" ? 3 : 12;
  const congCap = CAP_MONTH * unitMonths;
  const cap = metric === "cong" ? congCap : CAP_HOSO_MONTH * unitMonths;
  const monthsOfCol = (ci) => scope === "month" ? [ci] : scope === "quarter" ? [ci * 3, ci * 3 + 1, ci * 3 + 2] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const valIn = (p, ci) => sum(monthsOfCol(ci).map((mi) => metric === "cong" ? p.months[mi].cong : p.months[mi].hoso));
  const tasksIn = (p, ci) => monthsOfCol(ci).flatMap((mi) => p.months[mi].tasks);
  const peakMonth = (p) => { let mx = 0, mi = -1; p.months.forEach((m, i) => { if (m.cong > mx) { mx = m.cong; mi = i; } }); return { eff: mx, mi }; };

  const heat = (val, capv) => {
    const ratio = capv > 0 ? val / capv : 0;
    if (ratio > 1) return { bg: C.rasp + "55", text: C.raspText };
    if (ratio >= 0.85) return { bg: C.marigold + "55", text: C.marigoldText };
    if (ratio >= 0.5) return { bg: C.sky + "55", text: C.skyText };
    return { bg: C.mint + "55", text: C.mintText };
  };

  const totalCong = sum(pend.map(congConLai));
  const totalHoso = pend.filter(hoSoConLai).length;
  const overloaded = people.filter((p) => peakMonth(p).eff > CAP_MONTH);
  const critCount = { Cao: 0, TB: 0, "Thấp": 0 }; pend.forEach((a) => { critCount[a.crit] = (critCount[a.crit] || 0) + 1; });
  const focus = pend.filter((a) => a.crit === "Cao" || wlScore(a) >= 7).map((a) => ({ a, sc: wlScore(a) })).sort((x, y) => y.sc - x.sc || (parseD(x.a.target) - parseD(y.a.target))).slice(0, 8);

  const openDetail = (title, tasks) => { if (tasks.length) setDetail({ title, tasks }); };
  const Btn = ({ on, onClick, children }) => <button onClick={onClick} style={{ padding: "8px 15px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: TEXT, fontSize: 12.5, fontWeight: 800, background: on ? GRAD : C.pinkSoft, color: on ? "#fff" : C.plumSoft }}>{children}</button>;
  const mood = overloaded.length > 0 ? "stressed" : "happy";
  const bubble = overloaded.length > 0
    ? `Có ${overloaded.length} bạn đang quá tải ở tháng cao điểm! Bấm vào từng người xem chi tiết 💪`
    : `Cả đội đang cân đối! Cứ giữ nhịp này là về đích VMP êm ru ✨`;
  const legend = [["Nhẹ", C.mint], ["Vừa", C.sky], ["Sắp đầy", C.marigold], ["Quá tải", C.rasp]];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {detail && <WorkloadDetailModal detail={detail} onClose={() => setDetail(null)} />}
      <Card variant="strong" style={{ background: `linear-gradient(120deg,#fff,${C.pinkMist})` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div style={{ flexShrink: 0 }}><Mascot mood={mood} size={96} /></div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="pop" key={mood} style={{ background: "#fff", border: `1.5px solid ${C.pinkSoft}`, borderRadius: 18, padding: "12px 16px", fontFamily: TEXT, fontSize: 14, color: C.plum, fontWeight: 700, lineHeight: 1.5 }}>{bubble}</div>
            <div style={{ fontSize: 12.5, color: C.plumSoft, marginTop: 8, fontWeight: 700 }}>Còn lại: <b style={{ color: C.lavText }}>{totalCong} ngày công</b> · <b style={{ color: C.pinkText }}>{totalHoso} hồ sơ</b> · <b style={{ color: C.mintText }}>{people.length} người</b></div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 16 }}>
          <div><div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 800, marginBottom: 7 }}>KHUNG THỜI GIAN</div><div style={{ display: "flex", gap: 7 }}><Btn on={scope === "month"} onClick={() => setScope("month")}>Tháng</Btn><Btn on={scope === "quarter"} onClick={() => setScope("quarter")}>Quý</Btn><Btn on={scope === "year"} onClick={() => setScope("year")}>Năm</Btn></div></div>
          <div><div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 800, marginBottom: 7 }}>TÔ THEO</div><div style={{ display: "flex", gap: 7 }}><Btn on={metric === "cong"} onClick={() => setMetric("cong")}>Ngày công</Btn><Btn on={metric === "hoso"} onClick={() => setMetric("hoso")}>Hồ sơ</Btn></div></div>
        </div>
      </Card>

      {/* Capacity cards */}
      <Card variant="strong">
        <CardTitle icon={Activity} sub="Thanh = tháng bận nhất so với ngưỡng · bấm vào thẻ để xem chi tiết">Sức tải từng người</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(262px,1fr))", gap: 14 }}>
          {people.map((p) => {
            const pk = peakMonth(p); const ratio = CAP_MONTH > 0 ? pk.eff / CAP_MONTH : 0;
            const band = ratio > 1 ? { l: "Quá tải", c: C.rasp, t: C.raspText, bg: C.raspSoft, e: "😵" } : ratio >= 0.6 ? { l: "Khá bận", c: C.marigold, t: C.marigoldText, bg: C.marigoldSoft, e: "🔥" } : { l: "Thong thả", c: C.mint, t: C.mintText, bg: C.mintSoft, e: "🌿" };
            return (
              <button key={p.name} className="rise" onClick={() => openDetail(`Việc còn lại của ${p.name}`, p.months.flatMap((m) => m.tasks))} style={{ textAlign: "left", cursor: "pointer", background: "#fff", border: `1.5px solid ${C.pinkSoft}`, borderRadius: 18, padding: 15, fontFamily: TEXT }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 999, background: GRAD, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontFamily: NUM, fontSize: 17, flexShrink: 0 }}>{p.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 15, color: C.plum }}>{p.name}</div><div style={{ fontSize: 11, color: C.plumSoft, fontWeight: 700 }}>{p.count} hạng mục</div></div>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: band.t, background: band.bg, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>{band.e} {band.l}</span>
                </div>
                <div style={{ display: "flex", gap: 9, marginBottom: 12 }}>
                  <div style={{ flex: 1, background: C.lavSoft, borderRadius: 12, padding: "9px 11px" }}><div style={{ fontFamily: NUM, fontWeight: 800, fontSize: 21, color: C.lavText, lineHeight: 1 }}>{p.congTotal}</div><div style={{ fontSize: 10.5, color: C.plumSoft, fontWeight: 700, marginTop: 2 }}>ngày công</div></div>
                  <div style={{ flex: 1, background: C.pinkSoft, borderRadius: 12, padding: "9px 11px" }}><div style={{ fontFamily: NUM, fontWeight: 800, fontSize: 21, color: C.pinkText, lineHeight: 1 }}>{p.hosoTotal}</div><div style={{ fontSize: 10.5, color: C.plumSoft, fontWeight: 700, marginTop: 2 }}>hồ sơ</div></div>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: C.pinkSoft, overflow: "hidden" }}><div style={{ height: "100%", width: clamp(ratio, 0, 1) * 100 + "%", background: band.c, borderRadius: 999, transition: "width .9s ease" }} /></div>
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {p.critCao > 0 && <Tag color={C.raspText} bg={C.raspSoft}>{p.critCao} trọng yếu cao</Tag>}
                  {p.over > 0 && <Tag color={C.marigoldText} bg={C.marigoldSoft}>{p.over} quá hạn</Tag>}
                  <span style={{ marginLeft: "auto", fontSize: 11, color: C.pinkText, fontWeight: 800 }}>Xem →</span>
                </div>
              </button>
            );
          })}
          {people.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 28, color: C.mintText, fontWeight: 700 }}>🎉 Không còn hạng mục nào chưa chốt VMP!</div>}
        </div>
      </Card>

      {/* Matrix */}
      <Card variant="strong">
        <CardTitle icon={BarChart3} right={<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{legend.map(([l, c]) => <span key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.plum, fontWeight: 700 }}><span style={{ width: 12, height: 12, borderRadius: 4, background: c }} />{l}</span>)}</div>} sub={`Mỗi ô = ${metric === "cong" ? "ngày công" : "hồ sơ"} · bấm vào ô để xem`}>Ma trận · Người × {scope === "month" ? "Tháng" : scope === "quarter" ? "Quý" : "Năm"}</CardTitle>
        <div style={{ overflowX: "auto" }} className="vmp-scroll">
          <table style={{ borderCollapse: "separate", borderSpacing: 5, minWidth: scope === "month" ? 880 : 440 }}>
            <thead><tr>
              <th style={{ textAlign: "left", fontSize: 11, color: C.plumSoft, fontWeight: 800, padding: "0 8px 8px", position: "sticky", left: 0, background: "#fff" }}>NGƯỜI</th>
              {cols.map((c, ci) => { const isNow = scope === "month" && ci === vmpToday().getMonth(); return <th key={c} style={{ fontSize: 11, fontWeight: 800, color: isNow ? C.pinkText : C.plumSoft, padding: "0 4px 8px", minWidth: 54 }}>{c}{isNow ? " •" : ""}</th>; })}
              <th style={{ fontSize: 11, fontWeight: 800, color: C.plum, padding: "0 6px 8px" }}>TỔNG</th>
            </tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.name}>
                  <td style={{ padding: "4px 8px", position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 26, height: 26, borderRadius: 999, background: GRAD, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontFamily: NUM, fontSize: 12, flexShrink: 0 }}>{p.name[0]}</div><span style={{ fontFamily: TEXT, fontSize: 13, fontWeight: 800, color: C.plum, whiteSpace: "nowrap" }}>{p.name}</span></div>
                  </td>
                  {cols.map((c, ci) => {
                    const v = valIn(p, ci); const tasks = tasksIn(p, ci);
                    if (v <= 0) return <td key={ci} style={{ textAlign: "center" }}><div style={{ height: 42, borderRadius: 10, background: C.pinkMist }} /></td>;
                    const st = heat(v, cap);
                    return <td key={ci} style={{ textAlign: "center" }}>
                      <div onClick={() => openDetail(`${p.name} · ${c}`, tasks)} style={{ height: 42, borderRadius: 10, background: st.bg, border: `1px solid ${st.text}33`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 15, color: st.text, lineHeight: 1 }}>{v}</span>
                        <span style={{ fontSize: 8.5, color: st.text, fontWeight: 700, opacity: .85 }}>{metric === "cong" ? "nc" : "hồ sơ"}</span>
                      </div>
                    </td>;
                  })}
                  <td style={{ textAlign: "center" }}>
                    <div style={{ height: 42, borderRadius: 10, background: peakMonth(p).eff > CAP_MONTH ? C.raspSoft : C.lavSoft, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 15, color: peakMonth(p).eff > CAP_MONTH ? C.raspText : C.lavText, lineHeight: 1 }}>{metric === "cong" ? p.congTotal : p.hosoTotal}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Focus */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 24 }}>
        <Card variant="soft">
          <CardTitle icon={ShieldAlert} sub="Theo mức trọng yếu">Phân bố trọng yếu</CardTitle>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <Donut size={132} segments={[{ value: critCount.Cao, color: C.rasp }, { value: critCount.TB, color: C.marigold }, { value: critCount["Thấp"], color: C.mint }]} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              {[["Cao", C.rasp, C.raspText], ["TB", C.marigold, C.marigoldText], ["Thấp", C.mint, C.mintText]].map(([k, c, t]) => <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: C.plum }}><span style={{ width: 11, height: 11, borderRadius: 999, background: c }} />TY {k}</span><span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 16, color: t }}>{critCount[k] || 0}</span></div>)}
            </div>
          </div>
        </Card>
        <Card variant="strong">
          <CardTitle icon={Flag} sub="Trọng yếu cao / ≥ 7 — ưu tiên">Cần tập trung</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {focus.map(({ a, sc }) => <div key={a.id} className="vmp-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 13, background: "#fff", border: `1px solid ${C.raspSoft}` }}>
              <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 13, color: "#fff", background: sc >= 7 ? C.raspText : C.marigoldText, width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{sc}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}><Tag color={C.lavText} bg={C.lavSoft}>{a.vtype}</Tag><span style={{ fontFamily: TEXT, fontSize: 13, fontWeight: 800, color: C.plum }}>{a.name}</span></div>
                <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600, marginTop: 1 }}>{a.owner} · đích {a.target ? fmtVN(parseD(a.target)) : "—"}</div>
              </div>
              <Pill s={a.st} small />
            </div>)}
            {focus.length === 0 && <div style={{ textAlign: "center", padding: 22, color: C.mintText, fontWeight: 700 }}>Không còn trọng yếu cao 🎉</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

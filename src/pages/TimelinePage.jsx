/* TimelinePage.jsx — Gantt Timeline VMP */
import { useState, useMemo } from "react";
import { GanttChartSquare, Filter, Search, FileText, CalendarClock } from "lucide-react";
import { C, TEXT, NUM, GRAD } from "../constants/theme.js";
import { CLS, DEPTS, CRIT, MONTHS, PHASE_COLOR, STAGES, VMP_TODAY } from "../constants/vmp.js";
import { parseD, fmtVN, pctYear, milestones, phaseStates, daysBetween, addMonths } from "../utils/helpers.js";
import { useDebounce } from "../hooks/index.js";
import { Card, CardTitle, Tag, Modal, Sel, Pill, phaseTag } from "../components/ui/Primitives.jsx";
import { PROG } from "../constants/vmp.js";

function GanttRow({ a, idx, onOpen }) {
  const ps = phaseStates(a), m = ps.m;
  const x0 = pctYear(m.protocol), xV = pctYear(m.validation), xR = pctYear(m.report), xT = pctYear(m.target);
  const span = (xT - x0) || 1;
  const a1 = ((xV - x0) / span) * 100, a2 = ((xR - x0) / span) * 100;
  const cls = CLS[a.cls];
  const over = a.st === "over";
  const seg = (lp, rp, status, label) => (rp - lp) > 0.5 ? <div title={label} style={{ position: "absolute", left: lp + "%", width: (rp - lp) + "%", top: 0, bottom: 0, background: PHASE_COLOR[status], opacity: status === "future" ? 0.5 : 0.95, borderRadius: 5, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.55)" }} /> : null;
  const runPct = ps.r === "done" ? 100 : ps.v === "done" ? a2 : ps.p === "done" ? a1 : (PROG[a.st] || 8) * 0.3;
  const runner = a.st === "done" ? "🏆" : over ? "🐢" : "🏃";
  return (
    <div className="vmp-row" onClick={() => onOpen && onOpen(a)} title="Bấm để xem chi tiết" style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderRadius: 10, cursor: "pointer", background: over ? "rgba(225,75,120,.07)" : (idx % 2 ? "rgba(255,255,255,.5)" : "transparent") }}>
      <div style={{ width: 188, flexShrink: 0, paddingLeft: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Tag color={cls.text} bg={cls.soft}>{a.vtype}</Tag><span style={{ fontFamily: "monospace", fontSize: 11.5, fontWeight: 700, color: C.plumSoft }}>{a.code}</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}><Pill s={a.st} small /><span style={{ fontSize: 11.5, color: C.plum, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 92 }}>{a.name}</span></div>
      </div>
      <div style={{ flex: 1, position: "relative", height: 30, minWidth: 220 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 8, background: "rgba(78,42,78,.05)" }} />
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => <div key={i} style={{ position: "absolute", left: (i / 12) * 100 + "%", top: 0, bottom: 0, width: 1, background: C.line }} />)}
        <div style={{ position: "absolute", left: x0 + "%", width: span + "%", top: 6, bottom: 6 }}>
          {seg(0, a1, ps.p, "① Đề cương (T-60)")}
          {seg(a1, a2, ps.v, "② Thẩm định thực tế")}
          {seg(a2, 100, ps.r, "③ Báo cáo (T-5)")}
          <span style={{ position: "absolute", left: runPct + "%", top: "50%", transform: "translate(-50%,-50%)", width: 22, height: 22, borderRadius: 999, background: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, zIndex: 4 }}>{runner}</span>
        </div>
        <span style={{ position: "absolute", left: xT + "%", top: "50%", transform: "translate(-50%,-50%)", fontSize: 15, zIndex: 3, filter: "drop-shadow(0 1px 2px rgba(0,0,0,.25))" }}>🏁</span>
      </div>
      <div style={{ width: 96, flexShrink: 0, textAlign: "right", paddingRight: 4 }}><div style={{ fontFamily: NUM, fontSize: 12.5, fontWeight: 800, color: over ? C.raspText : C.plum }}>{fmtVN(m.target)}</div><div style={{ fontSize: 10.5, color: C.plumSoft, fontWeight: 600 }}>đích VMP</div></div>
    </div>
  );
}

function ActivityDetailModal({ a, onClose }) {
  if (!a) return null;
  const r = a._raw || {};
  const m = a.m || milestones(a);
  const cls = CLS[a.cls] || CLS.tb;
  const dp = DEPTS.find((d) => d.id === a.dept);
  const ct = CRIT[a.crit] || CRIT.TB;
  const dShow = (v) => { const t = String(v == null ? "" : v).trim(); return t || "—"; };
  const has = (v) => String(v == null ? "" : v).trim() !== "";
  const info = [
    ["Phân loại", cls.label], ["Bộ phận", dp ? dp.name : dShow(r.bo_phan)], ["Line", dShow(r.line)],
    ["Khu vực", dShow(r.khu_vuc)], ["Tình trạng", dShow(r.tinh_trang)], ["Tần suất", has(r.tan_suat) ? dShow(r.tan_suat) + " tháng" : "—"],
    ["PL báo cáo", dShow(a.dep)], ["Ngày công", a.effort != null ? String(a.effort) : "—"], ["Điểm trọng yếu", a.score != null ? a.score + " / 9" : "—"],
  ];
  const phases = [
    { ic: "📝", label: "Đề cương", note: "Hạn T‑60", dl: has(r.dl_de_cuong) ? dShow(r.dl_de_cuong) : fmtVN(m.protocol), act: r.ngay_de_cuong, st: r.tt_de_cuong },
    { ic: "🔬", label: "Thẩm định thực tế", note: "Hạn T‑5‑BC", dl: has(r.dl_tham_dinh) ? dShow(r.dl_tham_dinh) : fmtVN(m.validation), act: r.ngay_tham_dinh, st: r.tt_tham_dinh, sched: r.lich_td },
    { ic: "📄", label: "Báo cáo", note: "Hạn T‑5", dl: has(r.dl_bao_cao) ? dShow(r.dl_bao_cao) : fmtVN(m.report), act: r.ngay_bao_cao, st: r.tt_bao_cao },
    { ic: "🏁", label: "Hoàn tất VMP", note: "Đích VMP (T)", dl: has(r.dl_vmp) ? dShow(r.dl_vmp) : fmtVN(m.target), act: r.ngay_vmp, st: r.tt_vmp },
  ];
  return (
    <Modal onClose={onClose} title="Chi tiết hạng mục" icon={FileText} wide>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: cls.text, background: cls.soft, padding: "4px 10px", borderRadius: 9 }}>{a.code}</span>
        <Tag color={cls.text} bg={cls.soft}>{a.vtype}</Tag>
        <Tag color={ct.text} bg={ct.soft}>Rủi ro {a.crit}</Tag>
        <Pill s={a.st} small />
      </div>
      <div style={{ fontFamily: TEXT, fontSize: 18, fontWeight: 800, color: C.plum, marginBottom: 16 }}>{a.name}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9, marginBottom: 14 }}>
        {info.map(([k, v]) => <div key={k} style={{ background: "#fff", borderRadius: 11, padding: "8px 11px" }}><div style={{ fontSize: 10, color: C.plumSoft, fontWeight: 800, textTransform: "uppercase", letterSpacing: .3 }}>{k}</div><div style={{ fontSize: 13.5, color: C.plum, fontWeight: 700, marginTop: 2 }}>{v}</div></div>)}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 190, background: C.pinkSoft, borderRadius: 12, padding: "10px 13px" }}><div style={{ fontSize: 10, color: C.pinkText, fontWeight: 800, textTransform: "uppercase" }}>QA phụ trách</div><div style={{ fontSize: 14, color: C.plum, fontWeight: 800, marginTop: 2 }}>{dShow(r.qa)}</div>{has(r.email_qa) && <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600 }}>{r.email_qa}</div>}</div>
        <div style={{ flex: 1, minWidth: 190, background: C.lavSoft, borderRadius: 12, padding: "10px 13px" }}><div style={{ fontSize: 10, color: C.lavText, fontWeight: 800, textTransform: "uppercase" }}>NS bộ phận khác</div><div style={{ fontSize: 14, color: C.plum, fontWeight: 800, marginTop: 2 }}>{dShow(r.ns_khac)}</div>{has(r.email_khac) && <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600 }}>{r.email_khac}</div>}</div>
      </div>
      <div style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plum, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}><CalendarClock size={17} color={C.pink} /> Vòng đời thẩm định</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {phases.map((p, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "11px 14px", borderLeft: `4px solid ${has(p.act) ? C.mint : C.pinkSoft}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ fontSize: 18 }}>{p.ic}</span><div><div style={{ fontSize: 14, fontWeight: 800, color: C.plum }}>{p.label}</div><div style={{ fontSize: 10.5, color: C.plumSoft, fontWeight: 600 }}>{p.note}</div></div></div>
              {phaseTag(p.st)}
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 8, flexWrap: "wrap", fontSize: 12.5 }}>
              <span style={{ color: C.plumSoft, fontWeight: 600 }}>Hạn: <b style={{ color: C.plum }}>{dShow(p.dl)}</b></span>
              <span style={{ color: C.plumSoft, fontWeight: 600 }}>Thực tế: <b style={{ color: has(p.act) ? C.mintText : "#C9B6C7" }}>{dShow(p.act)}</b></span>
              {p.sched != null && has(p.sched) && <span style={{ color: C.plumSoft, fontWeight: 600 }}>Lịch xếp: <b style={{ color: C.plum }}>{dShow(p.sched)}</b></span>}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default function TimelineView({ acts }) {
  const [cls, setCls] = useState("all"); const [dept, setDept] = useState("all"); const [q, setQ] = useState(""); const [detail, setDetail] = useState(null);
  const dq = useDebounce(q, 300);
  const filtered = useMemo(() => acts.filter((a) => {
    if (!a.target) return false;
    if (cls !== "all" && a.cls !== cls) return false;
    if (dept !== "all" && a.dept !== dept) return false;
    if (dq.trim()) { const s = dq.trim().toLowerCase(); if (![a.code, a.name, a.owner, a.id, a.vtype].some((x) => String(x || "").toLowerCase().includes(s))) return false; }
    return true;
  }).sort((x, y) => parseD(x.target) - parseD(y.target)), [acts, cls, dept, dq]);
  const todayX = pctYear(VMP_TODAY);
  const SelLocal = ({ val, set, opts }) => <select value={val} onChange={(e) => set(e.target.value)} style={{ borderRadius: 12, padding: "9px 14px", fontFamily: TEXT, fontSize: 13, color: C.plum, fontWeight: 700, cursor: "pointer", outline: "none", background: "rgba(255,255,255,.86)", border: `1.5px solid ${C.pinkSoft}` }}>{opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>;
  const legend = [["done", "Hoàn thành"], ["current", "Đang/tới hạn"], ["over", "Quá hạn"], ["future", "Kế hoạch"]];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.plumSoft }}><Filter size={15} /> <span style={{ fontSize: 13, fontWeight: 800 }}>Lọc:</span></div>
          <SelLocal val={cls} set={setCls} opts={[{ v: "all", l: "Tất cả nhóm" }].concat(Object.keys(CLS).map((k) => ({ v: k, l: CLS[k].label })))} />
          <SelLocal val={dept} set={setDept} opts={[{ v: "all", l: "Tất cả bộ phận" }].concat(DEPTS.map((d) => ({ v: d.id, l: d.name })))} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 13px", borderRadius: 12, border: `1.5px solid ${C.pinkSoft}`, background: "#fff", flex: 1, minWidth: 200 }}><Search size={15} color={C.pink} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo mã, tên, QA, ID…" style={{ border: "none", outline: "none", background: "transparent", fontFamily: TEXT, fontSize: 13.5, color: C.plum, width: "100%", fontWeight: 600 }} /></div>
          {(cls !== "all" || dept !== "all" || q.trim()) && <button onClick={() => { setCls("all"); setDept("all"); setQ(""); }} style={{ padding: "8px 13px", borderRadius: 999, border: "none", cursor: "pointer", background: C.raspSoft, color: C.raspText, fontFamily: TEXT, fontWeight: 800, fontSize: 12.5 }}>✕ Xoá lọc</button>}
        </div>
        <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 14, background: C.pinkMist, display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: C.plum }}>🏁 Cách đọc — mỗi hạng mục chạy từ trái sang đích VMP:</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 800 }}>Màu chặng:</span>
            {legend.map(([k, l]) => <span key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.plum, fontWeight: 700 }}><span style={{ width: 14, height: 9, borderRadius: 3, background: PHASE_COLOR[k], opacity: k === "future" ? .55 : .92 }} />{l}</span>)}
          </div>
        </div>
      </Card>
      <Card variant="strong">
        <CardTitle icon={GanttChartSquare} sub={`${filtered.length} hạng mục · Năm ${VMP_TODAY.getFullYear()}`}>🏁 Đường đua thẩm định VMP</CardTitle>
        <div style={{ overflowX: "auto" }} className="vmp-scroll">
          <div style={{ minWidth: 760 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 188, flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", minWidth: 220 }}>{MONTHS.map((mm) => <div key={mm} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: 800, color: C.plumSoft }}>{mm}</div>)}</div>
              <div style={{ width: 96, flexShrink: 0 }} />
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: `calc(198px + (100% - 304px) * ${todayX / 100})`, top: -2, bottom: 0, width: 2, background: C.raspText, zIndex: 5 }}>
                <span style={{ position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)", fontSize: 9.5, fontWeight: 800, color: "#fff", background: C.raspText, padding: "1px 6px", borderRadius: 6, whiteSpace: "nowrap" }}>Hôm nay</span>
              </div>
              {filtered.map((a, i) => <GanttRow key={a.id} a={a} idx={i} onOpen={setDetail} />)}
              {filtered.length === 0 && <div style={{ textAlign: "center", padding: "40px 0", color: C.plumSoft, fontWeight: 700 }}>Không có hạng mục nào khớp bộ lọc.</div>}
            </div>
          </div>
        </div>
      </Card>
      <ActivityDetailModal a={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

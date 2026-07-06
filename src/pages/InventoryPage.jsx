/* InventoryPage.jsx — Danh mục đối tượng thẩm định 5 nhóm */
import { useState, useMemo } from "react";
import { Boxes, Search, Plus, Pencil, Trash2, Save, Filter, CheckCircle2 } from "lucide-react";
import { C, TEXT, NUM, GRAD, btnPrimary, INP, FIELD, LBL } from "../constants/theme.js";
import { CLS, DEPTS, CRIT } from "../constants/vmp.js";
import { objStatus } from "../utils/helpers.js";
import { Card, CardTitle, Tag, Modal, Pill } from "../components/ui/Primitives.jsx";

function EditObjModal({ obj, isNew, onClose, onSave }) {
  const [f, setF] = useState(obj);
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const sel = (k, opts) => <select value={f[k]} onChange={(e) => up(k, e.target.value)} style={INP}>{opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>;
  return (
    <Modal onClose={onClose} title={isNew ? "Thêm đối tượng" : "Sửa đối tượng"} icon={Pencil} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={FIELD}><span style={LBL}>Mã đối tượng</span><input style={{ ...INP, background: isNew ? "#fff" : C.pinkSoft }} value={f.code} disabled={!isNew} onChange={(e) => up("code", e.target.value)} /></div>
        <div style={FIELD}><span style={LBL}>Nhóm</span>{sel("cls", Object.keys(CLS).map((k) => ({ v: k, l: CLS[k].label })))}</div>
        <div style={{ ...FIELD, gridColumn: "1 / -1" }}><span style={LBL}>Tên đối tượng</span><input style={INP} value={f.name} onChange={(e) => up("name", e.target.value)} /></div>
        <div style={FIELD}><span style={LBL}>Bộ phận</span>{sel("dept", DEPTS.map((d) => ({ v: d.id, l: d.name })))}</div>
        <div style={FIELD}><span style={LBL}>Khu vực</span><input style={INP} value={f.area} onChange={(e) => up("area", e.target.value)} /></div>
        <div style={FIELD}><span style={LBL}>Mức ảnh hưởng</span>{sel("crit", [{ v: "Cao", l: "Cao" }, { v: "TB", l: "Trung bình" }, { v: "Thấp", l: "Thấp" }])}</div>
        <div style={FIELD}><span style={LBL}>Tần suất (tháng)</span><input type="number" style={INP} value={f.freq} onChange={(e) => up("freq", Number(e.target.value))} /></div>
        <div style={{ ...FIELD, gridColumn: "1 / -1" }}><span style={LBL}>Lý do / ghi chú</span><textarea rows={3} style={{ ...INP, resize: "vertical", fontWeight: 500 }} value={f.reason} onChange={(e) => up("reason", e.target.value)} /></div>
      </div>
      <button onClick={() => { if (!f.code || !f.name) return; onSave({ ...f, need: f.need === true || f.need === "true" }, isNew); }} style={{ ...btnPrimary, marginTop: 18, padding: "13px", borderRadius: 14, fontSize: 14.5, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Save size={17} /> Lưu & đồng bộ</button>
    </Modal>
  );
}

export default function InventoryView({ objects, acts, canEdit, onSave, onDelete, conn }) {
  const [q, setQ] = useState(""); const [cls, setCls] = useState("all"); const [edit, setEdit] = useState(null);
  const [dept, setDept] = useState("all"); const [person, setPerson] = useState(""); const [pscope, setPscope] = useState("all");
  const ownerMap = useMemo(() => {
    const m = {};
    acts.forEach((a) => { const r = a._raw || {}; if (!m[a.code]) m[a.code] = { qa: new Set(), other: new Set() }; const qa = (r.qa || a.owner || "").trim(); const ot = (r.ns_khac || "").trim(); if (qa) m[a.code].qa.add(qa); if (ot) m[a.code].other.add(ot); });
    return m;
  }, [acts]);
  const matchPerson = (code) => {
    if (!person.trim()) return true;
    const p = person.trim().toLowerCase();
    const o = ownerMap[code] || { qa: new Set(), other: new Set() };
    const inQa = [...o.qa].some((x) => x.toLowerCase().includes(p));
    const inOther = [...o.other].some((x) => x.toLowerCase().includes(p));
    return pscope === "qa" ? inQa : pscope === "other" ? inOther : (inQa || inOther);
  };
  const filtered = useMemo(() => objects.filter((o) => (o.name + o.code).toLowerCase().includes(q.toLowerCase()) && (cls === "all" || o.cls === cls) && (dept === "all" || o.dept === dept) && matchPerson(o.code)), [objects, q, cls, dept, person, pscope, ownerMap]);
  const counts = Object.keys(CLS).reduce((m, k) => { m[k] = objects.filter((o) => o.cls === k).length; return m; }, {});
  const ClsTab = ({ id, label, n }) => <button onClick={() => setCls(id)} style={{ padding: "8px 14px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: TEXT, fontSize: 12.5, fontWeight: 800, background: cls === id ? GRAD : C.pinkSoft, color: cls === id ? "#fff" : C.plumSoft, display: "flex", alignItems: "center", gap: 7 }}>{label}<span style={{ fontFamily: NUM, fontSize: 12, padding: "0 6px", borderRadius: 999, background: cls === id ? "rgba(255,255,255,.25)" : "#fff", color: cls === id ? "#fff" : C.plumSoft }}>{n}</span></button>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {edit && <EditObjModal {...edit} onClose={() => setEdit(null)} onSave={(o, isNew) => { onSave(o, isNew); setEdit(null); }} />}
      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <ClsTab id="all" label="Tất cả" n={objects.length} />
          {Object.keys(CLS).map((k) => <ClsTab key={k} id={k} label={CLS[k].label} n={counts[k]} />)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 15px", borderRadius: 12, border: `1.5px solid ${C.pinkSoft}`, flex: 1, minWidth: 220, background: "#fff" }}><Search size={16} color={C.pink} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên hoặc mã…" style={{ border: "none", outline: "none", background: "transparent", fontFamily: TEXT, fontSize: 14, color: C.plum, width: "100%", fontWeight: 600 }} /></div>
          {canEdit ? (
            <button onClick={() => setEdit({ obj: { code: "", name: "", cls: "tb", dept: "sx", area: "", grade: "—", gxp: "GxP", crit: "TB", freq: 12, need: true, reason: "" }, isNew: true })} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 12, border: "none", cursor: "pointer", background: GRAD, color: "#fff", fontFamily: TEXT, fontWeight: 800, fontSize: 13 }}><Plus size={15} /> Thêm đối tượng</button>
          ) : (
            <Tag color={C.lavText} bg={C.lavSoft}>Chỉ đọc · chỉnh sửa trên Google Sheet</Tag>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Filter size={15} color={C.plumSoft} /><span style={{ fontSize: 12.5, fontWeight: 800, color: C.plumSoft }}>Bộ phận:</span>
            <select value={dept} onChange={(e) => setDept(e.target.value)} style={{ ...INP, width: "auto", cursor: "pointer", padding: "8px 12px" }}><option value="all">Tất cả</option>{DEPTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </div>
        </div>
      </Card>
      <Card variant="strong">
        <CardTitle icon={Boxes} sub={`${filtered.length} đối tượng — nguồn chuẩn Google Sheet`}>Danh mục đối tượng thẩm định</CardTitle>
        <div style={{ overflowX: "auto" }} className="vmp-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, minWidth: 880 }}>
            <thead><tr>{["Mã", "Tên / Lý do", "Nhóm", "Bộ phận", "Phụ trách", "Khu vực", "Mức ĐH", "Chu kỳ", "TĐ?", "Trạng thái", ""].map((h, i) => <th key={i} style={{ textAlign: i >= 2 && i <= 9 ? "center" : "left", fontSize: 11, color: C.plumSoft, fontWeight: 800, letterSpacing: 0.5, padding: "0 12px 13px", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>{filtered.map((o, i) => { const cl = CLS[o.cls]; const dp = DEPTS.find((d) => d.id === o.dept); const st = objStatus(o.code, acts); const ct = CRIT[o.crit] || CRIT.TB; const ow = ownerMap[o.code] || { qa: new Set(), other: new Set() }; const qaList = [...ow.qa].join(", "); return (
              <tr key={o.code} className="vmp-row" style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: "13px 12px" }}><span style={{ fontFamily: "monospace", fontSize: 12.5, fontWeight: 700, color: cl.text, background: cl.soft, padding: "3px 8px", borderRadius: 8 }}>{o.code}</span></td>
                <td style={{ padding: "13px 12px", maxWidth: 280 }}><div style={{ fontSize: 13.5, color: C.plum, fontWeight: 700 }}>{o.name}</div>{o.reason && <div style={{ fontSize: 11.5, color: C.plumSoft, marginTop: 2, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280 }}>{o.reason}</div>}</td>
                <td style={{ padding: "13px 12px", textAlign: "center" }}><Tag color={cl.text} bg={cl.soft}>{cl.label}</Tag></td>
                <td style={{ padding: "13px 12px", textAlign: "center", fontSize: 13, color: C.plumSoft, fontWeight: 700 }}>{dp ? dp.short : "—"}</td>
                <td style={{ padding: "13px 12px", textAlign: "center", fontSize: 12.5, fontWeight: 700, color: C.plum }}>{qaList || "—"}</td>
                <td style={{ padding: "13px 12px", textAlign: "center", fontSize: 13, color: C.plumSoft, fontWeight: 700 }}>{o.area}</td>
                <td style={{ padding: "13px 12px", textAlign: "center" }}><Tag color={ct.text} bg={ct.soft}>{o.crit}</Tag></td>
                <td style={{ padding: "13px 12px", textAlign: "center", fontFamily: NUM, fontSize: 14, fontWeight: 800, color: C.plum }}>{o.freq > 0 ? o.freq + " tháng" : "—"}</td>
                <td style={{ padding: "13px 12px", textAlign: "center" }}>{o.need ? <CheckCircle2 size={17} color={C.mintText} /> : <span style={{ color: "#C9B6C7", fontWeight: 700 }}>—</span>}</td>
                <td style={{ padding: "13px 12px", textAlign: "center" }}><Pill s={st} small /></td>
                <td style={{ padding: "13px 12px" }}>
                  {canEdit ? <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button onClick={() => setEdit({ obj: o, isNew: false })} style={{ width: 32, height: 32, borderRadius: 9, border: "none", cursor: "pointer", background: C.lavSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><Pencil size={15} color={C.lavText} /></button>
                    <button onClick={() => { if (window.confirm(`Xoá đối tượng ${o.code}?`)) onDelete(o.code); }} style={{ width: 32, height: 32, borderRadius: 9, border: "none", cursor: "pointer", background: C.raspSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={15} color={C.raspText} /></button>
                  </div> : <span style={{ display: "block", textAlign: "right", color: C.plumSoft, fontSize: 11.5, fontWeight: 700 }}>Từ Sheet</span>}
                </td>
              </tr>
            ); })}</tbody>
          </table>
          {filtered.length === 0 && <div style={{ textAlign: "center", padding: 40, color: C.plumSoft, fontWeight: 600 }}>Không tìm thấy đối tượng.</div>}
        </div>
      </Card>
    </div>
  );
}

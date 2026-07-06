/* =====================================================================
 *  CatalogPage.jsx — Danh mục đối tượng & Tiến độ (gộp Inventory + Update)
 *  ---------------------------------------------------------------------
 *  - Nhóm theo MÃ ĐỐI TƯỢNG, sắp theo mã. Một mã có nhiều loại thẩm định
 *    (OQ/PQ/IQ…) và có thể nhiều lần/năm (tái thẩm định) → gộp về một khối.
 *  - GHI CHƯA kích hoạt: form Cập nhật/Thêm sinh sẵn "payload đúng cột Sheet"
 *    (xem trước) để về sau nối đường ghi ngược Sheet — giữ read-only an toàn.
 * ===================================================================== */
import { useMemo, useState } from "react";
import { Boxes, Search, Filter, Pencil, Plus, ChevronRight, Save, Layers, FileSpreadsheet } from "lucide-react";
import { C, TEXT, NUM, GRAD, btnPrimary, INP, FIELD, LBL } from "../constants/theme.js";
import { CLS, DEPTS, CRIT, TT_OPTS } from "../constants/vmp.js";
import { parseD, fmtVN, txt } from "../utils/helpers.js";
import { toISO } from "../lib/n8nAdapter.js";
import { Card, CardTitle, Tag, Modal, Pill } from "../components/ui/Primitives.jsx";

// Ánh xạ trường sửa → CỘT SHEET chuẩn (index 0-based khớp 37 cột canonical).
const UPDATE_MAP = [
  ["tt_de_cuong", 23, "Trạng thái đề cương"],
  ["ngay_de_cuong", 22, "TG thực tế hoàn thành đề cương"],
  ["lich_td", 26, "Bộ phận xếp lịch thẩm định"],
  ["tt_tham_dinh", 28, "Trạng thái thẩm định thực tế"],
  ["ngay_tham_dinh", 27, "TG thực tế hoàn thành thẩm định"],
  ["tt_bao_cao", 32, "Trạng thái báo cáo"],
  ["ngay_bao_cao", 31, "TG thực tế hoàn thành báo cáo"],
  ["tt_vmp", 35, "Trạng thái VMP"],
  ["ngay_vmp", 34, "TG thực tế Deadline VMP"],
];

const STAGES4 = [
  ["1. Đề cương", "ngay_de_cuong", "tt_de_cuong", "dl_de_cuong"],
  ["2. Thẩm định thực tế", "ngay_tham_dinh", "tt_tham_dinh", "dl_tham_dinh"],
  ["3. Báo cáo", "ngay_bao_cao", "tt_bao_cao", "dl_bao_cao"],
  ["4. Hoàn thành VMP", "ngay_vmp", "tt_vmp", "dl_vmp"],
];

function yearOf(a) {
  const m = String(a.id || "").match(/\/(20\d{2})/);
  if (m) return m[1];
  const d = parseD(a.target);
  return d ? String(d.getFullYear()) : "—";
}

/* ---------- Modal Cập nhật tiến độ (sinh payload, chưa ghi) ---------- */
function UpdateModal({ act, onClose }) {
  const raw = act._raw || {};
  const [f, setF] = useState(() => ({
    ngay_de_cuong: toISO(raw.ngay_de_cuong), tt_de_cuong: raw.tt_de_cuong || "",
    lich_td: toISO(raw.lich_td), ngay_tham_dinh: toISO(raw.ngay_tham_dinh), tt_tham_dinh: raw.tt_tham_dinh || "",
    ngay_bao_cao: toISO(raw.ngay_bao_cao), tt_bao_cao: raw.tt_bao_cao || "",
    ngay_vmp: toISO(raw.ngay_vmp), tt_vmp: raw.tt_vmp || "",
  }));
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const sel = (k) => <select value={f[k]} onChange={set(k)} style={{ ...INP, cursor: "pointer" }}>{TT_OPTS.map((o) => <option key={o} value={o}>{o || "— Chưa nhập —"}</option>)}</select>;
  const dt = (k) => <input type="date" value={f[k] || ""} onChange={set(k)} style={INP} />;

  // Chỉ lấy các ô THỰC SỰ đổi so với dữ liệu gốc → payload ghi Sheet.
  const patch = UPDATE_MAP
    .map(([key, col, label]) => {
      const before = key.startsWith("ngay") || key === "lich_td" ? toISO(raw[key]) : (raw[key] || "");
      const after = f[key] || "";
      return before === after ? null : { key, col, label, before: before || "—", after: after || "—" };
    })
    .filter(Boolean);

  return (
    <Modal onClose={onClose} title="Cập nhật tiến độ" icon={Pencil} wide>
      <div style={{ background: C.lavSoft, borderRadius: 14, padding: "12px 16px", marginBottom: 14 }}>
        <div style={{ fontWeight: 800, color: C.plum, fontSize: 15 }}>{act.code} · {txt(act.name)}</div>
        <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600, marginTop: 3 }}>{txt(act.vtype)} · Năm {yearOf(act)} · ID: {act.id} · QA: {txt(act.owner)}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {STAGES4.map(([title, dCol, tCol, dlKey]) => (
          <div key={tCol} style={{ background: "#fff", borderRadius: 14, padding: 13, border: `1.5px solid ${C.pinkSoft}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
              <span style={{ fontWeight: 800, color: C.plum, fontSize: 13.5 }}>{title}</span>
              <Tag color={C.lavText} bg={C.lavSoft}>Hạn: {toISO(raw[dlKey]) ? fmtVN(parseD(toISO(raw[dlKey]))) : "—"}</Tag>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={FIELD}><span style={LBL}>Ngày hoàn thành thực tế</span>{dt(dCol)}</div>
              <div style={FIELD}><span style={LBL}>Trạng thái</span>{sel(tCol)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Xem trước payload ghi Sheet — CHƯA kích hoạt */}
      <div style={{ marginTop: 16, borderRadius: 14, padding: "12px 14px", background: "#FFF8FB", border: `1px dashed ${C.pink}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 800, color: C.pinkText, marginBottom: 8 }}>
          <FileSpreadsheet size={15} /> Dữ liệu sẽ ghi vào Sheet chính (xem trước · chưa kích hoạt)
        </div>
        {patch.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600 }}>Chưa có thay đổi nào.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {patch.map((p) => (
              <div key={p.key} style={{ fontSize: 12, color: C.plum, fontWeight: 600, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "monospace", color: C.plumSoft }}>Cột&nbsp;{p.col + 1}</span>
                <b>{p.label}:</b>
                <span style={{ color: C.plumSoft }}>{p.before}</span>→<b style={{ color: C.mintText }}>{p.after}</b>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
        <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 13, border: `1.5px solid ${C.pinkSoft}`, background: "#fff", color: C.plumSoft, fontFamily: TEXT, fontWeight: 800, cursor: "pointer" }}>Đóng</button>
        <button disabled title="Đường ghi ngược Sheet sẽ nối về sau" style={{ ...btnPrimary, flex: 2, padding: 12, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: 0.55, cursor: "not-allowed" }}><Save size={16} /> Lưu (chưa kích hoạt ghi)</button>
      </div>
    </Modal>
  );
}

/* ---------- Modal Thêm đối tượng (sinh dòng Sheet, chưa ghi) ---------- */
const NEW_FIELDS = [
  ["phan_loai", 1, "Phân loại đối tượng", "select-cls"],
  ["loai_td", 2, "Loại thẩm định", "text"],
  ["ma", 3, "Mã đối tượng", "text"],
  ["ten", 4, "Tên đối tượng", "text"],
  ["bo_phan", 5, "Bộ phận quản lý", "text"],
  ["khu_vuc", 6, "Mã khu vực", "text"],
  ["line", 7, "Line", "text"],
  ["tan_suat", 11, "Tần suất thẩm định (tháng)", "num"],
  ["phan_loai_bc", 13, "Phân loại báo cáo", "text"],
  ["so_ngay_cong", 14, "Số ngày công", "num"],
  ["diem_trong_yeu", 15, "Điểm trọng yếu (1–9)", "num"],
  ["id", 16, "ID thẩm định", "text"],
  ["dl_de_cuong", 21, "Hạn đề cương", "date"],
  ["dl_vmp", 33, "Hạn hoàn thành (Deadline VMP)", "date"],
];
function AddObjectModal({ onClose }) {
  const [f, setF] = useState({ tan_suat: "12" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const filled = NEW_FIELDS.filter(([k]) => String(f[k] ?? "").trim() !== "");
  return (
    <Modal onClose={onClose} title="Thêm đối tượng thẩm định" icon={Plus} wide>
      <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600, marginBottom: 14 }}>
        Nhập thông tin đối tượng mới. Dữ liệu được sinh sẵn thành <b style={{ color: C.plum }}>một dòng đúng 37 cột Sheet</b> để về sau ghi vào Sheet chính.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
        {NEW_FIELDS.map(([k, col, label, kind]) => (
          <div key={k} style={FIELD}>
            <span style={LBL}>{label}</span>
            {kind === "select-cls"
              ? <select value={f[k] || ""} onChange={set(k)} style={{ ...INP, cursor: "pointer" }}><option value="">— Chọn —</option>{Object.values(CLS).map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}</select>
              : <input type={kind === "date" ? "date" : kind === "num" ? "number" : "text"} value={f[k] || ""} onChange={set(k)} style={INP} placeholder={`Cột ${col + 1}`} />}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, borderRadius: 14, padding: "12px 14px", background: "#FFF8FB", border: `1px dashed ${C.pink}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 800, color: C.pinkText, marginBottom: 8 }}>
          <FileSpreadsheet size={15} /> Dòng Sheet sẽ tạo (xem trước · chưa kích hoạt)
        </div>
        {filled.length === 0
          ? <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600 }}>Chưa nhập trường nào.</div>
          : <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{filled.map(([k, col, label]) => (
              <span key={k} style={{ fontSize: 11.5, fontWeight: 700, color: C.plum, background: "#fff", border: `1px solid ${C.pinkSoft}`, borderRadius: 999, padding: "3px 9px" }}>
                <span style={{ fontFamily: "monospace", color: C.plumSoft }}>C{col + 1}</span> {label}: <b>{f[k]}</b>
              </span>
            ))}</div>}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
        <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 13, border: `1.5px solid ${C.pinkSoft}`, background: "#fff", color: C.plumSoft, fontFamily: TEXT, fontWeight: 800, cursor: "pointer" }}>Đóng</button>
        <button disabled title="Đường ghi ngược Sheet sẽ nối về sau" style={{ ...btnPrimary, flex: 2, padding: 12, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: 0.55, cursor: "not-allowed" }}><Save size={16} /> Thêm (chưa kích hoạt ghi)</button>
      </div>
    </Modal>
  );
}

/* ---------- Trang chính ---------- */
export default function CatalogView({ objects = [], acts = [] }) {
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("all");
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState({});
  const [edit, setEdit] = useState(null);
  const [adding, setAdding] = useState(false);

  // Gom hạng mục theo mã đối tượng.
  const groups = useMemo(() => {
    const byCode = new Map();
    objects.forEach((o) => byCode.set(o.code, { obj: o, items: [] }));
    acts.forEach((a) => {
      if ((a.state || "active") !== "active") return;
      if (!byCode.has(a.code)) byCode.set(a.code, { obj: { code: a.code, name: a.name, cls: a.cls, dept: a.dept, area: "—", crit: a.crit, freq: 0 }, items: [] });
      byCode.get(a.code).items.push(a);
    });
    let list = [...byCode.values()];
    // sắp mỗi nhóm: theo loại thẩm định rồi năm
    list.forEach((g) => g.items.sort((x, y) => String(x.vtype).localeCompare(String(y.vtype), "vi") || String(yearOf(x)).localeCompare(String(yearOf(y)))));
    // lọc
    const needle = q.trim().toLowerCase();
    list = list.filter((g) => {
      const o = g.obj;
      if (cls !== "all" && o.cls !== cls) return false;
      if (dept !== "all" && o.dept !== dept) return false;
      if (status !== "all" && !g.items.some((a) => a.st === status)) return false;
      if (needle) {
        const hay = [o.code, o.name, ...g.items.map((a) => a.vtype), ...g.items.map((a) => a.owner)].map((x) => String(x || "").toLowerCase());
        if (!hay.some((x) => x.includes(needle))) return false;
      }
      return true;
    });
    // sắp theo MÃ đối tượng
    list.sort((a, b) => String(a.obj.code).localeCompare(String(b.obj.code), "vi", { numeric: true }));
    return list;
  }, [objects, acts, q, cls, dept, status]);

  const totalItems = groups.reduce((s, g) => s + g.items.length, 0);
  const toggle = (code) => setOpen((p) => ({ ...p, [code]: !p[code] }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: C.lavSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><Boxes size={22} color={C.lavText} /></div>
            <div>
              <div style={{ fontFamily: TEXT, fontWeight: 900, fontSize: 18, color: C.plum }}>Danh mục đối tượng & Tiến độ</div>
              <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600 }}>Nhóm theo mã đối tượng · mỗi mã nhiều loại thẩm định / lần thẩm định trong năm</div>
            </div>
          </div>
          <button onClick={() => setAdding(true)} style={{ ...btnPrimary, padding: "10px 16px", borderRadius: 12, display: "inline-flex", alignItems: "center", gap: 7 }}><Plus size={16} /> Thêm đối tượng</button>
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Search size={16} color={C.plumSoft} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã, tên, loại thẩm định, QA…" style={{ ...INP, paddingLeft: 36 }} />
          </div>
          <select value={cls} onChange={(e) => setCls(e.target.value)} style={{ ...INP, cursor: "pointer", maxWidth: 180 }}><option value="all">Tất cả nhóm</option>{Object.keys(CLS).map((k) => <option key={k} value={k}>{CLS[k].label}</option>)}</select>
          <select value={dept} onChange={(e) => setDept(e.target.value)} style={{ ...INP, cursor: "pointer", maxWidth: 180 }}><option value="all">Tất cả bộ phận</option>{DEPTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...INP, cursor: "pointer", maxWidth: 170 }}><option value="all">Tất cả tình trạng</option><option value="over">Quá hạn</option><option value="prog">Đang chạy</option><option value="todo">Kế hoạch</option><option value="done">Đã xong</option></select>
        </div>
        <div style={{ marginTop: 10, fontSize: 12.5, color: C.plumSoft, fontWeight: 700 }}>{groups.length} đối tượng · {totalItems} hạng mục thẩm định</div>
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {groups.map((g) => {
          const o = g.obj;
          const cl = CLS[o.cls] || CLS.tb;
          const dp = DEPTS.find((d) => d.id === o.dept);
          const done = g.items.filter((a) => a.st === "done").length;
          const over = g.items.filter((a) => a.st === "over").length;
          const isOpen = open[o.code];
          return (
            <Card key={o.code} style={{ padding: 0, overflow: "hidden" }}>
              <button onClick={() => toggle(o.code)} style={{ width: "100%", textAlign: "left", border: "none", background: isOpen ? C.pinkMist : "#fff", cursor: "pointer", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <ChevronRight size={18} color={C.plumSoft} style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
                <span style={{ fontFamily: NUM, fontWeight: 900, fontSize: 15, color: cl.text, background: cl.soft, padding: "3px 10px", borderRadius: 9, whiteSpace: "nowrap" }}>{o.code}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.plum, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{txt(o.name)}</div>
                  <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>{cl.label} · {dp?.name || o.dept || "—"} · {txt(o.area)}{o.freq > 0 ? ` · chu kỳ ${o.freq} tháng` : ""}</div>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 800, color: C.lavText, background: C.lavSoft, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}><Layers size={13} />{g.items.length} loại TĐ</span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: C.mintText, whiteSpace: "nowrap" }}>{done}/{g.items.length} xong</span>
                {over > 0 && <span style={{ fontSize: 11.5, fontWeight: 800, color: C.raspText, background: C.raspSoft, padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{over} quá hạn</span>}
              </button>

              {isOpen && (
                <div className="vmp-scroll" style={{ overflowX: "auto", borderTop: `1px solid ${C.pinkSoft}` }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, minWidth: 640 }}>
                    <thead><tr style={{ background: "rgba(252,227,239,.4)" }}>
                      {["Loại TĐ", "Năm", "ID", "Deadline VMP", "QA", "Trạng thái", ""].map((h, i) => <th key={i} style={{ textAlign: i >= 5 ? "center" : "left", padding: "9px 14px", fontSize: 11, fontWeight: 800, color: C.plumSoft, whiteSpace: "nowrap" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {g.items.map((a, i) => (
                        <tr key={a.id} style={{ borderTop: `1px solid ${C.pinkSoft}`, background: i % 2 ? "rgba(255,255,255,.5)" : "transparent" }}>
                          <td style={{ padding: "9px 14px" }}><Tag color={C.lavText} bg={C.lavSoft}>{txt(a.vtype)}</Tag></td>
                          <td style={{ padding: "9px 14px", fontFamily: NUM, fontWeight: 800, color: C.plum, fontSize: 12.5 }}>{yearOf(a)}</td>
                          <td style={{ padding: "9px 14px", color: C.plumSoft, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{a.id}</td>
                          <td style={{ padding: "9px 14px", color: C.plumSoft, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>{a.target ? fmtVN(parseD(a.target)) : "—"}</td>
                          <td style={{ padding: "9px 14px", color: C.plumSoft, fontSize: 12.5, fontWeight: 600 }}>{txt(a.owner)}</td>
                          <td style={{ padding: "9px 14px", textAlign: "center" }}><Pill s={a.st} small /></td>
                          <td style={{ padding: "9px 14px", textAlign: "center" }}>
                            <button onClick={() => setEdit(a)} style={{ ...btnPrimary, padding: "6px 12px", borderRadius: 9, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}><Pencil size={12} /> Cập nhật</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })}
        {!groups.length && <Card><div style={{ textAlign: "center", padding: 30, color: C.plumSoft, fontWeight: 600 }}>Không có đối tượng phù hợp bộ lọc.</div></Card>}
      </div>

      <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, padding: "0 4px", lineHeight: 1.6 }}>
        Google Sheet là <b style={{ color: C.mintText }}>nguồn dữ liệu chuẩn duy nhất</b>. Form Cập nhật / Thêm đối tượng đã <b>sinh sẵn payload đúng cột Sheet</b> — đường ghi ngược sẽ được nối về sau (hiện chưa kích hoạt ghi).
      </div>

      {edit && <UpdateModal act={edit} onClose={() => setEdit(null)} />}
      {adding && <AddObjectModal onClose={() => setAdding(false)} />}
    </div>
  );
}

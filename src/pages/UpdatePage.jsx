/* UpdatePage.jsx — Cập nhật tiến độ thực tế */
import { useState, useMemo } from "react";
import { Pencil, Search, Save, Activity } from "lucide-react";
import { C, TEXT, NUM, GRAD, btnPrimary, INP, FIELD, LBL } from "../constants/theme.js";
import { STATUS, CLS, DEPTS, STAGES, PERIODS, TT_OPTS } from "../constants/vmp.js";
import { stageOf, inPeriod, txt } from "../utils/helpers.js";
import { toISO } from "../lib/n8nAdapter.js";
import { supabase } from "../lib/supabaseClient.js";
import { Card, CardTitle, Tag, Modal, Pill, ROField, StateBadge } from "../components/ui/Primitives.jsx";

function ProgressEditModal({ act, isAdmin, onClose, onSave, onChangeState }) {
  const raw = act._raw || {};
  const currentState = act.state || raw.state || "active";
  // Chuẩn hoá trạng thái đang lưu (có thể là enum Supabase: completed/in_progress/
  // not_started/overdue) về đúng nhãn trong dropdown để hiển thị đúng hiện trạng.
  const ttOpt = (v) => {
    const s = String(v == null ? "" : v).toLowerCase().trim();
    if (!s) return "";
    if (/not[_\s-]?started/.test(s) || /\b(chưa|chua|không|khong)\b/.test(s) || /^\s*(chưa|chua)/.test(s) || /overdue/.test(s)) return "Chưa hoàn thành";
    if (/hoàn thành|hoan thanh|done|đạt|complete|completed|xong/.test(s)) return "Hoàn thành";
    if (/đang|dang|progress|in[_\s-]?progress|thực hiện|thuc hien|wip/.test(s)) return "Đang thực hiện";
    if (/kế hoạch|ke hoach|plan/.test(s)) return "Kế hoạch";
    return "";
  };
  const init = {
    ngay_de_cuong: toISO(raw.ngay_de_cuong), tt_de_cuong: ttOpt(raw.tt_de_cuong),
    lich_td: toISO(raw.lich_td) || "",
    ngay_tham_dinh: toISO(raw.ngay_tham_dinh), tt_tham_dinh: ttOpt(raw.tt_tham_dinh),
    ngay_bao_cao: toISO(raw.ngay_bao_cao), tt_bao_cao: ttOpt(raw.tt_bao_cao),
    ngay_vmp: toISO(raw.ngay_vmp), tt_vmp: ttOpt(raw.tt_vmp),
  };
  const [f, setF] = useState(init);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  // S2-7: cần LÝ DO nếu đặt "Hoàn thành" ở bất kỳ giai đoạn nào HOẶC nhập bất kỳ ngày hoàn thành nào.
  const needsReason =
    ["tt_de_cuong", "tt_tham_dinh", "tt_bao_cao", "tt_vmp"].some((k) => f[k] === "Hoàn thành") ||
    ["ngay_de_cuong", "ngay_tham_dinh", "ngay_bao_cao", "ngay_vmp"].some((k) => !!f[k]);
  const handleSave = () => {
    if (needsReason && !reason.trim()) {
      setErr("Cần nhập LÝ DO khi đánh dấu hoàn thành hoặc nhập ngày hoàn thành (yêu cầu GMP).");
      return;
    }
    // onSave = onUpdate(id, patch, userName, reason). userName để trống (server tự lấy theo JWT).
    // (MỚI) gửi version để KHÓA LẠC QUAN — chống ghi đè khi 2 người sửa cùng hạng mục.
    onSave(act.id, f, undefined, reason.trim() || undefined, raw.version);
    onClose();
  };
  const sel = (k) => <select value={f[k]} onChange={set(k)} style={{ ...INP, cursor: "pointer" }}>{TT_OPTS.map((o) => <option key={o} value={o}>{o || "— Chưa nhập —"}</option>)}</select>;
  const dt = (k) => <input type="date" value={f[k]} onChange={set(k)} style={INP} />;
  const stage = (title, dl, dCol, tCol) => (
    <div style={{ background: "#fff", borderRadius: 14, padding: 14, border: `1.5px solid ${C.pinkSoft}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontWeight: 800, color: C.plum, fontSize: 14 }}>{title}</span>
        <Tag color={C.lavText} bg={C.lavSoft}>Deadline: {dl || "Không có thông tin"}</Tag>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={FIELD}><span style={LBL}>Ngày hoàn thành thực tế</span>{dt(dCol)}</div>
        <div style={FIELD}><span style={LBL}>Trạng thái</span>{sel(tCol)}</div>
      </div>
    </div>
  );
  return (
    <Modal onClose={onClose} title="Cập nhật tiến độ" icon={Pencil} wide>
      <div style={{ background: C.lavSoft, borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ fontWeight: 800, color: C.plum, fontSize: 15 }}>{act.code} · {act.name}</div>
        <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600, marginTop: 3 }}>{txt(act.vtype)} · ID: {act.id} · QA: {txt(act.owner)}{act.score != null ? ` · Trọng yếu: ${act.score}/9` : ""}{act.effort != null ? ` · ${act.effort} ngày công` : ""}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <ROField label="Deadline VMP (T) · gốc" value={toISO(raw.dl_vmp) || act.target} />
        <div style={FIELD}><span style={LBL}>Lịch thẩm định (bộ phận xếp)</span><input type="date" value={f.lich_td} onChange={set("lich_td")} style={INP} /></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {stage("1. Đề cương", toISO(raw.dl_de_cuong), "ngay_de_cuong", "tt_de_cuong")}
        {stage("2. Thẩm định thực tế", toISO(raw.dl_tham_dinh), "ngay_tham_dinh", "tt_tham_dinh")}
        {stage("3. Báo cáo", toISO(raw.dl_bao_cao), "ngay_bao_cao", "tt_bao_cao")}
        {stage("4. Tổng kết VMP", "", "ngay_vmp", "tt_vmp")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 14 }}>
        <span style={LBL}>Lý do {needsReason ? <b style={{ color: "#b00020" }}>(bắt buộc)</b> : "(tuỳ chọn)"}</span>
        <textarea value={reason} onChange={(e) => { setReason(e.target.value); if (err) setErr(""); }}
          rows={2} placeholder="VD: Hoàn thành đúng kế hoạch / cập nhật muộn do chờ kết quả QC…"
          style={{ ...INP, resize: "vertical", minHeight: 54 }} />
        {err && <span style={{ color: "#b00020", fontSize: 12.5, fontWeight: 700 }}>{err}</span>}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 13, border: `1.5px solid ${C.pinkSoft}`, background: "#fff", color: C.plumSoft, fontFamily: TEXT, fontWeight: 800, cursor: "pointer" }}>Hủy</button>
        <button onClick={handleSave} style={{ ...btnPrimary, flex: 2, padding: "12px", borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Save size={17} /> Lưu tiến độ</button>
      </div>

      {/* S3-G FIX: phần đổi trạng thái nghiệp vụ — chỉ admin/QA manager */}
      {isAdmin && (
        <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "#FFF5FA", border: `1px dashed ${C.pinkSoft}` }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: C.plumSoft, marginBottom: 8 }}>
            ⚙️ Trạng thái nghiệp vụ (chỉ admin / QA manager)
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>Hiện tại:</span>
            <StateBadge state={currentState} small />
            {currentState === "active" && <span style={{ fontSize: 11, color: C.plumSoft }}>(đang theo dõi bình thường)</span>}
            <div style={{ flex: 1 }} />
            {currentState === "active" ? (
              <>
                <button onClick={() => onChangeState && onChangeState(act.id, "not_applicable")} style={{ padding: "6px 11px", borderRadius: 10, border: `1px solid ${C.lav}`, background: "#fff", color: C.lavText, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>⊘ Không áp dụng</button>
                <button onClick={() => onChangeState && onChangeState(act.id, "cancelled")} style={{ padding: "6px 11px", borderRadius: 10, border: `1px solid ${C.marigold}`, background: "#fff", color: C.marigoldText, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>⊘ Hủy hạng mục</button>
              </>
            ) : (
              <button onClick={() => onChangeState && onChangeState(act.id, "active")} style={{ padding: "6px 11px", borderRadius: 10, border: `1px solid ${C.mint}`, background: "#fff", color: C.mintText, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>↻ Khôi phục Active</button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function UpdateView({ acts, conn, isAdmin, onUpdate, onReload, readOnly = true }) {
  const [q, setQ] = useState("");
  const [fst, setFst] = useState("all");
  const [period, setPeriod] = useState("all");
  const [stageF, setStageF] = useState("all");
  const [edit, setEdit] = useState(null);
  const inWindow = useMemo(() => acts.filter((a) => inPeriod(a, period)), [acts, period]);
  // Tính giai đoạn 1 lần/hạng mục rồi tái dùng (trước đây stageOf chạy ~7 lần/hàng).
  const stageByItem = useMemo(() => {
    const m = new Map();
    inWindow.forEach((a) => m.set(a.id, stageOf(a)));
    return m;
  }, [inWindow]);
  const stageCount = useMemo(() => {
    const c = {}; STAGES.forEach((s) => { c[s.id] = 0; });
    inWindow.forEach((a) => { const st = stageByItem.get(a.id); if (c[st] != null) c[st]++; });
    return c;
  }, [inWindow, stageByItem]);
  const list = useMemo(() => inWindow.filter((a) => {
    if (stageF !== "all" && stageByItem.get(a.id) !== stageF) return false;
    if (fst !== "all" && a.st !== fst) return false;
    if (!q) return true;
    const s = (q || "").toLowerCase();
    return [a.code, a.name, a.owner, a.id, a.vtype].some((x) => String(x || "").toLowerCase().includes(s));
  }), [inWindow, stageByItem, stageF, fst, q]);
  const linked = conn.status === "ok";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: C.mintSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><Pencil size={22} color={C.mintText} /></div>
            <div>
              <div style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 17, color: C.plum }}>Theo dõi tiến độ thực tế</div>
              <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600 }}>Chỉ đọc từ Supabase · chỉnh sửa tại Google Sheet</div>
            </div>
          </div>
          <Tag color={linked ? C.mintText : C.marigoldText} bg={linked ? C.mintSoft : C.marigoldSoft}>{linked ? "● Supabase chỉ đọc" : "○ Chưa kết nối"}</Tag>
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Search size={16} color={C.plumSoft} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo mã, tên, QA…" style={{ ...INP, paddingLeft: 36 }} />
          </div>
          <select value={fst} onChange={(e) => setFst(e.target.value)} style={{ ...INP, cursor: "pointer", maxWidth: 200 }}>
            <option value="all">Tất cả trạng thái</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </Card>
      <Card variant="strong">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <CardTitle icon={Activity} sub="Bấm 1 ô để lọc danh sách">Bản đồ giai đoạn ({inWindow.length})</CardTitle>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PERIODS.map(([id, lb]) => <button key={id} onClick={() => setPeriod(id)} style={{ padding: "7px 13px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: TEXT, fontSize: 12, fontWeight: 800, background: period === id ? GRAD : C.pinkSoft, color: period === id ? "#fff" : C.plumSoft }}>{lb}</button>)}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
          <button onClick={() => setStageF("all")} style={{ textAlign: "left", border: "none", cursor: "pointer", padding: "14px 16px", borderRadius: 16, background: "#fff", boxShadow: stageF === "all" ? `0 0 0 3px ${C.pink}` : `inset 0 0 0 1px ${C.pinkSoft}` }}>
            <div style={{ fontFamily: NUM, fontSize: 26, fontWeight: 800, color: C.plum }}>{inWindow.length}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft, marginTop: 2 }}>Tất cả</div>
          </button>
          {STAGES.map((s) => (
            <button key={s.id} onClick={() => setStageF(s.id)} style={{ textAlign: "left", border: "none", cursor: "pointer", padding: "14px 16px", borderRadius: 16, background: s.bg, boxShadow: stageF === s.id ? `0 0 0 3px ${s.color}` : "none", opacity: stageCount[s.id] === 0 ? 0.55 : 1 }}>
              <div style={{ fontFamily: NUM, fontSize: 26, fontWeight: 800, color: s.color }}>{stageCount[s.id]}</div>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: s.color, marginTop: 2, lineHeight: 1.3 }}>{s.label}</div>
            </button>
          ))}
        </div>
      </Card>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div className="vmp-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, minWidth: 720 }}>
            <thead><tr style={{ background: C.pinkMist }}>
              {["Mã", "Tên", "Loại", "QA", "Deadline", "Giai đoạn", "Trạng thái", ""].map((h, i) => <th key={i} style={{ textAlign: i > 4 ? "center" : "left", padding: "13px 16px", fontSize: 12, fontWeight: 800, color: C.plumSoft, whiteSpace: "nowrap" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {list.map((a, i) => { const sg = STAGES.find((s) => s.id === stageByItem.get(a.id)); const itemState = a.state || (a._raw && a._raw.state) || "active"; const isFrozen = itemState !== "active"; return (
                <tr key={a.id} style={{ borderTop: `1px solid ${C.pinkSoft}`, background: i % 2 ? "rgba(255,255,255,.4)" : "transparent", opacity: isFrozen ? 0.6 : 1 }}>
                  <td style={{ padding: "12px 16px", fontWeight: 800, color: C.plum, fontSize: 13 }}>{a.code}</td>
                  <td style={{ padding: "12px 16px", color: C.plum, fontSize: 13 }}>
                    {a.name}
                    {/* S3-G: badge Không áp dụng / Đã hủy */}
                    {isFrozen && <div style={{ marginTop: 4 }}><StateBadge state={itemState} small /></div>}
                  </td>
                  <td style={{ padding: "12px 16px" }}><Tag color={C.lavText} bg={C.lavSoft}>{a.vtype}</Tag></td>
                  <td style={{ padding: "12px 16px", color: C.plumSoft, fontSize: 13, fontWeight: 600 }}>{txt(a.owner)}</td>
                  <td style={{ padding: "12px 16px", color: C.plumSoft, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{a.target ? a.target.split("-").reverse().join("/") : "—"}</td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>{sg && <Tag color={sg.color} bg={sg.bg}>{sg.label}</Tag>}</td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}><Pill s={a.st} small /></td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <button onClick={() => { if (!readOnly) setEdit(a); }}
                      disabled={readOnly || (isFrozen && !isAdmin)}
                      title={readOnly ? "Google Sheet là nơi chỉnh sửa dữ liệu chuẩn" : "Cập nhật tiến độ"}
                      style={{ ...btnPrimary, padding: "7px 14px", borderRadius: 10, fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6, opacity: readOnly ? 0.55 : 1, cursor: readOnly ? "not-allowed" : "pointer" }}><Pencil size={13} /> {readOnly ? "Chỉ đọc" : (isFrozen ? "Xem/khôi phục" : "Cập nhật")}</button>
                  </td>
                </tr>
              ); })}
              {!list.length && <tr><td colSpan={8} style={{ padding: 30, textAlign: "center", color: C.plumSoft, fontWeight: 600 }}>Không có hạng mục phù hợp.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, padding: "0 4px", lineHeight: 1.6 }}>
        Google Sheet là <b style={{ color: C.mintText }}>nguồn dữ liệu chuẩn duy nhất</b>. Trang này chỉ đọc bản đồng bộ từ Supabase; hãy sửa ngày, trạng thái và danh mục trực tiếp trên Sheet.
      </div>
      {edit && !readOnly && <ProgressEditModal
        act={edit}
        isAdmin={isAdmin}
        onClose={() => setEdit(null)}
        onSave={onUpdate}
        onChangeState={async (id, newState) => {
          // S3-G: gọi RPC rpc_set_item_state (010) — bắt buộc nhập lý do
          if (!supabase) { alert("Supabase chưa cấu hình."); return; }
          const reason = window.prompt(
            newState === "active"
              ? `Lý do KHÔI PHỤC mã ${id} về Active:`
              : newState === "not_applicable"
              ? `Lý do đánh dấu ${id} "Không áp dụng" (vd: thiết bị ngừng dùng):`
              : `Lý do HỦY hạng mục ${id} (vd: theo phê duyệt CAPA #...):`
          );
          if (!reason || !reason.trim()) return;
          try {
            const { data, error } = await supabase.rpc("rpc_set_item_state", {
              p_validation_code: id,
              p_state: newState,
              p_reason: reason.trim(),
            });
            if (error) throw error;
            if (data && data.ok === false) throw new Error(data.error);
            alert(`✓ Đã đổi trạng thái ${id} → ${newState}`);
            setEdit(null);
            if (onReload) onReload();   // (MỚI) tải lại ngay để badge + đếm KPI cập nhật tức thì
          } catch (e) {
            alert("Lỗi đổi trạng thái: " + (e.message || "không rõ"));
          }
        }}
      />}
    </div>
  );
}

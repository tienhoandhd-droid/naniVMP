/* =====================================================================
 *  SourceCatalogPage.jsx — 5 danh mục nguồn, nhập liệu trực tiếp trên web
 *  ---------------------------------------------------------------------
 *  Thay thế việc nhập liệu trên Google Sheet (2026-07-29). Sheet nay chỉ
 *  còn là nguồn tham chiếu chỉ đọc; Supabase là nơi lưu dữ liệu gốc.
 *
 *  Nguồn dữ liệu: bảng vmp_source_objects — gộp 5 tab nguồn cũ:
 *    1. DS thiết bị-All      -> Thiết bị
 *    2. DS quy trình         -> Quy trình
 *    3. DS kho               -> Kho
 *    4. DS hệ thống phụ trợ  -> Hệ thống phụ trợ
 *    5. Vận chuyển           -> Vận chuyển
 *
 *  Các cột ở đây là ĐẦU VÀO CỦA LUẬT SINH TIMELINE (workflow VMP01), nên
 *  form có ghi chú rõ cột nào ảnh hưởng tới mốc thời gian nào — thiếu
 *  "Tháng thẩm định đầu tiên" thì toàn bộ deadline của đối tượng đó không
 *  tính được.
 *
 *  Quyền: chỉ admin / qa_manager sửa được (RPC tự chặn phía server; ở đây
 *  chỉ ẩn nút cho gọn giao diện, không phải lớp bảo mật).
 * ===================================================================== */
import { useState, useEffect, useMemo } from "react";
import { Boxes, RefreshCw, Plus, Pencil, Ban, Search, AlertTriangle, CalendarPlus } from "lucide-react";
import { C, TEXT, btnPrimary } from "../constants/theme.ts";
import { Card, CardTitle, Tag, Modal } from "../components/ui/Primitives.tsx";
import {
  SOURCE_KINDS, fetchSourceObjects, upsertSourceObject, deleteSourceObject,
  generateTimeline,
} from "../lib/supabaseData.ts";

/* Cột hiển thị + siêu dữ liệu cho form.
   `hint` giải thích ảnh hưởng tới luật sinh timeline — đây là phần người
   nhập liệu hay sai nhất, nên để ngay cạnh ô nhập. */
const FIELDS = [
  { key: "object_code",      label: "Mã đối tượng",        w: 130, required: true, lockOnEdit: true },
  { key: "object_name",      label: "Tên đối tượng",       w: 240 },
  { key: "department",       label: "Bộ phận quản lý",     w: 130 },
  { key: "area_code",        label: "Mã khu vực",          w: 110 },
  { key: "line",             label: "Line",                w: 80 },
  { key: "status",           label: "Tình trạng",          w: 110 },
  { key: "show_flag",        label: "Show",                w: 70 },
  { key: "validate_flag",    label: "Thẩm định",           w: 90,
    hint: "Chỉ 'y' mới được sinh hạng mục timeline. Bỏ trống hoặc 'n' là loại khỏi kế hoạch." },
  { key: "validate_reason",  label: "Lý do thẩm định",     w: 160 },
  { key: "frequency_months", label: "Tần suất (tháng)",    w: 110, num: true,
    hint: "Quyết định số lần thẩm định trong năm: số lần = 12 ÷ tần suất (tối thiểu 1)." },
  { key: "report_class",     label: "Phân loại báo cáo",   w: 150,
    hint: "Quyết định khoảng cách báo cáo: không phụ thuộc 2 · hóa lý 2 · nhiễm khuẩn 7 · vô khuẩn 16 ngày." },
  { key: "workdays",         label: "Số ngày công",        w: 100, num: true,
    hint: "Dùng để tính ngày bắt đầu thẩm định = ngày kết thúc − số ngày công." },
  { key: "first_month",      label: "Tháng TĐ đầu tiên",   w: 120, num: true,
    hint: "BẮT BUỘC. Thiếu cột này thì toàn bộ mốc thời gian của đối tượng không tính được." },
  { key: "year_ref",         label: "Năm nhập / ban hành", w: 120, num: true,
    hint: "Bằng năm thẩm định và chưa từng có IQ ⇒ sinh đủ DQ, FAT/SAT, IQ, OQ, PQ (chỉ một lần)." },
  { key: "critical_point",   label: "Điểm trọng yếu",      w: 130 },
  { key: "note",             label: "Ghi chú",             w: 160 },
];

export default function SourceCatalogView({ user, onReload }) {
  const canEdit = user?.perm === "admin";
  const [kind, setKind] = useState(SOURCE_KINDS[0]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);   // null | {} (thêm mới) | row (sửa)
  const [saving, setSaving] = useState(false);
  const [gen, setGen] = useState(null);           // hộp thoại sinh timeline

  const load = async () => {
    setLoading(true); setErr("");
    try {
      setRows(await fetchSourceObjects({ kind }));
    } catch (e) {
      setErr(e.message || "Lỗi tải danh mục");
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [kind]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      FIELDS.some((f) => String(r[f.key] ?? "").toLowerCase().includes(s)));
  }, [rows, q]);

  // Đối tượng có thẩm định nhưng thiếu tháng đầu tiên => timeline sẽ hỏng mốc
  const broken = useMemo(
    () => rows.filter((r) => r.validate_flag === "y" && r.first_month == null),
    [rows]);

  const save = async (form) => {
    setSaving(true);
    try {
      const patch = {};
      for (const f of FIELDS) {
        if (f.key === "object_code") continue;
        const raw = form[f.key];
        if (raw === undefined || raw === "") continue;
        patch[f.key] = f.num ? Number(raw) : String(raw);
      }
      await upsertSourceObject(kind, form.object_code, patch);
      setEditing(null);
      await load();
      if (onReload) onReload();
    } catch (e) {
      alert("Lỗi lưu: " + (e.message || "không rõ"));
    }
    setSaving(false);
  };

  const stop = async (row) => {
    const reason = window.prompt(`Lý do ngừng dùng "${row.object_code}":`);
    if (!reason || !reason.trim()) return;
    try {
      await deleteSourceObject(kind, row.object_code, reason.trim());
      await load();
    } catch (e) {
      alert("Lỗi: " + (e.message || "không rõ"));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <CardTitle icon={Boxes} sub="Nhập liệu trực tiếp tại đây — Google Sheet nay chỉ là nguồn tham chiếu chỉ đọc">
          Danh mục nguồn
        </CardTitle>

        {/* Chọn danh mục */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {SOURCE_KINDS.map((k) => (
            <button key={k} onClick={() => { setKind(k); setQ(""); }}
              style={{
                padding: "8px 14px", borderRadius: 12, cursor: "pointer",
                fontFamily: TEXT, fontSize: 13, fontWeight: kind === k ? 800 : 600,
                border: `1.5px solid ${kind === k ? C.pink : C.pinkSoft}`,
                background: kind === k ? C.pinkSoft : "#fff",
                color: kind === k ? C.plum : C.plumSoft,
              }}>
              {k}
            </button>
          ))}
        </div>

        {/* Thanh công cụ */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <Search size={15} color={C.plumSoft}
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo mã, tên, bộ phận…"
              style={{
                width: "100%", padding: "9px 10px 9px 32px", borderRadius: 12,
                border: `1.5px solid ${C.pinkSoft}`, fontFamily: TEXT, fontSize: 13,
              }} />
          </div>
          <button onClick={load} style={{ ...btnPrimary, background: "#fff", color: C.plum, border: `1.5px solid ${C.pinkSoft}` }}>
            <RefreshCw size={15} /> Tải lại
          </button>
          {canEdit && (
            <button onClick={() => setEditing({})} style={btnPrimary}>
              <Plus size={15} /> Thêm đối tượng
            </button>
          )}
          {canEdit && (
            <button onClick={() => setGen({ year: new Date().getFullYear(), preview: null })}
              style={{ ...btnPrimary, background: "#fff", color: C.plum, border: `1.5px solid ${C.pinkSoft}` }}>
              <CalendarPlus size={15} /> Sinh timeline
            </button>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 12.5, color: C.plumSoft, fontFamily: TEXT }}>
          {loading ? "Đang tải…" : `${filtered.length} / ${rows.length} đối tượng`}
          {" · "}
          {rows.filter((r) => r.validate_flag === "y").length} đối tượng có thẩm định
        </div>

        {err && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: C.raspSoft, color: C.raspText, fontSize: 13 }}>
            {err}
          </div>
        )}

        {/* Cảnh báo dữ liệu thiếu — đúng thứ làm hỏng mốc thời gian timeline */}
        {broken.length > 0 && (
          <div style={{
            marginTop: 10, padding: "10px 12px", borderRadius: 12,
            background: C.marigoldSoft, color: C.marigoldText, fontSize: 12.5,
            fontFamily: TEXT, display: "flex", gap: 8, alignItems: "flex-start",
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <b>{broken.length} đối tượng có thẩm định nhưng thiếu “Tháng thẩm định đầu tiên”</b> —
              toàn bộ mốc thời gian của chúng không tính được, timeline sẽ ghi
              “Không xác định do thiếu…” thay vì ngày.
              <div style={{ marginTop: 4 }}>
                {broken.map((b) => b.object_code).join(" · ")}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Bảng */}
      <Card>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: TEXT, fontSize: 12.5 }}>
            <thead>
              <tr>
                {FIELDS.map((f) => (
                  <th key={f.key} title={f.hint || undefined}
                    style={{
                      textAlign: "left", padding: "9px 8px", whiteSpace: "nowrap",
                      borderBottom: `1.5px solid ${C.pinkSoft}`, color: C.plum,
                      fontWeight: 800, minWidth: f.w,
                      cursor: f.hint ? "help" : "default",
                    }}>
                    {f.label}{f.hint ? " ⓘ" : ""}
                  </th>
                ))}
                {canEdit && <th style={{ padding: "9px 8px", borderBottom: `1.5px solid ${C.pinkSoft}` }} />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${C.pinkMist}` }}>
                  {FIELDS.map((f) => (
                    <td key={f.key} style={{ padding: "8px", whiteSpace: "nowrap", color: C.plumSoft }}>
                      {f.key === "validate_flag"
                        ? <Tag color={r.validate_flag === "y" ? C.mintText : C.plumSoft}
                               bg={r.validate_flag === "y" ? C.mintSoft : C.pinkMist}>
                            {r.validate_flag || "—"}
                          </Tag>
                        : f.key === "first_month" && r.validate_flag === "y" && r.first_month == null
                          ? <span style={{ color: C.raspText, fontWeight: 700 }}>thiếu</span>
                          : (r[f.key] ?? "—")}
                    </td>
                  ))}
                  {canEdit && (
                    <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                      <button onClick={() => setEditing(r)} title="Sửa"
                        style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4 }}>
                        <Pencil size={15} color={C.plum} />
                      </button>
                      <button onClick={() => stop(r)} title="Ngừng dùng"
                        style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4 }}>
                        <Ban size={15} color={C.raspText} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={FIELDS.length + 1}
                  style={{ padding: 20, textAlign: "center", color: C.plumSoft }}>
                  Không có đối tượng nào.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <EditModal kind={kind} row={editing} saving={saving}
          onClose={() => setEditing(null)} onSave={save} />
      )}
      {gen && (
        <GenerateModal state={gen} setState={setGen}
          onClose={() => setGen(null)} onDone={onReload} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
 * Sinh timeline — luôn XEM TRƯỚC rồi mới ghi.
 * Hàm DB idempotent: mã đã tồn tại thì bỏ qua, và không bao giờ đè lên
 * các cột tiến độ người dùng đã nhập tay.
 * ---------------------------------------------------------------- */
function GenerateModal({ state, setState, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const r = state.preview;

  const run = async (commit) => {
    setBusy(true);
    try {
      const res = await generateTimeline(Number(state.year), commit);
      if (commit) {
        alert(res.msg || "Đã sinh timeline");
        onClose();
        if (onDone) onDone();
      } else {
        setState((p) => ({ ...p, preview: res }));
      }
    } catch (e) {
      alert("Lỗi: " + (e.message || "không rõ"));
    }
    setBusy(false);
  };

  return (
    <Modal onClose={onClose} icon={CalendarPlus} title="Sinh hạng mục timeline từ danh mục nguồn">
      <div style={{ fontSize: 13, color: C.plumSoft, fontFamily: TEXT, lineHeight: 1.55 }}>
        Sinh theo đúng luật VMP01: lọc đối tượng có <b>Thẩm định = y</b>, suy ra loại thẩm định
        theo phân loại, rồi tính lùi các mốc từ hạn hoàn thành (T).
        <br />
        Mã đã tồn tại sẽ được <b>bỏ qua</b> — không tạo trùng, không đè dữ liệu đã nhập.
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.plum, fontFamily: TEXT }}>Năm thẩm định</span>
        <input value={state.year} inputMode="numeric"
          onChange={(e) => setState((p) => ({ ...p, year: e.target.value, preview: null }))}
          style={{ width: 110, padding: "8px 10px", borderRadius: 10, fontFamily: TEXT, fontSize: 13, border: `1.5px solid ${C.pinkSoft}` }} />
      </label>

      {r && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: C.pinkMist, fontFamily: TEXT, fontSize: 13 }}>
          <div><b>{r.so_tao_moi}</b> hạng mục sẽ được tạo mới</div>
          <div style={{ color: C.plumSoft }}>{r.so_bo_qua} mã đã tồn tại → bỏ qua</div>
          {r.so_thieu_moc > 0 && (
            <div style={{ color: C.marigoldText, marginTop: 6 }}>
              ⚠️ {r.so_thieu_moc} hạng mục thiếu dữ liệu nguồn nên không tính được đủ mốc thời gian
              (sẽ tạo với ô ngày để trống).
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose}
          style={{ ...btnPrimary, background: "#fff", color: C.plum, border: `1.5px solid ${C.pinkSoft}` }}>
          Đóng
        </button>
        <button onClick={() => run(false)} disabled={busy}
          style={{ ...btnPrimary, background: "#fff", color: C.plum, border: `1.5px solid ${C.pinkSoft}`, opacity: busy ? 0.6 : 1 }}>
          Xem trước
        </button>
        <button onClick={() => run(true)} disabled={busy || !r || !r.so_tao_moi}
          style={{ ...btnPrimary, opacity: (busy || !r || !r.so_tao_moi) ? 0.5 : 1 }}>
          {busy ? "Đang chạy…" : `Ghi ${r ? r.so_tao_moi : ""} hạng mục`}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- */
function EditModal({ kind, row, saving, onClose, onSave }) {
  const isNew = !row.id;
  const [form, setForm] = useState(() => {
    const f = {};
    for (const x of FIELDS) f[x.key] = row[x.key] ?? "";
    return f;
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!String(form.object_code || "").trim()) { alert("Phải nhập mã đối tượng."); return; }
    onSave(form);
  };

  return (
    <Modal onClose={onClose} wide icon={Boxes}
      title={`${isNew ? "Thêm" : "Sửa"} đối tượng — ${kind}`}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
        {FIELDS.map((f) => (
          <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.plum, fontFamily: TEXT }}>
              {f.label}{f.required ? " *" : ""}
            </span>
            <input
              value={form[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              disabled={!isNew && f.lockOnEdit}
              inputMode={f.num ? "numeric" : undefined}
              style={{
                padding: "8px 10px", borderRadius: 10, fontFamily: TEXT, fontSize: 13,
                border: `1.5px solid ${C.pinkSoft}`,
                background: (!isNew && f.lockOnEdit) ? C.pinkMist : "#fff",
              }} />
            {f.hint && (
              <span style={{ fontSize: 11, color: C.plumSoft, lineHeight: 1.35 }}>{f.hint}</span>
            )}
          </label>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose}
          style={{ ...btnPrimary, background: "#fff", color: C.plum, border: `1.5px solid ${C.pinkSoft}` }}>
          Huỷ
        </button>
        <button onClick={submit} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

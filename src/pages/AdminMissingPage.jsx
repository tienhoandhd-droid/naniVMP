/* =====================================================================
 *  AdminMissingPage.jsx — Admin xử lý các mã đã mất khỏi Google Sheet
 *  ---------------------------------------------------------------------
 *  S3-F FIX (2026-06-21): trang admin/QA quản lý các hạng mục có cờ
 *  missing_from_sheet=TRUE (mã không còn trong Sheet). Hai lựa chọn:
 *    • Keep active   → giữ active, xóa cờ missing (chờ Sheet thêm lại)
 *    • Deactivate    → xác nhận hủy (is_active=FALSE)
 *  Mỗi quyết định ĐỀU CẦN LÝ DO (ghi audit_logs).
 * ===================================================================== */
import { useState, useEffect } from "react";
import { ShieldAlert, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { C, TEXT, btnPrimary } from "../constants/theme.js";
import { supabase } from "../lib/supabaseClient.js";
import { Card, CardTitle, Tag } from "../components/ui/Primitives.jsx";

export default function AdminMissingView({ isAdmin, onReload, readOnly = true }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = async () => {
    if (!supabase) { setErr("Supabase chưa cấu hình."); setLoading(false); return; }
    setLoading(true); setErr("");
    try {
      const { data, error } = await supabase.rpc("rpc_get_missing_items", {
        p_year: new Date().getFullYear(),
      });
      if (error) throw error;
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr("Lỗi tải: " + (e.message || "không rõ"));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resolve = async (validationCode, decision) => {
    const reason = window.prompt(
      decision === "keep_active"
        ? `Lý do GIỮ active mã ${validationCode} (vd: tạm thời ẩn khỏi Sheet, sẽ thêm lại):`
        : `Lý do xác nhận HỦY mã ${validationCode} (vd: thiết bị đã thanh lý, phê duyệt #...):`
    );
    if (!reason || !reason.trim()) return;
    try {
      const { data, error } = await supabase.rpc("rpc_resolve_missing", {
        p_validation_code: validationCode,
        p_decision: decision,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error);
      await load();
      if (onReload) onReload();
    } catch (e) {
      alert("Lỗi: " + (e.message || "không rõ"));
    }
  };

  if (!isAdmin) {
    return (
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: C.raspText }}>
          <XCircle size={20} />
          <div style={{ fontFamily: TEXT, fontWeight: 800 }}>Bạn cần quyền admin/QA manager để xem trang này.</div>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <CardTitle icon={ShieldAlert} sub="Các hạng mục có mã nhưng KHÔNG còn trong Google Sheet — cần QA xác nhận.">
            Mã đã mất khỏi Sheet
          </CardTitle>
          <button onClick={load} style={{ ...btnPrimary, padding: "7px 14px", borderRadius: 10, fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <RefreshCw size={13} /> Làm mới
          </button>
        </div>
      </Card>

      {err && (
        <Card>
          <div style={{ color: C.raspText, fontWeight: 700 }}>{err}</div>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, minWidth: 720 }}>
            <thead>
              <tr style={{ background: C.pinkMist }}>
                {["Mã thẩm định", "Mã đối tượng", "Loại", "QA", "Mất từ", "Hành động"].map((h) =>
                  <th key={h} style={{ textAlign: "left", padding: "12px 16px", fontSize: 12, fontWeight: 800, color: C.plumSoft, whiteSpace: "nowrap" }}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: C.plumSoft, fontWeight: 600 }}>
                  Đang tải…
                </td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: C.mintText, fontWeight: 700 }}>
                  <CheckCircle2 size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
                  Tất cả mã đều có trong Sheet — không có việc cần xử lý.
                </td></tr>
              )}
              {items.map((it) => (
                <tr key={it.validation_code} style={{ borderTop: `1px solid ${C.pinkSoft}` }}>
                  <td style={{ padding: "12px 16px", fontWeight: 800, color: C.plum, fontSize: 13 }}>{it.validation_code}</td>
                  <td style={{ padding: "12px 16px", color: C.plum, fontSize: 13 }}>{it.object_code}</td>
                  <td style={{ padding: "12px 16px" }}><Tag color={C.lavText} bg={C.lavSoft}>{it.validation_type}</Tag></td>
                  <td style={{ padding: "12px 16px", color: C.plumSoft, fontSize: 13 }}>{it.owner_name || "—"}</td>
                  <td style={{ padding: "12px 16px", color: C.plumSoft, fontSize: 12, whiteSpace: "nowrap" }}>
                    {it.missing_since ? new Date(it.missing_since).toLocaleString("vi-VN") : "—"}
                  </td>
                  <td style={{ padding: "12px 16px", display: "flex", gap: 8 }}>
                    {readOnly ? <Tag color={C.lavText} bg={C.lavSoft}>Xử lý trên Google Sheet</Tag> : <>
                      <button onClick={() => resolve(it.validation_code, "keep_active")}
                        style={{ padding: "6px 11px", borderRadius: 10, border: `1px solid ${C.mint}`, background: "#fff", color: C.mintText, fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
                        ✓ Giữ active
                      </button>
                      <button onClick={() => resolve(it.validation_code, "deactivate")}
                        style={{ padding: "6px 11px", borderRadius: 10, border: `1px solid ${C.rasp}`, background: "#fff", color: C.raspText, fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
                        ⊘ Xác nhận hủy
                      </button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, padding: "0 4px", lineHeight: 1.6 }}>
        💡 Google Sheet là nguồn chuẩn. Nếu mã xuất hiện ở đây, hãy sửa hoặc khôi phục trực tiếp trên Sheet; snapshot kế tiếp sẽ cập nhật Supabase.
      </div>
    </div>
  );
}

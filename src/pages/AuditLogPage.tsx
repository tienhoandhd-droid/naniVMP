/* =====================================================================
 *  AuditLogPage — Nhật ký thao tác hệ thống (rpc_get_audit_logs)
 *  (F1 31/08: tách từ App.tsx, nạp lazy — màn admin/QA quản lý.)
 * ===================================================================== */
import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { C, TEXT, btnPrimary, INP } from "../constants/theme.ts";
import { Card, CardTitle, Tag } from "../components/ui/Primitives.tsx";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient.ts";
import type { Database } from "../types/database.ts";

export default function AuditLogView() {
  /** Một dòng nhật ký thao tác từ bảng audit_logs. */
  type AuditRow = Database["public"]["Tables"]["audit_logs"]["Row"];
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  /** true = con số tổng là ước lượng của Postgres (khi không lọc gì). */
  const [uocLuong, setUocLuong] = useState(false);
  /** Lỗi tải nhật ký — phải hiện ra, không được để bảng rỗng nói thay. */
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ action: "", user: "", record: "" });
  const PAGE_SIZE = 50;

  const loadLogs = useCallback(async (pg = 0) => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    setLoadErr("");
    try {
      if (!supabase) { setLoadErr("Chưa cấu hình kết nối Supabase."); return; }

      // Bảng audit_logs đã bị revoke SELECT khỏi vai authenticated (migration
      // 20260824120000) — đường đọc DUY NHẤT còn lại là rpc_get_audit_logs
      // (admin/qa_manager). Query thẳng bảng như trước 31/08 luôn trả 403.
      // RPC tự đếm ước lượng khi không lọc (total_uoc_luong) nên không cần
      // logic count planned/exact ở client nữa.
      const { data, error } = await supabase.rpc("rpc_get_audit_logs", {
        p_limit: PAGE_SIZE,
        p_offset: pg * PAGE_SIZE,
        ...(filters.action ? { p_action: filters.action } : {}),
        ...(filters.user ? { p_user_email: filters.user } : {}),
        ...(filters.record ? { p_record_id: filters.record } : {}),
      });
      if (error) throw error;
      const payload = data as {
        ok?: boolean; error?: string;
        total?: number; total_uoc_luong?: boolean; logs?: AuditRow[];
      } | null;
      // RPC trả lỗi nghiệp vụ (FORBIDDEN, phiên hết hạn) trong payload chứ
      // không ném exception — phải đọc ra, không được để bảng rỗng nói thay.
      if (payload && payload.ok === false) {
        throw new Error(payload.error || "Không có quyền xem nhật ký kiểm toán");
      }
      setLogs(payload?.logs || []);
      setTotal(payload?.total || 0);
      setUocLuong(!!payload?.total_uoc_luong);
      setPage(pg);
    } catch (e) {
      // Trước đây chỉ console.error rồi để bảng rỗng — người dùng đọc thành
      // "hệ thống chưa ghi nhật ký nào", trong khi thật ra là KHÔNG TẢI ĐƯỢC.
      console.error("Audit log error:", e);
      setLogs([]);
      setTotal(0);
      setLoadErr((e as { message?: string })?.message || "Không rõ nguyên nhân");
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { loadLogs(0); }, [loadLogs]);

  const actionLabels = {
    INSERT: { label: "Tạo mới", color: C.mintText, bg: C.mintSoft },
    UPDATE: { label: "Sửa", color: C.skyText, bg: C.skySoft },
    DELETE: { label: "Xoá", color: C.raspText, bg: C.raspSoft },
    STATUS_CHANGE: { label: "Đổi trạng thái", color: C.marigoldText, bg: C.marigoldSoft },
    DEADLINE_CHANGE: { label: "Đổi deadline", color: C.raspText, bg: C.raspSoft },
    LOGIN: { label: "Đăng nhập", color: C.lavText, bg: C.lavSoft },
    EXPORT: { label: "Xuất dữ liệu", color: C.skyText, bg: C.skySoft },
    AI_GENERATE: { label: "Tạo AI report", color: C.pinkText, bg: C.pinkSoft },
  };

  const fmtTime = (ts: string | number | null | undefined): string => {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleDateString("vi-VN") + " " + d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  };

  if (!isSupabaseConfigured()) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Card>
          <CardTitle icon={ShieldCheck} sub="Cần Supabase để xem audit trail">Audit Log</CardTitle>
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔐</div>
            <div style={{ fontFamily: TEXT, fontSize: 16, fontWeight: 800, color: C.plum }}>Cần cấu hình Supabase</div>
            <div style={{ fontSize: 14, color: C.plumSoft, fontWeight: 600, marginTop: 8 }}>
              Đặt VITE_SUPABASE_URL và VITE_SUPABASE_ANON để xem nhật ký thao tác.
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Card>
        <CardTitle icon={ShieldCheck} sub={loadErr ? "Không tải được nhật ký" : `${uocLuong ? "≈" : ""}${total} bản ghi · ALCOA+ audit trail · Không thể sửa/xoá`}>
          Nhật ký thao tác hệ thống
        </CardTitle>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <select aria-label="Lọc nhật ký theo hành động" value={filters.action} onChange={(e) => setFilters(f => ({ ...f, action: e.target.value }))}
            style={{ ...INP, maxWidth: 200, cursor: "pointer" }}>
            <option value="">Tất cả hành động</option>
            {Object.entries(actionLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input aria-label="Lọc nhật ký theo email" placeholder="Tìm theo email..." value={filters.user}
            onChange={(e) => setFilters(f => ({ ...f, user: e.target.value }))}
            style={{ ...INP, maxWidth: 220 }} />
          <input aria-label="Lọc nhật ký theo mã hạng mục" placeholder="Tìm theo ID hạng mục..." value={filters.record}
            onChange={(e) => setFilters(f => ({ ...f, record: e.target.value }))}
            style={{ ...INP, maxWidth: 200 }} />
          <button onClick={() => loadLogs(0)} disabled={loading}
            style={{ ...btnPrimary, padding: "10px 18px", borderRadius: 14, display: "flex", alignItems: "center", gap: 7 }}>
            <RefreshCw size={15} className={loading ? "spin" : ""} /> Tải lại
          </button>
        </div>

        {loading && <div style={{ textAlign: "center", padding: 30, color: C.plumSoft }}>Đang tải...</div>}

        {/* Tải hỏng và "không có gì" là HAI chuyện khác nhau — nói đúng chuyện. */}
        {!loading && loadErr && (
          <div style={{ margin: "10px 0", padding: "16px 18px", borderRadius: 14,
                        background: C.raspSoft, border: `1px solid ${C.rasp}` }}>
            <div style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 14, color: C.raspText }}>
              Không tải được nhật ký thao tác
            </div>
            <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 5, lineHeight: 1.6 }}>
              {loadErr}
              <br />
              Thường gặp: phiên đăng nhập hết hạn (đăng nhập lại), hoặc tài khoản không phải admin/QA —
              nhật ký chỉ mở cho hai vai trò này.
            </div>
            <button onClick={() => loadLogs(0)}
              style={{ ...btnPrimary, marginTop: 12, padding: "9px 18px", borderRadius: 14, fontSize: 14 }}>
              Thử lại
            </button>
          </div>
        )}

        {!loading && !loadErr && logs.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: C.plumSoft, fontWeight: 600 }}>
            Chưa có bản ghi audit log nào khớp bộ lọc.
          </div>
        )}

        {!loading && logs.length > 0 && (
          <div className="vmp-scroll" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, minWidth: 800 }}>
              <thead>
                <tr style={{ background: C.pinkMist }}>
                  {["Thời gian", "Người thực hiện", "Hành động", "Bảng", "ID bản ghi", "Nguồn", "Chi tiết"].map((h, i) => (
                    <th key={i} style={{ textAlign: "left", padding: "12px 14px", fontSize: 12, fontWeight: 800, color: C.plumSoft, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const al = (actionLabels as Record<string, { label: string; color: string; bg: string }>)[log.action]
                    || { label: log.action, color: C.plumSoft, bg: C.pinkSoft };
                  return (
                    <tr key={log.id} style={{ borderTop: `1px solid ${C.line}`, background: i % 2 ? C.surfaceSunk : "transparent" }}>
                      <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 600, color: C.plumSoft, whiteSpace: "nowrap" }}>{fmtTime(log.created_at)}</td>
                      <td style={{ padding: "11px 14px", fontSize: 14, fontWeight: 700, color: C.plum }}>{log.user_email || "—"}</td>
                      <td style={{ padding: "11px 14px" }}><Tag color={al.color} bg={al.bg}>{al.label}</Tag></td>
                      <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 600, color: C.plumSoft }}>{log.table_name || "—"}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, fontFamily: "monospace", color: C.lavText }}>{log.record_id || "—"}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 600, color: C.plumSoft }}>{log.source || "—"}</td>
                      <td style={{ padding: "11px 14px" }}>
                        {log.new_data && (
                          <details style={{ fontSize: 12 }}>
                            <summary style={{ cursor: "pointer", color: C.lavText, fontWeight: 700 }}>Xem dữ liệu</summary>
                            <pre style={{ fontSize: 12, color: C.plumSoft, whiteSpace: "pre-wrap", maxWidth: 300, marginTop: 4, background: C.pinkMist, padding: 8, borderRadius: 8 }}>
                              {JSON.stringify(log.new_data, null, 2).substring(0, 500)}
                            </pre>
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 16 }}>
            <button disabled={page === 0} onClick={() => loadLogs(page - 1)}
              style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.pinkSoft}`, background: C.surface, cursor: page === 0 ? "not-allowed" : "pointer", fontFamily: TEXT, fontWeight: 700, color: C.plumSoft }}>
              ← Trước
            </button>
            <span style={{ display: "flex", alignItems: "center", fontSize: 14, fontWeight: 700, color: C.plum }}>
              Trang {page + 1} / {Math.ceil(total / PAGE_SIZE)}
            </span>
            <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => loadLogs(page + 1)}
              style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.pinkSoft}`, background: C.surface, cursor: (page + 1) * PAGE_SIZE >= total ? "not-allowed" : "pointer", fontFamily: TEXT, fontWeight: 700, color: C.plumSoft }}>
              Sau →
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ===================== Admin Page (NEW) ===================== */
/* ----------------------------------------------------------------
 * Quản trị — hứa "cấu hình hệ thống, người dùng, phân quyền" nhưng bản
 * cũ chỉ hiện trạng thái kết nối, kiểu xác thực và phiên của chính người
 * đang xem. Không có người dùng, không có cấu hình, không có gì để quản.
 *
 * Mọi thứ cần cho việc quản trị đều đã nằm trong DB, chỉ chưa ai lấy ra.
 * Gom vào một lời gọi rpc_trang_thai_he_thong (chỉ admin/QA đọc được).
 * -------------------------------------------------------------- */

/** Dịch lịch cron sang câu người đọc được — "0 20 * * 6" không nói gì với
 *  người vận hành, và giờ trong DB là UTC còn người dùng nghĩ theo giờ VN. */
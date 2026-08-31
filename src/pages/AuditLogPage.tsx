/* =====================================================================
 *  AuditLogPage — Nhật ký thao tác hệ thống (rpc_get_audit_logs)
 *  (F1 31/08: tách từ App.tsx, nạp lazy — màn admin/QA quản lý.)
 * ===================================================================== */
import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { C, TEXT, NUM, btnPrimary, INP } from "../constants/theme.ts";
import { Card, CardTitle, Tag, Modal } from "../components/ui/Primitives.tsx";
import { dungBangDiff } from "../features/audit/auditDiffModel.ts";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient.ts";
import type { Database } from "../types/database.ts";
import { formatBangkokDateTime } from "../lib/formatBangkok.ts";

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
  const [filters, setFilters] = useState({ action: "", user: "", record: "", tu: "", bang: "" });
  /* Bàn quản trị (spec 01/09): dòng đang mở modal "Xem thay đổi". */
  const [xemDiff, setXemDiff] = useState<AuditRow | null>(null);
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
        ...(filters.bang ? { p_table_name: filters.bang } : {}),
        ...(filters.tu ? {
          p_from_date: new Date(Date.now() - (filters.tu === "today"
            ? 24 : 24 * 7) * 3_600_000).toISOString(),
        } : {}),
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
    return formatBangkokDateTime(ts);
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
          <select aria-label="Lọc nhật ký theo bảng" value={filters.bang}
            onChange={(e) => setFilters(f => ({ ...f, bang: e.target.value }))}
            style={{ ...INP, maxWidth: 210, cursor: "pointer" }}>
            <option value="">Mọi bảng</option>
            <option value="vmp_plan_items">Hạng mục kế hoạch</option>
            <option value="vmp_source_objects">Đối tượng nguồn</option>
            <option value="vmp_item_assignments">Phân công hạng mục</option>
            <option value="vmp_source_workshop_scope_grants">Phạm vi xưởng</option>
            <option value="profiles">Hồ sơ tài khoản</option>
          </select>
          {/* Lọc NHANH theo thời gian — hai câu vận hành hay hỏi nhất:
              "hôm nay ai đổi gì?" và "tuần này có gì lạ?". */}
          <div role="group" aria-label="Lọc nhanh theo thời gian" style={{ display: "flex", gap: 6 }}>
            {([["", "Tất cả"], ["today", "24 giờ"], ["7d", "7 ngày"]] as const).map(([v, nhan]) => (
              <button key={v} type="button" aria-pressed={filters.tu === v}
                onClick={() => setFilters(f => ({ ...f, tu: v }))}
                style={{ padding: "8px 14px", borderRadius: 999, cursor: "pointer",
                         fontFamily: TEXT, fontSize: 12, fontWeight: 700,
                         border: `1.5px solid ${filters.tu === v ? C.plum : C.pinkSoft}`,
                         background: filters.tu === v ? C.plum : C.surface,
                         color: filters.tu === v ? "var(--lp-on-ink)" : C.plumSoft }}>
                {nhan}
              </button>
            ))}
          </div>
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
                        {(log.new_data || log.old_data) && (
                          <button type="button" onClick={() => setXemDiff(log)}
                            style={{ padding: "6px 12px", borderRadius: 10, cursor: "pointer",
                                     border: `1px solid ${C.pinkSoft}`, background: C.surface,
                                     color: C.lavText, fontFamily: TEXT, fontSize: 12, fontWeight: 700 }}>
                            Xem thay đổi
                          </button>
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

      {/* Modal THAY ĐỔI old→new — câu thanh tra hỏi là "đổi cái gì, từ giá
          trị nào sang giá trị nào"; JSON thô bắt người đọc tự so hai cục. */}
      {xemDiff && (() => {
        const rows = dungBangDiff(xemDiff.old_data, xemDiff.new_data, xemDiff.changed_fields);
        return (
          <Modal onClose={() => setXemDiff(null)} icon={ShieldCheck}
            title={`Thay đổi · ${xemDiff.record_id || xemDiff.table_name || ""}`}>
            <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginBottom: 12, lineHeight: 1.7 }}>
              {fmtTime(xemDiff.created_at)} · {xemDiff.user_email || "không rõ người"} · {xemDiff.table_name || "—"}
              {xemDiff.change_reason && (
                <div style={{ marginTop: 4 }}>
                  Lý do: <b style={{ color: C.plum }}>{xemDiff.change_reason}</b>
                </div>
              )}
            </div>
            {rows.length === 0 ? (
              <div style={{ padding: 18, textAlign: "center", color: C.plumSoft, fontWeight: 600 }}>
                Bản ghi không kèm chi tiết trường thay đổi (vd đăng nhập, xuất dữ liệu).
              </div>
            ) : (
              <table className="reg-table" style={{ width: "100%" }}>
                <caption>Từng trường thay đổi: giá trị cũ gạch ngang, giá trị mới in đậm.</caption>
                <thead><tr>
                  <th scope="col">Trường</th><th scope="col">Trước</th><th scope="col">Sau</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.field}>
                      <th scope="row" style={{ fontFamily: NUM, fontSize: 12 }}>{r.field}</th>
                      <td style={{ color: C.plumSoft }}>
                        {r.cu === null ? <span className="vmp-trong">trống</span>
                          : <s style={{ textDecorationColor: C.rasp }}>{r.cu}</s>}
                      </td>
                      <td style={{ fontWeight: 800, color: C.plum }}>
                        {r.moi === null ? <span className="vmp-trong">đã xoá</span> : r.moi}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Modal>
        );
      })()}
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

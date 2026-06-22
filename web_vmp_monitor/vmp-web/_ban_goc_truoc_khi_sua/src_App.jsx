/* =====================================================================
 *  App.jsx — VMP Monitor v2.0 · Refactored Main Shell
 *  =====================================================================
 *  Kiến trúc module:
 *    constants/  → theme.js, vmp.js (design tokens, domain constants)
 *    utils/      → helpers.js (pure functions, date/tally/enrichment)
 *    hooks/      → index.js (useAuth, useVmpData, useDebounce)
 *    components/ → ui/Primitives.jsx, layout/Layout.jsx
 *    pages/      → (sẽ tách dần từ file này)
 *  
 *  Lưu ý bảo mật:
 *    - Không hard-code secret/password
 *    - Webhook URL từ .env (build-time) hoặc localStorage
 *    - AI API gọi qua Anthropic proxy (không cần key phía frontend)
 * ===================================================================== */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";

// ===== External libs =====
import {
  LayoutDashboard, Boxes, FlaskConical, Cpu, CalendarClock, FileBarChart,
  ShieldAlert, BarChart3, Search, Bell, ChevronRight, Clock, AlertCircle, CheckCircle2,
  TrendingUp, ShieldCheck, Sparkles as SparkIcon, Download, Activity, Filter, LogOut,
  KeyRound, Lock, Eye, EyeOff, RefreshCw, XCircle, Plus, Printer, Trophy, Crown, Flag,
  GanttChartSquare, Radar, Cloud, Link2, Pencil, Trash2, Save, Warehouse, Wind, Truck, FileText,
} from "lucide-react";
// Lưu ý: recharts đã bị gỡ vì KHÔNG dùng (chỉ import thừa, nặng bundle).
// xlsx được nạp động (dynamic import) ngay trong hàm xuất Excel để giảm bundle ban đầu.

// ===== Internal modules (refactored) =====
import { C, TEXT, NUM, GRAD, GRAD_SOFT, btnPrimary, INP, FIELD, LBL, glass } from "./constants/theme.js";
import {
  STATUS, MST, PROG, CLS, DEPTS, DEPT_DEEP, DEPT_COLOR, DEPT_CODE, DEP_DAYS, CRIT,
  SOON_DAYS, PERM_LABEL, NAV_ITEMS, NAV_SUBS, STAGES, TT_OPTS, PERIODS, PLABEL,
  vmpToday,
} from "./constants/vmp.js";
import {
  parseD, addDays, addMonths, fmtVN, daysBetween, clamp, pctYear,
  milestones, phaseStates, nextAlert, wlIsDone, stageOf, enrich,
  tally, docTally, inPeriod, runDataQualityChecks,
  buildReportHTML, download,
} from "./utils/helpers.js";
import { useDebounce, useScrollTop, useAuth, useVmpData } from "./hooks/index.js";

// ===== UI Primitives =====
import {
  Sparkle, Mascot, Card, CardTitle, Tag, Modal, Donut, KpiCard, Sel,
  SkeletonPulse, SkeletonDashboard, SyncBanner, CrownLogo,
} from "./components/ui/Primitives.jsx";
import { Sidebar, Topbar } from "./components/layout/Layout.jsx";

// ===== Page components (extracted from monolith) =====
import TimelineView from "./pages/TimelinePage.jsx";
import AlertsView from "./pages/AlertsPage.jsx";
import QrmView from "./pages/QrmPage.jsx";
import InventoryView from "./pages/InventoryPage.jsx";
import UpdateView from "./pages/UpdatePage.jsx";
import WorkloadView from "./pages/WorkloadPage.jsx";
import AdminMissingView from "./pages/AdminMissingPage.jsx";

// ===== Legacy lib imports (kept for compatibility) =====
import { loadConn, saveConn, clearConn, loadUser, saveUser } from "./lib/config.js";
import { toISO, deriveActivityFields } from "./lib/n8nAdapter.js";
import { isSupabaseConfigured, signIn, signOut, changePassword, getAccessToken, supabase } from "./lib/supabaseClient.js";

/* ===================== Backward-compat shims ===================== */
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const NAV = NAV_ITEMS.filter(n => !n.adminOnly).slice(0, 7); // backward compat

/* ===================== Login ===================== */
function LoginScreen({ onLogin }) {
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState(""); const [show, setShow] = useState(false); const [loading, setLoading] = useState(false);
  const useSupa = isSupabaseConfigured();
  const submit = async () => {
    setErr(""); setLoading(true);
    try {
      if (useSupa) {
        const profile = await signIn(u.trim(), p);
        onLogin(profile);
      } else {
        setErr("Hệ thống chưa cấu hình Supabase Auth. Liên hệ IT để thiết lập VITE_SUPABASE_URL và VITE_SUPABASE_ANON.");
      }
    } catch (e) { setErr(e.message || "Đăng nhập thất bại."); }
    setLoading(false);
  };
  const field = (icon, props, right) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 16, background: "#fff", border: `1.5px solid ${C.pinkSoft}` }}>
      {icon}<input {...props} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ border: "none", outline: "none", background: "transparent", fontFamily: TEXT, fontSize: 14.5, color: C.plum, width: "100%", fontWeight: 600 }} />{right}
    </div>
  );
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: TEXT, padding: 20, background: `radial-gradient(720px 520px at 86% -5%, ${C.pinkMist}, transparent 60%), radial-gradient(640px 520px at -6% 104%, ${C.lavSoft}, transparent 55%), linear-gradient(160deg, ${C.bg1}, ${C.bg2})` }}>
      {[{ t: "10%", l: "18%", s: 16, c: C.gold }, { t: "20%", l: "82%", s: 13, c: C.pink }, { t: "76%", l: "12%", s: 14, c: C.lav }, { t: "70%", l: "88%", s: 12, c: C.sky }].map((x, i) => <div key={i} className="tw" style={{ position: "fixed", top: x.t, left: x.l }}><Sparkle size={x.s} color={x.c} /></div>)}
      <div style={{ width: "100%", maxWidth: 900, display: "grid", gridTemplateColumns: "1fr 1fr", borderRadius: 30, overflow: "hidden", boxShadow: "0 24px 60px rgba(238,123,169,.28)" }} className="login-grid">
        <div style={{ background: GRAD, padding: "44px 40px", color: "#fff", position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center", textAlign: "center" }}>
          <div style={{ position: "absolute", top: 20, right: 26 }}><Sparkle size={20} color="#fff" style={{ opacity: .85 }} /></div>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: "rgba(255,255,255,.24)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>👑</div>
          <Mascot mood="happy" size={170} />
          <div>
            <div style={{ fontFamily: TEXT, fontSize: 26, fontWeight: 800 }}>VMP Monitor</div>
            <div style={{ fontSize: 13.5, marginTop: 6, opacity: .95, lineHeight: 1.6 }}>Hệ Giám sát Thẩm định<br />CPC1 HN · V/Q Team — QLCL</div>
          </div>
        </div>
        <div style={{ background: C.pinkMist, padding: "48px 40px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily: TEXT, fontSize: 24, fontWeight: 800, color: C.plum }}>Xin chào!</div>
          <div style={{ fontSize: 13.5, color: C.plumSoft, marginTop: 5, marginBottom: 22, fontWeight: 700 }}>{useSupa ? "Đăng nhập bằng email Supabase" : "Đăng nhập để bắt đầu"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {field(<Boxes size={18} color={C.pink} />, { placeholder: useSupa ? "Email" : "Tài khoản", value: u, onChange: (e) => { setU(e.target.value); setErr(""); } })}
            {field(<Lock size={18} color={C.pink} />, { placeholder: "Mật khẩu", type: show ? "text" : "password", value: p, onChange: (e) => { setP(e.target.value); setErr(""); } }, <button onClick={() => setShow(!show)} style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex" }}>{show ? <EyeOff size={17} color={C.plumSoft} /> : <Eye size={17} color={C.plumSoft} />}</button>)}
            {err && <div style={{ color: C.raspText, fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}><XCircle size={15} /> {err}</div>}
            <button onClick={submit} disabled={loading} style={{ ...btnPrimary, marginTop: 4, padding: "14px", borderRadius: 16, fontSize: 15, boxShadow: "0 8px 20px rgba(190,69,116,.35)", opacity: loading ? .7 : 1 }}>{loading ? "Đang đăng nhập…" : "Đăng nhập"}</button>
          </div>
          {useSupa ? (
            <div style={{ marginTop: 18, padding: "12px 15px", borderRadius: 14, background: C.mintSoft, fontSize: 12, color: C.mintText, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><ShieldCheck size={15} /> Xác thực qua Supabase · Mật khẩu mã hoá · Audit log</div>
          ) : (
            <div style={{ marginTop: 18, padding: "12px 15px", borderRadius: 14, background: C.marigoldSoft, fontSize: 12, color: C.marigoldText, fontWeight: 700 }}>Chế độ tạm (chưa có Supabase). Xem hướng dẫn để nâng cấp.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== Change Password ===================== */
function ChangePwModal({ user, onClose }) {
  const [np, setNp] = useState(""); const [cf, setCf] = useState(""); const [msg, setMsg] = useState({ type: "", text: "" }); const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (np.length < 6) return setMsg({ type: "err", text: "Mật khẩu mới tối thiểu 6 ký tự." });
    if (np !== cf) return setMsg({ type: "err", text: "Xác nhận không khớp." });
    if (isSupabaseConfigured()) {
      setLoading(true);
      try { await changePassword(np); setMsg({ type: "ok", text: "Đổi mật khẩu thành công!" }); setNp(""); setCf(""); }
      catch (e) { setMsg({ type: "err", text: e.message }); }
      setLoading(false);
    } else { setMsg({ type: "err", text: "Cần Supabase để đổi mật khẩu." }); }
  };
  return (
    <Modal onClose={onClose} title="Đổi mật khẩu" icon={KeyRound}>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {["Mật khẩu mới", "Xác nhận"].map((ph, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", borderRadius: 14, background: "#fff", border: `1.5px solid ${C.pinkSoft}` }}>
            <KeyRound size={16} color={C.pink} />
            <input type="password" placeholder={ph} value={i === 0 ? np : cf}
              onChange={(e) => { (i === 0 ? setNp : setCf)(e.target.value); setMsg({ type: "", text: "" }); }}
              style={{ border: "none", outline: "none", background: "transparent", fontFamily: TEXT, fontSize: 14, color: C.plum, width: "100%", fontWeight: 600 }} />
          </div>
        ))}
        {msg.text && <div style={{ fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", gap: 6, color: msg.type === "ok" ? C.mintText : C.raspText }}>{msg.type === "ok" ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {msg.text}</div>}
        <button onClick={submit} disabled={loading} style={{ ...btnPrimary, marginTop: 4, padding: "13px", borderRadius: 14, fontSize: 14.5 }}>{loading ? "Đang lưu…" : "Xác nhận"}</button>
      </div>
    </Modal>
  );
}

/* ===================== Data Quality Page (NEW) ===================== */
function DataQualityView({ acts }) {
  const issues = useMemo(() => runDataQualityChecks(acts), [acts]);
  const [serverIssues, setServerIssues] = useState([]);
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;
    supabase.from("data_quality_issues")
      .select("issue_type,severity,field_name,message,detected_at,plan_item_id")
      .eq("is_resolved", false)
      .order("detected_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setServerIssues(data || []))
      .catch(() => {});
  }, []);
  const sevCount = { error: 0, warning: 0, info: 0 };
  issues.forEach(i => sevCount[i.severity]++);
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? issues : issues.filter(i => i.severity === filter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
        {[
          { id: "error", emoji: "🚫", bg: C.raspSoft, color: C.raspText, v: sevCount.error, l: "Lỗi nghiêm trọng" },
          { id: "warning", emoji: "⚠️", bg: C.marigoldSoft, color: C.marigoldText, v: sevCount.warning, l: "Cảnh báo" },
          { id: "info", emoji: "ℹ️", bg: C.skySoft, color: C.skyText, v: sevCount.info, l: "Thông tin" },
        ].map(c => (
          <div key={c.id} onClick={() => setFilter(filter === c.id ? "all" : c.id)} style={{ cursor: "pointer" }}>
            <KpiCard emoji={c.emoji} bg={c.bg} color={c.color} value={c.v} label={c.l}
              sub={filter === c.id ? "Đang lọc" : "Bấm để lọc"} subColor={c.color} />
          </div>
        ))}
      </div>
      <Card variant="strong">
        <CardTitle icon={Radar} sub={`${filtered.length} vấn đề · Kiểm tra tự động khi đồng bộ dữ liệu`}>
          Kiểm tra chất lượng dữ liệu
        </CardTitle>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: C.mintText, fontWeight: 700 }}>
            Không phát hiện vấn đề dữ liệu nào.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((issue, i) => (
              <div key={i} className="vmp-row" style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px", borderRadius: 14, background: "#fff",
                border: `1px solid ${issue.severity === "error" ? C.raspSoft : issue.severity === "warning" ? C.marigoldSoft : C.skySoft}`,
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>
                  {issue.severity === "error" ? "🚫" : issue.severity === "warning" ? "⚠️" : "ℹ️"}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: C.plum }}>{issue.msg}</div>
                  <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>
                    ID: {issue.id} · Loại: {issue.type}
                  </div>
                </div>
                <Tag color={issue.severity === "error" ? C.raspText : issue.severity === "warning" ? C.marigoldText : C.skyText}
                     bg={issue.severity === "error" ? C.raspSoft : issue.severity === "warning" ? C.marigoldSoft : C.skySoft}>
                  {issue.severity === "error" ? "Lỗi" : issue.severity === "warning" ? "Cảnh báo" : "Info"}
                </Tag>
              </div>
            ))}
          </div>
        )}
      </Card>
      {serverIssues.length > 0 && (
        <Card variant="soft">
          <CardTitle icon={Radar} sub={`${serverIssues.length} bản ghi do trigger DB & đồng bộ n8n ghi lại (chưa xử lý) — nguồn chính thức, web không tự tính lại`}>
            Lỗi / xung đột ghi nhận từ hệ thống (Supabase)
          </CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {serverIssues.map((it, i) => (
              <div key={i} className="vmp-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "#fff", border: `1px solid ${it.severity === "error" ? C.raspSoft : C.marigoldSoft}` }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{it.severity === "error" ? "🚫" : "⚠️"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: C.plum }}>{it.message}</div>
                  <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>
                    {it.issue_type}{it.field_name ? " · " + it.field_name : ""}{it.plan_item_id ? " · " + it.plan_item_id : ""}{it.detected_at ? " · " + new Date(it.detected_at).toLocaleDateString("vi-VN") : ""}
                  </div>
                </div>
                <Tag color={it.severity === "error" ? C.raspText : C.marigoldText} bg={it.severity === "error" ? C.raspSoft : C.marigoldSoft}>
                  {it.severity === "error" ? "Lỗi" : "Cảnh báo"}
                </Tag>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ===================== Mismatch Page (NEW) ===================== */
function MismatchView({ acts }) {
  const mismatched = acts.filter(a => a.mismatch);
  const valDoneDocPend = mismatched.filter(a => a.mismatch === "val_done_doc_pending");
  const docDoneValPend = mismatched.filter(a => a.mismatch === "doc_done_val_pending");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <KpiCard emoji="📋" bg={C.marigoldSoft} color={C.marigoldText}
          value={valDoneDocPend.length} label="Thẩm định xong · Hồ sơ chưa"
          sub="Cần hoàn thiện hồ sơ" />
        <KpiCard emoji="📝" bg={C.lavSoft} color={C.lavText}
          value={docDoneValPend.length} label="Hồ sơ xong · Thẩm định chưa"
          sub="Cần xác nhận thẩm định" />
      </div>

      {[
        { title: "Thẩm định xong nhưng hồ sơ chưa hoàn thiện", items: valDoneDocPend, type: "val_done_doc_pending" },
        { title: "Hồ sơ xong nhưng thẩm định chưa hoàn thành", items: docDoneValPend, type: "doc_done_val_pending" },
      ].map(group => group.items.length > 0 && (
        <Card key={group.type} variant="strong">
          <CardTitle icon={FileText} sub={`${group.items.length} hạng mục lệch pha`}>
            {group.title}
          </CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {group.items.map(a => (
              <div key={a.id} className="vmp-row" style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px", borderRadius: 14, background: "#fff",
                border: `1px solid ${C.marigoldSoft}`,
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: C.marigoldSoft, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 20,
                }}>
                  📋
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: C.plum }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>
                    {a.id} · {a.vtype} · QA: {a.owner} · Deadline: {a.target || "—"}
                  </div>
                </div>
                <Tag color={C.marigoldText} bg={C.marigoldSoft}>Lệch pha</Tag>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {mismatched.length === 0 && (
        <Card>
          <div style={{ textAlign: "center", padding: 40, color: C.mintText, fontWeight: 700 }}>
            Không có hạng mục lệch pha. Tiến độ thẩm định và hồ sơ đang đồng bộ tốt.
          </div>
        </Card>
      )}
    </div>
  );
}

/* ===================== Audit Log Page (NEW) ===================== */
function AuditLogView() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ action: "", user: "", record: "" });
  const PAGE_SIZE = 50;

  const loadLogs = useCallback(async (pg = 0) => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    try {
      if (!supabase) return;

      // Build query with filters
      let query = supabase.from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1);

      if (filters.action) query = query.eq("action", filters.action);
      if (filters.user) query = query.ilike("user_email", `%${filters.user}%`);
      if (filters.record) query = query.eq("record_id", filters.record);

      const { data, error, count } = await query;
      if (error) throw error;
      setLogs(data || []);
      setTotal(count || 0);
      setPage(pg);
    } catch (e) {
      console.error("Audit log error:", e);
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

  const fmtTime = (ts) => {
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
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
            <div style={{ fontFamily: TEXT, fontSize: 16, fontWeight: 800, color: C.plum }}>Cần cấu hình Supabase</div>
            <div style={{ fontSize: 13, color: C.plumSoft, fontWeight: 600, marginTop: 8 }}>
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
        <CardTitle icon={ShieldCheck} sub={`${total} bản ghi · ALCOA+ audit trail · Không thể sửa/xoá`}>
          Nhật ký thao tác hệ thống
        </CardTitle>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <select value={filters.action} onChange={(e) => setFilters(f => ({ ...f, action: e.target.value }))}
            style={{ ...INP, maxWidth: 200, cursor: "pointer" }}>
            <option value="">Tất cả hành động</option>
            {Object.entries(actionLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input placeholder="Tìm theo email..." value={filters.user}
            onChange={(e) => setFilters(f => ({ ...f, user: e.target.value }))}
            style={{ ...INP, maxWidth: 220 }} />
          <input placeholder="Tìm theo ID hạng mục..." value={filters.record}
            onChange={(e) => setFilters(f => ({ ...f, record: e.target.value }))}
            style={{ ...INP, maxWidth: 200 }} />
          <button onClick={() => loadLogs(0)} disabled={loading}
            style={{ ...btnPrimary, padding: "10px 18px", borderRadius: 12, display: "flex", alignItems: "center", gap: 7 }}>
            <RefreshCw size={15} className={loading ? "spin" : ""} /> Tải lại
          </button>
        </div>

        {loading && <div style={{ textAlign: "center", padding: 30, color: C.plumSoft }}>Đang tải...</div>}

        {!loading && logs.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: C.plumSoft, fontWeight: 600 }}>
            Chưa có bản ghi audit log nào.
          </div>
        )}

        {!loading && logs.length > 0 && (
          <div className="vmp-scroll" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, minWidth: 800 }}>
              <thead>
                <tr style={{ background: C.pinkMist }}>
                  {["Thời gian", "Người thực hiện", "Hành động", "Bảng", "ID bản ghi", "Nguồn", "Chi tiết"].map((h, i) => (
                    <th key={i} style={{ textAlign: "left", padding: "12px 14px", fontSize: 11.5, fontWeight: 800, color: C.plumSoft, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const al = actionLabels[log.action] || { label: log.action, color: C.plumSoft, bg: C.pinkSoft };
                  return (
                    <tr key={log.id} style={{ borderTop: `1px solid ${C.line}`, background: i % 2 ? "rgba(255,255,255,.4)" : "transparent" }}>
                      <td style={{ padding: "11px 14px", fontSize: 12.5, fontWeight: 600, color: C.plumSoft, whiteSpace: "nowrap" }}>{fmtTime(log.created_at)}</td>
                      <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700, color: C.plum }}>{log.user_email || "—"}</td>
                      <td style={{ padding: "11px 14px" }}><Tag color={al.color} bg={al.bg}>{al.label}</Tag></td>
                      <td style={{ padding: "11px 14px", fontSize: 12.5, fontWeight: 600, color: C.plumSoft }}>{log.table_name || "—"}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, fontFamily: "monospace", color: C.lavText }}>{log.record_id || "—"}</td>
                      <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 600, color: C.plumSoft }}>{log.source || "—"}</td>
                      <td style={{ padding: "11px 14px" }}>
                        {log.new_data && (
                          <details style={{ fontSize: 11.5 }}>
                            <summary style={{ cursor: "pointer", color: C.lavText, fontWeight: 700 }}>Xem dữ liệu</summary>
                            <pre style={{ fontSize: 10.5, color: C.plumSoft, whiteSpace: "pre-wrap", maxWidth: 300, marginTop: 4, background: C.pinkMist, padding: 8, borderRadius: 8 }}>
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
              style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${C.pinkSoft}`, background: "#fff", cursor: page === 0 ? "not-allowed" : "pointer", fontFamily: TEXT, fontWeight: 700, color: C.plumSoft }}>
              ← Trước
            </button>
            <span style={{ display: "flex", alignItems: "center", fontSize: 13, fontWeight: 700, color: C.plum }}>
              Trang {page + 1} / {Math.ceil(total / PAGE_SIZE)}
            </span>
            <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => loadLogs(page + 1)}
              style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${C.pinkSoft}`, background: "#fff", cursor: (page + 1) * PAGE_SIZE >= total ? "not-allowed" : "pointer", fontFamily: TEXT, fontWeight: 700, color: C.plumSoft }}>
              Sau →
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ===================== Admin Page (NEW) ===================== */
function AdminView({ conn, user }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Card>
        <CardTitle icon={BarChart3} sub="Cấu hình hệ thống, trạng thái kết nối, sức khoẻ hệ thống">
          Quản trị hệ thống
        </CardTitle>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ padding: 18, borderRadius: 16, background: conn.status === "ok" ? C.mintSoft : C.marigoldSoft }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: conn.status === "ok" ? C.mintText : C.marigoldText, marginBottom: 8 }}>
              Trạng thái kết nối
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.plum }}>
              {conn.status === "ok" ? "Đã kết nối nguồn dữ liệu" :
               conn.status === "loading" ? "Đang tải…" :
               conn.status === "err" ? "Lỗi kết nối" : "Chưa kết nối"}
            </div>
            {conn.msg && <div style={{ fontSize: 12, color: C.plumSoft, marginTop: 4 }}>{conn.msg}</div>}
          </div>

          <div style={{ padding: 18, borderRadius: 16, background: isSupabaseConfigured() ? C.mintSoft : C.raspSoft }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: isSupabaseConfigured() ? C.mintText : C.raspText, marginBottom: 8 }}>
              Xác thực
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.plum }}>
              {isSupabaseConfigured() ? "Supabase Auth (bảo mật)" : "Chế độ tạm (env)"}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20, padding: 16, borderRadius: 14, background: C.lavSoft }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.lavText, marginBottom: 8 }}>Thông tin phiên</div>
          <div style={{ fontSize: 13, color: C.plum, lineHeight: 2 }}>
            <div>Người dùng: <b>{user.name}</b></div>
            <div>Vai trò: <b>{user.role}</b></div>
            <div>Quyền: <b>{PERM_LABEL[user.perm] || user.perm}</b></div>
            {user.department && <div>Bộ phận: <b>{user.department}</b></div>}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ===================== BACKWARD COMPAT: Import page components =====================
 * These are kept from the original App.jsx. Each will be extracted to pages/ in future.
 * For now they reference shared modules (C, TEXT, etc.) from imports above.
 */

/* --- Individual Leaderboard --- */
function IndividualLeaderboard({ acts }) {
  const map = {};
  acts.forEach((a) => { const o = map[a.owner] || (map[a.owner] = { name: a.owner, items: 0, psum: 0, done: 0, over: 0 }); o.items++; o.psum += PROG[a.st]; if (a.st === "done") o.done++; if (a.st === "over") o.over++; });
  const people = Object.values(map).map((p) => ({ ...p, avg: Math.round(p.psum / p.items) })).sort((a, b) => b.avg - a.avg || b.done - a.done || b.items - a.items);
  const top3 = people.slice(0, 3), rest = people.slice(3);
  const podium = [{ p: top3[1], place: 2 }, { p: top3[0], place: 1 }, { p: top3[2], place: 3 }].filter((x) => x.p);
  const PCFG = {
    1: { h: 102, av: 60, ring: C.gold, base: "linear-gradient(180deg,#FBD66A,#E3A41E)", crown: true },
    2: { h: 76, av: 50, ring: C.silver, base: "linear-gradient(180deg,#D6DCE5,#A7B0BD)" },
    3: { h: 58, av: 46, ring: C.bronze, base: "linear-gradient(180deg,#E2B184,#C2854F)" },
  };
  return (
    <Card variant="strong" style={{ background: `linear-gradient(150deg,#fff,${C.pinkMist})` }}>
      <CardTitle icon={Crown} sub="Xếp theo tiến độ trung bình">Bảng vinh danh cá nhân</CardTitle>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 14, padding: "10px 0 4px", flexWrap: "wrap" }}>
        {podium.map(({ p, place }) => { const cf = PCFG[place]; return (
          <div key={p.name} className="rise" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: 116 }}>
            <div style={{ position: "relative" }}>
              {cf.crown && <div style={{ position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)", fontSize: 22 }}>👑</div>}
              <div style={{ width: cf.av, height: cf.av, borderRadius: 999, background: GRAD, border: `3px solid ${cf.ring}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontFamily: NUM, fontSize: cf.av / 2.4, boxShadow: "0 6px 16px rgba(78,42,78,.2)" }}>{p.name[0]}</div>
            </div>
            <div style={{ textAlign: "center" }}><div style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 14, color: C.plum }}>{p.name}</div><div style={{ fontFamily: NUM, fontWeight: 800, fontSize: 18, color: C.plum }}>{p.avg}%</div><div style={{ fontSize: 11, color: C.plumSoft, fontWeight: 600 }}>{p.items} hạng mục · {p.done} xong</div></div>
            <div style={{ width: "100%", height: cf.h, borderRadius: "14px 14px 0 0", background: cf.base, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 8 }}><span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 26, color: C.plum }}>{place}</span></div>
          </div>
        ); })}
      </div>
      {rest.length > 0 && <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
        {rest.map((p, i) => (
          <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px 8px 8px", borderRadius: 999, background: "#fff", border: `1.5px solid ${C.pinkSoft}` }}>
            <div style={{ width: 30, height: 30, borderRadius: 999, background: GRAD, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontFamily: NUM, fontSize: 13 }}>{p.name[0]}</div>
            <span style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 13, color: C.plum }}>{p.name}</span>
            <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 14, color: C.plumSoft }}>{p.avg}%</span>
          </div>
        ))}
      </div>}
    </Card>
  );
}

/* --- Overview --- */
function Overview({ acts, setView }) {
  const { e, d, overdue, soon, gap, gapPts, deptFull, mismatched } = useMemo(() => {
    const e = tally(acts), d = docTally(acts);
    const overdue = acts.filter((a) => a.alert && a.alert.kind === "over");
    const soon = acts.filter((a) => a.alert && a.alert.kind === "soon");
    const deptFull = DEPTS.map((dp) => {
      const da = acts.filter((a) => a.dept === dp.id);
      const et = tally(da), dt = docTally(da);
      const riskScore = da.length ? Math.round(((et.over + (da.length - et.done)) / da.length) * 100) : 0;
      const risk = riskScore >= 60 ? { l: "Cần xử lý", c: C.raspText, bg: C.raspSoft } : riskScore >= 35 ? { l: "Cần chú ý", c: C.marigoldText, bg: C.marigoldSoft } : { l: "Tốt", c: C.mintText, bg: C.mintSoft };
      return { ...dp, da, et, dt, risk, riskScore };
    }).filter((r) => r.da.length > 0).sort((a, b) => b.riskScore - a.riskScore);
    return {
      e, d, overdue, soon,
      gap: e.done - d.done, gapPts: e.rate - d.rate,
      deptFull, mismatched: acts.filter((a) => a.mismatch),
    };
  }, [acts]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Hero KPI */}
      <Card variant="strong" style={{ display: "flex", alignItems: "center", gap: 24, padding: "28px 30px", flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <Donut segments={[{ value: e.done, color: C.mint }, { value: e.over, color: C.rasp }, { value: e.todo, color: C.marigold }]} />
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontFamily: NUM, fontSize: 38, fontWeight: 800, color: C.plum, lineHeight: 1 }}>{e.rate}%</div>
            <div style={{ fontSize: 11, color: C.plumSoft, fontWeight: 700, marginTop: 2 }}>Thẩm định</div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: TEXT, fontSize: 20, fontWeight: 800, color: C.plum, marginBottom: 8 }}>Tiến độ thẩm định {vmpToday().getFullYear()}</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {[
              { l: "Hoàn thành", v: e.done, c: C.mintText },
              { l: "Quá hạn", v: e.over, c: C.raspText },
              { l: "Chưa HT", v: e.todo, c: C.marigoldText },
            ].map(s => (
              <div key={s.l} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontFamily: NUM, fontSize: 24, fontWeight: 800, color: s.c }}>{s.v}</span>
                <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>{s.l}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 12.5, color: C.plumSoft, fontWeight: 600 }}>
            Hồ sơ: {d.rate}% ({d.done}/{d.total})
            {gap > 0 && <span style={{ color: C.marigoldText }}> · Chênh {gap} hạng mục ({gapPts} điểm%)</span>}
          </div>
        </div>
        <Mascot mood={e.rate >= 60 ? "happy" : "worried"} size={100} />
      </Card>

      {/* Quick KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 16 }}>
        <KpiCard emoji="🚨" bg={C.raspSoft} color={C.raspText} value={overdue.length} label="Quá hạn" sub="Cần xử lý" />
        <KpiCard emoji="⏰" bg={C.marigoldSoft} color={C.marigoldText} value={soon.length} label="Tới hạn 30 ngày" sub="Theo dõi" />
        <KpiCard emoji="📋" bg={C.lavSoft} color={C.lavText} value={mismatched.length} label="Lệch pha hồ sơ"
          sub={mismatched.length ? "Bấm để xem" : "Đồng bộ tốt"} />
        <KpiCard emoji="📊" bg={C.skySoft} color={C.skyText} value={`${d.rate}%`} label="Tỷ lệ hồ sơ" sub={`${d.done}/${d.total} hoàn thiện`} />
      </div>

      {/* Department overview */}
      <Card variant="strong">
        <CardTitle icon={BarChart3} sub="So sánh tỷ lệ hoàn thành giữa các bộ phận">
          Tiến độ theo bộ phận
        </CardTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {deptFull.map(dp => (
            <div key={dp.id} className="vmp-row" style={{
              display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
              borderRadius: 16, background: "#fff", border: `1px solid ${C.pinkSoft}`,
            }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: `${DEPT_COLOR[dp.id]}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: DEPT_DEEP[dp.id] }}>{dp.short}</span>
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: C.plum }}>{dp.name}</div>
                <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>
                  {dp.et.done} HT · {dp.et.over} QH · {dp.da.length} tổng
                </div>
              </div>
              <div style={{ width: 120, height: 10, borderRadius: 999, background: C.pinkSoft, overflow: "hidden" }}>
                <div style={{ width: `${dp.et.rate}%`, height: "100%", borderRadius: 999, background: dp.et.rate >= 70 ? C.mint : dp.et.rate >= 40 ? C.marigold : C.rasp, transition: "width .6s ease" }} />
              </div>
              <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 16, color: C.plum, minWidth: 44, textAlign: "right" }}>{dp.et.rate}%</span>
              <Tag color={dp.risk.c} bg={dp.risk.bg}>{dp.risk.l}</Tag>
            </div>
          ))}
        </div>
      </Card>

      {/* Leaderboard */}
      <IndividualLeaderboard acts={acts} />
    </div>
  );
}

/* --- ReportsView (with AI via Anthropic proxy) --- */
function ReportsView({ acts }) {
  const [period, setPeriod] = useState("thang");
  const [scope, setScope] = useState("all");
  const [ai, setAi] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const scoped = scope === "all" ? acts : acts.filter((a) => a.dept === scope);
  const scopeLabel = scope === "all" ? "Toàn nhà máy" : (DEPTS.find((d) => d.id === scope)?.name || scope);
  const e = tally(scoped), d = docTally(scoped);
  const deptRows = DEPTS.map((dp) => { const da = scoped.filter((a) => a.dept === dp.id); const t = tally(da); return { ...dp, ...t }; }).filter((r) => r.total > 0);
  const overdueList = scoped.map((a) => a.alert && a.alert.kind === "over" ? { id: a.id, name: a.name, stage: a.alert.stage, dleft: a.alert.dleft } : null).filter(Boolean);
  const pl = PLABEL[period];
  const html = () => buildReportHTML(period, scopeLabel, e, d, deptRows, overdueList, ai);

  const generate = async () => {
    setLoading(true); setErr(""); setAi("");
    const deptStr = deptRows.length ? "Theo bộ phận: " + deptRows.map((r) => `${r.name} (HT ${r.done}, QH ${r.over}, tỷ lệ ${r.rate}%)`).join("; ") : "";
    const ovStr = overdueList.length ? "Quá hạn: " + overdueList.map((o) => `${o.id} (mốc ${o.stage}, trễ ${Math.abs(o.dleft)} ngày)`).join("; ") : "Không có hạng mục quá hạn.";

    // Gọi n8n webhook AI report (OpenAI key ở backend, KHÔNG ở frontend)
    const aiWebhookUrl = import.meta.env.VITE_N8N_AI_REPORT_URL || "";
    if (!aiWebhookUrl) {
      setErr("Chưa cấu hình VITE_N8N_AI_REPORT_URL. Liên hệ IT.");
      setLoading(false);
      return;
    }

    const reportData = {
      action: "ai_report",
      period: period,
      period_label: pl?.t || "",
      period_sub: pl?.p || "",
      scope: scopeLabel,
      validation: { done: e.done, over: e.over, todo: e.todo, total: e.total, rate: e.rate },
      documentation: { done: d.done, over: d.over, todo: d.todo, total: d.total, rate: d.rate },
      by_dept: deptStr,
      overdue: ovStr,
    };

    try {
      const token = await getAccessToken();
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(aiWebhookUrl, { method: "POST", headers, body: JSON.stringify(reportData) });
      const json = await res.json();

      if (json.ok && json.ai_text) {
        setAi(json.ai_text);
      } else if (json.error) {
        setErr(`Lỗi AI: ${json.error}`);
      } else {
        setErr("Không nhận được phản hồi AI từ n8n.");
      }
    } catch (ex) { setErr("Lỗi kết nối n8n: " + (ex?.message || "không xác định")); }
    finally { setLoading(false); }
  };

  const printPDF = () => {
    const ifr = document.createElement("iframe");
    ifr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(ifr); const dd = ifr.contentWindow.document;
    dd.open(); dd.write(html()); dd.close();
    setTimeout(() => { try { ifr.contentWindow.focus(); ifr.contentWindow.print(); } catch {} setTimeout(() => document.body.removeChild(ifr), 1500); }, 400);
  };

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const wsData = [["Nhóm", "HT", "QH", "Chưa", "Tổng", "Tỷ lệ"], ["Thẩm định", e.done, e.over, e.todo, e.total, e.rate], ["Hồ sơ", d.done, d.over, d.todo, d.total, d.rate], [], ["Bộ phận", "HT", "QH", "Chưa", "Tổng", "Tỷ lệ"], ...deptRows.map((r) => [r.name, r.done, r.over, r.todo, r.total, r.rate])];
    const ws = XLSX.utils.aoa_to_sheet(wsData); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Báo cáo"); XLSX.writeFile(wb, `VMP_${period}_CPC1HN.xlsx`);
  };

  const Seg = ({ id, label }) => <button onClick={() => { setPeriod(id); setAi(""); }} style={{ padding: "10px 17px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: TEXT, fontSize: 13, fontWeight: 800, background: period === id ? GRAD : C.pinkSoft, color: period === id ? "#fff" : C.plumSoft }}>{label}</button>;

  const statRow = (lbl, x, dotc) => (
    <tr style={{ borderTop: `1px solid ${C.line}` }}>
      <td style={{ padding: 13, fontSize: 13.5, fontWeight: 800, color: C.plum }}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 999, background: dotc, marginRight: 8 }} />{lbl}</td>
      <td style={{ padding: 13, textAlign: "center", color: C.mintText, fontWeight: 800 }}>{x.done}</td>
      <td style={{ padding: 13, textAlign: "center", color: C.raspText, fontWeight: 800 }}>{x.over}</td>
      <td style={{ padding: 13, textAlign: "center", color: C.marigoldText, fontWeight: 800 }}>{x.todo}</td>
      <td style={{ padding: 13, textAlign: "center", fontWeight: 800, fontFamily: NUM }}>{x.total}</td>
      <td style={{ padding: 13, textAlign: "center" }}><span style={{ fontFamily: NUM, fontWeight: 800, color: "#fff", background: C.mintText, padding: "4px 11px", borderRadius: 999, fontSize: 12.5 }}>{x.rate}%</span></td>
    </tr>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Card>
        <CardTitle icon={FileBarChart}>Thiết lập báo cáo</CardTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-end" }}>
          <div><div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 800, marginBottom: 9 }}>Kỳ</div><div style={{ display: "flex", gap: 8 }}><Seg id="tuan" label="Tuần" /><Seg id="thang" label="Tháng" /><Seg id="quy" label="Quý" /></div></div>
          <div><div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 800, marginBottom: 9 }}>Phạm vi</div><select value={scope} onChange={(e2) => { setScope(e2.target.value); setAi(""); }} style={{ ...glass, borderRadius: 12, padding: "11px 16px", fontFamily: TEXT, fontSize: 14, color: C.plum, fontWeight: 700, cursor: "pointer", outline: "none" }}><option value="all">Toàn nhà máy</option>{DEPTS.map((dp) => <option key={dp.id} value={dp.id}>{dp.name}</option>)}</select></div>
          <button onClick={generate} disabled={loading} style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 9, padding: "13px 24px", borderRadius: 14, fontSize: 14.5 }}>{loading ? <RefreshCw size={17} className="spin" /> : <SparkIcon size={17} />} {loading ? "AI đang phân tích…" : "Tạo nhận xét AI"}</button>
        </div>
      </Card>
      <Card variant="strong">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ background: C.pinkText, color: "#fff", fontWeight: 800, borderRadius: 10, padding: "8px 12px", fontSize: 12.5 }}>CPC1 HN</span><div><div style={{ fontFamily: TEXT, fontSize: 19, fontWeight: 800, color: C.plum }}>{pl.t}</div><div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 700 }}>{pl.p} · {scopeLabel}</div></div></div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={printPDF} style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", borderRadius: 12, border: "none", cursor: "pointer", background: GRAD, color: "#fff", fontFamily: TEXT, fontWeight: 800, fontSize: 13 }}><Printer size={16} /> PDF</button>
            <button onClick={exportExcel} style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", borderRadius: 12, border: "none", cursor: "pointer", background: C.mintSoft, color: C.mintText, fontFamily: TEXT, fontWeight: 800, fontSize: 13 }}><Download size={16} /> Excel</button>
            <button onClick={() => download(`BaoCao_${period}.html`, html())} style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", borderRadius: 12, border: "none", cursor: "pointer", background: C.lavSoft, color: C.lavText, fontFamily: TEXT, fontWeight: 800, fontSize: 13 }}><Download size={16} /> HTML</button>
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT }}><thead><tr>{["Nhóm", "HT", "QH", "Chưa", "Tổng", "Tỷ lệ"].map((h, i) => <th key={i} style={{ textAlign: i ? "center" : "left", fontSize: 11, color: C.plumSoft, fontWeight: 800, padding: "0 13px 13px" }}>{h}</th>)}</tr></thead><tbody>{statRow("Thẩm định thực tế", e, C.mint)}{statRow("Hoàn thiện hồ sơ", d, C.sky)}</tbody></table>
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}><SparkIcon size={18} color={C.pink} /><span style={{ fontFamily: TEXT, fontSize: 17, fontWeight: 800, color: C.plum }}>Nhận xét AI</span><Tag color={C.raspText} bg={C.raspSoft}>Cần QA xác nhận</Tag></div>
          {err && <div style={{ color: C.raspText, fontSize: 13.5, fontWeight: 800, padding: "13px 15px", borderRadius: 12, background: C.raspSoft }}><AlertCircle size={16} /> {err}</div>}
          {loading && <div style={{ padding: 32, textAlign: "center", color: C.plumSoft, fontWeight: 700 }}><RefreshCw size={22} className="spin" color={C.pink} /><div style={{ marginTop: 10 }}>AI đang phân tích…</div></div>}
          {!loading && !err && ai && <div style={{ whiteSpace: "pre-wrap", fontFamily: TEXT, fontSize: 14, color: C.plum, lineHeight: 1.8, fontWeight: 500, background: C.pinkMist, borderLeft: `4px solid ${C.pink}`, borderRadius: "0 14px 14px 0", padding: "18px 22px" }}>{ai}</div>}
          {!loading && !err && !ai && <div style={{ padding: 28, textAlign: "center", color: C.plumSoft, fontSize: 14, fontWeight: 700, border: `2px dashed ${C.pinkSoft}`, borderRadius: 16 }}>Bấm <b style={{ color: C.pinkText }}>Tạo nhận xét AI</b> để phân tích báo cáo.</div>}
        </div>
      </Card>
    </div>
  );
}

/* ===================== GLOBAL CSS ===================== */
const GlobalStyles = () => (
  <style>{`
    *{box-sizing:border-box;}
    .vmp-scroll::-webkit-scrollbar{width:9px;height:9px;}
    .vmp-scroll::-webkit-scrollbar-thumb{background:${C.pink}55;border-radius:9px;}
    .vmp-scroll::-webkit-scrollbar-track{background:transparent;}
    .card{transition:transform .25s ease, box-shadow .25s ease;}
    .card:hover{transform:translateY(-3px);box-shadow:0 18px 42px rgba(238,123,169,.20);}
    .vmp-nav:hover{background:${C.pinkMist}!important;color:${C.plum}!important;}
    .vmp-row{transition:background .18s ease;}
    .vmp-row:hover{background:${C.pinkMist};}
    @keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:none;}}
    .fade{animation:fadeUp .5s ease both;}
    @keyframes twinkle{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
    @keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
    .tw{animation:twinkle 2.6s ease-in-out infinite, floaty 5s ease-in-out infinite;pointer-events:none;z-index:0;}
    @keyframes bob{0%,100%{transform:translateY(0) rotate(-1.5deg)}50%{transform:translateY(-7px) rotate(1.5deg)}}
    .bob{animation:bob 3.4s ease-in-out infinite;transform-origin:50% 60%;}
    @keyframes pop{0%{opacity:0;transform:scale(.9) translateY(8px)}100%{opacity:1;transform:none}}
    .pop{animation:pop .5s ease both;}
    @keyframes rise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
    .rise{animation:rise .6s cubic-bezier(.22,1,.36,1) both;}
    @keyframes spin{to{transform:rotate(360deg)}}
    .spin{animation:spin .9s linear infinite;}
    @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
    input::placeholder{color:#B79BB2;}
    select{appearance:none;}
    @media (max-width:760px){.login-grid{grid-template-columns:1fr!important;} .vmp-sidebar{display:none!important;}}
    @media (prefers-reduced-motion: reduce){
      .tw,.bob,.fade,.pop,.rise{animation:none!important;}
      .card{transition:none!important;}
      .card:hover{transform:none!important;}
    }
  `}</style>
);

/* ===================== MAIN APP ===================== */
export default function App() {
  const { user, setUser, login, logout, isAdmin } = useAuth();
  const { objects, acts, conn, lastSync, saveStatus, reloadData, silentRefresh, updateActivity, saveObject, deleteObject, setConn } = useVmpData();
  const [view, setView] = useState("overview");
  const [showPw, setShowPw] = useState(false);
  const mainRef = useScrollTop([view]);

  // Load fonts
  useEffect(() => {
    const id = "pastel-fonts";
    if (!document.getElementById(id)) {
      const l = document.createElement("link"); l.id = id; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Quicksand:wght@400;500;600;700&display=swap";
      document.head.appendChild(l);
    }
  }, []);

  // Login screen
  if (!user) return (
    <>
      <GlobalStyles />
      <LoginScreen onLogin={(u) => { setUser(u); saveUser(u); }} />
    </>
  );

  const title = NAV_ITEMS.find((n) => n.id === view)?.label || "Tổng quan";
  const stars = [
    { t: "10%", l: "30%", s: 14, c: C.gold, d: "0s" },
    { t: "24%", l: "92%", s: 12, c: C.pink, d: ".8s" },
    { t: "55%", l: "96%", s: 16, c: C.lav, d: "1.4s" },
    { t: "82%", l: "34%", s: 12, c: C.sky, d: ".5s" },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: TEXT, color: C.plum, overflow: "hidden" }}>
      <GlobalStyles />
      {showPw && <ChangePwModal user={user} onClose={() => setShowPw(false)} />}

      <Sidebar
        view={view} setView={setView} user={user}
        connected={conn.status === "ok"}
        onLogout={logout}
        onChangePw={() => setShowPw(true)}
      />

      <main ref={mainRef} className="vmp-scroll" style={{
        flex: 1, overflowY: "auto", position: "relative",
        background: `radial-gradient(720px 520px at 88% -6%, ${C.pinkMist}, transparent 60%),
          radial-gradient(640px 520px at -6% 104%, ${C.lavSoft}, transparent 55%),
          radial-gradient(520px 420px at 50% 55%, rgba(226,241,250,.45), transparent 70%),
          linear-gradient(160deg, ${C.bg1}, ${C.bg2})`,
      }}>
        {stars.map((s, i) => (
          <div key={i} className="tw" style={{ position: "absolute", top: s.t, left: s.l, animationDelay: s.d }}>
            <Sparkle size={s.s} color={s.c} />
          </div>
        ))}

        <div style={{ position: "relative", zIndex: 1 }}>
          <Topbar
            title={title} user={user} sub={NAV_SUBS[view]}
            onRefresh={reloadData} refreshing={conn.status === "loading"}
            lastSync={lastSync}
          />

          {/* Toast trạng thái lưu nổi góc phải */}
          {saveStatus && (
            <div style={{
              position: "fixed", top: 20, right: 20, zIndex: 9999,
              padding: "12px 18px", borderRadius: 14, fontFamily: TEXT, fontWeight: 700, fontSize: 13.5,
              display: "flex", alignItems: "center", gap: 10, maxWidth: 380,
              boxShadow: "0 8px 28px rgba(120,60,110,.22)",
              background: saveStatus === "saving" ? "#fff"
                : saveStatus === "saved" ? C.mintSoft
                : saveStatus === "warning" ? C.marigoldSoft : C.raspSoft,
              color: saveStatus === "saving" ? C.plum
                : saveStatus === "saved" ? C.mintText
                : saveStatus === "warning" ? C.marigoldText : C.raspText,
              border: `1.5px solid ${saveStatus === "saving" ? C.pinkSoft
                : saveStatus === "saved" ? C.mint
                : saveStatus === "warning" ? C.marigold : C.rasp}`,
            }}>
              <span style={{ fontSize: 18 }}>
                {saveStatus === "saving" ? "⏳" : saveStatus === "saved" ? "✓" : saveStatus === "warning" ? "⚠" : "✕"}
              </span>
              <span>
                {saveStatus === "saving" ? "Đang lưu…"
                  : saveStatus === "saved" ? "Đã lưu thành công"
                  : saveStatus === "warning" ? "Lưu Supabase OK — Sheet chưa đồng bộ"
                  : "Lưu thất bại"}
              </span>
            </div>
          )}

          <div style={{ padding: "0 34px 38px" }}>
            {/* Loading state */}
            {objects.length === 0 && conn.status === "loading" && <SkeletonDashboard />}

            {/* Empty / Error state */}
            {objects.length === 0 && conn.status !== "loading" && (
              <div style={{
                marginBottom: 22, padding: "16px 18px", borderRadius: 16,
                border: `1.5px solid ${conn.status === "err" ? C.raspSoft : C.pinkSoft}`,
                background: conn.status === "err" ? C.raspSoft : "#fff",
                display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
              }}>
                <div style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: conn.status === "err" ? "#fff" : C.pinkMist, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {conn.status === "err" ? <AlertCircle size={22} color={C.raspText} /> : <Cloud size={22} color={C.pink} />}
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: conn.status === "err" ? C.raspText : C.plum }}>
                    {conn.status === "err" ? "Chưa tải được dữ liệu" : conn.readUrl ? "Đang chờ đồng bộ…" : "Chưa cấu hình kết nối"}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600, marginTop: 3 }}>
                    {conn.msg || "Nhúng URL webhook trong .env hoặc bấm Làm mới."}
                  </div>
                </div>
                {conn.readUrl && (
                  <button onClick={reloadData} style={{ ...btnPrimary, padding: "10px 18px", borderRadius: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <RefreshCw size={15} /> Thử lại
                  </button>
                )}
              </div>
            )}

            {/* Sync warning banner */}
            {acts.length > 0 && <SyncBanner conn={conn} lastSync={lastSync} />}

            {/* Page router */}
            {view === "overview" && <Overview acts={acts} setView={setView} />}
            {view === "timeline" && <TimelineView acts={acts} />}
            {view === "inventory" && <InventoryView objects={objects} acts={acts} canEdit={isAdmin} onSave={saveObject} onDelete={deleteObject} conn={conn} />}
            {view === "update" && <UpdateView acts={acts} conn={conn} isAdmin={isAdmin} onUpdate={updateActivity} />}
            {view === "alerts" && <AlertsView acts={acts} />}
            {view === "risk" && <QrmView acts={acts} />}
            {view === "workload" && <WorkloadView acts={acts} />}
            {view === "reports" && <ReportsView acts={acts} />}
            {view === "mismatch" && <MismatchView acts={acts} />}
            {view === "quality" && <DataQualityView acts={acts} />}
            {view === "missing" && <AdminMissingView isAdmin={isAdmin} onReload={reloadData} />}
            {view === "audit" && <AuditLogView />}
            {view === "admin" && <AdminView conn={conn} user={user} />}
          </div>
        </div>
      </main>
    </div>
  );
}

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
import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from "react";

// ===== External libs =====
import {
  Boxes,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Filter,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  XCircle,
  Plus,

  Radar,
  Cloud,
  FileText,
  Clock, ClipboardCheck, FileWarning, ChevronRight, Search, Users, Scale,
} from "lucide-react";
// Lưu ý: recharts đã bị gỡ vì KHÔNG dùng (chỉ import thừa, nặng bundle).
// xlsx được nạp động (dynamic import) ngay trong hàm xuất Excel để giảm bundle ban đầu.

// ===== Internal modules (refactored) =====
import { C, TEXT, NUM, btnPrimary, INP } from "./constants/theme.ts";
import {

  DEPTS,
  DEPT_CODE,
  PERM_LABEL,
  NAV_ITEMS,
  NAV_SUBS,
  PERIODS,
  vmpToday,
  LOAI_LOI,
  sevOf,
} from "./constants/vmp.ts";
import {
  tally,
  docTally,
  inPeriod,
  runDataQualityChecks,
  wlIsDone,
} from "./utils/helpers.ts";
import { useScrollTop, useAuth, useVmpData, useDebounce } from "./hooks/index.ts";
import { docUrl, vietUrl, MAC_DINH } from "./lib/urlState.ts";
import type { UrlState } from "./lib/urlState.ts";
import { fetchSystemStatus } from "./lib/supabaseData.ts";
import type { SystemStatus } from "./lib/supabaseData.ts";
import type { ConnState } from "./hooks/index.ts";

// ===== UI Primitives =====
import {
  Sparkle,
  Card,
  CardTitle,
  Tag,
  Modal,

  KpiCard,
  Sel,
  SkeletonDashboard,
  SyncBanner,
  GuardianSilhouette,
  PrincessCommentary, StatTile, MultiSelect, GiaiThich, MAU_SO, Pill} from "./components/ui/Primitives.tsx";
import { Sidebar, Topbar } from "./components/layout/Layout.tsx";

// ===== Page components (lazy-loaded — mỗi màn tải theo yêu cầu để giảm bundle
// ban đầu; chỉ đụng cấu trúc UI, KHÔNG thay đổi luồng dữ liệu Sheet→Supabase). =====
const TimelineView = lazy(() => import("./pages/TimelinePage.tsx"));
const AlertsView = lazy(() => import("./pages/AlertsPage.tsx"));
const CatalogView = lazy(() => import("./pages/CatalogPage.tsx"));
const WorkloadView = lazy(() => import("./pages/WorkloadPage.tsx"));
const SourceCatalogView = lazy(() => import("./pages/SourceCatalogPage.tsx"));
const ServerChecksView = lazy(() => import("./pages/ServerChecksPage.tsx"));
const UpdateView = lazy(() => import("./pages/UpdatePage.tsx"));
const ActiveRulesView = lazy(() => import("./pages/ActiveRulesPage.tsx"));
const TodayView = lazy(() => import("./pages/TodayPage.tsx"));
const ChatBox = lazy(() => import("./components/ai/ChatBox.tsx"));
import VongNam from "./components/dashboard/VongNam.tsx";
import LoginCrown from "./components/three/LoginCrown.tsx";
import CompletionDashboard from "./components/dashboard/CompletionDashboard.tsx";
import MaTranTienDo from "./components/dashboard/MaTranTienDo.tsx";
import ReportsView from "./components/dashboard/ReportsView.tsx";

// ===== Legacy lib imports (kept for compatibility) =====
import { saveUser, loadUser, loadFilterPrefs, saveFilterPrefs } from "./lib/config.ts";
import type { ReactNode } from "react";
import type { Activity, AppUser } from "./types/domain.ts";
import type { Database } from "./types/database.ts";
import {
  isSupabaseConfigured,
  signIn,
  changePassword,
  supabase,
} from "./lib/supabaseClient.ts";

/* ===================== Daily greetings ===================== */
// Lời chào theo khung giờ (cập nhật mỗi lần render trang đăng nhập)
function getTimeOfDayGreeting() {
  const h = new Date().getHours();
  if (h >= 5  && h < 11) return "Chào buổi sáng! Chúc bạn một ngày mới tràn đầy năng lượng.";
  if (h >= 11 && h < 13) return "Chúc bạn một buổi trưa thật nhẹ nhàng và ngon miệng.";
  if (h >= 13 && h < 17) return "Chào buổi chiều! Chúc bạn tiếp tục một buổi chiều hiệu quả.";
  if (h >= 17 && h < 22) return "Chào buổi tối! Cảm ơn vì sự nỗ lực của bạn hôm nay.";
  return "Khuya rồi — nhớ chăm sóc sức khoẻ bạn nhé.";
}

// Câu chúc xoay vòng theo ngày — ổn định trong cả ngày, đổi khi sang ngày mới
const DAILY_WISHES = [
  "Một ngày mới — một cơ hội mới để làm điều tử tế.",
  "Bạn đang góp phần bảo vệ chất lượng cuộc sống của rất nhiều người.",
  "Mỗi nỗ lực hôm nay là nền móng cho một ngày mai vững chắc hơn.",
  "Hãy tin vào những gì bạn đang làm — nó quan trọng hơn bạn nghĩ.",
  "Hôm nay là một ngày tuyệt vời để học thêm một điều mới.",
  "Chúc bạn một ngày làm việc trọn vẹn niềm vui và bình an.",
  "Sự tử tế và chỉn chu của bạn hôm nay sẽ tạo nên sự khác biệt.",
  "Việc bạn làm hôm nay quan trọng — vì sau mỗi quy trình là một con người.",
  "Hãy bắt đầu nhẹ nhàng, kết thúc trọn vẹn. Chúc bạn một ngày tốt lành.",
  "Cảm ơn bạn đã có mặt hôm nay — V/Q Team luôn cần bạn.",
];
function getDailyWish() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - start.getTime()) / 86400000);
  return DAILY_WISHES[dayOfYear % DAILY_WISHES.length];
}

/* ===================== Login ===================== */
function LoginScreen({ onLogin }: { onLogin: (profile: AppUser) => void }) {
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
    } catch (e) { setErr((e as Error).message || "Đăng nhập thất bại."); }
    setLoading(false);
  };
  const field = (
    icon: ReactNode,
    props: React.InputHTMLAttributes<HTMLInputElement>,
    right?: ReactNode,
  ) => (
    <div
      className="vq-input-shell"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 16px",
        borderRadius: 14,
        background: "#F8F9FB",
        border: "1px solid #E5E7EB",
      }}
    >
      {icon}
      <input
        {...props}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={{
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 14,
          color: "#1F2937",
          width: "100%",
          fontWeight: 500,
        }}
      />
      {right}
    </div>
  );
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: 24,
        background:
          "radial-gradient(800px 600px at 88% -8%, #F4E7F0, transparent 60%), radial-gradient(700px 600px at -6% 108%, #E8E3F5, transparent 55%), linear-gradient(160deg, #FBF8FC, #F2EEF7)",
      }}
    >
      <div
        className="vq-login-grid"
        style={{
          width: "100%",
          maxWidth: 980,
          display: "grid",
          gridTemplateColumns: "1.05fr 1fr",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(94, 53, 132, .22), 0 8px 24px rgba(94, 53, 132, .10)",
          background: C.surface,
        }}
      >
        {/* ===== LEFT — Brand Panel · Quiet Luxury ===== */}
        <div
          style={{
            background:
              "radial-gradient(900px 700px at 105% 105%, #4A2353 0%, #3D1B45 55%, #371740 100%)",
            padding: "56px 64px 48px 56px",
            color: "#FFFFFF",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minHeight: 580,
          }}
        >
          {/* Guardian silhouette — bottom-right, faint watermark.
              Giữ nguyên làm nền: vương miện 3D nằm đè lên phía trên, và khi
              máy không có WebGL thì hình chìm này vẫn còn, panel không trống. */}
          <div
            style={{
              position: "absolute",
              right: -90,
              bottom: -80,
              zIndex: 0,
              pointerEvents: "none",
            }}
          >
            <GuardianSilhouette color="#F4E2BA" opacity={0.07} width={420} />
          </div>

          {/* Vương miện 3D — panel này không có con số nào phải đọc nên được
              phép để đồ hoạ chiếm chỗ. */}
          <LoginCrown />

          {/* Top — CPC1HN masthead (corporate presence, refined pill) */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "6px 10px",
                background: "rgba(255, 255, 255, 0.97)",
                borderRadius: 8,
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
              }}
            >
              <img
                src="./logo-cpc1hn.png"
                alt="CPC1 HN"
                style={{ height: 40, width: "auto", display: "block" }}
              />
            </div>
          </div>

          {/* Flexible upper spacer — pushes title block to lower 2/3 */}
          <div style={{ flex: 1.2 }} />

          {/* Editorial title block */}
          <div style={{ position: "relative", zIndex: 1 }}>
            {/* Champagne gold hairline */}
            <div
              style={{
                height: 1.5,
                width: 36,
                background: "#C9A961",
                marginBottom: 28,
                opacity: 0.95,
              }}
            />

            {/* V/Q — line 1 */}
            <div
              style={{
                fontFamily: "'Cormorant Garamond', 'Times New Roman', serif",
                fontSize: 40,
                fontWeight: 500,
                lineHeight: 0.92,
                letterSpacing: "-0.02em",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "baseline",
              }}
            >
              <span>V</span>
              <span
                style={{
                  color: "#C9A961",
                  fontWeight: 400,
                  margin: "0 -0.04em",
                }}
              >
                /
              </span>
              <span>Q</span>
            </div>

            {/* TEAM — line 2 */}
            <div
              style={{
                fontFamily: "'Cormorant Garamond', 'Times New Roman', serif",
                fontSize: 40,
                fontWeight: 500,
                lineHeight: 0.92,
                letterSpacing: "0.01em",
                color: "#FFFFFF",
                marginTop: 4,
                marginBottom: 30,
              }}
            >
              TEAM
            </div>

            {/* Tagline — Validation & Qualification */}
            <div
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "0.32em",
                textTransform: "uppercase",
                color: "#C9A961",
                opacity: 0.92,
              }}
            >
              Validation &nbsp;&amp;&nbsp; Qualification
            </div>
          </div>

          {/* Flexible lower spacer */}
          <div style={{ flex: 0.5 }} />

          {/* Bottom — Department signature */}
          <div
            style={{
              position: "relative",
              zIndex: 1,
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 12,
              fontWeight: 400,
              color: "#FFFFFF",
              opacity: 0.62,
              letterSpacing: "0.08em",
            }}
          >
            Phòng Quản lý Chất lượng
          </div>
        </div>

        {/* ===== RIGHT — Form Panel ===== */}
        <div
          style={{
            background: "#FCFCFD",
            padding: "56px 48px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontFamily: "'Poppins', system-ui, sans-serif",
              fontSize: 28,
              fontWeight: 600,
              color: "#1F2937",
              letterSpacing: "-0.01em",
            }}
          >
            Xin chào!
          </div>
          <div
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 14,
              color: "#6B7280",
              marginTop: 8,
              marginBottom: 28,
              fontWeight: 500,
              lineHeight: 1.55,
            }}
          >
            {getTimeOfDayGreeting()}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {field(
              <Boxes size={18} color="#A04D88" />,
              {
                placeholder: useSupa ? "Email" : "Tài khoản",
                value: u,
                onChange: (e) => {
                  setU(e.target.value);
                  setErr("");
                },
              }
            )}
            {field(
              <Lock size={18} color="#A04D88" />,
              {
                placeholder: "Mật khẩu",
                type: show ? "text" : "password",
                value: p,
                onChange: (e) => {
                  setP(e.target.value);
                  setErr("");
                },
              },
              <button
                onClick={() => setShow(!show)}
                style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex" }}
                aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {show ? <EyeOff size={17} color="#6B7280" /> : <Eye size={17} color="#6B7280" />}
              </button>
            )}

            {err && (
              <div
                style={{
                  color: "#B91C1C",
                  fontSize: 14,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
              >
                <XCircle size={15} /> {err}
              </div>
            )}

            <button
              className="vq-luxury-btn"
              onClick={submit}
              disabled={loading}
              style={{
                marginTop: 8,
                height: 56,
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                color: "#fff",
                fontFamily: "'Poppins', system-ui, sans-serif",
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "0.02em",
                borderRadius: 14,
                background: "linear-gradient(135deg, #B5477A 0%, #6F58C9 100%)",
                boxShadow: "0 8px 25px rgba(111, 88, 201, .32), 0 2px 8px rgba(181, 71, 122, .20)",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
          </div>

          {useSupa ? (
            <div
              style={{
                marginTop: 26,
                paddingTop: 20,
                borderTop: "1px solid #F3F4F6",
                textAlign: "center",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  fontFamily: "'Poppins', system-ui, sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.32em",
                  textTransform: "uppercase",
                  color: "#A04D88",
                  opacity: 0.7,
                  marginBottom: 8,
                }}
              >
                ✦ &nbsp; Lời chúc hôm nay &nbsp; ✦
              </div>
              <div
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: 14,
                  fontStyle: "italic",
                  color: "#6B5572",
                  lineHeight: 1.65,
                  fontWeight: 500,
                  padding: "0 6px",
                }}
              >
                “{getDailyWish()}”
              </div>
            </div>
          ) : (
            <div
              style={{
                marginTop: 22,
                padding: "12px 15px",
                borderRadius: 14,
                background: "#FFFBEB",
                border: "1px solid #FEF3C7",
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 12,
                color: "#92400E",
                fontWeight: 500,
              }}
            >
              Chế độ tạm (chưa có Supabase). Xem hướng dẫn để nâng cấp.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== Change Password ===================== */
function ChangePwModal({ onClose }: { onClose: () => void }) {
  const [np, setNp] = useState(""); const [cf, setCf] = useState(""); const [msg, setMsg] = useState({ type: "", text: "" }); const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (np.length < 6) return setMsg({ type: "err", text: "Mật khẩu mới tối thiểu 6 ký tự." });
    if (np !== cf) return setMsg({ type: "err", text: "Xác nhận không khớp." });
    if (isSupabaseConfigured()) {
      setLoading(true);
      try { await changePassword(np); setMsg({ type: "ok", text: "Đổi mật khẩu thành công!" }); setNp(""); setCf(""); }
      catch (e) { setMsg({ type: "err", text: (e as Error).message }); }
      setLoading(false);
    } else { setMsg({ type: "err", text: "Cần Supabase để đổi mật khẩu." }); }
  };
  return (
    <Modal onClose={onClose} title="Đổi mật khẩu" icon={KeyRound}>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {["Mật khẩu mới", "Xác nhận"].map((ph, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", borderRadius: 14, background: C.surface, border: `1.5px solid ${C.pinkSoft}` }}>
            <KeyRound size={16} color={C.pink} />
            <input type="password" placeholder={ph} value={i === 0 ? np : cf}
              onChange={(e) => { (i === 0 ? setNp : setCf)(e.target.value); setMsg({ type: "", text: "" }); }}
              style={{ border: "none", outline: "none", background: "transparent", fontFamily: TEXT, fontSize: 14, color: C.plum, width: "100%", fontWeight: 600 }} />
          </div>
        ))}
        {msg.text && <div style={{ fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", gap: 6, color: msg.type === "ok" ? C.mintText : C.raspText }}>{msg.type === "ok" ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {msg.text}</div>}
        <button onClick={submit} disabled={loading} style={{ ...btnPrimary, marginTop: 4, padding: "13px", borderRadius: 14, fontSize: 14 }}>{loading ? "Đang lưu…" : "Xác nhận"}</button>
      </div>
    </Modal>
  );
}

/* ===================== Data Quality Page (NEW) ===================== */
/* ----------------------------------------------------------------
 * Sức khoẻ dữ liệu — gộp hai màn trước đây tách rời:
 *   · "Data quality" kiểm tra TRÊN BẢN ĐANG XEM ở trình duyệt
 *   · "Kiểm tra máy chủ" chạy kiểm tra THẲNG Ở SUPABASE
 * Hai màn cùng trả lời một câu hỏi ("dữ liệu có sạch không") nên tách ra
 * chỉ khiến người dùng phải tự nhớ cái nào đang xem cái gì. Gộp lại,
 * ghi rõ cái nào chạy ở đâu — chênh nhau giữa hai tab chính là tín hiệu
 * bản trên máy đã cũ.
 * -------------------------------------------------------------- */
function HealthView({ acts, user }: { acts: Activity[]; user?: AppUser | null }) {
  const [tab, setTab] = useState<"client" | "server">("client");
  const tabs = [
    { id: "client" as const, label: "Lỗi trên bản đang xem", sub: "chạy ở trình duyệt" },
    { id: "server" as const, label: "Kiểm tra tại Supabase", sub: "chạy ở máy chủ" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "9px 16px", borderRadius: 14, cursor: "pointer",
                     fontFamily: TEXT, fontSize: 14, fontWeight: tab === t.id ? 800 : 600,
                     border: `1.5px solid ${tab === t.id ? C.pink : C.pinkSoft}`,
                     background: tab === t.id ? C.pinkSoft : C.surface,
                     color: tab === t.id ? C.pinkText : C.plumSoft, textAlign: "left" }}>
            {t.label}
            <span style={{ display: "block", fontSize: 12, fontWeight: 600, opacity: .75 }}>
              {t.sub}
            </span>
          </button>
        ))}
      </div>
      {tab === "client" ? <DataQualityView acts={acts} /> : <ServerChecksView user={user} />}
    </div>
  );
}

/* ----------------------------------------------------------------
 * Sức khoẻ dữ liệu — GOM NHÓM thay vì đổ một mạch.
 *
 * Bản cũ in thẳng từng vấn đề ra một danh sách phẳng: 43.000 ký tự,
 * hàng trăm dòng na ná nhau, cuộn mãi không hết và không ai biết bắt
 * đầu từ đâu. Cùng một lỗi lặp 281 lần vẫn chiếm 281 dòng.
 *
 * Nay mỗi LOẠI lỗi là một nhóm gập được: tiêu đề nói rõ lỗi gì, bao
 * nhiêu hạng mục, sửa ở đâu. Mở ra mới dựng danh sách bên trong, và
 * cũng chỉ dựng 20 dòng đầu — trang nhẹ hẳn.
 * -------------------------------------------------------------- */

// LOAI_LOI, SEV, sevOf: chuyển sang constants/vmp.ts (2026-07-30) để ReportsView
// dùng chung, không copy lại nhãn lỗi.

function DataQualityView({ acts }: { acts: Activity[] }) {
  const issues = useMemo(() => runDataQualityChecks(acts), [acts]);
  /** Một vấn đề chất lượng dữ liệu, từ bảng data_quality_issues hoặc kiểm tra tại client. */
  interface QualityIssue {
    issue_type: string;
    severity: string;
    field_name?: string | null;
    message: string;
    detected_at?: string | null;
    plan_item_id?: string | null;
    id?: string;
  }
  const [serverIssues, setServerIssues] = useState<QualityIssue[]>([]);
  const [serverErr, setServerErr] = useState("");
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;
    supabase.from("data_quality_issues")
      .select("issue_type,severity,field_name,message,detected_at,plan_item_id")
      .eq("is_resolved", false)
      .order("detected_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => { if (error) setServerErr(error.message); else setServerIssues((data || []) as QualityIssue[]); },
            () => setServerErr("Không đọc được bảng lỗi của hệ thống"));
  }, []);

  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const kw = useDebounce(q.trim().toLowerCase(), 250);
  const [mo, setMo] = useState<Record<string, boolean>>({});
  const [hien, setHien] = useState<Record<string, number>>({});

  const sevCount: Record<string, number> = { error: 0, warning: 0, info: 0 };
  issues.forEach((i) => { sevCount[i.severity] = (sevCount[i.severity] || 0) + 1; });

  // Gom theo LOẠI lỗi, xếp lỗi nặng trước, cùng mức thì nhiều hạng mục trước.
  const nhom = useMemo(() => {
    const m = new Map<string, { type: string; severity: string; ds: typeof issues }>();
    for (const it of issues) {
      if (filter !== "all" && it.severity !== filter) continue;
      if (kw && !(`${it.id} ${it.msg}`.toLowerCase().includes(kw))) continue;
      const k = it.type;
      if (!m.has(k)) m.set(k, { type: k, severity: it.severity, ds: [] });
      m.get(k)!.ds.push(it);
    }
    return [...m.values()].sort((a, b) =>
      sevOf(a.severity).uu_tien - sevOf(b.severity).uu_tien || b.ds.length - a.ds.length);
  }, [issues, filter, kw]);

  const tongHienThi = nhom.reduce((n, g) => n + g.ds.length, 0);

  // Lỗi từ máy chủ cũng gom theo loại — cùng lý do.
  const nhomServer = useMemo(() => {
    const m = new Map<string, QualityIssue[]>();
    for (const it of serverIssues) {
      const k = it.issue_type || "khác";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [serverIssues]);

  const nutNho = { fontFamily: TEXT, fontSize: 12, fontWeight: 700, color: C.plum,
                   border: `1.5px solid ${C.pinkSoft}`, background: C.surface,
                   borderRadius: 999, padding: "7px 13px", cursor: "pointer" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
        {[
          { id: "error", emoji: "🚫", bg: C.raspSoft, color: C.raspText, v: sevCount.error, l: "Lỗi nghiêm trọng" },
          { id: "warning", emoji: "⚠️", bg: C.marigoldSoft, color: C.marigoldText, v: sevCount.warning, l: "Cảnh báo" },
          { id: "info", emoji: "ℹ️", bg: C.skySoft, color: C.skyText, v: sevCount.info, l: "Thông tin" },
        ].map((c) => (
          <div key={c.id} onClick={() => setFilter(filter === c.id ? "all" : c.id)} style={{ cursor: "pointer" }}>
            <KpiCard emoji={c.emoji} bg={c.bg} color={c.color} value={c.v} label={c.l}
              sub={filter === c.id ? "● Đang lọc" : "Bấm để lọc"} subColor={c.color} />
          </div>
        ))}
      </div>

      <Card variant="strong">
        <CardTitle icon={Radar}
          sub={`${nhom.length} loại vấn đề · ${tongHienThi} hạng mục · gom theo loại để sửa một thể`}>
          Kiểm tra chất lượng dữ liệu
        </CardTitle>

        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1.5px solid ${C.pinkSoft}`, background: C.surface, borderRadius: 999, padding: "7px 13px" }}>
            <Search size={14} color={C.plumSoft} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã hạng mục hoặc nội dung lỗi…"
              style={{ border: "none", outline: "none", background: "transparent", fontFamily: TEXT, fontSize: 12, fontWeight: 600, color: C.plum, width: 230 }} />
          </label>
          {nhom.length > 0 && (
            <>
              <button type="button" style={nutNho}
                onClick={() => setMo(Object.fromEntries(nhom.map((g) => [g.type, true])))}>Mở hết</button>
              <button type="button" style={nutNho}
                onClick={() => setMo({})}>Gập hết</button>
            </>
          )}
          {(filter !== "all" || kw) && (
            <button type="button" style={{ ...nutNho, color: C.raspText, borderColor: C.raspSoft, marginLeft: "auto" }}
              onClick={() => { setFilter("all"); setQ(""); }}>Xoá lọc</button>
          )}
        </div>

        {nhom.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: C.mintText, fontWeight: 700 }}>
            {issues.length === 0 ? "Không phát hiện vấn đề dữ liệu nào." : "Không có vấn đề nào khớp bộ lọc."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {nhom.map((g) => {
              const sv = sevOf(g.severity);
              const meta = LOAI_LOI[g.type] || { ten: g.type, sua: "" };
              const dangMo = !!mo[g.type];
              const soHien = hien[g.type] || 20;
              return (
                <div key={g.type} style={{ border: `1px solid ${sv.nen}`, borderRadius: 14, overflow: "hidden", background: C.surface }}>
                  <button onClick={() => setMo((p) => ({ ...p, [g.type]: !p[g.type] }))}
                    style={{ width: "100%", textAlign: "left", border: "none", background: dangMo ? sv.nen : C.surface,
                             cursor: "pointer", padding: "13px 15px", display: "flex", alignItems: "center", gap: 12 }}>
                    <ChevronRight size={17} color={sv.mau} style={{ transform: dangMo ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
                    <span style={{ fontSize: 16 }}>{sv.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plum }}>{meta.ten}</div>
                      {meta.sua && <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>{meta.sua}</div>}
                    </div>
                    <Tag color={sv.mau} bg={sv.nen}>{g.ds.length} hạng mục</Tag>
                  </button>

                  {dangMo && (() => {
                    // Nếu cả nhóm cùng một câu mô tả thì đừng lặp lại 85 lần —
                    // tiêu đề nhóm đã nói rồi. Chỉ liệt kê mã cho dễ quét mắt.
                    const giongNhau = new Set(g.ds.map((x) => x.msg)).size === 1;
                    return (
                      <div style={{ padding: "8px 15px 14px" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                          <button style={{ ...nutNho, fontSize: 12 }}
                            onClick={() => navigator.clipboard?.writeText(g.ds.map((x) => x.id).join("\n"))}>
                            Sao chép {g.ds.length} mã
                          </button>
                          <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>
                            dán vào ô tìm ở Cập nhật tiến độ để xử lý từng mã
                          </span>
                        </div>
                        {giongNhau ? (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {g.ds.slice(0, soHien).map((it, i) => (
                              <span key={i} style={{ fontFamily: NUM, fontSize: 12, fontWeight: 800, color: sv.mau,
                                                     background: sv.nen, borderRadius: 8, padding: "4px 9px" }}>{it.id}</span>
                            ))}
                          </div>
                        ) : (
                          /* Gộp các dòng CÙNG MỘT CÂU. Trước đây "Lương Minh
                             Hằng chưa có email" lặp y nguyên 8 lần trong một
                             danh sách 64 vấn đề — đọc 8 lần vẫn chỉ là một
                             việc phải làm: điền một địa chỉ email. */
                          (() => {
                            const theoCau = new Map<string, string[]>();
                            for (const it of g.ds) {
                              if (!theoCau.has(it.msg)) theoCau.set(it.msg, []);
                              theoCau.get(it.msg)!.push(String(it.id));
                            }
                            const dong = [...theoCau.entries()].sort((a, b) => b[1].length - a[1].length);
                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {dong.slice(0, soHien).map(([cau, ids], i) => (
                                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 12, padding: "6px 0", borderTop: i ? `1px solid ${C.pinkMist}` : "none", flexWrap: "wrap" }}>
                                    <span style={{ fontFamily: NUM, fontWeight: 800, color: sv.mau, minWidth: 165 }}>
                                      {ids.length > 1 ? `${ids.length} hạng mục` : ids[0]}
                                    </span>
                                    <span style={{ color: C.plumSoft, fontWeight: 600, flex: 1, minWidth: 200 }}>{cau}</span>
                                    {ids.length > 1 && (
                                      <span title={ids.join("\n")}
                                        style={{ fontFamily: NUM, fontSize: 12, fontWeight: 700, color: C.plumSoft, opacity: .8 }}>
                                        {ids.slice(0, 3).join(", ")}{ids.length > 3 ? `… (+${ids.length - 3})` : ""}
                                      </span>
                                    )}
                                  </div>
                                ))}
                                {dong.length > soHien && (
                                  <button onClick={() => setHien((p) => ({ ...p, [g.type]: soHien + 50 }))}
                                    style={{ ...nutNho, marginTop: 6, alignSelf: "flex-start" }}>
                                    Hiện thêm — đang xem {soHien}/{dong.length} loại
                                  </button>
                                )}
                              </div>
                            );
                          })()
                        )}
                        {giongNhau && g.ds.length > soHien && (
                          <button onClick={() => setHien((p) => ({ ...p, [g.type]: soHien + 50 }))}
                            style={{ ...nutNho, marginTop: 10 }}>
                            Hiện thêm — đang xem {soHien}/{g.ds.length}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card variant="soft">
        <CardTitle icon={Radar}
          sub="Do trigger database và đồng bộ n8n ghi lại (chưa xử lý) — nguồn chính thức, web không tự tính lại">
          Lỗi / xung đột ghi nhận từ hệ thống (Supabase)
        </CardTitle>
        {serverErr ? (
          <div style={{ padding: 16, color: C.raspText, fontWeight: 700, fontSize: 14 }}>
            Không đọc được: {serverErr}
          </div>
        ) : nhomServer.length === 0 ? (
          <div style={{ textAlign: "center", padding: 26, color: C.mintText, fontWeight: 700 }}>
            Hệ thống chưa ghi nhận lỗi nào chưa xử lý.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {nhomServer.map(([loai, ds]) => {
              const nang = ds.some((x) => x.severity === "error");
              const key = "sv:" + loai;
              const dangMo = !!mo[key];
              return (
                <div key={loai} style={{ border: `1px solid ${nang ? C.raspSoft : C.marigoldSoft}`, borderRadius: 14, background: C.surface }}>
                  <button onClick={() => setMo((p) => ({ ...p, [key]: !p[key] }))}
                    style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                    <ChevronRight size={16} color={C.plumSoft} style={{ transform: dangMo ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                    <span style={{ fontSize: 16 }}>{nang ? "🚫" : "⚠️"}</span>
                    <span style={{ flex: 1, fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plum }}>{loai}</span>
                    <Tag color={nang ? C.raspText : C.marigoldText} bg={nang ? C.raspSoft : C.marigoldSoft}>{ds.length}</Tag>
                  </button>
                  {dangMo && (
                    <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                      {ds.slice(0, 30).map((it, i) => (
                        <div key={i} style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, paddingTop: 6, borderTop: i ? `1px solid ${C.pinkMist}` : "none" }}>
                          <b style={{ color: C.plum }}>{it.plan_item_id || "—"}</b> · {it.message}
                          {it.detected_at ? ` · ${new Date(it.detected_at).toLocaleDateString("vi-VN")}` : ""}
                        </div>
                      ))}
                      {ds.length > 30 && <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700, paddingTop: 6 }}>… và {ds.length - 30} bản ghi nữa</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ===================== Mismatch Page (NEW) ===================== */
/** Giữ lại bản cũ để đối chiếu — hiện chưa gắn vào router. */
export function MismatchView({ acts }: { acts: Activity[] }) {
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
              <div key={a.id} className="vmp-row vmp-lift" style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px", borderRadius: 14, background: C.surface,
                border: `1px solid ${C.marigoldSoft}`,
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14, flexShrink: 0,
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

      // Chỉ lấy cột BẢNG THẬT SỰ HIỆN. select("*") kéo về cả old_data lẫn
      // new_data của 50 dòng — hai cột JSONB nặng nhất bảng — trong khi giao
      // diện chỉ mở new_data khi người dùng bấm "Xem dữ liệu".
      const COT = "id,created_at,user_email,action,table_name,record_id,source,new_data";
      // Không lọc gì thì đếm ƯỚC LƯỢNG: count exact quét cả 100.400 dòng /
      // 158MB chỉ để biết chia bao nhiêu trang (đo được 1,8 giây khi nguội).
      const coLoc = !!(filters.action || filters.user || filters.record);
      let query = supabase.from("audit_logs")
        .select(COT, { count: coLoc ? "exact" : "planned" })
        .order("created_at", { ascending: false })
        .range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1);

      if (filters.action) query = query.eq("action", filters.action as AuditRow["action"]);
      if (filters.user) query = query.ilike("user_email", `%${filters.user}%`);
      if (filters.record) query = query.eq("record_id", filters.record);

      const { data, error, count } = await query;
      if (error) throw error;
      setLogs((data || []) as unknown as AuditRow[]);
      setTotal(count || 0);
      setUocLuong(!coLoc);
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
function docLichCron(lich: string): string {
  const p = String(lich || "").trim().split(/\s+/);
  if (p.length < 5) return lich;
  const [phut, gio, ngay, , thu] = p;
  const gioVN = (Number(gio) + 7) % 24;
  const gioChu = `${String(gioVN).padStart(2, "0")}:${String(phut).padStart(2, "0")}`;
  const TEN_THU = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
  const quaNgay = Number(gio) + 7 >= 24 ? " (ngày kế tiếp)" : "";
  if (thu !== "*") return `${TEN_THU[Number(thu)] || "thứ " + thu} hằng tuần, ${gioChu} giờ VN${quaNgay}`;
  if (ngay !== "*") return `ngày ${ngay} hằng tháng, ${gioChu} giờ VN${quaNgay}`;
  return `hằng ngày, ${gioChu} giờ VN${quaNgay}`;
}

const VAI_TRO_NHAN: Record<string, { nhan: string; mau: string; nen: string }> = {
  admin:           { nhan: "Quản trị", mau: C.raspText, nen: C.raspSoft },
  qa_manager:      { nhan: "QA quản lý", mau: C.lavText, nen: C.lavSoft },
  department_user: { nhan: "Người bộ phận", mau: C.skyText, nen: C.skySoft },
  viewer:          { nhan: "Chỉ xem", mau: C.plumSoft, nen: C.pinkMist },
};

function AdminView({ conn, user }: { conn: ConnState; user?: AppUser | null }) {
  const [tt, setTt] = useState<SystemStatus | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [moCauHinh, setMoCauHinh] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetchSystemStatus();
      if (r?.ok === false) setErr(r.error || "Không đọc được trạng thái hệ thống");
      else setTt(r);
    } catch (e) { setErr((e as Error).message || "Không đọc được trạng thái hệ thống"); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const oSo = (nhan: string, giaTri: React.ReactNode, phu?: string) => (
    <div style={{ padding: "13px 15px", borderRadius: 14, background: C.surface, border: `1px solid ${C.pinkSoft}` }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft, textTransform: "uppercase", letterSpacing: ".03em" }}>{nhan}</div>
      <div style={{ fontFamily: NUM, fontSize: 20, fontWeight: 800, color: C.plum, marginTop: 3 }}>{giaTri}</div>
      {phu && <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 1 }}>{phu}</div>}
    </div>
  );

  const d = tt?.du_lieu || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Card>
        <CardTitle icon={BarChart3} sub="Người dùng · cấu hình · việc tự động · khối lượng dữ liệu"
          right={<button onClick={load} disabled={loading}
            style={{ ...btnPrimary, padding: "8px 15px", borderRadius: 14, fontSize: 12, opacity: loading ? 0.6 : 1 }}>
            {loading ? "Đang tải…" : "Tải lại"}</button>}>
          Quản trị hệ thống
        </CardTitle>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
          <div style={{ padding: "13px 15px", borderRadius: 14, background: conn.status === "ok" ? C.mintSoft : C.marigoldSoft }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: conn.status === "ok" ? C.mintText : C.marigoldText, textTransform: "uppercase" }}>Kết nối dữ liệu</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.plum, marginTop: 3 }}>
              {conn.status === "ok" ? "Đang chạy · Supabase" : conn.status === "loading" ? "Đang tải…" : conn.status === "err" ? "Lỗi kết nối" : "Chưa kết nối"}
            </div>
          </div>
          <div style={{ padding: "13px 15px", borderRadius: 14, background: isSupabaseConfigured() ? C.mintSoft : C.raspSoft }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: isSupabaseConfigured() ? C.mintText : C.raspText, textTransform: "uppercase" }}>Xác thực</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.plum, marginTop: 3 }}>{isSupabaseConfigured() ? "Supabase Auth" : "Chế độ tạm (env)"}</div>
          </div>
          {oSo("Đang đăng nhập", user?.name || "—", `${user?.role || ""} · ${(user && PERM_LABEL[user.perm]) || ""}`)}
        </div>
      </Card>

      {err && (
        <Card>
          <div style={{ padding: "16px 18px", borderRadius: 14, background: C.raspSoft, border: `1px solid ${C.rasp}` }}>
            <div style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 14, color: C.raspText }}>Không đọc được trạng thái hệ thống</div>
            <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 5 }}>{err}</div>
            <button onClick={load} style={{ ...btnPrimary, marginTop: 12, padding: "9px 18px", borderRadius: 14, fontSize: 14 }}>Thử lại</button>
          </div>
        </Card>
      )}

      {tt && (
        <>
          <Card variant="strong">
            <CardTitle icon={Radar} sub="Đọc thẳng từ database lúc mở trang">Khối lượng dữ liệu</CardTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 12 }}>
              {oSo("Hạng mục đang theo dõi", String(d.hang_muc_dang_theo_doi ?? "—"), "tính vào KPI")}
              {oSo("Không áp dụng", String(d.hang_muc_khong_ap_dung ?? "—"), "ngoài KPI, vẫn tra được")}
              {oSo("Đối tượng", String(d.doi_tuong ?? "—"))}
              {oSo("Người thực hiện", String(d.nguoi_thuc_hien ?? "—"))}
              {oSo("Dòng nhật ký", String(d.dong_nhat_ky ?? "—"), "ALCOA+ audit trail")}
              {oSo("Dung lượng", String(d.dung_luong ?? "—"), "cả database")}
            </div>
          </Card>

          <Card>
            <CardTitle icon={Users} sub={`${tt.nguoi_dung?.length || 0} tài khoản · vai trò quyết định ai ghi được gì`}>
              Người dùng &amp; phân quyền
            </CardTitle>
            <div className="vmp-scroll" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, fontSize: 14 }}>
                <thead><tr style={{ background: C.pinkMist }}>
                  {["Họ tên", "Email", "Vai trò", "Bộ phận", "Tình trạng", "Đăng nhập gần nhất"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "11px 14px", fontSize: 12, fontWeight: 800, color: C.plumSoft, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(tt.nguoi_dung || []).map((u: NonNullable<SystemStatus["nguoi_dung"]>[number]) => {
                    const v = VAI_TRO_NHAN[u.vai_tro] || VAI_TRO_NHAN.viewer;
                    return (
                      <tr key={u.email} style={{ borderTop: `1px solid ${C.pinkSoft}` }}>
                        <td style={{ padding: "11px 14px", fontWeight: 800, color: C.plum }}>{u.ten}</td>
                        <td style={{ padding: "11px 14px", color: C.plumSoft, fontWeight: 600 }}>{u.email}</td>
                        <td style={{ padding: "11px 14px" }}><Tag color={v.mau} bg={v.nen}>{v.nhan}</Tag></td>
                        <td style={{ padding: "11px 14px", color: C.plumSoft, fontWeight: 600 }}>{u.bo_phan || "—"}</td>
                        <td style={{ padding: "11px 14px" }}>
                          <Tag color={u.dang_dung ? C.mintText : C.raspText} bg={u.dang_dung ? C.mintSoft : C.raspSoft}>
                            {u.dang_dung ? "Đang dùng" : "Đã khoá"}
                          </Tag>
                        </td>
                        <td style={{ padding: "11px 14px", color: C.plumSoft, fontWeight: 600, whiteSpace: "nowrap" }}>
                          {u.dang_nhap_gan_nhat ? new Date(u.dang_nhap_gan_nhat).toLocaleString("vi-VN") : "chưa ghi nhận"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 10, lineHeight: 1.6 }}>
              Thêm tài khoản và đổi vai trò làm ở Supabase → Authentication. Web cố ý không mở đường
              tự cấp quyền cho chính mình.
            </div>
          </Card>

          <Card>
            <CardTitle icon={Clock} sub="pg_cron chạy ngay trong database — không phụ thuộc máy nào bật">
              Việc tự động đang hẹn giờ
            </CardTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(tt.lich_tu_dong || []).map((j: NonNullable<SystemStatus["lich_tu_dong"]>[number]) => (
                <div key={j.ten} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 14, background: C.surface, border: `1px solid ${C.pinkSoft}` }}>
                  <Tag color={j.dang_bat ? C.mintText : C.plumSoft} bg={j.dang_bat ? C.mintSoft : C.pinkMist}>{j.dang_bat ? "Đang bật" : "Tắt"}</Tag>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.plum }}>{j.ten}</div>
                    <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 1 }}>
                      {docLichCron(j.lich)} · <span style={{ fontFamily: NUM }}>{j.lich}</span>
                    </div>
                  </div>
                </div>
              ))}
              {!(tt.lich_tu_dong || []).length && <div style={{ padding: 14, color: C.plumSoft, fontWeight: 600 }}>Chưa hẹn giờ việc nào.</div>}
            </div>
          </Card>

          {!!(tt.workflow_loi_7_ngay || []).length && (
            <Card variant="strong">
              <CardTitle icon={FileWarning} sub="Ghi từ bảng workflow_runs — n8n báo về khi một workflow chạy hỏng">
                Workflow lỗi 7 ngày qua ({tt.workflow_loi_7_ngay!.length})
              </CardTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {tt.workflow_loi_7_ngay!.map((wf: NonNullable<SystemStatus["workflow_loi_7_ngay"]>[number], i: number) => (
                  <div key={i} style={{ padding: "10px 13px", borderRadius: 14, background: C.surface, border: `1px solid ${C.raspSoft}` }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.plum }}>{wf.ten || "(không tên)"}</div>
                    <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>
                      {wf.luc ? new Date(wf.luc).toLocaleString("vi-VN") : ""} · {wf.loi || "không có mô tả lỗi"}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card variant="soft">
            <CardTitle icon={Scale} sub={`${tt.cau_hinh?.length || 0} khoá · khoá đánh dấu nhạy cảm không hiện ở đây`}
              right={<button onClick={() => setMoCauHinh((v) => !v)}
                style={{ fontFamily: TEXT, fontSize: 12, fontWeight: 700, color: C.plum, border: `1.5px solid ${C.pinkSoft}`, background: C.surface, borderRadius: 999, padding: "7px 13px", cursor: "pointer" }}>
                {moCauHinh ? "Gập lại" : "Xem"}</button>}>
              Cấu hình hệ thống
            </CardTitle>
            {moCauHinh && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {(tt.cau_hinh || []).map((c: NonNullable<SystemStatus["cau_hinh"]>[number]) => (
                  <div key={c.khoa} style={{ display: "flex", gap: 12, fontSize: 12, padding: "6px 0", borderTop: `1px solid ${C.pinkMist}` }}>
                    <span style={{ fontFamily: NUM, fontWeight: 800, color: C.plum, minWidth: 210 }}>{c.khoa}</span>
                    <span style={{ color: C.plumSoft, fontWeight: 600, wordBreak: "break-word" }}>{JSON.stringify(c.gia_tri)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* ===================== BACKWARD COMPAT: Import page components =====================
 * These are kept from the original App.jsx. Each will be extracted to pages/ in future.
 * For now they reference shared modules (C, TEXT, etc.) from imports above.
 */

/* --- Individual Leaderboard --- */

/* =====================================================================
 * TỔNG QUAN — lưới bento
 *
 * Ô to nhỏ khác nhau chính là thứ tự đọc: ô lớn nhất trả lời câu hỏi
 * quan trọng nhất ("dự án đang ở đâu"), các ô nhỏ là số cần liếc. Lưới
 * đều nhau bắt mắt phải tự quyết định nhìn đâu trước — đó là lý do bản
 * cũ (4 thẻ KPI y hệt nhau xếp hàng ngang) đọc mệt hơn cần thiết.
 * =================================================================== */
function Overview({ acts, setView }: { acts: Activity[]; setView?: (v: string) => void }) {
  const { e, d, overdue, soon, gap, gapPts, mismatched, theoThang } = useMemo(() => {
    const e = tally(acts), d = docTally(acts);
    const overdue = acts.filter((a) => a.alert && a.alert.kind === "over");
    const soon = acts.filter((a) => a.alert && a.alert.kind === "soon");

    // Dải cột nhỏ trong ô "Tỷ lệ hồ sơ": tỷ lệ hồ sơ theo tháng đích.
    // Phải đếm ĐÚNG thước đo mà con số lớn của ô đang dùng (trạng thái báo
    // cáo) — bản trước vẽ tỷ lệ hoàn thành VMP cạnh con số tỷ lệ hồ sơ, hai
    // thước đo khác nhau trong một ô, đọc ra kết luận sai về xu hướng.
    const thang = Array.from({ length: 12 }, () => ({ tong: 0, xong: 0 }));
    for (const a of acts) {
      const t = a.target ? new Date(a.target).getMonth() : -1;
      if (t < 0 || t > 11) continue;
      thang[t].tong++;
      if (wlIsDone((a._raw as Record<string, unknown> | undefined)?.tt_bao_cao)) thang[t].xong++;
    }
    return {
      e, d, overdue, soon,
      gap: e.done - d.done, gapPts: e.rate - d.rate,
      mismatched: acts.filter((a) => a.mismatch),
      theoThang: thang.map((m) => (m.tong ? m.xong / m.tong : 0)),
    };
  }, [acts]);

  const di = (v: string) => (setView ? () => setView(v) : undefined);
  const [sau, setSau] = useState(false);
  const soLoiDl = useMemo(() => runDataQualityChecks(acts).length, [acts]);

  /* Năm việc gấp nhất của người đang đăng nhập — bản rút gọn của màn "Hôm
     nay", đặt ngay trên trang đầu. Người ta mở app ra là để làm việc, nên
     màn đầu phải có ít nhất một lối vào việc, không chỉ toàn số để ngắm. */
  const vieCGap = useMemo(() => {
    const homNay = vmpToday().getTime();
    return acts
      .filter((a) => (a.state || "active") === "active" && a.st !== "done" && a.alert?.date)
      .map((a) => ({ a, con: Math.round((new Date(a.alert!.date).setHours(0, 0, 0, 0) - homNay) / 86400000) }))
      .sort((x, y) => x.con - y.con)
      .slice(0, 5);
  }, [acts]);

  return (
    <div className="vmp-bento vmp-stagger">
      {/* Ô lớn — trạng thái chung của cả kế hoạch */}
      <Card variant="strong" cls="b-hero" style={{ padding: "24px 26px" }}>
        {/* Vòng năm thay vương miện 3D. Vương miện mã hoá bốn tỉ lệ vào ĐỘ
            SÁNG viên ngọc — kênh mà mắt người đọc kém nhất; bằng chứng là
            phần đọc được thật vẫn phải nằm ở bảng chú giải bên cạnh nó.
            Vòng năm nói được thứ tổng quát hơn và đọc thẳng từ hình: cả 12
            tháng khép kín, khối lượng từng tháng, phần đã xong, và kim chỉ
            mình đang đứng ở đâu trong năm. */}
        <VongNam acts={acts} rate={e.rate} total={e.total} ben={
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: TEXT, fontSize: 20, fontWeight: 800,
                          color: C.plum, marginBottom: 3 }}>
              Tiến độ thẩm định {vmpToday().getFullYear()}
            </div>
            <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginBottom: 15 }}>
              {e.total} hạng mục trong kế hoạch năm
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {[
                { l: "Hoàn thành", v: e.done, c: C.mint, t: C.mintText },
                { l: "Quá hạn", v: e.over, c: C.rasp, t: C.raspText },
                { l: "Chưa hoàn thành", v: e.todo, c: C.marigold, t: C.marigoldText },
              ].map((x) => (
                <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999,
                                 background: x.c, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700,
                                 flex: 1 }}>{x.l}</span>
                  <div style={{ width: 88, height: 6, borderRadius: 999,
                                background: C.surfaceSunk, overflow: "hidden" }}>
                    <div style={{ width: `${e.total ? (x.v / e.total) * 100 : 0}%`,
                                  height: "100%", background: x.c }} />
                  </div>
                  <span style={{ fontFamily: NUM, fontSize: 20, fontWeight: 800,
                                 color: x.t, minWidth: 34, textAlign: "right" }}>{x.v}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 15, paddingTop: 13, borderTop: `1px solid ${C.line}`,
                          fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>
              Hồ sơ hoàn thiện: <b style={{ color: C.plum }}>{d.rate}%</b> ({d.done}/{d.total})
              {gap > 0 && (
                <span style={{ color: C.marigoldText }}>
                  {" · lệch "}{gap} hạng mục ({gapPts} điểm%)
                </span>
              )}
            </div>
          </div>
        } />
      </Card>

      {/* CẨN THẬN: hai con số này KHÁC NHAU và trước đây cùng mang nhãn "Quá hạn"
          trên một màn hình — 162 vs 279 — nên không ai biết tin số nào.
          · e.over  = trạng thái hạng mục đang là "quá hạn"
          · overdue = hạng mục có MỐC gần nhất (đề cương/thẩm định/báo cáo) đã trôi qua,
            kể cả khi trạng thái tổng chưa chuyển. Số này luôn ≥ số kia. */}
      {/* MỘT chỉ số quá hạn, không phải hai. Bản trước để "Quá hạn (trạng
          thái) 208" và "Có mốc đã quá hạn 268" cạnh nhau, người mới nhìn
          tưởng web tính sai. Nay lấy con số RỘNG hơn (theo mốc) làm chỉ số
          chính vì đó mới là thứ phải xử, và nói thẳng chênh lệch là gì. */}
      <StatTile cls="b-k1" icon={AlertCircle} label="Quá hạn" value={overdue.length}
        tone={{ c: C.raspText, bg: C.raspSoft }} onClick={di("progress")}
        sub={overdue.length
          ? `${e.over} đã đổi trạng thái · ${Math.max(0, overdue.length - e.over)} mốc đã trôi mà trạng thái chưa đổi`
          : "Không còn hạng mục nào trễ"} />

      <StatTile cls="b-k2" icon={Clock} label="Tới hạn 30 ngày" value={soon.length}
        tone={{ c: C.marigoldText, bg: C.marigoldSoft }} onClick={di("alerts")}
        sub={soon.length ? "Theo dõi để không rơi sang quá hạn" : "Tháng tới đang trống"} />

      <StatTile cls="b-k3" icon={ClipboardCheck} label="Hoàn thành VMP" value={`${e.rate}%`}
        tone={{ c: C.mintText, bg: C.mintSoft }} bars={theoThang}
        sub={`${e.done}/${e.total} hạng mục · dải cột = tỷ lệ hồ sơ theo tháng đích`} />

      {/* Ô thứ tư là CHẤT LƯỢNG DỮ LIỆU, không phải một chỉ số tiến độ nữa.
          Lý do: mọi con số còn lại trên trang đều chỉ đáng tin bằng đúng chất
          lượng của dữ liệu dưới nó. Đặt nó ngang hàng với ba chỉ số kia là
          nói rằng nó quan trọng ngang chúng — và đúng là như vậy. */}
      <StatTile cls="b-k4" icon={FileWarning} label="Vấn đề dữ liệu" value={soLoiDl}
        tone={soLoiDl > 0 ? { c: C.marigoldText, bg: C.marigoldSoft } : { c: C.mintText, bg: C.mintSoft }}
        onClick={di("health")}
        sub={soLoiDl ? `${mismatched.length} lệch pha · bấm để xem và sửa` : "Không phát hiện vấn đề nào"} />

      <div className="b-vali">
        <PrincessCommentary stats={{
          e, d, overdue: overdue.length, soon: soon.length, mismatched: mismatched.length,
        }} />
      </div>

      {/* Lối vào VIỆC, ngay trên màn đầu. */}
      <Card cls="b-wide" variant="strong">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between",
                      gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <strong style={{ fontFamily: TEXT, fontSize: 20, fontWeight: 800, color: C.plum }}>
            Việc gấp nhất
          </strong>
          <button type="button" className="vmp-mo-sau" style={{ width: "auto", padding: "8px 14px" }}
            onClick={di("today")}>Mở màn Hôm nay →</button>
        </div>
        {vieCGap.length === 0 ? (
          <div style={{ padding: 16, color: C.mintText, fontWeight: 700, fontSize: 14 }}>
            Không có hạng mục nào đang tới hạn hoặc quá hạn.
          </div>
        ) : (
          <div className="hn-ds">
            {vieCGap.map(({ a, con }) => (
              <div key={a.id} className="hn-dong">
                <span className={`hn-ngay ${con < 0 ? "is-tre" : "is-toi"}`}>
                  {con < 0 ? `trễ ${Math.abs(con)}` : con === 0 ? "hôm nay" : `còn ${con}`}
                  {con !== 0 && <small>ngày</small>}
                </span>
                <span className="hn-ten">
                  <b>{a.code}</b><span>{a.name}</span>
                </span>
                <span className="hn-meta">{a.alert?.stage} · {a.owner || "chưa có người"}</span>
                <Pill s={a.st} small />
                <button type="button" className="hn-nut" onClick={di("today")}>Xử lý</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* PHÂN TÍCH CHI TIẾT — gập lại, không nằm trên màn đầu.
          Trang này trước dài 6,7 màn hình với 12 khối nội dung: đó là một
          bản báo cáo, không phải một "tổng quan". Tổng quan phải trả lời
          được trong một màn: có gì cháy, đang ở đâu, hôm nay làm gì.
          Ma trận giai đoạn, phễu, tỷ lệ theo loại, bảng theo đơn vị vẫn
          giá trị nguyên vẹn — chỉ là không thuộc màn đầu tiên. */}
      <div className="b-wide">
        <button type="button" className="vmp-mo-sau" onClick={() => setSau((v) => !v)}
          aria-expanded={sau}>
          <span>{sau ? "▾" : "▸"}</span>
          Phân tích chi tiết
          <small>ma trận giai đoạn · phễu bốn giai đoạn · tỷ lệ theo loại thẩm định · theo bộ phận</small>
        </button>
        {sau && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 14 }}>
            <MaTranTienDo acts={acts} />
            <CompletionDashboard acts={acts} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ===================== GLOBAL FILTER BAR =====================
 * Lọc TOÀN CỤC theo Khu vực + Thời gian (tháng/quý/nửa năm/năm).
 * Đặt dưới Topbar, hiển thị trên mọi trang. */
const PERIOD_OPTS = [
  { v: "all", l: "Toàn bộ thời gian" },
  { v: "thang", l: "Tháng này" },
  { v: "quy", l: "Quý này" },
  { v: "sixm", l: "Nửa năm tới" },
  { v: "nam", l: "Trong năm nay" },
  { v: "custom", l: "Tùy chọn…" },
];

const dateInp = {
  padding: "7px 9px", borderRadius: 8, border: `1px solid ${C.pinkSoft}`,
  background: C.surface, color: C.plum, fontFamily: TEXT, fontSize: 12, fontWeight: 700, cursor: "pointer",
};

// MultiSelect: chuyển sang components/ui/Primitives.tsx (2026-07-30) để
// ReportsView dùng chung cho bộ lọc riêng, không copy lại.

// LEGACY (giữ lại để revert): thanh lọc cũ — 3 hộp checkbox luôn hiện.
// Muốn quay lại: ở call-site đổi <GlobalFilterBar .../> thành <GlobalFilterBarLegacy .../>.
/** Bản thanh lọc cũ, giữ để revert nếu cần — hiện dùng GlobalFilterBar. */
export function GlobalFilterBarLegacy({
  areaSel, setAreaSel, deptSel, setDeptSel, period, setPeriod,
  customFrom, setCustomFrom, customTo, setCustomTo,
  areaOptions, deptOptions, shown, total,
}: {
  areaSel: string[];
  setAreaSel: (v: string[]) => void;
  deptSel: string[];
  setDeptSel: (v: string[]) => void;
  period: string;
  setPeriod: (v: string) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
  areaOptions: Array<{ v: string; l: string }>;
  deptOptions: Array<{ v: string; l: string }>;
  shown: number;
  total: number;
}) {
  const active = areaSel.length > 0 || deptSel.length > 0 || period !== "all";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      // position + zIndex cao: đưa cả thanh lọc (và dropdown checkbox) lên TRÊN
      // các card phía sau (vd "Tiến độ thẩm định 2026") để không bị đè.
      position: "relative", zIndex: 40,
      marginBottom: 18, padding: "11px 16px", borderRadius: 14,
      background: C.glass, backdropFilter: "blur(6px)",
      border: `1px solid ${C.pinkSoft}`, boxShadow: "0 4px 14px rgba(120,60,110,.06)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.plumSoft }}>
        <Filter size={15} />
        <span style={{ fontSize: 12, fontWeight: 800 }}>Lọc chung</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.plumSoft }}>Bộ phận</span>
        <MultiSelect label="Bộ phận" allLabel="Tất cả bộ phận" options={deptOptions} selected={deptSel} onChange={setDeptSel} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.plumSoft }}>Khu vực</span>
        <MultiSelect label="Khu vực" allLabel="Tất cả khu vực" options={areaOptions} selected={areaSel} onChange={setAreaSel} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.plumSoft }}>Thời gian</span>
        <Sel val={period} set={setPeriod} opts={PERIOD_OPTS} />
      </div>

      {period === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={dateInp} aria-label="Từ ngày" />
          <span style={{ color: C.plumSoft, fontWeight: 700 }}>→</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={dateInp} aria-label="Đến ngày" />
        </div>
      )}

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.plumSoft }}>
          <b style={{ color: C.plum }}>{shown}</b>/{total} hạng mục
        </span>
        {active && (
          <button type="button" onClick={() => { setAreaSel([]); setDeptSel([]); setPeriod("all"); setCustomFrom(""); setCustomTo(""); }} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 10px",
            borderRadius: 8, border: `1px solid ${C.pinkSoft}`, background: C.pinkMist,
            color: C.pinkText, fontFamily: TEXT, fontSize: 12, fontWeight: 800, cursor: "pointer",
          }}>
            <XCircle size={13} /> Đặt lại
          </button>
        )}
      </div>
    </div>
  );
}

/* ===================== GLOBAL FILTER BAR (mới) =====================
 * Gọn theo hướng 2025–2026: preset thời gian + 1 nút "+ Lọc" + chip đang lọc
 * + faceted count. Giữ NGUYÊN props & logic lọc; chỉ đổi trình bày.
 * Bản cũ: GlobalFilterBarLegacy (ngay trên) — đổi ở call-site để revert. */
const DEPT_CHIP = {
  xsx: { soft: C.pinkMist, text: C.pinkText, dot: C.pink },
  cd:  { soft: C.skySoft,  text: C.skyText,  dot: C.sky },
  kho: { soft: C.marigoldSoft, text: C.marigoldText, dot: C.marigold },
  qc:  { soft: C.mintSoft, text: C.mintText, dot: C.mint },
  rd:  { soft: C.raspSoft, text: C.raspText, dot: C.rasp },
  qa:  { soft: C.lavSoft,  text: C.lavText,  dot: C.lav },
};
const neutralChip = { background: "rgba(78,42,78,.06)", color: C.plum };

function FilterChip({ style, label, onRemove }: {
  style?: React.CSSProperties; label: ReactNode; onRemove: () => void;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 6px 5px 11px", borderRadius: 999, fontFamily: TEXT, fontSize: 12, fontWeight: 800, ...style }}>
      {label}
      <button type="button" onClick={onRemove} aria-label={`Bỏ ${label}`} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 17, height: 17, borderRadius: 999, border: "none", cursor: "pointer", background: "rgba(0,0,0,.08)", color: "inherit", fontSize: 14, lineHeight: 1, fontWeight: 900 }}>×</button>
    </span>
  );
}

function GlobalFilterBar({
  areaSel, setAreaSel, deptSel, setDeptSel, setPeriod,
  customFrom, setCustomFrom, customTo, setCustomTo,
  areaOptions, deptOptions, shown, total, soNgung = 0,
  onlyMine, setOnlyMine, myName,
}: {
  areaSel: string[];
  setAreaSel: (v: string[]) => void;
  deptSel: string[];
  setDeptSel: (v: string[]) => void;
  period: string;
  setPeriod: (v: string) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
  areaOptions: Array<{ v: string; l: string }>;
  deptOptions: Array<{ v: string; l: string }>;
  shown: number;
  total: number;
  /** Số hạng mục Không áp dụng / Đã huỷ — KHÔNG tính vào mẫu số. */
  soNgung?: number;
  onlyMine: boolean;
  setOnlyMine: (v: boolean) => void;
  /** Tên người đăng nhập, dùng để đối chiếu với QA phụ trách. Rỗng thì
   *  không hiện nút — thà không có nút còn hơn có nút bấm ra 0 dòng. */
  myName: string;
}) {
  const [open, setOpen] = useState(false);
  const [daChep, setDaChep] = useState(false);
  const chepLien = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setDaChep(true);
      setTimeout(() => setDaChep(false), 2000);
    } catch { /* trình duyệt chặn clipboard thì người dùng copy từ thanh địa chỉ */ }
  };
  const popRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggleDept = (v: string) => setDeptSel(deptSel.includes(v) ? deptSel.filter((x) => x !== v) : [...deptSel, v]);
  const toggleArea = (v: string) => setAreaSel(areaSel.includes(v) ? areaSel.filter((x) => x !== v) : [...areaSel, v]);
  const active = deptSel.length > 0 || areaSel.length > 0 || !!customFrom || !!customTo || onlyMine;
  const soLoc = deptSel.length + areaSel.length + (customFrom || customTo ? 1 : 0);
  const resetAll = () => { setDeptSel([]); setAreaSel([]); setPeriod("all"); setCustomFrom(""); setCustomTo(""); setOnlyMine(false); };
  // Thời gian CHỈ theo mốc ngày: có nhập ngày -> bật lọc "custom"; xoá hết -> "all".
  const onFrom = (v: string) => { setCustomFrom(v); setPeriod((v || customTo) ? "custom" : "all"); };
  const onTo = (v: string) => { setCustomTo(v); setPeriod((customFrom || v) ? "custom" : "all"); };

  const optRow = (
    o: { v: string; l: string; n?: number },
    on: boolean,
    toggle: (v: string) => void,
    dot: string,
  ) => (
    <button key={o.v} type="button" onClick={() => toggle(o.v)} aria-pressed={on}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: "none", background: on ? C.pinkMist : "transparent", fontFamily: TEXT, fontSize: 14, fontWeight: 700, color: C.plum, padding: "8px 9px", borderRadius: 8, cursor: "pointer" }}>
      <span style={{ width: 9, height: 9, borderRadius: 8, background: dot, flex: "none" }} />
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.l}</span>
      {on && <span style={{ color: C.pinkText, fontWeight: 900 }}>✓</span>}
      <span style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft, background: C.pinkMist, padding: "1px 8px", borderRadius: 999, fontFamily: NUM }}>{o.n}</span>
    </button>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", position: "relative", zIndex: 40, marginBottom: 18, padding: "10px 14px", borderRadius: 14, background: C.glass, backdropFilter: "blur(6px)", border: `1px solid ${C.pinkSoft}`, boxShadow: "0 4px 14px rgba(120,60,110,.06)" }}>
      {/* Việc của tôi — lọc theo QA phụ trách khớp tên người đang đăng nhập.
          Đứng riêng ngoài hộp "+ Lọc" vì đây là thao tác dùng mỗi ngày, giấu
          vào trong hộp thì coi như không có. */}
      {myName && (
        <button type="button" onClick={() => setOnlyMine(!onlyMine)} aria-pressed={onlyMine}
          title={`Chỉ hiện hạng mục có QA phụ trách hoặc người hỗ trợ là "${myName}"`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8,
            border: `1px solid ${onlyMine ? C.mintText : C.pinkSoft}`,
            background: onlyMine ? C.mintSoft : "transparent",
            color: onlyMine ? C.mintText : C.plumSoft,
            fontFamily: TEXT, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
          <Users size={14} /> Việc của tôi
        </button>
      )}

      {/* + Lọc (Bộ phận / Khu vực) */}
      <div ref={popRef} style={{ position: "relative" }}>
        {/* Hai ô chọn ngày đã chuyển VÀO hộp này. Chúng chiếm cố định ~230px
            trên mọi màn hình cho một thao tác thỉnh thoảng mới dùng, trong khi
            phần đầu trang đã ngốn gần 1/3 chiều cao trước khi thấy nội dung.
            Số bộ lọc đang bật hiện ngay trên nút nên không giấu mất trạng thái. */}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: `1px dashed ${soLoc ? C.pinkText : C.pink}`, background: open || soLoc ? C.pinkMist : "transparent", color: C.pinkText, fontFamily: TEXT, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
          <Plus size={14} /> Bộ lọc{soLoc ? ` (${soLoc})` : ""}
        </button>
        {open && (
          <div className="vmp-scroll" style={{ position: "absolute", zIndex: 60, top: "calc(100% + 8px)", left: 0, minWidth: 274, maxHeight: 380, overflowY: "auto", background: C.surface, border: `1px solid ${C.pinkSoft}`, borderRadius: 14, boxShadow: "0 16px 40px rgba(120,60,110,.2)", padding: 6 }}>
            <div style={{ margin: "6px 8px 3px", fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: C.plumSoft, fontWeight: 800 }}>Khoảng thời gian</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 8px 8px" }}>
              <input type="date" value={customFrom} onChange={(e) => onFrom(e.target.value)} style={{ ...dateInp, flex: 1 }} aria-label="Từ ngày" />
              <span style={{ color: C.plumSoft, fontWeight: 800 }}>→</span>
              <input type="date" value={customTo} onChange={(e) => onTo(e.target.value)} style={{ ...dateInp, flex: 1 }} aria-label="Đến ngày" />
            </div>
            <div style={{ margin: "6px 8px 3px", fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: C.plumSoft, fontWeight: 800 }}>Bộ phận</div>
            {deptOptions.map((o) => optRow(o, deptSel.includes(o.v), toggleDept, ((DEPT_CHIP as Record<string, { dot?: string }>)[o.v] || {}).dot || C.pink))}
            <div style={{ margin: "8px 8px 3px", fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: C.plumSoft, fontWeight: 800 }}>Khu vực</div>
            {areaOptions.length === 0
              ? <div style={{ padding: "8px 9px", fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>Không có khu vực</div>
              : areaOptions.map((o) => optRow(o, areaSel.includes(o.v), toggleArea, C.marigold))}
          </div>
        )}
      </div>

      {/* chip đang lọc */}
      {deptSel.map((v) => (
        <FilterChip key={"d" + v}
          label={(DEPT_CODE as Record<string, string>)[v] || v.toUpperCase()}
          onRemove={() => toggleDept(v)}
          style={(() => {
            const chip = (DEPT_CHIP as Record<string, { soft: string; text: string }>)[v];
            return chip ? { background: chip.soft, color: chip.text } : neutralChip;
          })()} />
      ))}
      {areaSel.map((v) => (
        <FilterChip key={"a" + v} label={"Khu vực: " + v} onRemove={() => toggleArea(v)} style={neutralChip} />
      ))}
      {(customFrom || customTo) && (
        <FilterChip label={`Ngày: ${customFrom || "…"} → ${customTo || "…"}`} onRemove={() => { setCustomFrom(""); setCustomTo(""); setPeriod("all"); }} style={neutralChip} />
      )}

      {/* phải: đếm kết quả + xóa */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: C.plumSoft, fontFamily: NUM }}>
          <b style={{ color: shown < total ? C.pinkText : C.plum }}>{shown}</b>/{total} hạng mục
          <GiaiThich tieuDe={`${total} = mẫu số của thanh lọc`}>
            <span>{MAU_SO.tatCa}</span>
            {soNgung > 0 && (
              <span>
                Đã trừ {soNgung} hạng mục "Không áp dụng / Đã huỷ" — chúng không hiện ở màn nào,
                nên tính vào đây sẽ ra một mẫu số không trang nào dùng. Xem chúng ở màn Cập nhật
                tiến độ bằng ô "Hiện cả mục đã ngừng".
              </span>
            )}
            <span>Báo cáo mục 1 dùng mẫu số HẸP HƠN: chỉ hạng mục có mốc đích VMP rơi vào năm đang chọn. Số khác nhau là do định nghĩa khác nhau, không phải do lệch dữ liệu.</span>
          </GiaiThich>
        </span>
        {/* Cả màn hình đang xem nằm trong URL, nên chép link là chia sẻ được
            nguyên lát cắt — khỏi phải dặn nhau "vào Cảnh báo rồi chọn XSX". */}
        <button type="button" onClick={chepLien} title="Chép liên kết tới đúng màn hình và bộ lọc đang xem"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8,
            border: `1px solid ${daChep ? C.mintText : C.pinkSoft}`, background: daChep ? C.mintSoft : "transparent",
            color: daChep ? C.mintText : C.plumSoft, fontFamily: TEXT, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
          {daChep ? <CheckCircle2 size={13} /> : <FileText size={13} />} {daChep ? "Đã chép" : "Chép liên kết"}
        </button>
        {active && (
          <button type="button" onClick={resetAll} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.pinkSoft}`, background: C.pinkMist, color: C.pinkText, fontFamily: TEXT, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            <XCircle size={13} /> Xóa lọc
          </button>
        )}
      </div>
    </div>
  );
}

/* ===================== MAIN APP =====================
 * Global CSS & keyframes → src/index.css (tĩnh, áp dụng trước first paint).
 * Fonts → index.html (nạp 1 request, không FOUC). */
export default function App() {
  const { user, setUser, logout, isAdmin } = useAuth();
  const {
    objects, acts, conn, lastSync, dataUpdatedAt, saveStatus, reloadData, silentRefresh,
    updateActivity,
  } = useVmpData();
  // Trạng thái ban đầu: URL thắng, rồi mới tới bộ lọc nhớ từ lần trước. Ai dán
  // link cho nhau thì phải thấy ĐÚNG cái người gửi thấy, không bị bộ lọc cũ của
  // máy mình đè lên — đó là cả lý do đưa trạng thái lên URL.
  const khoiTao = useMemo<UrlState>(() => {
    const tuUrl = docUrl(typeof window === "undefined" ? "" : window.location.hash, {
      views: NAV_ITEMS.map((n) => n.id).concat(["risk", "missing"]),
      depts: DEPTS.map((d) => d.id),
      periods: PERIODS.map((p) => p[0]).concat(["custom"]),
    });
    if (vietUrl(tuUrl)) return tuUrl;            // URL có nội dung → dùng luôn
    const nho = loadFilterPrefs(loadUser()?.email || loadUser()?.name);
    return nho ? { ...tuUrl, ...docUrl(String(nho.hash || "")), view: tuUrl.view } : tuUrl;
  }, []);

  const [view, setView] = useState(khoiTao.view);
  // Đối tượng cần mở sẵn khi nhảy từ "Tiến độ theo đối tượng" sang "Danh mục &
  // Nhập liệu". Dùng object mới mỗi lần bấm (không phải chuỗi) để bấm lại cùng
  // một mã vẫn kích hoạt useEffect bên kia.
  const [moDanhMuc, setMoDanhMuc] = useState<{ code: string; nhom?: string } | null>(null);
  /* Mã hạng mục cần nhảy tới ở màn Cập nhật tiến độ. Màn "Hôm nay" đặt giá
     trị này rồi chuyển màn — người dùng khỏi phải nhớ mã và tự dán vào ô tìm. */
  const [moHangMuc, setMoHangMuc] = useState<string>("");
  /** Cách nhóm ở màn nhập liệu: theo hạng mục hay theo đối tượng. */
  const [nhomTheo, setNhomTheo] = useState<"hangmuc" | "doituong">("hangmuc");
  const [showPw, setShowPw] = useState(false);
  const mainRef = useScrollTop([view]);

  // (MỚI) BỘ LỌC TOÀN CỤC — khu vực + bộ phận (chọn NHIỀU) + thời gian (có Tùy chọn).
  const [areaSel, setAreaSel] = useState<string[]>(khoiTao.areaSel);   // rỗng = tất cả khu vực
  const [deptSel, setDeptSel] = useState<string[]>(khoiTao.deptSel);   // rỗng = tất cả bộ phận
  const [periodFilter, setPeriodFilter] = useState(khoiTao.period);
  const [customFrom, setCustomFrom] = useState(khoiTao.customFrom);   // yyyy-mm-dd
  const [customTo, setCustomTo] = useState(khoiTao.customTo);         // yyyy-mm-dd
  const [onlyMine, setOnlyMine] = useState(khoiTao.onlyMine);
  // Faceted count: số hạng mục theo mỗi bộ phận (khớp a.depts) — hiện cạnh lựa chọn.
  const deptOptions = useMemo(() => DEPTS.map((d) => ({
    v: d.id, l: d.name,
    n: acts.reduce((s, a) => s + ((a.depts || [a.dept]).includes(d.id) ? 1 : 0), 0),
  })), [acts]);
  // 1 hạng mục có thể thuộc NHIỀU bộ phận (a.depts, vd "RD,QLCL,XSX"). Khớp nếu GIAO.
  const inDept = useCallback(
    (a: Activity) => deptSel.length === 0
      || (a.depts || [a.dept]).some((d) => d != null && deptSel.includes(d)),
    [deptSel],
  );
  // Khu vực PHỤ THUỘC Bộ phận: chỉ hiện khu vực thuộc các bộ phận đã chọn.
  const areaOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of acts) {
      if (!inDept(a)) continue;
      const ar = String(a.area || "").trim();
      if (ar && ar !== "—") m.set(ar, (m.get(ar) || 0) + 1);
    }
    return [...m.keys()].sort((x, y) => x.localeCompare(y, "vi")).map((a) => ({ v: a, l: a, n: m.get(a) }));
  }, [acts, inDept]);
  // Bộ phận của mỗi đối tượng = hợp bộ phận của các hạng mục thuộc nó (để lọc danh mục).
  const objectDepts = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const a of acts) {
      if (!a.code) continue;
      let set = m.get(a.code);
      if (!set) { set = new Set(); m.set(a.code, set); }
      (a.depts || []).forEach((d) => set.add(d));
    }
    return m;
  }, [acts]);
  // Khi đổi Bộ phận, bỏ các Khu vực đã chọn không còn thuộc bộ phận đó.
  useEffect(() => {
    const valid = new Set(areaOptions.map((o) => o.v));
    setAreaSel((prev) => {
      const next = prev.filter((a) => valid.has(a));
      return next.length === prev.length ? prev : next;
    });
  }, [areaOptions]);
  const matchTime = useCallback((a: Activity) => {
    if (periodFilter === "custom") {
      if (!a.target) return false;
      if (customFrom && a.target < customFrom) return false;
      if (customTo && a.target > customTo) return false;
      return true;
    }
    return inPeriod(a, periodFilter);
  }, [periodFilter, customFrom, customTo]);
  /* ---- "Việc của tôi" ------------------------------------------------
   * Đối chiếu tên người đăng nhập với QA phụ trách / người hỗ trợ. Ô người
   * phụ trách trong Sheet có khi gói nhiều tên ("A, B") nên phải tách ra rồi
   * mới so, chứ so cả chuỗi thì người thứ hai không bao giờ khớp.
   * ------------------------------------------------------------------- */
  const myName = String(user?.name || "").trim();
  const myKey = useMemo(
    () => myName.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase(),
    [myName],
  );
  const laViecCuaToi = useCallback((a: Activity) => {
    if (!onlyMine || !myKey) return true;
    return [a.owner, a.owner_name, a.support, a.secondary_owner].some((raw) =>
      String(raw || "")
        .split(/[,;/]+/)
        .some((phan) => phan.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase() === myKey));
  }, [onlyMine, myKey]);

  const filteredActs = useMemo(() => acts.filter((a) => (
    (areaSel.length === 0 || areaSel.includes(String(a.area || "").trim())) &&
    inDept(a) &&
    matchTime(a) &&
    laViecCuaToi(a)
  )), [acts, areaSel, inDept, matchTime, laViecCuaToi]);
  /* Mẫu số của thanh lọc phải đếm HẠNG MỤC ĐANG HOẠT ĐỘNG.
     Đo được: RPC trả 461 dòng = 448 đang hoạt động + 13 "Không áp dụng".
     Thanh lọc ghi 461 nhưng mọi màn bên dưới đều lọc bỏ 13 dòng kia, nên
     con số 461 là một mẫu số KHÔNG MÀN NÀO dùng — người đọc đối chiếu với
     bất kỳ trang nào cũng thấy lệch, và không có cách nào biết vì sao.
     Dữ liệu vẫn giữ nguyên cả 461 dòng (màn Cập nhật tiến độ có ô "Hiện cả
     mục đã ngừng" cần chúng); chỉ CON SỐ ĐẾM là đổi. */
  const laSong = (a: Activity) => (a.state || "active") === "active";
  const soSong = useMemo(() => acts.filter(laSong).length, [acts]);
  const soSongHien = useMemo(() => filteredActs.filter(laSong).length, [filteredActs]);
  const soNgung = acts.length - soSong;

  const filteredObjects = useMemo(() => objects.filter((o) => {
    if (areaSel.length && !areaSel.includes(String(o.area || "").trim())) return false;
    if (deptSel.length) {
      const set = objectDepts.get(o.code);
      if (!set || !deptSel.some((d) => set.has(d))) return false;
    }
    return true;
  }), [objects, areaSel, deptSel, objectDepts]);

  /* ---- URL ↔ trạng thái ----------------------------------------------
   * Ghi: đổi MÀN thì pushState (nút Back quay về màn trước — hành vi ai cũng
   * mong đợi); chỉnh BỘ LỌC thì replaceState, vì gõ ngày tháng mà mỗi ký tự
   * đẩy một mục vào lịch sử thì bấm Back mười lần mới thoát nổi.
   * Đọc: nghe popstate (Back/Forward) và hashchange (người dùng tự sửa URL).
   * ------------------------------------------------------------------- */
  const trangThaiUrl = useMemo<UrlState>(() => ({
    view, deptSel, areaSel, period: periodFilter, customFrom, customTo, onlyMine,
  }), [view, deptSel, areaSel, periodFilter, customFrom, customTo, onlyMine]);

  const viewTruoc = useRef(view);
  useEffect(() => {
    const hash = vietUrl(trangThaiUrl);
    const moi = hash ? `#${hash}` : window.location.pathname + window.location.search;
    // So với hash hiện tại: không có bước này thì chính popstate lại kích hoạt
    // effect này ghi đè lịch sử, và nút Forward chết.
    const dangCo = window.location.hash ? window.location.hash : "";
    if (dangCo === (hash ? `#${hash}` : "")) { viewTruoc.current = view; return; }
    const doiMan = viewTruoc.current !== view;
    viewTruoc.current = view;
    try {
      if (doiMan) window.history.pushState(null, "", moi);
      else window.history.replaceState(null, "", moi);
    } catch { /* trình duyệt chặn history thì bỏ qua, app vẫn chạy */ }
  }, [trangThaiUrl, view]);

  // Nhớ bộ lọc cho lần mở sau. KHÔNG lưu `view` — mở app ra mà nhảy thẳng vào
  // màn hôm qua đang dở thì khó hiểu hơn là tiện.
  useEffect(() => {
    if (!user) return;
    saveFilterPrefs(user.email || user.name, {
      hash: vietUrl({ ...trangThaiUrl, view: MAC_DINH.view }),
    });
  }, [trangThaiUrl, user]);

  useEffect(() => {
    const apDung = () => {
      const s = docUrl(window.location.hash, {
        views: NAV_ITEMS.map((n) => n.id).concat(["risk", "missing"]),
        depts: DEPTS.map((d) => d.id),
        periods: PERIODS.map((p) => p[0]).concat(["custom"]),
      });
      viewTruoc.current = s.view;
      setView(s.view);
      setDeptSel(s.deptSel);
      setAreaSel(s.areaSel);
      setPeriodFilter(s.period);
      setCustomFrom(s.customFrom);
      setCustomTo(s.customTo);
      setOnlyMine(s.onlyMine);
    };
    window.addEventListener("popstate", apDung);
    window.addEventListener("hashchange", apDung);
    return () => {
      window.removeEventListener("popstate", apDung);
      window.removeEventListener("hashchange", apDung);
    };
  }, []);

  // (MỚI) Giữ dữ liệu tươi: làm mới khi quay lại tab; RELOAD khi sang NGÀY MỚI
  // (VMP_TODAY và "hôm nay" tính lúc tải trang → tránh "quá hạn/ngày còn lại" bị cũ khi mở lâu).
  useEffect(() => {
    const bootDay = new Date().toDateString();
    const onFocus = () => { if (document.visibilityState !== "hidden" && silentRefresh) silentRefresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const iv = setInterval(() => {
      if (new Date().toDateString() !== bootDay) window.location.reload(); // qua ngày mới → tải lại
    }, 60000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(iv);
    };
  }, [silentRefresh]);

  // Login screen
  if (!user) return (
    <LoginScreen onLogin={(u) => { setUser(u); saveUser(u); }} />
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
      {showPw && <ChangePwModal onClose={() => setShowPw(false)} />}

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
            title={title} user={user} sub={(NAV_SUBS as Record<string, string>)[view]}
            onRefresh={reloadData} refreshing={conn.status === "loading"}
            lastSync={lastSync} dataUpdatedAt={dataUpdatedAt}
          />

          {/* Toast trạng thái lưu nổi góc phải */}
          {saveStatus && (
            <div style={{
              position: "fixed", top: 20, right: 20, zIndex: 9999,
              padding: "12px 18px", borderRadius: 14, fontFamily: TEXT, fontWeight: 700, fontSize: 14,
              display: "flex", alignItems: "center", gap: 10, maxWidth: 380,
              boxShadow: "0 8px 28px rgba(120,60,110,.22)",
              background: saveStatus === "saving" ? C.surface
                : saveStatus === "saved" ? C.mintSoft
                : saveStatus === "warning" ? C.marigoldSoft : C.raspSoft,
              color: saveStatus === "saving" ? C.plum
                : saveStatus === "saved" ? C.mintText
                : saveStatus === "warning" ? C.marigoldText : C.raspText,
              border: `1.5px solid ${saveStatus === "saving" ? C.pinkSoft
                : saveStatus === "saved" ? C.mint
                : saveStatus === "warning" ? C.marigold : C.rasp}`,
            }}>
              <span style={{ fontSize: 16 }}>
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
                marginBottom: 22, padding: "16px 18px", borderRadius: 14,
                border: `1.5px solid ${conn.status === "err" ? C.raspSoft : C.pinkSoft}`,
                background: conn.status === "err" ? C.raspSoft : C.surface,
                display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
              }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, background: conn.status === "err" ? C.surface : C.pinkMist, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {conn.status === "err" ? <AlertCircle size={22} color={C.raspText} /> : <Cloud size={22} color={C.pink} />}
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: conn.status === "err" ? C.raspText : C.plum }}>
                    {conn.status === "err" ? "Chưa tải được dữ liệu" : conn.readUrl ? "Đang chờ đồng bộ…" : "Chưa cấu hình kết nối"}
                  </div>
                  <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 3 }}>
                    {conn.msg || "Nhúng URL webhook trong .env hoặc bấm Làm mới."}
                  </div>
                </div>
                {conn.readUrl && (
                  <button onClick={reloadData} style={{ ...btnPrimary, padding: "10px 18px", borderRadius: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    <RefreshCw size={15} /> Thử lại
                  </button>
                )}
              </div>
            )}

            {/* Sync warning banner */}
            {acts.length > 0 && <SyncBanner conn={conn} lastSync={lastSync} dataUpdatedAt={dataUpdatedAt} />}

            {/* Bộ lọc TOÀN CỤC (khu vực + thời gian) — áp cho mọi trang có dữ liệu */}
            {/* Trang "Luật đang áp dụng" đọc thẳng cấu hình từ database, không
                hiển thị hạng mục nào — thanh lọc ở đó là một bộ điều khiển
                không điều khiển gì, lại còn ghi "461/461 hạng mục" trên một
                trang không có hạng mục. Ẩn đi. */}
            {acts.length > 0 && view !== "audit" && view !== "admin" && view !== "missing"
              && view !== "rules" && (
              <GlobalFilterBar
                areaSel={areaSel} setAreaSel={setAreaSel}
                deptSel={deptSel} setDeptSel={setDeptSel}
                period={periodFilter} setPeriod={setPeriodFilter}
                customFrom={customFrom} setCustomFrom={setCustomFrom}
                customTo={customTo} setCustomTo={setCustomTo}
                areaOptions={areaOptions} deptOptions={deptOptions}
                shown={soSongHien} total={soSong} soNgung={soNgung}
                onlyMine={onlyMine} setOnlyMine={setOnlyMine} myName={myName}
              />
            )}

            {/* Page router — Suspense bọc các màn lazy; fallback là skeleton nhẹ. */}
            {/* key={view} khiến React dựng lại nhánh này mỗi lần đổi màn, nhờ
                đó hoạt ảnh vào chạy lại — mắt biết nội dung vừa thay. */}
            <div key={view} className="vmp-view-enter">
            <Suspense fallback={<SkeletonDashboard />}>
              {view === "today" && (
                <TodayView acts={filteredActs} myName={myName} setView={setView}
                  onMo={(a) => { setMoHangMuc(String(a.id)); setView("progress"); }} />
              )}
              {view === "overview" && <Overview acts={filteredActs} setView={setView} />}
              {view === "timeline" && <TimelineView acts={filteredActs} />}
              {view === "inventory" && (
                <CatalogView objects={filteredObjects} acts={filteredActs} isAdmin={isAdmin}
                  onUpdate={updateActivity} onReload={reloadData} readOnly={false}
                  onMoDanhMuc={(code, nhom) => { setMoDanhMuc({ code, nhom }); setView("source"); }} />
              )}
              {view === "source" && <SourceCatalogView user={user} onReload={reloadData} focus={moDanhMuc} />}
              {view === "health" && <HealthView acts={filteredActs} user={user} />}
              {view === "rules" && <ActiveRulesView user={user} />}
              {view === "progress" && (
                <>
                  {/* Nút đổi cách NHÓM, không phải đổi màn. Cùng dữ liệu, cùng
                      hộp sửa, cùng bộ lọc — chỉ khác cách gom dòng. */}
                  <div className="vmp-doi-nhom">
                    <button type="button" onClick={() => setNhomTheo("hangmuc")}
                      className={nhomTheo === "hangmuc" ? "is-chon" : ""}>Theo hạng mục</button>
                    <button type="button" onClick={() => setNhomTheo("doituong")}
                      className={nhomTheo === "doituong" ? "is-chon" : ""}>Theo đối tượng</button>
                  </div>
                  {nhomTheo === "doituong" ? (
                    <CatalogView objects={filteredObjects} acts={filteredActs} isAdmin={isAdmin}
                      onUpdate={updateActivity} onReload={reloadData} readOnly={false}
                      onMoDanhMuc={(code, nhom) => { setMoDanhMuc({ code, nhom }); setView("source"); }} />
                  ) : (
                    <UpdateView acts={filteredActs} conn={conn} isAdmin={isAdmin}
                      onUpdate={updateActivity} onReload={reloadData} readOnly={false}
                      focusId={moHangMuc} onFocusDone={() => setMoHangMuc("")} />
                  )}
                </>
              )}
              {/* "risk" là mục cũ đã gộp vào Cảnh báo — giữ nhánh này để đường
                  dẫn/nút cũ không dẫn vào trang trắng. */}
              {(view === "alerts" || view === "risk") && <AlertsView acts={filteredActs} />}
              {view === "workload" && <WorkloadView acts={filteredActs} />}
              {view === "reports" && <ReportsView acts={filteredActs} />}
              {view === "audit" && <AuditLogView />}
              {view === "admin" && <AdminView conn={conn} user={user} />}
            </Suspense>
            </div>

            {/* Trợ lý hỏi đáp — nổi ở góc, không chiếm chỗ của bảng dữ liệu */}
            {/* Truyền màn đang xem xuống để Vali gợi ý câu hỏi bám đúng chỗ
                người dùng đang đứng — hỏi ở trang Cảnh báo khác hẳn hỏi ở
                trang Tổng quan. */}
            <Suspense fallback={null}><ChatBox user={user} trang={view} /></Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}

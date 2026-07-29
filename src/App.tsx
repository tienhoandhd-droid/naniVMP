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
  FileBarChart,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Sparkles as SparkIcon,
  Download,
  Filter,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  XCircle,
  Plus,
  Printer,

  Radar,
  Cloud,
  FileText,
  Clock, ClipboardCheck, FileWarning, ChevronRight, Search, Users, Scale,
} from "lucide-react";
// Lưu ý: recharts đã bị gỡ vì KHÔNG dùng (chỉ import thừa, nặng bundle).
// xlsx được nạp động (dynamic import) ngay trong hàm xuất Excel để giảm bundle ban đầu.

// ===== Internal modules (refactored) =====
import { C, TEXT, NUM, GRAD, btnPrimary, INP, glass } from "./constants/theme.ts";
import {

  DEPTS,
  DEPT_CODE,
  PERM_LABEL,
  NAV_ITEMS,
  NAV_SUBS,
  PLABEL,
  vmpToday,
} from "./constants/vmp.ts";
import {
  tally,
  docTally,
  inPeriod,
  runDataQualityChecks,
  nhanXetTuDong,
  buildReportHTML,
  download,
} from "./utils/helpers.ts";
import { useScrollTop, useAuth, useVmpData, useDebounce } from "./hooks/index.ts";
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
  PrincessCommentary, StatTile, Ring} from "./components/ui/Primitives.tsx";
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
const ChatBox = lazy(() => import("./components/ai/ChatBox.tsx"));
import CompletionDashboard from "./components/dashboard/CompletionDashboard.tsx";
import MaTranTienDo from "./components/dashboard/MaTranTienDo.tsx";

// ===== Legacy lib imports (kept for compatibility) =====
import { saveUser } from "./lib/config.ts";
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
        borderRadius: 12,
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
          fontSize: 14.5,
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
          borderRadius: 24,
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
          {/* Guardian silhouette — bottom-right, faint watermark */}
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

          {/* Top — CPC1HN masthead (corporate presence, refined pill) */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "6px 10px",
                background: "rgba(255, 255, 255, 0.97)",
                borderRadius: 6,
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
                fontSize: 92,
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
                fontSize: 92,
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
                fontSize: 12.5,
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
              fontSize: 26,
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
              fontSize: 13.5,
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
                  fontSize: 13,
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
                fontSize: 15,
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
                  fontSize: 10,
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
                  fontSize: 13,
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
                borderRadius: 12,
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
        {msg.text && <div style={{ fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", gap: 6, color: msg.type === "ok" ? C.mintText : C.raspText }}>{msg.type === "ok" ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {msg.text}</div>}
        <button onClick={submit} disabled={loading} style={{ ...btnPrimary, marginTop: 4, padding: "13px", borderRadius: 14, fontSize: 14.5 }}>{loading ? "Đang lưu…" : "Xác nhận"}</button>
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
            style={{ padding: "9px 16px", borderRadius: 12, cursor: "pointer",
                     fontFamily: TEXT, fontSize: 13, fontWeight: tab === t.id ? 800 : 600,
                     border: `1.5px solid ${tab === t.id ? C.pink : C.pinkSoft}`,
                     background: tab === t.id ? C.pinkSoft : C.surface,
                     color: tab === t.id ? C.pinkText : C.plumSoft, textAlign: "left" }}>
            {t.label}
            <span style={{ display: "block", fontSize: 10.5, fontWeight: 600, opacity: .75 }}>
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

/** Nhãn tiếng Việt + chỗ sửa cho từng loại lỗi. Thiếu loại nào thì rơi
 *  về nhãn mặc định chứ không giấu lỗi đi. */
const LOAI_LOI: Record<string, { ten: string; sua: string }> = {
  missing_code:          { ten: "Thiếu mã đối tượng", sua: "Sửa ở Danh mục & Nhập liệu → Danh mục nguồn" },
  duplicate_id:          { ten: "Trùng ID hạng mục", sua: "Hai dòng cùng mã thẩm định — xoá hoặc đổi mã một dòng" },
  deadline_before_start: { ten: "Deadline VMP trước ngày đề cương", sua: "Kiểm lại mốc đích hoặc ngày đề cương ở Cập nhật tiến độ" },
  done_no_date:          { ten: "Đánh dấu hoàn thành nhưng thiếu ngày", sua: "Vi phạm ALCOA+ — nhập ngày thực tế ở Cập nhật tiến độ" },
  date_no_done:          { ten: "Có ngày hoàn thành nhưng trạng thái chưa xong", sua: "Đặt trạng thái về Hoàn thành, hoặc xoá ngày nếu nhập nhầm" },
  owner_no_email:        { ten: "Người thực hiện chưa có email", sua: "Điền ở Danh mục & Nhập liệu → tab Người thực hiện" },
  no_validation_type:    { ten: "Chưa xác định loại thẩm định", sua: "Đặt IQ/OQ/PQ/CV ở Danh mục nguồn rồi sinh lại timeline" },
  high_crit_no_plan:     { ten: "Trọng yếu cao nhưng vẫn ở Kế hoạch", sua: "ICH Q9 đòi làm nhóm rủi ro cao trước — xếp lịch sớm" },
};

const SEV = {
  error:   { nhan: "Lỗi", mau: C.raspText, nen: C.raspSoft, emoji: "🚫", uu_tien: 0 },
  warning: { nhan: "Cảnh báo", mau: C.marigoldText, nen: C.marigoldSoft, emoji: "⚠️", uu_tien: 1 },
  info:    { nhan: "Thông tin", mau: C.skyText, nen: C.skySoft, emoji: "ℹ️", uu_tien: 2 },
} as const;
const sevOf = (s: string) => SEV[(s as keyof typeof SEV)] ?? SEV.info;

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

  const nutNho = { fontFamily: TEXT, fontSize: 12.5, fontWeight: 700, color: C.plum,
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
              style={{ border: "none", outline: "none", background: "transparent", fontFamily: TEXT, fontSize: 12.5, fontWeight: 600, color: C.plum, width: 230 }} />
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
                <div key={g.type} style={{ border: `1px solid ${sv.nen}`, borderRadius: 16, overflow: "hidden", background: C.surface }}>
                  <button onClick={() => setMo((p) => ({ ...p, [g.type]: !p[g.type] }))}
                    style={{ width: "100%", textAlign: "left", border: "none", background: dangMo ? sv.nen : C.surface,
                             cursor: "pointer", padding: "13px 15px", display: "flex", alignItems: "center", gap: 12 }}>
                    <ChevronRight size={17} color={sv.mau} style={{ transform: dangMo ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
                    <span style={{ fontSize: 17 }}>{sv.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plum }}>{meta.ten}</div>
                      {meta.sua && <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>{meta.sua}</div>}
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
                          <span style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600 }}>
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
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {g.ds.slice(0, soHien).map((it, i) => (
                              <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 12.5, padding: "6px 0", borderTop: i ? `1px solid ${C.pinkMist}` : "none" }}>
                                <span style={{ fontFamily: NUM, fontWeight: 800, color: sv.mau, minWidth: 165 }}>{it.id}</span>
                                <span style={{ color: C.plumSoft, fontWeight: 600 }}>{it.msg}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {g.ds.length > soHien && (
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
          <div style={{ padding: 16, color: C.raspText, fontWeight: 700, fontSize: 13 }}>
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
                    <span style={{ flex: 1, fontFamily: TEXT, fontSize: 13.5, fontWeight: 800, color: C.plum }}>{loai}</span>
                    <Tag color={nang ? C.raspText : C.marigoldText} bg={nang ? C.raspSoft : C.marigoldSoft}>{ds.length}</Tag>
                  </button>
                  {dangMo && (
                    <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                      {ds.slice(0, 30).map((it, i) => (
                        <div key={i} style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600, paddingTop: 6, borderTop: i ? `1px solid ${C.pinkMist}` : "none" }}>
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
            style={{ ...btnPrimary, padding: "10px 18px", borderRadius: 12, display: "flex", alignItems: "center", gap: 7 }}>
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
            <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600, marginTop: 5, lineHeight: 1.6 }}>
              {loadErr}
              <br />
              Thường gặp: phiên đăng nhập hết hạn (đăng nhập lại), hoặc tài khoản không phải admin/QA —
              nhật ký chỉ mở cho hai vai trò này.
            </div>
            <button onClick={() => loadLogs(0)}
              style={{ ...btnPrimary, marginTop: 12, padding: "9px 18px", borderRadius: 11, fontSize: 13 }}>
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
                    <th key={i} style={{ textAlign: "left", padding: "12px 14px", fontSize: 11.5, fontWeight: 800, color: C.plumSoft, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const al = (actionLabels as Record<string, { label: string; color: string; bg: string }>)[log.action]
                    || { label: log.action, color: C.plumSoft, bg: C.pinkSoft };
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
              style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${C.pinkSoft}`, background: C.surface, cursor: page === 0 ? "not-allowed" : "pointer", fontFamily: TEXT, fontWeight: 700, color: C.plumSoft }}>
              ← Trước
            </button>
            <span style={{ display: "flex", alignItems: "center", fontSize: 13, fontWeight: 700, color: C.plum }}>
              Trang {page + 1} / {Math.ceil(total / PAGE_SIZE)}
            </span>
            <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => loadLogs(page + 1)}
              style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${C.pinkSoft}`, background: C.surface, cursor: (page + 1) * PAGE_SIZE >= total ? "not-allowed" : "pointer", fontFamily: TEXT, fontWeight: 700, color: C.plumSoft }}>
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
      <div style={{ fontSize: 11, fontWeight: 800, color: C.plumSoft, textTransform: "uppercase", letterSpacing: ".03em" }}>{nhan}</div>
      <div style={{ fontFamily: NUM, fontSize: 21, fontWeight: 800, color: C.plum, marginTop: 3 }}>{giaTri}</div>
      {phu && <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600, marginTop: 1 }}>{phu}</div>}
    </div>
  );

  const d = tt?.du_lieu || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Card>
        <CardTitle icon={BarChart3} sub="Người dùng · cấu hình · việc tự động · khối lượng dữ liệu"
          right={<button onClick={load} disabled={loading}
            style={{ ...btnPrimary, padding: "8px 15px", borderRadius: 11, fontSize: 12.5, opacity: loading ? 0.6 : 1 }}>
            {loading ? "Đang tải…" : "Tải lại"}</button>}>
          Quản trị hệ thống
        </CardTitle>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
          <div style={{ padding: "13px 15px", borderRadius: 14, background: conn.status === "ok" ? C.mintSoft : C.marigoldSoft }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: conn.status === "ok" ? C.mintText : C.marigoldText, textTransform: "uppercase" }}>Kết nối dữ liệu</div>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: C.plum, marginTop: 3 }}>
              {conn.status === "ok" ? "Đang chạy · Supabase" : conn.status === "loading" ? "Đang tải…" : conn.status === "err" ? "Lỗi kết nối" : "Chưa kết nối"}
            </div>
          </div>
          <div style={{ padding: "13px 15px", borderRadius: 14, background: isSupabaseConfigured() ? C.mintSoft : C.raspSoft }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: isSupabaseConfigured() ? C.mintText : C.raspText, textTransform: "uppercase" }}>Xác thực</div>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: C.plum, marginTop: 3 }}>{isSupabaseConfigured() ? "Supabase Auth" : "Chế độ tạm (env)"}</div>
          </div>
          {oSo("Đang đăng nhập", user?.name || "—", `${user?.role || ""} · ${(user && PERM_LABEL[user.perm]) || ""}`)}
        </div>
      </Card>

      {err && (
        <Card>
          <div style={{ padding: "16px 18px", borderRadius: 14, background: C.raspSoft, border: `1px solid ${C.rasp}` }}>
            <div style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 14, color: C.raspText }}>Không đọc được trạng thái hệ thống</div>
            <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600, marginTop: 5 }}>{err}</div>
            <button onClick={load} style={{ ...btnPrimary, marginTop: 12, padding: "9px 18px", borderRadius: 11, fontSize: 13 }}>Thử lại</button>
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
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, fontSize: 13 }}>
                <thead><tr style={{ background: C.pinkMist }}>
                  {["Họ tên", "Email", "Vai trò", "Bộ phận", "Tình trạng", "Đăng nhập gần nhất"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "11px 14px", fontSize: 11.5, fontWeight: 800, color: C.plumSoft, whiteSpace: "nowrap" }}>{h}</th>
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
            <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600, marginTop: 10, lineHeight: 1.6 }}>
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
                <div key={j.ten} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 13, background: C.surface, border: `1px solid ${C.pinkSoft}` }}>
                  <Tag color={j.dang_bat ? C.mintText : C.plumSoft} bg={j.dang_bat ? C.mintSoft : C.pinkMist}>{j.dang_bat ? "Đang bật" : "Tắt"}</Tag>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: C.plum }}>{j.ten}</div>
                    <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600, marginTop: 1 }}>
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
                  <div key={i} style={{ padding: "10px 13px", borderRadius: 12, background: C.surface, border: `1px solid ${C.raspSoft}` }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.plum }}>{wf.ten || "(không tên)"}</div>
                    <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>
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
                style={{ fontFamily: TEXT, fontSize: 12.5, fontWeight: 700, color: C.plum, border: `1.5px solid ${C.pinkSoft}`, background: C.surface, borderRadius: 999, padding: "7px 13px", cursor: "pointer" }}>
                {moCauHinh ? "Gập lại" : "Xem"}</button>}>
              Cấu hình hệ thống
            </CardTitle>
            {moCauHinh && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {(tt.cau_hinh || []).map((c: NonNullable<SystemStatus["cau_hinh"]>[number]) => (
                  <div key={c.khoa} style={{ display: "flex", gap: 12, fontSize: 12.5, padding: "6px 0", borderTop: `1px solid ${C.pinkMist}` }}>
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

    // Tỷ lệ hoàn thành theo tháng đích — dải cột nhỏ trong ô "Hoàn thành".
    // Cho biết nhịp đang lên hay đang chùng, thứ con số tổng không nói được.
    const thang = Array.from({ length: 12 }, () => ({ tong: 0, xong: 0 }));
    for (const a of acts) {
      const t = a.target ? new Date(a.target).getMonth() : -1;
      if (t < 0 || t > 11) continue;
      thang[t].tong++;
      if (a.st === "done") thang[t].xong++;
    }
    return {
      e, d, overdue, soon,
      gap: e.done - d.done, gapPts: e.rate - d.rate,
      mismatched: acts.filter((a) => a.mismatch),
      theoThang: thang.map((m) => (m.tong ? m.xong / m.tong : 0)),
    };
  }, [acts]);

  const di = (v: string) => (setView ? () => setView(v) : undefined);

  return (
    <div className="vmp-bento vmp-stagger">
      {/* Ô lớn — trạng thái chung của cả kế hoạch */}
      <Card variant="strong" cls="b-hero"
        style={{ padding: "26px 28px", display: "flex", alignItems: "center",
                 gap: 26, flexWrap: "wrap" }}>
        <Ring size={176} stroke={16} segments={[
          { value: e.done, color: C.mint },
          { value: e.over, color: C.rasp },
          { value: e.todo, color: C.marigold },
        ]}>
          <div style={{ fontFamily: NUM, fontSize: 40, fontWeight: 800,
                        color: C.plum, lineHeight: 1 }}>{e.rate}%</div>
          <div style={{ fontSize: 11, color: C.plumSoft, fontWeight: 800,
                        marginTop: 3, letterSpacing: .4 }}>THẨM ĐỊNH</div>
        </Ring>

        <div style={{ flex: 1, minWidth: 190 }}>
          <div style={{ fontFamily: TEXT, fontSize: 19, fontWeight: 800,
                        color: C.plum, marginBottom: 3 }}>
            Tiến độ thẩm định {vmpToday().getFullYear()}
          </div>
          <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600, marginBottom: 15 }}>
            {e.total} hạng mục trong kế hoạch năm
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {[
              { l: "Hoàn thành", v: e.done, c: C.mint, t: C.mintText },
              { l: "Quá hạn (trạng thái)", v: e.over, c: C.rasp, t: C.raspText },
              { l: "Chưa hoàn thành", v: e.todo, c: C.marigold, t: C.marigoldText },
            ].map((x) => (
              <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999,
                               background: x.c, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 700,
                               flex: 1 }}>{x.l}</span>
                <div style={{ width: 88, height: 6, borderRadius: 999,
                              background: C.surfaceSunk, overflow: "hidden" }}>
                  <div style={{ width: `${e.total ? (x.v / e.total) * 100 : 0}%`,
                                height: "100%", background: x.c }} />
                </div>
                <span style={{ fontFamily: NUM, fontSize: 19, fontWeight: 800,
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
      </Card>

      {/* CẨN THẬN: hai con số này KHÁC NHAU và trước đây cùng mang nhãn "Quá hạn"
          trên một màn hình — 162 vs 279 — nên không ai biết tin số nào.
          · e.over  = trạng thái hạng mục đang là "quá hạn"
          · overdue = hạng mục có MỐC gần nhất (đề cương/thẩm định/báo cáo) đã trôi qua,
            kể cả khi trạng thái tổng chưa chuyển. Số này luôn ≥ số kia. */}
      <StatTile cls="b-k1" icon={AlertCircle} label="Có mốc đã quá hạn" value={overdue.length}
        tone={{ c: C.raspText, bg: C.raspSoft }} onClick={di("progress")}
        sub={overdue.length ? `Gồm cả hạng mục trạng thái chưa đổi · bấm để xử lý` : "Không còn hạng mục nào trễ"} />

      <StatTile cls="b-k2" icon={Clock} label="Tới hạn 30 ngày" value={soon.length}
        tone={{ c: C.marigoldText, bg: C.marigoldSoft }} onClick={di("alerts")}
        sub={soon.length ? "Theo dõi để không rơi sang quá hạn" : "Tháng tới đang trống"} />

      <StatTile cls="b-k3" icon={ClipboardCheck} label="Tỷ lệ hồ sơ" value={`${d.rate}%`}
        tone={{ c: C.mintText, bg: C.mintSoft }} bars={theoThang}
        sub={`${d.done}/${d.total} hoàn thiện · dải cột = tỷ lệ xong theo tháng đích`} />

      <StatTile cls="b-k4" icon={FileWarning} label="Lệch pha hồ sơ" value={mismatched.length}
        tone={{ c: C.lavText, bg: C.lavSoft }} onClick={di("health")}
        sub={mismatched.length ? "Trạng thái các giai đoạn mâu thuẫn nhau" : "Các giai đoạn khớp nhau"} />

      <div className="b-vali">
        <PrincessCommentary stats={{
          e, d, overdue: overdue.length, soon: soon.length, mismatched: mismatched.length,
        }} />
      </div>

      {/* Ma trận giai đoạn + chất lượng dữ liệu + điểm nóng — học từ dashboard BMS */}
      <div className="b-wide" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <MaTranTienDo acts={acts} />
        <CompletionDashboard acts={acts} />
      </div>
    </div>
  );
}

/* --- ReportsView (with AI via Anthropic proxy) --- */
function ReportsView({ acts }: { acts: Activity[] }) {
  const [period, setPeriod] = useState("thang");
  const [scope, setScope] = useState("all");
  const [ai, setAi] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const scoped = scope === "all" ? acts : acts.filter((a) => a.dept === scope);
  const scopeLabel = scope === "all" ? "Toàn nhà máy" : (DEPTS.find((d) => d.id === scope)?.name || scope);
  const e = tally(scoped), d = docTally(scoped);
  const deptRows = DEPTS.map((dp) => { const da = scoped.filter((a) => a.dept === dp.id); const t = tally(da); return { ...dp, ...t }; }).filter((r) => r.total > 0);
  const overdueList = scoped
    .map((a) => a.alert && a.alert.kind === "over"
      ? { id: a.id, name: a.name ?? a.code, stage: a.alert.stage, dleft: a.alert.dleft }
      : null)
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const pl = (PLABEL as Record<string, { t: string; p: string }>)[period];
  const html = () => buildReportHTML(period, scopeLabel, e, d, deptRows, overdueList, ai);

  const generate = async () => {
    setLoading(true); setErr(""); setAi("");
    // Gọi n8n webhook AI report (OpenAI key ở backend, KHÔNG ở frontend)
    const aiWebhookUrl = import.meta.env.VITE_N8N_AI_REPORT_URL || "";
    if (!aiWebhookUrl) {
      setErr("Chưa cấu hình đường gọi AI (VITE_N8N_AI_REPORT_URL). Nhận xét tự động phía trên vẫn dùng được bình thường.");
      setLoading(false);
      return;
    }

    // Workflow "Vani VMP 5" TỰ ĐỌC dữ liệu thô từ Supabase (toàn bộ hạng mục
    // năm nay, danh sách quá hạn, lỗi hồ sơ, tải việc theo người) nên web chỉ
    // cần nói ĐANG XEM KỲ NÀO, PHẠM VI NÀO. Trước đây web gửi lên vài con số
    // tóm tắt, AI chỉ diễn giải lại đúng mấy con số đó.
    const reportData = { ky: period, pham_vi: scope };

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      // Cùng token với ô chat: nằm trong gói JS công khai nên chỉ để chặn quét
      // bừa, không phải bí mật. Không dùng lại x-vmp-secret của đường ghi.
      const chatToken = import.meta.env.VITE_N8N_CHAT_TOKEN as string | undefined;
      if (chatToken) headers["x-vmp-chat"] = chatToken;

      const res = await fetch(aiWebhookUrl, { method: "POST", headers, body: JSON.stringify(reportData) });
      const json = await res.json();

      if (json.ok && json.ai_text) {
        setAi(json.ai_text);
      } else if (json.error) {
        setErr(`Lỗi AI: ${json.error}`);
      } else {
        setErr("Không nhận được phản hồi AI từ n8n.");
      }
    } catch (ex) { setErr("Lỗi kết nối n8n: " + ((ex as Error)?.message || "không xác định")); }
    finally { setLoading(false); }
  };

  const printPDF = () => {
    const ifr = document.createElement("iframe");
    ifr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(ifr);
    const win = ifr.contentWindow;
    if (!win) return;
    const dd = win.document;
    dd.open(); dd.write(html()); dd.close();
    setTimeout(() => { try { win.focus(); win.print(); } catch { /* trình duyệt chặn in */ } setTimeout(() => document.body.removeChild(ifr), 1500); }, 400);
  };

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const wsData = [["Nhóm", "HT", "QH", "Chưa", "Tổng", "Tỷ lệ"], ["Thẩm định", e.done, e.over, e.todo, e.total, e.rate], ["Hồ sơ", d.done, d.over, d.todo, d.total, d.rate], [], ["Bộ phận", "HT", "QH", "Chưa", "Tổng", "Tỷ lệ"], ...deptRows.map((r) => [r.name, r.done, r.over, r.todo, r.total, r.rate])];
    const ws = XLSX.utils.aoa_to_sheet(wsData); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Báo cáo"); XLSX.writeFile(wb, `VMP_${period}_CPC1HN.xlsx`);
  };

  const Seg = ({ id, label }: { id: string; label: string }) => <button onClick={() => { setPeriod(id); setAi(""); }} style={{ padding: "10px 17px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: TEXT, fontSize: 13, fontWeight: 800, background: period === id ? GRAD : C.pinkSoft, color: period === id ? "#fff" : C.plumSoft }}>{label}</button>;

  const statRow = (
    lbl: string,
    x: { done: number; total: number; rate: number; over?: number; todo?: number },
    dotc: string,
  ) => (
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
          {/* Nút gọi AI chỉ hiện khi thật sự có dịch vụ AI. Trước đây nút luôn
              hiện và luôn báo "Chưa cấu hình VITE_N8N_AI_REPORT_URL. Liên hệ
              IT" — biến đó chưa từng được đặt, nên nút chết từ đầu. */}
          {!!import.meta.env.VITE_N8N_AI_REPORT_URL && (
            <button onClick={generate} disabled={loading} style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 9, padding: "13px 24px", borderRadius: 14, fontSize: 14.5 }}>{loading ? <RefreshCw size={17} className="spin" /> : <SparkIcon size={17} />} {loading ? "AI đang phân tích…" : "Thêm nhận xét AI"}</button>
          )}
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
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
            <SparkIcon size={18} color={C.pink} />
            <span style={{ fontFamily: TEXT, fontSize: 17, fontWeight: 800, color: C.plum }}>Nhận xét</span>
            <Tag color={C.mintText} bg={C.mintSoft}>Tính từ số liệu</Tag>
          </div>

          {/* Nhận xét tự động: tính thẳng từ số đang hiện, không gọi dịch vụ nào.
              Cùng một bộ số cho ra đúng một câu — hợp hồ sơ GMP hơn văn AI. */}
          <div style={{ fontFamily: TEXT, fontSize: 14, color: C.plum, lineHeight: 1.85, fontWeight: 500,
                        background: C.pinkMist, borderLeft: `4px solid ${C.pink}`, borderRadius: "0 14px 14px 0", padding: "16px 20px" }}>
            <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 7 }}>
              {nhanXetTuDong(scoped).map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>

          {/* Phần AI chỉ xuất hiện khi có dịch vụ và người dùng bấm gọi. */}
          {err && <div style={{ marginTop: 12, color: C.raspText, fontSize: 13.5, fontWeight: 800, padding: "13px 15px", borderRadius: 12, background: C.raspSoft }}><AlertCircle size={16} /> {err}</div>}
          {loading && <div style={{ padding: 24, textAlign: "center", color: C.plumSoft, fontWeight: 700 }}><RefreshCw size={22} className="spin" color={C.pink} /><div style={{ marginTop: 10 }}>AI đang phân tích…</div></div>}
          {!loading && !err && ai && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                <SparkIcon size={16} color={C.lavText} />
                <span style={{ fontFamily: TEXT, fontSize: 15, fontWeight: 800, color: C.plum }}>Nhận xét AI</span>
                <Tag color={C.raspText} bg={C.raspSoft}>Cần QA xác nhận</Tag>
              </div>
              <div style={{ whiteSpace: "pre-wrap", fontFamily: TEXT, fontSize: 14, color: C.plum, lineHeight: 1.8, fontWeight: 500, background: C.lavSoft, borderLeft: `4px solid ${C.lav}`, borderRadius: "0 14px 14px 0", padding: "18px 22px" }}>{ai}</div>
            </div>
          )}
        </div>
      </Card>
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

const miniBtn = {
  flex: 1, padding: "5px 8px", borderRadius: 8, border: `1px solid ${C.pinkSoft}`,
  background: C.pinkMist, color: C.pinkText, fontFamily: TEXT, fontSize: 11, fontWeight: 800, cursor: "pointer",
};
const dateInp = {
  padding: "7px 9px", borderRadius: 10, border: `1px solid ${C.pinkSoft}`,
  background: C.surface, color: C.plum, fontFamily: TEXT, fontSize: 12, fontWeight: 700, cursor: "pointer",
};

// Dropdown CHỌN NHIỀU (checkbox) — dùng cho Khu vực & Bộ phận. Rỗng = tất cả.
function MultiSelect({ label, allLabel, options, selected, onChange }: {
  label: string;
  allLabel: string;
  options: Array<{ v: string; l: string }>;
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const btn = selected.length === 0 ? allLabel : `${label}: ${selected.length}`;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px",
        borderRadius: 10, border: `1px solid ${C.pinkSoft}`,
        background: selected.length ? C.pinkMist : C.surface,
        color: selected.length ? C.pinkText : C.plum,
        fontFamily: TEXT, fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
      }}>
        {btn} <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div className="vmp-scroll" style={{
          position: "absolute", zIndex: 60, top: "calc(100% + 6px)", left: 0,
          minWidth: 210, maxHeight: 300, overflowY: "auto",
          background: C.surface, border: `1px solid ${C.pinkSoft}`, borderRadius: 12,
          boxShadow: "0 12px 34px rgba(120,60,110,.18)", padding: 6,
        }}>
          <div style={{ display: "flex", gap: 6, padding: "2px 4px 8px", borderBottom: `1px solid ${C.pinkMist}`, marginBottom: 4 }}>
            <button type="button" onClick={() => onChange(options.map((o) => o.v))} style={miniBtn}>Chọn hết</button>
            <button type="button" onClick={() => onChange([])} style={miniBtn}>Bỏ chọn</button>
          </div>
          {options.length === 0 && <div style={{ padding: 10, fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>Không có dữ liệu</div>}
          {options.map((o) => (
            <label key={o.v} style={{
              display: "flex", alignItems: "center", gap: 9, padding: "7px 8px",
              cursor: "pointer", borderRadius: 8, fontSize: 12.5, fontWeight: 700, color: C.plum,
            }}>
              <input type="checkbox" checked={selected.includes(o.v)} onChange={() => toggle(o.v)}
                style={{ width: 15, height: 15, accentColor: C.pink, cursor: "pointer" }} />
              {o.l}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

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
      marginBottom: 18, padding: "11px 16px", borderRadius: 16,
      background: "rgba(255,255,255,.72)", backdropFilter: "blur(6px)",
      border: `1px solid ${C.pinkSoft}`, boxShadow: "0 4px 14px rgba(120,60,110,.06)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.plumSoft }}>
        <Filter size={15} />
        <span style={{ fontSize: 12, fontWeight: 800 }}>Lọc chung</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.plumSoft }}>Bộ phận</span>
        <MultiSelect label="Bộ phận" allLabel="Tất cả bộ phận" options={deptOptions} selected={deptSel} onChange={setDeptSel} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.plumSoft }}>Khu vực</span>
        <MultiSelect label="Khu vực" allLabel="Tất cả khu vực" options={areaOptions} selected={areaSel} onChange={setAreaSel} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.plumSoft }}>Thời gian</span>
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
        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.plumSoft }}>
          <b style={{ color: C.plum }}>{shown}</b>/{total} hạng mục
        </span>
        {active && (
          <button type="button" onClick={() => { setAreaSel([]); setDeptSel([]); setPeriod("all"); setCustomFrom(""); setCustomTo(""); }} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 10px",
            borderRadius: 10, border: `1px solid ${C.pinkSoft}`, background: C.pinkMist,
            color: C.pinkText, fontFamily: TEXT, fontSize: 11.5, fontWeight: 800, cursor: "pointer",
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
      <button type="button" onClick={onRemove} aria-label={`Bỏ ${label}`} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 17, height: 17, borderRadius: 999, border: "none", cursor: "pointer", background: "rgba(0,0,0,.08)", color: "inherit", fontSize: 13, lineHeight: 1, fontWeight: 900 }}>×</button>
    </span>
  );
}

function GlobalFilterBar({
  areaSel, setAreaSel, deptSel, setDeptSel, setPeriod,
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
  const [open, setOpen] = useState(false);
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
  const active = deptSel.length > 0 || areaSel.length > 0 || !!customFrom || !!customTo;
  const resetAll = () => { setDeptSel([]); setAreaSel([]); setPeriod("all"); setCustomFrom(""); setCustomTo(""); };
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
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: "none", background: on ? C.pinkMist : "transparent", fontFamily: TEXT, fontSize: 13, fontWeight: 700, color: C.plum, padding: "8px 9px", borderRadius: 9, cursor: "pointer" }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: dot, flex: "none" }} />
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.l}</span>
      {on && <span style={{ color: C.pinkText, fontWeight: 900 }}>✓</span>}
      <span style={{ fontSize: 11.5, fontWeight: 800, color: C.plumSoft, background: C.pinkMist, padding: "1px 8px", borderRadius: 999, fontFamily: NUM }}>{o.n}</span>
    </button>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", position: "relative", zIndex: 40, marginBottom: 18, padding: "10px 14px", borderRadius: 16, background: "rgba(255,255,255,.72)", backdropFilter: "blur(6px)", border: `1px solid ${C.pinkSoft}`, boxShadow: "0 4px 14px rgba(120,60,110,.06)" }}>
      {/* Thời gian: CHỈ theo mốc ngày (từ → đến). Để trống = mọi thời gian. */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 800, color: C.plumSoft }}><Filter size={14} /> Thời gian</span>
        <input type="date" value={customFrom} onChange={(e) => onFrom(e.target.value)} style={dateInp} aria-label="Từ ngày" />
        <span style={{ color: C.plumSoft, fontWeight: 800 }}>→</span>
        <input type="date" value={customTo} onChange={(e) => onTo(e.target.value)} style={dateInp} aria-label="Đến ngày" />
      </div>

      {/* + Lọc (Bộ phận / Khu vực) */}
      <div ref={popRef} style={{ position: "relative" }}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: `1px dashed ${C.pink}`, background: open ? C.pinkMist : "transparent", color: C.pinkText, fontFamily: TEXT, fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
          <Plus size={14} /> Lọc
        </button>
        {open && (
          <div className="vmp-scroll" style={{ position: "absolute", zIndex: 60, top: "calc(100% + 8px)", left: 0, minWidth: 250, maxHeight: 340, overflowY: "auto", background: C.surface, border: `1px solid ${C.pinkSoft}`, borderRadius: 14, boxShadow: "0 16px 40px rgba(120,60,110,.2)", padding: 6 }}>
            <div style={{ margin: "6px 8px 3px", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: C.plumSoft, fontWeight: 800 }}>Bộ phận</div>
            {deptOptions.map((o) => optRow(o, deptSel.includes(o.v), toggleDept, ((DEPT_CHIP as Record<string, { dot?: string }>)[o.v] || {}).dot || C.pink))}
            <div style={{ margin: "8px 8px 3px", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: C.plumSoft, fontWeight: 800 }}>Khu vực</div>
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
        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.plumSoft, fontFamily: NUM }}>
          <b style={{ color: shown < total ? C.pinkText : C.plum }}>{shown}</b>/{total} hạng mục
        </span>
        {active && (
          <button type="button" onClick={resetAll} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 10, border: `1px solid ${C.pinkSoft}`, background: C.pinkMist, color: C.pinkText, fontFamily: TEXT, fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>
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
    objects, acts, conn, lastSync, saveStatus, reloadData, silentRefresh,
    updateActivity,
  } = useVmpData();
  const [view, setView] = useState("overview");
  const [showPw, setShowPw] = useState(false);
  const mainRef = useScrollTop([view]);

  // (MỚI) BỘ LỌC TOÀN CỤC — khu vực + bộ phận (chọn NHIỀU) + thời gian (có Tùy chọn).
  const [areaSel, setAreaSel] = useState<string[]>([]);   // rỗng = tất cả khu vực
  const [deptSel, setDeptSel] = useState<string[]>([]);   // rỗng = tất cả bộ phận
  const [periodFilter, setPeriodFilter] = useState("all");
  const [customFrom, setCustomFrom] = useState("");   // yyyy-mm-dd
  const [customTo, setCustomTo] = useState("");       // yyyy-mm-dd
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
  const filteredActs = useMemo(() => acts.filter((a) => (
    (areaSel.length === 0 || areaSel.includes(String(a.area || "").trim())) &&
    inDept(a) &&
    matchTime(a)
  )), [acts, areaSel, inDept, matchTime]);
  const filteredObjects = useMemo(() => objects.filter((o) => {
    if (areaSel.length && !areaSel.includes(String(o.area || "").trim())) return false;
    if (deptSel.length) {
      const set = objectDepts.get(o.code);
      if (!set || !deptSel.some((d) => set.has(d))) return false;
    }
    return true;
  }), [objects, areaSel, deptSel, objectDepts]);

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
            lastSync={lastSync}
          />

          {/* Toast trạng thái lưu nổi góc phải */}
          {saveStatus && (
            <div style={{
              position: "fixed", top: 20, right: 20, zIndex: 9999,
              padding: "12px 18px", borderRadius: 14, fontFamily: TEXT, fontWeight: 700, fontSize: 13.5,
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
                background: conn.status === "err" ? C.raspSoft : C.surface,
                display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
              }}>
                <div style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: conn.status === "err" ? C.surface : C.pinkMist, display: "flex", alignItems: "center", justifyContent: "center" }}>
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

            {/* Bộ lọc TOÀN CỤC (khu vực + thời gian) — áp cho mọi trang có dữ liệu */}
            {acts.length > 0 && view !== "audit" && view !== "admin" && view !== "missing" && (
              <GlobalFilterBar
                areaSel={areaSel} setAreaSel={setAreaSel}
                deptSel={deptSel} setDeptSel={setDeptSel}
                period={periodFilter} setPeriod={setPeriodFilter}
                customFrom={customFrom} setCustomFrom={setCustomFrom}
                customTo={customTo} setCustomTo={setCustomTo}
                areaOptions={areaOptions} deptOptions={deptOptions}
                shown={filteredActs.length} total={acts.length}
              />
            )}

            {/* Page router — Suspense bọc các màn lazy; fallback là skeleton nhẹ. */}
            {/* key={view} khiến React dựng lại nhánh này mỗi lần đổi màn, nhờ
                đó hoạt ảnh vào chạy lại — mắt biết nội dung vừa thay. */}
            <div key={view} className="vmp-view-enter">
            <Suspense fallback={<SkeletonDashboard />}>
              {view === "overview" && <Overview acts={filteredActs} setView={setView} />}
              {view === "timeline" && <TimelineView acts={filteredActs} />}
              {view === "inventory" && (
                <CatalogView objects={filteredObjects} acts={filteredActs} isAdmin={isAdmin}
                  onUpdate={updateActivity} onReload={reloadData} readOnly={false} />
              )}
              {view === "source" && <SourceCatalogView user={user} onReload={reloadData} />}
              {view === "health" && <HealthView acts={filteredActs} user={user} />}
              {view === "rules" && <ActiveRulesView user={user} />}
              {view === "progress" && (
                <UpdateView acts={filteredActs} conn={conn} isAdmin={isAdmin}
                  onUpdate={updateActivity} onReload={reloadData} readOnly={false} />
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

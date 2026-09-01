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
import { useState, useEffect, useMemo, useRef, useCallback, lazy, memo, Suspense } from "react";

// ===== External libs =====
import {
    AlertCircle,
  ShieldCheck,
  Filter,
  RefreshCw,
  XCircle,

  Cloud,
  Clock, Users, FileWarning,
} from "lucide-react";
// Lưu ý: recharts đã bị gỡ vì KHÔNG dùng (chỉ import thừa, nặng bundle).
// xlsx được nạp động (dynamic import) ngay trong hàm xuất Excel để giảm bundle ban đầu.

// ===== Internal modules (refactored) =====
import { C, TEXT, NUM, btnPrimary, INP } from "./constants/theme.ts";
import { DirtyStateProvider, useDirtyStateSnapshot } from "./components/ui/DirtyStateProvider.tsx";
import ToastProvider, { useToast } from "./components/ui/ToastProvider.tsx";
import ShellConfirmDialog from "./components/layout/ShellConfirmDialog.tsx";
import {

  DEPTS,
  DEPT_CODE,
  NAV_ITEMS,
  NAV_SUBS,
  PERIODS,
} from "./constants/vmp.ts";
import {
  tally,
  docTally,
  inPeriod,
  runDataQualityChecks,
} from "./utils/helpers.ts";
import { useScrollTop, useAuth, useVmpData } from "./hooks/index.ts";
import { useAccess, useAccessCacheTransition } from "./hooks/useAccess.ts";
import { ScreenGuard } from "./components/auth/ScreenGuard.tsx";
import { resolveAuthorizedView, resolveViewIntent } from "./lib/navigationContract.ts";
import { overviewTarget } from "./lib/navigationTargets.ts";
import { createVisibleRefreshController } from "./lib/visibleRefresh.ts";
import {
  buildPersonProgressChoices,
  canSelectPersonProgressScope,
  type PersonProgressChoice,
} from "./lib/personProgressScope.ts";
import type { AccessContext, ScreenId } from "./lib/access.ts";
import { nhapCoThuLai } from "./lib/tailMan.ts";
import { docUrl, vietUrl, MAC_DINH } from "./lib/urlState.ts";
import type { UrlState } from "./lib/urlState.ts";
import { formatBangkokDateTime, formatBangkokTime } from "./lib/formatBangkok.ts";

// ===== UI Primitives =====
import {
  Card,

  Sel,
  SkeletonDashboard,
  SyncBanner,
  PrincessCommentary, StatTile, MultiSelect, } from "./components/ui/Primitives.tsx";
import { Sidebar, Topbar } from "./components/layout/Layout.tsx";
/* F2 (31/08): memo tại điểm dùng — shell App giữ ~40 state; thiếu memo thì
 * MỖI phím gõ vào ô lọc render lại cả Sidebar/Topbar/màn nặng. Props các
 * component này đã ổn định tham chiếu (useMemo/useCallback bên dưới). */
const SidebarMemo = memo(Sidebar);
const TopbarMemo = memo(Topbar);
import LoginScreen, { type LoginScreenMode } from "./components/auth/LoginScreen.tsx";
import PasswordRecoveryScreen from "./components/auth/PasswordRecoveryScreen.tsx";
import TodayCommandCenter from "./features/today/TodayCommandCenter.tsx";
const TodayCommandCenterMemo = memo(TodayCommandCenter);
import { TodayScopeControl } from "./features/today/TodayScopeControl.tsx";
import {
  defaultTodayPersonScope,
  normalizeTodayPersonScope,
  presentTodayPersonScope,
  type TodayPersonScope,
} from "./features/today/todayPersonScope.ts";
import { filterTodayScope } from "./features/today/todayScope.ts";
import { isTodayActivityMine, type ProgressDeepLink } from "./features/today/todayModel.ts";
import { bangkokCalendarDate, classifyVmpDeadline } from "./lib/vmpDeadlineModel.ts";
import {
  useTeamOverviewSummary,
  type TeamOverviewSummaryState,
} from "./features/overview/useTeamOverviewSummary.ts";
import MonitoringJourneyNav from "./features/monitoring/MonitoringJourneyNav.tsx";
import ChangePwModal from "./components/auth/ChangePwModal.tsx";
import StateBoundary from "./components/ui/StateBoundary.tsx";
import { buildMonitoringSignatureMetrics } from "./features/monitoring/monitoringMetrics.ts";

/* ===== Page components (lazy-loaded — mỗi màn tải theo yêu cầu để giảm
   bundle ban đầu).
   Bọc qua nhapCoThuLai(): chunk có mã băm theo nội dung nên bản deploy mới
   xoá mất chunk cũ, ai đang mở web lúc đó bấm sang màn khác là ăn 404. Xem
   src/lib/tailMan.ts để biết vì sao đây chính là "thỉnh thoảng lỗi tải lại
   trang". ===== */
/* Loader tách tên riêng cho các màn hay dùng nhất: vừa cấp cho lazy() vừa
 * cấp cho prefetchKhiRanh() — cùng một hàm import nên trình duyệt/module
 * cache tự khử trùng lặp, không tải hai lần. */
const taiTimelinePage = () => import("./pages/TimelinePage.tsx");
const taiAlertsPage = () => import("./pages/AlertsPage.tsx");
const taiUpdatePage = () => import("./pages/UpdatePage.tsx");
const TimelineView = lazy(nhapCoThuLai(taiTimelinePage));
const AlertsView = lazy(nhapCoThuLai(taiAlertsPage));
const CatalogView = lazy(nhapCoThuLai(() => import("./pages/CatalogPage.tsx")));
const WorkloadView = lazy(nhapCoThuLai(() => import("./pages/WorkloadPage.tsx")));
const SourceCatalogView = lazy(nhapCoThuLai(() => import("./pages/SourceCatalogPage.tsx")));
const UpdateView = lazy(nhapCoThuLai(taiUpdatePage));
const ActiveRulesView = lazy(nhapCoThuLai(() => import("./pages/ActiveRulesPage.tsx")));
const PhanQuyenView = lazy(nhapCoThuLai(() => import("./pages/PhanQuyenPage.tsx")));
const HealthView = lazy(nhapCoThuLai(() => import("./pages/HealthPage.tsx")));
const AuditLogView = lazy(nhapCoThuLai(() => import("./pages/AuditLogPage.tsx")));
const AdminView = lazy(nhapCoThuLai(() => import("./pages/AdminPage.tsx")));
const ChatBox = lazy(nhapCoThuLai(() => import("./components/ai/ChatBox.tsx")));

/* Prefetch chunk các màn hay dùng khi trình duyệt RẢNH — người xưởng trên
 * 4G bấm sang màn mới không phải chờ một round-trip mạng nữa. Chỉ chạy một
 * lần sau khi màn đầu ổn định; lỗi tải (offline, deploy giữa chừng) nuốt
 * im lặng vì đây chỉ là tối ưu, bấm thật vẫn đi qua nhapCoThuLai() có retry. */
let daPrefetch = false;
function prefetchKhiRanh(): void {
  if (daPrefetch) return;
  daPrefetch = true;
  const chay = () => {
    for (const tai of [taiTimelinePage, taiUpdatePage, taiAlertsPage]) {
      tai().catch(() => {});
    }
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(chay, { timeout: 8000 });
  } else {
    setTimeout(chay, 3000);
  }
}
import VongNam from "./components/dashboard/VongNam.tsx";
import CompletionDashboard from "./components/dashboard/CompletionDashboard.tsx";
import MaTranTienDo from "./components/dashboard/MaTranTienDo.tsx";
import ReportsView from "./components/dashboard/ReportsView.tsx";
const ReportsViewMemo = memo(ReportsView);

// ===== Legacy lib imports (kept for compatibility) =====
import { saveUser, loadUser, loadFilterPrefs, saveFilterPrefs } from "./lib/config.ts";
import type { ReactNode } from "react";
import type { Activity, AppUser } from "./types/domain.ts";

/* Chụp ý định link trước lần render đầu. React StrictMode dựng shell hai lần
   ở môi trường dev; nếu đọc lại sau mount thứ nhất thì URL đã có thể được
   chuẩn hóa và làm mất `me=1` trước mount thứ hai. */
const INITIAL_PERSONAL_SCOPE_REQUESTED = typeof window !== "undefined"
  && docUrl(window.location.hash).onlyMine;

/* ===================== Change Password =====================
 * Đổi mật khẩu phải CHỨNG MINH bằng mật khẩu hiện tại (re-auth phía
 * client — updateUser của Supabase không tự đòi). Chế độ recovery (vào
 * bằng link email "quên mật khẩu") là ngoại lệ duy nhất: link đã là bằng
 * chứng, ô mật khẩu cũ được ẩn đi. Luật validate + dịch lỗi nằm ở
 * lib/passwordForm.ts để unit test được. */
/* F1 (31/08): bốn khối view nội tuyến đã TÁCH FILE — App.tsx từng 2.3k dòng
 * chứa cả modal đổi mật khẩu, màn Chất lượng dữ liệu, Nhật ký và Cấu hình:
 *   ChangePwModal  → components/auth/ChangePwModal.tsx
 *   HealthView     → pages/HealthPage.tsx (kèm DataQualityView)
 *   AuditLogView   → pages/AuditLogPage.tsx
 *   AdminView      → pages/AdminPage.tsx (kèm docLichCron)
 * Ba màn sau nạp lazy — người không mở màn quản trị không tải code đó. */
const OverviewMemo = memo(Overview);
function Overview({ acts, setView, access }: {
  acts: Activity[];
  setView?: (v: string) => void;
  access: Pick<AccessContext, "canView">;
}) {
  const now = new Date();
  const currentBangkokDate = bangkokCalendarDate(now);
  const currentBangkokYear = Number(currentBangkokDate.slice(0, 4));
  const { e, d, overdue, soon, gap, gapPts, mismatched } = useMemo(() => {
    const e = tally(acts), d = docTally(acts);
    const overdue = acts.filter((a) => classifyVmpDeadline(a, now, 30).kind === "overdue");
    const soon = acts.filter((a) => {
      const kind = classifyVmpDeadline(a, now, 30).kind;
      return kind === "today" || kind === "soon";
    });

    return {
      e, d, overdue, soon,
      gap: e.done - d.done, gapPts: e.rate - d.rate,
      mismatched: acts.filter((a) => a.mismatch),
    };
  }, [acts, now]);

  const destinations = useMemo(() => ({
    overdue: overviewTarget(access, "overdue"),
    soon: overviewTarget(access, "soon"),
    dataQuality: overviewTarget(access, "data-quality"),
  }), [access]);
  const di = (v: ScreenId | null) => (v && setView ? () => setView(v) : undefined);
  const soLoiDl = useMemo(() => runDataQualityChecks(acts).length, [acts]);

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
        <VongNam acts={acts} rate={e.rate} total={e.total}
          year={currentBangkokYear} bangkokToday={currentBangkokDate} ben={
          <div className="vmp-overview-progress" data-overview-total={e.total} style={{ minWidth: 0 }}>
            <div style={{ fontFamily: TEXT, fontSize: 20, fontWeight: 800,
                          color: C.plum, marginBottom: 3 }}>
              Tiến độ thẩm định {currentBangkokYear}
            </div>
            <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginBottom: 15 }}>
              {e.total} hạng mục trong kế hoạch năm
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {[
                { id: "completed", l: "Hoàn thành", v: e.done, c: C.mint, t: C.mintText },
                { id: "overdue", l: "Đã chuyển quá hạn", v: e.over, c: C.rasp, t: C.raspText },
                { id: "incomplete", l: "Chưa hoàn thành", v: e.todo, c: C.marigold, t: C.marigoldText },
              ].map((x) => (
                <div key={x.id} data-overview-metric={x.id} className="vmp-overview-progress__row" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999,
                                 background: x.c, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700,
                                 flex: 1 }}>{x.l}</span>
                  <div style={{ width: 88, height: 6, borderRadius: 999,
                                background: C.surfaceSunk, overflow: "hidden" }}>
                    <div style={{ width: `${e.total ? (x.v / e.total) * 100 : 0}%`,
                                  height: "100%", background: x.c }} />
                  </div>
                  <span data-overview-value style={{ fontFamily: NUM, fontSize: 20, fontWeight: 800,
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
          · overdue = hạng mục active chưa hoàn thành có deadline VMP đã trôi qua
            theo ngày Bangkok, kể cả khi trạng thái tổng chưa chuyển. */}
      {/* MỘT chỉ số quá hạn, không phải hai. Bản trước để "Quá hạn (trạng
          thái) 208" và "Có mốc đã quá hạn 268" cạnh nhau, người mới nhìn
          tưởng web tính sai. Nay lấy con số RỘNG hơn (theo mốc) làm chỉ số
          chính vì đó mới là thứ phải xử, và nói thẳng chênh lệch là gì. */}
      <StatTile cls="b-k1" icon={AlertCircle} label="Trễ đích VMP" value={overdue.length}
        metricId="vmp-overdue"
        tone={{ c: C.raspText, bg: C.raspSoft }} onClick={di(destinations.overdue)}
        sub={overdue.length
          ? `${e.over} đã đổi trạng thái · ${Math.max(0, overdue.length - e.over)} mốc đã trôi mà trạng thái chưa đổi`
          : "Không còn hạng mục nào trễ"} />

      <StatTile cls="b-k2" icon={Clock} label="Tới hạn đích VMP 30 ngày" value={soon.length}
        tone={{ c: C.marigoldText, bg: C.marigoldSoft }} onClick={di(destinations.soon)}
        sub={soon.length ? "Theo dõi để không rơi sang quá hạn" : "Tháng tới đang trống"} />

      {/* Ô thứ tư là CHẤT LƯỢNG DỮ LIỆU, không phải một chỉ số tiến độ nữa.
          Lý do: mọi con số còn lại trên trang đều chỉ đáng tin bằng đúng chất
          lượng của dữ liệu dưới nó. Đặt nó ngang hàng với ba chỉ số kia là
          nói rằng nó quan trọng ngang chúng — và đúng là như vậy. */}
      <StatTile cls="b-k4" icon={FileWarning} label="Vấn đề dữ liệu" value={soLoiDl}
        tone={soLoiDl > 0 ? { c: C.marigoldText, bg: C.marigoldSoft } : { c: C.mintText, bg: C.mintSoft }}
        onClick={di(destinations.dataQuality)}
        sub={soLoiDl
          ? `${soLoiDl} vấn đề được phát hiện · trong đó ${mismatched.length} lệch pha`
          : "Không phát hiện vấn đề nào"} />

      <div className="b-vali">
        <PrincessCommentary stats={{
          e, d, overdue: overdue.length, soon: soon.length, mismatched: mismatched.length,
        }} />
      </div>

      <section className="b-sau overview-analysis-studio" data-overview-analysis-studio
        aria-labelledby="overview-analysis-title">
        <header className="overview-analysis-studio__header">
          <span className="overview-analysis-studio__eyebrow">Phân tích chuyên sâu</span>
          <h2 id="overview-analysis-title">Dòng chảy, điểm nghẽn và cơ cấu</h2>
          <p>
            Đọc lần lượt từ giai đoạn đang hụt, nơi tập trung vấn đề đến nhóm đang dẫn hoặc tụt lại.
          </p>
        </header>
        <CompletionDashboard acts={acts} matrix={<MaTranTienDo acts={acts} />} />
      </section>
    </div>
  );
}

function TeamOverviewComparison({ summary, acts }: {
  summary: TeamOverviewSummaryState;
  acts: Activity[];
}) {
  const personal = useMemo(() => tally(acts), [acts]);
  return (
    <Card variant="soft" style={{ marginBottom: 16, padding: "14px 16px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
        <div style={{ borderRadius: 12, background: C.surface, border: `1px solid ${C.pinkSoft}`, padding: "11px 13px", color: C.plum, fontWeight: 800 }}>
          {summary.status === "ready" && summary.data
            ? `Tiến độ cả nhóm ${summary.data.rate}% (${summary.data.completed}/${summary.data.total})`
            : summary.status === "error"
              ? <><span>Chưa tải được tiến độ cả nhóm.</span>{" "}<button type="button" onClick={summary.retry}>Thử lại</button></>
              : "Đang tải tiến độ cả nhóm…"}
        </div>
        <div style={{ borderRadius: 12, background: C.surface, border: `1px solid ${C.pinkSoft}`, padding: "11px 13px", color: C.plum, fontWeight: 800 }}>
          Tiến độ của tôi {personal.rate}% ({personal.done}/{personal.total})
        </div>
      </div>
    </Card>
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
    <span className="vmp-global-filter__chip" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 6px 5px 11px", borderRadius: 999, fontFamily: TEXT, fontSize: 12, fontWeight: 800, ...style }}>
      {label}
      <button type="button" onClick={onRemove} aria-label={`Bỏ ${label}`} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 17, height: 17, borderRadius: 999, border: "none", cursor: "pointer", background: "rgba(0,0,0,.08)", color: "inherit", fontSize: 14, lineHeight: 1, fontWeight: 900 }}>×</button>
    </span>
  );
}

function GlobalFilterBar({
  areaSel, setAreaSel, deptSel, setDeptSel, setPeriod,
  customFrom, setCustomFrom, customTo, setCustomTo,
  areaOptions, deptOptions,
  showPersonSelector, selectedPersonId, setSelectedPersonId, personOptions,
  todayPersonScope, setTodayPersonScope, currentPersonId,
  todayMode = false,
  rutGon = false,
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
  /** Chỉ Admin/Quản lý QA có thể đổi từ cả nhóm sang một người cụ thể. */
  showPersonSelector: boolean;
  selectedPersonId: string | null;
  setSelectedPersonId: (personId: string | null) => void;
  personOptions: readonly PersonProgressChoice[];
  todayPersonScope: TodayPersonScope;
  setTodayPersonScope: (scope: TodayPersonScope) => void;
  currentPersonId: string | null;
  /** Today tự quản cửa sổ 7 ngày, nên kỳ nhớ chỉ được hiển thị ở màn khác. */
  todayMode?: boolean;
  /** Nhóm THỰC HIỆN và PHÂN TÍCH (anh Hoàn chốt 30/08): bỏ nhãn phạm vi,
   *  nút Bộ lọc, cụm đếm và Chép liên kết — chỉ giữ chọn nhân sự và chip
   *  lọc đang bật (để còn đường tắt/URL vào là gỡ được). */
  rutGon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleDept = (v: string) => setDeptSel(deptSel.includes(v) ? deptSel.filter((x) => x !== v) : [...deptSel, v]);
  const toggleArea = (v: string) => setAreaSel(areaSel.includes(v) ? areaSel.filter((x) => x !== v) : [...areaSel, v]);
  const active = deptSel.length > 0 || areaSel.length > 0
    || (showPersonSelector && selectedPersonId !== null)
    || (!todayMode && (!!customFrom || !!customTo));
  const soLoc = deptSel.length + areaSel.length + (!todayMode && (customFrom || customTo) ? 1 : 0);
  const resetAll = () => {
    setDeptSel([]);
    setAreaSel([]);
    setSelectedPersonId(null);
    if (!todayMode) {
      setPeriod("all");
      setCustomFrom("");
      setCustomTo("");
    }
  };
  // Thời gian CHỈ theo mốc ngày: có nhập ngày -> bật lọc "custom"; xoá hết -> "all".
  const onFrom = (v: string) => { setCustomFrom(v); setPeriod((v || customTo) ? "custom" : "all"); };
  const onTo = (v: string) => { setCustomTo(v); setPeriod((customFrom || v) ? "custom" : "all"); };

  const optRow = (
    o: { v: string; l: string; n?: number },
    on: boolean,
    toggle: (v: string) => void,
    dot: string,
  ) => (
    <button key={o.v} className="vmp-global-filter__option" type="button" onClick={() => toggle(o.v)} aria-pressed={on}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: "none", background: on ? C.pinkMist : "transparent", fontFamily: TEXT, fontSize: 14, fontWeight: 700, color: C.plum, padding: "8px 9px", borderRadius: 8, cursor: "pointer" }}>
      <span style={{ width: 9, height: 9, borderRadius: 8, background: dot, flex: "none" }} />
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.l}</span>
      {on && <span style={{ color: C.pinkText, fontWeight: 900 }}>✓</span>}
      <span style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft, background: C.pinkMist, padding: "1px 8px", borderRadius: 999, fontFamily: NUM }}>{o.n}</span>
    </button>
  );

  const personControl = showPersonSelector ? (
    <label className={rutGon ? undefined : "vmp-global-filter__person"} style={{ display: "inline-flex", alignItems: "center", gap: 7, color: C.plumSoft,
      fontFamily: TEXT, fontSize: 12, fontWeight: 800 }}>
      <Users size={14} aria-hidden="true" />
      {!rutGon && <span>Tiến độ của</span>}
      <select aria-label="Chọn nhân sự xem tiến độ" value={selectedPersonId ?? ""}
        onChange={(event) => setSelectedPersonId(event.target.value || null)}
        style={{ ...INP, width: "auto", minWidth: 170, minHeight: rutGon ? 42 : undefined,
          padding: "6px 30px 6px 10px", fontSize: 12,
          ...(!rutGon ? { border: "none", background: C.pinkMist, boxShadow: "none" } : {}) }}>
        <option value="">Cả nhóm</option>
        {personOptions.map((person) => (
          <option key={person.personId} value={person.personId}>
            {person.label}{person.personId === currentPersonId ? " (Tôi)" : ""}
          </option>
        ))}
      </select>
    </label>
  ) : todayMode ? (
    <TodayScopeControl
      scope={todayPersonScope}
      currentPersonId={currentPersonId}
      onChange={setTodayPersonScope}
    />
  ) : null;

  const chips = (
    <>
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
      {!todayMode && (customFrom || customTo) && (
        <FilterChip label={`Ngày: ${customFrom || "…"} → ${customTo || "…"}`} onRemove={() => { setCustomFrom(""); setCustomTo(""); setPeriod("all"); }} style={neutralChip} />
      )}
    </>
  );

  if (rutGon) {
    return (
      <div role="group" aria-label="Phạm vi toàn hệ thống" className={`vmp-thanh-loc vmp-thanh-loc--gon${todayMode ? " vmp-thanh-loc--treo" : ""}`} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", position: "relative", zIndex: 40, marginBottom: 14, padding: "2px 0 8px" }}>
        {personControl}
        {chips}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {active && (
            <button type="button" onClick={resetAll} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.pinkSoft}`, background: C.pinkMist, color: C.pinkText, fontFamily: TEXT, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              <XCircle size={13} /> Xóa lọc
            </button>
          )}
        </div>
      </div>
    );
  }

  const hasVisibleChips = deptSel.length > 0 || areaSel.length > 0
    || (!todayMode && (!!customFrom || !!customTo));
  const closeAndFocusTrigger = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div role="group" aria-label="Phạm vi toàn hệ thống" className="vmp-global-filter">
      <div className="vmp-global-filter__primary">
        <div className="vmp-global-filter__left">
          <span className="vmp-global-filter__scope"><Filter size={15} aria-hidden="true" />Toàn hệ thống</span>
          <div ref={popRef} className="vmp-global-filter__popover">
            <button id="vmp-global-filter-trigger" ref={triggerRef} className="vmp-global-filter__trigger" type="button"
              onClick={() => setOpen((value) => !value)} aria-haspopup="dialog" aria-expanded={open}
              aria-controls="vmp-global-filter-panel">
              Bộ lọc{soLoc ? ` (${soLoc})` : ""}
            </button>
            {open && (
              <div id="vmp-global-filter-panel" role="dialog" aria-labelledby="vmp-global-filter-trigger"
                className="vmp-global-filter__panel vmp-scroll">
                <fieldset className="vmp-global-filter__group">
                  <legend>Khoảng thời gian</legend>
                  <div className="vmp-global-filter__dates">
                    <input type="date" value={customFrom} onChange={(event) => onFrom(event.target.value)}
                      disabled={todayMode} aria-label="Từ ngày" style={dateInp} />
                    <span aria-hidden="true">→</span>
                    <input type="date" value={customTo} onChange={(event) => onTo(event.target.value)}
                      disabled={todayMode} aria-label="Đến ngày" style={dateInp} />
                  </div>
                  {todayMode && <p className="vmp-global-filter__hint">Việc hôm nay tự dùng cửa sổ 7 ngày.</p>}
                </fieldset>
                <fieldset className="vmp-global-filter__group">
                  <legend>Bộ phận</legend>
                  {deptOptions.map((option) => optRow(option, deptSel.includes(option.v), toggleDept,
                    ((DEPT_CHIP as Record<string, { dot?: string }>)[option.v] || {}).dot || C.pink))}
                </fieldset>
                <fieldset className="vmp-global-filter__group">
                  <legend>Khu vực</legend>
                  {areaOptions.length === 0
                    ? <p className="vmp-global-filter__empty">Không có khu vực</p>
                    : areaOptions.map((option) => optRow(option, areaSel.includes(option.v), toggleArea, C.marigold))}
                </fieldset>
                <div className="vmp-global-filter__footer">
                  <button type="button" className="vmp-global-filter__done" onClick={closeAndFocusTrigger}>Xong</button>
                </div>
              </div>
            )}
          </div>
        </div>
        {personControl}
      </div>
      {hasVisibleChips && (
        <div className="vmp-global-filter__chips">
          {chips}
          <button type="button" className="vmp-global-filter__reset" data-global-filter-reset onClick={resetAll}>
            <XCircle size={14} aria-hidden="true" /> Xóa tất cả
          </button>
        </div>
      )}
    </div>
  );
}

/* ===================== MAIN APP =====================
 * Global CSS & keyframes → src/index.css (tĩnh, áp dụng trước first paint).
 * Fonts → index.html (nạp 1 request, không FOUC). */
/* Nội dung thật của ứng dụng. `App` bên dưới chỉ bọc thêm sổ trạng thái
   chưa lưu — tách ra để Provider nằm NGOÀI mọi thứ dùng nó, kể cả hộp
   thoại Đổi mật khẩu. */
function VerifiedAppShell({ user, logout, access }: {
  user: AppUser;
  logout: () => Promise<void>;
  access: AccessContext;
}) {
  const shellNow = new Date();
  const currentBangkokYear = Number(bangkokCalendarDate(shellNow).slice(0, 4));
  /* Hai cờ thay cho `isAdmin` gộp cũ ở hộp Cập nhật tiến độ — mỗi cờ hỏi
     đúng MỘT câu tới `access`, không còn suy quyền từ vai đăng nhập cũ:
     · canChonNguoiThucHien — ai được đổi "Người thực hiện".
     · canDoiTrangThai — khối "Trạng thái nghiệp vụ" hiện chỉ admin/QA
       quản lý được đổi; hệ mới chưa có hành động riêng cho việc này. */
  const canChonNguoiThucHien = access.can("source", "edit_catalog");
  const canDoiTrangThai = access.businessRole === "admin" || access.businessRole === "qa_manager";
  const {
    objects, acts, conn, lastSync, dataUpdatedAt, authorizationRevision, saveStatus, reloadData, silentRefresh,
    updateActivity,
  } = useVmpData();
  const currentPersonId = String(user.personId ?? "").trim() || null;
  const teamOverviewSummary = useTeamOverviewSummary({
    identity: user.uid ?? "",
    businessRole: access.businessRole,
    canViewOverview: access.canView("overview"),
    year: currentBangkokYear,
  });

  /* `saveStatus` của luồng lưu tiến độ giờ đi qua vỏ thông báo dùng chung.
     Trước đây nó có một khối JSX riêng ngay trong file này — nghĩa là chỉ
     đúng luồng đó báo được kết quả, còn mọi màn khác ghi xong thì im lặng.
     Bơm sang toast để cả web báo theo cùng một cách. */
  const toast = useToast();
  const saveTruoc = useRef("");
  useEffect(() => {
    if (saveStatus === saveTruoc.current) return;
    saveTruoc.current = saveStatus;
    // "saving" không cần toast riêng: nó đổi thành saved/error rất nhanh,
    // và một toast chớp 200ms chỉ làm màn hình giật.
    if (saveStatus === "saved") toast.thanhCong("Đã lưu thành công");
    else if (saveStatus === "warning") toast.canhBao("Lưu Supabase OK — Sheet chưa đồng bộ");
    else if (saveStatus === "error") toast.loi("Lưu thất bại");
  }, [saveStatus, toast]);
  /* `rules` đứng trong danh sách RIÊNG vì nó không còn mục menu (31/08)
     nhưng hash `#v=rules` phải sống — cùng lý do `inventory`/`risk` ở đây. */
  const rawUrlViews = useMemo(() => NAV_ITEMS.map((item) => item.id).concat([
    "risk", "inventory", "missing", "accounts", "people", "rules",
  ]), []);

  /* Đưa alias về màn chuẩn NGAY tại biên đọc URL.
     `#v=inventory` và `#v=risk` là tên cũ của "Tiến độ gộp theo đối tượng"
     và "Cảnh báo". Chuẩn hoá ở đây, một lần, thay vì để mỗi nhánh render
     tự nhớ — mà quên một nhánh thì đường dẫn cũ dẫn vào trang trắng. */
  const chuanHoaView = useCallback((s: UrlState) => {
    /* `accounts` (Tài khoản & quyền truy cập) đã gộp vào `phanquyen` (Vai
       trò & phạm vi) và rời khỏi menu, nhưng vẫn là ScreenId hợp lệ trong
       lib/access.ts (hợp đồng với rpc_my_ui_access ở server) nên
       resolveViewIntent không tự coi đây là alias — nó vẫn trả về
       `accounts` y nguyên. Ánh xạ ngay tại đây, cùng cách `inventory`/`risk`
       đã làm, để #v=accounts cũ không rơi vào trang trắng. */
    const vRaw = s.view === "accounts" ? "phanquyen" : s.view;
    const y = resolveViewIntent(vRaw);
    if (!y) {
      const fallback = resolveAuthorizedView(vRaw, access);
      return {
        state: { ...s, view: fallback?.screenId ?? "missing" },
        nhom: null as null | "doituong",
      };
    }
    return {
      state: y.screenId === s.view ? s : { ...s, view: y.screenId },
      nhom: y.presentation === "grouped-object" ? ("doituong" as const) : null,
    };
  }, [access]);

  // Trạng thái ban đầu: URL thắng, rồi mới tới bộ lọc nhớ từ lần trước. Ai dán
  // link cho nhau thì phải thấy ĐÚNG cái người gửi thấy, không bị bộ lọc cũ của
  // máy mình đè lên — đó là cả lý do đưa trạng thái lên URL.
  /* Đọc URL MỘT lần, giữ cả bản thô lẫn bản đã chuẩn hoá.
     Cần bản thô vì tên cũ `inventory` mang theo cách trình bày; chuẩn hoá
     xong thì nó thành `progress` và thông tin đó biến mất. */
  const khoiTaoDayDu = useMemo(() => {
    const tuUrl = docUrl(typeof window === "undefined" ? "" : window.location.hash, {
      // `people` chỉ còn là token URL lịch sử: phải đọc nó ở đây để luật
      // quyền bên trên chọn màn thay thế, thay vì để docUrl nuốt về overview.
      views: rawUrlViews,
      depts: DEPTS.map((d) => d.id),
      periods: PERIODS.map((p) => p[0]).concat(["custom"]),
    });
    if (vietUrl(tuUrl)) {
      const { state, nhom } = chuanHoaView(tuUrl);
      return { state, nhom };
    }
    const nho = loadFilterPrefs(loadUser()?.email || loadUser()?.name);
    const state = nho
      ? { ...tuUrl, ...docUrl(String(nho.hash || "")), view: tuUrl.view }
      : tuUrl;
    return { state, nhom: null as null | "doituong" };
  }, [chuanHoaView, rawUrlViews]);

  const khoiTao: UrlState = khoiTaoDayDu.state;

  const [view, setView] = useState(khoiTao.view);
  const [urlTab, setUrlTab] = useState(khoiTao.tab);
  // Đối tượng cần mở sẵn khi nhảy từ "Tiến độ theo đối tượng" sang "Danh mục &
  // Nhập liệu". Dùng object mới mỗi lần bấm (không phải chuỗi) để bấm lại cùng
  // một mã vẫn kích hoạt useEffect bên kia.
  const [moDanhMuc, setMoDanhMuc] = useState<{ code: string; nhom?: string } | null>(null);
  /* Mã hạng mục cần nhảy tới ở màn Cập nhật tiến độ. Màn "Hôm nay" đặt giá
     trị này rồi chuyển màn — người dùng khỏi phải nhớ mã và tự dán vào ô tìm. */
  const [moHangMuc, setMoHangMuc] = useState<ProgressDeepLink | null>(null);
  /** Cách nhóm ở màn nhập liệu: theo hạng mục hay theo đối tượng. */
  /* Mở thẳng `#v=inventory` thì phải vào Tiến độ ở chế độ gộp theo đối
     tượng — đó chính là ý nghĩa của tên cũ đó. */
  const [nhomTheo, setNhomTheo] = useState<"hangmuc" | "doituong">(
    () => khoiTaoDayDu.nhom ?? "hangmuc",
  );
  const [showPw, setShowPw] = useState(false);

  /* Thoát mà còn form đang dở thì hỏi lại. Trước đây bấm Thoát là mất
     trắng phần vừa gõ, không một lời cảnh báo — với form nhập liệu GMP
     dài thì đó là mất cả buổi làm. */
  const [hoiThoat, setHoiThoat] = useState(false);
  const { hasDirty, keys: formDangDo } = useDirtyStateSnapshot();
  const xinThoat = useCallback(() => {
    if (hasDirty) { setHoiThoat(true); return; }
    logout();
  }, [hasDirty, logout]);
  const mainRef = useScrollTop([view]);

  // (MỚI) BỘ LỌC TOÀN CỤC — khu vực + bộ phận (chọn NHIỀU) + thời gian (có Tùy chọn).
  const [areaSel, setAreaSel] = useState<string[]>(khoiTao.areaSel);   // rỗng = tất cả khu vực
  const [deptSel, setDeptSel] = useState<string[]>(khoiTao.deptSel);   // rỗng = tất cả bộ phận
  const [periodFilter, setPeriodFilter] = useState(khoiTao.period);
  const [customFrom, setCustomFrom] = useState(khoiTao.customFrom);   // yyyy-mm-dd
  const [customTo, setCustomTo] = useState(khoiTao.customTo);         // yyyy-mm-dd
  const canSelectProgressPerson = canSelectPersonProgressScope(access.businessRole);
  const initialPersonalScopeRequested = useRef(INITIAL_PERSONAL_SCOPE_REQUESTED);
  /** Mặc định là cả nhóm; chỉ link `me=1` tường minh mở chính người đăng nhập. */
  const [selectedProgressPersonId, setSelectedProgressPersonId] = useState<string | null>(() => {
    return initialPersonalScopeRequested.current && canSelectProgressPerson ? currentPersonId : null;
  });
  const personProgressChoices = useMemo(() => buildPersonProgressChoices(acts), [acts]);
  const selectedProgressPerson = useMemo(() => personProgressChoices.find(
    (person) => person.personId === selectedProgressPersonId) ?? null,
  [personProgressChoices, selectedProgressPersonId]);
  const progressPersonScopeId = !canSelectProgressPerson || selectedProgressPersonId === null
    ? null
    : selectedProgressPerson?.personId
      ?? (conn.status === "idle" || conn.status === "loading" ? selectedProgressPersonId : null);
  const [todayPersonScope, setTodayPersonScope] = useState<TodayPersonScope>(() =>
    defaultTodayPersonScope(access.businessRole, currentPersonId));
  const daChonPhamViToday = useRef(false);
  const chonPhamViToday = useCallback((scope: TodayPersonScope) => {
    daChonPhamViToday.current = true;
    setTodayPersonScope(scope);
  }, []);
  useEffect(() => {
    if (!initialPersonalScopeRequested.current || !canSelectProgressPerson || currentPersonId === null) return;
    initialPersonalScopeRequested.current = false;
    setSelectedProgressPersonId(currentPersonId);
  }, [canSelectProgressPerson, currentPersonId]);
  useEffect(() => {
    if (selectedProgressPersonId !== progressPersonScopeId) {
      setSelectedProgressPersonId(progressPersonScopeId);
    }
  }, [progressPersonScopeId, selectedProgressPersonId]);
  useEffect(() => {
    setTodayPersonScope((scope) => daChonPhamViToday.current
      ? normalizeTodayPersonScope(scope, currentPersonId)
      : defaultTodayPersonScope(access.businessRole, currentPersonId));
  }, [access.businessRole, currentPersonId]);
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
  const monitoringMetrics = useMemo(
    () => buildMonitoringSignatureMetrics(filteredActs),
    [filteredActs],
  );
  const monitoringView = (["overview", "timeline", "alerts"] as const)
    .find((id) => id === view);
  /* Personal Today and Overview share this base: department and area are
     global scope, while the period filter is intentionally team-Overview
     only. A selected person's queue must not lose their overdue VMP item
     merely because the remembered period is different. */
  const personScopeBaseActs = useMemo(() => acts.filter((a) => (
    (areaSel.length === 0 || areaSel.includes(String(a.area || "").trim())) && inDept(a)
  )), [acts, areaSel, inDept]);
  const overviewActs = useMemo(() => {
    const personId = canSelectProgressPerson ? progressPersonScopeId : currentPersonId;
    if (!canSelectProgressPerson && personId === null) return [];
    return personId === null
      ? filteredActs
      : personScopeBaseActs.filter((activity) => isTodayActivityMine(activity, personId));
  }, [canSelectProgressPerson, currentPersonId, filteredActs, personScopeBaseActs, progressPersonScopeId]);
  const todaySelectedPersonId = canSelectProgressPerson
    ? progressPersonScopeId
    : todayPersonScope === "mine" ? currentPersonId : null;
  const todayActs = useMemo(() => filterTodayScope(personScopeBaseActs, {
    areas: [],
    departments: [],
    onlyMine: todaySelectedPersonId !== null,
    currentPersonId: todaySelectedPersonId,
  }), [personScopeBaseActs, todaySelectedPersonId]);
  const filteredObjects = useMemo(() => objects.filter((o) => {
    if (areaSel.length && !areaSel.includes(String(o.area || "").trim())) return false;
    if (deptSel.length) {
      const set = objectDepts.get(o.code);
      if (!set || !deptSel.some((d) => set.has(d))) return false;
    }
    return true;
  }), [objects, areaSel, deptSel, objectDepts]);

  /* C2 (31/08): trạng thái dữ liệu cấp router cho các màn ăn theo acts.
     Bốn cảnh khác nhau phải có bốn câu trả lời khác nhau — trước đây cả
     bốn đều là trang trắng/màn rỗng và người dùng báo chung "web hỏng". */
  /* KHÔNG gồm `progress`: UpdatePage tự có StateBoundary, và màn đó còn
     bảng "Dữ liệu nguồn ngoài phạm vi" sống độc lập với acts — che cả màn
     khi acts rỗng là giấu luôn bằng chứng thu hồi quyền (e2e source-access
     bắt được đúng lỗi này ngày 31/08). */
  const MAN_THEO_ACTS = ["overview", "timeline", "alerts", "workload", "reports"];
  const boundaryDuLieu: "loading" | "error" | "empty" | "filtered-empty" | null = (() => {
    if (!MAN_THEO_ACTS.includes(view)) return null;
    if (acts.length === 0) {
      if (conn.status === "loading" || conn.status === "idle") return "loading";
      if (conn.status === "err") return "error";
      return "empty";
    }
    /* Gate theo ĐÚNG tập màn đang ăn: Tổng quan dùng overviewActs (có phạm
       vi theo người, nới lỏng bộ lọc kỳ) — gate bằng filteredActs từng che
       nhầm màn khi chọn người + kỳ tuỳ chọn (e2e today-scope bắt được). */
    const tapCuaMan = view === "overview" ? overviewActs : filteredActs;
    if (tapCuaMan.length === 0) return "filtered-empty";
    return null;
  })();
  const xoaBoLocToanCuc = useCallback(() => {
    setAreaSel([]); setDeptSel([]); setPeriodFilter("all");
    setCustomFrom(""); setCustomTo("");
  }, []);

  /* ---- URL ↔ trạng thái ----------------------------------------------
   * Ghi: đổi MÀN thì pushState (nút Back quay về màn trước — hành vi ai cũng
   * mong đợi); chỉnh BỘ LỌC thì replaceState, vì gõ ngày tháng mà mỗi ký tự
   * đẩy một mục vào lịch sử thì bấm Back mười lần mới thoát nổi.
   * Đọc: nghe popstate (Back/Forward) và hashchange (người dùng tự sửa URL).
   * ------------------------------------------------------------------- */
  const trangThaiUrl = useMemo<UrlState>(() => ({
    view, tab: urlTab, deptSel, areaSel, period: periodFilter, customFrom, customTo,
    // Giữ tương thích link `me=1` cũ khi người được chọn chính là tài khoản hiện tại.
    onlyMine: (view === "today" || view === "overview")
      && canSelectProgressPerson
      && (initialPersonalScopeRequested.current
        || (progressPersonScopeId !== null && progressPersonScopeId === currentPersonId)),
  }), [view, urlTab, deptSel, areaSel, periodFilter, customFrom, customTo, canSelectProgressPerson, currentPersonId, progressPersonScopeId]);

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

  /* Chuyển màn do GUARD ép, không do người dùng bấm — nên THAY THẾ mục lịch
     sử thay vì đẩy thêm. Đặt `viewTruoc` trước setView để effect ngay trên
     coi đây không phải "đổi màn" và dùng replaceState.

     Không có bước này thì bấm Back sẽ quay đúng về màn vừa bị cấm, guard lại
     đá đi, và mỗi lần như vậy lại nhét thêm một mục vào lịch sử — người dùng
     bấm Back mãi không thoát nổi. */
  /* Đường dẫn sâu từ "Hôm nay" sang "Cập nhật tiến độ".
     Nó CHỈ đổi màn và mã hạng mục cần tập trung. Không đụng vào bộ phận,
     khu vực, kỳ hay "việc của tôi" — nếu nó sửa phạm vi thì người dùng
     bấm một dòng rồi thấy cả trang đổi nội dung, và không hiểu vì sao. */
  /* Một câu ngắn mô tả phạm vi dữ liệu đang xem. Người dùng cần biết con
     số họ đang nhìn được lọc theo gì — nếu không, hai người mở cùng màn
     mà thấy hai con số khác nhau sẽ tưởng hệ thống sai. */
  const nhanPhamVi = useMemo(() => {
    const phan: string[] = [];
    if (deptSel.length > 0) {
      phan.push(deptSel.map((id) => DEPTS.find((d) => d.id === id)?.short || id).join(", "));
    } else {
      phan.push("Toàn hệ thống");
    }
    if (areaSel.length > 0) phan.push(`khu vực ${areaSel.join(", ")}`);
    const kyHan = PERIODS.find(([id]) => id === periodFilter)?.[1];
    if (kyHan && periodFilter !== "all") phan.push(String(kyHan).toLowerCase());
    return phan.join(" · ");
  }, [deptSel, areaSel, periodFilter]);

  const nhanPhamViToday = useMemo(() => {
    const heading = canSelectProgressPerson
      ? selectedProgressPerson
        ? `Việc hôm nay của ${selectedProgressPerson.fullName}`
        : "Việc hôm nay của cả nhóm"
      : presentTodayPersonScope(todayPersonScope, currentPersonId).heading;
    const phan: string[] = [heading];
    if (deptSel.length > 0) {
      phan.push(deptSel.map((id) => DEPTS.find((d) => d.id === id)?.short || id).join(", "));
    } else {
      phan.push("Toàn hệ thống");
    }
    if (areaSel.length > 0) phan.push(`khu vực ${areaSel.join(", ")}`);
    return phan.join(" · ");
  }, [areaSel, canSelectProgressPerson, currentPersonId, deptSel, selectedProgressPerson, todayPersonScope]);

  const moDoiMatKhau = useCallback(() => setShowPw(true), []);
  const clearTodayScope = useCallback(() => {
    setDeptSel([]);
    setAreaSel([]);
  }, []);

  const moTienDo = useCallback((link: ProgressDeepLink) => {
    setMoHangMuc(link);
    setNhomTheo("hangmuc");
    viewTruoc.current = "progress";
    setView("progress");
  }, []);
  const consumeProgressLink = useCallback(() => setMoHangMuc(null), []);

  const chuyenManAnToan = useCallback((manMoi: string) => {
    viewTruoc.current = manMoi;
    setView(manMoi);
  }, []);

  // Nhớ bộ lọc cho lần mở sau. KHÔNG lưu `view` — mở app ra mà nhảy thẳng vào
  // màn hôm qua đang dở thì khó hiểu hơn là tiện.
  useEffect(() => {
    if (!user) return;
    saveFilterPrefs(user.email || user.name, {
      hash: vietUrl({ ...trangThaiUrl, view: MAC_DINH.view, tab: "" }),
    });
  }, [trangThaiUrl, user]);

  useEffect(() => {
    const apDung = () => {
      const s = docUrl(window.location.hash, {
        // `people` chỉ còn là token URL lịch sử và được resolve theo quyền
        // hiện thời trong chuanHoaView.
        views: rawUrlViews,
        depts: DEPTS.map((d) => d.id),
        periods: PERIODS.map((p) => p[0]).concat(["custom"]),
      });
      const { state: sChuan, nhom } = chuanHoaView(s);
      if (nhom) setNhomTheo(nhom);
      viewTruoc.current = sChuan.view;
      setView(sChuan.view);
      setUrlTab(s.tab);
      setDeptSel(s.deptSel);
      setAreaSel(s.areaSel);
      setPeriodFilter(s.period);
      setCustomFrom(s.customFrom);
      setCustomTo(s.customTo);
      setSelectedProgressPersonId(canSelectProgressPerson && s.onlyMine ? currentPersonId : null);
    };
    window.addEventListener("popstate", apDung);
    window.addEventListener("hashchange", apDung);
    return () => {
      window.removeEventListener("popstate", apDung);
      window.removeEventListener("hashchange", apDung);
    };
  }, [canSelectProgressPerson, chuanHoaView, currentPersonId, rawUrlViews]);

  // (MỚI) Giữ dữ liệu tươi: làm mới khi quay lại tab; RELOAD khi sang NGÀY MỚI
  // (VMP_TODAY và "hôm nay" tính lúc tải trang → tránh "quá hạn/ngày còn lại" bị cũ khi mở lâu).
  useEffect(() => {
    const bootDay = new Date().toDateString();
    const controller = createVisibleRefreshController({
      isVisible: () => document.visibilityState !== "hidden",
      refresh: silentRefresh,
      coalesceMs: 1000,
    });
    window.addEventListener("focus", controller.request);
    document.addEventListener("visibilitychange", controller.request);
    const iv = setInterval(() => {
      if (new Date().toDateString() !== bootDay) window.location.reload(); // qua ngày mới → tải lại
    }, 60000);
    return () => {
      window.removeEventListener("focus", controller.request);
      document.removeEventListener("visibilitychange", controller.request);
      clearInterval(iv);
    };
  }, [silentRefresh]);

  const title = NAV_ITEMS.find((n) => n.id === view)?.label || "Tổng quan";

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: TEXT, color: C.plum, overflow: "hidden" }}>
      <a className="vmp-skip-link" href="#vmp-main-content"
        onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); }}>
        Bỏ qua điều hướng
      </a>
      {showPw && (
        <ChangePwModal
          onClose={() => setShowPw(false)}
        />
      )}

      <ShellConfirmDialog
        open={hoiThoat}
        title="Còn thay đổi chưa lưu"
        description="Thoát bây giờ là mất phần bạn vừa nhập ở những chỗ dưới đây."
        keys={formDangDo}
        onCancel={() => setHoiThoat(false)}
        onConfirm={() => { setHoiThoat(false); logout(); }}
      />

      <SidebarMemo
        view={view} setView={setView} user={user} access={access}
        connected={conn.status === "ok"}
        onLogout={xinThoat}
        onChangePw={moDoiMatKhau}
      />

      {/* Nền theo thiết kế 29/08 (lotus-shell.css .vmp-main-nen): ánh hồng–
          lavender toả từ góc như cũ, thêm tranh hồ sen mờ ở góc phải (không
          đè chữ) và vân sơn mài; bỏ sao lấp lánh. */}
      <main ref={mainRef} id="vmp-main-content" tabIndex={-1} className="vmp-scroll vmp-main-nen" style={{
        flex: 1, overflowY: "auto", position: "relative",
      }}>
        <div style={{ position: "relative", zIndex: 1 }}>
          <TopbarMemo
            title={title} user={user} sub={(NAV_SUBS as Record<string, string>)[view]}
            dataUpdatedAt={dataUpdatedAt}
            view={view} setView={setView} access={access}
            onLogout={xinThoat} onChangePw={moDoiMatKhau}
            showMasthead={view === "overview"}
          />


          {/* Padding lấy từ token khổ màn: 24 → 32 → 36 (≥1600) → 48 (≥1900).
              Desktop rộng thở bằng padding, không kéo card dài ra. */}
          <div style={{ padding: "0 var(--lp-shell-pad, 34px) 38px" }}>
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
            {/* Trang "Quy tắc nghiệp vụ" đọc thẳng cấu hình từ database, không
                hiển thị hạng mục nào — thanh lọc ở đó là một bộ điều khiển
                không điều khiển gì, lại còn ghi "461/461 hạng mục" trên một
                trang không có hạng mục. Ẩn đi. */}
            {(acts.length > 0 || (view === "today" && access.can("today", "view")))
              && view !== "audit" && view !== "admin" && view !== "missing"
              && view !== "rules" && (
              <GlobalFilterBar
                areaSel={areaSel} setAreaSel={setAreaSel}
                deptSel={deptSel} setDeptSel={setDeptSel}
                period={periodFilter} setPeriod={setPeriodFilter}
                customFrom={customFrom} setCustomFrom={setCustomFrom}
                customTo={customTo} setCustomTo={setCustomTo}
                areaOptions={areaOptions} deptOptions={deptOptions}
                showPersonSelector={canSelectProgressPerson && (view === "overview" || view === "today")}
                selectedPersonId={progressPersonScopeId} setSelectedPersonId={setSelectedProgressPersonId}
                personOptions={personProgressChoices}
                todayPersonScope={todayPersonScope} setTodayPersonScope={chonPhamViToday}
                currentPersonId={currentPersonId}
                todayMode={view === "today"}
                /* Nhóm THỰC HIỆN + PHÂN TÍCH dùng bản gọn: bỏ nhãn phạm vi,
                   nút Bộ lọc, cụm đếm và Chép liên kết (anh Hoàn chốt 30/08). */
                rutGon={["work", "analysis"].includes(NAV_ITEMS.find((n) => n.id === view)?.group || "")}
              />
            )}

            {/* Page router — Suspense bọc các màn lazy; fallback là skeleton nhẹ. */}
            {/* key={view} khiến React dựng lại nhánh này mỗi lần đổi màn, nhờ
                đó hoạt ảnh vào chạy lại — mắt biết nội dung vừa thay. */}
            {/* Chặn màn không được phép, kể cả khi gõ thẳng `#v=...`. Ở chế
                độ `preview` guard không chặn gì — nó chỉ ghi lại chỗ lệch. */}
            <ScreenGuard screenId={view} access={access} onRedirect={chuyenManAnToan}>
            <div key={view} className="vmp-view-enter">
            <Suspense fallback={<SkeletonDashboard />}>
              {/* C2 (31/08): boundary DỮ LIỆU cấp router — một chỗ trả lời
                  cho MỌI màn ăn theo acts, thay vì mỗi màn tự vẽ (và phần
                  lớn quên): đang tải ≠ mạng hỏng ≠ chưa có dữ liệu ≠ bộ lọc
                  che hết. Màn tự quản dữ liệu (today, source, rules,
                  phanquyen, audit, admin) không đi qua đây. */}
              {boundaryDuLieu && (
                <StateBoundary
                  state={boundaryDuLieu}
                  title={boundaryDuLieu === "loading" ? "Đang tải dữ liệu VMP"
                    : boundaryDuLieu === "error" ? "Không tải được dữ liệu"
                    : boundaryDuLieu === "filtered-empty" ? "Bộ lọc đang che hết dữ liệu"
                    : "Chưa có dữ liệu VMP"}
                  description={boundaryDuLieu === "error"
                    ? `${conn.msg || "Mạng hoặc máy chủ đang trục trặc."} Dữ liệu đã nhập không mất — thử tải lại.`
                    : boundaryDuLieu === "filtered-empty"
                      ? "Có dữ liệu, nhưng tổ hợp khu vực / bộ phận / thời gian đang chọn không khớp hạng mục nào."
                      : undefined}
                  onRetry={reloadData}
                  onClearFilters={xoaBoLocToanCuc}
                  skeletonRows={5}
                />
              )}
              {monitoringView && (
                <MonitoringJourneyNav
                  current={monitoringView}
                  metrics={monitoringMetrics}
                  canView={(screen) => access.canView(screen)}
                  onNavigate={setView}
                  scopeLabel="Theo phạm vi chung"
                />
              )}
              {view === "today" && (
                <TodayCommandCenterMemo
                  acts={todayActs}
                  scopeLabel={nhanPhamViToday}
                  updatedLabel={dataUpdatedAt
                    ? `Sửa lần cuối: ${formatBangkokDateTime(dataUpdatedAt)}`
                    : undefined}
                  state={conn.status === "loading" ? "loading" : conn.status === "err" ? "error" : "ready"}
                  onRetry={reloadData}
                  hasScopeFilters={deptSel.length > 0 || areaSel.length > 0}
                  onClearScope={clearTodayScope}
                  onOpenProgress={moTienDo} />
              )}
              {!boundaryDuLieu && view === "overview" && (
                <>
                  {!canSelectProgressPerson && access.canView("overview") && (
                    <TeamOverviewComparison summary={teamOverviewSummary} acts={overviewActs} />
                  )}
                  <OverviewMemo acts={overviewActs} setView={setView} access={access} />
                </>
              )}
              {!boundaryDuLieu && view === "timeline" && <TimelineView acts={filteredActs}
                businessRole={access.businessRole} currentPersonId={currentPersonId} onReload={reloadData} />}
              {view === "source" && (
                <SourceCatalogView access={access} onReload={reloadData}
                  authorizationRevision={authorizationRevision}
                  focus={moDanhMuc}
                  onFocusConsumed={() => setMoDanhMuc(null)}
                  scopeLabel={nhanPhamVi}
                  updatedLabel={dataUpdatedAt
                    ? `Sửa lần cuối: ${formatBangkokDateTime(dataUpdatedAt)}`
                    : undefined} />
              )}
              {view === "health" && <HealthView acts={filteredActs} access={access} />}
              {view === "rules" && <ActiveRulesView access={access} />}
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
                    <CatalogView objects={filteredObjects} acts={filteredActs}
                      authorizationRevision={authorizationRevision}
                      canChonNguoiThucHien={canChonNguoiThucHien} canDoiTrangThai={canDoiTrangThai}
                      onUpdate={updateActivity} onReload={reloadData} readOnly={false}
                      canAssignWorkshop={access.can("progress", "assign_workshop_staff")}
                      onMoDanhMuc={(code, nhom) => { setMoDanhMuc({ code, nhom }); setView("source"); }} />
                  ) : (
                    <UpdateView acts={filteredActs} readableActs={todayActs} conn={conn}
                      canChonNguoiThucHien={canChonNguoiThucHien} canDoiTrangThai={canDoiTrangThai}
                      onUpdate={updateActivity} onReload={reloadData} readOnly={false}
                      canAssignWorkshop={access.can("progress", "assign_workshop_staff")}
                      pendingProgressLink={moHangMuc}
                      onProgressLinkConsumed={consumeProgressLink}
                      onMoPhanQuyen={access.canView("phanquyen") ? () => setView("phanquyen") : undefined} />
                  )}
                </>
              )}
              {/* `risk` và `inventory` không còn nhánh render riêng: chúng đã
                  được chuẩn hoá thành `alerts` và `progress` ngay tại biên
                  đọc URL, nên tới đây chỉ còn tên chuẩn. */}
              {!boundaryDuLieu && view === "alerts" && <AlertsView acts={filteredActs} />}
              {!boundaryDuLieu && view === "workload" && <WorkloadView acts={filteredActs}
                businessRole={access.businessRole} onReload={reloadData} />}
              {!boundaryDuLieu && view === "reports" && <ReportsViewMemo acts={filteredActs} />}
              {/* Màn "Tài khoản & quyền truy cập" đã gộp vào Vai trò & phạm
                  vi — `accounts` không còn nhánh render riêng, chỉ còn là
                  alias URL cũ được chuẩn hoá về `phanquyen` ở chuanHoaView. */}
              {view === "phanquyen" && (
                <PhanQuyenView acts={filteredActs} access={access} />
              )}
              {view === "audit" && <AuditLogView />}
              {view === "admin" && <AdminView conn={conn} user={user} access={access} />}
            </Suspense>
            </div>
            </ScreenGuard>

            {/* Chân trang: giờ đồng bộ (rời khỏi phụ đề topbar, anh Hoàn chốt 30/08). */}
            {lastSync && (
              <p className="vmp-chan-trang">Đồng bộ lúc {formatBangkokTime(lastSync)}</p>
            )}

            {/* Trợ lý hỏi đáp — nổi ở góc, không chiếm chỗ của bảng dữ liệu */}
            {/* Truyền màn đang xem xuống để Vali gợi ý câu hỏi bám đúng chỗ
                người dùng đang đứng — hỏi ở trang Cảnh báo khác hẳn hỏi ở
                trang Tổng quan. */}
            <Suspense fallback={null}><ChatBox user={user} trang={view} access={access} /></Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}

function AppShell() {
  const { user, setUser, logout, recoverySignal, clearRecovery } = useAuth();
  const [authMode, setAuthMode] = useState<LoginScreenMode>("login");
  const [authNotice, setAuthNotice] = useState("");

  if (recoverySignal) return (
    <PasswordRecoveryScreen
      signal={recoverySignal}
      onCompleted={async () => {
        setAuthMode("login");
        setAuthNotice("Mật khẩu đã được cập nhật. Hãy đăng nhập bằng mật khẩu mới.");
        await logout();
        clearRecovery();
      }}
      onRequestNewLink={async () => {
        setAuthMode("forgot");
        setAuthNotice("");
        await logout();
        clearRecovery();
      }}
    />
  );

  if (!user) return (
    <LoginScreen initialMode={authMode} notice={authNotice}
      onLogin={(u) => { setAuthNotice(""); setUser(u); saveUser(u); }} />
  );

  return <AuthorizedAppShell user={user} logout={logout} />;
}

/* Ranh giới này chỉ được mount sau khi đã loại trừ login/recovery. Nhờ đó
 * phiên PASSWORD_RECOVERY không gọi rpc_my_ui_access hoặc prefetch dữ liệu
 * bảo vệ trước khi người dùng đặt xong mật khẩu mới. */
function AuthorizedAppShell({ user, logout }: { user: AppUser; logout: () => Promise<void> }) {
  const { access, dangTai: dangXacMinhQuyen, loi: loiQuyen, taiLai: taiLaiQuyen } = useAccess(user);
  useAccessCacheTransition(user, {
    access, dangTai: dangXacMinhQuyen, loi: loiQuyen, taiLai: taiLaiQuyen,
  });
  /* Chỉ prefetch SAU đăng nhập (màn login không cần gánh 3 chunk màn),
     và đúng một lần cho cả phiên (cờ trong prefetchKhiRanh). */
  useEffect(() => { prefetchKhiRanh(); }, []);

  /* Chỉ outer shell được mount trước khi xác minh. Inner shell mới sở hữu
     useVmpData và mọi effect đọc dữ liệu bảo vệ. */
  if (dangXacMinhQuyen || loiQuyen) return (
    <main data-access-state={dangXacMinhQuyen ? "loading" : "error"} style={{
      minHeight: "100vh", display: "grid", placeItems: "center", padding: 24,
      background: `linear-gradient(160deg, ${C.bg1}, ${C.bg2})`, fontFamily: TEXT, color: C.plum,
    }}>
      <section aria-live="polite" style={{
        width: "min(100%, 560px)", padding: 28, borderRadius: 18, background: C.surface,
        border: `1.5px solid ${loiQuyen ? C.raspSoft : C.pinkSoft}`, lineHeight: 1.6,
      }}>
        <ShieldCheck size={28} color={loiQuyen ? C.raspText : C.pink} aria-hidden="true" />
        <h1 style={{ margin: "12px 0 6px", fontSize: 20 }}>
          {dangXacMinhQuyen ? "Đang xác minh quyền truy cập" : "Chưa xác minh được quyền truy cập"}
        </h1>
        <p style={{ margin: 0, color: C.plumSoft }}>
          {dangXacMinhQuyen
            ? "Hệ thống đang kiểm tra quyền của phiên này trước khi mở dữ liệu."
            : `${loiQuyen} Dữ liệu và các màn làm việc đang được giữ kín.`}
        </p>
        {!dangXacMinhQuyen && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
            <button type="button" onClick={taiLaiQuyen} style={btnPrimary}>
              <RefreshCw size={16} aria-hidden="true" /> Thử lại
            </button>
            <button type="button" onClick={() => { void logout(); }} style={{
              ...btnPrimary, background: C.surface, color: C.plum, border: `1px solid ${C.pinkSoft}`,
            }}>
              Thoát tài khoản
            </button>
          </div>
        )}
      </section>
    </main>
  );

  return <VerifiedAppShell user={user} logout={logout} access={access} />;
}

export default function App() {
  return (
    <DirtyStateProvider>
      {/* Vỏ thông báo bọc NGOÀI AppShell: mọi màn, mọi hộp thoại đều gọi
          `useToast()` được, kể cả các hộp thoại dựng bằng portal. */}
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </DirtyStateProvider>
  );
}

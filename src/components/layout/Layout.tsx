/* =====================================================================
 *  components/layout/Layout.jsx — Sidebar, Topbar, AppShell
 * ===================================================================== */
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  KeyRound, LogOut, ShieldCheck, RefreshCw, Menu, X, Sun, Moon, Monitor,
} from "lucide-react";
import { C, TEXT, NUM, DISPLAY, GRAD, R, glass } from "../../constants/theme.ts";
import { NAV_ITEMS, PERM_LABEL } from "../../constants/vmp.ts";
import { NAV_GROUP_ORDER } from "../../lib/navigationContract.ts";
import CrownMark from "../ui/CrownMark.tsx";
import type { ReactNode } from "react";
import { Sparkle, CrownLogo, tuoiDuLieu, dungThanhTra } from "../ui/Primitives.tsx";
import type { AppUser } from "../../types/domain.ts";
import { BUSINESS_ROLE_LABELS } from "../../lib/access.ts";
import type { AccessContext } from "../../lib/access.ts";

// ======================== SIDEBAR ========================
export function Sidebar({ view, setView, user, access, onLogout, onChangePw }: {
  view: string;
  setView: (v: string) => void;
  user?: AppUser | null;
  /** Quyền màn hình do Supabase trả về. Menu vẽ theo đây, không theo
   *  `user.role`/`user.accessClass`. */
  access: AccessContext;
  onLogout: () => void;
  onChangePw: () => void;
  connected?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  /* Nhóm nào không còn mục nào xem được thì không hiện tiêu đề nhóm. Trước
     đây nhóm QUẢN TRỊ hiện/ẩn theo một biểu thức riêng gộp `role` với
     `accessClass`; nay nó tự biến mất khi mọi mục bên trong đều bị từ chối,
     nên thêm một màn quản trị mới không phải sửa lại điều kiện ở đây. */
  /* Thứ tự lấy từ NAV_GROUP_ORDER — cùng một nguồn với hợp đồng điều
     hướng. Trước đây khai lại tại chỗ và để GIÁM SÁT lên đầu; spec §7.1
     đặt THỰC HIỆN trước, vì người dùng vào đây để LÀM việc chứ không phải
     để ngắm số liệu. */
  const NHAN_NHOM: Record<string, string> = {
    work: "THỰC HIỆN", monitor: "GIÁM SÁT", analysis: "PHÂN TÍCH", admin: "QUẢN TRỊ",
  };
  const groups = NAV_GROUP_ORDER
    .map((id) => ({ id, label: NHAN_NHOM[id] }))
    .filter((g) => NAV_ITEMS.some((n) => n.group === g.id && access.canView(n.id)));

  return (
    <aside className="vmp-sidebar" style={{
      /* 248px thay 266px — nghiên cứu đề xuất thu sidebar lại để trả thêm
         bề ngang cho vùng dữ liệu, thứ vốn là nhân vật chính. Collapsed giữ
         nguyên 72px. */
      width: collapsed ? 72 : 248, flexShrink: 0, height: "100%",
      display: "flex", flexDirection: "column",
      background: `linear-gradient(180deg, ${C.surface}, ${C.pinkMist})`,
      borderRight: `1px solid ${C.line}`,
      padding: collapsed ? "26px 8px" : "26px 16px",
      position: "relative", overflow: "hidden",
      transition: "width .25s ease, padding .25s ease",
    }}>
      <div className="tw" style={{ position: "absolute", top: 90, right: 18 }}>
        <Sparkle size={13} color={C.pink} />
      </div>
      <div className="tw" style={{ position: "absolute", bottom: 140, left: 16 }}>
        <Sparkle size={11} color={C.lav} />
      </div>

      {/* Logo */}
      <div style={{ padding: "0 6px 16px" }}>
        {collapsed
          /* Vương miện hình học thay emoji 👑: emoji đổi hình theo hệ điều
             hành, không ăn màu thương hiệu, và ở 16px trên Windows thì nó
             ra một khối vàng bẹt. */
          ? <div style={{ width: 40, height: 40, borderRadius: R.sm, background: GRAD, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", color: "#fff" }}>
              <CrownMark size={22} />
            </div>
          : <CrownLogo />
        }
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }} className="vmp-scroll">
        {groups.map((g) => (
          <div key={g.id}>
            {!collapsed && (
              <div style={{ fontSize: 12, color: C.plumSoft, letterSpacing: 1.4, fontWeight: 800, padding: "10px 12px 6px" }}>
                {g.label}
              </div>
            )}
            {NAV_ITEMS.filter((n) => n.group === g.id && access.canView(n.id)).map((n) => {
              const active = view === n.id;
              const Icon = n.icon;
              return (
                <button key={n.id} onClick={() => setView(n.id)} className="vmp-nav" data-view={n.id}
                  title={collapsed ? n.label : undefined}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: collapsed ? "12px" : "12px", borderRadius: R.md,
                    border: "none", cursor: "pointer", textAlign: "left",
                    fontFamily: TEXT, fontSize: 14, width: "100%",
                    fontWeight: active ? 800 : 600,
                    color: active ? C.plum : C.plumSoft,
                    background: active ? C.pinkSoft : "transparent",
                    boxShadow: active ? `inset 3px 0 0 ${C.pink}` : "none",
                    justifyContent: collapsed ? "center" : "flex-start",
                  }}
                >
                  <Icon size={19} color={active ? C.pink : C.plumSoft} strokeWidth={2.2} />
                  {!collapsed && n.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User card */}
      <div style={{
        marginTop: 14, padding: collapsed ? "10px" : "13px",
        borderRadius: 14, background: C.surface, border: `1.5px solid ${C.pinkSoft}`,
      }}>
        {collapsed ? (
          <div style={{
            width: 36, height: 36, borderRadius: 999, background: GRAD, margin: "0 auto",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontFamily: NUM, fontSize: 14,
          }}>
            {user?.name?.[0] || "U"}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 999, flexShrink: 0,
                background: GRAD, display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 800, fontFamily: NUM, fontSize: 16,
              }}>
                {user?.name?.[0] || "U"}
              </div>
              <div style={{ lineHeight: 1.3, overflow: "hidden", flex: 1 }}>
                <div style={{ color: C.plum, fontSize: 14, fontWeight: 800 }}>{user?.name}</div>
                <div style={{ color: C.plumSoft, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {user?.role}
                </div>
              </div>
            </div>
            {/* Thanh tra đã RỜI khỏi user card (nghiên cứu (3) P1): toggle
                toàn cục cạnh nút Thoát không nói được nó để làm gì. Giờ là
                "chế độ trình bày thanh tra" trong màn Báo cáo & AI, có
                banner + thay đổi thấy ngay khi bật. */}
            <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
              {/* nowrap + đệm ngang hẹp: sidebar nay là 248px thay vì 266px,
                  và ở bề ngang đó nhãn "Mật khẩu" bị bẻ xuống hai dòng. */}
              <button onClick={onChangePw} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                padding: "9px 4px", borderRadius: R.sm, border: "none", cursor: "pointer",
                whiteSpace: "nowrap",
                background: C.lavSoft, color: C.lavText, fontFamily: TEXT, fontSize: 12, fontWeight: 800,
              }}>
                <KeyRound size={14} /> Mật khẩu
              </button>
              <button onClick={onLogout} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                padding: "9px 4px", borderRadius: R.sm, border: "none", cursor: "pointer",
                whiteSpace: "nowrap",
                background: C.raspSoft, color: C.raspText, fontFamily: TEXT, fontSize: 12, fontWeight: 800,
              }}>
                <LogOut size={14} /> Thoát
              </button>
            </div>
          </>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
        title={collapsed ? "Mở rộng menu" : "Thu gọn menu"} onClick={() => setCollapsed(!collapsed)} style={{
        position: "absolute", top: 26, right: collapsed ? "50%" : 12,
        transform: collapsed ? "translateX(50%)" : "none",
        width: 28, height: 28, borderRadius: 8, border: "none",
        background: C.pinkSoft, cursor: "pointer", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}>
        {collapsed ? <Menu size={14} color={C.pinkText} /> : <X size={14} color={C.pinkText} />}
      </button>
    </aside>
  );
}

function MobileDrawer({ open, view, setView, user, access, onDismiss, onActionClose, onLogout, onChangePw }: {
  open: boolean;
  view: string;
  setView: (v: string) => void;
  user?: AppUser | null;
  access: AccessContext;
  /** Thoát drawer mà vẫn ở cùng ngữ cảnh → trả focus về nút mở. */
  onDismiss: () => void;
  /** Sang ngữ cảnh mới (màn, modal, logout, resize) → không trả focus cũ. */
  onActionClose: () => void;
  onLogout: () => void;
  onChangePw: () => void;
}) {
  const drawerRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const root = document.querySelector("#root");
    const main = document.querySelector("main") as HTMLElement | null;
    const rootWasInert = root?.hasAttribute("inert") ?? false;
    const bodyOverflow = document.body.style.overflow;
    const mainOverflow = main?.style.overflow ?? "";
    const mainOverflowY = main?.style.overflowY ?? "";
    const desktop = window.matchMedia("(min-width: 761px)");

    if (desktop.matches) {
      onActionClose();
      return;
    }

    // Drawer được portal ra ngoài #root, nên inert không vô hiệu hoá chính nó.
    // Khoá cả body và vùng <main> cuộn riêng để touch/keyboard không làm nền
    // chạy phía sau dialog.
    root?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    if (main) {
      main.style.overflow = "hidden";
      main.style.overflowY = "hidden";
    }

    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    const focusables = () => Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => element.getClientRects().length > 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusables();
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === first || !drawerRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !drawerRef.current?.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    const onViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) onActionClose();
    };
    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onViewportChange);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onViewportChange);
      if (!rootWasInert) root?.removeAttribute("inert");
      document.body.style.overflow = bodyOverflow;
      if (main) {
        main.style.overflow = mainOverflow;
        main.style.overflowY = mainOverflowY;
      }
    };
  }, [open, onDismiss, onActionClose]);

  if (!open) return null;

  const allowedItems = NAV_ITEMS.filter((item) => access.canView(item.id));
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="vmp-mobile-drawer-backdrop" onClick={onDismiss}>
      <aside ref={drawerRef} id="vmp-mobile-drawer" className="vmp-mobile-drawer" role="dialog" aria-modal="true"
        aria-label="Menu điều hướng" onClick={(event) => event.stopPropagation()}>
        <div className="vmp-mobile-drawer-head">
          <CrownLogo />
          <button ref={closeButtonRef} type="button" aria-label="Đóng menu" onClick={onDismiss} className="vmp-mobile-drawer-close">
            <X size={18} color={C.pinkText} />
          </button>
        </div>

        <nav aria-label="Điều hướng chính" className="vmp-mobile-drawer-nav">
          {allowedItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button key={item.id} type="button" data-view={item.id} className="vmp-nav"
                onClick={() => { setView(item.id); onActionClose(); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 13px", borderRadius: 14,
                  border: "none", cursor: "pointer", textAlign: "left", fontFamily: TEXT, fontSize: 14,
                  width: "100%", fontWeight: active ? 800 : 600, color: active ? C.plum : C.plumSoft,
                  background: active ? C.pinkSoft : "transparent", boxShadow: active ? `inset 3px 0 0 ${C.pink}` : "none",
                }}>
                <Icon size={19} color={active ? C.pink : C.plumSoft} strokeWidth={2.2} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="vmp-mobile-drawer-account">
          <div style={{ color: C.plum, fontSize: 14, fontWeight: 800 }}>{user?.name || "Tài khoản"}</div>
          <div style={{ color: C.plumSoft, fontSize: 12, fontWeight: 700, marginTop: 2 }}>{user?.role}</div>
          <div className="vmp-mobile-drawer-preferences">
            <ThemeToggle />
          </div>
          <button type="button" onClick={() => { onChangePw(); onActionClose(); }} className="vmp-mobile-drawer-account-action">
            <KeyRound size={15} /> Mật khẩu
          </button>
          <button type="button" onClick={() => { onActionClose(); onLogout(); }} className="vmp-mobile-drawer-account-action is-logout">
            <LogOut size={15} /> Thoát
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

// ======================== TOPBAR ========================
/* ---------------------------------------------------------------------
 * Đổi chế độ sáng / tối / theo hệ thống.
 *
 * Ghi thẳng data-theme lên <html> nên mọi biến màu đổi cùng lúc, không
 * component nào phải biết chuyện gì đang xảy ra. Lựa chọn lưu ở
 * localStorage và được áp lại trong main.tsx TRƯỚC khi React mount.
 * ------------------------------------------------------------------- */
type ThemeMode = "light" | "dark" | "auto";

function useThemeMode(): [ThemeMode, (m: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      const v = localStorage.getItem("vmp-theme");
      return v === "light" || v === "dark" ? v : "auto";
    } catch { return "auto"; }
  });

  useEffect(() => {
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const eff = mode === "auto" ? (sysDark.matches ? "dark" : "light") : mode;
      document.documentElement.setAttribute("data-theme", eff);
    };
    apply();
    try {
      if (mode === "auto") localStorage.removeItem("vmp-theme");
      else localStorage.setItem("vmp-theme", mode);
    } catch { /* bỏ qua khi localStorage bị chặn */ }
    // Đang ở "auto" thì phải theo khi người dùng đổi cài đặt hệ điều hành
    if (mode !== "auto") return;
    sysDark.addEventListener("change", apply);
    return () => sysDark.removeEventListener("change", apply);
  }, [mode]);

  return [mode, setMode];
}

/* MỘT nút xoay vòng thay ba nút luôn hiện.
   Ba nút chiếm chỗ cố định trên mọi màn hình để phục vụ một thao tác mà
   người dùng làm vài lần trong đời. Một nút hiện trạng thái đang dùng, bấm
   thì chuyển sang chế độ kế tiếp — vẫn tới được cả ba, mà chỉ tốn 1/3 chỗ. */
function ThemeToggle() {
  const [mode, setMode] = useThemeMode();
  const opts: Array<{ id: ThemeMode; icon: typeof Sun; label: string }> = [
    { id: "light", icon: Sun, label: "Sáng" },
    { id: "auto", icon: Monitor, label: "Theo hệ thống" },
    { id: "dark", icon: Moon, label: "Tối" },
  ];
  const i = Math.max(0, opts.findIndex((o) => o.id === mode));
  const cur = opts[i];
  const next = opts[(i + 1) % opts.length];
  const Icon = cur.icon;
  return (
    <button
      onClick={() => setMode(next.id)}
      title={`Giao diện: ${cur.label} — bấm để chuyển sang ${next.label}`}
      aria-label={`Giao diện ${cur.label}. Bấm để chuyển sang ${next.label}`}
      style={{ ...glass, width: 40, height: 40, borderRadius: 999, border: "none",
               cursor: "pointer", display: "flex", alignItems: "center",
               justifyContent: "center", padding: 0 }}>
      <Icon size={16} color={C.pinkText} />
    </button>
  );
}

/* Công tắc chế độ thanh tra — xem dungThanhTra() trong Primitives.tsx. */
/* Toggle chế độ trình bày thanh tra — nay chỉ đứng trong màn Báo cáo & AI
   (xuất cho ReportsView dùng). Hiệu ứng khi bật: banner cố định, ẩn Vali
   và trang trí, bỏ emoji/biệt danh — thấy ngay, không phải đoán. */
export function ThanhTraToggle() {
  const [bat, setBat] = dungThanhTra();
  return (
    <button onClick={() => setBat(!bat)}
      title={bat
        ? "Chế độ trình bày thanh tra ĐANG BẬT — ẩn minh hoạ, emoji, biệt danh và xếp hạng cá nhân. Bấm để tắt."
        : "Bật chế độ trình bày thanh tra: ngôn ngữ trung tính, ẩn minh hoạ trang trí, không emoji, không xếp hạng cá nhân"}
      aria-pressed={bat}
      style={{ ...glass, height: 40, padding: "0 14px", borderRadius: 999,
               border: bat ? `1.5px solid ${C.plum}` : "none",
               background: bat ? C.plum : undefined,
               cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
      <ShieldCheck size={15} color={bat ? "var(--lp-on-ink)" : C.plum} />
      <span style={{ fontFamily: TEXT, fontSize: 12, fontWeight: 800,
                     color: bat ? "var(--lp-on-ink)" : C.plum, whiteSpace: "nowrap" }}>
        {bat ? "Chế độ thanh tra" : "Thanh tra"}
      </span>
    </button>
  );
}

export function Topbar({ title, user, sub, onRefresh, refreshing, lastSync, dataUpdatedAt,
  view, setView, access, onLogout, onChangePw }: {
  title?: ReactNode;
  user?: AppUser | null;
  sub?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  lastSync?: number | string | null;
  /** max(updated_at) trong DB — TUỔI DỮ LIỆU, không phải giờ trình duyệt tải. */
  dataUpdatedAt?: string | null;
  view: string;
  setView: (v: string) => void;
  access: AccessContext;
  onLogout: () => void;
  onChangePw: () => void;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const dismissMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
    requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
  }, []);
  const closeMobileMenuForAction = useCallback(() => setMobileMenuOpen(false), []);
  // Đồng hồ chỉ để kích hoạt render lại mỗi phút; giá trị không dùng trực tiếp.
  const [, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="vmp-topbar" style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "22px 34px", gap: 20, flexWrap: "wrap",
    }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
          <Sparkle size={14} color={C.pink} />
          <span style={{ fontSize: 12, color: C.pinkText, fontWeight: 900, letterSpacing: 1.6 }}>
            VMP MONITOR · HỆ GIÁM SÁT THẨM ĐỊNH
          </span>
        </div>
        {/* Đây là <h1> chứ không phải <div> in đậm, và đó là khác biệt thật:
            trước đây KHÔNG màn nào trong app có h1, nên trình đọc màn hình
            không có mốc nào để nhảy tới, còn người dùng bàn phím không biết
            nội dung trang bắt đầu ở đâu. Một h1 mỗi màn — Topbar là nơi duy
            nhất dựng nó, nên không có chuyện hai màn cãi nhau. */}
        <h1 className="vmp-title" style={{
          margin: 0,
          fontFamily: DISPLAY,
          fontSize: "var(--lp-fs-h1)",
          lineHeight: "var(--lp-lh-h1)",
          fontWeight: 600,
          letterSpacing: "var(--lp-tracking-display)",
          color: C.plum,
        }}>{title}</h1>
        <div style={{ fontSize: 14, color: C.plum, marginTop: 5, fontWeight: 700 }}>
          {sub || "CPC1 HN"}
          {lastSync && (
            <span style={{ marginLeft: 12, fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>
              · Đồng bộ: {new Date(lastSync).toLocaleTimeString("vi-VN")}
            </span>
          )}
          {/* Mốc dữ liệu luôn hiện, không đợi tới lúc quá ngưỡng mới báo: sự cố
              21 ngày lần trước không ai phát hiện chính vì màn hình im lặng khi
              mọi thứ "trông vẫn bình thường".
              Nhưng chỉ hiện, KHÔNG tô màu báo động: Supabase là dữ liệu gốc nên
              "lâu không đổi" chỉ nghĩa là chưa ai nhập liệu. */}
          {dataUpdatedAt && (() => {
            const t = tuoiDuLieu(dataUpdatedAt);
            if (!t) return null;
            return (
              <span
                title={`Hạng mục được sửa gần nhất lúc ${new Date(dataUpdatedAt).toLocaleString("vi-VN")}`}
                style={{
                  marginLeft: 10, fontSize: 12, fontWeight: 800,
                  color: C.plumSoft,
                }}>
                {/* Ghép tay chứ không dùng toLocaleString: với vi-VN nó trả
                    "14:11 31-07" — giờ đứng trước ngày, đọc rất dễ nhầm. */}
                {(() => {
                  const d = new Date(dataUpdatedAt);
                  const hai = (n: number) => String(n).padStart(2, "0");
                  return `· Sửa lần cuối: ${hai(d.getDate())}/${hai(d.getMonth() + 1)} ${hai(d.getHours())}:${hai(d.getMinutes())}`;
                })()}
              </span>
            );
          })()}
        </div>
      </div>

      <div className="vmp-topbar-actions" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button ref={mobileMenuButtonRef} type="button" className="vmp-mobile-menu-button"
          aria-label="Mở menu" aria-expanded={mobileMenuOpen} aria-controls="vmp-mobile-drawer"
          onClick={() => setMobileMenuOpen(true)}>
          <Menu size={19} color={C.pinkText} />
        </button>
        <ThemeToggle />
        <button onClick={onRefresh} title="Làm mới dữ liệu" className="vmp-lift" style={{
          ...glass, borderRadius: 14, padding: "9px 15px",
          display: "flex", alignItems: "center", gap: 8,
          border: "none", cursor: "pointer",
          color: C.pinkText, fontFamily: TEXT, fontWeight: 800, fontSize: 12,
        }}>
          <RefreshCw size={15} color={C.pink} className={refreshing ? "spin" : ""} />
          {refreshing ? "Đang tải…" : "Làm mới"}
        </button>

        {/* Badge ưu tiên VAI NGHIỆP VỤ do server giải (sáu vai) — chỉ khi
            server chưa giải được (preview/legacy) mới lùi về nhãn quyền
            đăng nhập cũ. Đây là chỗ người dùng đối chiếu "hệ coi mình là
            ai" với những nút họ thấy. */}
        <span className="vmp-perm-badge" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800,
          color: (access?.businessRole ?? user?.perm) === "viewer" || user?.perm === "view"
            ? C.skyText : C.pinkText,
          background: (access?.businessRole ?? user?.perm) === "viewer" || user?.perm === "view"
            ? C.skySoft : C.pinkSoft,
        }}>
          <ShieldCheck size={14} />
          {(access?.businessRole && BUSINESS_ROLE_LABELS[access.businessRole])
            || (user && PERM_LABEL[user.perm])
            || user?.role}
        </span>

      </div>
      <MobileDrawer open={mobileMenuOpen} view={view} setView={setView} user={user} access={access}
        onDismiss={dismissMobileMenu} onActionClose={closeMobileMenuForAction}
        onLogout={onLogout} onChangePw={onChangePw} />
    </div>
  );
}

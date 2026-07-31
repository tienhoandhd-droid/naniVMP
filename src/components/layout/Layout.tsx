/* =====================================================================
 *  components/layout/Layout.jsx — Sidebar, Topbar, AppShell
 * ===================================================================== */
import { useState, useEffect } from "react";
import {
  Bell, KeyRound, LogOut, ShieldCheck, RefreshCw, Menu, X, Sun, Moon, Monitor,
} from "lucide-react";
import { C, TEXT, NUM, GRAD, glass } from "../../constants/theme.ts";
import { NAV_ITEMS, PERM_LABEL } from "../../constants/vmp.ts";
import type { ReactNode } from "react";
import { Sparkle, CrownLogo, tuoiDuLieu, dungThanhTra } from "../ui/Primitives.tsx";
import type { AppUser } from "../../types/domain.ts";

// ======================== SIDEBAR ========================
export function Sidebar({ view, setView, user, onLogout, onChangePw }: {
  view: string;
  setView: (v: string) => void;
  user?: AppUser | null;
  onLogout: () => void;
  onChangePw: () => void;
  connected?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isAdmin = user?.perm === "admin";

  const groups = [
    { id: "monitor", label: "GIÁM SÁT" },
    { id: "work", label: "THỰC HIỆN" },
    { id: "analysis", label: "PHÂN TÍCH" },
    ...(isAdmin ? [{ id: "admin", label: "QUẢN TRỊ" }] : []),
  ];

  return (
    <aside className="vmp-sidebar" style={{
      width: collapsed ? 72 : 266, flexShrink: 0, height: "100%",
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
          ? <div style={{ width: 40, height: 40, borderRadius: 14, background: GRAD, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, margin: "0 auto" }}>👑</div>
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
            {NAV_ITEMS.filter((n) => n.group === g.id && (!n.adminOnly || isAdmin)).map((n) => {
              const active = view === n.id;
              const Icon = n.icon;
              return (
                <button key={n.id} onClick={() => setView(n.id)} className="vmp-nav"
                  title={collapsed ? n.label : undefined}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: collapsed ? "12px" : "11px 13px", borderRadius: 14,
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
            <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
              <button onClick={onChangePw} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "9px", borderRadius: 14, border: "none", cursor: "pointer",
                background: C.lavSoft, color: C.lavText, fontFamily: TEXT, fontSize: 12, fontWeight: 800,
              }}>
                <KeyRound size={14} /> Mật khẩu
              </button>
              <button onClick={onLogout} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "9px", borderRadius: 14, border: "none", cursor: "pointer",
                background: C.raspSoft, color: C.raspText, fontFamily: TEXT, fontSize: 12, fontWeight: 800,
              }}>
                <LogOut size={14} /> Thoát
              </button>
            </div>
          </>
        )}
      </div>

      {/* Collapse toggle */}
      <button onClick={() => setCollapsed(!collapsed)} style={{
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
function ThanhTraToggle() {
  const [bat, setBat] = dungThanhTra();
  return (
    <button onClick={() => setBat(!bat)}
      title={bat
        ? "Chế độ thanh tra ĐANG BẬT — ẩn emoji, biệt danh và xếp hạng cá nhân. Bấm để tắt."
        : "Bật chế độ thanh tra: ngôn ngữ trung tính, không emoji, không xếp hạng cá nhân"}
      aria-pressed={bat}
      style={{ ...glass, height: 40, padding: "0 14px", borderRadius: 999,
               border: bat ? `1.5px solid ${C.plum}` : "none",
               background: bat ? C.plum : undefined,
               cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
      <ShieldCheck size={15} color={bat ? "#fff" : C.plumSoft} />
      <span style={{ fontFamily: TEXT, fontSize: 12, fontWeight: 800,
                     color: bat ? "#fff" : C.plumSoft, whiteSpace: "nowrap" }}>
        {bat ? "Chế độ thanh tra" : "Thanh tra"}
      </span>
    </button>
  );
}

export function Topbar({ title, user, sub, onRefresh, refreshing, lastSync, dataUpdatedAt }: {
  title?: ReactNode;
  user?: AppUser | null;
  sub?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  lastSync?: number | string | null;
  /** max(updated_at) trong DB — TUỔI DỮ LIỆU, không phải giờ trình duyệt tải. */
  dataUpdatedAt?: string | null;
}) {
  // Đồng hồ chỉ để kích hoạt render lại mỗi phút; giá trị không dùng trực tiếp.
  const [, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
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
        <div className="vmp-title" style={{ fontSize: 28, fontWeight: 800, color: C.plum }}>{title}</div>
        <div style={{ fontSize: 14, color: C.plum, marginTop: 5, fontWeight: 700 }}>
          {sub || "CPC1 HN"}
          {lastSync && (
            <span style={{ marginLeft: 12, fontSize: 12, color: C.plumSoft, fontWeight: 700 }}>
              · Đồng bộ: {new Date(lastSync).toLocaleTimeString("vi-VN")}
            </span>
          )}
          {/* Mốc dữ liệu luôn hiện, không đợi tới lúc quá ngưỡng mới báo: sự cố
              21 ngày lần trước không ai phát hiện chính vì màn hình im lặng khi
              mọi thứ "trông vẫn bình thường". */}
          {dataUpdatedAt && (() => {
            const t = tuoiDuLieu(dataUpdatedAt);
            if (!t) return null;
            return (
              <span
                title={`Hạng mục được sửa gần nhất lúc ${new Date(dataUpdatedAt).toLocaleString("vi-VN")}`}
                style={{
                  marginLeft: 10, fontSize: 12, fontWeight: 800,
                  padding: t.cu ? "2px 9px" : 0, borderRadius: 999,
                  color: t.cu ? C.marigoldText : C.plumSoft,
                  background: t.cu ? C.marigoldSoft : "transparent",
                }}>
                {/* Ghép tay chứ không dùng toLocaleString: với vi-VN nó trả
                    "14:11 31-07" — giờ đứng trước ngày, đọc rất dễ nhầm. */}
                {(() => {
                  const d = new Date(dataUpdatedAt);
                  const hai = (n: number) => String(n).padStart(2, "0");
                  return `· Dữ liệu: ${hai(d.getDate())}/${hai(d.getMonth() + 1)} ${hai(d.getHours())}:${hai(d.getMinutes())}`;
                })()}
                {t.cu && ` (cũ ~${t.gio}h)`}
              </span>
            );
          })()}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <ThanhTraToggle />
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

        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800,
          color: user?.perm === "view" ? C.skyText : C.pinkText,
          background: user?.perm === "view" ? C.skySoft : C.pinkSoft,
        }}>
          <ShieldCheck size={14} /> {(user && PERM_LABEL[user.perm]) || user?.role}
        </span>

        <button style={{
          position: "relative", width: 42, height: 42,
          cursor: "pointer", ...glass,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Bell size={18} color={C.pink} />
          <span style={{
            position: "absolute", top: 9, right: 10,
            width: 8, height: 8, borderRadius: 999,
            background: C.rasp, border: `2px solid ${C.surface}`,
          }} />
        </button>
      </div>
    </div>
  );
}

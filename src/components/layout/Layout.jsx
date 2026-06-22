/* =====================================================================
 *  components/layout/Layout.jsx — Sidebar, Topbar, AppShell
 * ===================================================================== */
import { useState, useEffect } from "react";
import {
  Bell, KeyRound, LogOut, ShieldCheck, RefreshCw, Menu, X,
} from "lucide-react";
import { C, TEXT, NUM, GRAD, glass, btnPrimary } from "../../constants/theme.js";
import { NAV_ITEMS, NAV_SUBS, PERM_LABEL } from "../../constants/vmp.js";
import { Sparkle, CrownLogo } from "../ui/Primitives.jsx";

// ======================== SIDEBAR ========================
export function Sidebar({ view, setView, user, onLogout, onChangePw, connected }) {
  const [collapsed, setCollapsed] = useState(false);
  const isAdmin = user?.perm === "admin";

  const groups = [
    { id: "monitor", label: "GIÁM SÁT" },
    { id: "analysis", label: "PHÂN TÍCH" },
    ...(isAdmin ? [{ id: "admin", label: "QUẢN TRỊ" }] : []),
  ];

  return (
    <aside className="vmp-sidebar" style={{
      width: collapsed ? 72 : 266, flexShrink: 0, height: "100%",
      display: "flex", flexDirection: "column",
      background: `linear-gradient(180deg, #FFFFFF, ${C.pinkMist})`,
      borderRight: `1.5px solid ${C.pinkSoft}`,
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
          ? <div style={{ width: 40, height: 40, borderRadius: 14, background: GRAD, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, margin: "0 auto" }}>👑</div>
          : <CrownLogo />
        }
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }} className="vmp-scroll">
        {groups.map((g) => (
          <div key={g.id}>
            {!collapsed && (
              <div style={{ fontSize: 10.5, color: C.plumSoft, letterSpacing: 1.4, fontWeight: 800, padding: "10px 12px 6px" }}>
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
                    fontFamily: TEXT, fontSize: 13.5, width: "100%",
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
        borderRadius: 18, background: "#fff", border: `1.5px solid ${C.pinkSoft}`,
      }}>
        {collapsed ? (
          <div style={{
            width: 36, height: 36, borderRadius: 999, background: GRAD, margin: "0 auto",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontFamily: NUM, fontSize: 15,
          }}>
            {user.name?.[0] || "U"}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 999, flexShrink: 0,
                background: GRAD, display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 800, fontFamily: NUM, fontSize: 17,
              }}>
                {user.name?.[0] || "U"}
              </div>
              <div style={{ lineHeight: 1.3, overflow: "hidden", flex: 1 }}>
                <div style={{ color: C.plum, fontSize: 14, fontWeight: 800 }}>{user.name}</div>
                <div style={{ color: C.plumSoft, fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {user.role}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
              <button onClick={onChangePw} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "9px", borderRadius: 11, border: "none", cursor: "pointer",
                background: C.lavSoft, color: C.lavText, fontFamily: TEXT, fontSize: 12, fontWeight: 800,
              }}>
                <KeyRound size={14} /> Mật khẩu
              </button>
              <button onClick={onLogout} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "9px", borderRadius: 11, border: "none", cursor: "pointer",
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
export function Topbar({ title, user, sub, onRefresh, refreshing, lastSync }) {
  const [now, setNow] = useState(new Date());
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
          <span style={{ fontSize: 10.5, color: C.pinkText, fontWeight: 800, letterSpacing: 1.6 }}>
            VMP MONITOR · HỆ GIÁM SÁT THẨM ĐỊNH
          </span>
        </div>
        <div style={{ fontFamily: TEXT, fontSize: 25, fontWeight: 800, color: C.plum }}>{title}</div>
        <div style={{ fontSize: 13, color: C.plumSoft, marginTop: 3, fontWeight: 600 }}>
          {sub || "CPC1 HN"}
          {lastSync && (
            <span style={{ marginLeft: 12, fontSize: 11, opacity: 0.7 }}>
              · Đồng bộ: {lastSync.toLocaleTimeString("vi-VN")}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onRefresh} title="Làm mới dữ liệu" style={{
          ...glass, borderRadius: 16, padding: "9px 15px",
          display: "flex", alignItems: "center", gap: 8,
          border: "none", cursor: "pointer",
          color: C.pinkText, fontFamily: TEXT, fontWeight: 800, fontSize: 12.5,
        }}>
          <RefreshCw size={15} color={C.pink} className={refreshing ? "spin" : ""} />
          {refreshing ? "Đang tải…" : "Làm mới"}
        </button>

        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 800,
          color: user.perm === "view" ? C.skyText : C.pinkText,
          background: user.perm === "view" ? C.skySoft : C.pinkSoft,
        }}>
          <ShieldCheck size={14} /> {PERM_LABEL[user.perm] || user.role}
        </span>

        <button style={{
          position: "relative", width: 42, height: 42, borderRadius: 999,
          border: "none", cursor: "pointer", ...glass,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Bell size={18} color={C.pink} />
          <span style={{
            position: "absolute", top: 9, right: 10,
            width: 8, height: 8, borderRadius: 999,
            background: C.rasp, border: "2px solid #fff",
          }} />
        </button>
      </div>
    </div>
  );
}

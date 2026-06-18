/* =====================================================================
 *  components/ui/Primitives.jsx — Shared UI Components
 *  Card, Tag, Modal, Donut, KpiCard, Sparkle, Skeleton, etc.
 * ===================================================================== */
import { C, TEXT, NUM, GRAD, cardDefault, cardStrong, cardSoft, glass, btnPrimary, FIELD, LBL, INP } from "../../constants/theme.js";
import { STATUS } from "../../constants/vmp.js";
import { XCircle } from "lucide-react";

// ======================== SPARKLE ========================
export function Sparkle({ size = 18, color = C.gold, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      <path d="M12 0 C13 7 17 11 24 12 C17 13 13 17 12 24 C11 17 7 13 0 12 C7 11 11 7 12 0 Z" fill={color} />
    </svg>
  );
}

// ======================== MASCOT ========================
export function Mascot({ mood, size = 130 }) {
  const happy = mood === "happy";
  const hair = "#E3A9D6", hairDark = "#C77FBE", skin = "#FFE0CD";
  return (
    <svg width={size} height={size} viewBox="0 0 150 150" className="bob" style={{ overflow: "visible" }}>
      <ellipse cx="75" cy="74" rx="46" ry="48" fill={hair} />
      <ellipse cx="42" cy="92" rx="13" ry="22" fill={hairDark} opacity="0.8" />
      <ellipse cx="108" cy="92" rx="13" ry="22" fill={hairDark} opacity="0.8" />
      {!happy && (<g fill={hairDark}><path d="M52 30 L46 14 L58 28 Z" /><path d="M70 24 L70 8 L78 24 Z" /><path d="M92 30 L102 16 L96 31 Z" /><path d="M34 52 L18 46 L33 56 Z" /><path d="M116 52 L132 48 L117 58 Z" /></g>)}
      <circle cx="75" cy="76" r="31" fill={skin} />
      <path d="M44 74 C46 48 104 48 106 74 C96 60 54 60 44 74 Z" fill={hair} />
      <ellipse cx="57" cy="84" rx="6.5" ry="4.5" fill="#F7A8C4" opacity="0.85" />
      <ellipse cx="93" cy="84" rx="6.5" ry="4.5" fill="#F7A8C4" opacity="0.85" />
      <g transform={happy ? "" : "rotate(-14 75 46)"}><path d="M60 48 L64 33 L72 44 L80 33 L84 48 Z" fill={C.gold} stroke="#E0A21F" strokeWidth="1" /><circle cx="72" cy="35" r="3" fill={C.pink} /></g>
      {happy ? (
        <>
          <path d="M60 76 Q65 71 70 76" fill="none" stroke={C.plum} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M80 76 Q85 71 90 76" fill="none" stroke={C.plum} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M66 90 Q75 100 84 90 Q75 95 66 90 Z" fill="#D8607E" />
          <path d="M118 40 C119 44 121 46 125 47 C121 48 119 50 118 54 C117 50 115 48 111 47 C115 46 117 44 118 40 Z" fill={C.gold} />
          <path d="M30 60 C31 63 32 64 35 65 C32 66 31 67 30 70 C29 67 28 66 25 65 C28 64 29 63 30 60 Z" fill={C.pink} />
        </>
      ) : (
        <>
          <path d="M56 67 L65 64" stroke={C.plum} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M94 67 L85 64" stroke={C.plum} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="64" cy="76" r="5" fill="#fff" stroke={C.plum} strokeWidth="1.4" /><circle cx="65" cy="77" r="2.4" fill={C.plum} />
          <circle cx="86" cy="76" r="5" fill="#fff" stroke={C.plum} strokeWidth="1.4" /><circle cx="85" cy="77" r="2.4" fill={C.plum} />
          <path d="M68 92 Q72 88 75 92 Q78 96 82 92" fill="none" stroke="#C0506E" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M104 64 C100 70 108 70 104 64 Z" fill="#8FC4EC" /><ellipse cx="103" cy="67" rx="1.2" ry="1.6" fill="#fff" opacity="0.7" />
        </>
      )}
    </svg>
  );
}

// ======================== CARD ========================
export function Card({ children, style, variant = "default", cls = "" }) {
  const base = variant === "strong" ? cardStrong : variant === "soft" ? cardSoft : cardDefault;
  return (
    <div className={`card fade ${cls}`} style={{ ...base, padding: 24, ...style }}>
      {children}
    </div>
  );
}

export function CardTitle({ icon: Icon, children, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
      {Icon && (
        <div style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, background: C.pinkSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={22} color={C.pinkText} />
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: TEXT, fontSize: 18, fontWeight: 800, color: C.plum }}>{children}</div>
        {sub && <div style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ======================== TAG ========================
export function Tag({ color, bg, children, style: extra }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 11px", borderRadius: 999,
      fontFamily: TEXT, fontSize: 11.5, fontWeight: 800,
      color, background: bg, whiteSpace: "nowrap", ...extra,
    }}>
      {children}
    </span>
  );
}

// ======================== MODAL ========================
export function Modal({ onClose, title, icon: Icon = XCircle, children, wide }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 999,
      background: "rgba(78,42,78,.48)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} className="vmp-scroll" style={{
        background: C.pinkMist, borderRadius: 24, padding: 28,
        width: "100%", maxWidth: wide ? 620 : 440,
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 24px 54px rgba(78,42,78,.32)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 13, background: C.lavSoft,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon size={20} color={C.lavText} />
            </div>
            <span style={{ fontFamily: TEXT, fontSize: 19, fontWeight: 800, color: C.plum }}>{title}</span>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex" }}>
            <XCircle size={22} color={C.plumSoft} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ======================== DONUT ========================
export function Donut({ segments, size = 152, stroke = 18 }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.pinkSoft} strokeWidth={stroke} />
        {segments.map((s, i) => {
          const len = (s.value / total) * circ;
          const node = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={s.color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${Math.max(len - 3, 0)} ${circ - Math.max(len - 3, 0)}`}
              strokeDashoffset={-acc}
              style={{ transition: "stroke-dasharray .9s ease" }}
            />
          );
          acc += len;
          return node;
        })}
      </g>
    </svg>
  );
}

// ======================== KPI CARD ========================
export function KpiCard({ emoji, bg, color, value, label, sub, subColor }) {
  return (
    <Card style={{ textAlign: "center", padding: "22px 18px" }}>
      <div style={{
        width: 52, height: 52, borderRadius: 16, margin: "0 auto 12px",
        background: bg, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 24,
      }}>
        {emoji}
      </div>
      <div style={{ fontFamily: NUM, fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: C.plum, marginTop: 6 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: subColor || C.plumSoft, fontWeight: 700, marginTop: 3 }}>{sub}</div>}
    </Card>
  );
}

// ======================== SELECT ========================
export function Sel({ val, set, opts }) {
  return (
    <select value={val} onChange={(e) => set(e.target.value)} style={{
      padding: "8px 13px", borderRadius: 12, border: `1.5px solid ${C.pinkSoft}`,
      background: "#fff", fontFamily: TEXT, fontSize: 13, color: C.plum,
      fontWeight: 700, cursor: "pointer", outline: "none",
    }}>
      {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

// ======================== SKELETON ========================
export function SkeletonPulse({ w = "100%", h = 16, r = 8 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: `linear-gradient(90deg, ${C.pinkSoft} 25%, #fff 50%, ${C.pinkSoft} 75%)`,
      backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite",
    }} />
  );
}

export function SkeletonDashboard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "10px 0" }}>
      <Card variant="strong" style={{ display: "flex", alignItems: "center", gap: 18, padding: 24 }}>
        <SkeletonPulse w={100} h={100} r={999} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          <SkeletonPulse w="70%" h={18} r={10} />
          <SkeletonPulse w="50%" h={13} />
          <SkeletonPulse w="40%" h={13} />
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 14 }}>
        {[1,2,3,4,5].map((i) => (
          <Card key={i}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 10 }}>
              <SkeletonPulse w={44} h={30} r={10} />
              <SkeletonPulse w="65%" h={11} />
              <SkeletonPulse w="45%" h={9} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ======================== SYNC STATUS BANNER ========================
export function SyncBanner({ conn, lastSync }) {
  if (conn.status === "ok" && lastSync) return null;
  const isErr = conn.status === "err";
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 12, marginBottom: 16,
      background: isErr ? C.raspSoft : C.marigoldSoft,
      border: `1.5px solid ${isErr ? C.rasp : C.marigold}`,
      fontSize: 12.5, fontWeight: 700,
      color: isErr ? C.raspText : C.marigoldText,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span>{isErr ? "⚠️" : "⏳"}</span>
      <span>
        {conn.status === "loading" ? "Đang đồng bộ dữ liệu…" :
         isErr ? `Lỗi kết nối: ${conn.msg}` :
         "Dữ liệu chưa đồng bộ. Bấm Làm mới để tải."}
      </span>
      {lastSync && (
        <span style={{ marginLeft: "auto", fontWeight: 600, opacity: 0.8 }}>
          Đồng bộ cuối: {lastSync.toLocaleTimeString("vi-VN")}
        </span>
      )}
    </div>
  );
}

// ======================== PILL (status badge) ========================
export function Pill({ s, small }) {
  const m = STATUS[s] || STATUS.plan;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: small ? "3px 9px" : "5px 12px", borderRadius: 999,
      fontSize: small ? 11 : 12, fontWeight: 700,
      color: m.text, background: m.bg, fontFamily: TEXT, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: m.text }} />
      {m.label}
    </span>
  );
}

// ======================== CHART TOOLTIP ========================
export function ChartTip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: "#fff", padding: "10px 14px", borderRadius: 14,
      border: `1.5px solid ${C.pinkSoft}`,
      boxShadow: "0 8px 24px rgba(238,123,169,.18)",
      fontFamily: TEXT, fontSize: 13,
    }}>
      {label && <div style={{ fontWeight: 700, color: C.plum, marginBottom: 5 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, color: C.plum, fontWeight: 700 }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: p.color }} />
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

// ======================== PHASE TAG ========================
export function phaseTag(txt) {
  const s = String(txt == null ? "" : txt).trim();
  const lc = s.toLowerCase();
  const neg = /\b(chưa|chua|không|khong)\b/.test(lc) || /^\s*(chưa|chua|không|khong)/.test(lc) || /not[_\s-]?started/.test(lc);
  const done = !neg && /hoàn thành|hoan thanh|done|đạt|complete|completed|✓|✔|100|xong/.test(lc);
  const prog = !neg && /đang|dang|thực hiện|thuc hien|progress|in[_\s-]?progress|wip/.test(lc);
  const isOverdue = /overdue|quá hạn|qua han/.test(lc);
  const isEmptyish = !s || /not[_\s-]?started/.test(lc);
  const c = done ? { l: "✓ Hoàn thành", col: C.mintText, bg: C.mintSoft }
    : prog ? { l: "● Đang làm", col: C.marigoldText, bg: C.marigoldSoft }
    : isOverdue ? { l: "⚠ Quá hạn", col: C.raspText, bg: C.raspSoft }
    : isEmptyish ? { l: "Chưa có", col: C.plumSoft, bg: "rgba(122,74,110,.08)" }
    : { l: "○ " + (s.length > 16 ? s.slice(0, 16) + "…" : s), col: C.skyText, bg: C.skySoft };
  return <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, color: c.col, background: c.bg, whiteSpace: "nowrap" }}>{c.l}</span>;
}

// ======================== RO FIELD (read-only) ========================
export function ROField({ label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft }}>{label}</span>
      <div style={{
        padding: "11px 13px", borderRadius: 12,
        border: `1.5px solid ${C.lavSoft}`, background: C.lavSoft,
        fontFamily: TEXT, fontSize: 14, color: C.plumSoft, fontWeight: 600,
        display: "flex", alignItems: "center", minHeight: 20,
      }}>
        {value || "—"}
      </div>
    </div>
  );
}

// ======================== CROWN LOGO ========================
export function CrownLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
      <div style={{
        width: 40, height: 40, borderRadius: 14, background: GRAD,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20,
      }}>
        👑
      </div>
      <div>
        <div style={{ fontFamily: TEXT, fontSize: 16, fontWeight: 800, color: C.plum }}>VMP Monitor</div>
        <div style={{ fontSize: 10, color: C.plumSoft, fontWeight: 600 }}>CPC1 HN · QLCL</div>
      </div>
    </div>
  );
}

/* =====================================================================
 *  components/ui/Primitives.jsx — Shared UI Components
 *  Card, Tag, Modal, Donut, KpiCard, Sparkle, Skeleton, etc.
 * ===================================================================== */
import { useId } from "react";
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

// ======================== MASCOT (refined) ========================
// Công chúa Vali — phiên bản tinh tế hơn. Dùng gradient, manga eyes, crown có jewels.
// Vẫn là SVG (không phải anime PNG), nhưng đẹp hơn cartoon cũ đáng kể.
export function Mascot({ mood = "happy", size = 140 }) {
  // Unique id cho gradient để tránh xung đột khi render nhiều mascot
  const uid = useId().replace(/:/g, "");
  // Palette tinh tế
  const skin       = "#FFE2D0";
  const skinShade  = "#F0C5AE";
  const hairLight  = "#E0BFF0";   // lavender light
  const hairMid    = "#B58FE0";   // mid purple
  const hairDeep   = "#7E5BB8";   // deep purple
  const blush      = "#FFB7C7";
  const eyeDeep    = "#4A2D87";
  const eyeMid     = "#6B45B8";
  const crownLight = "#FFE9A8";
  const crownGold  = "#E8C76A";
  const crownDeep  = "#B89020";
  const jewelRed   = "#E63946";
  const jewelBlue  = "#5DB3E0";
  const lips       = "#D8607A";

  const happy = mood === "happy";
  const worried = mood === "worried";

  return (
    <svg
      width={size}
      height={size * 1.08}
      viewBox="0 0 200 216"
      className="bob"
      style={{ overflow: "visible", display: "block" }}
      aria-label="Công chúa Vali"
    >
      <defs>
        <linearGradient id={`hair-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={hairLight} />
          <stop offset="0.55" stopColor={hairMid} />
          <stop offset="1" stopColor={hairDeep} />
        </linearGradient>
        <radialGradient id={`face-${uid}`} cx="0.5" cy="0.42" r="0.55">
          <stop offset="0" stopColor="#FFEFE2" />
          <stop offset="0.82" stopColor={skin} />
          <stop offset="1" stopColor={skinShade} />
        </radialGradient>
        <linearGradient id={`crown-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={crownLight} />
          <stop offset="0.55" stopColor={crownGold} />
          <stop offset="1" stopColor={crownDeep} />
        </linearGradient>
        <linearGradient id={`dress-${uid}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={hairMid} />
          <stop offset="1" stopColor={hairDeep} />
        </linearGradient>
      </defs>

      {/* Hair background — long flowing */}
      <path
        d="M 36 108
           Q 28 82, 42 60
           Q 42 28, 78 22
           Q 100 6, 122 22
           Q 158 28, 158 60
           Q 172 82, 164 108
           Q 172 140, 164 172
           Q 158 195, 152 210
           L 48 210
           Q 42 195, 36 172
           Q 28 140, 36 108 Z"
        fill={`url(#hair-${uid})`}
      />

      {/* Hair side accent strands */}
      <path d="M 38 96 Q 30 135, 44 185 L 52 210 L 56 210 Q 46 175, 50 130 Z" fill={hairDeep} opacity="0.4" />
      <path d="M 162 96 Q 170 135, 156 185 L 148 210 L 144 210 Q 154 175, 150 130 Z" fill={hairDeep} opacity="0.4" />

      {/* Face oval */}
      <ellipse cx="100" cy="106" rx="46" ry="54" fill={`url(#face-${uid})`} />

      {/* Bangs / forehead hair */}
      <path
        d="M 56 74
           Q 60 52, 82 50
           Q 92 42, 100 47
           Q 108 42, 118 50
           Q 140 52, 144 74
           Q 134 80, 120 73
           Q 110 67, 100 72
           Q 90 67, 80 73
           Q 66 80, 56 74 Z"
        fill={`url(#hair-${uid})`}
      />

      {/* === Crown === */}
      <g>
        {/* 5-peak crown silhouette */}
        <path
          d="M 66 40
             L 75 22
             L 82 38
             L 92 16
             L 100 32
             L 108 16
             L 118 38
             L 125 22
             L 134 40
             L 136 50
             L 64 50 Z"
          fill={`url(#crown-${uid})`}
          stroke={crownDeep}
          strokeWidth="0.8"
        />
        {/* Crown base band */}
        <rect x="64" y="50" width="72" height="6.5" rx="1" fill={crownGold} stroke={crownDeep} strokeWidth="0.6" />
        {/* Subtle band pattern */}
        <circle cx="76"  cy="53" r="1.4" fill={crownDeep} opacity="0.7" />
        <circle cx="100" cy="53" r="1.6" fill={crownDeep} opacity="0.7" />
        <circle cx="124" cy="53" r="1.4" fill={crownDeep} opacity="0.7" />
        {/* Jewels on peaks */}
        <circle cx="75"  cy="22" r="2.6" fill={jewelRed} />
        <circle cx="92"  cy="16" r="3"   fill={jewelRed} />
        <circle cx="100" cy="32" r="3.6" fill={jewelBlue} />
        <circle cx="108" cy="16" r="3"   fill={jewelRed} />
        <circle cx="125" cy="22" r="2.6" fill={jewelRed} />
        {/* Jewel highlights */}
        <circle cx="74" cy="21" r="0.8" fill="#fff" opacity="0.8" />
        <circle cx="91" cy="15" r="0.9" fill="#fff" opacity="0.8" />
        <circle cx="99" cy="30" r="1.1" fill="#fff" opacity="0.8" />
        <circle cx="107" cy="15" r="0.9" fill="#fff" opacity="0.8" />
        <circle cx="124" cy="21" r="0.8" fill="#fff" opacity="0.8" />
        {/* Crown gloss highlight */}
        <ellipse cx="100" cy="42" rx="22" ry="2" fill="#FFF4D6" opacity="0.55" />
      </g>

      {/* === Eyebrows === */}
      <path d="M 73 89 Q 82 86 91 89" fill="none" stroke={hairDeep} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M 109 89 Q 118 86 127 89" fill="none" stroke={hairDeep} strokeWidth="1.4" strokeLinecap="round" />

      {/* === Eyes — manga style with highlights === */}
      {happy ? (
        <>
          {/* Closed-happy eyes (smile arcs) */}
          <path d="M 73 102 Q 82 96 91 102" fill="none" stroke={eyeDeep} strokeWidth="2.8" strokeLinecap="round" />
          <path d="M 109 102 Q 118 96 127 102" fill="none" stroke={eyeDeep} strokeWidth="2.8" strokeLinecap="round" />
          {/* Sparkle dots */}
          <circle cx="68" cy="98" r="1.3" fill={crownGold} opacity="0.85" />
          <circle cx="132" cy="98" r="1.3" fill={crownGold} opacity="0.85" />
        </>
      ) : (
        <>
          {/* Open eyes - large oval with multi-tone irises */}
          <g>
            {/* Eye whites */}
            <ellipse cx="82" cy="104" rx="6.5" ry="8" fill="#FCFAFF" />
            <ellipse cx="118" cy="104" rx="6.5" ry="8" fill="#FCFAFF" />
            {/* Outer iris (darker) */}
            <ellipse cx="82" cy="105" rx="5.5" ry="7" fill={eyeDeep} />
            <ellipse cx="118" cy="105" rx="5.5" ry="7" fill={eyeDeep} />
            {/* Inner iris (lighter) */}
            <ellipse cx="82" cy="106" rx="3.5" ry="5" fill={eyeMid} />
            <ellipse cx="118" cy="106" rx="3.5" ry="5" fill={eyeMid} />
            {/* Pupil */}
            <ellipse cx="82" cy="106" rx="1.8" ry="3" fill="#1A0F3D" />
            <ellipse cx="118" cy="106" rx="1.8" ry="3" fill="#1A0F3D" />
            {/* Main highlight */}
            <ellipse cx="83.5" cy="101" rx="1.8" ry="2.4" fill="#fff" />
            <ellipse cx="119.5" cy="101" rx="1.8" ry="2.4" fill="#fff" />
            {/* Small highlight */}
            <circle cx="80" cy="108" r="0.9" fill="#fff" opacity="0.85" />
            <circle cx="116" cy="108" r="0.9" fill="#fff" opacity="0.85" />
          </g>
          {/* Upper eyelash line */}
          <path d="M 75 97 Q 82 94 89 98" fill="none" stroke={eyeDeep} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M 111 98 Q 118 94 125 97" fill="none" stroke={eyeDeep} strokeWidth="1.8" strokeLinecap="round" />
          {/* Outer lash flick */}
          <path d="M 89 98 L 93 96" stroke={eyeDeep} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 111 98 L 107 96" stroke={eyeDeep} strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}

      {/* === Cheek blush === */}
      <ellipse cx="71" cy="121" rx="7" ry="4.2" fill={blush} opacity="0.55" />
      <ellipse cx="129" cy="121" rx="7" ry="4.2" fill={blush} opacity="0.55" />

      {/* === Nose — tiny dot === */}
      <ellipse cx="100" cy="118" rx="1.2" ry="0.8" fill={skinShade} opacity="0.7" />

      {/* === Lips === */}
      {happy ? (
        <>
          <path d="M 92 132 Q 100 140 108 132 Q 100 135 92 132 Z" fill={lips} />
          <path d="M 92 132 Q 100 136 108 132" fill="none" stroke={lips} strokeWidth="0.6" />
        </>
      ) : worried ? (
        <path d="M 94 134 Q 100 131 106 134" fill="none" stroke={lips} strokeWidth="2.2" strokeLinecap="round" />
      ) : (
        <path d="M 95 133 Q 100 135 105 133" fill="none" stroke={lips} strokeWidth="2" strokeLinecap="round" />
      )}

      {/* === Neck === */}
      <rect x="92" y="152" width="16" height="18" fill={skin} />
      <path d="M 92 165 Q 100 168 108 165" fill="none" stroke={skinShade} strokeWidth="0.8" opacity="0.6" />

      {/* === Royal dress collar === */}
      <path
        d="M 72 180
           Q 86 168 100 172
           Q 114 168 128 180
           L 134 210
           L 66 210 Z"
        fill={`url(#dress-${uid})`}
      />
      {/* Gold trim on collar */}
      <path
        d="M 72 180 Q 86 168 100 172 Q 114 168 128 180"
        fill="none"
        stroke={crownGold}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* Center medallion */}
      <circle cx="100" cy="184" r="3.2" fill={jewelRed} />
      <circle cx="100" cy="184" r="1.2" fill="#fff" opacity="0.7" />
      {/* Side gold dots on dress */}
      <circle cx="82" cy="194" r="1.5" fill={crownGold} />
      <circle cx="118" cy="194" r="1.5" fill={crownGold} />

      {/* Decorative sparkles around */}
      {happy && (
        <>
          <path d="M 158 70 L 161 64 L 164 70 L 161 76 Z" fill={crownGold} opacity="0.85" />
          <path d="M 36 76 L 39 70 L 42 76 L 39 82 Z" fill={blush} opacity="0.85" />
          <circle cx="170" cy="135" r="1.5" fill={crownGold} opacity="0.7" />
          <circle cx="30" cy="140" r="1.5" fill={hairLight} opacity="0.85" />
        </>
      )}
    </svg>
  );
}

// ======================== PRINCESS COMMENTARY ========================
// Card hiển thị công chúa Vali + nhận xét động dựa trên data thẩm định.
// Props: stats = { e:{done,over,todo,rate}, d:{done,total,rate}, overdue, soon, mismatched }
export function PrincessCommentary({ stats }) {
  const { e, d, overdue, soon, mismatched } = stats || {};
  const erate = e?.rate ?? 0;
  const eOver = e?.over ?? 0;
  const eTodo = e?.todo ?? 0;
  const oCount = typeof overdue === "number" ? overdue : (overdue?.length ?? 0);
  const sCount = typeof soon === "number" ? soon : (soon?.length ?? 0);
  const mCount = typeof mismatched === "number" ? mismatched : (mismatched?.length ?? 0);

  // Mood của công chúa
  const mood =
    oCount === 0 && erate >= 70 ? "happy"
    : oCount >= 3 || erate < 30 ? "worried"
    : "happy";

  // Greeting theo giờ trong ngày
  const h = new Date().getHours();
  let greeting = "Xin chào!";
  if (h >= 5 && h < 11) greeting = "Chào buổi sáng!";
  else if (h >= 11 && h < 13) greeting = "Chúc bữa trưa ngon miệng!";
  else if (h >= 13 && h < 17) greeting = "Chào buổi chiều!";
  else if (h >= 17 && h < 22) greeting = "Chào buổi tối!";
  else greeting = "Khuya rồi nhỉ?";

  // Build danh sách nhận xét theo data
  const remarks = [];
  if (oCount === 0) {
    remarks.push({ tone: "success", text: "Chưa có hồ sơ quá hạn — tuyệt vời!" });
  } else {
    remarks.push({
      tone: "danger",
      text: `Có ${oCount} hồ sơ quá hạn cần xử lý ngay.`,
    });
  }
  if (sCount > 0) {
    remarks.push({
      tone: "warning",
      text: `${sCount} hồ sơ tới hạn trong 30 ngày, hãy chú ý nhé.`,
    });
  }
  if (erate >= 80) {
    remarks.push({ tone: "success", text: `Tiến độ ${erate}% — xuất sắc, tiếp tục duy trì!` });
  } else if (erate >= 50) {
    remarks.push({ tone: "info", text: `Tiến độ ${erate}% — đang trên đà tốt, cố lên nhé.` });
  } else if (eTodo > 0) {
    remarks.push({
      tone: "warning",
      text: `Còn ${eTodo} hồ sơ chưa hoàn tất, cần đẩy nhanh tiến độ.`,
    });
  }
  if (mCount > 0) {
    remarks.push({
      tone: "info",
      text: `${mCount} hồ sơ lệch pha — cần kiểm tra đồng bộ.`,
    });
  }

  // Closing nudge — tách riêng để có cảm giác kết
  const closing =
    erate >= 80 ? "Hãy giữ phong độ này nhé! ✨"
    : oCount > 0 ? "Mình cùng giải quyết quá hạn trước nhé."
    : "Hãy tiếp tục duy trì tiến độ nhé!";

  // Token màu cho từng tone
  const toneColor = {
    success: { c: "#1B6A3F", bg: "#E5F6EC", icon: "✓" },
    danger:  { c: "#9F1F2E", bg: "#FCE6E9", icon: "!" },
    warning: { c: "#8A5A12", bg: "#FCEFD9", icon: "⏱" },
    info:    { c: "#3D2870", bg: "#EDE6F8", icon: "i" },
  };

  return (
    <div
      style={{
        position: "relative",
        background:
          "radial-gradient(280px 220px at 100% 0%, #F9E8F0, transparent 60%), linear-gradient(135deg, #FCF5FA 0%, #F6EEFB 100%)",
        borderRadius: 22,
        padding: "22px 22px 22px 24px",
        border: "1px solid #F0E5EE",
        boxShadow: "0 4px 14px rgba(148, 89, 156, 0.07)",
        overflow: "hidden",
        display: "flex",
        gap: 14,
        alignItems: "stretch",
        minHeight: 240,
      }}
    >
      {/* LEFT — Speech bubble content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={{
            fontFamily: TEXT,
            fontSize: 18,
            fontWeight: 800,
            color: "#5A2F6E",
            letterSpacing: "-0.005em",
          }}>
            Công chúa Vali
          </div>
          <div style={{
            fontSize: 12,
            color: "#8B6FA0",
            fontWeight: 600,
            marginTop: 2,
          }}>
            Trợ lý V/Q · Báo cáo nhanh
          </div>
        </div>

        {/* Greeting bubble */}
        <div style={{
          fontSize: 13.5,
          color: "#3D2552",
          fontWeight: 600,
          lineHeight: 1.55,
        }}>
          {greeting} Mình đã xem tình hình thẩm định hôm nay rồi đó.
        </div>

        {/* Remarks list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
          {remarks.map((r, i) => {
            const t = toneColor[r.tone] || toneColor.info;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 9,
                  alignItems: "flex-start",
                  fontSize: 12.5,
                  color: "#2E1B45",
                  lineHeight: 1.5,
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    background: t.bg,
                    color: t.c,
                    fontSize: 11,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 1,
                  }}
                >
                  {t.icon}
                </span>
                <span style={{ flex: 1 }}>{r.text}</span>
              </div>
            );
          })}
        </div>

        {/* Closing */}
        <div style={{
          marginTop: "auto",
          fontSize: 12.5,
          color: "#5A2F6E",
          fontWeight: 700,
          fontStyle: "italic",
        }}>
          {closing}
        </div>
      </div>

      {/* RIGHT — Mascot */}
      <div style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}>
        <Mascot mood={mood} size={150} />
      </div>
    </div>
  );
}


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
          // S3-2: lát có value>0 luôn hiển thị tối thiểu ~2px (không "biến mất")
          const seg = s.value > 0 ? Math.max(len - 3, 2) : 0;
          const node = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={s.color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${seg} ${circ - seg}`}
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
export function SyncBanner({ conn, lastSync, dataUpdatedAt }) {
  // S2-5/S3-5: cảnh báo dữ liệu CŨ theo TUỔI DỮ LIỆU (updated_at), không phải giờ fetch.
  const ageMs = dataUpdatedAt ? (Date.now() - new Date(dataUpdatedAt).getTime()) : null;
  const stale = ageMs != null && ageMs > 6 * 3600 * 1000;
  if (conn.status === "ok" && lastSync && !stale) return null;
  const isErr = conn.status === "err";
  const isStaleOnly = conn.status === "ok" && stale;
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
         isStaleOnly ? `Dữ liệu có thể đã CŨ (cập nhật ~${Math.round(ageMs / 3600000)} giờ trước) — kiểm tra đồng bộ Sheet→DB (WF-01).` :
         "Dữ liệu chưa đồng bộ. Bấm Làm mới để tải."}
      </span>
      {dataUpdatedAt ? (
        <span style={{ marginLeft: "auto", fontWeight: 600, opacity: 0.8 }}>
          Cập nhật dữ liệu: {new Date(dataUpdatedAt).toLocaleString("vi-VN")}
        </span>
      ) : lastSync && (
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

// ======================== STATE BADGE (item_state nghiệp vụ) ========================
// S3-G FIX: hiển thị item_state (not_applicable / cancelled) rõ ràng để user
// không nhập tiến độ cho mã đã hủy. Trả về null nếu state='active'.
export function StateBadge({ state, small }) {
  if (!state || state === "active") return null;
  const m = state === "not_applicable"
    ? { label: "Không áp dụng", text: "#6B4DB3", bg: "#EDE5FA" }
    : state === "cancelled"
    ? { label: "Đã hủy", text: "#9A6A00", bg: "#FFF1C4" }
    : null;
  if (!m) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: small ? "3px 9px" : "5px 12px", borderRadius: 999,
      fontSize: small ? 11 : 12, fontWeight: 800,
      color: m.text, background: m.bg, fontFamily: TEXT, whiteSpace: "nowrap",
      border: `1px dashed ${m.text}`,
    }}>
      ⊘ {m.label}
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
  const isEmpty = value === null || value === undefined
    || String(value).trim() === "" || String(value).trim() === "—";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: C.plumSoft }}>{label}</span>
      <div style={{
        padding: "11px 13px", borderRadius: 12,
        border: `1.5px solid ${C.lavSoft}`, background: C.lavSoft,
        fontFamily: TEXT, fontSize: 14, color: C.plumSoft, fontWeight: 600,
        display: "flex", alignItems: "center", minHeight: 20,
        ...(isEmpty ? { fontStyle: "italic", opacity: 0.7 } : null),
      }}>
        {isEmpty ? "Không có thông tin" : value}
      </div>
    </div>
  );
}

// ======================== BRAND LOGO ========================
// Brand mark CPC1 HN logo + V/Q team wordmark (cách điệu mạnh mẽ, dứt khoát).
// Giữ tên export "CrownLogo" để không cần đổi import nơi khác.
const VQ_NAVY = "#1E3A8A";
const VQ_RED  = "#E63946";
const VQ_GOLD = "#D4AF6A";

// Vương miện line-art tối giản — sang trọng, "The Guardian Princess".
// Không phải hoạt hình; chỉ là dấu hiệu thương hiệu nhẹ nhàng.
export function CrownLineArt({ size = 56, color = "#fff", opacity = 0.92, strokeWidth = 1.4 }) {
  return (
    <svg
      width={size}
      height={size * 0.72}
      viewBox="0 0 64 46"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity, display: "block" }}
      aria-hidden="true"
    >
      {/* Crown silhouette: 5 đỉnh đối xứng */}
      <path d="M6 32 L12 10 L20 22 L26 6 L32 16 L38 6 L44 22 L52 10 L58 32 Z" />
      {/* Base bar */}
      <path d="M6 32 L58 32 L56 40 L8 40 Z" />
      {/* 3 jewels ở các đỉnh chính */}
      <circle cx="12" cy="10" r="1.6" fill={color} stroke="none" />
      <circle cx="26" cy="6"  r="1.8" fill={color} stroke="none" />
      <circle cx="38" cy="6"  r="1.8" fill={color} stroke="none" />
      <circle cx="52" cy="10" r="1.6" fill={color} stroke="none" />
      {/* Center jewel */}
      <circle cx="32" cy="16" r="2.2" fill={color} stroke="none" opacity="0.85" />
      {/* Decorative dots trên base */}
      <circle cx="18" cy="36" r="1" fill={color} stroke="none" opacity="0.7" />
      <circle cx="32" cy="36" r="1.2" fill={color} stroke="none" opacity="0.85" />
      <circle cx="46" cy="36" r="1" fill={color} stroke="none" opacity="0.7" />
    </svg>
  );
}

// Watermark pattern dùng làm nền — vương miện + ngôi sao + lục giác.
// Opacity rất thấp (0.04–0.06) để tạo chiều sâu, không phá layout.
export function BrandWatermark({ color = "#fff", opacity = 0.05 }) {
  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity,
      }}
      aria-hidden="true"
    >
      <defs>
        <pattern id="vq-watermark" x="0" y="0" width="140" height="140" patternUnits="userSpaceOnUse">
          {/* Crown */}
          <g transform="translate(18, 24)" fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round">
            <path d="M0 18 L4 4 L10 12 L16 0 L22 12 L28 4 L32 18 Z" />
            <path d="M0 18 L32 18 L30 24 L2 24 Z" />
          </g>
          {/* Star sparkle */}
          <g transform="translate(96, 60)" fill={color}>
            <path d="M0 -9 L2.2 -2.5 L9 0 L2.2 2.5 L0 9 L-2.2 2.5 L-9 0 L-2.2 -2.5 Z" />
          </g>
          {/* Hexagon */}
          <g transform="translate(40, 96)" fill="none" stroke={color} strokeWidth="1.1">
            <polygon points="11,0 19.5,5.5 19.5,16.5 11,22 2.5,16.5 2.5,5.5" />
          </g>
          {/* Small star */}
          <g transform="translate(108, 110)" fill={color}>
            <path d="M0 -5 L1.3 -1.5 L5 0 L1.3 1.5 L0 5 L-1.3 1.5 L-5 0 L-1.3 -1.5 Z" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#vq-watermark)" />
    </svg>
  );
}

// Guardian silhouette — bóng người bảo hộ chất lượng có vương miện.
// Dùng FILLED shape (không phải line-art) để vẫn đọc được ở 4-6% opacity.
// Crop ở phần dưới — gợi ý là bức tranh lớn hơn khung nhìn.
export function GuardianSilhouette({
  color = "#FFFFFF",
  opacity = 0.055,
  width = 360,
  style = {},
}) {
  return (
    <svg
      viewBox="0 0 300 380"
      width={width}
      height={width * (380 / 300)}
      style={{
        opacity,
        pointerEvents: "none",
        display: "block",
        ...style,
      }}
      aria-hidden="true"
    >
      <g fill={color}>
        {/* Crown — 5 peaks regal */}
        <path d="M 108 58 L 124 22 L 138 60 L 150 8 L 162 60 L 176 22 L 192 58 L 196 76 L 104 76 Z" />
        <rect x="104" y="76" width="92" height="10" rx="1" />
        {/* Jewel orb on top center */}
        <circle cx="150" cy="6" r="4" />
        {/* Crown band detail */}
        <rect x="104" y="90" width="92" height="3" opacity="0.7" />
        {/* Head — oval */}
        <ellipse cx="150" cy="135" rx="38" ry="48" />
        {/* Neck */}
        <rect x="140" y="180" width="20" height="16" />
        {/* Royal collar / shoulders — wide regal silhouette */}
        <path d="
          M 60 240
          Q 75 210, 110 200
          Q 130 196, 140 196
          L 160 196
          Q 170 196, 190 200
          Q 225 210, 240 240
          L 244 280
          Q 240 320, 232 360
          L 68 360
          Q 60 320, 56 280
          Z
        " />
        {/* Cape extending below — softer */}
        <path
          d="M 56 280 Q 36 340, 24 380 L 276 380 Q 264 340, 244 280 Z"
          opacity="0.6"
        />
        {/* Subtle medallion center */}
        <circle cx="150" cy="240" r="3.5" opacity="0.5" />
      </g>
    </svg>
  );
}


export function VQWordmark({ size = 22, navy = VQ_NAVY, red = VQ_RED, teamColor }) {
  // size = chiều cao chữ V/Q (px). "team" sẽ scale theo.
  const teamSize = Math.round(size * 0.42);
  const teamClr = teamColor || navy;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 0,
        fontFamily: "'Poppins', system-ui, sans-serif",
        userSelect: "none",
        lineHeight: 1,
      }}
    >
      <span
        style={{
          fontSize: size,
          fontWeight: 800,
          color: navy,
          letterSpacing: "-0.04em",
        }}
      >
        V
      </span>
      <span
        aria-hidden="true"
        style={{
          fontSize: size * 1.22,
          fontWeight: 800,
          color: red,
          display: "inline-block",
          transform: "skewX(-18deg) translateY(2px)",
          margin: `0 ${Math.round(size * 0.02)}px`,
        }}
      >
        /
      </span>
      <span
        style={{
          fontSize: size,
          fontWeight: 800,
          color: navy,
          letterSpacing: "-0.04em",
        }}
      >
        Q
      </span>
      <span
        style={{
          fontSize: teamSize,
          fontWeight: 600,
          color: teamClr,
          marginLeft: Math.round(size * 0.32),
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          opacity: 0.82,
        }}
      >
        team
      </span>
    </div>
  );
}

export function CrownLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
      <div
        style={{
          height: 40,
          padding: "4px 8px",
          borderRadius: 12,
          background: "#fff",
          border: `1px solid ${C.pinkSoft}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 6px rgba(30,58,138,.08)",
        }}
      >
        <img
          src="./logo-cpc1hn.png"
          alt="CPC1 HN"
          style={{ height: 30, width: "auto", display: "block" }}
        />
      </div>
      <div>
        <VQWordmark size={18} />
        <div style={{ fontSize: 10, color: C.plumSoft, fontWeight: 600, marginTop: 2 }}>
          CPC1 HN · QLCL
        </div>
      </div>
    </div>
  );
}
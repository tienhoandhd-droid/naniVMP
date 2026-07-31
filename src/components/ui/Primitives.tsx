/* =====================================================================
 *  components/ui/Primitives.jsx — Shared UI Components
 *  Card, Tag, Modal, Donut, KpiCard, Sparkle, Skeleton, etc.
 * ===================================================================== */
import { useId, useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { C, TEXT, NUM, MO, cardDefault, cardStrong, cardSoft } from "../../constants/theme.ts";
import { STATUS } from "../../constants/vmp.ts";
import { XCircle } from "lucide-react";

// ======================== SPARKLE ========================
export function Sparkle({ size = 18, color = C.gold, style }: {
  size?: number; color?: string; style?: CSSProperties;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      <path d="M12 0 C13 7 17 11 24 12 C17 13 13 17 12 24 C11 17 7 13 0 12 C7 11 11 7 12 0 Z" fill={color} />
    </svg>
  );
}

// ======================== MASCOT (refined) ========================
// Công chúa Vali — phiên bản tinh tế hơn. Dùng gradient, manga eyes, crown có jewels.
// Vẫn là SVG (không phải anime PNG), nhưng đẹp hơn cartoon cũ đáng kể.
export function Mascot({ mood = "happy", size = 140 }: { mood?: string; size?: number }) {
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
/** Số liệu tổng hợp mà PrincessCommentary cần để chọn lời nhận xét. */
export interface CommentaryStats {
  /** Hạng mục: done/over/todo/rate. */
  e?: { done?: number; over?: number; todo?: number; rate?: number };
  /** Hồ sơ: done/total/rate. */
  d?: { done?: number; total?: number; rate?: number };
  /** Nhận cả số đếm sẵn lẫn mảng — tuỳ nơi gọi. */
  overdue?: number | unknown[];
  soon?: number | unknown[];
  mismatched?: number | unknown[];
}

export function PrincessCommentary({ stats }: { stats?: CommentaryStats }) {
  const { e, overdue, soon, mismatched } = stats || {};
  const erate = e?.rate ?? 0;
  const eTodo = e?.todo ?? 0;
  const oCount = typeof overdue === "number" ? overdue : (overdue?.length ?? 0);
  const sCount = typeof soon === "number" ? soon : (soon?.length ?? 0);
  const mCount = typeof mismatched === "number" ? mismatched : (mismatched?.length ?? 0);

  // Mood của công chúa
  const mood =
    oCount === 0 && erate >= 70 ? "happy"
    : oCount >= 3 || erate < 30 ? "worried"
    : "happy";

  /* Lời chào theo giờ. Ở chế độ thanh tra thì thay bằng một câu nêu phạm vi
     — vẫn có một dòng mở đầu, chỉ là không hỏi thăm giờ giấc của người đọc. */
  const thanhTra = laThanhTra();
  const h = new Date().getHours();
  let greeting = "Xin chào!";
  if (thanhTra) greeting = "Tổng hợp tình hình thẩm định";
  else if (h >= 5 && h < 11) greeting = "Chào buổi sáng!";
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
            {thanhTra ? "Trợ lý phân tích" : "Công chúa Vali"}
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
            const t = (toneColor as Record<string, { c: string; bg: string; icon: string }>)[r.tone]
                      || toneColor.info;
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


/**
 * Khung bảng rộng: cuộn cả hai chiều trong vùng cao cố định, kéo-thả bằng
 * chuột để không phải với tới thanh cuộn.
 *
 * Vì sao cần: bảng danh mục có ~19 cột và hàng trăm dòng. Nếu để trang tự
 * cuộn thì thanh cuộn ngang nằm tận đáy trang — xem tới dòng ở giữa là
 * không kéo ngang được nữa.
 */
export function TableScroll({ children, maxHeight = "68vh", hint = true }: {
  children?: ReactNode;
  maxHeight?: number | string;
  /** Hiện dòng gợi ý cách cuộn ngang. Tắt khi bảng chắc chắn không tràn. */
  hint?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [canPan, setCanPan] = useState(false);
  const [panning, setPanning] = useState(false);
  const drag = useRef({ x: 0, left: 0 });

  // Chỉ bật kéo-thả khi nội dung thật sự tràn ngang
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setCanPan(el.scrollWidth > el.clientWidth + 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const onDown = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || !canPan) return;
    // Bỏ qua khi bấm vào nút / ô nhập — để không cướp thao tác bấm
    const tag = (e.target as HTMLElement).closest("button, input, select, a");
    if (tag) return;
    setPanning(true);
    drag.current = { x: e.clientX, left: el.scrollLeft };
  };
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || !panning) return;
    el.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
  };
  const stop = () => setPanning(false);

  // Giữ Shift + lăn chuột = cuộn ngang (thói quen quen thuộc trên bảng rộng)
  const onWheel = (e: React.WheelEvent) => {
    const el = ref.current;
    if (!el || !e.shiftKey) return;
    el.scrollLeft += e.deltaY;
  };

  return (
    <>
      <div
        ref={ref}
        className={`vmp-table-wrap vmp-scroll ${canPan ? "can-pan" : ""} ${panning ? "is-panning" : ""}`}
        style={{ maxHeight }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={stop}
        onMouseLeave={stop}
        onWheel={onWheel}
      >
        {children}
      </div>
      {hint && canPan && (
        <div className="vmp-table-hint">
          ↔ Bảng rộng hơn màn hình — kéo thả bằng chuột, hoặc giữ <b>Shift</b> và lăn chuột để xem các cột bên phải.
          Cột đầu và hàng tiêu đề luôn được ghim.
        </div>
      )}
    </>
  );
}

export function Card({ children, style, variant = "default", cls = "" }: {
  children?: ReactNode; style?: CSSProperties; variant?: string; cls?: string;
}) {
  const base = variant === "strong" ? cardStrong : variant === "soft" ? cardSoft : cardDefault;
  // vmp-lift-3d: nghiêng rất nhẹ theo con trỏ + bóng hai tầng. Chỉ áp cho THẺ,
  // không áp cho ô số liệu — chữ số bị xô lệch là đọc sai, mà đây là màn để
  // đọc hạn thẩm định. Lớp này tự tắt khi người dùng bật "giảm chuyển động".
  return (
    <div className={`card fade vmp-lift-3d ${cls}`} style={{ ...base, padding: 24, ...style }}>
      {children}
    </div>
  );
}

/* ======================== CÂU KẾT LUẬN CỦA BIỂU ĐỒ ========================
 * Khác biệt giữa biểu đồ KHÁM PHÁ và biểu đồ THUYẾT MINH nằm ở đúng khối
 * này: biểu đồ khám phá bày số ra để người xem tự mò; biểu đồ thuyết minh
 * nói thẳng điều nó phát hiện, rồi mới đưa hình ra làm bằng chứng.
 *
 * Ba quy ước cố định, để mọi biểu đồ trong app nói cùng một giọng:
 *  · Đặt TRÊN hình, không phải dưới — đọc kết luận trước, nhìn hình sau
 *  · Câu chính là một MỆNH ĐỀ có số, không phải nhãn chủ đề
 *    ("Xưởng sản xuất tháng 8 dồn gấp đôi" ≠ "Tải việc theo tháng")
 *  · Câu phụ nói ĐIỀU NÊN LÀM hoặc vì sao con số đó đáng tin
 *
 * Sắc thái chỉ có ba: 'over' (cần hành động), 'warn' (đáng để ý),
 * 'ok' (không phải làm gì). Màu ở đây là TRẠNG THÁI, không phải nhận dạng —
 * không dùng để phân biệt chuỗi dữ liệu.
 */
export function CauKetLuan({ chinh, phu, tone = "ok" }: {
  chinh: ReactNode;
  phu?: ReactNode;
  tone?: "ok" | "warn" | "over";
}) {
  if (!chinh) return null;
  return (
    <p className={`vmp-ketluan vmp-ketluan--${tone}`}>
      <b>{chinh}</b>
      {phu ? <span>{phu}</span> : null}
    </p>
  );
}

export function CardTitle({ icon: Icon, children, sub, right }: {
  icon?: LucideIcon;
  children?: ReactNode;
  sub?: ReactNode;
  /** Nội dung phụ căn phải (chú giải màu, nút nhỏ…). */
  right?: ReactNode;
}) {
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
      {right}
    </div>
  );
}

// ======================== TAG ========================
export function Tag({ color, bg, children, style: extra }: {
  color?: string; bg?: string; children?: ReactNode; style?: CSSProperties;
}) {
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
/* ---------------------------------------------------------------------
 * Portal — BẮT BUỘC cho mọi thứ position:fixed nằm trong nội dung trang.
 *
 * Khung nội dung có class .vmp-view-enter chạy hoạt ảnh vào bằng
 * transform. Một phần tử tổ tiên có transform thì position:fixed KHÔNG
 * còn neo theo màn hình nữa mà neo theo phần tử đó — hộp thoại bị đẩy
 * xuống giữa CHIỀU CAO CẢ TRANG (đo được 12.385px trên trang cảnh báo),
 * người dùng chỉ thấy lớp phủ mờ mà không thấy hộp.
 *
 * Đưa ra thẳng document.body là hết, vì body không có transform.
 * ------------------------------------------------------------------- */
export function Portal({ children }: { children?: ReactNode }) {
  if (typeof document === "undefined") return <>{children}</>;   // render phía server
  return createPortal(children, document.body);
}

export function Modal({ onClose, title, icon: Icon = XCircle, children, wide }: {
  onClose: () => void; title?: ReactNode; icon?: LucideIcon;
  children?: ReactNode; wide?: boolean;
}) {
  return (
    <Portal>
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
    </Portal>
  );
}

// ======================== DONUT ========================
export function Donut({ segments, size = 152, stroke = 18 }: {
  segments: Array<{ value: number; color: string; label?: string }>;
  size?: number; stroke?: number;
}) {
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
export function KpiCard({ emoji, bg, color, value, label, sub, subColor }: {
  emoji?: ReactNode; bg?: string; color?: string; value?: ReactNode;
  label?: ReactNode; sub?: ReactNode; subColor?: string;
}) {
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


/* =====================================================================
 * Ô SỐ LIỆU BENTO
 *
 * Khác KpiCard cũ ở ba điểm, đều có lý do:
 *   · con số căn trái chứ không căn giữa — mắt quét cột số nhanh hơn khi
 *     chúng thẳng hàng bên trái
 *   · dải màu mảnh bên trái thay cho khối tròn màu to — phân loại được
 *     bằng mắt mà không át con số
 *   · có chỗ cho một dải cột nhỏ, để ô vừa nói "bao nhiêu" vừa nói
 *     "đang đi hướng nào"
 * =================================================================== */
export function StatTile({ icon: Icon, value, label, sub, tone, bars, onClick, cls = "" }: {
  icon?: LucideIcon;
  value?: ReactNode;
  label?: ReactNode;
  sub?: ReactNode;
  /** Màu nhấn — dùng cho dải bên trái, biểu tượng và con số. */
  tone?: { c: string; bg: string };
  /** Dải cột nhỏ 0..1, vd tỷ lệ hoàn thành từng tháng. */
  bars?: number[];
  onClick?: () => void;
  cls?: string;
}) {
  const t = tone || { c: C.plum, bg: C.pinkSoft };
  return (
    <Card cls={`vmp-tile ${onClick ? "vmp-lift" : ""} ${cls}`}
      style={{ padding: "17px 18px", display: "flex", flexDirection: "column",
               justifyContent: "space-between", minHeight: 132,
               ["--tile-accent" as string]: t.c }}>
      <div onClick={onClick} role={onClick ? "button" : undefined}
        style={{ display: "flex", flexDirection: "column", height: "100%",
                 gap: 8, cursor: onClick ? "pointer" : "default" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Icon && (
            <span style={{ width: 26, height: 26, borderRadius: 9, background: t.bg,
                           display: "flex", alignItems: "center", justifyContent: "center",
                           flexShrink: 0 }}>
              <Icon size={14} color={t.c} />
            </span>
          )}
          <span style={{ fontSize: 12.5, fontWeight: 800, color: C.plumSoft,
                         fontFamily: TEXT }}>{label}</span>
        </div>

        <div style={{ fontFamily: NUM, fontSize: 34, fontWeight: 800, color: t.c,
                      lineHeight: 1, letterSpacing: -0.5 }}>{value}</div>

        {bars && bars.length > 0 && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 22,
                        marginTop: "auto" }}>
            {bars.map((b, i) => (
              <div key={i} style={{
                flex: 1, minWidth: 2, borderRadius: 2,
                height: `${Math.max(8, Math.min(1, b) * 100)}%`,
                background: t.c, opacity: 0.3 + Math.min(1, b) * 0.7,
              }} />
            ))}
          </div>
        )}

        {sub && (
          <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 700,
                        fontFamily: TEXT, marginTop: bars ? 0 : "auto" }}>{sub}</div>
        )}
      </div>
    </Card>
  );
}

/* =====================================================================
 * VÒNG TIẾN ĐỘ
 *
 * Thay Donut cũ ở màn Tổng quan. Khác biệt thật: có chỗ đặt nội dung ở
 * giữa (Donut cũ phải chồng absolute từ bên ngoài), đầu nét bo tròn, và
 * vòng nền dùng màu bề mặt chìm nên chạy được cả chế độ tối.
 * =================================================================== */
export function Ring({ segments, size = 168, stroke = 15, children }: {
  segments: Array<{ value: number; color: string }>;
  size?: number; stroke?: number; children?: ReactNode;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ display: "block" }}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={C.surfaceSunk} strokeWidth={stroke} />
          {segments.map((s, i) => {
            const len = (s.value / total) * circ;
            // Lát có giá trị > 0 luôn thấy được ~2px, không "biến mất"
            const seg = s.value > 0 ? Math.max(len - 4, 2) : 0;
            const el = (
              <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={s.color} strokeWidth={stroke} strokeLinecap="round"
                strokeDasharray={`${seg} ${circ - seg}`}
                strokeDashoffset={-acc}
                style={{ transition: `stroke-dasharray 900ms ${MO.ease}` }} />
            );
            acc += len;
            return el;
          })}
        </g>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex",
                    flexDirection: "column", alignItems: "center",
                    justifyContent: "center", textAlign: "center" }}>
        {children}
      </div>
    </div>
  );
}

// ======================== SELECT ========================
export function Sel({ val, set, opts }: {
  val: string;
  set: (v: string) => void;
  /** v = giá trị, l = nhãn hiển thị. */
  opts: Array<{ v: string; l: string }>;
}) {
  return (
    <select value={val} onChange={(e) => set(e.target.value)} style={{
      padding: "8px 13px", borderRadius: 12, border: `1.5px solid ${C.pinkSoft}`,
      background: C.surface, fontFamily: TEXT, fontSize: 13, color: C.plum,
      fontWeight: 700, cursor: "pointer", outline: "none",
    }}>
      {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

// ======================== SKELETON ========================
export function SkeletonPulse({ w = "100%", h = 16, r = 8 }: {
  w?: number | string; h?: number | string; r?: number;
}) {
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
/** Ngưỡng coi dữ liệu là CŨ. WF-04 đồng bộ 5 phút một lần và mỗi lần áp
 *  snapshot đều chạm `updated_at` của toàn bộ hạng mục, nên quá 6 giờ không
 *  nhúc nhích nghĩa là đường Sheet→Supabase đã đứng — không phải "hôm nay ít
 *  việc nên không ai sửa gì". */
export const NGUONG_DU_LIEU_CU_MS = 6 * 3600 * 1000;

/** Tuổi dữ liệu theo `max(updated_at)` trong DB. Trả null khi chưa đọc được
 *  watermark — lúc đó KHÔNG được đoán là dữ liệu tươi. */
export function tuoiDuLieu(dataUpdatedAt?: string | null): { ms: number; gio: number; cu: boolean } | null {
  if (!dataUpdatedAt) return null;
  const moc = new Date(dataUpdatedAt).getTime();
  if (Number.isNaN(moc)) return null;
  const ms = Math.max(0, Date.now() - moc);
  return { ms, gio: Math.round(ms / 3600000), cu: ms > NGUONG_DU_LIEU_CU_MS };
}

export function SyncBanner({ conn, lastSync, dataUpdatedAt }: {
  /** Không dùng index signature để nhận được cả ConnState (status là union). */
  conn: { status?: string; msg?: string };
  lastSync?: number | string | null;
  dataUpdatedAt?: string | null;
}) {
  // S2-5/S3-5: cảnh báo dữ liệu CŨ theo TUỔI DỮ LIỆU (updated_at), không phải giờ fetch.
  const tuoi = tuoiDuLieu(dataUpdatedAt);
  const ageMs = tuoi ? tuoi.ms : null;
  const stale = !!tuoi?.cu;
  const [mo, setMo] = useState(false);
  if (conn.status === "ok" && lastSync && !stale) return null;
  const isErr = conn.status === "err";
  const isStaleOnly = conn.status === "ok" && stale;

  const noiDung = conn.status === "loading" ? "Đang đồng bộ dữ liệu…"
    : isErr ? `Lỗi kết nối: ${conn.msg}`
      : isStaleOnly ? `Dữ liệu có thể đã CŨ — không có thay đổi nào trong ~${Math.round((ageMs || 0) / 3600000)} giờ. Kiểm tra đồng bộ Sheet→Supabase (WF-04).`
        : "Dữ liệu chưa đồng bộ. Bấm Làm mới để tải.";

  /* Dữ liệu CŨ thu thành một dải mảnh bấm được, không phải khối cảnh báo
     chiếm nguyên một hàng trên MỌI màn hình. Lý do: tình trạng này kéo dài
     nhiều ngày liền, mà một cảnh báo hiện liên tục nhiều ngày thì người ta
     thôi không đọc nữa — vừa mất chỗ vừa mất tác dụng.
     LỖI KẾT NỐI thì vẫn bung hết: đó là chuyện phải xử ngay. */
  const thuGon = isStaleOnly && !mo;
  if (thuGon) {
    return (
      <button type="button" onClick={() => setMo(true)}
        title={noiDung}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 12,
          padding: "5px 12px", borderRadius: 999, cursor: "pointer",
          background: C.marigoldSoft, border: `1px solid ${C.marigold}`,
          color: C.marigoldText, fontFamily: TEXT, fontSize: 11.5, fontWeight: 800,
        }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: C.marigold, flex: "none" }} />
        Dữ liệu cũ ~{Math.round((ageMs || 0) / 3600000)}h — bấm để xem
      </button>
    );
  }

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
      <span>{noiDung}</span>
      {dataUpdatedAt ? (
        <span style={{ marginLeft: "auto", fontWeight: 600, opacity: 0.8 }}>
          Cập nhật dữ liệu: {new Date(dataUpdatedAt).toLocaleString("vi-VN")}
        </span>
      ) : lastSync && (
        <span style={{ marginLeft: "auto", fontWeight: 600, opacity: 0.8 }}>
          Đồng bộ cuối: {new Date(lastSync).toLocaleTimeString("vi-VN")}
        </span>
      )}
      {isStaleOnly && (
        <button type="button" onClick={() => setMo(false)} aria-label="Thu gọn"
          style={{ border: "none", background: "transparent", cursor: "pointer",
                   color: C.marigoldText, fontWeight: 900, fontSize: 15, lineHeight: 1, padding: "0 2px" }}>
          ×
        </button>
      )}
    </div>
  );
}

/* ======================== CHẾ ĐỘ THANH TRA ========================
 * Một công tắc, ghi ở localStorage, đọc được từ mọi nơi mà không cần
 * context: `document.documentElement[data-thanhtra]`.
 *
 * Vì sao cần: hệ này có thể được cho thanh tra GMP xem. Giọng thân mật
 * ("Khuya rồi nhỉ?"), emoji 😵💪, biệt danh "công chúa Vali" và bảng xếp
 * hạng cá nhân đều là gu riêng của nơi dùng — nhưng trong một buổi thanh
 * tra thì chúng làm người đọc nghi ngờ mức nghiêm túc của cả hệ thống, kể
 * cả khi số liệu hoàn toàn đúng.
 *
 * Cách xử: KHÔNG bỏ phong cách đi. Giữ nguyên ở chế độ thường, và cho bật
 * một chế độ trung tính khi cần. Bật/tắt không đụng tới dữ liệu, chỉ đổi
 * cách trình bày — nên không có chuyện "hai bản số liệu khác nhau".
 */
export function dungThanhTra(): [boolean, (v: boolean) => void] {
  const [bat, setBat] = useState(() => {
    try { return localStorage.getItem("vmp-thanhtra") === "1"; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-thanhtra", bat ? "1" : "0");
    try {
      if (bat) localStorage.setItem("vmp-thanhtra", "1");
      else localStorage.removeItem("vmp-thanhtra");
    } catch { /* localStorage bị chặn thì vẫn chạy, chỉ không nhớ */ }
  }, [bat]);
  return [bat, setBat];
}

/** Đọc trạng thái chế độ thanh tra ở nơi không tiện dùng hook. */
export const laThanhTra = (): boolean =>
  typeof document !== "undefined"
  && document.documentElement.getAttribute("data-thanhtra") === "1";

/** Bỏ emoji khỏi một câu khi đang ở chế độ thanh tra. */
export function chuTrungTinh(t: string): string {
  if (!laThanhTra()) return t;
  return t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").replace(/\s{2,}/g, " ").trim();
}

/* ======================== CHÚ THÍCH ⓘ ========================
 * Một dấu ⓘ đặt NGAY CẠNH con số nó giải thích.
 *
 * Hai vấn đề mà nó xử:
 *  1. Cùng một trang có 461 / 448 / 443 "tổng hạng mục". Mỗi con số có định
 *     nghĩa riêng và đều đúng, nhưng người vận hành không đọc được định
 *     nghĩa đó từ giao diện — nên kết luận duy nhất rút ra được là "web
 *     hiển thị lung tung". Mất niềm tin vào số liệu là mất tất cả.
 *  2. Các câu giải thích luật rất có giá trị nhưng nằm cuối trang, chữ nhỏ.
 *     Người ta cần chúng lúc ĐANG phân vân, không phải sau khi cuộn hết.
 *
 * Dùng <details>/<summary> chứ không phải tooltip hover: bàn phím mở được,
 * điện thoại chạm được, và trình đọc màn hình đọc được nội dung.
 */
export function GiaiThich({ tieuDe, children }: { tieuDe?: string; children: ReactNode }) {
  return (
    <details className="vmp-gt">
      <summary aria-label={tieuDe || "Giải thích con số này"} title={tieuDe || "Giải thích con số này"}>
        <span aria-hidden="true">i</span>
      </summary>
      <div className="vmp-gt-noi">
        {tieuDe && <b>{tieuDe}</b>}
        {children}
      </div>
    </details>
  );
}

/** Định nghĩa các mẫu số hay bị nhầm với nhau — dùng chung mọi trang. */
export const MAU_SO = {
  tatCa: "Mọi hạng mục đang hoạt động, KỂ CẢ hạng mục chưa có mốc đích VMP.",
  coMoc: "Chỉ hạng mục ĐÃ có mốc đích VMP (bất kỳ năm nào).",
  trongNam: "Chỉ hạng mục có mốc đích VMP rơi vào năm đang chọn.",
  quaHanTrangThai: "Đếm theo TRẠNG THÁI TỔNG của hạng mục đang là \"quá hạn\".",
  quaHanMoc: "Đếm hạng mục có ÍT NHẤT MỘT MỐC (đề cương / thẩm định / báo cáo) đã trôi qua, kể cả khi trạng thái tổng chưa đổi. Số này luôn ≥ số đếm theo trạng thái.",
};

/* ======================== PHÂN TRANG ========================
 * Thay nút "Hiện thêm" đơn độc. Nút đó bắt bấm 6–7 lần mới thấy hết danh
 * sách (Cảnh báo 40/268, Cập nhật tiến độ 60/461), không nhảy được tới cuối,
 * không xem được tất cả, và mỗi lần bấm là một lần mất chỗ đang đọc.
 *
 * Ở đây: chọn số dòng mỗi trang (50/100/200/500/tất cả) + nhảy trang. Vẫn
 * giữ cách dựng "cắt danh sách" cũ nên không đụng tới logic lọc/sắp xếp của
 * từng trang — chỉ đổi cách chọn lát cắt.
 */
export const CO_TRANG = [50, 100, 200, 500];

export function PhanTrang({ tong, trang, setTrang, coTrang, setCoTrang, donVi = "dòng" }: {
  tong: number;
  /** Trang hiện tại, đếm từ 0. */
  trang: number;
  setTrang: (n: number) => void;
  /** Số dòng mỗi trang; 0 = hiện tất cả. */
  coTrang: number;
  setCoTrang: (n: number) => void;
  donVi?: string;
}) {
  const soTrang = coTrang > 0 ? Math.max(1, Math.ceil(tong / coTrang)) : 1;
  const tu = coTrang > 0 ? trang * coTrang + 1 : 1;
  const den = coTrang > 0 ? Math.min(tong, (trang + 1) * coTrang) : tong;
  if (!tong) return null;

  const nut = (n: number, nhan: ReactNode, bat = false) => (
    <button key={`${nhan}`} type="button" onClick={() => setTrang(n)} disabled={bat}
      aria-current={n === trang ? "page" : undefined}
      style={{
        minWidth: 32, height: 32, padding: "0 9px", borderRadius: 9, cursor: bat ? "default" : "pointer",
        border: `1px solid ${n === trang ? C.pinkText : C.line}`,
        background: n === trang ? C.pinkMist : C.surface,
        color: bat ? C.plumSoft : n === trang ? C.pinkText : C.plum,
        fontFamily: NUM, fontSize: 12.5, fontWeight: 800, opacity: bat ? 0.45 : 1,
      }}>
      {nhan}
    </button>
  );

  // Cửa sổ trang quanh trang hiện tại — 20 trang mà in hết thì lại thành một
  // hàng số dài không ai đọc.
  const cua: number[] = [];
  const dau = Math.max(0, Math.min(trang - 2, soTrang - 5));
  for (let i = dau; i < Math.min(soTrang, dau + 5); i += 1) cua.push(i);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      padding: "12px 4px", fontFamily: TEXT,
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.plumSoft }}>
        Đang xem <b style={{ color: C.plum, fontFamily: NUM }}>{tu}–{den}</b> / {tong} {donVi}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.plumSoft }}>Mỗi trang</span>
        <select value={String(coTrang)} onChange={(e) => { setCoTrang(Number(e.target.value)); setTrang(0); }}
          aria-label="Số dòng mỗi trang"
          style={{ padding: "6px 9px", borderRadius: 9, border: `1px solid ${C.line}`,
                   background: C.surface, color: C.plum, fontFamily: TEXT, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          {CO_TRANG.map((n) => <option key={n} value={n}>{n}</option>)}
          <option value={0}>Tất cả</option>
        </select>
      </div>

      {coTrang > 0 && soTrang > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {nut(0, "«", trang === 0)}
          {nut(Math.max(0, trang - 1), "‹", trang === 0)}
          {cua.map((i) => nut(i, i + 1))}
          {nut(Math.min(soTrang - 1, trang + 1), "›", trang >= soTrang - 1)}
          {nut(soTrang - 1, "»", trang >= soTrang - 1)}
        </div>
      )}
    </div>
  );
}

// ======================== PILL (status badge) ========================
export function Pill({ s, small }: { s: string; small?: boolean }) {
  const m = (STATUS as Record<string, typeof STATUS.plan>)[s] || STATUS.plan;
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
export function StateBadge({ state, small }: { state?: string; small?: boolean }) {
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
export function ChartTip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: ReactNode;
}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: C.surface, padding: "10px 14px", borderRadius: 14,
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
export function phaseTag(txt: string) {
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
export function ROField({ label, value }: { label: ReactNode; value: ReactNode }) {
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
// const VQ_GOLD = "#D4AF6A";

// Vương miện line-art tối giản — sang trọng, "The Guardian Princess".
// Không phải hoạt hình; chỉ là dấu hiệu thương hiệu nhẹ nhàng.
export function CrownLineArt({ size = 56, color = "#fff", opacity = 0.92, strokeWidth = 1.4 }: {
  size?: number; color?: string; opacity?: number; strokeWidth?: number;
}) {
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
export function BrandWatermark({ color = "#fff", opacity = 0.05 }: {
  color?: string; opacity?: number;
}) {
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


export function VQWordmark({ size = 22, navy = VQ_NAVY, red = VQ_RED, teamColor }: {
  size?: number; navy?: string; red?: string; teamColor?: string;
}) {
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

/* =====================================================================
 * MULTI SELECT — dropdown chọn nhiều (checkbox)
 *
 * Chuyển từ App.tsx (2026-07-30): dùng cho thanh Lọc chung (Khu vực/Bộ
 * phận) và bộ lọc riêng của ReportsView — một nơi định nghĩa, đổi giao
 * diện một chỗ khớp cả hai. Rỗng = tất cả.
 * =================================================================== */
const multiSelectMiniBtn: CSSProperties = {
  flex: 1, padding: "5px 8px", borderRadius: 8, border: `1px solid ${C.pinkSoft}`,
  background: C.pinkMist, color: C.pinkText, fontFamily: TEXT, fontSize: 11, fontWeight: 800, cursor: "pointer",
};

/* Bảng chọn phải render qua Portal, KHÔNG được để absolute trong thẻ cha.
 *
 * `.card` trong index.css có `will-change: transform` (để cú nhấc 3px lúc hover
 * chạy mượt). Thuộc tính đó tạo ra một stacking context cho MỖI thẻ, nên
 * z-index của bảng chọn chỉ còn hiệu lực bên trong thẻ chứa nó. Thẻ đứng sau
 * trong DOM luôn vẽ đè lên — mở bộ lọc ở mục Báo cáo thì danh sách bị thẻ
 * "Tổng quan số liệu" bên dưới cắt mất. Nâng z-index cao tới đâu cũng vô ích.
 *
 * Đưa ra document.body rồi định vị bằng toạ độ thật của nút là cách duy nhất
 * thoát khỏi stacking context đó. Đổi lại phải tự bám theo nút khi cuộn trang.
 */
export function MultiSelect({ label, allLabel, options, selected, onChange }: {
  label: string;
  allLabel: string;
  options: Array<{ v: string; l: string }>;
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ left: number; top: number; width: number; lenNguoc: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const CAO_TOI_DA = 300;
  const RONG_TOI_THIEU = 210;

  const doViTri = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const rong = Math.max(RONG_TOI_THIEU, r.width);
    // Không đủ chỗ bên dưới thì lật lên trên — bộ lọc hay nằm sát đáy màn hình.
    const duoi = window.innerHeight - r.bottom;
    const lenNguoc = duoi < CAO_TOI_DA + 16 && r.top > duoi;
    setBox({
      // Ghim trong khung nhìn để bảng chọn ở mép phải không bị tràn ra ngoài.
      left: Math.max(8, Math.min(r.left, window.innerWidth - rong - 8)),
      top: lenNguoc ? r.top - 6 : r.bottom + 6,
      width: rong,
      lenNguoc,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    doViTri();
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as Node;
      // Bảng chọn nằm ngoài cây DOM của nút nên phải kiểm cả hai, nếu không
      // vừa bấm vào ô tick là bảng tự đóng.
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (ev: KeyboardEvent) => { if (ev.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    // capture: true để bắt cả cuộn bên trong khung con, không chỉ cuộn trang.
    window.addEventListener("scroll", doViTri, true);
    window.addEventListener("resize", doViTri);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", doViTri, true);
      window.removeEventListener("resize", doViTri);
    };
  }, [open, doViTri]);

  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const btn = selected.length === 0 ? allLabel : `${label}: ${selected.length}`;

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-haspopup="listbox"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px",
          borderRadius: 10, border: `1px solid ${C.pinkSoft}`,
          background: selected.length ? C.pinkMist : C.surface,
          color: selected.length ? C.pinkText : C.plum,
          fontFamily: TEXT, fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
        }}>
        {btn} <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && box && (
        <Portal>
          <div ref={panelRef} className="vmp-scroll" role="listbox" style={{
            position: "fixed", zIndex: 4000,
            left: box.left, width: box.width,
            ...(box.lenNguoc ? { bottom: window.innerHeight - box.top } : { top: box.top }),
            maxHeight: CAO_TOI_DA, overflowY: "auto",
            background: C.surface, border: `1px solid ${C.pinkSoft}`, borderRadius: 12,
            boxShadow: "0 12px 34px rgba(120,60,110,.18)", padding: 6,
          }}>
            <div style={{ display: "flex", gap: 6, padding: "2px 4px 8px", borderBottom: `1px solid ${C.pinkMist}`, marginBottom: 4 }}>
              <button type="button" onClick={() => onChange(options.map((o) => o.v))} style={multiSelectMiniBtn}>Chọn hết</button>
              <button type="button" onClick={() => onChange([])} style={multiSelectMiniBtn}>Bỏ chọn</button>
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
        </Portal>
      )}
    </>
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
          background: C.surface,
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
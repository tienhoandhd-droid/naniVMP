/* =====================================================================
 *  ChatBox.tsx — Trò chuyện cùng công chúa Vali (nổi ở góc phải dưới)
 *  ---------------------------------------------------------------------
 *  Gọi webhook n8n "Vani VMP 4". Bên đó là AI Agent chạy Gemini với hai
 *  công cụ Postgres:
 *
 *    · Tra so lieu timeline   → rpc_ai_context, tính bằng SQL trên TOÀN
 *                               BỘ 461 hạng mục
 *    · Tra tai lieu luat GMP  → rpc_kb_search_text, tìm trong 176 mảnh
 *                               tài liệu luật
 *
 *  Vì sao KHÔNG nhét số liệu vào kho vector: tìm theo ngữ nghĩa chỉ lấy
 *  về vài đoạn giống nhất, nên hỏi "bao nhiêu hạng mục quá hạn" thì mô
 *  hình chỉ nhìn thấy mấy đoạn đó và đếm ra con số của riêng chúng. Sai,
 *  mà nghe rất trôi chảy — kiểu sai nguy hiểm nhất trong hệ GMP.
 * ===================================================================== */
import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Sparkles, AlertTriangle } from "lucide-react";
import { C, TEXT, R, E, MO, glass } from "../../constants/theme.ts";
import type { AppUser } from "../../types/domain.ts";

interface Msg { ai: boolean; text: string; loi?: boolean; nguon?: string }

/** Câu hỏi mồi — người mới không biết hỏi gì thì bấm thẳng. */
const GOI_Y = [
  "Còn bao nhiêu hạng mục quá hạn?",
  "Tỷ lệ hoàn thành theo người phụ trách",
  "Liệt kê hạng mục sắp đến hạn 30 ngày",
  "Vì sao LAF cân được 9 điểm trọng yếu?",
];

export default function ChatBox({ user }: { user?: AppUser | null }) {
  const [mo, setMo] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [dangHoi, setDangHoi] = useState(false);
  const cuoiRef = useRef<HTMLDivElement | null>(null);
  const oNhapRef = useRef<HTMLTextAreaElement | null>(null);

  const url = import.meta.env.VITE_N8N_CHAT_URL as string | undefined;
  const token = import.meta.env.VITE_N8N_CHAT_TOKEN as string | undefined;

  useEffect(() => {
    cuoiRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, dangHoi]);

  useEffect(() => { if (mo) oNhapRef.current?.focus(); }, [mo]);

  const hoi = async (text: string) => {
    const cauHoi = text.trim();
    if (!cauHoi || dangHoi) return;
    setMsgs((m) => [...m, { ai: false, text: cauHoi }]);
    setQ("");
    setDangHoi(true);

    if (!url) {
      setMsgs((m) => [...m, { ai: true, loi: true,
        text: "Chưa cấu hình VITE_N8N_CHAT_URL nên chưa gọi được trợ lý. "
            + "Đặt biến này trong .env rồi build lại." }]);
      setDangHoi(false);
      return;
    }

    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-vmp-secret": token } : {}),
        },
        body: JSON.stringify({
          cau_hoi: cauHoi,
          // Khoá phiên theo người dùng để trợ lý nhớ được mạch hội thoại
          phien: user?.email || "khach",
          email: user?.email || "",
        }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data?.ok) {
        throw new Error(data?.loi || `Máy chủ trả về ${r.status}`);
      }
      setMsgs((m) => [...m, { ai: true, nguon: data.nguon,
        text: String(data.tra_loi || "(không có nội dung)") }]);
    } catch (e) {
      setMsgs((m) => [...m, { ai: true, loi: true,
        text: "Không hỏi được: " + ((e as Error).message || "lỗi không rõ") }]);
    }
    setDangHoi(false);
  };

  /* -------------------------------------------------------------- */
  if (!mo) {
    return (
      <button onClick={() => setMo(true)} title="Trò chuyện cùng công chúa Vali"
        style={{
          position: "fixed", right: 22, bottom: 22, zIndex: 90,
          width: 56, height: 56, borderRadius: R.pill, border: "none",
          cursor: "pointer", background: "var(--grad)", color: "#fff",
          boxShadow: "var(--e-accent)", display: "flex",
          alignItems: "center", justifyContent: "center",
          transition: `transform ${MO.base} ${MO.spring}`,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; }}>
        <MessageCircle size={24} />
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", right: 22, bottom: 22, zIndex: 90,
      width: "min(400px, calc(100vw - 32px))",
      height: "min(600px, calc(100vh - 100px))",
      display: "flex", flexDirection: "column",
      borderRadius: R.xl, overflow: "hidden",
      background: C.surface, border: `1px solid ${C.line}`,
      boxShadow: E.modal, fontFamily: TEXT,
    }} className="vmp-view-enter">

      {/* Đầu hộp */}
      <div style={{ ...glass, borderRadius: 0, border: "none",
                    borderBottom: `1px solid ${C.line}`,
                    padding: "13px 15px", display: "flex",
                    alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: R.pill,
                      background: "var(--grad)", display: "flex",
                      alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Sparkles size={16} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: C.plum }}>
            Công chúa Vali
          </div>
          <div style={{ fontSize: 11, color: C.plumSoft, fontWeight: 600 }}>
            Số liệu đọc thẳng từ database · em không đoán đâu ạ
          </div>
        </div>
        <button onClick={() => setMo(false)} title="Đóng"
          style={{ border: "none", background: "transparent", cursor: "pointer",
                   padding: 6, borderRadius: R.sm, display: "flex" }}>
          <X size={17} color={C.plumSoft} />
        </button>
      </div>

      {/* Khung hội thoại */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 15px",
                    display: "flex", flexDirection: "column", gap: 11,
                    background: C.surfaceSunk }}>
        {msgs.length === 0 && (
          <>
            <div style={{ fontSize: 12.5, color: C.plumSoft, lineHeight: 1.65 }}>
              Dạ em chào ạ 🌸 Em là Vali. Anh/chị cứ hỏi em bất cứ điều gì về
              timeline VMP nhé — tiến độ, người phụ trách, điểm trọng yếu, hay
              quy tắc tính hạn, em tra giúp ạ.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 3 }}>
              {GOI_Y.map((g) => (
                <button key={g} onClick={() => hoi(g)} className="vmp-lift"
                  style={{ textAlign: "left", padding: "10px 12px", borderRadius: R.md,
                           border: `1px solid ${C.line}`, background: C.surface,
                           cursor: "pointer", fontFamily: TEXT, fontSize: 12.5,
                           color: C.plum, fontWeight: 600, lineHeight: 1.5 }}>
                  {g}
                </button>
              ))}
            </div>
          </>
        )}

        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.ai ? "flex-start" : "flex-end", maxWidth: "88%" }}>
            <div style={{
              padding: "10px 13px", borderRadius: R.md, fontSize: 13, lineHeight: 1.68,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              background: m.loi ? C.raspSoft : m.ai ? C.surface : "var(--grad)",
              color: m.loi ? C.raspText : m.ai ? C.plum : "#fff",
              border: m.ai && !m.loi ? `1px solid ${C.line}` : "none",
              boxShadow: m.ai ? E.low : "none",
            }}>
              {m.loi && <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />}
              {m.text}
            </div>
            {m.nguon && (
              <div style={{ fontSize: 10.5, color: C.plumSoft, marginTop: 4, paddingLeft: 3,
                            fontWeight: 700 }}>
                {m.nguon === "sql" ? "⚡ Em tra thẳng từ database — không tốn AI"
                  : m.nguon === "dem" ? "💾 Câu này em đã tra rồi, dữ liệu chưa đổi nên dùng lại"
                  : m.nguon === "du_phong" ? "🔁 Gemini bận, em nhờ mô hình dự phòng ạ"
                  : "✨ Gemini"}
              </div>
            )}
          </div>
        ))}

        {dangHoi && (
          <div style={{ alignSelf: "flex-start", display: "flex", gap: 5,
                        padding: "12px 14px", borderRadius: R.md,
                        background: C.surface, border: `1px solid ${C.line}` }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{
                width: 7, height: 7, borderRadius: R.pill, background: C.pink,
                animation: `vmpViewIn 700ms ${MO.ease} ${i * 140}ms infinite alternate`,
              }} />
            ))}
          </div>
        )}
        <div ref={cuoiRef} />
      </div>

      {/* Ô nhập */}
      <div style={{ padding: "11px 12px", borderTop: `1px solid ${C.line}`,
                    background: C.surface, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea ref={oNhapRef} value={q} rows={1}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              // Enter gửi, Shift+Enter xuống dòng — quy ước quen thuộc
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); hoi(q); }
            }}
            placeholder="Anh/chị muốn hỏi Vali điều gì ạ…"
            style={{ flex: 1, resize: "none", maxHeight: 110, padding: "10px 12px",
                     borderRadius: R.md, border: `1px solid ${C.line}`,
                     background: C.surfaceSunk, color: C.plum, fontFamily: TEXT,
                     fontSize: 13, lineHeight: 1.5, outline: "none" }} />
          <button onClick={() => hoi(q)} disabled={!q.trim() || dangHoi} title="Gửi"
            style={{ width: 40, height: 40, flexShrink: 0, borderRadius: R.md,
                     border: "none", cursor: q.trim() && !dangHoi ? "pointer" : "default",
                     background: q.trim() && !dangHoi ? "var(--grad)" : C.pinkSoft,
                     color: q.trim() && !dangHoi ? "#fff" : C.plumSoft,
                     display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Send size={16} />
          </button>
        </div>
        <div style={{ fontSize: 10.5, color: C.plumSoft, marginTop: 7, lineHeight: 1.5 }}>
          Câu hỏi và câu trả lời được ghi nhật ký theo yêu cầu ALCOA+.
          Em vẫn có thể nhầm ạ — số liệu quan trọng anh/chị đối chiếu lại trên bảng giúp em nhé.
        </div>
      </div>
    </div>
  );
}

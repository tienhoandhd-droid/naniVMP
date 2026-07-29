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
import { supabase } from "../../lib/supabaseClient.ts";
import type { AppUser } from "../../types/domain.ts";

interface TrichDan { nguon: string; muc?: string }
interface Msg {
  ai: boolean; text: string; loi?: boolean; nguon?: string;
  goiY?: string[]; canhBao?: string; trichDan?: TrichDan[]; lop?: number;
}

/** Câu hỏi mồi chung — dùng khi không biết người dùng đang ở màn nào. */
const GOI_Y = [
  "Ta là ai?",
  "Còn bao nhiêu hạng mục quá hạn?",
  "Liệt kê hạng mục sắp đến hạn 30 ngày",
  "Vì sao LAF cân được 9 điểm trọng yếu?",
];

/* Câu hỏi mồi THEO MÀN ĐANG XEM.
 *
 * Bốn câu chung ở trên đúng cho người mới, nhưng người đang đứng ở màn
 * Cảnh báo thì đầu họ đang nghĩ về chuyện trễ hạn, không nghĩ về "ta là
 * ai". Gợi ý bám theo màn khiến ô chat trở thành thứ nối tiếp việc đang
 * làm, thay vì một cái hộp phải nghĩ từ đầu mới dùng được. */
const GOI_Y_THEO_TRANG: Record<string, string[]> = {
  overview:  ["Tháng này có gì đáng lo nhất?",
              "Tỷ lệ hoàn thành đang là bao nhiêu?",
              "Bộ phận nào đang đuối nhất?"],
  timeline:  ["Khu vực nào đang chậm nhất?",
              "Nhóm công việc nào còn nhiều việc chưa bắt đầu?",
              "Quy tắc tính deadline đề cương là gì?"],
  alerts:    ["Ba hạng mục quá hạn nặng nhất là gì?",
              "Cái nào quá hạn mà điểm trọng yếu từ 7 trở lên?",
              "Tuần này còn gì gấp không?"],
  progress:  ["Hôm nay nên làm gì trước?",
              "Hạng mục nào sắp đến hạn trong 30 ngày?",
              "Sửa tiến độ ở đâu thì đúng quy trình?"],
  inventory: ["Thiết bị này thuộc nhóm công việc nào?",
              "Đối tượng nào còn nhiều hạng mục dở nhất?",
              "IQ với OQ khác nhau ở chỗ nào?"],
  source:    ["Mã thiết bị đặt theo quy tắc gì?",
              "Dòng nào thì được sinh timeline?",
              "Nhập thiếu deadline thì hệ xử lý ra sao?"],
  workload:  ["Ai đang phụ trách nhiều hạng mục nhất?",
              "Việc có đang dồn lệch vào vài người không?",
              "Bộ phận nào cần chia lại việc?"],
  reports:   ["Tóm tắt tình hình cho cuộc họp tuần",
              "So với đầu năm thì đã đi được bao xa?",
              "Chuẩn bị thanh tra thì cần soi những gì?"],
  rules:     ["Quy tắc tính deadline đề cương là gì?",
              "Điểm trọng yếu chấm thế nào?",
              "Annex 15 yêu cầu gì về đề cương?"],
  health:    ["Vì sao những hạng mục này bị coi là thiếu dữ liệu?",
              "Thiếu deadline thì có tính là quá hạn không?",
              "Nên bổ sung gì trước cho nhanh?"],
  audit:     ["Audit trail đang ghi lại những gì?",
              "Thanh tra hay bắt lỗi ở chỗ nào?",
              "Sửa dữ liệu có phải ghi lý do không?"],
  admin:     ["Hệ thống đang chạy có ổn không?",
              "Dữ liệu cập nhật lần cuối lúc nào?",
              "Có việc nền nào đang treo không?"],
};

/* Lời chờ đổi dần theo thời gian đợi.
 *
 * Ba dấu chấm nhấp nháy chỉ nói "đang bận", không nói "còn lâu không".
 * Câu dài phải gọi mô hình rồi tra hai nguồn dữ liệu, có khi mất 8–10
 * giây — im lặng chừng đó là người dùng tưởng hỏng và bấm lại. Lời chờ
 * đổi dần vừa cho biết hệ vẫn chạy, vừa nói ra nó đang làm gì. */
const LOI_CHO: Array<{ tu: number; text: string }> = [
  { tu: 0,     text: "Công chúa đang lật sổ tra cho ngươi…" },
  { tu: 2500,  text: "Công chúa đang đăm chiêu, suy nghĩ để đưa ra câu trả lời…" },
  { tu: 6000,  text: "Câu này hơi hóc, công chúa phải giở thêm tài liệu luật…" },
  { tu: 11000, text: "Công chúa vẫn đang cặm cụi, ngươi nán thêm chút nữa…" },
  { tu: 18000, text: "Hôm nay cung đông khách, công chúa đang chờ tới lượt…" },
];

/* Mẩu tri thức hiện trong lúc chờ.
 *
 * Người dùng BUỘC phải nhìn màn hình suốt 10–30 giây đó — bỏ trống là
 * phí. Kho `vmp_chat_loi_cho` có 54 mẩu chia ba loại: thơ về nghề thẩm
 * định, nguyên tắc GMP gọn trong vài dòng, và mẹo dùng hệ VMP.
 *
 * Chống lặp bằng ba lớp: nội dung unique ở DB, `daHien` loại mẩu đã
 * hiện trong phiên, và mỗi mốc thời gian rút một LOẠI khác nhau — nên
 * chờ 20 giây thì đọc được thơ rồi tới nguyên tắc, không đọc lại. */
interface MauCho { loai: string; noi_dung: string; nguon?: string | null }

/* Mốc nào thì rút loại gì. Mở đầu bằng mẹo cho nhẹ, chờ lâu mới tới
 * nguyên tắc — thứ đáng đọc nhất thì để lúc người ta đã yên vị. */
const NHIP_CHO: Array<{ tu: number; loai: string }> = [
  { tu: 4000,  loai: "meo" },
  { tu: 9000,  loai: "tho" },
  { tu: 15000, loai: "nguyen_tac" },
  { tu: 24000, loai: "tho" },
  { tu: 32000, loai: "nguyen_tac" },
];

export default function ChatBox({ user, trang }: { user?: AppUser | null; trang?: string }) {
  const [mo, setMo] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [dangHoi, setDangHoi] = useState(false);
  const [choMs, setChoMs] = useState(0);
  const [khoCho, setKhoCho] = useState<MauCho[]>([]);
  const [mauCho, setMauCho] = useState<MauCho | null>(null);
  // Mẩu đã hiện trong phiên — để không đọc lại cái vừa đọc
  const daHienRef = useRef<Set<string>>(new Set());
  const mocDaRutRef = useRef<number>(-1);
  const cuoiRef = useRef<HTMLDivElement | null>(null);
  const oNhapRef = useRef<HTMLTextAreaElement | null>(null);

  const url = import.meta.env.VITE_N8N_CHAT_URL as string | undefined;
  const token = import.meta.env.VITE_N8N_CHAT_TOKEN as string | undefined;

  useEffect(() => {
    cuoiRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, dangHoi]);

  useEffect(() => { if (mo) oNhapRef.current?.focus(); }, [mo]);

  /* Tải kho mẩu chờ MỘT LẦN lúc mở ô chat, không phải lúc đang chờ —
   * lúc đang chờ mà mới gọi mạng thì mẩu hiện ra sau khi câu trả lời
   * đã về, thành vô dụng. */
  useEffect(() => {
    if (!mo || khoCho.length > 0 || !supabase) return;
    let huy = false;
    // Bảng vmp_chat_loi_cho mới thêm, chưa có trong types sinh tự động của
    // Supabase nên phải ép kiểu. Chỉ đọc, chỉ ba cột, hỏng thì im lặng bỏ
    // qua — mẩu chờ là thứ có thì hay, không có cũng không sao.
    (supabase.from("vmp_chat_loi_cho" as never) as unknown as {
      select: (c: string) => { eq: (k: string, v: boolean) => PromiseLike<{ data: MauCho[] | null }> };
    })
      .select("loai,noi_dung,nguon").eq("bat", true)
      .then(({ data }) => { if (!huy && data) setKhoCho(data); });
    return () => { huy = true; };
  }, [mo, khoCho.length]);

  // Đếm thời gian đã chờ, để đổi lời chờ cho đúng nhịp
  useEffect(() => {
    if (!dangHoi) {
      setChoMs(0); setMauCho(null); mocDaRutRef.current = -1;
      return;
    }
    const t0 = Date.now();
    const id = setInterval(() => setChoMs(Date.now() - t0), 500);
    return () => clearInterval(id);
  }, [dangHoi]);

  /* Tới mốc nào thì rút một mẩu của LOẠI ứng với mốc đó. Ưu tiên mẩu
   * chưa hiện trong phiên; hết mẩu mới thì mới cho lặp lại. */
  useEffect(() => {
    if (!dangHoi || khoCho.length === 0) return;
    const moc = NHIP_CHO.reduce((acc, x, i) => (choMs >= x.tu ? i : acc), -1);
    if (moc < 0 || moc === mocDaRutRef.current) return;
    mocDaRutRef.current = moc;

    const loai = NHIP_CHO[moc].loai;
    const cungLoai = khoCho.filter((m) => m.loai === loai);
    const chuaDoc = cungLoai.filter((m) => !daHienRef.current.has(m.noi_dung));
    const nguon = chuaDoc.length > 0 ? chuaDoc : cungLoai;
    if (nguon.length === 0) return;
    const chon = nguon[Math.floor(Math.random() * nguon.length)];
    daHienRef.current.add(chon.noi_dung);
    setMauCho(chon);
  }, [choMs, dangHoi, khoCho]);

  const loiCho = [...LOI_CHO].reverse().find((x) => choMs >= x.tu)?.text
    ?? LOI_CHO[0].text;

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
          // Token RIÊNG cho ô chat. Nó nằm trong gói JS công khai nên ai cũng
          // đọc được — việc của nó chỉ là chặn quét bừa, không phải giữ bí mật.
          // Vì vậy tuyệt đối không dùng lại x-vmp-secret (token đó còn mở
          // /vmp-write, /vmp-alert-now, /vmp-drain-now).
          ...(token ? { "x-vmp-chat": token } : {}),
        },
        body: JSON.stringify({
          cau_hoi: cauHoi,
          // Khoá phiên theo người dùng để trợ lý nhớ được mạch hội thoại
          phien: user?.email || "khach",
          email: user?.email || "",
          // Vali cần biết đang nói chuyện với ai thì mới trả lời được
          // "tôi là ai", "tôi có quyền gì" — hai câu người mới hỏi đầu tiên.
          nguoi: {
            ten: user?.name || "",
            email: user?.email || "",
            quyen: user?.perm || "",
            bo_phan: user?.department || "",
          },
        }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data?.ok) {
        throw new Error(data?.loi || `Máy chủ trả về ${r.status}`);
      }
      // Trả lời rỗng là LỖI, không phải câu trả lời. Hiện "(không có nội
      // dung)" chỉ làm người dùng tưởng hệ thống bí — nói thật là mô hình
      // không trả về gì, và mời hỏi lại theo cách ngắn hơn (câu ngắn rơi
      // vào đường SQL, không phụ thuộc mô hình).
      const noiDung = String(data.tra_loi ?? "").trim();
      if (!noiDung) {
        setMsgs((m) => [...m, { ai: true, loi: true,
          text: "Mô hình vừa không trả về nội dung nào. "
              + "Ngươi thử hỏi ngắn gọn hơn — ví dụ "
              + "\"bao nhiêu hạng mục quá hạn\" — những câu như vậy bổn cung tra "
              + "thẳng từ database, không cần nhờ tới AI." }]);
        setDangHoi(false);
        return;
      }
      setMsgs((m) => [...m, { ai: true, nguon: data.nguon, text: noiDung,
        canhBao: data.canh_bao || undefined,
        lop: typeof data.lop === "number" ? data.lop : undefined,
        // Tài liệu mà lớp tìm kiếm lai lấy về cho câu này. Hiện ra thành
        // chip riêng thay vì bắt Vali chú nguồn giữa câu — chú giữa câu
        // đọc rất thô, mà trong hồ sơ GMP thì vẫn phải truy được nguồn.
        trichDan: Array.isArray(data.trich_dan)
          ? (data.trich_dan as TrichDan[]).filter((t) => t?.nguon).slice(0, 4)
          : undefined,
        goiY: Array.isArray(data.goi_y) ? data.goi_y.slice(0, 3) : undefined }]);
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
            Số liệu đọc thẳng từ database · bổn cung không đoán
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
              Bổn cung là Vali 🌸 Ngươi cứ hỏi thẳng chuyện trong kế hoạch
              thẩm định — tiến độ, người phụ trách, điểm trọng yếu, hay quy
              tắc tính hạn, bổn cung tra cho.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 3 }}>
              {(GOI_Y_THEO_TRANG[trang || ""] ?? GOI_Y).map((g) => (
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
            {m.canhBao && (
              <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: R.sm,
                            background: C.marigoldSoft, color: C.marigoldText,
                            fontSize: 11.5, lineHeight: 1.55, fontWeight: 600 }}>
                <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
                {m.canhBao} Ngươi đối chiếu lại trên bảng cho chắc.
              </div>
            )}
            {m.trichDan && m.trichDan.length > 0 && (
              <div style={{ marginTop: 7, display: "flex", flexWrap: "wrap",
                            gap: 5, alignItems: "center" }}>
                <span style={{ fontSize: 10.5, color: C.plumSoft, fontWeight: 700 }}>
                  Tài liệu bổn cung giở:
                </span>
                {m.trichDan.map((t, k) => (
                  <span key={k} title={t.nguon + (t.muc ? " › " + t.muc : "")}
                    style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: R.pill,
                             background: C.surfaceSunk, border: `1px solid ${C.line}`,
                             color: C.plumSoft, fontWeight: 600, maxWidth: 190,
                             overflow: "hidden", textOverflow: "ellipsis",
                             whiteSpace: "nowrap" }}>
                    {t.muc || t.nguon.replace(/^docs\//, "")}
                  </span>
                ))}
              </div>
            )}
            {m.goiY && m.goiY.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                <div style={{ fontSize: 10.5, color: C.plumSoft, fontWeight: 700 }}>
                  Ngươi muốn hỏi tiếp gì nữa 🌸
                </div>
                {m.goiY.map((g) => (
                  <button key={g} onClick={() => hoi(g)} className="vmp-lift"
                    style={{ textAlign: "left", padding: "7px 10px", borderRadius: R.sm,
                             border: `1px solid ${C.line}`, background: C.surface,
                             cursor: "pointer", fontFamily: TEXT, fontSize: 12,
                             color: C.plum, fontWeight: 600, lineHeight: 1.45 }}>
                    {g}
                  </button>
                ))}
              </div>
            )}
            {m.nguon === "dem" && (
              <div style={{ fontSize: 10.5, color: C.plumSoft, marginTop: 4,
                            paddingLeft: 3, fontWeight: 700 }}>
                💾 Bổn cung đã tra câu này, dữ liệu chưa đổi nên dùng lại
              </div>
            )}
          </div>
        ))}

        {dangHoi && (
          <div style={{ alignSelf: "flex-start", maxWidth: "88%",
                        display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10,
                          padding: "11px 14px", borderRadius: R.md,
                          background: C.surface, border: `1px solid ${C.line}` }}>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: R.pill, background: C.pink,
                    animation: `vmpNhipCho 1100ms ${MO.ease} ${i * 180}ms infinite`,
                  }} />
                ))}
              </div>
              <span style={{ fontSize: 12.5, color: C.plumSoft, fontWeight: 600,
                             lineHeight: 1.5, fontStyle: "italic" }}>
                {loiCho}
              </span>
            </div>

            {/* Chờ thì đọc lấy một mẩu — thơ về nghề, nguyên tắc GMP, hay
                mẹo dùng hệ. Đằng nào cũng phải nhìn màn hình chừng đó giây. */}
            {mauCho && (
              <div style={{ padding: "10px 13px", borderRadius: R.md,
                            background: C.surfaceSunk, border: `1px dashed ${C.line}`,
                            animation: `vmpHienNhe 400ms ${MO.ease}` }}>
                <div style={{ fontSize: 10, color: C.plumSoft, fontWeight: 800,
                              letterSpacing: 0.4, marginBottom: 5, opacity: 0.75 }}>
                  {mauCho.loai === "tho" ? "🌸 CÔNG CHÚA NGÂM THƠ"
                    : mauCho.loai === "nguyen_tac" ? "📖 NHÂN TIỆN, MỘT NGUYÊN TẮC GMP"
                    : "💡 MÁCH NHỎ"}
                </div>
                <div style={{ fontSize: 12.5, color: C.plum, lineHeight: 1.7,
                              whiteSpace: "pre-wrap",
                              fontStyle: mauCho.loai === "tho" ? "italic" : "normal" }}>
                  {mauCho.noi_dung}
                </div>
                {mauCho.nguon && (
                  <div style={{ fontSize: 10.5, color: C.plumSoft, marginTop: 6,
                                fontWeight: 700, opacity: 0.8 }}>
                    — {mauCho.nguon}
                  </div>
                )}
              </div>
            )}
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
            placeholder="Ngươi muốn hỏi bổn cung điều gì…"
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
          Bổn cung vẫn có thể nhầm — số liệu quan trọng thì đối chiếu lại trên bảng.
        </div>
      </div>
    </div>
  );
}

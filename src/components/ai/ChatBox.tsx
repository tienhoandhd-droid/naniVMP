/* =====================================================================
 *  ChatBox.tsx — Trợ lý VMP (nổi ở góc phải dưới)
 *  ---------------------------------------------------------------------
 *  Hai bước, AI không bao giờ viết con số:
 *    1. n8n "Vani VMP 9": AI (Gemini, dự phòng Groq) đổi câu hỏi thành
 *       {công cụ, tham số}. AI chỉ thấy câu hỏi, không thấy dữ liệu.
 *    2. rpc_tro_ly_tra_loi: SQL dựng câu trả lời + bảng, chạy bằng quyền
 *       của chính người hỏi — số khớp các màn (cách tính ô Tổng quan).
 *  Nút gợi ý gọi thẳng bước 2. AI lỗi thì đoán nhanh bằng từ khoá
 *  (doanNhanh); không đoán được thì nói thật và mời bấm gợi ý.
 *  Thiết kế: docs/superpowers/specs/2026-10-22-tro-ly-vmp-moi-design.md
 * ===================================================================== */
import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Sparkles, AlertTriangle, ThumbsUp, ThumbsDown, Info } from "lucide-react";
import { C, TEXT, R, E, MO, glass } from "../../constants/theme.ts";
import type { AppUser } from "../../types/domain.ts";
import type { AccessContext } from "../../lib/access.ts";
import {
  gioPhut,
  laCongCuDuLieu,
  TroLyTuChoiError,
  type Bang,
  type CongCu,
  type GoiY,
  type ThamSo,
} from "../../features/assistant/contracts.ts";
import { danhGia, ghiNhatKy, hieuCauHoi, traLoi, type NhatKy } from "../../features/assistant/api.ts";
import { doanNhanh } from "../../features/assistant/doanNhanh.ts";
import { HUONG_DAN_WEB, timHuongDan, type ChuDeHuongDan } from "../../features/assistant/huongDan.ts";

interface Msg {
  id: number;
  ai: boolean;
  text: string;
  loi?: boolean;
  hieuLa?: string;
  bang?: Bang | null;
  hoiLai?: GoiY[];
  goiY?: GoiY[];
  nguon?: string;
  ghiChu?: string;
  huongDan?: ChuDeHuongDan[];
  nhatKyId?: number | null;
  danhGia?: 1 | -1;
}

/** Gợi ý mở đầu: bấm là tra thẳng SQL, không cần AI. */
const GOI_Y_DAU: GoiY[] = [
  { nhan: "Tổng quan năm nay", congCu: "tong_quan", thamSo: {} },
  { nhan: "Hạng mục quá hạn", congCu: "qua_han", thamSo: {} },
  { nhan: "Đến hạn trong 30 ngày", congCu: "sap_den_han", thamSo: { so_ngay: 30 } },
  { nhan: "Việc của tôi tuần này", congCu: "viec_cua_toi", thamSo: { so_ngay: 7 } },
  { nhan: "Phiếu thay đổi cần thẩm định", congCu: "thay_doi", thamSo: {} },
];

const GIOI_THIEU = "Tôi tra kế hoạch thẩm định VMP cho bạn: quá hạn, sắp đến hạn, tiến độ theo bộ phận, "
  + "một thiết bị cụ thể, việc của một người, phiếu thay đổi cần thẩm định, cách dùng web, "
  + "và kiến thức GMP chung. Số liệu lấy thẳng từ dữ liệu bạn được xem, cách tính giống ô Tổng quan.";

const SO_DONG_GON = 8;

export default function ChatBox({ user: _user, trang: _trang, access: _access }: {
  user?: AppUser | null; trang?: string;
  access?: Pick<AccessContext, "businessRole"> | null;
}) {
  const [mo, setMo] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [dangHoi, setDangHoi] = useState<null | "hieu" | "tra">(null);
  const [moRong, setMoRong] = useState<Set<number>>(new Set());
  const truocRef = useRef<{ congCu: string; thamSo: ThamSo } | null>(null);
  const idRef = useRef(0);
  const cuoiRef = useRef<HTMLDivElement | null>(null);
  const oNhapRef = useRef<HTMLTextAreaElement | null>(null);
  const fabRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    cuoiRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, dangHoi]);

  useEffect(() => {
    if (mo) {
      wasOpenRef.current = true;
      oNhapRef.current?.focus();
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      fabRef.current?.focus();
    }
  }, [mo]);

  const dongChat = useCallback(() => setMo(false), []);

  useEffect(() => {
    if (!mo) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dongChat();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mo, dongChat]);

  const themMsg = (m: Omit<Msg, "id">): number => {
    idRef.current += 1;
    const id = idRef.current;
    setMsgs((cu) => [...cu, { ...m, id }]);
    return id;
  };

  const ganNhatKy = (msgId: number, n: NhatKy) => {
    ghiNhatKy(n)
      .then((nkId) => {
        if (nkId !== null) setMsgs((cu) => cu.map((m) => (m.id === msgId ? { ...m, nhatKyId: nkId } : m)));
      })
      .catch((loi: unknown) => console.error("[trợ lý] ghi nhật ký lỗi:", loi));
  };

  /** Chạy một công cụ đã biết (từ AI, từ đoán nhanh hoặc từ nút gợi ý). */
  const chay = async (cauHoi: string, congCu: CongCu, thamSo: ThamSo, extra: {
    duong: NhatKy["duong"]; moHinh: string | null; kienThuc?: string | null; ghiChu?: string; t0: number;
  }) => {
    const nk = { cauHoi, congCu, thamSo, duong: extra.duong, moHinh: extra.moHinh };
    if (laCongCuDuLieu(congCu)) {
      setDangHoi("tra");
      try {
        const kq = await traLoi(congCu, thamSo);
        truocRef.current = { congCu: kq.congCu, thamSo: kq.thamSo };
        const id = themMsg({
          ai: true, text: kq.traLoi, hieuLa: kq.hieuLa, bang: kq.bang, hoiLai: kq.hoiLai,
          goiY: kq.goiY, ghiChu: extra.ghiChu,
          nguon: kq.nguon ? `${kq.nguon}${kq.luc ? ` · lúc ${gioPhut(kq.luc)}` : ""}` : undefined,
        });
        ganNhatKy(id, { ...nk, ok: true, soDong: kq.bang?.tongDong ?? null, thoiGianMs: performance.now() - extra.t0 });
      } catch (loi) {
        const text = loi instanceof Error && /[À-ỹ]/.test(loi.message) ? loi.message : "Chưa tra được, thử lại sau.";
        if (!(loi instanceof TroLyTuChoiError)) console.error("[trợ lý] tra dữ liệu lỗi:", loi);
        const id = themMsg({ ai: true, loi: true, text, goiY: GOI_Y_DAU.slice(0, 3) });
        ganNhatKy(id, { ...nk, ok: false, soDong: null, thoiGianMs: performance.now() - extra.t0 });
      }
      return;
    }

    let id: number;
    let traLoiDuoc = true;
    if (congCu === "huong_dan") {
      const chuDe = timHuongDan(thamSo.chu_de);
      id = themMsg(chuDe
        ? { ai: true, text: chuDe.tieuDe, huongDan: [chuDe], hieuLa: `Hướng dẫn: ${chuDe.tieuDe}` }
        : { ai: true, text: "Bạn muốn hướng dẫn phần nào?", hoiLai: HUONG_DAN_WEB.map((c) => ({
            nhan: c.tieuDe, congCu: "huong_dan" as const, thamSo: { chu_de: c.id } })) });
    } else if (congCu === "kien_thuc" && extra.kienThuc) {
      id = themMsg({ ai: true, text: extra.kienThuc, hieuLa: "Kiến thức GMP chung",
        ghiChu: "Kiến thức chung do AI viết, không phải SOP nội bộ. Đối chiếu văn bản gốc trước khi dùng cho hồ sơ." });
    } else if (congCu === "chao_hoi") {
      id = themMsg({ ai: true, text: GIOI_THIEU, goiY: GOI_Y_DAU });
    } else {
      traLoiDuoc = false;
      id = themMsg({ ai: true, text: "Câu này trợ lý chưa trả lời được (ví dụ SOP nội bộ, số đo thẩm định thực tế). "
        + "Câu hỏi đã được ghi lại để bổ sung. Bạn thử một trong các câu sau:", goiY: GOI_Y_DAU });
    }
    ganNhatKy(id, { ...nk, ok: traLoiDuoc, soDong: null, thoiGianMs: performance.now() - extra.t0 });
  };

  const hoi = async (text: string, goiY?: GoiY) => {
    const cauHoi = text.trim();
    if (!cauHoi || dangHoi) return;
    const t0 = performance.now();
    themMsg({ ai: false, text: cauHoi });
    setQ("");
    try {
      if (goiY) {
        await chay(cauHoi, goiY.congCu, goiY.thamSo, { duong: "goi_y", moHinh: null, t0 });
        return;
      }
      setDangHoi("hieu");
      let hieu: Awaited<ReturnType<typeof hieuCauHoi>> | null = null;
      let lyDoAi = "";
      try {
        hieu = await hieuCauHoi(cauHoi, truocRef.current);
      } catch (loi) {
        lyDoAi = loi instanceof TroLyTuChoiError ? loi.message : "Trợ lý AI chưa phản hồi.";
        console.error("[trợ lý] bước hiểu câu hỏi lỗi:", loi);
      }
      if (hieu) {
        await chay(cauHoi, hieu.congCu, hieu.thamSo, { duong: "ai", moHinh: hieu.moHinh, kienThuc: hieu.kienThuc, t0 });
        return;
      }
      const doan = doanNhanh(cauHoi);
      if (doan) {
        await chay(cauHoi, doan.congCu, doan.thamSo, {
          duong: "doan_nhanh", moHinh: null, t0,
          ghiChu: `${lyDoAi} Tôi đoán theo từ khoá — xem dòng "Tôi hiểu là" để chắc đúng ý bạn.`,
        });
        return;
      }
      const id = themMsg({ ai: true, loi: true, text: `${lyDoAi} Bạn bấm một gợi ý bên dưới, hoặc hỏi lại sau ít phút.`,
        goiY: GOI_Y_DAU });
      ganNhatKy(id, { cauHoi, congCu: null, thamSo: null, duong: "loi", moHinh: null, ok: false, soDong: null,
        thoiGianMs: performance.now() - t0 });
    } finally {
      setDangHoi(null);
    }
  };

  const guiDanhGia = (m: Msg, diem: 1 | -1) => {
    if (m.nhatKyId == null || m.danhGia) return;
    setMsgs((cu) => cu.map((x) => (x.id === m.id ? { ...x, danhGia: diem } : x)));
    danhGia(m.nhatKyId, diem).catch((loi: unknown) => {
      console.error("[trợ lý] đánh giá lỗi:", loi);
      setMsgs((cu) => cu.map((x) => (x.id === m.id ? { ...x, danhGia: undefined } : x)));
    });
  };

  /* -------------------------------------------------------------- */
  if (!mo) {
    return (
      <button ref={fabRef} type="button" className="vmp-chat-fab" onClick={() => setMo(true)}
        aria-label="Mở trợ lý VMP" title="Trợ lý VMP"
        style={{
          position: "fixed", right: 22, bottom: 22, zIndex: 90,
          width: 56, height: 56, borderRadius: R.pill, border: "none",
          cursor: "pointer", background: "var(--grad)", color: "var(--lp-porcelain)",
          boxShadow: "var(--e-accent)", display: "flex",
          alignItems: "center", justifyContent: "center",
          transition: `transform ${MO.base} ${MO.spring}`,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; }}>
        <MessageCircle size={24} aria-hidden="true" />
      </button>
    );
  }

  const nutGoiY = (g: GoiY, nho = false) => (
    <button key={`${g.congCu}:${JSON.stringify(g.thamSo)}:${g.nhan}`} type="button"
      onClick={() => hoi(g.nhan, g)} disabled={dangHoi !== null} className="vmp-lift"
      style={{ textAlign: "left", padding: nho ? "8px 10px" : "10px 12px", minHeight: 44,
               borderRadius: R.md, border: `1px solid ${C.line}`, background: C.surface,
               cursor: dangHoi ? "default" : "pointer", fontFamily: TEXT, fontSize: 12,
               color: C.plum, fontWeight: 600, lineHeight: 1.45 }}>
      {g.nhan}
    </button>
  );

  return (
    <div role="dialog" aria-modal="false" aria-labelledby="vmp-chat-title" style={{
      position: "fixed", right: 22, bottom: 22, zIndex: 90,
      width: "min(440px, calc(100vw - 32px))",
      height: "min(640px, calc(100vh - 100px))",
      display: "flex", flexDirection: "column",
      borderRadius: R.xl, overflow: "hidden",
      background: C.surfaceOverlay, border: `1px solid ${C.line}`,
      boxShadow: E.modal, fontFamily: TEXT,
    }} className="vmp-chat-panel vmp-view-enter">

      <div style={{ ...glass, borderRadius: 8, border: "none", borderBottom: `1px solid ${C.line}`,
                    padding: "13px 15px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: R.pill, background: "var(--grad)", display: "flex",
                      alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Sparkles size={16} color="currentColor" aria-hidden="true" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div id="vmp-chat-title" style={{ fontSize: 14, fontWeight: 800, color: C.plum }}>Trợ lý VMP</div>
          <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>Số liệu lấy thẳng từ dữ liệu bạn được xem</div>
        </div>
        <button type="button" onClick={dongChat} aria-label="Đóng trợ lý" title="Đóng"
          style={{ border: "none", background: "transparent", cursor: "pointer", padding: 10,
                   borderRadius: R.sm, display: "flex" }}>
          <X size={17} color={C.plumSoft} aria-hidden="true" />
        </button>
      </div>

      <div aria-live="polite" style={{ flex: 1, overflowY: "auto", padding: "14px 15px", display: "flex",
                    flexDirection: "column", gap: 11, background: C.surfaceSunk }}>
        {msgs.length === 0 && (
          <>
            <div style={{ fontSize: 13, color: C.plumSoft, lineHeight: 1.65 }}>{GIOI_THIEU}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 3 }}>
              {GOI_Y_DAU.map((g) => nutGoiY(g))}
            </div>
          </>
        )}

        {msgs.map((m) => {
          const bang = m.bang;
          const daMo = moRong.has(m.id);
          const dongHien = bang ? (daMo ? bang.dong : bang.dong.slice(0, SO_DONG_GON)) : [];
          return (
            <div key={m.id} className="vmp-tl-msg" style={{ alignSelf: m.ai ? "stretch" : "flex-end",
                                         maxWidth: m.ai ? "100%" : "88%" }}>
              {m.hieuLa && (
                <div className="vmp-tl-hieu" style={{ fontSize: 12, color: C.plumSoft, marginBottom: 4, fontWeight: 600 }}>
                  Tôi hiểu là: <span style={{ color: C.plum }}>{m.hieuLa}</span>
                </div>
              )}
              <div style={{
                padding: "10px 13px", borderRadius: R.md, fontSize: 14, lineHeight: 1.65,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
                background: m.loi ? C.raspSoft : m.ai ? C.surface : "var(--grad)",
                color: m.loi ? C.raspText : m.ai ? C.plum : "var(--lp-porcelain)",
                border: m.ai && !m.loi ? `1px solid ${C.line}` : "none",
                boxShadow: m.ai ? E.low : "none",
              }}>
                {m.loi && <AlertTriangle size={14} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 6 }} />}
                {m.text}

                {m.huongDan?.map((c) => (
                  <div key={c.id} style={{ marginTop: 8 }}>
                    <ol style={{ margin: "0 0 6px", paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>
                      {c.buoc.map((b) => <li key={b}>{b}</li>)}
                    </ol>
                    <div style={{ fontSize: 12, color: C.plumSoft }}><b>Ai làm được:</b> {c.vai}</div>
                  </div>
                ))}

                {bang && bang.dong.length > 0 && (
                  <div className="vmp-tl-bang" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    {dongHien.map((d, i) => (
                      <div key={`${d[bang.cot[0].key]}-${i}`} style={{ padding: "7px 9px", borderRadius: R.sm,
                        background: C.surfaceSunk, border: `1px solid ${C.line}`, fontSize: 12, lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 700, color: C.plum }}>{d[bang.cot[0].key]}</div>
                        {bang.cot.length > 1 && <div style={{ color: C.plum }}>{d[bang.cot[1].key]}</div>}
                        {bang.cot.length > 2 && (
                          <div style={{ color: C.plumSoft, marginTop: 2 }}>
                            {bang.cot.slice(2).map((c) => `${c.nhan}: ${d[c.key]}`).join(" · ")}
                          </div>
                        )}
                      </div>
                    ))}
                    {bang.dong.length > SO_DONG_GON && (
                      <button type="button" onClick={() => setMoRong((cu) => {
                        const moi = new Set(cu);
                        if (moi.has(m.id)) moi.delete(m.id); else moi.add(m.id);
                        return moi;
                      })} style={{ alignSelf: "flex-start", border: "none", background: "transparent",
                        color: C.pink, fontWeight: 700, fontSize: 12, cursor: "pointer", padding: "8px 2px", minHeight: 44 }}>
                        {daMo ? "Thu gọn" : `Xem cả ${bang.dong.length} dòng`}
                      </button>
                    )}
                    {bang.tongDong > bang.dong.length && (
                      <div style={{ fontSize: 12, color: C.plumSoft }}>
                        Còn {bang.tongDong - bang.dong.length} dòng nữa — xem đủ ở màn Cảnh báo hoặc Cập nhật tiến độ.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {m.ghiChu && (
                <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: R.sm, background: C.marigoldSoft,
                              color: C.marigoldText, fontSize: 12, lineHeight: 1.55, fontWeight: 600 }}>
                  <Info size={13} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 5 }} />{m.ghiChu}
                </div>
              )}

              {m.ai && !m.loi && (m.nguon || m.nhatKyId != null) && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                  {m.nguon && <span style={{ fontSize: 12, color: C.plumSoft, flex: 1, minWidth: 0 }}>Nguồn: {m.nguon}</span>}
                  {m.nhatKyId != null && (m.danhGia ? (
                    <span style={{ fontSize: 12, color: C.plumSoft }}>Đã ghi nhận đánh giá</span>
                  ) : (
                    <>
                      <button type="button" aria-label="Câu trả lời đúng ý" title="Đúng ý" onClick={() => guiDanhGia(m, 1)}
                        style={{ border: "none", background: "transparent", cursor: "pointer", padding: 8, display: "flex" }}>
                        <ThumbsUp size={14} color={C.plumSoft} aria-hidden="true" />
                      </button>
                      <button type="button" aria-label="Câu trả lời chưa đúng" title="Chưa đúng" onClick={() => guiDanhGia(m, -1)}
                        style={{ border: "none", background: "transparent", cursor: "pointer", padding: 8, display: "flex" }}>
                        <ThumbsDown size={14} color={C.plumSoft} aria-hidden="true" />
                      </button>
                    </>
                  ))}
                </div>
              )}

              {m.hoiLai && m.hoiLai.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  {m.hoiLai.map((g) => nutGoiY(g, true))}
                </div>
              )}
              {m.goiY && m.goiY.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {m.goiY.map((g) => nutGoiY(g, true))}
                </div>
              )}
            </div>
          );
        })}

        {dangHoi && (
          <div role="status" style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 10,
                        padding: "11px 14px", borderRadius: R.md, background: C.surface, border: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }} aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 6, height: 6, borderRadius: R.pill, background: C.pink,
                  animation: `vmpNhipCho 1100ms ${MO.ease} ${i * 180}ms infinite` }} />
              ))}
            </div>
            <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>
              {dangHoi === "hieu" ? "Đang đọc câu hỏi…" : "Đang tra dữ liệu…"}
            </span>
          </div>
        )}
        <div ref={cuoiRef} />
      </div>

      <div style={{ padding: "11px 12px", borderTop: `1px solid ${C.line}`, background: C.surface, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea ref={oNhapRef} value={q} rows={1} aria-label="Nội dung câu hỏi" maxLength={500}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void hoi(q); }
            }}
            placeholder="Hỏi về hạng mục, thiết bị, hạn, phiếu thay đổi…"
            style={{ flex: 1, resize: "none", maxHeight: 110, padding: "10px 12px", borderRadius: R.md,
                     border: `1px solid ${C.line}`, background: C.surfaceSunk, color: C.plum, fontFamily: TEXT,
                     fontSize: 14, lineHeight: 1.5, outline: "none" }} />
          <button type="button" onClick={() => void hoi(q)} disabled={!q.trim() || dangHoi !== null}
            aria-label="Gửi câu hỏi" title="Gửi"
            style={{ width: 44, height: 44, flexShrink: 0, borderRadius: R.md, border: "none",
                     cursor: q.trim() && !dangHoi ? "pointer" : "default",
                     background: q.trim() && !dangHoi ? "var(--grad)" : C.pinkSoft,
                     color: q.trim() && !dangHoi ? "var(--lp-porcelain)" : C.plumSoft,
                     display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Send size={16} aria-hidden="true" />
          </button>
        </div>
        <div style={{ fontSize: 12, color: C.plumSoft, marginTop: 7, lineHeight: 1.5 }}>
          Xem dòng "Tôi hiểu là" để chắc trợ lý hiểu đúng. Shift + Enter để xuống dòng.
        </div>
      </div>
    </div>
  );
}

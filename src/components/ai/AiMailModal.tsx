/* =====================================================================
 *  components/ai/AiMailModal.tsx — Gửi bản phân tích AI qua mail
 *  ---------------------------------------------------------------------
 *  Dùng chung cho trang Báo cáo & AI và trang Cảnh báo & Rủi ro.
 *
 *  Ba cách chọn người nhận, cho hai tình huống thật khác nhau:
 *    1. Bật "gửi cho danh sách định kỳ" — đúng người đã khai trong
 *       Danh mục → Người nhận mail, cột "Mail phân tích AI". Đây là cách
 *       dùng thật, cũng chính là danh sách mà lịch tự động dùng.
 *    2. Tick tên trong danh bạ — lúc thử, hoặc gửi thêm cho một người.
 *    3. Gõ tay email — lúc thử nhanh, người chưa có trong danh bạ.
 *
 *  Modal KHÔNG tự dựng nội dung mail. Nó chỉ nói cho n8n "gửi cho những
 *  người này"; n8n đọc lại số từ Supabase rồi mới soạn. Trình duyệt không
 *  được là nguồn số liệu cho một cái mail gửi ra ngoài.
 * ===================================================================== */
import { useEffect, useMemo, useState } from "react";
import { Mail, Send, RefreshCw, AlertCircle, CheckCircle2, Users, Search } from "lucide-react";

import { C, TEXT, btnPrimary } from "../../constants/theme.ts";
import { Modal, Tag, TableScroll } from "../ui/Primitives.tsx";
import { fetchAlertRecipients, fetchStaffEmails, fetchPerformers } from "../../lib/supabaseData.ts";
import { chayPhanTichAi, emailHopLe, tachEmail, AI_NHAN } from "../../lib/aiReport.ts";
import type { AiKind, AiPeriod, AiResult } from "../../lib/aiReport.ts";

/** Một dòng chọn được trong danh bạ — gộp từ ba bảng khác nhau. */
interface Ung {
  email: string;
  ten: string;
  /** Nguồn để người dùng biết vì sao cái tên này có mặt ở đây. */
  nguon: string;
  /** Đang bật nhận bản phân tích AI định kỳ. */
  dinhKy: boolean;
}

const LS_LAST = "vmp_ai_mail_last_v1";

function gopUngVien(
  recips: { email: string; recipient_name: string | null; ai_report_enabled: boolean }[],
  staff: { email: string | null; staff_name: string; department: string | null }[],
  performers: { email: string | null; performer_name: string; is_active: boolean }[],
): Ung[] {
  const m = new Map<string, Ung>();
  const them = (email: unknown, ten: string, nguon: string, dinhKy = false) => {
    const e = String(email ?? "").trim();
    if (!emailHopLe(e)) return;
    const k = e.toLowerCase();
    const cu = m.get(k);
    // Trùng email thì giữ dòng đầu nhưng nâng cờ định kỳ lên — người đã khai
    // trong danh sách nhận mail vẫn phải hiện là "định kỳ" dù danh bạ nhân sự
    // cũng có tên đó.
    if (cu) { cu.dinhKy = cu.dinhKy || dinhKy; return; }
    m.set(k, { email: e, ten: ten.trim() || e, nguon, dinhKy });
  };
  recips.forEach((r) => them(r.email, r.recipient_name || "", "Người nhận mail", !!r.ai_report_enabled));
  staff.forEach((s) => them(s.email, s.staff_name, s.department ? `Danh bạ · ${s.department}` : "Danh bạ"));
  performers.filter((p) => p.is_active).forEach((p) => them(p.email, p.performer_name, "Người thực hiện"));
  return [...m.values()].sort((a, b) => {
    if (a.dinhKy !== b.dinhKy) return a.dinhKy ? -1 : 1;
    return a.ten.localeCompare(b.ten, "vi");
  });
}

export default function AiMailModal({ loai, phamVi, phamViLabel, ky, onClose, onDone }: {
  loai: AiKind;
  phamVi: string;
  phamViLabel: string;
  /** Kỳ báo cáo đang xem. Bỏ trống = cả năm hiện tại. */
  ky?: AiPeriod;
  onClose: () => void;
  /** Trả bản phân tích về trang cha để hiện luôn, khỏi chạy AI lần hai. */
  onDone?: (r: AiResult) => void;
}) {
  const [ungVien, setUngVien] = useState<Ung[]>([]);
  const [dangTai, setDangTai] = useState(true);
  const [loiTai, setLoiTai] = useState("");
  const [chon, setChon] = useState<Set<string>>(new Set());
  const [goTay, setGoTay] = useState(() => {
    try { return localStorage.getItem(LS_LAST) || ""; } catch { return ""; }
  });
  const [dungDanhSach, setDungDanhSach] = useState(true);
  const [tim, setTim] = useState("");
  const [dangGui, setDangGui] = useState(false);
  const [ketQua, setKetQua] = useState<AiResult | null>(null);
  const [loiGui, setLoiGui] = useState("");

  useEffect(() => {
    let song = true;
    Promise.all([
      fetchAlertRecipients().catch(() => []),
      fetchStaffEmails().catch(() => []),
      fetchPerformers().catch(() => []),
    ])
      .then(([r, s, p]) => {
        if (!song) return;
        const ds = gopUngVien(r, s, p);
        setUngVien(ds);
        if (!ds.length) setLoiTai("Danh bạ trống — hãy gõ tay email, hoặc khai người nhận ở Danh mục & Nhập liệu → Người nhận mail.");
      })
      .catch((e: Error) => { if (song) setLoiTai("Không đọc được danh bạ: " + e.message); })
      .finally(() => { if (song) setDangTai(false); });
    return () => { song = false; };
  }, []);

  const soDinhKy = useMemo(() => ungVien.filter((u) => u.dinhKy).length, [ungVien]);

  const hienThi = useMemo(() => {
    const kw = tim.trim().toLowerCase();
    if (!kw) return ungVien;
    return ungVien.filter((u) => `${u.ten} ${u.email} ${u.nguon}`.toLowerCase().includes(kw));
  }, [ungVien, tim]);

  const emailGoTay = useMemo(() => tachEmail(goTay), [goTay]);
  const goTaySai = useMemo(() => emailGoTay.filter((e) => !emailHopLe(e)), [emailGoTay]);
  const tongChon = chon.size + emailGoTay.filter(emailHopLe).length;
  // Không có ai chọn tay mà cũng không dùng danh sách định kỳ thì bấm gửi
  // chỉ tốn một lượt gọi AI rồi không gửi cho ai.
  const guiDuoc = tongChon > 0 || (dungDanhSach && soDinhKy > 0);

  const bat = (email: string) => setChon((cu) => {
    const s = new Set(cu);
    if (s.has(email)) s.delete(email); else s.add(email);
    return s;
  });

  const gui = async () => {
    setDangGui(true); setLoiGui(""); setKetQua(null);
    try { localStorage.setItem(LS_LAST, goTay); } catch { /* riêng tư/hết chỗ — không chặn việc gửi */ }
    try {
      const r = await chayPhanTichAi({
        loai, pham_vi: phamVi, ky, gui_mail: true,
        email_nhan: [...chon, ...emailGoTay.filter(emailHopLe)],
        dung_danh_sach: dungDanhSach,
      });
      setKetQua(r);
      if (r.ok && onDone) onDone(r);
      if (!r.ok) setLoiGui(r.error || "n8n không dựng được bản phân tích.");
    } catch (e) {
      setLoiGui((e as Error)?.message || "Không gọi được n8n.");
    } finally {
      setDangGui(false);
    }
  };

  const daGui = ketQua?.mail?.da_gui || [];
  const thatBai = ketQua?.mail?.that_bai || [];

  const o: React.CSSProperties = {
    fontFamily: TEXT, fontSize: 14, fontWeight: 600, color: C.plum,
    border: `1.5px solid ${C.pinkSoft}`, background: C.surface,
    borderRadius: 14, padding: "10px 13px", width: "100%", outline: "none",
  };

  return (
    <Modal onClose={onClose} wide icon={Mail}
      title={`Gửi bản phân tích AI · ${AI_NHAN[loai].toLowerCase()}`}>
      <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700, marginBottom: 14, lineHeight: 1.65 }}>
        Phạm vi gửi: <b style={{ color: C.plum }}>{phamViLabel}</b>
        {ky ? <> · kỳ <b style={{ color: C.plum }}>{ky.nhan}</b></> : null}.
        Mail gồm <b>phần phân tích AI</b> và <b>toàn bộ dữ liệu thô</b> của phạm vi này (đính kèm tệp CSV).
        Số liệu do n8n đọc lại thẳng từ Supabase lúc gửi — không lấy từ trang đang mở, nên không phụ
        thuộc bản này đã cũ tới đâu.
      </div>

      {/* 1. Danh sách định kỳ — cách dùng thật */}
      <label style={{
        display: "flex", gap: 11, alignItems: "flex-start", cursor: "pointer",
        background: dungDanhSach ? C.mintSoft : C.pinkMist, borderRadius: 14,
        padding: "13px 15px", marginBottom: 14,
      }}>
        <input type="checkbox" checked={dungDanhSach} onChange={(e) => setDungDanhSach(e.target.checked)}
          style={{ width: 17, height: 17, marginTop: 2, accentColor: C.pink, cursor: "pointer" }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.plum, lineHeight: 1.6 }}>
          Gửi cho danh sách định kỳ ({soDinhKy} người đang bật &quot;Mail phân tích AI&quot;)
          <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600, marginTop: 3 }}>
            Đúng danh sách mà lịch tự động dùng. n8n lọc lại theo phạm vi từng người, nên bỏ tick
            nếu chỉ muốn thử gửi cho riêng mình.
          </div>
        </span>
      </label>

      {/* 2. Chọn trong danh bạ */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9, flexWrap: "wrap" }}>
        <Users size={16} color={C.plumSoft} />
        <span style={{ fontSize: 14, fontWeight: 800, color: C.plum }}>Chọn thêm trong danh bạ</span>
        {chon.size > 0 && <Tag color={C.lavText} bg={C.lavSoft}>Đã chọn {chon.size}</Tag>}
        <label style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6,
          border: `1.5px solid ${C.pinkSoft}`, background: C.surface, borderRadius: 999, padding: "6px 12px" }}>
          <Search size={14} color={C.plumSoft} />
          <input value={tim} onChange={(e) => setTim(e.target.value)} placeholder="Tìm tên, email…"
            style={{ border: "none", outline: "none", background: "transparent", fontFamily: TEXT,
              fontSize: 12, fontWeight: 600, color: C.plum, width: 150 }} />
        </label>
      </div>

      {dangTai ? (
        <div style={{ padding: 18, textAlign: "center", color: C.plumSoft, fontWeight: 700 }}>
          <RefreshCw size={18} className="spin" color={C.pink} /> Đang tải danh bạ…
        </div>
      ) : loiTai ? (
        <div style={{ fontSize: 12, fontWeight: 700, color: C.marigoldText, background: C.marigoldSoft,
          borderRadius: 14, padding: "11px 14px" }}>{loiTai}</div>
      ) : (
        <TableScroll maxHeight={210} hint={false}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {hienThi.map((u) => (
              <label key={u.email} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 14,
                cursor: "pointer", background: chon.has(u.email) ? C.lavSoft : "transparent",
              }}>
                <input type="checkbox" checked={chon.has(u.email)} onChange={() => bat(u.email)}
                  style={{ width: 16, height: 16, accentColor: C.lav, cursor: "pointer" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.plum }}>{u.ten}</span>
                  <span style={{ fontSize: 12, color: C.plumSoft, fontWeight: 600 }}> · {u.email}</span>
                </span>
                {u.dinhKy && <Tag color={C.mintText} bg={C.mintSoft}>Định kỳ</Tag>}
                <Tag color={C.plumSoft} bg={C.pinkMist}>{u.nguon}</Tag>
              </label>
            ))}
            {!hienThi.length && (
              <div style={{ padding: 14, textAlign: "center", color: C.plumSoft, fontWeight: 600, fontSize: 12 }}>
                Không có ai khớp &quot;{tim}&quot;.
              </div>
            )}
          </div>
        </TableScroll>
      )}

      {/* 3. Gõ tay */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.plum, marginBottom: 7 }}>
          Hoặc gõ tay email (cách nhau bằng dấu phẩy hoặc xuống dòng)
        </div>
        <textarea value={goTay} onChange={(e) => setGoTay(e.target.value)} rows={2}
          placeholder="ten@cpc1hn.com, ten2@cpc1hn.com" style={{ ...o, resize: "vertical", lineHeight: 1.6 }} />
        {goTaySai.length > 0 && (
          <div style={{ marginTop: 7, fontSize: 12, fontWeight: 700, color: C.marigoldText }}>
            ⚠️ Bỏ qua vì không đúng dạng email: {goTaySai.join(", ")}
          </div>
        )}
      </div>

      {/* Kết quả gửi — nói rõ ai nhận được, ai không, thay vì chỉ "đã gửi" */}
      {loiGui && (
        <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", fontSize: 14,
          fontWeight: 800, color: C.raspText, background: C.raspSoft, borderRadius: 14, padding: "12px 15px" }}>
          <AlertCircle size={16} /> {loiGui}
        </div>
      )}
      {ketQua?.ok && (
        <div style={{ marginTop: 14, borderRadius: 14, padding: "13px 15px",
          background: thatBai.length ? C.marigoldSoft : C.mintSoft }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, fontWeight: 800,
            color: thatBai.length ? C.marigoldText : C.mintText }}>
            <CheckCircle2 size={16} />
            {daGui.length
              ? `Đã gửi tới ${daGui.length} địa chỉ: ${daGui.join(", ")}`
              : "Bản phân tích đã chạy xong nhưng không có địa chỉ nào nhận được."}
          </div>
          {thatBai.length > 0 && (
            <div style={{ marginTop: 7, fontSize: 12, fontWeight: 700, color: C.raspText }}>
              Gửi hỏng {thatBai.length}: {thatBai.map((t) => `${t.email} (${t.loi})`).join("; ")}
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 12, color: C.plumSoft, fontWeight: 600 }}>
            Bản phân tích cũng đã hiện ở trang bên dưới — không phải chạy AI lần nữa.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
        <button onClick={onClose} style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plumSoft,
          background: C.surface, border: `1.5px solid ${C.pinkSoft}`, borderRadius: 14, padding: "11px 18px", cursor: "pointer" }}>
          {ketQua?.ok ? "Đóng" : "Huỷ"}
        </button>
        <button onClick={gui} disabled={dangGui || !guiDuoc}
          title={guiDuoc ? undefined : "Chưa chọn người nhận nào"}
          style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 9, padding: "11px 20px",
            borderRadius: 14, fontSize: 14, opacity: dangGui || !guiDuoc ? 0.55 : 1,
            cursor: dangGui || !guiDuoc ? "not-allowed" : "pointer" }}>
          {dangGui ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
          {dangGui ? "AI đang phân tích rồi gửi…" : "Chạy AI và gửi mail"}
        </button>
      </div>
    </Modal>
  );
}

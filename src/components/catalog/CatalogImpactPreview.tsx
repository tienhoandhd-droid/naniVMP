/* =====================================================================
 *  CatalogImpactPreview.tsx — xem trước ảnh hưởng trước khi áp vào timeline
 *  ---------------------------------------------------------------------
 *  Sửa danh mục KHÔNG tự đổi timeline. Màn này là chỗ người dùng nhìn thấy
 *  đúng những gì sắp xảy ra, rồi mới quyết định.
 *
 *  Bốn nhóm, và nhóm thứ tư mới là nhóm quan trọng nhất:
 *
 *    Tạo        — hạng mục còn thiếu sẽ được thêm
 *    Sửa        — deadline cũ → deadline mới
 *    Dừng       — hạng mục tương lai của đối tượng thôi thẩm định
 *    Giữ nguyên — hạng mục ĐÃ CÓ TIẾN ĐỘ, hệ thống không đụng vào
 *
 *  Nhóm "giữ nguyên" phải hiện rõ chứ không giấu đi: người dùng cần biết
 *  vì sao có hạng mục không đổi theo, để tự quyết định xử lý riêng. Giấu
 *  nó đi thì họ tưởng đã áp hết và sẽ ngạc nhiên khi thấy deadline cũ.
 * ===================================================================== */
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Lock, Plus, X } from "lucide-react";
import { C, TEXT } from "../../constants/theme.ts";
import { applyCatalogChange, previewCatalogChange } from "../../lib/supabaseData.ts";
import type { AnhHuongTimeline } from "../../lib/supabaseData.ts";

export default function CatalogImpactPreview({ changeId, onClose, onApplied }: {
  changeId: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [anhHuong, setAnhHuong] = useState<AnhHuongTimeline | null>(null);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [lyDo, setLyDo] = useState("");
  const [loiLyDo, setLoiLyDo] = useState<string | null>(null);
  const [dangAp, setDangAp] = useState(false);

  useEffect(() => {
    let con = true;
    setDangTai(true);
    setLoi(null);
    previewCatalogChange(changeId)
      .then((kq) => {
        if (!con) return;
        if (!kq.ok) { setLoi(kq.error ?? "Không xem trước được"); return; }
        setAnhHuong(kq);
      })
      .catch((e: unknown) => {
        if (con) setLoi(e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (con) setDangTai(false); });
    return () => { con = false; };
  }, [changeId]);

  const ap = async () => {
    if (!lyDo.trim()) { setLoiLyDo("Phải nhập lý do trước khi áp vào timeline"); return; }
    setLoiLyDo(null);
    setDangAp(true);
    setLoi(null);
    try {
      const kq = await applyCatalogChange(changeId, lyDo.trim(), anhHuong?.timeline_revision ?? null);
      if (!kq.ok) { setLoi(kq.error ?? "Áp vào timeline thất bại"); return; }
      onApplied();
    } catch (e) {
      setLoi(e instanceof Error ? e.message : String(e));
    } finally {
      setDangAp(false);
    }
  };

  const tao = anhHuong?.tao ?? [];
  const sua = anhHuong?.sua ?? [];
  const dung = anhHuong?.dung ?? [];
  const giu = anhHuong?.giu_nguyen ?? [];
  const canhBao = anhHuong?.canh_bao ?? [];
  const khongCoGi = !dangTai && !loi && !tao.length && !sua.length && !dung.length;

  const the = (nhan: string, so: number, mau: string) => (
    <div style={{ padding: "8px 14px", borderRadius: 12, background: mau, minWidth: 96 }}>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{so}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.plumSoft }}>{nhan}</div>
    </div>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(60,40,60,.35)", zIndex: 70,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24, overflowY: "auto",
    }}>
      <div style={{
        background: C.surface, borderRadius: 20, padding: 22, maxWidth: 880, width: "100%",
        border: `1.5px solid ${C.pinkSoft}`, fontFamily: TEXT, color: C.plum,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Ảnh hưởng tới timeline</div>
          <button type="button" onClick={onClose} aria-label="Đóng"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: C.plumSoft }}>
            <X size={20} />
          </button>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: C.plumSoft }}>
          Danh mục đã lưu rồi. Timeline chỉ đổi sau khi bạn xác nhận ở đây.
        </p>

        {dangTai && <p style={{ color: C.plumSoft }}>Đang tính ảnh hưởng…</p>}

        {loi && (
          <div style={{ display: "flex", gap: 8, padding: 10, borderRadius: 10,
                        background: C.raspSoft, color: C.raspText, marginBottom: 12 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 13 }}>{loi}</span>
          </div>
        )}

        {anhHuong && !dangTai && (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
              {the("Tạo mới", tao.length, C.mintSoft)}
              {the("Đổi deadline", sua.length, C.marigoldSoft)}
              {the("Dừng", dung.length, C.lavSoft)}
              {the("Giữ nguyên", giu.length, C.pinkSoft)}
            </div>

            {khongCoGi && (
              <div style={{ display: "flex", gap: 8, padding: 10, borderRadius: 10,
                            background: C.mintSoft, color: C.mintText, marginBottom: 14 }}>
                <Check size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 13 }}>
                  <b>Không có gì phải áp</b> — timeline đã khớp đúng dữ liệu danh mục
                  hiện tại rồi (có thể một lượt Sinh timeline hoặc áp thay đổi khác đã
                  cập nhật xong trước đó). Đây không phải lỗi, chỉ là không còn việc để
                  làm cho thay đổi này. Bấm "Để sau" để đóng.
                </span>
              </div>
            )}

            {canhBao.length > 0 && (
              <div style={{ padding: 10, borderRadius: 10, background: C.marigoldSoft,
                            color: C.marigoldText, marginBottom: 14, fontSize: 13 }}>
                <b>Thiếu dữ liệu, mốc thời gian sẽ để trống:</b> {canhBao.join(" · ")}
              </div>
            )}

            {sua.length > 0 && (
              <section style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Deadline sẽ đổi</div>
                {sua.slice(0, 12).map((s) => (
                  <div key={s.validation_code} style={{ display: "flex", alignItems: "center", gap: 8,
                                                        fontSize: 13, padding: "3px 0" }}>
                    <span style={{ minWidth: 210, fontWeight: 600 }}>{s.validation_code}</span>
                    <span style={{ color: C.plumSoft }}>{s.deadline_vmp_cu ?? "—"}</span>
                    <ArrowRight size={13} />
                    <span style={{ fontWeight: 700 }}>{s.deadline_vmp_moi ?? "—"}</span>
                  </div>
                ))}
                {sua.length > 12 && <div style={{ fontSize: 12, color: C.plumSoft }}>… và {sua.length - 12} hạng mục nữa</div>}
              </section>
            )}

            {tao.length > 0 && (
              <section style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Hạng mục sẽ được tạo</div>
                {tao.slice(0, 12).map((t) => (
                  <div key={t.validation_code} style={{ display: "flex", alignItems: "center", gap: 8,
                                                        fontSize: 13, padding: "3px 0" }}>
                    <Plus size={13} color={C.mintText} />
                    <span style={{ minWidth: 210, fontWeight: 600 }}>{t.validation_code}</span>
                    <span style={{ color: C.plumSoft }}>{t.deadline_vmp ?? "chưa đủ dữ liệu"}</span>
                  </div>
                ))}
              </section>
            )}

            {/* Nhóm quan trọng nhất: nói rõ vì sao có hạng mục không đổi
                theo, thay vì để người dùng tự phát hiện sau. */}
            {giu.length > 0 && (
              <section style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: C.bg2 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6,
                              display: "flex", alignItems: "center", gap: 6 }}>
                  <Lock size={14} /> Giữ nguyên vì đã có tiến độ
                </div>
                <p style={{ margin: "0 0 6px", fontSize: 12, color: C.plumSoft }}>
                  Những hạng mục này đã có ngày thực tế hoặc đã chuyển trạng thái.
                  Hệ thống không tự đổi deadline của chúng — nếu cần đổi, sửa tay ở màn Cập nhật tiến độ.
                </p>
                {giu.slice(0, 10).map((g) => (
                  <div key={g.validation_code} style={{ fontSize: 13, padding: "2px 0" }}>
                    <b>{g.validation_code}</b>
                    <span style={{ color: C.plumSoft }}> — {g.ly_do}</span>
                  </div>
                ))}
              </section>
            )}

            {!khongCoGi && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  Lý do áp <span style={{ color: C.raspText }}>*</span>
                </span>
                <input value={lyDo} onChange={(e) => setLyDo(e.target.value)}
                  placeholder="Câu này đi vào nhật ký, người sau đọc để hiểu vì sao timeline đổi."
                  style={{ padding: "8px 10px", borderRadius: 10, fontFamily: TEXT, fontSize: 14,
                           border: `1.5px solid ${loiLyDo ? C.rasp : C.pinkSoft}` }} />
                {loiLyDo && <span style={{ fontSize: 12, color: C.raspText, fontWeight: 600 }}>{loiLyDo}</span>}
              </label>
            )}
          </>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose}
            style={{ padding: "10px 16px", borderRadius: 12, cursor: "pointer", fontFamily: TEXT,
                     fontWeight: 700, border: `1.5px solid ${C.pinkSoft}`, background: C.surface, color: C.plum }}>
            Để sau
          </button>
          <button type="button" onClick={ap} disabled={dangAp || dangTai || !!loi || khongCoGi}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 12,
                     cursor: dangAp || dangTai || khongCoGi ? "not-allowed" : "pointer",
                     fontFamily: TEXT, fontWeight: 800, border: "none",
                     background: dangAp || dangTai || khongCoGi ? C.pinkSoft : C.pink,
                     color: dangAp || dangTai || khongCoGi ? C.plumSoft : "#fff" }}>
            <Check size={16} /> {dangAp ? "Đang áp…" : "Áp vào timeline"}
          </button>
        </div>
      </div>
    </div>
  );
}

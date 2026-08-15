/* =====================================================================
 *  CatalogObjectForm.tsx — form sửa một đối tượng danh mục
 *  ---------------------------------------------------------------------
 *  Thay cho lối sửa bằng nhấn đúp vào ô trên bảng. Ba thứ bảng không làm
 *  được, và đều là lý do form này tồn tại:
 *
 *    · nói được "trường này bắt buộc" TRƯỚC khi người dùng bấm Lưu;
 *    · kiểm được liên hệ giữa các trường — có thẩm định thì phải có tháng
 *      đầu tiên, mà hai ô đó nằm cách nhau mười cột trên bảng;
 *    · có chỗ nhập LÝ DO khi sửa thứ ảnh hưởng tới timeline.
 *
 *  Luật nằm ở src/lib/catalogForm.ts, không nằm ở đây. File này chỉ vẽ.
 * ===================================================================== */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Save, X } from "lucide-react";
import { C, TEXT } from "../../constants/theme.ts";
import {
  TRUONG_FORM, buildCatalogPatch, canLyDo, coThamDinh, validateCatalogForm,
} from "../../lib/catalogForm.ts";
import type { GiaTriForm, LoiForm, NhomTruong, TruongForm } from "../../lib/catalogForm.ts";
import PerformerSelect from "../../features/itemPermissions/PerformerSelect.tsx";
import type { PerformerChoice } from "../../features/itemPermissions/performerSelection.ts";

const TEN_NHOM: Record<NhomTruong, string> = {
  chinh: "Thông tin chính",
  ke_hoach: "Kế hoạch thẩm định",
  phan_cong: "Phân công",
  nang_cao: "Nâng cao",
};

function doiSangForm(row: Record<string, unknown>): GiaTriForm {
  const form: GiaTriForm = {};
  for (const t of TRUONG_FORM) {
    const v = row[t.key];
    form[t.key] = v === null || v === undefined ? "" : String(v);
  }
  // Tên chỉ để hiển thị lại cho người dùng nhận ra ai; không gửi lên server.
  form.owner_name = String(row.owner_name ?? "");
  form.support_name = String(row.support_name ?? "");
  return form;
}

export default function CatalogObjectForm({
  row, objectKind, performers, dangTaoMoi, onClose, onSaved,
}: {
  row: Record<string, unknown>;
  objectKind: string;
  performers: readonly PerformerChoice[];
  dangTaoMoi: boolean;
  onClose: () => void;
  onSaved: (patch: Record<string, unknown>, lyDo: string | null, version: number | null) => Promise<void>;
}) {
  const [form, setForm] = useState<GiaTriForm>(() => doiSangForm(row));
  const [lyDo, setLyDo] = useState("");
  const [loi, setLoi] = useState<LoiForm>({});
  const [loiChung, setLoiChung] = useState<string | null>(null);
  const [dangLuu, setDangLuu] = useState(false);
  const [moNangCao, setMoNangCao] = useState(false);

  const banGoc = useMemo(() => doiSangForm(row), [row]);
  const daDoi = useMemo(
    () => TRUONG_FORM.some((t) => (form[t.key] ?? "") !== (banGoc[t.key] ?? "")),
    [form, banGoc],
  );
  const patch = useMemo(() => buildCatalogPatch(form, row), [form, row]);
  const phaiCoLyDo = canLyDo(patch, dangTaoMoi);

  /* Cảnh báo khi đóng tab mà còn thay đổi chưa lưu. Không chặn được thao
     tác đóng modal — cái đó xử lý ở nút X bên dưới. */
  useEffect(() => {
    if (!daDoi) return;
    const canh = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", canh);
    return () => window.removeEventListener("beforeunload", canh);
  }, [daDoi]);

  const dat = (key: string, value: string) => {
    setForm((truoc) => ({ ...truoc, [key]: value }));
    setLoi((truoc) => {
      if (!truoc[key]) return truoc;
      const con = { ...truoc };
      delete con[key];
      return con;
    });
  };

  const dong = () => {
    if (daDoi && !window.confirm("Còn thay đổi chưa lưu. Đóng và bỏ các thay đổi?")) return;
    onClose();
  };

  const luu = async () => {
    const loiMoi = validateCatalogForm(form);
    if (phaiCoLyDo && !lyDo.trim()) {
      loiMoi.__lyDo = "Sửa thông tin ảnh hưởng tới timeline thì phải nhập lý do";
    }
    setLoi(loiMoi);
    if (Object.keys(loiMoi).length) return;

    setDangLuu(true);
    setLoiChung(null);
    try {
      const version = row.version === null || row.version === undefined
        ? null : Number(row.version);
      await onSaved(patch, lyDo.trim() || null, dangTaoMoi ? null : version);
    } catch (e) {
      setLoiChung(e instanceof Error ? e.message : String(e));
    } finally {
      setDangLuu(false);
    }
  };

  const veTruong = (t: TruongForm) => {
    const khoa = t.khoaSauKhiTao && !dangTaoMoi;
    const loiO = loi[t.key];
    return (
      <label key={t.key} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220, flex: "1 1 240px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.plum }}>
          {t.label}{t.batBuoc && <span style={{ color: C.raspText }}> *</span>}
        </span>

        {t.chonNguoi ? (
          <PerformerSelect
            value={form[t.key] || null}
            options={performers}
            allowClear
            ariaLabel={t.label}
            onChange={(id) => dat(t.key, id ?? "")}
            disabled={khoa}
          />
        ) : t.chon ? (
          <select value={form[t.key] ?? ""} disabled={khoa} onChange={(e) => dat(t.key, e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 10, fontFamily: TEXT, fontSize: 14,
                     border: `1.5px solid ${loiO ? C.rasp : C.pinkSoft}`, background: khoa ? C.bg2 : C.surface }}>
            <option value="">—</option>
            {t.chon.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        ) : (
          <input value={form[t.key] ?? ""} disabled={khoa}
            inputMode={t.so ? "numeric" : undefined}
            onChange={(e) => dat(t.key, e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 10, fontFamily: TEXT, fontSize: 14,
                     border: `1.5px solid ${loiO ? C.rasp : C.pinkSoft}`, background: khoa ? C.bg2 : C.surface }} />
        )}

        {/* Lỗi đặt NGAY dưới ô, không gom vào một hộp chung ở đầu form —
            người dùng phải thấy sai ở đâu mà không phải dò. */}
        {loiO && <span style={{ fontSize: 12, color: C.raspText, fontWeight: 600 }}>{loiO}</span>}
        {!loiO && t.goiY && <span style={{ fontSize: 12, color: C.plumSoft }}>{t.goiY}</span>}
      </label>
    );
  };

  const nhom = (id: NhomTruong) => TRUONG_FORM.filter((t) => t.nhom === id);
  const hienKeHoach = coThamDinh(form);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(60,40,60,.35)", zIndex: 60,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24, overflowY: "auto",
    }}>
      <div style={{
        background: C.surface, borderRadius: 20, padding: 22, maxWidth: 980, width: "100%",
        border: `1.5px solid ${C.pinkSoft}`, fontFamily: TEXT, color: C.plum,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>
            {dangTaoMoi ? "Thêm đối tượng" : `Sửa ${row.object_code ?? ""}`}
            <span style={{ fontSize: 13, fontWeight: 600, color: C.plumSoft, marginLeft: 8 }}>{objectKind}</span>
          </div>
          <button type="button" onClick={dong} aria-label="Đóng"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: C.plumSoft }}>
            <X size={20} />
          </button>
        </div>

        {(["chinh", "ke_hoach", "phan_cong"] as const).map((id) => {
          if (id === "ke_hoach" && !hienKeHoach) return null;
          return (
            <section key={id} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.plumSoft, marginBottom: 8 }}>
                {TEN_NHOM[id]}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{nhom(id).map(veTruong)}</div>
            </section>
          );
        })}

        {/* Nâng cao thu gọn sẵn: mở form ra mà thấy hai chục ô thì không ai
            biết bắt đầu từ đâu. */}
        <section style={{ marginBottom: 16 }}>
          <button type="button" onClick={() => setMoNangCao((v) => !v)}
            style={{ border: "none", background: "transparent", cursor: "pointer",
                     fontFamily: TEXT, fontSize: 13, fontWeight: 800, color: C.plumSoft, padding: 0 }}>
            {moNangCao ? "▾" : "▸"} {TEN_NHOM.nang_cao}
          </button>
          {moNangCao && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
              {nhom("nang_cao").map(veTruong)}
            </div>
          )}
        </section>

        {phaiCoLyDo && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.plum }}>
              Lý do thay đổi <span style={{ color: C.raspText }}>*</span>
            </span>
            <input value={lyDo} onChange={(e) => setLyDo(e.target.value)}
              placeholder="Vì sao đổi? Câu này đi vào nhật ký, người sau đọc để hiểu."
              style={{ padding: "8px 10px", borderRadius: 10, fontFamily: TEXT, fontSize: 14,
                       border: `1.5px solid ${loi.__lyDo ? C.rasp : C.pinkSoft}` }} />
            {loi.__lyDo && <span style={{ fontSize: 12, color: C.raspText, fontWeight: 600 }}>{loi.__lyDo}</span>}
            <span style={{ fontSize: 12, color: C.plumSoft }}>
              Thay đổi này chạm tới deadline hoặc phân công, nên timeline sẽ cần cập nhật lại.
            </span>
          </label>
        )}

        {loiChung && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 12,
                        padding: 10, borderRadius: 10, background: C.raspSoft, color: C.raspText }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 13 }}>{loiChung}</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={dong}
            style={{ padding: "10px 16px", borderRadius: 12, cursor: "pointer", fontFamily: TEXT,
                     fontWeight: 700, border: `1.5px solid ${C.pinkSoft}`, background: C.surface, color: C.plum }}>
            Huỷ
          </button>
          <button type="button" onClick={luu} disabled={dangLuu || (!daDoi && !dangTaoMoi)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 12,
                     cursor: dangLuu || (!daDoi && !dangTaoMoi) ? "not-allowed" : "pointer",
                     fontFamily: TEXT, fontWeight: 800, border: "none",
                     background: dangLuu || (!daDoi && !dangTaoMoi) ? C.pinkSoft : C.pink,
                     color: dangLuu || (!daDoi && !dangTaoMoi) ? C.plumSoft : "#fff" }}>
            <Save size={16} /> {dangLuu ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
 *
 *  Khi SỬA, form mở ở dạng đối chiếu hai cột: bên trái là dữ liệu đang có
 *  trên hệ thống, bên phải là chỗ gõ. Người ký hồ sơ GMP chịu trách nhiệm
 *  cho con số mình vừa đổi, nên phải nhìn thấy con số cũ ngay cạnh nó —
 *  chứ không phải nhớ trong đầu rồi bấm Lưu.
 *
 *  Vỏ hộp thoại (bẫy tiêu điểm, làm trơ nền, Escape, chân hộp luôn nhìn
 *  thấy dù thân dài) thuộc về `ViewportDialog`. Ở đây không tự dựng lại —
 *  bản trước tự dựng một lớp phủ `position: fixed` và mất cả bốn thứ đó.
 * ===================================================================== */
import { useMemo, useState } from "react";
import { AlertTriangle, Boxes, Lock, Save } from "lucide-react";

import ViewportDialog from "../ui/ViewportDialog.tsx";
import { useRegisterDirtyState } from "../ui/DirtyStateProvider.tsx";
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

/** Giá trị đọc cho người, không phải cho máy. Ô trống hiện gạch ngang chứ
 *  không để trắng — dòng trắng nhìn như hệ thống tải thiếu dữ liệu. */
function doc(t: TruongForm, form: GiaTriForm): string {
  if (t.chonNguoi) {
    const ten = t.chonNguoi === "owner" ? form.owner_name : form.support_name;
    return ten?.trim() || "—";
  }
  return (form[t.key] ?? "").trim() || "—";
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
  const doiGi = useMemo(
    () => TRUONG_FORM.filter((t) => (form[t.key] ?? "") !== (banGoc[t.key] ?? "")),
    [form, banGoc],
  );
  const daDoi = doiGi.length > 0;
  const patch = useMemo(() => buildCatalogPatch(form, row), [form, row]);
  const phaiCoLyDo = canLyDo(patch, dangTaoMoi);

  /* Báo cho shell biết còn thay đổi chưa lưu. Bản trước gắn `beforeunload`
     ngay tại đây; sổ dùng chung làm được đúng việc đó mà không để lại
     listener toàn cục cho từng form. */
  useRegisterDirtyState(`catalog-object-${String(row.object_code ?? "moi")}`, daDoi);

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
      /* Tạo mới không hỏi lý do người dùng: hành động đã tự nói lên nó,
         nên gửi lý do hệ thống để dòng nhật ký vẫn có nội dung đọc được. */
      const lyDoGui = dangTaoMoi ? "Tạo mới từ form" : (lyDo.trim() || null);
      await onSaved(patch, lyDoGui, dangTaoMoi ? null : version);
    } catch (e) {
      setLoiChung(e instanceof Error ? e.message : String(e));
    } finally {
      setDangLuu(false);
    }
  };

  const veTruong = (t: TruongForm) => {
    const khoa = t.khoaSauKhiTao && !dangTaoMoi;
    const loiO = loi[t.key];
    const id = `cof-${t.key}`;
    const idLoi = `${id}-loi`;
    const idGoiY = `${id}-goi-y`;
    const daSua = (form[t.key] ?? "") !== (banGoc[t.key] ?? "");
    const moTa = [loiO ? idLoi : null, t.goiY ? idGoiY : null].filter(Boolean).join(" ") || undefined;
    const lop = `cw-o${daSua ? " is-doi" : ""}${loiO ? " is-loi" : ""}`;

    return (
      <div key={t.key} className="cw-truong">
        <label htmlFor={id} className="cw-nhan">
          {t.label}
          {t.batBuoc && <span className="cw-bat-buoc" aria-hidden="true">*</span>}
          {khoa && <Lock size={13} aria-hidden="true" className="cw-khoa-icon" />}
        </label>

        {t.chonNguoi ? (
          <PerformerSelect
            value={form[t.key] || null}
            options={performers}
            allowClear
            ariaLabel={t.label}
            onChange={(nguoi) => dat(t.key, nguoi ?? "")}
            disabled={khoa}
          />
        ) : t.chon ? (
          <select id={id} className={lop} value={form[t.key] ?? ""} disabled={khoa}
            aria-invalid={loiO ? true : undefined} aria-describedby={moTa}
            onChange={(e) => dat(t.key, e.target.value)}>
            <option value="">—</option>
            {t.chon.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        ) : (
          <input id={id} className={lop} value={form[t.key] ?? ""} disabled={khoa}
            inputMode={t.so ? "numeric" : undefined}
            aria-invalid={loiO ? true : undefined} aria-describedby={moTa}
            onChange={(e) => dat(t.key, e.target.value)} />
        )}

        {/* Lỗi đặt NGAY dưới ô, không gom vào một hộp chung ở đầu form —
            người dùng phải thấy sai ở đâu mà không phải dò. */}
        {loiO && <p id={idLoi} className="cw-loi" role="alert">{loiO}</p>}
        {!loiO && t.goiY && <p id={idGoiY} className="cw-goi-y">{t.goiY}</p>}
      </div>
    );
  };

  const nhom = (id: NhomTruong) => TRUONG_FORM.filter((t) => t.nhom === id);
  const hienKeHoach = coThamDinh(form);
  const khoaLuu = dangLuu || (!daDoi && !dangTaoMoi);

  return (
    <ViewportDialog
      open
      title={dangTaoMoi ? "Thêm đối tượng" : `Sửa ${String(row.object_code ?? "")}`}
      description={objectKind}
      icon={Boxes}
      maxWidth={dangTaoMoi ? 720 : 1080}
      onRequestClose={dong}
      footer={
        <>
          <button type="button" onClick={dong} className="cw-nut cw-nut--phu">Huỷ</button>
          <button type="button" onClick={luu} disabled={khoaLuu} className="cw-nut cw-nut--chinh">
            <Save size={16} aria-hidden="true" /> {dangLuu ? "Đang lưu…" : "Lưu"}
          </button>
        </>
      }
    >
      <div className={dangTaoMoi ? "cw-than cw-than--tao" : "cw-than cw-than--sua"}>
        {/* Cột đối chiếu chỉ có nghĩa khi đang sửa: lúc tạo mới thì "hiện
            tại" là một cột trống hoàn toàn, chiếm chỗ mà không nói gì. */}
        {!dangTaoMoi && (
          <section className="cw-cot cw-cot--truoc" aria-label="Dữ liệu hiện tại">
            <h3 className="cw-cot__ten">Dữ liệu hiện tại</h3>
            <dl className="cw-doc">
              {TRUONG_FORM.map((t) => {
                const daSua = (form[t.key] ?? "") !== (banGoc[t.key] ?? "");
                return (
                  <div key={t.key} className={daSua ? "cw-doc__dong is-doi" : "cw-doc__dong"}>
                    <dt>{t.label}</dt>
                    <dd>{doc(t, banGoc)}</dd>
                  </div>
                );
              })}
            </dl>
          </section>
        )}

        <section className="cw-cot cw-cot--sau"
          aria-label={dangTaoMoi ? "Thông tin đối tượng mới" : "Sau khi thay đổi"}>
          {!dangTaoMoi && <h3 className="cw-cot__ten">Sau khi thay đổi</h3>}

          {(["chinh", "ke_hoach", "phan_cong"] as const).map((id) => {
            if (id === "ke_hoach" && !hienKeHoach) return null;
            return (
              <section key={id} className="cw-nhom-truong">
                <h4 className="cw-cot__ten">{TEN_NHOM[id]}</h4>
                <div className="cw-nhom">{nhom(id).map(veTruong)}</div>
              </section>
            );
          })}

          {/* Nâng cao thu gọn sẵn: mở form ra mà thấy hai chục ô thì không ai
              biết bắt đầu từ đâu. */}
          <details className="cw-nang-cao" open={moNangCao}
            onToggle={(e) => setMoNangCao((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>{TEN_NHOM.nang_cao} ({nhom("nang_cao").length} trường)</summary>
            <div className="cw-nhom">{nhom("nang_cao").map(veTruong)}</div>
          </details>
        </section>
      </div>

      {/* Tóm tắt đặt sau form, ngay trên hàng nút: đây là thứ cuối cùng
          người dùng đọc trước khi chịu trách nhiệm cho thay đổi. */}
      {!dangTaoMoi && daDoi && (
        <section className="cw-tom-tat" aria-label="Tóm tắt thay đổi">
          <h3>Sẽ thay đổi {doiGi.length} trường</h3>
          <ul>
            {doiGi.map((t) => (
              <li key={t.key}>
                <b>{t.label}</b>: {doc(t, banGoc)} <span aria-hidden="true">→</span> {doc(t, form)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {phaiCoLyDo && (
        <div className="cw-truong cw-ly-do">
          <label htmlFor="cof-ly-do" className="cw-nhan">
            Lý do thay đổi<span className="cw-bat-buoc" aria-hidden="true">*</span>
          </label>
          <input id="cof-ly-do" value={lyDo} onChange={(e) => setLyDo(e.target.value)}
            className={`cw-o${loi.__lyDo ? " is-loi" : ""}`}
            aria-invalid={loi.__lyDo ? true : undefined}
            aria-describedby={loi.__lyDo ? "cof-ly-do-loi" : "cof-ly-do-goi-y"}
            placeholder="Vì sao đổi? Câu này đi vào nhật ký, người sau đọc để hiểu." />
          {loi.__lyDo && <p id="cof-ly-do-loi" className="cw-loi" role="alert">{loi.__lyDo}</p>}
          <p id="cof-ly-do-goi-y" className="cw-goi-y">
            Thay đổi này chạm tới deadline hoặc phân công, nên timeline sẽ cần cập nhật lại.
          </p>
        </div>
      )}

      {loiChung && (
        <p className="cw-canh-bao cw-canh-bao--loi" role="alert">
          <AlertTriangle size={16} aria-hidden="true" /> {loiChung}
        </p>
      )}
    </ViewportDialog>
  );
}

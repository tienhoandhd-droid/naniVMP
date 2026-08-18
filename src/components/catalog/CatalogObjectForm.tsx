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
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, Lock, Save } from "lucide-react";

import ViewportDialog from "../ui/ViewportDialog.tsx";
import { useRegisterDirtyState } from "../ui/DirtyStateProvider.tsx";
import {
  TRUONG_FORM, BO_PHAN_CHUAN,
  buildCatalogPatch, canLyDo, coThamDinh, validateCatalogForm, truongThieuDauTien,
} from "../../lib/catalogForm.ts";
import type { GiaTriForm, LoiForm, NhomTruong, TruongForm } from "../../lib/catalogForm.ts";
import ChonHoacGo from "../../features/catalogWorkspace/ChonHoacGo.tsx";
import PerformerSelect from "../../features/itemPermissions/PerformerSelect.tsx";
import type { PerformerChoice } from "../../features/itemPermissions/performerSelection.ts";
import type { GoiY } from "../../features/catalogWorkspace/suggestions.ts";

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
  row, objectKind, performers, dangTaoMoi, onClose, onSaved, goiY,
}: {
  row: Record<string, unknown>;
  objectKind: string;
  performers: readonly PerformerChoice[];
  dangTaoMoi: boolean;
  onClose: () => void;
  onSaved: (patch: Record<string, unknown>, lyDo: string | null, version: number | null) => Promise<void>;
  /** Gợi ý combobox theo cột (khu vực, line, nhóm công việc…). Tuỳ chọn —
   *  khi chưa được truyền xuống, ô combobox chỉ đơn giản không có gợi ý. */
  goiY?: GoiY;
}) {
  const [form, setForm] = useState<GiaTriForm>(() => doiSangForm(row));
  const [lyDo, setLyDo] = useState("");
  const [loi, setLoi] = useState<LoiForm>({});
  const [loiChung, setLoiChung] = useState<string | null>(null);
  const [dangLuu, setDangLuu] = useState(false);
  const [moNangCao, setMoNangCao] = useState(false);
  /* Chế độ "khác" của từng ô do chính `ChonHoacGo` nhớ — nó biết giá trị
     rỗng nghĩa là "chưa chọn" hay "chọn khác nhưng chưa gõ", còn form này
     thì không cần biết. */
  /* Ô cần đưa tiêu điểm vào sau lần bấm Lưu thất bại — nhảy thẳng tới ô
     bắt buộc còn trống thay vì chỉ làm mờ nút Lưu. */
  /* Ô cần đặt con trỏ vào sau khi bấm Lưu mà còn thiếu. Kèm số lần bấm để
     lần thứ hai vẫn nhảy lại — chỉ giữ tên ô thì giá trị không đổi và hiệu
     ứng không chạy nữa.
     KHÔNG dùng `autoFocus`: thuộc tính đó của React chỉ có tác dụng lúc
     phần tử được gắn vào cây, mà ô trong `<details>` thu gọn vẫn đang mount
     sẵn — bật lên sau đó không làm gì cả. */
  const [oCanNhay, setOCanNhay] = useState<{ key: string; lan: number } | null>(null);
  useEffect(() => {
    if (!oCanNhay) return;
    const el = document.getElementById(`cof-${oCanNhay.key}`);
    if (!el) return;
    el.focus();
    el.scrollIntoView({ block: "center" });
  }, [oCanNhay]);

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
    setOCanNhay(null);
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
    if (Object.keys(loiMoi).length) {
      const dau = truongThieuDauTien(form);
      if (dau) {
        // Nhóm Nâng cao đang thu gọn thì mở ra, nếu không người dùng nhận
        // một câu lỗi trỏ tới ô họ không nhìn thấy.
        if (TRUONG_FORM.find((t) => t.key === dau)?.nhom === "nang_cao") setMoNangCao(true);
        setOCanNhay((cu) => ({ key: dau, lan: (cu?.lan ?? 0) + 1 }));
      }
      return;
    }

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
          {t.batBuoc && <span className="cw-bat-buoc-chu">Bắt buộc</span>}
          {khoa && <Lock size={13} aria-hidden="true" className="cw-khoa-icon" />}
        </label>

        {/* Bộ phận và các ô danh mục mở (khu vực, line, nhóm công việc) dùng
            chung MỘT kiểu ô: chọn trong danh sách, cuối danh sách có lối
            thoát để nhập giá trị mới. Bản trước dựng ô danh mục mở bằng
            `<input list>` + datalist — trình duyệt tự lọc gợi ý theo chữ
            đang có trong ô, nên ô đã mang "Line 1" thì bấm xuống chỉ thấy
            đúng một dòng, và người dùng tưởng hệ chỉ biết một giá trị. */}
        {t.chonCoKhac || t.goiYTu ? (
          <ChonHoacGo
            id={id}
            className={lop}
            value={form[t.key] ?? ""}
            options={t.chonCoKhac
              ? BO_PHAN_CHUAN.map((b) => ({ value: b.ma, label: b.ten }))
              : (goiY?.[t.goiYTu ?? ""] ?? []).map((v) => ({ value: v, label: v }))}
            onChange={(v) => dat(t.key, v)}
            disabled={khoa}
            required={t.batBuoc}
            ariaDescribedBy={moTa}
            ariaInvalid={Boolean(loiO)}
            nhanOGo={`${t.label} — nhập giá trị mới`}
            goiYGo={t.chonCoKhac ? "Tên bộ phận mới" : undefined}
            focusSignal={oCanNhay?.key === t.key ? oCanNhay.lan : undefined}
          />
        ) : t.chonNguoi ? (
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

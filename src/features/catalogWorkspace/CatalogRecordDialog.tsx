/* =====================================================================
 *  CatalogRecordDialog — tạo mới và sửa bản ghi danh mục
 *  ---------------------------------------------------------------------
 *  Một vỏ dùng chung cho cả ba dataset. Hai chế độ:
 *
 *   · TẠO MỚI — một cột, chỉ hỏi những gì cần để tạo. Không hỏi lý do:
 *     lý do hệ thống là "Tạo mới từ form", và bắt người ta giải thích vì
 *     sao thêm một thiết bị mới là thủ tục vô nghĩa.
 *
 *   · SỬA — hai cột đối chiếu "Hiện tại" và "Sau khi thay đổi", kèm bản
 *     tóm tắt những gì sẽ đổi. Người ký hồ sơ GMP cần thấy trước cái mình
 *     sắp chịu trách nhiệm, không phải bấm Lưu rồi mới biết.
 *
 *  Cơ chế hộp thoại (bẫy tiêu điểm, làm trơ nền, Escape) hoàn toàn thuộc
 *  về `ViewportDialog` của Foundation — ở đây không tự dựng lại cái nào.
 * ===================================================================== */
import { useMemo, useRef, useState } from "react";
import { Boxes } from "lucide-react";

import ViewportDialog from "../../components/ui/ViewportDialog.tsx";
import { useRegisterDirtyState } from "../../components/ui/DirtyStateProvider.tsx";
import { useToast } from "../../components/ui/ToastProvider.tsx";
import { validateDatasetForm } from "../../lib/datasetForm.ts";
import CatalogField from "./CatalogField.tsx";
import { chiaNhomTruong, layDataset } from "./definitions.ts";
import { buildCatalogPatch, canLyDo, diffCatalogRecord, thieuTruongBatBuoc } from "./diff.ts";
import { saveRecord } from "./api.ts";
import type { CatalogDatasetId, CatalogRecord, CatalogSaveResult } from "./contracts.ts";
import type { GoiY } from "./suggestions.ts";

export interface CatalogRecordDialogProps {
  open: boolean;
  dataset: CatalogDatasetId;
  /** Bản ghi đang sửa. `null` nghĩa là tạo mới. */
  record: CatalogRecord | null;
  /** Bắt buộc cho dataset `objects`: loại đối tượng quyết định bảng bị ghi. */
  objectKind?: string;
  canEdit: boolean;
  /** Giá trị đã có trong hồ sơ, gợi ý cho các ô combobox. */
  goiY?: GoiY;
  onClose: () => void;
  onSaved: (kq: { recordId?: string; version?: number }) => void;
}

/* Bản ghi mới của Người nhận cảnh báo phải có Phạm vi và Loại cảnh báo.
   Để trống thì bảng vẫn hiện người này "Đang bật" nhưng workflow không
   biết lọc theo gì — họ có thể không nhận được email nào mà chẳng có lỗi
   nào báo. Đặt mặc định rộng nhất thay vì bắt điền thêm hai ô: mặc định
   an toàn không phiền ai, còn ô bắt buộc thì có.
   Chuỗi phải khớp ĐÚNG CHỮ với `options` khai trong definitions.ts — sai
   một dấu là select mở ra rỗng và người dùng tưởng mình chưa chọn. */
const MAC_DINH_TAO_MOI: Partial<Record<CatalogDatasetId, CatalogRecord>> = {
  alerts: { scope_type: "tất cả", alert_kind: "cả hai" },
};

export function requiredReasonState(required: boolean, reason: string): { invalid: boolean; message: string | null } {
  return required && !reason.trim()
    ? { invalid: true, message: "Hãy ghi lý do thay đổi để lưu vào nhật ký." }
    : { invalid: false, message: null };
}

export function closeCatalogRecordIfIdle(saving: boolean, onClose: () => void): void {
  if (!saving) onClose();
}

/** Hiện giá trị cho người đọc, không phải cho máy. */
function doc(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Có" : "Không";
  return String(v);
}

export default function CatalogRecordDialog({
  open, dataset, record, objectKind, canEdit, goiY, onClose, onSaved,
}: CatalogRecordDialogProps) {
  const def = layDataset(dataset);
  const laTaoMoi = record === null;
  const toast = useToast();

  const [nhap, setNhap] = useState<CatalogRecord>(
    () => ({ ...(record === null ? MAC_DINH_TAO_MOI[dataset] : {}), ...(record || {}) }));
  const [lyDo, setLyDo] = useState("");
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState<CatalogSaveResult | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const reasonInputRef = useRef<HTMLInputElement | null>(null);
  const [moNangCao, setMoNangCao] = useState(false);
  /* Ô nào cần đặt con trỏ vào — đặt khi người dùng bấm Lưu mà còn thiếu.
     Kèm số lần để bấm Lưu hai lần liên tiếp vẫn nhảy lại: nếu chỉ giữ tên
     ô thì lần thứ hai giá trị không đổi và hiệu ứng không chạy nữa. */
  const [oCanNhay, setOCanNhay] = useState<{ key: string; lan: number } | null>(null);

  /* Nạp lại khi người dùng mở sang bản ghi khác. Không có đoạn này thì lần
     mở thứ hai vẫn hiện dữ liệu của bản ghi thứ nhất — và tệ hơn, patch
     tính ra sẽ ghi giá trị của bản cũ đè lên bản mới.
     Đây là cách React khuyến nghị để chỉnh state theo props: so trong lúc
     render rồi setState, không phải useEffect (useEffect chạy sau khi đã
     vẽ một khung hình sai lên màn hình). */
  const [nguon, setNguon] = useState<CatalogRecord | null>(record);
  if (nguon !== record) {
    setNguon(record);
    setNhap({ ...(record === null ? MAC_DINH_TAO_MOI[dataset] : {}), ...(record || {}) });
    setLyDo("");
    setLoi(null);
    setReasonError(null);
    setOCanNhay(null);
  }

  /* Cả lúc tạo lẫn lúc sửa đều đi qua `buildCatalogPatch`: nó loại trường
     khoá nghiệp vụ (server gửi riêng) và ép kiểu số/boolean về đúng dạng.
     Gửi thẳng state thô sẽ lọt "7" thay vì 7, và lọt cả cột readonly — bị
     whitelist của server từ chối với thông báo nghe như người dùng sai. */
  const patch = useMemo(
    () => buildCatalogPatch(def.fields, laTaoMoi ? null : record, nhap),
    [def.fields, laTaoMoi, record, nhap],
  );
  const doiGi = useMemo(() => diffCatalogRecord(def.fields, record, nhap).filter((d) => d.changed),
    [def.fields, record, nhap]);
  const thieu = useMemo(() => thieuTruongBatBuoc(def.fields, nhap), [def.fields, nhap]);
  const phaiNeuLyDo = !laTaoMoi && canLyDo(def.fields, patch);
  const reasonState = requiredReasonState(phaiNeuLyDo, lyDo);

  /* Luật riêng của từng dataset (định dạng email, phạm vi phải có mã) đã
     nằm trong repo từ lâu nhưng KHÔNG file nào import — nghĩa là email sai
     một ký tự hiện không bị chặn ở form, mà mail cảnh báo thì lặng lẽ
     không tới ai. Nối lại thay vì để nó nằm chết. */
  const loiTruong = useMemo(() => validateDatasetForm(dataset, nhap), [dataset, nhap]);

  // Báo cho shell biết còn thay đổi chưa lưu, để nút Thoát hỏi lại.
  useRegisterDirtyState(`catalog-${dataset}`, open && Object.keys(patch).length > 0);

  /* Năm trường đầu là "thông tin chính", phần còn lại xếp vào Nâng cao —
     một form mười sáu ô mở sẵn khiến người dùng không biết bắt đầu ở đâu.
     Nhưng ô BẮT BUỘC thì không bao giờ được rơi xuống phần thu gọn: xem
     `chiaNhomTruong`. */
  const { chinh, nangCao } = useMemo(() => chiaNhomTruong(def.fields), [def.fields]);
  const thieuTrongNangCao = thieu.filter((t) => nangCao.some((f) => f.key === t.key));

  /* Phạm vi "bộ phận" thì gợi ý bộ phận, "khu vực" thì gợi ý mã khu vực.
     Gợi ý sai loại còn tệ hơn không gợi ý: người dùng chọn đại một cái
     trông quen mắt rồi cảnh báo lọc trượt hết mà không ai biết. */
  const goiYCho = (key: string): readonly string[] | undefined => {
    if (dataset !== "alerts" || key !== "scope") return goiY?.[key];
    const pv = String(nhap.scope_type ?? "").toLowerCase();
    if (pv.includes("bộ phận")) return goiY?.department;
    if (pv.includes("khu vực")) return goiY?.area_code;
    return undefined;
  };

  const datGiaTri = (key: string, v: unknown) => {
    setNhap((cu) => ({ ...cu, [key]: v }));
    setLoi(null);
    // Người dùng tự chuyển sang ô khác thì đừng giật con trỏ về chỗ cũ.
    setOCanNhay(null);
  };

  /** Mở đúng nhóm đang chứa ô có vấn đề rồi đặt con trỏ vào đó. Chỉ báo
   *  "còn thiếu" mà không mở phần thu gọn là bắt người dùng đi tìm. */
  const nhayToiO = (key: string) => {
    if (nangCao.some((f) => f.key === key)) setMoNangCao(true);
    setOCanNhay((cu) => ({ key, lan: (cu?.lan ?? 0) + 1 }));
  };

  const luu = async () => {
    if (thieu.length > 0) { nhayToiO(thieu[0].key); return; }
    const keyLoi = Object.keys(loiTruong);
    if (keyLoi.length > 0) { nhayToiO(keyLoi[0]); return; }
    if (reasonState.invalid) {
      setReasonError(reasonState.message);
      reasonInputRef.current?.focus();
      return;
    }

    setDangLuu(true);
    const khoa = String(nhap[def.businessKeyField] ?? "");
    const dang = toast.dangChay(laTaoMoi ? `Đang tạo ${khoa}…` : `Đang lưu ${khoa}…`);
    const kq = await saveRecord({
      dataset,
      businessKey: khoa,
      recordId: record ? String(record.id ?? "") : undefined,
      patch,
      // Tạo mới thì lý do đã rõ từ chính hành động; bắt người dùng gõ thêm
      // một câu giải thích vì sao thêm thiết bị mới là thủ tục vô nghĩa.
      reason: laTaoMoi ? "Tạo mới từ form" : lyDo,
      expectedVersion: record ? Number(record.version ?? 1) : null,
      objectKind: objectKind || null,
    });
    setDangLuu(false);

    if (!kq.ok) {
      dang.hong(kq.error || "Lưu thất bại");
      // Hộp thoại VẪN MỞ và dữ liệu vừa gõ còn nguyên — đóng lúc lưu hỏng
      // là bắt người dùng nhập lại từ đầu để chịu đúng lỗi đó lần nữa.
      setLoi(kq);
      return;
    }
    dang.xong(laTaoMoi ? `Đã tạo ${khoa}` : `Đã lưu ${khoa}`);
    onSaved({ recordId: kq.recordId, version: kq.version });
    onClose();
  };

  /* Nút Lưu KHÔNG mờ vì thiếu ô bắt buộc, kể cả lý do. Nút mờ mà không nói vì sao là
     cách chắc chắn khiến người dùng nghĩ hệ thống hỏng: họ bấm, không có
     gì xảy ra, mà ô cần điền có thể đang nằm trong phần thu gọn. Cho bấm,
     rồi mở đúng phần đó ra và đặt con trỏ vào ô còn trống.
     Hai trường hợp còn lại vẫn mờ vì lý do hiện rõ ngay trên màn: không đủ
     quyền (có băng báo ở đầu hộp thoại) và chưa đổi gì (không có gì để ghi). */
  const khongLuuDuoc = !canEdit || dangLuu
    || Object.keys(patch).length === 0;
  const requestClose = () => closeCatalogRecordIfIdle(dangLuu, onClose);

  return (
    <ViewportDialog
      open={open}
      title={laTaoMoi ? `Thêm ${def.label.toLowerCase()}` : `Sửa ${def.label.toLowerCase()}`}
      description={laTaoMoi ? def.description : `Đang sửa: ${String(record?.[def.businessKeyField] ?? "")}`}
      icon={Boxes}
      maxWidth={laTaoMoi ? 620 : 940}
      onRequestClose={requestClose}
      footer={
        <>
          <button type="button" onClick={requestClose} disabled={dangLuu}
            className="cw-nut cw-nut--phu">Huỷ</button>
          <button type="button" onClick={luu} disabled={khongLuuDuoc}
            className="cw-nut cw-nut--chinh">
            {dangLuu ? "Đang lưu…" : laTaoMoi ? "Tạo mới" : "Lưu thay đổi"}
          </button>
        </>
      }
    >
      {!canEdit && (
        <p className="cw-canh-bao" role="status">
          Bạn đang ở chế độ chỉ xem. Chỉ Admin và Quản lý QA sửa được danh mục.
        </p>
      )}

      <div className={laTaoMoi ? "cw-than cw-than--tao" : "cw-than cw-than--sua"}>
        {/* Cột trái khi SỬA: giá trị hiện tại, chỉ để đọc. */}
        {!laTaoMoi && (
          <section className="cw-cot cw-cot--truoc" aria-label="Dữ liệu hiện tại">
            <h3 className="cw-cot__ten">Dữ liệu hiện tại</h3>
            <dl className="cw-doc">
              {def.fields.map((f) => (
                <div key={f.key} className={patch[f.key] !== undefined ? "cw-doc__dong is-doi" : "cw-doc__dong"}>
                  <dt>{f.label}</dt>
                  <dd>{doc(record?.[f.key])}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="cw-cot cw-cot--sau" aria-label={laTaoMoi ? "Thông tin mới" : "Sau khi thay đổi"}>
          {!laTaoMoi && <h3 className="cw-cot__ten">Sau khi thay đổi</h3>}

          <div className="cw-nhom">
            {chinh.map((f) => (
              <CatalogField key={f.key} field={f} value={nhap[f.key]}
                onChange={(v) => datGiaTri(f.key, v)}
                locked={!canEdit} lockReason={!canEdit ? "Bạn không có quyền sửa" : undefined}
                changed={patch[f.key] !== undefined} idPrefix={`cw-${dataset}`}
                goiY={goiYCho(f.key)} error={loiTruong[f.key]}
                focusSignal={oCanNhay?.key === f.key ? oCanNhay.lan : undefined} />
            ))}
          </div>

          {nangCao.length > 0 && (
            <details className="cw-nang-cao" open={moNangCao}
              onToggle={(e) => setMoNangCao((e.currentTarget as HTMLDetailsElement).open)}>
              {/* Nói trước còn bao nhiêu ô chưa điền bên trong: người dùng
                  không phải mở ra mới biết có việc phải làm ở đó. */}
              <summary>
                Nâng cao ({nangCao.length} trường
                {thieuTrongNangCao.length > 0 && ` · còn ${thieuTrongNangCao.length} ô chưa điền`})
              </summary>
              <div className="cw-nhom">
                {nangCao.map((f) => (
                  <CatalogField key={f.key} field={f} value={nhap[f.key]}
                    onChange={(v) => datGiaTri(f.key, v)}
                    locked={!canEdit} lockReason={!canEdit ? "Bạn không có quyền sửa" : undefined}
                    changed={patch[f.key] !== undefined} idPrefix={`cw-${dataset}`}
                    goiY={goiYCho(f.key)} error={loiTruong[f.key]}
                    focusSignal={oCanNhay?.key === f.key ? oCanNhay.lan : undefined} />
                ))}
              </div>
            </details>
          )}
        </section>
      </div>

      {/* Tóm tắt thay đổi — đặt SAU form, ngay trên hàng nút, để nó là thứ
          cuối cùng người dùng đọc trước khi bấm Lưu. */}
      {!laTaoMoi && doiGi.length > 0 && (
        <section className="cw-tom-tat" aria-label="Tóm tắt thay đổi">
          <h3>Sẽ thay đổi {doiGi.length} trường</h3>
          <ul>
            {doiGi.map((d) => (
              <li key={d.key}>
                <b>{d.label}</b>: {doc(d.before)} <span aria-hidden="true">→</span> {doc(d.after)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {thieu.length > 0 && (
        <p className="cw-loi" role="alert">
          Còn thiếu: {thieu.map((t) => t.label).join(", ")}
        </p>
      )}

      {phaiNeuLyDo && (
        <div className="cw-truong cw-ly-do">
          <label htmlFor={`cw-${dataset}-ly-do`} className="cw-nhan">
            Lý do thay đổi<span className="cw-bat-buoc" aria-hidden="true">*</span>
          </label>
          <input id={`cw-${dataset}-ly-do`} className="cw-o" value={lyDo}
            ref={reasonInputRef}
            onChange={(e) => { setLyDo(e.target.value); setReasonError(null); }}
            aria-required="true"
            aria-invalid={reasonError !== null}
            aria-describedby={reasonError ? `cw-${dataset}-ly-do-goi-y cw-${dataset}-ly-do-loi` : `cw-${dataset}-ly-do-goi-y`} />
          <p id={`cw-${dataset}-ly-do-goi-y`} className="cw-goi-y">
            Thay đổi này ảnh hưởng tới timeline hoặc phạm vi báo cáo, nên hồ sơ
            cần ghi lại vì sao.
          </p>
          {reasonError && <p id={`cw-${dataset}-ly-do-loi`} className="cw-loi" role="alert">{reasonError}</p>}
        </div>
      )}

      {loi && (
        <p className="cw-loi" role="alert">
          {loi.error}
          {loi.errorCode === "VERSION_CONFLICT" && loi.currentVersion != null && (
            <> Bản trên máy chủ đang ở phiên bản {loi.currentVersion}.</>
          )}
        </p>
      )}
    </ViewportDialog>
  );
}

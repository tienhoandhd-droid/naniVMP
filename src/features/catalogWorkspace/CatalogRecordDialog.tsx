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
import { useMemo, useState } from "react";
import { Boxes } from "lucide-react";

import ViewportDialog from "../../components/ui/ViewportDialog.tsx";
import { useRegisterDirtyState } from "../../components/ui/DirtyStateProvider.tsx";
import CatalogField from "./CatalogField.tsx";
import { layDataset } from "./definitions.ts";
import { buildCatalogPatch, canLyDo, diffCatalogRecord, thieuTruongBatBuoc } from "./diff.ts";
import { saveRecord } from "./api.ts";
import type { CatalogDatasetId, CatalogRecord, CatalogSaveResult } from "./contracts.ts";

export interface CatalogRecordDialogProps {
  open: boolean;
  dataset: CatalogDatasetId;
  /** Bản ghi đang sửa. `null` nghĩa là tạo mới. */
  record: CatalogRecord | null;
  /** Bắt buộc cho dataset `objects`: loại đối tượng quyết định bảng bị ghi. */
  objectKind?: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (kq: { recordId?: string; version?: number }) => void;
}

/** Hiện giá trị cho người đọc, không phải cho máy. */
function doc(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Có" : "Không";
  return String(v);
}

export default function CatalogRecordDialog({
  open, dataset, record, objectKind, canEdit, onClose, onSaved,
}: CatalogRecordDialogProps) {
  const def = layDataset(dataset);
  const laTaoMoi = record === null;

  const [nhap, setNhap] = useState<CatalogRecord>(() => ({ ...(record || {}) }));
  const [lyDo, setLyDo] = useState("");
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState<CatalogSaveResult | null>(null);
  const [moNangCao, setMoNangCao] = useState(false);

  /* Nạp lại khi người dùng mở sang bản ghi khác. Không có đoạn này thì lần
     mở thứ hai vẫn hiện dữ liệu của bản ghi thứ nhất — và tệ hơn, patch
     tính ra sẽ ghi giá trị của bản cũ đè lên bản mới.
     Đây là cách React khuyến nghị để chỉnh state theo props: so trong lúc
     render rồi setState, không phải useEffect (useEffect chạy sau khi đã
     vẽ một khung hình sai lên màn hình). */
  const [nguon, setNguon] = useState<CatalogRecord | null>(record);
  if (nguon !== record) {
    setNguon(record);
    setNhap({ ...(record || {}) });
    setLyDo("");
    setLoi(null);
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

  // Báo cho shell biết còn thay đổi chưa lưu, để nút Thoát hỏi lại.
  useRegisterDirtyState(`catalog-${dataset}`, open && Object.keys(patch).length > 0);

  /* Bốn trường đầu là "thông tin chính", phần còn lại xếp vào Nâng cao.
     Một form mười sáu ô mở sẵn khiến người dùng không biết bắt đầu ở đâu;
     phần lớn lần sửa chỉ đụng vài ô đầu. */
  const chinh = def.fields.slice(0, 5);
  const nangCao = def.fields.slice(5);

  const datGiaTri = (key: string, v: unknown) => {
    setNhap((cu) => ({ ...cu, [key]: v }));
    setLoi(null);
  };

  const luu = async () => {
    if (thieu.length > 0) return;
    if (phaiNeuLyDo && !lyDo.trim()) return;

    setDangLuu(true);
    const kq = await saveRecord({
      dataset,
      businessKey: String(nhap[def.businessKeyField] ?? ""),
      recordId: record ? String(record.id ?? "") : undefined,
      patch,
      // Tạo mới thì lý do đã rõ từ chính hành động; bắt người dùng gõ thêm
      // một câu giải thích vì sao thêm thiết bị mới là thủ tục vô nghĩa.
      reason: laTaoMoi ? "Tạo mới từ form" : lyDo,
      expectedVersion: record ? Number(record.version ?? 1) : null,
      objectKind: objectKind || null,
    });
    setDangLuu(false);

    if (!kq.ok) { setLoi(kq); return; }
    onSaved({ recordId: kq.recordId, version: kq.version });
    onClose();
  };

  const khongLuuDuoc = !canEdit || dangLuu
    || thieu.length > 0
    || (phaiNeuLyDo && !lyDo.trim())
    || Object.keys(patch).length === 0;

  return (
    <ViewportDialog
      open={open}
      title={laTaoMoi ? `Thêm ${def.label.toLowerCase()}` : `Sửa ${def.label.toLowerCase()}`}
      description={laTaoMoi ? def.description : `Đang sửa: ${String(record?.[def.businessKeyField] ?? "")}`}
      icon={Boxes}
      maxWidth={laTaoMoi ? 620 : 940}
      onRequestClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}
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
                changed={patch[f.key] !== undefined} idPrefix={`cw-${dataset}`} />
            ))}
          </div>

          {nangCao.length > 0 && (
            <details className="cw-nang-cao" open={moNangCao}
              onToggle={(e) => setMoNangCao((e.currentTarget as HTMLDetailsElement).open)}>
              <summary>Nâng cao ({nangCao.length} trường)</summary>
              <div className="cw-nhom">
                {nangCao.map((f) => (
                  <CatalogField key={f.key} field={f} value={nhap[f.key]}
                    onChange={(v) => datGiaTri(f.key, v)}
                    locked={!canEdit} lockReason={!canEdit ? "Bạn không có quyền sửa" : undefined}
                    changed={patch[f.key] !== undefined} idPrefix={`cw-${dataset}`} />
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
        <p className="cw-loi" role="alert">Còn thiếu: {thieu.join(", ")}</p>
      )}

      {phaiNeuLyDo && (
        <div className="cw-truong cw-ly-do">
          <label htmlFor={`cw-${dataset}-ly-do`} className="cw-nhan">
            Lý do thay đổi<span className="cw-bat-buoc" aria-hidden="true">*</span>
          </label>
          <input id={`cw-${dataset}-ly-do`} className="cw-o" value={lyDo}
            onChange={(e) => setLyDo(e.target.value)}
            aria-describedby={`cw-${dataset}-ly-do-goi-y`} />
          <p id={`cw-${dataset}-ly-do-goi-y`} className="cw-goi-y">
            Thay đổi này ảnh hưởng tới timeline hoặc phạm vi báo cáo, nên hồ sơ
            cần ghi lại vì sao.
          </p>
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

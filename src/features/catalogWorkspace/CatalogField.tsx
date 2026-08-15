/* =====================================================================
 *  CatalogField — dựng một ô nhập từ định nghĩa trường
 *  ---------------------------------------------------------------------
 *  Một component cho cả năm kiểu trường. Ba màn danh mục dùng chung nó,
 *  nên quy tắc trợ năng chỉ phải đúng ở MỘT chỗ: mỗi ô có nhãn thật gắn
 *  bằng `htmlFor`, lỗi nối vào ô bằng `aria-describedby`, và trường khoá
 *  nói rõ VÌ SAO khoá thay vì chỉ mờ đi.
 *
 *  Ô mờ mà không giải thích là cách chắc chắn khiến người dùng nghĩ hệ
 *  thống hỏng: họ bấm, không gõ được, và không có gì trên màn nói tại sao.
 * ===================================================================== */
import { Lock } from "lucide-react";

import type { CatalogFieldDefinition } from "./contracts.ts";

export interface CatalogFieldProps {
  field: CatalogFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Khoá vì lý do ngoài định nghĩa — ví dụ người dùng không đủ quyền. */
  locked?: boolean;
  lockReason?: string;
  error?: string;
  /** Đánh dấu ô đã đổi so với bản gốc. */
  changed?: boolean;
  idPrefix?: string;
}

export default function CatalogField({
  field, value, onChange, locked, lockReason, error, changed, idPrefix = "cf",
}: CatalogFieldProps) {
  const id = `${idPrefix}-${field.key}`;
  const idLoi = `${id}-loi`;
  const idGoiY = `${id}-goi-y`;
  const khoa = Boolean(locked || field.readonly);
  const lyDoKhoa = lockReason
    || (field.readonly ? "Khoá nghiệp vụ — không sửa được sau khi tạo" : undefined);

  const moTa = [error ? idLoi : null, field.hint || lyDoKhoa ? idGoiY : null]
    .filter(Boolean).join(" ") || undefined;

  const chung = {
    id,
    disabled: khoa,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": moTa,
    className: `cw-o${changed ? " is-doi" : ""}${error ? " is-loi" : ""}`,
  } as const;

  return (
    <div className="cw-truong">
      <label htmlFor={id} className="cw-nhan">
        {field.label}
        {field.required && <span className="cw-bat-buoc" aria-hidden="true">*</span>}
        {khoa && <Lock size={13} aria-hidden="true" className="cw-khoa-icon" />}
      </label>

      {field.kind === "boolean" ? (
        /* Ô đánh dấu dùng nhãn bọc ngoài: bấm vào chữ cũng bật/tắt được,
           và vùng chạm thành cả dòng thay vì một ô 24px. */
        <label className="cw-switch">
          <input type="checkbox" {...chung}
            checked={value === true || value === "true"}
            onChange={(e) => onChange(e.target.checked)} />
          <span>{value === true || value === "true" ? "Có" : "Không"}</span>
        </label>
      ) : field.kind === "select" ? (
        <select {...chung}
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value || null)}>
          <option value="">— chọn —</option>
          {(field.options || []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input {...chung}
          type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"}
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)} />
      )}

      {(field.hint || lyDoKhoa) && (
        <p id={idGoiY} className="cw-goi-y">{lyDoKhoa || field.hint}</p>
      )}
      {error && <p id={idLoi} className="cw-loi" role="alert">{error}</p>}
    </div>
  );
}

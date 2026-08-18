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
  /** Giá trị đã có trong hồ sơ, gợi ý cho ô `combobox`. */
  goiY?: readonly string[];
  /** Đặt con trỏ vào ô này — dùng khi người dùng bấm Lưu mà còn ô trống. */
  autoFocus?: boolean;
}

export default function CatalogField({
  field, value, onChange, locked, lockReason, error, changed, idPrefix = "cf",
  goiY, autoFocus,
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
    /* `required` thật, không chỉ dấu sao trang trí: trình duyệt và trình
       đọc màn hình đều cần biết ô này bắt buộc, chứ không phải chỉ người
       nhìn thấy dấu sao mới biết. */
    required: field.required || undefined,
    "aria-required": field.required || undefined,
    autoFocus,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": moTa,
    className: `cw-o${changed ? " is-doi" : ""}${error ? " is-loi" : ""}`,
  } as const;

  return (
    <div className="cw-truong">
      <label htmlFor={id} className="cw-nhan">
        {field.label}
        {/* Dấu sao một mình không nói gì với người chưa quen quy ước, mà
            bản trước còn đặt `aria-hidden` nên trình đọc màn hình bỏ qua
            hẳn — người dùng bàn phím không có cách nào biết ô nào bắt buộc. */}
        {field.required && <span className="cw-bat-buoc-chu">Bắt buộc</span>}
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
      ) : field.kind === "combobox" ? (
        /* Gõ được, mà cũng chọn được từ những giá trị đã có trong hồ sơ.
           Khoá cứng danh sách ở đây là sai: thiết bị mới, dây chuyền mới,
           dạng bào chế mới xuất hiện thường xuyên hơn nhịp sửa code. Còn
           để trống hẳn thành ô text tự do thì một dây chuyền thật sinh ra
           ba cách viết, và lọc theo nó ra ba nhóm rời rạc. */
        <>
          <input {...chung} type="text" list={`${id}-ds`}
            value={value == null ? "" : String(value)}
            onChange={(e) => onChange(e.target.value)} />
          <datalist id={`${id}-ds`}>
            {(goiY || []).map((v) => <option key={v} value={v} />)}
          </datalist>
        </>
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

/* =====================================================================
 *  ChonHoacGo — ô chọn danh sách kèm lối thoát "Khác…"
 *  ---------------------------------------------------------------------
 *  Thay cho `<input list>` + `<datalist>` của bản trước. Datalist trông
 *  đúng ý trên giấy nhưng sai trong tay người nhập liệu: trình duyệt tự
 *  LỌC gợi ý theo chữ đang có trong ô, nên một ô đã mang "Line 1" thì bấm
 *  xuống chỉ hiện đúng "Line 1" — người dùng tưởng hệ thống chỉ biết một
 *  giá trị, và gõ tay lại từ đầu. Đúng thứ ô chọn sinh ra để dẹp.
 *
 *  Ở đây dùng `<select>` thật: bấm là thấy TOÀN BỘ giá trị đang có trong
 *  hồ sơ, không phụ thuộc chữ trong ô. Mục cuối là "Khác — nhập giá trị
 *  mới", chọn nó mới mở ô gõ. Thiết bị mới, dây chuyền mới xuất hiện
 *  thường xuyên hơn nhịp sửa code, nên khoá cứng là sai.
 *
 *  Hai ca phải đúng, nếu không là hỏng hồ sơ đã ban hành:
 *   · Giá trị hiện tại NGOÀI danh sách (dữ liệu di trú từ Sheet) phải hiện
 *     lại được và sửa được — không được âm thầm rơi về rỗng.
 *   · Chọn "Khác…" rồi chưa gõ gì thì ô gõ phải ở lại. Giá trị rỗng không
 *     phân biệt được "chưa chọn" với "chọn khác nhưng chưa nhập", nên chế
 *     độ phải nhớ bằng state riêng.
 * ===================================================================== */
import { useEffect, useRef, useState } from "react";

export interface LuaChon {
  value: string;
  label: string;
}

/** Giá trị nội bộ của mục "Khác…" — KHÔNG bao giờ được ghi xuống database. */
export const MA_KHAC = "__khac__";

export interface ChonHoacGoProps {
  id: string;
  value: string;
  options: readonly LuaChon[];
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  /** Nhãn cho ô gõ tự do khi chọn "Khác…" — trình đọc màn hình cần nó. */
  nhanOGo: string;
  goiYGo?: string;
  /** Đổi giá trị là đặt con trỏ vào ô. Xem CatalogField để biết vì sao
   *  không dùng `autoFocus`. */
  focusSignal?: number;
}

export default function ChonHoacGo({
  id, value, options, onChange, disabled, required, className = "cw-o",
  ariaDescribedBy, ariaInvalid, nhanOGo, goiYGo, focusSignal,
}: ChonHoacGoProps) {
  const trongDanhSach = options.some((o) => o.value === value);
  const [khac, setKhac] = useState(() => value !== "" && !trongDanhSach);
  const dangKhac = khac || (value !== "" && !trongDanhSach);

  const chonRef = useRef<HTMLSelectElement | null>(null);
  const goRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (focusSignal === undefined) return;
    const el = dangKhac ? goRef.current : chonRef.current;
    if (!el) return;
    el.focus();
    el.scrollIntoView({ block: "center" });
    // `dangKhac` cố tình KHÔNG nằm trong danh sách phụ thuộc: chuyển qua
    // lại giữa hai chế độ không phải là lời mời cướp con trỏ của người
    // dùng — chỉ tín hiệu từ bên ngoài mới được làm việc đó.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal]);

  /* Danh sách rỗng thì đừng bắt người dùng đi qua một select chỉ có mỗi
     mục "Khác…" — chưa có dữ liệu nào để chọn thì gõ thẳng là đúng. */
  if (options.length === 0) {
    return (
      <input id={id} className={className} type="text" value={value}
        disabled={disabled} required={required}
        aria-required={required || undefined}
        aria-invalid={ariaInvalid || undefined} aria-describedby={ariaDescribedBy}
        ref={goRef}
        onChange={(e) => onChange(e.target.value)} />
    );
  }

  return (
    <>
      <select id={id} className={className} disabled={disabled}
        required={required} aria-required={required || undefined}
        aria-invalid={ariaInvalid || undefined} aria-describedby={ariaDescribedBy}
        ref={chonRef}
        value={dangKhac ? MA_KHAC : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === MA_KHAC) { setKhac(true); onChange(""); return; }
          setKhac(false);
          onChange(v);
        }}>
        <option value="">— chọn —</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        <option value={MA_KHAC}>Khác — nhập giá trị mới</option>
      </select>

      {dangKhac && (
        <input className={`${className} cw-o-khac`} type="text" value={value}
          disabled={disabled} aria-label={nhanOGo} placeholder={goiYGo || "Nhập giá trị mới"}
          ref={goRef}
          onChange={(e) => onChange(e.target.value)} />
      )}
    </>
  );
}

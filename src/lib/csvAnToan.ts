/* Chặn công thức Excel trong tệp CSV xuất ra (CSV injection).
 *
 * Ô chữ bắt đầu bằng = + - @ tab hoặc CR thì Excel/LibreOffice coi là công
 * thức — tên hạng mục do người dùng nhập như "=HYPERLINK(...)" sẽ chạy khi mở
 * tệp. Thêm dấu ' phía trước: Excel hiện nguyên chữ, không tính. Chỉ áp cho
 * CHỮ; số thật (vd số ngày còn -5) giữ nguyên để Excel vẫn hiểu là số.
 * Không đổi dữ liệu hiển thị trên web — chỉ dùng khi ghi tệp CSV. */
const KY_TU_CONG_THUC = /^[=+\-@\t\r]/;

export function chanCongThucCsv(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  const s = String(v);
  return KY_TU_CONG_THUC.test(s) ? `'${s}` : s;
}

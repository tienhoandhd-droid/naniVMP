/* =====================================================================
 *  datasetForm.ts — luật của form Sản phẩm GMP và Người nhận mail
 *  ---------------------------------------------------------------------
 *  Hai dataset này dùng chung một component form (SimpleEditModal), nên
 *  luật cũng để chung một chỗ thay vì viết hai bản gần giống nhau.
 *
 *  Không import React: luật phải kiểm được mà không cần dựng trình duyệt.
 *
 *  Vì sao cần validate ở đây chứ không để server báo: RPC sẽ từ chối một
 *  mã BFO rỗng hay email sai định dạng, nhưng lúc đó người dùng đã bấm Lưu
 *  và nhận về một câu lỗi chung ở đáy modal. Kiểm tại chỗ thì lỗi nằm ngay
 *  dưới ô sai, và họ sửa được ngay mà không mất dữ liệu vừa gõ.
 * ===================================================================== */

export type NhomTruongDataset = "chinh" | "nang_cao";

export type GiaTriDataset = Record<string, unknown>;
export type LoiDataset = Record<string, string>;

/**
 * Trường nào thuộc nhóm nâng cao của từng dataset.
 *
 * Thiết kế §5.2: giữ những thứ người nhập chạm tới hằng ngày ở trên, đẩy
 * phần ít dùng xuống dưới và thu gọn sẵn. Mở form ra mà thấy mười một ô
 * cùng lúc thì không ai biết bắt đầu từ đâu.
 */
export const TRUONG_NANG_CAO: Record<string, readonly string[]> = {
  // Sản phẩm GMP: mã, tên, dạng bào chế, hàm lượng, line là thứ luôn cần.
  products: ["ingredients", "primary_pack", "batch_size", "mixing_tank", "final_batch_size", "note"],
  // Người nhận mail: email, tên, hai cờ bật/tắt là thứ luôn cần.
  alerts: ["scope_type", "scope", "threshold_days", "ai_report_schedule", "note"],
};

export function laTruongNangCao(datasetId: string, key: string): boolean {
  return (TRUONG_NANG_CAO[datasetId] ?? []).includes(key);
}

/** Email đủ dùng cho danh sách nhận mail nội bộ: có @, có phần tên miền
 *  chứa dấu chấm, không khoảng trắng. Không cố bắt mọi trường hợp của
 *  RFC 5322 — chặt quá thì loại nhầm địa chỉ hợp lệ, mà lỏng quá thì để
 *  lọt lỗi gõ thiếu ký tự. */
export function laEmailHopLe(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/**
 * Kiểm form Sản phẩm GMP.
 *
 * Mã BFO là khoá nghiệp vụ — thiếu nó thì bản ghi không có cách nào tra
 * ngược, và các bảng khác tham chiếu bằng chính mã này.
 */
export function validateProductForm(form: GiaTriDataset): LoiDataset {
  const loi: LoiDataset = {};
  const bfo = String(form.bfo_code ?? "").trim();
  const ten = String(form.product_name ?? "").trim();

  if (!bfo) loi.bfo_code = "Phải nhập mã BFO";
  if (!ten) loi.product_name = "Phải nhập tên sản phẩm";
  return loi;
}

/**
 * Kiểm form Người nhận mail.
 *
 * Email sai một ký tự thì mail cảnh báo im lặng không tới ai — không có
 * thông báo lỗi nào, workflow vẫn báo gửi thành công. Đó là lý do phải
 * chặn ngay tại form.
 */
export function validateRecipientForm(form: GiaTriDataset): LoiDataset {
  const loi: LoiDataset = {};
  const email = String(form.email ?? "").trim();
  const nguong = String(form.threshold_days ?? "").trim();
  const phamVi = String(form.scope_type ?? "").trim().toLowerCase();
  const giaTriPhamVi = String(form.scope ?? "").trim();

  if (!email) loi.email = "Phải nhập email nhận";
  else if (!laEmailHopLe(email)) loi.email = "Email không hợp lệ";

  if (nguong && !/^\d+$/.test(nguong)) loi.threshold_days = "Ngưỡng ngày phải là số";

  /* Phạm vi 'bộ phận' hay 'đối tượng' mà bỏ trống ô Phạm vi thì workflow
     không so khớp được với gì cả — người này sẽ không nhận mail nào, mà
     bảng vẫn hiện họ như đang bật. */
  if ((phamVi === "department" || phamVi === "object"
       || phamVi.includes("bộ phận") || phamVi.includes("đối tượng"))
      && !giaTriPhamVi) {
    loi.scope = "Chọn phạm vi bộ phận hoặc đối tượng thì phải ghi rõ mã";
  }

  return loi;
}

/** Chọn đúng bộ luật theo dataset. Dataset khác trả về rỗng — không chặn
 *  cái gì mình chưa biết luật. */
export function validateDatasetForm(datasetId: string, form: GiaTriDataset): LoiDataset {
  if (datasetId === "products") return validateProductForm(form);
  if (datasetId === "alerts") return validateRecipientForm(form);
  return {};
}

/** Form có gì khác bản ghi gốc không — dùng để cảnh báo khi đóng. */
export function daDoiDataset(
  form: GiaTriDataset,
  banGoc: GiaTriDataset,
  keys: readonly string[],
): boolean {
  return keys.some((k) => {
    const a = form[k];
    const b = banGoc[k];
    const chuanA = a === null || a === undefined ? "" : String(a);
    const chuanB = b === null || b === undefined ? "" : String(b);
    return chuanA !== chuanB;
  });
}

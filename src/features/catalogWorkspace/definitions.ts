/* =====================================================================
 *  definitions.ts — ba dataset danh mục khai bằng cùng một hình dạng
 *  ---------------------------------------------------------------------
 *  Ba màn con khác nhau ở DANH SÁCH TRƯỜNG, không khác ở cách vận hành.
 *  Khai bằng dữ liệu thay vì viết ba component gần giống nhau: thêm một
 *  cột sau này là sửa một dòng ở đây, không phải sửa ba chỗ rồi quên một.
 *
 *  Whitelist trường ở server (migration 20260815100000) là biên thật.
 *  Danh sách dưới đây phải là TẬP CON của whitelist đó — khai thừa một
 *  trường thì người dùng gõ xong bấm Lưu mới bị chặn, mà lỗi hiện ra là
 *  "trường không được phép sửa", nghe như họ làm sai.
 * ===================================================================== */
import type { CatalogDatasetId, CatalogFieldDefinition } from "./contracts.ts";

export interface CatalogDatasetDefinition {
  id: CatalogDatasetId;
  /** Tên gửi cho `rpc_list_catalog_dataset`. */
  serverName: string;
  label: string;
  /** Câu ngắn nói dataset này dùng để làm gì. */
  description: string;
  /** Cột khoá mà người dùng nhìn thấy. */
  businessKeyField: string;
  fields: CatalogFieldDefinition[];
}

const BO_PHAN: CatalogFieldDefinition["options"] = [
  { value: "xsx", label: "Xưởng sản xuất" },
  { value: "cd", label: "Cơ điện" },
  { value: "kho", label: "Kho" },
  { value: "qc", label: "QC – Kiểm nghiệm" },
  { value: "rd", label: "RD – Nghiên cứu phát triển" },
  { value: "qa", label: "QA – QLCL" },
];

/* --------------------------------------------------------------------- *
 *  Sản phẩm GMP
 * --------------------------------------------------------------------- */
const SAN_PHAM: CatalogDatasetDefinition = {
  id: "products",
  serverName: "products_gmp",
  label: "Sản phẩm GMP",
  description: "Danh mục sản phẩm dùng cho thẩm định quy trình.",
  businessKeyField: "bfo_code",
  fields: [
    { key: "bfo_code", label: "Mã BFO", kind: "text", readonly: true, required: true,
      hint: "Khoá nghiệp vụ — không sửa được sau khi tạo" },
    { key: "product_name", label: "Tên sản phẩm", kind: "text", required: true },
    { key: "ingredients", label: "Hoạt chất", kind: "text" },
    { key: "strength", label: "Hàm lượng", kind: "text" },
    { key: "dosage_form", label: "Dạng bào chế", kind: "text" },
    { key: "production_line", label: "Dây chuyền", kind: "text" },
    { key: "primary_pack", label: "Bao bì sơ cấp", kind: "text" },
    { key: "batch_size", label: "Cỡ lô", kind: "text" },
    { key: "mixing_tank", label: "Bồn pha", kind: "text" },
    { key: "final_batch_size", label: "Cỡ lô thành phẩm", kind: "text" },
    { key: "note", label: "Ghi chú", kind: "text" },
    // Ngừng một sản phẩm là bỏ nó khỏi mọi báo cáo về sau — server cũng đòi
    // lý do, ở đây hỏi trước để người dùng không gõ xong mới bị chặn.
    { key: "is_active", label: "Đang dùng", kind: "boolean", reasonRequired: true,
      hint: "Tắt để ngừng dùng. Bản ghi vẫn giữ trong hồ sơ, không bị xoá." },
  ],
};

/* --------------------------------------------------------------------- *
 *  Người nhận cảnh báo
 * --------------------------------------------------------------------- */
const NGUOI_NHAN: CatalogDatasetDefinition = {
  id: "alerts",
  serverName: "alert_recipients",
  label: "Người nhận cảnh báo",
  description: "Ai nhận email cảnh báo quá hạn và báo cáo AI định kỳ.",
  businessKeyField: "email",
  fields: [
    { key: "email", label: "Email", kind: "text", required: true },
    { key: "recipient_name", label: "Họ tên", kind: "text" },
    { key: "scope_type", label: "Phạm vi", kind: "select", options: [
      { value: "tất cả", label: "Tất cả" },
      { value: "bộ phận", label: "Theo bộ phận" },
      { value: "khu vực", label: "Theo khu vực" },
    ] },
    { key: "scope", label: "Giá trị phạm vi", kind: "text",
      hint: "Để trống nếu phạm vi là Tất cả" },
    { key: "alert_kind", label: "Loại cảnh báo", kind: "select", options: [
      { value: "cả hai", label: "Cả hai" },
      { value: "quá hạn", label: "Chỉ quá hạn" },
      { value: "sắp tới hạn", label: "Chỉ sắp tới hạn" },
    ] },
    { key: "threshold_days", label: "Ngưỡng (ngày)", kind: "number",
      hint: "Báo trước bao nhiêu ngày" },
    { key: "ai_report_enabled", label: "Nhận báo cáo AI", kind: "boolean" },
    { key: "ai_report_schedule", label: "Lịch báo cáo AI", kind: "select", options: [
      { value: "không", label: "Không gửi" },
      { value: "hàng tuần", label: "Hàng tuần" },
      { value: "hàng tháng", label: "Hàng tháng" },
    ] },
    { key: "note", label: "Ghi chú", kind: "text" },
    { key: "is_enabled", label: "Đang bật", kind: "boolean", reasonRequired: true,
      hint: "Tắt thì người này ngừng nhận cảnh báo." },
  ],
};

/* --------------------------------------------------------------------- *
 *  Đối tượng nguồn — dataset lớn nhất, đã có màn riêng
 * --------------------------------------------------------------------- */
const DOI_TUONG: CatalogDatasetDefinition = {
  id: "objects",
  serverName: "source_objects",
  label: "Đối tượng nguồn",
  description: "Thiết bị, quy trình, kho, hệ thống phụ trợ và vận chuyển.",
  businessKeyField: "object_code",
  fields: [
    { key: "object_code", label: "Mã đối tượng", kind: "text", readonly: true, required: true },
    { key: "object_name", label: "Tên đối tượng", kind: "text", required: true },
    { key: "department", label: "Bộ phận quản lý", kind: "select", options: BO_PHAN },
    { key: "area_code", label: "Mã khu vực", kind: "text" },
    { key: "line", label: "Dây chuyền", kind: "text" },
    // Bốn trường dưới đây đổi là timeline đổi theo — server bắt buộc lý do.
    { key: "validate_flag", label: "Có thẩm định", kind: "boolean", reasonRequired: true },
    { key: "frequency_months", label: "Tần suất (tháng)", kind: "number", reasonRequired: true },
    { key: "first_month", label: "Tháng đầu tiên", kind: "number", reasonRequired: true },
    { key: "year_ref", label: "Năm tham chiếu", kind: "number", reasonRequired: true },
    { key: "report_class", label: "Nhóm báo cáo", kind: "text" },
    { key: "work_group", label: "Nhóm công việc", kind: "text" },
    { key: "workdays", label: "Số ngày công", kind: "number" },
    { key: "complexity_score", label: "Điểm phức tạp", kind: "number" },
    { key: "quality_impact_score", label: "Điểm ảnh hưởng chất lượng", kind: "number" },
    { key: "note", label: "Ghi chú", kind: "text" },
    { key: "is_active", label: "Đang dùng", kind: "boolean", reasonRequired: true },
  ],
};

export const CATALOG_DATASETS: Record<CatalogDatasetId, CatalogDatasetDefinition> = {
  objects: DOI_TUONG,
  products: SAN_PHAM,
  alerts: NGUOI_NHAN,
};

export const CATALOG_DATASET_ORDER: CatalogDatasetId[] = ["objects", "products", "alerts"];

export function layDataset(id: CatalogDatasetId): CatalogDatasetDefinition {
  return CATALOG_DATASETS[id];
}

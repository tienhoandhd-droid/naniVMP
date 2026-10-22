export type CatalogHelpRegion =
  | "objects" | "coverage" | "products" | "alerts"
  | "revalidation" | "changes" | "import" | "pending" | "history";

export interface CatalogHelpGuide {
  title: string;
  summary: string;
  steps: string[];
  caution?: string;
}

/* Nội dung ở đây mô tả đúng các đường dữ liệu đã được RPC kiểm quyền. Nó
 * không chứa callback hay quyền ghi, để nút trợ giúp luôn an toàn ở chế độ
 * chỉ đọc và không thể trở thành một lối thao tác thứ hai.
 * Mỗi tab giữ 2–3 câu: tên cột đã có trong biểu mẫu/file mẫu, quyền đã thể
 * hiện qua nút có hay không — không nhắc lại ở đây. */
export const CATALOG_HELP_CONTENT: Record<CatalogHelpRegion, CatalogHelpGuide> = {
  objects: {
    title: "Đối tượng", summary: "Danh mục gốc của thiết bị, quy trình, kho, hệ thống phụ trợ và vận chuyển.",
    steps: [
      "Chọn loại, tìm mã/tên, lọc khi cần.",
      "Đổi thẩm định, tần suất, tháng đầu hoặc năm cần lý do, rồi vào Chờ áp dụng.",
    ],
    caution: "Mã đối tượng không sửa được sau khi tạo.",
  },
  coverage: {
    title: "Phạm vi xưởng", summary: "Giao bộ phận, khu vực cho nhân sự xưởng.",
    steps: [
      "Chọn người → bộ phận → khu vực → lý do → Lưu.",
    ],
    caution: "Phạm vi chỉ giới hạn phần được xem.",
  },
  products: {
    title: "Sản phẩm GMP", summary: "Danh mục sản phẩm phục vụ thẩm định quy trình.",
    steps: [
      "Tìm theo mã hoặc tên trước khi thêm để tránh trùng.",
      "Tắt Đang dùng = ngừng dùng, không xoá; cần lý do.",
    ],
    caution: "Mã BFO không sửa được sau khi tạo.",
  },
  alerts: {
    title: "Người nhận cảnh báo", summary: "Danh sách nhận email quá hạn và báo cáo AI định kỳ.",
    steps: [
      "Tìm trước để tránh trùng.",
      "Theo bộ phận/khu vực: phải ghi mã.",
    ],
    caution: "Tắt người nhận chỉ ngừng gửi; không đổi trạng thái hạng mục.",
  },
  revalidation: {
    title: "Tái thẩm định", summary: "Kỳ đề xuất suy từ ngày hoàn thành thực tế và chu kỳ.",
    steps: [
      "Đối chiếu nguồn: làm mới đề xuất.",
      "Xác nhận để tạo kỳ mới hoặc Bỏ qua; cần lý do tối thiểu 5 ký tự.",
    ],
    caution: "Rà ngày hoàn thành gốc và chu kỳ trước khi xác nhận.",
  },
  changes: {
    title: "Thay đổi", summary: "Phiếu thay đổi cần thẩm định, lấy từ sheet Tổng hợp thay đổi mỗi sáng.",
    steps: [
      "Sửa → gõ mã thiết bị → chọn đợt thẩm định hoặc Tạo đợt.",
      "Làm mới: lấy ngay dữ liệu mới từ sheet (1–2 phút).",
    ],
    caution: "Nội dung phiếu sửa trên sheet; web chỉ gắn thiết bị, đợt, hạn và trạng thái.",
  },
  import: {
    title: "Nhập Excel", summary: "Nhập theo mẫu của VMP, xem trước rồi mới ghi.",
    steps: [
      "Tải mẫu → nhập sheet DU_LIEU → chọn file.",
      "Nhập lý do → Ghi vào hệ thống. Sau khi ghi, mở Chờ áp dụng.",
    ],
    caution: "Xem trước chưa ghi gì.",
  },
  pending: {
    title: "Chờ áp dụng", summary: "Đã lưu ở Dữ liệu nguồn; hạn chót chỉ đổi khi bạn Áp dụng.",
    steps: [
      "Xem ảnh hưởng → lý do → Áp dụng.",
      "Hạng mục đã có tiến độ: đổi hạn chót cần xác nhận riêng.",
    ],
    caution: "Áp dụng cho toàn bộ; ngày thực tế giữ nguyên.",
  },
  history: {
    title: "Lịch sử", summary: "Nhật ký Dữ liệu nguồn: ai thêm, sửa hoặc ngừng dùng bản ghi.",
    steps: [
      "Đối chiếu người thực hiện, thời điểm và lý do từng dòng.",
    ],
    caution: "Lịch sử không sửa, không xoá được.",
  },
};

export function getCatalogHelp(region: string): CatalogHelpGuide {
  return CATALOG_HELP_CONTENT[region as CatalogHelpRegion] ?? CATALOG_HELP_CONTENT.objects;
}

/** Mirror the actual region action guards; help never grants these capabilities. */
export function canChangeCatalogHelpRegion(region: string, rights: {
  manager: boolean; canEdit: boolean; canManageWorkshopScope: boolean; canGenerateTimeline: boolean;
  qaEditor?: boolean;
}): boolean {
  if (region === "history") return false;
  if (region === "changes") return rights.qaEditor === true;
  if (region === "coverage") return rights.canManageWorkshopScope;
  if (region === "revalidation") return rights.manager;
  if (region === "pending") return rights.manager && rights.canEdit && rights.canGenerateTimeline;
  return rights.manager && rights.canEdit;
}

/* Hướng dẫn dùng web cho trợ lý (công cụ "huong_dan").
 *
 * Nội dung tĩnh, KHÔNG do AI viết: AI chỉ chọn chủ đề. Nhãn menu/nút chép
 * nguyên chữ từ code (22/10/2026) — đổi nhãn trên giao diện thì sửa cả ở đây.
 * Nguồn chính: constants/vmp.ts (menu), UpdatePage, ProgressEditModal,
 * TodayCommandCenter, ChangeValidationPanel, CatalogWorkspaceShell,
 * ReportsView, AlertsPage, PhanQuyenPage, QualificationNavigation. */

export interface ChuDeHuongDan { id: string; tieuDe: string; buoc: string[]; vai: string }

export const HUONG_DAN_WEB: ChuDeHuongDan[] = [
  {
    id: "cap_nhat_tien_do",
    tieuDe: "Cập nhật ngày/trạng thái tiến độ một hạng mục",
    buoc: [
      "Mở menu THỰC HIỆN → \"Cập nhật tiến độ\" (chọn \"Theo hạng mục\" hoặc \"Theo đối tượng\").",
      "Gõ mã/tên vào ô \"Tìm theo mã, tên, QA…\" (hoặc bấm chip \"Cần xử lý\" / \"Quá hạn\"), rồi bấm \"Cập nhật\" ở dòng đó (\"✓ Xong bước\" nếu chỉ cần chốt bước hiện tại).",
      "Trong hộp \"Cập nhật tiến độ\", ở đúng bước (1. Đề cương · 2. Thẩm định thực tế · 3. Báo cáo · 4. Đích VMP) nhập \"Ngày hoàn thành thực tế\" và chọn \"Trạng thái\", hoặc bấm \"✓ Xong hôm nay\". Ngày thực tế không được ở tương lai; bước trước chưa Hoàn thành thì không chốt bước sau.",
      "Nhập \"Lý do\" khi ô ghi (bắt buộc).",
      "Bấm \"Lưu tiến độ\" / \"Lưu N thay đổi\" (hoặc \"Lưu & mở tiếp →\" để sang hạng mục kế).",
    ],
    vai: "Admin, Quản lý QA: sửa đủ 4 bước. QA: chỉ hạng mục mình phụ trách/hỗ trợ; bước Thẩm định thực tế chỉ đổi trạng thái. Xưởng: chỉ nhập ngày thực tế của bước Thẩm định thực tế, khi đã được gán ở \"Nhân sự xưởng\".",
  },
  {
    id: "xem_viec_cua_toi",
    tieuDe: "Xem việc của tôi / việc hôm nay",
    buoc: [
      "Mở menu THỰC HIỆN → \"Việc hôm nay\" (việc trễ và tới hạn trong 7 ngày tới).",
      "Bấm \"Chỉ xem việc của tôi\" / \"Xem việc cả đội\". Admin và Quản lý QA dùng ô chọn nhân sự (\"Cả nhóm\" hoặc tên người).",
      "Bấm một ô số để lọc: \"Quá hạn\", \"Hạn hôm nay\", \"Tới hạn 7 ngày\", \"Hồ sơ cần hoàn thiện\" (bấm lại để bỏ lọc).",
      "Bấm \"Cập nhật tiến độ\" ở dòng việc để mở thẳng hộp sửa (không có quyền sửa thì nút là \"Xem chi tiết\").",
    ],
    vai: "Cả 5 vai. Tài khoản chưa nối hồ sơ nhân sự thì không xem được \"việc của tôi\" — nhờ Admin nối hồ sơ.",
  },
  {
    id: "thay_doi",
    tieuDe: "Phiếu thay đổi cần thẩm định (tab Thay đổi)",
    buoc: [
      "Mở menu THỰC HIỆN → \"Dữ liệu nguồn\" → tab \"Thay đổi\".",
      "Ở ô \"Hiển thị\" chọn \"Cần xử lý\" / \"Chưa gắn thiết bị\" / \"Quá hạn\" / \"Tất cả\"; ô \"Tìm\" nhận mã CC, nội dung, mã thiết bị. Bấm \"Làm mới\" để lấy dữ liệu mới từ sheet (1–2 phút).",
      "Bấm \"Sửa\" ở phiếu. Ở mục \"Thiết bị\", gõ tên/mã (gõ không dấu được) rồi chọn gợi ý để gắn; tick hạng mục ở mục \"Đợt thẩm định\".",
      "Chọn \"Trạng thái\", ghi \"Ghi chú\" nếu cần, rồi bấm \"Lưu\". Hạn lấy theo sheet, không sửa trên web.",
      "Thiết bị chưa có đợt: mục \"Tạo đợt tái thẩm định\" → chọn thiết bị, loại, năm → \"Tạo đợt\" (Lưu trước).",
    ],
    vai: "Cả 5 vai xem được. Sửa, gắn thiết bị, \"Làm mới\": Admin, Quản lý QA, QA. \"Tạo đợt\": Admin, Quản lý QA. Xưởng chỉ xem phiếu có thiết bị trong phạm vi.",
  },
  {
    id: "tim_thiet_bi",
    tieuDe: "Tra cứu, thêm, sửa thiết bị (Dữ liệu nguồn)",
    buoc: [
      "Mở menu THỰC HIỆN → \"Dữ liệu nguồn\" → tab \"Đối tượng\", chọn loại: \"Thiết bị\" / \"Quy trình\" / \"Kho\" / \"Hệ thống phụ trợ\" / \"Vận chuyển\".",
      "Gõ vào ô \"Tìm theo mã, tên, bộ phận…\"; bấm \"Bộ lọc\" để lọc theo bộ phận, khu vực, người phụ trách, tần suất…",
      "Thêm mới: \"Thêm đối tượng\". Sửa: \"Cập nhật\" ở dòng đối tượng.",
      "Nhập \"Lý do thay đổi\" (bắt buộc) rồi \"Lưu\". Trường làm đổi lịch sẽ vào \"Chờ áp dụng\", chưa áp ngay.",
    ],
    vai: "Xem: cả 5 vai (xưởng chỉ thấy phạm vi xưởng). Thêm/sửa, Nhập Excel, Chờ áp dụng, Lịch sử: Admin, Quản lý QA.",
  },
  {
    id: "xuat_bao_cao",
    tieuDe: "Xuất Excel / báo cáo",
    buoc: [
      "Mở menu PHÂN TÍCH & QUẢN TRỊ → \"Báo cáo\".",
      "Chọn \"Năm báo cáo\", \"Phạm vi (bộ phận)\", \"Khu vực\", \"Mức trọng yếu\".",
      "Bấm \"Xuất Excel\" (đủ 5 sheet), hoặc \"PDF\" / \"HTML\".",
      "Danh sách đối tượng: \"Dữ liệu nguồn\" → \"Đối tượng\" → \"Công cụ dữ liệu\" → \"Xuất Excel\" (xuất đúng phần đang lọc).",
    ],
    vai: "Màn \"Báo cáo\": cả 5 vai (xưởng chỉ thấy phạm vi xưởng). \"Xuất Excel\" ở Dữ liệu nguồn: Admin, Quản lý QA.",
  },
  {
    id: "phan_quyen",
    tieuDe: "Tài khoản, cấp quyền, QA phụ trách",
    buoc: [
      "Chỉ Admin: menu PHÂN TÍCH & QUẢN TRỊ → \"Vai trò & phạm vi\".",
      "Tab \"Bảng kiểm soát\": \"Liên kết tài khoản\", \"Xem quyền\", \"Sửa vai\", \"Tắt\" / \"Bật lại\". Tab \"Email được phép\" để thêm email được tạo tài khoản.",
      "Tab \"QA phụ trách\": nhập \"Lý do thay đổi\" rồi \"Thêm\" / \"Bỏ\".",
      "Gán QA cho từng đối tượng: \"Dữ liệu nguồn\" → \"Đối tượng\" → \"Cập nhật\" → ô \"QA phụ trách\" / \"Người hỗ trợ\" → lý do → \"Lưu\".",
    ],
    vai: "Cấp quyền, tài khoản: chỉ Admin — vai khác cần quyền gì thì liên hệ Admin. Gán QA cho đối tượng: Admin, Quản lý QA. Đổi mật khẩu: mọi vai, ở thẻ tài khoản cuối thanh bên.",
  },
  {
    id: "canh_bao",
    tieuDe: "Màn cảnh báo / quá hạn",
    buoc: [
      "Mở menu GIÁM SÁT → \"Cảnh báo & ưu tiên\".",
      "Bấm một tín hiệu: \"Cần xử lý ngay\", \"Theo dõi 30 ngày\", \"Rủi ro cao cần QA xem\", \"Tái thẩm định\".",
      "Thu hẹp theo bộ phận, mức rủi ro, người thực hiện, khoảng thời gian; \"Xoá lọc\" để bỏ hết.",
      "Bấm một dòng để xem bốn mốc hạn. Muốn sửa thì sang \"Cập nhật tiến độ\".",
    ],
    vai: "Cả 5 vai xem được; xưởng chỉ thấy phạm vi xưởng.",
  },
  {
    id: "tham_dinh_thuc_te",
    tieuDe: "Nhập hồ sơ thẩm định thực tế",
    buoc: [
      "Ở thanh bên, mục \"THẨM ĐỊNH THỰC TẾ\" (chỉ hiện khi bạn có quyền), bấm \"Đợt thẩm định\" để tạo đợt.",
      "Mở hệ thống (\"Hơi tinh khiết\" / \"Khí nén\" / \"Khí nitơ\") rồi chọn biểu mẫu (vd \"BM01 — Tiểu phân\").",
      "Nhập số liệu, bấm \"Tính và đánh giá\", rồi \"Lưu hồ sơ\" (\"In biểu mẫu\" nếu cần in).",
      "Lịch sử ở \"Nhật ký thay đổi\"; xu hướng ở \"Sơ đồ xu hướng …\" của từng hệ thống.",
    ],
    vai: "Theo quyền với hạng mục PQ của từng hệ thống: Admin, Quản lý QA, và QA phụ trách/hỗ trợ hệ thống đó. Xưởng không lưu được.",
  },
];

export function timHuongDan(id: unknown): ChuDeHuongDan | null {
  return HUONG_DAN_WEB.find((c) => c.id === id) ?? null;
}

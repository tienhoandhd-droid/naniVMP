/* =====================================================================
 *  constants/vmp.js — VMP Domain Constants
 *  Status maps, departments, classifications, deadline rules
 * ===================================================================== */
import {
  Boxes, FlaskConical, Warehouse, Wind, Truck,
  LayoutDashboard, GanttChartSquare, Pencil,
  Activity, FileBarChart, AlertCircle,
  ShieldCheck, Radar, BarChart3, Scale,
} from "lucide-react";
import { C } from "./theme.ts";

// ======================== STATUS ========================
export const STATUS = {
  done: { label: "Hoàn thành", color: C.mint, text: C.mintText, bg: C.mintSoft },
  prog: { label: "Đang thực hiện", color: C.marigold, text: C.marigoldText, bg: C.marigoldSoft },
  todo: { label: "Chưa thực hiện", color: C.sky, text: C.skyText, bg: C.skySoft },
  plan: { label: "Kế hoạch", color: C.lav, text: C.lavText, bg: C.lavSoft },
  over: { label: "Quá hạn", color: C.rasp, text: C.raspText, bg: C.raspSoft },
};

export const MST = {
  done: { label: "Hoàn thành", color: C.mint, text: C.mintText },
  over: { label: "Quá hạn", color: C.rasp, text: C.raspText },
  todo: { label: "Chưa hoàn thành", color: C.marigold, text: C.marigoldText },
};

// Progress weights by status
export const PROG = { done: 100, prog: 55, over: 75, todo: 20, plan: 8 };

// ======================== CLASSIFICATIONS ========================
export const CLS = {
  tb:  { label: "Thiết bị", icon: Boxes, color: C.pink, text: C.pinkText, soft: C.pinkSoft },
  qt:  { label: "Quy trình", icon: FlaskConical, color: C.lav, text: C.lavText, soft: C.lavSoft },
  kho: { label: "Kho", icon: Warehouse, color: C.marigold, text: C.marigoldText, soft: C.marigoldSoft },
  ht:  { label: "Hệ thống phụ trợ", icon: Wind, color: C.sky, text: C.skyText, soft: C.skySoft },
  vc:  { label: "Vận chuyển", icon: Truck, color: C.mint, text: C.mintText, soft: C.mintSoft },
};

// ======================== DEPARTMENTS ========================
export const DEPTS = [
  { id: "xsx", name: "Xưởng sản xuất", short: "XSX" },
  { id: "cd", name: "Cơ điện", short: "CĐ" },
  { id: "kho", name: "Kho", short: "Kho" },
  { id: "qc", name: "QC – Kiểm nghiệm", short: "QC" },
  { id: "rd", name: "RD – Nghiên cứu phát triển", short: "RD" },
  { id: "qa", name: "QA – QLCL", short: "QA" },
];

export const DEPT_DEEP = { xsx: C.pinkText, cd: C.skyText, kho: C.marigoldText, qc: C.mintText, rd: C.raspText, qa: C.lavText };
export const DEPT_COLOR = { xsx: C.pink, cd: C.sky, kho: C.marigold, qc: C.mint, rd: C.rasp, qa: C.lav };
export const DEPT_CODE = { xsx: "XSX", cd: "CĐ", kho: "Kho", qc: "QC", rd: "RD", qa: "QA" };

// ======================== GIAI ĐOẠN (đề cương/thực tế/báo cáo/VMP) ========================
// Bốn màu này là quy ước MÀU THEO GIAI ĐOẠN dùng xuyên suốt app (bảng phân
// tích ở CompletionDashboard, biểu đồ báo cáo) — cố định thứ tự, đừng đổi.
export const STAGE_COLOR = {
  protocol:   { color: C.lav,  text: C.lavText,  soft: C.lavSoft,  label: "Đề cương" },
  validation: { color: C.sky,  text: C.skyText,  soft: C.skySoft,  label: "Thẩm định thực tế" },
  report:     { color: C.pink, text: C.pinkText, soft: C.pinkSoft, label: "Báo cáo" },
  vmp:        { color: C.mint, text: C.mintText, soft: C.mintSoft, label: "VMP" },
};

// ======================== CHẤT LƯỢNG DỮ LIỆU ========================
// Dùng chung cho DataQualityView (Sức khoẻ dữ liệu) và ReportsView (Báo cáo
// & AI) — một nơi định nghĩa nhãn lỗi, đổi một nơi khớp cả hai màn.
export const LOAI_LOI: Record<string, { ten: string; sua: string }> = {
  missing_code:          { ten: "Thiếu mã đối tượng", sua: "Sửa ở Danh mục & Nhập liệu → Danh mục nguồn" },
  duplicate_id:          { ten: "Trùng ID hạng mục", sua: "Hai dòng cùng mã thẩm định — xoá hoặc đổi mã một dòng" },
  deadline_before_start: { ten: "Deadline VMP trước ngày đề cương", sua: "Kiểm lại mốc đích hoặc ngày đề cương ở Cập nhật tiến độ" },
  done_no_date:          { ten: "Đánh dấu hoàn thành nhưng thiếu ngày", sua: "Vi phạm ALCOA+ — nhập ngày thực tế ở Cập nhật tiến độ" },
  date_no_done:          { ten: "Có ngày hoàn thành nhưng trạng thái chưa xong", sua: "Đặt trạng thái về Hoàn thành, hoặc xoá ngày nếu nhập nhầm" },
  owner_no_email:        { ten: "Người thực hiện chưa có email", sua: "Điền ở Danh mục & Nhập liệu → tab Người thực hiện" },
  no_validation_type:    { ten: "Chưa xác định loại thẩm định", sua: "Đặt IQ/OQ/PQ/CV ở Danh mục nguồn rồi sinh lại timeline" },
  high_crit_no_plan:     { ten: "Trọng yếu cao nhưng vẫn ở Kế hoạch", sua: "ICH Q9 đòi làm nhóm rủi ro cao trước — xếp lịch sớm" },
};

export const SEV = {
  error:   { nhan: "Lỗi", mau: C.raspText, nen: C.raspSoft, emoji: "🚫", uu_tien: 0 },
  warning: { nhan: "Cảnh báo", mau: C.marigoldText, nen: C.marigoldSoft, emoji: "⚠️", uu_tien: 1 },
  info:    { nhan: "Thông tin", mau: C.skyText, nen: C.skySoft, emoji: "ℹ️", uu_tien: 2 },
} as const;
export const sevOf = (s: string) => SEV[(s as keyof typeof SEV)] ?? SEV.info;

// ======================== DEADLINE RULES ========================
// Số ngày QC cần cho từng loại báo cáo (dùng tính T-5-BC)
export const DEP_DAYS = { "Độc lập": 2, "Hóa lý": 2, "Nhiễm khuẩn": 7, "Vô khuẩn": 16 };
export const SOON_DAYS = 30;

// ======================== CRITICALITY ========================
export const CRIT = {
  Cao:  { color: C.rasp, text: C.raspText, soft: C.raspSoft, w: 3 },
  TB:   { color: C.marigold, text: C.marigoldText, soft: C.marigoldSoft, w: 2 },
  "Thấp": { color: C.mint, text: C.mintText, soft: C.mintSoft, w: 1 },
};

// ======================== PERMISSIONS ========================
export const PERM_LABEL = { admin: "Quản trị", edit: "Chỉnh sửa", view: "Chỉ xem" };

// ======================== NAVIGATION ========================
export const NAV_ITEMS = [
  // GIÁM SÁT — nhìn tình hình, không sửa gì
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard, group: "monitor" },
  { id: "timeline", label: "Timeline VMP", icon: GanttChartSquare, group: "monitor" },
  { id: "alerts", label: "Cảnh báo & Rủi ro", icon: AlertCircle, group: "monitor" },

  // THỰC HIỆN — việc làm hằng ngày, có ghi dữ liệu
  { id: "progress", label: "Cập nhật tiến độ", icon: Pencil, group: "work" },
  { id: "inventory", label: "Tiến độ theo đối tượng", icon: Boxes, group: "work" },
  { id: "source", label: "Danh mục & Nhập liệu", icon: Boxes, group: "work" },

  // PHÂN TÍCH — ra quyết định
  // QRM – Rủi ro đã gộp vào "Cảnh báo & Rủi ro": ma trận rủi ro nằm cùng chỗ
  // với danh sách cảnh báo mà nó dùng để xếp thứ tự ưu tiên.
  { id: "workload", label: "Phân công & Tải việc", icon: Activity, group: "analysis" },
  { id: "reports", label: "Báo cáo & AI", icon: FileBarChart, group: "analysis" },
  { id: "rules", label: "Luật đang áp dụng", icon: Scale, group: "analysis" },

  // QUẢN TRỊ
  { id: "health", label: "Sức khoẻ dữ liệu", icon: Radar, group: "admin", adminOnly: true },
  { id: "audit", label: "Audit log", icon: ShieldCheck, group: "admin", adminOnly: true },
  { id: "admin", label: "Quản trị", icon: BarChart3, group: "admin", adminOnly: true },
];

export const NAV_SUBS = {
  overview: "Theo dõi Kế hoạch Thẩm định Gốc (VMP) — CPC1 HN",
  timeline: "Tổng quan tải việc theo tháng · Timeline các mốc Đề cương → Thẩm định → Báo cáo → Đích VMP",
  alerts: "Cảnh báo tới hạn / quá hạn / tái thẩm định — xếp theo điểm rủi ro ICH Q9, kèm ma trận QRM",
  progress: "Cập nhật ngày thực tế và trạng thái từng giai đoạn cho mỗi hạng mục — việc làm hàng ngày",
  inventory: "Gộp theo mã đối tượng: một đối tượng có nhiều loại thẩm định / nhiều lần trong năm",
  source: "Danh mục nguồn · Người nhận mail (cảnh báo + phân tích AI) · Danh bạ nhân sự · Người thực hiện · Sản phẩm GMP — xem, thêm, sửa, xoá trực tiếp trên web",
  workload: "Phân công QA theo nhóm việc và ma trận tải Người × Tháng",
  reports: "Báo cáo tuần / tháng / quý + nhận xét AI · xuất PDF / Excel / HTML",
  rules: "Luật hệ thống đang chạy — đọc thẳng từ database nên không thể mô tả khác thực tế",
  health: "Sức khoẻ dữ liệu: lỗi trên bản đang xem + số liệu và kiểm tra chạy thẳng ở Supabase",
  audit: "Nhật ký thao tác hệ thống — ALCOA+ audit trail",
  admin: "Cấu hình hệ thống, người dùng, phân quyền",
};

// ======================== STAGE PIPELINE ========================
export const STAGES = [
  { id: "chua", label: "Chưa bắt đầu", color: C.skyText, bg: C.skySoft },
  { id: "dang_dc", label: "Đang làm đề cương", color: C.marigoldText, bg: C.marigoldSoft },
  { id: "cho_td", label: "Xong đề cương · chờ thực tế", color: C.lavText, bg: C.lavSoft },
  { id: "dang_td", label: "Đang thẩm định thực tế", color: C.marigoldText, bg: C.marigoldSoft },
  { id: "cho_bc", label: "Xong thực tế · chờ báo cáo", color: C.lavText, bg: C.lavSoft },
  { id: "bc", label: "Đang/đã làm báo cáo", color: C.pinkText, bg: C.pinkSoft },
  { id: "done", label: "Hoàn thành VMP", color: C.mintText, bg: C.mintSoft },
];

// Status option values (Vietnamese)
export const TT_OPTS = [
  "", "Hoàn thành", "Đang thực hiện", "Chưa hoàn thành", "Kế hoạch",
];

// Report periods
export const PERIODS = [
  ["all", "Tất cả"], ["thang", "Tháng này"], ["quy", "Quý này"],
  ["sixm", "6 tháng tới"], ["nam", "Năm nay"],
];

export const PLABEL = {
  tuan: { t: "Báo cáo tuần", p: `Tuần ${Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604800000)}/${new Date().getFullYear()}` },
  thang: { t: "Báo cáo tháng", p: `Tháng ${new Date().getMonth() + 1}/${new Date().getFullYear()}` },
  quy: { t: "Báo cáo quý", p: `Quý ${Math.floor(new Date().getMonth() / 3) + 1}/${new Date().getFullYear()}` },
};

// ======================== DATE HELPERS ========================
// S1-C FIX (2026-06-21): VMP_TODAY cũ là IIFE tính 1 lần khi load module
// → đông cứng. Nếu user mở web liên tục qua ngày khác, mốc "hôm nay" lệch
// với DB CURRENT_DATE và với deriveSt() (gọi new Date() tươi).
// Sửa: dùng HÀM vmpToday() — mỗi lần gọi tự lấy ngày hiện tại.
export const vmpToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
// Backward-compat: giữ tên VMP_TODAY để KHÔNG vỡ chỗ cũ chưa kịp sửa.
// LƯU Ý: code mới nên gọi vmpToday() — biến này chỉ là snapshot lúc load.
export const VMP_TODAY = vmpToday();

// ======================== GANTT TIMELINE ========================
export const MONTHS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];
export const PHASE_COLOR = { done: C.mint, current: C.marigold, over: C.rasp, future: "#D9C3D5" };

// ======================== WORKLOAD MATRIX ========================
export const WL_MONTHS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];
export const WL_QUARTERS = ["Quý 1", "Quý 2", "Quý 3", "Quý 4"];
/* Ngưỡng "đầy tải" — ngày công một người gánh được trong một tháng.
   Bản trước để 10, và đó là con số sai về mặt vật lý: một tháng chỉ có
   khoảng 22 ngày làm việc. Hệ quả đo được: 7/7 người đều bị gắn nhãn "quá
   tải", kể cả người cả năm chỉ có 36 ngày công, và người nặng nhất bị ghi
   "gấp 12 lần ngưỡng" — một tỉ số không thể có thật. Khi mọi người đều đỏ
   thì màu đỏ hết là tín hiệu.
   20 ngày công/tháng: chừa 2 ngày cho họp, đào tạo, việc đột xuất. */
export const CAP_MONTH = 20;       // ngưỡng "đầy tải" (ngày công/tháng)
export const CAP_HOSO_MONTH = 3;   // ngưỡng "nhiều hồ sơ"/tháng

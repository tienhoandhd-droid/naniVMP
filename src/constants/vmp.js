/* =====================================================================
 *  constants/vmp.js — VMP Domain Constants
 *  Status maps, departments, classifications, deadline rules
 * ===================================================================== */
import {
  Boxes, FlaskConical, Warehouse, Wind, Truck,
  LayoutDashboard, GanttChartSquare, Pencil, ShieldAlert,
  Activity, FileBarChart, AlertCircle, CalendarClock,
  FileText, ShieldCheck, Radar, BarChart3,
  Network,
} from "lucide-react";
import { C } from "./theme.js";

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
  { id: "sx", name: "Xưởng sản xuất", short: "SX" },
  { id: "cd", name: "Cơ điện", short: "CĐ" },
  { id: "kho", name: "Kho", short: "Kho" },
  { id: "qc", name: "RD / QC – Kiểm nghiệm", short: "RD/QC" },
  { id: "qa", name: "QA – QLCL", short: "QA" },
];

export const DEPT_DEEP = { sx: C.pinkText, cd: C.skyText, kho: C.marigoldText, qc: C.mintText, qa: C.lavText };
export const DEPT_COLOR = { sx: C.pink, cd: C.sky, kho: C.marigold, qc: C.mint, qa: C.lav };
export const DEPT_CODE = { sx: "SX", cd: "CĐ", kho: "Kho", qc: "QC", qa: "QA" };

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
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard, group: "monitor" },
  { id: "timeline", label: "Timeline VMP", icon: GanttChartSquare, group: "monitor" },
  { id: "inventory", label: "Danh mục đối tượng", icon: Boxes, group: "monitor" },
  { id: "update", label: "Cập nhật tiến độ", icon: Pencil, group: "monitor" },
  { id: "alerts", label: "Cảnh báo", icon: AlertCircle, group: "monitor" },
  { id: "mismatch", label: "Lệch pha hồ sơ", icon: FileText, group: "monitor" },
  { id: "workload", label: "Tải công việc", icon: Activity, group: "monitor" },
  { id: "risk", label: "QRM – Rủi ro", icon: ShieldAlert, group: "analysis" },
  { id: "reports", label: "Báo cáo & AI", icon: FileBarChart, group: "analysis" },
  { id: "audit", label: "Audit log", icon: ShieldCheck, group: "admin", adminOnly: true },
  { id: "quality", label: "Data quality", icon: Radar, group: "admin", adminOnly: true },
  { id: "missing", label: "Mã mất khỏi Sheet", icon: ShieldAlert, group: "admin", adminOnly: true },
  { id: "admin", label: "Quản trị", icon: BarChart3, group: "admin", adminOnly: true },
];

export const NAV_SUBS = {
  overview: "Theo dõi Kế hoạch Thẩm định Gốc (VMP) — CPC1 HN",
  timeline: "Timeline · Sơ đồ · Bố cục · Bảng — các mốc Đề cương → Thẩm định → Báo cáo → Đích VMP",
  inventory: "Danh mục đối tượng theo 5 nhóm — đồng bộ Google Sheet",
  update: "Nhập kết quả thực tế — ghi thẳng vào Google Sheet qua n8n",
  alerts: "Cảnh báo tới hạn / quá hạn & dự báo tái thẩm định",
  mismatch: "Hạng mục thẩm định xong nhưng hồ sơ chưa hoàn thiện (hoặc ngược lại)",
  workload: "Ma trận tải công việc Người × Tháng",
  risk: "Quản lý rủi ro chất lượng (ICH Q9 / EU GMP Annex 15)",
  reports: "Báo cáo tuần / tháng / quý + nhận xét AI · xuất PDF / DOCX / HTML",
  audit: "Nhật ký thao tác hệ thống — ALCOA+ audit trail",
  quality: "Phát hiện lỗi dữ liệu: thiếu mã, trùng ID, sai ngày, mâu thuẫn trạng thái",
  missing: "Hạng mục có trong DB nhưng KHÔNG còn trong Google Sheet — chờ admin/QA xác nhận",
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
  tuan: { t: "Báo cáo tuần", p: `Tuần ${Math.ceil((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 604800000)}/${new Date().getFullYear()}` },
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
export const CAP_MONTH = 10;       // ngưỡng "đầy tải" (ngày công/tháng)
export const CAP_HOSO_MONTH = 3;   // ngưỡng "nhiều hồ sơ"/tháng

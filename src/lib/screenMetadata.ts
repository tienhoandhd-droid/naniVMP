import type { ScreenId } from "./access.ts";

/** Authority tiêu đề cho cả route hiện trong menu, route ẩn và alias URL. */
export const SCREEN_TITLES = {
  today: "Việc hôm nay",
  overview: "Tổng quan VMP",
  timeline: "Dòng thời gian VMP",
  alerts: "Cảnh báo & ưu tiên",
  risk: "Cảnh báo & ưu tiên",
  progress: "Cập nhật tiến độ",
  inventory: "Cập nhật tiến độ",
  source: "Dữ liệu nguồn",
  workload: "Phân công & khối lượng",
  reports: "Báo cáo",
  rules: "Luật hệ thống đang áp dụng",
  health: "Chất lượng dữ liệu",
  audit: "Nhật ký thay đổi",
  accounts: "Vai trò & phạm vi",
  admin: "Cấu hình hệ thống",
  phanquyen: "Vai trò & phạm vi",
} as const satisfies Record<ScreenId, string>;

export function resolveScreenTitle(screenId: ScreenId): string {
  return SCREEN_TITLES[screenId];
}

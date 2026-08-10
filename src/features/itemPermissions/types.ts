export const ACCESS_CLASSES = [
  { id: "view_only", label: "Chỉ xem" },
  { id: "qa_progress_editor", label: "QA – Cập nhật 4 mốc hoàn thành" },
  { id: "qa_manager", label: "Quản lý QA" },
  { id: "equipment_scheduler", label: "Bộ phận quản lý thiết bị – Xếp lịch thẩm định" },
  { id: "equipment_manager", label: "Quản lý bộ phận quản lý thiết bị" },
] as const;

export type AccessClass = (typeof ACCESS_CLASSES)[number]["id"];

export const QA_TIMELINE_FIELDS = [
  "actual_protocol_date",
  "status_protocol",
  "actual_validation_date",
  "status_validation",
  "actual_report_date",
  "status_report",
  "actual_vmp_date",
  "status_vmp",
] as const;

export const EQUIPMENT_TIMELINE_FIELDS = ["scheduled_at"] as const;

export type EditableTimelineField =
  | (typeof QA_TIMELINE_FIELDS)[number]
  | (typeof EQUIPMENT_TIMELINE_FIELDS)[number];

export function normalizePersonName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

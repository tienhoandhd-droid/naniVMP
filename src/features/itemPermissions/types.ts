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

export type AccountStatus = "linked" | "unlinked" | "inactive";
export type MatchStatus = "unique" | "ambiguous";
export type QaAssignmentRole = "primary" | "collaborator";
export type RightsBasis = "qa_assignment" | "qa_management" | "hierarchy_scope";

export interface AccountCandidate {
  user_id: string;
  email: string;
  full_name: string;
  role: "admin" | "qa_manager" | "department_user" | "viewer";
  department: string | null;
  is_active: boolean;
  linked_person_id: string | null;
}

export interface DirectoryPerson {
  person_id: string;
  user_id: string | null;
  employee_code: string | null;
  full_name: string;
  department: string | null;
  email: string | null;
  account_status: AccountStatus;
  access_class: AccessClass | null;
  scope_departments: string[];
  scope_factory_ids: string[];
  scope_area_ids: string[];
  scope_line_ids: string[];
  version: number;
  /** Trường đọc tương thích trước khi dữ liệu area/line được chuẩn hóa. */
  access_areas: string[];
  email_sent_confirmed: boolean;
  is_active: boolean;
  match_status: MatchStatus;
}

export interface PermissionPersonPatch {
  employee_code?: string | null;
  full_name: string;
  department: string;
  email?: string | null;
  access_class: AccessClass;
  scope_departments: string[];
  scope_factory_ids: string[];
  scope_area_ids: string[];
  scope_line_ids: string[];
  email_sent_confirmed?: boolean;
  is_active?: boolean;
}

export interface ItemAssignment {
  assignment_id: string;
  validation_code: string;
  person_id: string | null;
  user_id: string | null;
  staff_name: string;
  employee_code: string | null;
  assignment_kind: "qa" | "equipment_department";
  assignment_role: QaAssignmentRole | null;
  source: string;
  source_text: string | null;
  unresolved_reason: string | null;
  expires_at: string | null;
  is_active: boolean;
  grants_access: boolean;
  object_department: string;
  area: string | null;
  line: string | null;
}

export interface EffectiveItemRight {
  person_id: string;
  user_id: string | null;
  full_name: string;
  validation_code: string;
  rights_basis: RightsBasis;
  can_view: boolean;
  editable_fields: EditableTimelineField[];
  view_reason: string;
  assignment_sources: string[];
  scope_match: boolean;
  area_match: boolean;
  factory_match?: boolean;
  line_match?: boolean;
}

export interface PermissionIssue {
  code: string;
  record_id: string;
  message: string;
}

export interface PermissionPreflight {
  mode: ItemPermissionMode;
  blocking_errors: PermissionIssue[];
  warnings: PermissionIssue[];
}

export function normalizePersonName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

export function isQaAccessClass(value: AccessClass | null): boolean {
  return value === "qa_progress_editor" || value === "qa_manager";
}

export function requiresHierarchyScope(value: AccessClass | null): boolean {
  return value !== null && !isQaAccessClass(value);
}

export function isDirectoryPersonComplete(person: DirectoryPerson): boolean {
  if (!person.department?.trim() || !person.access_class) return false;
  if (isQaAccessClass(person.access_class)) {
    return person.department === "qa";
  }
  return Boolean(
    person.scope_departments.length
    && person.scope_factory_ids.length
    && person.scope_area_ids.length
    && person.scope_line_ids.length,
  );
}

export function findDirectoryPersonById<T extends Pick<DirectoryPerson, "person_id">>(
  people: readonly T[],
  personId: string,
): T | null {
  return people.find((person) => person.person_id === personId) ?? null;
}
import type { ItemPermissionMode } from "../../types/domain.ts";

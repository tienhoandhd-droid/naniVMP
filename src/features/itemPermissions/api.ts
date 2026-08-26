import type { ItemPermissionMode } from "../../types/domain.ts";
import {
  ACCESS_CLASSES,
  LEGACY_ACCESS_CLASSES,
  type AccessClass,
  type AccountCandidate,
  type AccountStatus,
  type DirectoryPerson,
  type EffectiveItemRight,
  type ItemAssignment,
  type MatchStatus,
  type PermissionPersonPatch,
  type PermissionPreflight,
  type QaAssignmentRole,
  type RightsBasis,
} from "./types.ts";
import type { RootScopeOption, ScopeCatalog, ScopeOption } from "./scopeHierarchy.ts";
import { visibleSortedAccountCandidates } from "./accountListModel.ts";

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown, context: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} phải là object`);
  }
  return value as JsonObject;
}

function requiredString(row: JsonObject, key: string): string {
  if (typeof row[key] !== "string" || row[key] === "") {
    throw new Error(`Dữ liệu danh bạ thiếu hoặc sai ${key}`);
  }
  return row[key];
}

function nullableString(row: JsonObject, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`Dữ liệu danh bạ sai ${key}`);
  return value;
}

function optionalNullableString(row: JsonObject, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`Dữ liệu danh bạ sai ${key}`);
  return value;
}

function stringArray(row: JsonObject, key: string): string[] {
  const value = row[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Dữ liệu danh bạ thiếu hoặc sai ${key}`);
  }
  return [...value];
}

function optionalStringArray(row: JsonObject, key: string): string[] {
  const value = row[key];
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Dữ liệu danh bạ sai ${key}`);
  }
  return [...value];
}

function booleanValue(row: JsonObject, key: string): boolean {
  if (typeof row[key] !== "boolean") throw new Error(`Dữ liệu danh bạ sai ${key}`);
  return row[key];
}

function nullableBoolean(row: JsonObject, key: string): boolean | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "boolean") throw new Error(`Dữ liệu sai ${key}`);
  return value;
}

function optionalBoolean(row: JsonObject, key: string): boolean | undefined {
  const value = row[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new Error(`Dữ liệu sai ${key}`);
  return value;
}

function integerValue(row: JsonObject, key: string): number {
  const value = row[key];
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`Dữ liệu danh bạ thiếu hoặc sai ${key}`);
  }
  return value as number;
}

function enumValue<T extends string>(
  row: JsonObject,
  key: string,
  values: readonly T[],
): T {
  const value = row[key];
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`Dữ liệu danh bạ thiếu hoặc sai ${key}`);
  }
  return value as T;
}

export function decodeDirectoryPerson(value: unknown): DirectoryPerson {
  const row = objectValue(value, "Dòng danh bạ");
  const accessValue = row.access_class;
  let accessClass: AccessClass | null = null;
  if (accessValue !== null && accessValue !== undefined) {
    accessClass = enumValue(row, "access_class", [
      ...ACCESS_CLASSES.map((item) => item.id),
      ...LEGACY_ACCESS_CLASSES,
    ]);
  }

  return {
    person_id: requiredString(row, "person_id"),
    user_id: nullableString(row, "user_id"),
    employee_code: nullableString(row, "employee_code"),
    full_name: requiredString(row, "full_name"),
    department: optionalNullableString(row, "department"),
    email: nullableString(row, "email"),
    account_status: enumValue<AccountStatus>(row, "account_status", ["linked", "unlinked", "inactive"]),
    access_class: accessClass,
    scope_departments: optionalStringArray(row, "scope_departments"),
    scope_factory_ids: optionalStringArray(row, "scope_factory_ids"),
    scope_area_ids: optionalStringArray(row, "scope_area_ids"),
    scope_line_ids: optionalStringArray(row, "scope_line_ids"),
    access_areas: optionalStringArray(row, "access_areas"),
    version: integerValue(row, "version"),
    email_sent_confirmed: booleanValue(row, "email_sent_confirmed"),
    is_active: booleanValue(row, "is_active"),
    match_status: enumValue<MatchStatus>(row, "match_status", ["unique", "ambiguous"]),
  };
}

export function decodeAccountCandidate(value: unknown): AccountCandidate {
  const row = objectValue(value, "Tài khoản ứng viên");
  return {
    user_id: requiredString(row, "user_id"),
    email: requiredString(row, "email"),
    full_name: requiredString(row, "full_name"),
    role: enumValue(row, "role", ["admin", "qa_manager", "department_user", "viewer"]),
    department: nullableString(row, "department"),
    is_active: booleanValue(row, "is_active"),
    linked_person_id: nullableString(row, "linked_person_id"),
  };
}

function scopeRows(payload: JsonObject, key: string): unknown[] {
  const rows = payload[key];
  if (!Array.isArray(rows)) throw new Error(`Danh mục phạm vi thiếu hoặc sai ${key}`);
  return rows;
}

function decodeRootScopeOption(value: unknown, context: string): RootScopeOption {
  const row = objectValue(value, context);
  return {
    id: requiredString(row, "id"),
    code: requiredString(row, "code"),
    label: requiredString(row, "label"),
  };
}

function decodeScopeOption(value: unknown, context: string, parentKey: string): ScopeOption {
  const row = objectValue(value, context);
  return {
    ...decodeRootScopeOption(row, context),
    parentId: requiredString(row, parentKey),
  };
}

export function decodeScopeCatalog(value: unknown): ScopeCatalog {
  const payload = objectValue(value, "Danh mục phạm vi");
  return {
    departments: scopeRows(payload, "departments").map((row) => decodeRootScopeOption(row, "Bộ phận")),
    factories: scopeRows(payload, "factories").map((row) => decodeScopeOption(row, "Xưởng", "department_id")),
    areas: scopeRows(payload, "areas").map((row) => decodeScopeOption(row, "Khu vực", "factory_id")),
    lines: scopeRows(payload, "lines").map((row) => decodeScopeOption(row, "Line", "area_id")),
  };
}

export function decodeAssignment(value: unknown): ItemAssignment {
  const row = objectValue(value, "Phân công");
  const assignmentRoleValue = row.assignment_role;
  let assignmentRole: QaAssignmentRole | null = null;
  if (assignmentRoleValue !== null && assignmentRoleValue !== undefined) {
    assignmentRole = enumValue<QaAssignmentRole>(row, "assignment_role", ["primary", "collaborator"]);
  }
  return {
    assignment_id: requiredString(row, "assignment_id"),
    validation_code: requiredString(row, "validation_code"),
    person_id: nullableString(row, "person_id"),
    user_id: nullableString(row, "user_id"),
    staff_name: requiredString(row, "staff_name"),
    employee_code: nullableString(row, "employee_code"),
    assignment_kind: enumValue(row, "assignment_kind", ["qa", "equipment_department"]),
    assignment_role: assignmentRole,
    source: requiredString(row, "source"),
    source_text: nullableString(row, "source_text"),
    unresolved_reason: nullableString(row, "unresolved_reason"),
    expires_at: nullableString(row, "expires_at"),
    is_active: booleanValue(row, "is_active"),
    grants_access: nullableBoolean(row, "grants_access") === true,
    object_department: requiredString(row, "object_department"),
    area: nullableString(row, "area"),
    line: nullableString(row, "line"),
  };
}

export function decodeEffectiveRight(value: unknown): EffectiveItemRight {
  const row = objectValue(value, "Quyền dự kiến");
  const editable = stringArray(row, "editable_fields");
  const knownFields = new Set([
    "actual_protocol_date", "status_protocol",
    "actual_validation_date", "status_validation",
    "actual_report_date", "status_report",
    "actual_vmp_date", "status_vmp", "scheduled_at",
  ]);
  if (editable.some((field) => !knownFields.has(field))) {
    throw new Error("Quyền dự kiến chứa editable_fields không hợp lệ");
  }
  return {
    person_id: requiredString(row, "person_id"),
    user_id: nullableString(row, "user_id"),
    full_name: requiredString(row, "full_name"),
    validation_code: requiredString(row, "validation_code"),
    rights_basis: enumValue<RightsBasis>(row, "rights_basis", [
      "qa_assignment", "qa_management", "hierarchy_scope",
    ]),
    can_view: booleanValue(row, "can_view"),
    editable_fields: editable as EffectiveItemRight["editable_fields"],
    view_reason: requiredString(row, "view_reason"),
    assignment_sources: stringArray(row, "assignment_sources"),
    scope_match: booleanValue(row, "scope_match"),
    area_match: booleanValue(row, "area_match"),
    factory_match: optionalBoolean(row, "factory_match"),
    line_match: optionalBoolean(row, "line_match"),
  };
}

function decodeIssue(value: unknown): PermissionPreflight["warnings"][number] {
  const row = objectValue(value, "Vấn đề tiền kiểm");
  return {
    code: requiredString(row, "code"),
    record_id: requiredString(row, "record_id"),
    message: requiredString(row, "message"),
  };
}

export class ItemPermissionRpcError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ItemPermissionRpcError";
    this.code = code;
  }
}

async function callRpc(name: string, args: JsonObject): Promise<JsonObject> {
  const { supabase } = await import("../../lib/supabaseClient.ts");
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw new Error(error.message);
  const payload = objectValue(data, `Kết quả ${name}`);
  if (payload.ok === false) {
    throw new ItemPermissionRpcError(
      typeof payload.error_code === "string" ? payload.error_code : "RPC_FAILED",
      typeof payload.error === "string" ? payload.error : `${name} thất bại`,
    );
  }
  return payload;
}

export async function searchPermissionDirectory(query = ""): Promise<DirectoryPerson[]> {
  const payload = await callRpc("rpc_item_permission_directory", { p_query: query });
  if (!Array.isArray(payload.people)) throw new Error("Kết quả danh bạ thiếu people");
  return payload.people.map(decodeDirectoryPerson);
}

export async function searchActivePerformers(query = ""): Promise<DirectoryPerson[]> {
  return (await searchPermissionDirectory(query)).filter((person) => person.is_active);
}

export function prepareAccountCandidates(
  candidates: readonly AccountCandidate[],
): AccountCandidate[] {
  return visibleSortedAccountCandidates(candidates);
}

export async function searchAccountCandidates(query = ""): Promise<AccountCandidate[]> {
  const payload = await callRpc("rpc_item_permission_account_candidates", { p_query: query });
  if (!Array.isArray(payload.accounts)) throw new Error("Kết quả tài khoản thiếu accounts");
  return prepareAccountCandidates(payload.accounts.map(decodeAccountCandidate));
}

export function createLinkPermissionAccountArgs(
  personId: string,
  userId: string | null,
  reason: string,
  expectedVersion: number,
): JsonObject {
  return {
    p_person_id: personId,
    p_user_id: userId,
    p_reason: reason,
    p_expected_version: expectedVersion,
  };
}

export async function linkPermissionAccount(
  personId: string,
  userId: string | null,
  reason: string,
  expectedVersion: number,
): Promise<void> {
  await callRpc(
    "rpc_link_item_permission_account",
    createLinkPermissionAccountArgs(personId, userId, reason, expectedVersion),
  );
}

export async function fetchScopeCatalog(): Promise<ScopeCatalog> {
  return decodeScopeCatalog(await callRpc("rpc_item_permission_scope_catalog", {}));
}

export function createSavePermissionPersonArgs(
  personId: string | null,
  patch: PermissionPersonPatch,
  reason: string,
  expectedVersion: number | null,
): JsonObject {
  return {
    p_person_id: personId,
    p_patch: patch,
    p_reason: reason,
    p_expected_version: personId === null ? 0 : expectedVersion,
  };
}

export async function savePermissionPerson(
  personId: string | null,
  patch: PermissionPersonPatch,
  reason: string,
  expectedVersion: number | null,
): Promise<{ person_id: string; user_id: string | null; account_status: AccountStatus }> {
  const payload = await callRpc(
    "rpc_upsert_item_permission_staff",
    createSavePermissionPersonArgs(personId, patch, reason, expectedVersion),
  );
  return {
    person_id: requiredString(payload, "person_id"),
    user_id: nullableString(payload, "user_id"),
    account_status: enumValue<AccountStatus>(payload, "account_status", ["linked", "unlinked", "inactive"]),
  };
}

export async function importPermissionRows(
  rows: Array<PermissionPersonPatch & { row_number: number }>,
  reason: string,
): Promise<JsonObject> {
  return callRpc("rpc_import_item_permission_staff", { p_rows: rows, p_reason: reason });
}

export async function fetchItemAssignments(filters: {
  validationCode?: string | null;
  personId?: string | null;
} = {}): Promise<ItemAssignment[]> {
  const payload = await callRpc("rpc_item_assignments", {
    p_validation_code: filters.validationCode ?? null,
    p_person_id: filters.personId ?? null,
  });
  if (!Array.isArray(payload.assignments)) throw new Error("Kết quả phân công thiếu assignments");
  return payload.assignments.map(decodeAssignment);
}

export async function setItemAssignment(input: {
  personId: string;
  validationCode: string;
  assignmentKind: "qa" | "equipment_department";
  assignmentRole: QaAssignmentRole | null;
  action: "assign" | "revoke" | "replace_primary";
  reason: string;
  expectedPrimaryAssignmentId: string | null;
}): Promise<JsonObject> {
  return callRpc("rpc_set_item_assignment", createSetItemAssignmentArgs(input));
}

export function createSetItemAssignmentArgs(input: {
  personId: string;
  validationCode: string;
  assignmentKind: "qa" | "equipment_department";
  assignmentRole: QaAssignmentRole | null;
  action: "assign" | "revoke" | "replace_primary";
  reason: string;
  expectedPrimaryAssignmentId: string | null;
}): JsonObject {
  return {
    p_person_id: input.personId,
    p_validation_code: input.validationCode,
    p_assignment_kind: input.assignmentKind,
    p_assignment_role: input.assignmentRole,
    p_action: input.action,
    p_reason: input.reason,
    p_expected_primary_assignment_id: input.expectedPrimaryAssignmentId,
  };
}

export async function fetchEffectiveRights(filters: {
  personId?: string | null;
  validationCode?: string | null;
}): Promise<{ mode: ItemPermissionMode; rights: EffectiveItemRight[] }> {
  const payload = await callRpc("rpc_preview_item_rights", {
    p_person_id: filters.personId ?? null,
    p_validation_code: filters.validationCode ?? null,
  });
  if ((payload.mode !== "preview" && payload.mode !== "enforced") || !Array.isArray(payload.rights)) {
    throw new Error("Kết quả quyền dự kiến không hợp lệ");
  }
  return { mode: payload.mode, rights: payload.rights.map(decodeEffectiveRight) };
}

/**
 * Chuyển chế độ phân quyền theo hạng mục giữa DỰ THẢO và ÁP DỤNG THẬT.
 *
 * Đây là công tắc nặng nhất của cả hệ phân quyền: bật `enforced` là từ
 * giây đó RLS chặn thật, ai chưa được phân công sẽ không còn xem được
 * hạng mục của mình. Vì vậy nơi gọi phải hỏi lại và bắt nhập lý do —
 * server cũng đòi lý do, đây chỉ là hỏi trước cho tử tế.
 *
 * Ai được gọi và điều kiện tiền kiểm nào phải đạt là do RPC quyết định;
 * giao diện chỉ giấu nút cho đỡ nhầm, không phải biên chặn.
 */
export async function setItemPermissionsMode(
  mode: "preview" | "enforced",
  reason: string,
): Promise<void> {
  await callRpc("rpc_set_item_permissions_mode", { p_mode: mode, p_reason: reason });
}

export async function fetchPermissionPreflight(): Promise<PermissionPreflight> {
  const payload = await callRpc("rpc_item_permission_preflight", {});
  if ((payload.mode !== "preview" && payload.mode !== "enforced")
      || !Array.isArray(payload.blocking_errors) || !Array.isArray(payload.warnings)) {
    throw new Error("Kết quả tiền kiểm không hợp lệ");
  }
  return {
    mode: payload.mode,
    blocking_errors: payload.blocking_errors.map(decodeIssue),
    warnings: payload.warnings.map(decodeIssue),
  };
}

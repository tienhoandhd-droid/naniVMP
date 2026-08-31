import {
  BUSINESS_ROLE_CATALOG,
  BUSINESS_ROLE_IDS,
  isBusinessRole,
  type BusinessRole,
  type BusinessScopeMode,
} from "../../lib/businessRoles.ts";
import type { NguoiQuyenRow, VaiNghiepVuRow } from "../../lib/supabaseData.ts";
import type { DirectoryPerson } from "../itemPermissions/types.ts";

export type ReadinessState = "ready" | "missing" | "not_applicable" | "unknown";
export type ReadinessKey = "account" | "person_link" | "business_role" | "department" | "scope" | "assignment";

export interface ReadinessItem {
  key: ReadinessKey;
  label: string;
  state: ReadinessState;
  detail: string;
  nextAction: string | null;
}

export interface AccountAdministrationSources {
  accounts: readonly NguoiQuyenRow[];
  roles: readonly VaiNghiepVuRow[];
  directory: readonly DirectoryPerson[];
}

export interface AccountAdministrationRow {
  key: string;
  userId: string | null;
  personId: string | null;
  name: string;
  email: string | null;
  accountDepartment: string | null;
  personDepartment: string | null;
  accountActive: boolean;
  businessRole: BusinessRole | null;
  unresolvedReason: string | null;
  scopeMode: BusinessScopeMode | null;
  scopeSummary: string;
  readiness: readonly ReadinessItem[];
  sourceAccount: NguoiQuyenRow;
  directoryPerson: DirectoryPerson | null;
}

export type AccountControlState = "attention" | "unknown" | "ready";
export type AccountControlFilter = "all" | "attention" | BusinessRole;

export interface RoleControlRow {
  id: BusinessRole;
  label: string;
  scopeLabel: string;
  total: number;
  active: number;
  ready: number;
  attention: number;
  unknown: number;
}

const SCOPE_MODE_LABELS: Readonly<Record<BusinessScopeMode, string>> = {
  role_policy: "Theo chính sách vai",
  qa_assignment: "Theo Dữ liệu nguồn",
  hierarchy: "Theo phạm vi nguồn",
};

export function accountControlState(
  row: Pick<AccountAdministrationRow, "accountActive" | "readiness">,
): AccountControlState {
  if (!row.accountActive || row.readiness.some((item) => item.state === "missing")) return "attention";
  if (row.readiness.some((item) => item.state === "unknown")) return "unknown";
  return "ready";
}

export function buildRoleControlRows(
  rows: readonly Pick<AccountAdministrationRow, "businessRole" | "accountActive" | "readiness">[],
): RoleControlRow[] {
  return BUSINESS_ROLE_IDS.map((id) => {
    const members = rows.filter((row) => row.businessRole === id);
    const states = members.map(accountControlState);
    return {
      id,
      label: BUSINESS_ROLE_CATALOG[id].label,
      scopeLabel: SCOPE_MODE_LABELS[BUSINESS_ROLE_CATALOG[id].scopeMode],
      total: members.length,
      active: members.filter((row) => row.accountActive).length,
      ready: states.filter((state) => state === "ready").length,
      attention: states.filter((state) => state === "attention").length,
      unknown: states.filter((state) => state === "unknown").length,
    };
  });
}

export function filterAndSortAccountControlRows<T extends Pick<
  AccountAdministrationRow,
  "name" | "businessRole" | "accountActive" | "readiness"
>>(rows: readonly T[], filter: AccountControlFilter): T[] {
  const filtered = filter === "all"
    ? rows
    : filter === "attention"
      ? rows.filter((row) => accountControlState(row) === "attention")
      : rows.filter((row) => row.businessRole === filter);
  const rank: Readonly<Record<AccountControlState, number>> = { attention: 0, unknown: 1, ready: 2 };
  return [...filtered].sort((left, right) => (
    rank[accountControlState(left)] - rank[accountControlState(right)]
    || left.name.localeCompare(right.name, "vi")
  ));
}

export function buildAccountAdministrationRows(sources: AccountAdministrationSources): AccountAdministrationRow[] {
  const rolesByUserId = indexUniqueBy(sources.roles, (role) => role.user_id);
  const peopleByPersonId = indexUniqueBy(sources.directory, (person) => person.person_id);

  return sources.accounts.filter((account) => Boolean(account.user_id && account.co_tai_khoan)).map((account) => {
    const roleSourceAmbiguous = Boolean(account.user_id && rolesByUserId.ambiguous.has(account.user_id));
    const personSourceAmbiguous = Boolean(account.pid && peopleByPersonId.ambiguous.has(account.pid));
    const roleSource = account.user_id ? rolesByUserId.values.get(account.user_id) ?? null : null;
    const person = account.pid ? peopleByPersonId.values.get(account.pid) ?? null : null;
    return buildRow(account, roleSource, person, roleSourceAmbiguous, personSourceAmbiguous);
  });
}

export interface RoleChangePlan {
  userId: string;
  currentRole: BusinessRole | null;
  nextRole: BusinessRole;
  department: string | null;
  scopeMode: BusinessScopeMode;
  canSave: boolean;
  blocker: string | null;
}

export function planBusinessRoleChange(row: AccountAdministrationRow, nextRole: BusinessRole): RoleChangePlan {
  const scopeMode = BUSINESS_ROLE_CATALOG[nextRole].scopeMode;
  const department = departmentForRole(row, nextRole);
  if (!row.userId) {
    return {
      userId: "",
      currentRole: row.businessRole,
      nextRole,
      department,
      scopeMode,
      canSave: false,
      blocker: "Tài khoản chưa có user_id để lưu thay đổi.",
    };
  }
  if (scopeMode === "hierarchy" && !department) {
    return {
      userId: row.userId,
      currentRole: row.businessRole,
      nextRole,
      department: null,
      scopeMode,
      canSave: false,
      blocker: "Cần bộ phận hồ sơ để đặt vai xưởng.",
    };
  }
  return {
    userId: row.userId,
    currentRole: row.businessRole,
    nextRole,
    department,
    scopeMode,
    canSave: true,
    blocker: null,
  };
}

function buildRow(
  account: NguoiQuyenRow,
  roleSource: VaiNghiepVuRow | null,
  person: DirectoryPerson | null,
  roleSourceAmbiguous: boolean,
  personSourceAmbiguous: boolean,
): AccountAdministrationRow {
  const businessRole = roleSource && isBusinessRole(roleSource.business_role)
    ? roleSource.business_role
    : null;
  const unresolvedReason = resolveUnresolvedReason(roleSource, businessRole, roleSourceAmbiguous);
  const correctlyLinked = Boolean(
    account.user_id
    && account.pid
    && person
    && person.user_id === account.user_id,
  );
  const accountDepartment = account.bo_phan_tai_khoan ?? account.bo_phan;
  const personDepartment = person?.department ?? account.bo_phan_nguoi;
  const scopeMode = businessRole ? BUSINESS_ROLE_CATALOG[businessRole].scopeMode : null;
  const readiness = buildReadiness({
    account,
    businessRole,
    roleSource,
    person,
    roleSourceAmbiguous,
    personSourceAmbiguous,
    correctlyLinked,
    accountDepartment,
  });

  return {
    key: account.user_id ? `user:${account.user_id}` : account.pid ? `person:${account.pid}` : "account:unidentified",
    userId: account.user_id,
    personId: account.pid,
    name: account.ten ?? person?.full_name ?? "Chưa xác định",
    email: account.email ?? person?.email ?? null,
    accountDepartment,
    personDepartment,
    accountActive: account.tk_hoat_dong,
    businessRole,
    unresolvedReason,
    scopeMode,
    scopeSummary: summarizeScope(businessRole, person, correctlyLinked),
    readiness,
    sourceAccount: account,
    directoryPerson: person,
  };
}

function resolveUnresolvedReason(
  roleSource: VaiNghiepVuRow | null,
  businessRole: BusinessRole | null,
  roleSourceAmbiguous: boolean,
): string | null {
  if (businessRole) return null;
  if (roleSourceAmbiguous) return "role_source_ambiguous";
  if (!roleSource) return "role_source_missing";
  return roleSource.unresolved_reason
    ?? (roleSource.business_role ? "business_role_invalid" : "role_unresolved");
}

function buildReadiness(args: {
  account: NguoiQuyenRow;
  businessRole: BusinessRole | null;
  roleSource: VaiNghiepVuRow | null;
  person: DirectoryPerson | null;
  roleSourceAmbiguous: boolean;
  personSourceAmbiguous: boolean;
  correctlyLinked: boolean;
  accountDepartment: string | null;
}): ReadinessItem[] {
  const {
    account,
    businessRole,
    roleSource,
    person,
    roleSourceAmbiguous,
    personSourceAmbiguous,
    correctlyLinked,
    accountDepartment,
  } = args;
  const accountItem = !account.user_id || !account.co_tai_khoan
    ? item("account", "Tài khoản", "missing", "Chưa có tài khoản đăng nhập.", "Tạo hoặc nối tài khoản.")
    : !account.tk_hoat_dong
      ? item("account", "Tài khoản", "missing", "Tài khoản đang tắt.", "Bật lại tài khoản.")
      : item("account", "Tài khoản", "ready", "Tài khoản đang hoạt động.");

  const linkItem = !account.user_id || !account.pid
    ? item("person_link", "Nối hồ sơ", "missing", "Tài khoản chưa nối hồ sơ bằng ID.", "Nối tài khoản với hồ sơ.")
    : personSourceAmbiguous
      ? item("person_link", "Nối hồ sơ", "unknown", "Có nhiều hồ sơ cùng person_id nên chưa thể xác minh nối hồ sơ.")
    : !person
      ? item("person_link", "Nối hồ sơ", "missing", "Không tìm thấy hồ sơ theo person_id.", "Kiểm tra person_id và nối lại tài khoản.")
      : !correctlyLinked
        ? item("person_link", "Nối hồ sơ", "missing", "Hồ sơ tìm được đang thuộc user_id khác.", "Nối lại đúng tài khoản với hồ sơ.")
        : item("person_link", "Nối hồ sơ", "ready", "Tài khoản và hồ sơ khớp bằng ID.");

  const roleItem = roleSourceAmbiguous
    ? item("business_role", "Vai nghiệp vụ", "unknown", "Có nhiều nguồn vai cùng user_id nên chưa thể xác minh.")
    : !roleSource
    ? item("business_role", "Vai nghiệp vụ", "unknown", "Chưa có nguồn vai theo user_id để xác minh.")
    : !businessRole
      ? item("business_role", "Vai nghiệp vụ", "missing", "Server chưa giải được một trong năm vai nghiệp vụ.", "Chọn lại vai để sửa dữ liệu lệch.")
      : item("business_role", "Vai nghiệp vụ", "ready", "Server đã giải được vai nghiệp vụ.");

  return [
    accountItem,
    linkItem,
    roleItem,
    departmentReadiness(businessRole, person, correctlyLinked, accountDepartment),
    scopeReadiness(businessRole, person, correctlyLinked),
    assignmentReadiness(businessRole),
  ];
}

function departmentReadiness(
  role: BusinessRole | null,
  person: DirectoryPerson | null,
  correctlyLinked: boolean,
  accountDepartment: string | null,
): ReadinessItem {
  if (!role) return item("department", "Bộ phận", "unknown", "Chưa xác minh được vai để kiểm tra bộ phận.");
  if (role === "admin") return item("department", "Bộ phận", "not_applicable", "Theo chính sách vai Quản trị.");
  if (!correctlyLinked || !person) {
    return item("department", "Bộ phận", "unknown", "Hồ sơ chưa được nối đúng nên chưa xác minh bộ phận.");
  }
  if (role === "qa_manager" || role === "qa_staff") {
    return isQaDepartment(person.department)
      ? item("department", "Bộ phận", "ready", "Hồ sơ thuộc bộ phận QA.")
      : item("department", "Bộ phận", "missing", "Vai QA cần hồ sơ thuộc bộ phận QA.", "Chọn bộ phận QA cho hồ sơ.");
  }
  return sameDepartment(accountDepartment, person.department)
    ? item("department", "Bộ phận", "ready", "Bộ phận tài khoản và hồ sơ khớp nhau.")
    : item("department", "Bộ phận", "missing", "Vai xưởng cần bộ phận tài khoản và hồ sơ cùng một mã.", "Đồng bộ bộ phận tài khoản và hồ sơ.");
}

function scopeReadiness(
  role: BusinessRole | null,
  person: DirectoryPerson | null,
  correctlyLinked: boolean,
): ReadinessItem {
  if (!role) return item("scope", "Phạm vi", "unknown", "Chưa xác minh được vai để kiểm tra phạm vi.");
  if (role === "admin" || role === "qa_manager") {
    return item("scope", "Phạm vi", "not_applicable", "Theo chính sách vai.");
  }
  if (role === "qa_staff") return item("scope", "Phạm vi", "not_applicable", "Theo người phụ trách/hỗ trợ tại Dữ liệu nguồn.");
  if (!correctlyLinked || !person) {
    return item("scope", "Phạm vi", "unknown", "Hồ sơ chưa được nối đúng nên chưa xác minh phạm vi.");
  }
  return item("scope", "Phạm vi", "not_applicable", "Theo phạm vi xưởng được quản lý tại Dữ liệu nguồn.");
}

function assignmentReadiness(role: BusinessRole | null): ReadinessItem {
  if (!role) return item("assignment", "Phân công", "unknown", "Chưa xác minh được vai để kiểm tra phân công.");
  if (role === "qa_staff") {
    return item("assignment", "Phân công", "not_applicable", "Theo người phụ trách/hỗ trợ tại Dữ liệu nguồn.");
  }
  if (role === "workshop_manager" || role === "workshop_staff") {
    return item("assignment", "Phân công", "not_applicable", "Theo phạm vi nguồn và từng hạng mục công việc.");
  }
  return item("assignment", "Phân công", "not_applicable", "Vai này không cần phân công cá nhân.");
}

function summarizeScope(role: BusinessRole | null, person: DirectoryPerson | null, correctlyLinked: boolean): string {
  if (!role) return "Chưa xác minh vai trò";
  if (role === "admin" || role === "qa_manager") return "Theo chính sách vai";
  if (role === "qa_staff") return "Theo Dữ liệu nguồn";
  if (!correctlyLinked || !person) return "Chưa xác minh phạm vi";
  return "Theo phạm vi Dữ liệu nguồn";
}

function sameDepartment(accountDepartment: string | null, personDepartment: string | null): boolean {
  return Boolean(
    accountDepartment?.trim()
    && personDepartment?.trim()
    && accountDepartment.trim() === personDepartment.trim(),
  );
}

function isQaDepartment(department: string | null): boolean {
  return department?.trim().toLocaleLowerCase("vi") === "qa";
}

function departmentForRole(row: AccountAdministrationRow, role: BusinessRole): string | null {
  if (role === "admin") return null;
  if (role === "qa_manager" || role === "qa_staff") return "qa";
  const department = row.personDepartment?.trim() || row.accountDepartment?.trim();
  return department || null;
}

function item(
  key: ReadinessKey,
  label: string,
  state: ReadinessState,
  detail: string,
  nextAction: string | null = null,
): ReadinessItem {
  return { key, label, state, detail, nextAction };
}

function indexUniqueBy<T>(values: readonly T[], keyOf: (value: T) => string): {
  values: Map<string, T>;
  ambiguous: Set<string>;
} {
  const unique = new Map<string, T>();
  const ambiguous = new Set<string>();
  for (const value of values) {
    const key = keyOf(value);
    if (ambiguous.has(key)) continue;
    if (unique.has(key)) {
      unique.delete(key);
      ambiguous.add(key);
      continue;
    }
    unique.set(key, value);
  }
  return { values: unique, ambiguous };
}

export const BUSINESS_ROLE_IDS = [
  "admin", "qa_manager", "qa_staff", "workshop_manager", "workshop_staff",
] as const;

export type BusinessRole = typeof BUSINESS_ROLE_IDS[number];
export type BusinessScopeMode = "role_policy" | "qa_assignment" | "hierarchy";

export interface BusinessRoleDefinition {
  id: BusinessRole;
  label: string;
  description: string;
  scopeMode: BusinessScopeMode;
}

export const BUSINESS_ROLE_CATALOG = {
  admin: { id: "admin", label: "Quản trị", description: "Toàn quyền theo chính sách hệ thống", scopeMode: "role_policy" },
  qa_manager: { id: "qa_manager", label: "Quản lý QA", description: "Theo chính sách của vai Quản lý QA", scopeMode: "role_policy" },
  qa_staff: { id: "qa_staff", label: "Nhân viên QA", description: "Theo phân công QA", scopeMode: "qa_assignment" },
  workshop_manager: { id: "workshop_manager", label: "Quản lý xưởng", description: "Theo phạm vi phân cấp canonical", scopeMode: "hierarchy" },
  workshop_staff: { id: "workshop_staff", label: "Nhân viên xưởng", description: "Theo phạm vi canonical và phân công", scopeMode: "hierarchy" },
} as const satisfies Readonly<Record<BusinessRole, BusinessRoleDefinition>>;

export const BUSINESS_ROLE_LABELS: Readonly<Record<BusinessRole, string>> = Object.fromEntries(
  BUSINESS_ROLE_IDS.map((id) => [id, BUSINESS_ROLE_CATALOG[id].label]),
) as Record<BusinessRole, string>;

const BUSINESS_ROLE_ID_SET: ReadonlySet<string> = new Set(BUSINESS_ROLE_IDS);

export function isBusinessRole(value: unknown): value is BusinessRole {
  return typeof value === "string" && BUSINESS_ROLE_ID_SET.has(value);
}

export function businessRoleLabel(value: BusinessRole | null): string {
  return value === null ? "—" : BUSINESS_ROLE_LABELS[value];
}

import type { BusinessRole } from "./businessRoles.ts";
import type { NguoiQuyenRow, VaiNghiepVuRow } from "./supabaseData.ts";

export type ManagementWorkspace = "admin-management" | "denied";

export interface ManagementAccess {
  businessRole: BusinessRole | null;
  can: (screenId: string, action: string) => boolean;
}

/**
 * Biên phòng vệ phía giao diện. Vai và capability đều do server trả về:
 * capability cấp nhầm không được nâng bất kỳ vai nào khác thành quản trị viên.
 */
export function managementWorkspaceFor(access?: ManagementAccess): ManagementWorkspace {
  if (!access) return "denied";
  if (access.businessRole === "admin"
      && access.can("accounts", "manage_accounts")
      && access.can("accounts", "manage_authorization_policy")) {
    return "admin-management";
  }
  return "denied";
}

export interface AllowedEmailAccount {
  exists: boolean;
  name: string | null;
  userId: string | null;
}

const normalizeEmail = (value: string | null | undefined) =>
  String(value || "").trim().toLocaleLowerCase("en-US");

/** Đối chiếu allowlist bằng email tài khoản trong profiles, không bằng email danh bạ. */
export function accountForAllowedEmail(
  allowedEmail: string,
  roles: readonly VaiNghiepVuRow[],
  people: readonly Pick<NguoiQuyenRow, "user_id" | "ten">[],
): AllowedEmailAccount {
  const role = roles.find((row) => normalizeEmail(row.email) === normalizeEmail(allowedEmail));
  if (!role?.user_id) return { exists: false, name: null, userId: null };
  const person = people.find((row) => row.user_id === role.user_id);
  const name = typeof person?.ten === "string" && person.ten.trim() ? person.ten.trim() : null;
  return { exists: true, name, userId: role.user_id };
}

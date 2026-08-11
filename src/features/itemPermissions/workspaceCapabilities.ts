import type { AppUser } from "../../types/domain.ts";

export function resolveDirectoryWorkspaceCapabilities(
  isAdmin: boolean,
  user: Pick<AppUser, "role" | "accessClass"> | null | undefined,
): { canManageDirectory: boolean; canManageQaAssignments: boolean } {
  const canManageDirectory = isAdmin || user?.role === "admin";
  return {
    canManageDirectory,
    canManageQaAssignments: canManageDirectory
      || user?.role === "qa_manager"
      || user?.accessClass === "qa_manager",
  };
}

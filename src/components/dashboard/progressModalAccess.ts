export interface ProgressModalPermission {
  mode: "preview" | "enforced";
  canView: boolean;
}

export type ProgressModalContentState = "checking" | "revoked" | "error" | "content";

/** Chỉ dựng dữ liệu hạng mục khi quyền xem còn được xác nhận.
 * Preview giữ nguyên hành vi cũ: can_view dự kiến không được dùng để ẩn modal. */
export function progressModalContentState(
  permission: ProgressModalPermission | null,
  permissionError: string,
): ProgressModalContentState {
  if (!permission) return "checking";
  if (permission.mode === "enforced" && !permission.canView) {
    return permissionError ? "error" : "revoked";
  }
  return "content";
}

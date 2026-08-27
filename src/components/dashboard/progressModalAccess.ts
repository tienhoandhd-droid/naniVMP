export interface ProgressModalPermission {
  mode: "preview" | "enforced";
  canView: boolean;
}

export type ProgressModalContentState = "checking" | "revoked" | "error" | "content";

/** Catalog vẫn dùng preview tương thích; chỉ dedicated progress writer phải
 * kiểm lại quyền từng hạng mục ở mount/focus. */
export function skipsProgressPermissionRevalidation(
  mode: ProgressModalPermission["mode"] | undefined,
): mode is "preview" {
  return mode === "preview";
}

/** Chỉ dựng dữ liệu hạng mục khi quyền xem còn được xác nhận. */
export function progressModalContentState(
  permission: ProgressModalPermission | null,
  permissionError: string,
): ProgressModalContentState {
  if (!permission) return "checking";
  if (!permission.canView) {
    return permissionError ? "error" : "revoked";
  }
  return "content";
}

/* =====================================================================
 *  snapshotCache.ts — Bản chụp dữ liệu gần nhất, để mở trang là thấy ngay
 *  ---------------------------------------------------------------------
 *  rpc_get_vmp_dashboard trả ~633 KB JSON và mất ~340 ms. Trong lúc chờ,
 *  người dùng nhìn khung xương trống — mỗi lần tải lại trang đều vậy, dù
 *  dữ liệu hôm nay gần như y hệt lần trước.
 *
 *  Nên: vẽ NGAY bằng bản chụp lần trước, đồng thời gọi mạng lấy bản mới
 *  rồi thay vào. Người dùng thấy nội dung tức thì; con số vẫn đúng vì bản
 *  mới về sau vài trăm mili giây và đè lên.
 *
 *  Các chốt an toàn để bản cũ không thành "dữ liệu ma" hoặc vượt quyền:
 *    · quá 24 giờ thì bỏ, thà chờ còn hơn hiện số của hôm kia
 *    · khác NĂM kế hoạch thì bỏ (đổi năm là đổi hẳn tập dữ liệu)
 *    · khác NGƯỜI đăng nhập thì bỏ
 *    · chỉ lưu/nạp ở PREVIEW; ENFORCED luôn đọc mới từ RPC đã lọc quyền
 *    · khác PHIÊN BẢN cấu trúc thì bỏ (đổi hình dạng dữ liệu sau khi
 *      nâng cấp mà vẫn đọc bản cũ là nguồn của lỗi khó hiểu)
 *
 *  Giao diện luôn biết mình đang xem bản chụp: connectSheet đặt trạng
 *  thái "đang tải" kèm giờ của bản chụp cho tới khi bản mới về.
 * ===================================================================== */
import type { Activity, VmpObject } from "../types/domain.ts";

const KEY = "vmp_snapshot_v3";
const LEGACY_KEYS = ["vmp_snapshot_v1", "vmp_snapshot_v2"] as const;
/** Tăng số này mỗi khi hình dạng Activity/VmpObject đổi. */
const VERSION = 3;
const TTL_MS = 24 * 60 * 60 * 1000;

export type SnapshotPermissionMode = "preview" | "enforced";
export type SnapshotPermissionState = SnapshotPermissionMode | "unknown" | null;

export function permissionDataPolicy(
  mode: SnapshotPermissionState,
  previousMode: SnapshotPermissionMode | null,
): {
  allowSnapshot: boolean;
  allowLegacyFallback: boolean;
  bypassWatermark: boolean;
  revokeBeforeFetch: boolean;
} {
  if (mode === "preview") {
    return {
      allowSnapshot: true,
      /* Source/item visibility is now server-filtered and revisioned. The
       * legacy n8n payload has neither guarantee, even while item mode says
       * preview, so it can no longer be a browser fallback. */
      allowLegacyFallback: false,
      bypassWatermark: false,
      revokeBeforeFetch: false,
    };
  }
  if (mode === "enforced") {
    return {
      allowSnapshot: false,
      allowLegacyFallback: false,
      bypassWatermark: true,
      revokeBeforeFetch: previousMode !== "enforced",
    };
  }
  return {
    allowSnapshot: false,
    allowLegacyFallback: false,
    bypassWatermark: true,
    revokeBeforeFetch: true,
  };
}

interface Snapshot {
  v: number;
  year: number;
  userId: string;
  mode: SnapshotPermissionMode;
  authorizationRevision: number;
  at: number;
  objects: VmpObject[];
  activities: Activity[];
}

export function saveSnapshot(
  year: number,
  userId: string,
  mode: SnapshotPermissionMode,
  authorizationRevision: number,
  objects: VmpObject[],
  activities: Activity[],
): void {
  try {
    LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
    if (mode === "enforced") {
      localStorage.removeItem(KEY);
      return;
    }
    if (!Number.isSafeInteger(authorizationRevision) || authorizationRevision <= 0) {
      localStorage.removeItem(KEY);
      return;
    }
    const s: Snapshot = {
      v: VERSION, year, userId, mode, authorizationRevision,
      at: Date.now(), objects, activities,
    };
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Hết dung lượng hoặc trình duyệt chặn — bỏ qua, chỉ mất phần vẽ sớm.
    try { localStorage.removeItem(KEY); } catch { /* thôi vậy */ }
  }
}

export function loadSnapshot(
  year: number,
  userId: string,
  mode: SnapshotPermissionMode,
  authorizationRevision: number,
): { objects: VmpObject[]; activities: Activity[]; at: number } | null {
  try {
    LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
    if (mode === "enforced") {
      localStorage.removeItem(KEY);
      return null;
    }
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Snapshot;
    if (!Number.isSafeInteger(authorizationRevision) || authorizationRevision <= 0
        || !Number.isSafeInteger(s.authorizationRevision) || s.authorizationRevision <= 0
        || s.v !== VERSION || s.year !== year || s.userId !== userId || s.mode !== mode
        || s.authorizationRevision !== authorizationRevision) {
      localStorage.removeItem(KEY);
      return null;
    }
    if (!Array.isArray(s.activities) || !s.activities.length) return null;
    if (Date.now() - s.at > TTL_MS) return null;
    return { objects: s.objects || [], activities: s.activities, at: s.at };
  } catch { return null; }
}

export function clearSnapshot(): void {
  try {
    localStorage.removeItem(KEY);
    LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch { /* ignore */ }
}

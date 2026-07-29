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
 *  Ba chốt an toàn để bản cũ không thành "dữ liệu ma":
 *    · quá 24 giờ thì bỏ, thà chờ còn hơn hiện số của hôm kia
 *    · khác NĂM kế hoạch thì bỏ (đổi năm là đổi hẳn tập dữ liệu)
 *    · khác PHIÊN BẢN cấu trúc thì bỏ (đổi hình dạng dữ liệu sau khi
 *      nâng cấp mà vẫn đọc bản cũ là nguồn của lỗi khó hiểu)
 *
 *  Giao diện luôn biết mình đang xem bản chụp: connectSheet đặt trạng
 *  thái "đang tải" kèm giờ của bản chụp cho tới khi bản mới về.
 * ===================================================================== */
import type { Activity, VmpObject } from "../types/domain.ts";

const KEY = "vmp_snapshot_v1";
/** Tăng số này mỗi khi hình dạng Activity/VmpObject đổi. */
const VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000;

interface Snapshot {
  v: number;
  year: number;
  at: number;
  objects: VmpObject[];
  activities: Activity[];
}

export function saveSnapshot(year: number, objects: VmpObject[], activities: Activity[]): void {
  try {
    const s: Snapshot = { v: VERSION, year, at: Date.now(), objects, activities };
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Hết dung lượng hoặc trình duyệt chặn — bỏ qua, chỉ mất phần vẽ sớm.
    try { localStorage.removeItem(KEY); } catch { /* thôi vậy */ }
  }
}

export function loadSnapshot(year: number): { objects: VmpObject[]; activities: Activity[]; at: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Snapshot;
    if (s.v !== VERSION || s.year !== year) return null;
    if (!Array.isArray(s.activities) || !s.activities.length) return null;
    if (Date.now() - s.at > TTL_MS) return null;
    return { objects: s.objects || [], activities: s.activities, at: s.at };
  } catch { return null; }
}

export function clearSnapshot(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

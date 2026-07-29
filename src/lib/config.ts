/* =====================================================================
 *  config.js — Cấu hình kết nối & lưu trạng thái (localStorage)
 *  ---------------------------------------------------------------------
 *  - Đọc URL webhook n8n mặc định từ biến môi trường lúc build
 *    (đặt trong file .env hoặc trong GitHub Actions Secrets/Variables).
 *  - Lưu URL người dùng nhập trên web vào localStorage để lần sau
 *    mở lại trang không phải nhập lại (khác với bản xem trước artifact).
 * ===================================================================== */

// Biến môi trường Vite — phải có tiền tố VITE_ mới lộ ra phía client.
// CHỈ đọc URL — URL ghi (write) cấu hình trong n8n, KHÔNG lộ ra frontend.
import type { AppUser, ConnConfig } from "../types/domain.ts";

export const ENV_READ_URL = import.meta.env.VITE_VMP_READ_URL || "";
// Write URL: cấu hình thông qua Supabase system_config hoặc nhập trong Admin panel
// KHÔNG dùng VITE_VMP_WRITE_URL vì sẽ lộ endpoint ghi ra client
export const ENV_WRITE_URL = import.meta.env.VITE_N8N_WRITE_URL || ""; // chỉ dùng nội bộ, xoá khi production

const LS_KEY = "vmp_monitor_conn_v1";
const LS_USER = "vmp_monitor_user_v1";

/* ---- Kết nối (URL đọc/ghi) ---- */
export function loadConn(): ConnConfig | null {
  // Ưu tiên 1: URL đã lưu trong localStorage (người dùng tự nhập).
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && (o.readUrl || o.writeUrl)) return o;
    }
  } catch { /* ignore */ }

  // Ưu tiên 2: URL từ biến môi trường lúc build (.env / GitHub Secrets).
  if (ENV_READ_URL || ENV_WRITE_URL) {
    return { readUrl: ENV_READ_URL, writeUrl: ENV_WRITE_URL };
  }
  return null;
}

export function saveConn(readUrl?: string, writeUrl?: string): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ readUrl: readUrl || "", writeUrl: writeUrl || "" }));
  } catch { /* ignore */ }
}

export function clearConn(): void {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

/* ---- Phiên đăng nhập (ghi nhớ user, KHÔNG lưu mật khẩu) ---- */
export function loadUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(LS_USER);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveUser(user: AppUser | null): void {
  try {
    if (user) {
      // KHÔNG lưu token/session vào localStorage — Supabase SDK tự quản lý.
      // Chỉ giữ thông tin hiển thị: key/name/role/perm/dept/email.
      // Tách bỏ mọi thứ liên quan phiên/mật khẩu, chỉ giữ phần hiển thị.
      const u = user as AppUser & Record<string, unknown>;
      const { pass, access_token, refresh_token, token, session, ...safe } = u;
      void pass; void access_token; void refresh_token; void token; void session;
      localStorage.setItem(LS_USER, JSON.stringify(safe));
    } else {
      localStorage.removeItem(LS_USER);
    }
  } catch { /* ignore */ }
}

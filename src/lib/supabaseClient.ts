/* =====================================================================
 *  supabaseClient.js — Kết nối Supabase Auth & Database
 *  ---------------------------------------------------------------------
 *  Cung cấp: xác thực thật (email/password), phân quyền theo role,
 *  ghi audit log, và lấy thông tin người dùng từ bảng profiles.
 *
 *  CẤU HÌNH: Đặt 2 biến trong GitHub repo → Settings → Variables:
 *    VITE_SUPABASE_URL   = https://<your-project>.supabase.co
 *    VITE_SUPABASE_ANON  = eyJ... (anon key — an toàn cho frontend)
 * ===================================================================== */

import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../types/database.ts";
import type { AppUser, Perm, UserRole } from "../types/domain.ts";

/** Giá trị hợp lệ của audit_logs.action — lấy thẳng từ enum trong DB. */
export type AuditAction = Database["public"]["Enums"]["audit_action"];

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || "";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || "";

// Tạo client (hoặc null nếu chưa cấu hình)
export const supabase = (SUPABASE_URL && SUPABASE_ANON)
  ? createClient<Database>(SUPABASE_URL, SUPABASE_ANON, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null;

export const isSupabaseConfigured = () => !!supabase;

/* Gắn client ra window CHỈ KHI chạy trên máy nội bộ, để bộ kiểm đối chiếu
 * số trên màn với dữ liệu gốc.
 *
 * Vì sao phải chặn theo tên miền chứ không để mở: dù khoá anon vốn công
 * khai và mọi RPC ghi đã bị thu quyền khỏi anon (mục 8b/11a), một client
 * gắn sẵn trên window vẫn là một mồi ngon — bất kỳ đoạn mã lạ nào lọt vào
 * trang (tiện ích trình duyệt, thư viện bị chèn) đều gọi được ngay mà
 * không phải tự dựng client. Trang production không cần nó, nên không mở.
 * Đây là nguyên tắc bề mặt tối thiểu: cái gì không cần ở đó thì không để
 * ở đó, kể cả khi "chưa khai thác được". */
if (typeof window !== "undefined" && supabase) {
  const may = window.location.hostname;
  if (may === "localhost" || may === "127.0.0.1" || may === "[::1]") {
    (window as unknown as Record<string, unknown>).__vmpSb = supabase;
  }
}

/* ---- Đăng nhập ---- */
export async function signIn(email: string, password: string): Promise<AppUser> {
  if (!supabase) throw new Error("Supabase chưa cấu hình. Xem hướng dẫn cài đặt.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === "Invalid login credentials" ? "Email hoặc mật khẩu không đúng." : error.message);
  // Lấy profile (role, tên...)
  const profile = await getProfile(data.user.id);
  return { ...profile, uid: data.user.id, email: data.user.email, token: data.session.access_token };
}

/* ---- Đăng xuất ---- */
export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/* ---- Kiểm tra phiên hiện tại ---- */
export async function getSession(): Promise<AppUser | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const profile = await getProfile(data.session.user.id);
  return { ...profile, uid: data.session.user.id, email: data.session.user.email, token: data.session.access_token };
}

/* ---- Lấy profile từ bảng profiles ---- */
async function getProfile(uid: string): Promise<Omit<AppUser, "uid" | "token">> {
  if (!supabase) return { name: "User", role: "viewer", perm: "view" };
  const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).single();
  if (error || !data) return { name: "User", role: "viewer", perm: "view" };
  const permMap: Record<UserRole, Perm> = {
    admin: "admin", qa_manager: "admin", department_user: "edit", viewer: "view",
  };
  const role = (data.role || "viewer") as UserRole;
  return {
    name: data.full_name || "User",
    role,
    perm: permMap[role] || "view",
    department: data.department || "",
  };
}

/* ---- Đổi mật khẩu ---- */
export async function changePassword(newPassword: string): Promise<void> {
  if (!supabase) throw new Error("Supabase chưa cấu hình.");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

/* ---- Ghi audit log ---- */
export async function writeAuditLog(
  action: AuditAction,
  tableName: string,
  recordId: string,
  oldData: Json,
  newData: Json,
): Promise<void> {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from("audit_logs").insert({
    user_id: session.user.id,
    user_email: session.user.email,
    action,
    table_name: tableName,
    record_id: recordId,
    old_data: oldData,
    new_data: newData,
  });
}

/* ---- Lấy JWT token hiện tại (cho n8n guard) ---- */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

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

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || "";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || "";

// Tạo client (hoặc null nếu chưa cấu hình)
export const supabase = (SUPABASE_URL && SUPABASE_ANON)
  ? createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null;

export const isSupabaseConfigured = () => !!supabase;

/* ---- Đăng nhập ---- */
export async function signIn(email, password) {
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
export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const profile = await getProfile(data.session.user.id);
  return { ...profile, uid: data.session.user.id, email: data.session.user.email, token: data.session.access_token };
}

/* ---- Lấy profile từ bảng profiles ---- */
async function getProfile(uid) {
  if (!supabase) return { name: "User", role: "viewer", perm: "view" };
  const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).single();
  if (error || !data) return { name: "User", role: "viewer", perm: "view" };
  const permMap = { admin: "admin", qa_manager: "admin", department_user: "edit", viewer: "view" };
  return { name: data.full_name || "User", role: data.role || "viewer", perm: permMap[data.role] || "view", department: data.department || "" };
}

/* ---- Đổi mật khẩu ---- */
export async function changePassword(newPassword) {
  if (!supabase) throw new Error("Supabase chưa cấu hình.");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

/* ---- Ghi audit log ---- */
export async function writeAuditLog(action, tableName, recordId, oldData, newData) {
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
export async function getAccessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

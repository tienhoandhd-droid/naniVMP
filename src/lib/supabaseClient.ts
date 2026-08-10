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

/* Vé của phiên đang đăng nhập, để gửi kèm khi gọi webhook n8n.
 *
 * Vì sao cần: token `x-vmp-chat` nằm trong gói JavaScript công khai — mọi
 * biến VITE_* đều bị Vite nướng thẳng vào bundle, đó là thiết kế của Vite
 * chứ không phải lỗi cấu hình. Ai mở web cũng đọc được và gọi thẳng webhook:
 * tốn tiền gọi AI, và hỏi được dữ liệu VMP mà không cần đăng nhập.
 * Đổi token không cứu được — token mới cũng công khai y hệt.
 *
 * Vé phiên thì khác: nó của riêng một người, có hạn, và n8n xác thực được
 * với Supabase. Token tĩnh vẫn gửi kèm để chặn quét bừa ở lớp ngoài. */
export async function vePhien(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch { return null; }
}

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
  // Lấy profile (role, tên...). Đọc không được thì báo thẳng chứ không cho
  // vào với vai viewer mặc định — vào được mà thiếu quyền còn khó hiểu hơn
  // là không vào được kèm lý do.
  const profile = await getProfile(data.user.id);
  if (!profile) {
    throw new Error(
      "Đăng nhập được nhưng chưa đọc được hồ sơ người dùng. Thử lại; nếu vẫn vậy, liên hệ quản trị.",
    );
  }
  return { ...profile, uid: data.user.id, email: data.user.email, token: data.session.access_token };
}

/* ---- Đăng xuất ---- */
export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/* ---- Kiểm tra phiên hiện tại ----
 *
 * BA kết quả, không phải hai. "Không có phiên" và "chưa hỏi được" là hai
 * chuyện khác hẳn nhau, mà `AppUser | null` gộp chúng làm một.
 *
 * Vì sao quan trọng: getSession() của supabase-js đọc vé trong localStorage,
 * và nếu vé hết hạn thì nó gọi mạng để gia hạn. Mạng chập lúc đó → trả về
 * session null KÈM error. Bên gọi nếu hiểu null là "chưa đăng nhập" sẽ đá
 * người dùng ra màn đăng nhập chỉ vì một cái chớp mạng lúc tải lại trang —
 * đúng kiểu lỗi "thỉnh thoảng mới bị", loại khó tin nhất khi nghe báo.
 *
 * Nên: 'khong' = chắc chắn không có phiên → đăng xuất là đúng.
 *      'khong_ro' = chưa kết luận được → GIỮ NGUYÊN trạng thái đang có.
 */
export type TinhTrangPhien = "co" | "khong" | "khong_ro";

export async function layPhien(): Promise<{ tinhTrang: TinhTrangPhien; user: AppUser | null }> {
  if (!supabase) return { tinhTrang: "khong", user: null };
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return { tinhTrang: "khong_ro", user: null };
    if (!data.session) return { tinhTrang: "khong", user: null };
    const profile = await getProfile(data.session.user.id);
    // Đọc được vé nhưng không đọc nổi hồ sơ → chưa kết luận được. Xem
    // getProfile() bên dưới để biết vì sao không được đoán bừa ở đây.
    if (!profile) return { tinhTrang: "khong_ro", user: null };
    return {
      tinhTrang: "co",
      user: {
        ...profile,
        uid: data.session.user.id,
        email: data.session.user.email,
        token: data.session.access_token,
      },
    };
  } catch {
    return { tinhTrang: "khong_ro", user: null };
  }
}

/* ---- Lấy profile từ bảng profiles ----
 *
 * Trả null khi KHÔNG đọc được, chứ không trả vai 'viewer' mặc định.
 *
 * Bản trước nuốt lỗi rồi trả {name:'User', role:'viewer'}. Nghĩa là chỉ cần
 * một lần đọc bảng profiles trục trặc — mạng chập, RLS chớp — là admin bị
 * hạ thành "User · viewer" ngay sau khi tải lại trang, im lặng, không một
 * dòng lỗi. Người dùng thấy các nút biến mất và tưởng web hỏng. Hạ quyền
 * âm thầm còn tệ hơn báo lỗi thẳng: không ai biết để mà sửa. */
async function getProfile(uid: string): Promise<Omit<AppUser, "uid" | "token"> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).single();
  if (error || !data) return null;
  const permMap: Record<UserRole, Perm> = {
    admin: "admin", qa_manager: "admin", department_user: "edit", viewer: "view",
  };
  const role = (data.role || "viewer") as UserRole;
  let accessClass: string | null = null;
  try {
    // database.ts có thể chưa được sinh lại ngay sau migration danh bạ, nên
    // cast tên cột ở biên query. Lỗi/RLS/schema cũ chỉ làm mất accessClass,
    // không được biến một lần đọc phụ thành lỗi đăng nhập.
    const { data: performer, error: performerError } = await supabase
      .from("vmp_performers")
      .select("*")
      .eq("user_id" as never, uid)
      .eq("is_active", true)
      .maybeSingle();
    const performerRow = performer as unknown as Record<string, unknown> | null;
    if (!performerError && performerRow && typeof performerRow.access_class === "string") {
      accessClass = performerRow.access_class;
    }
  } catch {
    // Degrade về null: profiles vẫn là nguồn bắt buộc để xác thực và vào app.
  }
  return {
    name: data.full_name || "User",
    role,
    perm: permMap[role] || "view",
    department: data.department || "",
    accessClass,
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

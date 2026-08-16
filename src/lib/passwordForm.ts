/* =====================================================================
 *  passwordForm.ts — luật của form đổi/đặt lại mật khẩu
 *  ---------------------------------------------------------------------
 *  Cùng khuôn với loginForm.ts: validate là hàm thuần (unit test được),
 *  thông điệp lỗi Supabase dịch sang tiếng Việt ở MỘT chỗ duy nhất.
 *
 *  Luật cốt lõi: đổi mật khẩu phải chứng minh mình bằng MẬT KHẨU CŨ —
 *  updateUser() của Supabase không tự đòi, nên client phải re-auth bằng
 *  signInWithPassword trước (xem changePassword ở supabaseClient). Ngoại
 *  lệ duy nhất là chế độ recovery: người dùng vào bằng link email "quên
 *  mật khẩu", chính link đó đã là bằng chứng, không còn mật khẩu cũ để hỏi.
 * ===================================================================== */

export interface ChangePasswordValues {
  /** Mật khẩu hiện tại (bỏ qua ở chế độ recovery). */
  cu: string;
  moi: string;
  nhacLai: string;
}

export type ChangePasswordErrors = Partial<Record<keyof ChangePasswordValues, string>>;

export function validateChangePassword(
  { cu, moi, nhacLai }: ChangePasswordValues,
  { recovery = false }: { recovery?: boolean } = {},
): ChangePasswordErrors {
  const errors: ChangePasswordErrors = {};
  if (!recovery && !cu) errors.cu = "Vui lòng nhập mật khẩu hiện tại";
  if (!moi) errors.moi = "Vui lòng nhập mật khẩu mới";
  else if (moi.length < 6) errors.moi = "Mật khẩu mới tối thiểu 6 ký tự";
  else if (!recovery && cu && moi === cu) errors.moi = "Mật khẩu mới phải khác mật khẩu hiện tại";
  if (!errors.moi && nhacLai !== moi) errors.nhacLai = "Hai mật khẩu mới không khớp";
  return errors;
}

export function changePasswordErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/MAT_KHAU_CU_SAI|invalid login credentials/i.test(message)) {
    return "Mật khẩu hiện tại không đúng";
  }
  if (/should be different/i.test(message)) {
    return "Mật khẩu mới phải khác mật khẩu hiện tại";
  }
  if (/at least 6|password.*too short/i.test(message)) {
    return "Mật khẩu mới tối thiểu 6 ký tự";
  }
  if (/network|fetch/i.test(message)) return "Không kết nối được máy chủ. Vui lòng thử lại";
  return "Chưa đổi được mật khẩu. Vui lòng thử lại";
}

export function resetMailErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/security purposes|rate limit|too many/i.test(message)) {
    return "Vì lý do bảo mật, vui lòng thử lại sau ít phút";
  }
  if (/network|fetch/i.test(message)) return "Không kết nối được máy chủ. Vui lòng thử lại";
  return "Chưa gửi được mail. Vui lòng thử lại";
}

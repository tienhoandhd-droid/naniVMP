/* =====================================================================
 *  dangXuat.ts — Đăng xuất chắc chắn trên máy dùng chung
 *  ---------------------------------------------------------------------
 *  supabase-js 2.108 gọi POST /auth/v1/logout TRƯỚC rồi mới xoá vé trong
 *  localStorage. Mất mạng lúc đó → trả AuthRetryableFetchError và GIỮ vé,
 *  kể cả với signOut({ scope: "local" }) (scope local vẫn gọi máy chủ).
 *  Người sau tải lại trang là vào được tài khoản của người trước.
 *
 *  Cách làm: thử thu hồi trên máy chủ như cũ (scope global). Lỗi thì tự xoá
 *  vé khỏi máy, rồi gọi signOut({ scope: "local" }) lần nữa — lúc này không
 *  còn vé nên thư viện không gọi mạng, chỉ dọn phần còn lại và phát
 *  SIGNED_OUT cho các nơi đang nghe. Lỗi máy chủ được ghi console và trả về
 *  để giao diện báo cho người dùng.
 * ===================================================================== */

/** Khoá localStorage của phiên — đúng công thức mặc định của supabase-js
 *  (`sb-<project-ref>-auth-token`). Truyền tường minh vào createClient để
 *  biết chắc khoá cần xoá; vì trùng mặc định nên người đang đăng nhập
 *  không bị đá ra khi lên bản mới. */
export function authStorageKey(url: string): string {
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

type PhamViDangXuat = "global" | "local" | "others";

export interface AuthCoDangXuat {
  signOut(options?: { scope?: PhamViDangXuat }): Promise<{ error: unknown }>;
}

export interface KhoPhien {
  removeItem(key: string): void;
}

export type KetQuaDangXuat =
  | { thuHoiMayChu: true }
  | { thuHoiMayChu: false; loi: unknown };

export async function dangXuatChac(
  auth: AuthCoDangXuat,
  kho: KhoPhien,
  khoaPhien: string,
): Promise<KetQuaDangXuat> {
  const { error } = await auth.signOut();
  if (!error) return { thuHoiMayChu: true };

  console.error("[VMP] Không thu hồi được phiên trên máy chủ, xoá phiên trên máy này:", error);
  kho.removeItem(khoaPhien);
  const { error: loiCucBo } = await auth.signOut({ scope: "local" });
  if (loiCucBo) {
    // Đã xoá vé mà vẫn lỗi: không được báo "đã thoát" khi chưa chắc.
    throw new Error("Chưa xoá được phiên đăng nhập trên máy này. Đóng hẳn trình duyệt rồi mở lại.", { cause: loiCucBo });
  }
  return { thuHoiMayChu: false, loi: error };
}

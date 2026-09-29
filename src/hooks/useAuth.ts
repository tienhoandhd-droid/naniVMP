import { useState, useEffect, useRef, useCallback } from "react";
import { loadUser, saveUser } from "../lib/config.ts";
import { clearVmpCache } from "../lib/n8nAdapter.ts";
import { clearSnapshot } from "../lib/snapshotCache.ts";
import { clearPasswordRecoverySignal, isSupabaseConfigured, layPhien, signIn,
  signOut, subscribePasswordRecovery, supabase, type PasswordRecoverySignal } from "../lib/supabaseClient.ts";

// ======================== useAuth ========================
export function useAuth() {
  const [user, setUser] = useState(() => loadUser());
  const [loading, setLoading] = useState(true);
  const [recoverySignal, setRecoverySignal] = useState<PasswordRecoverySignal | null>(null);

  useEffect(() => subscribePasswordRecovery(setRecoverySignal), []);

  /* HỒ SƠ TRONG localStorage KHÔNG PHẢI BẰNG CHỨNG CÒN PHIÊN.
     Bản trước chỉ hỏi getSession() khi localStorage rỗng. Nên khi phiên
     Supabase chết mà hồ sơ còn (vé hết hạn, refresh token bị thu hồi, đổi
     mật khẩu ở máy khác), app vẫn dựng đủ dashboard như đã đăng nhập —
     trong khi useVmpData thấy không có phiên nên KHÔNG gọi gì cả. Kết quả:
     màn hình đầy đủ, "0/0 hạng mục", đứng ở "Đang chờ đồng bộ…" vĩnh viễn,
     không một dòng lỗi, và tải lại trang cũng không cứu được vì vòng lặp
     lặp lại y hệt. Người dùng chỉ thấy "web không tải được dữ liệu".
     Nay phiên thật là nguồn chân lý: không có phiên thì rơi về màn đăng nhập.

     Vẫn vẽ ngay bằng hồ sơ trong localStorage rồi mới đi hỏi, để không phải
     nhìn màn trắng mỗi lần mở app. Kết quả `co` thay cache bằng hồ sơ chính
     tắc mới nhất; `khong_ro` giữ cache để chịu được lỗi mạng tạm thời; chỉ
     kết quả `khong` chắc chắn mới xoá hồ sơ và đưa về màn đăng nhập. */
  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    let con = true;

    layPhien()
      .then(({ tinhTrang, user: phien }) => {
        if (!con) return;
        /* CHỈ đăng xuất khi CHẮC CHẮN không có phiên. 'khong_ro' nghĩa là
           mạng chập lúc gia hạn vé, hoặc chưa đọc nổi bảng profiles — lúc đó
           đá người dùng ra màn đăng nhập là sai, và sai theo kiểu tệ nhất:
           thỉnh thoảng mới xảy ra, ngay lúc tải lại trang. Giữ nguyên hồ sơ
           đang có, để lần tải sau tự khỏi. */
        if (tinhTrang === "khong") {
          clearSnapshot();
          setUser(null);
          saveUser(null);
          return;
        }
        if (tinhTrang === "co" && phien) { setUser(phien); saveUser(phien); }
      })
      .catch(() => { /* không kết luận được — giữ nguyên, lần sau thử lại */ })
      .finally(() => { if (con) setLoading(false); });

    /* Phiên chết GIỮA CHỪNG lúc tab đang mở: autoRefreshToken thử gia hạn,
       thất bại thì supabase-js phát SIGNED_OUT. Không nghe thì app lại rơi
       đúng vào trạng thái trên, chỉ khác là không cần tải lại trang. */
    const { data: sub } = supabase!.auth.onAuthStateChange((sk, phien) => {
      if (con && sk === "SIGNED_OUT" && !phien) {
        clearSnapshot();
        setUser(null);
        saveUser(null);
      }
    });

    return () => { con = false; sub?.subscription?.unsubscribe(); };
  }, []); // eslint-disable-line

  /* Chỉ ghi khi user THẬT SỰ đổi, KHÔNG ghi ở lần chạy đầu.
     Bản trước ghi cả lần đầu, nên mỗi lần app mount trong trạng thái chưa
     đăng nhập là một lần saveUser(null) — tức là XOÁ hồ sơ đang có trong
     localStorage. Bình thường vô hại vì đằng nào cũng chưa đăng nhập, nhưng
     nó tạo ra một khoảng đua: ai ghi hồ sơ vào localStorage đúng lúc app
     đang mount thì bị xoá mất ngay sau đó.
     Đó chính là thứ làm bộ kiểm e2e thỉnh thoảng đỏ ở bước đầu tiên — và
     nếu người dùng mở hai tab thì tab đang mount cũng xoá phiên của tab kia. */
  const daChay = useRef(false);
  useEffect(() => {
    if (!daChay.current) { daChay.current = true; return; }
    saveUser(user);
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured()) {
      throw new Error("Hệ thống chưa cấu hình Supabase Auth. Liên hệ IT để thiết lập.");
    }
    const profile = await signIn(email, password);
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    if (isSupabaseConfigured()) await signOut();
    clearPasswordRecoverySignal();
    setRecoverySignal(null);
    setUser(null);
    saveUser(null);
    clearVmpCache();
    clearSnapshot();   // máy dùng chung: không để dữ liệu người trước nằm lại
  }, []);

  const clearRecovery = useCallback(() => {
    clearPasswordRecoverySignal();
    setRecoverySignal(null);
  }, []);

  /* KHÔNG trả cờ quyền nào nữa (19/08, dọn xong cả `isAdmin` và
     `laAdminThat`). Trước đây hook này sinh `isAdmin` từ `user.perm` —
     cờ của hệ 4 vai CŨ, thực chất nghĩa là "admin HOẶC quản lý QA", và là
     nguồn của loại lỗi hiện nút mà máy chủ từ chối; `laAdminThat` thì suy
     từ `user.role === "admin"`, cùng bệnh chỉ khác mức độ. Quyền nay hỏi
     server qua `access.can(...)` ngay tại nơi cần, không còn đường tắt
     nào tính sẵn ở đây để lỡ dùng nhầm. */
  return { user, setUser, login, logout, loading, recoverySignal, clearRecovery };
}

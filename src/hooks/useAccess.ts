/* =====================================================================
 *  useAccess.ts — Tải quyền MÀN HÌNH của phiên hiện tại
 *  ---------------------------------------------------------------------
 *  Khác với quyền theo hạng mục ở `src/features/itemPermissions/`: hook
 *  này chỉ trả lời "được mở màn nào", không trả lời "sửa được cột nào".
 *
 *  Trong lúc chờ, và khi server chưa có `rpc_my_ui_access`, hook trả về
 *  quyền theo luật cũ ở chế độ `preview`. Lý do: migration phân quyền màn
 *  hình đi sau bản web này, và trong khoảng đó ứng dụng phải chạy y như
 *  trước chứ không được khoá ai. Ẩn menu vốn không phải bảo mật — RLS/RPC
 *  bên Supabase mới là biên chặn thật.
 * ===================================================================== */
import { useCallback, useEffect, useState } from "react";
import { hopNhatPreview, legacyAccessContext, parseAccessContext } from "../lib/access.ts";
import type { AccessContext } from "../lib/access.ts";
import { fetchUiAccess } from "../lib/supabaseData.ts";
import type { AppUser } from "../types/domain.ts";

export interface AccessState {
  /** Luôn có giá trị, để giao diện không phải xử lý null ở mọi chỗ. */
  access: AccessContext;
  dangTai: boolean;
  /** Chỉ khác null khi gọi RPC lỗi thật — không phải khi RPC chưa tồn tại. */
  loi: string | null;
  taiLai: () => void;
}

/** Chưa đăng nhập thì không có quyền nào. Màn đăng nhập không dùng tới. */
const KHONG_QUYEN = parseAccessContext(null);

export function useAccess(user: AppUser | null): AccessState {
  const [access, setAccess] = useState<AccessContext>(() => legacyAccessContext(user));
  const [dangTai, setDangTai] = useState<boolean>(!!user);
  const [loi, setLoi] = useState<string | null>(null);
  const [lanTai, setLanTai] = useState(0);

  const uid = user?.uid ?? null;
  const role = user?.role ?? null;
  const accessClass = user?.accessClass ?? null;

  useEffect(() => {
    if (!uid) {
      setAccess(KHONG_QUYEN);
      setDangTai(false);
      setLoi(null);
      return;
    }

    /* Dựng lại đường lùi từ chính ba trường mà effect này phụ thuộc, thay vì
       đóng gói cả object `user` vào dependency — object đổi tham chiếu mỗi
       lần render sẽ khiến effect chạy lại và gọi RPC liên tục. */
    const quyenCu = legacyAccessContext({ name: "", role: role ?? "viewer", perm: "view", accessClass });

    let con = true;
    setDangTai(true);
    setLoi(null);

    fetchUiAccess()
      .then((kq) => {
        if (!con) return;
        if (kq.trangThai === "co") {
          const tuServer = parseAccessContext(kq.payload);
          // Preview nghĩa là KHÔNG đổi gì: hiển thị vẫn theo quyền cũ, chỉ
          // lấy kết quả resolver về để đối chiếu. Xem hopNhatPreview.
          setAccess(
            tuServer.mode === "preview" ? hopNhatPreview(quyenCu, tuServer) : tuServer,
          );
          return;
        }
        if (kq.trangThai === "chua_co_rpc") {
          // Bình thường trong giai đoạn chuyển tiếp: giữ quyền cũ, không báo
          // lỗi cho người dùng, nhưng vẫn để lại dấu vết cho lập trình viên.
          console.info("useAccess: rpc_my_ui_access chưa có trên server — dùng quyền cũ.");
          setAccess(quyenCu);
          return;
        }
        // Lỗi thật: nói thẳng, và vẫn giữ quyền cũ để người dùng còn làm việc.
        console.error("useAccess: không đọc được quyền màn hình —", kq.thongDiep);
        setLoi(kq.thongDiep);
        setAccess(quyenCu);
      })
      .catch((e: unknown) => {
        if (!con) return;
        const thongDiep = e instanceof Error ? e.message : String(e);
        console.error("useAccess: lỗi ngoài dự kiến —", thongDiep);
        setLoi(thongDiep);
        setAccess(quyenCu);
      })
      .finally(() => {
        if (con) setDangTai(false);
      });

    return () => { con = false; };
  }, [uid, role, accessClass, lanTai]);

  const taiLai = useCallback(() => setLanTai((truoc) => truoc + 1), []);

  return { access, dangTai, loi, taiLai };
}

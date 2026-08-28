/* =====================================================================
 *  ScreenGuard.tsx — Chặn màn hình không được phép, kể cả khi gõ thẳng URL
 *  ---------------------------------------------------------------------
 *  Ẩn mục menu KHÔNG phải là bảo mật: ai cũng gõ được `#v=admin`. Guard này
 *  là lớp chặn ở tầng điều hướng. Lớp chặn thật vẫn nằm ở RLS/RPC bên
 *  Supabase — cả hai đều phải có, và cái này không thay thế cái kia.
 *
 *  Ở chế độ `preview`, guard KHÔNG chặn gì; nó chỉ ghi lại chỗ lệch để đối
 *  chiếu. Đây là chủ ý, giống hệt cách lớp quyền theo hạng mục đang chạy:
 *  bảy hồ sơ nhân sự trên live còn chưa phân loại, nên chặn theo quyền mới
 *  ngay sẽ khoá gần hết tài khoản không phải admin ra ngoài.
 * ===================================================================== */
import { useEffect } from "react";
import type { ReactNode } from "react";
import { C, TEXT } from "../../constants/theme.ts";
import { resolveAuthorizedView } from "../../lib/navigationContract.ts";
import { isAdminOnlyScreen } from "../../lib/access.ts";
import type { AccessContext, ScreenId } from "../../lib/access.ts";

/** Vì sao server không giải được vai trò — nói bằng tiếng người, kèm việc
 *  cần làm. Trang trắng hoặc câu "Bạn không có quyền" cụt lủn thì người
 *  dùng không biết phải gọi ai. */
const LY_DO: Record<string, string> = {
  no_profile: "Tài khoản này chưa có hồ sơ người dùng trong hệ thống.",
  inactive_profile: "Tài khoản này đang bị khoá.",
  no_person_link: "Tài khoản chưa được nối với hồ sơ nhân sự nào.",
  duplicate_person_link: "Tài khoản đang nối với nhiều hồ sơ nhân sự đang hoạt động.",
  missing_access_class: "Hồ sơ nhân sự chưa được phân loại vai trò nghiệp vụ.",
  department_mismatch: "Bộ phận trên tài khoản và trên hồ sơ nhân sự không khớp.",
  legacy_role_disabled: "Vai Chỉ xem cũ đã ngừng sử dụng; cần quản trị phân loại lại tài khoản vào một trong năm vai hiện hành.",
};

function KhongVaoDuoc({ access }: { access: AccessContext }) {
  const lyDo = access.unresolvedReason ? LY_DO[access.unresolvedReason] : null;
  return (
    <div style={{
      maxWidth: 560, margin: "64px auto", padding: 28, borderRadius: 18,
      background: C.surface, border: `1.5px solid ${C.pinkSoft}`,
      fontFamily: TEXT, color: C.plum, lineHeight: 1.6,
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
        Chưa có màn hình nào bạn được xem
      </div>
      <p style={{ margin: "0 0 10px", color: C.plumSoft }}>
        {lyDo ?? "Tài khoản của bạn chưa được cấp quyền xem màn hình nào."}
      </p>
      <p style={{ margin: 0, color: C.plumSoft }}>
        Liên hệ quản trị hệ thống để được phân loại vai trò và phạm vi làm việc.
        {access.unresolvedReason ? ` (mã: ${access.unresolvedReason})` : ""}
      </p>
    </div>
  );
}

export function ScreenGuard({ screenId, access, onRedirect, children }: {
  screenId: string;
  access: AccessContext;
  /** Đổi màn đang mở. Phải THAY THẾ mục lịch sử chứ không đẩy thêm, để nút
   *  Back không ném người dùng trở lại đúng màn vừa bị cấm. */
  onRedirect: (screenId: ScreenId) => void;
  children: ReactNode;
}) {
  const duocXem = access.canView(screenId);
  const manThayThe = duocXem ? null : (resolveAuthorizedView(screenId, access)?.screenId ?? null);
  const laQuanTriBiChan = isAdminOnlyScreen(screenId) && access.businessRole !== "admin";
  const dangThucThi = access.mode === "enforced" || laQuanTriBiChan;

  useEffect(() => {
    if (!dangThucThi) {
      // Chế độ đối chiếu: ghi lại chỗ lệch, không chặn.
      if (!duocXem) {
        console.warn(
          `ScreenGuard[preview]: quyền mới sẽ chặn màn "${screenId}", ` +
          "hiện chưa chặn vì screen_access_mode = preview.",
        );
      }
      return;
    }
    if (duocXem) return;
    if (manThayThe) onRedirect(manThayThe);
  }, [dangThucThi, duocXem, manThayThe, screenId, onRedirect]);

  if (!dangThucThi || duocXem) return <>{children}</>;
  // Đang chuyển hướng: không vẽ nội dung màn bị cấm, dù chỉ một khung hình.
  if (manThayThe) return (
    <div role="status" style={{
      maxWidth: 560, margin: "64px auto", padding: 28, borderRadius: 18,
      background: C.surface, border: `1.5px solid ${C.pinkSoft}`,
      fontFamily: TEXT, color: C.plum, lineHeight: 1.6,
    }}>
      Đang mở màn bạn được phép xem…
    </div>
  );
  return <KhongVaoDuoc access={access} />;
}

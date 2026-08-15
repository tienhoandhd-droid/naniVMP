/* =====================================================================
 *  SourceCatalogPage — màn "Danh mục & Nhập liệu"
 *  ---------------------------------------------------------------------
 *  Trang này chỉ là VỎ: toàn bộ workspace sáu mục (Đối tượng · Sản phẩm
 *  GMP · Người nhận cảnh báo · Nhập Excel · Chờ áp dụng · Lịch sử) nằm ở
 *  `src/features/catalogWorkspace/CatalogWorkspaceShell.tsx`.
 *
 *  Lịch sử: bản trước của file này dài ~1500 dòng — bảng 19 cột tự chế,
 *  sửa từng ô bằng nhấn đúp, ba "bộ dữ liệu đơn giản" với modal riêng và
 *  nút xoá vật lý, tab Người thực hiện đã chết. Tất cả đã thay bằng bộ
 *  trình bày dùng chung của Foundation (SmartTable + MobileTaskList) và
 *  hai hộp thoại có lý do + khoá phiên bản (CatalogObjectForm cho đối
 *  tượng, CatalogRecordDialog cho hai dataset còn lại). Không còn lối ghi
 *  nào đi vòng qua audit.
 *
 *  Quyền đọc từ `access` (rpc_my_ui_access) — không đọc `user.perm`.
 * ===================================================================== */
import CatalogWorkspaceShell from "../features/catalogWorkspace/CatalogWorkspaceShell.tsx";
import type { AccessContext } from "../lib/access.ts";

export default function SourceCatalogView({
  access, scopeLabel, updatedLabel, focus, onFocusConsumed, onReload,
}: {
  access: AccessContext;
  scopeLabel?: string;
  updatedLabel?: string;
  /** Deep-link từ màn Tiến độ: mở đúng đối tượng rồi tự xoá một lần. */
  focus?: { code: string; nhom?: string } | null;
  onFocusConsumed?: () => void;
  onReload?: () => void;
}) {
  return (
    <CatalogWorkspaceShell
      access={access}
      scopeLabel={scopeLabel}
      updatedLabel={updatedLabel}
      focus={focus}
      onFocusConsumed={onFocusConsumed}
      onReload={onReload}
    />
  );
}

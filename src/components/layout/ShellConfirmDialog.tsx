/* =====================================================================
 *  ShellConfirmDialog — hỏi lại trước khi rời đi lúc còn việc dở
 *  ---------------------------------------------------------------------
 *  Dựng trên chính `ViewportDialog` chứ không phải `window.confirm`. Hộp
 *  confirm của trình duyệt không theo bảng màu, không dịch được, không
 *  đặt được tiêu điểm ban đầu, và trên một số trình duyệt còn bị chặn.
 *
 *  Nó KHÔNG tự quyết định khi nào cần hỏi. Việc đó thuộc về nơi gọi, dựa
 *  trên sổ `DirtyStateProvider` — sổ giữ trạng thái, hộp thoại hỏi câu
 *  hỏi, hai việc tách bạch.
 * ===================================================================== */
import { AlertTriangle } from "lucide-react";

import ViewportDialog from "../ui/ViewportDialog.tsx";
import { C, TEXT, btnPrimary } from "../../constants/theme.ts";

export interface ShellConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  /** Danh sách form đang dở — nói rõ mất gì, đừng chỉ nói "có thay đổi". */
  keys?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Tên form dễ đọc. Khoá kỹ thuật không có ở đây thì hiện nguyên khoá —
 *  vẫn hơn là im lặng bỏ qua một form đang dở. */
const TEN_FORM: Record<string, string> = {
  "doi-mat-khau": "Đổi mật khẩu",
  "catalog": "Dữ liệu nguồn",
  "progress": "Cập nhật tiến độ",
};

export default function ShellConfirmDialog({
  open, title, description, keys = [],
  confirmLabel = "Vẫn thoát", cancelLabel = "Ở lại",
  onConfirm, onCancel,
}: ShellConfirmDialogProps) {
  return (
    <ViewportDialog
      open={open}
      title={title}
      description={description}
      icon={AlertTriangle}
      maxWidth={440}
      onRequestClose={onCancel}
      footer={
        <>
          <button type="button" onClick={onCancel}
            style={{ ...btnPrimary, background: C.surface, color: C.plum,
                     border: `1px solid var(--lp-line-strong)`, boxShadow: "none" }}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm}
            style={{ ...btnPrimary, background: C.rasp, color: "var(--lp-on-danger)",
                     boxShadow: "none" }}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {keys.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 20, fontFamily: TEXT, fontSize: 14,
                     lineHeight: 1.7, color: C.plum }}>
          {keys.map((k) => <li key={k}>{TEN_FORM[k] || k}</li>)}
        </ul>
      )}
    </ViewportDialog>
  );
}

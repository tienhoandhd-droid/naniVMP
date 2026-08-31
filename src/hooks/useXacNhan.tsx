/* =====================================================================
 *  useXacNhan — hỏi xác nhận bằng hộp thoại CHUẨN thay window.confirm
 *  ---------------------------------------------------------------------
 *  window.confirm khoá luồng JS, không theo dark mode, trên iOS hiện tên
 *  miền github.io phía trên câu tiếng Việt, và "Huỷ" không phân biệt được
 *  với "trình duyệt chặn popup". Repo đã có ShellConfirmDialog chuẩn
 *  (focus trap, Escape, aria-modal) nhưng trước 31/08 chỉ được dùng 1 chỗ.
 *
 *  Dùng:
 *    const { xacNhan, hopXacNhan } = useXacNhan();
 *    ...
 *    if (!(await xacNhan({ title: "Thu hồi phạm vi?", description: "..." }))) return;
 *    ...
 *    return (<>...{hopXacNhan}</>);
 * ===================================================================== */
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import ShellConfirmDialog from "../components/layout/ShellConfirmDialog.tsx";

export interface TuyChonXacNhan {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface DangHoi extends TuyChonXacNhan {
  resolve: (dongY: boolean) => void;
}

export function useXacNhan(): {
  xacNhan: (opts: TuyChonXacNhan) => Promise<boolean>;
  hopXacNhan: ReactNode;
} {
  const [dangHoi, setDangHoi] = useState<DangHoi | null>(null);

  const xacNhan = useCallback((opts: TuyChonXacNhan) =>
    new Promise<boolean>((resolve) => setDangHoi({ ...opts, resolve })), []);

  const dong = useCallback((dongY: boolean) => {
    setDangHoi((hienTai) => {
      hienTai?.resolve(dongY);
      return null;
    });
  }, []);

  const hopXacNhan = dangHoi ? (
    <ShellConfirmDialog
      open
      title={dangHoi.title}
      description={dangHoi.description}
      confirmLabel={dangHoi.confirmLabel ?? "Xác nhận"}
      cancelLabel={dangHoi.cancelLabel ?? "Huỷ"}
      onConfirm={() => dong(true)}
      onCancel={() => dong(false)}
    />
  ) : null;

  return { xacNhan, hopXacNhan };
}

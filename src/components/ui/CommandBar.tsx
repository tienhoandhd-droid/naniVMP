/* =====================================================================
 *  CommandBar — hàng hành động của một màn
 *  ---------------------------------------------------------------------
 *  Gom nút chính, nút phụ và ô tìm kiếm vào một vùng có nhãn, thay vì rải
 *  nút khắp trang. Có nhãn thì trình đọc màn hình gọi được tên vùng, và
 *  người dùng bàn phím nhảy thẳng tới được.
 * ===================================================================== */
import type { ReactNode } from "react";

export interface CommandBarProps {
  /** Nhãn của cả vùng — vd "Hành động danh mục". */
  label: string;
  children?: ReactNode;
  /** Nội dung căn phải, thường là nút chính. */
  trailing?: ReactNode;
  /** Dính lên đầu vùng cuộn khi lăn xuống. */
  sticky?: boolean;
}

export default function CommandBar({ label, children, trailing, sticky }: CommandBarProps) {
  return (
    <div
      className={`lp-command-bar${sticky ? " lp-command-bar--sticky" : ""}`}
      role="group"
      aria-label={label}
    >
      <div className="lp-command-bar__main">{children}</div>
      {trailing && <div className="lp-command-bar__trailing">{trailing}</div>}
    </div>
  );
}

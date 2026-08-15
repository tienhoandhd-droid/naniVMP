/* =====================================================================
 *  PageHeader — đầu trang chuẩn của mọi màn Lotus Pearl
 *  ---------------------------------------------------------------------
 *  Mỗi màn có ĐÚNG MỘT PageHeader, và PageHeader dựng ĐÚNG MỘT <h1>.
 *  Trước đây mỗi màn tự chế tiêu đề bằng <div> in đậm, nên trình đọc màn
 *  hình không có mốc nào để nhảy tới, còn bàn phím thì không biết trang
 *  bắt đầu từ đâu.
 *
 *  Tiêu đề dùng Cormorant Garamond (phông kể chuyện); phần mô tả, phạm vi
 *  và các nút vẫn là Be Vietnam Pro (phông vận hành) — xem spec §5.2.
 * ===================================================================== */
import type { ReactNode } from "react";

export interface PageHeaderProps {
  /** Dòng nhỏ phía trên tiêu đề, thường là tên nhóm màn. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Phạm vi dữ liệu đang xem — vd "Xưởng sản xuất · 2026". */
  scopeLabel?: string;
  /** Mốc dữ liệu — vd "Cập nhật 5 phút trước". */
  updatedLabel?: string;
  actions?: ReactNode;
}

export default function PageHeader({
  eyebrow, title, description, scopeLabel, updatedLabel, actions,
}: PageHeaderProps) {
  const coChanTrang = Boolean(scopeLabel || updatedLabel);

  return (
    <header className="lp-page-header">
      <div className="lp-page-header__main">
        {eyebrow && <p className="lp-page-header__eyebrow">{eyebrow}</p>}
        <h1 className="lp-page-header__title">{title}</h1>
        {description && <p className="lp-page-header__desc">{description}</p>}

        {coChanTrang && (
          <div className="lp-page-header__meta">
            {scopeLabel && (
              <span className="lp-page-header__scope">
                <span className="lp-page-header__meta-label">Phạm vi:</span> {scopeLabel}
              </span>
            )}
            {updatedLabel && <span className="lp-page-header__updated">{updatedLabel}</span>}
          </div>
        )}
      </div>

      {actions && <div className="lp-page-header__actions">{actions}</div>}
    </header>
  );
}

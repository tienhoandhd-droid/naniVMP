/* =====================================================================
 *  StateBoundary — năm trạng thái của một vùng dữ liệu
 *  ---------------------------------------------------------------------
 *  Lỗi số một của một dashboard: chỉ vẽ trường hợp "có dữ liệu". Rồi khi
 *  dữ liệu rỗng thì trang trắng, khi mạng hỏng thì trang trắng, khi thiếu
 *  quyền thì cũng trang trắng — người dùng không phân biệt nổi ba cảnh đó
 *  và báo chung một câu "web hỏng".
 *
 *  Năm trạng thái, năm câu trả lời khác nhau:
 *    loading         → đang tải, chờ chút
 *    empty           → chưa có dữ liệu thật, không mời làm gì cả
 *    filtered-empty  → có dữ liệu nhưng bộ lọc che hết → mời xoá bộ lọc
 *    error           → hỏng đường tải → mời thử lại
 *    forbidden       → không đủ quyền → nói rõ, không mời thử lại
 * ===================================================================== */
import type { ReactNode } from "react";

import { stateBoundaryAction } from "../../lib/visualContract";
import type { BoundaryState } from "../../lib/visualContract";

export interface StateBoundaryProps {
  state: BoundaryState;
  title: string;
  description?: ReactNode;
  /** Chỉ dùng ở trạng thái error. */
  onRetry?: () => void;
  /** Chỉ dùng ở trạng thái filtered-empty. */
  onClearFilters?: () => void;
  /** Số khung xám khi đang tải. */
  skeletonRows?: number;
}

export default function StateBoundary({
  state, title, description, onRetry, onClearFilters, skeletonRows = 3,
}: StateBoundaryProps) {
  const hanh_dong = stateBoundaryAction(state);

  if (state === "loading") {
    return (
      <div data-desktop-skeleton className="lp-state-boundary lp-state-boundary--loading" aria-busy="true" aria-live="polite">
        <span className="lp-visually-hidden">{title}</span>
        {Array.from({ length: skeletonRows }, (_, i) => (
          <span key={i} className="lp-skeleton-row" aria-hidden="true" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`lp-state-boundary lp-state-boundary--${state}`}
      role={state === "error" ? "alert" : "status"}
    >
      <p className="lp-state-boundary__title">{title}</p>
      {description && <p className="lp-state-boundary__desc">{description}</p>}

      {hanh_dong === "clear-filters" && onClearFilters && (
        <button type="button" className="lp-state-boundary__action" onClick={onClearFilters}>
          Xoá bộ lọc
        </button>
      )}
      {hanh_dong === "retry" && onRetry && (
        <button type="button" className="lp-state-boundary__action" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

/* =====================================================================
 *  MetricGrid — lưới ô số liệu
 *  ---------------------------------------------------------------------
 *  Hai luật, đều rút ra từ lỗi thật:
 *
 *  1. Ô KHÔNG bấm được thì KHÔNG mang vai trò nút. Bản cũ bọc mọi ô trong
 *     <button> cho tiện, nên người dùng bàn phím tab qua từng ô rồi bấm
 *     hụt, còn trình đọc màn hình đọc "nút" cho một con số tĩnh.
 *
 *  2. Một lưới chỉ có MỘT ô hero. Nếu ô nào cũng to thì không ô nào nổi,
 *     và mắt phải tự đi tìm con số quan trọng nhất.
 * ===================================================================== */
import type { ReactNode } from "react";

import { normalizeMetricPriority } from "../../lib/visualContract";
import type { MetricPriority, SemanticTone } from "../../lib/visualContract";

export interface MetricItem {
  id: string;
  label: string;
  value: ReactNode;
  /** Câu ngắn giải thích con số, hiện dưới nhãn. */
  hint?: string;
  tone?: SemanticTone;
  priority?: MetricPriority;
  /** Có hàm này thì ô trở thành nút thật; không có thì là chữ tĩnh. */
  onActivate?: () => void;
}

export interface MetricGridProps {
  items: readonly MetricItem[];
  /** Nhãn cho cả nhóm, đọc được bằng trình đọc màn hình. */
  label?: string;
}

function NoiDung({ item }: { item: MetricItem }) {
  return (
    <>
      <span className="lp-metric__label">{item.label}</span>
      <span className="lp-metric__value">{item.value}</span>
      {item.hint && <span className="lp-metric__hint">{item.hint}</span>}
    </>
  );
}

export default function MetricGrid({ items, label }: MetricGridProps) {
  return (
    <div className="lp-metric-grid" role="group" aria-label={label || "Số liệu tổng hợp"}>
      {items.map((item) => {
        const uu_tien = normalizeMetricPriority(item.priority);
        const lop = [
          "lp-metric",
          `lp-metric--${uu_tien}`,
          `lp-tone--${item.tone || "neutral"}`,
        ].join(" ");

        if (item.onActivate) {
          return (
            <button key={item.id} type="button" className={`${lop} lp-metric--action`} onClick={item.onActivate}>
              <NoiDung item={item} />
            </button>
          );
        }
        return (
          <div key={item.id} className={lop}>
            <NoiDung item={item} />
          </div>
        );
      })}
    </div>
  );
}

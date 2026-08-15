/* =====================================================================
 *  PriorityStrip — dải "việc cần làm trước"
 *  ---------------------------------------------------------------------
 *  Đặt ngay dưới PageHeader ở các màn vận hành: trả lời câu "hôm nay tôi
 *  phải xử lý gì" trước khi người dùng phải đọc bảng.
 *
 *  Luật spec §5.3: trạng thái LUÔN có chữ đi kèm màu. Người mù màu đỏ–xanh
 *  chiếm khoảng 8% nam giới; một dải chỉ khác nhau ở màu thì với họ là ba
 *  ô xám giống hệt nhau.
 * ===================================================================== */
import type { ReactNode } from "react";

import type { SemanticTone } from "../../lib/visualContract";

export interface PriorityItem {
  id: string;
  label: string;
  value: ReactNode;
  tone?: SemanticTone;
  /** Câu ngắn nói NÊN LÀM GÌ, không phải nhắc lại nhãn. */
  hint?: string;
  onActivate?: () => void;
}

export interface PriorityStripProps {
  items: readonly PriorityItem[];
  label?: string;
}

export default function PriorityStrip({ items, label }: PriorityStripProps) {
  if (items.length === 0) return null;

  return (
    <div className="lp-priority-strip" role="group" aria-label={label || "Việc cần xử lý trước"}>
      {items.map((item) => {
        const lop = `lp-priority lp-tone--${item.tone || "neutral"}`;
        const noi_dung = (
          <>
            <span className="lp-priority__value">{item.value}</span>
            <span className="lp-priority__label">{item.label}</span>
            {item.hint && <span className="lp-priority__hint">{item.hint}</span>}
          </>
        );

        return item.onActivate ? (
          <button key={item.id} type="button" className={`${lop} lp-priority--action`} onClick={item.onActivate}>
            {noi_dung}
          </button>
        ) : (
          <div key={item.id} className={lop}>{noi_dung}</div>
        );
      })}
    </div>
  );
}

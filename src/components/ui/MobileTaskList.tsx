/* =====================================================================
 *  MobileTaskList — bản điện thoại của SmartTable
 *  ---------------------------------------------------------------------
 *  Cùng mảng dòng, cùng view-model, cùng bộ lọc như SmartTable. Đây là
 *  luật §5.5 của spec: MỘT logic, nhiều cách trình bày. Chép lại luật
 *  nghiệp vụ sang bản mobile là con đường chắc chắn dẫn tới hai màn cùng
 *  một dữ liệu mà ra hai con số khác nhau.
 *
 *  Là <ul>/<li> thật và có nhãn: trình đọc màn hình đọc được "danh sách
 *  Đối tượng thẩm định, 12 mục".
 * ===================================================================== */
import type { ReactNode } from "react";

export interface MobileTaskListProps<Row> {
  label: string;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  renderItem: (row: Row) => ReactNode;
  empty?: ReactNode;
}

export default function MobileTaskList<Row>({
  label, rows, rowKey, renderItem, empty,
}: MobileTaskListProps<Row>) {
  if (rows.length === 0) {
    return (
      <div className="lp-mobile-task-list lp-mobile-task-list--empty" aria-label={label}>
        {empty || "Không có mục nào"}
      </div>
    );
  }

  return (
    <ul className="lp-mobile-task-list" aria-label={label}>
      {rows.map((row) => (
        <li key={rowKey(row)} className="lp-mobile-task">
          {renderItem(row)}
        </li>
      ))}
    </ul>
  );
}

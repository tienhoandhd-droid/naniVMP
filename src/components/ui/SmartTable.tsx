/* =====================================================================
 *  SmartTable — bảng ngữ nghĩa dùng chung
 *  ---------------------------------------------------------------------
 *  Là <table> thật, không phải lưới div. Lý do rất cụ thể: trình đọc màn
 *  hình chỉ đọc được "cột Trạng thái, dòng 12" khi có <table>, <th> và
 *  scope. Lưới div đọc ra một chuỗi chữ rời rạc không rõ thuộc cột nào.
 *
 *  <caption> là bắt buộc — nó là tên của bảng. Ẩn bằng mắt thì được, bỏ
 *  hẳn thì không: bảng không tên trong một trang có bốn bảng là bó tay.
 *
 *  Cặp đôi với MobileTaskList: cùng một mảng dòng, cùng một view-model.
 *  CSS cho hai bên loại trừ nhau bằng display:none nên chỉ một bản lọt
 *  vào cây trợ năng tại mỗi khổ màn hình.
 * ===================================================================== */
import { Fragment } from "react";
import type { ReactNode } from "react";

export interface SmartTableColumn<Row> {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  align?: "start" | "center" | "end";
  /** Cột phụ được ẩn trước khi bảng phải cuộn ngang. */
  priority?: "primary" | "supporting";
}

export interface SmartTableProps<Row> {
  caption: string;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  columns: readonly SmartTableColumn<Row>[];
  /** Có hàm này thì mỗi dòng mọc thêm một nút mở chi tiết. */
  renderExpandedRow?: (row: Row) => ReactNode;
  expandedRowId?: string | null;
  onExpandedRowChange?: (rowId: string | null) => void;
  empty?: ReactNode;
}

export default function SmartTable<Row>({
  caption, rows, rowKey, columns,
  renderExpandedRow, expandedRowId, onExpandedRowChange, empty,
}: SmartTableProps<Row>) {
  const moRong = Boolean(renderExpandedRow);
  const soCot = columns.length + (moRong ? 1 : 0);

  return (
    <div className="lp-smart-table">
      <table className="lp-smart-table__table">
        <caption className="lp-smart-table__caption">{caption}</caption>
        <thead>
          <tr>
            {columns.map((cot) => (
              <th
                key={cot.id}
                scope="col"
                className={`lp-smart-table__th lp-align--${cot.align || "start"}${
                  cot.priority === "supporting" ? " lp-col--supporting" : ""
                }`}
              >
                {cot.header}
              </th>
            ))}
            {moRong && (
              <th scope="col" className="lp-smart-table__th lp-align--end">
                <span className="lp-visually-hidden">Chi tiết</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={soCot} className="lp-smart-table__empty">
                {empty || "Không có dòng nào"}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const khoa = rowKey(row);
              const dangMo = moRong && expandedRowId === khoa;
              return (
                /* Fragment để dòng chi tiết đi NGAY SAU dòng của nó. Gom
                   hết dòng chi tiết xuống cuối bảng thì thứ tự đọc của
                   trình đọc màn hình không còn khớp thứ tự nhìn thấy. */
                <Fragment key={khoa}>
                  <tr className={dangMo ? "lp-smart-table__tr is-open" : "lp-smart-table__tr"}>
                    {columns.map((cot) => (
                      <td
                        key={cot.id}
                        className={`lp-smart-table__td lp-align--${cot.align || "start"}${
                          cot.priority === "supporting" ? " lp-col--supporting" : ""
                        }`}
                      >
                        {cot.cell(row)}
                      </td>
                    ))}
                    {moRong && (
                      <td className="lp-smart-table__td lp-align--end">
                        <button
                          type="button"
                          className="lp-smart-table__toggle"
                          aria-expanded={dangMo}
                          onClick={() => onExpandedRowChange?.(dangMo ? null : khoa)}
                        >
                          {dangMo ? "Thu gọn" : "Chi tiết"}
                        </button>
                      </td>
                    )}
                  </tr>
                  {dangMo && (
                    <tr className="lp-smart-table__detail-row">
                      <td colSpan={soCot} className="lp-smart-table__detail">
                        {renderExpandedRow?.(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

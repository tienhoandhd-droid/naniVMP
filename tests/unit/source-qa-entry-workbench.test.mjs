import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import CatalogSmartTable from "../../src/features/catalogWorkspace/CatalogSmartTable.tsx";

test("bảng Đối tượng dùng cách trình bày QA đã duyệt thay cho cột kỹ thuật cũ", () => {
  // Một bản đổi nhãn/cột về "Mã đối tượng", "Tên" hoặc nút "Sửa" sẽ làm
  // hợp đồng trình bày này thất bại; đó là lỗi vì QA cần nhận diện đối tượng,
  // lịch thẩm định và thao tác cập nhật ngay trong một hàng.
  const html = renderToStaticMarkup(React.createElement(CatalogSmartTable, {
    dataset: "objects",
    rows: [{
      recordId: "obj-1", businessKey: "TB-100", version: 3,
      data: {
        object_code: "TB-100", object_name: "Máy dập viên xoay tròn",
        department: "XSX", area_code: "KV-A", validate_flag: "y",
        first_month: 1, frequency_months: 12, owner_name: "Nguyễn An",
        criticality_score: 7,
      },
    }],
    canEdit: true,
    onEdit: () => {},
    expandedRowId: null,
    onExpandedRowChange: () => {},
  }));

  assert.match(html, /class="cw-bang cw-bang--objects"/);
  assert.match(html, /<span class="cw-doi-tuong__ma cw-ma">TB-100<\/span>/);
  assert.match(html, /<span class="cw-doi-tuong__ten">Máy dập viên xoay tròn<\/span>/);
  assert.match(html, />Đối tượng</);
  assert.match(html, />Lịch thẩm định</);
  assert.match(html, />Cập nhật</);
  assert.doesNotMatch(html, />Mã đối tượng</);
  assert.doesNotMatch(html, />Tên</);
});

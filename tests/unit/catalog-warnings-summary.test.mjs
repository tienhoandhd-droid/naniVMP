import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CatalogWarningsSummary from "../../src/components/catalog/CatalogWarningsSummary.tsx";

test("summary chỉ mở blocker mặc định", () => {
  const html = renderToStaticMarkup(React.createElement(CatalogWarningsSummary, { warnings: [
    { id: "missing-month", tone: "bad", title: "2 đối tượng thiếu tháng", body: "Không tính được timeline", items: ["TB-1", "TB-2"], blocking: true },
    { id: "never-iq", tone: "ask", title: "20 đối tượng chưa từng có IQ", body: "Cần rà lại", items: ["TB-3"], blocking: false },
  ] }));
  assert.match(html, /Có 2 nhóm vấn đề dữ liệu/);
  assert.match(html, /1 nhóm cần xử lý ngay/);
  assert.match(html, /<details[^>]*open=""><summary>[^]*?2 đối tượng thiếu tháng/);
  assert.match(html, /<details class="vmp-catalog-warning vmp-catalog-warning--ask"><summary>[^]*?20 đối tượng chưa từng có IQ/);
});

test("summary giới hạn danh sách và nêu số đối tượng còn lại", () => {
  const html = renderToStaticMarkup(React.createElement(CatalogWarningsSummary, { warnings: [
    { id: "review", tone: "ask", title: "Cần rà soát", body: "Một cảnh báo không chặn", items: ["TB-1", "TB-2"], more: 4, blocking: false },
  ] }));
  assert.match(html, /TB-1 · TB-2 … và 4 đối tượng nữa/);
});

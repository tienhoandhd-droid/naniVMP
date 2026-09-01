import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import CatalogImportPreviewTable, {
  catalogImportRowDiff,
} from "../../src/features/catalogWorkspace/CatalogImportPreviewTable.tsx";

const batch = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  dataset: "source_objects",
  status: "validated",
  total: 5,
  counts: { created: 1, updated: 1, unchanged: 2, errors: 1 },
  createdAt: "2026-09-01T01:00:00Z",
  committedAt: null,
};
const rows = [
  { rowNumber: 2, businessKey: "TB-001", objectKind: "Thiết bị", classification: "create", currentSnapshot: null, patch: { object_name: "Máy mới" }, errors: [], rowReason: null },
  { rowNumber: 3, businessKey: "TB-002", objectKind: "Thiết bị", classification: "update", currentSnapshot: { object_name: "Tên cũ" }, patch: { object_name: "Tên mới" }, errors: [], rowReason: "Chuẩn hóa tên" },
  { rowNumber: 4, businessKey: "TB-003", objectKind: "Thiết bị", classification: "unchanged", currentSnapshot: { object_name: "Giữ nguyên" }, patch: {}, errors: [], rowReason: null },
  { rowNumber: 5, businessKey: "TB-004", objectKind: "Thiết bị", classification: "error", currentSnapshot: null, patch: {}, errors: [{ code: "REQUIRED", message: "Thiếu tên", field: "object_name" }], rowReason: null },
];

test("diff dùng nhãn nghiệp vụ và giữ đúng trước → sau", () => {
  assert.deepEqual(catalogImportRowDiff(rows[1]), [{
    field: "object_name", label: "Tên đối tượng", before: "Tên cũ", after: "Tên mới",
  }]);
});

test("preview table có summary server, bảng ngữ nghĩa, expansion và trạng thái tải", () => {
  const html = renderToStaticMarkup(React.createElement(CatalogImportPreviewTable, {
    state: { batchId: batch.id, batch, rows, nextCursor: 5, loaded: 4 },
    loadingMore: false,
    onLoadMore() {},
    async onSaveRowReason() { return { ok: true }; },
  }));
  assert.match(html, /Tạo mới<\/span><b>1<\/b>/);
  assert.match(html, /Cập nhật<\/span><b>1<\/b>/);
  assert.match(html, /Đã tải 4\/5 dòng/);
  assert.match(html, /<table[^>]*data-cw-import-preview-table/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Tải thêm/);
  assert.match(html, /Lý do ngoại lệ/);
});

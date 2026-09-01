import test from "node:test";
import assert from "node:assert/strict";

import {
  appendCatalogImportPreviewPage,
  catalogImportCommitBlock,
  emptyCatalogImportPreviewState,
  filterCatalogImportRows,
} from "../../src/features/catalogWorkspace/catalogImportPreviewModel.ts";

const BATCH_A = "aaaaaaaa-1111-4111-8111-111111111111";
const BATCH_B = "bbbbbbbb-2222-4222-8222-222222222222";

const batch = {
  id: BATCH_A,
  dataset: "source_objects",
  status: "validated",
  total: 3,
  counts: { created: 1, updated: 1, unchanged: 1, errors: 0 },
  createdAt: "2026-09-01T01:00:00Z",
  committedAt: null,
};

const rows = [
  { rowNumber: 2, businessKey: "TB-001", objectKind: "equipment", classification: "create",
    currentSnapshot: null, patch: { object_code: "TB-001" }, errors: [], rowReason: null },
  { rowNumber: 3, businessKey: "TB-002", objectKind: "equipment", classification: "update",
    currentSnapshot: { object_name: "Cũ" }, patch: { object_name: "Mới" }, errors: [], rowReason: null },
  { rowNumber: 4, businessKey: "HT-003", objectKind: "system", classification: "unchanged",
    currentSnapshot: { object_name: "Giữ nguyên" }, patch: {}, errors: [], rowReason: null },
];

test("coordinator nối trang đúng thứ tự và dừng tại cursor null", () => {
  const first = appendCatalogImportPreviewPage(emptyCatalogImportPreviewState(BATCH_A), {
    batch, rows: rows.slice(0, 2), nextCursor: 3,
  });
  const complete = appendCatalogImportPreviewPage(first, {
    batch, rows: rows.slice(2), nextCursor: null,
  });
  assert.deepEqual(complete.rows.map((row) => row.rowNumber), [2, 3, 4]);
  assert.equal(complete.nextCursor, null);
  assert.equal(complete.loaded, 3);
});

test("coordinator không trộn batch, lặp dòng hoặc cursor không tiến", () => {
  const first = appendCatalogImportPreviewPage(emptyCatalogImportPreviewState(BATCH_A), {
    batch, rows: rows.slice(0, 2), nextCursor: 3,
  });
  assert.throws(() => appendCatalogImportPreviewPage(first, {
    batch: { ...batch, id: BATCH_B }, rows: [rows[2]], nextCursor: null,
  }), /batch/i);
  assert.throws(() => appendCatalogImportPreviewPage(first, {
    batch, rows: [rows[1]], nextCursor: null,
  }), /row/i);
  assert.throws(() => appendCatalogImportPreviewPage(first, {
    batch, rows: [rows[2]], nextCursor: 3,
  }), /cursor/i);
});

test("lọc chỉ tác động dòng đã tải và không thay đổi mảng nguồn", () => {
  const byCode = filterCatalogImportRows(rows, { search: "tb-002", classification: "all" });
  const byKind = filterCatalogImportRows(rows, { search: "", classification: "unchanged" });
  assert.deepEqual(byCode.map((row) => row.rowNumber), [3]);
  assert.deepEqual(byKind.map((row) => row.businessKey), ["HT-003"]);
  assert.equal(rows.length, 3);
});

test("readiness ưu tiên request, preview, trạng thái, dòng lỗi rồi lý do", () => {
  const base = { busy: false, previewOk: true, status: "validated", errors: 0, reason: "Đối chiếu kỳ 09/2026" };
  assert.equal(catalogImportCommitBlock(base), null);
  assert.equal(catalogImportCommitBlock({ ...base, busy: true })?.code, "request");
  assert.equal(catalogImportCommitBlock({ ...base, previewOk: false })?.code, "preview");
  assert.equal(catalogImportCommitBlock({ ...base, status: "expired" })?.code, "status");
  assert.equal(catalogImportCommitBlock({ ...base, errors: 2 })?.code, "rows");
  assert.deepEqual(catalogImportCommitBlock({ ...base, reason: "  " }), {
    code: "required",
    message: "Nhập lý do của cả lô",
    focusId: "cw-import-batch-reason",
  });
});

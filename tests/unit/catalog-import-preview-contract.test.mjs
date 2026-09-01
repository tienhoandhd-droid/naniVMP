import test from "node:test";
import assert from "node:assert/strict";

import { decodeCatalogImportPreview } from "../../src/features/catalogWorkspace/catalogImportPreviewContract.ts";

const BATCH_ID = "aaaaaaaa-1111-4111-8111-111111111111";

const payload = {
  ok: true,
  batch: {
    id: BATCH_ID,
    dataset: "source_objects",
    status: "validated",
    total: 2,
    counts: { created: 1, updated: 1, unchanged: 0, errors: 0 },
    created_at: "2026-09-01T01:00:00Z",
    committed_at: null,
  },
  rows: [
    {
      row_number: 2,
      business_key: "TB-001",
      object_kind: "equipment",
      classification: "create",
      current_snapshot: null,
      patch: { object_code: "TB-001", object_name: "Máy 1" },
      errors: [],
      row_reason: null,
    },
    {
      row_number: 3,
      business_key: "TB-002",
      object_kind: "equipment",
      classification: "update",
      current_snapshot: { object_name: "Tên cũ" },
      patch: { object_name: "Tên mới" },
      errors: [],
      row_reason: "Điều chỉnh tên theo hồ sơ",
    },
  ],
  next_cursor: null,
};

test("decoder đổi payload preview chính xác sang contract camelCase", () => {
  const result = decodeCatalogImportPreview(payload);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.page.batch.counts, {
    created: 1, updated: 1, unchanged: 0, errors: 0,
  });
  assert.deepEqual(result.page.rows[1], {
    rowNumber: 3,
    businessKey: "TB-002",
    objectKind: "equipment",
    classification: "update",
    currentSnapshot: { object_name: "Tên cũ" },
    patch: { object_name: "Tên mới" },
    errors: [],
    rowReason: "Điều chỉnh tên theo hồ sơ",
  });
  assert.equal(result.page.nextCursor, null);
});

test("decoder từ chối extra key và trường catalog ngoài allowlist", () => {
  assert.throws(() => decodeCatalogImportPreview({ ...payload, uploaded_by: "leak" }), /exact/i);
  assert.throws(() => decodeCatalogImportPreview({
    ...payload,
    batch: { ...payload.batch, uploaded_by: "leak" },
  }), /exact/i);
  assert.throws(() => decodeCatalogImportPreview({
    ...payload,
    rows: [{ ...payload.rows[0], expected_version: 7 }, payload.rows[1]],
  }), /exact/i);
  assert.throws(() => decodeCatalogImportPreview({
    ...payload,
    rows: [{ ...payload.rows[0], patch: { ...payload.rows[0].patch, jwt_secret: "leak" } }, payload.rows[1]],
  }), /catalog field/i);
});

test("decoder từ chối tổng, enum, timestamp và thứ tự dòng sai", () => {
  assert.throws(() => decodeCatalogImportPreview({
    ...payload,
    batch: { ...payload.batch, counts: { ...payload.batch.counts, errors: 1 } },
  }), /total/i);
  assert.throws(() => decodeCatalogImportPreview({
    ...payload,
    rows: [{ ...payload.rows[0], classification: "server" }, payload.rows[1]],
  }), /classification/i);
  assert.throws(() => decodeCatalogImportPreview({
    ...payload,
    rows: [payload.rows[1], payload.rows[0]],
  }), /row_number/i);
  assert.throws(() => decodeCatalogImportPreview({
    ...payload,
    batch: { ...payload.batch, created_at: "không-phải-ngày" },
  }), /created_at/i);
});

test("decoder nhận error allowlist và che bề mặt lỗi lạ", () => {
  assert.deepEqual(decodeCatalogImportPreview({
    ok: false, error_code: "BATCH_NOT_FOUND", error: "Không tìm thấy batch",
  }), {
    ok: false, errorCode: "BATCH_NOT_FOUND", error: "Không tìm thấy batch",
  });
  assert.throws(() => decodeCatalogImportPreview({
    ok: false, error_code: "FORBIDDEN_DETAIL", error: "Không được phép",
  }), /error_code/i);
  assert.throws(() => decodeCatalogImportPreview({
    ok: false, error_code: "FORBIDDEN", error: "Không được phép", batch_id: BATCH_ID,
  }), /exact/i);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeReportExportPreparation,
  decodeReportSnapshotReceipt,
  validateCreateReportSnapshotInput,
} from "../../src/features/reportSnapshots/contracts.ts";
import { reportSnapshotFileName } from "../../src/features/reportSnapshots/reportSnapshotModel.ts";
import {
  createReportSnapshot,
  prepareReportExport,
} from "../../src/features/reportSnapshots/api.ts";

const HASH = "a".repeat(64);
const SNAPSHOT_ID = "11111111-1111-4111-8111-111111111111";
const RECEIPT_ID = "22222222-2222-4222-8222-222222222222";

test("receipt snapshot bắt exact UUID, sha256 lowercase, enum và timestamp", () => {
  assert.deepEqual(decodeReportSnapshotReceipt({
    snapshot_id: SNAPSHOT_ID,
    content_hash: HASH,
    period_label: "Tháng 08/2026",
    status: "draft",
    created_at: "2026-09-01T02:00:00.000Z",
  }), {
    snapshotId: SNAPSHOT_ID,
    contentHash: HASH,
    periodLabel: "Tháng 08/2026",
    status: "draft",
    createdAt: "2026-09-01T02:00:00.000Z",
  });
  assert.throws(() => decodeReportSnapshotReceipt({
    snapshot_id: SNAPSHOT_ID, period_label: "Tháng 08/2026", status: "draft",
    created_at: "2026-09-01T02:00:00.000Z",
  }), /exact/i);
  assert.throws(() => decodeReportSnapshotReceipt({
    snapshot_id: SNAPSHOT_ID, content_hash: "A".repeat(64), period_label: "Tháng 08/2026",
    status: "draft", created_at: "2026-09-01T02:00:00.000Z",
  }), /hash/i);
});

test("input snapshot chỉ nhận kỳ và filter allowlist", () => {
  assert.deepEqual(validateCreateReportSnapshotInput({
    reportPeriod: "monthly",
    year: 2026,
    month: 8,
    filters: { department: "QA", status: ["over", "prog"] },
    templateVersion: "QMS-BC-01.v2",
  }), {
    reportPeriod: "monthly",
    year: 2026,
    month: 8,
    filters: { department: "QA", status: ["over", "prog"] },
    templateVersion: "QMS-BC-01.v2",
  });
  assert.throws(() => validateCreateReportSnapshotInput({
    reportPeriod: "monthly", year: 2026, month: 8,
    filters: { kpi: { done: 99 } }, templateVersion: "QMS-BC-01.v2",
  }), /filter/i);
  assert.throws(() => validateCreateReportSnapshotInput({
    reportPeriod: "monthly", year: 2026, quarter: 3,
    filters: {}, templateVersion: "QMS-BC-01.v2",
  }), /month/i);
});

test("prepare export bắt format hợp lệ, hash và snapshot receipt nguyên vẹn", () => {
  const decoded = decodeReportExportPreparation({
    receipt_id: RECEIPT_ID,
    content_hash: HASH,
    snapshot: { snapshot_id: SNAPSHOT_ID, rows: [{ code: "PQ-230426" }] },
  }, "xlsx");
  assert.equal(decoded.receiptId, RECEIPT_ID);
  assert.equal(decoded.contentHash, HASH);
  assert.deepEqual(decoded.snapshot, { snapshot_id: SNAPSHOT_ID, rows: [{ code: "PQ-230426" }] });
  assert.throws(() => decodeReportExportPreparation({
    receipt_id: RECEIPT_ID, content_hash: HASH, snapshot: {},
  }, "csv"), /format/i);
});

test("tên file ổn định dùng kỳ và 8 ký tự hash, không đọc dashboard sống", () => {
  const receipt = decodeReportSnapshotReceipt({
    snapshot_id: SNAPSHOT_ID,
    content_hash: "abcdef12" + "0".repeat(56),
    period_label: "Tháng 08/2026",
    status: "approved",
    created_at: "2026-09-01T02:00:00.000Z",
  });
  assert.equal(reportSnapshotFileName(receipt, "xlsx"), "VMP_thang-08-2026_abcdef12.xlsx");
  assert.equal(reportSnapshotFileName(receipt, "pdf"), "VMP_thang-08-2026_abcdef12.pdf");
});

test("API snapshot fail closed cho tới khi backend được phát hành", async () => {
  await assert.rejects(createReportSnapshot({
    reportPeriod: "monthly",
    year: 2026,
    month: 8,
    filters: {},
    templateVersion: "QMS-BC-01.v2",
  }), /chưa được phát hành trên máy chủ/i);
  await assert.rejects(
    prepareReportExport(SNAPSHOT_ID, "xlsx"),
    /chưa được phát hành trên máy chủ/i,
  );
});

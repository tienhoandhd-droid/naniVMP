import test from "node:test";
import assert from "node:assert/strict";

import {
  filterEditableProgressActivities,
  indexEditableProgressRights,
  parseEditableProgressRights,
  progressValidationCode,
  visibleProgressStageFields,
} from "../../src/features/progress/editableProgressRights.ts";
import {
  createProgressRightsGenerationGate,
  fetchMyEditableProgressRightsViaRpc,
} from "../../src/lib/supabaseData.ts";
import { QA_STAFF_TIMELINE_FIELDS } from "../../src/features/itemPermissions/types.ts";

test("lọc hạng mục theo tập quyền sửa do server trả về", () => {
  assert.deepEqual(
    filterEditableProgressActivities(
      [{ id: "A" }, { id: "B" }],
      indexEditableProgressRights([
        { validationCode: "B", editableFields: ["status_report"], reason: "assigned" },
      ]),
    ).map((row) => row.id),
    ["B"],
  );
});

test("lọc quyền theo validationCode chính tắc khi legacy id khác mã", () => {
  const rights = indexEditableProgressRights([
    { validationCode: "V-001", editableFields: ["status_report"], reason: "assigned" },
  ]);

  assert.deepEqual(
    filterEditableProgressActivities([
      { id: "legacy-id", validationCode: "V-001" },
      { id: "other-id", validationCode: "V-002" },
    ], rights).map((row) => row.id),
    ["legacy-id"],
  );
});

test("mã thẩm định chính tắc ưu tiên validationCode rồi id, không dùng mã đối tượng", () => {
  assert.equal(progressValidationCode({
    id: "VMP-E2E-01",
    code: "TB-E2E-01",
  }), "VMP-E2E-01");
  assert.equal(progressValidationCode({
    id: "legacy-id",
    validationCode: "VMP-E2E-02",
    code: "TB-E2E-02",
  }), "VMP-E2E-02");
});

test("không cấp quyền bằng legacy id khi canonical validationCode không khớp", () => {
  const rights = indexEditableProgressRights([
    { validationCode: "legacy-id", editableFields: ["status_report"], reason: "assigned" },
  ]);

  assert.deepEqual(filterEditableProgressActivities([
    { id: "legacy-id", validationCode: "V-002" },
  ], rights), []);
});

test("giải mã payload quyền thành hợp đồng frontend", () => {
  assert.deepEqual(
    parseEditableProgressRights({
      ok: true,
      rights: [{ validation_code: "B", editable_fields: ["status_report"], view_reason: "assigned" }],
    }),
    [{ validationCode: "B", editableFields: ["status_report"], reason: "assigned" }],
  );
});

test("parser từ chối payload không thành công hoặc field lạ", () => {
  assert.throws(() => parseEditableProgressRights({ ok: false, rights: [] }));
  assert.throws(() => parseEditableProgressRights({ ok: true, rights: [{ validation_code: "", editable_fields: ["status_report"], view_reason: "assigned" }] }));
  assert.throws(() => parseEditableProgressRights({ ok: true, rights: [{ validation_code: "A", editable_fields: ["scheduled_at", "unknown"], view_reason: "assigned" }] }));
});

test("parser từ chối hai hàng cùng mã có quyền khác nhau", () => {
  assert.throws(() => parseEditableProgressRights({
    ok: true,
    rights: [
      { validation_code: "A", editable_fields: ["status_report"], view_reason: "assigned" },
      { validation_code: "A", editable_fields: ["status_vmp"], view_reason: "assigned" },
    ],
  }));
});

test("chỉ dựng các field tiến độ được phép theo từng bước", () => {
  assert.deepEqual(visibleProgressStageFields(QA_STAFF_TIMELINE_FIELDS).validation,
    ["status_validation"]);
  assert.equal(visibleProgressStageFields(["actual_validation_date"]).report.length, 0);
  assert.deepEqual(visibleProgressStageFields(["scheduled_at"]).vmp, []);
});

test("biên RPC quyền tiến độ từ chối payload bị từ chối hoặc sai hợp đồng", async () => {
  await assert.rejects(
    fetchMyEditableProgressRightsViaRpc(async () => ({ data: { ok: false, rights: [] }, error: null })),
    /Không thể xác nhận quyền cập nhật tiến độ/,
  );
  await assert.rejects(
    fetchMyEditableProgressRightsViaRpc(async () => ({
      data: {
        ok: true,
        rights: [
          { validation_code: "A", editable_fields: ["status_report"], view_reason: "assigned" },
          { validation_code: "A", editable_fields: ["status_vmp"], view_reason: "assigned" },
        ],
      },
      error: null,
    })),
    /Không thể xác nhận quyền cập nhật tiến độ/,
  );
});

test("lượt nạp quyền mới thắng lượt cũ và thay toàn bộ tập quyền", () => {
  const gate = createProgressRightsGenerationGate();
  const requestA = gate.begin();
  const requestB = gate.begin();
  const fromB = indexEditableProgressRights([
    { validationCode: "B", editableFields: ["status_report"], reason: "assigned" },
  ]);
  let current = new Map();

  if (gate.isCurrent(requestB)) current = fromB;
  // Request A resolves late with an item that has just been removed. It must
  // never restore that item after the newer refresh already won.
  if (gate.isCurrent(requestA)) current = indexEditableProgressRights([
    { validationCode: "A", editableFields: ["status_vmp"], reason: "removed" },
  ]);

  assert.deepEqual(
    filterEditableProgressActivities([{ id: "A" }, { id: "B" }], current).map((row) => row.id),
    ["B"],
  );
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  filterEditableProgressActivities,
  indexEditableProgressRights,
  parseEditableProgressRights,
  visibleProgressStageFields,
} from "../../src/features/progress/editableProgressRights.ts";
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

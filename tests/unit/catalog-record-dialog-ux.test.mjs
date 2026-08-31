import test from "node:test";
import assert from "node:assert/strict";
import { requiredReasonState } from "../../src/features/catalogWorkspace/CatalogRecordDialog.tsx";

test("required reason validation trims whitespace before allowing catalog save", () => {
  assert.deepEqual(requiredReasonState(true, ""), {
    invalid: true,
    message: "Hãy ghi lý do thay đổi để lưu vào nhật ký.",
  });
  assert.deepEqual(requiredReasonState(true, "  Điều chỉnh kế hoạch  "), {
    invalid: false,
    message: null,
  });
});

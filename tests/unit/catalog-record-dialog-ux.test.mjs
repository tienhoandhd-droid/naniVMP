import test from "node:test";
import assert from "node:assert/strict";
import {
  closeCatalogRecordIfIdle,
  createCatalogRecordSaveCoordinator,
  requiredReasonState,
} from "../../src/features/catalogWorkspace/CatalogRecordDialog.tsx";

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

test("record dialog synchronously locks close before React can rerender a save", () => {
  const coordinator = createCatalogRecordSaveCoordinator();
  let closes = 0;

  assert.equal(coordinator.begin(), true);
  closeCatalogRecordIfIdle(coordinator.isBusy, () => { closes += 1; });
  assert.equal(closes, 0);

  coordinator.finish();
  closeCatalogRecordIfIdle(coordinator.isBusy, () => { closes += 1; });
  assert.equal(closes, 1);
});

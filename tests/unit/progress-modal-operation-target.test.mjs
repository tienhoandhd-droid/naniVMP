import test from "node:test";
import assert from "node:assert/strict";

import { createProgressModalOperationTarget } from "../../src/features/progress/progressModalOperationTarget.ts";

test("modal routes permission and every item operation through canonical validationCode", async () => {
  const activity = Object.freeze({
    id: "legacy-id",
    validationCode: "V-001",
    code: "display-code",
  });
  const calls = [];
  const target = createProgressModalOperationTarget(activity);

  await target.run(async (validationCode) => {
    calls.push(["permission", validationCode]);
    return { canView: true };
  });
  await target.run(async (validationCode, personId, reason) => {
    calls.push(["performer", validationCode, personId, reason]);
    return { ok: true };
  }, "person-7", "Phân công lại");
  await target.run(async (validationCode, patch, _userName, reason, expectedVersion) => {
    calls.push(["progress", validationCode, patch, reason, expectedVersion]);
    return { ok: true };
  }, { tt_bao_cao: "Hoàn thành" }, undefined, "Đã duyệt", 3);
  target.run((validationCode, state, reason) => {
    calls.push(["state", validationCode, state, reason]);
  }, "cancelled", "Ngừng áp dụng");
  await target.run(async (validationCode) => {
    calls.push(["history", validationCode]);
    return { ok: true, history: [] };
  });

  assert.equal(target.validationCode, "V-001");
  assert.deepEqual(calls, [
    ["permission", "V-001"],
    ["performer", "V-001", "person-7", "Phân công lại"],
    ["progress", "V-001", { tt_bao_cao: "Hoàn thành" }, "Đã duyệt", 3],
    ["state", "V-001", "cancelled", "Ngừng áp dụng"],
    ["history", "V-001"],
  ]);
  assert.equal(calls.flat().includes("legacy-id"), false);
});

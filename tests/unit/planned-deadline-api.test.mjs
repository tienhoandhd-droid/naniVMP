import test from "node:test";
import assert from "node:assert/strict";

import {
  PlannedDeadlineTransportError,
  updatePlannedDeadlinesViaRpc,
} from "../../src/lib/supabaseData.ts";

const input = {
  validationCode: "TB-001",
  deadlines: {
    deadline_protocol: "2026-01-01",
    deadline_validation: "2026-01-02",
    deadline_report: "2026-01-03",
    deadline_vmp: "2026-01-05",
  },
  reason: "  Điều chỉnh theo biên bản QA  ",
  expectedVersion: 7,
  confirmed: true,
};

const conflict = {
  ok: false,
  error_code: "VERSION_CONFLICT",
  error: "Dữ liệu đã được cập nhật",
  validation_code: "TB-001",
  expected_version: 7,
  current_version: 9,
  requires_reload: true,
};

test("planned-deadline RPC receives exactly five named parameters once", async () => {
  const calls = [];
  const result = await updatePlannedDeadlinesViaRpc(async (name, args) => {
    calls.push({ name, args });
    return { data: conflict, error: null };
  }, input);

  assert.deepEqual(calls, [{
    name: "rpc_update_planned_deadlines",
    args: {
      p_validation_code: "TB-001",
      p_deadlines: input.deadlines,
      p_reason: "Điều chỉnh theo biên bản QA",
      p_expected_version: 7,
      p_confirmed: true,
    },
  }]);
  assert.deepEqual(result, conflict);
  assert.equal(calls.length, 1, "JSON failure never triggers a retry");
});

test("JSON failures preserve error_code and exact conflict versions", async () => {
  const result = await updatePlannedDeadlinesViaRpc(async () => ({
    data: conflict,
    error: null,
  }), input);

  assert.equal(result.ok, false);
  assert.equal(result.error_code, "VERSION_CONFLICT");
  assert.equal(result.expected_version, 7);
  assert.equal(result.current_version, 9);
});

test("transport failure is separate and uses the exact server message", async () => {
  let calls = 0;

  await assert.rejects(
    updatePlannedDeadlinesViaRpc(async () => {
      calls += 1;
      return { data: null, error: { message: "PostgREST không phản hồi" } };
    }, input),
    (error) => error instanceof PlannedDeadlineTransportError
      && error.message === "PostgREST không phản hồi",
  );
  assert.equal(calls, 1, "transport failure also has no automatic retry");
});

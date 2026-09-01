import test from "node:test";
import assert from "node:assert/strict";

import { fetchCanonicalDashboardViaRpc } from "../../src/lib/supabaseData.ts";

const payload = {
  contract_version: 1,
  year: 2026,
  updated_at: "2026-09-01T08:30:00.000Z",
  authorization_revision: "42",
  objects: [{ code: "TB-01", name: "Máy đóng nang" }],
  activities: [{
    id: "PQ-230426",
    code: "TB-01",
    obj: "TB-01",
    type: "PQ",
    st: "todo",
    canonical_deadline: "2026-09-30",
    days_left: 29,
    status_as_of: "2026-09-01",
    _raw: {
      dl_vmp: "2020-01-01",
      tt_vmp: "Chưa hoàn thành",
    },
  }],
  kpi: {
    validation: { done: 0, over: 0, todo: 1, total: 1 },
    documentation: { done: 0, over: 0, todo: 1, total: 1 },
    mismatch_count: 0,
  },
};

test("adapter gọi RPC v2 và giữ status canonical dù raw client suy ra quá hạn", async () => {
  const calls = [];
  const result = await fetchCanonicalDashboardViaRpc(async (name, args) => {
    calls.push({ name, args });
    return { data: payload, error: null };
  }, 2026, false);

  assert.deepEqual(calls, [{
    name: "rpc_get_vmp_dashboard_v2",
    args: { p_year: 2026, p_include_missing: false },
  }]);
  assert.equal(result.activities[0].st, "todo");
  assert.equal(result.activities[0].statusSource, "server");
  assert.equal(result.activities[0].target, "2026-09-30");
  assert.equal(result.authorizationRevision, 42);
});

test("adapter không nuốt lỗi transport của RPC v2", async () => {
  await assert.rejects(
    fetchCanonicalDashboardViaRpc(async () => ({
      data: null,
      error: { message: "FORBIDDEN" },
    }), 2026, false),
    /FORBIDDEN/,
  );
});

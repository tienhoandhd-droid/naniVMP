import assert from "node:assert/strict";
import test from "node:test";

import {
  TeamOverviewRequestGate,
  decodeTeamOverviewSummary,
  shouldRequestTeamOverviewSummary,
  teamOverviewRequestKey,
} from "../../src/features/overview/teamOverviewSummary.ts";

const valid = {
  ok: true,
  year: 2026,
  total: 10,
  completed: 4,
  rate: 40,
  updated_at: "2026-08-29T08:30:00Z",
};

test("accepts the exact sealed aggregate payload", () => {
  assert.deepEqual(decodeTeamOverviewSummary(valid), { ok: true, data: valid });
  assert.deepEqual(decodeTeamOverviewSummary({
    ok: true, year: 2026, total: 0, completed: 0, rate: 0, updated_at: null,
  }), {
    ok: true,
    data: { ok: true, year: 2026, total: 0, completed: 0, rate: 0, updated_at: null },
  });
});

test("fails closed when counts, rate, year, or timestamp are malformed", () => {
  for (const payload of [
    { ...valid, year: 2026.5 },
    { ...valid, total: -1 },
    { ...valid, total: Number.POSITIVE_INFINITY },
    { ...valid, total: 10.5 },
    { ...valid, completed: -1 },
    { ...valid, completed: 11 },
    { ...valid, rate: 41 },
    { ...valid, rate: 40.5 },
    { ...valid, updated_at: 42 },
    { ...valid, ok: false },
    null,
  ]) {
    assert.equal(decodeTeamOverviewSummary(payload).ok, false, JSON.stringify(payload));
  }
});

test("rejects every extra key so item or person details cannot cross the client boundary", () => {
  for (const extra of [
    { validation_code: "SECRET-ITEM" },
    { object_name: "Secret object" },
    { owner_name: "Another person" },
    { rows: [] },
  ]) {
    assert.equal(decodeTeamOverviewSummary({ ...valid, ...extra }).ok, false);
  }
});

test("requests the aggregate only for ordinary roles with Overview permission", () => {
  for (const role of ["qa_staff", "workshop_manager", "workshop_staff"]) {
    assert.equal(shouldRequestTeamOverviewSummary(role, true), true);
  }
  for (const role of ["admin", "qa_manager", null]) {
    assert.equal(shouldRequestTeamOverviewSummary(role, true), false);
  }
  assert.equal(shouldRequestTeamOverviewSummary("qa_staff", false), false);
});

test("invalidates an in-flight aggregate request as soon as the access key changes", () => {
  const gate = new TeamOverviewRequestGate();
  gate.ensureKey("qa_staff|true|2026");
  const request = gate.begin("qa_staff|true|2026");
  assert.equal(gate.isCurrent(request), true);

  gate.ensureKey("admin|true|2026");
  assert.equal(gate.isCurrent(request), false);
});

test("request identity changes fence same-role session transitions", () => {
  const first = teamOverviewRequestKey({
    identity: "user-a", businessRole: "qa_staff", canViewOverview: true, year: 2026,
  });
  const second = teamOverviewRequestKey({
    identity: "user-b", businessRole: "qa_staff", canViewOverview: true, year: 2026,
  });
  assert.notEqual(first, second);
});

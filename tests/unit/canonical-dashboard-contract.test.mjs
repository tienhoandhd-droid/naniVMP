import test from "node:test";
import assert from "node:assert/strict";

import {
  CanonicalDashboardContractError,
  decodeCanonicalDashboard,
} from "../../src/features/canonicalDashboard/contracts.ts";
import { canonicalAuthorizationRevisionToNumber } from "../../src/lib/dashboardAuthorizationContracts.ts";

const payload = {
  contract_version: 1,
  year: 2026,
  updated_at: "2026-09-01T08:30:00.000Z",
  authorization_revision: "42",
  objects: [{ code: "TB-01", name: "Máy đóng nang" }],
  activities: [{
    id: "11111111-1111-4111-8111-111111111111",
    code: "PQ-230426",
    obj: "TB-01",
    type: "PQ",
    st: "todo",
    canonical_deadline: "2026-09-30",
    days_left: 29,
    status_as_of: "2026-09-01",
  }],
  kpi: {
    validation: { done: 0, over: 0, todo: 1, total: 1 },
    documentation: { done: 0, over: 0, todo: 1, total: 1 },
    mismatch_count: 0,
  },
};

test("decoder ánh xạ read model canonical sang biên camelCase mà giữ trạng thái server", () => {
  const decoded = decodeCanonicalDashboard(payload);

  assert.equal(decoded.contractVersion, 1);
  assert.equal(decoded.authorizationRevision, "42");
  assert.equal(canonicalAuthorizationRevisionToNumber(decoded.authorizationRevision), 42);
  assert.deepEqual(decoded.activities[0], {
    id: "11111111-1111-4111-8111-111111111111",
    code: "PQ-230426",
    obj: "TB-01",
    type: "PQ",
    st: "todo",
    canonicalDeadline: "2026-09-30",
    daysLeft: 29,
    statusAsOf: "2026-09-01",
  });
});

test("cầu nối revision từ contract mới chỉ nhận số nguyên dương an toàn", () => {
  for (const invalid of ["", "0", "-1", "1.5", "9007199254740992", "abc"]) {
    assert.throws(() => canonicalAuthorizationRevisionToNumber(invalid), /revision/i);
  }
});

test("decoder fail closed khi contract version hoặc exact top-level shape bị đổi", () => {
  for (const invalid of [0, 2, "1", null]) {
    assert.throws(
      () => decodeCanonicalDashboard({ ...payload, contract_version: invalid }),
      CanonicalDashboardContractError,
    );
  }
  const { updated_at: _removed, ...missing } = payload;
  assert.throws(() => decodeCanonicalDashboard(missing), /exact approved keys/i);
  assert.throws(() => decodeCanonicalDashboard({ ...payload, leaked: true }), /exact approved keys/i);
});

test("decoder từ chối ngày, năm và trạng thái activity không canonical", () => {
  assert.throws(() => decodeCanonicalDashboard({ ...payload, year: 2026.5 }), /year/i);
  assert.throws(() => decodeCanonicalDashboard({ ...payload, updated_at: "01\/09\/2026" }), /updated_at/i);
  assert.throws(() => decodeCanonicalDashboard({
    ...payload,
    activities: [{ ...payload.activities[0], st: "late" }],
  }), /st/i);
  assert.throws(() => decodeCanonicalDashboard({
    ...payload,
    activities: [{ ...payload.activities[0], canonical_deadline: "30-09-2026" }],
  }), /canonical_deadline/i);
  assert.throws(() => decodeCanonicalDashboard({
    ...payload,
    activities: [{ ...payload.activities[0], status_as_of: undefined }],
  }), /status_as_of/i);
});

test("decoder từ chối KPI không nhất quán hoặc activity thiếu days_left", () => {
  assert.throws(() => decodeCanonicalDashboard({
    ...payload,
    kpi: { ...payload.kpi, validation: { ...payload.kpi.validation, total: 2 } },
  }), /validation total/i);
  const { days_left: _removed, ...activityWithoutDaysLeft } = payload.activities[0];
  assert.throws(() => decodeCanonicalDashboard({
    ...payload,
    activities: [activityWithoutDaysLeft],
  }), /days_left/i);
});

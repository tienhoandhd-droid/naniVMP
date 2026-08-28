import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeAuthorizationWatermark,
  decodeAuthorizedDashboard,
  matchedAuthorizationRevision,
} from "../../src/lib/dashboardAuthorizationContracts.ts";

const dashboard = {
  objects: [{ code: "TB-01" }],
  activities: [{ id: "TB-01-IQ" }],
  source: "supabase",
  updated_at: "2026-08-28T08:00:00.000Z",
  authorization_revision: 17,
  year: 2026,
};
const watermark = {
  year: 2026,
  plan_items: 1,
  objects: 1,
  updated_at: "2026-08-28T08:00:00.000Z",
  authorization_revision: 17,
};

test("dashboard và watermark chỉ nhận exact shape cùng revision dương", () => {
  const decodedDashboard = decodeAuthorizedDashboard(dashboard);
  const decodedWatermark = decodeAuthorizationWatermark(watermark);
  assert.equal(decodedDashboard.authorizationRevision, 17);
  assert.equal(decodedWatermark.authorizationRevision, 17);
  assert.equal(matchedAuthorizationRevision(decodedDashboard, decodedWatermark), 17);
});

test("dashboard/watermark thiếu, thừa hoặc revision không dương đều fail closed", () => {
  for (const invalid of [undefined, null, 0, -1, 1.5, "17"]) {
    assert.throws(() => decodeAuthorizedDashboard({ ...dashboard, authorization_revision: invalid }), /revision/i);
    assert.throws(() => decodeAuthorizationWatermark({ ...watermark, authorization_revision: invalid }), /revision/i);
  }
  const { authorization_revision: _removedDashboard, ...dashboardMissing } = dashboard;
  const { authorization_revision: _removedWatermark, ...watermarkMissing } = watermark;
  assert.throws(() => decodeAuthorizedDashboard(dashboardMissing), /exact/i);
  assert.throws(() => decodeAuthorizationWatermark(watermarkMissing), /exact/i);
  assert.throws(() => decodeAuthorizedDashboard({ ...dashboard, leaked: true }), /exact/i);
  assert.throws(() => decodeAuthorizationWatermark({ ...watermark, leaked: true }), /exact/i);
});

test("khác revision hoặc khác năm bị chặn trước khi commit dữ liệu", () => {
  const decodedDashboard = decodeAuthorizedDashboard(dashboard);
  assert.throws(() => matchedAuthorizationRevision(
    decodedDashboard,
    decodeAuthorizationWatermark({ ...watermark, authorization_revision: 18 }),
  ), /revision/i);
  assert.throws(() => matchedAuthorizationRevision(
    decodedDashboard,
    decodeAuthorizationWatermark({ ...watermark, year: 2025 }),
  ), /year/i);
});

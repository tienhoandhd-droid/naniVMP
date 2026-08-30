import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MonitoringJourneyNav from "../../src/features/monitoring/MonitoringJourneyNav.tsx";
import { vmpToday } from "../../src/constants/vmp.ts";
import {
  buildMonitoringSignatureMetrics,
  MONITORING_SCREEN_COPY,
} from "../../src/features/monitoring/monitoringMetrics.ts";

const now = vmpToday();
const dateAt = (offset) => {
  const date = new Date(now);
  date.setDate(date.getDate() + offset);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const base = { type: "PV", state: "active", crit: "Cao", score: 8 };
const acts = [
  { ...base, id: "vmp-over", code: "VMP-OVER", st: "over", dlVmp: dateAt(-1), target: dateAt(-1), _raw: {} },
  { ...base, id: "phase-over", code: "PHASE-OVER", st: "prog", dlVmp: dateAt(60), target: dateAt(3), _raw: {} },
  { ...base, id: "done", code: "DONE", st: "done", dlVmp: dateAt(-30), target: dateAt(-30), _raw: {} },
];

test("monitoring signatures keep three business meanings distinct", () => {
  assert.deepEqual(
    buildMonitoringSignatureMetrics(acts, now),
    { vmpOverdue: 1, phaseOverdue: 2, highRisk: 2 },
  );
});

test("monitoring labels do not collapse to Quá hạn", () => {
  assert.deepEqual(
    Object.values(MONITORING_SCREEN_COPY).map((item) => item.metricLabel),
    ["Trễ đích VMP", "Có pha bị trễ", "Rủi ro cao cần xem"],
  );
});

test("journey nav renders allowed screens and marks current screen", () => {
  const html = renderToStaticMarkup(React.createElement(MonitoringJourneyNav, {
    current: "timeline",
    metrics: { vmpOverdue: 3, phaseOverdue: 5, highRisk: 2 },
    canView: (screen) => screen !== "alerts",
    onNavigate: () => {},
    scopeLabel: "Theo phạm vi chung",
  }));
  assert.match(html, /aria-label="Ba màn giám sát"/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /Đang xem/);
  assert.equal((html.match(/Đang xem/g) || []).length, 1);
  assert.match(html, /Theo phạm vi chung/);
  assert.match(html, /Có pha bị trễ/);
  assert.doesNotMatch(html, /Rủi ro cao cần xem/);
});

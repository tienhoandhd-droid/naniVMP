import test from "node:test";
import assert from "node:assert/strict";

import { buildProgressWorkspaceModel } from "../../src/features/progress/progressWorkspaceModel.ts";
import { buildTodayActionModel } from "../../src/features/today/todayModel.ts";
import { buildTimelineSummary, issueLevel } from "../../src/features/timeline/timelineSummaryModel.ts";
import { buildMonitoringSignatureMetrics } from "../../src/features/monitoring/monitoringMetrics.ts";
import { ytdSummary } from "../../src/lib/reportModel.ts";

const now = new Date("2026-09-01T05:00:00.000Z");
const activity = {
  id: "PQ-230426",
  code: "TB-01",
  obj: "TB-01",
  type: "PQ",
  name: "Máy đóng nang",
  st: "todo",
  statusSource: "server",
  statusAsOf: "2026-09-01",
  canonicalDeadline: "2026-09-30",
  daysLeft: 29,
  target: "2026-09-30",
  state: "active",
  ownerPersonId: "11111111-1111-4111-8111-111111111111",
  _raw: {
    state: "active",
    dl_vmp: "2020-01-01",
    deadline_vmp: "2020-01-01",
    tt_vmp: "Chưa hoàn thành",
    status_vmp: "not_started",
    tt_de_cuong: "Quá hạn",
  },
};

test("timeline và monitoring không nâng trạng thái server todo thành quá hạn từ raw", () => {
  assert.equal(issueLevel(activity), "todo");
  const timeline = buildTimelineSummary([activity], now);
  assert.equal(timeline.tong, 1);
  assert.equal(timeline.quaHan, 0);
  const metrics = buildMonitoringSignatureMetrics([activity], now);
  assert.equal(metrics.vmpOverdue, 0);
  assert.equal(metrics.phaseOverdue, 0);
});

test("tiến độ dùng daysLeft canonical thay vì mốc raw đã quá hạn", () => {
  const model = buildProgressWorkspaceModel([activity], {
    now,
    query: "",
    status: "all",
    stage: "all",
    priority: "all",
  });
  assert.equal(model.desktopRows[0].status, "todo");
  assert.equal(model.desktopRows[0].overdueDays, 0);
  assert.equal(model.kpis.overdue, 0);
});

test("việc hôm nay không tạo lý do quá hạn trái với status canonical", () => {
  const model = buildTodayActionModel([activity], {
    now,
    rights: new Map(),
    rightsStatus: "ready",
  });
  assert.equal(model.kpis.overdue, 0);
  assert.equal(model.rows.some((row) => row.reasons.some((reason) => reason.kind === "overdue")), false);
});

test("báo cáo tổng hợp giữ nguyên phân loại status server", () => {
  const summary = ytdSummary([activity]);
  assert.equal(summary.vmp.done, 0);
  assert.equal(summary.vmp.over, 0);
});

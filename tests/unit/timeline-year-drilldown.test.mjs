import test from "node:test";
import assert from "node:assert/strict";

import { buildVmpMonthBands, filterVmpMonthItems } from "../../src/features/timeline/timelineYearModel.ts";
import * as timelineYearModel from "../../src/features/timeline/timelineYearModel.ts";
import {
  buildTimelineFilterSets,
  TIMELINE_FILTER_DEFAULTS,
} from "../../src/features/timeline/timelineFilterModel.ts";

const rows = [
  { id: "JAN", code: "JAN", state: "active", st: "prog", dlVmp: "2000-01-15", target: "2000-08-01", _raw: {} },
  { id: "DEC-DONE", code: "DEC-DONE", state: "active", st: "done", dlVmp: "2000-12-20", target: "2000-01-01", _raw: {} },
  { id: "OUTSIDE", code: "OUTSIDE", state: "active", st: "prog", dlVmp: "2001-01-01", target: "2000-02-01", _raw: {} },
  { id: "MISSING", code: "MISSING", state: "active", st: "prog", dlVmp: null, target: "2000-03-01", _raw: {} },
];

test("nhóm đúng 12 tháng theo deadline VMP, không fallback target", () => {
  const bands = buildVmpMonthBands(rows, 2000, new Date("2000-12-30T12:00:00Z"));

  assert.equal(bands.length, 12);
  assert.deepEqual(bands[0], {
    month: 0,
    label: "Tháng 1",
    count: 1,
    done: 0,
    overdue: 1,
    rate: 0,
  });
  assert.deepEqual(bands[11], {
    month: 11,
    label: "Tháng 12",
    count: 1,
    done: 1,
    overdue: 0,
    rate: 100,
  });
  assert.equal(bands[1].count, 0, "VMP ngoài năm không được tính theo target trong năm");
  assert.equal(bands[2].count, 0, "VMP thiếu deadline không được tính theo target");
});

test("dải tháng giữ nguyên instant khi phân loại qua nửa đêm Bangkok", () => {
  const item = {
    id: "BOUNDARY", code: "BOUNDARY", state: "active", st: "prog",
    dlVmp: "2026-08-29", target: "2026-08-29", _raw: {},
  };

  assert.equal(buildVmpMonthBands([item], 2026, new Date("2026-08-29T16:59:59Z"))[7].overdue, 0);
  assert.equal(buildVmpMonthBands([item], 2026, new Date("2026-08-29T17:00:00Z"))[7].overdue, 1);
});

test("chi tiết tháng chỉ giữ deadline VMP chính tắc của tháng đã chọn", () => {
  const items = [
    { id: "JULY-VMP", code: "JULY-VMP", state: "active", st: "prog", dlVmp: "2026-07-15", target: "2026-12-01", _raw: {} },
    { id: "LEGACY-JULY", code: "LEGACY-JULY", state: "active", st: "prog", dlVmp: "2026-08-15", target: "2026-07-15", _raw: {} },
    { id: "MISSING-VMP", code: "MISSING-VMP", state: "active", st: "prog", dlVmp: null, target: "2026-07-20", _raw: {} },
  ];

  assert.deepEqual(filterVmpMonthItems(items, 2026, 6).map((item) => item.id), ["JULY-VMP"]);
});

test("chi tiết tháng dùng VMP-only nhưng 3D giữ population giao lifecycle trước Task 2", () => {
  const julyVmp = {
    id: "JULY-VMP", code: "JULY-VMP", state: "active", st: "prog",
    dlVmp: "2026-07-20", target: "2026-07-20", _raw: {},
    m: { protocol: new Date("2026-06-15T00:00:00Z"), target: new Date("2026-07-20T00:00:00Z") },
  };
  const adjacentAugustVmp = {
    id: "AUGUST-VMP", code: "AUGUST-VMP", state: "active", st: "prog",
    dlVmp: "2026-08-15", target: "2026-08-15", _raw: {},
    m: { protocol: new Date("2026-07-10T00:00:00Z"), target: new Date("2026-08-15T00:00:00Z") },
  };
  const sets = buildTimelineFilterSets({
    activities: [julyVmp, adjacentAugustVmp],
    filters: TIMELINE_FILTER_DEFAULTS,
    range: { start: new Date("2026-07-01T00:00:00Z"), end: new Date("2026-07-31T23:59:59Z") },
  });

  assert.deepEqual(sets.display.map((item) => item.id), ["JULY-VMP", "AUGUST-VMP"],
    "pre-Task-2 lifecycle population contains the adjacent VMP row");
  assert.equal(typeof timelineYearModel.selectTimelineViewItems, "function",
    "Timeline must expose the population split consumed by detail and 3D");
  const selected = timelineYearModel.selectTimelineViewItems?.({
    view: "month", explorerItems: sets.explorer, displayItems: sets.display, year: 2026, month: 6,
  });
  assert.deepEqual(selected?.detailItems.map((item) => item.id), ["JULY-VMP"]);
  assert.deepEqual(selected?.workloadItems.map((item) => item.id), ["JULY-VMP", "AUGUST-VMP"]);
});

test("dải năm dùng population sau status: Đã xong đổi tháng từ 2/1/1/50 thành 1/1/0/100", () => {
  const done = {
    id: "DONE", code: "DONE", state: "active", st: "done",
    dlVmp: "2026-07-10", target: "2026-07-10", _raw: { tt_vmp: "completed" },
    m: { protocol: new Date("2026-06-01T00:00:00Z"), target: new Date("2026-07-10T00:00:00Z") },
  };
  const overdue = {
    id: "OVERDUE", code: "OVERDUE", state: "active", st: "over",
    dlVmp: "2026-07-12", target: "2026-07-12", _raw: { tt_vmp: "not_started" },
    m: { protocol: new Date("2026-06-01T00:00:00Z"), target: new Date("2026-07-12T00:00:00Z") },
  };
  const range = { start: new Date("2026-01-01T00:00:00Z"), end: new Date("2026-12-31T23:59:59Z") };
  const unfiltered = buildTimelineFilterSets({
    activities: [done, overdue], filters: TIMELINE_FILTER_DEFAULTS, range,
  });
  const doneOnly = buildTimelineFilterSets({
    activities: [done, overdue], filters: { ...TIMELINE_FILTER_DEFAULTS, status: "done" }, range,
  });
  const now = new Date("2026-07-31T12:00:00Z");
  const before = buildVmpMonthBands(unfiltered.summaryBase, 2026, now)[6];
  assert.deepEqual(before, {
    month: 6, label: "Tháng 7", count: 2, done: 1, overdue: 1, rate: 50,
  });

  const selected = timelineYearModel.selectTimelineViewItems?.({
    view: "year", explorerItems: doneOnly.explorer, displayItems: doneOnly.display, year: 2026, month: 6,
  });
  const after = buildVmpMonthBands(selected?.yearBandItems ?? doneOnly.summaryBase, 2026, now)[6];
  assert.deepEqual(after, {
    month: 6, label: "Tháng 7", count: 1, done: 1, overdue: 0, rate: 100,
  });
});

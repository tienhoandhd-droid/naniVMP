import test from "node:test";
import assert from "node:assert/strict";

import {
  TIMELINE_FILTER_DEFAULTS,
  buildTimelineFilterSets,
  timelineActiveFilterCount,
  timelineFilterChips,
  timelineOwnerOf,
  timelinePhaseOf,
} from "../../src/features/timeline/timelineFilterModel.ts";

const range = { start: new Date("2026-01-01"), end: new Date("2026-12-31") };
const item = (id, overrides = {}) => ({
  id,
  code: id,
  name: `Tên ${id}`,
  cls: "tb",
  dept: "qa",
  vtype: "PQ",
  state: "active",
  st: "prog",
  target: "2026-08-31",
  owner: "Nguyễn An",
  dlProtocol: "2026-06-30",
  dlValidation: "2026-07-31",
  dlReport: "2026-08-15",
  dlVmp: "2026-08-31",
  _raw: {},
  ...overrides,
});

test("lọc Timeline giữ legacy group/dept/query, rồi AND type/owner/phase/readiness", () => {
  const rows = [
    item("MATCH", { name: "Nồi hấp", owner: "  Nguyễn An  " }),
    item("WRONG_TYPE", { vtype: "OQ" }),
    item("UNASSIGNED", { owner: "—" }),
    item("WRONG_PHASE", { _raw: { tt_de_cuong: "done" } }),
    item("MISSING", { dlReport: null }),
  ];
  const result = buildTimelineFilterSets({
    activities: rows,
    range,
    filters: {
      ...TIMELINE_FILTER_DEFAULTS,
      q: "nồi",
      type: "pq",
      owner: "nguyễn an",
      phase: "protocol",
      readiness: "ready",
    },
  });
  assert.deepEqual(result.summaryBase.map((a) => a.id), ["MATCH"]);
  assert.deepEqual(result.explorer.map((a) => a.id), ["MATCH"]);
  assert.deepEqual(result.display.map((a) => a.id), ["MATCH"]);
  assert.deepEqual(rows.map((a) => a.id), ["MATCH", "WRONG_TYPE", "UNASSIGNED", "WRONG_PHASE", "MISSING"]);
});

test("phase chọn pha sớm nhất chưa hoàn tất và done khi VMP đã xong", () => {
  assert.equal(timelinePhaseOf(item("P")), "protocol");
  assert.equal(timelinePhaseOf(item("V", { _raw: { tt_de_cuong: "done" } })), "validation");
  assert.equal(timelinePhaseOf(item("R", { _raw: { tt_de_cuong: "done", tt_tham_dinh: "done" } })), "report");
  assert.equal(timelinePhaseOf(item("M", { _raw: { tt_de_cuong: "done", tt_tham_dinh: "done", tt_bao_cao: "done" } })), "vmp");
  assert.equal(timelinePhaseOf(item("D", { st: "done" })), "done");
  assert.equal(timelinePhaseOf(item("DB", { _raw: { status_protocol: "completed" } })), "validation");
});

test("readiness dùng direct dl* rồi fallback _raw và owner giữ precedence hiện tại", () => {
  const rawReady = item("RAW", {
    owner: "—",
    owner_name: "Fallback UI",
    _raw: {
      qa: "QA chính",
      deadline_protocol: "2026-06-30",
      deadline_validation: "2026-07-31",
      deadline_report: "2026-08-15",
      deadline_vmp: "2026-08-31",
    },
    dlProtocol: null, dlValidation: null, dlReport: null, dlVmp: null,
  });
  assert.equal(timelineOwnerOf(rawReady), "QA chính");
  const ready = buildTimelineFilterSets({ activities: [rawReady], range,
    filters: { ...TIMELINE_FILTER_DEFAULTS, readiness: "ready", owner: "assigned" } });
  assert.deepEqual(ready.summaryBase.map((a) => a.id), ["RAW"]);
  const missing = buildTimelineFilterSets({ activities: [item("MISS", { dlVmp: null })], range,
    filters: { ...TIMELINE_FILTER_DEFAULTS, readiness: "missing" } });
  assert.deepEqual(missing.summaryBase.map((a) => a.id), ["MISS"]);

  const sheetReady = item("SHEET", { dlProtocol: null, dlValidation: null, dlReport: null, dlVmp: null,
    _raw: { dl_de_cuong: "2026-06-30", dl_tham_dinh: "2026-07-31", dl_bao_cao: "2026-08-15", dl_vmp: "2026-08-31" } });
  assert.deepEqual(buildTimelineFilterSets({ activities: [sheetReady], range,
    filters: { ...TIMELINE_FILTER_DEFAULTS, readiness: "ready" } }).summaryBase.map((a) => a.id), ["SHEET"]);
});

test("summary base loại status, explorer thêm status, display thêm target/range và priority", () => {
  const rows = [
    item("DONE", { st: "done", target: "2026-08-31" }),
    item("OVER", { st: "over", target: "2026-07-01" }),
    item("NO_TARGET", { target: null }),
    item("OUTSIDE", { target: "2027-01-01" }),
  ];
  const result = buildTimelineFilterSets({ activities: rows, range,
    filters: { ...TIMELINE_FILTER_DEFAULTS, status: "over" } });
  assert.deepEqual(result.summaryBase.map((a) => a.id), ["DONE", "OVER", "NO_TARGET", "OUTSIDE"]);
  assert.deepEqual(result.explorer.map((a) => a.id), ["OVER"]);
  assert.deepEqual(result.display.map((a) => a.id), ["OVER"]);
});

test("timeline display giữ thứ tự mốc kế tiếp: quá hạn rồi tới hạn rồi đã xong", () => {
  const rows = [
    item("DONE", { st: "done", target: "2026-12-31" }),
    item("STEADY", { target: "2026-12-31" }),
    item("OVERDUE", { target: "2026-07-01" }),
  ];
  const result = buildTimelineFilterSets({ activities: rows, range,
    filters: TIMELINE_FILTER_DEFAULTS });
  assert.deepEqual(result.display.map((a) => a.id), ["OVERDUE", "STEADY", "DONE"]);
});

test("metadata count/chips chỉ tính filter khác all và không có query trống", () => {
  const filters = { ...TIMELINE_FILTER_DEFAULTS, type: "PQ", owner: "assigned", readiness: "missing" };
  assert.equal(timelineActiveFilterCount(filters), 3);
  assert.deepEqual(timelineFilterChips(filters).map((chip) => chip.key), ["type", "owner", "readiness"]);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyVmpDeadline,
  isVmpComplete,
  vmpDeadlineDate,
} from "../../src/lib/vmpDeadlineModel.ts";

const NOW = new Date("2026-08-29T12:00:00+07:00");

test("uses the canonical VMP deadline even when an earlier protocol deadline is stale", () => {
  assert.deepEqual(classifyVmpDeadline({
    state: "active", st: "prog", dlProtocol: "2026-01-01",
    _raw: { dl_vmp: "2026-09-10", tt_vmp: "not_started" },
  }, NOW, 7), {
    kind: "future", date: "2026-09-10", daysRemaining: 12,
  });
});

test("does not borrow a report deadline when the VMP deadline is missing", () => {
  assert.equal(classifyVmpDeadline({
    state: "active", st: "over", target: "2026-08-01",
    _raw: { dl_bao_cao: "2026-08-01", tt_vmp: "not_started" },
  }, NOW, 7).kind, "missing");
});

test("normalizes each approved VMP deadline field", () => {
  assert.equal(vmpDeadlineDate({ dlVmp: "2026-09-03" }), "2026-09-03");
  assert.equal(vmpDeadlineDate({ _raw: { deadline_vmp: "2026-09-04" } }), "2026-09-04");
  assert.equal(vmpDeadlineDate({ _raw: { dl_vmp: "2026-09-05" } }), "2026-09-05");
  assert.equal(vmpDeadlineDate({ target: "2026-09-06", _raw: { dl_bao_cao: "2026-09-01" } }), null);
  assert.equal(vmpDeadlineDate({ dlVmp: "not-a-date", _raw: { deadline_vmp: "2026-02-30" } }), null);
});

test("classifies overdue, today, soon, and future VMP deadlines", () => {
  const state = (date, soonDays = 7) => classifyVmpDeadline({
    state: "active", st: "prog", dlVmp: date, _raw: { tt_vmp: "not_started" },
  }, NOW, soonDays);
  assert.deepEqual(state("2026-08-28"), { kind: "overdue", date: "2026-08-28", daysRemaining: -1 });
  assert.deepEqual(state("2026-08-29"), { kind: "today", date: "2026-08-29", daysRemaining: 0 });
  assert.deepEqual(state("2026-09-05"), { kind: "soon", date: "2026-09-05", daysRemaining: 7 });
  assert.deepEqual(state("2026-09-06"), { kind: "future", date: "2026-09-06", daysRemaining: 8 });
});

test("completed VMP and inactive rows are done regardless of deadline", () => {
  for (const activity of [
    { state: "active", st: "done", dlVmp: "2026-08-01" },
    { state: "active", st: "prog", dlVmp: "2026-08-01", actVmp: "2026-08-02" },
    { state: "active", st: "prog", dlVmp: "2026-08-01", _raw: { vmp_done: true } },
    { state: "active", st: "prog", dlVmp: "2026-08-01", _raw: { tt_vmp: "completed" } },
    { state: "cancelled", st: "prog", dlVmp: "2026-08-01", _raw: { tt_vmp: "not_started" } },
  ]) {
    assert.equal(isVmpComplete(activity), activity.st === "done" || activity.actVmp || activity._raw?.vmp_done || activity._raw?.tt_vmp === "completed" ? true : false);
    assert.equal(classifyVmpDeadline(activity, NOW, 7).kind, "done");
  }
});

test("recognizes actual VMP dates and completed status aliases", () => {
  assert.equal(isVmpComplete({ _raw: { actual_vmp_date: "2026-08-29" } }), true);
  assert.equal(isVmpComplete({ _raw: { ngay_vmp: "2026-08-29" } }), true);
  assert.equal(isVmpComplete({ _raw: { tt_vmp: "Hoàn thành" } }), true);
  assert.equal(isVmpComplete({ _raw: { tt_vmp: "not_started" } }), false);
});

test("compares Bangkok calendar dates at the UTC boundary", () => {
  const beforeBangkokMidnight = new Date("2026-08-28T17:00:00Z");
  const afterBangkokMidnight = new Date("2026-08-28T17:00:01Z");
  assert.deepEqual(classifyVmpDeadline({ dlVmp: "2026-08-29" }, beforeBangkokMidnight, 7), {
    kind: "today", date: "2026-08-29", daysRemaining: 0,
  });
  assert.deepEqual(classifyVmpDeadline({ dlVmp: "2026-08-29" }, afterBangkokMidnight, 7), {
    kind: "today", date: "2026-08-29", daysRemaining: 0,
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import { buildValiBrief } from "../../src/features/overview/valiBrief.ts";

test("Vali summary prioritizes overdue work and exposes the complete dashboard contract", () => {
  const brief = buildValiBrief({
    rate: 28,
    done: 7,
    total: 24,
    todo: 9,
    documentRate: 38,
    documentDone: 9,
    documentTotal: 24,
    overdue: 14,
    soon: 3,
    mismatched: 2,
  });

  assert.equal(brief.mood, "concern");
  assert.equal(brief.moodLabel, "đang lo");
  assert.match(brief.headline, /14 hồ sơ quá hạn/);
  assert.deepEqual(brief.metrics.map((metric) => metric.kind), [
    "progress", "documents", "overdue", "soon",
  ]);
  assert.deepEqual(brief.metrics.map((metric) => metric.value), ["28%", "38%", "14", "3"]);
  assert.match(brief.metrics[0].detail, /7\/24/);
  assert.match(brief.metrics[1].detail, /9\/24/);
  assert.deepEqual(brief.observations.map((item) => item.kind), ["todo", "mismatched"]);
  assert.match(brief.observations[0].text, /9 hạng mục/);
  assert.match(brief.observations[1].text, /2 hồ sơ/);
  assert.match(brief.action, /quá hạn/i);
});

test("Vali summary keeps checked zero values visible for a clean plan", () => {
  const brief = buildValiBrief({
    rate: 82,
    done: 82,
    total: 100,
    todo: 4,
    documentRate: 75,
    documentDone: 75,
    documentTotal: 100,
    overdue: 0,
    soon: 0,
    mismatched: 0,
  });

  assert.equal(brief.mood, "celebrate");
  assert.equal(brief.moodLabel, "nhẹ nhõm");
  assert.match(brief.headline, /82%/);
  assert.equal(brief.metrics.length, 4);
  assert.equal(brief.observations.length, 2);
  assert.match(brief.observations[1].text, /^0 hồ sơ lệch pha/);
  assert.match(brief.action, /duy trì/i);
});

test("Vali summary normalizes invalid counts without inventing totals", () => {
  const brief = buildValiBrief({
    rate: 140,
    done: 9,
    total: 4,
    todo: -2,
    documentRate: -20,
    documentDone: Number.NaN,
    documentTotal: -1,
    overdue: Number.NaN,
    soon: 5.8,
    mismatched: 7,
  });

  assert.equal(brief.mood, "celebrate");
  assert.equal(brief.rate, 100);
  assert.deepEqual(brief.metrics.map((metric) => metric.value), ["100%", "0%", "0", "5"]);
  assert.match(brief.metrics[0].detail, /4\/4/);
  assert.match(brief.metrics[1].detail, /0\/0/);
  assert.match(brief.observations[0].text, /^0 hạng mục/);
  assert.match(brief.observations[1].text, /^7 hồ sơ/);
  assert.match(brief.action, /tới hạn/i);
});

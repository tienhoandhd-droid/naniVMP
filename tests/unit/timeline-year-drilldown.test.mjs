import test from "node:test";
import assert from "node:assert/strict";

import { buildVmpMonthBands, filterVmpMonthItems } from "../../src/features/timeline/timelineYearModel.ts";

const rows = [
  { id: "JAN", code: "JAN", state: "active", st: "prog", dlVmp: "2000-01-15", target: "2000-08-01", _raw: {} },
  { id: "DEC-DONE", code: "DEC-DONE", state: "active", st: "done", dlVmp: "2000-12-20", target: "2000-01-01", _raw: {} },
  { id: "OUTSIDE", code: "OUTSIDE", state: "active", st: "prog", dlVmp: "2001-01-01", target: "2000-02-01", _raw: {} },
  { id: "MISSING", code: "MISSING", state: "active", st: "prog", dlVmp: null, target: "2000-03-01", _raw: {} },
];

test("nhóm đúng 12 tháng theo deadline VMP, không fallback target", () => {
  const bands = buildVmpMonthBands(rows, 2000);

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

test("chi tiết tháng chỉ giữ deadline VMP chính tắc của tháng đã chọn", () => {
  const items = [
    { id: "JULY-VMP", code: "JULY-VMP", state: "active", st: "prog", dlVmp: "2026-07-15", target: "2026-12-01", _raw: {} },
    { id: "LEGACY-JULY", code: "LEGACY-JULY", state: "active", st: "prog", dlVmp: "2026-08-15", target: "2026-07-15", _raw: {} },
    { id: "MISSING-VMP", code: "MISSING-VMP", state: "active", st: "prog", dlVmp: null, target: "2026-07-20", _raw: {} },
  ];

  assert.deepEqual(filterVmpMonthItems(items, 2026, 6).map((item) => item.id), ["JULY-VMP"]);
});

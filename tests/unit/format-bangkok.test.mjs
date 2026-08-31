import test from "node:test";
import assert from "node:assert/strict";

import {
  formatBangkokDate,
  formatBangkokDateTime,
  formatBangkokShortDateTime,
  formatBangkokTime,
} from "../../src/lib/formatBangkok.ts";

test("timestamp ở biên năm luôn hiển thị theo Asia/Bangkok", () => {
  const instant = "2026-12-31T17:00:00Z";
  assert.equal(formatBangkokDate(instant), "01/01/2027");
  assert.equal(formatBangkokTime(instant), "00:00:00");
  assert.equal(formatBangkokDateTime(instant), "01/01/2027 00:00:00");
  assert.equal(formatBangkokShortDateTime(instant), "01/01 00:00");
});

test("formatter nhận Date và epoch, dữ liệu sai trả gạch ngang", () => {
  assert.equal(formatBangkokDate(new Date("2026-09-01T00:00:00Z")), "01/09/2026");
  assert.equal(formatBangkokTime(Date.parse("2026-09-01T00:00:00Z")), "07:00:00");
  assert.equal(formatBangkokDateTime("không phải ngày"), "—");
  assert.equal(formatBangkokDate(null), "—");
});

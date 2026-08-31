import assert from "node:assert/strict";
import { test } from "node:test";
import { vmpToday } from "../../src/constants/vmp.ts";
import { bangkokCalendarDate } from "../../src/lib/vmpDeadlineModel.ts";

/**
 * vmpToday() phải trả về NGÀY theo lịch Bangkok (giờ nhà máy), không phải
 * theo giờ máy người dùng. Bất biến được khoá ở đây: thành phần y-m-d của
 * vmpToday() luôn trùng bangkokCalendarDate(new Date()) — nguồn sự thật
 * múi giờ đã có unit test riêng — và mốc giờ là 00:00 local để mọi phép
 * so sánh với parseD() giữ nguyên ngữ nghĩa cũ.
 */
test("vmpToday trùng ngày lịch Bangkok và là 00:00 local", () => {
  const d = vmpToday();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  assert.equal(ymd, bangkokCalendarDate(new Date()));
  assert.equal(d.getHours(), 0);
  assert.equal(d.getMinutes(), 0);
  assert.equal(d.getSeconds(), 0);
  assert.equal(d.getMilliseconds(), 0);
});

test("vmpToday không đông cứng: hai lần gọi ra cùng ngày nhưng khác tham chiếu", () => {
  const a = vmpToday();
  const b = vmpToday();
  assert.notEqual(a, b);
  assert.equal(a.getTime(), b.getTime());
});

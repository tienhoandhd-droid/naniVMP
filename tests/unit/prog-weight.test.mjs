import assert from "node:assert/strict";
import { test } from "node:test";
import { PROG } from "../../src/constants/vmp.ts";

/* Trọng số tiến độ là con số ước lệ, nhưng THỨ TỰ của nó là nghiệp vụ:
 * một hạng mục quá hạn (kẹt) không thể được vẽ "tiến bộ hơn" một hạng mục
 * đang làm đúng tiến độ. Trước 31/08 over=75 > prog=55 — thanh tiến độ
 * tổng nói dối theo hướng đẹp hơn thực tế. */
test("bất biến thứ tự trọng số: done > prog > over > todo > plan", () => {
  assert.ok(PROG.done > PROG.prog, "done phải cao nhất");
  assert.ok(PROG.prog > PROG.over, "đang làm phải cao hơn quá hạn — quá hạn là đang KẸT");
  assert.ok(PROG.over > PROG.todo, "quá hạn vẫn có việc đã làm dở, cao hơn chưa làm");
  assert.ok(PROG.todo > PROG.plan, "chưa làm nhưng đã lên lịch cao hơn mới chỉ nằm trong kế hoạch");
  assert.equal(PROG.done, 100);
});

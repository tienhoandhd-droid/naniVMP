import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAlertsCommandModel } from "../../src/features/monitoring/alertsCommandModel.ts";

function row(id, kind, dleft, {
  score = 9,
  state = "prog",
  dept = "qa",
  owner = "Nguyễn QA",
} = {}) {
  return {
    a: {
      id,
      code: id,
      name: `Thiết bị ${id}`,
      st: state,
      score,
      dept,
      owner,
      state: "active",
    },
    kind,
    dleft,
    date: null,
    stage: "Thẩm định",
  };
}

test("hàng đợi loại trùng và xếp theo RPN rồi số ngày", () => {
  const model = buildAlertsCommandModel([
    row("TB-1", "risk", -2),
    row("TB-1", "over", -2),
    row("TB-2", "soon", -5, { dept: "xsx" }),
    row("TB-3", "over", -9, { score: 9, state: "over", owner: "" }),
    row("TB-4", "soon", 10, { score: 3, dept: "xsx" }),
  ], 5);

  assert.deepEqual(model.queue.map((item) => item.a.id), ["TB-3", "TB-2", "TB-1", "TB-4"]);
  assert.equal(model.queue.filter((item) => item.a.id === "TB-1").length, 1);
  assert.equal(model.queue.find((item) => item.a.id === "TB-1").kind, "over");
  assert.equal(model.totalUnique, 4);
});

test("góc nhìn quản lý tính đúng tỷ lệ, thiếu người và điểm nóng bộ phận", () => {
  const model = buildAlertsCommandModel([
    row("TB-1", "over", -2),
    row("TB-2", "soon", -5, { dept: "xsx" }),
    row("TB-3", "over", -9, { score: 9, state: "over", owner: "" }),
    row("TB-4", "soon", 10, { score: 3, dept: "xsx" }),
  ], 3);

  assert.equal(model.queue.length, 3);
  assert.equal(model.overdueRate, 75);
  assert.equal(model.highRiskRate, 75);
  assert.equal(model.unassignedCount, 1);
  assert.deepEqual(model.hotspots.map(({ department, count, share }) => ({ department, count, share })), [
    { department: "qa", count: 2, share: 50 },
    { department: "xsx", count: 2, share: 50 },
  ]);
});

test("model rỗng trả số liệu an toàn", () => {
  const model = buildAlertsCommandModel([], 5);
  assert.deepEqual(model.queue, []);
  assert.deepEqual(model.hotspots, []);
  assert.equal(model.totalUnique, 0);
  assert.equal(model.overdueRate, 0);
  assert.equal(model.highRiskRate, 0);
  assert.equal(model.unassignedCount, 0);
});

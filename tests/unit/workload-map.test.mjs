import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkloadMap, workloadCellColor } from "../../src/lib/workloadMap.ts";

const acts = [
  { id: "a", state: "active", st: "done", dept: "qa", depts: ["qa"], _raw: { dl_vmp: "2026-08-10" } },
  { id: "b", state: "active", st: "over", dept: "qa", depts: ["qa", "xsx"], alert: { kind: "over" }, _raw: { dl_vmp: "2026-08-18" } },
  { id: "c", state: "inactive", st: "over", dept: "qa", depts: ["qa"], alert: { kind: "over" }, _raw: { dl_vmp: "2026-08-20" } },
];

test("model đếm đúng tổng, hoàn thành và quá hạn theo từng bộ phận", () => {
  const cells = buildWorkloadMap(acts, 2026);
  const qa = cells.find((cell) => cell.month === 8 && cell.departmentId === "qa");
  const xsx = cells.find((cell) => cell.month === 8 && cell.departmentId === "xsx");
  assert.deepEqual({ total: qa.total, completed: qa.completed, overdue: qa.overdue, completionRate: qa.completionRate },
    { total: 2, completed: 1, overdue: 1, completionRate: 0.5 });
  assert.deepEqual({ total: xsx.total, completed: xsx.completed, overdue: xsx.overdue },
    { total: 1, completed: 0, overdue: 1 });
});

test("màu tiến độ chỉ phụ thuộc tỷ lệ hoàn thành", () => {
  assert.equal(workloadCellColor(1), "#2A9E82");
  assert.equal(workloadCellColor(0), "#D6486D");
});

test("màu tiến độ kẹp tỷ lệ nằm ngoài khoảng hoàn thành", () => {
  assert.equal(workloadCellColor(2), "#2A9E82");
  assert.equal(workloadCellColor(-1), "#D6486D");
});

test("màu tiến độ nội suy hex xác định tại điểm giữa", () => {
  assert.equal(workloadCellColor(0.25), "#BD6673");
  assert.equal(workloadCellColor(0.5), "#9F7D78");
  assert.equal(workloadCellColor(0.75), "#778F7D");
});

test("model chỉ đếm một lần mỗi bộ phận khi activity chứa mã trùng", () => {
  const cells = buildWorkloadMap([
    { id: "duplicate-department", state: "active", st: "todo", dept: "qa", depts: ["qa", "qa", "xsx"], _raw: { dl_vmp: "2026-08-20" } },
  ], 2026);
  const qa = cells.find((cell) => cell.departmentId === "qa");
  const xsx = cells.find((cell) => cell.departmentId === "xsx");
  assert.equal(qa.total, 1);
  assert.equal(xsx.total, 1);
});

test("model nhận diện riêng quá hạn từ alert và từ trạng thái", () => {
  const cells = buildWorkloadMap([
    { id: "alert-only", state: "active", st: "prog", dept: "qa", depts: ["qa"], alert: { kind: "over" }, _raw: { dl_vmp: "2026-08-20" } },
    { id: "status-only", state: "active", st: "over", dept: "xsx", depts: ["xsx"], _raw: { dl_vmp: "2026-08-20" } },
  ], 2026);
  assert.equal(cells.find((cell) => cell.departmentId === "qa").overdue, 1);
  assert.equal(cells.find((cell) => cell.departmentId === "xsx").overdue, 1);
});

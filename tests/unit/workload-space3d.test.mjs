import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BanDoNhiet from "../../src/components/dashboard/BanDoNhiet.tsx";
import { workloadActiveCell, workloadCameraFit, WorkloadCellDetail } from "../../src/components/three/WorkloadSpace3D.tsx";
import { applyWorkloadCellNavigation } from "../../src/lib/workloadNavigation.ts";

const first = { month: 3, departmentId: "qa", departmentIndex: 0, total: 8, completed: 3, overdue: 2, completionRate: .375 };
const second = { month: 4, departmentId: "xsx", departmentIndex: 1, total: 5, completed: 5, overdue: 0, completionRate: 1 };

test("camera fit keeps workload projection useful and defaults to roughly 35 degrees", () => {
  const fit = workloadCameraFit(920, 440);
  assert.ok(fit.fillHeight >= .78, `fit fill height ${fit.fillHeight}`);
  assert.ok(fit.fillWidth >= .45, `fill width ${fit.fillWidth}`);
  assert.ok(Math.abs(fit.elevationDegrees - 35) <= 1, `elevation ${fit.elevationDegrees}`);
  assert.ok(fit.minZoom < fit.defaultZoom && fit.defaultZoom < fit.maxZoom);
});

test("hover is transient while clicked selection persists when hover clears", () => {
  assert.equal(workloadActiveCell(first, second), second);
  assert.equal(workloadActiveCell(first, null), first);
});

test("Timeline mô tả đúng trục X là tháng và Z là bộ phận", async () => {
  const source = await readFile(new URL("../../src/pages/TimelinePage.tsx", import.meta.url), "utf8");
  assert.match(source, /Trục ngang X là 12 tháng theo mốc đích VMP · trục sâu Z là bộ phận/);
});

test("detail has no dead CTA and reports the complete selected workload", () => {
  const staticHtml = renderToStaticMarkup(React.createElement(WorkloadCellDetail, { cell: first }));
  assert.match(staticHtml, /Tháng 3/);
  assert.match(staticHtml, /Tổng 8/);
  assert.match(staticHtml, /Hoàn thành 3/);
  assert.match(staticHtml, /Quá hạn 2/);
  assert.doesNotMatch(staticHtml, /Xem danh sách/);
  const linkedHtml = renderToStaticMarkup(React.createElement(WorkloadCellDetail, { cell: first, onOpenCell: () => {} }));
  assert.match(linkedHtml, /Xem danh sách/);
});

test("CTA tải việc áp bộ lọc tháng cục bộ và điều hướng chỉ khi target được phép", () => {
  const calls = [];
  const setters = {
    setDeptSel: (value) => calls.push(["dept", value]),
    setPeriodFilter: (value) => calls.push(["period", value]),
    setCustomFrom: (value) => calls.push(["from", value]),
    setCustomTo: (value) => calls.push(["to", value]),
    setView: (value) => calls.push(["view", value]),
  };
  applyWorkloadCellNavigation({ cell: first, year: 2024, target: "alerts", ...setters });
  assert.deepEqual(calls, [
    ["dept", ["qa"]], ["period", "custom"], ["from", "2024-03-01"], ["to", "2024-03-31"], ["view", "alerts"],
  ]);
  calls.length = 0;
  applyWorkloadCellNavigation({ cell: { ...first, month: 2 }, year: 2024, target: null, ...setters });
  assert.deepEqual(calls, []);
});

test("heatmap selection keeps table cells semantic and uses a real pressed button", () => {
  const html = renderToStaticMarkup(React.createElement(BanDoNhiet, {
    tenHang: "Bộ phận", tenCot: "Tháng", nhanHang: ["QA"], nhanCot: ["T3"],
    o: [{ hang: 0, cot: 0, gt: 8 }], selected: { hang: 0, cot: 0 }, onSelect: () => {},
  }));
  assert.match(html, /<td[^>]*>/);
  assert.doesNotMatch(html, /<td[^>]*role="button"/);
  assert.match(html, /<button[^>]*aria-pressed="true"/);
});

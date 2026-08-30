import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TodayCommandCenterContent } from "../../src/features/today/TodayCommandCenter.tsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const render = (props) => renderToStaticMarkup(
  React.createElement(TodayCommandCenterContent, props),
);
const onOpenProgress = () => {};
const onRetryRights = () => {};

const overdueEditable = {
  validationCode: "V-OVERDUE", title: "Thiết bị đóng gói", department: "QA",
  ownerName: "Chưa phân công QA", criticality: "Cao", criticalityScore: 9,
  blockingStage: "Đề cương", deadlineStage: "Thẩm định", daysRemaining: -4,
  reasons: [
    { kind: "overdue", label: "Quá hạn", stage: "Thẩm định", daysRemaining: -4 },
    { kind: "missing_owner", label: "Chưa phân công QA" },
  ],
  section: "overdue", canEditProgress: true,
  editableFields: ["actual_protocol_date"], permissionReason: "Được phân công",
};

const todayReadOnly = {
  ...overdueEditable, validationCode: "V-TODAY", title: "Bồn phối liệu",
  ownerName: "Nguyễn A", criticality: "Trung bình", criticalityScore: 5,
  blockingStage: "Đề cương", deadlineStage: "Đề cương", daysRemaining: 0,
  reasons: [{ kind: "due_today", label: "Đến hạn hôm nay", stage: "Đề cương", daysRemaining: 0 }],
  section: "today", canEditProgress: false, editableFields: [],
  permissionReason: "Không có quyền cập nhật tiến độ",
};

const upcomingReadOnly = {
  ...todayReadOnly, validationCode: "V-UPCOMING", title: "Máy đóng nang",
  deadlineStage: "Báo cáo", daysRemaining: 3,
  reasons: [{ kind: "due_7d", label: "Đến hạn trong 7 ngày", stage: "Báo cáo", daysRemaining: 3 }],
  section: "upcoming",
};

const incompleteReadOnly = {
  ...todayReadOnly, validationCode: "V-INCOMPLETE", title: "Hệ thống khí nén",
  deadlineStage: null, daysRemaining: null,
  reasons: [{ kind: "missing_schedule", label: "Chưa lên lịch" }],
  section: "incomplete",
};

const rows = [overdueEditable, todayReadOnly, upcomingReadOnly, incompleteReadOnly];
const model = {
  rows,
  sections: {
    overdue: [overdueEditable], today: [todayReadOnly],
    upcoming: [upcomingReadOnly], incomplete: [incompleteReadOnly],
  },
  kpis: { overdue: 1, today: 1, upcoming: 1, dataQuality: 2 },
  nextAction: overdueEditable,
};

const readyRights = { status: "ready", rights: new Map(), error: "" };
const loadingRights = { status: "loading", rights: new Map(), error: "" };
const errorRights = { status: "error", rights: new Map(), error: "Máy chủ chưa phản hồi" };
const contentProps = (rightsState = readyRights, overrides = {}) => ({
  model, rightsState, onOpenProgress, onRetryRights, ...overrides,
});
const count = (html, expression) => (html.match(expression) || []).length;

function findElement(node, predicate) {
  if (!React.isValidElement(node)) return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props.children)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

test("Today content presents four queues, reason badges, safe CTA, and accordion semantics", () => {
  const html = render(contentProps());
  assert.match(html, /Quá hạn/);
  assert.match(html, /Đến hạn hôm nay/);
  assert.match(html, /Trong 7 ngày tới/);
  assert.match(html, /Hồ sơ cần hoàn thiện/);
  assert.match(html, /Chưa phân công QA/);
  assert.match(html, /Đang chờ Đề cương/);
  assert.match(html, /mốc Thẩm định · trễ 4 ngày/);
  assert.match(html, /Cập nhật tiến độ/);
  assert.match(html, /Xem chi tiết/);
  assert.match(html, /Làm trước tiên/);
  assert.match(html, /Ưu tiên theo hạn, mức độ quan trọng và quyền cập nhật/);
  assert.match(html, /Đến hạn trong 7 ngày/);
  assert.match(html, /Chưa lên lịch/);
  assert.match(html, /QA phụ trách/);
  assert.doesNotMatch(html, /Phụ trách · Bộ phận/);
  assert.match(html, /class="hn-muc__nguoi"><b>Chưa phân công QA<\/b><\/span>/);
  const ownerCells = html.match(/<span class="hn-muc__nguoi">[\s\S]*?<\/span>/g) ?? [];
  assert.ok(ownerCells.length > 0);
  ownerCells.forEach((cell) => assert.doesNotMatch(cell, /<i>/));
  assert.match(html, /<dt>Phòng ban<\/dt><dd>QA<\/dd>/);
  assert.equal(count(html, /aria-controls=/g), 8);
  assert.equal(count(html, /role="region"/g), 4);
  assert.equal(count(html, /aria-expanded="false"/g), 8);
  assert.equal(count(html, /hn-muc__mo--inline/g), 4);
  assert.equal(count(html, /hn-muc__mo--desktop/g), 4);
  assert.equal(count(html, /aria-controls="today-detail-/g), 4);
  assert.equal(count(html, /aria-controls="today-supporting-pane"/g), 4);
  assert.match(html, /<aside[^>]*id="today-supporting-pane"/);
  for (const id of html.match(/aria-controls="([^"]+)"/g) || []) {
    assert.match(html, new RegExp(`id="${id.slice(15, -1)}"`));
  }
  assert.doesNotMatch(html, /aria-pressed/);
  assert.equal(count(html, /<button[^>]*>Cập nhật tiến độ<\/button>/g), 1);
});

test("selected desktop pane offers Bỏ chọn without changing editable or read-only CTA rules", async () => {
  const { TodaySupportingPane } = await import("../../src/features/today/TodayCommandCenter.tsx");
  assert.equal(typeof TodaySupportingPane, "function");
  let clearCount = 0;
  const onClearSelection = () => { clearCount += 1; };

  const editableHtml = renderToStaticMarkup(React.createElement(TodaySupportingPane, {
    row: overdueEditable, onOpenProgress, onClearSelection,
  }));
  const readOnlyHtml = renderToStaticMarkup(React.createElement(TodaySupportingPane, {
    row: todayReadOnly, onOpenProgress, onClearSelection,
  }));
  const emptyHtml = renderToStaticMarkup(React.createElement(TodaySupportingPane, {
    row: null, onOpenProgress, onClearSelection,
  }));

  assert.equal(count(editableHtml, /<button[^>]*>Bỏ chọn<\/button>/g), 1);
  assert.equal(count(readOnlyHtml, /<button[^>]*>Bỏ chọn<\/button>/g), 1);
  assert.doesNotMatch(emptyHtml, /Bỏ chọn/);
  assert.equal(count(editableHtml, /<button[^>]*>Cập nhật tiến độ<\/button>/g), 1);
  assert.doesNotMatch(readOnlyHtml, /Cập nhật tiến độ/);

  const paneTree = TodaySupportingPane({ row: overdueEditable, onOpenProgress, onClearSelection });
  const clearButton = findElement(paneTree, (element) =>
    element.type === "button" && element.props.children === "Bỏ chọn");
  assert.ok(clearButton, "selected pane must expose a Bỏ chọn button");
  clearButton.props.onClick();
  assert.equal(clearCount, 1);
});

test("Today content keeps rows readable while rights load or fail closed", () => {
  const loadingHtml = render(contentProps(loadingRights));
  assert.match(loadingHtml, /Đang kiểm tra quyền/);
  assert.match(loadingHtml, /V-OVERDUE/);

  const readOnlyRows = rows.map((row) => ({ ...row, canEditProgress: false, editableFields: [] }));
  const failClosedModel = {
    ...model,
    rows: readOnlyRows,
    sections: {
      overdue: [readOnlyRows[0]], today: [readOnlyRows[1]],
      upcoming: [readOnlyRows[2]], incomplete: [readOnlyRows[3]],
    },
    nextAction: readOnlyRows[0],
  };
  const errorHtml = render(contentProps(errorRights, { model: failClosedModel }));
  assert.match(errorHtml, /Chưa xác minh được quyền cập nhật/);
  assert.match(errorHtml, /Máy chủ chưa phản hồi/);
  assert.match(errorHtml, /V-OVERDUE/);
  assert.equal(count(errorHtml, /<button[^>]*>Thử lại quyền<\/button>/g), 1);
  assert.doesNotMatch(errorHtml, /Cập nhật tiến độ/);

  const readyHtml = render(contentProps());
  assert.doesNotMatch(readyHtml, /Thử lại quyền/);
});

test("Today content distinguishes filtered empty scope from a true empty queue", () => {
  const emptyModel = {
    ...model,
    rows: [],
    sections: { overdue: [], today: [], upcoming: [], incomplete: [] },
    kpis: { overdue: 0, today: 0, upcoming: 0, dataQuality: 0 },
    nextAction: null,
  };
  const filteredHtml = render(contentProps(readyRights, {
    model: emptyModel, hasScopeFilters: true, scopeLabel: "Khu vực đóng gói", onClearScope: () => {},
  }));
  assert.match(filteredHtml, /Khu vực đóng gói/);
  assert.match(filteredHtml, /Xoá bộ lọc/);

  const emptyHtml = render(contentProps(readyRights, { model: emptyModel }));
  assert.doesNotMatch(emptyHtml, /Xoá bộ lọc/);
});

test("Vali uses five distinct expressions for empty, upcoming, due-today, overdue, and heavily overdue queues", async () => {
  const { getTodayValiState } = await import("../../src/features/today/TodayCommandCenter.tsx");
  assert.equal(typeof getTodayValiState, "function");

  const cases = [
    {
      name: "empty",
      patch: { rows: [], kpis: { overdue: 0, today: 0, upcoming: 0, dataQuality: 0 }, nextAction: null },
      want: { mood: "celebrate", nhan: "nhẹ nhõm" },
    },
    {
      name: "upcoming only",
      patch: { rows: [upcomingReadOnly], kpis: { overdue: 0, today: 0, upcoming: 1, dataQuality: 0 }, nextAction: upcomingReadOnly },
      want: { mood: "guide", nhan: "dẫn đường" },
    },
    {
      name: "due today",
      patch: { rows: [todayReadOnly], kpis: { overdue: 0, today: 1, upcoming: 0, dataQuality: 0 }, nextAction: todayReadOnly },
      want: { mood: "focus", nhan: "tập trung" },
    },
    {
      name: "one overdue",
      patch: { rows: [overdueEditable], kpis: { overdue: 1, today: 0, upcoming: 0, dataQuality: 0 }, nextAction: overdueEditable },
      want: { mood: "concern", nhan: "đang lo" },
    },
    {
      name: "three overdue",
      patch: { rows: [overdueEditable, overdueEditable, overdueEditable], kpis: { overdue: 3, today: 0, upcoming: 0, dataQuality: 0 }, nextAction: overdueEditable },
      want: { mood: "urgent", nhan: "rất lo" },
    },
  ];

  for (const testCase of cases) {
    const actual = getTodayValiState({ ...model, ...testCase.patch });
    assert.equal(actual.mood, testCase.want.mood, `${testCase.name}: mood`);
    assert.equal(actual.nhan, testCase.want.nhan, `${testCase.name}: accessible label`);
  }
});

test("Today CSS contains row-level long-list containment with mobile intrinsic size", () => {
  const css = readFileSync(path.join(ROOT, "src/features/today/today.css"), "utf8");
  assert.match(css, /\.hn-muc\s*\{[^}]*content-visibility:\s*auto/);
  assert.match(css, /\.hn-muc\s*\{[^}]*contain-intrinsic-size:\s*auto 44px/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.hn-muc\s*\{[^}]*contain-intrinsic-size:\s*auto 124px/);
  assert.match(css, /\.hn-muc__mo--desktop\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media\s*\(min-width:\s*1600px\)\s*\{[\s\S]*?\.hn-muc__mo--inline\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media\s*\(min-width:\s*1600px\)\s*\{[\s\S]*?\.hn-muc__mo--desktop\s*\{[^}]*display:\s*flex/);
});

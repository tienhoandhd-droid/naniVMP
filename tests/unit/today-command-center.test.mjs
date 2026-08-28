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
  assert.equal(count(html, /aria-controls=/g), 4);
  assert.equal(count(html, /role="region"/g), 4);
  assert.equal(count(html, /aria-expanded="false"/g), 4);
  for (const id of html.match(/aria-controls="([^"]+)"/g) || []) {
    assert.match(html, new RegExp(`id="${id.slice(15, -1)}"`));
  }
  assert.doesNotMatch(html, /aria-pressed/);
  assert.equal(count(html, /<button[^>]*>Cập nhật tiến độ<\/button>/g), 1);
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

test("Today CSS contains row-level long-list containment with mobile intrinsic size", () => {
  const css = readFileSync(path.join(ROOT, "src/features/today/today.css"), "utf8");
  assert.match(css, /\.hn-muc\s*\{[^}]*content-visibility:\s*auto/);
  assert.match(css, /\.hn-muc\s*\{[^}]*contain-intrinsic-size:\s*auto 44px/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.hn-muc\s*\{[^}]*contain-intrinsic-size:\s*auto 124px/);
});

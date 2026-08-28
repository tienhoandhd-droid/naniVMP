import test from "node:test";
import assert from "node:assert/strict";
import { overviewTarget } from "../../src/lib/navigationTargets.ts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScreenGuard } from "../../src/components/auth/ScreenGuard.tsx";

const access = (allowed) => ({ canView: (screen) => allowed.includes(screen) });

test("quá hạn đưa người xem tới màn đọc được", () => {
  assert.equal(overviewTarget(access(["overview", "alerts"]), "overdue"), "alerts");
});

test("biên tập viên được đi thẳng tới cập nhật", () => {
  assert.equal(overviewTarget(access(["overview", "alerts", "progress"]), "overdue"), "progress");
});

test("CTA không có đích hợp lệ trở thành số liệu tĩnh", () => {
  assert.equal(overviewTarget(access(["overview"]), "data-quality"), null);
  assert.equal(overviewTarget(access(["overview"]), "today"), null);
});

test("màn bị chặn không trả về vùng nội dung trắng trong lúc chuyển hướng", () => {
  const guarded = {
    mode: "enforced",
    businessRole: null,
    unresolvedReason: null,
    canView: (screen) => screen === "overview",
    can: () => false,
    scope: () => "none",
    screens: { overview: { canView: true, dataScope: "all", actions: new Set() } },
  };
  const html = renderToStaticMarkup(React.createElement(ScreenGuard, {
    screenId: "progress",
    access: guarded,
    onRedirect: () => {},
    children: React.createElement("div", null, "nội dung cấm"),
  }));
  assert.match(html, /Đang mở màn bạn được phép xem/);
  assert.doesNotMatch(html, /nội dung cấm/);
});

test("preview không được nới ngoại lệ cho khu vực Quản trị chỉ-Admin", () => {
  const previewQa = {
    mode: "preview",
    businessRole: "qa_manager",
    unresolvedReason: null,
    canView: (screen) => screen === "today",
    can: () => false,
    scope: () => "none",
    screens: { today: { canView: true, dataScope: "all", actions: new Set() } },
  };
  const html = renderToStaticMarkup(React.createElement(ScreenGuard, {
    screenId: "health",
    access: previewQa,
    onRedirect: () => {},
    children: React.createElement("div", null, "nội dung quản trị cấm"),
  }));
  assert.match(html, /Đang mở màn bạn được phép xem/);
  assert.doesNotMatch(html, /nội dung quản trị cấm/);
});

import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Sidebar, Topbar } from "../../src/components/layout/Layout.tsx";
import { parseAccessContext } from "../../src/lib/access.ts";

const access = parseAccessContext({
  ok: true,
  mode: "enforced",
  business_role: "admin",
  screens: {
    overview: { can_view: true, data_scope: "all", actions: [] },
  },
});

function renderTopbar(overrides = {}) {
  return renderToStaticMarkup(React.createElement(Topbar, {
    title: "Tổng quan VMP",
    user: { name: "Quản trị" },
    dataUpdatedAt: null,
    view: "overview",
    setView: () => {},
    access,
    onLogout: () => {},
    onChangePw: () => {},
    ...overrides,
  }));
}

test("thanh đầu không còn nút Làm mới thủ công", () => {
  const html = renderTopbar();
  assert.doesNotMatch(html, />Làm mới<\/button>/);
});

test("thanh đầu không còn nhãn vai trò", () => {
  const html = renderTopbar();
  assert.doesNotMatch(html, /vmp-perm-badge/);
});

test("thanh đầu nhường nút đổi giao diện cho khu vực tài khoản", () => {
  const html = renderTopbar();
  assert.doesNotMatch(html, /aria-label="Giao diện Theo hệ thống/);
});

test("nút đổi giao diện nằm trong thẻ tài khoản (G3 21/10: gộp khung Giao diện)", () => {
  const html = renderToStaticMarkup(React.createElement(Sidebar, {
    view: "overview",
    setView: () => {},
    user: { name: "Quản trị" },
    access,
    onLogout: () => {},
    onChangePw: () => {},
  }));
  const preferencesStart = html.indexOf('class="vmp-sidebar-preferences"');
  const accountStart = html.indexOf('class="vmp-sidebar-account__identity"');
  const themeStart = html.indexOf('aria-label="Giao diện Theo hệ thống');

  assert.ok(preferencesStart >= 0, "thiếu nhóm tùy chọn giao diện");
  assert.ok(accountStart >= 0 && accountStart < preferencesStart, "nhóm giao diện phải nằm trong thẻ tài khoản");
  assert.ok(preferencesStart < themeStart, "nút theme phải thuộc nhóm tùy chọn");
  assert.equal(html.split('aria-label="Giao diện ').length - 1, 1, "chỉ một nút đổi giao diện ở thanh bên");
});

test("Today omits last-edited timestamp while keeping its subtitle", () => {
  const html = renderTopbar({view:"today", title:"Việc hôm nay", sub:"Việc của tôi hôm nay", dataUpdatedAt:"2026-09-01T00:05:00Z"});
  assert.doesNotMatch(html, /Sửa lần cuối/);
  assert.match(html, /Việc của tôi hôm nay/);
});
test("All tabs omit the decorative last-edited timestamp", () => {
  for (const view of ["overview", "source", "timeline", "progress", "rules", "health"]) {
    assert.doesNotMatch(renderTopbar({view, dataUpdatedAt:"2026-09-01T00:05:00Z"}), /Sửa lần cuối/);
  }
});

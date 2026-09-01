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

function renderTopbar() {
  return renderToStaticMarkup(React.createElement(Topbar, {
    title: "Tổng quan VMP",
    user: { name: "Quản trị" },
    dataUpdatedAt: null,
    view: "overview",
    setView: () => {},
    access,
    onLogout: () => {},
    onChangePw: () => {},
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

test("nút đổi giao diện nằm trong phần nhận diện tài khoản sidebar", () => {
  const html = renderToStaticMarkup(React.createElement(Sidebar, {
    view: "overview",
    setView: () => {},
    user: { name: "Quản trị" },
    access,
    onLogout: () => {},
    onChangePw: () => {},
  }));
  assert.match(html, /vmp-sidebar-account__identity[\s\S]*aria-label="Giao diện Theo hệ thống/);
});

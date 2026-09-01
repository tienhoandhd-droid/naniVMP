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

test("nút đổi giao diện nằm trong hàng tùy chọn riêng trước thẻ tài khoản", () => {
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

  assert.ok(preferencesStart >= 0, "thiếu hàng tùy chọn giao diện riêng");
  assert.ok(preferencesStart < themeStart, "nút theme phải thuộc hàng tùy chọn");
  assert.ok(themeStart < accountStart, "hàng tùy chọn theme phải đứng trước thẻ tài khoản");
  assert.doesNotMatch(html.slice(accountStart), /aria-label="Giao diện Theo hệ thống/);
});

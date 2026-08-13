import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LoginScreen from "../../src/components/auth/LoginScreen.tsx";

test("login có form, nhãn thật và autocomplete chuẩn", () => {
  const html = renderToStaticMarkup(React.createElement(LoginScreen, { onLogin: () => {} }));
  assert.match(html, /<form/);
  assert.match(html, /for="vmp-login-email"/);
  assert.match(html, /type="email"/);
  assert.match(html, /autoComplete="email"/);
  assert.match(html, /autoComplete="current-password"/);
  assert.match(html, /Đăng nhập VMP Monitor/);
});

test("brand panel dùng motif 2D và không dựng canvas", () => {
  const html = renderToStaticMarkup(React.createElement(LoginScreen, { onLogin: () => {} }));
  assert.match(html, /data-testid="luxury-crown-mark"/);
  assert.doesNotMatch(html, /<canvas/);
});

test("Supabase chưa cấu hình thì hiện hướng dẫn thay vì lời chúc đăng nhập", () => {
  const html = renderToStaticMarkup(React.createElement(LoginScreen, { onLogin: () => {} }));
  assert.match(html, /Chế độ tạm \(chưa có Supabase\)/);
  assert.match(html, /Liên hệ IT để thiết lập/);
  assert.doesNotMatch(html, /LỜI CHÚC HÔM NAY/);
});

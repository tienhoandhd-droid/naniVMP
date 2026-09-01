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
  assert.match(html, /vq-login-password-label-row[\s\S]*Quên mật khẩu\?/);
});

test("quên mật khẩu là một bước chỉ-email có đường quay lại", () => {
  const html = renderToStaticMarkup(React.createElement(LoginScreen, {
    onLogin: () => {},
    initialMode: "forgot",
  }));
  assert.match(html, /Khôi phục mật khẩu/);
  assert.match(html, /Gửi liên kết đặt lại/);
  assert.match(html, /Quay lại đăng nhập/);
  assert.match(html, /autoComplete="email"/);
  assert.doesNotMatch(html, /autoComplete="current-password"/);
});

test("thông báo đặt mật khẩu thành công được công bố ở bước đăng nhập", () => {
  const html = renderToStaticMarkup(React.createElement(LoginScreen, {
    onLogin: () => {},
    notice: "Mật khẩu đã được cập nhật. Hãy đăng nhập bằng mật khẩu mới.",
  }));
  assert.match(html, /role="status"/);
  assert.match(html, /Mật khẩu đã được cập nhật/);
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

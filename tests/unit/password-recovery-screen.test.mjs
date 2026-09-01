import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

async function loadScreen() {
  const module = await import("../../src/components/auth/PasswordRecoveryScreen.tsx").catch(() => null);
  assert.ok(module?.default, "thiếu PasswordRecoveryScreen");
  return module.default;
}

const handlers = {
  onCompleted: async () => {},
  onRequestNewLink: async () => {},
};

test("recovery hợp lệ có hai trường mật khẩu mới và công bố yêu cầu", async () => {
  const PasswordRecoveryScreen = await loadScreen();
  const html = renderToStaticMarkup(React.createElement(PasswordRecoveryScreen, {
    signal: "ready",
    ...handlers,
  }));

  assert.match(html, /Đặt mật khẩu mới/);
  assert.equal((html.match(/autoComplete="new-password"/g) || []).length, 2);
  assert.match(html, /Tối thiểu 8 ký tự/);
  assert.match(html, /Lưu mật khẩu mới/);
});

test("recovery hết hạn chỉ đưa đường yêu cầu liên kết mới", async () => {
  const PasswordRecoveryScreen = await loadScreen();
  const html = renderToStaticMarkup(React.createElement(PasswordRecoveryScreen, {
    signal: "invalid",
    ...handlers,
  }));

  assert.match(html, /hết hạn|không hợp lệ/i);
  assert.match(html, /Yêu cầu liên kết mới/);
  assert.doesNotMatch(html, /autoComplete="new-password"/);
});

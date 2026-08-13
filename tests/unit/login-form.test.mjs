import test from "node:test";
import assert from "node:assert/strict";
import { validateLogin, loginErrorMessage } from "../../src/lib/loginForm.ts";

test("login trống báo lỗi tiếng Việt đúng trường", () => {
  assert.deepEqual(validateLogin({ email: "", password: "" }), {
    email: "Vui lòng nhập email",
    password: "Vui lòng nhập mật khẩu",
  });
});

test("email sai định dạng bị chặn trước khi xác thực", () => {
  assert.deepEqual(validateLogin({ email: "qa-cpc1hn.vn", password: "secret" }), {
    email: "Email không hợp lệ",
  });
});

test("lỗi Supabase không lộ thông báo kỹ thuật", () => {
  assert.equal(loginErrorMessage(new Error("missing email or phone")), "Vui lòng kiểm tra email và mật khẩu");
  assert.equal(loginErrorMessage(new Error("Invalid login credentials")), "Email hoặc mật khẩu chưa đúng");
  assert.equal(loginErrorMessage(new Error("network request failed")), "Không kết nối được máy chủ. Vui lòng thử lại");
});

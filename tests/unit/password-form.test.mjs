/* =====================================================================
 *  password-form.test.mjs — luật của form đổi/đặt lại mật khẩu
 *  ---------------------------------------------------------------------
 *  Cùng khuôn với loginForm: validate là hàm thuần, thông điệp lỗi
 *  Supabase được phiên dịch sang tiếng Việt ở MỘT chỗ. Đổi mật khẩu phải
 *  chứng minh mình bằng MẬT KHẨU CŨ (trừ chế độ recovery — người dùng đã
 *  chứng minh bằng link email).
 * ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";

import * as passwordForm from "../../src/lib/passwordForm.ts";

const {
  validateChangePassword, changePasswordErrorMessage, resetMailErrorMessage,
  recoverySessionErrorMessage,
} = passwordForm;

test("thiếu mật khẩu cũ thì báo ngay từ validate", () => {
  const loi = validateChangePassword({ cu: "", moi: "abc12345-long", nhacLai: "abc12345-long" });
  assert.match(String(loi.cu), /mật khẩu hiện tại/i);
  assert.equal(loi.moi, undefined);
});

test("chế độ recovery KHÔNG đòi mật khẩu cũ", () => {
  const loi = validateChangePassword(
    { cu: "", moi: "abc12345-long", nhacLai: "abc12345-long" }, { recovery: true });
  assert.deepEqual(loi, {});
});

test("mật khẩu mới dưới 12 ký tự bị chặn ở cả đổi và recovery", () => {
  const doi = validateChangePassword({ cu: "cu-dung", moi: "abc1234", nhacLai: "abc1234" });
  const khoiPhuc = validateChangePassword(
    { cu: "", moi: "abc1234", nhacLai: "abc1234" }, { recovery: true });
  assert.match(String(doi.moi), /12 ký tự/);
  assert.match(String(khoiPhuc.moi), /12 ký tự/);
});

test("hai mật khẩu mới không giống nhau", () => {
  const loi = validateChangePassword({ cu: "cu-dung", moi: "abc12345-long", nhacLai: "abc12346-long" });
  assert.match(String(loi.nhacLai), /không khớp/i);
});

test("mật khẩu mới trùng mật khẩu cũ bị chặn từ validate", () => {
  const loi = validateChangePassword({ cu: "abc12345-long", moi: "abc12345-long", nhacLai: "abc12345-long" });
  assert.match(String(loi.moi), /khác mật khẩu (cũ|hiện tại)/i);
});

test("hợp lệ thì không có lỗi nào", () => {
  assert.deepEqual(
    validateChangePassword({ cu: "cu-dung", moi: "moi-1234-long", nhacLai: "moi-1234-long" }), {});
});

test("dịch lỗi Supabase: sai mật khẩu cũ", () => {
  assert.match(
    changePasswordErrorMessage(new Error("MAT_KHAU_CU_SAI")),
    /Mật khẩu hiện tại không đúng/);
  assert.match(
    changePasswordErrorMessage(new Error("Invalid login credentials")),
    /Mật khẩu hiện tại không đúng/);
});

test("dịch lỗi Supabase: mật khẩu mới trùng cũ / quá ngắn / mạng", () => {
  assert.match(
    changePasswordErrorMessage(new Error("New password should be different from the old password.")),
    /khác mật khẩu hiện tại/);
  assert.match(
    changePasswordErrorMessage(new Error("Password should be at least 6 characters")),
    /12 ký tự/);
  assert.match(
    changePasswordErrorMessage(new Error("Failed to fetch")),
    /Không kết nối được/);
});

test("dịch lỗi gửi mail đặt lại: rate limit và mạng", () => {
  assert.match(
    resetMailErrorMessage(new Error("For security purposes, you can only request this after 60 seconds.")),
    /thử lại sau/i);
  assert.match(resetMailErrorMessage(new Error("Failed to fetch")), /Không kết nối được/);
  assert.match(resetMailErrorMessage(new Error("gì đó lạ")), /Chưa gửi được/);
});

test("dịch lỗi phiên recovery hết hạn mà không lộ lỗi kỹ thuật", () => {
  assert.equal(typeof recoverySessionErrorMessage, "function", "thiếu bộ dịch lỗi phiên recovery");
  assert.match(recoverySessionErrorMessage(new Error("Auth session missing")), /hết hạn|không hợp lệ/i);
  assert.match(recoverySessionErrorMessage(new Error("Failed to fetch")), /Không kết nối được/);
});

test("11-character passwords are rejected for reset and change", () => {
  for (const recovery of [false,true]) assert.ok(validateChangePassword({cu:"current",moi:"12345678901",nhacLai:"12345678901"},{recovery}).moi);
});

test("lỗi đổi mật khẩu giữ nguyên nguyên nhân native qua lớp xác minh MFA", () => {
  assert.match(changePasswordErrorMessage({ cause: { status: 429, msg: "Too many requests" } }), /quá nhiều lần/);
  assert.match(changePasswordErrorMessage({ cause: { msg: "New password should be different from old password" } }), /phải khác/);
  assert.match(changePasswordErrorMessage({ cause: new TypeError("Failed to fetch") }), /Không kết nối/);
});

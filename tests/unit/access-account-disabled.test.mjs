import test from "node:test";
import assert from "node:assert/strict";

import { thongDiepTuChoiQuyen } from "../../src/hooks/useAccess.ts";

/* B1 (21/10): server trả `{ok:false, error_code:"ACCOUNT_DISABLED"}` cho tài
   khoản đã bị khoá — người dùng phải thấy đúng lý do, không phải câu chung
   "chưa được gán vai". */
test("tài khoản bị vô hiệu hiện đúng lý do và hướng liên hệ Admin", () => {
  assert.equal(
    thongDiepTuChoiQuyen({ ok: false, error_code: "ACCOUNT_DISABLED", error: "Tài khoản không hoạt động" }),
    "Tài khoản không hoạt động. Liên hệ Admin.",
  );
});

test("payload hợp lệ hoặc lỗi khác không bị gán nhầm thông điệp khoá tài khoản", () => {
  assert.equal(thongDiepTuChoiQuyen({ ok: true, business_role: "admin", screens: {} }), null);
  assert.equal(thongDiepTuChoiQuyen({ ok: false, error_code: "SOMETHING_ELSE" }), null);
  assert.equal(thongDiepTuChoiQuyen(null), null);
});

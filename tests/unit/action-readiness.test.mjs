import test from "node:test";
import assert from "node:assert/strict";

import {
  actionDescriptionId,
  firstActionBlock,
} from "../../src/components/ui/actionReadiness.ts";

test("lý do chặn lấy điều kiện đúng đầu tiên theo thứ tự nghiệp vụ", () => {
  const result = firstActionBlock([
    { blocked: false, code: "permission", message: "Không có quyền." },
    { blocked: true, code: "busy", message: "Đang lưu…" },
    { blocked: true, code: "reason", message: "Nhập lý do.", focusId: "reason" },
  ]);

  assert.deepEqual(result, {
    code: "busy",
    message: "Đang lưu…",
  });
});

test("không có điều kiện chặn thì hành động sẵn sàng", () => {
  assert.equal(firstActionBlock([
    { blocked: false, code: "reason", message: "Nhập lý do." },
    { blocked: false, code: "change", message: "Chưa có thay đổi." },
  ]), null);
});

test("id mô tả hành động ổn định và an toàn cho aria-describedby", () => {
  assert.equal(actionDescriptionId("Đổi vai / Người dùng"), "action-doi-vai-nguoi-dung-description");
  assert.equal(actionDescriptionId("  "), "action-description");
});

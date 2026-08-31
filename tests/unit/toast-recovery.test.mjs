import test from "node:test";
import assert from "node:assert/strict";

import * as toastQueue from "../../src/lib/toastQueue.ts";

const { THOI_LUONG, chotToast, themToast, thoiLuongToast } = toastQueue;

test("toast lỗi có recovery action ở lại đến khi xử lý", () => {
  // Nếu đổi nhánh lỗi action về thời lượng hữu hạn, người dùng không kịp bấm thử lại.
  const action = { id: "a1", nhan: "Thử lại" };
  const toast = { id: "t1", loai: "loi", noiDung: "Lưu thất bại", hanhDong: action };

  assert.equal(typeof thoiLuongToast, "function");
  assert.equal(thoiLuongToast(toast), 0);
  assert.deepEqual(themToast([], toast)[0].hanhDong, action);
});

test("success đủ thời gian đọc và lỗi thường vẫn có trần", () => {
  // Nếu success trở về 2500 ms hoặc lỗi thường vĩnh viễn, phản hồi sẽ quá nhanh hoặc che giao diện.
  assert.equal(THOI_LUONG.thanhCong, 3500);
  assert.equal(THOI_LUONG.canhBao, 5000);
  assert.equal(THOI_LUONG.loi, 6000);
});

test("chốt lỗi giữ action đúng chỗ trong hàng", () => {
  // Nếu chốt bỏ action hoặc thêm lại cuối hàng, recovery sẽ mất hoặc toast nhảy vị trí.
  const action = { id: "a2", nhan: "Thử lại" };
  const queue = [
    { id: "t1", loai: "dang", noiDung: "Đang lưu" },
    { id: "t2", loai: "canhBao", noiDung: "Cần xem lại" },
  ];

  const settled = chotToast(queue, "t1", "loi", "Lưu thất bại", action);

  assert.deepEqual(settled.map((toast) => toast.id), ["t1", "t2"]);
  assert.deepEqual(settled[0].hanhDong, action);
});

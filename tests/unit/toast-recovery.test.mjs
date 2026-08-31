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

test("callback toast được consume đúng một lần và dismiss vô hiệu hóa nó", async () => {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false }, appType: "custom",
  });
  try {
    const provider = await vite.ssrLoadModule("/src/components/ui/ToastProvider.tsx");
    assert.equal(typeof provider.createToastActionRegistry, "function");
    const registry = provider.createToastActionRegistry();
    let calls = 0;

    registry.register("a1", () => { calls += 1; });
    registry.consume("a1")?.();
    registry.consume("a1")?.();
    assert.equal(calls, 1, "hai click đồng thời không được chạy recovery hai lần");

    registry.register("a2", () => { calls += 1; });
    registry.dismiss("a2");
    registry.consume("a2")?.();
    assert.equal(calls, 1, "đóng toast phải xoá callback ngay lập tức");

    registry.register("a3", () => { calls += 1; });
    registry.clear();
    registry.consume("a3")?.();
    assert.equal(calls, 1, "tháo scope/provider phải thu hồi mọi callback");
  } finally {
    await vite.close();
  }
});

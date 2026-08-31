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
  const provider = await import("../../src/components/ui/ToastProvider.tsx");
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
});

test("scope từ chối toast sau unmount và bỏ handle đã auto-close/cap khỏi lịch sử", async () => {
  const provider = await import("../../src/components/ui/ToastProvider.tsx");
  assert.equal(typeof provider.createScopedToastApi, "function");
  const made = [];
  let underlyingCalls = 0;
  const makeHandle = () => {
    let closed = false;
    const listeners = new Set();
    const close = () => {
      if (closed) return;
      closed = true;
      listeners.forEach((listener) => listener());
      listeners.clear();
    };
    const handle = {
      dismiss: close,
      onClose(listener) {
        if (closed) { listener(); return () => {}; }
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      close,
    };
    made.push(handle);
    return handle;
  };
  const fakeToast = {
    thanhCong: () => { underlyingCalls += 1; return makeHandle(); },
    loi: () => { underlyingCalls += 1; return makeHandle(); },
    canhBao: () => { underlyingCalls += 1; return makeHandle(); },
    dangChay: () => {
      underlyingCalls += 1;
      return { ...makeHandle(), xong() {}, hong() {} };
    },
  };
  const scope = provider.createScopedToastApi(fakeToast);

  scope.api.loi("lỗi 1");
  assert.equal(scope.pendingCount(), 1);
  made[0].close(); // auto-expire/dismiss/cap đều báo cùng sự kiện close
  assert.equal(scope.pendingCount(), 0, "handle đã đóng không được nằm lại trong Set owner");

  scope.api.loi("lỗi 2");
  scope.api.loi("lỗi 3");
  assert.equal(scope.pendingCount(), 2);
  scope.dispose();
  assert.equal(scope.pendingCount(), 0);
  const beforeLateCall = underlyingCalls;
  scope.api.loi("RPC cũ trả lỗi sau unmount");
  scope.api.dangChay("RPC cũ tiếp tục").hong("không được hiện");
  assert.equal(underlyingCalls, beforeLateCall,
    "scope inactive phải từ chối trước khi gọi provider gốc");
});

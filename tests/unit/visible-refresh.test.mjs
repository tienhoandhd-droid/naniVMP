import test from "node:test";
import assert from "node:assert/strict";

import { createVisibleRefreshController } from "../../src/lib/visibleRefresh.ts";

test("bỏ qua yêu cầu khi trang đang ẩn", () => {
  let calls = 0;
  const controller = createVisibleRefreshController({
    isVisible: () => false,
    refresh: () => { calls += 1; },
  });

  controller.request();

  assert.equal(calls, 0);
});

test("gộp các sự kiện focus và visibility đồng thời thành một lần refresh", () => {
  let calls = 0;
  const controller = createVisibleRefreshController({
    isVisible: () => true,
    refresh: () => { calls += 1; return new Promise(() => {}); },
  });

  controller.request();
  controller.request();

  assert.equal(calls, 1);
});

test("không gọi lại khi refresh đang in-flight", () => {
  let resolveRefresh;
  let calls = 0;
  const controller = createVisibleRefreshController({
    isVisible: () => true,
    refresh: () => {
      calls += 1;
      return new Promise((resolve) => { resolveRefresh = resolve; });
    },
  });

  controller.request();
  controller.request();
  resolveRefresh();

  assert.equal(calls, 1);
});

test("chỉ cho refresh mới sau khi promise hoàn tất và vượt coalesceMs", async () => {
  let now = 100;
  let calls = 0;
  const controller = createVisibleRefreshController({
    isVisible: () => true,
    refresh: () => { calls += 1; return Promise.resolve(); },
    now: () => now,
    coalesceMs: 1000,
  });

  controller.request();
  await Promise.resolve();
  now = 1099;
  controller.request();
  assert.equal(calls, 1);
  now = 1101;
  controller.request();
  assert.equal(calls, 2);
});

test("nuốt lỗi refresh và vẫn cho phép lần gọi sau", async () => {
  let calls = 0;
  const controller = createVisibleRefreshController({
    isVisible: () => true,
    refresh: () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("offline")) : Promise.resolve();
    },
    coalesceMs: 0,
  });

  controller.request();
  await Promise.resolve();
  controller.request();
  await Promise.resolve();

  assert.equal(calls, 2);
});

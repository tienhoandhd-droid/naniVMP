import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import { createVisibleRefreshController, startVisiblePolling } from "../../src/lib/visibleRefresh.ts";

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

/* Vòng kiểm dữ liệu 20 giây (hooks/index.ts) từng chạy cả khi tab ẩn —
   tốn RPC và pin cho một tab không ai nhìn. */
test("startVisiblePolling: bỏ qua nhịp khi tab ẩn, chạy lại khi tab hiện", async () => {
  let visible = true;
  let tick;
  let calls = 0;
  let dungLai = 0;
  const stop = startVisiblePolling({
    isVisible: () => visible,
    refresh: () => { calls += 1; return Promise.resolve(); },
    intervalMs: 20_000,
    coalesceMs: 0,
    schedule: (fn, ms) => { assert.equal(ms, 20_000); tick = fn; return 7; },
    cancel: (id) => { assert.equal(id, 7); dungLai += 1; },
  });

  tick();
  await Promise.resolve();
  assert.equal(calls, 1);

  visible = false;
  tick();
  tick();
  await Promise.resolve();
  assert.equal(calls, 1, "tab ẩn: không gọi máy chủ");

  visible = true;
  tick();
  await Promise.resolve();
  assert.equal(calls, 2);

  stop();
  assert.equal(dungLai, 1);
});

test("vòng kiểm 20 giây của useVmpData dùng startVisiblePolling, và app làm mới ngay khi tab hiện lại", () => {
  const hook = readFileSync(new URL("../../src/hooks/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(hook, /setInterval\(\(\) => refreshRef\.current\?\.\(\), 20000\)/);
  assert.match(hook, /startVisiblePolling\(\{[\s\S]{0,300}intervalMs: 20_?000/);
  const app = readFileSync(new URL("../../src/AuthenticatedApp.tsx", import.meta.url), "utf8");
  assert.match(app, /document\.addEventListener\("visibilitychange", controller\.request\)/);
  assert.match(app, /refresh: silentRefresh/);
});

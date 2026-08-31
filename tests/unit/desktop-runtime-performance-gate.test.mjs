import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DESKTOP_SKELETON_SELECTOR,
  DESKTOP_RUNTIME_LIMITS,
  assertDesktopRuntimeBudget,
  recordRouteSkeletonAppearance,
  runtimeGateScreens,
} from "../../scripts/do-hieu-nang.mjs";
import { SkeletonDashboard } from "../../src/components/ui/Primitives.tsx";
import StateBoundary from "../../src/components/ui/StateBoundary.tsx";

test("runtime gate rejects a late primary action, late skeleton appearance, and long task", () => {
  assert.deepEqual(DESKTOP_RUNTIME_LIMITS, {
    primaryActionableMs: 2_500,
    skeletonAppearanceMs: 100,
    maxLongTaskMs: 50,
    domWarningNodes: 1_500,
  });

  assert.throws(
    () => assertDesktopRuntimeBudget("reports", {
      primaryActionableMs: 2_501,
      skeletonAppearanceMs: 101,
      maxLongTaskMs: 51,
      domNodes: 1_500,
      optionalChunksBeforeAction: ["VmpSpace3D.js"],
    }),
    (error) => {
      assert.match(error.message, /reports: primary actionable 2501ms vượt 2500ms/);
      assert.match(error.message, /reports: skeleton xuất hiện 101ms vượt 100ms/);
      assert.match(error.message, /reports: long task 51ms vượt 50ms/);
      assert.match(error.message, /reports: optional chunk tải trước hành động VmpSpace3D\.js/);
      return true;
    },
  );
});

test("runtime gate warns but does not fail when only DOM count exceeds the advisory threshold", () => {
  const warnings = [];
  assert.doesNotThrow(() => assertDesktopRuntimeBudget("reports", {
    primaryActionableMs: 100,
    skeletonAppearanceMs: null,
    maxLongTaskMs: 0,
    domNodes: 1_501,
    optionalChunksBeforeAction: [],
  }, (warning) => warnings.push(warning)));
  assert.deepEqual(warnings, ["reports: DOM 1501 vượt ngưỡng cảnh báo 1500"]);
});

test("runtime gate applies long-task and skeleton checks to a route without a primary marker", () => {
  assert.doesNotThrow(() => assertDesktopRuntimeBudget("alerts", {
    primaryActionableMs: null,
    skeletonAppearanceMs: null,
    maxLongTaskMs: 0,
    domNodes: 400,
    optionalChunksBeforeAction: [],
  }, console.warn, { requirePrimaryAction: false }));
  assert.throws(() => assertDesktopRuntimeBudget("alerts", {
    primaryActionableMs: null,
    skeletonAppearanceMs: null,
    maxLongTaskMs: 51,
    domNodes: 400,
    optionalChunksBeforeAction: [],
  }, console.warn, { requirePrimaryAction: false }), /alerts: long task 51ms vượt 50ms/);
});

test("perf budget command owns a fresh preview before the runtime gate", () => {
  const packagePath = fileURLToPath(new URL("../../package.json", import.meta.url));
  const scripts = JSON.parse(readFileSync(packagePath, "utf8")).scripts;
  assert.equal(
    scripts["perf:budget"],
    "bash scripts/with-preview.sh -- node scripts/check-desktop-performance-budgets.mjs --runtime",
  );
});

test("runtime CI gate covers every approved desktop route", () => {
  assert.deepEqual(runtimeGateScreens(), [
    "reports", "alerts", "progress", "source", "workload", "rules", "phanquyen",
  ]);
});

test("runtime skeleton selector is emitted by each loading UI", () => {
  assert.equal(DESKTOP_SKELETON_SELECTOR, "[data-desktop-skeleton]");
  const dashboard = renderToStaticMarkup(React.createElement(SkeletonDashboard));
  const boundary = renderToStaticMarkup(React.createElement(StateBoundary, {
    state: "loading", title: "Đang tải dữ liệu",
  }));
  assert.match(dashboard, /data-desktop-skeleton/);
  assert.match(boundary, /data-desktop-skeleton/);
});

test("route skeleton clock ignores boot and measures first marker from route intent", () => {
  const clock = { routeIntentAt: null, skeletonAppearanceMs: null };
  recordRouteSkeletonAppearance(clock, 173, true);
  assert.equal(clock.skeletonAppearanceMs, null);
  clock.routeIntentAt = 1_000;
  recordRouteSkeletonAppearance(clock, 1_061, true);
  recordRouteSkeletonAppearance(clock, 1_090, true);
  assert.equal(clock.skeletonAppearanceMs, 61);
});

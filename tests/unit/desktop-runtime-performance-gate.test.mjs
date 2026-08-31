import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  DESKTOP_RUNTIME_LIMITS,
  assertDesktopRuntimeBudget,
  runtimeGateScreens,
} from "../../scripts/do-hieu-nang.mjs";

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

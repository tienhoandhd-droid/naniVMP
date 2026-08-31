import test from "node:test";
import assert from "node:assert/strict";

import { canPrefetchDesktopRoute } from "../../src/lib/routePrefetch.ts";
import { assertWithinBudget } from "../../scripts/check-desktop-performance-budgets.mjs";

test("prefetch gate rejects Timeline, Save-Data and non-desktop", () => {
  assert.equal(canPrefetchDesktopRoute("timeline", { desktop: true, saveData: false }), false);
  assert.equal(canPrefetchDesktopRoute("reports", { desktop: true, saveData: true }), false);
  assert.equal(canPrefetchDesktopRoute("reports", { desktop: false, saveData: false }), false);
  assert.equal(canPrefetchDesktopRoute("reports", { desktop: true, saveData: false }), true);
});

test("budget helper rejects an oversized route", () => {
  assert.throws(
    () => assertWithinBudget("reports", 51 * 1024, 50 * 1024),
    /reports/,
  );
});

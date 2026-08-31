import test from "node:test";
import assert from "node:assert/strict";

import {
  canPrefetchDesktopRoute,
  prefetchRouteLoader,
} from "../../src/lib/routePrefetch.ts";
import {
  assertWithinBudget,
  findShellEntry,
  routeFilesOutsideShell,
  ROUTE_BUDGETS,
  SHELL_BUDGET,
  staticFilesForEntry,
} from "../../scripts/check-desktop-performance-budgets.mjs";

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

test("intent prefetch swallows a raw loader rejection", async () => {
  let attempts = 0;
  prefetchRouteLoader(() => {
    attempts += 1;
    return Promise.reject(new Error("stale intent chunk"));
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(attempts, 1);
});

const SYNTHETIC_MANIFEST = {
  "index.html": {
    file: "assets/shell.js",
    isEntry: true,
    imports: ["shared"],
    css: ["assets/shell.css"],
    dynamicImports: ["heavy-excel"],
  },
  shared: {
    file: "assets/shared.js",
    imports: ["nested"],
    css: ["assets/shared.css"],
  },
  nested: { file: "assets/nested.js" },
  "route-static": {
    file: "assets/route-static.js",
    css: ["assets/route.css"],
  },
  "src/components/dashboard/ReportsView.tsx": {
    file: "assets/reports.js",
    imports: ["shared", "route-static"],
    dynamicImports: ["heavy-excel", "heavy-3d"],
  },
  "heavy-excel": { file: "assets/exceljs-heavy.js" },
  "heavy-3d": { file: "assets/three-heavy.js" },
};

test("static graph includes nested imports and CSS but excludes dynamic heavy chunks", () => {
  assert.deepEqual(
    [...staticFilesForEntry(SYNTHETIC_MANIFEST, "src/components/dashboard/ReportsView.tsx")].sort(),
    [
      "assets/nested.js",
      "assets/reports.js",
      "assets/route-static.js",
      "assets/route.css",
      "assets/shared.js",
      "assets/shared.css",
    ].sort(),
  );
});

test("route budget counts only its static delta outside the shell", () => {
  const shellFiles = staticFilesForEntry(SYNTHETIC_MANIFEST, "index.html");
  assert.deepEqual(
    [...routeFilesOutsideShell(SYNTHETIC_MANIFEST, "src/components/dashboard/ReportsView.tsx", shellFiles)].sort(),
    ["assets/reports.js", "assets/route-static.js", "assets/route.css"].sort(),
  );
});

test("budgets stay pinned to the approved byte limits", () => {
  assert.equal(SHELL_BUDGET, 275 * 1024);
  assert.deepEqual(ROUTE_BUDGETS, {
    "src/components/dashboard/ReportsView.tsx": 50 * 1024,
    "src/pages/AlertsPage.tsx": 100 * 1024,
    "src/pages/UpdatePage.tsx": 100 * 1024,
    "src/pages/SourceCatalogPage.tsx": 100 * 1024,
    "src/pages/WorkloadPage.tsx": 100 * 1024,
    "src/pages/ActiveRulesPage.tsx": 100 * 1024,
    "src/pages/PhanQuyenPage.tsx": 100 * 1024,
  });
});

test("shell selection prefers index and rejects ambiguous fallback entries", () => {
  assert.equal(findShellEntry({
    "admin.html": { file: "assets/admin.js", isEntry: true },
    "index.html": { file: "assets/shell.js" },
  }), "index.html");
  assert.equal(findShellEntry({
    "admin.html": { file: "assets/admin.js", isEntry: true },
  }), "admin.html");
  assert.throws(() => findShellEntry({
    "admin.html": { file: "assets/admin.js", isEntry: true },
    "worker.html": { file: "assets/worker.js", isEntry: true },
  }), /nhiều entry/);
  assert.throws(() => findShellEntry({
    "shared.js": { file: "assets/shared.js" },
  }), /không có entry/);
});

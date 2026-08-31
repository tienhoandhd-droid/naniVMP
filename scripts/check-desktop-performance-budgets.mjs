import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export const SHELL_BUDGET = 275 * 1024;
export const ROUTE_BUDGETS = {
  "src/components/dashboard/ReportsView.tsx": 50 * 1024,
  "src/pages/AlertsPage.tsx": 100 * 1024,
  "src/pages/UpdatePage.tsx": 100 * 1024,
  "src/pages/SourceCatalogPage.tsx": 100 * 1024,
  "src/pages/WorkloadPage.tsx": 100 * 1024,
  "src/pages/ActiveRulesPage.tsx": 100 * 1024,
  "src/pages/PhanQuyenPage.tsx": 100 * 1024,
};

/* Không có Timeline hoặc Long Môn trong ROUTE_BUDGETS. Giữ danh sách tường
 * minh để mọi thay đổi sau này không vô tình đưa hai vùng ngoài phạm vi vào
 * phép đo/chia chunk của desktop shell. */
export const EXCLUDED_ROUTE_SOURCES = [
  "src/pages/TimelinePage.tsx",
  "src/pages/LongMonPage.tsx",
];

function isMeasuredAsset(file) {
  return file.endsWith(".js") || file.endsWith(".css");
}

/** Tập file tĩnh của một manifest entry; cố ý không đi qua dynamicImports. */
export function staticFilesForEntry(manifest, entryKey) {
  const files = new Set();
  const visited = new Set();

  const visit = (key) => {
    if (visited.has(key)) return;
    visited.add(key);
    const entry = manifest[key];
    if (!entry) throw new Error(`Manifest thiếu entry ${key}`);
    if (isMeasuredAsset(entry.file)) files.add(entry.file);
    for (const cssFile of entry.css ?? []) {
      if (isMeasuredAsset(cssFile)) files.add(cssFile);
    }
    for (const importedKey of entry.imports ?? []) visit(importedKey);
  };

  visit(entryKey);
  return files;
}

export function gzipSizeForFiles(outputDir, files) {
  let total = 0;
  for (const file of files) {
    total += gzipSync(readFileSync(resolve(outputDir, file))).length;
  }
  return total;
}

export function assertWithinBudget(label, actual, budget) {
  if (actual > budget) {
    throw new Error(`${label} gzip ${actual} B vượt ngân sách ${budget} B`);
  }
}

function findShellEntry(manifest) {
  const shell = Object.entries(manifest).find(([source, entry]) =>
    source === "index.html" || entry.isEntry === true);
  if (!shell) throw new Error("Manifest thiếu entry shell index.html");
  return shell[0];
}

export function checkDesktopPerformanceBudgets({
  manifestPath = "dist/.vite/manifest.json",
  outputDir = "dist",
} = {}) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const shellFiles = staticFilesForEntry(manifest, findShellEntry(manifest));
  const shellGzip = gzipSizeForFiles(outputDir, shellFiles);
  assertWithinBudget("shell", shellGzip, SHELL_BUDGET);

  const routes = {};
  for (const [entryKey, budget] of Object.entries(ROUTE_BUDGETS)) {
    const routeFiles = staticFilesForEntry(manifest, entryKey);
    const routeDelta = new Set([...routeFiles].filter((file) => !shellFiles.has(file)));
    const gzip = gzipSizeForFiles(outputDir, routeDelta);
    assertWithinBudget(entryKey, gzip, budget);
    routes[entryKey] = gzip;
  }

  return { shell: shellGzip, routes };
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function isDirectInvocation() {
  return process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isDirectInvocation()) {
  const result = checkDesktopPerformanceBudgets();
  console.log(`shell ${formatKiB(result.shell)} / ${formatKiB(SHELL_BUDGET)}`);
  for (const [entry, gzip] of Object.entries(result.routes)) {
    console.log(`${entry} ${formatKiB(gzip)} / ${formatKiB(ROUTE_BUDGETS[entry])}`);
  }
}

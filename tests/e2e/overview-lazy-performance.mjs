import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || readFileSync(
  fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8",
).match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const baseline = process.argv.includes("--baseline");
const outputPath = process.env.VMP_PERF_OUTPUT || "/tmp/vmp-overview-lazy-performance.json";

assert.ok(supabaseUrl, "test requires public mock endpoint");

function resourceSummary(entries) {
  const assets = entries.filter((entry) => /\.(?:js|css)(?:\?|$)/.test(new URL(entry.name).pathname));
  const summarize = (extension) => assets.filter((entry) => new URL(entry.name).pathname.endsWith(extension))
    .reduce((total, entry) => total + Math.max(0, entry.encodedBodySize || 0), 0);
  return {
    jsEncodedBytes: summarize(".js"),
    cssEncodedBytes: summarize(".css"),
    assets: assets.map((entry) => ({ url: entry.name, encodedBodySize: entry.encodedBodySize || 0 })),
  };
}

async function cssContains(page, pattern) {
  return page.evaluate((needle) => {
    return [...document.styleSheets].some((sheet) => {
      try { return [...sheet.cssRules].some((rule) => rule.cssText.includes(needle)); }
      catch { return false; }
    });
  }, pattern);
}

async function exercise(page, repeat) {
  const session = await page.target().createCDPSession();
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  await caiGiaLap(page, { supabaseUrl, kichBan: "day", mangNghiemNgat: true, previewOrigin: APP_URL });
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1440, height: 900 });
  const began = Date.now();
  await page.goto(`${APP_URL}#v=today`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll("#vmp-main-content .hn-muc").length === 18, { timeout: 15_000 });
  const todayReadyMs = Date.now() - began;
  const initial = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => ({
    name: entry.name, encodedBodySize: entry.encodedBodySize,
  })));
  const initialAssets = resourceSummary(initial.map((entry) => ({ ...entry, name: entry.name })));
  const initialHasOverviewCss = await cssContains(page, ".overview-analysis-studio");
  const initialRows = await page.$$eval("#vmp-main-content .hn-muc", (rows) => rows.length);

  // Today deliberately uses the compact system filter. Its real control is the
  // personal/team scope switch rather than the full department popover.
  const compactFilter = ".vmp-thanh-loc--gon";
  const compactScope = `${compactFilter} .timeline-scope-btn`;
  const compactPerson = `${compactFilter} select[aria-label="Chọn nhân sự xem tiến độ"]`;
  const hasCompactFilter = await page.$(compactFilter) !== null;
  if (!hasCompactFilter && !baseline) assert.fail("Today must retain its compact filter before overview navigation");
  let initialCompactValue = null;
  if (await page.$(compactScope)) {
    initialCompactValue = await page.$eval(compactScope, (button) => button.getAttribute("aria-label"));
    const initiallyPressed = await page.$eval(compactScope, (button) => button.getAttribute("aria-pressed"));
    const disabled = await page.$eval(compactScope, (button) => button.disabled);
    assert.equal(disabled, false, "mocked signed-in user can change Today scope");
    await page.click(compactScope);
    await page.waitForFunction((selector, pressed) => document.querySelector(selector)?.getAttribute("aria-pressed") !== pressed,
      {}, compactScope, initiallyPressed);
    await page.click(compactScope);
    await page.waitForFunction((selector, pressed) => document.querySelector(selector)?.getAttribute("aria-pressed") === pressed,
      {}, compactScope, initiallyPressed);
  } else if (await page.$(compactPerson)) {
    initialCompactValue = await page.$eval(compactPerson, (select) => select.value);
    const alternateValue = await page.$eval(compactPerson, (select) =>
      [...select.options].map((option) => option.value).find((value) => value !== select.value));
    assert.ok(alternateValue !== undefined, "compact personnel filter exposes an alternate scope");
    await page.select(compactPerson, alternateValue);
    await page.waitForFunction((selector, value) => document.querySelector(selector)?.value === value,
      {}, compactPerson, alternateValue);
    await page.select(compactPerson, initialCompactValue);
    await page.waitForFunction((selector, value) => document.querySelector(selector)?.value === value,
      {}, compactPerson, initialCompactValue);
  } else if (!baseline) {
    assert.fail("Today compact filter must expose a usable scope control");
  }

  const overviewNav = '.vmp-sidebar button[data-view="overview"]';
  await page.click(overviewNav);
  await page.waitForFunction(() => location.hash === "#v=overview" || location.hash === "", { timeout: 5_000 });
  await page.waitForSelector("[data-overview-total]", { timeout: 15_000 });
  await page.waitForSelector("[data-overview-analysis-studio]", { timeout: 15_000 });
  const overview = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => ({
    name: entry.name, encodedBodySize: entry.encodedBodySize,
  })));
  const overviewAssets = resourceSummary(overview.map((entry) => ({ ...entry, name: entry.name })));
  const overviewHasAnalysisCss = await cssContains(page, ".overview-analysis-studio");
  const metricTotal = await page.$eval("[data-overview-total]", (node) => Number(node.getAttribute("data-overview-total")));
  assert.equal(metricTotal, 24, "overview retains all 24 authorized fixture activities");

  const matrixCell = "[data-analysis-matrix-cell]";
  await page.waitForSelector(matrixCell, { timeout: 15_000 });
  await page.click(matrixCell);
  await page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { hidden: true, timeout: 5_000 });

  await page.click('.vmp-sidebar button[data-view="today"]');
  await page.waitForFunction(() => location.hash === "#v=today", { timeout: 5_000 });
  await page.waitForFunction(() => document.querySelectorAll("#vmp-main-content .hn-muc").length === 18, { timeout: 15_000 });
  if (initialCompactValue) {
    const compactControl = await page.$(compactScope) ? compactScope : compactPerson;
    const currentValue = await page.$eval(compactControl, (control) =>
      control instanceof HTMLButtonElement ? control.getAttribute("aria-label") : control.value);
    assert.equal(currentValue, initialCompactValue, "returning to Today preserves the compact scope");
  }
  assert.equal(await page.$$eval("#vmp-main-content .hn-muc", (rows) => rows.length), initialRows,
    "returning to Today keeps the unfiltered scope and 18 rendered rows");

  if (!baseline) {
    assert.deepEqual(initialAssets.assets.filter((asset) => /OverviewPage/i.test(asset.url)), [],
      "cold Today must not load an OverviewPage chunk");
    assert.equal(initialHasOverviewCss, false, "cold Today CSS must not contain overview analysis rules");
    assert.ok(overviewAssets.assets.some((asset) => /OverviewPage/i.test(asset.url)),
      "navigating to overview must load its route chunk");
    assert.equal(overviewHasAnalysisCss, true, "navigating to overview must load analysis CSS");
  }

  return { repeat, todayReadyMs, compactFilterFunctional: hasCompactFilter, initial: { ...initialAssets, hasOverviewAnalysisCss: initialHasOverviewCss },
    overview: { ...overviewAssets, hasOverviewAnalysisCss: overviewHasAnalysisCss, metricTotal } };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const repeats = [];
try {
  for (let repeat = 1; repeat <= 3; repeat += 1) {
    const context = await browser.createBrowserContext();
    try { repeats.push(await exercise(await context.newPage(), repeat)); }
    finally { await context.close(); }
  }
} finally {
  await browser.close();
}

const report = { mode: baseline ? "baseline" : "regression", appUrl: APP_URL, repeats };
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS overview lazy performance ${report.mode}; JSON: ${outputPath}`);

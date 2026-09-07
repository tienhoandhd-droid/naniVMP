import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || readFileSync(".env.local", "utf8")
  .match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
assert.ok(supabaseUrl, "chart E2E requires the mock Supabase origin");

const shots = "/tmp/vmp-chart-redesign";
mkdirSync(shots, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { window.__REACT_GRAB_DISABLED__ = true; });
  await caiGiaLap(page, { supabaseUrl, kichBan: "day", mangNghiemNgat: true, previewOrigin: APP_URL });
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(`${APP_URL}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("[data-overview-analysis-studio]", { timeout: 15_000 });

  const lanes = await page.$$eval("[data-analysis-flow]", ([flow]) => ({
    stageCount: flow.querySelectorAll("[data-analysis-stage]").length,
    columnCount: getComputedStyle(flow).gridTemplateColumns.split(" ").filter(Boolean).length,
    bars: flow.querySelectorAll(".analysis-flow__bar").length,
    values: [...flow.querySelectorAll("[data-analysis-stage] > strong")].map((value) => value.textContent?.trim()),
  }));
  assert.equal(lanes.stageCount, 4);
  assert.equal(lanes.columnCount, 1, "stages are aligned comparison lanes, not a four-card grid");
  assert.equal(lanes.bars, 4, "each stage retains its visible quantitative bar");
  assert.ok(lanes.values.every((value) => /^\d+%$/.test(value || "")));

  const palette = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return ["--chart-protocol", "--chart-validation", "--chart-report", "--chart-complete", "--chart-overdue"]
      .map((token) => style.getPropertyValue(token).trim());
  });
  assert.equal(new Set(palette).size, 5, "stage and overdue semantics use separate colors");

  const department = 'select[aria-label="Bộ phận trong phân tích chuyên sâu"]';
  const before = await page.$eval(".analysis-scope-note b", (node) => Number(node.textContent));
  const alternate = await page.$eval(department, (select) => [...select.options]
    .map((option) => option.value).find((value) => value !== "all"));
  assert.ok(alternate);
  await page.select(department, alternate);
  await page.waitForFunction((count) => Number(document.querySelector(".analysis-scope-note b")?.textContent) !== count, {}, before);

  await page.click("[data-analysis-matrix-cell]");
  await page.waitForSelector('[role="dialog"][aria-modal="true"]');
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"][aria-modal="true"]', { hidden: true });

  await page.click(".analysis-filter-bar__reset");
  await page.waitForFunction((selector) => document.querySelector(selector)?.value === "all", {}, department);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  const flow = await page.$(".overview-analysis-layer--flow");
  assert.ok(flow, "completion flow is present for visual evidence");
  await flow.screenshot({ path: `${shots}/desktop-light.png` });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await flow.screenshot({ path: `${shots}/desktop-dark.png` });
  await page.setViewport({ width: 390, height: 844 });
  await flow.screenshot({ path: `${shots}/mobile-dark.png` });
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
  await flow.screenshot({ path: `${shots}/mobile-light.png` });
  console.log(`PASS chart redesign behavior and screenshots: ${shots}`);
} finally {
  await browser.close();
}

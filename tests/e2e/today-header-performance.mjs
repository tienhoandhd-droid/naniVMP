import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || readFileSync(
  fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8",
).match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const shotDir = process.env.VMP_SHOT_DIR || "/tmp/vmp-today-header-performance";

assert.ok(supabaseUrl, "test requires public mock endpoint");
mkdirSync(shotDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await caiGiaLap(page, { supabaseUrl, kichBan: "day", mangNghiemNgat: true, previewOrigin: APP_URL });
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".vmp-overview-progress__row", { timeout: 15_000 });

  const chunksBeforeToday = await page.evaluate(() => performance.getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((url) => url.includes("TodayCommandCenter")));
  assert.deepEqual(chunksBeforeToday, [], "overview must not request the TodayCommandCenter chunk");

  const todayNav = ".vmp-sidebar button[data-view=\"today\"]";
  await page.waitForSelector(todayNav, { timeout: 5_000 });
  await page.click(todayNav);
  await page.waitForFunction(() => location.hash === "#v=today");
  await page.waitForSelector("#vmp-main-content .hn-lotus", { timeout: 15_000 });
  await page.waitForSelector("#vmp-main-content .hn-muc", { timeout: 15_000 });

  const today = await page.$eval("#vmp-main-content", (main) => ({
    text: main.textContent || "",
    subtitle: main.querySelector(".hn-mota")?.textContent?.replace(/\s+/g, " ").trim() || "",
    rows: main.querySelectorAll(".hn-muc").length,
  }));
  assert.ok(await page.evaluate(() => [...document.styleSheets].some(sheet => sheet.href?.includes("TodayCommandCenterPage"))), "Today stylesheet is parsed with its route");
  assert.ok(today.rows > 0, "Today must render fixture data");
  assert.match(today.subtitle, /Hàng đợi gồm việc quá hạn, đến hạn hôm nay, trong bảy ngày tới và hồ sơ cần hoàn thiện\./);
  assert.ok(!today.text.includes("Sửa lần cuối"), "Today main must not show the last-edited label");

  const todayChunks = await page.evaluate(() => performance.getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((url) => url.includes("TodayCommandCenter")));
  assert.ok(todayChunks.length > 0, "navigating to Today must request a TodayCommandCenter resource");

  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))); });
  await page.screenshot({ path: `${shotDir}/today-1440x900.png`, fullPage: true });

  await page.click('.vmp-sidebar button[data-view="alerts"]');
  await page.waitForFunction(() => location.hash === "#v=alerts");
  await page.waitForFunction(() => document.querySelector("main h1")?.textContent?.includes("Cảnh báo"), { timeout: 15_000 });
  await page.click(todayNav);
  await page.waitForFunction(() => location.hash === "#v=today");
  await page.waitForSelector("#vmp-main-content .hn-muc", { timeout: 15_000 });
  assert.ok(await page.$eval("#vmp-main-content", (main) => !main.textContent?.includes("Sửa lần cuối")),
    "Today must stay clean after navigating away and back");
  assert.deepEqual(pageErrors, [], "Today navigation must not raise browser runtime errors");

  console.log(`PASS Today header/lazy route: ${today.rows} rows; chunk ${todayChunks[0]}; screenshot ${shotDir}/today-1440x900.png`);
} finally {
  await browser.close();
}

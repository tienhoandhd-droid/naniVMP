import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || readFileSync(
  fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8",
).match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();

assert.ok(supabaseUrl, "test requires public mock endpoint");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const results = [];

async function openFixture({ route, theme, width, textScale = false }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  await caiGiaLap(page, { supabaseUrl, kichBan: "day", mangNghiemNgat: true, previewOrigin: APP_URL });
  if (route === "reports") await nhetPhien(page, { supabaseUrl });
  await page.evaluateOnNewDocument((value) => localStorage.setItem("vmp-theme", value), theme);
  await page.goto(`${APP_URL}#v=${route === "reports" ? "reports" : "today"}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(route === "reports" ? ".vmp-report-export-actions" : "#vmp-login-email", { timeout: 15_000 });
  if (textScale) {
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  }
  return page;
}

async function measure(page, route, theme, condition) {
  const metric = await page.evaluate((selector) => {
    const anchor = document.querySelector(selector);
    const rect = anchor?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
      anchorRight: rect?.right ?? 0,
      anchorWidth: rect?.width ?? 0,
    };
  }, route === "reports" ? ".vmp-report-export-actions" : ".vq-login-form");
  assert.equal(metric.overflow <= 1, true, `${route}/${theme}/${condition} must not create document horizontal overflow: ${metric.overflow}px`);
  assert.equal(metric.anchorRight <= (await page.viewport()).width + 1, true,
    `${route}/${theme}/${condition} primary controls must remain within the viewport`);
  results.push({ route, theme, condition, ...metric });
}

try {
  for (const route of ["login", "reports"]) {
    for (const theme of ["light", "dark"]) {
      const zoomViewport = await openFixture({ route, theme, width: 720 });
      await measure(zoomViewport, route, theme, "viewport-720");
      await zoomViewport.close();

      const enlargedText = await openFixture({ route, theme, width: 1440, textScale: true });
      await measure(enlargedText, route, theme, "root-font-200%");
      assert.equal(await enlargedText.evaluate(() => getComputedStyle(document.documentElement).fontSize), "32px",
        `${route}/${theme} must receive the requested 200% root font size`);
      await enlargedText.close();
    }
  }

  const page = await openFixture({ route: "reports", theme: "light", width: 1440 });
  await page.focus('select[aria-label="Phạm vi bộ phận"]');
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(() => document.querySelector('[role="status"][aria-label="Phạm vi báo cáo đang xem"]')?.textContent?.includes("Đang xem:"));

  await page.focus('button[data-report-stage-drilldown]');
  await page.keyboard.press("Enter");
  await page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { hidden: true, timeout: 5_000 });
  await page.waitForFunction(() => document.activeElement?.matches('button[data-report-stage-drilldown]'), { timeout: 2_000 });
  assert.equal(await page.evaluate(() => document.activeElement?.matches('button[data-report-stage-drilldown]')), true,
    "closing a keyboard-opened report drilldown must restore focus to its trigger");

  await page.focus('.vmp-report-export-actions button[aria-label="Tải báo cáo HTML"]');
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Tải báo cáo HTML",
    "the HTML export remains keyboard-operable and named");
  await page.close();

  console.log(`PASS quality zoom: ${JSON.stringify(results)}`);
} finally {
  await browser.close();
}

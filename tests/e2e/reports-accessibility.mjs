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

try {
  const page = await browser.newPage();
  await caiGiaLap(page, { supabaseUrl, kichBan: "day", mangNghiemNgat: true, previewOrigin: APP_URL });
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}#v=reports`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => document.body.textContent?.includes("1. Tổng quan năm"), { timeout: 15_000 });

  for (const name of ["Năm báo cáo", "Phạm vi bộ phận", "Cách xem kỳ", "Tháng báo cáo"]) {
    const found = await page.evaluate((label) => [...document.querySelectorAll("select")]
      .some((select) => select.getAttribute("aria-label") === label), name);
    assert.ok(found, `report select must have the accessible name ${name}`);
  }

  const filterStatus = await page.$('[role="status"][aria-label="Phạm vi báo cáo đang xem"]');
  assert.ok(filterStatus, "filter scope feedback must be a named live status");
  assert.match(await filterStatus.evaluate((node) => node.textContent || ""), /Đang xem:/);

  for (const name of ["Xuất Excel đầy đủ 5 sheet", "In báo cáo dưới dạng PDF", "Tải báo cáo HTML"]) {
    const found = await page.evaluate((label) => [...document.querySelectorAll(".vmp-report-export-actions button")]
      .some((button) => (button.getAttribute("aria-label") || button.textContent || "").includes(label)), name);
    assert.ok(found, `export action must have the accessible name ${name}`);
  }
  assert.equal(await page.$eval('.vmp-report-export-actions button[title*="PDF"]', (button) => button.getAttribute("aria-busy")), "false");

  const drilldown = await page.$('table.reg-table tbody button[data-report-stage-drilldown]');
  assert.ok(drilldown, "a nonzero report stage must expose a native drilldown button in its table cell");
  await drilldown.focus();
  await page.keyboard.press("Space");
  await page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
  assert.ok(await page.$eval('[role="dialog"]', (dialog) => dialog.checkVisibility()), "keyboard drilldown must show its dialog");
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { hidden: true, timeout: 5_000 });
  // ViewportDialog restores focus on the next animation frame after unmount.
  await page.waitForFunction(() => document.activeElement?.matches('[data-report-stage-drilldown]'), { timeout: 2_000 });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-report-stage-drilldown")), "",
    "closing the detail dialog must return focus to its drilldown button");

  console.log("PASS Reports accessibility: named controls, filter status, exports, keyboard drilldown, dialog focus return");
} finally {
  await browser.close();
}

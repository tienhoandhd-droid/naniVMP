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
const shotDir = process.env.VMP_SHOT_DIR || "/tmp/vmp-context-help";

assert.ok(supabaseUrl, "test requires public mock endpoint");
mkdirSync(shotDir, { recursive: true });

const regions = [
  ["objects", "Đối tượng"],
  ["coverage", "Phạm vi xưởng"],
  ["products", "Sản phẩm GMP"],
  ["alerts", "Người nhận cảnh báo"],
  ["revalidation", "Tái thẩm định"],
  ["import", "Nhập Excel"],
  ["pending", "Chờ áp dụng"],
  ["history", "Lịch sử"],
];

async function openSource(page, suaKho) {
  await caiGiaLap(page, { supabaseUrl, kichBan: "day", mangNghiemNgat: true, previewOrigin: APP_URL, suaKho });
  await nhetPhien(page, { supabaseUrl });
  await page.goto(`${APP_URL}#v=source`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".cw-workspace", { timeout: 15_000 });
}

async function openAndCloseHelp(page, label, { screenshot } = {}) {
  const selector = `button[aria-label="Hướng dẫn ${label}"]`;
  await page.waitForSelector(selector, { visible: true, timeout: 10_000 });
  await page.focus(selector);
  await page.click(selector);
  await page.waitForSelector('[role="dialog"]', { visible: true, timeout: 10_000 });
  const dialog = await page.$eval('[role="dialog"]', (node) => ({
    text: node.textContent?.replace(/\s+/g, " ").trim() || "",
    labelledBy: node.getAttribute("aria-labelledby"),
  }));
  assert.ok(dialog.text.length >= 80, `${label} help must explain the region, not only name it`);
  assert.ok(dialog.labelledBy || dialog.text.includes(label), `${label} help must have an accessible name`);
  if (label === "Chờ áp dụng") {
    assert.match(dialog.text, /đã lưu ở Dữ liệu nguồn/i,
      "Pending help must distinguish saved Source data from its later timeline effect");
    assert.match(dialog.text, /Áp vào timeline/i,
      "Pending help must explain that confirmation applies the timeline change");
  }
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { hidden: true, timeout: 5_000 });
  await page.waitForFunction((target) => document.activeElement === document.querySelector(target), { timeout: 2_000 }, selector);
  assert.equal(await page.evaluate((target) => document.activeElement === document.querySelector(target), selector), true,
    `Escape must return focus to ${label} help`);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 900 });
  await openSource(page);
  await page.waitForSelector(".cw-bang--objects tbody tr", { timeout: 15_000 });

  assert.deepEqual(await page.$$eval("[data-cw-nav]", (nodes) => nodes.map((node) => node.getAttribute("data-cw-nav"))),
    regions.map(([id]) => id), "an authorized manager must receive help for all eight Source regions");

  for (const [id, label] of regions) {
    await page.click(`[data-cw-nav="${id}"]`);
    await page.waitForFunction((regionId) => document.querySelector(`[data-cw-nav="${regionId}"]`)?.getAttribute("aria-pressed") === "true", {}, id);
    await openAndCloseHelp(page, label, label === "Chờ áp dụng"
      ? { screenshot: `${shotDir}/pending-help-1440x900.png` } : undefined);
    const visibleHeaders = await page.$$eval(".vmp-topbar, h1, h2, h3, h4, h5, h6", (nodes) => nodes
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => node.textContent || ""));
    assert.ok(visibleHeaders.every((text) => !text.includes("Sửa lần cuối")),
      `${label} visible headers must not contain the decorative last-edited label`);
  }

  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.click('[data-cw-nav="objects"]');
  const objectHelp = 'button[aria-label="Hướng dẫn Đối tượng"]';
  await page.click(objectHelp);
  await page.waitForSelector('[role="dialog"]', { visible: true, timeout: 10_000 });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
  await page.screenshot({ path: `${shotDir}/objects-help-390x844.png`, fullPage: true });
  const mobile = await page.$eval('[role="dialog"]', (dialog) => {
    const rect = dialog.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, pageOverflow: document.documentElement.scrollWidth - innerWidth };
  });
  assert.ok(mobile.left >= -1 && mobile.right <= 391 && mobile.top >= -1 && mobile.bottom <= 845 && mobile.pageOverflow <= 1,
    `mobile help dialog must fit the viewport: ${JSON.stringify(mobile)}`);
  await page.keyboard.press("Escape");

  const reader = await browser.newPage();
  await reader.setViewport({ width: 1440, height: 900 });
  await openSource(reader, (fixture) => {
    const source = fixture.rpc_my_ui_access;
    fixture.rpc_my_ui_access = {
      ...source,
      business_role: "workshop_staff",
      screens: Object.fromEntries(Object.entries(source.screens).map(([id, screen]) => [id, {
        ...screen,
        actions: id === "source" ? ["view"] : screen.actions,
      }])),
    };
  });
  await reader.waitForSelector(".cw-bang--objects tbody tr", { timeout: 15_000 });
  assert.deepEqual(await reader.$$eval("[data-cw-nav]", (nodes) => nodes.map((node) => node.getAttribute("data-cw-nav"))), ["objects"],
    "object-only reader must not gain management regions");
  assert.equal(await reader.$("[data-cw-them], [data-cw-sua], [data-cw-export-count]"), null,
    "opening reader help must not grant any catalog mutation or export control");
  await openAndCloseHelp(reader, "Đối tượng");
  await reader.close();

  assert.deepEqual(errors, [], "contextual help must not cause browser runtime errors");
  console.log("PASS Source contextual help: eight manager regions, reader access, Escape focus return, and mobile containment");
} finally {
  await browser.close();
}

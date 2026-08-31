import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || (() => {
  const env = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
  const match = env.match(/^VITE_SUPABASE_URL=(.+)$/m);
  return match?.[1]?.trim();
})();

if (!supabaseUrl) throw new Error("Không tìm thấy Supabase URL công khai cho navigation E2E");

async function settleFrame(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.__REACT_GRAB_DISABLED__ = true;
  });
  await caiGiaLap(page, { supabaseUrl, kichBan: "day", previewOrigin: APP_URL });
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(`${APP_URL}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".vmp-sidebar [data-view=\"overview\"]", { timeout: 15_000 });

  await page.click('[data-view="alerts"]');
  await page.waitForFunction(() => location.hash === "#v=alerts");
  await settleFrame(page);
  const state = await page.evaluate(() => ({
    activeView: document.querySelector('.vmp-sidebar [aria-current="page"]')?.getAttribute("data-view"),
    focusId: document.activeElement?.id,
    title: document.title,
  }));
  assert.deepEqual(state, {
    activeView: "alerts",
    focusId: "vmp-main-content",
    title: "Cảnh báo & ưu tiên — V/Q team",
  });

  await page.click("#vmp-global-filter-trigger");
  await page.waitForSelector("#vmp-global-filter-panel");
  const filterControl = "#vmp-global-filter-panel .vmp-global-filter__option";
  await page.focus(filterControl);
  await page.click(filterControl);
  await page.waitForFunction((selector) => {
    const control = document.querySelector(selector);
    return control?.getAttribute("aria-pressed") === "true";
  }, {}, filterControl);
  assert.deepEqual(await page.evaluate((selector) => ({
    focusStayed: document.activeElement === document.querySelector(selector),
    view: new URLSearchParams(location.hash.slice(1)).get("v"),
  }), filterControl), {
    focusStayed: true,
    view: "alerts",
  });

  await page.goBack();
  await page.waitForFunction(() =>
    document.querySelector('.vmp-sidebar [aria-current="page"]')?.getAttribute("data-view") === "overview");
  await settleFrame(page);
  assert.deepEqual(await page.evaluate(() => ({
    activeView: document.querySelector('.vmp-sidebar [aria-current="page"]')?.getAttribute("data-view"),
    focusId: document.activeElement?.id,
    title: document.title,
  })), {
    activeView: "overview",
    focusId: "vmp-main-content",
    title: "Tổng quan VMP — V/Q team",
  });

  await page.goto(`${APP_URL}#v=rules`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector("main h1")?.textContent?.trim()
    === "Luật hệ thống đang áp dụng");
  assert.deepEqual(await page.evaluate(() => ({
    heading: document.querySelector("main h1")?.textContent?.trim(),
    title: document.title,
  })), {
    heading: "Luật hệ thống đang áp dụng",
    title: "Luật hệ thống đang áp dụng — V/Q team",
  });
} finally {
  await browser.close();
}

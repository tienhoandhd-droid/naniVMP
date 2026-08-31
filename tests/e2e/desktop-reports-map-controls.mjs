import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const URL_SB = process.env.VMP_E2E_SUPABASE_URL || (() => {
  const noi = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
  return noi.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
})();

if (!URL_SB) throw new Error("Không tìm thấy Supabase URL công khai cho reports map E2E");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

try {
  const page = await browser.newPage();
  await caiGiaLap(page, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(page, { supabaseUrl: URL_SB });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${GOC}#v=reports`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => document.body.textContent?.includes("3. Đánh giá so với mục tiêu"),
    { timeout: 15_000 });
  await new Promise((resolve) => setTimeout(resolve, 1_000));

  const state = await page.evaluate(() => ({
    targetCharts: document.querySelectorAll("[data-report-monthly-target-chart]").length,
    flatSvg: Boolean(document.querySelector("[data-report-monthly-target-chart] svg")),
    maps3d: document.querySelectorAll(".vmp-space3d").length,
    canvas3d: Boolean(document.querySelector("canvas[data-engine^='three.js']")),
    buttons3d: document.querySelectorAll('button[data-map-mode="3d"]').length,
    collapsedFlatCharts: [...document.querySelectorAll("details > summary")]
      .filter((summary) => /Xem dạng phẳng 12 tháng/.test(summary.textContent || "")).length,
  }));
  assert.deepEqual(state, {
    targetCharts: 1,
    flatSvg: true,
    maps3d: 0,
    canvas3d: false,
    buttons3d: 0,
    collapsedFlatCharts: 0,
  });
} finally {
  await browser.close();
}

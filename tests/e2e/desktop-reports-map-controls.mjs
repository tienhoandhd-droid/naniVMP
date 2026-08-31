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
  await page.waitForSelector('.vmp-space3d button[data-map-mode="3d"]', { timeout: 15_000 });

  assert.equal(await page.$$eval(".vmp-space3d-doi", (nodes) => nodes.length), 1,
    "gate ban đầu có đúng một nhóm chọn mode");
  await page.click('.vmp-space3d button[data-map-mode="3d"]');
  await page.waitForSelector(".vmp-space3d canvas", { timeout: 15_000 });

  const state = await page.evaluate(() => ({
    controlGroups: document.querySelectorAll(".vmp-space3d-doi").length,
    buttons2d: document.querySelectorAll('button[data-map-mode="2d"]').length,
    buttons3d: document.querySelectorAll('button[data-map-mode="3d"]').length,
    nestedMaps: document.querySelectorAll(".vmp-space3d .vmp-space3d").length,
    canvas: Boolean(document.querySelector(".vmp-space3d canvas")),
    selected3d: document.querySelector('button[data-map-mode="3d"]')?.classList.contains("is-chon"),
  }));
  assert.deepEqual(state, {
    controlGroups: 1,
    buttons2d: 1,
    buttons3d: 1,
    nestedMaps: 0,
    canvas: true,
    selected3d: true,
  });
} finally {
  await browser.close();
}

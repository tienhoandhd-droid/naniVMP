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

if (!URL_SB) throw new Error("Không tìm thấy Supabase URL công khai cho reduced-motion E2E");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

try {
  const page = await browser.newPage();
  await caiGiaLap(page, {
    supabaseUrl: URL_SB,
    kichBan: "day",
    mangNghiemNgat: true,
    previewOrigin: GOC,
  });
  await nhetPhien(page, { supabaseUrl: URL_SB });
  await page.setViewport({ width: 1400, height: 1000 });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.goto(`${GOC}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("main .vmp-view-enter", { timeout: 15_000 });
  await page.waitForSelector("main .card", { timeout: 15_000 });
  await page.waitForSelector("main button.vmp-lift", { timeout: 15_000 });

  const route = await page.$("main .vmp-view-enter");
  assert.ok(route, "Không tìm thấy khung route");
  assert.deepEqual(await route.evaluate((node) => {
    const style = getComputedStyle(node);
    return { animationName: style.animationName, opacity: style.opacity };
  }), { animationName: "none", opacity: "1" });

  const staticCard = await page.$("main .card");
  assert.ok(staticCard, "Không tìm thấy thẻ tĩnh");
  await staticCard.hover();
  assert.deepEqual(await staticCard.evaluate((node) => {
    const style = getComputedStyle(node);
    return { transform: style.transform, transitionDuration: style.transitionDuration };
  }), { transform: "none", transitionDuration: "0s" });

  const action = await page.$("main button.vmp-lift");
  assert.ok(action, "Không tìm thấy hành động native có vmp-lift");
  await action.hover();
  assert.deepEqual(await action.evaluate((node) => {
    const style = getComputedStyle(node);
    return { transform: style.transform, transitionDuration: style.transitionDuration };
  }), { transform: "none", transitionDuration: "0s" });

  const infiniteAnimations = await page.evaluate(() => document.getAnimations()
    .filter((animation) => animation.constructor.name === "CSSAnimation")
    .filter((animation) => animation.playState === "running" && animation.effect?.getTiming().iterations === Infinity)
    .map((animation) => animation.animationName));
  assert.deepEqual(infiniteAnimations, []);

  console.log("✓ Reduced motion vào trạng thái cuối ngay và không giữ CSS animation vô hạn");
} finally {
  await browser.close();
}

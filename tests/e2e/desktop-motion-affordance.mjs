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

if (!URL_SB) throw new Error("Không tìm thấy Supabase URL công khai cho motion E2E");

async function moTongQuan(page, reducedMotion = false) {
  await caiGiaLap(page, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(page, { supabaseUrl: URL_SB });
  await page.setViewport({ width: 1366, height: 768 });
  if (reducedMotion) {
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  }
  await page.goto(`${GOC}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("main .card", { timeout: 15_000 });
  await page.waitForSelector("main button.vmp-lift", { timeout: 15_000 });
}

async function hoverTransform(page, selector) {
  const element = await page.$(selector);
  assert.ok(element, `Không tìm thấy ${selector}`);
  await element.hover();
  await new Promise((resolve) => setTimeout(resolve, 120));
  return element.evaluate((node) => getComputedStyle(node).transform);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

try {
  const page = await browser.newPage();
  await moTongQuan(page);

  const staticCard = await page.$("main .card");
  assert.ok(staticCard, "Không tìm thấy thẻ tĩnh để kiểm tra affordance");
  await staticCard.hover();
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(await staticCard.evaluate((node) => getComputedStyle(node).transform), "none");
  assert.equal(await staticCard.evaluate((node) => getComputedStyle(node).willChange), "auto");

  assert.notEqual(await hoverTransform(page, "main button.vmp-lift"), "none");
  assert.equal(await page.$eval("main button.vmp-lift", (node) => getComputedStyle(node).willChange), "auto");
  assert.equal(await page.$eval(".vmp-sidebar", (node) => getComputedStyle(node).transitionDuration), "0s");
  assert.equal(await page.$eval(":root", (node) => getComputedStyle(node).getPropertyValue("--mo-base").trim()), "");

  const reduced = await browser.newPage();
  await moTongQuan(reduced, true);
  assert.equal(await hoverTransform(reduced, "main button.vmp-lift"), "none");
  const route = await reduced.$("main .vmp-view-enter");
  assert.ok(route, "Không tìm thấy khung route để kiểm tra reduced motion");
  const reducedRoute = await route.evaluate((node) => {
    const style = getComputedStyle(node);
    return { animationName: style.animationName, opacity: style.opacity };
  });
  assert.equal(reducedRoute.animationName, "none");
  assert.equal(reducedRoute.opacity, "1");
  await reduced.close();

  console.log("✓ Motion desktop chỉ nâng phần tử tương tác và reduced-motion giữ trạng thái cuối");
} finally {
  await browser.close();
}

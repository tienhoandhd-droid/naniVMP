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

if (!URL_SB) throw new Error("Không tìm thấy Supabase URL công khai cho toast lifecycle E2E");

async function clickExact(page, selector, label) {
  const clicked = await page.$$eval(selector, (nodes, expected) => {
    const button = nodes.find((node) => node.textContent?.trim() === expected);
    if (!(button instanceof HTMLElement)) return false;
    button.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Không tìm thấy ${selector} có nhãn “${label}”`);
}

async function createRecoveryToast(page) {
  await page.waitForSelector("main .pr-nut-chinh:not([disabled])", { timeout: 15_000 });
  await page.click("main .pr-nut-chinh:not([disabled])");
  await page.waitForSelector('[role="dialog"]');
  await clickExact(page, '[role="dialog"] button', "⊘ Không áp dụng");
  await page.type('[role="dialog"] input[placeholder^="VD: thiết bị"]', "Kiểm tra vòng đời toast");
  await clickExact(page, '[role="dialog"] button', "Xác nhận");
  await page.waitForSelector('.vmp-toast[data-vmp-toast="loi"] .vmp-toast__hanh-dong');
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

try {
  const page = await browser.newPage();
  let stateRequests = 0;
  await caiGiaLap(page, {
    supabaseUrl: URL_SB,
    kichBan: "day",
    suaKho: (store) => {
      store.rpc_errors = {
        rpc_set_item_state: { status: 500, message: "Lỗi thử toast owner" },
      };
    },
  });
  page.on("request", (request) => {
    if (request.url().includes("/rpc/rpc_set_item_state") && request.method() !== "OPTIONS") {
      stateRequests += 1;
    }
  });
  await nhetPhien(page, { supabaseUrl: URL_SB });
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(`${GOC}#v=progress`, { waitUntil: "domcontentloaded", timeout: 30_000 });

  await createRecoveryToast(page);
  const beforeNavigation = stateRequests;
  await page.evaluate(() => { location.hash = "#v=alerts"; });
  await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get("v") === "alerts");
  await page.waitForFunction(() => !document.querySelector(".vmp-toast"), { timeout: 2_000 });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(stateRequests, beforeNavigation,
    "navigation phải thu hồi callback, không được tự chạy recovery của owner đã unmount");

  await page.evaluate(() => { location.hash = "#v=progress"; });
  await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get("v") === "progress");
  await createRecoveryToast(page);
  const beforeDoubleClick = stateRequests;
  await page.$eval('.vmp-toast[data-vmp-toast="loi"] .vmp-toast__hanh-dong', (button) => {
    button.click();
    button.click();
  });
  await page.waitForFunction((before) => window.performance.getEntriesByType("resource")
    .filter((entry) => entry.name.includes("/rpc/rpc_set_item_state")).length >= before + 1,
  {}, beforeDoubleClick);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(stateRequests, beforeDoubleClick + 1,
    "recovery action phải consume đúng một lần dù nhận hai click liền nhau");

  await page.waitForSelector('.vmp-toast[data-vmp-toast="loi"] .vmp-toast__tat');
  await page.click('.vmp-toast[data-vmp-toast="loi"] .vmp-toast__tat');
  await page.waitForFunction(() => !document.querySelector(".vmp-toast"), { timeout: 2_000 });
} finally {
  await browser.close();
}

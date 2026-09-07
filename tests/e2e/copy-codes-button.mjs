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

async function openReports(page, clipboard) {
  await page.evaluateOnNewDocument((mode) => {
    if (mode === "missing") {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
      return;
    }
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => {
        if (mode === "denied") throw new DOMException("Denied", "NotAllowedError");
        window.__vmpCopied = text;
      } },
    });
  }, clipboard);
  await caiGiaLap(page, { supabaseUrl, kichBan: "day", mangNghiemNgat: true, previewOrigin: APP_URL });
  await nhetPhien(page, { supabaseUrl });
  await page.goto(`${APP_URL}#v=reports`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => button.textContent?.trim().startsWith("Nhận xét & AI")), { timeout: 15_000 });
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim().startsWith("Nhận xét & AI"))?.click());
  await page.waitForSelector('button[type="button"]', { timeout: 5_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => button.textContent?.trim() === "Sao chép nhận xét"), { timeout: 5_000 });
}

async function openRoute(page, route, clipboard) {
  await page.evaluateOnNewDocument((mode) => {
    if (mode === "missing") {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
      return;
    }
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new DOMException("Denied", "NotAllowedError"); } },
    });
  }, clipboard);
  await caiGiaLap(page, { supabaseUrl, kichBan: "day", mangNghiemNgat: true, previewOrigin: APP_URL });
  await nhetPhien(page, { supabaseUrl });
  await page.goto(`${APP_URL}#v=${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
}

async function assertManualFallback(page, labelPattern) {
  await page.waitForFunction(() => document.body.innerText.includes("Không sao chép được. Hãy chọn và sao chép thủ công."));
  const fallback = await page.$eval("textarea[aria-label$=': sao chép thủ công']", (node) => ({
    label: node.getAttribute("aria-label"), readOnly: node.readOnly, value: node.value,
  }));
  assert.match(fallback.label || "", labelPattern);
  assert.equal(fallback.readOnly, true, "manual fallback must be read-only");
  assert.ok(fallback.value.length > 0, "manual fallback must expose the copy text");
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

try {
  const success = await browser.newPage();
  await openReports(success, "success");
  await success.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Sao chép nhận xét")?.click());
  await success.waitForFunction(() => document.body.innerText.includes("Đã chép ✓"));
  assert.match(await success.evaluate(() => window.__vmpCopied), /^- /,
    "successful copy must send the report comments to Clipboard API");
  await success.close();

  const denied = await browser.newPage();
  await openReports(denied, "denied");
  await denied.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Sao chép nhận xét")?.click());
  await denied.waitForFunction(() => document.body.innerText.includes("Không sao chép được. Hãy chọn và sao chép thủ công."));
  const fallback = await denied.$eval('textarea[aria-label="Sao chép nhận xét: sao chép thủ công"]', (node) => ({
    readOnly: node.readOnly,
    value: node.value,
  }));
  assert.equal(fallback.readOnly, true, "denied copy must expose a read-only manual-copy fallback");
  assert.match(fallback.value, /^- /, "manual-copy fallback must contain the report comments");
  await denied.close();

  const health = await browser.newPage();
  await openRoute(health, "health", "denied");
  await health.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => button.textContent?.trim() === "Lỗi trên bản đang xem"), { timeout: 15_000 });
  await health.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Lỗi trên bản đang xem")?.click());
  await health.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => button.textContent?.trim() === "Mở hết"), { timeout: 5_000 });
  await health.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Mở hết")?.click());
  await health.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => /^Sao chép \d+ mã$/.test(button.textContent?.trim() || "")), { timeout: 5_000 });
  await health.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => /^Sao chép \d+ mã$/.test(button.textContent?.trim() || ""))?.click());
  await assertManualFallback(health, /^Sao chép \d+ mã: sao chép thủ công$/);
  await health.close();

  const workload = await browser.newPage();
  await openRoute(workload, "workload", "missing");
  await workload.waitForSelector("[data-workload-detail-trigger]", { timeout: 15_000 });
  await workload.click("[data-workload-detail-trigger]");
  await workload.waitForSelector('[role="dialog"]', { timeout: 5_000 });
  await workload.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')]
    .some((button) => /^Chép \d+ mã$/.test(button.textContent?.trim() || "")), { timeout: 5_000 });
  await workload.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')]
    .find((button) => /^Chép \d+ mã$/.test(button.textContent?.trim() || ""))?.click());
  await assertManualFallback(workload, /^Chép \d+ mã: sao chép thủ công$/);
  await workload.close();

  console.log("PASS CopyCodesButton: browser success plus Reports, Health, and Workload manual fallbacks");
} finally {
  await browser.close();
}

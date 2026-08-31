import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || (() => {
  try {
    const env = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
    return env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
  } catch {
    const assets = new URL("../../dist/assets/", import.meta.url);
    for (const name of readdirSync(fileURLToPath(assets))) {
      if (!name.endsWith(".js")) continue;
      const match = readFileSync(fileURLToPath(new URL(name, assets)), "utf8")
        .match(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
      if (match) return match[0];
    }
    return undefined;
  }
})();

if (!supabaseUrl) throw new Error("Không tìm thấy Supabase URL công khai cho E2E CTA desktop");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

try {
  const page = await browser.newPage();
  await caiGiaLap(page, { supabaseUrl, kichBan: "day" });
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1366, height: 768 });

  await page.goto(`${GOC}#v=today`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("button.hn-hero__cta", { timeout: 15_000 });
  const today = await page.$eval("button.hn-hero__cta", (button) => ({
    label: button.textContent?.trim(),
    top: button.getBoundingClientRect().top,
  }));
  assert.match(today.label, /^Cập nhật /u);
  assert.ok(today.top < 768, JSON.stringify(today));

  await page.goto(`${GOC}#v=progress`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".pr-uu-tien--dau", { timeout: 15_000 });
  const progress = await page.$eval(".pr-uu-tien--dau", (button) => ({
    label: button.textContent?.trim(),
    top: button.getBoundingClientRect().top,
  }));
  assert.match(progress.label, /^(Cập nhật|Xem) /u);
  assert.ok(progress.top < 768, JSON.stringify(progress));

  await page.goto(`${GOC}#v=reports`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".vmp-report-export-actions button", { timeout: 15_000 });
  const reports = await page.$$eval(".vmp-report-export-actions button", (buttons) => buttons.map((button) => {
    const style = getComputedStyle(button);
    const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
    const verticalPadding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
    return {
      label: button.textContent?.trim(),
      wraps: button.scrollHeight > Math.ceil(lineHeight + verticalPadding + 1),
      top: button.getBoundingClientRect().top,
    };
  }));
  assert.deepEqual(reports.map(({ label }) => label), ["In / lưu PDF", "Tải Excel · 5 sheet", "Tải HTML"]);
  assert.ok(reports.every(({ wraps }) => !wraps), JSON.stringify(reports));
  assert.ok(reports[0].top < 768, JSON.stringify(reports));

  console.log("✓ CTA desktop nói rõ đích đến, vào fold và export không xuống dòng");
} finally {
  await browser.close();
}

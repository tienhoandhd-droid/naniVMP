import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || readFileSync(
  fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8",
).match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const downloadDir = mkdtempSync(join(tmpdir(), "vmp-reports-download-"));

assert.ok(supabaseUrl, "test requires public mock endpoint");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const client = await browser.target().createCDPSession();
await client.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir, eventsEnabled: true });

async function waitForDownload(extension) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const names = readdirSync(downloadDir);
    const found = names.find((name) => name.endsWith(extension) && !name.endsWith(".crdownload"));
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`No ${extension} download in ${downloadDir}: ${JSON.stringify(readdirSync(downloadDir))}`);
}

try {
  const page = await browser.newPage();
  await caiGiaLap(page, { supabaseUrl, kichBan: "day", mangNghiemNgat: true, previewOrigin: APP_URL });
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}#v=reports`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".vmp-report-export-actions", { timeout: 15_000 });

  await page.click('.vmp-report-export-actions button:first-child');
  const excel = await waitForDownload(".xlsx");
  assert.match(excel, /^BaoCaoQuanLy_VMP_.*\.xlsx$/, "Excel action must download the management workbook");

  await page.click('.vmp-report-export-actions button:last-child');
  const html = await waitForDownload(".html");
  assert.match(html, /^BaoCaoQuanLy_VMP_.*\.html$/, "HTML action must download the management report");

  await page.evaluateOnNewDocument(() => {
    window.__vmpFrameWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", { configurable: true, get: () => null });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".vmp-report-export-actions", { timeout: 15_000 });
  await page.click('.vmp-report-export-actions button:nth-child(2)');
  await page.waitForFunction(() => document.body.innerText.includes("Không mở được hộp in báo cáo"), { timeout: 5_000 });
  assert.equal(await page.$("iframe"), null, "print setup failure must remove its temporary iframe");

  await page.evaluate(() => {
    const original = document.createElement.bind(document);
    window.__vmpCreate = original;
    document.createElement = (name, options) => {
      if (name === "iframe") throw new Error("Fixture setup failure");
      return original(name, options);
    };
  });
  await page.click('.vmp-report-export-actions button:nth-child(2)');
  await page.waitForFunction(() => !document.querySelector('.vmp-report-export-actions button:nth-child(2)').disabled);
  assert.equal(await page.$("iframe"), null, "setup exception must clean up and unlock print");
  await page.evaluate(() => {
    document.createElement = window.__vmpCreate;
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      configurable: true,
      get() {
        const win = window.__vmpFrameWindow.get.call(this);
        if (win) win.print = () => { window.__vmpPrintCalled = true; win.dispatchEvent(new Event("afterprint")); };
        return win;
      },
    });
  });
  await page.click('.vmp-report-export-actions button:nth-child(2)');
  await page.waitForFunction(() => window.__vmpPrintCalled === true);
  await page.waitForFunction(() => !document.querySelector("iframe") && !document.querySelector('.vmp-report-export-actions button:nth-child(2)').disabled);

  console.log(`PASS Reports exports: ${excel}, ${html}; print failure/retry and print invocation clean up iframe`);
} finally {
  await browser.close();
}

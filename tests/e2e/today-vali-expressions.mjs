import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:5199/";
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

if (!supabaseUrl) throw new Error("Không tìm thấy Supabase URL công khai cho E2E Vali");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

try {
  const page = await browser.newPage();
  await caiGiaLap(page, { supabaseUrl, kichBan: "day" });
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}#v=today`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() =>
    document.querySelector('.hn-vali[aria-label="Công chúa Vali rất lo"]'), { timeout: 15_000 });

  const result = await page.$eval(".hn-vali", async (element) => {
    const backgroundImage = getComputedStyle(element).backgroundImage;
    const url = backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1] ?? "";
    const image = new Image();
    image.src = url;
    await image.decode();
    return {
      className: element.className,
      label: element.getAttribute("aria-label"),
      role: element.getAttribute("role"),
      backgroundImage,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    };
  });

  if (result.role !== "img" || result.label !== "Công chúa Vali rất lo"
    || !result.className.includes("hn-vali--urgent")) {
    throw new Error(`trạng thái Vali: ${JSON.stringify(result)}`);
  }
  if (!result.backgroundImage.includes("vali-chibi-urgent")
    || result.naturalWidth <= 0 || result.naturalHeight <= 0) {
    throw new Error(`tài nguyên Vali: ${JSON.stringify(result)}`);
  }

  if (process.env.VMP_E2E_SCREENSHOT) {
    await page.screenshot({ path: process.env.VMP_E2E_SCREENSHOT, fullPage: true });
  }

  console.log("✓ Vali hiển thị đúng biểu cảm rất lo và tải được ảnh mới trên màn Hôm nay");
} finally {
  await browser.close();
}

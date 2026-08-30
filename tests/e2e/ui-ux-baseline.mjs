import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:5199/";
const root = fileURLToPath(new URL("../../", import.meta.url));
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || (() => {
  try {
    const env = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
    return env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
  } catch {
    /* Máy local có thể khóa ACL của .env.local. URL Supabase là endpoint công
       khai đã được Vite nhúng vào bundle, nên E2E chỉ đọc lại URL (không đọc key). */
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
if (!supabaseUrl) throw new Error(`Không tìm thấy Supabase URL công khai trong ${root}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage();
  await caiGiaLap(page, { supabaseUrl, kichBan: "day" });
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".vmp-overview-progress__row", { timeout: 15_000 });

  const shell = await page.evaluate(() => {
    const skip = document.querySelector('.vmp-skip-link[href="#vmp-main-content"]');
    const main = document.querySelector("#vmp-main-content");
    const nav = document.querySelector(".vmp-sidebar nav");
    const progress = document.querySelector(".vmp-overview-progress");
    const row = document.querySelector(".vmp-overview-progress__row");
    const artOpacity = getComputedStyle(main, "::before").opacity;
    skip.focus();
    const skipFocused = document.activeElement === skip;
    const hashBeforeSkip = location.hash;
    skip.click();
    return {
      skipFocused,
      skipMovedFocus: document.activeElement === main,
      skipKeptRoute: location.hash === hashBeforeSkip,
      mainFocusable: main?.getAttribute("tabindex") === "-1",
      navLabel: nav?.getAttribute("aria-label"),
      progressWidth: progress?.getBoundingClientRect().width ?? 0,
      rowColumns: row ? getComputedStyle(row).gridTemplateColumns : "",
      artOpacity,
    };
  });

  if (!shell.skipFocused || !shell.skipMovedFocus || !shell.skipKeptRoute
    || !shell.mainFocusable || shell.navLabel !== "Điều hướng chính") {
    throw new Error(`landmarks: ${JSON.stringify(shell)}`);
  }
  if (shell.progressWidth <= 0 || shell.progressWidth > 481 || !shell.rowColumns.includes("px")) {
    throw new Error(`progress: ${JSON.stringify(shell)}`);
  }
  if (shell.artOpacity !== "0.32") throw new Error(`opacity tranh nền: ${shell.artOpacity}`);

  await page.click(".vmp-chat-fab");
  await page.waitForSelector('.vmp-chat-panel[role="dialog"]');
  const chatOpen = await page.evaluate(() => {
    const dialog = document.querySelector(".vmp-chat-panel");
    return {
      modal: dialog?.getAttribute("aria-modal"),
      labelledBy: dialog?.getAttribute("aria-labelledby"),
      focusedControl: document.activeElement?.getAttribute("aria-label"),
    };
  });
  if (chatOpen.modal !== "false" || chatOpen.labelledBy !== "vmp-chat-title"
    || chatOpen.focusedControl !== "Nội dung câu hỏi") {
    throw new Error(`chat mở: ${JSON.stringify(chatOpen)}`);
  }

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".vmp-chat-panel"));
  const focusReturned = await page.evaluate(() =>
    document.activeElement?.getAttribute("aria-label") === "Trò chuyện cùng công chúa Vali");
  if (!focusReturned) throw new Error("đóng ChatBox chưa trả focus về nút mở");

  if (process.env.VMP_E2E_SCREENSHOT) {
    await page.screenshot({ path: process.env.VMP_E2E_SCREENSHOT, fullPage: true });
  }

  console.log("✓ shell, dashboard và ChatBox đạt hợp đồng UI/UX sơ bộ");
} finally {
  await browser.close();
}

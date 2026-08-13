import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { CHROME } from "./chrome-path.mjs";

const GOC = process.env.E2E_URL || "http://localhost:4173";
const EXPECT_UNCONFIGURED = process.env.E2E_EXPECT_UNCONFIGURED === "1";
await choServer(GOC);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(GOC, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#vmp-login-email");
  if (EXPECT_UNCONFIGURED) {
    await page.waitForFunction(() => document.body.innerText.includes("Chế độ tạm (chưa có Supabase)"));
  }
  const geometry = await page.evaluate(() => {
    const button = document.querySelector('button[type="submit"]');
    const rect = button.getBoundingClientRect();
    return { bottom: rect.bottom, viewport: innerHeight, scrollWidth: document.documentElement.scrollWidth };
  });
  if (geometry.bottom > geometry.viewport || geometry.scrollWidth > 390) throw new Error(JSON.stringify(geometry));

  await page.click('button[type="submit"]');
  await page.waitForFunction(() => document.body.innerText.includes("Vui lòng nhập email"));

  if (EXPECT_UNCONFIGURED) {
    await page.locator("#vmp-login-email").fill("qa@example.com");
    await page.locator("#vmp-login-password").fill("password");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => document.body.innerText.includes("Liên hệ IT để thiết lập"));
  }
} finally {
  await browser.close();
}

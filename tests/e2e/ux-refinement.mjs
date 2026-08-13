import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { CHROME } from "./chrome-path.mjs";
import { dangNhap } from "./dang-nhap.mjs";

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
  } else {
    await dangNhap(page, GOC);

    await page.setViewport({ width: 390, height: 844 });
    await page.waitForSelector('[aria-label="Mở menu"]');
    await page.click('[aria-label="Mở menu"]');
    await page.waitForSelector("#vmp-mobile-drawer");
    const drawerText = await page.$eval("#vmp-mobile-drawer", (el) => el.textContent || "");
    if (!drawerText.includes("Thoát") || !drawerText.includes("Mật khẩu")) throw new Error(drawerText);
    await page.waitForFunction(() => {
      const drawer = document.querySelector("#vmp-mobile-drawer");
      return !!drawer?.contains(document.activeElement);
    });
    const drawerA11y = await page.evaluate(() => {
      const drawer = document.querySelector("#vmp-mobile-drawer");
      const main = document.querySelector("main");
      return {
        focusInDrawer: !!drawer?.contains(document.activeElement),
        rootInert: document.querySelector("#root")?.hasAttribute("inert") || false,
        bodyOverflow: getComputedStyle(document.body).overflow,
        mainOverflow: main ? getComputedStyle(main).overflowY : "",
      };
    });
    if (!drawerA11y.focusInDrawer || !drawerA11y.rootInert
      || drawerA11y.bodyOverflow !== "hidden" || drawerA11y.mainOverflow !== "hidden") {
      throw new Error(JSON.stringify(drawerA11y));
    }
    await page.keyboard.down("Shift");
    await page.keyboard.press("Tab");
    await page.keyboard.up("Shift");
    const trapLast = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (trapLast !== "Thoát") throw new Error(`focus cuối drawer: ${trapLast}`);
    await page.keyboard.press("Tab");
    const trapFirst = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    if (trapFirst !== "Đóng menu") throw new Error(`focus đầu drawer: ${trapFirst}`);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#vmp-mobile-drawer")
      && document.activeElement?.getAttribute("aria-label") === "Mở menu");
    const focusAfterEscape = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    if (focusAfterEscape !== "Mở menu") throw new Error(`focus: ${focusAfterEscape}`);

    await page.click('[aria-label="Mở menu"]');
    await page.evaluate(() => document.querySelector(".vmp-mobile-drawer-backdrop")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await page.waitForFunction(() => !document.querySelector("#vmp-mobile-drawer")
      && document.activeElement?.getAttribute("aria-label") === "Mở menu");

    await page.click('[aria-label="Mở menu"]');
    await page.click("#vmp-mobile-drawer .vmp-mobile-drawer-account-action");
    await page.waitForFunction(() => !document.querySelector("#vmp-mobile-drawer"));
    await page.waitForSelector('input[placeholder="Mật khẩu mới"]');
    const passwordFocus = await page.evaluate(() => document.activeElement?.getAttribute("placeholder"));
    if (passwordFocus !== "Mật khẩu mới") throw new Error(`focus mật khẩu: ${passwordFocus}`);
    await page.evaluate(() => document.querySelector('body > div[style*="position: fixed"] button')?.click());
    await page.waitForFunction(() => !document.querySelector('input[placeholder="Mật khẩu mới"]'));

    await page.click('[aria-label="Mở menu"]');
    await page.click('#vmp-mobile-drawer [data-view="timeline"]');
    await page.waitForFunction(() => !document.querySelector("#vmp-mobile-drawer"));
    const focusAfterNavigation = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    if (focusAfterNavigation === "Mở menu") throw new Error("đổi màn không được trả focus về opener");

    await page.setViewport({ width: 390, height: 844 });
    await page.click('[aria-label="Mở menu"]');
    await page.setViewport({ width: 1440, height: 900 });
    await page.waitForFunction(() => !document.querySelector("#vmp-mobile-drawer"));
    const hasDeadBell = await page.evaluate(() => [...document.querySelectorAll("button")]
      .some((b) => b.title === "Thông báo"));
    if (hasDeadBell) throw new Error("Nút Thông báo không hành động vẫn còn");

    const globalFilterLabel = await page.$eval('[aria-label="Phạm vi toàn hệ thống"]', (el) => el.textContent || "");
    if (!globalFilterLabel.includes("Phạm vi toàn hệ thống")) throw new Error(globalFilterLabel);

    await page.goto(`${GOC}#v=overview`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".vmp-bento");
    await page.waitForSelector(".b-k1 button");
    const hashBeforeKeyboardCta = await page.evaluate(() => location.hash);
    await page.focus(".b-k1 button");
    await page.keyboard.press("Enter");
    await page.waitForFunction((before) => location.hash !== before, {}, hashBeforeKeyboardCta);

    await page.goto(`${GOC}#v=overview`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('main');
    await page.waitForSelector(".vmp-bento");
    const beforeScrollNavigation = await page.evaluate(() => {
      const main = document.querySelector("main");
      main?.scrollTo({ top: 600 });
      return main?.scrollTop || 0;
    });
    if (beforeScrollNavigation <= 0) throw new Error(`scroll trước điều hướng: ${beforeScrollNavigation}`);
    await page.click('[data-view="timeline"]');
    await page.waitForFunction(() => document.querySelector("main").scrollTop === 0);
  }
} finally {
  await browser.close();
}

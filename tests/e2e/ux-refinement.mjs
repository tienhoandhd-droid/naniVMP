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
    await page.waitForSelector("#vmp-mobile-drawer .vmp-mobile-drawer-account-action", { timeout: 5000 });
    await page.click("#vmp-mobile-drawer .vmp-mobile-drawer-account-action");
    await page.waitForFunction(() => !document.querySelector("#vmp-mobile-drawer"));
    /* Ô mật khẩu KHÔNG dùng placeholder — chúng có nhãn thật bọc ngoài, nên
       bám vào nhãn chứ đừng bám placeholder (bản trước bám placeholder và
       bộ kiểm hỏng âm thầm suốt từ lúc form đổi sang nhãn thật). */
    await page.waitForSelector("input[type=password]");
    /* CHỜ THEO ĐIỀU KIỆN, không đọc activeElement ngay: hộp thoại đặt tiêu
       điểm ở khung hình kế tiếp (requestAnimationFrame), nên đọc tức thì
       luôn thấy BODY và phép kiểm đỏ oan. */
    await page.waitForFunction(() => {
      const el = document.activeElement;
      return el?.tagName === "INPUT" && el.getAttribute("type") === "password";
    }, { timeout: 5000 }).catch(() => {});
    const oDau = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.tagName === "INPUT" && el.getAttribute("type") === "password"
        ? (el.closest("label")?.textContent?.trim() ?? "").slice(0, 20)
        : `khong-phai-o-nhap:${el?.tagName}`;
    });
    // Mở hộp có form thì con trỏ phải nằm ở ô ĐẦU TIÊN, không phải nút đóng:
    // người dùng bàn phím mở hộp ra là gõ được ngay.
    if (!oDau.startsWith("Mật khẩu hiện tại")) throw new Error(`focus mật khẩu: ${oDau}`);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("input[type=password]"));

    await page.click('[aria-label="Mở menu"]');
    // Chờ ngăn kéo mount xong rồi mới bấm: `page.click` không tự chờ, và sau
    // khi đóng hộp thoại bằng Escape thì nhịp vẽ lại lệch đi một khung.
    await page.waitForSelector('#vmp-mobile-drawer [data-view="timeline"]', { timeout: 5000 });
    await page.click('#vmp-mobile-drawer [data-view="timeline"]');
    await page.waitForFunction(() => !document.querySelector("#vmp-mobile-drawer"));
    const focusAfterNavigation = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    if (focusAfterNavigation === "Mở menu") throw new Error("đổi màn không được trả focus về opener");

    await page.goto(`${GOC}#v=reports`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".vmp-report-export-actions");
    await page.waitForSelector(".vmp-chat-fab");
    await page.waitForSelector(".vmp-table-hint b");
    const tableHintContrast = await page.$eval(".vmp-table-hint b", (el) => {
      const parts = (value) => value.match(/\d+(?:\.\d+)?/g).map(Number);
      const rgb = (value) => parts(value).slice(0, 3);
      const luminance = ([r, g, b]) => [r, g, b].map((channel) => {
        const v = channel / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      const foreground = rgb(getComputedStyle(el).color);
      let node = el.parentElement;
      let background = [255, 255, 255];
      while (node) {
        const style = getComputedStyle(node);
        const color = parts(style.backgroundColor);
        if (color.length === 3 || color[3] > 0.99) { background = color.slice(0, 3); break; }
        node = node.parentElement;
      }
      const a = luminance(foreground); const b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    if (tableHintContrast < 4.5) throw new Error(`tương phản Shift table hint: ${tableHintContrast.toFixed(2)}:1`);
    const mobileCommands = await page.evaluate(() => {
      const exports = document.querySelector(".vmp-report-export-actions");
      const fab = document.querySelector(".vmp-chat-fab");
      const exportRect = exports.getBoundingClientRect();
      const fabRect = fab.getBoundingClientRect();
      return {
        exportRight: exportRect.right,
        fabPosition: getComputedStyle(fab).position,
        fabRight: fabRect.right,
      };
    });
    if (mobileCommands.fabPosition !== "static" || mobileCommands.exportRight > 390
      || mobileCommands.fabRight > 390) throw new Error(JSON.stringify(mobileCommands));

    await page.click(".vmp-chat-fab");
    await page.waitForSelector(".vmp-chat-panel");
    const mobileChat = await page.evaluate(() => {
      const exports = document.querySelector(".vmp-report-export-actions");
      const panel = document.querySelector(".vmp-chat-panel");
      const exportRect = exports.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      return {
        panelPosition: getComputedStyle(panel).position,
        panelTop: panelRect.top,
        exportBottom: exportRect.bottom,
        panelRight: panelRect.right,
      };
    });
    if (mobileChat.panelPosition !== "static" || mobileChat.panelTop < mobileChat.exportBottom
      || mobileChat.panelRight > 390) throw new Error(JSON.stringify(mobileChat));

    await page.click('.vmp-chat-panel button[title="Đóng"]');
    await page.waitForFunction(() => !document.querySelector(".vmp-chat-panel"));

    await page.setViewport({ width: 390, height: 844 });
    await page.click('[aria-label="Mở menu"]');
    await page.setViewport({ width: 1440, height: 900 });
    await page.waitForFunction(() => !document.querySelector("#vmp-mobile-drawer"));
    const hasDeadBell = await page.evaluate(() => [...document.querySelectorAll("button")]
      .some((b) => b.title === "Thông báo"));
    if (hasDeadBell) throw new Error("Nút Thông báo không hành động vẫn còn");

    /* 30/08: thanh lọc đầy đủ chỉ còn ở nhóm GIÁM SÁT; nhóm THỰC HIỆN và
       PHÂN TÍCH dùng bản gọn (không nhãn phạm vi, không nút Bộ lọc). */
    await page.goto(`${GOC}#v=overview`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-global-filter]');
    const globalFilter = await page.$eval('[data-global-filter]', (el) => ({
      ariaLabel: el.getAttribute("aria-label") || "",
      text: el.innerText || "",
    }));
    if (globalFilter.ariaLabel !== "Bộ lọc dữ liệu: đang xem tất cả") throw new Error(globalFilter.ariaLabel);
    for (const expectedText of ["Bộ lọc dữ liệu", "Tất cả dữ liệu", "Thay đổi"]) {
      if (!globalFilter.text.includes(expectedText)) throw new Error(globalFilter.text);
    }

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

    const legacy3d = await page.evaluate(() => ({
      canvas: Boolean(document.querySelector('canvas[data-engine^="three"]')),
      controls: Boolean(document.querySelector('[data-map-mode="3d"], [data-testid="workload-map-3d"]')),
    }));
    if (legacy3d.canvas || legacy3d.controls) throw new Error(`3D đã bỏ nhưng còn runtime: ${JSON.stringify(legacy3d)}`);
  }
} finally {
  await browser.close();
}

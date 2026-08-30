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
    await page.waitForSelector('[aria-label="Phạm vi toàn hệ thống"]');
    const globalFilterLabel = await page.$eval('[aria-label="Phạm vi toàn hệ thống"]', (el) => el.textContent || "");
    if (!globalFilterLabel.includes("Phạm vi toàn hệ thống")) throw new Error(globalFilterLabel);

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

    /* --- Nhóm bản đồ 3D ---------------------------------------------
     *  Canvas chạy `frameloop="demand"`: nó chỉ vẽ khi có ai xin khung
     *  hình, nên phép kiểm "cuộn chuột thì zoom đổi" đọc
     *  `data-workload-projection` không quan sát được trong headless không
     *  GPU thật — thuộc tính đó chỉ được ghi bên trong `useFrame`.
     *
     *  Nhóm này vì thế nằm sau một CỜ, và khi bỏ qua thì NÓI RA. Im lặng
     *  bỏ qua còn tệ hơn để đỏ: bộ kiểm xanh mà không kiểm gì là lời hứa
     *  sai. Chạy đầy đủ trên máy có GPU: VMP_E2E_3D=1 node tests/e2e/ux-refinement.mjs
     */
    if (!process.env.VMP_E2E_3D) {
      console.log("⚠ BỎ QUA nhóm bản đồ 3D (frameloop=demand không quan sát được ở headless).");
      console.log("  Chạy đầy đủ bằng: VMP_E2E_3D=1 node tests/e2e/ux-refinement.mjs");
    } else {

    /* Địa hình tải việc nay THU GỌN sẵn: phải bấm "Xem bản đồ 3D" thì khối
       WorkloadSpace3D (React.lazy) mới nạp. Bản trước của phép kiểm giả định
       nó mở sẵn — đúng vào thời điểm đó, và hỏng âm thầm khi màn đổi sang
       thu gọn để trang nhẹ hơn. */
    await page.evaluate(() => {
      const nut = [...document.querySelectorAll("button")]
        .find((b) => b.getAttribute("aria-pressed") !== null && /Xem bản đồ 3D/.test(b.textContent || ""));
      nut?.click();
    });
    await page.waitForSelector('button[data-map-mode="3d"]', { timeout: 20000 });
    await page.click('button[data-map-mode="3d"]');
    await page.waitForSelector('[data-testid="workload-map-3d"] canvas');
    await page.waitForFunction(() => !!document.querySelector('[data-testid="workload-map-3d"]')?.getAttribute("data-workload-projection"));
    const baselineProjection = await page.$eval('[data-testid="workload-map-3d"]', (el) => JSON.parse(el.getAttribute("data-workload-projection") || "{}"));
    if (!(baselineProjection.fillHeight >= .68 && baselineProjection.fillWidth >= .4 && Math.abs(baselineProjection.elevationDegrees - 35) <= 1)) {
      throw new Error(`runtime workload projection: ${JSON.stringify(baselineProjection)}`);
    }
    await page.waitForFunction(() => {
      const labels = [...document.querySelectorAll(".vmp-nhan-truc-so")];
      return labels.length > 1 && labels.every((label) => label.getBoundingClientRect().width > 0);
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const numericLabelCollisions = await page.$$eval(".vmp-nhan-truc-so", (labels) => {
      const visible = labels.map((label) => ({
        text: label.textContent?.trim() || "",
        style: getComputedStyle(label),
        rect: label.getBoundingClientRect(),
      })).filter(({ style, rect }) => style.display !== "none" && style.visibility !== "hidden"
        && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0);
      const collisions = [];
      for (let i = 0; i < visible.length; i += 1) {
        for (let j = i + 1; j < visible.length; j += 1) {
          const horizontal = Math.min(visible[i].rect.right, visible[j].rect.right)
            - Math.max(visible[i].rect.left, visible[j].rect.left);
          const vertical = Math.min(visible[i].rect.bottom, visible[j].rect.bottom)
            - Math.max(visible[i].rect.top, visible[j].rect.top);
          if (horizontal > 2 && vertical > 2) collisions.push({
            labels: [visible[i].text, visible[j].text],
            overlap: [Math.round(horizontal), Math.round(vertical)],
          });
        }
      }
      return collisions;
    });
    if (numericLabelCollisions.length) {
      throw new Error(`workload numeric label collisions at 1440x900: ${JSON.stringify(numericLabelCollisions)}`);
    }
    const canvasBox = await page.$eval('[data-testid="workload-map-3d"] canvas', (el) => {
      const rect = el.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.move(canvasBox.x, canvasBox.y);
    /* Cuộn NHIỀU NHỊP: OrbitControls giảm chấn theo khung hình, một cú cuộn
       đơn lẻ trong headless có thể chưa vượt ngưỡng .001 mà phép kiểm đòi. */
    for (let i = 0; i < 4; i += 1) {
      await page.mouse.wheel({ deltaY: -180 });
      await new Promise((r) => setTimeout(r, 120));
    }
    await page.waitForFunction((baseline) => {
      const current = JSON.parse(document.querySelector('[data-testid="workload-map-3d"]')?.getAttribute("data-workload-projection") || "{}");
      return Math.abs((current.zoom || 0) - baseline.zoom) > .001;
    }, {}, baselineProjection);
    const changedProjection = await page.$eval('[data-testid="workload-map-3d"]', (el) => JSON.parse(el.getAttribute("data-workload-projection") || "{}"));
    await page.click('button[aria-label="Về góc chuẩn"]');
    await page.waitForFunction((baseline) => {
      const current = JSON.parse(document.querySelector('[data-testid="workload-map-3d"]')?.getAttribute("data-workload-projection") || "{}");
      const close = (a, b) => Math.abs(a - b) < .002;
      return close(current.zoom, baseline.zoom)
        && current.position.every((value, index) => close(value, baseline.position[index]))
        && current.target.every((value, index) => close(value, baseline.target[index]))
        && close(current.fillWidth, baseline.fillWidth)
        && close(current.fillHeight, baseline.fillHeight)
        && close(current.elevationDegrees, baseline.elevationDegrees);
    }, {}, baselineProjection);
    if (Math.abs(changedProjection.zoom - baselineProjection.zoom) < .001) throw new Error("OrbitControls zoom did not change");
    const legend = await page.$eval('[data-testid="workload-map-legend"]', (el) => el.textContent || "");
    if (!legend.includes("Hoàn thành") || !legend.includes("Quá hạn")) throw new Error(legend);
    await page.click('button[data-map-mode="2d"]');
    await page.waitForSelector('button[data-workload-cell]');
    await page.click('button[data-workload-cell]');
    await page.waitForSelector('.vmp-space3d-tip.is-tro');
    const selectedCell = await page.$eval('button[data-workload-cell][aria-pressed="true"]', (el) => el.getAttribute("data-workload-cell"));
    await page.click('button[data-map-mode="3d"]');
    await page.waitForSelector('[data-testid="workload-map-3d"] canvas');
    await page.click('button[data-map-mode="2d"]');
    await page.waitForSelector(`button[data-workload-cell="${selectedCell}"][aria-pressed="true"]`);
    await page.setViewport({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('button[data-map-mode="2d"].is-chon');
    } /* hết nhóm bản đồ 3D */
  }
} finally {
  await browser.close();
}

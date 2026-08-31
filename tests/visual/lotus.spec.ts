/* =====================================================================
 *  lotus.spec.ts — chụp và so ảnh các màn chính (Atelier vòng 2)
 *  ---------------------------------------------------------------------
 *  Dùng CHUNG kho giả lập với bộ puppeteer (gia-lap-supabase.mjs) — cùng
 *  dữ liệu, cùng luật chặn mạng — nên ảnh chỉ đổi khi GIAO DIỆN đổi.
 *
 *  Ba chốt chống ảnh nhảy loạn:
 *    · page.clock đóng băng thời gian đúng mốc dữ liệu mẫu (15/08/2026)
 *      — đồng hồ topbar, "còn X ngày", watermark đều bất động.
 *    · reduced-motion + animations disabled — không chụp giữa chuyển động.
 *    · chỉ so với baseline CÙNG platform (xem config).
 * ===================================================================== */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { VISUAL_SCREENS, VISUAL_THEMES } from "../../scripts/visual-matrix-contract.mjs";

// Kho giả lập là ESM thuần — Playwright (esbuild) nhập được thẳng.
import { dungKhoDuLieu, phienGia, layRef, traLoi } from "../e2e/gia-lap-supabase.mjs";

const URL_SB = (() => {
  if (process.env.VMP_E2E_SUPABASE_URL) return process.env.VMP_E2E_SUPABASE_URL;
  try {
    const noi = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
    const url = noi.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
    if (url) return url;
  } catch {
    /* ACL local có thể chặn .env.local; tiếp tục dùng endpoint công khai trong bundle. */
  }
  try {
    const assets = new URL("../../dist/assets/", import.meta.url);
    for (const name of readdirSync(fileURLToPath(assets))) {
      if (!name.endsWith(".js")) continue;
      const noi = readFileSync(fileURLToPath(new URL(name, assets)), "utf8");
      const url = noi.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i)?.[0];
      if (url) return url;
    }
  } catch {
    /* Quy về lỗi cấu hình chung bên dưới, không lộ nội dung bundle. */
  }
  throw new Error("Không tìm thấy Supabase URL công khai cho kiểm thử visual");
})();

const MOC_THOI_GIAN = new Date("2026-08-15T10:00:00+07:00");

/* Font web nạp muộn làm chữ đổi metric giữa hai lần chụp — flake thật đã
 * gặp hai lần ở 1920 (title dịch ~6px, cả trang lệch theo). fonts.ready
 * là chưa đủ: nó chỉ đợi các request ĐÃ phát; weight phát sinh muộn vẫn
 * swap sau khi chụp. Ép nạp tường minh từng family × weight đang dùng. */
async function choFont(page: Page) {
  await page.evaluate(async () => {
    const can = [
      '400 14px "Be Vietnam Pro"', '500 14px "Be Vietnam Pro"',
      '600 14px "Be Vietnam Pro"', '700 14px "Be Vietnam Pro"',
      '800 14px "Be Vietnam Pro"', '900 14px "Be Vietnam Pro"',
      '500 32px "Cormorant Garamond"', '600 32px "Cormorant Garamond"',
      '700 32px "Cormorant Garamond"',
    ];
    await Promise.all(can.map((f) => document.fonts.load(f).catch(() => [])));
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

async function caiGiaLap(page: Page, che: "light" | "dark") {
  const kho = dungKhoDuLieu("day");
  const hostSupabase = new URL(URL_SB).host;

  await page.addInitScript(() => {
    (window as Window & { __REACT_GRAB_DISABLED__?: boolean }).__REACT_GRAB_DISABLED__ = true;
  });

  await page.route("**/*", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const noiBo = u.hostname === "127.0.0.1" || u.hostname === "localhost";
    if (noiBo || u.protocol === "data:") return route.continue();
    if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return route.continue();
    if (u.host === hostSupabase) {
      // Phỏng lại giao diện `req` của puppeteer mà traLoi() trông đợi.
      const gia = {
        method: () => req.method(),
        headers: () => req.headers(),
        postData: () => req.postData() ?? "",
      };
      const kq = traLoi(kho, u, gia);
      return route.fulfill({ status: kq.status, headers: kq.headers, body: kq.body });
    }
    return route.abort();
  });

  await page.addInitScript(([khoa, phien, cheDo]) => {
    localStorage.setItem(khoa as string, JSON.stringify(phien));
    localStorage.setItem("vmp-theme", cheDo as string);
  }, [`sb-${layRef(URL_SB)}-auth-token`, phienGia(), che]);

  await page.clock.setFixedTime(MOC_THOI_GIAN);
  await page.emulateMedia({ reducedMotion: "reduce" });
}

for (const che of VISUAL_THEMES as Array<"light" | "dark">) {
  for (const [hash, ten] of VISUAL_SCREENS) {
    test(`${ten} · ${che}`, async ({ page }) => {
      await caiGiaLap(page, che);
      await page.goto(`/#v=${hash}`);
      // Chờ dữ liệu giả lập đổ xong và mọi skeleton biến mất.
      await page.waitForTimeout(3000);
      await choFont(page);
      await expect(page).toHaveScreenshot(`${ten}-${che}.png`, { fullPage: true });
    });
  }
}

test("dang-nhap · light", async ({ page }) => {
  await caiGiaLap(page, "light");
  // Xoá phiên để thấy màn đăng nhập.
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.waitForTimeout(1500);
  await choFont(page);
  await expect(page).toHaveScreenshot("dang-nhap-light.png", { fullPage: true });
});

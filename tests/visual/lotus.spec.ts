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
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// Kho giả lập là ESM thuần — Playwright (esbuild) nhập được thẳng.
import { dungKhoDuLieu, phienGia, layRef, traLoi } from "../e2e/gia-lap-supabase.mjs";

const URL_SB = (() => {
  const noi = readFileSync(new URL("../../.env.local", import.meta.url).pathname, "utf8");
  const m = noi.match(/^VITE_SUPABASE_URL=(.+)$/m);
  if (!m) throw new Error(".env.local thiếu VITE_SUPABASE_URL");
  return m[1].trim();
})();

const MOC_THOI_GIAN = new Date("2026-08-15T10:00:00+07:00");

async function caiGiaLap(page: Page, che: "light" | "dark") {
  const kho = dungKhoDuLieu("day");
  const hostSupabase = new URL(URL_SB).host;

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

const MAN: Array<[string, string]> = [
  ["today", "hom-nay"],
  ["source", "danh-muc"],
  ["progress", "tien-do"],
  ["timeline", "timeline"],
  ["reports", "bao-cao"],
];

for (const che of ["light", "dark"] as const) {
  for (const [hash, ten] of MAN) {
    test(`${ten} · ${che}`, async ({ page }) => {
      await caiGiaLap(page, che);
      await page.goto(`/#v=${hash}`);
      // Chờ dữ liệu giả lập đổ xong và mọi skeleton biến mất.
      await page.waitForTimeout(3000);
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
  await expect(page).toHaveScreenshot("dang-nhap-light.png", { fullPage: true });
});

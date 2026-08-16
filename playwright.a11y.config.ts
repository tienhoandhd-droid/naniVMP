/* =====================================================================
 *  playwright.a11y.config.ts — cổng axe (nghiên cứu (3), đợt 3)
 *  Chạy trong with-preview như bộ visual; không chụp ảnh, chỉ quét axe.
 * ===================================================================== */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/a11y",
  timeout: 90_000,
  retries: 0,
  workers: 2,
  fullyParallel: true,
  use: {
    baseURL: process.env.VMP_E2E_URL || "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 900 },
    channel: process.env.CI ? undefined : "chrome",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});

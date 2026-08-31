/* =====================================================================
 *  playwright.visual.config.ts — visual regression (Atelier vòng 2)
 *  ---------------------------------------------------------------------
 *  Chạy TRONG with-preview (server đã sẵn ở 4173):
 *      bash scripts/with-preview.sh -- npm run visual
 *
 *  Baseline PIN THEO MÔI TRƯỜNG CI (linux) — quy định của hiến pháp
 *  Atelier: font rendering khác nhau giữa macOS và Linux nên chỉ có ảnh
 *  chụp cùng môi trường mới so được với nhau. Ảnh darwin (chạy máy dev)
 *  bị gitignore, chỉ dùng để xem tại chỗ. Cập nhật baseline linux bằng
 *  workflow "visual-baseline" (workflow_dispatch), không sửa tay.
 * ===================================================================== */
import { defineConfig } from "@playwright/test";
import { VISUAL_PROJECTS } from "./scripts/visual-matrix-contract.mjs";

export default defineConfig({
  testDir: "./tests/visual",
  timeout: 90_000,
  retries: 0,
  workers: 2,
  fullyParallel: true,
  // Ảnh nằm cạnh nhau theo project-platform để linux/darwin không giẫm nhau.
  snapshotPathTemplate: "{testDir}/baselines/{projectName}-{platform}/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      // 0.1% điểm ảnh — đủ dung sai cho anti-alias, vẫn bắt được lệch bố cục.
      maxDiffPixelRatio: 0.001,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: process.env.VMP_E2E_URL || "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    timezoneId: "Asia/Bangkok",
    // Cùng Chromium do Playwright cài ở local và CI, không dùng Chrome hệ thống.
    channel: "chromium",
    // Ép sRGB khi chụp: headless trên macOS mặc định chụp theo profile màn
    // hình (Display-P3) làm ảnh bạc màu — đã dính khi thay art Vali.
    launchOptions: { args: ["--force-color-profile=srgb"] },
  },
  /* Ma trận viewport (nghiên cứu 4+5): lỗi đè chữ trước đây chỉ lộ ở bố
   * cục nhất định — một viewport là không đủ. Project "chromium" giữ
   * NGUYÊN TÊN để baseline 1440 hiện có còn giá trị. */
  projects: VISUAL_PROJECTS.map(({ name, viewport }) => ({
    name,
    use: { browserName: "chromium", viewport },
  })),
});

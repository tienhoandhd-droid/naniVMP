import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const URL_SB = process.env.VMP_E2E_SUPABASE_URL || (() => {
  const noi = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
  const match = noi.match(/^VITE_SUPABASE_URL=(.+)$/m);
  return match?.[1]?.trim();
})();

if (!URL_SB) throw new Error("Không tìm thấy Supabase URL công khai cho readiness E2E");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

try {
  const cases = [
    ["rules", "rpc_active_rules"],
    ["health", "rpc_dashboard_kpi"],
    ["phanquyen", "rpc_business_roles"],
  ];

  for (const [view, rpc] of cases) {
    const page = await browser.newPage();
    try {
      await caiGiaLap(page, {
        supabaseUrl: URL_SB,
        kichBan: "day",
        suaKho: (store) => {
          store.rpc_errors = { [rpc]: { status: 500, message: "Lỗi thử readiness" } };
        },
      });
      await nhetPhien(page, { supabaseUrl: URL_SB });
      await page.setViewport({ width: 1366, height: 768 });
      await page.goto(`${GOC}#v=${view}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (view === "health") {
        await page.click('#health-tab-server');
      }
      await page.waitForSelector("main [role=\"alert\"]", { timeout: 15_000 });
      const retry = await page.$eval("main [role=\"alert\"] button", (button) => button.textContent?.trim() ?? "");
      assert.match(retry, /Thử lại/);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

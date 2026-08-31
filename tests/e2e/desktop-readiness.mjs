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

async function bamNutTheoNhan(page, nhan) {
  const buttons = await page.$$("main button");
  for (const button of buttons) {
    if (await button.evaluate((node, label) => node.textContent?.trim() === label, nhan)) {
      await button.click();
      return;
    }
  }
  throw new Error(`Không tìm thấy nút ${nhan}`);
}

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
      if (view === "health") {
        const text = await page.$eval("main", (main) => main.textContent ?? "");
        assert.doesNotMatch(text, /Không có hạng mục nào đến hạn trong ngưỡng này/,
          "lỗi tải ban đầu không được giả làm kết quả cảnh báo sạch");
        assert.doesNotMatch(text, /Không phát hiện vấn đề nào/,
          "lỗi tải ban đầu không được giả làm kết quả chất lượng sạch");
        assert.doesNotMatch(text, /Cảnh báo server sẽ gửi|Chất lượng dữ liệu \(0\)/,
          "lỗi tải ban đầu phải dừng ở readiness boundary chung thay vì dựng card rỗng");
      }
      if (view === "rules") {
        const errorText = await page.$eval("main [role=\"alert\"]", (alert) => alert.textContent ?? "");
        assert.match(errorText, /Máy chủ không trả về dữ liệu luật/);
      }
    } finally {
      await page.close();
    }
  }

  {
    const page = await browser.newPage();
    try {
      await caiGiaLap(page, {
        supabaseUrl: URL_SB,
        kichBan: "day",
        suaKho: (store) => {
          store.rpc_errors = {
            rpc_active_rules: { status: 401, message: "permission denied for function rpc_active_rules" },
          };
        },
      });
      await nhetPhien(page, { supabaseUrl: URL_SB });
      await page.setViewport({ width: 1366, height: 768 });
      await page.goto(`${GOC}#v=rules`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForSelector("main [role=\"alert\"]", { timeout: 15_000 });
      const errorText = await page.$eval("main [role=\"alert\"]", (alert) => alert.textContent ?? "");
      assert.match(errorText, /Phiên đăng nhập đã hết hạn hoặc tài khoản chưa đủ quyền/);
    } finally {
      await page.close();
    }
  }

  {
    let store;
    const page = await browser.newPage();
    try {
      await caiGiaLap(page, {
        supabaseUrl: URL_SB,
        kichBan: "day",
        doTre: { rpc_dashboard_kpi: 350 },
        suaKho: (kho) => { store = kho; },
      });
      await nhetPhien(page, { supabaseUrl: URL_SB });
      await page.setViewport({ width: 1366, height: 768 });
      await page.goto(`${GOC}#v=health`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.click("#health-tab-server");
      await page.waitForFunction(() => document.querySelector("main")?.textContent?.includes("Hạng mục hoàn thành"));

      store.rpc_errors = { rpc_dashboard_kpi: { status: 500, message: "Lỗi refresh KPI" } };
      await bamNutTheoNhan(page, "Tải lại");
      await page.waitForSelector('main [aria-busy="true"]');
      assert.equal(await page.$eval('main [aria-busy="true"]', (region) => region.textContent?.includes("Hạng mục hoàn thành")), true);
      await page.waitForSelector("main [role=\"alert\"]", { timeout: 15_000 });
      assert.equal(await page.$eval("main", (main) => main.textContent?.includes("6/24")), true);

      store.rpc_errors = {};
      await page.click("main [role=\"alert\"] button");
      await page.waitForSelector('main [aria-busy="true"]');
      await page.waitForFunction(() => !document.querySelector("main [role=alert]"));
      await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"]'));
      assert.equal(await page.$eval("main", (main) => main.textContent?.includes("Hạng mục hoàn thành")), true);
    } finally {
      await page.close();
    }
  }

  {
    let store;
    const page = await browser.newPage();
    try {
      await caiGiaLap(page, {
        supabaseUrl: URL_SB,
        kichBan: "day",
        suaKho: (kho) => {
          store = kho;
          kho.rpc_due_alerts = (body) => [{
            validation_code: `SNAPSHOT-${body.p_soon_days}`,
            validation_type: "PQ",
            object_code: "OBJ-SNAPSHOT",
            object_name: "Kiểm tra ngưỡng snapshot",
            department: "QA",
            owner_name: "Người kiểm thử",
            stage: "validation",
            due_date: "2026-09-01",
            days_left: body.p_soon_days,
            alert_type: "due_soon",
          }];
        },
      });
      await nhetPhien(page, { supabaseUrl: URL_SB });
      await page.setViewport({ width: 1366, height: 768 });
      await page.goto(`${GOC}#v=health`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.click("#health-tab-server");
      await page.waitForFunction(() => document.querySelector("main")?.textContent?.includes("SNAPSHOT-7"));

      store.rpc_errors = { rpc_due_alerts: { status: 500, message: "Lỗi đổi ngưỡng" } };
      await bamNutTheoNhan(page, "30 ngày");
      await page.waitForSelector('main [role="alert"]');
      const failed = await page.$eval("main", (main) => ({
        text: main.textContent ?? "",
        caption: main.querySelector(".reg-table caption")?.textContent?.trim() ?? "",
      }));
      assert.match(failed.text, /Đang hiển thị bản chụp theo ngưỡng 7 ngày/,
        "refresh ngưỡng lỗi phải nói rõ rows vẫn thuộc snapshot 7 ngày");
      assert.match(failed.caption, /trong 7 ngày tới/,
        "caption phải mô tả snapshot đã commit, không mô tả intent 30 ngày bị lỗi");
      assert.match(failed.text, /SNAPSHOT-7/);

      store.rpc_errors = {};
      await page.click('main [role="alert"] button');
      await page.waitForFunction(() => !document.querySelector('main [role="alert"]'));
      await page.waitForFunction(() => document.querySelector("main")?.textContent?.includes("SNAPSHOT-30"));
      const recoveredCaption = await page.$eval("main .reg-table caption", (caption) => caption.textContent ?? "");
      assert.match(recoveredCaption, /trong 30 ngày tới/);
    } finally {
      await page.close();
    }
  }


  {
    let store;
    const delays = { rpc_due_alerts: 0 };
    const page = await browser.newPage();
    try {
      await caiGiaLap(page, {
        supabaseUrl: URL_SB,
        kichBan: "day",
        doTre: delays,
        suaKho: (kho) => {
          store = kho;
          kho.rpc_due_alerts = (body) => [{
            validation_code: body.p_soon_days === 3
              ? "STALE-THREE"
              : body.p_soon_days === 30 ? "LATEST-THIRTY" : `WINDOW-${body.p_soon_days}`,
            validation_type: "PQ",
            object_code: `OBJ-${body.p_soon_days}`,
            object_name: `Ngưỡng ${body.p_soon_days} ngày`,
            department: "QA",
            owner_name: "Người kiểm thử",
            stage: "validation",
            due_date: "2026-09-01",
            days_left: body.p_soon_days,
            alert_type: "due_soon",
          }];
        },
      });
      await nhetPhien(page, { supabaseUrl: URL_SB });
      await page.setViewport({ width: 1366, height: 768 });
      await page.goto(`${GOC}#v=health`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.click("#health-tab-server");
      await page.waitForFunction(() => document.querySelector("main")?.textContent?.includes("WINDOW-7"));

      delays.rpc_due_alerts = 700;
      const slowRequestStarted = new Promise((resolve) => {
        const observe = (request) => {
          if (!request.url().includes("/rpc/rpc_due_alerts") || request.method() === "OPTIONS") return;
          page.off("request", observe);
          resolve();
        };
        page.on("request", observe);
      });
      await bamNutTheoNhan(page, "3 ngày");
      await slowRequestStarted;
      delays.rpc_due_alerts = 30;
      await bamNutTheoNhan(page, "30 ngày");
      await page.waitForFunction(() => document.querySelector("main")?.textContent?.includes("LATEST-THIRTY"));
      await new Promise((resolve) => setTimeout(resolve, 850));

      const text = await page.$eval("main", (main) => main.textContent ?? "");
      assert.match(text, /LATEST-THIRTY/, "request mới nhất phải sở hữu snapshot hiển thị");
      assert.doesNotMatch(text, /STALE-THREE/, "response cũ hoàn tất muộn không được đè snapshot mới");
      assert.ok(store, "mock store phải được khởi tạo");
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

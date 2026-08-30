import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:5199/";
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || (() => {
  try {
    const env = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
    return env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
  } catch {
    const assets = new URL("../../dist/assets/", import.meta.url);
    for (const name of readdirSync(fileURLToPath(assets))) {
      if (!name.endsWith(".js")) continue;
      const match = readFileSync(fileURLToPath(new URL(name, assets)), "utf8")
        .match(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
      if (match) return match[0];
    }
    return undefined;
  }
})();

if (!supabaseUrl) throw new Error("Không tìm thấy Supabase URL công khai cho E2E bộ lọc tiến độ");

function assert(condition, message, evidence) {
  if (!condition) throw new Error(`${message}${evidence ? `: ${JSON.stringify(evidence)}` : ""}`);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

try {
  const page = await browser.newPage();
  await caiGiaLap(page, { supabaseUrl, kichBan: "day" });
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}#v=progress`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector('.pr-loc[aria-label="Lọc danh sách tiến độ"]', { timeout: 8_000 });

  const initial = await page.$eval(".pr-loc", (filter) => {
    const advanced = filter.querySelector("#progress-advanced-filters");
    return {
      quickFilters: filter.querySelectorAll('.pr-loc__nhanh button[aria-pressed]').length,
      hasToggle: Boolean(filter.querySelector('button[aria-controls="progress-advanced-filters"]')),
      advancedHidden: advanced?.hasAttribute("hidden"),
    };
  });
  assert(initial.quickFilters === 2, "Thanh chính phải có đúng hai lọc nhanh", initial);
  assert(initial.hasToggle && initial.advancedHidden, "Bộ lọc nâng cao phải đóng ban đầu", initial);

  await page.click('button[aria-controls="progress-advanced-filters"]');
  await page.waitForSelector("#progress-advanced-filters:not([hidden])");
  const advanced = await page.$eval("#progress-advanced-filters", (panel) => ({
    status: Boolean(panel.querySelector('select[aria-label="Lọc theo trạng thái"]')),
    stage: Boolean(panel.querySelector('select[aria-label="Lọc theo giai đoạn"]')),
    period: Boolean(panel.querySelector('select[aria-label="Lọc theo kỳ"]')),
    detailedIssues: panel.querySelectorAll('.pr-loc__loi-chi-tiet button[aria-pressed]').length,
  }));
  assert(advanced.status && advanced.stage && advanced.period && advanced.detailedIssues === 4,
    "Panel nâng cao phải chứa đủ điều khiển", advanced);

  const verifyQuickFilter = async ({ selector, rowAttribute, name }) => {
    const expectedCount = await page.$eval(selector, (button) =>
      Number(button.querySelector(".pr-chip__so")?.textContent ?? "-1"));
    assert(expectedCount > 0, `${name} phải có số facet dương`, { expectedCount });
    await page.click(selector);
    await page.waitForFunction((count) =>
      Number(document.querySelector(".pr-loc__dem b")?.textContent) === count, {}, expectedCount);
    const result = await page.evaluate((attribute) => {
      const rows = [...document.querySelectorAll(".pr-bang .pr-row")];
      return {
        resultCount: Number(document.querySelector(".pr-loc__dem b")?.textContent),
        renderedRows: rows.length,
        wrongRows: rows.filter((row) => row.getAttribute(attribute) !== "true").length,
      };
    }, rowAttribute);
    assert(result.resultCount === expectedCount && result.renderedRows === expectedCount && result.wrongRows === 0,
      `${name} phải trỏ đúng tập dữ liệu và khớp số trên nút`, { expectedCount, ...result });
    assert(await page.$eval(selector, (button) => button.getAttribute("aria-pressed")) === "true",
      `${name} phải công bố trạng thái đang chọn`);
  };

  await verifyQuickFilter({
    selector: 'button[aria-label="Chỉ hiện hạng mục cần xử lý"]',
    rowAttribute: "data-needs-action",
    name: "Cần xử lý",
  });
  await page.click('button[aria-label="Xóa bộ lọc"]');
  assert(await page.$eval('button[aria-label="Chỉ hiện hạng mục cần xử lý"]',
    (button) => button.getAttribute("aria-pressed")) === "false", "Xóa bộ lọc phải tắt Cần xử lý");

  await verifyQuickFilter({
    selector: 'button[aria-label="Chỉ hiện hạng mục quá hạn"]',
    rowAttribute: "data-overdue",
    name: "Quá hạn",
  });
  await page.click('button[aria-label="Xóa bộ lọc"]');

  if (process.env.VMP_E2E_SCREENSHOT_DESKTOP) {
    const filter = await page.$(".pr-loc");
    await filter.screenshot({ path: process.env.VMP_E2E_SCREENSHOT_DESKTOP });
  }

  await page.setViewport({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector('.pr-loc[aria-label="Lọc danh sách tiến độ"]', { timeout: 15_000 });
  await page.click('button[aria-controls="progress-advanced-filters"]');
  await page.waitForSelector("#progress-advanced-filters:not([hidden])");
  const mobile = await page.$eval(".pr-loc", (filter) => {
    const targets = [...filter.querySelectorAll(
      ".pr-loc__chinh input, .pr-loc__chinh button, .pr-loc__nang-cao select, .pr-loc__nang-cao button, .pr-loc__nang-cao .pr-ngung",
    )];
    const targetSizes = targets.map((target) => ({
      element: target.tagName.toLowerCase(),
      label: target.getAttribute("aria-label") || target.textContent?.trim(),
      className: target.className,
      height: target.getBoundingClientRect().height,
    }));
    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      filterOverflow: filter.scrollWidth - filter.clientWidth,
      smallestTarget: Math.min(...targetSizes.map((target) => target.height)),
      targetSizes,
    };
  });
  assert(mobile.pageOverflow <= 1 && mobile.filterOverflow <= 1, "Bộ lọc mobile không được tràn ngang", mobile);
  assert(mobile.smallestTarget >= 43.5, "Mục tiêu chạm mobile phải cao tối thiểu 44px", mobile);

  if (process.env.VMP_E2E_SCREENSHOT_MOBILE) {
    const filter = await page.$(".pr-loc");
    await filter.screenshot({ path: process.env.VMP_E2E_SCREENSHOT_MOBILE });
  }

  console.log("✓ Bộ lọc tiến độ gọn, đủ nâng cao và không tràn ngang trên mobile");
} finally {
  await browser.close();
}

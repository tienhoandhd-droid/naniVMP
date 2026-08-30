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

if (!supabaseUrl) throw new Error("Không tìm thấy Supabase URL công khai cho E2E Botanical");

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
  await page.waitForSelector(".pr-table", { timeout: 8_000 });

  const progress = await page.evaluate(() => ({
    hasMetricGrid: Boolean(document.querySelector(".lp-metric-grid")),
    headers: [...document.querySelectorAll(".pr-table thead th")]
      .map((header) => header.textContent?.trim()),
    firstCode: document.querySelector("[data-progress-item]")?.getAttribute("data-progress-item"),
  }));
  assert(!progress.hasMetricGrid, "Trang tiến độ không còn lặp lại dải KPI phía trên bảng", progress);
  assert(JSON.stringify(progress.headers) === JSON.stringify([
    "Hạng mục", "Loại", "QA", "Mốc & hạn", "Trạng thái", "Cập nhật",
  ]), "Bảng tiến độ phải được thu còn đúng sáu cột", progress);

  const editableButton = await page.$(".pr-table .pr-nut-chinh:not(:disabled)");
  assert(editableButton, "Bảng tiến độ vẫn phải có nút cập nhật cho hàng được phép sửa");
  const editedCode = await editableButton.evaluate((button) =>
    button.closest("[data-progress-item]")?.getAttribute("data-progress-item"));
  await editableButton.click();
  await page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
  const dialogText = await page.$eval('[role="dialog"]', (dialog) => dialog.textContent || "");
  assert(dialogText.includes("Cập nhật tiến độ"), "Nút cập nhật phải mở đúng modal tiến độ", { dialogText });
  assert(!editedCode || dialogText.includes(editedCode),
    "Modal phải thuộc đúng hạng mục được chọn", { editedCode, dialogText });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));

  if (process.env.VMP_E2E_SCREENSHOT_PROGRESS) {
    await page.screenshot({ path: process.env.VMP_E2E_SCREENSHOT_PROGRESS, fullPage: true });
  }

  const switched = await page.evaluate(() => {
    const button = [...document.querySelectorAll(".vmp-doi-nhom button")]
      .find((candidate) => candidate.textContent?.includes("Theo đối tượng"));
    button?.click();
    return Boolean(button);
  });
  assert(switched, "Phải tìm thấy lựa chọn Theo đối tượng");
  await page.waitForSelector(".catalog-progress", { timeout: 5_000 });

  const catalogInitial = await page.evaluate(() => {
    const root = document.querySelector(".catalog-progress");
    const advanced = document.querySelector("#catalog-progress-advanced-filters");
    const firstTrigger = document.querySelector(".catalog-object__trigger");
    const triggerControls = firstTrigger?.getAttribute("aria-controls");
    return {
      removedNote: !root?.textContent?.includes("Thêm đối tượng mới ở"),
      hasPrimarySearch: Boolean(root?.querySelector('.catalog-progress__primary input[type="search"]')),
      hasFilterToggle: Boolean(root?.querySelector(
        'button[aria-controls="catalog-progress-advanced-filters"]',
      )),
      advancedHidden: advanced?.hasAttribute("hidden"),
      advancedSelects: advanced?.querySelectorAll("select").length,
      triggerExpanded: firstTrigger?.getAttribute("aria-expanded"),
      triggerControls,
      triggerControlsExists: Boolean(triggerControls && document.getElementById(triggerControls)),
    };
  });
  assert(catalogInitial.removedNote, "Catalog phải bỏ ghi chú hướng dẫn bị yêu cầu xóa", catalogInitial);
  assert(catalogInitial.hasPrimarySearch && catalogInitial.hasFilterToggle && catalogInitial.advancedHidden,
    "Catalog phải có hàng tìm kiếm chính và bộ lọc nâng cao đóng ban đầu", catalogInitial);
  assert(catalogInitial.advancedSelects === 5, "Bộ lọc nâng cao phải giữ đủ năm trường hiện có", catalogInitial);
  assert(catalogInitial.triggerExpanded === "false" && catalogInitial.triggerControlsExists,
    "Accordion đối tượng phải công bố trạng thái và vùng nội dung", catalogInitial);

  await page.click('button[aria-controls="catalog-progress-advanced-filters"]');
  await page.waitForSelector("#catalog-progress-advanced-filters:not([hidden])");
  await page.select('select[aria-label="Lọc theo tình trạng"]', "over");
  await page.waitForFunction(() => {
    const triggers = [...document.querySelectorAll(".catalog-object__trigger")];
    return triggers.length > 0 && triggers.every((trigger) =>
      (trigger.getAttribute("data-catalog-statuses") || "").split(" ").includes("over"));
  });
  const overdueCatalog = await page.evaluate(() => {
    const triggers = [...document.querySelectorAll(".catalog-object__trigger")];
    return {
      count: triggers.length,
      wrongObjects: triggers.filter((trigger) =>
        !(trigger.getAttribute("data-catalog-statuses") || "").split(" ").includes("over")).length,
    };
  });
  assert(overdueCatalog.count > 0 && overdueCatalog.wrongObjects === 0,
    "Lọc Quá hạn của Catalog phải trỏ đúng các đối tượng có hạng mục quá hạn", overdueCatalog);
  await page.select('select[aria-label="Lọc theo tình trạng"]', "all");
  await page.waitForFunction(() => document.querySelectorAll(".catalog-object__trigger").length > 1);
  const populatedTrigger = '.catalog-object__trigger:not([data-catalog-items="0"])';
  await page.click(populatedTrigger);
  await page.waitForFunction((selector) =>
    document.querySelector(selector)?.getAttribute("aria-expanded") === "true", {}, populatedTrigger);
  const openedObject = await page.evaluate(() => {
    const trigger = document.querySelector('.catalog-object__trigger:not([data-catalog-items="0"])');
    const detailId = trigger?.getAttribute("aria-controls");
    const detail = detailId ? document.getElementById(detailId) : null;
    return {
      detailId,
      detailExists: Boolean(detail),
      milestoneHeaders: [...(detail?.querySelectorAll("table thead th") || [])]
        .map((header) => header.textContent?.trim()),
    };
  });
  assert(openedObject.detailExists, "Accordion phải mở đúng vùng nội dung được aria-controls trỏ tới", openedObject);
  assert(["Đề cương", "Thẩm định", "Báo cáo", "Đích VMP"].every((label) =>
    openedObject.milestoneHeaders.some((header) => header?.includes(label))),
  "Chi tiết đối tượng phải giữ đủ bốn mốc nghiệp vụ", openedObject);

  if (process.env.VMP_E2E_SCREENSHOT_CATALOG) {
    await page.screenshot({ path: process.env.VMP_E2E_SCREENSHOT_CATALOG, fullPage: true });
  }

  await page.setViewport({ width: 390, height: 844 });
  const mobile = await page.$eval(".catalog-progress", (root) => {
    const targets = [...root.querySelectorAll(
      ".catalog-progress__primary input, .catalog-progress__primary button, "
      + ".catalog-progress__advanced select, .catalog-progress__advanced button, .catalog-object__trigger",
    )];
    const tableScroll = root.querySelector(".catalog-table-scroll");
    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      smallestTarget: Math.min(...targets.map((target) => target.getBoundingClientRect().height)),
      hasLocalTableScroll: Boolean(tableScroll && tableScroll.scrollWidth >= tableScroll.clientWidth),
    };
  });
  assert(mobile.pageOverflow <= 1, "Catalog mobile không được làm tràn ngang toàn trang", mobile);
  assert(mobile.smallestTarget >= 43.5, "Mục tiêu chạm Catalog mobile phải cao tối thiểu 44px", mobile);
  assert(mobile.hasLocalTableScroll, "Bảng mốc phải cuộn trong vùng riêng trên mobile", mobile);

  console.log("✓ Bảng tiến độ và Catalog Botanical đúng luồng desktop/mobile");
} finally {
  await browser.close();
}

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:5199/";
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || (() => {
  try {
    const env = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
    return env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
  } catch {
    // ACL local có thể không cho đọc .env.local. Endpoint này là URL công
    // khai mà Vite đã nhúng vào bundle; không đọc anon key hay dữ liệu thật.
    const assets = new URL("../../dist/assets/", import.meta.url);
    for (const name of readdirSync(fileURLToPath(assets))) {
      if (!name.endsWith(".js")) continue;
      const url = readFileSync(fileURLToPath(new URL(name, assets)), "utf8")
        .match(/https:\/\/[a-z0-9-]+\.supabase\.co/i)?.[0];
      if (url) return url;
    }
    return undefined;
  }
})();

if (!supabaseUrl) throw new Error("Không tìm thấy Supabase URL công khai cho Source QA E2E");

function expect(condition, message, evidence) {
  assert.ok(condition, `${message}${evidence ? `: ${JSON.stringify(evidence)}` : ""}`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

try {
  const page = await browser.newPage();
  // React Grab is development-only instrumentation. Disable it inside this
  // business-flow E2E so its version/font requests do not pollute the strict
  // application-network assertion; it remains enabled in the local browser.
  await page.evaluateOnNewDocument(() => {
    window.__REACT_GRAB_DISABLED__ = true;
  });
  const { chanNgoai } = await caiGiaLap(page, {
    supabaseUrl,
    kichBan: "day",
    mangNghiemNgat: true,
    previewOrigin: APP_URL,
  });
  // `rpc_my_ui_access` trong fixture `day` cấp business role admin; phiên
  // này chỉ được nhét trước document đầu tiên và mọi request Supabase bị chặn.
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}#v=source`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".cw-workspace", { timeout: 15_000 });
  await page.waitForFunction(() => document.body.innerText.includes("TB-100"), { timeout: 15_000 });

  const desktop = await page.$eval(".cw-workspace", (root) => ({
    primaryBar: Boolean(root.querySelector("[data-cw-primary-bar]")),
    toolsOpen: root.querySelector("[data-cw-tools]")?.hasAttribute("open"),
    headers: [...root.querySelectorAll(".cw-bang--objects thead th")].map((node) => ({
      label: node.textContent?.trim(),
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    })),
    objectWidth: root.querySelector(".cw-doi-tuong")?.getBoundingClientRect().width,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    primaryBarItems: [
      root.querySelector("[data-cw-primary-bar] input"),
      root.querySelector("[data-cw-filter-toggle]"),
      root.querySelector("[data-cw-them]"),
    ].map((node) => {
      const rect = node?.getBoundingClientRect();
      return rect && { top: rect.top, bottom: rect.bottom };
    }),
  }));

  expect(desktop.primaryBar, "Source phải có thanh tác vụ QA chính", desktop);
  expect(desktop.toolsOpen === false, "Công cụ dữ liệu phải đóng mặc định", desktop);
  assert.deepEqual(desktop.headers.map((header) => header.label), [
    "Đối tượng", "Bộ phận · Khu vực", "Lịch thẩm định", "QA phụ trách", "Trọng yếu", "Cập nhật", "Chi tiết",
  ], "Bảng Đối tượng phải giữ đúng thứ tự header nghiệp vụ và hành động");
  expect(desktop.headers.every((header) => header.scrollWidth <= header.clientWidth + 1),
    "Header bảng Đối tượng không được bị cắt", desktop);
  expect((desktop.objectWidth ?? 0) >= 220, "Tên đối tượng phải có đủ bề ngang", desktop);
  expect(desktop.primaryBarItems.every(Boolean)
    && desktop.primaryBarItems.every((item) => Math.abs(
      (item.top + item.bottom) / 2 - (desktop.primaryBarItems[0].top + desktop.primaryBarItems[0].bottom) / 2,
    ) <= 1),
  "Tìm kiếm, Bộ lọc và Thêm đối tượng phải nằm cùng một hàng desktop", desktop);

  await page.evaluate(() => [...document.querySelectorAll("[data-cw-tools] summary")]
    .find((node) => node.textContent?.trim() === "Công cụ dữ liệu")?.click());
  await page.waitForFunction(() => document.querySelector("[data-cw-tools]")?.hasAttribute("open") === true);
  const toolActions = await page.$$eval("[data-cw-tools] button", (nodes) =>
    nodes.map((node) => node.textContent?.trim()).filter(Boolean));
  assert.deepEqual(toolActions, ["Tải lại", "Xuất Excel", "Sinh timeline"],
    "Admin chỉ thấy ba công cụ dữ liệu đã duyệt");

  const updatedCode = await page.$eval(".cw-bang--objects tbody tr", (row) => {
    const code = row.querySelector(".cw-doi-tuong__ma")?.textContent?.trim();
    [...row.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Cập nhật")?.click();
    return code;
  });
  assert.equal(updatedCode, "TB-100", "fixture Source phải chọn đúng bản ghi đầu tiên");
  await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
  const dialogText = await page.$eval('[role="dialog"]', (dialog) => dialog.textContent || "");
  expect(dialogText.includes(updatedCode), "Cập nhật phải mở dialog của đúng mã đối tượng", { updatedCode, dialogText });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));

  const filter = "[data-cw-filter-toggle]";
  assert.equal(await page.$eval(filter, (button) => button.getAttribute("aria-expanded")), "false",
    "Bộ lọc Source phải đóng mặc định");
  await page.click(filter);
  await page.waitForFunction((selector) => document.querySelector(selector)?.getAttribute("aria-expanded") === "true", {}, filter);

  await page.type('[data-cw-primary-bar] input[aria-label="Tìm trong danh mục"]', "Máy dập viên");
  await page.waitForFunction(() => document.querySelector("[data-cw-filter-count]")?.textContent
    ?.includes("Đang lọc 1 điều kiện · 1 đối tượng"));
  await page.select('[data-cw-filter="department"]', "xsx");
  await page.waitForFunction(() => document.querySelector("[data-cw-filter-count]")?.textContent
    ?.includes("Đang lọc 2 điều kiện · 1 đối tượng"));
  await page.select('[data-cw-filter="area"]', "kv-a");
  await page.waitForFunction(() => document.querySelector("[data-cw-filter-count]")?.textContent
    ?.includes("Đang lọc 3 điều kiện · 1 đối tượng"));
  const filtered = await page.$eval(".cw-workspace", (root) => ({
    count: root.querySelector("[data-cw-filter-count]")?.textContent?.trim(),
    chips: [...root.querySelectorAll("[data-cw-filter-chip]")].map((chip) => ({
      label: chip.textContent?.trim(), ariaLabel: chip.getAttribute("aria-label"),
    })),
    rows: [...root.querySelectorAll(".cw-bang--objects tbody > tr:not(.lp-smart-table__detail-row)")]
      .map((row) => row.querySelector(".cw-doi-tuong__ma")?.textContent?.trim()).filter(Boolean),
  }));
  assert.equal(filtered.count, "Đang lọc 3 điều kiện · 1 đối tượng",
    "Tìm kiếm và hai facet phải giao nhau trên count fixture");
  assert.deepEqual(filtered.rows, ["TB-100"], "Giao bộ lọc fixture phải giữ đúng TB-100");
  assert.deepEqual(filtered.chips.map((chip) => chip.ariaLabel), [
    "Bỏ lọc Từ khóa: Máy dập viên", "Bỏ lọc Bộ phận: xsx", "Bỏ lọc Khu vực: kv-a",
  ], "Các chip phải phản ánh chính xác ba điều kiện đang giao nhau");

  await page.click('[data-cw-filter-chip][aria-label="Bỏ lọc Bộ phận: xsx"]');
  await page.waitForFunction(() => document.querySelector("[data-cw-filter-count]")?.textContent
    ?.includes("Đang lọc 2 điều kiện · 1 đối tượng"));
  const afterChipClear = await page.$eval(".cw-workspace", (root) => ({
    count: root.querySelector("[data-cw-filter-count]")?.textContent?.trim(),
    chips: [...root.querySelectorAll("[data-cw-filter-chip]")].map((chip) => chip.getAttribute("aria-label")),
    department: root.querySelector('[data-cw-filter="department"]')?.value,
    rows: [...root.querySelectorAll(".cw-bang--objects tbody > tr:not(.lp-smart-table__detail-row)")]
      .map((row) => row.querySelector(".cw-doi-tuong__ma")?.textContent?.trim()).filter(Boolean),
  }));
  assert.equal(afterChipClear.count, "Đang lọc 2 điều kiện · 1 đối tượng",
    "Bỏ một chip chỉ được giảm đúng một điều kiện");
  assert.equal(afterChipClear.department, "all", "Chip Bộ phận phải chỉ xóa filter Bộ phận");
  assert.deepEqual(afterChipClear.chips, ["Bỏ lọc Từ khóa: Máy dập viên", "Bỏ lọc Khu vực: kv-a"]);
  assert.deepEqual(afterChipClear.rows, ["TB-100"]);

  await page.click("[data-cw-clear-filters]");
  await page.waitForFunction(() => !document.querySelector("[data-cw-filter-count]")
    && document.querySelector('[data-cw-primary-bar] input[aria-label="Tìm trong danh mục"]')?.value === ""
    && document.querySelector('[data-cw-filter="department"]')?.value === "all"
    && document.querySelector('[data-cw-filter="area"]')?.value === "all");
  const reset = await page.$eval(".cw-workspace", (root) => ({
    query: root.querySelector('[data-cw-primary-bar] input[aria-label="Tìm trong danh mục"]')?.value,
    department: root.querySelector('[data-cw-filter="department"]')?.value,
    area: root.querySelector('[data-cw-filter="area"]')?.value,
    chips: root.querySelectorAll("[data-cw-filter-chip]").length,
  }));
  assert.deepEqual(reset, { query: "", department: "all", area: "all", chips: 0 },
    "Xóa bộ lọc phải đưa toàn bộ điều kiện về mặc định");

  await page.setViewport({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelectorAll(".lp-mobile-task-list .cw-the button").length > 0);
  const mobile = await page.$eval(".cw-workspace", (root) => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    cardButtons: [...root.querySelectorAll(".lp-mobile-task-list .cw-the button")].map((button) => ({
      label: button.textContent?.trim(),
      height: button.getBoundingClientRect().height,
    })),
  }));
  expect(mobile.overflow <= 1, "Source mobile không được tràn ngang", mobile);
  expect(mobile.cardButtons.length > 0 && mobile.cardButtons.every((button) => button.height >= 43.5),
    "Mọi nút thẻ mobile phải cao tối thiểu 43.5px", mobile);
  assert.deepEqual(chanNgoai, [], "E2E Source QA không được gọi ra ngoài Supabase giả lập");

  console.log("source QA entry workbench E2E: pass");
} finally {
  await browser.close();
}

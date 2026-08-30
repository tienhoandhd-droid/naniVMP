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

if (!supabaseUrl) throw new Error("Không tìm thấy Supabase URL công khai cho E2E QA Ledger");

function assert(condition, message, evidence) {
  if (!condition) throw new Error(`${message}${evidence ? `: ${JSON.stringify(evidence)}` : ""}`);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

try {
  const page = await browser.newPage();
  await caiGiaLap(page, { supabaseUrl, kichBan: "day" });
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}#v=today`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".hn-nhom--overdue .hn-muc", { timeout: 15_000 });

  const desktop = await page.$eval(".hn-nhom--overdue", (section) => {
    const firstRow = section.querySelector(".hn-muc");
    const trigger = firstRow?.querySelector(".hn-muc__mo--inline");
    const owner = firstRow?.querySelector(".hn-muc__nguoi");
    return {
      headers: [...section.querySelectorAll(".hn-cot span")].map((node) => node.textContent?.trim()),
      ownerText: owner?.textContent?.trim(),
      ownerHasDepartmentNode: Boolean(owner?.querySelector("i")),
      ownerDepartmentText: owner?.querySelector("i")?.textContent?.trim(),
      detailId: trigger?.getAttribute("aria-controls"),
      validationCode: firstRow?.querySelector(".hn-muc__ma")?.textContent?.trim(),
    };
  });
  assert(desktop.headers[3] === "QA phụ trách", "Cột thứ tư phải dành riêng cho QA", desktop);
  assert(!desktop.ownerHasDepartmentNode, "Hàng tóm tắt không được render bộ phận", desktop);
  assert(desktop.ownerText && desktop.detailId && desktop.validationCode,
    "Hàng quá hạn phải giữ đủ tên QA, vùng chi tiết và mã hạng mục", desktop);

  await page.click(".hn-nhom--overdue .hn-muc__mo--inline");
  await page.waitForFunction((id) => !document.getElementById(id)?.hasAttribute("hidden"), {}, desktop.detailId);
  const detail = await page.$eval(`#${desktop.detailId}`, (panel) => {
    const departmentLabel = [...panel.querySelectorAll("dt")]
      .find((term) => term.textContent?.trim() === "Phòng ban");
    return {
      department: departmentLabel?.nextElementSibling?.textContent?.trim(),
      region: panel.getAttribute("role"),
    };
  });
  assert(detail.region === "region" && detail.department,
    "Mở chi tiết vẫn phải tra được phòng ban", detail);

  const updateButton = await page.$(".hn-nhom--overdue .hn-muc .hn-muc__nut");
  assert(updateButton, "Hàng QA được phép sửa phải có nút cập nhật");
  await updateButton.click();
  await page.waitForSelector(".pr-trang", { timeout: 8_000 });
  await page.waitForSelector('[role="dialog"]', { timeout: 8_000 });
  const dialogText = await page.$eval('[role="dialog"]', (dialog) => dialog.textContent || "");
  assert(dialogText.includes(desktop.validationCode),
    "Nút cập nhật phải mở đúng hạng mục từ Việc hôm nay", { validationCode: desktop.validationCode, dialogText });

  await page.keyboard.press("Escape");
  await page.goto(`${APP_URL}#v=today`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.setViewport({ width: 390, height: 844 });
  await page.waitForSelector(".hn-nhom--overdue .hn-muc", { timeout: 15_000 });
  const mobile = await page.$eval(".hn-nhom--overdue", (section) => {
    const buttons = [...section.querySelectorAll(".hn-muc button")]
      .filter((button) => getComputedStyle(button).display !== "none");
    const buttonSizes = buttons.map((button) => ({
      className: button.className,
      display: getComputedStyle(button).display,
      height: button.getBoundingClientRect().height,
      top: button.getBoundingClientRect().top,
    }));
    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sectionOverflow: section.scrollWidth - section.clientWidth,
      smallestButton: Math.min(...buttons.map((button) => button.getBoundingClientRect().height)),
      summaryHasDepartmentNode: Boolean(section.querySelector(".hn-muc__nguoi i, .hn-muc__phong")),
      sectionTop: section.getBoundingClientRect().top,
      contentVisibility: getComputedStyle(section.querySelector(".hn-muc")).contentVisibility,
      buttonSizes,
    };
  });
  assert(mobile.pageOverflow <= 1 && mobile.sectionOverflow <= 1,
    "QA Ledger mobile không được tràn ngang", mobile);
  assert(mobile.smallestButton >= 43.5, "Nút mobile phải cao tối thiểu 44px", mobile);
  assert(!mobile.summaryHasDepartmentNode, "Thẻ mobile không được hiển thị bộ phận", mobile);

  if (process.env.VMP_E2E_SCREENSHOT) {
    await page.$eval(".hn-nhom--overdue", (section) => section.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: process.env.VMP_E2E_SCREENSHOT });
  }

  console.log("✓ Botanical QA Ledger giữ đúng người QA, chi tiết và deep-link desktop/mobile");
} finally {
  await browser.close();
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const URL_SB = process.env.VMP_E2E_SUPABASE_URL || (() => {
  const noi = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
  return noi.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
})();

if (!URL_SB) throw new Error("Không tìm thấy Supabase URL công khai cho E2E Vai trò & phạm vi");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

try {
  const page = await browser.newPage();
  await caiGiaLap(page, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(page, { supabaseUrl: URL_SB });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${GOC}#v=phanquyen`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.evaluate(() => localStorage.removeItem("vmp.tab.phanquyen"));
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector('[data-role-control-table="true"]', { timeout: 15_000 });

  const state = await page.evaluate(() => ({
    roleRows: document.querySelectorAll('[data-role-control-table="true"] tbody tr').length,
    accountTables: document.querySelectorAll('[data-account-control-table="true"]').length,
    tabs: [...document.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent?.trim()),
    activeTab: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim(),
    longChecklistVisible: [...document.querySelectorAll('[data-account-control-table="true"] details')]
      .some((details) => details.hasAttribute("open")),
  }));

  assert.equal(state.roleRows, 5);
  assert.equal(state.accountTables, 1);
  assert.equal(state.tabs.includes("Liên kết & quyền"), false);
  assert.equal(state.activeTab, "Bảng kiểm soát");
  assert.equal(state.longChecklistVisible, false);

  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Liên kết tài khoản")?.click());
  await page.waitForSelector("#pq-account-tools");
  await page.waitForSelector('#ip-directory-results [role="option"]', { timeout: 10_000 });
  await page.click('#ip-directory-results [role="option"]');
  const linkState = await page.evaluate(() => ({
    sourceFirst: document.body.innerText.includes("Chọn nhân sự từ Dữ liệu nguồn"),
    manualAssignmentVisible: document.body.innerText.includes("Phân công theo hạng mục"),
    directoryFormVisible: Boolean(document.querySelector('[aria-label="Bộ phận trong danh bạ"]')),
    accountLinkVisible: document.body.innerText.includes("Nối tài khoản"),
    rightsVisible: document.body.innerText.includes("Quyền hiệu lực"),
  }));
  assert.equal(linkState.sourceFirst, true);
  assert.equal(linkState.manualAssignmentVisible, false);
  assert.equal(linkState.directoryFormVisible, false);
  assert.equal(linkState.accountLinkVisible, true);
  assert.equal(linkState.rightsVisible, false);

  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')]
    .find((tab) => tab.textContent?.includes("Email được phép"))?.click());
  await page.waitForFunction(() => document.body.innerText.includes("Ai được phép có tài khoản"));
  const emailState = await page.evaluate(() => ({
    oldParagraphVisible: document.body.innerText.includes("Trước 01/08/2026"),
    guide: [...document.querySelectorAll("details")]
      .find((details) => details.querySelector("summary")?.textContent?.includes("Quy trình thêm người mới"))
      ?.hasAttribute("open"),
  }));
  assert.equal(emailState.oldParagraphVisible, false);
  assert.equal(emailState.guide, false);
} finally {
  await browser.close();
}

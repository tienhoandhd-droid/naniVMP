import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:5199/";
const PROPOSAL_ID = "11111111-1111-4111-8111-111111111111";
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || (() => {
  try {
    const env = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
    return env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
  } catch {
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

if (!supabaseUrl) throw new Error("Không tìm thấy Supabase URL công khai cho E2E tái thẩm định");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

try {
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });
  await page.evaluateOnNewDocument(() => { window.__REACT_GRAB_DISABLED__ = true; });
  const { chanNgoai } = await caiGiaLap(page, {
    supabaseUrl,
    kichBan: "day",
    mangNghiemNgat: true,
    previewOrigin: APP_URL,
    suaKho: (store) => {
      store.vmp_revalidation_proposals = [{
        id: PROPOSAL_ID,
        plan_item_id: "rv-item-12",
        validation_code: "RV-12/2024.01-PQ",
        object_code: "RV-12",
        validation_type: "PQ",
        actual_completed_date: "2024-02-29",
        frequency_months: 12,
        due_date: "2025-02-28",
        status: "pending",
        version: 3,
        created_plan_validation_code: null,
        decision_reason: null,
        decided_at: null,
        created_at: "2026-09-01T01:00:00.000Z",
        updated_at: "2026-09-01T01:00:00.000Z",
      }];
      store.rpc_refresh_revalidation_proposals = {
        ok: true, as_of: "2026-09-01", created: 0, unchanged: 1, obsolete: 0,
      };
      store.rpc_confirm_revalidation_proposal = {
        ok: true,
        proposal_id: PROPOSAL_ID,
        validation_code: "RV-12/2025.01-PQ",
        version: 4,
      };
      store.rpc_dismiss_revalidation_proposal = {
        ok: true, proposal_id: PROPOSAL_ID, version: 4,
      };
    },
  });
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}#v=source`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  try {
    await page.waitForSelector('[data-cw-nav="revalidation"]', { timeout: 15_000 });
  } catch (cause) {
    const evidence = await page.evaluate(() => ({
      hash: location.hash,
      title: document.title,
      body: document.body.innerText.slice(0, 1200),
      nav: [...document.querySelectorAll("[data-cw-nav]")].map((node) => node.getAttribute("data-cw-nav")),
    }));
    throw new Error(`Không dựng được tab revalidation: ${JSON.stringify({ browserErrors, evidence })}`, { cause });
  }
  await page.click('[data-cw-nav="revalidation"]');
  await page.waitForFunction(() => document.body.innerText.includes("RV-12/2024.01-PQ"), { timeout: 15_000 });

  const table = await page.$eval(".rv-panel", (root) => ({
    heading: root.querySelector("h3")?.textContent?.trim(),
    headers: [...root.querySelectorAll("thead th")].map((node) => node.textContent?.trim()),
    status: root.querySelector(".rv-status")?.textContent?.trim(),
    actions: [...root.querySelectorAll(".rv-actions button")].map((node) => node.textContent?.trim()),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.equal(table.heading, "Kỳ tái thẩm định");
  assert.deepEqual(table.headers, ["Mã / đối tượng", "Hoàn thành gốc", "Chu kỳ", "Kỳ tiếp theo", "Trạng thái", "Quyết định"]);
  assert.equal(table.status, "Chờ quyết định");
  assert.deepEqual(table.actions, ["Xác nhận", "Bỏ qua"]);
  assert.ok(table.overflow <= 1, `Bảng tái thẩm định không được tràn desktop: ${JSON.stringify(table)}`);

  await page.click(".rv-actions .cw-nut--chinh");
  await page.waitForSelector('[role="dialog"]');
  await page.waitForFunction(() => document.activeElement?.id === "rv-decision-reason");
  await page.type("#rv-decision-reason", "Đã đối chiếu hồ sơ gốc");
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')]
    .find((button) => button.textContent?.includes("Xác nhận & tạo kỳ"))?.click());
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  await page.waitForFunction(() => document.body.innerText.includes("RV-12/2025.01-PQ"));

  assert.deepEqual(chanNgoai, [], "E2E tái thẩm định không được gọi ra ngoài mock Supabase");
  console.log("revalidation proposals E2E: pass");
} finally {
  await browser.close();
}

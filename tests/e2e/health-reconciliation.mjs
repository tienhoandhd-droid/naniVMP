/* Health reconciliation browser contract.
 *
 * The fixture keeps the regular 24 active rows byte-for-byte intact and adds
 * 13 authorised, non-active rows.  The server aggregate is then derived from
 * those actual status fields so this catches a future UI that silently folds
 * non-applicable work into the active KPI, or claims reconciliation while a
 * remaining metric still differs.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const SUPABASE_URL = process.env.VMP_E2E_SUPABASE_URL || readFileSync(
  fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8",
).match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();

assert.ok(SUPABASE_URL, "health reconciliation E2E requires the public Supabase URL");

const nonActiveState = (activity) => String(activity.state ?? activity._raw?.state ?? "active");
const isDone = (activity) => activity.st === "done";
const isOver = (activity) => activity.st === "over";

function countKpi(activities) {
  const rows = activities.filter((activity) => nonActiveState(activity) === "active");
  const done = rows.filter(isDone).length;
  const over = rows.filter(isOver).length;
  return { done, over, todo: rows.length - done - over, total: rows.length };
}

function appendNonApplicableRows(store) {
  const original = structuredClone(store.rpc_get_vmp_dashboard_v2.activities);
  const extras = Array.from({ length: 13 }, (_, index) => {
    const base = structuredClone(original[index]);
    return {
      ...base,
      id: `NOT-APPLICABLE-${index + 1}`,
      code: `NOT-APPLICABLE-${index + 1}`,
      state: "not_applicable",
      // Four explicit blanks are confirmed client warnings.  Rows without
      // email_qa deliberately leave the field absent, exercising the
      // unknown-versus-missing distinction without inventing warnings.
      _raw: { ...base._raw, state: "not_applicable", ...(index < 4 ? { email_qa: "" } : {}) },
    };
  });
  const all = [...original, ...extras];
  const active = countKpi(original);
  const outside = countKpi(extras.map((activity) => ({ ...activity, state: "active" })));
  const total = countKpi(all.map((activity) => ({ ...activity, state: "active" })));

  // Keep one genuine diagnostic remainder visible: documentation is a
  // distinct rule set and cannot be made to look reconciled by subtraction.
  const documentation = { done: 0, over: 1, todo: total.total - 1, total: total.total };
  const server = {
    updated_at: "2026-09-07T03:00:00Z",
    validation: total,
    documentation,
    mismatch_count: 1,
  };

  store.rpc_get_vmp_dashboard_v2 = {
    ...store.rpc_get_vmp_dashboard_v2,
    activities: all,
    kpi: { validation: total, documentation, mismatch_count: 1 },
  };
  store.rpc_get_vmp_dashboard = {
    ...store.rpc_get_vmp_dashboard,
    activities: all,
  };
  store.rpc_dashboard_kpi = server;
  store.rpc_check_data_quality = Array.from({ length: 4 }, (_, index) => ({
    id: `server-${index + 1}`, type: "server_rule", severity: "warning", msg: "Server rule",
  }));

  return {
    active, outside, total,
    activePayloadPreserved: JSON.stringify(all.slice(0, original.length)) === JSON.stringify(original),
  };
}

function comparisonRows(page) {
  return page.$$eval("[data-health-comparison] tbody tr", (rows) => rows.map((row) =>
    [...row.querySelectorAll("th, td")].map((cell) => cell.textContent?.trim() || ""),
  ));
}

function countCalls(calls, name) {
  return (calls[name] || []).length;
}

async function openHealth(browser, { filtered = false, failServer = false } = {}) {
  const page = await browser.newPage();
  const calls = {};
  const pageErrors = [];
  page.on("request", (request) => {
    if (request.method() === "OPTIONS") return;
    const rpc = request.url().match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/i)?.[1];
    if (rpc) (calls[rpc] ||= []).push(request.postData() || "");
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  let fixture;
  let store;
  const network = await caiGiaLap(page, {
    supabaseUrl: SUPABASE_URL,
    kichBan: "day",
    mangNghiemNgat: true,
    previewOrigin: APP_URL,
    suaKho: (mockStore) => {
      store = mockStore;
      fixture = appendNonApplicableRows(store);
      if (failServer) store.rpc_errors = { rpc_dashboard_kpi: { status: 500, message: "KPI failure fixture" } };
    },
  });
  await nhetPhien(page, { supabaseUrl: SUPABASE_URL });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}#v=health${filtered ? "&dept=xsx" : ""}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("[data-health-comparison]", { timeout: 15_000 });
  await page.waitForFunction(() => !document.querySelector("[data-health-refresh]")?.hasAttribute("disabled"), { timeout: 15_000 });
  return { page, calls, pageErrors, fixture, network, store };
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

try {
  {
    const { page, calls, pageErrors, fixture, network } = await openHealth(browser);
    try {
      const rows = await comparisonRows(page);
      const expectedValidationRows = [
        ["Hạng mục hoàn thành VMP", fixture.active.done, fixture.outside.done, fixture.total.done],
        ["Tổng hạng mục", fixture.active.total, fixture.outside.total, fixture.total.total],
        ["Hạng mục quá hạn", fixture.active.over, fixture.outside.over, fixture.total.over],
      ];
      for (const [label, active, outside, server] of expectedValidationRows) {
        assert.deepEqual(rows.find(([actual]) => actual === label), [label, String(active), String(outside), String(server), "khớp"],
          `${label} preserves its active value and explains the complete server value with the non-active contribution`);
      }
      assert.equal(fixture.active.total, 24, "the base active fixture remains the original 24 records");
      assert.equal(fixture.outside.total, 13, "all appended not_applicable records contribute outside KPI");
      assert.equal(fixture.total.total, 37, "server aggregate uses the full authorised population");
      const conclusion = await page.$eval("[data-health-conclusion]", (node) => node.textContent || "");
      assert.match(conclusion, /còn khác|chưa thể kết luận bên nào sai/i,
        "a true residual mismatch remains visible instead of declaring all data reconciled");
      assert.doesNotMatch(await page.$eval("main", (node) => node.textContent || ""), /\+221|máy chủ luôn đúng/i,
        "the old unexplained delta and blanket server-authority claim are absent");
      assert.equal(await page.$eval("[data-health-client-issues]", (node) => node.textContent?.trim()), "8",
        "client quality issue count remains separate from server rules");
      assert.equal(await page.$eval("[data-health-server-issues]", (node) => node.textContent?.trim()), "4",
        "server quality issue count remains separately numbered");
      assert.equal(fixture.activePayloadPreserved, true,
        "appending the diagnostic rows never mutates any original active fixture value");

      const beforeDashboard = countCalls(calls, "rpc_get_vmp_dashboard_v2");
      const beforeKpi = countCalls(calls, "rpc_dashboard_kpi");
      await page.click("[data-health-refresh]");
      await page.waitForFunction(() => !document.querySelector("[data-health-refresh]")?.hasAttribute("disabled"), { timeout: 15_000 });
      assert.ok(countCalls(calls, "rpc_get_vmp_dashboard_v2") > beforeDashboard,
        "refresh reloads the authorised client dashboard rather than only reusing the comparison state");
      assert.ok(countCalls(calls, "rpc_dashboard_kpi") > beforeKpi,
        "refresh requests a fresh server KPI alongside client reload");
      assert.deepEqual(network.chanNgoai, [], "the strict fixture permits no network beyond preview and mocked Supabase");
      assert.deepEqual(pageErrors, [], "the reconciliation path has no browser exceptions");
    } finally {
      await page.close();
    }
  }

  {
    const { page, network } = await openHealth(browser, { filtered: true });
    try {
      const conclusion = await page.$eval("[data-health-conclusion]", (node) => node.textContent || "");
      assert.match(conclusion, /chưa cùng phạm vi|chưa thể kết luận/i,
        "a filtered Health view suppresses the integrity-match claim");
      assert.doesNotMatch(conclusion, /Các chỉ số khớp/i,
        "a filtered population is never presented as reconciled");
      assert.deepEqual(network.chanNgoai, [], "filtered reconciliation also stays inside the strict mock boundary");
    } finally {
      await page.close();
    }
  }

  {
    const { page, network } = await openHealth(browser, { failServer: true });
    try {
      const conclusion = await page.$eval("[data-health-conclusion]", (node) => node.textContent || "");
      const main = await page.$eval("main", (node) => node.textContent || "");
      assert.match(main, /chưa có đủ dữ liệu để kết luận/i,
        "a failed server KPI read tells the operator that reconciliation is unavailable");
      assert.doesNotMatch(conclusion, /Các chỉ số khớp/i,
        "an RPC failure never claims a match");
      assert.deepEqual(network.chanNgoai, [], "failed reconciliation retains the strict network boundary");
    } finally {
      await page.close();
    }
  }

  {
    const { page, network, store } = await openHealth(browser);
    try {
      store.rpc_errors = {
        rpc_get_vmp_dashboard_v2: { status: 500, message: "Client dashboard failure fixture" },
      };
      await page.click("[data-health-refresh]");
      await page.waitForFunction(() => !document.querySelector("[data-health-refresh]")?.hasAttribute("disabled"), { timeout: 15_000 });
      const conclusion = await page.$eval("[data-health-conclusion]", (node) => node.textContent || "");
      const main = await page.$eval("main", (node) => node.textContent || "");
      assert.match(conclusion, /Chưa tải được dữ liệu bản đang xem|chưa thể đối chiếu/i,
        "a failed client reload marks the client population unavailable even while the server KPI can still respond");
      assert.match(main, /chưa có đủ dữ liệu để kết luận|chưa thể đối chiếu/i,
        "the refresh failure is visible to the operator instead of rendering a zero-data result");
      assert.doesNotMatch(conclusion, /Các chỉ số khớp/i,
        "a client reload failure never claims that the two sources match");
      assert.equal(await page.$eval("[data-health-client-issues]", node => node.textContent?.trim()), "Chưa tải được",
        "a failed client read does not manufacture a zero-warning count");
      assert.deepEqual(network.chanNgoai, [], "client refresh failure remains inside the strict mock boundary");
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log("PASS health reconciliation browser contract");

/* =====================================================================
 * Field-performance browser contract
 *
 * The browser, rather than a synthetic unit fixture, proves that a real
 * interaction produces a bounded and private web-vitals RPC payload and that
 * the lazy admin reader handles each server state.  The shared Supabase mock
 * remains strict: no production or third-party request is permitted.
 * ===================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien, NGUOI_DUNG } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || readFileSync(
  fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8",
).match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();

assert.ok(supabaseUrl, "test requires public mock endpoint");

const SUMMARY = {
  ok: true,
  days: 7,
  rows: [
    { metric: "INP", device: "desktop", screen: "today", samples: 12, p75: 180 },
    { metric: "LCP", device: "desktop", screen: "overview", samples: 8, p75: 2100 },
  ],
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function adminFixture(kho, { summary = SUMMARY, summaryError } = {}) {
  kho.rpc_web_vitals_summary = summary;
  if (summaryError) {
    kho.rpc_errors = { ...(kho.rpc_errors || {}), rpc_web_vitals_summary: summaryError };
  }
}

async function openPage(browser, { hash, suaKho, calls }) {
  const page = await browser.newPage();
  const outside = [];
  const pageErrors = [];
  page.on("request", (request) => {
    if (request.method() === "OPTIONS") return;
    const rpc = request.url().match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/i)?.[1];
    if (rpc) (calls[rpc] ||= []).push({ body: request.postData() || "" });
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const mocked = await caiGiaLap(page, {
    supabaseUrl,
    kichBan: "day",
    suaKho,
    mangNghiemNgat: true,
    previewOrigin: APP_URL,
  });
  outside.push(...mocked.chanNgoai);
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}#v=${hash}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  return { page, outside, pageErrors };
}

function telemetryBodies(calls) {
  return (calls.rpc_record_web_vitals || []).map(({ body }) => JSON.parse(body));
}

function assertPrivateBoundedTelemetry(bodies) {
  assert.ok(bodies.length >= 1, "a real user interaction must send web-vitals telemetry");
  assert.ok(bodies.length <= 10, "a document must make at most ten telemetry requests");
  for (const body of bodies) {
    assert.deepEqual(Object.keys(body).sort(), ["p_device", "p_metrics", "p_page_id", "p_screen"],
      "telemetry payload contains only the four allowlisted fields");
    assert.match(body.p_page_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      "page id is a UUID, never a URL-derived identifier");
    assert.equal(body.p_screen, "overview", "the initial allowlisted screen is retained");
    assert.equal(body.p_device, "desktop", "desktop viewport reports the coarse desktop device class");
    assert.ok(Array.isArray(body.p_metrics) && body.p_metrics.length >= 1 && body.p_metrics.length <= 3,
      "each telemetry batch contains one to three metrics");
    for (const metric of body.p_metrics) {
      assert.deepEqual(Object.keys(metric).sort(), ["name", "value"], "metric has no metadata beyond name and value");
      assert.ok(["LCP", "INP", "CLS"].includes(metric.name), "metric name is allowlisted");
      assert.ok(Number.isFinite(metric.value) && metric.value >= 0, "metric value is finite and non-negative");
    }
    const serialized = JSON.stringify(body).toLowerCase();
    for (const privateValue of ["kiem-thu@vi-du.test", "private-query", "private-hash", "vmp-main-content"]) {
      assert.ok(!serialized.includes(privateValue), `telemetry never includes ${privateValue}`);
    }
  }
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
try {
  /* A real Overview click must be represented by INP when the document is
     hidden.  Navigate away (rather than inventing a metric value or changing
     a browser clock) so the production pagehide/visibility handler runs. */
  {
    const calls = {};
    const { page, outside, pageErrors } = await openPage(browser, { hash: "overview&private-query=private-hash", calls });
    await page.waitForSelector("[data-overview-analysis-studio]", { timeout: 15_000 });
    // The route must become interactive after the separately-loaded observer
    // has attached; this is a real readiness wait, never a fabricated metric.
    await wait(500);
    await page.click("[data-analysis-matrix-cell]");
    await page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
    await page.keyboard.press("Escape");
    // Exercise the production ten-second pending flush with wall-clock time.
    await wait(10_750);
    await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: 10_000 });
    await wait(750);

    const bodies = telemetryBodies(calls);
    assertPrivateBoundedTelemetry(bodies);
    assert.ok(bodies.some((body) => body.p_metrics.some((metric) => metric.name === "INP")),
      "the actual matrix click yields an INP measurement");
    assert.deepEqual(outside, [], "strict mock blocks all non-preview, non-Supabase network traffic");
    assert.deepEqual(pageErrors.filter((message) => !/localStorage.+Access is denied/i.test(message)), [],
      "web-vitals collection does not cause browser exceptions");
    await page.close();
  }

  /* The reader is lazy on the admin screen, renders server aggregates, and
     refreshes without using client timings as a substitute for server data. */
  {
    const calls = {};
    const { page, outside, pageErrors } = await openPage(browser, {
      hash: "admin", calls, suaKho: (kho) => adminFixture(kho),
    });
    await page.waitForSelector("[data-field-performance-panel]", { timeout: 15_000 });
    await page.waitForSelector('[data-field-performance-state="ready"]', { timeout: 10_000 });
    const text = await page.$eval("[data-field-performance-panel]", (node) => node.textContent || "");
    assert.match(text, /Hiệu năng thực tế/, "admin labels the real-field-performance panel in Vietnamese");
    assert.match(text, /INP/, "admin renders metric code alongside its Vietnamese label");
    assert.match(text, /180/, "admin renders the aggregate p75 returned by the server");
    assert.equal((calls.rpc_web_vitals_summary || []).length, 1, "admin loads aggregates once initially");
    await page.click("[data-field-performance-refresh]");
    await page.waitForFunction(() => document.querySelector('[data-field-performance-refresh]')?.textContent?.includes("Làm mới số đo"));
    await page.waitForFunction(() => document.querySelector('[data-field-performance-state="ready"]') !== null);
    assert.equal((calls.rpc_web_vitals_summary || []).length, 2, "refresh requests a fresh aggregate exactly once");
    assert.deepEqual(outside, [], "admin aggregate reader keeps strict network boundary");
    assert.deepEqual(pageErrors, [], "admin aggregate reader has no browser exceptions");
    await page.close();
  }

  for (const scenario of [
    ["empty", { summary: { ok: true, days: 7, rows: [] } }, /Chưa có số đo/],
    ["forbidden", { summaryError: { status: 403, code: "42501", message: "Không có quyền xem số đo" } }, /không có quyền/i],
    ["unavailable", { summaryError: { status: 404, code: "PGRST202", message: "Could not find the function public.rpc_web_vitals_summary" } }, /không khả dụng|chưa sẵn sàng/i],
  ]) {
    const [state, fixture, expectedText] = scenario;
    const calls = {};
    const { page, outside } = await openPage(browser, {
      hash: "admin", calls, suaKho: (kho) => adminFixture(kho, fixture),
    });
    await page.waitForSelector(`[data-field-performance-state="${state}"]`, { timeout: 15_000 });
    const text = await page.$eval("[data-field-performance-panel]", (node) => node.textContent || "");
    assert.match(text, expectedText, `${state} state explains the aggregate result in Vietnamese`);
    assert.equal((calls.rpc_web_vitals_summary || []).length, 1, `${state} is a single lazy aggregate read`);
    assert.deepEqual(outside, [], `${state} retains strict network boundary`);
    await page.close();
  }

  /* If a release precedes the additive RPC, collection fails closed.  The
     timer is allowed to fire naturally; then a second lifecycle event must not
     create a retry loop or interrupt the user. */
  {
    const calls = {};
    const { page, outside, pageErrors } = await openPage(browser, {
      hash: "overview", calls,
      suaKho: (kho) => {
        kho.rpc_errors = {
          ...(kho.rpc_errors || {}),
          rpc_record_web_vitals: { status: 404, message: "Could not find the function public.rpc_record_web_vitals" },
        };
      },
    });
    await page.waitForSelector("[data-overview-analysis-studio]", { timeout: 15_000 });
    await wait(500);
    await page.click("[data-analysis-matrix-cell]");
    await page.keyboard.press("Escape");
    await wait(10_750);
    await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: 10_000 });
    await wait(750);
    assert.equal((calls.rpc_record_web_vitals || []).length, 1,
      "missing telemetry RPC disables the collector after its first failed attempt");
    assert.deepEqual(outside, [], "missing telemetry RPC does not fall back to another endpoint");
    assert.deepEqual(pageErrors.filter((message) => !/localStorage.+Access is denied/i.test(message)), [],
      "missing telemetry RPC never breaks the application");
    await page.close();
  }
} finally {
  await browser.close();
}

console.log("PASS field performance browser contract");

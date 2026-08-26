/* =====================================================================
 *  timeline-deadline-edit.mjs — planned-deadline manual edit boundary
 *  ---------------------------------------------------------------------
 *  Build this suite with VITE_MANUAL_PLANNED_DEADLINES_ENABLED=true.
 *  It stays inside the browser Supabase mock: no request may reach a real
 *  service. Every wait is DOM/request polling; this suite has no sleeps.
 * ===================================================================== */
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const ROOT_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const VALIDATION_CODE = "TB-100-IQ";
const REASON = "Điều chỉnh theo biên bản QA-26/08";
const CONFIRMATION = "Tôi xác nhận chỉ đổi bốn deadline kế hoạch; ngày thực tế, trạng thái, người thực hiện và mã hạng mục giữ nguyên.";
const UPDATED_VMP = "2026-09-16";
const PROTECTED_EVIDENCE = {
  actual_protocol_date: "2026-08-01",
  actual_validation_date: "2026-08-03",
  actual_report_date: "2026-08-05",
  actual_vmp_date: "2026-08-07",
  status_protocol: "completed",
  status_validation: "completed",
  status_report: "planned",
  status_vmp: "planned",
};

const SUPABASE_URL = (() => {
  const env = readFileSync(new URL("../../.env.local", import.meta.url).pathname, "utf8");
  const match = env.match(/^VITE_SUPABASE_URL=(.+)$/m);
  if (!match) throw new Error(".env.local thiếu VITE_SUPABASE_URL");
  return match[1].trim();
})();

let passed = 0;
let failed = 0;

function check(condition, title, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`  ✗ ${title}${detail ? ` — ${detail}` : ""}`);
}

function setBusinessRole(store, role) {
  store.rpc_my_ui_access = {
    ...store.rpc_my_ui_access,
    business_role: role,
  };
}

function restrictToManualDeadlineFixture(store) {
  store.rpc_get_vmp_dashboard = {
    ...store.rpc_get_vmp_dashboard,
    activities: [store.rpc_get_vmp_dashboard.activities[0]],
  };
}

function responseFor(errorCode, error, additions = {}) {
  return {
    ok: false,
    error_code: errorCode,
    error,
    validation_code: VALIDATION_CODE,
    ...additions,
  };
}

async function openPage(browser, {
  role = "admin",
  width = 1440,
  rpcResult,
  rpcError,
  delay,
} = {}) {
  const page = await browser.newPage();
  const rpcBodies = [];
  const rpcNames = [];

  page.on("request", (request) => {
    const rpc = new URL(request.url()).pathname.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/i)?.[1];
    if (!rpc || request.method() === "OPTIONS") return;
    rpcNames.push(rpc);
    if (rpc !== "rpc_update_planned_deadlines") return;
    try {
      rpcBodies.push(JSON.parse(request.postData() || "null"));
    } catch {
      rpcBodies.push(null);
    }
  });

  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem("vmp_monitor_user_v1");
    localStorage.removeItem("vmp_snapshot_v2");
  });
  const { chanNgoai } = await caiGiaLap(page, {
    supabaseUrl: SUPABASE_URL,
    kichBan: "day",
    doTre: delay ? { rpc_update_planned_deadlines: delay } : undefined,
    suaKho(store) {
      restrictToManualDeadlineFixture(store);
      setBusinessRole(store, role);
      if (rpcResult) store.rpc_update_planned_deadlines = rpcResult;
      if (rpcError) {
        store.rpc_errors = {
          ...(store.rpc_errors || {}),
          rpc_update_planned_deadlines: rpcError,
        };
      }
    },
  });
  await nhetPhien(page, { supabaseUrl: SUPABASE_URL });
  await page.setViewport({ width, height: 900 });
  await page.goto(`${ROOT_URL}#v=timeline`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => button.textContent?.trim() === "Dòng thời gian"), { timeout: 15_000 });
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Dòng thời gian")?.click());
  await page.waitForSelector(".timeline-day-row", { timeout: 15_000 });

  return { page, rpcBodies, rpcNames, externalRequests: chanNgoai };
}

async function openDialog(page) {
  await page.evaluate((code) => [...document.querySelectorAll(".timeline-day-row")]
    .find((row) => row.textContent?.includes(code))?.click(), VALIDATION_CODE);
  await page.waitForSelector("[data-timeline-edit-planned-deadlines]", { timeout: 10_000 });
  await page.click("[data-timeline-edit-planned-deadlines]");
  await page.waitForSelector("[data-planned-deadline-dialog]", { timeout: 10_000 });
}

async function setInputValue(page, selector, value) {
  await page.evaluate((target, nextValue) => {
    const input = document.querySelector(target);
    if (!(input instanceof HTMLInputElement)) throw new Error(`Missing input: ${target}`);
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(input, nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, selector, value);
  await page.waitForFunction((target, nextValue) => document.querySelector(target)?.value === nextValue,
    { timeout: 10_000 }, selector, value);
}

async function fillValidDraft(page, vmp = UPDATED_VMP) {
  await setInputValue(page, '[data-planned-deadline-input="deadline_vmp"]', vmp);
  await setInputValue(page, 'input[aria-label="Lý do chỉnh deadline kế hoạch"]', REASON);
  await page.click("[data-planned-deadline-confirmation]");
  await page.waitForFunction(() => {
    const checkbox = document.querySelector("[data-planned-deadline-confirmation]");
    const submit = document.querySelector("[data-planned-deadline-submit]");
    return checkbox?.checked === true && submit instanceof HTMLButtonElement && !submit.disabled;
  }, { timeout: 10_000 });
}

async function evidence(page) {
  return page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll("[data-planned-deadline-protected]")]
      .map((node) => [
        node.getAttribute("data-planned-deadline-protected"),
        node.textContent?.split(": ")[1]?.trim(),
      ]),
  ));
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

/* Admin uses narrow-detail entry; QA manager uses the wide inspector entry.
 * Both must emit exactly the same one-RPC payload and refresh planned-only. */
for (const { role, width, label } of [
  { role: "admin", width: 1440, label: "admin/narrow" },
  { role: "qa_manager", width: 1700, label: "qa_manager/wide" },
]) {
  const state = await openPage(browser, { role, width });
  const { page, rpcBodies, externalRequests } = state;
  await openDialog(page);

  check(await page.evaluate((confirmation) => document.body.innerText.includes(confirmation), CONFIRMATION),
    `${label} sees the manual-edit confirmation`);
  check(JSON.stringify(await evidence(page)) === JSON.stringify(PROTECTED_EVIDENCE),
    `${label} sees all eight protected values`, JSON.stringify(await evidence(page)));

  await fillValidDraft(page);
  await page.click("[data-planned-deadline-submit]");
  await page.waitForFunction(() => document.body.innerText.includes("Đã cập nhật deadline kế hoạch"),
    { timeout: 10_000 });
  await page.waitForFunction(() => !document.querySelector("[data-planned-deadline-dialog]"),
    { timeout: 10_000 });

  check(rpcBodies.length === 1, `${label} submits exactly one mutation`, JSON.stringify(rpcBodies));
  check(JSON.stringify(rpcBodies[0]) === JSON.stringify({
    p_validation_code: VALIDATION_CODE,
    p_deadlines: {
      deadline_protocol: "2026-09-01",
      deadline_validation: "2026-09-05",
      deadline_report: "2026-09-10",
      deadline_vmp: UPDATED_VMP,
    },
    p_reason: REASON,
    p_expected_version: 7,
    p_confirmed: true,
  }), `${label} sends exact five-parameter RPC payload`, JSON.stringify(rpcBodies[0]));

  await openDialog(page);
  check(await page.$eval('[data-planned-deadline-input="deadline_vmp"]', (input) => input.value) === UPDATED_VMP,
    `${label} refreshes the new planned deadline`);
  check(JSON.stringify(await evidence(page)) === JSON.stringify(PROTECTED_EVIDENCE),
    `${label} refresh leaves protected evidence unchanged`, JSON.stringify(await evidence(page)));
  check(externalRequests.length === 0, `${label} does not call outside the mock`, externalRequests[0] || "");
  await page.close();
}

/* Presentation gate is not authorization, but no denied persona gets a
 * clickable manual-write action even when the test build enables the flag. */
{
  const { page } = await openPage(browser, { role: "qa_staff", width: 1440 });
  await page.evaluate((code) => [...document.querySelectorAll(".timeline-day-row")]
    .find((row) => row.textContent?.includes(code))?.click(), VALIDATION_CODE);
  await page.waitForFunction(() => document.body.innerText.includes("Chi tiết hạng mục"),
    { timeout: 10_000 });
  check(await page.$("[data-timeline-edit-planned-deadlines]") === null,
    "denied role has no planned-deadline action");
  await page.close();
}

/* Client blockers never cross the network boundary. */
{
  const { page, rpcBodies } = await openPage(browser);
  await openDialog(page);
  check(await page.$eval("[data-planned-deadline-submit]", (button) => button.disabled),
    "reason and confirmation initially block submit");

  await setInputValue(page, '[data-planned-deadline-input="deadline_vmp"]', UPDATED_VMP);
  check(await page.$eval("[data-planned-deadline-submit]", (button) => button.disabled),
    "reason blocks an otherwise valid planned-deadline change");

  await setInputValue(page, 'input[aria-label="Lý do chỉnh deadline kế hoạch"]', REASON);
  check(await page.$eval("[data-planned-deadline-submit]", (button) => button.disabled),
    "confirmation blocks submit after reason is supplied");

  await page.click("[data-planned-deadline-confirmation]");
  await page.waitForFunction(() => !document.querySelector("[data-planned-deadline-submit]")?.disabled,
    { timeout: 10_000 });
  await setInputValue(page, '[data-planned-deadline-input="deadline_protocol"]', "2026-09-06");
  await page.waitForFunction(() => document.querySelector("[data-planned-deadline-submit]")?.disabled === true,
    { timeout: 10_000 });
  check(true, "out-of-order deadline blocks submit");

  await setInputValue(page, '[data-planned-deadline-input="deadline_protocol"]', "");
  await page.waitForFunction(() => document.querySelector("[data-planned-deadline-submit]")?.disabled === true,
    { timeout: 10_000 });
  check(rpcBodies.length === 0, "reason/confirmation/order/erasure blockers make no mutation");
  await page.close();
}

/* Conflict is visible with both versions, draft remains, and reload is an
 * explicit close-then-refresh action. */
{
  const conflict = responseFor("VERSION_CONFLICT", "Dữ liệu đã đổi", {
    expected_version: 7,
    current_version: 9,
    requires_reload: true,
  });
  const { page, rpcBodies } = await openPage(browser, { rpcResult: () => conflict });
  await openDialog(page);
  await fillValidDraft(page);
  await page.click("[data-planned-deadline-submit]");
  await page.waitForFunction(() => document.querySelector("[data-planned-deadline-error]")?.textContent
    ?.includes("phiên bản đã tải 7; hiện tại 9"), { timeout: 10_000 });

  check(await page.$eval('[data-planned-deadline-input="deadline_vmp"]', (input) => input.value) === UPDATED_VMP,
    "conflict retains edited deadline draft");
  check(await page.$eval('input[aria-label="Lý do chỉnh deadline kế hoạch"]', (input) => input.value) === REASON,
    "conflict retains reason draft");
  check(await page.$eval("[data-planned-deadline-confirmation]", (input) => input.checked),
    "conflict retains confirmation draft");
  check(rpcBodies.length === 1, "conflict does not retry automatically");

  const refresh = page.waitForRequest((request) => /\/rpc\/rpc_get_vmp_dashboard/.test(request.url()), {
    timeout: 10_000,
  });
  await page.click("[data-planned-deadline-reload]");
  await refresh;
  await page.waitForFunction(() => !document.querySelector("[data-planned-deadline-dialog]"),
    { timeout: 10_000 });
  check(rpcBodies.length === 1, "explicit conflict reload does not repeat mutation");
  await page.close();
}

/* Domain failures and transport/PostgREST failures keep the controlled draft
 * and protected evidence visible. */
for (const scenario of [
  {
    label: "server item-state failure",
    rpcResult: () => responseFor("ITEM_STATE_INACTIVE", "Hạng mục đã ngừng hoạt động"),
    expected: "Hạng mục đã ngừng hoạt động",
  },
  {
    label: "server protected-field mismatch",
    rpcResult: () => responseFor("WRITE_MISMATCH", "Ngày thực tế phải giữ nguyên"),
    expected: "Ngày thực tế phải giữ nguyên",
  },
  {
    label: "transport failure",
    rpcError: { status: 503, message: "Mạng Supabase bị ngắt" },
    expected: "Mạng Supabase bị ngắt",
  },
]) {
  const { page, rpcBodies } = await openPage(browser, scenario);
  await openDialog(page);
  await fillValidDraft(page);
  await page.click("[data-planned-deadline-submit]");
  await page.waitForFunction((message) => document.querySelector("[data-planned-deadline-error]")?.textContent
    ?.includes(message), { timeout: 10_000 }, scenario.expected);

  check(await page.$("[data-planned-deadline-dialog]") !== null,
    `${scenario.label} keeps dialog open`);
  check(await page.$eval('[data-planned-deadline-input="deadline_vmp"]', (input) => input.value) === UPDATED_VMP,
    `${scenario.label} keeps edited draft`);
  check(JSON.stringify(await evidence(page)) === JSON.stringify(PROTECTED_EVIDENCE),
    `${scenario.label} keeps protected evidence`);
  check(rpcBodies.length === 1, `${scenario.label} has no retry`);
  await page.close();
}

/* A delayed response proves the ref lock wins before React renders disabled
 * controls: duplicate save, header close, footer close, backdrop, and Escape
 * do not issue another request or dismiss the pending dialog. */
{
  const { page, rpcBodies } = await openPage(browser, { delay: 300 });
  await openDialog(page);
  await fillValidDraft(page);
  await page.evaluate(() => {
    const submit = document.querySelector("[data-planned-deadline-submit]");
    const footerClose = [...document.querySelectorAll(".lp-dialog__footer button")]
      .find((button) => button.textContent?.trim() === "Đóng");
    const headerClose = document.querySelector(".lp-dialog__close");
    submit?.click();
    submit?.click();
    footerClose?.click();
    headerClose?.click();
    document.querySelector(".lp-dialog")?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true }),
    );
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector("[data-planned-deadline-dialog]") !== null,
    { timeout: 10_000 });
  await page.waitForFunction(() => document.body.innerText.includes("Đã cập nhật deadline kế hoạch"),
    { timeout: 10_000 });
  await page.waitForFunction(() => !document.querySelector("[data-planned-deadline-dialog]"),
    { timeout: 10_000 });
  check(rpcBodies.length === 1,
    "duplicate submit and footer/header/backdrop/Escape pending issue one mutation",
    JSON.stringify(rpcBodies));
  await page.close();
}

await browser.close();

console.log(`\n${"─".repeat(52)}`);
console.log(`${passed} đạt · ${failed} hỏng`);
if (failed > 0) {
  console.error("KHÔNG ĐẠT.");
  process.exit(1);
}
console.log("ĐẠT.");

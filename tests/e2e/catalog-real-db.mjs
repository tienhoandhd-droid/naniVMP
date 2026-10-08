/* Browser -> Supabase HTTP contract -> disposable PostgREST regression.
 *
 * This runner intentionally mocks only Supabase Auth's /user response. Every
 * /rest/v1 request is forwarded, with the browser's original Authorization
 * header and body, to the disposable local PostgREST supplied by the primary
 * test harness. It must never be pointed at a production database.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";

const CONFIG_PATH = process.env.VMP_REAL_CONFIG;
if (!CONFIG_PATH) throw new Error("VMP_REAL_CONFIG is required");

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const web = new URL(config.webUrl);
const supabase = new URL(config.supabaseUrl);
const rest = new URL(config.restUrl);
const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
if (!localHosts.has(web.hostname)) throw new Error("webUrl must be loopback");
if (rest.protocol !== "http:" || rest.hostname !== "127.0.0.1" || rest.port !== "15431") {
  throw new Error("restUrl must be http://127.0.0.1:15431");
}
if (!config.evidenceDir) throw new Error("evidenceDir is required");

const allowedRoles = ["admin", "qa_manager", "qa_staff", "workshop_manager", "workshop_staff", "inactive"];
const sourceKinds = ["Thiết bị", "Quy trình", "Kho", "Hệ thống phụ trợ", "Vận chuyển"];
for (const role of allowedRoles) {
  const session = config.users?.[role]?.session;
  if (!session?.access_token || !session?.user?.id) throw new Error(`Missing signed session for ${role}`);
}

const runId = `${Date.now()}-${process.pid}`;
const requestedSection = process.env.VMP_REAL_SECTION || "all";
assert(["all", "source", "products", "alerts", "denials"].includes(requestedSection),
  `Unknown VMP_REAL_SECTION: ${requestedSection}`);
const receipt = {
  schema: "vmp.catalog-real-db.v1",
  runId,
  webOrigin: web.origin,
  restTarget: rest.origin,
  roles: {},
  rpcCalls: [],
  networkEvents: [],
  blockedExternal: [],
  result: "RUNNING",
};
const receiptPath = join(resolve(config.evidenceDir), `catalog-real-db-${runId}.json`);
mkdirSync(resolve(config.evidenceDir), { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function replaceInput(page, selector, value) {
  await page.$eval(selector, (element, exact) => {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) throw new Error("Native value setter is unavailable");
    setter.call(element, exact);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  await page.waitForFunction((wanted, exact) => document.querySelector(wanted)?.value === exact,
    { timeout: 5_000 }, selector, value);
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function safeRpcObservation(role, url, method, body, status, responseText) {
  const rpc = new URL(url).pathname.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/i)?.[1];
  if (!rpc) return;
  const parsedResponse = parseJson(responseText);
  receipt.rpcCalls.push({
    role,
    rpc,
    method,
    body: parseJson(body || "null"),
    status,
    response: parsedResponse && typeof parsedResponse === "object" ? {
      ok: parsedResponse.ok,
      error_code: parsedResponse.error_code,
      object_code: typeof parsedResponse.object_code === "string" && parsedResponse.object_code.startsWith("CRUD-E2E-")
        ? parsedResponse.object_code : undefined,
      version: parsedResponse.version,
      change_id: parsedResponse.change_id,
      pending_timeline: parsedResponse.pending_timeline,
      timeline_revision: parsedResponse.timeline_revision,
    } : null,
  });
}

function networkObservation(role, request, status, responseText = "") {
  const url = new URL(request.url());
  const event = { role, method: request.method(), path: `${url.pathname}${url.search}`, status };
  if (status >= 400) {
    const parsed = parseJson(responseText);
    event.error = parsed && typeof parsed === "object"
      ? { code: parsed.code ?? parsed.error_code, message: String(parsed.message ?? parsed.error ?? "").slice(0, 240) }
      : String(responseText).slice(0, 240);
  }
  receipt.networkEvents.push(event);
}

async function captureFailure(page, role, error) {
  const screenshot = join(resolve(config.evidenceDir), `catalog-real-db-${runId}-${role}-failure.png`);
  try { await page.screenshot({ path: screenshot, fullPage: true }); } catch {}
  let dom = null;
  try {
    const hasSuccessfulRest = receipt.networkEvents.some((event) => event.role === role
      && event.path.startsWith("/rest/v1/") && event.status >= 200 && event.status < 300);
    dom = await page.evaluate((includeBody) => ({
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      body: includeBody ? (document.body?.innerText ?? "").slice(0, 1500) : undefined,
      alerts: [...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent?.trim()).filter(Boolean).slice(0, 10),
      sourceGuide: !!document.querySelector("[data-cw-source-guide]"),
      addControl: !!document.querySelector("[data-cw-them]"),
      storageKeys: Object.keys(localStorage).sort(),
      formValues: [...document.querySelectorAll('input[id^="cof-"], input[id^="cw-"]')]
        .slice(0, 30).map((input) => ({ id: input.id, value: input.value, checked: input.type === "checkbox" ? input.checked : undefined })),
    }), !hasSuccessfulRest);
  } catch {}
  receipt.roles[role] = {
    ...(receipt.roles[role] ?? {}),
    diagnostic: {
      error: error instanceof Error ? error.message : String(error),
      screenshot: basename(screenshot),
      dom,
      pageErrors: page.__vmpPageErrors ?? [],
    },
  };
}

async function configurePage(page, role) {
  const session = config.users[role].session;
  const blocked = [];
  const proxyFailures = [];
  const projectRef = supabase.hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  page.__vmpPageErrors = [];
  page.on("pageerror", (event) => page.__vmpPageErrors.push(`pageerror: ${event.message}`.slice(0, 300)));
  page.on("console", (event) => {
    if (event.type() === "error") page.__vmpPageErrors.push(`console: ${event.text()}`.slice(0, 300));
  });

  await page.evaluateOnNewDocument((key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, storageKey, session);
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    const url = new URL(request.url());
    try {
      if (url.origin === web.origin || url.protocol === "data:" || url.protocol === "blob:") {
        await request.continue();
        return;
      }
      if (url.origin !== supabase.origin) {
        blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
        await request.abort("blockedbyclient");
        return;
      }
      if (url.pathname === "/auth/v1/user" && request.method() === "OPTIONS") {
        const requestedHeaders = request.headers()["access-control-request-headers"]
          || "authorization, x-client-info, apikey, content-type, x-supabase-api-version";
        networkObservation(role, request, 204);
        await request.respond({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, OPTIONS",
            "access-control-allow-headers": requestedHeaders,
          },
          body: "",
        });
        return;
      }
      if (url.pathname === "/auth/v1/user" && request.method() === "GET") {
        networkObservation(role, request, 200);
        await request.respond({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify(session.user),
        });
        return;
      }
      if (!url.pathname.startsWith("/rest/v1/")) {
        blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
        await request.abort("blockedbyclient");
        return;
      }

      const target = new URL(url.pathname.slice("/rest/v1".length) + url.search, rest);
      const sourceHeaders = request.headers();
      const forwardedHeaders = {};
      for (const [key, value] of Object.entries(sourceHeaders)) {
        if (["host", "content-length", "connection", "accept-encoding"].includes(key.toLowerCase())) continue;
        forwardedHeaders[key] = value;
      }
      const method = request.method();
      const body = request.postData();
      const response = await fetch(target, {
        method,
        headers: forwardedHeaders,
        body: method === "GET" || method === "HEAD" ? undefined : body,
      });
      const responseText = await response.text();
      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(key.toLowerCase())) {
          responseHeaders[key] = value;
        }
      });
      responseHeaders["access-control-allow-origin"] = "*";
      networkObservation(role, request, response.status, responseText);
      safeRpcObservation(role, request.url(), method, body, response.status, responseText);
      await request.respond({ status: response.status, headers: responseHeaders, body: responseText });
    } catch (error) {
      proxyFailures.push(`${request.method()} ${url.pathname}: ${error instanceof Error ? error.message : String(error)}`);
      networkObservation(role, request, 502, JSON.stringify({ message: error instanceof Error ? error.message : String(error) }));
      try { await request.respond({ status: 502, contentType: "application/json", body: '{"message":"local proxy failed"}' }); } catch {}
    }
  });
  return { blocked, proxyFailures };
}

async function openRole(browser, role) {
  const page = await browser.newPage();
  const network = await configurePage(page, role);
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(new URL("#v=source", web).href, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => document.readyState === "complete", { timeout: 15_000 });
  return { page, network };
}

async function waitForSourceSettled(page, role = null) {
  await page.waitForFunction((expectedRole) => {
    const text = document.body?.innerText ?? "";
    if (expectedRole === "inactive") {
      return text.includes("Chưa xác minh được quyền truy cập")
        && [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Thử lại"))
        && [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Thoát tài khoản"));
    }
    return !!document.querySelector("[data-cw-source-guide]")
      || /không có quyền|không được phép|tài khoản.*(khóa|vô hiệu)/i.test(text);
  }, { timeout: 20_000 }, role);
}

async function searchFor(page, value) {
  const selector = 'input[aria-label="Tìm trong danh mục"]';
  await page.waitForSelector(selector, { timeout: 20_000 });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value);
  await page.waitForFunction((code) => [...document.querySelectorAll(".lp-smart-table tbody tr")]
    .some((row) => row.textContent?.includes(code)), { timeout: 20_000 }, value);
}

async function clickRowEdit(page, code) {
  const clicked = await page.evaluate((wanted) => {
    const row = [...document.querySelectorAll(".lp-smart-table tbody tr")]
      .find((candidate) => candidate.textContent?.includes(wanted));
    const button = row?.querySelector("[data-cw-sua]");
    if (!(button instanceof HTMLElement)) return false;
    button.click();
    return true;
  }, code);
  assert(clicked, `No edit control for ${code}`);
}

async function selectSourceKind(page, role, kind) {
  const kindControl = `button[data-cw-kind="${kind}"]`;
  await page.waitForSelector(kindControl, { timeout: 20_000 });
  const alreadySelected = await page.$eval(kindControl, (button) => button.getAttribute("aria-pressed") === "true");
  const listCallsBefore = receipt.networkEvents.filter((event) => event.role === role
    && event.method === "POST" && event.path.includes("/rpc/rpc_list_source_objects")).length;
  if (!alreadySelected) await page.click(kindControl);
  await page.waitForFunction((wanted) => document.querySelector(`button[data-cw-kind="${wanted}"]`)?.getAttribute("aria-pressed") === "true",
    { timeout: 10_000 }, kind);
  if (!alreadySelected) {
    const deadline = Date.now() + 20_000;
    while (receipt.networkEvents.filter((event) => event.role === role
      && event.method === "POST" && event.path.includes("/rpc/rpc_list_source_objects")).length <= listCallsBefore) {
      if (Date.now() > deadline) throw new Error(`${role} ${kind}: list request did not finish after kind switch`);
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
  }
}

async function runWriter(browser, role, kind, ordinal) {
  const code = `CRUD-E2E-${role.toUpperCase().replaceAll("_", "-")}-K${ordinal}-${runId}`;
  const name = `CRUD E2E ${role} ${kind} ${runId}`;
  const editedName = `${name} edited`;
  const { page, network } = await openRole(browser, role);
  const observation = { kind, code, create: "PENDING", edit: "PENDING", deactivate: "PENDING" };
  receipt.roles[role] ??= { source: [] };
  receipt.roles[role].source ??= [];
  receipt.roles[role].source.push(observation);
  try {
    await waitForSourceSettled(page);
    await selectSourceKind(page, role, kind);
    await page.waitForSelector("[data-cw-them]", { timeout: 20_000 });
    await page.evaluate(() => document.querySelector("[data-cw-them]")?.click());
    await page.waitForSelector("#cof-object_code", { timeout: 10_000 });
    await page.type("#cof-object_code", code);
    await page.type("#cof-object_name", name);
    const department = await page.$eval("#cof-department", (select) =>
      [...select.options].find((option) => option.value && option.value !== "__khac__")?.value ?? "");
    assert(department, "No standard department option");
    await page.select("#cof-department", department);
    await page.select("#cof-validate_flag", "n");
    await page.evaluate(() => [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Lưu")?.click());
    await page.waitForFunction(() => !document.querySelector("#cof-object_code"), { timeout: 20_000 });

    const createCall = receipt.rpcCalls.filter((call) => call.role === role && call.rpc === "rpc_save_catalog_object").at(-1);
    assert(createCall?.response?.ok === true, `${role} create RPC did not succeed`);
    assert(createCall.body?.p_object_code === code, `${role} create p_object_code mismatch`);
    assert(createCall.body?.p_object_kind === kind, `${role} create object kind mismatch`);
    assert(!Object.hasOwn(createCall.body?.p_patch ?? {}, "object_code"), `${role} leaked object_code into p_patch`);
    assert(JSON.stringify(createCall.body?.p_patch) === JSON.stringify({ object_name: name, department, validate_flag: "n" }),
      `${role} create patch has unexpected keys`);
    assert(createCall.body?.p_reason === "Tạo mới từ form" && createCall.body?.p_expected_version === null,
      `${role} create reason/version mismatch`);
    assert(createCall.response.pending_timeline === true && createCall.response.change_id,
      `${role} create did not stage validate_flag as a pending timeline change`);
    const pending = await page.evaluate(async ({ origin, storageKey, kind, wantedCode }) => {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      const response = await fetch(`${origin}/rest/v1/rpc/rpc_list_catalog_changes`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${stored.access_token}` },
        body: JSON.stringify({ p_object_kind: kind, p_status: null, p_limit: 50, p_offset: 0 }),
      });
      const payload = await response.json();
      const change = payload?.changes?.find((item) => item.object_code === wantedCode);
      return {
        status: response.status,
        ok: payload?.ok,
        found: !!change,
        id: change?.id,
        objectKind: change?.object_kind,
        changeStatus: change?.status,
        sourceVersion: change?.source_version,
        timelineRevision: change?.timeline_revision,
        hasImpact: change?.has_impact,
      };
    }, {
      origin: supabase.origin,
      storageKey: `sb-${supabase.hostname.split(".")[0]}-auth-token`,
      kind,
      wantedCode: code,
    });
    /* The public list contract deliberately omits old_data/new_data (see
       CatalogChangeRow). Bind the exact staged request to the exact server
       change by id, object, status and both revisions; SQL verification owns
       the private new_data assertion. */
    assert(pending.status === 200 && pending.ok === true && pending.found
      && pending.id === createCall.response.change_id && pending.objectKind === kind
      && pending.changeStatus === "pending" && pending.sourceVersion === createCall.response.version
      && pending.timelineRevision === createCall.response.timeline_revision,
      `${role} pending validate_flag contract mismatch: ${JSON.stringify(pending)}`);
    observation.pendingTimeline = "PASS";

    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForSourceSettled(page);
    await selectSourceKind(page, role, kind);
    await searchFor(page, code);
    await clickRowEdit(page, code);
    await page.waitForSelector("#cof-object_name", { timeout: 10_000 });
    const persistedCreate = await page.evaluate((wantedCode, wantedName, wantedDepartment) => ({
      code: document.querySelector("#cof-object_code")?.value === wantedCode,
      name: document.querySelector("#cof-object_name")?.value === wantedName,
      department: document.querySelector("#cof-department")?.value === wantedDepartment,
    }), code, name, department);
    assert(persistedCreate.code && persistedCreate.name && persistedCreate.department,
      `${role} create form values did not survive reload: ${JSON.stringify(persistedCreate)}`);
    observation.create = "PASS";

    await replaceInput(page, "#cof-object_name", editedName);
    const reasonControl = await page.$("#cof-ly-do");
    if (reasonControl) await page.type("#cof-ly-do", `CRUD E2E edit ${runId}`);
    await page.evaluate(() => [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Lưu")?.click());
    await page.waitForFunction(() => !document.querySelector("#cof-object_name"), { timeout: 20_000 });
    const editCall = receipt.rpcCalls.filter((call) => call.role === role && call.rpc === "rpc_save_catalog_object").at(-1);
    assert(editCall?.response?.ok === true, `${role} edit RPC did not succeed`);
    assert(Object.keys(editCall.body?.p_patch ?? {}).length === 1
      && editCall.body?.p_patch?.object_name === editedName,
    `${role} edit patch mismatch: ${JSON.stringify(editCall.body?.p_patch)}`);
    assert(editCall.body?.p_expected_version !== null, `${role} edit omitted expected version`);
    observation.editReason = reasonControl ? "UI_PROVIDED" : "NOT_REQUIRED_OR_EXPOSED_FOR_OBJECT_NAME";

    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForSourceSettled(page);
    await selectSourceKind(page, role, kind);
    await searchFor(page, code);
    await clickRowEdit(page, code);
    await page.waitForSelector("#cof-object_name", { timeout: 10_000 });
    const persistedEdit = await page.$eval("#cof-object_name", (input) => input.value, editedName);
    assert(persistedEdit === editedName, `${role} edit form value did not survive reload`);
    observation.edit = "PASS";

    observation.deactivate = await page.$("#cof-is_active") ? "UI_CONTROL_PRESENT_NOT_EXERCISED" : "NOT_UI_SUPPORTED";
    assert(observation.deactivate === "NOT_UI_SUPPORTED", "Deactivate UI appeared; runner requires an explicit reviewed flow before exercising it");
    assert(network.proxyFailures.length === 0, `${role} proxy failures: ${network.proxyFailures.join("; ")}`);
    receipt.blockedExternal.push(...network.blocked.map((request) => ({ role, request })));
  } catch (error) {
    await captureFailure(page, role, error);
    throw error;
  } finally {
    await page.close();
  }
}

async function runDenied(browser, role, ordinal) {
  const code = `CRUD-E2E-DENY-${role.toUpperCase().replaceAll("_", "-")}-${runId}-${ordinal}`;
  const { page, network } = await openRole(browser, role);
  const observation = { code, uiWriteControls: "PENDING", serverDenial: "PENDING" };
  receipt.roles[role] = { sourceDenied: observation };
  try {
    await waitForSourceSettled(page, role);
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    const controls = await page.evaluate(() => ({
      add: document.querySelectorAll("[data-cw-them]").length,
      edit: document.querySelectorAll("[data-cw-sua]").length,
      save: [...document.querySelectorAll("button")].filter((button) => button.textContent?.trim() === "Lưu").length,
    }));
    assert(controls.add === 0 && controls.edit === 0 && controls.save === 0,
      `${role} exposes Source write controls: ${JSON.stringify(controls)}`);
    if (role === "inactive") {
      const terminal = await page.evaluate(() => {
        const text = document.body?.innerText ?? "";
        return text.includes("Chưa xác minh được quyền truy cập")
          && [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Thử lại"))
          && [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Thoát tài khoản"));
      });
      assert(terminal, "inactive account did not reach the explicit access-verification terminal screen");
      observation.uiTerminal = "ACCESS_UNVERIFIED";
    }
    observation.uiWriteControls = "ABSENT";

    const denied = await page.evaluate(async ({ origin, storageKey, objectCode }) => {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      const response = await fetch(`${origin}/rest/v1/rpc/rpc_save_catalog_object`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${stored.access_token}` },
        body: JSON.stringify({
          p_object_kind: "Thiết bị",
          p_object_code: objectCode,
          p_patch: { object_name: `Denied ${objectCode}`, department: "qa", validate_flag: "n" },
          p_reason: "Negative authorization regression",
          p_expected_version: null,
        }),
      });
      return { status: response.status, body: await response.json() };
    }, {
      origin: supabase.origin,
      storageKey: `sb-${supabase.hostname.split(".")[0]}-auth-token`,
      objectCode: code,
    });
    assert(denied.body?.ok === false, `${role} direct RPC was not denied`);
    assert(["FORBIDDEN", "ACCOUNT_DISABLED"].includes(denied.body?.error_code),
      `${role} denial code was ${denied.body?.error_code ?? "missing"}`);
    observation.serverDenial = denied.body.error_code;
    observation.httpStatus = denied.status;
    assert(network.proxyFailures.length === 0, `${role} proxy failures: ${network.proxyFailures.join("; ")}`);
    receipt.blockedExternal.push(...network.blocked.map((request) => ({ role, request })));
  } catch (error) {
    await captureFailure(page, role, error);
    throw error;
  } finally {
    await page.close();
  }
}

async function openDataset(page, dataset) {
  const selector = `button[data-cw-nav="${dataset}"]`;
  await page.waitForSelector(selector, { timeout: 20_000 });
  await page.click(selector);
  await page.waitForFunction((wanted) => document.querySelector(`button[data-cw-nav="${wanted}"]`)?.getAttribute("aria-pressed") === "true",
    { timeout: 10_000 }, dataset);
  await page.waitForSelector("[data-cw-them]", { timeout: 20_000 });
}

async function readCatalogRecord(page, serverName, search, key, expected) {
  return page.evaluate(async ({ origin, storageKey, serverName, search, key, expected }) => {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
    const response = await fetch(`${origin}/rest/v1/rpc/rpc_list_catalog_dataset`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${stored.access_token}` },
      body: JSON.stringify({
        p_dataset: serverName, p_search: search, p_filters: { only_active: false }, p_limit: 25, p_offset: 0,
      }),
    });
    const payload = await response.json();
    const row = payload?.rows?.find((candidate) => candidate?.[key] === expected);
    return { status: response.status, ok: payload?.ok, found: !!row, row };
  }, {
    origin: supabase.origin,
    storageKey: `sb-${supabase.hostname.split(".")[0]}-auth-token`,
    serverName, search, key, expected,
  });
}

async function typeOpenValue(page, selector, label, value) {
  const tag = await page.$eval(selector, (element) => element.tagName);
  if (tag === "INPUT") {
    await page.type(selector, value);
    return;
  }
  await page.select(selector, "__khac__");
  const custom = `input[aria-label="${label} — nhập giá trị mới"]`;
  await page.waitForSelector(custom, { timeout: 5_000 });
  await page.type(custom, value);
}

async function runProductLifecycle(browser, role, ordinal) {
  const code = `BFO-E2E-${role.toUpperCase().replaceAll("_", "-")}-${runId}-${ordinal}`;
  const note = `product note ${runId}`;
  const editedNote = `${note} edited`;
  const { page, network } = await openRole(browser, role);
  const observation = { code, create: "PENDING", edit: "PENDING", disable: "PENDING" };
  receipt.roles[role] ??= { source: [] };
  receipt.roles[role].products = observation;
  try {
    await waitForSourceSettled(page);
    await openDataset(page, "products");
    await page.click("[data-cw-them]");
    await page.waitForSelector("#cw-products-bfo_code", { timeout: 10_000 });
    const keyDisabled = await page.$eval("#cw-products-bfo_code", (input) => input.disabled);
    if (keyDisabled) {
      observation.create = "BLOCKED_UI_BUSINESS_KEY_DISABLED";
      observation.edit = "NOT_RUN_CREATE_BLOCKED";
      observation.disable = "NOT_RUN_CREATE_BLOCKED";
      return;
    }
    await page.type("#cw-products-bfo_code", code);
    await page.type("#cw-products-product_name", `Product ${code}`);
    await page.type("#cw-products-ingredients", "Synthetic ingredient");
    await typeOpenValue(page, "#cw-products-strength", "Hàm lượng", "10 mg");
    await typeOpenValue(page, "#cw-products-dosage_form", "Dạng bào chế", "Tablet E2E");
    await page.$eval(".cw-nang-cao", (details) => { details.open = true; });
    await typeOpenValue(page, "#cw-products-production_line", "Dây chuyền", "Line E2E");
    await typeOpenValue(page, "#cw-products-primary_pack", "Bao bì sơ cấp", "Bottle E2E");
    await typeOpenValue(page, "#cw-products-batch_size", "Cỡ lô", "1000");
    await typeOpenValue(page, "#cw-products-mixing_tank", "Bồn pha", "Tank E2E");
    await page.type("#cw-products-final_batch_size", "950");
    await page.type("#cw-products-note", note);
    await page.click("#cw-products-is_active");
    await page.evaluate(() => [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Tạo mới")?.click());
    await page.waitForFunction(() => !document.querySelector("#cw-products-bfo_code"), { timeout: 20_000 });
    const createCall = receipt.rpcCalls.filter((call) => call.role === role && call.rpc === "rpc_save_product_gmp").at(-1);
    assert(createCall?.response?.ok === true && createCall.body?.p_bfo_code === code
      && !Object.hasOwn(createCall.body?.p_patch ?? {}, "bfo_code"), `${role} product create contract mismatch`);
    observation.create = "PASS";

    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForSourceSettled(page);
    await openDataset(page, "products");
    await searchFor(page, code);
    await clickRowEdit(page, code);
    await page.waitForSelector("#cw-products-note", { timeout: 10_000 });
    assert(await page.$eval("#cw-products-bfo_code", (input, wanted) => input.disabled && input.value === wanted, code),
      `${role} product business key was not locked after create`);
    await page.$eval(".cw-nang-cao", (details) => { details.open = true; });
    const productValues = await page.evaluate(() => {
      const read = (key) => {
        const element = document.querySelector(`#cw-products-${key}`);
        return element?.value === "__khac__"
          ? element.closest(".cw-truong")?.querySelector(".cw-o-khac")?.value : element?.value;
      };
      return Object.fromEntries([
        "product_name", "ingredients", "strength", "dosage_form", "production_line", "primary_pack",
        "batch_size", "mixing_tank", "final_batch_size", "note",
      ].map((key) => [key, read(key)]));
    });
    assert(JSON.stringify(productValues) === JSON.stringify({
      product_name: `Product ${code}`, ingredients: "Synthetic ingredient", strength: "10 mg",
      dosage_form: "Tablet E2E", production_line: "Line E2E", primary_pack: "Bottle E2E",
      batch_size: "1000", mixing_tank: "Tank E2E", final_batch_size: "950", note,
    }), `${role} product create fields did not survive reload: ${JSON.stringify(productValues)}`);
    assert(await page.$eval("#cw-products-is_active", (input) => input.checked), `${role} product active flag did not survive create`);
    await replaceInput(page, "#cw-products-note", editedNote);
    await page.evaluate(() => [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Lưu thay đổi")?.click());
    await page.waitForFunction(() => !document.querySelector("#cw-products-bfo_code"), { timeout: 20_000 });
    const editCall = receipt.rpcCalls.filter((call) => call.role === role && call.rpc === "rpc_save_product_gmp").at(-1);
    assert(editCall?.response?.ok === true && JSON.stringify(editCall.body?.p_patch) === JSON.stringify({ note: editedNote }),
      `${role} product edit mismatch`);
    observation.edit = "PASS";

    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForSourceSettled(page);
    await openDataset(page, "products");
    await searchFor(page, code);
    await clickRowEdit(page, code);
    await page.waitForSelector("#cw-products-is_active", { timeout: 10_000 });
    await page.$eval(".cw-nang-cao", (details) => { details.open = true; });
    assert(await page.$eval("#cw-products-note", (input, wanted) => input.value === wanted, editedNote),
      `${role} product edit did not survive reload`);
    await page.click("#cw-products-is_active");
    await page.waitForSelector("#cw-products-ly-do", { timeout: 10_000 });
    await page.type("#cw-products-ly-do", `Disable synthetic product ${runId}`);
    await page.evaluate(() => [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Lưu thay đổi")?.click());
    await page.waitForFunction(() => !document.querySelector("#cw-products-bfo_code"), { timeout: 20_000 });
    const disableCall = receipt.rpcCalls.filter((call) => call.role === role && call.rpc === "rpc_save_product_gmp").at(-1);
    assert(disableCall?.response?.ok === true && disableCall.body?.p_patch?.is_active === false,
      `${role} product disable mismatch`);
    const disabledProduct = await readCatalogRecord(page, "products_gmp", code, "bfo_code", code);
    assert(disabledProduct.status === 200 && disabledProduct.ok === true && disabledProduct.found
      && disabledProduct.row?.is_active === false, `${role} product disable did not persist`);
    observation.disable = "PASS";
    assert(network.proxyFailures.length === 0, `${role} product proxy failures: ${network.proxyFailures.join("; ")}`);
  } catch (error) {
    await captureFailure(page, `${role}-products`, error);
    throw error;
  } finally {
    await page.close();
  }
}

async function runAlertLifecycle(browser, role, ordinal) {
  const email = `crud-e2e-${role.replaceAll("_", "-")}-${runId}-${ordinal}@example.test`;
  const name = `CRUD alert ${role} ${runId}`;
  const initialNote = `created ${runId}`;
  const note = `edited ${runId}`;
  const schedule = role === "admin" ? "hằng tuần" : "hằng tháng";
  const { page, network } = await openRole(browser, role);
  const observation = { email, create: "PENDING", edit: "PENDING", disable: "PENDING" };
  receipt.roles[role] ??= { source: [] };
  receipt.roles[role].alerts = observation;
  try {
    await waitForSourceSettled(page);
    await openDataset(page, "alerts");
    observation.step = "open-create";
    await page.click("[data-cw-them]");
    await page.waitForSelector("#cw-alerts-email", { timeout: 10_000 });
    await replaceInput(page, "#cw-alerts-email", email);
    await page.type("#cw-alerts-recipient_name", name);
    await page.select("#cw-alerts-scope_type", "bộ phận");
    await typeOpenValue(page, "#cw-alerts-scope", "Giá trị phạm vi", "qa");
    await page.select("#cw-alerts-alert_kind", "quá hạn");
    await page.$eval(".cw-nang-cao", (details) => { details.open = true; });
    await page.type("#cw-alerts-threshold_days", "7");
    await page.click("#cw-alerts-ai_report_enabled");
    await page.select("#cw-alerts-ai_report_schedule", schedule);
    await page.type("#cw-alerts-note", initialNote);
    await page.click("#cw-alerts-is_enabled");
    observation.step = "submit-create";
    await page.evaluate(() => [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Tạo mới")?.click());
    await page.waitForFunction(() => !document.querySelector("#cw-alerts-email"), { timeout: 20_000 });
    const createCall = receipt.rpcCalls.filter((call) => call.role === role && call.rpc === "rpc_save_alert_recipient").at(-1);
    assert(createCall?.response?.ok === true, `${role} alert create failed`);
    assert(createCall.body?.p_id === null && createCall.body?.p_expected_version === null,
      `${role} alert create identity/version mismatch`);
    assert(createCall.body?.p_patch?.email === email && createCall.body?.p_patch?.recipient_name === name
      && createCall.body?.p_patch?.threshold_days === 7 && createCall.body?.p_patch?.is_enabled === true
      && createCall.body?.p_patch?.ai_report_schedule === schedule,
    `${role} alert create patch mismatch`);
    observation.create = "PASS";
    observation.step = "reload-edit";

    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForSourceSettled(page);
    await openDataset(page, "alerts");
    await searchFor(page, email);
    await clickRowEdit(page, email);
    await page.waitForSelector("#cw-alerts-email", { timeout: 10_000 });
    await page.$eval(".cw-nang-cao", (details) => { details.open = true; });
    const alertValues = await page.evaluate(() => {
      const scope = document.querySelector("#cw-alerts-scope");
      return ({
      email: document.querySelector("#cw-alerts-email")?.value,
      recipient_name: document.querySelector("#cw-alerts-recipient_name")?.value,
      scope_type: document.querySelector("#cw-alerts-scope_type")?.value,
      scope: scope?.value === "__khac__" ? scope.closest(".cw-truong")?.querySelector(".cw-o-khac")?.value : scope?.value,
      alert_kind: document.querySelector("#cw-alerts-alert_kind")?.value,
      threshold_days: document.querySelector("#cw-alerts-threshold_days")?.value,
      ai_report_enabled: document.querySelector("#cw-alerts-ai_report_enabled")?.checked,
      ai_report_schedule: document.querySelector("#cw-alerts-ai_report_schedule")?.value,
      note: document.querySelector("#cw-alerts-note")?.value,
      is_enabled: document.querySelector("#cw-alerts-is_enabled")?.checked,
    }); });
    assert(JSON.stringify(alertValues) === JSON.stringify({
      email, recipient_name: name, scope_type: "bộ phận", scope: "qa", alert_kind: "quá hạn",
      threshold_days: "7", ai_report_enabled: true, ai_report_schedule: schedule,
      note: initialNote, is_enabled: true,
    }), `${role} alert create fields did not survive reload: ${JSON.stringify(alertValues)}`);
    assert(await page.$eval("#cw-alerts-ai_report_schedule", (select, expected) => select.value === expected, schedule),
      `${role} alert schedule did not survive reload`);
    await replaceInput(page, "#cw-alerts-note", note);
    observation.step = "submit-edit";
    await page.evaluate(() => [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Lưu thay đổi")?.click());
    await page.waitForFunction(() => !document.querySelector("#cw-alerts-email"), { timeout: 20_000 });
    const editCall = receipt.rpcCalls.filter((call) => call.role === role && call.rpc === "rpc_save_alert_recipient").at(-1);
    assert(editCall?.response?.ok === true && JSON.stringify(editCall.body?.p_patch) === JSON.stringify({ note }),
      `${role} alert one-field edit mismatch`);
    observation.edit = "PASS";
    observation.step = "reload-disable";

    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForSourceSettled(page);
    await openDataset(page, "alerts");
    await searchFor(page, email);
    await clickRowEdit(page, email);
    await page.waitForSelector("#cw-alerts-is_enabled", { timeout: 10_000 });
    await page.$eval(".cw-nang-cao", (details) => { details.open = true; });
    assert(await page.$eval("#cw-alerts-note", (input, wanted) => input.value === wanted, note),
      `${role} alert edit did not survive reload`);
    await page.click("#cw-alerts-is_enabled");
    await page.waitForSelector("#cw-alerts-ly-do", { timeout: 10_000 });
    await page.type("#cw-alerts-ly-do", `Disable synthetic recipient ${runId}`);
    observation.step = "submit-disable";
    await page.evaluate(() => [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Lưu thay đổi")?.click());
    await page.waitForFunction(() => !document.querySelector("#cw-alerts-email"), { timeout: 20_000 });
    const disableCall = receipt.rpcCalls.filter((call) => call.role === role && call.rpc === "rpc_save_alert_recipient").at(-1);
    assert(disableCall?.response?.ok === true && disableCall.body?.p_patch?.is_enabled === false
      && String(disableCall.body?.p_reason ?? "").startsWith("Disable synthetic recipient"),
    `${role} alert disable mismatch`);
    const disabledAlert = await readCatalogRecord(page, "alert_recipients", email, "email", email);
    assert(disabledAlert.status === 200 && disabledAlert.ok === true && disabledAlert.found
      && disabledAlert.row?.is_enabled === false, `${role} alert disable did not persist`);
    observation.disable = "PASS";
    observation.step = "complete";
    assert(network.proxyFailures.length === 0, `${role} alert proxy failures: ${network.proxyFailures.join("; ")}`);
  } catch (error) {
    await captureFailure(page, `${role}-alerts`, error);
    throw error;
  } finally {
    await page.close();
  }
}

let browser;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  for (const role of ["admin", "qa_manager"]) {
    if (requestedSection === "all" || requestedSection === "source") {
      for (const [index, kind] of sourceKinds.entries()) await runWriter(browser, role, kind, index + 1);
    }
    if (requestedSection === "all" || requestedSection === "products") {
      await runProductLifecycle(browser, role, sourceKinds.length + 1);
    }
    if (requestedSection === "all" || requestedSection === "alerts") {
      await runAlertLifecycle(browser, role, sourceKinds.length + 1);
    }
  }
  if (requestedSection === "all" || requestedSection === "denials") {
    for (const [index, role] of ["qa_staff", "workshop_manager", "workshop_staff", "inactive"].entries()) {
      await runDenied(browser, role, index + 3);
    }
  }
  if (requestedSection === "all" || requestedSection === "products") {
    const blockedProducts = ["admin", "qa_manager"].filter((role) =>
      receipt.roles[role]?.products?.create === "BLOCKED_UI_BUSINESS_KEY_DISABLED");
    assert(blockedProducts.length === 0,
      `Product create UI keeps required business key disabled for: ${blockedProducts.join(", ")}`);
  }
  receipt.result = "PASS";
  console.log(`catalog real DB: PASS (${basename(receiptPath)})`);
} catch (error) {
  receipt.result = "FAIL";
  receipt.error = error instanceof Error ? error.message : String(error);
  console.error(`catalog real DB: FAIL — ${receipt.error}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
}

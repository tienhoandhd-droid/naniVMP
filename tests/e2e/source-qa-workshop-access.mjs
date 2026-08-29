/* =====================================================================
 * Source QA/workshop boundary — browser proof
 *
 * This is deliberately a self-contained intercepted-Supabase fixture.  It
 * must never depend on a real person, Source row, or production service.
 * Keep the wire payloads strict: a permissive mock would mask the exact
 * decoders which are part of the authorization boundary.
 * ===================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { choServer } from "./cho-server.mjs";
import { layRef, nhetPhien, phienGia } from "./gia-lap-supabase.mjs";

const ORIGIN = process.env.VMP_E2E_ORIGIN || "http://127.0.0.1:4173";
await choServer(ORIGIN);

const envText = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
const sourceUrl = envText.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
if (!sourceUrl) throw new Error(".env.local thiếu VITE_SUPABASE_URL");
const SUPABASE_ORIGIN = new URL(sourceUrl).origin;

const ids = {
  manager: "a1000000-0000-4000-8000-000000000001",
  owner: "a1000000-0000-4000-8000-000000000002",
  support: "a1000000-0000-4000-8000-000000000003",
  unrelated: "a1000000-0000-4000-8000-000000000004",
  areaWorkshop: "a1000000-0000-4000-8000-000000000005",
  lineWorkshop: "a1000000-0000-4000-8000-000000000006",
  unassignedWorkshop: "a1000000-0000-4000-8000-000000000007",
  objectA: "b1000000-0000-4000-8000-000000000001",
  objectB: "b1000000-0000-4000-8000-000000000002",
};

const PERSONAS = {
  manager: { role: "qa_manager", userId: ids.manager, label: "Quản lý QA E2E" },
  owner: { role: "qa_staff", userId: ids.owner, label: "QA phụ trách E2E" },
  support: { role: "qa_staff", userId: ids.support, label: "QA hỗ trợ E2E" },
  unrelated: { role: "qa_staff", userId: ids.unrelated, label: "QA không phân công E2E" },
  areaWorkshop: { role: "workshop_staff", userId: ids.areaWorkshop, label: "Xưởng toàn khu vực E2E" },
  lineWorkshop: { role: "workshop_staff", userId: ids.lineWorkshop, label: "Xưởng dây chuyền E2E" },
  unassignedWorkshop: { role: "workshop_staff", userId: ids.unassignedWorkshop, label: "Xưởng chưa phân E2E" },
};

const QA_SEVEN_FIELDS = [
  "actual_protocol_date", "status_protocol", "status_validation",
  "actual_report_date", "status_report", "actual_vmp_date", "status_vmp",
];

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const revisionTimestamp = (revision) =>
  `2026-08-28T00:00:${String(revision).padStart(2, "0")}.000Z`;
const answer = (request, body, status = 200) => request.method() === "OPTIONS"
  ? request.respond({ status: 204, headers: cors, body: "" })
  : request.respond({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });

function sourceRow(id, objectCode, line, ownerPersonId = ids.owner, supportPersonId = ids.support) {
  return {
    id, object_kind: "Thiết bị", object_code: objectCode, source_tab: "thiet_bi", source_row: 1,
    extra: {}, created_at: "2026-08-28T00:00:00.000Z", updated_at: "2026-08-28T00:00:00.000Z",
    is_active: true, edited_on_web: false, criticality_source: "auto", version: 1,
    timeline_revision: 1, timeline_applied_revision: 1, object_name: `Thiết bị ${objectCode}`,
    department: "XSX", area_code: "A01", line, status: "Đang dùng", show_flag: "y",
    validate_flag: "y", validate_reason: null, report_class: "Không phụ thuộc", critical_point: null, note: null,
    owner_name: "QA phụ trách E2E", support_name: "QA hỗ trợ E2E", work_group: "Sản xuất",
    frequency_months: 12, workdays: null, first_month: 1, year_ref: 2026,
    complexity_score: 3, quality_impact_score: 3, criticality_score: 9, updated_by: null,
    owner_person_id: ownerPersonId, support_person_id: supportPersonId,
  };
}

const sourceRows = [
  sourceRow(ids.objectA, "SRC-E2E-A", "Line 1"),
  sourceRow(ids.objectB, "SRC-E2E-B", "Line 2"),
];

function sourceFacets(rows = sourceRows) {
  const ownerCount = rows.filter((row) => row.owner_person_id === ids.owner).length;
  return {
    ok: true,
    departments: rows.length ? [{ value: "xsx", count: rows.length }] : [],
    areas: rows.length ? [{ value: "a01", count: rows.length }] : [],
    owners: ownerCount ? [{ value: "owner:qa phụ trách e2e", person_id: ids.owner, name: "QA phụ trách E2E", count: ownerCount }] : [],
    validation: [{ value: "outside", count: 0 }, { value: "validated", count: rows.length }],
    first_month: [{ value: "missing", count: 0 }, { value: "present", count: rows.length }],
    ownership: [{ value: "assigned", count: rows.length }, { value: "unassigned", count: 0 }],
    frequency: [{ value: "gt12", count: 0 }, { value: "lte12", count: rows.length }],
  };
}

function uiAccess(persona) {
  const sourceActions = persona.role === "qa_manager"
    ? ["view", "edit_catalog", "generate_timeline", "manage_workshop_scope"]
    : ["view"];
  return {
    ok: true, mode: "enforced", business_role: persona.role, unresolved_reason: null,
    screens: {
      source: { can_view: true, data_scope: persona.role === "qa_manager" ? "all" : "assigned", actions: sourceActions },
      progress: { can_view: true, data_scope: "assigned", actions: ["view"] },
      overview: { can_view: true, data_scope: "assigned", actions: ["view"] },
      timeline: { can_view: true, data_scope: "assigned", actions: ["view"] },
      today: { can_view: true, data_scope: "assigned", actions: ["view"] },
    },
  };
}

function activity(code) {
  return {
    id: `${code}-IQ`, code, name: `Thiết bị ${code}`, vtype: "IQ", dep: "XSX", dept: "XSX",
    owner: "QA phụ trách E2E", target: "2026-12-31", st: "todo", state: "active",
    _raw: { version: 1, state: "active", object_code: code, dl_vmp: "2026-12-31" },
  };
}

function dashboard(persona, revoked, revision) {
  const allowed = visibleRows(persona, revoked);
  return {
    objects: allowed.map((row) => ({ code: row.object_code, name: row.object_name })),
    activities: allowed.map((row) => activity(row.object_code)),
    source: "supabase", updated_at: revisionTimestamp(revision), authorization_revision: revision, year: 2026,
  };
}

function visibleRows(persona, revoked) {
  if (revoked && (persona === PERSONAS.owner || persona === PERSONAS.support)) return [];
  if (persona.role === "qa_manager") return sourceRows;
  if (persona === PERSONAS.owner || persona === PERSONAS.support) return [sourceRows[0]];
  if (persona === PERSONAS.areaWorkshop) return sourceRows;
  if (persona === PERSONAS.lineWorkshop) return [sourceRows[0]];
  return [];
}

function candidates() {
  return {
    ok: true,
    rows: [
      { person_id: ids.unrelated, performer_name: "QA được chọn E2E", normalized_full_name: "qa duoc chon e2e", email: "qa-selected@example.invalid", department: "QA", role_name: "qa_staff" },
      { person_id: ids.owner, performer_name: "QA phụ trách E2E", normalized_full_name: "qa phu trach e2e", email: "qa-owner@example.invalid", department: "QA", role_name: "qa_staff" },
      { person_id: ids.support, performer_name: "QA hỗ trợ E2E", normalized_full_name: "qa ho tro e2e", email: "qa-support@example.invalid", department: "QA", role_name: "qa_staff" },
    ],
    included_current: [], authorized_total: 3, next_cursor: null,
  };
}

function coverage() {
  return {
    ok: true,
    rows: [{
      person_id: ids.areaWorkshop, performer_name: "Xưởng toàn khu vực E2E", normalized_full_name: "xuong toan khu vuc e2e",
      email: null, department: "XSX", role_name: "workshop_staff", grants: [{
        id: "c1000000-0000-4000-8000-000000000001", performer_id: ids.areaWorkshop,
        department: "XSX", department_key: "xsx", area_code: "A01", area_key: "a01", line: null, line_key: null,
        valid_from: "2026-08-28", expires_at: null, is_active: true, version: 1,
        created_at: "2026-08-28T00:00:00.000Z", created_by: ids.manager,
        updated_at: "2026-08-28T00:00:00.000Z", updated_by: ids.manager, change_reason: "Thiết lập E2E",
      }],
    }], authorized_total: 1, next_cursor: null,
  };
}

function choices() {
  return { ok: true, rows: [
    { department: "XSX", area_code: "A01", line: null },
    { department: "XSX", area_code: "A01", line: "Line 1" },
    { department: "XSX", area_code: "A01", line: "Line 2" },
  ], next_cursor: null };
}

function pendingPayload(revision) {
  return { ok: true, total: 1, changes: [{
    id: `d1000000-0000-4000-8000-${String(revision).padStart(12, "0")}`,
    object_kind: "Thiết bị", object_code: `PENDING-R${revision}`, status: "pending",
    source_version: 1, timeline_revision: 1, created_at: revisionTimestamp(revision),
    created_by_name: "E2E", has_impact: true, apply_reason: null, last_error: null,
  }] };
}

function historyPayload(revision) {
  return { ok: true, total: 1, history: [{
    id: `e1000000-0000-4000-8000-${String(revision).padStart(12, "0")}`,
    created_at: revisionTimestamp(revision), actor: "E2E", effective_business_role: "qa_manager",
    action: "update", table_name: "vmp_source_objects", record_id: `HISTORY-R${revision}`,
    changed_fields: ["owner_person_id"], reason: "E2E", source: "web", has_detail: true,
  }] };
}

function warnings(rows) {
  return { nam: 2026, thieu_thang_dau: [], chua_tung_iq: [], show_tat: [], chua_hoat_dong: [],
    ma_tam: rows.map((row) => ({ object_kind: row.object_kind, object_code: row.object_code, object_name: row.object_name, note: "fixture" })) };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", ...CHROME_GL_ARGS] });
const unexpected = [];
const bodies = [];

async function openPersona(persona, state) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const user = { id: persona.userId, email: `${persona.role}@e2e.invalid`, user_metadata: { full_name: persona.label } };
  await nhetPhien(page, { supabaseUrl: sourceUrl, nguoiDung: user });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return request.continue();
    const parsed = new URL(url);
    if (parsed.origin === ORIGIN) return request.continue();
    if (parsed.origin !== SUPABASE_ORIGIN) {
      unexpected.push(`${persona.role}: ${request.method()} ${parsed.origin}${parsed.pathname}`);
      return request.abort();
    }
    if (request.method() === "OPTIONS") return answer(request, {});
    if (parsed.pathname.startsWith("/auth/v1/")) {
      if (parsed.pathname.includes("/user")) return answer(request, user);
      return answer(request, phienGia(user));
    }
    if (parsed.pathname === "/rest/v1/profiles") {
      return answer(request, {
        id: persona.userId, email: user.email, full_name: persona.label,
        role: persona.role, is_active: true,
      });
    }
    if (parsed.pathname === "/rest/v1/vmp_performers") {
      /* Auth bootstrap may resolve only the signed-in person's canonical ID.
         This is not a directory read: reject wildcard projection, missing
         self filter, inactive rows, or any attempt to enumerate people. */
      const ownIdentityOnly = parsed.searchParams.get("select") === "id,access_class"
        && parsed.searchParams.get("user_id") === `eq.${persona.userId}`
        && parsed.searchParams.get("is_active") === "eq.true";
      if (!ownIdentityOnly) {
        unexpected.push(`${persona.role}: forbidden performer directory ${parsed.pathname}${parsed.search}`);
        return answer(request, []);
      }
      return answer(request, {
        id: persona.userId,
        access_class: persona.role === "workshop_staff" ? "workshop" : "qa",
      });
    }
    const rpc = parsed.pathname.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/i)?.[1];
    if (!rpc) {
      unexpected.push(`${persona.role}: unexpected table ${parsed.pathname}`);
      return answer(request, []);
    }
    const body = JSON.parse(request.postData() || "{}");
    bodies.push({ role: persona.role, rpc, body });
    if (rpc === "rpc_my_ui_access") return answer(request, uiAccess(persona));
    if (rpc === "item_permissions_mode") return answer(request, "enforced");
    if (rpc === "rpc_get_vmp_dashboard") return answer(request, dashboard(persona, state.revoked, state.revision));
    if (rpc === "rpc_get_vmp_watermark") return answer(request, {
      year: 2026, plan_items: visibleRows(persona, state.revoked).length, objects: visibleRows(persona, state.revoked).length,
      updated_at: revisionTimestamp(state.revision), authorization_revision: state.revision,
    });
    if (rpc === "rpc_list_source_objects") {
      const rows = visibleRows(persona, state.revoked);
      if (state.holdOldCard && !state.revoked && body.p_filters?.validation === "outside") {
        state.held.push({ rpc: "card_source_list", request, payload: { ok: true, rows, authorized_total: rows.length, next_cursor: null } }); return;
      }
      if (state.holdOldSource && !state.revoked) { state.held.push({ rpc, request, payload: { ok: true, rows, authorized_total: rows.length, next_cursor: null } }); return; }
      return answer(request, { ok: true, rows, authorized_total: rows.length, next_cursor: null });
    }
    if (rpc === "rpc_source_object_facets") {
      if (state.holdOldFacets && !state.revoked) { state.held.push({ rpc, request, payload: sourceFacets(visibleRows(persona, false)) }); return; }
      return answer(request, sourceFacets(visibleRows(persona, state.revoked)));
    }
    if (rpc === "rpc_source_warnings") {
      if (state.holdOldWarnings && !state.revoked) { state.held.push({ rpc, request, payload: warnings(visibleRows(persona, false)) }); return; }
      return answer(request, warnings(visibleRows(persona, state.revoked)));
    }
    if (rpc === "rpc_source_field_suggestions") return answer(request, { ok: true, rows: [], next_cursor: null });
    if (rpc === "rpc_source_qa_candidates") {
      state.candidateReads += 1;
      if (state.candidateReads === 1) return answer(request, { ok: false, error_code: "FORBIDDEN", error: "Lỗi ứng viên có chủ đích" });
      return answer(request, candidates());
    }
    if (rpc === "rpc_save_catalog_object") return answer(request, { ok: true, object_code: body.p_object_code, version: 2, timeline_revision: 1, pending_timeline: false });
    if (rpc === "rpc_export_source_objects") {
      const rows = visibleRows(persona, state.revoked);
      const payload = { ok: true, rows, authorized_total: rows.length, next_cursor: null };
      return answer(request, payload);
    }
    if (rpc === "rpc_list_source_workshop_coverage") return answer(request, coverage());
    if (rpc === "rpc_source_workshop_scope_choices") return answer(request, choices());
    if (rpc === "rpc_set_source_workshop_scope_grant") return answer(request, { ok: true, grant_id: "c1000000-0000-4000-8000-000000000001", version: 2, is_active: body.p_is_active });
    if (rpc === "rpc_list_catalog_changes") {
      const payload = pendingPayload(state.revision);
      if (state.holdOldPending && state.revision === state.pendingHoldRevision) {
        state.held.push({ rpc, request, payload }); return;
      }
      return answer(request, payload);
    }
    if (rpc === "rpc_catalog_history") {
      const payload = historyPayload(state.revision);
      if (state.holdOldHistory && state.revision === state.historyHoldRevision) {
        state.held.push({ rpc, request, payload }); return;
      }
      return answer(request, payload);
    }
    if (rpc === "rpc_my_editable_progress_rights") {
      const canDate = persona === PERSONAS.areaWorkshop || persona === PERSONAS.lineWorkshop;
      const canQa = persona === PERSONAS.owner || persona === PERSONAS.support;
      const rows = visibleRows(persona, state.revoked).map((row) => ({ validation_code: `${row.object_code}-IQ`, editable_fields: canQa ? QA_SEVEN_FIELDS : canDate ? ["actual_validation_date"] : [], view_reason: "E2E Source boundary" }));
      if (persona === PERSONAS.areaWorkshop && state.areaRightsDelayMs > 0) {
        setTimeout(() => answer(request, { ok: true, rights: rows }), state.areaRightsDelayMs);
        return;
      }
      return answer(request, { ok: true, rights: rows });
    }
    if (rpc === "vmp_my_item_rights") {
      const allowed = visibleRows(persona, state.revoked).length > 0;
      const fields = persona === PERSONAS.owner || persona === PERSONAS.support ? QA_SEVEN_FIELDS
        : (persona === PERSONAS.areaWorkshop || persona === PERSONAS.lineWorkshop) ? ["actual_validation_date"] : [];
      const payload = [{ can_view: allowed, editable_fields: fields, view_reason: "E2E Source boundary", assignment_sources: [], scope_match: allowed, area_match: allowed }];
      // Keep the area-workshop permission response slow enough to expose a
      // modal-loading race: the title renders before the field allowlist.
      if (persona === PERSONAS.areaWorkshop && state.areaItemRightsDelayMs > 0) {
        setTimeout(() => answer(request, payload), state.areaItemRightsDelayMs);
        return;
      }
      return answer(request, payload);
    }
    if (rpc === "rpc_update_progress") return answer(request, { ok: true });
    // These are intentionally denied: a lower role must never discover the
    // manager-only catalog datasets through a speculative browser request.
    if (["rpc_list_catalog_dataset", "rpc_list_catalog_changes", "rpc_catalog_history", "rpc_stage_catalog_import"].includes(rpc)) {
      return answer(request, { message: "FORBIDDEN" }, 403);
    }
    return answer(request, null);
  });
  await page.goto(`${ORIGIN}#v=source`, { waitUntil: "domcontentloaded" });
  return page;
}

async function waitSource(page, code) {
  try {
    await page.waitForFunction((expected) => document.body.innerText.includes(expected), { timeout: 15_000 }, code);
  } catch (cause) {
    const screen = await page.evaluate(() => document.body.innerText.slice(0, 2_000));
    throw new Error(`Không thấy ${code}. Màn hiện tại: ${screen}`, { cause });
  }
}

function visibleNav(page) {
  return page.$$eval("[data-cw-nav]", (nodes) => nodes.map((node) => node.getAttribute("data-cw-nav")));
}

function enabledProgressFields(page) {
  return page.evaluate(() => {
    const dialog = [...document.querySelectorAll(".vmp-scroll")]
      .find((node) => node.getClientRects().length > 0
        && [...node.querySelectorAll("span")].some((child) => child.textContent?.trim() === "Cập nhật tiến độ"));
    return [...(dialog?.querySelectorAll('input[type="date"], select') ?? [])]
    .filter((node) => !node.disabled && node.getAttribute("aria-label") !== "Người thực hiện")
    .map((node) => ({ id: node.id, name: node.getAttribute("name"), type: node instanceof HTMLInputElement ? node.type : "select", aria: node.getAttribute("aria-label") }));
  });
}

try {
  const state = {
    revision: 7, revoked: false, candidateReads: 0, held: [],
    areaRightsDelayMs: 0, areaItemRightsDelayMs: 1_500,
    holdOldSource: false, holdOldWarnings: false, holdOldFacets: false, holdOldCard: false,
    holdOldPending: false, pendingHoldRevision: 0, holdOldHistory: false, historyHoldRevision: 0,
  };

  // QA manager: a failed directory read is an error with Retry, then the
  // selected canonical UUID and audit reason are sent to the only writer.
  const manager = await openPersona(PERSONAS.manager, state);
  await waitSource(manager, "SRC-E2E-A");
  await manager.click("[data-cw-sua]");
  await manager.waitForFunction(() => document.body.innerText.includes("Không tải được danh sách QA"));
  assert.equal(await manager.$$eval('[role="alert"]', (nodes) => nodes.some((node) => node.textContent?.includes("Thử lại"))), true,
    "candidate error must be announced with a retry, never rendered as an empty select");
  await manager.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Thử lại"))?.click());
  await manager.waitForSelector("#cof-owner_person_id option[value='a1000000-0000-4000-8000-000000000002']");
  await manager.select("#cof-owner_person_id", ids.unrelated);
  await manager.type("#cof-ly-do", "Phân công QA E2E có lý do");
  await manager.waitForFunction(() => [...(document.querySelector('[role="dialog"]')?.querySelectorAll("button") ?? [])]
    .some((button) => button.textContent?.trim() === "Lưu" && !button.disabled));
  await manager.click('[role="dialog"] button.cw-nut--chinh');
  try {
    await manager.waitForFunction(() => !document.querySelector("#cof-owner_person_id"));
  } catch (cause) {
    const form = await manager.$eval('[role="dialog"]', (node) => node.innerText);
    throw new Error(`Lưu phân công QA chưa đóng form; RPC: ${JSON.stringify(bodies.filter((entry) => entry.rpc === "rpc_save_catalog_object").at(-1))}; form: ${form}`, { cause });
  }
  const save = bodies.findLast((entry) => entry.rpc === "rpc_save_catalog_object");
  assert.deepEqual(save?.body.p_patch.owner_person_id, ids.unrelated, "Source QA assignment must send the selected UUID, not display text");
  assert.equal(save?.body.p_reason, "Phân công QA E2E có lý do", "Source QA assignment must require and submit its audit reason");

  // The manager-only coverage tab can select a whole area (blank line) or a
  // line. The payload preserves NULL for area-wide coverage and includes a reason.
  await manager.click("[data-cw-nav=coverage]");
  await manager.waitForSelector("#workshop-coverage-search");
  await manager.waitForSelector('form[aria-label="Thiết lập phạm vi xưởng"]');
  await manager.select("#workshop-scope-department", "XSX");
  await manager.select("#workshop-scope-area", "A01");
  await manager.type("#workshop-scope-reason", "Phạm vi xưởng E2E có lý do");
  try {
    await manager.waitForFunction(() => {
      const button = document.querySelector('form[aria-label="Thiết lập phạm vi xưởng"] button[type="submit"]');
      return button instanceof HTMLButtonElement && !button.disabled;
    }, { timeout: 15_000 });
  } catch (cause) {
    const formState = await manager.$eval('form[aria-label="Thiết lập phạm vi xưởng"]', (form) => ({
      submitDisabled: form.querySelector('button[type="submit"]')?.disabled ?? null,
      department: form.querySelector("#workshop-scope-department")?.value ?? null,
      area: form.querySelector("#workshop-scope-area")?.value ?? null,
      choicesStatus: [...form.querySelectorAll("[role=status], [role=alert]")].map((node) => node.textContent?.trim()),
    }));
    throw new Error(`Form phạm vi xưởng chưa sẵn sàng: ${JSON.stringify(formState)}`, { cause });
  }
  await manager.evaluate(() => document.querySelector('form[aria-label="Thiết lập phạm vi xưởng"] button[type="submit"]')?.click());
  await manager.waitForFunction(() => document.body.innerText.includes("Đã lưu phạm vi xưởng"));
  const grant = bodies.findLast((entry) => entry.rpc === "rpc_set_source_workshop_scope_grant");
  assert.deepEqual({ person: grant?.body.p_performer_id, line: grant?.body.p_line, reason: grant?.body.p_reason }, {
    person: ids.areaWorkshop, line: null, reason: "Phạm vi xưởng E2E có lý do",
  }, "area-wide workshop scope must use canonical person UUID, null line, and a reason");

  // Pending/history responses opened under an older authorization revision
  // cannot commit after the shell has cleared that generation.
  state.holdOldPending = true; state.pendingHoldRevision = state.revision;
  await manager.click("[data-cw-nav=pending]");
  for (let attempt = 0; attempt < 60
    && !state.held.some((entry) => entry.rpc === "rpc_list_catalog_changes"); attempt += 1) await wait(50);
  assert.equal(state.held.some((entry) => entry.rpc === "rpc_list_catalog_changes"), true,
    "old pending response must be held");
  state.revision += 1;
  await manager.evaluate(() => window.dispatchEvent(new Event("focus")));
  await manager.waitForFunction(() => document.body.innerText.includes("PENDING-R8"), { timeout: 15_000 });
  for (const old of state.held.splice(0)) answer(old.request, old.payload);
  await wait(300);
  assert.equal(await manager.evaluate(() => document.body.innerText.includes("PENDING-R7")), false,
    "late pending response must not replace the current revision");
  state.holdOldPending = false;

  state.holdOldHistory = true; state.historyHoldRevision = state.revision;
  await manager.click("[data-cw-nav=history]");
  for (let attempt = 0; attempt < 60
    && !state.held.some((entry) => entry.rpc === "rpc_catalog_history"); attempt += 1) await wait(50);
  assert.equal(state.held.some((entry) => entry.rpc === "rpc_catalog_history"), true,
    "old history response must be held");
  await wait(1_100);
  state.revision = 9;
  await manager.evaluate(() => window.dispatchEvent(new Event("focus")));
  await manager.waitForFunction(() => document.body.innerText.includes("HISTORY-R9"), { timeout: 15_000 });
  for (const old of state.held.splice(0)) answer(old.request, old.payload);
  await wait(300);
  assert.equal(await manager.evaluate(() => document.body.innerText.includes("HISTORY-R8")), false,
    "late history response must not replace the current revision");
  state.holdOldHistory = false;
  await manager.close();

  // Lower roles receive only the object region.  The rows themselves prove
  // the owner/support and workshop area/line visibility boundaries.
  for (const [key, expectedCodes] of [["owner", ["SRC-E2E-A"]], ["support", ["SRC-E2E-A"]], ["areaWorkshop", ["SRC-E2E-A", "SRC-E2E-B"]], ["lineWorkshop", ["SRC-E2E-A"]], ["unrelated", []], ["unassignedWorkshop", []]]) {
    const page = await openPersona(PERSONAS[key], state);
    await page.waitForSelector(".cw-workspace", { timeout: 15_000 });
    assert.deepEqual(await visibleNav(page), ["objects"], `${key} may see Source objects only, never management datasets`);
    for (const code of expectedCodes) await waitSource(page, code);
    for (const code of sourceRows.map((row) => row.object_code).filter((code) => !expectedCodes.includes(code))) {
      assert.equal(await page.evaluate((value) => document.body.innerText.includes(value), code), false, `${key} must not receive ${code}`);
    }
    await page.close();
  }

  // Owner/support seven fields and workshop's one actual date are proved in
  // the real progress modal; no disabled forbidden fields may remain in DOM.
  for (const [key, expected] of [["owner", 7], ["support", 7], ["areaWorkshop", 1], ["lineWorkshop", 1]]) {
    const page = await openPersona(PERSONAS[key], state);
    await page.goto(`${ORIGIN}#v=progress`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(`[data-progress-item="SRC-E2E-A-IQ"]`, { timeout: 15_000 });
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Cập nhật")?.click());
    await page.waitForFunction(() => document.body.innerText.includes("Cập nhật tiến độ"));
    // The modal title is rendered while permission is still being checked.
    // Wait for the exact server-authorized control count before inspecting it;
    // this is observable readiness, not a timing cushion.
    await page.waitForFunction((expectedCount) => {
      const dialog = [...document.querySelectorAll(".vmp-scroll")]
        .find((node) => node.getClientRects().length > 0
          && [...node.querySelectorAll("span")].some((child) => child.textContent?.trim() === "Cập nhật tiến độ"));
      const controls = [...(dialog?.querySelectorAll('input[type="date"], select') ?? [])]
        .filter((node) => !node.disabled && node.getAttribute("aria-label") !== "Người thực hiện");
      return controls.length === expectedCount;
    }, { timeout: 15_000 }, expected);
    const controls = await enabledProgressFields(page);
    assert.equal(controls.length, expected, `${key} must render exactly its server-authorized progress fields: ${JSON.stringify(controls)}`);
    await page.close();
  }

  // Revocation changes the positive revision.  Existing source rows disappear
  // on reload, and deliberately delayed old list/facet/warning responses are
  // only released after the revocation state has committed.
  const revokedOwner = await openPersona(PERSONAS.owner, state);
  await waitSource(revokedOwner, "SRC-E2E-A");
  await revokedOwner.waitForSelector('option[value="owner:qa phụ trách e2e"]', { timeout: 15_000 });
  state.holdOldSource = true; state.holdOldFacets = true; state.holdOldWarnings = true;
  /* Mở một generation cũ còn quyền và cố ý giữ ba response Source. Focus
     dùng đúng silent-refresh path của App, nên trang không bị navigation hủy
     các request đang treo. */
  state.revision = 8;
  await revokedOwner.evaluate(() => window.dispatchEvent(new Event("focus")));
  await revokedOwner.waitForFunction(() => window.location.hash.includes("v=source"));
  for (let attempt = 0; attempt < 60
    && new Set(state.held.map((entry) => entry.rpc)).size < 3; attempt += 1) await wait(50);
  assert.deepEqual([...new Set(state.held.map((entry) => entry.rpc))].sort(), [
    "rpc_list_source_objects", "rpc_source_object_facets", "rpc_source_warnings",
  ], "old revision must hold list, facet, and warning responses");

  // Thu hồi ở generation kế tiếp; UI phải trống trước khi ba response cũ về.
  await wait(1_100); // vượt coalesce window của visible-refresh controller
  state.revoked = true; state.revision += 1;
  await revokedOwner.evaluate(() => window.dispatchEvent(new Event("focus")));
  await revokedOwner.waitForFunction(() => !document.body.innerText.includes("SRC-E2E-A"), { timeout: 15_000 });
  assert.equal(await visibleNav(revokedOwner).then((items) => items.join(",")), "objects", "revocation closes protected Source UI to its safe object-only shell");
  for (const old of state.held) answer(old.request, old.payload);
  await wait(300);
  assert.equal(await revokedOwner.evaluate(() => document.body.innerText.includes("SRC-E2E-A")), false,
    "late old list/warning/facet responses must not repopulate revoked Source data");
  assert.equal(await revokedOwner.$('option[value="owner:qa phụ trách e2e"]'), null,
    "late old facet must not restore an owner option after revocation");
  await revokedOwner.close();

  // Bề mặt Source phụ ở màn Tiến độ cũng phải gắn revision, không chỉ Shell.
  // Giữ một page Source cũ qua hai generation để chứng minh Card không hồi sinh.
  state.holdOldSource = false; state.holdOldFacets = false; state.holdOldWarnings = false;
  state.held = []; state.revoked = false; state.revision += 1;
  const cardOwner = await openPersona(PERSONAS.owner, state);
  await cardOwner.goto(`${ORIGIN}#v=progress`, { waitUntil: "domcontentloaded" });
  await cardOwner.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => button.textContent?.trim() === "Theo đối tượng"));
  await cardOwner.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Theo đối tượng")?.click());
  await cardOwner.waitForSelector("[data-source-outside-toggle]", { timeout: 15_000 });
  await cardOwner.click("[data-source-outside-toggle]");
  await cardOwner.waitForFunction(() => document.querySelector("[data-source-outside-table]")?.textContent?.includes("SRC-E2E-A") === true);
  await wait(1_100);
  state.holdOldCard = true; state.revision += 1;
  await cardOwner.evaluate(() => window.dispatchEvent(new Event("focus")));
  for (let attempt = 0; attempt < 60
    && !state.held.some((entry) => entry.rpc === "card_source_list"); attempt += 1) await wait(50);
  assert.equal(state.held.some((entry) => entry.rpc === "card_source_list"), true,
    "old Card Source page must be held before revocation");
  await wait(1_100);
  state.revoked = true; state.revision += 1;
  await cardOwner.evaluate(() => window.dispatchEvent(new Event("focus")));
  await cardOwner.waitForFunction(() => document.querySelector("[data-source-outside-export]")?.disabled === true
    && !document.querySelector("[data-source-outside-table]")?.textContent?.includes("SRC-E2E-A"), { timeout: 15_000 });
  for (const old of state.held) answer(old.request, old.payload);
  await wait(300);
  assert.equal(await cardOwner.$eval("[data-source-outside-table]", (node) => node.textContent?.includes("SRC-E2E-A")), false,
    "late Card Source response must not restore revoked Source rows");
  await cardOwner.close();

  const forbiddenByLowerRole = bodies.filter((entry) => ["qa_staff", "workshop_staff"].includes(entry.role)
    && ["rpc_list_catalog_dataset", "rpc_list_catalog_changes", "rpc_catalog_history", "rpc_stage_catalog_import"].includes(entry.rpc));
  assert.deepEqual(forbiddenByLowerRole, [], "lower roles must not issue non-object catalog, import, pending, or history requests");
  assert.deepEqual(unexpected, [], "browser proof must not make network calls outside preview and intercepted Supabase");
  console.log("source QA/workshop access E2E: pass");
} finally {
  await browser.close();
}

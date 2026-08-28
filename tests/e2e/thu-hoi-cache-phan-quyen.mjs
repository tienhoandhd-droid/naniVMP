import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { docEnv } from "./dang-nhap.mjs";
import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { LA_UI_ACCESS, uiAccessAdmin } from "./ui-access.mjs";
import { dungKhoDuLieu, nhetPhien, traLoi } from "./gia-lap-supabase.mjs";

const GOC = "http://localhost:4173";
await choServer(GOC);
const mockSupabaseOrigin = new URL(docEnv().VITE_SUPABASE_URL).origin;
const mockSupabase = dungKhoDuLieu("day");

const QA_FIELDS = [
  "actual_protocol_date", "status_protocol",
  "actual_validation_date", "status_validation",
  "actual_report_date", "status_report",
  "actual_vmp_date", "status_vmp",
];
const makeActivity = (id, code, name) => ({
  id, code, name, vtype: "PQ", dep: "Không phụ thuộc", owner: "QA E2E",
  dept: "qa", target: "2026-12-31", st: "todo", state: "active",
  _raw: { version: 0, state: "active", tt_de_cuong: "not_started" },
});
const secret = makeActivity("VMP-CACHE-SECRET", "TB-BI-MAT", "Thiết bị không còn được phân");
const allowed = makeActivity("VMP-CACHE-ALLOWED", "TB-DUOC-XEM", "Thiết bị còn được phân");

let mode = "preview";
let failDashboard = false;
let modeReads = 0;
let legacyReads = 0;
let holdLegacy = false;
let heldLegacyRequest = null;
// Phase preview → enforced bắt đầu bằng thu hồi phân công; scenario modal
// collaborator phía dưới tự bật lại trạng thái này một cách tường minh.
let collaboratorAssigned = false;
let holdNextRights = false;
let heldRightsRequest = null;
let rightsReads = 0;
let batchRightsReads = 0;
const batchBodies = [];
const itemBodies = [];
const unexpectedRequests = [];
let staleRightsRequest = null;
let markStaleRightsFinished = null;
let failNextRights = false;
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};
const answer = (request, body, status = 200) => request.method() === "OPTIONS"
  ? request.respond({ status: 204, headers: cors, body: "" })
  : request.respond({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
await nhetPhien(page, { supabaseUrl: docEnv().VITE_SUPABASE_URL });
await page.setRequestInterception(true);
page.on("request", (request) => {
  const url = request.url();
  if (url.startsWith("data:") || url.startsWith("blob:")) return request.continue();
  const parsed = new URL(url);
  if (/\/rest\/v1\/vmp_performers/.test(url)) return answer(request, []);
  if (parsed.origin === mockSupabaseOrigin && (/\/auth\/v1\//.test(url) || /\/rest\/v1\/(?!rpc\/)/.test(url))) {
    return request.respond(traLoi(mockSupabase, parsed, request));
  }
  /* Xem chú thích ở quyen-cot-timeline: mở được màn là điều kiện cần trước
     khi soi được lớp quyền theo hạng mục. */
  if (LA_UI_ACCESS.test(url)) return answer(request, uiAccessAdmin);
  if (/\/rpc\/item_permissions_mode/.test(url)) {
    modeReads += request.method() === "OPTIONS" ? 0 : 1;
    return answer(request, mode);
  }
  if (/\/rpc\/rpc_get_vmp_dashboard/.test(url)) {
    if (failDashboard) return answer(request, { message: "forced dashboard failure" }, 500);
    const activities = mode === "preview" || collaboratorAssigned ? [secret, allowed] : [allowed];
    return answer(request, {
      activities,
      objects: activities.map((activity) => ({ code: activity.code, name: activity.name })),
      source: "supabase",
      updated_at: "2026-08-10T00:00:00Z",
      authorization_revision: 7,
      year: 2026,
    });
  }
  if (/\/rpc\/rpc_get_vmp_watermark/.test(url)) {
    return answer(request, {
      year: 2026, plan_items: 2, objects: 2,
      updated_at: "2026-08-10T00:00:00Z", authorization_revision: 7,
    });
  }
  if (/\/rpc\/rpc_my_editable_progress_rights/.test(url)) {
    batchRightsReads += request.method() === "OPTIONS" ? 0 : 1;
    if (request.method() !== "OPTIONS") batchBodies.push(JSON.parse(request.postData() || "{}"));
    const fields = collaboratorAssigned ? QA_FIELDS : [];
    const rights = mode === "preview" || collaboratorAssigned
      ? [secret, allowed].map((activity) => ({
        validation_code: activity.id, editable_fields: fields.length ? fields : QA_FIELDS,
        view_reason: "E2E quyền tiến độ",
      }))
      : [{ validation_code: allowed.id, editable_fields: QA_FIELDS, view_reason: "E2E quyền còn lại" }];
    return answer(request, { ok: true, rights });
  }
  if (/\/rpc\/vmp_my_item_rights/.test(url)) {
    if (request.method() === "OPTIONS") return answer(request, []);
    rightsReads += 1;
    itemBodies.push(JSON.parse(request.postData() || "{}"));
    if (failNextRights) {
      failNextRights = false;
      return answer(request, { message: "forced rights failure" }, 500);
    }
    if (holdNextRights) {
      holdNextRights = false;
      heldRightsRequest = request;
      return;
    }
    return answer(request, [{
      can_view: collaboratorAssigned,
      editable_fields: collaboratorAssigned ? QA_FIELDS : [],
      view_reason: collaboratorAssigned
        ? "QA phối hợp theo phân công hạng mục"
        : "Chưa có phân công QA đang hoạt động",
      assignment_sources: collaboratorAssigned ? ["qa_collaborator"] : [],
      scope_match: collaboratorAssigned,
      area_match: collaboratorAssigned,
    }]);
  }
  if (/legacy-vmp\.invalid\/read/.test(url)) {
    legacyReads += 1;
    if (holdLegacy) {
      heldLegacyRequest = request;
      return;
    }
    return answer(request, { activities: [secret], objects: [] });
  }
  if (parsed.origin === GOC) return request.continue();
  unexpectedRequests.push(`${request.method()} ${parsed.origin}${parsed.pathname}`);
  return request.abort();
});
page.on("requestfinished", (request) => {
  if (request === staleRightsRequest) markStaleRightsFinished?.();
});

async function openProgressModal(validationCode = secret.id) {
  const readsBeforeOpen = rightsReads;
  await page.click(`.vmp-chi-desktop [data-progress-item="${validationCode}"] button[title="Cập nhật tiến độ"]`);
  await page.waitForFunction(() => [...document.querySelectorAll(".vmp-scroll")]
    .some((dialog) => dialog.getClientRects().length > 0
      && [...dialog.querySelectorAll("span")]
        .some((node) => node.textContent?.trim() === "Cập nhật tiến độ")));
  for (let i = 0; i < 100 && rightsReads === readsBeforeOpen; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(rightsReads > readsBeforeOpen, "mở modal phải đọc quyền từng hạng mục");
}

const enabledQaControls = () => page.evaluate(() => {
  const dialog = [...document.querySelectorAll(".vmp-scroll")]
    .find((candidate) => candidate.getClientRects().length > 0
      && [...candidate.querySelectorAll("span")]
        .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"));
  /* Loại ô "Người thực hiện": là select nhưng không phải control ngày/
     trạng thái mà phép kiểm này quan tâm. Ô đó nay hiện theo quyền màn
     hình (`source.edit_catalog`) chứ không theo cờ `isAdmin` cũ đọc từ tài
     khoản đăng nhập, nên với payload admin nó xuất hiện và làm phép đếm
     nhảy từ 8 lên 9 — đếm nhầm chứ không phải web sai. */
  return [...dialog.querySelectorAll('input[type="date"], select')]
    .filter((control) => control.getAttribute("aria-label") !== "Người thực hiện")
    .filter((control) => !control.disabled).length;
});

try {
  await page.goto(`${GOC}#v=progress`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("TB-BI-MAT"));
  await page.waitForFunction(() => localStorage.getItem("vmp_snapshot_v2") !== null);

  // Một response legacy đã bắt đầu hợp lệ ở preview không được phép ghi dữ
  // liệu trở lại sau khi mode đổi enforced trong lúc request còn đang bay.
  failDashboard = true;
  holdLegacy = true;
  await page.evaluate(() => localStorage.setItem("vmp_monitor_conn_v1", JSON.stringify({
    readUrl: "https://legacy-vmp.invalid/read", writeUrl: "",
  })));
  await page.reload({ waitUntil: "domcontentloaded" });
  for (let i = 0; i < 100 && !heldLegacyRequest; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(heldLegacyRequest, "preview lỗi Supabase phải bắt đầu fallback legacy để tái hiện race");

  mode = "enforced";
  failDashboard = false;
  collaboratorAssigned = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => !document.body.innerText.includes("TB-BI-MAT"));
  await answer(heldLegacyRequest, { activities: [secret], objects: [] });
  heldLegacyRequest = null;
  holdLegacy = false;
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(await page.evaluate(() => document.body.innerText.includes("TB-BI-MAT")), false,
    "response preview đến muộn không được ghi đè dữ liệu enforced");

  const readsBeforeEnforced = modeReads;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => !document.body.innerText.includes("TB-BI-MAT"));
  assert.equal(await page.evaluate(() => document.body.innerText.includes("TB-DUOC-XEM")), true);
  assert.equal(await page.evaluate(() => localStorage.getItem("vmp_snapshot_v2")), null,
    "enforced phải xóa snapshot preview");
  assert.ok(modeReads > readsBeforeEnforced, "focus/poll phải đọc lại mode thay vì chỉ nhìn watermark");

  legacyReads = 0;
  failDashboard = true;
  await page.evaluate(() => {
    localStorage.setItem("vmp_monitor_conn_v1", JSON.stringify({
      readUrl: "https://legacy-vmp.invalid/read", writeUrl: "",
    }));
    localStorage.setItem("vmp_snapshot_v2", JSON.stringify({ activities: [{ code: "TB-BI-MAT" }] }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("không dùng nguồn dự phòng chưa lọc"));

  assert.equal(await page.evaluate(() => document.body.innerText.includes("TB-BI-MAT")), false);
  assert.equal(await page.evaluate(() => localStorage.getItem("vmp_snapshot_v2")), null);
  assert.equal(legacyReads, 0, "enforced không được fail-open sang n8n legacy");

  // Khi QA phối hợp bị thu hồi lúc modal đang mở, modal phải tự đọc lại
  // quyền, khóa tám control, dashboard mất hạng mục. Response quyền cũ bắt
  // đầu trước lúc revoke cũng không được phép cấp lại quyền.
  failDashboard = false;
  // Đây là phase độc lập: QA phối hợp còn được phân để mở modal trước revoke.
  collaboratorAssigned = true;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-progress-rights-state="ready"]');
  await page.waitForSelector(`.vmp-chi-desktop [data-progress-item="${secret.id}"]`);
  await openProgressModal();
  await page.waitForFunction(() => [...document.querySelectorAll(".vmp-scroll")]
    .some((dialog) => dialog.getClientRects().length > 0
      && dialog.innerText.includes("Quyền theo từng cột đang áp dụng")));
  assert.equal(await enabledQaControls(), 8, "QA phối hợp ban đầu sửa đúng tám control");

  holdNextRights = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  for (let i = 0; i < 100 && !heldRightsRequest; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(heldRightsRequest, "modal đang mở phải tải lại quyền khi trang được focus");

  collaboratorAssigned = false;
  const batchReadsBeforeRevoke = batchRightsReads;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction((secretId) => !document.querySelector(`[data-progress-item="${secretId}"]`), {}, secret.id);
  await page.waitForFunction(() => ![...document.querySelectorAll(".vmp-scroll")]
    .some((dialog) => dialog.getClientRects().length > 0
      && [...dialog.querySelectorAll("span")]
        .some((node) => node.textContent?.trim() === "Cập nhật tiến độ")));
  assert.ok(batchRightsReads > batchReadsBeforeRevoke,
    "thu hồi phải đọc batch quyền mới trước khi đóng modal và bỏ hạng mục");

  staleRightsRequest = heldRightsRequest;
  const staleRightsFinished = new Promise((resolve) => { markStaleRightsFinished = resolve; });
  await answer(staleRightsRequest, [{
    can_view: true,
    editable_fields: QA_FIELDS,
    view_reason: "QA phối hợp theo phân công hạng mục",
    assignment_sources: ["qa_collaborator"],
    scope_match: true,
    area_match: true,
  }]);
  heldRightsRequest = null;
  await staleRightsFinished;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => document.body.innerText.includes("TB-BI-MAT")), false,
    "response quyền collaborator cũ về trễ không được tiết lộ lại nội dung hạng mục sau revoke");
  assert.equal(await page.evaluate(() => [...document.querySelectorAll(".vmp-scroll")]
    .some((dialog) => dialog.getClientRects().length > 0
      && [...dialog.querySelectorAll("span")]
        .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"))), false,
    "response quyền collaborator cũ về trễ không được mở lại modal đã đóng");

  // Không tải được quyền cũng không được giả định can_view=true. Focus làm
  // batch gate đóng modal ngay; request per-item lỗi đến sau không được dựng
  // lại dữ liệu cũ hoặc làm ứng dụng rơi vào ErrorBoundary.
  collaboratorAssigned = true;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-progress-rights-state="ready"]');
  await page.waitForSelector(`.vmp-chi-desktop [data-progress-item="${secret.id}"]`);
  await openProgressModal();
  const rightsReadsBeforeFailure = rightsReads;
  const batchReadsBeforeFailure = batchRightsReads;
  failNextRights = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  for (let i = 0; i < 100 && rightsReads === rightsReadsBeforeFailure; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await page.waitForFunction(() => ![...document.querySelectorAll(".vmp-scroll")]
    .some((dialog) => dialog.getClientRects().length > 0
      && [...dialog.querySelectorAll("span")]
        .some((node) => node.textContent?.trim() === "Cập nhật tiến độ")));
  await page.waitForSelector(`.vmp-chi-desktop [data-progress-item="${secret.id}"]`);
  assert.ok(rightsReads > rightsReadsBeforeFailure, "focus phải thực hiện request per-item bị ép lỗi");
  assert.ok(batchRightsReads > batchReadsBeforeFailure, "focus phải đọc lại batch quyền trước khi dựng danh sách");
  assert.equal(failNextRights, false, "mock lỗi per-item phải được tiêu thụ");
  assert.equal(await page.evaluate(() => document.body.innerText.includes("Ứng dụng gặp lỗi khi hiển thị")), false,
    "lỗi per-item sau khi modal đóng không được làm sập ứng dụng");
  assert.deepEqual(batchBodies,
    Array.from({ length: batchBodies.length }, () => ({})),
    "mọi batch POST ở mọi phase revoke phải có body đúng {}");
  assert.deepEqual(itemBodies,
    Array.from({ length: itemBodies.length }, () => ({ p_validation_code: secret.id })),
    "mọi per-item POST ở mọi phase revoke chỉ gửi đúng mã hạng mục đang mở");
  assert.deepEqual(unexpectedRequests, [],
    "revoke E2E phải abort và ghi nhận mọi request ngoài preview/mock origin");
  console.log("✅ Đổi enforced thu hồi cache; modal không lộ nội dung khi mất hoặc không tải được quyền");
} finally {
  await browser.close();
}

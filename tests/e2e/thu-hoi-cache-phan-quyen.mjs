import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { dangNhap } from "./dang-nhap.mjs";
import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";

const GOC = "http://localhost:4173";
await choServer(GOC);

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
let staleRightsRequest = null;
let markStaleRightsFinished = null;
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
await page.setRequestInterception(true);
page.on("request", (request) => {
  const url = request.url();
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
      updated_at: "2026-08-10T00:00:00Z",
    });
  }
  if (/\/rpc\/rpc_get_vmp_watermark/.test(url)) {
    return answer(request, { year: 2026, plan_items: 2, objects: 2, updated_at: "2026-08-10T00:00:00Z" });
  }
  if (/\/rpc\/vmp_my_item_rights/.test(url)) {
    if (request.method() === "OPTIONS") return answer(request, []);
    rightsReads += 1;
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
  if (/\/rest\/v1\/vmp_performers/.test(url)) return answer(request, []);
  if (/legacy-vmp\.invalid\/read/.test(url)) {
    legacyReads += 1;
    if (holdLegacy) {
      heldLegacyRequest = request;
      return;
    }
    return answer(request, { activities: [secret], objects: [] });
  }
  request.continue();
});
page.on("requestfinished", (request) => {
  if (request === staleRightsRequest) markStaleRightsFinished?.();
});

async function openProgressModal() {
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Cập nhật")?.click());
  await page.waitForFunction(() => [...document.querySelectorAll("span")]
    .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"));
}

const enabledQaControls = () => page.evaluate(() => {
  const title = [...document.querySelectorAll("span")]
    .find((node) => node.textContent?.trim() === "Cập nhật tiến độ");
  const dialog = title?.closest(".vmp-scroll");
  return [...dialog.querySelectorAll('input[type="date"], select')]
    .filter((control) => !control.disabled).length;
});

try {
  await dangNhap(page, GOC);
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
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => document.body.innerText.includes("TB-BI-MAT"));
  await openProgressModal();
  await page.waitForFunction(() => document.body.innerText.includes("Quyền theo từng cột đang áp dụng"));
  assert.equal(await enabledQaControls(), 8, "QA phối hợp ban đầu sửa đúng tám control");

  holdNextRights = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  for (let i = 0; i < 100 && !heldRightsRequest; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(heldRightsRequest, "modal đang mở phải tải lại quyền khi trang được focus");

  collaboratorAssigned = false;
  const rightsBeforeRevoke = rightsReads;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction((secretCode) => ![...document.querySelectorAll("tr")]
    .some((row) => row.innerText.includes(secretCode)), {}, secret.code);
  await page.waitForFunction(async () => {
    const title = [...document.querySelectorAll("span")]
      .find((node) => node.textContent?.trim() === "Cập nhật tiến độ");
    return title && [...title.closest(".vmp-scroll").querySelectorAll('input[type="date"], select')]
      .every((control) => control.disabled);
  });
  assert.ok(rightsReads > rightsBeforeRevoke, "thu hồi phải đọc quyền mới, không dùng quyền collaborator đã cache");
  assert.equal(await enabledQaControls(), 0, "thu hồi khóa cả tám control QA trong modal đang mở");

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
  assert.equal(await enabledQaControls(), 0,
    "response quyền collaborator cũ về trễ không được khôi phục quyền sau revoke");
  console.log("✅ Đổi enforced thu hồi cache; modal fail-closed và response quyền cũ không khôi phục quyền");
} finally {
  await browser.close();
}

import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { docEnv, doiVaiTrenMan } from "./dang-nhap.mjs";
import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import {
  LA_UI_ACCESS, uiAccessAdmin, uiAccessQuanLyQa,
} from "./ui-access.mjs";
import {
  NGUOI_DUNG, dungKhoDuLieu, nhetPhien, traLoi,
} from "./gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_ORIGIN || "http://localhost:4173";
await choServer(GOC);
const mockSupabaseOrigin = new URL(docEnv().VITE_SUPABASE_URL).origin;

const bangkokToday = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const QA_MANAGER_DATE = bangkokToday();
const WORKSHOP_DATE = QA_MANAGER_DATE;

const QA_MANAGER_FIELDS = [
  "actual_protocol_date", "status_protocol",
  "actual_validation_date", "status_validation",
  "actual_report_date", "status_report",
  "actual_vmp_date", "status_vmp",
];
const QA_STAFF_FIELDS = [
  "actual_protocol_date", "status_protocol",
  "status_validation",
  "actual_report_date", "status_report",
  "actual_vmp_date", "status_vmp",
];

const ACTIVITY = {
  id: "VMP-E2E-01",
  code: "TB-E2E-01",
  name: "Thiết bị kiểm quyền từng cột",
  vtype: "PQ",
  dep: "Không phụ thuộc",
  owner: "QA E2E",
  dept: "qa",
  target: "2026-12-31",
  st: "todo",
  state: "active",
  _raw: {
    version: 0,
    state: "active",
    bo_phan_goc: "QA",
    dl_de_cuong: "2026-09-01",
    dl_tham_dinh: "2026-10-01",
    dl_bao_cao: "2026-11-01",
    dl_vmp: "2026-12-31",
    // Hồ sơ legacy đã có trạng thái hoàn thành nhưng thiếu ngày. QA Manager
    // sửa đúng một actual field; form không cần gửi kèm status không đổi.
    tt_de_cuong: "completed",
    tt_tham_dinh: "not_started",
    tt_bao_cao: "not_started",
    tt_vmp: "not_started",
    // 07:35 UTC = 14:35 Asia/Bangkok. Trình duyệt E2E cố tình chạy UTC.
    scheduled_at: "2026-08-12T07:35:00.000Z",
    lich_td: "2026-08-12",
  },
};
const NEXT_ACTIVITY = {
  ...ACTIVITY,
  id: "VMP-E2E-02",
  code: "TB-E2E-02",
  name: "Thiết bị kế tiếp",
  _raw: { ...ACTIVITY._raw },
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});
const mockSupabase = dungKhoDuLieu("day");

const qaManagerRight = {
  can_view: true,
  editable_fields: QA_MANAGER_FIELDS,
  view_reason: "Quản lý QA xem toàn bộ hạng mục hoạt động",
  assignment_sources: [],
  scope_match: true,
  area_match: true,
};
const adminRight = {
  ...qaManagerRight,
  editable_fields: [...QA_MANAGER_FIELDS, "scheduled_at"],
  view_reason: "Admin được cấp toàn bộ cột tiến độ và lịch thẩm định",
};
const collaboratorQa = {
  can_view: true,
  editable_fields: QA_STAFF_FIELDS,
  view_reason: "QA phối hợp theo phân công hạng mục",
  assignment_sources: ["qa_collaborator"],
  scope_match: true,
  area_match: true,
};
const unassignedQa = {
  can_view: false,
  editable_fields: [],
  view_reason: "Chưa có phân công QA đang hoạt động",
  assignment_sources: [],
  scope_match: false,
  area_match: false,
};
const workshopStaff = {
  can_view: true,
  editable_fields: ["actual_validation_date"],
  view_reason: "Nhân viên xưởng được ghi ngày thẩm định thực tế",
  assignment_sources: ["equipment_department"],
  scope_match: true,
  area_match: true,
};
let updateShouldFail = false;
const updateBodies = [];
const permissionBodies = [];
const batchBodies = [];
const batchPhases = [];
const unexpectedRequests = [];
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};
const answer = (request, body) => request.method() === "OPTIONS"
  ? request.respond({ status: 204, headers: cors, body: "" })
  : request.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });

const userFor = (suffix, email, fullName) => ({
  ...NGUOI_DUNG,
  id: `98000000-0000-4000-8000-${suffix}`,
  email,
  user_metadata: { full_name: fullName },
});
const staffUiAccess = (businessRole, dataScope) => ({
  ok: true,
  mode: "enforced",
  business_role: businessRole,
  unresolved_reason: null,
  screens: {
    progress: { can_view: true, data_scope: dataScope, actions: ["view"] },
  },
});
const qaStaffUiAccess = staffUiAccess("qa_staff", "qa_assignment");
const workshopUiAccess = staffUiAccess("workshop_staff", "workshop_assignment");
const PERSONAS = {
  qaManager: {
    key: "qa_manager", label: "Quản lý QA E2E", mode: "enforced", right: qaManagerRight,
    user: userFor("000000000031", "qa-manager-matrix@vi-du.test", "Quản lý QA matrix E2E"),
    uiAccess: uiAccessQuanLyQa,
  },
  admin: {
    key: "admin", label: "Admin E2E", mode: "enforced", right: adminRight,
    user: userFor("000000000032", "admin-matrix@vi-du.test", "Admin matrix E2E"),
    uiAccess: uiAccessAdmin,
  },
  workshop: {
    key: "workshop", label: "Nhân viên xưởng E2E", mode: "enforced", right: workshopStaff,
    user: userFor("000000000033", "workshop-matrix@vi-du.test", "Nhân viên xưởng matrix E2E"),
    uiAccess: workshopUiAccess,
  },
  assignedQa: {
    key: "assigned_qa", label: "QA phụ trách E2E", mode: "enforced", right: collaboratorQa,
    user: userFor("000000000034", "qa-assigned-matrix@vi-du.test", "QA phụ trách matrix E2E"),
    uiAccess: qaStaffUiAccess,
  },
  unassignedQa: {
    key: "unassigned_qa", label: "QA chưa phân công E2E", mode: "enforced", right: unassignedQa,
    user: userFor("000000000035", "qa-unassigned-matrix@vi-du.test", "QA chưa phân công matrix E2E"),
    uiAccess: qaStaffUiAccess,
  },
};
const PERSONAS_KEYS = ["qa_manager", "admin", "workshop", "assigned_qa", "unassigned_qa"];

let page;
async function newPersonaPage(persona) {
  const nextPage = await browser.newPage();
  await nextPage.emulateTimezone("UTC");
  await nextPage.setViewport({ width: 1500, height: 1100 });
  await nhetPhien(nextPage, { supabaseUrl: docEnv().VITE_SUPABASE_URL, nguoiDung: persona.user });
  await nextPage.setRequestInterception(true);
  nextPage.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return request.continue();
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== mockSupabaseOrigin) {
      if (parsedUrl.origin === GOC) return request.continue();
      unexpectedRequests.push(`${persona.key}: ${request.method()} ${parsedUrl.origin}${parsedUrl.pathname}`);
      return request.abort();
    }
    if (LA_UI_ACCESS.test(url)) return answer(request, persona.uiAccess);
    if (/\/rpc\/rpc_get_vmp_dashboard/.test(url)) {
      return answer(request, {
        activities: [ACTIVITY, NEXT_ACTIVITY],
        objects: [], source: "supabase", updated_at: "2026-08-10T00:00:00Z",
        authorization_revision: 7, year: 2026,
      });
    }
    if (/\/rpc\/rpc_my_editable_progress_rights/.test(url)) {
      if (request.method() !== "OPTIONS") {
        batchBodies.push({ persona: persona.key, body: JSON.parse(request.postData() || "{}") });
      }
      const fields = persona.right.editable_fields || [];
      return answer(request, { ok: true, rights: persona.right === unassignedQa ? [{
        validation_code: NEXT_ACTIVITY.id, editable_fields: QA_MANAGER_FIELDS,
        view_reason: "Hạng mục khác còn được xem",
      }] : [{
        validation_code: ACTIVITY.id, editable_fields: fields, view_reason: persona.right.view_reason,
      }, {
        validation_code: NEXT_ACTIVITY.id, editable_fields: QA_MANAGER_FIELDS,
        view_reason: "Hạng mục kế tiếp",
      }] });
    }
    if (/\/rpc\/rpc_get_vmp_watermark/.test(url)) {
      return answer(request, {
        year: 2026, plan_items: 1, objects: 1,
        updated_at: "2026-08-10T00:00:00Z", authorization_revision: 7,
      });
    }
    if (/\/rpc\/item_permissions_mode/.test(url)) return answer(request, persona.mode);
    if (/\/rpc\/vmp_my_item_rights/.test(url)) {
      if (request.method() !== "OPTIONS") {
        permissionBodies.push({ persona: persona.key, body: JSON.parse(request.postData() || "{}") });
      }
      return answer(request, [persona.right]);
    }
    if (/\/rpc\/rpc_update_progress/.test(url)) {
      if (request.method() !== "OPTIONS") updateBodies.push(JSON.parse(request.postData() || "{}"));
      if (request.method() !== "OPTIONS" && updateShouldFail) {
        return request.respond({
          status: 400,
          headers: cors,
          contentType: "application/json",
          body: JSON.stringify({ code: "E2E_SAVE_FAILED", message: "Lưu E2E thất bại" }),
        });
      }
      return answer(request, { ok: true });
    }
    if (/\/vmp_performers/.test(url)) return answer(request, []);
    if (/\/(?:auth|rest)\/v1\//.test(url)) {
      return request.respond(traLoi(mockSupabase, parsedUrl, request, { nguoiDung: persona.user }));
    }
    unexpectedRequests.push(`${persona.key}: ${request.method()} ${parsedUrl.origin}${parsedUrl.pathname}`);
    return request.abort();
  });
  return nextPage;
}

async function closeModal() {
  const hasModal = await page.evaluate(() => [...document.querySelectorAll(".vmp-scroll")]
    .some((dialog) => dialog.getClientRects().length > 0
      && [...dialog.querySelectorAll("span")]
        .some((node) => node.textContent?.trim() === "Cập nhật tiến độ")));
  if (!hasModal) return;
  await page.evaluate(() => {
    const dialog = [...document.querySelectorAll(".vmp-scroll")]
      .find((candidate) => candidate.getClientRects().length > 0
        && [...candidate.querySelectorAll("span")]
          .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"));
    [...(dialog?.querySelectorAll("button") ?? [])]
      .find((button) => button.textContent?.trim() === "Hủy")?.click();
  });
  await page.waitForFunction(() => ![...document.querySelectorAll(".vmp-scroll")]
    .some((dialog) => dialog.getClientRects().length > 0
      && [...dialog.querySelectorAll("span")]
        .some((node) => node.textContent?.trim() === "Cập nhật tiến độ")));
}

async function loadPersona(persona) {
  if (page) await page.close();
  page = await newPersonaPage(persona);
  const batchReadsBeforePersona = batchBodies.length;
  await page.goto(`${GOC}#v=progress`, { waitUntil: "domcontentloaded" });
  await doiVaiTrenMan(page, "edit", persona.label);
  for (let i = 0; i < 100 && batchBodies.length === batchReadsBeforePersona; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(batchBodies.length > batchReadsBeforePersona,
    `persona ${persona.key} phải đọc batch-rights mới bằng session riêng`);
  assert.deepEqual(batchBodies.at(-1), { persona: persona.key, body: {} },
    "batch-rights không nhận persona hoặc mã item từ browser");
  batchPhases.push({ persona: persona.key, count: batchBodies.length - batchReadsBeforePersona });
  await page.waitForSelector('[data-progress-rights-state="ready"]');
}

async function openPersona(persona, { quick = false } = {}) {
  await loadPersona(persona);
  await page.waitForSelector(`.vmp-chi-desktop [data-progress-item="${ACTIVITY.id}"]`);
  await page.evaluate(([useQuick, itemId]) => {
    const row = document.querySelector(`.vmp-chi-desktop [data-progress-item="${itemId}"]`);
    [...(row?.querySelectorAll("button") ?? [])]
      .find((button) => button.textContent?.trim() === (useQuick ? "✓ Xong bước" : "Cập nhật"))?.click();
  }, [quick, ACTIVITY.id]);
  await page.waitForFunction(() => [...document.querySelectorAll(".vmp-scroll")]
    .some((dialog) => dialog.getClientRects().length > 0
      && [...dialog.querySelectorAll("span")]
        .some((node) => node.textContent?.trim() === "Cập nhật tiến độ")));
  await page.waitForFunction(
    (expectedMode) => [...document.querySelectorAll(".vmp-scroll")]
      .some((dialog) => dialog.getClientRects().length > 0
        && dialog.innerText.includes(expectedMode === "preview"
          ? "Quyền dự kiến chưa áp dụng"
          : "Quyền theo từng cột đang áp dụng")),
    {},
    persona.mode,
  );
}

async function controlState() {
  return page.evaluate(() => {
    const dialog = [...document.querySelectorAll(".vmp-scroll")]
      .find((candidate) => candidate.getClientRects().length > 0
        && [...candidate.querySelectorAll("span")]
          .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"));
    /* Loại ô "Người thực hiện": nó là select nhưng KHÔNG phải control
       ngày/trạng thái mà phép kiểm này quan tâm. Ô đó nay hiện theo quyền
       màn hình (`source.edit_catalog`) chứ không theo cờ `isAdmin` cũ đọc
       từ tài khoản đăng nhập, nên với payload admin nó xuất hiện và làm
       phép đếm nhảy từ 8 lên 9 — đếm nhầm chứ không phải web sai. */
    const qa = [...dialog.querySelectorAll('input[type="date"], select')]
      .filter((el) => el.getAttribute("aria-label") !== "Người thực hiện");
    const schedule = dialog.querySelector('input[type="datetime-local"]');
    return {
      qaCount: qa.length,
      qaEnabled: qa.filter((control) => !control.disabled).length,
      actualLabelCount: [...dialog.querySelectorAll("span")]
        .filter((node) => node.textContent?.trim() === "Ngày hoàn thành thực tế").length,
      schedulePresent: !!schedule,
      scheduleEnabled: !!schedule && !schedule.disabled,
      scheduleValue: schedule?.value || "",
      hasSave: [...dialog.querySelectorAll("button")]
        .some((button) => /^Lưu(?:\s|$)/.test(button.textContent?.trim() || "")),
      text: dialog.innerText,
    };
  });
}

try {
  await openPersona(PERSONAS.qaManager);
  assert.deepEqual(permissionBodies[0], {
    persona: "qa_manager", body: { p_validation_code: ACTIVITY.id },
  },
    "frontend chỉ gửi mã hạng mục vào wrapper quyền của chính auth.uid");
  const qa = await controlState();
  assert.equal(qa.qaCount, 8, "QA phải có đúng tám control ngày/trạng thái");
  assert.equal(qa.qaEnabled, 8, "QA phải sửa được đủ tám trường QA");
  assert.equal(qa.actualLabelCount, 4,
    "bốn ô ngày QA phải giữ đúng nhãn Ngày hoàn thành thực tế");
  assert.equal(qa.schedulePresent, false, "QA không được có scheduled_at trong DOM");
  await page.evaluate((actualDate) => {
    const title = [...document.querySelectorAll("span")]
      .find((node) => node.textContent?.trim() === "1. Đề cương");
    const block = title?.closest("div[style*='border']");
    const input = block?.querySelector('input[type="date"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter.call(input, actualDate);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, QA_MANAGER_DATE);
  await page.type("textarea", "QA Manager bổ sung ngày đề cương thực tế");
  await page.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || "") && !button.disabled));
  updateShouldFail = true;
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || ""))?.click());
  await page.waitForFunction(() => document.body.innerText.includes("Lưu E2E thất bại"));
  const qaDraftAfterFailure = await page.evaluate(() => {
    const dialog = [...document.querySelectorAll(".vmp-scroll")]
      .find((candidate) => candidate.getClientRects().length > 0
        && [...candidate.querySelectorAll("span")]
          .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"));
    return [...(dialog?.querySelectorAll('input[type="date"]') ?? [])].map((input) => input.value);
  });
  assert.equal(qaDraftAfterFailure[0], QA_MANAGER_DATE,
    "RPC từ chối phải giữ nguyên actual-date draft của QA Manager");
  assert.deepEqual(updateBodies[0], {
    p_validation_code: ACTIVITY.id,
    p_patch: { actual_protocol_date: QA_MANAGER_DATE },
    p_reason: "QA Manager bổ sung ngày đề cương thực tế",
    p_sheet_patch: null,
    p_expected_version: 0,
  }, "QA Manager gửi đúng một actual field cùng reason và optimistic version");
  updateShouldFail = false;
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || ""))?.click());
  await page.waitForFunction(() => ![...document.querySelectorAll(".vmp-scroll")]
    .some((dialog) => dialog.getClientRects().length > 0
      && [...dialog.querySelectorAll("span")]
        .some((node) => node.textContent?.trim() === "Cập nhật tiến độ")));
  assert.deepEqual(updateBodies[1], updateBodies[0],
    "QA Manager có thể thử lại nguyên bản nháp sau lỗi server");

  await openPersona(PERSONAS.admin);
  const admin = await controlState();
  assert.equal(admin.qaCount, 8, "Admin giữ đủ tám control ngày/trạng thái QA");
  assert.equal(admin.qaEnabled, 8, "Admin sửa được đủ tám trường QA được server cấp");
  assert.equal(admin.schedulePresent, true,
    "Admin chỉ có lịch thẩm định khi batch/per-item allowlist có scheduled_at");
  assert.equal(admin.scheduleEnabled, true,
    "Admin chỉ thấy lịch thẩm định khi batch/per-item allowlist có scheduled_at");
  assert.equal(admin.scheduleValue, "2026-08-12T14:35",
    "scheduled_at hiển thị theo Asia/Bangkok khi được server cấp");

  await openPersona(PERSONAS.workshop);
  const workshop = await controlState();
  assert.equal(workshop.qaCount, 1,
    "nhân viên xưởng chỉ còn đúng một control QA trong DOM, không giữ field cấm dạng disabled");
  assert.equal(workshop.qaEnabled, 1,
    "nhân viên xưởng chỉ được sửa ngày thẩm định thực tế trong tám trường QA");
  assert.equal(workshop.actualLabelCount, 1,
    "nhân viên xưởng chỉ thấy nhãn ngày thực tế của bước thẩm định");
  assert.equal(workshop.schedulePresent, false,
    "nhân viên xưởng không được có lịch thẩm định trong DOM");
  const workshopStages = await page.evaluate(() => {
    const dialog = [...document.querySelectorAll(".vmp-scroll")]
      .find((candidate) => candidate.getClientRects().length > 0
        && [...candidate.querySelectorAll("span")]
          .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"));
    return [1, 2, 3, 4].map((stage) => {
      const title = [...(dialog?.querySelectorAll("span") ?? [])]
        .find((node) => node.textContent?.trim().startsWith(`${stage}. `));
      const block = title?.closest("div[style*='border']");
      return {
        dates: block?.querySelectorAll('input[type="date"]').length ?? 0,
        statuses: block?.querySelectorAll("select").length ?? 0,
        actualLabels: [...(block?.querySelectorAll("span") ?? [])]
          .filter((node) => node.textContent?.trim() === "Ngày hoàn thành thực tế").length,
      };
    });
  });
  assert.deepEqual(workshopStages, [
    { dates: 0, statuses: 0, actualLabels: 0 },
    { dates: 1, statuses: 0, actualLabels: 1 },
    { dates: 0, statuses: 0, actualLabels: 0 },
    { dates: 0, statuses: 0, actualLabels: 0 },
  ], "Workshop chỉ có actual_validation_date trong đúng bước 2; các stage khác rỗng");

  // Quyền date-only không đủ điều kiện dùng đường tắt “Xong bước”; nhập ngày
  // thủ công ở đúng stage 2 để không dựa vào bản quyền của persona trước.
  await page.evaluate((actualDate) => {
    const dialog = [...document.querySelectorAll(".vmp-scroll")]
      .find((candidate) => candidate.getClientRects().length > 0
        && [...candidate.querySelectorAll("span")]
          .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"));
    const title = [...(dialog?.querySelectorAll("span") ?? [])]
      .find((node) => node.textContent?.trim().startsWith("2. Thẩm định thực tế"));
    const input = title?.closest("div[style*='border']")?.querySelector('input[type="date"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, actualDate);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    input?.dispatchEvent(new Event("change", { bubbles: true }));
  }, WORKSHOP_DATE);
  await page.type("textarea", "Xưởng ghi nhận ngày thẩm định thực tế");
  await page.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || "") && !button.disabled));
  const workshopUpdateStart = updateBodies.length;
  updateShouldFail = true;
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || ""))?.click());
  await page.waitForFunction(() => document.body.innerText.includes("Lưu E2E thất bại"));
  assert.equal(
    await page.evaluate(() => [...document.querySelectorAll(".vmp-scroll")]
      .some((dialog) => dialog.getClientRects().length > 0
        && [...dialog.querySelectorAll("span")]
          .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"))),
    true,
    "RPC lỗi thì modal phải giữ nguyên để người dùng thử lại",
  );
  updateShouldFail = false;
  await page.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || "") && !button.disabled));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || ""))?.click());
  await page.waitForFunction(() => ![...document.querySelectorAll(".vmp-scroll")]
    .some((dialog) => dialog.getClientRects().length > 0
      && [...dialog.querySelectorAll("span")]
        .some((node) => node.textContent?.trim() === "Cập nhật tiến độ")));
  assert.equal(updateBodies.length, workshopUpdateStart + 2,
    "sau lỗi người dùng có thể thử lưu lại cùng bản nháp");
  assert.deepEqual(Object.keys(updateBodies[workshopUpdateStart + 1].p_patch), ["actual_validation_date"]);
  assert.equal(updateBodies[workshopUpdateStart + 1].p_patch.actual_validation_date, WORKSHOP_DATE,
    "nhân viên xưởng chỉ được gửi ngày thẩm định thực tế xuống RPC");

  await openPersona(PERSONAS.assignedQa);
  const collaborator = await controlState();
  assert.equal(collaborator.qaCount, 7, "QA phụ trách chỉ có bảy control được cấp");
  assert.equal(collaborator.qaEnabled, 7,
    "QA phụ trách không giữ control ngày thẩm định bị cấm trong DOM");
  assert.equal(collaborator.schedulePresent, false,
    "QA phối hợp không được có lịch thẩm định trong DOM");
  const qaStaffValidationControl = await page.evaluate(() => {
    const title = [...document.querySelectorAll("span")]
      .find((node) => node.textContent?.trim().startsWith("2. Thẩm định thực tế"));
    const block = title?.closest("div[style*='border']");
    const actualDate = block?.querySelector('input[type="date"]');
    const status = block?.querySelector("select");
    return { actualDatePresent: !!actualDate, statusPresent: !!status };
  });
  assert.deepEqual(qaStaffValidationControl, { actualDatePresent: false, statusPresent: true },
    "QA phụ trách chỉ có status thẩm định; ngày cấm không được render");
  await page.evaluate(() => {
    const title = [...document.querySelectorAll("span")]
      .find((node) => node.textContent?.trim().startsWith("2. Thẩm định thực tế"));
    const status = title?.closest("div[style*='border']")?.querySelector("select");
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(status, "Đang thực hiện");
    status?.dispatchEvent(new Event("input", { bubbles: true }));
    status?.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || "") && !button.disabled));
  const qaStaffUpdateStart = updateBodies.length;
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || ""))?.click());
  await page.waitForFunction(() => ![...document.querySelectorAll(".vmp-scroll")]
    .some((dialog) => dialog.getClientRects().length > 0
      && [...dialog.querySelectorAll("span")]
        .some((node) => node.textContent?.trim() === "Cập nhật tiến độ")));
  assert.deepEqual(updateBodies[qaStaffUpdateStart].p_patch, { status_validation: "in_progress" },
    "Nhân viên QA chỉ gửi trạng thái thẩm định được cấp xuống RPC");
  assert.equal(Object.hasOwn(updateBodies[qaStaffUpdateStart].p_patch, "actual_validation_date"), false,
    "request của Nhân viên QA không chứa actual_validation_date");

  await loadPersona(PERSONAS.unassignedQa);
  await page.waitForFunction(() => document.body.innerText.includes("TB-E2E-02"));
  assert.equal(await page.evaluate(() => document.body.innerText.includes("TB-E2E-01")), false,
    "QA chưa phân công không thấy hạng mục mục tiêu trên dashboard enforced");
  assert.equal(await page.evaluate((targetCode) => [...document.querySelectorAll("tr")]
    .some((row) => row.innerText.includes(targetCode)), ACTIVITY.code), false,
  "không có dòng hạng mục thì QA chưa phân công không thể mở modal cập nhật");
  assert.equal(await page.evaluate(() => [...document.querySelectorAll(".vmp-scroll")]
    .some((dialog) => dialog.getClientRects().length > 0
      && [...dialog.querySelectorAll("span")]
        .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"))), false,
  "dashboard đã thu hồi hạng mục không để modal mục tiêu còn mở");

  assert.deepEqual(batchBodies.map(({ body }) => body),
    Array.from({ length: batchBodies.length }, () => ({})),
    "mọi batch POST ở mọi persona phải có body đúng {}");
  assert.deepEqual(batchPhases.map(({ persona }) => persona),
    ["qa_manager", "admin", "workshop", "assigned_qa", "unassigned_qa"],
    "matrix phải đọc batch-rights mới ở đủ năm session persona");
  assert.deepEqual(Object.fromEntries(PERSONAS_KEYS.map((persona) => [
    persona, batchBodies.filter((entry) => entry.persona === persona).length,
  ])), {
    qa_manager: 1, admin: 1, workshop: 1, assigned_qa: 1, unassigned_qa: 1,
  }, "mỗi phase persona phải phát sinh đúng một batch POST");
  assert.deepEqual(permissionBodies.map(({ body }) => body),
    Array.from({ length: permissionBodies.length }, () => ({ p_validation_code: ACTIVITY.id })),
    "mọi per-item POST chỉ gửi đúng mã hạng mục mục tiêu");
  assert.deepEqual(permissionBodies.map(({ persona }) => persona),
    ["qa_manager", "admin", "workshop", "assigned_qa"],
    "bốn persona có row phải reload per-item bằng đúng session riêng");

  assert.deepEqual(unexpectedRequests, [],
    "focused E2E không được để request ngoài preview/mock origin đi ra mạng");

  console.log("✅ Matrix quyền QA/xưởng ẩn control bị cấm và lọc item chưa phân công");
} finally {
  await browser.close();
}

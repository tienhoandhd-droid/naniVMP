import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { docEnv, doiVaiTrenMan } from "./dang-nhap.mjs";
import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { LA_UI_ACCESS, uiAccessQuanLyQa } from "./ui-access.mjs";
import {
  MAT_KHAU_DUNG, NGUOI_DUNG, dungKhoDuLieu, traLoi,
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
const page = await browser.newPage();
await page.emulateTimezone("UTC");
await page.setViewport({ width: 1500, height: 1100 });
await page.setRequestInterception(true);
const mockSupabase = dungKhoDuLieu("day");

let mode = "enforced";
const qaManagerRight = {
  can_view: true,
  editable_fields: QA_MANAGER_FIELDS,
  view_reason: "Quản lý QA xem toàn bộ hạng mục hoạt động",
  assignment_sources: [],
  scope_match: true,
  area_match: true,
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
let right = qaManagerRight;
let updateShouldFail = false;
const updateBodies = [];
const permissionBodies = [];
const unexpectedRequests = [];
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};
const answer = (request, body) => request.method() === "OPTIONS"
  ? request.respond({ status: 204, headers: cors, body: "" })
  : request.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });

page.on("request", (request) => {
  const url = request.url();
  if (url.startsWith("data:") || url.startsWith("blob:")) return request.continue();
  const parsedUrl = new URL(url);
  if (parsedUrl.origin !== mockSupabaseOrigin) {
    if (parsedUrl.origin === GOC) return request.continue();
    unexpectedRequests.push(`${request.method()} ${parsedUrl.origin}${parsedUrl.pathname}`);
    return request.abort();
  }
  /* Bài kiểm này cần đúng persona Quản lý QA ở cả lớp quyền màn hình lẫn
     allowlist theo hạng mục; auth/profile nền cũng được mock, không ra mạng. */
  if (LA_UI_ACCESS.test(url)) return answer(request, uiAccessQuanLyQa);
  if (/\/rpc\/rpc_get_vmp_dashboard/.test(url)) {
    return answer(request, {
      activities: right === unassignedQa ? [NEXT_ACTIVITY] : [ACTIVITY, NEXT_ACTIVITY],
      objects: [], updated_at: "2026-08-10T00:00:00Z",
    });
  }
  if (/\/rpc\/rpc_get_vmp_watermark/.test(url)) {
    return answer(request, { year: 2026, plan_items: 1, objects: 1, updated_at: "2026-08-10T00:00:00Z" });
  }
  if (/\/rpc\/item_permissions_mode/.test(url)) return answer(request, mode);
  if (/\/rpc\/vmp_my_item_rights/.test(url)) {
    if (request.method() !== "OPTIONS") permissionBodies.push(JSON.parse(request.postData() || "{}"));
    return answer(request, [right]);
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
    return request.respond(traLoi(mockSupabase, parsedUrl, request));
  }
  unexpectedRequests.push(`${request.method()} ${parsedUrl.origin}${parsedUrl.pathname}`);
  request.abort();
});

async function dangNhapGiaLap() {
  await page.goto(GOC, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("input[type=password]", { timeout: 30000 });
  const inputs = await page.$$("input");
  await inputs[0].type(NGUOI_DUNG.email);
  const password = await page.$("input[type=password]");
  await password.type(MAT_KHAU_DUNG);
  await password.press("Enter");
  await page.waitForFunction(
    () => document.querySelectorAll("input[type=password]").length === 0,
    { timeout: 30000 },
  );
  await page.waitForFunction(() => document.body.innerText.includes("hạng mục"), { timeout: 45000 });
}

async function closeModal() {
  const hasModal = await page.evaluate(() => [...document.querySelectorAll("span")]
    .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"));
  if (!hasModal) return;
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Hủy")?.click();
  });
  await page.waitForFunction(() => ![...document.querySelectorAll("span")]
    .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"));
}

async function openPersona(nextMode, nextRight, { quick = false } = {}) {
  await closeModal();
  mode = nextMode;
  right = nextRight;
  await page.evaluate((useQuick) => {
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === (useQuick ? "✓ Xong bước" : "Cập nhật"))?.click();
  }, quick);
  await page.waitForFunction(() => [...document.querySelectorAll("span")]
    .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"));
  await page.waitForFunction(
    (expectedMode) => document.body.innerText.includes(expectedMode === "preview"
      ? "Quyền dự kiến chưa áp dụng"
      : "Quyền theo từng cột đang áp dụng"),
    {},
    nextMode,
  );
}

async function controlState() {
  return page.evaluate(() => {
    const title = [...document.querySelectorAll("span")]
      .find((node) => node.textContent?.trim() === "Cập nhật tiến độ");
    const dialog = title?.closest(".vmp-scroll");
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
      scheduleEnabled: !!schedule && !schedule.disabled,
      scheduleValue: schedule?.value || "",
      hasSave: [...dialog.querySelectorAll("button")]
        .some((button) => /^Lưu(?:\s|$)/.test(button.textContent?.trim() || "")),
      text: dialog.innerText,
    };
  });
}

try {
  await dangNhapGiaLap();
  await doiVaiTrenMan(page, "edit", "Quản lý QA E2E");
  await page.goto(`${GOC}#v=progress`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("TB-E2E-01"));

  await openPersona("enforced", qaManagerRight);
  assert.deepEqual(permissionBodies[0], { p_validation_code: ACTIVITY.id },
    "frontend chỉ gửi mã hạng mục vào wrapper quyền của chính auth.uid");
  const qa = await controlState();
  assert.equal(qa.qaCount, 8, "QA phải có đúng tám control ngày/trạng thái");
  assert.equal(qa.qaEnabled, 8, "QA phải sửa được đủ tám trường QA");
  assert.equal(qa.actualLabelCount, 4,
    "bốn ô ngày QA phải giữ đúng nhãn Ngày hoàn thành thực tế");
  assert.equal(qa.scheduleEnabled, false, "QA không được sửa scheduled_at");
  assert.equal(qa.scheduleValue, "2026-08-12T14:35", "giờ Bangkok phải hiển thị không lệch theo timezone trình duyệt");
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
    const modalTitle = [...document.querySelectorAll("span")]
      .find((node) => node.textContent?.trim() === "Cập nhật tiến độ");
    return [...(modalTitle?.closest(".vmp-scroll")
      ?.querySelectorAll('input[type="date"]') ?? [])].map((input) => input.value);
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
  await page.waitForFunction(() => ![...document.querySelectorAll("span")]
    .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"));
  assert.deepEqual(updateBodies[1], updateBodies[0],
    "QA Manager có thể thử lại nguyên bản nháp sau lỗi server");

  // Đường tắt đã điền sẵn hai trường QA trước khi quyền về, tạo một bản nháp
  // hỗn hợp. Enforced vẫn chỉ được gửi ngày thẩm định thực tế mà xưởng được cấp.
  await openPersona("enforced", workshopStaff, { quick: true });
  const workshop = await controlState();
  assert.equal(workshop.qaEnabled, 1,
    "nhân viên xưởng chỉ được sửa ngày thẩm định thực tế trong tám trường QA");
  assert.equal(workshop.scheduleEnabled, false, "nhân viên xưởng không được sửa lịch thẩm định");

  // Hồ sơ mock đã hoàn thành đề cương, nên đường tắt mở đúng bước 2 và
  // điền sẵn ngày thẩm định hôm nay. Quyền xưởng lọc status khỏi bản chênh.
  await page.type("textarea", "Xưởng ghi nhận ngày thẩm định thực tế");
  await page.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || "") && !button.disabled));
  const workshopUpdateStart = updateBodies.length;
  updateShouldFail = true;
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || ""))?.click());
  await page.waitForFunction(() => document.body.innerText.includes("Lưu E2E thất bại"));
  assert.equal(
    await page.evaluate(() => [...document.querySelectorAll("span")]
      .some((node) => node.textContent?.trim() === "Cập nhật tiến độ")),
    true,
    "RPC lỗi thì modal phải giữ nguyên để người dùng thử lại",
  );
  updateShouldFail = false;
  await page.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || "") && !button.disabled));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || ""))?.click());
  await page.waitForFunction(() => ![...document.querySelectorAll("span")]
    .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"));
  assert.equal(updateBodies.length, workshopUpdateStart + 2,
    "sau lỗi người dùng có thể thử lưu lại cùng bản nháp");
  assert.deepEqual(Object.keys(updateBodies[workshopUpdateStart + 1].p_patch), ["actual_validation_date"]);
  assert.equal(updateBodies[workshopUpdateStart + 1].p_patch.actual_validation_date, WORKSHOP_DATE,
    "nhân viên xưởng chỉ được gửi ngày thẩm định thực tế xuống RPC");

  await openPersona("enforced", collaboratorQa);
  const collaborator = await controlState();
  assert.equal(collaborator.qaCount, 8, "QA phối hợp có đúng tám control QA");
  assert.equal(collaborator.qaEnabled, 7,
    "Nhân viên QA chỉ sửa được bảy trường, không gồm ngày thẩm định thực tế");
  assert.equal(collaborator.scheduleEnabled, false, "QA phối hợp không được xếp lịch");
  const qaStaffValidationControl = await page.evaluate(() => {
    const title = [...document.querySelectorAll("span")]
      .find((node) => node.textContent?.trim().startsWith("2. Thẩm định thực tế"));
    const block = title?.closest("div[style*='border']");
    const actualDate = block?.querySelector('input[type="date"]');
    const status = block?.querySelector("select");
    return { actualDateDisabled: actualDate?.disabled, statusDisabled: status?.disabled };
  });
  assert.deepEqual(qaStaffValidationControl, { actualDateDisabled: true, statusDisabled: false },
    "Nhân viên QA thấy ngày thẩm định bị khóa nhưng vẫn sửa được trạng thái thẩm định");
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
  await page.waitForFunction(() => ![...document.querySelectorAll("span")]
    .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"));
  assert.deepEqual(updateBodies[qaStaffUpdateStart].p_patch, { status_validation: "in_progress" },
    "Nhân viên QA chỉ gửi trạng thái thẩm định được cấp xuống RPC");
  assert.equal(Object.hasOwn(updateBodies[qaStaffUpdateStart].p_patch, "actual_validation_date"), false,
    "request của Nhân viên QA không chứa actual_validation_date");

  await closeModal();
  mode = "enforced";
  right = unassignedQa;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("TB-E2E-02"));
  assert.equal(await page.evaluate(() => document.body.innerText.includes("TB-E2E-01")), false,
    "QA chưa phân công không thấy hạng mục mục tiêu trên dashboard enforced");
  assert.equal(await page.evaluate((targetCode) => [...document.querySelectorAll("tr")]
    .some((row) => row.innerText.includes(targetCode)), ACTIVITY.code), false,
  "không có dòng hạng mục thì QA chưa phân công không thể mở modal cập nhật");
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("span")]
    .some((node) => node.textContent?.trim() === "Cập nhật tiến độ")), false,
  "dashboard đã thu hồi hạng mục không để modal mục tiêu còn mở");

  await openPersona("preview", unassignedQa);
  const preview = await controlState();
  assert.equal(preview.qaEnabled, 8, "preview giữ nguyên tám control QA đang chạy");
  assert.equal(preview.scheduleEnabled, true, "preview không áp allowlist dự kiến lên lịch");
  assert.equal(preview.hasSave, true, "preview giữ hành vi lưu hiện tại");
  assert.deepEqual(unexpectedRequests, [],
    "focused E2E không được để request ngoài preview/mock origin đi ra mạng");

  console.log("✅ Timeline khóa đúng QA/xưởng, preview không cưỡng chế và giờ Bangkok không lệch");
} finally {
  await browser.close();
}

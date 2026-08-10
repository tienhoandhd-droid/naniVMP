import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { dangNhap, doiVaiTrenMan } from "./dang-nhap.mjs";
import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";

const GOC = "http://localhost:4173";
await choServer(GOC);

const QA_FIELDS = [
  "actual_protocol_date", "status_protocol",
  "actual_validation_date", "status_validation",
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
    tt_de_cuong: "not_started",
    tt_tham_dinh: "not_started",
    tt_bao_cao: "not_started",
    tt_vmp: "not_started",
    // 07:35 UTC = 14:35 Asia/Bangkok. Trình duyệt E2E cố tình chạy UTC.
    scheduled_at: "2026-08-12T07:35:00.000Z",
    lich_td: "2026-08-12",
  },
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

let mode = "enforced";
let editableFields = QA_FIELDS;
const updateBodies = [];
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
  if (/\/rpc\/rpc_get_vmp_dashboard/.test(url)) {
    return answer(request, {
      activities: [ACTIVITY], objects: [], updated_at: "2026-08-10T00:00:00Z",
    });
  }
  if (/\/rpc\/rpc_get_vmp_watermark/.test(url)) {
    return answer(request, { year: 2026, plan_items: 1, objects: 1, updated_at: "2026-08-10T00:00:00Z" });
  }
  if (/\/rpc\/item_permissions_mode/.test(url)) return answer(request, mode);
  if (/\/rpc\/vmp_item_rights/.test(url)) {
    return answer(request, [{
      can_view: true,
      editable_fields: editableFields,
      view_reason: editableFields.length ? "Theo phân công E2E" : "Chỉ xem",
      assignment_sources: [],
      scope_match: true,
      area_match: true,
    }]);
  }
  if (/\/rpc\/rpc_update_progress/.test(url)) {
    if (request.method() !== "OPTIONS") updateBodies.push(JSON.parse(request.postData() || "{}"));
    return answer(request, { ok: true });
  }
  if (/\/vmp_performers/.test(url)) return answer(request, []);
  request.continue();
});

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

async function openPersona(nextMode, fields, { quick = false } = {}) {
  await closeModal();
  mode = nextMode;
  editableFields = fields;
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
    const qa = [...dialog.querySelectorAll('input[type="date"], select')];
    const schedule = dialog.querySelector('input[type="datetime-local"]');
    return {
      qaCount: qa.length,
      qaEnabled: qa.filter((control) => !control.disabled).length,
      scheduleEnabled: !!schedule && !schedule.disabled,
      scheduleValue: schedule?.value || "",
      hasSave: [...dialog.querySelectorAll("button")]
        .some((button) => /^Lưu(?:\s|$)/.test(button.textContent?.trim() || "")),
      text: dialog.innerText,
    };
  });
}

try {
  await dangNhap(page, GOC);
  await doiVaiTrenMan(page, "edit", "Người kiểm quyền timeline");
  await page.goto(`${GOC}#v=progress`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("TB-E2E-01"));

  await openPersona("enforced", QA_FIELDS);
  const qa = await controlState();
  assert.equal(qa.qaCount, 8, "QA phải có đúng tám control ngày/trạng thái");
  assert.equal(qa.qaEnabled, 8, "QA phải sửa được đủ tám trường QA");
  assert.equal(qa.scheduleEnabled, false, "QA không được sửa scheduled_at");
  assert.equal(qa.scheduleValue, "2026-08-12T14:35", "giờ Bangkok phải hiển thị không lệch theo timezone trình duyệt");

  // Đường tắt đã điền sẵn hai trường QA trước khi quyền về, tạo một bản nháp
  // hỗn hợp. Enforced vẫn chỉ được gửi scheduled_at xuống RPC.
  await openPersona("enforced", ["scheduled_at"], { quick: true });
  const equipment = await controlState();
  assert.equal(equipment.qaEnabled, 0, "bộ phận thiết bị không được sửa tám trường QA");
  assert.equal(equipment.scheduleEnabled, true, "bộ phận thiết bị chỉ được xếp lịch");

  await page.$eval('input[type="datetime-local"]', (input) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter.call(input, "2026-08-12T15:45");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || "") && !button.disabled));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || ""))?.click());
  await page.waitForFunction(() => ![...document.querySelectorAll("span")]
    .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"));
  assert.equal(updateBodies.length, 1, "enforced chỉ gửi một request cập nhật hợp lệ");
  assert.deepEqual(Object.keys(updateBodies[0].p_patch), ["scheduled_at"]);
  assert.equal(updateBodies[0].p_patch.scheduled_at, "2026-08-12T08:45:00.000Z",
    "15:45 Bangkok phải được gửi thành đúng thời điểm UTC");

  await openPersona("enforced", []);
  const viewer = await controlState();
  assert.equal(viewer.qaEnabled, 0);
  assert.equal(viewer.scheduleEnabled, false);
  assert.equal(viewer.hasSave, false, "view-only không có nút lưu tiến độ");
  assert.match(viewer.text, /Chỉ xem/);

  await openPersona("preview", []);
  const preview = await controlState();
  assert.equal(preview.qaEnabled, 8, "preview giữ nguyên tám control QA đang chạy");
  assert.equal(preview.scheduleEnabled, true, "preview không áp allowlist dự kiến lên lịch");
  assert.equal(preview.hasSave, true, "preview giữ hành vi lưu hiện tại");

  console.log("✅ Timeline khóa đúng từng cột, preview không cưỡng chế và giờ Bangkok không lệch");
} finally {
  await browser.close();
}

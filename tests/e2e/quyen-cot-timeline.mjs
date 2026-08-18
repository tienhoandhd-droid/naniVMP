import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { dangNhap, doiVaiTrenMan } from "./dang-nhap.mjs";
import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { LA_UI_ACCESS, uiAccessAdmin } from "./ui-access.mjs";

const GOC = "http://localhost:4173";
await choServer(GOC);

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
const WORKSHOP_DATE = bangkokToday();

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

let mode = "enforced";
const primaryQa = {
  can_view: true,
  editable_fields: QA_FIELDS,
  view_reason: "QA phụ trách chính theo phân công hạng mục",
  assignment_sources: ["qa_primary"],
  scope_match: true,
  area_match: true,
};
const collaboratorQa = {
  can_view: true,
  editable_fields: QA_FIELDS,
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
let right = primaryQa;
let updateShouldFail = false;
const updateBodies = [];
const permissionBodies = [];
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
  /* Bộ kiểm này soi lớp quyền THEO HẠNG MỤC. Nó vẫn phải vào được màn Cập
     nhật tiến độ trước đã, mà quyền mở màn nay do server quyết — tài khoản
     E2E là viewer nên sẽ bị chặn nếu không giả lập ở đây. */
  if (LA_UI_ACCESS.test(url)) return answer(request, uiAccessAdmin);
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

  await openPersona("enforced", primaryQa);
  assert.deepEqual(permissionBodies[0], { p_validation_code: ACTIVITY.id },
    "frontend chỉ gửi mã hạng mục vào wrapper quyền của chính auth.uid");
  const qa = await controlState();
  assert.equal(qa.qaCount, 8, "QA phải có đúng tám control ngày/trạng thái");
  assert.equal(qa.qaEnabled, 8, "QA phải sửa được đủ tám trường QA");
  assert.equal(qa.scheduleEnabled, false, "QA không được sửa scheduled_at");
  assert.equal(qa.scheduleValue, "2026-08-12T14:35", "giờ Bangkok phải hiển thị không lệch theo timezone trình duyệt");
  await page.evaluate(() => {
    const title = [...document.querySelectorAll("span")]
      .find((node) => node.textContent?.trim() === "Cập nhật tiến độ");
    /* Phải bỏ qua ô "Người thực hiện": nó nay là select KHÔNG bị khoá và
       đứng TRƯỚC các ô trạng thái, nên `querySelector` đầu tiên sẽ trúng nó
       và bài kiểm đi set "Hoàn thành" vào ô chọn người. */
    const select = [...(title?.closest(".vmp-scroll")?.querySelectorAll("select:not([disabled])") ?? [])]
      .find((el) => el.getAttribute("aria-label") !== "Người thực hiện");
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter.call(select, "Hoàn thành");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(() => document.body.innerText.includes("Chưa lưu được:"));
  assert.equal(
    await page.evaluate(() => [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Lưu & mở tiếp"))?.disabled),
    true,
    "Lưu & mở tiếp phải dùng cùng điều kiện thieuGi với nút Lưu",
  );

  // Đường tắt đã điền sẵn hai trường QA trước khi quyền về, tạo một bản nháp
  // hỗn hợp. Enforced vẫn chỉ được gửi ngày thẩm định thực tế mà xưởng được cấp.
  await openPersona("enforced", workshopStaff, { quick: true });
  const workshop = await controlState();
  assert.equal(workshop.qaEnabled, 1,
    "nhân viên xưởng chỉ được sửa ngày thẩm định thực tế trong tám trường QA");
  assert.equal(workshop.scheduleEnabled, false, "nhân viên xưởng không được sửa lịch thẩm định");

  await page.evaluate((workshopDate) => {
    const title = [...document.querySelectorAll("span")]
      .find((node) => node.textContent?.trim() === "2. Thẩm định thực tế");
    const block = title?.closest("div[style*='border']");
    const input = block?.querySelector('input[type="date"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter.call(input, workshopDate);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, WORKSHOP_DATE);
  await page.type("textarea", "Xưởng ghi nhận ngày thẩm định thực tế");
  await page.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || "") && !button.disabled));
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
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => /^Lưu 1 thay đổi$/.test(button.textContent?.trim() || ""))?.click());
  await page.waitForFunction(() => ![...document.querySelectorAll("span")]
    .some((node) => node.textContent?.trim() === "Cập nhật tiến độ"));
  assert.equal(updateBodies.length, 2, "sau lỗi người dùng có thể thử lưu lại cùng bản nháp");
  assert.deepEqual(Object.keys(updateBodies[1].p_patch), ["actual_validation_date"]);
  assert.equal(updateBodies[1].p_patch.actual_validation_date, WORKSHOP_DATE,
    "nhân viên xưởng chỉ được gửi ngày thẩm định thực tế xuống RPC");

  await openPersona("enforced", collaboratorQa);
  const collaborator = await controlState();
  assert.equal(collaborator.qaCount, 8, "QA phối hợp có đúng tám control QA");
  assert.equal(collaborator.qaEnabled, 8, "QA phối hợp sửa được đủ tám trường QA");
  assert.equal(collaborator.scheduleEnabled, false, "QA phối hợp không được xếp lịch");

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

  console.log("✅ Timeline khóa đúng QA/xưởng, preview không cưỡng chế và giờ Bangkok không lệch");
} finally {
  await browser.close();
}

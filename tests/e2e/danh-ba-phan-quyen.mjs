import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { dangNhap, doiVaiTrenMan } from "./dang-nhap.mjs";
import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";

const GOC = "http://localhost:4173";
await choServer(GOC);

const completePerson = {
  person_id: "aaaaaaaa-1111-4111-8111-111111111111",
  user_id: "bbbbbbbb-2222-4222-8222-222222222222",
  employee_code: null,
  full_name: "Đặng Thị Hồng Ngọc",
  department: "rd",
  email: "hong.ngoc@vmp.local",
  account_status: "linked",
  access_class: "view_only",
  scope_departments: ["rd", "qa"],
  access_areas: ["A1", "A2"],
  email_sent_confirmed: true,
  is_active: true,
  match_status: "unique",
};

const legacyPerson = {
  ...completePerson,
  person_id: "aaaaaaaa-1111-4111-8111-000000000001",
  user_id: null,
  full_name: "Nhân Sự Legacy",
  email: "legacy@vmp.local",
  account_status: "unlinked",
  access_class: null,
  scope_departments: null,
  access_areas: null,
};
delete legacyPerson.department;

const duplicateFirst = {
  ...completePerson,
  person_id: "aaaaaaaa-1111-4111-8111-000000000002",
  full_name: "Nguyễn Văn Trùng",
  email: "first@vmp.local",
  match_status: "ambiguous",
};
const duplicateSaved = {
  ...completePerson,
  person_id: "aaaaaaaa-1111-4111-8111-000000000003",
  full_name: "Nguyễn Văn Trùng",
  email: "saved@vmp.local",
  match_status: "ambiguous",
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1100 });
await page.setRequestInterception(true);

const assignmentBodies = [];
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
  if (/\/rest\/v1\/vmp_performers\?/.test(url) && /access_class/.test(url) && /user_id=eq\./.test(url)) {
    return answer(request, { access_class: "equipment_manager" });
  }
  if (/\/rpc\/rpc_item_permission_directory/.test(url)) {
    const body = JSON.parse(request.postData() || "{}");
    const query = String(body.p_query || "");
    const people = query.includes("Legacy")
      ? [legacyPerson]
      : query.includes("Hồng") ? [completePerson] : [duplicateFirst, duplicateSaved];
    return answer(request, { ok: true, people });
  }
  if (/\/rpc\/rpc_item_permission_preflight/.test(url)) {
    return answer(request, { ok: true, mode: "preview", blocking_errors: [], warnings: [] });
  }
  if (/\/rpc\/rpc_item_assignments/.test(url)) {
    return answer(request, { ok: true, assignments: [] });
  }
  if (/\/rpc\/rpc_preview_item_rights/.test(url)) {
    return answer(request, { ok: true, mode: "preview", rights: [] });
  }
  if (/\/rpc\/rpc_set_item_assignment/.test(url)) {
    if (request.method() !== "OPTIONS") assignmentBodies.push(JSON.parse(request.postData() || "{}"));
    return answer(request, { ok: true, action: "assign" });
  }
  if (/\/rpc\/rpc_upsert_item_permission_staff/.test(url)) {
    return answer(request, {
      ok: true,
      person_id: duplicateSaved.person_id,
      user_id: duplicateSaved.user_id,
      account_status: "linked",
    });
  }
  request.continue();
});

try {
  await dangNhap(page, GOC);

  assert.equal(
    await page.evaluate(() => [...document.querySelectorAll("button")]
      .some((button) => button.textContent?.includes("Phân quyền & trách nhiệm"))),
    true,
    "equipment manager phải thấy menu Phân quyền & trách nhiệm",
  );
  assert.equal(
    await page.evaluate(() => [...document.querySelectorAll("button")]
      .some((button) => button.textContent?.includes("Sức khoẻ dữ liệu"))),
    false,
    "equipment manager không được thấy nav admin khác",
  );

  await page.goto(`${GOC}#v=phanquyen`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("Phân công theo hạng mục"));
  assert.equal(await documentContains("1 · Ai được phép có tài khoản"), false,
    "equipment manager không được thấy workspace admin legacy");
  assert.equal(await documentContains("2 · Vai nào xem được gì, sửa được gì"), false,
    "equipment manager không được thấy ma trận quyền toàn cục");
  assert.equal(await documentContains("Lưu hồ sơ"), false,
    "equipment manager không được sửa StaffDirectory");

  const equipmentSearch = await page.$('input[aria-label="Tìm tên hoặc tài khoản"]');
  assert.ok(equipmentSearch, "equipment manager cần tìm người chuẩn trước khi phân công");
  await equipmentSearch.type("Hồng");
  await page.waitForFunction(() => document.body.innerText.includes("Đặng Thị Hồng Ngọc · RD"));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.includes("hong.ngoc@vmp.local"))?.click());
  await page.type('[aria-label="Mã hạng mục cần phân công"]', "VMP-EQUIPMENT-01");
  await page.type('[aria-label="Lý do phân công"]', "Quản lý thiết bị xếp lịch");
  await page.click('button[aria-label="Phân công người đã chọn"]');
  await page.waitForFunction(() => document.body.innerText.includes("Đã phân công hạng mục VMP-EQUIPMENT-01"));
  assert.equal(assignmentBodies.length, 1);
  assert.equal(assignmentBodies[0].p_person_id, completePerson.person_id);
  assert.equal(assignmentBodies[0].p_assignment_kind, "equipment_department");
  assignmentBodies.length = 0;

  await doiVaiTrenMan(page, "admin", "Người Quản Trị");
  await page.goto(`${GOC}#v=phanquyen`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.body.innerText.includes("Danh bạ nhân sự & quyền"),
    { timeout: 15000 },
  );

  const search = await page.$('input[aria-label="Tìm tên hoặc tài khoản"]');
  assert.ok(search, "phải có ô autocomplete danh bạ");
  await search.type("Legacy");
  await page.waitForFunction(
    () => document.body.innerText.includes("Nhân Sự Legacy · chưa có bộ phận"),
    { timeout: 5000 },
  );
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("legacy@vmp.local"))?.click();
  });

  const form = await page.evaluate(() => ({
    department: document.querySelector('[aria-label="Bộ phận trong danh bạ"]')?.value,
    email: document.querySelector('[aria-label="Email trong danh bạ"]')?.value,
    accessClass: document.querySelector('[aria-label="Phân loại quyền"]')?.value,
    scope: document.querySelector('[aria-label="Phạm vi phân quyền"]')?.value,
    areas: document.querySelector('[aria-label="Khu vực phân quyền"]')?.value,
  }));
  assert.deepEqual(form, {
    department: "",
    email: "legacy@vmp.local",
    accessClass: "view_only",
    scope: "",
    areas: "",
  });
  assert.match(await page.$eval('[aria-label="Trạng thái tài khoản"]', (node) => node.textContent || ""), /Hồ sơ chưa đủ/);

  await page.type('[aria-label="Mã hạng mục cần phân công"]', "VMP-E2E-01");
  await page.type('[aria-label="Lý do phân công"]', "Chuẩn bị thảo luận quyền");
  assert.equal(
    await page.$eval('button[aria-label="Phân công người đã chọn"]', (button) => button.disabled),
    true,
    "hồ sơ legacy chưa đủ phải bị khóa phân công",
  );
  assert.equal(assignmentBodies.length, 0);

  await search.click({ clickCount: 3 });
  await search.type("Nguyễn Văn Trùng");
  await page.select('[aria-label="Bộ phận trong danh bạ"]', "rd");
  await page.type('[aria-label="Phạm vi phân quyền"]', "rd");
  await page.type('[aria-label="Khu vực phân quyền"]', "A1");
  await page.click(".ip-form + button.la-chinh");
  await page.waitForFunction(
    (personId) => document.body.innerText.includes(`Khóa người: ${personId}`),
    {},
    duplicateSaved.person_id,
  );

  assert.equal(
    await page.$eval('[aria-label="Email trong danh bạ"]', (input) => input.value),
    duplicateSaved.email,
    "hai dòng trùng tên phải chọn đúng hồ sơ có person_id do RPC trả về",
  );

  await page.click('button[aria-label="Phân công người đã chọn"]');
  await page.waitForFunction(() => document.body.innerText.includes("Đã phân công hạng mục"));
  assert.equal(assignmentBodies.length, 1);
  assert.equal(assignmentBodies[0].p_person_id, duplicateSaved.person_id);
  assert.equal("staff_name" in assignmentBodies[0], false);
  assert.equal("full_name" in assignmentBodies[0], false);
  console.log("✅ Dòng legacy sửa được, khóa phân công và chọn đúng person_id khi trùng tên");
} finally {
  await browser.close();
}

function documentContains(text) {
  return page.evaluate((expected) => document.body.innerText.includes(expected), text);
}

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
  access_class: "qa_progress_editor",
  scope_departments: ["rd", "qa"],
  scope_factory_ids: ["10000000-0000-0000-0000-000000000001"],
  scope_area_ids: ["20000000-0000-0000-0000-000000000001"],
  scope_line_ids: ["30000000-0000-0000-0000-000000000001"],
  access_areas: ["A1", "A2"],
  version: 1,
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
  scope_factory_ids: null,
  scope_area_ids: null,
  scope_line_ids: null,
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

const assignmentFor = (person, validationCode) => ({
  assignment_id: `cccccccc-3333-4333-8333-${validationCode === "A-LATE" ? "000000000001" : "000000000002"}`,
  validation_code: validationCode,
  person_id: person.person_id,
  user_id: person.user_id,
  staff_name: person.full_name,
  employee_code: person.employee_code,
  assignment_kind: "equipment_department",
  source: "manual",
  source_text: null,
  unresolved_reason: null,
  expires_at: null,
  is_active: true,
  grants_access: true,
  object_department: "rd",
  area: "A1",
  line: null,
});

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1100 });
await page.setRequestInterception(true);

const assignmentBodies = [];
const assignmentFetchPersonIds = [];
const performerProfileSelects = [];
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};
const scopeCatalog = {
  ok: true,
  departments: [
    { id: "rd", code: "RD", label: "Nghiên cứu phát triển" },
    { id: "qa", code: "QA", label: "Đảm bảo chất lượng" },
  ],
  factories: [
    { id: "10000000-0000-0000-0000-000000000001", code: "XRD", label: "Xưởng RD", department_id: "rd" },
  ],
  areas: [
    { id: "20000000-0000-0000-0000-000000000001", code: "A1", label: "Khu vực A1", factory_id: "10000000-0000-0000-0000-000000000001" },
  ],
  lines: [
    { id: "30000000-0000-0000-0000-000000000001", code: "L1", label: "Line 1", area_id: "20000000-0000-0000-0000-000000000001" },
  ],
};
const answer = (request, body) => request.method() === "OPTIONS"
  ? request.respond({ status: 204, headers: cors, body: "" })
  : request.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });

page.on("request", (request) => {
  const url = request.url();
  if (/\/rest\/v1\/vmp_performers\?/.test(url) && /user_id=eq\./.test(url)) {
    if (request.method() !== "OPTIONS") {
      performerProfileSelects.push(new URL(url).searchParams.get("select"));
    }
    return answer(request, { access_class: "equipment_manager" });
  }
  if (/\/rpc\/rpc_item_permission_scope_catalog/.test(url)) {
    return answer(request, scopeCatalog);
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
    if (request.method() === "OPTIONS") return answer(request, {});
    const body = JSON.parse(request.postData() || "{}");
    assignmentFetchPersonIds.push(body.p_person_id);
    const isFirstPerson = body.p_person_id === completePerson.person_id;
    const assignment = isFirstPerson
      ? assignmentFor(completePerson, "A-LATE")
      : assignmentFor(duplicateFirst, "B-CURRENT");
    return setTimeout(
      () => answer(request, { ok: true, assignments: [assignment] }),
      isFirstPerson ? 3000 : 40,
    );
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

  assert.deepEqual(
    [...new Set(performerProfileSelects)],
    ["*"],
    "getProfile phải dùng select=* để tương thích schema chưa có access_class",
  );

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
  assert.equal(
    await page.evaluate(() => [...document.querySelectorAll("label")]
      .some((label) => label.textContent?.includes("Vai trò phân công"))),
    false,
    "equipment manager không được chọn nhầm vai QA",
  );

  const equipmentSearch = await page.$('input[aria-label="Tìm tên hoặc tài khoản"]');
  assert.ok(equipmentSearch, "equipment manager cần tìm người chuẩn trước khi phân công");
  await equipmentSearch.type("Hồng");
  await page.waitForFunction(() => document.body.innerText.includes("Đặng Thị Hồng Ngọc · RD"));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.includes("hong.ngoc@vmp.local"))?.click());
  for (let attempt = 0; attempt < 50 && !assignmentFetchPersonIds.includes(completePerson.person_id); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(assignmentFetchPersonIds.includes(completePerson.person_id), true,
    "test race phải khởi động request A trước khi chọn B");
  await equipmentSearch.click({ clickCount: 3 });
  await equipmentSearch.type("Nguyễn Văn Trùng");
  await page.waitForFunction(() => document.body.innerText.includes("first@vmp.local"));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.includes("first@vmp.local"))?.click());
  await page.waitForFunction(() => document.body.innerText.includes("B-CURRENT"));
  await new Promise((resolve) => setTimeout(resolve, 3200));
  assert.equal(await documentContains("A-LATE"), false,
    "response A về trễ không được ghi đè danh sách của người B");
  await page.type('[aria-label="Mã hạng mục cần phân công"]', "VMP-EQUIPMENT-01");
  await page.type('[aria-label="Lý do phân công"]', "Quản lý thiết bị xếp lịch");
  await page.click('button[aria-label="Phân công người đã chọn"]');
  await page.waitForFunction(() => document.body.innerText.includes("Đã phân công hạng mục VMP-EQUIPMENT-01"));
  assert.equal(assignmentBodies.length, 1);
  assert.equal(assignmentBodies[0].p_person_id, duplicateFirst.person_id);
  assert.equal(assignmentBodies[0].p_assignment_kind, "equipment_department");
  assignmentBodies.length = 0;

  await doiVaiTrenMan(page, "admin", "Người Quản Trị");
  await page.goto(`${GOC}#v=phanquyen`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.body.innerText.includes("Danh bạ nhân sự & quyền"),
    { timeout: 15000 },
  );
  assert.equal(await documentContains("1 · Ai được phép có tài khoản"), false,
    "admin không còn thấy khối tài khoản legacy bên dưới workspace hiện hành");
  assert.equal(await documentContains("2 · Vai nào xem được gì, sửa được gì"), false,
    "admin không còn thấy ma trận vai trò legacy");
  assert.equal(await documentContains("3 · Ma trận trách nhiệm & quyền"), false,
    "admin không còn thấy ma trận trách nhiệm legacy");
  assert.equal(await documentContains("Từ ma trận này làm gì tiếp"), false,
    "admin không còn thấy hướng dẫn legacy dài bên dưới");
  assert.equal(await documentContains("Quyền hiệu lực theo từng đầu mục"), true,
    "bảng quyền hiệu lực hiện tại phải được giữ lại");

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
    departments: document.querySelector('[aria-label="Phạm vi bộ phận"]')?.textContent?.trim(),
    factoriesDisabled: document.querySelector('[aria-label="Phạm vi xưởng"]')?.disabled,
  }));
  assert.deepEqual(form, {
    department: "",
    email: "legacy@vmp.local",
    accessClass: "view_only",
    departments: "— chọn —",
    factoriesDisabled: true,
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
  await page.$eval('[aria-label="Phạm vi bộ phận"]', (button) => button.click());
  await page.waitForSelector('[role="option"][data-value="rd"]');
  await page.$eval('[role="option"][data-value="rd"]', (button) => button.click());
  await page.waitForFunction(() => !document.querySelector('[aria-label="Phạm vi xưởng"]')?.disabled);
  await page.$eval('[aria-label="Phạm vi xưởng"]', (button) => button.click());
  await page.waitForSelector('[role="option"][data-value="10000000-0000-0000-0000-000000000001"]');
  await page.$eval('[role="option"][data-value="10000000-0000-0000-0000-000000000001"]', (button) => button.click());
  await page.waitForFunction(() => !document.querySelector('[aria-label="Phạm vi khu vực"]')?.disabled);
  await page.$eval('[aria-label="Phạm vi khu vực"]', (button) => button.click());
  await page.waitForSelector('[role="option"][data-value="20000000-0000-0000-0000-000000000001"]');
  await page.$eval('[role="option"][data-value="20000000-0000-0000-0000-000000000001"]', (button) => button.click());
  await page.waitForFunction(() => !document.querySelector('[aria-label="Phạm vi line"]')?.disabled);
  await page.$eval('[aria-label="Phạm vi line"]', (button) => button.click());
  await page.waitForSelector('[role="option"][data-value="30000000-0000-0000-0000-000000000001"]');
  await page.$eval('[role="option"][data-value="30000000-0000-0000-0000-000000000001"]', (button) => button.click());
  await page.waitForFunction(() => !document.querySelector('[data-testid="save-permission-person"]')?.disabled);
  await page.$eval('[data-testid="save-permission-person"]', (button) => button.click());
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

  await page.evaluate(() => {
    const key = "vmp_monitor_user_v1";
    const current = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({
      ...current,
      role: "viewer",
      perm: "view",
      accessClass: null,
    }));
  });
  await page.goto(`${GOC}#v=phanquyen`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("không có quyền truy cập"));
  assert.equal(await documentContains("Danh bạ nhân sự & quyền"), false,
    "persona ngoài allowlist không được dựng workspace phân quyền");
  console.log("✅ Dòng legacy sửa được, khóa phân công và chọn đúng person_id khi trùng tên");
} finally {
  await browser.close();
}

function documentContains(text) {
  return page.evaluate((expected) => document.body.innerText.includes(expected), text);
}

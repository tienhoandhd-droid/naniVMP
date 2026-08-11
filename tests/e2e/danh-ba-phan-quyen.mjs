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
  access_class: "equipment_scheduler",
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

const qaPerson = {
  ...completePerson,
  department: "qa",
  access_class: "qa_progress_editor",
  scope_departments: [],
  scope_factory_ids: [],
  scope_area_ids: [],
  scope_line_ids: [],
};

const qaPrimary = {
  ...qaPerson,
  person_id: "aaaaaaaa-1111-4111-8111-000000000010",
  full_name: "QA Phụ Trách Cũ",
};

const qaLegacy = {
  ...qaPerson,
  person_id: "aaaaaaaa-1111-4111-8111-000000000012",
  full_name: "QA Legacy Scope",
  scope_departments: ["rd"],
  scope_factory_ids: ["10000000-0000-0000-0000-000000000001"],
  scope_area_ids: ["20000000-0000-0000-0000-000000000001"],
  scope_line_ids: ["30000000-0000-0000-0000-000000000001"],
};

const qaCollaborator = {
  ...qaPerson,
  person_id: "aaaaaaaa-1111-4111-8111-000000000011",
  full_name: "QA Phối Hợp",
  user_id: null,
  account_status: "unlinked",
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

const assignmentFor = (person, validationCode, assignmentKind = "equipment_department", assignmentRole = null) => ({
  assignment_id: `cccccccc-3333-4333-8333-${validationCode === "A-LATE" ? "000000000001" : "000000000002"}`,
  validation_code: validationCode,
  person_id: person.person_id,
  user_id: person.user_id,
  staff_name: person.full_name,
  employee_code: person.employee_code,
  assignment_kind: assignmentKind,
  assignment_role: assignmentRole,
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
const saveBodies = [];
const assignmentFetchPersonIds = [];
const performerProfileSelects = [];
const accountLinkBodies = [];
let scopeCatalogCalls = 0;
let legacyLinked = false;
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
    if (request.method() !== "OPTIONS") scopeCatalogCalls += 1;
    return answer(request, scopeCatalog);
  }
  if (/\/rpc\/rpc_item_permission_directory/.test(url)) {
    const body = JSON.parse(request.postData() || "{}");
    const query = String(body.p_query || "");
    const people = query.includes("QA Legacy") ? [qaLegacy]
      : query.includes("Legacy")
        ? [{ ...legacyPerson, user_id: legacyLinked ? "dddddddd-4444-4444-8444-444444444444" : null,
          account_status: legacyLinked ? "linked" : "unlinked", version: legacyLinked ? 2 : 1 }]
        : query.includes("QA") ? [qaPerson]
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
    const qaAssignments = [
      assignmentFor(qaPrimary, "VMP-QA-01", "qa", "primary"),
      assignmentFor(qaCollaborator, "VMP-QA-01", "qa", "collaborator"),
      { ...assignmentFor(qaCollaborator, "VMP-QA-02", "qa", "collaborator"), grants_access: false,
        unresolved_reason: "chưa có quyền truy cập" },
    ];
    const assignments = body.p_validation_code === "VMP-QA-01" || body.p_person_id === qaPerson.person_id
      ? qaAssignments
      : [isFirstPerson
        ? assignmentFor(completePerson, "A-LATE")
        : assignmentFor(duplicateFirst, "B-CURRENT")];
    return setTimeout(
      () => answer(request, { ok: true, assignments }),
      isFirstPerson ? 3000 : 40,
    );
  }
  if (/\/rpc\/rpc_preview_item_rights/.test(url)) {
    const body = JSON.parse(request.postData() || "{}");
    const qaRight = {
      person_id: qaPerson.person_id,
      user_id: qaPerson.user_id,
      full_name: qaPerson.full_name,
      validation_code: "VMP-QA-01",
      rights_basis: "qa_assignment",
      can_view: true,
      editable_fields: ["actual_protocol_date"],
      view_reason: "QA được phân công",
      assignment_sources: ["QA phụ trách chính"],
      scope_match: false,
      area_match: false,
      factory_match: false,
      line_match: false,
    };
    const rights = body.p_validation_code === "VMP-MIXED-01" ? [
      { ...qaRight, validation_code: "VMP-MIXED-01" },
      {
        ...qaRight,
        person_id: completePerson.person_id,
        user_id: completePerson.user_id,
        full_name: completePerson.full_name,
        validation_code: "VMP-MIXED-01",
        rights_basis: "hierarchy_scope",
        editable_fields: ["scheduled_at"],
        assignment_sources: [],
        scope_match: true,
        factory_match: true,
        area_match: true,
        line_match: true,
      },
    ] : body.p_person_id === qaPerson.person_id ? [qaRight] : [];
    return answer(request, { ok: true, mode: "preview", rights });
  }
  if (/\/rpc\/rpc_set_item_assignment/.test(url)) {
    const body = JSON.parse(request.postData() || "{}");
    if (request.method() !== "OPTIONS") assignmentBodies.push(body);
    if (body.p_reason === "Mô phỏng xung đột QA chính") {
      return answer(request, {
        ok: false,
        error_code: "PRIMARY_CONFLICT",
        error: "QA phụ trách chính vừa thay đổi; hãy kiểm tra danh sách mới rồi thử lại",
      });
    }
    return answer(request, { ok: true, action: "assign" });
  }
  if (/\/rpc\/rpc_item_permission_account_candidates/.test(url)) {
    return answer(request, { ok: true, accounts: [{
      user_id: "dddddddd-4444-4444-8444-444444444444",
      email: "legacy.link@vmp.local",
      full_name: "Tài khoản Legacy",
      role: "viewer",
      department: "qa",
      is_active: true,
      linked_person_id: null,
    }] });
  }
  if (/\/rpc\/rpc_link_item_permission_account/.test(url)) {
    if (request.method() !== "OPTIONS") {
      accountLinkBodies.push(JSON.parse(request.postData() || "{}"));
      legacyLinked = true;
    }
    return answer(request, { ok: true });
  }
  if (/\/rpc\/rpc_upsert_item_permission_staff/.test(url)) {
    if (request.method() !== "OPTIONS") saveBodies.push(JSON.parse(request.postData() || "{}"));
    const body = JSON.parse(request.postData() || "{}");
    return answer(request, {
      ok: true,
      person_id: body.p_person_id || duplicateSaved.person_id,
      user_id: body.p_person_id === qaLegacy.person_id ? qaLegacy.user_id : duplicateSaved.user_id,
      account_status: "linked",
    });
  }
  request.continue();
});
page.on("dialog", (dialog) => dialog.accept());

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
  assert.equal(assignmentBodies[0].p_expected_primary_assignment_id, null);
  assignmentBodies.length = 0;

  scopeCatalogCalls = 0;
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

  const qaSearch = await page.$('input[aria-label="Tìm tên hoặc tài khoản"]');
  assert.ok(qaSearch, "admin cần tìm QA từ danh bạ chuẩn");
  await qaSearch.type("QA");
  await page.waitForFunction(() => document.body.innerText.includes("Đặng Thị Hồng Ngọc · QA"));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.includes("hong.ngoc@vmp.local"))?.click());
  await page.waitForFunction(() => document.body.innerText.includes("Quyền phát sinh từ phân công hạng mục"));
  await page.waitForFunction(() => document.body.innerText.includes("Phân công: QA phụ trách chính"));
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')]
    .find((button) => button.textContent?.includes("Theo hạng mục"))?.click());
  await page.type('[aria-label="Mã hạng mục xem quyền"]', "VMP-MIXED-01");
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent === "Xem quyền")?.click());
  await page.waitForFunction(() => document.body.innerText.includes("Phạm vi: Bộ phận khớp"));
  assert.equal(await documentContains("Phân công: QA phụ trách chính"), true,
    "dòng QA phải render basis phân công của chính dòng");
  assert.equal(await documentContains("Phạm vi: Bộ phận khớp"), true,
    "dòng thiết bị phải render basis hierarchy dù cùng item với QA");
  await page.waitForFunction(() => document.body.innerText.includes("QA phụ trách chính"));
  assert.equal(await documentContains("Phạm vi xưởng"), false);
  assert.equal(await documentContains("Không tải được danh mục phạm vi"), false);
  assert.equal(scopeCatalogCalls, 0, "form QA không được gọi RPC catalog");
  await page.type('[aria-label="Email trong danh bạ"]', ".qa");
  assert.equal(await page.$eval('[data-testid="save-permission-person"]', (button) => button.disabled), false);
  assert.equal(await documentContains("QA phụ trách chính"), true);
  assert.equal(await documentContains("QA phối hợp"), true);
  await page.waitForFunction(() => document.body.innerText.includes("chưa có quyền truy cập"));
  assert.equal(await documentContains("chưa có quyền truy cập"), true);

  await page.type('[aria-label="Mã hạng mục cần phân công"]', "VMP-QA-01");
  await page.type('[aria-label="Lý do phân công"]', "Đổi QA phụ trách chính");
  await page.select('[aria-label="Vai trò QA trong hạng mục"]', "primary");
  await page.click('button[aria-label="Phân công người đã chọn"]');
  await page.waitForFunction(() => document.body.innerText.includes("Đã phân công hạng mục VMP-QA-01"));
  assert.equal(assignmentBodies.at(-1).p_person_id, qaPerson.person_id);
  assert.equal(assignmentBodies.at(-1).p_assignment_role, "primary");
  assert.equal(assignmentBodies.at(-1).p_action, "replace_primary");
  assert.equal(assignmentBodies.at(-1).p_reason, "Đổi QA phụ trách chính");
  assert.equal(
    assignmentBodies.at(-1).p_expected_primary_assignment_id,
    assignmentFor(qaPrimary, "VMP-QA-01", "qa", "primary").assignment_id,
  );
  await page.waitForFunction(() => {
    const input = document.querySelector('[aria-label="Lý do phân công"]');
    return input && !input.disabled && input.value === "";
  });
  const fetchesBeforeConflict = assignmentFetchPersonIds.length;
  await page.type('[aria-label="Mã hạng mục cần phân công"]', "VMP-QA-01");
  await page.type('[aria-label="Lý do phân công"]', "Mô phỏng xung đột QA chính");
  await page.click('button[aria-label="Phân công người đã chọn"]');
  await page.waitForFunction(() => document.body.innerText.includes(
    "QA phụ trách chính vừa thay đổi; hãy kiểm tra danh sách mới rồi thử lại",
  ));
  for (let attempt = 0; attempt < 50 && assignmentFetchPersonIds.length <= fetchesBeforeConflict; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(assignmentFetchPersonIds.length > fetchesBeforeConflict, true,
    "PRIMARY_CONFLICT phải refresh danh sách phân công");
  assert.equal(await documentContains("Đã phân công hạng mục VMP-QA-01"), false,
    "PRIMARY_CONFLICT không được báo thành công");
  await page.click('[aria-label="Mã hạng mục cần phân công"]', { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.click('[aria-label="Lý do phân công"]', { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type('[aria-label="Lý do phân công"]', "Thu hồi QA phối hợp");
  await page.waitForFunction(() => {
    const input = document.querySelector('[aria-label="Lý do phân công"]');
    const button = document.querySelector('[aria-label="Thu hồi VMP-QA-01 QA phối hợp"]');
    return input?.value === "Thu hồi QA phối hợp" && button && !button.disabled;
  });
  await page.click('[aria-label="Thu hồi VMP-QA-01 QA phối hợp"]');
  await page.waitForFunction(() => document.body.innerText.includes("Đã thu hồi phân công"));
  assert.deepEqual(assignmentBodies.at(-1), {
    p_person_id: qaCollaborator.person_id,
    p_validation_code: "VMP-QA-01",
    p_assignment_kind: "qa",
    p_assignment_role: "collaborator",
    p_action: "revoke",
    p_reason: "Thu hồi QA phối hợp",
    p_expected_primary_assignment_id: null,
  });

  await qaSearch.click({ clickCount: 3 });
  await qaSearch.type("QA Legacy");
  await page.waitForFunction(() => document.body.innerText.includes("QA Legacy Scope · QA"));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.includes("QA Legacy Scope"))?.click());
  assert.equal(await documentContains("Phạm vi xưởng"), false,
    "QA legacy có scope cũ vẫn không hiện hierarchy");
  await page.type('[aria-label="Email trong danh bạ"]', ".updated");
  await page.click('[data-testid="save-permission-person"]');
  await page.waitForFunction(() => document.body.innerText.includes("Đã lưu hồ sơ danh bạ"));
  assert.deepEqual(saveBodies.at(-1).p_patch.scope_departments, []);
  assert.deepEqual(saveBodies.at(-1).p_patch.scope_factory_ids, []);
  assert.deepEqual(saveBodies.at(-1).p_patch.scope_area_ids, []);
  assert.deepEqual(saveBodies.at(-1).p_patch.scope_line_ids, []);

  const search = await page.$('input[aria-label="Tìm tên hoặc tài khoản"]');
  assert.ok(search, "phải có ô autocomplete danh bạ");
  await search.click({ clickCount: 3 });
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
  }));
  assert.deepEqual(form, {
    department: "",
    email: "legacy@vmp.local",
    accessClass: "",
  });
  assert.equal(await page.$('[aria-label="Phạm vi bộ phận"]'), null);
  assert.equal(await page.$('[aria-label="Phạm vi xưởng"]'), null);
  assert.match(await page.$eval('[aria-label="Trạng thái tài khoản"]', (node) => node.textContent || ""), /Hồ sơ chưa đủ/);

  await page.type('[aria-label="Tìm tài khoản để nối"]', "Legacy");
  await page.waitForSelector('[aria-label="Tài khoản sẽ nối"] option[value="dddddddd-4444-4444-8444-444444444444"]');
  await page.select('[aria-label="Tài khoản sẽ nối"]', "dddddddd-4444-4444-8444-444444444444");
  await page.type('[aria-label="Lý do nối tài khoản"]', "Nối lại tài khoản legacy");
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Nối tài khoản")?.click());
  await page.waitForFunction(() => document.body.innerText.includes("Đã nối tài khoản"));
  assert.deepEqual(accountLinkBodies.at(-1), {
    p_person_id: legacyPerson.person_id,
    p_user_id: "dddddddd-4444-4444-8444-444444444444",
    p_reason: "Nối lại tài khoản legacy",
    p_expected_version: 1,
  });
  assert.equal(await documentContains(`Khóa người: ${legacyPerson.person_id}`), true,
    "tải lại sau nối giữ đúng person_id dù tên có thể trùng");

  const assignmentCountBeforeLegacy = assignmentBodies.length;
  await page.type('[aria-label="Mã hạng mục cần phân công"]', "VMP-E2E-01");
  await page.type('[aria-label="Lý do phân công"]', "Chuẩn bị thảo luận quyền");
  assert.equal(
    await page.$eval('button[aria-label="Phân công người đã chọn"]', (button) => button.disabled),
    true,
    "hồ sơ legacy chưa đủ phải bị khóa phân công",
  );
  assert.equal(assignmentBodies.length, assignmentCountBeforeLegacy,
    "hồ sơ legacy bị khóa không được phát sinh RPC phân công mới");

  await search.click({ clickCount: 3 });
  await search.type("Nguyễn Văn Trùng");
  await page.select('[aria-label="Bộ phận trong danh bạ"]', "rd");
  await page.select('[aria-label="Phân loại quyền"]', "view_only");
  await page.waitForFunction(() => !document.querySelector('[aria-label="Phạm vi bộ phận"]')?.disabled);
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

  const assignmentCountBeforeSaved = assignmentBodies.length;
  await page.click('button[aria-label="Phân công người đã chọn"]');
  await page.waitForFunction(() => document.body.innerText.includes("Đã phân công hạng mục"));
  assert.equal(assignmentBodies.length, assignmentCountBeforeSaved + 1);
  assert.equal(assignmentBodies.at(-1).p_person_id, duplicateSaved.person_id);
  assert.equal("staff_name" in assignmentBodies.at(-1), false);
  assert.equal("full_name" in assignmentBodies.at(-1), false);

  await doiVaiTrenMan(page, "qa_manager", "Quản lý QA");
  await page.evaluate(() => {
    const key = "vmp_monitor_user_v1";
    const current = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...current, accessClass: "qa_manager" }));
  });
  await page.goto(`${GOC}#v=phanquyen`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("Phân công theo hạng mục"));
  assert.equal(await documentContains("Nối tài khoản"), false,
    "quản lý QA không được thấy thao tác nối tài khoản");
  const managerSearch = await page.$('input[aria-label="Tìm tên hoặc tài khoản"]');
  assert.ok(managerSearch, "quản lý QA vẫn được tìm người để phân công");
  await managerSearch.type("QA");
  await page.waitForFunction(() => document.body.innerText.includes("Đặng Thị Hồng Ngọc · QA"));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.includes("hong.ngoc@vmp.local"))?.click());
  assert.equal(await page.$('[aria-label="Phân công người đã chọn"]') !== null, true,
    "quản lý QA vẫn được phân công QA");
  await managerSearch.click({ clickCount: 3 });
  await managerSearch.type("Legacy");
  await page.waitForFunction(() => document.body.innerText.includes("Nhân Sự Legacy · chưa có bộ phận"));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.includes("legacy@vmp.local"))?.click());
  assert.equal(await page.$('[aria-label="Phân công người đã chọn"]'), null,
    "quản lý QA không được gán hạng mục thiết bị cho người ngoài QA");

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

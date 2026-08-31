import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { docEnv, doiVaiTrenMan } from "./dang-nhap.mjs";
import { NGUOI_DUNG, nhetPhien } from "./gia-lap-supabase.mjs";
import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { LA_UI_ACCESS, uiAccessAdmin, uiAccessQuanLyQa } from "./ui-access.mjs";

/* Vai mà SERVER (giả lập) khai — đổi biến này là đổi vai thật sự.
   `doiVaiTrenMan` chỉ ghi localStorage (role/accessClass của hệ 4 vai CŨ);
   từ khi cổng gác màn Phân quyền hỏi `rpc_my_ui_access`, ghi localStorage
   không còn đổi được gì. Giả vai phải giả ở đúng chỗ web đi hỏi. */
let uiAccessHienTai = uiAccessAdmin;

const GOC = "http://localhost:4173";
const URL_SB = docEnv().VITE_SUPABASE_URL;
if (!URL_SB) throw new Error("Thiếu VITE_SUPABASE_URL để tạo phiên E2E giả lập");
await choServer(GOC);

const completePerson = {
  person_id: "aaaaaaaa-1111-4111-8111-111111111111",
  user_id: "bbbbbbbb-2222-4222-8222-222222222222",
  employee_code: null,
  full_name: "Đặng Thị Hồng Ngọc",
  department: "rd",
  email: "hong.ngoc@vmp.local",
  account_status: "linked",
  access_class: "workshop_staff",
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
  person_id: "aaaaaaaa-1111-4111-8111-000000000020",
  user_id: "bbbbbbbb-2222-4222-8222-000000000020",
  email: "qa.ngoc@vmp.local",
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

const qaReplacement = {
  ...qaPerson,
  person_id: "aaaaaaaa-1111-4111-8111-000000000013",
  full_name: "QA Phụ Trách B Hiện Tại",
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
const assignmentFetches = [];
const performerProfileSelects = [];
const accountLinkBodies = [];
let scopeCatalogCalls = 0;
let legacyLinked = false;
let currentQaPrimary = qaPrimary;
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

/* Bộ kiểm này giả lập một Quản lý xưởng. Trước đây nó khai access_class
   qua vmp_performers — cách đó chỉ hiệu lực khi menu còn đọc
   user.accessClass ở trình duyệt. Nay server tra quyền theo auth.uid()
   thật, nên phải giả lập ở đúng chỗ: chính rpc_my_ui_access. Payload dùng
   chung ở ./ui-access.mjs. */
page.on("request", (request) => {
  const url = request.url();
  if (/\/auth\/v1\/user/.test(url)) return answer(request, NGUOI_DUNG);
  if (/\/rest\/v1\/profiles\?/.test(url)) {
    return answer(request, {
      id: NGUOI_DUNG.id,
      email: NGUOI_DUNG.email,
      full_name: "Người kiểm thử",
      role: "admin",
      is_active: true,
    });
  }
  if (LA_UI_ACCESS.test(url)) return answer(request, uiAccessHienTai);
  if (/\/rpc\/rpc_nguoi_va_quyen/.test(url)) {
    const accountFor = (person, role) => ({
      pid: person.person_id,
      user_id: person.user_id,
      ten: person.full_name,
      email: person.email,
      bo_phan: person.department,
      bo_phan_nguoi: person.department,
      bo_phan_tai_khoan: person.department,
      vai: role,
      pham_vi_rieng: null,
      muc: null,
      co_tai_khoan: true,
      tk_hoat_dong: true,
      so_sua_duoc: 0,
      so_dung_ten: 0,
      so_phan_cong: 1,
    });
    return answer(request, {
      ok: true,
      tong_hang_muc: 2,
      nguoi: [accountFor(completePerson, "department_user"), accountFor(qaPerson, "department_user")],
    });
  }
  if (/\/rpc\/rpc_business_roles/.test(url)) {
    return answer(request, {
      ok: true,
      nguoi: [
        { user_id: completePerson.user_id, email: completePerson.email, business_role: "workshop_staff", unresolved_reason: null },
        { user_id: qaPerson.user_id, email: qaPerson.email, business_role: "qa_staff", unresolved_reason: null },
      ],
    });
  }
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
        : query.includes("Hồng") ? [completePerson] : [completePerson, qaPerson, duplicateFirst, duplicateSaved];
    return answer(request, { ok: true, people });
  }
  if (/\/rpc\/rpc_item_permission_preflight/.test(url)) {
    return answer(request, { ok: true, mode: "preview", blocking_errors: [], warnings: [] });
  }
  if (/\/rpc\/item_permissions_mode/.test(url)) return answer(request, "preview");
  if (/\/rpc\/rpc_item_assignments/.test(url)) {
    if (request.method() === "OPTIONS") return answer(request, {});
    const body = JSON.parse(request.postData() || "{}");
    assignmentFetches.push({
      p_person_id: body.p_person_id ?? null,
      p_validation_code: body.p_validation_code ?? null,
    });
    const isFirstPerson = body.p_person_id === completePerson.person_id;
    const qaAssignments = [
      {
        ...assignmentFor(currentQaPrimary, "VMP-QA-01", "qa", "primary"),
        assignment_id: currentQaPrimary === qaReplacement
          ? "cccccccc-3333-4333-8333-000000000003"
          : "cccccccc-3333-4333-8333-000000000002",
      },
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
        editable_fields: ["actual_validation_date"],
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
      currentQaPrimary = qaReplacement;
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
  if (url.startsWith(URL_SB)) return answer(request, null);
  request.continue();
});
page.on("dialog", (dialog) => dialog.accept());
await nhetPhien(page, { supabaseUrl: URL_SB, nguoiDung: NGUOI_DUNG });

try {
  await page.goto(GOC, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !document.querySelector("input[type=password]"), { timeout: 30_000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")]
      .some((button) => button.textContent?.includes("Vai trò & phạm vi")),
    { timeout: 30_000 },
  );

  assert.deepEqual(
    [...new Set(performerProfileSelects)],
    ["id,access_class"],
    "getProfile chỉ đọc định danh hồ sơ và phân loại truy cập cần thiết",
  );

  assert.equal(
    await page.evaluate(() => [...document.querySelectorAll("button")]
      .some((button) => button.textContent?.includes("Vai trò & phạm vi"))),
    true,
    "Admin phải thấy menu Vai trò & phạm vi",
  );
  assert.equal(
    await page.evaluate(() => [...document.querySelectorAll("button")]
      .some((button) => button.textContent?.includes("Chất lượng dữ liệu"))),
    true,
    "Admin phải thấy toàn bộ nhóm Quản trị",
  );

  await page.goto(`${GOC}#v=phanquyen&tab=kiem-soat`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.removeItem("vmp.tab.phanquyen"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("Bảng kiểm soát vai trò & tài khoản"));
  assert.equal(await page.$$eval('[data-role-control-table="true"] tbody tr', (rows) => rows.length), 5,
    "bảng kiểm soát phải luôn có đủ năm vai");
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Liên kết tài khoản")?.click());
  await page.waitForSelector("#pq-account-tools");
  assert.equal(await documentContains("Chọn nhân sự từ Dữ liệu nguồn"), true,
    "Admin mở được công cụ liên kết ngay trong bảng kiểm soát");
  assert.equal(await documentContains("2 · Vai nào xem được gì, sửa được gì"), false,
    "ma trận quyền cũ không quay lại");
  assert.equal(await documentContains("Lưu hồ sơ"), false,
    "hồ sơ nhân sự vẫn chỉ sửa ở màn Dữ liệu nguồn");
  assert.equal(await documentContains("Phân công theo hạng mục"), false,
    "không tạo nguồn phân công thứ hai ngoài Dữ liệu nguồn");
  assert.equal(await page.$('[aria-label="Bộ phận trong danh bạ"]'), null,
    "bộ chọn hồ sơ không dựng lại biểu mẫu danh bạ dài");

  scopeCatalogCalls = 0;
  uiAccessHienTai = uiAccessAdmin;
  await doiVaiTrenMan(page, "admin", "Người Quản Trị");
  await page.goto(`${GOC}#v=phanquyen`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("Bảng kiểm soát vai trò & tài khoản"), { timeout: 15000 });
  await page.click("#phanquyen-tab-email");
  await page.waitForFunction(() => document.body.innerText.includes("1 · Ai được phép có tài khoản"));
  assert.match(page.url(), /#v=phanquyen&tab=email$/,
    "tab email phải có URL có thể gửi cho đồng nghiệp");
  assert.equal(await documentContains("1 · Ai được phép có tài khoản"), true,
    "admin phải quản lý được danh sách email ngay trên web");
  /* Ma trận 4 vai thì XOÁ HẲN cùng hệ quyền cũ — không phải ẩn, mà không
     còn tồn tại. Thứ thay nó là ma trận 6 vai "Màn hình bạn được xem". */
  assert.equal(await documentContains("2 · Vai nào xem được gì, sửa được gì"), false,
    "ma trận 4 vai của hệ cũ đã xoá khỏi web");
  await page.evaluate(() => document.querySelector("#phanquyen-tab-quyen-toi")?.click());
  await page.waitForSelector('#phanquyen-tab-quyen-toi[aria-selected="true"]');
  await page.waitForFunction(() => document.body.innerText.includes("Màn hình bạn được xem"));
  assert.match(page.url(), /#v=phanquyen&tab=quyen-toi$/,
    "tab quyền hiệu lực phải được ghi vào lịch sử URL");
  assert.equal(await documentContains("Màn hình bạn được xem"), true,
    "thay bằng ma trận 6 vai đọc từ rpc_my_ui_access");
  assert.equal(await documentContains("3 · Ma trận trách nhiệm & quyền"), false,
    "admin không còn thấy ma trận trách nhiệm legacy");
  assert.equal(await documentContains("Từ ma trận này làm gì tiếp"), false,
    "admin không còn thấy hướng dẫn legacy dài bên dưới");
  await page.goBack();
  await page.waitForSelector('#phanquyen-tab-email[aria-selected="true"]');
  assert.match(page.url(), /#v=phanquyen&tab=email$/,
    "Back phải quay lại đúng tab trước đó");
  await page.evaluate(() => document.querySelector("#phanquyen-tab-kiem-soat")?.click());
  await page.waitForSelector('#phanquyen-tab-kiem-soat[aria-selected="true"]');
  await page.waitForFunction(
    (name) => [...document.querySelectorAll('[data-account-control-table="true"] tbody tr')]
      .some((row) => row.textContent?.includes(name)),
    { timeout: 30_000 },
    qaPerson.full_name,
  );
  const openedQaRights = await page.evaluate((name) => {
    const row = [...document.querySelectorAll('[data-account-control-table="true"] tbody tr')]
      .find((candidate) => candidate.textContent?.includes(name));
    const button = row?.querySelector('button[aria-controls="pq-account-tools"]');
    if (!button) return false;
    button.click();
    return true;
  }, qaPerson.full_name);
  assert.equal(openedQaRights, true, "tài khoản QA phải mở được quyền hiệu lực ngay từ bảng");
  await page.waitForFunction(() => document.body.innerText.includes("Quyền hiệu lực theo từng đầu mục"));
  assert.equal(await documentContains("Quyền hiệu lực theo từng đầu mục"), true,
    "bảng quyền hiệu lực hiện tại phải được giữ lại");
  assert.equal(await documentContains("Phạm vi xưởng"), false);
  assert.equal(await documentContains("Không tải được danh mục phạm vi"), false);
  assert.equal(scopeCatalogCalls, 0, "form QA không được gọi RPC catalog");

  /* Tab này chỉ chọn hồ sơ, nối tài khoản và đọc quyền. Phân công QA được
     quản lý trên Dữ liệu nguồn; không tạo writer cạnh tranh tại đây. */
  assert.equal(await page.$('[data-testid="save-permission-person"]'), null,
    "màn Vai trò & phạm vi không còn sửa hồ sơ nhân sự");
  assert.equal(await page.$('[aria-label="Mã hạng mục cần phân công"]'), null,
    "tab không còn biểu mẫu phân công thủ công");

  await page.evaluate(() => document.querySelector("#pq-account-tools header button")?.click());
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Liên kết tài khoản")?.click());
  await page.waitForSelector('input[aria-label="Tìm tên hoặc tài khoản"]');
  const directorySearch = await page.$('input[aria-label="Tìm tên hoặc tài khoản"]');
  assert.ok(directorySearch, "admin cần tìm nhân sự từ Dữ liệu nguồn để liên kết");
  await directorySearch.type("Legacy");
  await page.waitForFunction(() => document.body.innerText.includes("Nhân Sự Legacy · chưa có bộ phận"));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.includes("legacy@vmp.local"))?.click());

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

  uiAccessHienTai = uiAccessQuanLyQa;
  await doiVaiTrenMan(page, "qa_manager", "Quản lý QA");
  await page.evaluate(() => {
    const key = "vmp_monitor_user_v1";
    const current = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...current, accessClass: "qa_manager" }));
  });
  await page.goto(`${GOC}#v=phanquyen`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Việc hôm nay"));
  assert.equal(await documentContains("Phân công theo hạng mục"), false,
    "quản lý QA không được dựng workspace phân công hoặc quản trị");
  assert.equal(await documentContains("Nối tài khoản"), false,
    "quản lý QA không được thấy thao tác nối tài khoản");
  assert.equal(await page.$('input[aria-label="Tìm tên hoặc tài khoản"]'), null,
    "quản lý QA không được tải danh bạ quản trị");

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
  await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Việc hôm nay"));
  assert.equal(await documentContains("Danh bạ nhân sự & quyền"), false,
    "persona ngoài allowlist không được dựng workspace phân quyền");
  console.log("✅ Dòng legacy sửa được, khóa phân công, chọn đúng person_id khi trùng tên");
} finally {
  await browser.close();
}

function documentContains(text) {
  return page.evaluate((expected) => document.body.innerText.includes(expected), text);
}

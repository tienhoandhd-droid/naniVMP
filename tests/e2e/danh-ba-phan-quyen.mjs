import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { dangNhap, doiVaiTrenMan } from "./dang-nhap.mjs";
import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";

const GOC = "http://localhost:4173";
await choServer(GOC);

const person = {
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
  if (/\/rpc\/rpc_item_permission_directory/.test(url)) {
    return answer(request, { ok: true, people: [person] });
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
    return answer(request, { ok: true, person_id: person.person_id, user_id: person.user_id, account_status: "linked" });
  }
  request.continue();
});

try {
  await dangNhap(page, GOC);
  await doiVaiTrenMan(page, "admin", "Người Quản Trị");
  await page.goto(`${GOC}#v=phanquyen`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.body.innerText.includes("Danh bạ nhân sự & quyền"),
    { timeout: 15000 },
  );

  const search = await page.$('input[aria-label="Tìm tên hoặc tài khoản"]');
  assert.ok(search, "phải có ô autocomplete danh bạ");
  await search.type("Hồng");
  await page.waitForFunction(
    () => document.body.innerText.includes("Đặng Thị Hồng Ngọc · RD"),
    { timeout: 5000 },
  );
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Đặng Thị Hồng Ngọc · RD"))?.click();
  });

  const form = await page.evaluate(() => ({
    department: document.querySelector('[aria-label="Bộ phận trong danh bạ"]')?.value,
    email: document.querySelector('[aria-label="Email trong danh bạ"]')?.value,
    accessClass: document.querySelector('[aria-label="Phân loại quyền"]')?.value,
    scope: document.querySelector('[aria-label="Phạm vi phân quyền"]')?.value,
    areas: document.querySelector('[aria-label="Khu vực phân quyền"]')?.value,
  }));
  assert.deepEqual(form, {
    department: "rd",
    email: "hong.ngoc@vmp.local",
    accessClass: "view_only",
    scope: "rd;qa",
    areas: "A1;A2",
  });

  await page.type('[aria-label="Mã hạng mục cần phân công"]', "VMP-E2E-01");
  await page.type('[aria-label="Lý do phân công"]', "Chuẩn bị thảo luận quyền");
  await page.click('button[aria-label="Phân công người đã chọn"]');
  await page.waitForFunction(() => document.body.innerText.includes("Đã phân công hạng mục"));

  assert.equal(assignmentBodies.length, 1);
  assert.equal(assignmentBodies[0].p_person_id, person.person_id);
  assert.equal("staff_name" in assignmentBodies[0], false);
  assert.equal("full_name" in assignmentBodies[0], false);
  console.log("✅ Danh bạ autocomplete tự điền và phân công bằng person_id");
} finally {
  await browser.close();
}

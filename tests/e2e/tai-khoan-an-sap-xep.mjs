import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { choServer } from "./cho-server.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const GOC = "http://127.0.0.1:4173";
await choServer(GOC);

const URL_SB = (() => {
  const noi = readFileSync(new URL("../../.env.local", import.meta.url).pathname, "utf8");
  const match = noi.match(/^VITE_SUPABASE_URL=(.+)$/m);
  if (!match) throw new Error(".env.local thiếu VITE_SUPABASE_URL");
  return match[1].trim();
})();

const personBase = {
  employee_code: "NV-E2E",
  department: "rd",
  scope_departments: ["rd"],
  scope_factory_ids: [],
  scope_area_ids: [],
  scope_line_ids: [],
  access_areas: [],
  version: 1,
  email_sent_confirmed: true,
  is_active: true,
  match_status: "unique",
};

const directoryPeople = [
  {
    ...personBase,
    person_id: "aaaaaaaa-1111-4111-8111-000000000023",
    user_id: "user-workshop-z",
    full_name: "Zulu Xưởng E2E",
    email: "zulu-workshop-e2e@vmp.local",
    account_status: "linked",
    access_class: "workshop_staff",
  },
  {
    ...personBase,
    person_id: "aaaaaaaa-1111-4111-8111-000000000020",
    user_id: "user-inactive-directory",
    full_name: "Ẩn Inactive E2E",
    email: "inactive-directory-e2e@vmp.local",
    account_status: "inactive",
    access_class: "qa_manager",
  },
  {
    ...personBase,
    person_id: "aaaaaaaa-1111-4111-8111-000000000022",
    user_id: "user-equipment",
    full_name: "Thiết Bị E2E",
    email: "equipment-e2e@vmp.local",
    account_status: "linked",
    access_class: "equipment_manager",
  },
  {
    ...personBase,
    person_id: "aaaaaaaa-1111-4111-8111-000000000021",
    user_id: null,
    full_name: "Alpha Xưởng E2E",
    email: "unlinked-e2e@vmp.local",
    account_status: "unlinked",
    access_class: "workshop_staff",
  },
  {
    ...personBase,
    person_id: "aaaaaaaa-1111-4111-8111-000000000024",
    user_id: "user-qa-a",
    full_name: "QA A E2E",
    email: "qa-a-e2e@vmp.local",
    account_status: "linked",
    access_class: "qa_manager",
  },
];

const accountCandidates = [
  {
    user_id: "user-viewer-e2e",
    email: "viewer-e2e@vmp.local",
    full_name: "Zulu Viewer E2E",
    role: "viewer",
    department: "qa",
    is_active: true,
    linked_person_id: null,
  },
  {
    user_id: "user-inactive-e2e",
    email: "inactive-candidate-e2e@vmp.local",
    full_name: "Ứng viên inactive E2E",
    role: "admin",
    department: null,
    is_active: false,
    linked_person_id: null,
  },
  {
    user_id: "user-qa-manager-e2e",
    email: "qa-manager-e2e@vmp.local",
    full_name: "QA Manager E2E",
    role: "qa_manager",
    department: "qa",
    is_active: true,
    linked_person_id: null,
  },
  {
    user_id: "user-admin-e2e",
    email: "admin-e2e@vmp.local",
    full_name: "Admin E2E",
    role: "admin",
    department: null,
    is_active: true,
    linked_person_id: null,
  },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});
const page = await browser.newPage();

try {
  const { chanNgoai } = await caiGiaLap(page, {
    supabaseUrl: URL_SB,
    kichBan: "day",
    suaKho: (kho) => {
      kho.rpc_item_permission_preflight = {
        ok: true,
        mode: "preview",
        blocking_errors: [],
        warnings: [],
      };
      kho.rpc_item_permission_directory = () => ({ ok: true, people: directoryPeople });
      kho.rpc_item_permission_account_candidates = () => ({ ok: true, accounts: accountCandidates });
    },
  });
  await nhetPhien(page, { supabaseUrl: URL_SB });
  await page.setViewport({ width: 1500, height: 1100 });
  await page.goto(`${GOC}#v=phanquyen`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.innerText.includes("Danh bạ chuẩn"));
  await page.waitForFunction(() => document.querySelectorAll("#ip-directory-results button").length === 4);

  assert.equal(await page.evaluate(() => document.body.innerText.includes("Ẩn Inactive E2E")), false,
    "danh bạ không dựng hồ sơ có tài khoản inactive");
  assert.equal(await page.evaluate(() => document.body.innerText.includes("Alpha Xưởng E2E")), true,
    "danh bạ vẫn giữ người chưa nối tài khoản");
  assert.deepEqual(
    await page.$$eval("#ip-directory-results button", (buttons) => buttons.map(
      (button) => button.querySelector("b")?.textContent,
    )),
    ["QA A E2E · RD", "Thiết Bị E2E · RD", "Alpha Xưởng E2E · RD", "Zulu Xưởng E2E · RD"],
    "danh bạ hiển thị theo vai rồi tên, không theo thứ tự RPC",
  );

  await page.evaluate(() => [...document.querySelectorAll("#ip-directory-results button")]
    .find((button) => button.textContent?.includes("unlinked-e2e@vmp.local"))?.click());
  await page.type('[aria-label="Tìm tài khoản để nối"]', "E2E");
  await page.waitForFunction(() => document.querySelectorAll(
    '[aria-label="Tài khoản sẽ nối"] option[value]'
  ).length === 4);

  assert.equal(await page.evaluate(() => document.body.innerText.includes("Ứng viên inactive E2E")), false,
    "tìm tài khoản không dựng candidate inactive");
  assert.deepEqual(
    await page.$$eval('[aria-label="Tài khoản sẽ nối"] option', (options) => options.map((option) => option.value)),
    ["", "user-admin-e2e", "user-qa-manager-e2e", "user-viewer-e2e"],
    "candidate active hiển thị theo vai rồi tên, không theo thứ tự RPC",
  );
  assert.deepEqual(chanNgoai, [], "E2E không được gọi ra ngoài môi trường Supabase giả lập");
  console.log("✅ Tài khoản inactive được ẩn và danh sách active được sắp theo vai");
} finally {
  await browser.close();
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { caiGiaLap, NGUOI_DUNG, nhetPhien } from "./gia-lap-supabase.mjs";
import { uiAccessQuanLyQa } from "./ui-access.mjs";

const APP_URL = process.env.VMP_E2E_ORIGIN || "http://127.0.0.1:4173";
const SUPABASE_URL = readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
  .match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
assert.ok(SUPABASE_URL, ".env.local phải có VITE_SUPABASE_URL");

const CODE = "PQ-WORKLOAD-E2E";
const OLD_PERSON = "91000000-0000-4000-8000-000000000001";
const NEW_PERSON = "91000000-0000-4000-8000-000000000002";
const REASON = "Điều phối tải tháng 9";

const managerUser = {
  ...NGUOI_DUNG,
  id: "91000000-0000-4000-8000-000000000010",
  email: "qa-manager-workload@vi-du.test",
  user_metadata: { full_name: "Quản lý QA Workload" },
};
const staffUser = {
  ...NGUOI_DUNG,
  id: "91000000-0000-4000-8000-000000000011",
  email: "qa-staff-workload@vi-du.test",
  user_metadata: { full_name: "Nhân viên QA Workload" },
};

const staffAccess = {
  ok: true,
  mode: "enforced",
  business_role: "qa_staff",
  unresolved_reason: null,
  screens: {
    workload: { can_view: true, data_scope: "assigned", actions: ["view_workload"] },
  },
};

function activity(ownerPersonId, ownerName) {
  return {
    id: CODE,
    code: CODE,
    obj: "TB-WORKLOAD-E2E",
    name: "Nồi hấp Workload E2E",
    type: "PQ",
    vtype: "PQ",
    dept: "qa",
    owner: ownerName,
    ownerPersonId,
    st: "todo",
    state: "active",
    target: "2026-09-25",
    effort: 6,
    crit: "Cao",
    _raw: {
      owner_person_id: ownerPersonId,
      owner_name: ownerName,
      qa: ownerName,
      dl_vmp: "2026-09-25",
      dl_bao_cao: "2026-09-20",
      tt_de_cuong: "not_started",
      tt_tham_dinh: "not_started",
      tt_bao_cao: "not_started",
      tt_vmp: "not_started",
    },
  };
}

async function openPage(browser, { user, access, calls, state }) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  await nhetPhien(page, { supabaseUrl: SUPABASE_URL, nguoiDung: user });
  const { chanNgoai } = await caiGiaLap(page, {
    supabaseUrl: SUPABASE_URL,
    kichBan: "day",
    nguoiDung: user,
    mangNghiemNgat: true,
    previewOrigin: APP_URL,
    suaKho(kho) {
      kho.vmp_performers = [
        {
          id: OLD_PERSON, performer_name: "Nguyễn QA cũ", email: "qa.cu@vi-du.test",
          department: "QA", employee_code: "QA001", is_active: true, user_id: null,
        },
        {
          id: NEW_PERSON, performer_name: "Trần QA mới", email: "qa.moi@vi-du.test",
          department: "QA", employee_code: "QA002", is_active: true, user_id: null,
        },
      ];
      kho.rpc_my_ui_access = () => access;
      kho.rpc_get_vmp_dashboard = () => {
        calls.dashboard += 1;
        return {
          activities: [activity(state.ownerPersonId, state.ownerName)],
          objects: [],
          source: "supabase",
          updated_at: "2026-09-01T05:00:00Z",
          authorization_revision: 7,
          year: 2026,
        };
      };
      kho.rpc_get_vmp_watermark = {
        year: 2026, plan_items: 1, objects: 0,
        updated_at: "2026-09-01T05:00:00Z", authorization_revision: 7,
      };
      kho.rpc_set_item_performer_by_id = (body) => {
        calls.transfer.push(body);
        state.ownerPersonId = body.p_person_id;
        state.ownerName = "Trần QA mới";
        return { ok: true };
      };
    },
  });
  return { page, chanNgoai };
}

async function clickButtonByText(page, label) {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")]
      .find((candidate) => candidate.textContent?.trim() === text
        && candidate.getClientRects().length > 0);
    button?.click();
    return Boolean(button);
  }, label);
  assert.equal(clicked, true, `không tìm thấy nút ${label}`);
}

async function waitForWorkloadTrigger(page) {
  try {
    await page.waitForSelector("[data-workload-detail-trigger]", { timeout: 30_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      hash: location.hash,
      title: document.title,
      body: document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 1200),
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map((node) => node.textContent),
    }));
    throw new Error(`Workload chưa có trigger: ${JSON.stringify(diagnostic)}; cause=${error.message}`);
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

try {
  const managerCalls = { dashboard: 0, transfer: [] };
  const managerState = { ownerPersonId: OLD_PERSON, ownerName: "Nguyễn QA cũ" };
  const manager = await openPage(browser, {
    user: managerUser,
    access: uiAccessQuanLyQa,
    calls: managerCalls,
    state: managerState,
  });
  await manager.page.goto(`${APP_URL}#v=workload`, { waitUntil: "domcontentloaded" });
  await waitForWorkloadTrigger(manager.page);
  await manager.page.click("[data-workload-detail-trigger]");
  await manager.page.waitForSelector("[data-workload-owner-transfer]", { timeout: 10_000 });
  await manager.page.click("[data-workload-owner-transfer]");
  await manager.page.waitForSelector(`#workload-owner-next option[value="${NEW_PERSON}"]`, { timeout: 10_000 });
  await manager.page.select("#workload-owner-next", NEW_PERSON);
  await manager.page.type("#workload-owner-reason", REASON);
  await manager.page.click("[data-workload-owner-submit]");
  await manager.page.waitForFunction(() => document.body.innerText.includes("Xác nhận chuyển phụ trách?"));
  await clickButtonByText(manager.page, "Chuyển người");
  await manager.page.waitForFunction(() => !document.querySelector("[data-workload-owner-dialog]"));
  await manager.page.waitForFunction(() => document.body.innerText.includes("Trần QA mới"));

  assert.deepEqual(managerCalls.transfer, [{
    p_validation_code: CODE,
    p_person_id: NEW_PERSON,
    p_reason: REASON,
  }]);
  assert.ok(managerCalls.dashboard >= 2, "thành công phải tải lại dashboard");
  assert.deepEqual(manager.chanNgoai, [], "luồng manager không được gọi mạng ngoài");
  await manager.page.close();

  const staffCalls = { dashboard: 0, transfer: [] };
  const staff = await openPage(browser, {
    user: staffUser,
    access: staffAccess,
    calls: staffCalls,
    state: { ownerPersonId: OLD_PERSON, ownerName: "Nguyễn QA cũ" },
  });
  await staff.page.goto(`${APP_URL}#v=workload`, { waitUntil: "domcontentloaded" });
  await waitForWorkloadTrigger(staff.page);
  await staff.page.click("[data-workload-detail-trigger]");
  await staff.page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
  assert.equal(await staff.page.$("[data-workload-owner-transfer]"), null,
    "QA staff không được thấy hành động chuyển phụ trách");
  assert.deepEqual(staffCalls.transfer, []);
  assert.deepEqual(staff.chanNgoai, [], "luồng QA staff không được gọi mạng ngoài");
  await staff.page.close();

  console.log("✓ Workload chuyển đúng Source owner cho Quản lý QA và ẩn với QA staff");
} finally {
  await browser.close();
}

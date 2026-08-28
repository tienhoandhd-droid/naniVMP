import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { caiGiaLap, NGUOI_DUNG, nhetPhien } from "./gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const URL_SB = readFileSync(new URL("../../.env.local", import.meta.url).pathname, "utf8")
  .match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();

assert.ok(URL_SB, ".env.local phải có VITE_SUPABASE_URL");

/* IDs are deliberately UUID-shaped and account IDs remain distinct from
 * performer IDs: Today must read the canonical linked performer rather than
 * silently matching a name or the authenticated account ID. */
const PERSON = {
  staff: "81000000-0000-4000-8000-000000000001",
  unrelatedSameName: "81000000-0000-4000-8000-000000000002",
  unrelatedOtherDepartment: "81000000-0000-4000-8000-000000000003",
  manager: "81000000-0000-4000-8000-000000000004",
  admin: "81000000-0000-4000-8000-000000000005",
};

const USER = {
  staff: {
    ...NGUOI_DUNG,
    id: "82000000-0000-4000-8000-000000000001",
    email: "today-qa-staff@vi-du.test",
    user_metadata: { full_name: "QA Trùng Tên" },
  },
  manager: {
    ...NGUOI_DUNG,
    id: "82000000-0000-4000-8000-000000000002",
    email: "today-qa-manager@vi-du.test",
    user_metadata: { full_name: "Quản lý QA Today" },
  },
  admin: {
    ...NGUOI_DUNG,
    id: "82000000-0000-4000-8000-000000000003",
    email: "today-admin@vi-du.test",
    user_metadata: { full_name: "Admin Today" },
  },
  unlinked: {
    ...NGUOI_DUNG,
    id: "82000000-0000-4000-8000-000000000004",
    email: "today-qa-unlinked@vi-du.test",
    user_metadata: { full_name: "QA Chưa Liên Kết" },
  },
};

const CODE = {
  owner: "E2E-TODAY-OWNER",
  support: "E2E-TODAY-SUPPORT",
  sameNameUnrelated: "E2E-TODAY-SAME-NAME-OTHER",
  otherDepartment: "E2E-TODAY-OTHER-DEPT",
  manager: "E2E-TODAY-MANAGER",
  admin: "E2E-TODAY-ADMIN",
};

function bangkokDay(offset) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(Date.now() + offset * 86_400_000));
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function activity({ code, ownerPersonId = null, supportPersonId = null, department = "qa" }) {
  const deadline = bangkokDay(-1);
  const ownerName = "QA Trùng Tên";
  const raw = {
    validation_code: code,
    object_code: code,
    object_name: `Hạng mục ${code}`,
    validation_type: "PQ",
    department,
    exec_depts: [department],
    owner_name: ownerName,
    support_name: supportPersonId ? "QA hỗ trợ Today" : null,
    owner_person_id: ownerPersonId,
    support_person_id: supportPersonId,
    state: "active",
    tt_de_cuong: "not_started",
    tt_tham_dinh: "not_started",
    tt_bao_cao: "not_started",
    tt_vmp: "not_started",
    dl_vmp: deadline,
  };
  return {
    id: code,
    code,
    obj: code,
    objName: raw.object_name,
    name: raw.object_name,
    vtype: "PQ",
    type: "PQ",
    dept: department,
    depts: [department],
    execDepts: [department],
    owner: ownerName,
    owner_name: ownerName,
    ownerPersonId,
    supportPersonId,
    state: "active",
    score: 5,
    crit: "TB",
    _raw: raw,
  };
}

const ACTIVITIES = [
  activity({ code: CODE.owner, ownerPersonId: PERSON.staff }),
  activity({ code: CODE.support, ownerPersonId: PERSON.unrelatedOtherDepartment, supportPersonId: PERSON.staff }),
  // Same display name as the linked QA staff member, deliberately another person ID.
  activity({ code: CODE.sameNameUnrelated, ownerPersonId: PERSON.unrelatedSameName }),
  activity({ code: CODE.otherDepartment, ownerPersonId: PERSON.unrelatedOtherDepartment, department: "xsx" }),
  activity({ code: CODE.manager, ownerPersonId: PERSON.manager }),
  activity({ code: CODE.admin, ownerPersonId: PERSON.admin }),
];

function accessFor(businessRole) {
  return {
    ok: true,
    mode: "enforced",
    business_role: businessRole,
    unresolved_reason: null,
    screens: {
      today: { can_view: true, data_scope: "all", actions: ["view"] },
      overview: { can_view: true, data_scope: "all", actions: ["view"] },
    },
  };
}

function linkedPerformer({ personId, userId, name, accessClass }) {
  return {
    id: personId,
    person_id: personId,
    user_id: userId,
    performer_name: name,
    full_name: name,
    email: `${personId}@vi-du.test`,
    department: "qa",
    access_class: accessClass,
    is_active: true,
    active: true,
  };
}

function visibleTodayCodes(page) {
  return page.evaluate(() => [...document.querySelectorAll(".hn-muc .hn-muc__ma")]
    .map((node) => node.textContent?.trim())
    .filter(Boolean));
}

async function waitForTodayCodes(page, expectedCodes) {
  await page.waitForFunction((codes) => {
    const shown = new Set([...document.querySelectorAll(".hn-muc .hn-muc__ma")]
      .map((node) => node.textContent?.trim()));
    return codes.every((code) => shown.has(code));
  }, { timeout: 15_000 }, expectedCodes);
}

async function assertScopeButton(page, label, { disabled = false } = {}) {
  const state = await page.$eval(`button[aria-label="${label}"]`, (button) => ({
    disabled: button.disabled,
    text: button.textContent?.trim(),
  }));
  assert.equal(state.text, label, `scope action must describe the available action: ${label}`);
  assert.equal(state.disabled, disabled, `${label} disabled state`);
}

async function openToday({ user, businessRole, personId = null }) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  await page.evaluateOnNewDocument(() => localStorage.clear());
  await nhetPhien(page, { supabaseUrl: URL_SB, nguoiDung: user });
  const { chanNgoai } = await caiGiaLap(page, {
    supabaseUrl: URL_SB,
    kichBan: "day",
    nguoiDung: user,
    mangNghiemNgat: true,
    previewOrigin: GOC,
    suaKho(kho) {
      kho.profiles = [{
        id: user.id,
        email: user.email,
        full_name: user.user_metadata.full_name,
        role: businessRole === "admin" ? "admin" : "department_user",
        department: "qa",
        is_active: true,
      }];
      kho.vmp_performers = personId
        ? [linkedPerformer({
          personId, userId: user.id, name: user.user_metadata.full_name,
          accessClass: businessRole,
        })]
        : [];
      kho.rpc_my_ui_access = accessFor(businessRole);
      kho.rpc_get_vmp_dashboard = {
        activities: ACTIVITIES.map((row) => ({ ...row, _raw: { ...row._raw } })),
        objects: [],
        updated_at: "2026-08-28T00:00:00Z",
      };
      kho.rpc_get_vmp_watermark = {
        year: 2026, plan_items: ACTIVITIES.length, objects: 0, updated_at: "2026-08-28T00:00:00Z",
      };
      kho.rpc_my_editable_progress_rights = { ok: true, rights: [] };
    },
  });
  await page.goto(`${GOC}#v=today`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Việc hôm nay"), { timeout: 15_000 });
  return { page, chanNgoai };
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

try {
  {
    const { page, chanNgoai } = await openToday({
      user: USER.staff, businessRole: "qa_staff", personId: PERSON.staff,
    });
    try {
      await waitForTodayCodes(page, [CODE.owner, CODE.support]);
      const initialCodes = await visibleTodayCodes(page);
      assert.ok(!initialCodes.includes(CODE.sameNameUnrelated),
        "a same-name, different-person owner must not enter QA staff personal scope");
      assert.ok(!initialCodes.includes(CODE.otherDepartment),
        "an unrelated other-department row must not enter QA staff personal scope");
      assert.ok(!initialCodes.includes(CODE.manager) && !initialCodes.includes(CODE.admin),
        "QA staff personal scope must contain only canonical owner/support matches");
      await assertScopeButton(page, "Xem việc cả đội");
      assert.match(await page.$eval(".hn-mota", (node) => node.textContent || ""), /Việc hôm nay của tôi/,
        "linked QA staff opens Today in personal scope");

      await page.click('button[aria-label="Xem việc cả đội"]');
      await waitForTodayCodes(page, [CODE.sameNameUnrelated]);
      await assertScopeButton(page, "Chỉ xem việc của tôi");
      assert.ok((await visibleTodayCodes(page)).includes(CODE.sameNameUnrelated),
        "the team action reveals the same-department unrelated row");
      assert.equal(chanNgoai.length, 0, "linked QA staff scenario must remain fully intercepted");
    } finally {
      await page.close();
    }
  }

  for (const persona of [
    { label: "QA Manager", user: USER.manager, businessRole: "qa_manager", personId: PERSON.manager, ownCode: CODE.manager },
    { label: "Admin", user: USER.admin, businessRole: "admin", personId: PERSON.admin, ownCode: CODE.admin },
  ]) {
    const { page, chanNgoai } = await openToday(persona);
    try {
      await waitForTodayCodes(page, [CODE.owner, CODE.sameNameUnrelated, persona.ownCode]);
      await assertScopeButton(page, "Chỉ xem việc của tôi");
      assert.match(await page.$eval(".hn-mota", (node) => node.textContent || ""), /Việc hôm nay của cả đội/,
        `${persona.label} opens Today in team scope`);

      await page.click('button[aria-label="Chỉ xem việc của tôi"]');
      await waitForTodayCodes(page, [persona.ownCode]);
      const personalCodes = await visibleTodayCodes(page);
      assert.ok(!personalCodes.includes(CODE.owner) && !personalCodes.includes(CODE.sameNameUnrelated),
        `${persona.label} can narrow team Today to its linked canonical performer`);
      await assertScopeButton(page, "Xem việc cả đội");
      assert.equal(chanNgoai.length, 0, `${persona.label} scenario must remain fully intercepted`);
    } finally {
      await page.close();
    }
  }

  {
    const { page, chanNgoai } = await openToday({
      user: USER.unlinked, businessRole: "qa_staff", personId: null,
    });
    try {
      await waitForTodayCodes(page, [CODE.owner, CODE.sameNameUnrelated]);
      await assertScopeButton(page, "Chỉ xem việc của tôi", { disabled: true });
      const bodyText = await page.evaluate(() => document.body.innerText);
      assert.match(bodyText, /Tài khoản chưa liên kết nhân sự; nhờ Admin nối hồ sơ\./,
        "unlinked QA staff receives an actionable account-link warning");
      assert.match(bodyText, /Việc hôm nay của cả đội/,
        "unlinked QA staff remains in team scope instead of claiming an empty personal queue");
      assert.equal(chanNgoai.length, 0, "unlinked QA staff scenario must remain fully intercepted");
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log("Today personal scope: linked QA owner/support, role defaults, account-link warning, and same-name collision verified");

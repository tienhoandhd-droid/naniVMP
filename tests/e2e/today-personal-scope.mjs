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

function activity({
  code, ownerPersonId = null, supportPersonId = null, department = "qa", area = "QA-AREA-E2E",
}) {
  const deadline = bangkokDay(-1);
  const ownerName = "QA Trùng Tên";
  const raw = {
    validation_code: code,
    object_code: code,
    object_name: `Hạng mục ${code}`,
    validation_type: "PQ",
    department,
    exec_depts: [department],
    area_code: area,
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
    area,
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
  activity({
    code: CODE.otherDepartment, ownerPersonId: PERSON.unrelatedOtherDepartment,
    department: "xsx", area: "XSX-AREA-E2E",
  }),
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

async function waitForExactTodayCodes(page, expectedCodes) {
  const expected = [...expectedCodes].sort();
  try {
    await page.waitForFunction((want) => {
      const shown = [...new Set([...document.querySelectorAll(".hn-muc .hn-muc__ma")]
        .map((node) => node.textContent?.trim())
        .filter(Boolean))].sort();
      return JSON.stringify(shown) === JSON.stringify(want);
    }, { timeout: 15_000 }, expected);
  } catch (cause) {
    throw new Error(`Today rows did not reach ${JSON.stringify(expected)}; saw ${JSON.stringify(await visibleTodayCodes(page))}`, { cause });
  }
}

async function assertScopeButton(page, label, { disabled = false } = {}) {
  const state = await page.$eval(`button[aria-label="${label}"]`, (button) => ({
    disabled: button.disabled,
    text: button.textContent?.trim(),
  }));
  assert.equal(state.text, label, `scope action must describe the available action: ${label}`);
  assert.equal(state.disabled, disabled, `${label} disabled state`);
}

async function openGlobalFilter(page) {
  await page.evaluate(() => {
    const filterBar = document.querySelector('[aria-label="Phạm vi toàn hệ thống"]');
    const button = [...(filterBar?.querySelectorAll("button") || [])]
      .find((candidate) => candidate.textContent?.trim().startsWith("Bộ lọc"));
    if (!(button instanceof HTMLButtonElement)) throw new Error("Không tìm thấy nút Bộ lọc");
    button.click();
  });
  await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="Phạm vi toàn hệ thống"] button')]
    .some((button) => button.textContent?.trim().startsWith("Bộ lọc")
      && button.getAttribute("aria-expanded") === "true"), { timeout: 5_000 });
}

async function selectGlobalFilter(page, label) {
  await page.evaluate((expectedLabel) => {
    const filterBar = document.querySelector('[aria-label="Phạm vi toàn hệ thống"]');
    const option = [...(filterBar?.querySelectorAll("button") || [])]
      .find((candidate) => candidate.textContent?.includes(expectedLabel));
    if (!(option instanceof HTMLButtonElement)) throw new Error(`Không tìm thấy lựa chọn lọc ${expectedLabel}`);
    option.click();
  }, label);
  await page.waitForFunction((expectedLabel) => [...document.querySelectorAll('[aria-label="Phạm vi toàn hệ thống"] button')]
    .some((button) => button.textContent?.includes(expectedLabel) && button.getAttribute("aria-pressed") === "true"),
  { timeout: 5_000 }, label);
}

async function clearGlobalFilters(page) {
  await page.evaluate(() => {
    const filterBar = document.querySelector('[aria-label="Phạm vi toàn hệ thống"]');
    const button = [...(filterBar?.querySelectorAll("button") || [])]
      .find((candidate) => candidate.textContent?.trim() === "Xóa lọc");
    if (!(button instanceof HTMLButtonElement)) throw new Error("Không tìm thấy nút Xóa lọc");
    button.click();
  });
  await page.waitForFunction(() => {
    const hash = new URLSearchParams(location.hash.slice(1));
    return !hash.has("dept") && !hash.has("area");
  }, { timeout: 5_000 });
}

async function openToday({
  user,
  businessRole,
  personId = null,
  hash = "v=today",
  cachedUser = null,
  activities = ACTIVITIES,
  objects = activities.map((row) => ({
    code: row.code, name: row.name, dept: row.dept, area: row.area, cls: "tb", crit: "TB",
  })),
}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  await page.evaluateOnNewDocument(() => localStorage.clear());
  await nhetPhien(page, { supabaseUrl: URL_SB, nguoiDung: user });
  if (cachedUser) {
    await page.evaluateOnNewDocument((value) => {
      localStorage.setItem("vmp_monitor_user_v1", JSON.stringify(value));
    }, cachedUser);
  }
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
        activities: activities.map((row) => ({ ...row, _raw: { ...row._raw } })),
        objects: objects.map((row) => ({ ...row })),
        source: "supabase",
        updated_at: "2026-08-28T00:00:00Z",
        authorization_revision: 7,
        year: 2026,
      };
      kho.rpc_get_vmp_watermark = {
        year: 2026, plan_items: activities.length, objects: objects.length,
        updated_at: "2026-08-28T00:00:00Z", authorization_revision: 7,
      };
      kho.rpc_my_editable_progress_rights = { ok: true, rights: [] };
    },
  });
  await page.goto(`${GOC}#${hash}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Việc hôm nay"), { timeout: 15_000 });
  return { page, chanNgoai };
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

try {
  const regressionFailures = [];
  const recordRegression = (name, check) => {
    try {
      check();
    } catch (error) {
      regressionFailures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  {
    const { page, chanNgoai } = await openToday({
      user: USER.staff, businessRole: "qa_staff", personId: PERSON.staff, hash: "v=today&me=1",
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
      assert.equal(await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("me")), null,
        "QA staff cannot retain a hidden global My work URL state");

      await page.click('button[aria-label="Xem việc cả đội"]');
      await waitForTodayCodes(page, [CODE.sameNameUnrelated]);
      await assertScopeButton(page, "Chỉ xem việc của tôi");
      assert.ok((await visibleTodayCodes(page)).includes(CODE.sameNameUnrelated),
        "the team action reveals the same-department unrelated row");

      await openGlobalFilter(page);
      assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")]
        .some((button) => button.textContent?.includes("QA-AREA-E2E"))), true,
      "the filter-reset E2E fixture exposes a selectable QA area");
      await selectGlobalFilter(page, "QA – QLCL");
      await selectGlobalFilter(page, "QA-AREA-E2E");
      await page.waitForFunction(() => {
        const hash = new URLSearchParams(location.hash.slice(1));
        return hash.get("dept") === "qa" && hash.get("area") === "QA-AREA-E2E" && hash.get("me") === null;
      }, { timeout: 5_000 });
      await clearGlobalFilters(page);
      await assertScopeButton(page, "Chỉ xem việc của tôi");
      assert.match(await page.$eval(".hn-mota", (node) => node.textContent || ""), /Việc hôm nay của cả đội/,
        "clearing department and area leaves the explicit Today team scope unchanged");
      assert.equal(await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("me")), null,
        "clearing Today department and area does not create a global My work URL state");

      await page.click('[data-view="overview"]');
      await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Tổng quan"), { timeout: 5_000 });
      const overviewGlobalState = await page.evaluate(() => ({
        hash: new URLSearchParams(location.hash.slice(1)).get("me"),
        personSelector: document.querySelector('select[aria-label="Chọn nhân sự xem tiến độ"]') !== null,
      }));
      assert.deepEqual(overviewGlobalState, { hash: null, personSelector: false },
        "QA staff overview does not expose the privileged person selector");
      await page.click('[data-view="today"]');
      await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Việc hôm nay"), { timeout: 5_000 });
      await assertScopeButton(page, "Chỉ xem việc của tôi");
      assert.match(await page.$eval(".hn-mota", (node) => node.textContent || ""), /Việc hôm nay của cả đội/,
        "returning to Today preserves the explicitly selected team scope");
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
      await page.waitForSelector('select[aria-label="Chọn nhân sự xem tiến độ"]');
      assert.equal(await page.$eval('select[aria-label="Chọn nhân sự xem tiến độ"]', (select) => select.value), "",
        `${persona.label} opens in team scope`);
      assert.match(await page.$eval(".hn-mota", (node) => node.textContent || ""), /Việc hôm nay của cả nhóm/,
        `${persona.label} opens Today in team scope`);

      await page.select('select[aria-label="Chọn nhân sự xem tiến độ"]', PERSON.staff);
      await waitForExactTodayCodes(page, [CODE.owner, CODE.support]);
      assert.match(await page.$eval(".hn-mota", (node) => node.textContent || ""), /Việc hôm nay của QA Trùng Tên/,
        `${persona.label} can inspect another person's Today scope by canonical ID`);
      await page.click('[data-view="overview"]');
      await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Tổng quan"), { timeout: 5_000 });
      assert.equal(await page.$eval('select[aria-label="Chọn nhân sự xem tiến độ"]', (select) => select.value), PERSON.staff,
        `${persona.label} keeps the selected person when moving to Overview`);
      const completionTile = await page.evaluate(() => [...document.querySelectorAll(".vmp-tile")]
        .find((tile) => tile.textContent?.includes("Hoàn thành VMP"))?.textContent ?? "");
      assert.match(completionTile, /0\/2 hạng mục/,
        `${persona.label} Overview completion denominator is recalculated for the selected person`);
      assert.equal(chanNgoai.length, 0, `${persona.label} scenario must remain fully intercepted`);
    } finally {
      await page.close();
    }
  }

  {
    const { page, chanNgoai } = await openToday({
      user: USER.admin,
      businessRole: "admin",
      personId: PERSON.admin,
      hash: "v=today&me=1",
    });
    try {
      await page.waitForSelector('select[aria-label="Chọn nhân sự xem tiến độ"]');
      const legacyState = await page.evaluate(() => ({
        selected: document.querySelector('select[aria-label="Chọn nhân sự xem tiến độ"]')?.value ?? null,
        personId: JSON.parse(localStorage.getItem("vmp_monitor_user_v1") || "null")?.personId ?? null,
        me: new URLSearchParams(location.hash.slice(1)).get("me"),
      }));
      assert.deepEqual(legacyState, { selected: PERSON.admin, personId: PERSON.admin, me: "1" },
        "an explicit legacy me=1 link still opens the signed-in Admin's canonical scope");
      await waitForExactTodayCodes(page, [CODE.admin]);
      assert.equal(chanNgoai.length, 0, "Admin legacy link scenario must remain fully intercepted");
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

  {
    const { page, chanNgoai } = await openToday({
      user: USER.staff,
      businessRole: "qa_staff",
      personId: PERSON.staff,
      cachedUser: {
        name: USER.staff.user_metadata.full_name,
        uid: USER.staff.id,
        email: USER.staff.email,
        role: "department_user",
        department: "qa",
        accessClass: "qa_staff",
        personId: null,
      },
    });
    try {
      await waitForTodayCodes(page, [CODE.owner, CODE.support]);
      const state = await page.evaluate(() => {
        const personalAction = document.querySelector('button[aria-label="Xem việc cả đội"]');
        const cached = JSON.parse(localStorage.getItem("vmp_monitor_user_v1") || "null");
        return {
          actionAvailable: personalAction instanceof HTMLButtonElement,
          personalHeading: /Việc hôm nay của tôi/.test(document.querySelector(".hn-mota")?.textContent || ""),
          cachedPersonId: cached?.personId ?? null,
        };
      });
      recordRegression("returning cached session refreshes the canonical performer link", () => {
        assert.deepEqual(state, {
          actionAvailable: true,
          personalHeading: true,
          cachedPersonId: PERSON.staff,
        });
      });
      recordRegression("returning cached session remains fully intercepted", () => {
        assert.equal(chanNgoai.length, 0);
      });
    } finally {
      await page.close();
    }
  }

  {
    const { page, chanNgoai } = await openToday({
      user: USER.unlinked,
      businessRole: "qa_staff",
      personId: null,
      activities: [],
      objects: [],
    });
    try {
      await page.waitForFunction(() => document.querySelector('button[aria-label="Chỉ xem việc của tôi"]'),
        { timeout: 5_000 });
      const state = await page.evaluate(() => {
        const action = document.querySelector('button[aria-label="Chỉ xem việc của tôi"]');
        return {
          actionAvailable: action instanceof HTMLButtonElement,
          actionDisabled: action instanceof HTMLButtonElement ? action.disabled : null,
          hasWarning: /Tài khoản chưa liên kết nhân sự; nhờ Admin nối hồ sơ\./.test(document.body.innerText),
        };
      });
      recordRegression("zero-row unlinked Today exposes the actionable personal-scope warning", () => {
        assert.deepEqual(state, {
          actionAvailable: true,
          actionDisabled: true,
          hasWarning: true,
        });
      });
      recordRegression("zero-row unlinked Today remains fully intercepted", () => {
        assert.equal(chanNgoai.length, 0);
      });
    } finally {
      await page.close();
    }
  }

  if (regressionFailures.length) {
    throw new Error(`Today scope regression failures:\n${regressionFailures.join("\n")}`);
  }
} finally {
  await browser.close();
}

console.log("Today personal scope: linked QA owner/support, role defaults, account-link warning, and same-name collision verified");

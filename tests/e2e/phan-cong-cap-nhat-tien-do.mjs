import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { doiVaiTrenMan } from "./dang-nhap.mjs";
import { caiGiaLap, NGUOI_DUNG, nhetPhien } from "./gia-lap-supabase.mjs";
import { uiAccessQuanLyQa } from "./ui-access.mjs";

const GOC = process.env.VMP_E2E_ORIGIN || "http://127.0.0.1:4173";
const URL_SB = readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
  .match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
assert.ok(URL_SB, ".env.local phải có VITE_SUPABASE_URL");

const QA_ASSIGNED_PERSON_ID = "99000000-0000-4000-8000-000000000021";
const QA_UNASSIGNED_PERSON_ID = "99000000-0000-4000-8000-000000000022";
const OBJECT_CODE = "TB-CROSS-E2E";
const ITEM_ID = "TB-CROSS-E2E/2026.01-PQ";
const UNASSIGNED_ITEM_ID = "TB-CROSS-UNASSIGNED/2026.01-PQ";
const OWNER_REASON = "Phân công QA E2E để cập nhật tiến độ";
const PROGRESS_REASON = "QA E2E bắt đầu thẩm định";

const ACTIVITY = {
  id: ITEM_ID, code: ITEM_ID, name: "Thiết bị cross-screen E2E", vtype: "PQ",
  dep: "Không phụ thuộc", owner: "—", dept: "qa", target: "2026-12-31",
  st: "todo", state: "active",
  _raw: {
    version: 0, state: "active", object_code: OBJECT_CODE,
    tt_de_cuong: "completed", tt_tham_dinh: "not_started",
    tt_bao_cao: "not_started", tt_vmp: "not_started",
  },
};
const UNASSIGNED_ACTIVITY = {
  ...ACTIVITY,
  id: UNASSIGNED_ITEM_ID,
  code: UNASSIGNED_ITEM_ID,
  name: "Thiết bị riêng cho persona QA chưa phân công",
  _raw: { ...ACTIVITY._raw, object_code: "TB-CROSS-UNASSIGNED" },
};

const SOURCE = {
  id: "cross-source-1", object_kind: "Thiết bị", object_code: OBJECT_CODE,
  code: OBJECT_CODE, object_name: "Thiết bị cross-screen E2E",
  department: "qa", area_code: "QA-01", line: null, validate_flag: "y",
  frequency_months: 12, first_month: 1, year_ref: 2026, is_active: true,
  owner_person_id: null, owner_name: null, version: 7,
};

const ASSIGNED = {
  id: QA_ASSIGNED_PERSON_ID, person_id: QA_ASSIGNED_PERSON_ID,
  full_name: "QA phụ trách E2E", name: "QA phụ trách E2E",
  performer_name: "QA phụ trách E2E", is_active: true,
  active: true, department: "qa", access_class: "qa_staff",
};
const UNASSIGNED = {
  ...ASSIGNED,
  id: QA_UNASSIGNED_PERSON_ID,
  person_id: QA_UNASSIGNED_PERSON_ID,
  full_name: "QA chưa phân công E2E",
  name: "QA chưa phân công E2E",
};

const MANAGER_USER = {
  ...NGUOI_DUNG,
  id: "99000000-0000-4000-8000-000000000020",
  email: "qa-manager-cross-e2e@vi-du.test",
  user_metadata: { full_name: "Quản lý QA cross-screen E2E" },
};
const ASSIGNED_USER = {
  ...NGUOI_DUNG,
  id: QA_ASSIGNED_PERSON_ID,
  email: "qa-assigned-cross-e2e@vi-du.test",
  user_metadata: { full_name: ASSIGNED.full_name },
};
const UNASSIGNED_USER = {
  ...NGUOI_DUNG,
  id: QA_UNASSIGNED_PERSON_ID,
  email: "qa-unassigned-cross-e2e@vi-du.test",
  user_metadata: { full_name: UNASSIGNED.full_name },
};
const uiAccessQaStaff = {
  ok: true,
  mode: "enforced",
  business_role: "qa_staff",
  unresolved_reason: null,
  screens: {
    progress: { can_view: true, data_scope: "qa_assignment", actions: ["view"] },
  },
};

function findButton(page, text) {
  return page.evaluate((label) => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === label)?.click(), text);
}

function validationBlockState(page) {
  return page.evaluate(() => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')]
      .find((candidate) => candidate.getClientRects().length > 0
        && document.getElementById(candidate.getAttribute("aria-labelledby") ?? "")?.textContent?.trim() === "Cập nhật tiến độ");
    const spans = [...(dialog?.querySelectorAll("span") ?? [])];
    const title = spans
      .find((node) => (node.textContent || "").replace(/\s+/g, " ").trim()
        .startsWith("2. Thẩm định thực tế"));
    const block = title?.closest("div[style*='border']");
    return {
      hasStatus: !!block?.querySelector("select"),
      dates: block?.querySelectorAll('input[type="date"]').length ?? 0,
      forbiddenLabel: [...(block?.querySelectorAll("span") ?? [])]
        .some((node) => node.textContent?.trim() === "Ngày hoàn thành thực tế"),
      diagnostic: title ? { tag: title.tagName, text: title.textContent, blockTag: block?.tagName,
        blockStyle: block?.getAttribute("style"), html: block?.innerHTML.slice(0, 600) }
        : spans.map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
          .filter((text) => text.includes("Thẩm định thực tế")),
      modalText: dialog?.textContent?.replace(/\s+/g, " ").trim(),
    };
  });
}

async function setText(page, selector, value) {
  await page.evaluate(([target, next]) => {
    const input = document.querySelector(target);
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
      throw new Error(`Không tìm thấy text control ${target}`);
    }
    const prototype = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, next);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    input?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [selector, value]);
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new", args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

const saveBodies = [];
const batchBodies = [];
const itemBodies = [];
const updateBodies = [];
let ownerAssigned = false;

async function newPage({ key, user, uiAccess }) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  await nhetPhien(page, { supabaseUrl: URL_SB, nguoiDung: user });
  const rightsFor = () => key === "assigned_qa"
    && user.id === QA_ASSIGNED_PERSON_ID && ownerAssigned
    ? ["status_validation"] : [];
  const { chanNgoai } = await caiGiaLap(page, {
    supabaseUrl: URL_SB,
    kichBan: "day",
    nguoiDung: user,
    mangNghiemNgat: true,
    previewOrigin: GOC,
    suaKho(kho) {
      kho.vmp_source_objects = [{ ...SOURCE }];
      kho.vmp_performers = [{ ...ASSIGNED }, { ...UNASSIGNED }];
      kho.rpc_source_qa_candidates = {
        ok: true,
        rows: [ASSIGNED, UNASSIGNED].map((person) => ({
          person_id: person.person_id,
          performer_name: person.full_name,
          normalized_full_name: person.full_name.toLocaleLowerCase("vi"),
          email: person.email ?? `${person.person_id}@example.invalid`,
          department: person.department.toUpperCase(),
          role_name: "qa_staff",
        })),
        included_current: [],
        authorized_total: 2,
        next_cursor: null,
      };
      kho.rpc_my_ui_access = () => uiAccess;
      kho.rpc_errors = {
        ...(kho.rpc_errors || {}),
        rpc_get_vmp_dashboard_v2: {
          status: 404,
          code: "PGRST202",
          message: "Could not find the function public.rpc_get_vmp_dashboard_v2 in the schema cache",
        },
      };
      kho.rpc_get_vmp_dashboard = () => ({
        activities: [
          { ...ACTIVITY, _raw: { ...ACTIVITY._raw } },
          { ...UNASSIGNED_ACTIVITY, _raw: { ...UNASSIGNED_ACTIVITY._raw } },
        ], objects: [{ ...SOURCE }],
        source: "supabase",
        updated_at: "2026-08-27T00:00:00Z",
        authorization_revision: 7,
        year: 2026,
      });
      kho.rpc_get_vmp_watermark = {
        year: 2026, plan_items: 1, objects: 1,
        updated_at: "2026-08-27T00:00:00Z", authorization_revision: 7,
      };
      kho.rpc_my_editable_progress_rights = (body) => {
        batchBodies.push({ persona: key, body });
        const editable_fields = rightsFor();
        return { ok: true, rights: editable_fields.length ? [{
          validation_code: ITEM_ID, editable_fields, view_reason: "QA phụ trách theo đối tượng",
        }] : [] };
      };
      kho.vmp_my_item_rights = (body) => {
        itemBodies.push({ persona: key, body });
        const editable_fields = rightsFor();
        return [{
          can_view: editable_fields.length > 0, editable_fields,
          view_reason: editable_fields.length ? "QA phụ trách theo đối tượng" : "Chưa có phân công QA đang hoạt động",
          assignment_sources: editable_fields.length ? ["object_qa_owner"] : [],
          scope_match: editable_fields.length > 0, area_match: editable_fields.length > 0,
        }];
      };
      kho.rpc_save_catalog_object = (body) => {
        saveBodies.push(body);
        assert.deepEqual(body, {
          p_object_kind: "Thiết bị", p_object_code: OBJECT_CODE,
          p_patch: { owner_person_id: QA_ASSIGNED_PERSON_ID },
          p_reason: OWNER_REASON, p_expected_version: 7,
        });
        ownerAssigned = true;
        return { ok: true, object_code: OBJECT_CODE, version: 8, owner_assignments_ok: 1 };
      };
      kho.rpc_update_progress = (body) => {
        updateBodies.push(body);
        return { ok: true };
      };
    },
  });
  return { page, chanNgoai };
}

try {
  // Source Data là đường ghi thật duy nhất: không dùng replace/remove fixture.
  const manager = await newPage({ key: "qa_manager", user: MANAGER_USER, uiAccess: uiAccessQuanLyQa });
  await manager.page.goto(`${GOC}#v=source`, { waitUntil: "domcontentloaded" });
  await manager.page.waitForSelector("[data-cw-sua]", { timeout: 30_000 });
  await doiVaiTrenMan(manager.page, "edit", "Quản lý QA E2E");
  await manager.page.click("[data-cw-sua]");
  await manager.page.waitForSelector('select[aria-label="QA phụ trách"]', { timeout: 15_000 });
  await manager.page.waitForSelector(`select[aria-label="QA phụ trách"] option[value="${QA_ASSIGNED_PERSON_ID}"]`, { timeout: 15_000 });
  await manager.page.select('select[aria-label="QA phụ trách"]', QA_ASSIGNED_PERSON_ID);
  await setText(manager.page, "#cof-ly-do", OWNER_REASON);
  await manager.page.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => /^Lưu/.test(button.textContent?.trim() || "") && !button.disabled));
  await manager.page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => /^Lưu/.test(button.textContent?.trim() || ""))?.click());
  await manager.page.waitForFunction(() => !document.querySelector('select[aria-label="QA phụ trách"]'));
  assert.equal(saveBodies.length, 1, "gán owner phải có đúng một RPC save");

  const assignedBatchStart = batchBodies.length;
  const assigned = await newPage({ key: "assigned_qa", user: ASSIGNED_USER, uiAccess: uiAccessQaStaff });
  await assigned.page.goto(`${GOC}#v=progress`, { waitUntil: "domcontentloaded" });
  await doiVaiTrenMan(assigned.page, "edit", "QA phụ trách E2E");
  await assigned.page.waitForSelector(`[data-progress-item="${ITEM_ID}"]`, { timeout: 30_000 });
  assert.equal(await assigned.page.$(`[data-progress-item="${UNASSIGNED_ITEM_ID}"]`), null,
    "QA được gán không thấy fixture hạng mục riêng chưa được phân cho mình");
  assert.ok(batchBodies.length > assignedBatchStart, "QA được gán phải đọc batch-rights bằng session riêng");
  assert.deepEqual(batchBodies.at(-1), { persona: "assigned_qa", body: {} },
    "batch-rights QA được gán không nhận mã item hay persona từ browser");
  const progressButton = `.vmp-chi-desktop [data-progress-item="${ITEM_ID}"] button[title="Cập nhật tiến độ"]`;
  assert.equal(await assigned.page.$eval(progressButton, (button) => {
    const style = getComputedStyle(button);
    return style.display !== "none" && style.visibility !== "hidden" && button.getClientRects().length > 0;
  }), true, "nút Cập nhật desktop phải hiện hữu và tương tác được");
  const itemReadsBeforeOpen = itemBodies.length;
  // CDP click theo toạ độ thỉnh thoảng rơi vào lớp bảng đang tái bố cục sau
  // batch-rights. Gọi click trên đúng nút vừa kiểm visible/enable vẫn đi qua
  // handler React thật, nhưng không phụ thuộc timing layout của Chromium.
  await assigned.page.$eval(progressButton, (button) => {
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      throw new Error("Nút Cập nhật không sẵn sàng");
    }
    button.click();
  });
  try {
    await assigned.page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')]
      .some((dialog) => dialog.getClientRects().length > 0
        && document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent?.trim() === "Cập nhật tiến độ"), { timeout: 5_000 });
  } catch (error) {
    const diagnostic = await assigned.page.evaluate((selector) => ({
      hash: location.hash,
      title: document.title,
      button: document.querySelector(selector)?.outerHTML,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map((node) => ({
        visible: node.getClientRects().length > 0,
        text: node.textContent?.replace(/\s+/g, " ").trim().slice(0, 180),
      })),
      bodyHasModalTitle: document.body.innerText.includes("Cập nhật tiến độ"),
      body: document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 600),
    }), progressButton);
    throw new Error(`Modal không mở sau click: ${JSON.stringify(diagnostic)}; itemReads=${itemBodies.length}; cause=${error.message}`);
  }
  for (let i = 0; i < 100 && itemBodies.length === itemReadsBeforeOpen; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(itemBodies.length > itemReadsBeforeOpen, "mở modal phải phát sinh per-item rights read mới");
  await assigned.page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')]
    .some((dialog) => dialog.getClientRects().length > 0
      && dialog.innerText.includes("Quyền theo từng cột đang áp dụng")));
  assert.deepEqual(itemBodies.at(-1), {
    persona: "assigned_qa", body: { p_validation_code: ITEM_ID },
  }, "modal phải reload quyền từng item bằng session QA được gán");
  const validation = await validationBlockState(assigned.page);
  const { diagnostic: _diagnostic, modalText: _modalText, ...validationResult } = validation;
  assert.deepEqual(validationResult, {
    hasStatus: true, dates: 0, forbiddenLabel: false,
  }, "QA được gán chỉ thấy status_validation, control cấm không được có trong DOM");
  await assigned.page.evaluate(() => {
    const title = [...document.querySelectorAll("span")]
      .find((node) => (node.textContent || "").replace(/\s+/g, " ").trim()
        .startsWith("2. Thẩm định thực tế"));
    const select = title?.closest("div[style*='border']")?.querySelector("select");
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, "Đang thực hiện");
    select?.dispatchEvent(new Event("input", { bubbles: true }));
    select?.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await setText(assigned.page, "textarea", PROGRESS_REASON);
  await assigned.page.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => button.textContent?.trim() === "Lưu 1 thay đổi" && !button.disabled));
  await findButton(assigned.page, "Lưu 1 thay đổi");
  await assigned.page.waitForFunction(() => ![...document.querySelectorAll('[role="dialog"]')]
    .some((dialog) => dialog.getClientRects().length > 0
      && document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent?.trim() === "Cập nhật tiến độ"));
  assert.deepEqual(updateBodies, [{
    p_validation_code: ITEM_ID, p_patch: { status_validation: "in_progress" },
    p_reason: PROGRESS_REASON, p_sheet_patch: null, p_expected_version: 0,
  }], "RPC tiến độ chỉ nhận status đã đổi");

  const unassignedBatchStart = batchBodies.length;
  const unassigned = await newPage({
    key: "unassigned_qa", user: UNASSIGNED_USER, uiAccess: uiAccessQaStaff,
  });
  await unassigned.page.goto(`${GOC}#v=progress`, { waitUntil: "domcontentloaded" });
  await doiVaiTrenMan(unassigned.page, "edit", "QA chưa phân công E2E");
  await unassigned.page.waitForSelector('[data-progress-rights-state="ready"]', { timeout: 30_000 });
  assert.equal(await unassigned.page.$(`[data-progress-item="${ITEM_ID}"]`), null,
    "dashboard raw vẫn có item nhưng QA chưa được gán không có row/card để mở modal");
  assert.equal(await unassigned.page.$(`[data-progress-item="${UNASSIGNED_ITEM_ID}"]`), null,
    "persona QA chưa phân công không thấy cả fixture hạng mục riêng không có quyền batch");

  assert.ok(batchBodies.length > unassignedBatchStart,
    "QA chưa phân công phải đọc batch-rights bằng session riêng");
  assert.ok(["assigned_qa", "unassigned_qa"].every((persona) =>
    batchBodies.some((entry) => entry.persona === persona)),
  "mỗi phase Tiến độ phải phát sinh batch POST bằng session tương ứng");
  assert.deepEqual(batchBodies.filter(({ persona }) => persona === "assigned_qa").map(({ body }) => body),
    Array.from({ length: batchBodies.filter(({ persona }) => persona === "assigned_qa").length }, () => ({})),
    "mọi batch POST của QA được gán phải có body đúng {}");
  assert.deepEqual(batchBodies.filter(({ persona }) => persona === "unassigned_qa").map(({ body }) => body),
    Array.from({ length: batchBodies.filter(({ persona }) => persona === "unassigned_qa").length }, () => ({})),
    "mọi batch POST của QA chưa phân công phải có body đúng {}");
  assert.ok(itemBodies.length >= 1, "mở modal phải đọc quyền từng item tối thiểu một lần");
  assert.deepEqual(itemBodies, [{
    persona: "assigned_qa", body: { p_validation_code: ITEM_ID },
  }], "cross-screen chỉ đọc đúng per-item của hạng mục QA được gán");
  assert.equal(updateBodies.length, 1, "chỉ có một RPC write tiến độ");
  assert.deepEqual(manager.chanNgoai, [], "manager không được gửi request ngoài preview/mock");
  assert.deepEqual(assigned.chanNgoai, [], "assigned QA không được gửi request ngoài preview/mock");
  assert.deepEqual(unassigned.chanNgoai, [], "unassigned QA không được gửi request ngoài preview/mock");
  console.log("✅ Gán QA từ Dữ liệu nguồn cấp đúng quyền status-only ở Tiến độ");
} finally {
  await browser.close();
}

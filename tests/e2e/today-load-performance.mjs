import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, dungHangMuc, nhetPhien } from "./gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const URL_SB = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8")
  .match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();

assert.ok(URL_SB, ".env.local phải có VITE_SUPABASE_URL");

let modeCalls = 0;
let permissionFailure = false;
let progressRightsCalls = 0;
let actionRightRevoked = false;
const ACTION_EDIT_CODE = "E2E-TODAY-EDIT";
const ACTION_READ_CODE = "E2E-TODAY-READ";
const ACTION_FIELDS = ["actual_validation_date"];

function isoDayFromNow(days) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Date.now() + days * 86_400_000));
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function setUnfinishedStages(item, firstDeadline) {
  Object.assign(item, {
    st: "chua", state: "active",
    dlProtocol: firstDeadline,
    dlValidation: isoDayFromNow(2),
    dlReport: isoDayFromNow(3),
    dlVmp: isoDayFromNow(4),
    actProtocol: null, actValidation: null, actReport: null, actVmp: null,
  });
  Object.assign(item._raw, {
    state: "active", status: "chua",
    deadline_protocol: firstDeadline,
    deadline_validation: item.dlValidation,
    deadline_report: item.dlReport,
    deadline_vmp: item.dlVmp,
    actual_protocol_date: null, actual_validation_date: null,
    actual_report_date: null, actual_vmp_date: null,
    protocol_done: false, validation_done: false,
    report_done: false, vmp_done: false,
  });
}

const largeActivities = Array.from({ length: 461 }, (_, index) => {
  const item = dungHangMuc(index);
  item.ownerPersonId = null;
  item._raw.owner_person_id = null;
  return item;
});

const editableAction = largeActivities[0];
Object.assign(editableAction, {
  id: ACTION_EDIT_CODE, code: ACTION_EDIT_CODE,
  objName: "Hạng mục E2E có hai nguyên nhân", name: "Hạng mục E2E có hai nguyên nhân",
  ownerPersonId: null, score: 9,
});
Object.assign(editableAction._raw, {
  validation_code: ACTION_EDIT_CODE,
  object_name: "Hạng mục E2E có hai nguyên nhân",
  owner_person_id: null, criticality_score: 9,
});
setUnfinishedStages(editableAction, isoDayFromNow(-1));

const readOnlyAction = largeActivities[1];
Object.assign(readOnlyAction, {
  id: ACTION_READ_CODE, code: ACTION_READ_CODE,
  objName: "Hạng mục E2E chỉ xem", name: "Hạng mục E2E chỉ xem",
  ownerPersonId: "person-other", score: 1,
});
Object.assign(readOnlyAction._raw, {
  validation_code: ACTION_READ_CODE,
  object_name: "Hạng mục E2E chỉ xem",
  owner_person_id: "person-other", criticality_score: 1,
});
setUnfinishedStages(readOnlyAction, isoDayFromNow(3));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

const failures = [];
const check = (condition, message, detail = "") => {
  if (!condition) failures.push(`${message}${detail ? ` — ${detail}` : ""}`);
};

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  const { chanNgoai } = await caiGiaLap(page, {
    supabaseUrl: URL_SB,
    kichBan: "day",
    mangNghiemNgat: true,
    previewOrigin: GOC,
    suaKho(kho) {
      kho.item_permissions_mode = () => {
        modeCalls += 1;
        return permissionFailure ? "invalid-mode" : "enforced";
      };
      kho.rpc_my_editable_progress_rights = () => {
        progressRightsCalls += 1;
        return {
          ok: true,
          rights: largeActivities
            .filter((item) => item.code !== ACTION_READ_CODE)
            .filter((item) => !(actionRightRevoked && item.code === ACTION_EDIT_CODE))
            .map((item) => ({
              validation_code: item.code,
              editable_fields: ACTION_FIELDS,
              view_reason: "Quyền E2E theo hạng mục",
            })),
        };
      };
      kho.rpc_get_vmp_dashboard = () => ({
        activities: largeActivities,
        objects: kho.vmp_source_objects,
        source: "supabase",
        updated_at: "2026-08-28T01:00:00Z",
        authorization_revision: 7,
        year: 2026,
      });
      kho.rpc_get_vmp_watermark = {
        year: 2026,
        plan_items: largeActivities.length,
        objects: kho.vmp_source_objects.length,
        updated_at: "2026-08-28T01:00:00Z",
        authorization_revision: 7,
      };
    },
  });
  await nhetPhien(page, { supabaseUrl: URL_SB });
  await page.goto(`${GOC}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Tổng quan"), {
    timeout: 10_000,
  });

  await page.evaluate(() => performance.clearResourceTimings());
  const navStarted = Date.now();
  await page.evaluate(() => document.querySelector('[data-view="today"]')?.click());
  await page.waitForFunction(() => document.querySelectorAll(".hn-muc").length === 461, {
    timeout: 5_000,
  });
  const navDuration = Date.now() - navStarted;

  const renderState = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".hn-muc")];
    const first = rows[0];
    const last = rows.at(-1);
    last?.scrollIntoView({ block: "center" });
    const style = first ? getComputedStyle(first) : null;
    return {
      rows: rows.length,
      lastVisible: !!last && last.getBoundingClientRect().top < innerHeight,
      contentVisibility: style?.contentVisibility || "",
      intrinsicSize: style?.containIntrinsicSize || "",
      chunks: performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => /TodayCommandCenter/i.test(name)),
    };
  });
  check(navDuration < 2_500, "chuyển sang Việc hôm nay phải hoàn tất dưới 2,5 giây", `${navDuration}ms`);
  check(renderState.rows === 461, "phải dựng đủ 461 hạng mục", String(renderState.rows));
  check(renderState.lastVisible, "hạng mục cuối phải cuộn tới và hiển thị được");
  check(renderState.contentVisibility === "auto", "danh sách dài phải bỏ qua render ngoài viewport", renderState.contentVisibility);
  check(/124px/.test(renderState.intrinsicSize), "mobile phải giữ kích thước nội tại ổn định", renderState.intrinsicSize);
  check(renderState.chunks.length === 0, "Việc hôm nay không được phụ thuộc chunk tải muộn", renderState.chunks[0] || "");

  async function todayRow(code) {
    return page.evaluate((expected) => {
      const row = [...document.querySelectorAll(".hn-muc")].find((node) =>
        node.querySelector(".hn-muc__ma")?.textContent?.trim() === expected);
      if (!row) return null;
      const action = [...row.querySelectorAll("button")]
        .find((button) => /^(Cập nhật tiến độ|Xem chi tiết)$/.test(button.textContent?.trim() || ""));
      const section = row.closest("section");
      return {
        text: row.textContent || "",
        action: action?.textContent?.trim() || "",
        sectionTitle: section?.querySelector("h2")?.textContent?.trim() || "",
      };
    }, code);
  }

  const editable = await todayRow(ACTION_EDIT_CODE);
  const editableDetail = JSON.stringify(editable);
  check(editable?.sectionTitle?.includes("Quá hạn"), "mục nhiều nguyên nhân nằm nhóm Quá hạn", editableDetail);
  check(editable?.text.includes("Quá hạn"), "mục nhiều nguyên nhân có badge Quá hạn", editableDetail);
  check(editable?.text.includes("Chưa phân công"), "mục nhiều nguyên nhân có badge chưa phân công");
  check(/(?:mốc )?Đề cương\s*·\s*trễ 1 ngày/.test(editable?.text || ""),
    "mục nhiều nguyên nhân hiện đúng mốc chặn và hạn", editableDetail);
  check(editable?.action === "Cập nhật tiến độ", "mục có quyền hiện Cập nhật tiến độ", editable?.action || "");

  const readOnly = await todayRow(ACTION_READ_CODE);
  check(readOnly?.action === "Xem chi tiết", "mục không có batch right chỉ hiện Xem chi tiết", readOnly?.action || "");

  await new Promise((resolve) => setTimeout(resolve, 1_050));
  const callsBeforeReturn = modeCalls;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await new Promise((resolve) => setTimeout(resolve, 350));
  const callsAfterReturn = modeCalls - callsBeforeReturn;
  check(callsAfterReturn === 1,
    "focus và visibilitychange của cùng một lần quay lại chỉ được xác minh quyền một lần",
    `${callsAfterReturn} lần`);

  await page.evaluate((code) => {
    const row = [...document.querySelectorAll(".hn-muc")].find((node) =>
      node.querySelector(".hn-muc__ma")?.textContent?.trim() === code);
    [...(row?.querySelectorAll("button") || [])]
      .find((button) => button.textContent?.trim() === "Cập nhật tiến độ")?.click();
  }, ACTION_EDIT_CODE);
  try {
    await page.waitForFunction((code) => {
      const items = [...document.querySelectorAll("[data-progress-item]")];
      return document.querySelector('[data-progress-rights-state="ready"]')
        && location.hash === "#v=progress"
        && document.querySelector('input[placeholder="Tìm theo mã, tên, QA…"]')?.value === code
        && items.length > 0
        && items.every((node) => node.getAttribute("data-progress-item") === code)
        && items.filter((node) => node.getClientRects().length > 0).length === 1;
    },
    { timeout: 5_000 }, ACTION_EDIT_CODE);
  } catch (error) {
    const state = await page.evaluate(() => ({
      hash: location.hash,
      query: document.querySelector('input[placeholder="Tìm theo mã, tên, QA…"]')?.value || "",
      rows: [...document.querySelectorAll("[data-progress-item]")]
        .map((node) => node.getAttribute("data-progress-item")),
      rights: document.querySelector('[data-progress-rights-state]')?.getAttribute("data-progress-rights-state") || "",
    }));
    throw new Error(`deep link không focus đúng mã: ${JSON.stringify(state)}`, { cause: error });
  }

  await page.evaluate(() => document.querySelector('[data-view="today"]')?.click());
  await page.waitForFunction((code) => {
    const row = [...document.querySelectorAll(".hn-muc")].find((node) =>
      node.querySelector(".hn-muc__ma")?.textContent?.trim() === code);
    return [...(row?.querySelectorAll("button") || [])]
      .some((button) => button.textContent?.trim() === "Cập nhật tiến độ");
  }, { timeout: 5_000 }, ACTION_EDIT_CODE);
  actionRightRevoked = true;
  await page.evaluate((code) => {
    const row = [...document.querySelectorAll(".hn-muc")].find((node) =>
      node.querySelector(".hn-muc__ma")?.textContent?.trim() === code);
    [...(row?.querySelectorAll("button") || [])]
      .find((button) => button.textContent?.trim() === "Cập nhật tiến độ")?.click();
  }, ACTION_EDIT_CODE);
  await page.waitForFunction((code) => document.body.innerText.includes(
    `Quyền cập nhật ${code} đã thay đổi; hạng mục không được mở.`
  ), { timeout: 5_000 }, ACTION_EDIT_CODE);
  const wronglyFocused = await page.evaluate((code) =>
    [...document.querySelectorAll("[data-progress-item]")]
      .some((node) => node.getAttribute("data-progress-item") === code), ACTION_EDIT_CODE);
  check(!wronglyFocused, "right bị thu hồi không được focus nhầm ở Tiến độ");

  await page.evaluate(() => document.querySelector('[data-view="today"]')?.click());
  await page.waitForFunction(() => document.querySelectorAll(".hn-muc").length === 461, {
    timeout: 5_000,
  });
  await new Promise((resolve) => setTimeout(resolve, 1_050));
  permissionFailure = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => [...document.querySelectorAll(".lp-state-boundary__title")]
    .some((node) => node.textContent?.includes("Chưa tải được dữ liệu")), { timeout: 5_000 });

  const failedState = await page.evaluate(() => ({
    hasError: [...document.querySelectorAll(".lp-state-boundary__title")]
      .some((node) => node.textContent?.includes("Chưa tải được dữ liệu")),
    hasFalseEmpty: [...document.querySelectorAll(".lp-state-boundary__title")]
      .some((node) => node.textContent?.includes("Không còn việc gấp nào")),
    hasRetry: [...document.querySelectorAll("button")]
      .some((node) => node.textContent?.trim() === "Thử lại"),
  }));
  check(failedState.hasError, "lỗi xác minh quyền phải hiện trạng thái lỗi");
  check(!failedState.hasFalseEmpty, "lỗi xác minh quyền không được báo sai là không còn việc");
  check(failedState.hasRetry, "trạng thái lỗi phải có nút Thử lại");

  check(chanNgoai.length === 0, "E2E không được gọi ra ngoài môi trường cách ly", chanNgoai[0] || "");

  console.log(`Việc hôm nay: ${renderState.rows} mục · chuyển màn ${navDuration}ms · xác minh khi quay lại ${callsAfterReturn} lần · batch rights ${progressRightsCalls} lần`);
} finally {
  await browser.close();
}

assert.equal(failures.length, 0, failures.join("\n"));

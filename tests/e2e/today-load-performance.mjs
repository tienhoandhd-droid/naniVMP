import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, dungHangMuc, nhetPhien } from "./gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const URL_SB = readFileSync(new URL("../../.env.local", import.meta.url).pathname, "utf8")
  .match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();

assert.ok(URL_SB, ".env.local phải có VITE_SUPABASE_URL");

let modeCalls = 0;
let permissionFailure = false;
const largeActivities = Array.from({ length: 461 }, (_, index) => {
  const item = dungHangMuc(index);
  item.ownerPersonId = null;
  item._raw.owner_person_id = null;
  return item;
});

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
      kho.rpc_get_vmp_dashboard = () => ({
        activities: largeActivities,
        objects: kho.vmp_source_objects,
        updated_at: "2026-08-28T01:00:00Z",
      });
      kho.rpc_get_vmp_watermark = {
        year: 2026,
        plan_items: largeActivities.length,
        objects: kho.vmp_source_objects.length,
        updated_at: "2026-08-28T01:00:00Z",
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

  await new Promise((resolve) => setTimeout(resolve, 1_050));
  permissionFailure = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => document.querySelectorAll(".hn-muc").length === 0, { timeout: 5_000 });
  await new Promise((resolve) => setTimeout(resolve, 100));

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

  console.log(`Việc hôm nay: ${renderState.rows} mục · chuyển màn ${navDuration}ms · xác minh khi quay lại ${callsAfterReturn} lần`);
} finally {
  await browser.close();
}

assert.equal(failures.length, 0, failures.join("\n"));

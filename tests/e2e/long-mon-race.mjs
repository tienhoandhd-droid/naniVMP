import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:5199/";
const root = fileURLToPath(new URL("../../", import.meta.url));
const envPath = fileURLToPath(new URL("../../.env.local", import.meta.url));
const assets = new URL("../../dist/assets/", import.meta.url);
const desktopShot = join(tmpdir(), "long-mon-race-1440.png");
const mobileShot = join(tmpdir(), "long-mon-race-390.png");

function expectedBangkokMonths(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const next = new Date(Date.UTC(year, month, 1));
  return [
    `${String(month).padStart(2, "0")}/${year}`,
    `${String(next.getUTCMonth() + 1).padStart(2, "0")}/${next.getUTCFullYear()}`,
  ];
}

function resolvePublicSupabaseUrl() {
  try {
    const env = readFileSync(envPath, "utf8");
    const envUrl = env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
    if (envUrl) return envUrl;
  } catch {
    /* Dùng URL công khai trong bundle nếu local env không đọc được. */
  }

  try {
    for (const name of readdirSync(fileURLToPath(assets))) {
      if (!name.endsWith(".js")) continue;
      const source = readFileSync(fileURLToPath(new URL(name, assets)), "utf8");
      const match = source.match(/https:\/\/(?:[a-z0-9-]+\.supabase\.co|build\.invalid)/i);
      if (match) return match[0];
    }
  } catch {
    /* Thông báo chung ở dưới, không in nội dung cấu hình. */
  }
  return undefined;
}

const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || resolvePublicSupabaseUrl();
if (!supabaseUrl) throw new Error(`Không tìm thấy Supabase URL công khai trong ${root}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error.message || error)));
  await page.evaluateOnNewDocument(() => {
    window.__REACT_GRAB_DISABLED__ = true;
  });
  const { chanNgoai } = await caiGiaLap(page, {
    supabaseUrl,
    kichBan: "day",
    mangNghiemNgat: true,
    previewOrigin: APP_URL,
  });
  await nhetPhien(page, { supabaseUrl });

  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${APP_URL}#v=timeline`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  try {
    await page.waitForSelector(".long-mon-race", { timeout: 15_000 });
  } catch (error) {
    const evidence = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      body: (document.body.textContent ?? "").trim().slice(0, 600),
      storageKeys: Object.keys(localStorage),
    }));
    throw new Error(`Không render Long Môn: ${JSON.stringify({ evidence, browserErrors, chanNgoai })}`, { cause: error });
  }

  const desktop = await page.evaluate(async () => {
    const monthLabels = [...document.querySelectorAll(".long-mon-race__month small")]
      .map((item) => item.textContent?.trim());
    const fish = [...document.querySelectorAll("[data-long-mon-fish]")];
    const fishRows = fish.map((item) => {
      const rect = item.getBoundingClientRect();
      return {
        id: item.dataset.longMonFish,
        deadline: item.dataset.deadline,
        week: item.dataset.week,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    });
    const overlaps = [];
    for (let left = 0; left < fishRows.length; left += 1) {
      for (let right = left + 1; right < fishRows.length; right += 1) {
        const a = fishRows[left];
        const b = fishRows[right];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          overlaps.push(`${fish[left].dataset.longMonFish}/${fish[right].dataset.longMonFish}`);
        }
      }
    }
    const canvasRect = document.querySelector(".long-mon-race__canvas")?.getBoundingClientRect();
    const raceRect = document.querySelector(".long-mon-race")?.getBoundingClientRect();
    const viewport = document.querySelector(".long-mon-race__viewport");
    const clippedFish = fish.filter((item) => {
      if (!canvasRect) return true;
      const rect = item.getBoundingClientRect();
      return rect.left < canvasRect.left - 0.5
        || rect.right > canvasRect.right + 0.5
        || rect.top < canvasRect.top - 0.5
        || rect.bottom > canvasRect.bottom + 0.5;
    }).map((item) => item.getAttribute("aria-label"));
    const background = document.querySelector(".long-mon-race__background");
    const spriteLoaded = await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth > 0);
      image.onerror = () => resolve(false);
      // 31/08: PNG nguồn đã chuyển ra designs/art-goc/ (không deploy nữa) —
      // app chỉ còn tham chiếu .webp, test cũng phải kiểm đúng file đó.
      image.src = "/art/monitoring/long-mon-six-species-v16.webp";
    });
    return {
      monthLabels,
      fishCount: fish.length,
      fishRows,
      overlaps,
      clippedFish,
      weekCount: document.querySelectorAll("[data-long-mon-week]").length,
      audienceControls: document.querySelectorAll("[data-long-mon-audience]").length,
      legendCount: document.querySelectorAll("[data-long-mon-legend]").length,
      backgroundLoaded: background instanceof HTMLImageElement
        && background.complete
        && background.naturalWidth > 0,
      spriteLoaded,
      canvasWidth: canvasRect?.width ?? 0,
      canvasHeight: canvasRect?.height ?? 0,
      raceHeight: raceRect?.height ?? Number.POSITIVE_INFINITY,
      raceRightGap: raceRect ? window.innerWidth - raceRect.right : Number.POSITIVE_INFINITY,
      windowHeight: window.innerHeight,
      viewportVerticalOverflow: viewport ? viewport.scrollHeight - viewport.clientHeight : Number.POSITIVE_INFINITY,
      viewportHorizontalScrollable: viewport ? viewport.scrollWidth > viewport.clientWidth : false,
      densityScale: Number(document.querySelector(".long-mon-race__canvas")?.dataset.densityScale),
      sceneWidth: Number(document.querySelector(".long-mon-race__canvas")?.dataset.sceneWidth),
      sceneHeight: Number(document.querySelector(".long-mon-race__canvas")?.dataset.sceneHeight),
    };
  });

  assert.deepEqual(desktop.monthLabels, expectedBangkokMonths());
  assert.ok(desktop.fishCount > 0, JSON.stringify({ ...desktop, url: page.url() }));
  assert.equal(desktop.legendCount, 6);
  assert.ok(desktop.weekCount >= 9 && desktop.weekCount <= 10,
    `hai tháng lịch phải tạo 9–10 vùng tuần, hiện có ${desktop.weekCount}`);
  assert.equal(desktop.audienceControls, 2);
  assert.equal(desktop.backgroundLoaded, true);
  assert.equal(desktop.spriteLoaded, true);
  assert.deepEqual(desktop.clippedFish, [], `cá bị cắt ở mép: ${desktop.clippedFish.join(", ")}`);
  assert.deepEqual(desktop.overlaps, [], `cá còn xếp chồng: ${desktop.overlaps.join(", ")}`);
  assert.ok(desktop.fishRows.every((fish) => /^\d{4}-\d{2}-\d{2}$/.test(fish.week ?? "")));
  assert.ok(desktop.canvasHeight >= 500 && desktop.canvasHeight <= 680,
    `scene không cố định trong ngưỡng: ${desktop.canvasHeight}px`);
  assert.equal(desktop.sceneWidth, 960);
  assert.ok(desktop.canvasWidth >= desktop.sceneWidth,
    `hồ nhóm chưa đủ dài: canvas=${desktop.canvasWidth}, model=${desktop.sceneWidth}`);
  assert.equal(desktop.viewportHorizontalScrollable, false);
  assert.ok(desktop.raceRightGap <= 2,
    `Ngư đồ chưa mở hết chiều ngang màn hình: còn ${desktop.raceRightGap}px`);
  assert.ok(desktop.canvasHeight >= desktop.sceneHeight,
    `canvas thấp hơn model: canvas=${desktop.canvasHeight}, model=${desktop.sceneHeight}`);
  assert.ok(desktop.raceHeight <= desktop.windowHeight + 2,
    `Ngư đồ cao quá một màn hình: height=${desktop.raceHeight}, viewport=${desktop.windowHeight}`);
  assert.ok(desktop.viewportVerticalOverflow <= 1,
    `scene còn cuộn dọc ${desktop.viewportVerticalOverflow}px`);
  assert.ok(desktop.densityScale >= .44 && desktop.densityScale <= 1.06,
    `tỷ lệ mật độ ngoài ngưỡng: ${desktop.densityScale}`);

  await page.click('[data-long-mon-audience="personal"]');
  await page.waitForSelector("#long-mon-person-select", { timeout: 5_000 });
  const personIds = await page.$$eval("#long-mon-person-select option", (options) =>
    options.map((option) => option.value));
  let personalFishCount = 0;
  for (const personId of personIds) {
    await page.select("#long-mon-person-select", personId);
    await new Promise((resolve) => setTimeout(resolve, 80));
    personalFishCount = await page.$$eval("[data-long-mon-fish]", (fish) => fish.length);
    if (personalFishCount > 0 && personalFishCount < desktop.fishCount) break;
  }
  assert.ok(personalFishCount > 0 && personalFishCount < desktop.fishCount,
    `không tìm thấy QA có cá trong cửa sổ hai tháng: team=${desktop.fishCount}`);
  const personal = await page.evaluate(() => {
    const fish = [...document.querySelectorAll("[data-long-mon-fish]")];
    const fishRows = fish.map((item) => {
      const rect = item.getBoundingClientRect();
      return {
        id: item.dataset.longMonFish,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    });
    const overlaps = [];
    for (let left = 0; left < fishRows.length; left += 1) {
      for (let right = left + 1; right < fishRows.length; right += 1) {
        const a = fishRows[left];
        const b = fishRows[right];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          overlaps.push(`${a.id}/${b.id}`);
        }
      }
    }
    return {
      fishRows,
      overlaps,
      canvasWidth: document.querySelector(".long-mon-race__canvas")?.getBoundingClientRect().width ?? 0,
      canvasHeight: document.querySelector(".long-mon-race__canvas")?.getBoundingClientRect().height ?? 0,
      sceneWidth: Number(document.querySelector(".long-mon-race__canvas")?.dataset.sceneWidth),
      sceneHeight: Number(document.querySelector(".long-mon-race__canvas")?.dataset.sceneHeight),
      verticalOverflow: (() => {
        const viewport = document.querySelector(".long-mon-race__viewport");
        return viewport ? viewport.scrollHeight - viewport.clientHeight : Number.POSITIVE_INFINITY;
      })(),
    };
  });
  assert.ok(personal.fishRows.length > 0 && personal.fishRows.length < desktop.fishCount,
    `lọc cá nhân không đổi đàn cá: team=${desktop.fishCount}, personal=${personal.fishRows.length}`);
  assert.deepEqual(personal.overlaps, [], `cá cá nhân còn xếp chồng: ${personal.overlaps.join(", ")}`);
  assert.equal(personal.sceneWidth, 820);
  assert.equal(personal.sceneHeight, 560);
  assert.ok(personal.sceneWidth < desktop.sceneWidth,
    `mô hình cá nhân chưa tự thu gọn: team=${desktop.sceneWidth}, personal=${personal.sceneWidth}`);
  assert.ok(Math.abs(personal.canvasHeight - desktop.canvasHeight) <= 1,
    `đổi scope làm đổi chiều cao scene: team=${desktop.canvasHeight}, personal=${personal.canvasHeight}`);
  assert.ok(personal.verticalOverflow <= 1, `scope cá nhân còn cuộn dọc ${personal.verticalOverflow}px`);
  const teamById = new Map(desktop.fishRows.map((fish) => [fish.id, fish]));
  assert.ok(personal.fishRows.some((fish) => {
    const teamFish = teamById.get(fish.id);
    return teamFish && (Math.abs(teamFish.left - fish.left) > 1 || Math.abs(teamFish.top - fish.top) > 1);
  }), "scope cá nhân chưa tự dàn lại đàn cá");

  const selectedDeadline = await page.$eval("[data-long-mon-fish]", (item) => item.dataset.deadline);
  await page.click("[data-long-mon-fish]");
  await page.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout: 10_000 });
  const dialogText = await page.$eval('[role="dialog"]', (dialog) => dialog.textContent ?? "");
  assert.match(dialogText, /Chi tiết hạng mục/);
  const [year, month, day] = selectedDeadline.split("-");
  assert.match(dialogText, new RegExp(`${day}/${month}/${year}`));
  await page.click('button[aria-label="Đóng hộp thoại"]');
  await page.click('[data-long-mon-audience="team"]');
  await page.waitForFunction((teamCount) =>
    document.querySelectorAll("[data-long-mon-fish]").length === teamCount,
  { timeout: 5_000 }, desktop.fishCount);
  await page.screenshot({ path: desktopShot, fullPage: true });

  await page.setViewport({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".long-mon-race [data-long-mon-fish]", { timeout: 15_000 });
  const mobile = await page.evaluate(() => {
    const fish = [...document.querySelectorAll("[data-long-mon-fish]")];
    const smallFish = fish.filter((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    });
    const viewport = document.querySelector(".long-mon-race__viewport");
    const today = document.querySelector(".long-mon-race__today");
    const viewportRect = viewport?.getBoundingClientRect();
    const todayRect = today?.getBoundingClientRect();
    const canvas = document.querySelector(".long-mon-race__canvas");
    const fishRows = fish.map((item) => {
      const rect = item.getBoundingClientRect();
      return { id: item.dataset.longMonFish, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    const overlaps = [];
    for (let left = 0; left < fishRows.length; left += 1) {
      for (let right = left + 1; right < fishRows.length; right += 1) {
        const a = fishRows[left];
        const b = fishRows[right];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          overlaps.push(`${a.id}/${b.id}`);
        }
      }
    }
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      internalScrollable: viewport ? viewport.scrollWidth > viewport.clientWidth : false,
      verticalOverflow: viewport ? viewport.scrollHeight - viewport.clientHeight : Number.POSITIVE_INFINITY,
      viewportOverflowY: viewport ? getComputedStyle(viewport).overflowY : "",
      canvasWidth: canvas?.getBoundingClientRect().width ?? 0,
      scrollLeft: viewport?.scrollLeft ?? 0,
      todayVisible: Boolean(
        viewportRect
        && todayRect
        && todayRect.left >= viewportRect.left
        && todayRect.right <= viewportRect.right
      ),
      smallFish: smallFish.map((item) => item.getAttribute("aria-label")),
      overlaps,
    };
  });

  assert.ok(mobile.documentOverflow <= 1, `mobile tràn document ${mobile.documentOverflow}px`);
  assert.equal(mobile.internalScrollable, true);
  assert.equal(mobile.todayVisible, true, `vạch hôm nay bị khuất: ${JSON.stringify(mobile)}`);
  assert.deepEqual(mobile.smallFish, []);
  assert.deepEqual(mobile.overlaps, [], `mobile còn xếp chồng: ${mobile.overlaps.join(", ")}`);
  assert.equal(mobile.viewportOverflowY, "auto",
    `hồ sâu phải cuộn trong Ngư đồ thay vì làm tràn trang: ${JSON.stringify(mobile)}`);
  assert.ok(mobile.canvasWidth >= 960, `hồ nhóm mobile bị nén: ${mobile.canvasWidth}px`);
  assert.deepEqual(chanNgoai, [], "Long Môn không được gọi network ngoài preview/mock");
  const mobileRace = await page.$(".long-mon-race");
  await mobileRace.screenshot({ path: mobileShot });

  console.log("✓ Hai tháng nằm trọn một màn hình desktop, tuần trống co lại và cá không chồng lấn");
  console.log("✓ Admin/Quản lý QA chuyển Cả nhóm/Cá nhân; đàn cá cá nhân tự dàn lại");
  console.log("✓ desktop 1440px không cuộn ngang/dọc; mobile giữ cuộn trong Ngư đồ, không làm tràn trang");
  console.log(`screenshots:\n- ${desktopShot}\n- ${mobileShot}`);
} finally {
  await browser.close();
}

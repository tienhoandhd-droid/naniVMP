import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { LONG_MON_DENSITY_SCENARIOS } from "../fixtures/long-mon-density-fixtures.mjs";
import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:5199/";
const envPath = fileURLToPath(new URL("../../.env.local", import.meta.url));
const assets = new URL("../../dist/assets/", import.meta.url);
const shotDir = join(tmpdir(), "long-mon-density-gallery");
mkdirSync(shotDir, { recursive: true });

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

function fixtureActivities(base, activities, canonical) {
  return activities.map((activity, index) => {
    const deadline = activity.target;
    return {
      ...base,
      ...activity,
      id: activity.id,
      code: activity.code,
      name: activity.name,
      obj: activity.name,
      target: deadline,
      dlVmp: deadline,
      canonicalDeadline: deadline,
      ...(canonical ? {
        canonical_deadline: deadline,
        days_left: 5,
        status_as_of: "2026-09-01",
      } : {}),
      _raw: {
        ...(base?._raw ?? {}),
        ...(activity._raw ?? {}),
        id: activity.id,
        code: activity.code,
        dl_vmp: deadline,
        deadline_vmp: deadline,
        source_row: index + 1,
      },
    };
  });
}

function inspectScene() {
  const canvas = document.querySelector(".long-mon-race__canvas")?.getBoundingClientRect();
  const fish = [...document.querySelectorAll("[data-long-mon-fish]")];
  const rows = fish.map((item) => {
    const rect = item.getBoundingClientRect();
    const body = item.querySelector(".long-mon-race__fish-body");
    const bodyStyle = body ? getComputedStyle(body) : null;
    return {
      id: item.dataset.longMonFish,
      deadline: item.dataset.deadline,
      anchor: Number(item.dataset.anchorX),
      renderX: Number(item.dataset.renderX),
      ownerStart: Number(item.dataset.ownerStart),
      ownerEnd: Number(item.dataset.ownerEnd),
      formation: item.dataset.schoolFormation,
      motion: item.dataset.motionProfile,
      animationName: bodyStyle?.animationName ?? "none",
      animationDuration: bodyStyle?.animationDuration ?? "0s",
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      hitWidth: item.offsetWidth,
      hitHeight: item.offsetHeight,
    };
  });
  const overlaps = [];
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      const a = rows[left];
      const b = rows[right];
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
        overlaps.push(`${a.id}/${b.id}`);
      }
    }
  }
  const clipped = rows.filter((row) => !canvas
    || row.left < canvas.left - .5
    || row.right > canvas.right + .5
    || row.top < canvas.top - .5
    || row.bottom > canvas.bottom + .5).map((row) => row.id);
  return {
    fishCount: rows.length,
    uniqueAnchors: new Set(rows.map((row) => row.anchor)).size,
    uniqueRenderX: new Set(rows.map((row) => row.renderX)).size,
    rows,
    overlaps,
    clipped,
    sceneHeight: Number(document.querySelector(".long-mon-race__canvas")?.dataset.sceneHeight),
  };
}

const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || resolvePublicSupabaseUrl();
if (!supabaseUrl) throw new Error("Không tìm thấy Supabase URL công khai cho E2E gallery");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

const results = [];
try {
  for (const scenario of LONG_MON_DENSITY_SCENARIOS) {
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
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
        suaKho(kho) {
          const rawBase = kho.rpc_get_vmp_dashboard.activities[0];
          const canonicalBase = kho.rpc_get_vmp_dashboard_v2.activities[0];
          kho.rpc_get_vmp_dashboard.activities = fixtureActivities(
            rawBase,
            scenario.activities,
            false,
          );
          kho.rpc_get_vmp_dashboard_v2.activities = fixtureActivities(
            canonicalBase,
            scenario.activities,
            true,
          );
        },
      });
      await nhetPhien(page, { supabaseUrl });
      await page.setViewport({ width: 1440, height: 1000 });
      await page.goto(`${APP_URL}#v=timeline`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForFunction((expected) =>
        document.querySelectorAll("[data-long-mon-fish]").length === expected,
      { timeout: 20_000 }, scenario.expectedCount);

      const dense = await page.evaluate(inspectScene);
      assert.equal(dense.fishCount, scenario.expectedCount, scenario.label);
      assert.deepEqual(dense.overlaps, [], `${scenario.label}: nút cá chồng nhau`);
      assert.deepEqual(dense.clipped, [], `${scenario.label}: cá bị cắt khỏi canvas`);
      const smallTargets = dense.rows
        .filter((row) => row.hitWidth < 44 || row.hitHeight < 44)
        .map(({ id, hitWidth, hitHeight, formation }) => ({ id, hitWidth, hitHeight, formation }));
      assert.deepEqual(smallTargets, [],
        `${scenario.label}: hit target nhỏ hơn 44×44px ${JSON.stringify(smallTargets.slice(0, 5))}`);
      assert.ok(dense.rows.every((row) => row.renderX >= row.ownerStart && row.renderX <= row.ownerEnd),
        `${scenario.label}: cá vượt vùng deadline`);
      assert.ok(dense.rows.every((row) => row.animationName !== "none"
        && Number.parseFloat(row.animationDuration) >= 5.2
        && Number.parseFloat(row.animationDuration) <= 10.5),
      `${scenario.label}: nhịp bơi ngoài hợp đồng`);
      assert.ok(dense.sceneHeight >= 560 && dense.sceneHeight <= 2240,
        `${scenario.label}: chiều sâu ${dense.sceneHeight}px ngoài ngưỡng`);
      if (scenario.expectedFormation) {
        assert.ok(dense.rows.every((row) => row.formation === scenario.expectedFormation),
          `${scenario.label}: sai họ đội hình`);
        assert.equal(dense.uniqueAnchors, 1, `${scenario.label}: cùng deadline phải chung neo`);
        if (scenario.expectedCount > 1) {
          assert.ok(dense.uniqueRenderX > 1, `${scenario.label}: đàn không có biến thiên ngang`);
        }
      }

      const desktopPath = join(shotDir, `${scenario.id}-desktop.png`);
      await page.screenshot({ path: desktopPath, fullPage: true });
      let mobilePath = null;
      let todayVisibleOnMobile = null;
      if (scenario.id === "same-40") {
        await page.setViewport({ width: 390, height: 844 });
        await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForFunction((expected) =>
          document.querySelectorAll("[data-long-mon-fish]").length === expected,
        { timeout: 20_000 }, scenario.expectedCount);
        todayVisibleOnMobile = await page.evaluate(() => {
          const viewport = document.querySelector(".long-mon-race__viewport")?.getBoundingClientRect();
          const today = document.querySelector(".long-mon-race__today")?.getBoundingClientRect();
          return Boolean(viewport && today && today.left >= viewport.left && today.right <= viewport.right);
        });
        assert.equal(todayVisibleOnMobile, true, "40 cá mobile phải tự căn Hôm nay");
        mobilePath = join(shotDir, "same-40-mobile.png");
        await page.screenshot({ path: mobilePath, fullPage: true });
      }

      assert.deepEqual(browserErrors, [], `${scenario.label}: browser error`);
      assert.deepEqual(chanNgoai, [], `${scenario.label}: có request ra ngoài mock`);
      results.push({
        id: scenario.id,
        fishCount: dense.fishCount,
        uniqueAnchors: dense.uniqueAnchors,
        uniqueRenderX: dense.uniqueRenderX,
        sceneHeight: dense.sceneHeight,
        desktopPath,
        mobilePath,
        todayVisibleOnMobile,
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, shotDir, scenarios: results }, null, 2));

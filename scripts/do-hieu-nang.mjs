/* Đo hiệu năng bản build production qua preview + mock Supabase.
 * Chạy trực tiếp để in lab; `--check` biến số đo bảy route thành CI gate. */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME } from "../tests/e2e/chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "../tests/e2e/gia-lap-supabase.mjs";

export const DESKTOP_RUNTIME_LIMITS = {
  primaryActionableMs: 2_500,
  skeletonAppearanceMs: 100,
  maxLongTaskMs: 50,
  domWarningNodes: 1_500,
};
export const DESKTOP_SKELETON_SELECTOR = "[data-desktop-skeleton]";

/* Chỉ đo các route desktop có ngân sách riêng. Timeline/Long Môn nằm ngoài
 * phạm vi Task 6 nên không được điều hướng hay đo trong lab này. */
export const DESKTOP_PERFORMANCE_SCREENS = [
  "reports", "alerts", "progress", "source", "workload", "rules", "phanquyen",
];

/* Mỗi route phải chỉ rõ tín hiệu sẵn sàng của chính nội dung route. Không
 * dùng selector shell chung: một shell hiện ra không có nghĩa là thao tác
 * chính của màn đó đã sẵn sàng. */
export const DESKTOP_PRIMARY_ACTIONABLE_SELECTORS = Object.freeze({
  reports: "[data-desktop-primary-actionable]",
  alerts: "[data-desktop-primary-actionable]",
  progress: ".pr-nut-chinh:not([disabled])",
  source: "[data-desktop-primary-actionable]",
  workload: "[data-desktop-primary-actionable]",
  rules: "[data-desktop-primary-actionable]",
  phanquyen: "[data-desktop-primary-actionable]",
});

const OPTIONAL_REPORT_CHUNK = /(?:VmpSpace3D|VmpSpace3DCanvas|BanDoNhiet|exceljs)/i;

export function runtimeGateScreens() {
  return [...DESKTOP_PERFORMANCE_SCREENS];
}

export function desktopRuntimeRouteContract(screen) {
  const primarySelector = DESKTOP_PRIMARY_ACTIONABLE_SELECTORS[screen];
  if (!primarySelector) throw new Error(`Không có runtime readiness contract cho route ${screen}`);
  return { primarySelector, requireSkeletonAppearance: true };
}

export function recordRouteSkeletonAppearance(clock, now, markerPresent) {
  if (markerPresent && clock.routeIntentAt != null && clock.skeletonAppearanceMs == null) {
    clock.skeletonAppearanceMs = now - clock.routeIntentAt;
  }
}

export function assertDesktopRuntimeBudget(
  screen,
  metrics,
  warn = console.warn,
  { requirePrimaryAction = true, requireSkeletonAppearance = false } = {},
) {
  const failures = [];
  if (requirePrimaryAction && (metrics.primaryActionableMs == null
    || metrics.primaryActionableMs > DESKTOP_RUNTIME_LIMITS.primaryActionableMs)) {
    failures.push(`${screen}: primary actionable ${metrics.primaryActionableMs}ms vượt ${DESKTOP_RUNTIME_LIMITS.primaryActionableMs}ms`);
  }
  if (requireSkeletonAppearance && metrics.skeletonAppearanceMs == null) {
    failures.push(`${screen}: skeleton transition marker không xuất hiện`);
  } else if (metrics.skeletonAppearanceMs != null && metrics.skeletonAppearanceMs > DESKTOP_RUNTIME_LIMITS.skeletonAppearanceMs) {
    failures.push(`${screen}: skeleton xuất hiện ${metrics.skeletonAppearanceMs}ms vượt ${DESKTOP_RUNTIME_LIMITS.skeletonAppearanceMs}ms`);
  }
  if (metrics.maxLongTaskMs > DESKTOP_RUNTIME_LIMITS.maxLongTaskMs) {
    failures.push(`${screen}: long task ${metrics.maxLongTaskMs}ms vượt ${DESKTOP_RUNTIME_LIMITS.maxLongTaskMs}ms`);
  }
  for (const chunk of metrics.optionalChunksBeforeAction ?? []) {
    failures.push(`${screen}: optional chunk tải trước hành động ${chunk}`);
  }
  if (metrics.domNodes > DESKTOP_RUNTIME_LIMITS.domWarningNodes) {
    warn(`${screen}: DOM ${metrics.domNodes} vượt ngưỡng cảnh báo ${DESKTOP_RUNTIME_LIMITS.domWarningNodes}`);
  }
  if (failures.length) throw new Error(failures.join("\n"));
}

function docSupabaseUrl() {
  const env = readFileSync(fileURLToPath(new URL("../.env.local", import.meta.url)), "utf8");
  const url = env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
  if (!url) throw new Error(".env.local thiếu VITE_SUPABASE_URL cho runtime performance gate");
  return url;
}

function installPerformanceObservers(page, primarySelector) {
  return page.evaluateOnNewDocument((skeletonSelector, routePrimarySelector) => {
    const state = {
      primaryActionableMs: null,
      routeIntentAt: null,
      skeletonAppearanceMs: null,
      maxLongTaskMs: 0,
    };
    window.__vmpDesktopPerformance = state;
    window.__vmpStartRouteSkeletonClock = () => {
      state.routeIntentAt = performance.now();
      state.skeletonAppearanceMs = null;
    };
    const observe = () => {
      const now = performance.now();
      if (state.primaryActionableMs == null && document.querySelector(routePrimarySelector)) {
        state.primaryActionableMs = now;
      }
      if (document.querySelector(skeletonSelector)
        && state.routeIntentAt != null && state.skeletonAppearanceMs == null) {
        state.skeletonAppearanceMs = now - state.routeIntentAt;
      }
    };
    new MutationObserver(observe).observe(document, { childList: true, subtree: true });
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        state.maxLongTaskMs = Math.max(state.maxLongTaskMs, entry.duration);
      }
    }).observe({ type: "longtask", buffered: true });
    document.addEventListener("DOMContentLoaded", observe, { once: true });
  }, DESKTOP_SKELETON_SELECTOR, primarySelector);
}

async function disableHttpCache(page) {
  const session = await page.target().createCDPSession();
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  return session;
}

async function waitForRouteSettle(page, primarySelector) {
  try {
    await page.waitForFunction(
      (selector) => document.querySelector(selector) != null,
      { timeout: DESKTOP_RUNTIME_LIMITS.primaryActionableMs + 100 },
      primarySelector,
    );
  } catch {
    // The metric below turns this into the same clear budget message.
  }
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 45_000 });
}

async function measureScreen(browser, { screen, origin, supabaseUrl, enforce }) {
  const page = await browser.newPage();
  try {
    const contract = desktopRuntimeRouteContract(screen);
    await installPerformanceObservers(page, contract.primarySelector);
    await disableHttpCache(page);
    await caiGiaLap(page, { supabaseUrl, kichBan: "day" });
    await nhetPhien(page, { supabaseUrl });
    await page.setViewport({ width: 1366, height: 768 });
    const t0 = Date.now();
    await page.goto(`${origin}#v=${screen}`, { waitUntil: "domcontentloaded", timeout: 30_000 });

    await waitForRouteSettle(page, contract.primarySelector);

    const wall = Date.now() - t0;
    const metrics = await page.evaluate(() => {
      const state = window.__vmpDesktopPerformance;
      const resources = performance.getEntriesByType("resource");
      const navigation = performance.getEntriesByType("navigation")[0];
      const top = resources
        .map((resource) => ({
          n: resource.name.split("/").pop().slice(0, 44),
          kb: Math.round((resource.transferSize || resource.encodedBodySize || 0) / 1024),
        }))
        .sort((left, right) => right.kb - left.kb).slice(0, 4);
      return {
        dcl: Math.round(navigation?.domContentLoadedEventEnd || 0),
        tongKB: Math.round(resources.reduce(
          (sum, resource) => sum + (resource.transferSize || resource.encodedBodySize || 0), 0,
        ) / 1024),
        soRes: resources.length,
        domNodes: document.querySelectorAll("*").length,
        primaryActionableMs: state?.primaryActionableMs == null
          ? DESKTOP_RUNTIME_LIMITS.primaryActionableMs + 1
          : Math.round(state.primaryActionableMs),
        skeletonAppearanceMs: state?.skeletonAppearanceMs == null
          ? null
          : Math.round(state.skeletonAppearanceMs),
        maxLongTaskMs: Math.round(state?.maxLongTaskMs || 0),
        optionalChunksBeforeAction: screen === "reports" ? resources
          .map((resource) => resource.name.split("/").pop())
          .filter((name) => OPTIONAL_REPORT_CHUNK.test(name)) : [],
        top,
      };
    });
    if (enforce) {
      assertDesktopRuntimeBudget(screen, metrics, console.warn);
    }
    return { screen, wall, ...metrics };
  } finally {
    await page.close();
  }
}

async function measureRouteSkeletonAppearance(browser, { screen, origin, supabaseUrl }) {
  const page = await browser.newPage();
  try {
    const contract = desktopRuntimeRouteContract(screen);
    await installPerformanceObservers(page, contract.primarySelector);
    const session = await disableHttpCache(page);
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 80,
      downloadThroughput: 125_000,
      uploadThroughput: 62_500,
      connectionType: "cellular3g",
    });
    await caiGiaLap(page, { supabaseUrl, kichBan: "day" });
    await nhetPhien(page, { supabaseUrl });
    await page.setViewport({ width: 1366, height: 768 });
    await page.goto(`${origin}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 45_000 });
    await page.evaluate((target) => {
      window.__vmpStartRouteSkeletonClock?.();
      const routeButton = document.querySelector(`[data-view="${target}"]`);
      if (routeButton instanceof HTMLButtonElement) {
        routeButton.click();
      } else {
        location.hash = `#v=${target}`;
      }
    }, screen);
    await waitForRouteSettle(page, contract.primarySelector);
    return page.evaluate(() => {
      const state = window.__vmpDesktopPerformance;
      return state?.skeletonAppearanceMs == null ? null : Math.round(state.skeletonAppearanceMs);
    });
  } finally {
    await page.close();
  }
}

export async function runDesktopPerformance({
  enforce = false,
  origin = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/",
  screens = enforce ? runtimeGateScreens() : DESKTOP_PERFORMANCE_SCREENS,
} = {}) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new", args: ["--no-sandbox"],
  });
  try {
    const supabaseUrl = docSupabaseUrl();
    const results = [];
    for (const screen of screens) {
      const result = await measureScreen(browser, { screen, origin, supabaseUrl, enforce });
      if (enforce) {
        const contract = desktopRuntimeRouteContract(screen);
        result.skeletonAppearanceMs = await measureRouteSkeletonAppearance(
          browser, { screen, origin, supabaseUrl },
        );
        assertDesktopRuntimeBudget(screen, result, console.warn, {
          requirePrimaryAction: false,
          requireSkeletonAppearance: contract.requireSkeletonAppearance,
        });
      }
      results.push(result);
      console.log(`${screen.padEnd(9)} wall=${result.wall}ms dcl=${result.dcl}ms tai=${result.tongKB}KB/${result.soRes}res dom=${result.domNodes} primary=${result.primaryActionableMs}ms skeleton=${result.skeletonAppearanceMs ?? "n/a"}ms long=${result.maxLongTaskMs}ms`);
      console.log(`          top: ${result.top.map((item) => `${item.n}=${item.kb}KB`).join(" · ")}`);
    }
    return results;
  } finally {
    await browser.close();
  }
}

function isDirectInvocation() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectInvocation()) {
  const enforce = process.argv.includes("--check");
  try {
    await runDesktopPerformance({ enforce });
  } catch (error) {
    console.error(`[perf runtime] ${error.message}`);
    process.exitCode = 1;
  }
}

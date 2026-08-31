import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const requestedCase = process.argv.includes("--case")
  ? process.argv[process.argv.indexOf("--case") + 1]
  : undefined;
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || (() => {
  try {
    const env = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
    return env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
  } catch {
    const assets = new URL("../../dist/assets/", import.meta.url);
    for (const name of readdirSync(fileURLToPath(assets))) {
      if (!name.endsWith(".js")) continue;
      const match = readFileSync(fileURLToPath(new URL(name, assets)), "utf8")
        .match(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
      if (match) return match[0];
    }
    return undefined;
  }
})();

if (!supabaseUrl) throw new Error("Không tìm thấy Supabase URL công khai cho desktop UX audit");
if (requestedCase && !["foundation", "interactions", "semantics"].includes(requestedCase)) {
  throw new Error(`Không có desktop UX audit case: ${requestedCase}`);
}

const channel = (value) => {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};
const luminance = ([red, green, blue]) => 0.2126 * channel(red)
  + 0.7152 * channel(green) + 0.0722 * channel(blue);
const contrast = (foreground, background) => {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
};
const rgb = (value) => {
  const parts = value.match(/[\d.]+/g)?.map(Number);
  if (!parts || parts.length < 3) throw new Error(`Không đọc được màu: ${value}`);
  const multiplier = value.startsWith("color(") ? 255 : 1;
  return parts.slice(0, 3).map((part) => part * multiplier);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage();
  await caiGiaLap(page, { supabaseUrl, kichBan: "day", previewOrigin: APP_URL });
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1440, height: 1000 });

  if (!requestedCase || requestedCase === "foundation") {
  await page.goto(`${APP_URL}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".monitoring-journey__item.is-active", { timeout: 15_000 });
  const overview = await page.evaluate(() => {
    const toRgb = (value) => {
      const parts = value.match(/[\d.]+/g)?.map(Number);
      if (!parts || parts.length < 3) throw new Error(`Không đọc được màu: ${value}`);
      const multiplier = value.startsWith("color(") ? 255 : 1;
      return parts.slice(0, 3).map((part) => part * multiplier);
    };
    const opaqueBackground = (element) => {
      let node = element;
      const layers = [];
      while (node) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== "none") throw new Error(`Nền gradient không đo được: ${node.className}`);
        const parts = style.backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
        if (parts.length >= 3) {
          const multiplier = style.backgroundColor.startsWith("color(") ? 255 : 1;
          const alpha = parts[3] ?? 1;
          layers.unshift([parts[0] * multiplier, parts[1] * multiplier, parts[2] * multiplier, alpha]);
          if (alpha >= 0.999) break;
        }
        node = node.parentElement;
      }
      return layers.reduce((background, [red, green, blue, alpha]) => [
        red * alpha + background[0] * (1 - alpha),
        green * alpha + background[1] * (1 - alpha),
        blue * alpha + background[2] * (1 - alpha),
      ], [255, 255, 255]);
    };
    const activeMetric = document.querySelector(".monitoring-journey__item.is-active .monitoring-journey__metric > strong");
    const masthead = document.querySelector(".vmp-masthead__phu");
    const journeyLabel = document.querySelector(".monitoring-journey__item.is-active .monitoring-journey__copy > span");
    if (!activeMetric || !masthead || !journeyLabel) throw new Error("Thiếu phần tử kiểm tra trên Tổng quan");
    return {
      activeMetric: {
        color: toRgb(getComputedStyle(activeMetric).color),
        backgroundColor: opaqueBackground(activeMetric),
      },
      masthead: { fontSize: getComputedStyle(masthead).fontSize },
      journeyLabel: { fontSize: getComputedStyle(journeyLabel).fontSize },
    };
  });
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  const darkActiveMetric = await page.$eval(
    ".monitoring-journey__item.is-active .monitoring-journey__metric > strong",
    (element) => ({
      color: getComputedStyle(element).color,
      backgroundColor: getComputedStyle(element.closest(".monitoring-journey__item")).backgroundColor,
    }),
  );
  await page.evaluate(() => { delete document.documentElement.dataset.theme; });

  await page.goto(`${APP_URL}#v=alerts`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".alerts-command__actions button", { timeout: 15_000 });
  const alertCta = await page.$eval(".alerts-command__actions button", (element) => ({
    color: getComputedStyle(element).color,
    backgroundColor: getComputedStyle(element).backgroundColor,
  }));

  await page.goto(`${APP_URL}#v=accounts`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector('.reg-flag[data-on="true"]', { timeout: 15_000 });
  const permissionFlag = await page.$eval('.reg-flag[data-on="true"]', (element) => {
    const toRgb = (value) => {
      const parts = value.match(/[\d.]+/g)?.map(Number);
      if (!parts || parts.length < 3) throw new Error(`Không đọc được màu: ${value}`);
      const multiplier = value.startsWith("color(") ? 255 : 1;
      return parts.slice(0, 3).map((part) => part * multiplier);
    };
    const style = getComputedStyle(element);
    const layers = [];
    let node = element;
    while (node) {
      const nodeStyle = getComputedStyle(node);
      const parts = nodeStyle.backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
      if (parts.length >= 3) {
        const multiplier = nodeStyle.backgroundColor.startsWith("color(") ? 255 : 1;
        const alpha = parts[3] ?? 1;
        layers.unshift([parts[0] * multiplier, parts[1] * multiplier, parts[2] * multiplier, alpha]);
        if (alpha >= 0.999) break;
      }
      node = node.parentElement;
    }
    const backgroundColor = layers.reduce((background, [red, green, blue, alpha]) => [
      red * alpha + background[0] * (1 - alpha),
      green * alpha + background[1] * (1 - alpha),
      blue * alpha + background[2] * (1 - alpha),
    ], [255, 255, 255]);
    return { color: toRgb(style.color), backgroundColor };
  });

  await page.goto(`${APP_URL}#v=reports`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector('a[href="#v=health"]', { timeout: 15_000 });
  const reportLink = await page.$eval('a[href="#v=health"]', (element) => ({
    height: element.getBoundingClientRect().height,
  }));
  const control = await page.$("select");
  if (!control) throw new Error("Thiếu native control để kiểm tra focus");
  await control.focus();
  const outlineStyle = await control.evaluate((element) => getComputedStyle(element).outlineStyle);

  await page.goto(`${APP_URL}#v=workload`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector('a[href="#v=alerts"]', { timeout: 15_000 });
  const workloadLink = await page.$eval('a[href="#v=alerts"]', (element) => ({
    height: element.getBoundingClientRect().height,
  }));

  assert.ok(contrast(overview.activeMetric.color, overview.activeMetric.backgroundColor) >= 4.5);
  assert.ok(contrast(rgb(darkActiveMetric.color), rgb(darkActiveMetric.backgroundColor)) >= 4.5);
  assert.ok(contrast(
    rgb(alertCta.color),
    rgb(alertCta.backgroundColor),
  ) >= 4.5);
  assert.ok(contrast(permissionFlag.color, permissionFlag.backgroundColor) >= 4.5);
  assert.ok(Number.parseFloat(overview.masthead.fontSize) >= 12);
  assert.ok(Number.parseFloat(overview.journeyLabel.fontSize) >= 12);
  assert.ok(reportLink.height >= 32 && workloadLink.height >= 32);
  assert.notEqual(outlineStyle, "none");

  await page.setViewport({ width: 768, height: 1000 });
  await page.goto(`${APP_URL}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".monitoring-journey__item.is-active", { timeout: 15_000 });
  const mobileTypography = await page.evaluate(() => {
    const masthead = document.querySelector(".vmp-masthead__phu");
    const active = document.querySelector(".monitoring-journey__item.is-active");
    const journeyDescription = active?.querySelector(".monitoring-journey__copy > span");
    const journeyMetricLabel = active?.querySelector(".monitoring-journey__metric > span");
    const journeyCurrent = active?.querySelector(".monitoring-journey__current");
    if (!masthead || !journeyDescription || !journeyMetricLabel || !journeyCurrent) {
      throw new Error("Thiếu typography kiểm tra ở viewport mobile");
    }
    return {
      masthead: getComputedStyle(masthead).fontSize,
      journeyDescription: getComputedStyle(journeyDescription).fontSize,
      journeyMetricLabel: getComputedStyle(journeyMetricLabel).fontSize,
      journeyCurrent: getComputedStyle(journeyCurrent).fontSize,
    };
  });
  assert.deepEqual(mobileTypography, {
    masthead: "11px",
    journeyDescription: "11px",
    journeyMetricLabel: "11px",
    journeyCurrent: "10px",
  });

  console.log("✓ foundation desktop UX audit đạt tương phản, focus và khả năng đọc");
  }

  if (!requestedCase || requestedCase === "interactions") {
    await page.goto(`${APP_URL}#v=rules`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(
      () => [...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Chấm lại")),
      { timeout: 15_000 },
    );
    await page.evaluate(() => {
      window.__vmpNativeConfirmCalls = 0;
      window.confirm = () => {
        window.__vmpNativeConfirmCalls += 1;
        return false;
      };
    });
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")]
        .find((element) => element.textContent?.includes("Chấm lại"));
      if (!button) throw new Error("Không tìm thấy nút Chấm lại");
      button.click();
    });
    await page.waitForFunction(
      () => window.__vmpNativeConfirmCalls > 0 || Boolean(document.querySelector('[role="dialog"]')),
      { timeout: 5_000 },
    );

    const nativeConfirmCalls = await page.evaluate(() => window.__vmpNativeConfirmCalls);
    assert.equal(nativeConfirmCalls, 0, "Chấm lại must not invoke window.confirm");
    const dialog = await page.$eval('[role="dialog"]', (element) => {
      const titleId = element.getAttribute("aria-labelledby");
      return {
        title: titleId ? document.getElementById(titleId)?.textContent : "",
        description: element.textContent,
      };
    });
    assert.match(dialog.title || "", /Chấm lại điểm trọng yếu/);
    assert.match(dialog.description || "", /CHƯA được QA chốt tay/);
    let recalcRequests = 0;
    const countRecalcRequest = (request) => {
      if (request.url().includes("/rpc/rpc_recalc_criticality") && request.method() !== "OPTIONS") {
        recalcRequests += 1;
      }
    };
    page.on("request", countRecalcRequest);
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const confirm = dialog && [...dialog.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Chấm lại");
      if (!confirm) throw new Error("Không tìm thấy nút xác nhận Chấm lại");
      confirm.click();
      confirm.click();
    });
    await page.waitForFunction(
      () => document.querySelector('[role="alert"]')?.textContent?.includes("Chấm lại chưa hoàn tất"),
      { timeout: 5_000 },
    );
    page.off("request", countRecalcRequest);
    assert.equal(recalcRequests, 1, "two synchronous confirms must start one recalculation only");
    console.log("✓ interactions desktop UX audit mở xác nhận trong ứng dụng");
  }

  if (!requestedCase || requestedCase === "semantics") {
    for (const route of ["overview", "inventory"]) {
      await page.goto(`${APP_URL}#v=${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForSelector("h1", { timeout: 15_000 });
      await page.waitForSelector("h2", { timeout: 15_000 });
      const headings = await page.evaluate(() => ({
        h1: document.querySelectorAll("h1").length,
        h2: [...document.querySelectorAll("h2")]
          .filter((element) => {
            const style = getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
          })
          .map((element) => element.textContent?.trim()),
      }));
      assert.equal(headings.h1, 1, `${route} must expose one route h1`);
      assert.ok(headings.h2.length > 0, `${route} must expose a discoverable h2 section heading`);
    }
    console.log("✓ semantics desktop UX audit exposes route heading hierarchy");
  }
} finally {
  await browser.close();
}

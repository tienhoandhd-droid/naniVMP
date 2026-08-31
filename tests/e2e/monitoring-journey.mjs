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
const screenshotPaths = {
  overview: join(tmpdir(), "monitoring-overview-1440.png"),
  timeline: join(tmpdir(), "monitoring-timeline-1024.png"),
  alerts: join(tmpdir(), "monitoring-alerts-390.png"),
};

async function clickButtonByText(page, text) {
  const clicked = await page.$$eval("button", (buttons, expected) => {
    const button = buttons.find((item) => item.textContent?.includes(expected));
    button?.click();
    return Boolean(button);
  }, text);
  assert.equal(clicked, true, `missing button: ${text}`);
}

async function buttonsContaining(page, root, text) {
  return page.$$eval(`${root} button`, (buttons, expected) =>
    buttons.filter((item) => item.textContent?.includes(expected)).length, text);
}

async function assertCurrentJourneyVisible(page, context) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  const evidence = await page.evaluate(() => {
    const rail = document.querySelector(".monitoring-journey__rail");
    const current = rail?.querySelector('[aria-current="page"]');
    const railRect = rail?.getBoundingClientRect();
    const currentRect = current?.getBoundingClientRect();
    return {
      rail: railRect ? {
        left: railRect.left,
        right: railRect.right,
        clientWidth: rail.clientWidth,
        scrollWidth: rail.scrollWidth,
        scrollLeft: rail.scrollLeft,
      } : null,
      current: currentRect ? {
        left: currentRect.left,
        right: currentRect.right,
        width: currentRect.width,
        label: current.textContent?.trim() ?? "",
      } : null,
      fullyVisible: Boolean(
        railRect
        && currentRect
        && currentRect.left >= railRect.left - 1
        && currentRect.right <= railRect.right + 1
      ),
    };
  });

  assert.ok(evidence.rail, `${context} thiếu rail: ${JSON.stringify(evidence)}`);
  assert.ok(evidence.current, `${context} thiếu thẻ hiện tại: ${JSON.stringify(evidence)}`);
  assert.ok(
    evidence.rail.scrollWidth > evidence.rail.clientWidth + 1,
    `${context} không tạo overflow thật: ${JSON.stringify(evidence)}`,
  );
  assert.equal(
    evidence.fullyVisible,
    true,
    `${context} thẻ hiện tại bị khuất: ${JSON.stringify(evidence)}`,
  );
  return evidence;
}

async function assertMobileLayout(page, view) {
  await page.goto(`${APP_URL}#v=${view}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".monitoring-journey", { timeout: 15_000 });
  const readiness = {
    overview: { label: "Tổng quan VMP", root: ".b-hero" },
    timeline: { label: "Dòng thời gian", root: ".timeline-page-shell .long-mon-view-switch" },
    alerts: { label: "Cảnh báo & ưu tiên", root: ".alerts-page-shell .alerts-priority-rail" },
  }[view];
  assert.ok(readiness, `mobile view không được hỗ trợ: ${view}`);
  await page.waitForSelector(readiness.root, { visible: true, timeout: 15_000 });
  const destination = await page.evaluate(() => ({
    hash: location.hash,
    hashView: new URLSearchParams(location.hash.slice(1)).get("v") ?? "overview",
    currentLabel: document.querySelector('.monitoring-journey button[aria-current="page"]')
      ?.textContent?.trim() ?? "",
  }));
  assert.equal(destination.hashView, view, `${view} sai hash: ${destination.hash}`);
  assert.ok(destination.currentLabel.includes(readiness.label),
    `${view} sai nav hiện tại: ${destination.currentLabel}`);
  const journeyVisibility = await assertCurrentJourneyVisible(page, `${view} mobile 390px`);

  const mobile = await page.evaluate(() => {
    const isRendered = (element) => {
      const rect = element.getBoundingClientRect();
      return element.getClientRects().length > 0 && rect.width > 0 && rect.height > 0;
    };
    const visibleTargets = [...document.querySelectorAll(
      ".monitoring-journey button, .alerts-priority-rail button, .alerts-command button, .alerts-command a, details.alerts-tools > summary",
    )].filter(isRendered);
    const alertPriorityTargets = [...document.querySelectorAll(".alerts-priority-rail > button")];
    const alertToolsSummaries = [...document.querySelectorAll("details.alerts-tools > summary")];
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      journeyTargets: document.querySelectorAll(".monitoring-journey button").length,
      alertPriorityTargets: alertPriorityTargets.length,
      visibleAlertPriorityTargets: alertPriorityTargets.filter(isRendered).length,
      alertToolsSummaries: alertToolsSummaries.length,
      visibleAlertToolsSummaries: alertToolsSummaries.filter(isRendered).length,
      alertCommandHeroes: document.querySelectorAll(".alerts-command__hero").length,
      alertManagementSections: document.querySelectorAll(".alerts-management").length,
      smallTargets: visibleTargets
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            text: element.textContent?.trim() ?? "",
            width: rect.width,
            height: rect.height,
          };
        })
        .filter((target) => target.width < 43.5 || target.height < 43.5),
    };
  });

  assert.ok(mobile.overflow <= 1, `${view} horizontal overflow: ${mobile.overflow}px`);
  assert.ok(mobile.journeyTargets >= 3, `${view} thiếu control Monitoring Journey`);
  if (view === "alerts") {
    assert.equal(mobile.alertPriorityTargets, 4, "Alerts mobile phải có đủ bốn tín hiệu");
    assert.equal(mobile.visibleAlertPriorityTargets, 4, "Bốn tín hiệu Alerts mobile phải đang hiển thị");
    assert.equal(mobile.alertCommandHeroes, 1, "Alerts mobile phải có điểm nóng số 1");
    assert.equal(mobile.alertManagementSections, 1, "Alerts mobile phải có góc nhìn quản lý");
    assert.equal(mobile.alertToolsSummaries, 1, "Alerts mobile phải có summary công cụ");
    assert.equal(mobile.visibleAlertToolsSummaries, 1, "Summary công cụ Alerts mobile phải đang hiển thị");
  }
  assert.deepEqual(mobile.smallTargets, [], `${view} có control nhỏ hơn 43.5px`);
  return journeyVisibility;
}

function resolvePublicSupabaseUrl({
  readEnv = () => readFileSync(envPath, "utf8"),
  readAssetNames = () => readdirSync(fileURLToPath(assets)),
  readAsset = (name) => readFileSync(fileURLToPath(new URL(name, assets)), "utf8"),
} = {}) {
  try {
    const env = readEnv();
    const envUrl = env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
    if (envUrl) return envUrl;
  } catch {
    /* Nếu không đọc được env, tiếp tục thử URL công khai đã đóng gói. */
  }

  try {
    for (const name of readAssetNames()) {
      if (!name.endsWith(".js")) continue;
      const match = readAsset(name).match(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
      if (match) return match[0];
    }
  } catch {
    /* Lỗi đọc bundle được quy về thông báo chung bên dưới, không lộ nội dung. */
  }

  return undefined;
}

assert.equal(resolvePublicSupabaseUrl({
  readEnv: () => "VITE_OTHER_VALUE=available",
  readAssetNames: () => ["app.js"],
  readAsset: () => "const endpoint = 'https://fallback-fixture.supabase.co'",
}), "https://fallback-fixture.supabase.co");

const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || resolvePublicSupabaseUrl();
if (!supabaseUrl) throw new Error(`Không tìm thấy Supabase URL công khai trong ${root}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage();
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
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".monitoring-journey", { timeout: 15_000 });
  await page.waitForSelector(".b-hero", { timeout: 15_000 });

  const overview = await page.evaluate(() => {
    const hero = document.querySelector(".b-hero");
    const first = document.querySelector(".b-k1");
    const second = document.querySelector(".b-k2");
    const quality = document.querySelector(".b-k4");
    return {
      heroTop: hero?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
      firstTop: first?.getBoundingClientRect().top ?? Number.NEGATIVE_INFINITY,
      firstText: first?.textContent ?? "",
      secondText: second?.textContent ?? "",
      qualityText: quality?.textContent ?? "",
      duplicateCompletionCards: document.querySelectorAll(".b-k3").length,
    };
  });

  assert.ok(overview.heroTop < overview.firstTop, JSON.stringify(overview));
  assert.match(overview.firstText, /Trễ đích VMP/);
  assert.match(overview.secondText, /Tới hạn đích VMP 30 ngày/);
  assert.equal(overview.duplicateCompletionCards, 0);
  const qualityCount = overview.qualityText.match(/Vấn đề dữ liệu(\d+)/)?.[1];
  assert.ok(qualityCount, `Không đọc được số Vấn đề dữ liệu: ${overview.qualityText}`);
  assert.ok(Number(qualityCount) > 0, `Fixture phải có vấn đề dữ liệu: ${overview.qualityText}`);
  assert.match(overview.qualityText, /\d+ vấn đề được phát hiện · trong đó \d+ lệch pha/);
  await page.screenshot({ path: screenshotPaths.overview, fullPage: true });

  console.log("✓ tổng quan ưu tiên tiến độ năm và ba thẻ hỗ trợ không trùng lặp");

  await clickButtonByText(page, "Dòng thời gian");
  await page.waitForFunction(() => location.hash.includes("v=timeline"), { timeout: 15_000 });
  await page.waitForSelector(".timeline-page-shell .long-mon-view-switch", { timeout: 15_000 });

  await page.setViewport({ width: 1024, height: 900 });
  const tabletJourneyVisibility = await assertCurrentJourneyVisible(
    page,
    "timeline mở ở 1440px rồi thu xuống 1024px",
  );

  const timelineViews = await page.$$eval("[data-timeline-view]", (items) => items.map((item) => ({
    mode: item.getAttribute("data-timeline-view"),
    label: item.textContent?.trim(),
    pressed: item.getAttribute("aria-pressed"),
  })));
  assert.deepEqual(timelineViews.map((item) => item.mode), ["ngu-do", "bang"]);
  assert.deepEqual(timelineViews.map((item) => item.label), ["Ngư đồ", "Bảng"]);
  assert.equal(timelineViews.filter((item) => item.pressed === "true").length, 1);
  assert.equal(await page.$$eval("[data-timeline-3d], .vmp-space3d", (items) => items.length), 0);

  await page.click('[data-timeline-view="bang"]');
  await page.waitForSelector('.long-mon-bang [data-bang-loc="all"]', { timeout: 15_000 });
  assert.equal(
    await page.$eval('[data-timeline-view="bang"]', (item) => item.getAttribute("aria-pressed")),
    "true",
  );
  const tabletJourneyWidths = await page.$$eval(".monitoring-journey__item", (items) =>
    items
      .filter((item) => item.getClientRects().length > 0)
      .map((item) => item.getBoundingClientRect().width));
  assert.equal(tabletJourneyWidths.length, 3, "Timeline tablet phải hiển thị đủ ba thẻ hành trình");
  assert.ok(
    tabletJourneyWidths.every((width) => width >= 280),
    `Timeline tablet có thẻ hành trình hẹp hơn 280px: ${tabletJourneyWidths.join(", ")}`,
  );
  await page.screenshot({ path: screenshotPaths.timeline, fullPage: true });

  console.log(
    `✓ dòng thời gian có hai cách xem, bảng điều khiển được, không còn 3D và rail 1024px ${JSON.stringify(tabletJourneyVisibility)}`,
  );

  await clickButtonByText(page, "Cảnh báo & ưu tiên");
  await page.waitForFunction(() => location.hash.includes("v=alerts"), { timeout: 15_000 });
  await page.waitForSelector(".alerts-page-shell", { timeout: 15_000 });

  const alerts = await page.evaluate(() => {
    const priorityRail = document.querySelector(".alerts-priority-rail");
    const management = document.querySelector(".alerts-management");
    const tools = document.querySelector("details.alerts-tools");
    const groupButtons = [...document.querySelectorAll(".alerts-view-mode button")];
    return {
      primaryCount: priorityRail?.querySelectorAll(":scope > button").length ?? 0,
      priorityText: priorityRail?.textContent ?? "",
      toolsClosed: tools ? !tools.hasAttribute("open") : false,
      toolsSummary: tools?.querySelector("summary")?.textContent ?? "",
      groupLabels: groupButtons.map((button) => button.textContent?.trim()),
      groupPressed: groupButtons.map((button) => button.getAttribute("aria-pressed")),
      commandHeroCount: document.querySelectorAll(".alerts-command__hero").length,
      commandQueueCount: document.querySelectorAll(".alerts-command__queue-item").length,
      managementCount: document.querySelectorAll(".alerts-management").length,
      managementBeforePriority: Boolean(
        management
        && priorityRail
        && (management.compareDocumentPosition(priorityRail) & Node.DOCUMENT_POSITION_FOLLOWING)
      ),
      managementMetricAlignment: [...document.querySelectorAll(".alerts-management__metrics article")]
        .map((article) => {
          const style = getComputedStyle(article);
          return { alignItems: style.alignItems, textAlign: style.textAlign };
        }),
      aiButtonsDisabled: [...document.querySelectorAll(".alerts-ai-panel button")]
        .map((button) => button.disabled),
      desktopHorizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyText: document.body.textContent ?? "",
    };
  });
  assert.equal(alerts.primaryCount, 4);
  assert.equal(alerts.commandHeroCount, 1);
  assert.ok(alerts.commandQueueCount >= 1 && alerts.commandQueueCount <= 4);
  assert.equal(alerts.managementCount, 1);
  assert.equal(alerts.managementBeforePriority, true,
    "Góc nhìn quản lý phải đứng ngay sau bàn điều phối và trước bốn tín hiệu cảnh báo");
  assert.deepEqual(alerts.managementMetricAlignment, [
    { alignItems: "center", textAlign: "center" },
    { alignItems: "center", textAlign: "center" },
    { alignItems: "center", textAlign: "center" },
  ], "Cả ba ô chỉ số quản lý phải căn giữa chữ đồng nhất");
  assert.ok(alerts.desktopHorizontalOverflow <= 1,
    `Alerts desktop tràn ngang ${alerts.desktopHorizontalOverflow}px`);
  assert.doesNotMatch(alerts.priorityText, /🚨|⏰|🛡️|🔁/u);
  assert.equal(alerts.toolsClosed, true);
  assert.match(alerts.toolsSummary, /Tìm kiếm & công cụ/);
  assert.deepEqual(alerts.groupLabels, ["Gom theo đối tượng", "Theo từng hạng mục"]);
  assert.deepEqual(alerts.groupPressed, ["true", "false"]);
  assert.doesNotMatch(alerts.bodyText, /VITE_N8N_AI_REPORT_URL|GitHub → Settings/);
  const aiUnavailable = alerts.bodyText.includes("Phân tích AI chưa được bật. Dữ liệu cảnh báo vẫn đầy đủ.");
  assert.deepEqual(alerts.aiButtonsDisabled, aiUnavailable ? [true, true] : [false, false]);
  if (!aiUnavailable) {
    assert.match(alerts.bodyText, /AI chỉ nhận định, không thay đánh giá của QA/);
  }

  await clickButtonByText(page, "Theo từng hạng mục");
  const groupPressed = await page.$$eval(".alerts-view-mode button", (buttons) =>
    buttons.map((button) => button.getAttribute("aria-pressed")));
  assert.deepEqual(groupPressed, ["false", "true"]);

  console.log("✓ cảnh báo có bàn điều phối, bốn tín hiệu, góc nhìn quản lý và công cụ phụ đóng mặc định");

  await page.setViewport({ width: 390, height: 844 });
  const mobileJourneyVisibility = [];
  for (const view of ["overview", "timeline", "alerts"]) {
    mobileJourneyVisibility.push({ view, evidence: await assertMobileLayout(page, view) });
  }
  await page.screenshot({ path: screenshotPaths.alerts, fullPage: true });

  assert.deepEqual(chanNgoai, [], "Monitoring Journey không được gọi ngoài preview/mock");
  console.log(`✓ mobile 390px giữ thẻ hiện tại trong rail ${JSON.stringify(mobileJourneyVisibility)}`);
  console.log(`screenshots:\n- ${screenshotPaths.overview}\n- ${screenshotPaths.timeline}\n- ${screenshotPaths.alerts}`);
} finally {
  await browser.close();
}

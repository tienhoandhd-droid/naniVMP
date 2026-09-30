/* Shell navigation acceptance: mock-only, no qualification iframe or business writes. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const origin = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const env = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
const supabaseUrl = env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
if (!supabaseUrl) throw new Error(".env.local thiếu VITE_SUPABASE_URL");

const screenshotDir = process.env.VMP_SIDEBAR_SCREENSHOTS;
async function screenshot(page, name) {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: join(screenshotDir, `${name}.png`) });
}

// Catch theme overrides that make light navigation dark or lose text contrast.
const rgb = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number);
const luminance = (color) => rgb(color).map((v) => {
  const s = v / 255;
  return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
}).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

async function sidebarPalette(page) {
  return page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    const sidebar = style('.vmp-sidebar');
    const active = style('.vmp-sidebar .vmp-nav[aria-current="page"]');
    return {
      surface: sidebar.backgroundColor,
      activeSurface: active.backgroundColor,
      activeText: active.color,
      texts: ['.vmp-nav:not([aria-current="page"])', '.vmp-nav-group-heading', '.qualification-nav__system-toggle', '.vq-brand__donvi', '.vq-brand__team']
        .map((selector) => style(`.vmp-sidebar ${selector}`).color),
    };
  });
}

async function checkHover(page) {
  const item = await page.$('.vmp-sidebar [data-view="today"]');
  await item.hover();
  await page.waitForFunction(() => document.querySelector('.vmp-sidebar [data-view="today"]')
    .getAnimations().every((animation) => animation.playState === 'finished'));
  const colors = await item.evaluate((node) => {
    const style = getComputedStyle(node);
    return { text: style.color, surface: style.backgroundColor, stroke: getComputedStyle(node.querySelector('svg')).stroke };
  });
  assert.ok(contrast(colors.text, colors.surface) >= 4.5, 'hovered navigation text must remain readable');
  assert.equal(colors.stroke, colors.text, 'hovered icon retains text contrast');
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
try {
  const open = async (viewport, theme = "light", onlyAir = false) => {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((savedTheme) => localStorage.setItem("vmp-theme", savedTheme), theme);
    await caiGiaLap(page, {
      supabaseUrl, kichBan: "day", mangNghiemNgat: true, previewOrigin: origin,
      suaKho: (store) => { store.cpc1_context = { can_view: true, systems: {
        steam: { can_view_current: !onlyAir, can_view_archive: !onlyAir },
        air: { can_view_current: false, can_view_archive: true },
        nitrogen: { can_view_current: !onlyAir, can_view_archive: false },
      } }; },
    });
    await nhetPhien(page, { supabaseUrl, cheDo: theme });
    await page.setViewport(viewport);
    await page.goto(`${origin}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector(".qualification-nav"), { timeout: 12_000 });
    await page.waitForFunction(() => document.body.textContent?.includes('24 hạng mục trong kế hoạch năm'), { timeout: 12_000 });
    return page;
  };

  const restricted = await open({width:1440,height:900},"light",true);
  await restricted.goto(`${origin}?qualification=steam.html#v=overview`,{waitUntil:"domcontentloaded"});
  await restricted.waitForSelector('.qualification-nav');
  assert.equal(await restricted.$('#vmp-qualification-frame'),null,'initial URL cannot open an unauthorized system');
  await restricted.goto(`${origin}?qualification=gas.html%3Fsystem%3Dair#v=overview`,{waitUntil:"domcontentloaded"});
  await restricted.waitForSelector('#vmp-qualification-frame');
  await restricted.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:document.querySelector('#vmp-qualification-frame').contentWindow,data:{channel:'vmp-qualification',type:'navigate',target:'gas.html?system=nitrogen'}})));
  assert.match(await restricted.$eval('#vmp-qualification-frame',el=>el.src),/system=air/,'iframe navigation cannot open another system');
  await restricted.evaluate(()=>{history.pushState({},'', '?qualification=runs.html%3Fview%3Dtrend%26system%3Dsteam');window.dispatchEvent(new PopStateEvent('popstate'));});
  await restricted.waitForFunction(()=>!document.querySelector('#vmp-qualification-frame'));
  await restricted.close();

  const desktop = await open({ width: 1440, height: 900 });
  await screenshot(desktop, 'desktop-light');
  const lightPalette = await sidebarPalette(desktop);
  assert.ok(luminance(lightPalette.surface) >= .8, 'light-mode sidebar must be a light surface');
  for (const color of lightPalette.texts) assert.ok(contrast(color, lightPalette.surface) >= 4.5, 'sidebar labels must retain readable contrast');
  assert.ok(contrast(lightPalette.activeText, lightPalette.activeSurface) >= 4.5, 'current-page text must remain readable');
  await checkHover(desktop);
  const desktopContract = await desktop.evaluate(() => {
    const sidebar = document.querySelector(".vmp-sidebar");
    return {
      headings: [...document.querySelectorAll(".vmp-sidebar .vmp-nav-group-heading")].map((node) => node.textContent?.trim()),
      hasLibrary: document.body.textContent?.includes("Thư viện biểu mẫu") ?? false,
      mastheads: document.querySelectorAll(".vmp-masthead").length,
      iconStroke: getComputedStyle(document.querySelector('.vmp-sidebar [data-view="today"] svg')).stroke,
      navColor: getComputedStyle(document.querySelector('.vmp-sidebar [data-view="today"]')).color,
      sideOverflow: (sidebar?.scrollWidth ?? 0) - (sidebar?.clientWidth ?? 0),
    };
  });
  assert.deepEqual(desktopContract.headings, ["THỰC HIỆN", "GIÁM SÁT", "THẨM ĐỊNH THỰC TẾ", "PHÂN TÍCH & QUẢN TRỊ"]);
  assert.equal(desktopContract.hasLibrary, false);
  assert.equal(desktopContract.mastheads, 1);
  assert.equal(desktopContract.iconStroke,desktopContract.navColor,"inactive icons keep sidebar text contrast");
  assert.ok(desktopContract.sideOverflow <= 1, `sidebar overflow ${desktopContract.sideOverflow}`);
  await desktop.click(".qualification-nav__system-toggle");
  await desktop.waitForFunction(() => document.body.textContent?.includes("BM03 — Độ khô"));
  await screenshot(desktop, 'desktop-expanded');
  await desktop.click('button[aria-label="Thu gọn menu"]');
  assert.equal(await desktop.$eval('.vmp-sidebar', (node) => Math.round(node.getBoundingClientRect().width)), 72);
  await screenshot(desktop, 'desktop-collapsed');
  await desktop.click('button[aria-label="Mở rộng menu"]');
  const focusTarget = await desktop.$('.vmp-sidebar [data-view="today"]');
  await focusTarget.focus();
  await desktop.keyboard.press('Tab');
  assert.ok(await desktop.evaluate(() => document.activeElement.matches('.vmp-sidebar .vmp-nav:focus-visible')), 'keyboard navigation retains visible focus');
  const focus = await desktop.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    return { width: parseFloat(style.outlineWidth), color: style.outlineColor };
  });
  assert.ok(focus.width >= 2 && contrast(focus.color, lightPalette.surface) >= 3, 'keyboard focus must be visible against the sidebar');
  await desktop.goto(`${origin}#v=reports`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await desktop.waitForFunction(() => document.querySelectorAll(".vmp-masthead").length === 1, { timeout: 12_000 });
  await desktop.close();

  const dark = await open({ width: 1440, height: 900 }, 'dark');
  const darkPalette = await sidebarPalette(dark);
  assert.ok(luminance(darkPalette.surface) <= .15, 'dark mode keeps its themed surface');
  for (const color of darkPalette.texts) assert.ok(contrast(color, darkPalette.surface) >= 4.5, 'dark sidebar labels must retain readable contrast');
  assert.ok(contrast(darkPalette.activeText, darkPalette.activeSurface) >= 4.5, 'dark current-page text must remain readable');
  await checkHover(dark);
  await screenshot(dark, 'desktop-dark');
  await dark.close();

  const mobile = await open({ width: 390, height: 844, isMobile: true });
  await mobile.click(".vmp-mobile-menu-button");
  await mobile.waitForSelector("#vmp-mobile-drawer");
  await mobile.click("#vmp-mobile-drawer .qualification-nav__system-toggle");
  const mobileContract = await mobile.evaluate(() => ({
    open: Boolean(document.querySelector("#vmp-mobile-drawer")),
    expanded: document.querySelector("#vmp-mobile-drawer .qualification-nav__system-toggle")?.getAttribute("aria-expanded"),
    headings: [...document.querySelectorAll("#vmp-mobile-drawer .vmp-nav-group-heading")].map((node) => node.textContent?.trim()),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.equal(mobileContract.open, true);
  assert.equal(mobileContract.expanded, "true");
  assert.deepEqual(mobileContract.headings, ["THỰC HIỆN", "GIÁM SÁT", "THẨM ĐỊNH THỰC TẾ", "PHÂN TÍCH & QUẢN TRỊ"]);
  assert.ok(mobileContract.overflow <= 1, `mobile overflow ${mobileContract.overflow}`);
  const mobileLink = await mobile.$eval('#vmp-mobile-drawer .qualification-nav__link', (node) => ({
    color: getComputedStyle(node).color,
    surface: getComputedStyle(document.querySelector('#vmp-mobile-drawer')).backgroundColor,
  }));
  assert.ok(contrast(mobileLink.color, mobileLink.surface) >= 4.5, 'mobile form links must remain readable');
  const mobileTeamColor = await mobile.$eval('#vmp-mobile-drawer .vq-brand__team', (node) => getComputedStyle(node).color);
  assert.ok(contrast(mobileTeamColor, mobileLink.surface) >= 4.5, 'mobile branding text must remain readable');
  await screenshot(mobile, 'mobile-drawer');
  await mobile.close();

  for (const viewport of [{ width: 320, height: 760, isMobile: true }, { width: 768, height: 900 }]) {
    const compact = await open(viewport, "dark");
    if (viewport.width === 320) {
      const cdp = await compact.target().createCDPSession();
      await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    }
    const compactContract = await compact.evaluate(() => ({
      dark: document.documentElement.dataset.theme,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      mastheads: document.querySelectorAll(".vmp-masthead").length,
    }));
    assert.equal(compactContract.dark, "dark");
    assert.equal(compactContract.mastheads, 1);
    assert.ok(compactContract.overflow <= 1, `${viewport.width}px overflow ${compactContract.overflow}`);
    await compact.close();
  }

  const login = await browser.newPage();
  await caiGiaLap(login, { supabaseUrl, kichBan: "day", mangNghiemNgat: true, previewOrigin: origin });
  await login.setViewport({ width: 1440, height: 900 });
  await login.goto(origin, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await login.waitForFunction(() => document.querySelectorAll(".vmp-masthead").length === 1, { timeout: 12_000 });
  assert.equal(await login.$$eval(".vmp-masthead", (nodes) => nodes.length), 1);
  await login.close();
  console.log('PASS navigation: light/dark contrast, collapse, keyboard focus, qualification groups, mobile and access boundaries');
} finally {
  await browser.close();
}

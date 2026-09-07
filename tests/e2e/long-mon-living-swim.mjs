import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
  .match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
assert.ok(supabaseUrl, "test requires public mock endpoint");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    const nativeGetRandomValues = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (values) => {
      if (values instanceof Uint32Array && values.length === 1) { values[0] = 42; return values; }
      return nativeGetRandomValues(values);
    };
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await caiGiaLap(page, { supabaseUrl, kichBan: "day", mangNghiemNgat: true, previewOrigin: APP_URL });
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(`${APP_URL}#v=timeline`, { waitUntil: "networkidle0" });
  await page.waitForSelector("[data-long-mon-fish]");
  const dateAnchors = await page.$$eval(".long-mon-race__fish-position", (nodes) => nodes.map((node) => ({
    x: node.style.getPropertyValue("--long-mon-x"), y: node.style.getPropertyValue("--long-mon-y"),
    rotate: node.style.getPropertyValue("--school-rotate"),
    renderX: node.querySelector("[data-long-mon-fish]")?.dataset.renderX,
  })));
  await page.click('[data-long-mon-view="organic"]');
  await page.waitForSelector('.long-mon-race[data-view="organic"]');

  const sample = () => page.$$eval(".long-mon-race__fish-position", (nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { id: node.querySelector("[data-long-mon-fish]")?.dataset.longMonFish, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }));
  const first = await sample();
  await wait(2400);
  const second = await sample();
  const distance = second.map((point, index) => Math.hypot(point.x - first[index].x, point.y - first[index].y));
  assert.ok(distance.filter((value) => value > 15).length >= Math.min(4, Math.ceil(distance.length * .5)), "multiple fish make substantial travel, not a shared tiny bob");
  assert.ok(Math.max(...distance) > 30, "at least one fish crosses a clearly visible distance");
  assert.ok(new Set(second.map((point, index) => `${Math.sign(point.x - first[index].x)},${Math.sign(point.y - first[index].y)}`)).size >= 3,
    "the pond has distinct travel directions");

  const canvas = await page.$(".long-mon-race__canvas");
  const canvasBox = await canvas.boundingBox();
  await page.mouse.move(canvasBox.x + 5, canvasBox.y + 5);
  const emptyBefore = await sample();
  await wait(900);
  const emptyAfter = await sample();
  assert.ok(emptyAfter.some((point, index) => Math.hypot(point.x - emptyBefore[index].x, point.y - emptyBefore[index].y) > .8), "hovering empty water does not freeze the pond");

  const fish = await page.$$("[data-long-mon-fish]");
  const aimed = fish[0];
  const otherBefore = await page.$$eval(".long-mon-race__fish-position", (nodes) => nodes.slice(1).map((node) => ({
    id: node.querySelector("[data-long-mon-fish]")?.dataset.longMonFish,
    point: node.style.transform,
  })));
  await aimed.hover();
  const aimedBefore = await aimed.evaluate((node) => node.parentElement.style.transform);
  await wait(650);
  assert.equal(await aimed.evaluate((node) => node.parentElement.style.transform), aimedBefore, "aimed fish freezes on pointer");
  assert.ok(await page.$$eval(".long-mon-race__fish-position", (nodes, before) => nodes.slice(1).some((node) => {
    const id = node.querySelector("[data-long-mon-fish]")?.dataset.longMonFish;
    const point = node.style.transform;
    return before.find((item) => item.id === id)?.point !== point;
  }), otherBefore), "the rest of the pond keeps swimming");
  await page.focus("[data-long-mon-fish]");
  const focusBefore = await aimed.evaluate((node) => node.parentElement.style.transform);
  await wait(500);
  assert.equal(await aimed.evaluate((node) => node.parentElement.style.transform), focusBefore, "keyboard focus freezes its fish");
  await page.keyboard.press("Enter");
  await page.waitForSelector('[role="dialog"]');
  await page.keyboard.press("Escape");

  await page.mouse.move(2, 2);
  await page.click("[data-long-mon-pause]");
  const paused = await sample();
  await wait(500);
  assert.deepEqual(await sample(), paused, "pause has no movement");
  await page.setViewport({ width: 960, height: 768 });
  await wait(180);
  assert.deepEqual(await page.evaluate(() => {
    const canvas = document.querySelector(".long-mon-race__canvas").getBoundingClientRect();
    return [...document.querySelectorAll(".long-mon-race__fish-position")]
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.left < canvas.left || rect.right > canvas.right || rect.top < canvas.top || rect.bottom > canvas.bottom).length;
  }), 0, "a paused resize keeps complete fish sprites contained");
  await page.setViewport({ width: 1366, height: 768 });
  await wait(180);
  await page.click("[data-long-mon-pause]");
  await wait(50);
  const resumedFirstFrame = await sample();
  assert.ok(Math.max(...resumedFirstFrame.map((point, index) => Math.hypot(point.x - paused[index].x, point.y - paused[index].y))) < 4,
    "resume does not jump fish back to an initial placement");
  await wait(700);
  assert.ok((await sample()).some((point, index) => Math.hypot(point.x - paused[index].x, point.y - paused[index].y) > .8), "resume continues from the paused positions");

  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const reduced = await sample();
  await wait(500);
  assert.deepEqual(await sample(), reduced, "live reduced-motion change stops the simulation");
  await page.click('[data-long-mon-view="date"]');
  assert.deepEqual(await page.$$eval(".long-mon-race__fish-position", (nodes) => nodes.map((node) => ({
    x: node.style.getPropertyValue("--long-mon-x"), y: node.style.getPropertyValue("--long-mon-y"),
    rotate: node.style.getPropertyValue("--school-rotate"),
    renderX: node.querySelector("[data-long-mon-fish]")?.dataset.renderX,
  }))), dateAnchors, "date anchors remain unchanged");

  const denseContext = await browser.createBrowserContext();
  try {
    const densePage = await denseContext.newPage();
    await densePage.evaluateOnNewDocument(() => {
      const nativeGetRandomValues = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (values) => {
        if (values instanceof Uint32Array && values.length === 1) { values[0] = 42; return values; }
        return nativeGetRandomValues(values);
      };
    });
    await caiGiaLap(densePage, { supabaseUrl, kichBan: "day", mangNghiemNgat: true, previewOrigin: APP_URL,
      suaKho(kho) {
        for (const rpc of ["rpc_get_vmp_dashboard", "rpc_get_vmp_dashboard_v2"]) {
          const base = kho[rpc].activities[0];
          const deadline = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
          kho[rpc].activities = Array.from({ length: 150 }, (_, index) => ({ ...base,
            id: `living-${index}`, code: `LIVING-${index}`, name: `Hồ sống ${index}`, state: "active",
            crit: index % 3 === 0 ? "Cao" : index % 3 === 1 ? "TB" : "Thấp",
            criticality: index % 3 === 0 ? "high" : index % 3 === 1 ? "medium" : "low",
            target: deadline, dlVmp: deadline, canonicalDeadline: deadline, canonical_deadline: deadline,
            days_left: 5, status_as_of: new Date().toISOString().slice(0, 10),
            _raw: { ...base._raw, id: `living-${index}`, dl_vmp: deadline, deadline_vmp: deadline, state: "active" },
          }));
        }
      },
    });
    await nhetPhien(densePage, { supabaseUrl });
    await densePage.setViewport({ width: 390, height: 844 });
    await densePage.goto(`${APP_URL}#v=timeline`, { waitUntil: "networkidle0" });
    await densePage.waitForFunction(() => document.querySelectorAll("[data-long-mon-fish]").length === 150);
    const dateScales = await densePage.$$eval("[data-long-mon-fish]", (fish) => fish.map((node) => ({
      importance: Number(node.dataset.longMonImportance), scale: Number(node.parentElement.style.getPropertyValue("--school-scale")),
    })));
    const dateGroup = (value) => dateScales.filter((row) => row.importance === value).map((row) => row.scale);
    assert.deepEqual([dateGroup(.86).length, dateGroup(1).length, dateGroup(1.14).length], [50, 50, 50],
      "dense fixture includes every source importance group");
    assert.ok(Math.max(...dateGroup(.86)) < Math.min(...dateGroup(1))
      && Math.max(...dateGroup(1)) < Math.min(...dateGroup(1.14)),
    "date CSS fish sizes preserve source importance ordering across IDs");
    await densePage.click('[data-long-mon-view="organic"]');
    await densePage.waitForFunction(() => document.querySelectorAll("[data-long-mon-fish]").length === 150);
    await wait(900);
    const dense = await densePage.evaluate(() => {
      const canvas = document.querySelector(".long-mon-race__canvas").getBoundingClientRect();
      const fish = [...document.querySelectorAll("[data-long-mon-fish]")];
      const clipped = fish.filter((node) => {
        const rect = node.parentElement.getBoundingClientRect();
        return rect.left < canvas.left || rect.right > canvas.right || rect.top < canvas.top || rect.bottom > canvas.bottom;
      }).length;
      const facing = fish.map((node) => {
        const heading = node.querySelector(".long-mon-race__fish-heading");
        const expected = heading.style.transform.includes("scaleX(-1)") ? -1 : 1;
        const actual = Math.sign(Number(getComputedStyle(heading).transform.match(/^matrix\(([^,]+)/)?.[1]));
        return expected === actual;
      });
      const scales = fish.map((node) => ({
        importance: Number(node.dataset.longMonImportance),
        scale: Number(node.parentElement.style.getPropertyValue("--school-scale")),
      }));
      return { count: fish.length, clipped, facing, importance: [...new Set(fish.map((node) => node.dataset.longMonImportance))], scales };
    });
    assert.equal(dense.count, 150);
    assert.equal(dense.clipped, 0, "all 150 complete sprite wrappers fit the mobile pond");
    assert.ok(dense.facing.every(Boolean), "dense mobile body scale follows each live swim-facing sign");
    assert.deepEqual([...dense.importance].sort(), ["0.86", "1", "1.14"], "source criticality reaches monotonic visual importance");
    const byImportance = (value) => dense.scales.filter((row) => row.importance === value).map((row) => row.scale);
    assert.ok(Math.max(...byImportance(.86)) < Math.min(...byImportance(1))
      && Math.max(...byImportance(1)) < Math.min(...byImportance(1.14)),
    "actual CSS fish sizes preserve source importance ordering across IDs");
  } finally {
    await denseContext.close();
  }
  assert.deepEqual(errors, [], "living pond has no browser errors");
  console.log("PASS Long Môn living swim: displacement, directions, individual freeze, pause/resume, reduced motion, keyboard, date anchors.");
} finally {
  await browser.close();
}

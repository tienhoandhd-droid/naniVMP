import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome-path.mjs';
import { caiGiaLap, nhetPhien } from './gia-lap-supabase.mjs';

const APP_URL = process.env.VMP_E2E_URL || 'http://127.0.0.1:4173/';
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
assert.ok(supabaseUrl, 'test requires public mock endpoint');
const require = createRequire(import.meta.url);
const browser = await puppeteer.launch({executablePath: CHROME, headless: true, args: ['--no-sandbox']});
const shotDir = process.env.VMP_SHOT_DIR || '/tmp/vmp-joyful-shots';
mkdirSync(shotDir, {recursive: true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await caiGiaLap(page, {supabaseUrl, kichBan: 'day', mangNghiemNgat: true, previewOrigin: APP_URL});
  await nhetPhien(page, {supabaseUrl});
  await page.setViewport({width: 1440, height: 1000});
  await page.goto(`${APP_URL}#v=timeline`, {waitUntil: 'networkidle0'});
  await page.waitForSelector('[data-long-mon-view="date"][aria-pressed="true"]', {timeout: 5000});
  const snapshot = () => page.$$eval('[data-long-mon-fish]', nodes => nodes.map(n => [n.dataset.longMonFish, n.dataset.deadline]).sort());
  const initial = await snapshot();
  await page.$eval(".long-mon-race", el => el.scrollIntoView({block: "start"}));
  assert.ok(initial.length > 0, 'fixture has fish');
  await page.screenshot({path: `${shotDir}/date-1440.png`, fullPage: true});
  await page.focus('[data-long-mon-view="organic"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.long-mon-race[data-view="organic"]');
  assert.deepEqual(await snapshot(), initial, 'same authorized fish and deadlines in both modes');
  assert.equal(await page.$eval('.long-mon-race__periods', el => getComputedStyle(el).display), 'none');
  await page.click('[data-long-mon-pause]');
  assert.equal(await page.$eval('[data-long-mon-pause]', el => el.getAttribute('aria-pressed')), 'true');
  assert.equal(await page.$eval('[data-long-mon-pause]', el => el.getAttribute('aria-label')), 'Tiếp tục bơi');
  assert.equal(await page.$eval('.long-mon-race__fish-position', el => getComputedStyle(el).animationPlayState), 'paused');
  await page.screenshot({path: `${shotDir}/organic-1440.png`, fullPage: true});
  const label = await page.$eval('[data-long-mon-fish]', el => el.getAttribute('aria-label'));
  await page.focus('[data-long-mon-fish]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"]');
  assert.ok(await page.$eval('[role="dialog"]', (el, code) => el.textContent.includes(code), label.split(' · ')[0]), 'fish opens original detail');
  await page.keyboard.press('Escape');
  await page.reload({waitUntil:'networkidle0'});
  await page.waitForSelector('.long-mon-race[data-view="organic"]');
  assert.deepEqual(await snapshot(), initial, 'view remembered without altering data');
  await page.$eval('.long-mon-race', el => el.scrollIntoView({block:'start'}));
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion', value:'reduce'}]);
  assert.equal(await page.$eval('.long-mon-race__fish-position', el => getComputedStyle(el).animationName), 'none');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.screenshot({path: `${shotDir}/organic-${theme}.png`, fullPage: true});
    const contrast = await page.evaluate(() => {
      const lum = color => {
        const channels = color.match(/[\d.]+/g).slice(0,3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      };
      const text = lum(getComputedStyle(document.querySelector('.long-mon-race__legend strong')).color);
      const bg = lum(getComputedStyle(document.querySelector('.long-mon-race__footer')).backgroundColor);
      return (Math.max(text,bg)+.05)/(Math.min(text,bg)+.05);
    });
    assert.ok(contrast >= 4.5, `${theme} legend text contrast: ${contrast}`);
    await page.evaluate(readFileSync(require.resolve('axe-core'), 'utf8'));
    const violations = await page.evaluate(async () => (await axe.run(document.querySelector('.long-mon-race'), {runOnly: {type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);
    assert.deepEqual(violations.filter(v => ['critical','serious'].includes(v.impact)).map(v => ({id:v.id, nodes:v.nodes.map(n => n.target)})), [], `organic ${theme} accessibility`);
  }
  await page.setViewport({width:390, height:844});
  assert.ok(await page.$eval('.long-mon-race__viewport', el => el.getBoundingClientRect().height >= 380), 'mobile pond keeps usable height');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no page overflow on mobile');
  await page.screenshot({path:`${shotDir}/organic-390.png`,fullPage:true});
  // A blocked preference store must never prevent switching modes.
  await page.evaluate(() => {
    Storage.prototype.setItem = function() { throw new DOMException('Blocked','SecurityError'); };
  });
  await page.click('[data-long-mon-view="date"]');
  await page.waitForSelector('.long-mon-race[data-view="date"]');
  assert.deepEqual(await snapshot(), initial);
  await page.evaluateOnNewDocument(() => {
    const read = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key) {
      if (key === 'vmp.long-mon.view') throw new DOMException('Blocked','SecurityError');
      return read.call(this,key);
    };
  });
  await page.reload({waitUntil:'networkidle0'});
  await page.waitForSelector('.long-mon-race[data-view="date"]');
  assert.deepEqual(await snapshot(), initial, 'blocked preference read falls back safely');
  assert.deepEqual(errors, [], 'no browser runtime errors');
  for (const count of [50, 150]) {
    const context = await browser.createBrowserContext();
    try {
      const densePage = await context.newPage();
      const denseErrors = [];
      densePage.on('pageerror', e => denseErrors.push(e.message));
      await caiGiaLap(densePage, {supabaseUrl, kichBan:'day', mangNghiemNgat:true, previewOrigin:APP_URL,
        suaKho(kho) {
          for (const rpc of ['rpc_get_vmp_dashboard','rpc_get_vmp_dashboard_v2']) {
            const base = kho[rpc].activities[0];
            const deadline = new Date(Date.now() + 5 * 86400000).toISOString().slice(0,10);
            kho[rpc].activities = Array.from({length:count}, (_, i) => ({...base,
              id:`pond-${i}`, code:`POND-${i}`, name:`Thiết bị thử ${i}`, state:'active',
              target:deadline, dlVmp:deadline, canonicalDeadline:deadline, canonical_deadline:deadline,
              days_left:5, status_as_of:new Date().toISOString().slice(0,10),
              _raw:{...base._raw, id:`pond-${i}`, dl_vmp:deadline, deadline_vmp:deadline, state:'active'},
            }));
          }
        },
      });
      await nhetPhien(densePage,{supabaseUrl});
      await densePage.setViewport({width:1440,height:1000});
      await densePage.goto(`${APP_URL}#v=timeline`,{waitUntil:'networkidle0'});
      await densePage.click('[data-long-mon-view="organic"]');
      await densePage.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
      const metrics = await densePage.evaluate(() => {
        const canvas = document.querySelector('.long-mon-race__canvas').getBoundingClientRect();
        const fish = [...document.querySelectorAll('[data-long-mon-fish]')].map(n => ({id:n.dataset.longMonFish, r:n.getBoundingClientRect()}));
        return {count:fish.length, clipped:fish.filter(({r}) => r.left < canvas.left || r.right > canvas.right || r.top < canvas.top || r.bottom > canvas.bottom).map(n=>n.id)};
      });
      assert.equal(metrics.count,count);
      assert.deepEqual(metrics.clipped,[], `${count} fish within scrollable pond`);
      await densePage.$eval('.long-mon-race', el => el.scrollIntoView({block:'start'}));
      await densePage.screenshot({path:`${shotDir}/organic-${count}-fish.png`,fullPage:true});
      await densePage.focus('.long-mon-race__fish-position:last-child [data-long-mon-fish]');
      await densePage.keyboard.press('Enter');
      await densePage.waitForSelector('[role="dialog"]');
      assert.deepEqual(denseErrors,[]);
    } finally { await context.close(); }
  }
  console.log(`PASS Long Môn: mode parity (${initial.length} fish), keyboard details, preference, blocked storage, pause, reduced motion, desktop/mobile, light/dark. Screenshots: ${shotDir}`);
} finally { await browser.close(); }

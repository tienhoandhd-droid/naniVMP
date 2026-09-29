// Populated, read-only fixture audit. Never submits data to a real backend.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome-path.mjs';
import { caiGiaLap, nhetPhien } from './gia-lap-supabase.mjs';

const require = createRequire(import.meta.url);
const url = process.env.VMP_E2E_URL || 'http://127.0.0.1:4173/';
const output = process.env.VMP_AUDIT_OUTPUT || 'output/playwright/quality-audit';
const supabaseUrl = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
  .match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1].trim();
assert.ok(supabaseUrl);
mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  for (const route of ['login', 'reports']) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage();
      await page.setBypassCSP(true); // axe injection only; application CSP is unchanged.
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await caiGiaLap(page, { supabaseUrl, kichBan: 'day', mangNghiemNgat: true, previewOrigin: url });
      if (route !== 'login') await nhetPhien(page, { supabaseUrl });
      await page.evaluateOnNewDocument(value => localStorage.setItem('vmp-theme', value), theme);
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewport({ width, height: 900 });
        await page.goto(`${url}#v=${route === 'login' ? 'today' : route}`, { waitUntil: 'networkidle0' });
        await page.waitForSelector(route === 'login' ? '#vmp-login-email' : '.vmp-report-export-actions');
        await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
        const audit = await page.evaluate(async () => {
          const axe = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
          return {
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            violations: axe.violations.map(v => ({ id: v.id, impact: v.impact,
              nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })),
            imagesWithoutAlt: document.querySelectorAll('img:not([alt])').length,
            paints: performance.getEntriesByType('paint').map(p => ({ name: p.name, ms: p.startTime })),
          };
        });
        results.push({ route, theme, width, ...audit, errors: [...errors] });
        await page.screenshot({ path: `${output}/${route}-${theme}-${width}.png`, fullPage: false });
      }
      await page.close();
    }
  }
} finally { await browser.close(); }
writeFileSync(`${output}/audit.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map(({ route, theme, width, overflow, violations, errors }) =>
  ({ route, theme, width, overflow, violations: violations.map(v => `${v.id}:${v.nodes.length}`), errors })), null, 2));
if (process.env.VMP_AUDIT_CHECK === '1') {
  assert.equal(results.some(r => r.overflow || r.imagesWithoutAlt || r.errors.length ||
    r.violations.some(v => ['critical', 'serious'].includes(v.impact))), false, 'Quality audit found accessibility/runtime failures');
}

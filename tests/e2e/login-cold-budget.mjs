import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome-path.mjs';
const url = process.env.VMP_E2E_URL || 'http://127.0.0.1:4173/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.origin === new URL(url).origin || u.protocol === 'data:') void r.continue();
    else void r.abort();
  });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#vmp-login-email');
  const assets = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(r => /\.js(?:\?|$)/.test(r.name))
    .map(r => ({ file: new URL(r.name).pathname.split('/').pop(), bytes: r.decodedBodySize })));
  const bytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  assert.ok(bytes > 0, 'resource timing must measure real production assets');
  assert.ok(bytes <= 520 * 1024, `cold login JS ${bytes} bytes exceeds 520 KiB budget (baseline 592876 bytes)`);
  assert.equal(assets.some(a => /AuthenticatedApp|ReportsView|exceljs/.test(a.file)), false,
    'protected shell/report/export must remain deferred until needed');
  console.log(`PASS cold login: ${bytes} decoded JS bytes; authenticated shell remains lazy`);
} finally { await browser.close(); }

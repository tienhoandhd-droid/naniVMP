import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome-path.mjs';
import { dungKhoDuLieu, traLoi } from './gia-lap-supabase.mjs';
const url = process.env.VMP_E2E_URL || 'http://127.0.0.1:4173/';
const endpoint = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').match(/^VITE_SUPABASE_URL=(.+)$/m)[1].trim();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const store = dungKhoDuLieu('day');
  let submits = 0;
  await page.setRequestInterception(true);
  page.on('request', request => {
    const u = new URL(request.url());
    if (u.origin === new URL(url).origin || ['data:', 'blob:'].includes(u.protocol)) return void request.continue();
    if (u.host !== new URL(endpoint).host) return void request.abort();
    const response = traLoi(store, u, request);
    if (u.pathname.endsWith('/token') && request.method() === 'POST') {
      submits += 1;
      return void setTimeout(() => request.respond({ ...response, status: 429,
        body: JSON.stringify({ code: 'over_request_rate_limit', msg: 'Too many requests' }) }).catch(() => {}), 600);
    }
    void request.respond(response);
  });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.type('#vmp-login-email', 'fixture@example.test');
  await page.type('#vmp-login-password', 'fixture-password');
  await page.evaluate(() => {
    const form = document.querySelector('.vq-login-form');
    form.requestSubmit(); form.requestSubmit();
  });
  await page.waitForSelector('.vq-luxury-btn[aria-busy="true"]');
  assert.ok(await page.$('[role="status"][aria-label="Trạng thái đăng nhập"]'), 'pending login must be announced');
  await page.waitForFunction(() => document.body.innerText.includes('quá nhiều yêu cầu đăng nhập'));
  assert.equal(submits, 1, 'repeated submit during request must not send duplicate credentials');
  assert.equal(await page.$eval('.vq-luxury-btn', button => button.disabled), false, 'rate-limited request releases UI for retry');
  console.log('PASS: announced login, one in-flight request, native 429 feedback, retry enabled');
} finally { await browser.close(); }

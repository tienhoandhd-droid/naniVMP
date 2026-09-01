import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, NGUOI_DUNG } from "./gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const envText = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
const match = envText.match(/^VITE_SUPABASE_URL=(.+)$/m);
if (!match) throw new Error(".env.local thiếu VITE_SUPABASE_URL");
const supabaseUrl = match[1].trim();

let dat = 0;
let hong = 0;
function kiem(condition, name, detail = "") {
  if (condition) {
    dat += 1;
    console.log(`  ✓ ${name}`);
  } else {
    hong += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function recoveryHash() {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  const token = [
    base64Url({ alg: "HS256", typ: "JWT" }),
    base64Url({
      aud: "authenticated", exp: expiresAt, sub: NGUOI_DUNG.id,
      email: NGUOI_DUNG.email, role: "authenticated",
    }),
    "gia-lap-signature",
  ].join(".");
  const values = new URLSearchParams({
    access_token: token,
    expires_in: "3600",
    expires_at: String(expiresAt),
    refresh_token: "gia-lap-recovery-refresh",
    token_type: "bearer",
    type: "recovery",
  });
  return `#${values}`;
}

async function newPage(browser, width = 1440, height = 900) {
  const page = await browser.newPage();
  const requests = [];
  page.on("request", (request) => {
    try {
      const url = new URL(request.url());
      if (url.origin === new URL(supabaseUrl).origin) {
        requests.push({ method: request.method(), path: url.pathname, body: request.postData() || "" });
      }
    } catch { /* data/blob URL */ }
  });
  await caiGiaLap(page, { supabaseUrl, kichBan: "day" });
  await page.evaluateOnNewDocument(() => localStorage.clear());
  await page.setViewport({ width, height });
  return { page, requests };
}

async function clickByText(page, pattern) {
  const clicked = await page.evaluate((source) => {
    const regex = new RegExp(source, "i");
    const button = [...document.querySelectorAll("button")]
      .find((item) => regex.test(item.textContent || ""));
    button?.click();
    return Boolean(button);
  }, pattern.source);
  if (!clicked) throw new Error(`Không tìm thấy nút ${pattern}`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

console.log("Quên mật khẩu:");
{
  const { page, requests } = await newPage(browser);
  await page.goto(`${GOC}?auth-flow=forgot`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#vmp-login-password", { timeout: 30_000 });

  const sameRow = await page.evaluate(() => {
    const row = document.querySelector(".vq-login-password-label-row")?.getBoundingClientRect();
    const forgot = [...document.querySelectorAll("button")]
      .find((item) => /quên mật khẩu/i.test(item.textContent || ""))?.getBoundingClientRect();
    return row && forgot ? Math.abs((row.top + row.height / 2) - (forgot.top + forgot.height / 2)) <= 2 : false;
  });
  kiem(sameRow, "Quên mật khẩu nằm cùng hàng nhãn mật khẩu");

  await clickByText(page, /quên mật khẩu/);
  await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Khôi phục mật khẩu"));
  kiem(await page.$("#vmp-login-password") === null, "bước quên mật khẩu chỉ còn email");

  await page.type("#vmp-login-email", "kiem-thu@vi-du.test");
  await page.focus("#vmp-login-email");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Kiểm tra email"));

  const sent = await page.evaluate(() => ({
    text: document.querySelector(".vq-recovery-sent")?.textContent || "",
    resendDisabled: [...document.querySelectorAll("button")]
      .find((item) => /gửi lại sau/i.test(item.textContent || ""))?.disabled ?? false,
  }));
  const recoverPosts = requests.filter((request) => request.method === "POST" && request.path.endsWith("/auth/v1/recover"));
  kiem(recoverPosts.length === 1, "Enter gửi đúng một request recovery", String(recoverPosts.length));
  kiem(/nếu email này thuộc hệ thống/i.test(sent.text), "thông báo không xác nhận tài khoản tồn tại");
  kiem(sent.resendDisabled, "gửi lại bị khóa trong thời gian chờ");

  await clickByText(page, /^quay lại đăng nhập$/);
  await page.waitForSelector("#vmp-login-password");
  const retained = await page.evaluate(() => ({
    email: document.querySelector("#vmp-login-email")?.value,
    password: document.querySelector("#vmp-login-password")?.value,
  }));
  kiem(retained.email === "kiem-thu@vi-du.test", "quay lại giữ email");
  kiem(retained.password === "", "quay lại không giữ mật khẩu");
  await page.close();
}

console.log("\nRecovery hợp lệ:");
{
  const { page, requests } = await newPage(browser);
  await page.goto(`${GOC}?auth-flow=recovery${recoveryHash()}`, {
    waitUntil: "domcontentloaded", timeout: 30_000,
  });
  await page.waitForSelector("#vmp-recovery-password", { timeout: 30_000 });
  kiem(!/Tổng quan VMP/.test(await page.$eval("body", (body) => body.innerText)), "recovery không render dashboard");
  const protectedRpc = requests.filter((request) => request.path.includes("/rest/v1/rpc/"));
  kiem(protectedRpc.length === 0, "recovery không khởi động RPC dữ liệu bảo vệ",
    protectedRpc.map((request) => request.path).join(", ") || "0");

  await page.type("#vmp-recovery-password", "abc1234");
  await page.type("#vmp-recovery-confirm", "abc1234");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => /8 ký tự/.test(document.body.innerText));
  kiem(requests.filter((request) => request.method === "PUT" && request.path.endsWith("/auth/v1/user")).length === 0,
    "mật khẩu 7 ký tự bị chặn trước API");

  await page.$eval("#vmp-recovery-password", (input) => { input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.$eval("#vmp-recovery-confirm", (input) => { input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.type("#vmp-recovery-password", "abc12345");
  await page.type("#vmp-recovery-confirm", "abc12346");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => /không khớp/i.test(document.body.innerText));
  kiem(requests.filter((request) => request.method === "PUT" && request.path.endsWith("/auth/v1/user")).length === 0,
    "hai mật khẩu lệch bị chặn trước API");

  await page.$eval("#vmp-recovery-confirm", (input) => { input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.type("#vmp-recovery-confirm", "abc12345");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#vmp-login-password", { timeout: 30_000 });
  const bodyText = await page.$eval("body", (body) => body.innerText);
  kiem(requests.some((request) => request.method === "PUT" && request.path.endsWith("/auth/v1/user")),
    "mật khẩu hợp lệ cập nhật qua Auth API");
  kiem(requests.some((request) => request.path.endsWith("/auth/v1/logout")), "phiên recovery được đăng xuất");
  kiem(/Mật khẩu đã được cập nhật/.test(bodyText), "thành công quay về login với hướng dẫn");
  await page.close();
}

console.log("\nRecovery hết hạn:");
{
  const { page } = await newPage(browser);
  const expired = "#type=recovery&error=access_denied&error_code=otp_expired&error_description=Link%20expired";
  await page.goto(`${GOC}?auth-flow=expired${expired}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => /không còn hiệu lực|hết hạn|không hợp lệ/i.test(document.body.innerText));
  kiem(await page.$("#vmp-recovery-password") === null, "link hết hạn không hiện form mật khẩu");
  await clickByText(page, /yêu cầu liên kết mới/);
  await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Khôi phục mật khẩu"));
  kiem(Boolean(await page.$("#vmp-login-email")), "link hết hạn dẫn tới form yêu cầu email mới");
  await page.close();
}

console.log("\nMobile:");
{
  const { page } = await newPage(browser, 390, 844);
  await page.goto(`${GOC}?auth-flow=mobile`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#vmp-login-password");
  await clickByText(page, /quên mật khẩu/);
  await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Khôi phục mật khẩu"));
  const mobile = await page.evaluate(() => {
    const input = document.querySelector("#vmp-login-email")?.getBoundingClientRect();
    const submit = document.querySelector('.vq-login-form button[type="submit"]')?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      inputHeight: input?.height || 0,
      submitHeight: submit?.height || 0,
      submitBottom: submit?.bottom || Infinity,
      viewportHeight: window.innerHeight,
    };
  });
  kiem(mobile.overflow <= 1, "mobile không tràn ngang", `${mobile.overflow}px`);
  kiem(mobile.inputHeight >= 44 && mobile.submitHeight >= 44, "input và CTA có vùng bấm tối thiểu 44px",
    `${Math.round(mobile.inputHeight)}px/${Math.round(mobile.submitHeight)}px`);
  kiem(mobile.submitBottom <= mobile.viewportHeight + 120, "CTA chính xuất hiện sớm trong luồng mobile",
    `${Math.round(mobile.submitBottom)}px`);
  await page.close();
}

await browser.close();
console.log(`\n${dat} đạt · ${hong} hỏng`);
if (hong > 0) process.exit(1);

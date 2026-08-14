import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { dangNhap, doiVaiTrenMan } from "./dang-nhap.mjs";
import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { LA_UI_ACCESS, uiAccessAdmin } from "./ui-access.mjs";

const GOC = "http://localhost:4173";
await choServer(GOC);

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};
const answer = (request, body) => request.method() === "OPTIONS"
  ? request.respond({ status: 204, headers: cors, body: "" })
  : request.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
await page.setRequestInterception(true);
page.on("request", (request) => {
  const url = request.url();
  // Vai trò localStorage chỉ phục vụ fixture; ScreenGuard vẫn đọc RPC server.
  // Mock đúng boundary này để test không phụ thuộc quyền live của tài khoản E2E.
  if (LA_UI_ACCESS.test(url)) return answer(request, uiAccessAdmin);
  if (/\/rpc\/rpc_get_vmp_dashboard/.test(url)) {
    return answer(request, { activities: [], objects: [], updated_at: "2026-08-10T00:00:00Z" });
  }
  if (/\/rpc\/rpc_get_vmp_watermark/.test(url)) {
    return answer(request, { year: 2026, plan_items: 0, objects: 0, updated_at: "2026-08-10T00:00:00Z" });
  }
  if (/\/rpc\/item_permissions_mode/.test(url)) return answer(request, "preview");
  if (/\/rpc\/vmp_my_item_rights/.test(url)) return answer(request, []);
  if (/\/rpc\/rpc_source_warnings/.test(url)) {
    return answer(request, {
      thieu_thang_dau: [], chua_tung_iq: [], show_tat: [], chua_hoat_dong: [], ma_tam: [],
    });
  }
  if (/\/rest\/v1\/vmp_performers/.test(url)) {
    return answer(request, [{
      id: "performer-e2e", performer_name: "Người cũ", email: "old@example.com",
      department: "qa", role_title: "QA", note: null, is_active: true,
    }]);
  }
  if (/\/rest\/v1\/vmp_source_objects/.test(url)) return answer(request, []);
  request.continue();
});

try {
  await dangNhap(page, GOC);
  await doiVaiTrenMan(page, "admin", "Quản trị kiểm danh bạ");
  await page.goto(`${GOC}#v=source`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => button.textContent?.trim() === "Người thực hiện"));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Người thực hiện")?.click());

  await page.waitForFunction(() => document.body.innerText.includes("Danh bạ người thực hiện được quản lý tại Phân quyền & trách nhiệm"));
  assert.equal(await page.evaluate(() => document.body.innerText.includes("Người cũ")), false,
    "tab danh mục không còn hiển thị bảng có các nút mutation legacy");
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")]
    .some((button) => button.textContent?.trim() === "Thêm dòng")), false,
  "không còn nút tạo người thực hiện gọi rpc_upsert_performer đã bị vô hiệu hóa");
  assert.equal(await page.evaluate(() => document.querySelectorAll('button[title="Sửa"], button[title="Xoá"]').length), 0,
    "không còn control sửa/xoá người thực hiện gọi RPC legacy");

  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Đến Phân quyền & trách nhiệm")?.click());
  await page.waitForFunction(() => window.location.hash.includes("v=phanquyen"));
  assert.equal(await page.evaluate(() => document.body.innerText.includes("Phân quyền & trách nhiệm")), true,
    "lời dẫn từ danh mục đưa quản trị viên đến đúng nơi tạo và quản lý danh bạ chuẩn");
  console.log("✅ Danh mục không gọi mutation performer legacy và dẫn tới danh bạ chuẩn");
} finally {
  await browser.close();
}

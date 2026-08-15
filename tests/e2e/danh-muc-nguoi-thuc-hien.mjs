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

/* Đợt B Task 6: tab "Người thực hiện" (và màn chuyển hướng của nó) đã GỠ
 * HẲN khỏi màn Danh mục — workspace sáu mục không còn mục nào như vậy.
 * Tinh thần của bộ kiểm giữ nguyên: màn Danh mục không được bày bất kỳ lối
 * mutation performer legacy nào; danh bạ chuẩn sống ở Nhân sự & phân công. */
try {
  await dangNhap(page, GOC);
  await doiVaiTrenMan(page, "admin", "Quản trị kiểm danh bạ");
  await page.goto(`${GOC}#v=source`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() =>
    document.querySelector('[aria-label="Bộ dữ liệu danh mục"]') !== null);

  assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")]
    .some((button) => button.textContent?.trim() === "Người thực hiện")), false,
  "màn Danh mục không còn tab Người thực hiện — danh bạ chuẩn ở Nhân sự & phân công");
  assert.equal(await page.evaluate(() => document.body.innerText.includes("Người cũ")), false,
    "không còn bảng performer legacy nào được dựng");
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")]
    .some((button) => button.textContent?.trim() === "Thêm dòng")), false,
  "không còn nút tạo người thực hiện gọi rpc_upsert_performer đã bị vô hiệu hóa");
  assert.equal(await page.evaluate(() => document.querySelectorAll('button[title="Sửa"], button[title="Xoá"]').length), 0,
    "không còn control sửa/xoá gọi RPC legacy");
  console.log("✅ Màn Danh mục không còn bất kỳ lối mutation performer legacy nào");
} finally {
  await browser.close();
}

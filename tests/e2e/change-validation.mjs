/* E2E tab "Thay đổi" (thẩm định do thay đổi) trên khổ máy tính bảng.
 * Luồng: mở phiếu → gõ mã thiết bị → chọn gợi ý → Lưu → tick đợt thẩm định
 * → Lưu → nhãn thiết bị hiện trên bảng; lỗi xung đột hiện tại chỗ mà nút Lưu
 * không nhảy; nút Làm mới gửi yêu cầu; chế độ chỉ xem không có nút sửa. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const CHANGE_ID = "6862935f-4d90-4eed-bc6f-f8b3bdb9e615";
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || (() => {
  try {
    const env = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
    return env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
  } catch {
    const assets = new URL("../../dist/assets/", import.meta.url);
    for (const name of readdirSync(fileURLToPath(assets))) {
      if (!name.endsWith(".js")) continue;
      const url = readFileSync(fileURLToPath(new URL(name, assets)), "utf8")
        .match(/https:\/\/[a-z0-9-]+\.supabase\.co/i)?.[0];
      if (url) return url;
    }
    return undefined;
  }
})();
if (!supabaseUrl) throw new Error("Không tìm thấy Supabase URL công khai cho E2E thay đổi");

/* Trạng thái giả của máy chủ: đủ để kiểm luồng, luật thật đã kiểm bằng SQL. */
const may = {
  canEdit: true,
  version: 1,
  objects: [],
  linked: [],
  syncStatus: "xong",
  saves: [],
  syncRequests: 0,
};
const PLAN = {
  id: "CCTB01/2026.01-OQ", validation_code: "CCTB01/2026.01-OQ", object_code: "CCTB01",
  validation_type: "OQ", year: 2026, computed_status: "on_track", deadline_validation: "2026-11-20",
};
function banGhi() {
  return {
    id: CHANGE_ID, source_tab: "2026 (2)", change_code: "CC-XSX-2605-001", source_row: 3,
    opened_text: "15/05/2026", department: "XSX", change_class: "Vĩnh viễn",
    change_type: "Trang thiết bị - Nhà Xưởng", change_content: "Bổ sung tank 100L pha chế viên đặt",
    sheet_status: "Đang mở", owner_text: "Quế Anh", folder_link: null, needs_validation: true,
    validation_content: "Thẩm định tank 100 viên đặt", deadline_raw: "30/10/2026",
    deadline_sheet: "2026-10-30", deadline_override: null, deadline: "2026-10-30",
    removed_from_sheet_at: null, handling_status: "cho_xu_ly", note: null, version: may.version,
    updated_at: "2026-10-22T01:43:11.881247+00:00",
    objects: may.objects.map((code) => ({ code, name: "LAF cân nguyên liệu", department: "xsx", area: "A2", line: "Cân chung" })),
    plan_items: may.objects.includes("CCTB01") || may.linked.length
      ? [{ ...PLAN, linked: may.linked.includes(PLAN.id) }] : [],
  };
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

try {
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    // Lỗi xung đột cố ý ở bước 4 không ghi console.error; mọi lỗi khác là hỏng.
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });
  await page.evaluateOnNewDocument(() => { window.__REACT_GRAB_DISABLED__ = true; });
  const { chanNgoai } = await caiGiaLap(page, {
    supabaseUrl,
    kichBan: "day",
    mangNghiemNgat: true,
    previewOrigin: APP_URL,
    suaKho: (store) => {
      store.rpc_change_list = () => ({
        ok: true, can_edit: may.canEdit, can_create_plan: may.canEdit, records: [banGhi()],
        sync: {
          last_ok_at: "2026-10-22T01:43:11+00:00", last_status: may.syncStatus, last_trigger: "lich",
          last_requested_at: null, last_finished_at: null, last_error: null, last_summary: null,
        },
      });
      store.rpc_change_search_objects = (body) => String(body?.p_query ?? "").length >= 2
        ? [{ code: "CCTB01", name: "LAF cân nguyên liệu", department: "xsx", area: "A2", line: "Cân chung" }] : [];
      store.rpc_change_save = (body) => {
        may.saves.push(body);
        if (String(body?.p_note ?? "").includes("xung đột")) {
          return { ok: false, error_code: "VERSION_CONFLICT", error: "x", current_version: may.version + 1 };
        }
        if (body?.p_expected_version !== may.version) {
          return { ok: false, error_code: "VERSION_CONFLICT", error: "x", current_version: may.version };
        }
        may.objects = body.p_object_codes;
        may.linked = body.p_plan_item_ids;
        may.version += 1;
        return { ok: true, version: may.version };
      };
      store.rpc_change_request_sync = () => {
        may.syncRequests += 1;
        may.syncStatus = "cho";
        return { ok: true, run_id: "11111111-1111-4111-8111-111111111111", status: "cho", already: false };
      };
    },
  });
  await nhetPhien(page, { supabaseUrl });
  // Máy tính bảng ngang (iPad 10.2").
  await page.setViewport({ width: 1080, height: 810, hasTouch: true, isMobile: false });
  await page.goto(`${APP_URL}#v=source`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  try {
    await page.waitForSelector('[data-cw-nav="changes"]', { timeout: 15_000 });
  } catch (cause) {
    const evidence = await page.evaluate(() => ({
      hash: location.hash,
      nav: [...document.querySelectorAll("[data-cw-nav]")].map((node) => node.getAttribute("data-cw-nav")),
      body: document.body.innerText.slice(0, 800),
    }));
    throw new Error(`Không thấy tab Thay đổi: ${JSON.stringify({ browserErrors, evidence })}`, { cause });
  }
  await page.click('[data-cw-nav="changes"]');
  await page.waitForFunction(() => document.body.innerText.includes("CC-XSX-2605-001"), { timeout: 15_000 });

  // 1. Bảng
  const bang = await page.$eval("section[aria-labelledby='tdd-heading']", (root) => ({
    heading: root.querySelector("h3")?.textContent?.trim(),
    headers: [...root.querySelectorAll("thead th")].map((node) => node.textContent?.trim()),
    chuaGan: root.innerText.includes("Chưa gắn"),
    lamMoi: [...root.querySelectorAll("button")].some((b) => b.textContent?.includes("Làm mới")),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.equal(bang.heading, "Thẩm định do thay đổi");
  assert.deepEqual(bang.headers, ["Mã thay đổi", "Cần thẩm định", "Thiết bị", "Hạn", "Trạng thái", ""]);
  assert.ok(bang.chuaGan, "phiếu chưa gắn thiết bị phải ghi rõ");
  assert.ok(bang.lamMoi, "QA thấy nút Làm mới");
  assert.ok(bang.overflow <= 1, `bảng không được tràn ngang trên máy tính bảng: ${bang.overflow}`);

  // 2. Gắn thiết bị qua gợi ý
  await page.click('button[aria-label="Sửa CC-XSX-2605-001"]');
  await page.waitForSelector('[role="dialog"]');
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Gõ mã hoặc tên thiết bị");
  await page.type('[role="dialog"] input[aria-label="Gõ mã hoặc tên thiết bị"]', "CCTB");
  await page.waitForSelector(".tdd-goi-y__nut", { timeout: 5_000 });
  // offsetHeight = chiều cao bố cục; getBoundingClientRect bị hiệu ứng phóng to của hộp thoại làm lệch.
  const goiY = await page.$eval(".tdd-goi-y__nut", (b) => ({ text: b.textContent, h: b.offsetHeight }));
  // Gợi ý kèm tên + mã + khu + line để khỏi gắn nhầm thiết bị tên giống nhau.
  assert.match(goiY.text, /LAF cân nguyên liệu/);
  assert.match(goiY.text, /CCTB01 · Khu A2 · Cân chung · XSX/);
  // Hạn lấy thẳng từ sheet: không còn ô chọn ngày.
  assert.equal(await page.$('[role="dialog"] input[type="date"]'), null, "không còn ô chọn hạn");
  assert.match(await page.$eval('[role="dialog"] .tdd-han', (el) => el.textContent), /30\/10\/2026/);
  assert.ok(goiY.h >= 44, `gợi ý phải đủ cao để chạm: ${goiY.h}`);
  await page.click(".tdd-goi-y__nut");
  await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] .tdd-chip')]
    .some((n) => n.textContent?.includes("CCTB01")));
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')]
    .find((b) => b.textContent?.trim() === "Lưu")?.click());
  // Thiết bị mới → hộp thoại ở lại để chọn đợt.
  await page.waitForFunction(() => document.querySelector('[role="dialog"] .tdd-dot__dong'), { timeout: 10_000 });
  assert.deepEqual(may.saves[0].p_object_codes, ["CCTB01"]);
  assert.deepEqual(may.saves[0].p_plan_item_ids, []);
  assert.equal(may.saves[0].p_expected_version, 1);

  // 3. Chọn đợt thẩm định rồi Lưu → đóng hộp thoại, bảng có thiết bị
  await page.click('[role="dialog"] .tdd-dot__dong input[type="checkbox"]');
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')]
    .find((b) => b.textContent?.trim() === "Lưu")?.click());
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 10_000 });
  assert.deepEqual(may.saves[1].p_plan_item_ids, ["CCTB01/2026.01-OQ"]);
  assert.equal(may.saves[1].p_expected_version, 2);
  await page.waitForFunction(() => [...document.querySelectorAll(".tdd-chip")]
    .some((n) => n.textContent === "CCTB01 · LAF cân nguyên liệu"));

  // 4. Lỗi xung đột: báo tại chỗ, nút Lưu không nhảy (chạm lần đầu trúng)
  await page.click('button[aria-label="Sửa CC-XSX-2605-001"]');
  await page.waitForSelector('[role="dialog"]');
  /* Hộp thoại tự đưa con trỏ vào ô tìm thiết bị sau một nhịp; gõ trước nhịp đó thì
     chữ bị chuyển sang ô khác. Chờ con trỏ ổn định rồi mới bấm vào ô ghi chú. */
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Gõ mã hoặc tên thiết bị");
  await page.click("#tdd-ghi-chu");
  await page.type("#tdd-ghi-chu", "thử xung đột");
  assert.equal(await page.$eval("#tdd-ghi-chu", (el) => el.value), "thử xung đột");
  const viTri = () => page.evaluate(() => {
    const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.textContent?.trim() === "Lưu");
    const r = b?.getBoundingClientRect();
    return r ? Math.round(r.top) : null;
  });
  // Đo sau khi hiệu ứng mở hộp thoại (phóng to) chạy xong; đang chạy thì toạ độ còn trôi.
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')
    ?.getAnimations({ subtree: true }).every((a) => a.playState !== "running"));
  const truoc = await viTri();
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')]
    .find((b) => b.textContent?.trim() === "Lưu")?.click());
  await page.waitForFunction(() => document.querySelector(".tdd-loi")?.textContent?.includes("Người khác vừa sửa"),
    { timeout: 10_000 }).catch(async (cause) => {
    const trangThai = await page.evaluate(() => ({
      ghiChu: document.querySelector("#tdd-ghi-chu")?.value,
      luu: [...document.querySelectorAll('[role="dialog"] button')].map((b) => `${b.textContent?.trim()}:${b.disabled}`),
      loi: document.querySelector(".tdd-loi")?.textContent,
      soHop: document.querySelectorAll('[role="dialog"]').length,
    }));
    throw new Error(`Không thấy lỗi xung đột: ${JSON.stringify({ trangThai, saves: may.saves.length })}`, { cause });
  });
  const sau = await viTri();
  assert.equal(sau, truoc, `nút Lưu không được nhảy khi hiện lỗi (${truoc} → ${sau})`);
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')]
    .find((b) => b.textContent?.trim() === "Huỷ")?.click());
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));

  // 5. Làm mới
  await page.evaluate(() => [...document.querySelectorAll("section[aria-labelledby='tdd-heading'] button")]
    .find((b) => b.textContent?.includes("Làm mới"))?.click());
  await page.waitForFunction(() => document.body.innerText.includes("Đang cập nhật từ sheet"), { timeout: 10_000 });
  assert.equal(may.syncRequests, 1);

  // 6. Chỉ xem (vai xưởng): không có Làm mới, nút "Xem", hộp thoại không có Lưu
  may.canEdit = false;
  may.syncStatus = "xong";
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-cw-nav="changes"]', { timeout: 15_000 });
  await page.click('[data-cw-nav="changes"]');
  await page.waitForSelector('button[aria-label="Xem CC-XSX-2605-001"]', { timeout: 15_000 });
  const chiXem = await page.evaluate(() => ({
    lamMoi: [...document.querySelectorAll("section[aria-labelledby='tdd-heading'] button")]
      .some((b) => b.textContent?.includes("Làm mới")),
  }));
  assert.equal(chiXem.lamMoi, false);
  await page.click('button[aria-label="Xem CC-XSX-2605-001"]');
  await page.waitForSelector('[role="dialog"]');
  const hop = await page.evaluate(() => ({
    luu: [...document.querySelectorAll('[role="dialog"] button')].some((b) => b.textContent?.trim() === "Lưu"),
    timThietBi: Boolean(document.querySelector('[role="dialog"] input[aria-label="Gõ mã hoặc tên thiết bị"]')),
    boChip: Boolean(document.querySelector('[role="dialog"] .tdd-chip__bo')),
  }));
  assert.deepEqual(hop, { luu: false, timThietBi: false, boChip: false });

  /* Hai lỗi của môi trường giả lập, không phải của app: realtime không có máy
     chủ (mạng ngoài bị chặn) và trang trống lúc reload chưa có quyền localStorage. */
  const loiApp = browserErrors.filter((e) => !/WebSocket connection to 'wss:\/\/[^']+\/realtime\//.test(e)
    && !/Failed to read the 'localStorage' property from 'Window'/.test(e));
  assert.deepEqual(loiApp, [], "không được có lỗi trình duyệt từ app");
  assert.deepEqual(chanNgoai, [], "E2E thay đổi không được gọi ra ngoài mock Supabase");
  console.log("change validation E2E: pass");
} finally {
  await browser.close();
}

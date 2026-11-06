/* E2E thẻ "Thay đổi / Sai lệch hoàn thành <năm>" ở Tổng quan và Tổng hợp báo cáo.
 * Kiểm: số đúng theo luật (Đã xong / tổng phiếu có hạn trong năm, bỏ Không áp dụng),
 * thẻ nằm đúng lưới trên màn rộng, điện thoại không cuộn ngang, bấm thẻ mở Dữ liệu nguồn,
 * và lỗi tải danh sách hiện lời báo thay vì số giả.
 * Bước 2 (06/11): % Hoàn thành VMP (vòng năm Tổng quan, thẻ Báo cáo) gộp phiếu CHƯA gắn đợt;
 * phiếu đã gắn đợt không đếm trùng; lỗi tải phiếu thì giữ tỉ lệ VMP gốc và ghi "chưa gồm". */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
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
if (!supabaseUrl) throw new Error("Không tìm thấy Supabase URL công khai cho E2E thẻ thay đổi");

const YEAR = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()).slice(0, 4));
let seq = 0;
const phieu = (over) => {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`, record_kind: "thay_doi",
    source_tab: "2026", change_code: `CC-${seq}`, source_row: seq, opened_text: null, department: "XSX",
    change_class: null, change_type: null, change_content: "Nội dung", sheet_status: "Đang mở",
    owner_text: null, folder_link: null, needs_validation: true, validation_content: null,
    deadline_raw: null, deadline_sheet: null, deadline_override: null, deadline: null,
    removed_from_sheet_at: null, handling_status: "cho_xu_ly", note: null, version: 1,
    updated_at: "2026-10-29T01:00:00+00:00", objects: [], plan_items: [], ...over,
  };
};
const RECORDS = [
  phieu({ deadline: `${YEAR}-01-01`, handling_status: "da_xong" }),
  phieu({ deadline: `${YEAR}-12-31`, handling_status: "dang_tham_dinh" }),
  phieu({ deadline: `${YEAR}-01-01`, handling_status: "cho_xu_ly" }), // quá hạn
  phieu({ deadline: `${YEAR - 1}-06-01`, handling_status: "cho_xu_ly" }), // năm khác: không tính
  phieu({ record_kind: "sai_lech", deadline: null }),
  phieu({ record_kind: "sai_lech", deadline: `${YEAR}-05-01`, handling_status: "khong_ap_dung" }),
  // Đã gắn đợt thẩm định → có trong thẻ Sai lệch nhưng KHÔNG cộng thêm vào tỉ lệ VMP.
  phieu({ record_kind: "sai_lech", deadline: `${YEAR}-03-01`, handling_status: "da_xong",
    plan_items: [{ id: "00000000-0000-4000-8000-0000000000aa", validation_code: "TD-1", object_code: "TB-1",
      validation_type: "Tái thẩm định", year: YEAR, computed_status: null, deadline_validation: null, linked: true }] }),
];
/* Phiếu chưa gắn đợt có hạn trong năm: 3 phiếu thay đổi (1 đã xong). */
const PHIEU_GOP = { total: 3, done: 1 };
const tyLe = (done, total) => (total ? Math.round((done / total) * 100) : 0);
const may = { fail: false };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", ...CHROME_GL_ARGS] });
try {
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    // Lỗi cố ý ở bước cuối được listChanges ghi console.error — chỉ chấp nhận đúng dòng đó.
    // Realtime WebSocket tới máy chủ giả không tồn tại là tiếng ồn của môi trường giả lập.
    if (message.text().includes("/realtime/v1/websocket")) return;
    if (message.type() === "error" && !(may.fail && message.text().includes("[thay đổi]"))) {
      browserErrors.push(`console: ${message.text()}`);
    }
  });
  await page.evaluateOnNewDocument(() => { window.__REACT_GRAB_DISABLED__ = true; });
  const { chanNgoai } = await caiGiaLap(page, {
    supabaseUrl, kichBan: "day", mangNghiemNgat: true, previewOrigin: APP_URL,
    suaKho: (store) => {
      store.rpc_change_list = () => (may.fail
        ? { ok: false, error_code: "FORBIDDEN", error: "Không có quyền" }
        : {
          ok: true, can_edit: true, can_create_plan: true, records: RECORDS,
          sync: { last_ok_at: null, last_status: "xong", last_trigger: null, last_requested_at: null,
            last_finished_at: null, last_error: null, last_summary: null },
        });
    },
  });
  await nhetPhien(page, { supabaseUrl });

  const tile = (kind) => page.$eval(`[data-overview-kpi="change-${kind}"]`, (el) => {
    const card = el.closest(".vmp-tile");
    const r = card.getBoundingClientRect();
    return { text: el.textContent.replace(/\s+/g, " ").trim(), x: r.x, y: r.y, w: r.width };
  });

  // 1. Tổng quan, màn rộng.
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => /\d+%|—/.test(document.querySelector('[data-overview-kpi="change-thay_doi"]')?.textContent ?? "")
    && !document.querySelector('[data-overview-kpi="change-thay_doi"]')?.textContent?.includes("Đang tải"), { timeout: 15_000 });
  const td = await tile("thay_doi");
  const sl = await tile("sai_lech");
  const k1 = await page.$eval('[data-overview-kpi="vmp-overdue"]', (el) => el.closest(".vmp-tile").getBoundingClientRect().bottom);
  console.log("Tổng quan:", td.text, "|", sl.text);
  assert.match(td.text, new RegExp(`Thay đổi hoàn thành ${YEAR}`));
  assert.match(td.text, /33%/);
  assert.match(td.text, /1\/3 đã xong · quá hạn 1/);
  assert.match(sl.text, new RegExp(`Sai lệch hoàn thành ${YEAR}`));
  assert.match(sl.text, /100%/);
  assert.match(sl.text, /1\/1 đã xong · 1 chưa có hạn/);
  assert.ok(td.y >= k1, "thẻ Thay đổi phải nằm dưới hàng chỉ số đầu");
  assert.equal(Math.round(td.y), Math.round(sl.y), "hai thẻ cùng một hàng");
  assert.ok(td.w > sl.w * 1.5, "thẻ Thay đổi chiếm 2/3 hàng, Sai lệch 1/3");

  // 1b. Vòng năm: % = (VMP xong + phiếu xong) ÷ (VMP tổng + phiếu tổng).
  const vong = () => page.evaluate(() => ({
    rate: Number(document.querySelector(".vmp-vongnam-loi-tyle")?.textContent?.replace("%", "").trim()),
    done: Number(document.querySelector('[data-overview-metric="completed"] [data-overview-value]')?.textContent),
    total: Number(document.querySelector("[data-overview-total]")?.getAttribute("data-overview-total")),
    note: document.querySelector("[data-overview-change-note]")?.textContent?.trim() ?? null,
  }));
  const v = await vong();
  console.log("Vòng năm:", v);
  assert.ok(v.total > 0, "giả lập phải có hạng mục VMP");
  assert.equal(v.rate, tyLe(v.done + PHIEU_GOP.done, v.total + PHIEU_GOP.total), "vòng năm chưa gộp phiếu đúng luật");
  assert.notEqual(v.rate, tyLe(v.done, v.total), "dữ liệu thử phải làm tỉ lệ gộp khác tỉ lệ gốc");
  assert.equal(v.note, "Tỉ lệ gồm 3 phiếu thay đổi/sai lệch");

  // 2. Bấm thẻ → màn Dữ liệu nguồn (nơi có tab Thay đổi / Sai lệch).
  await page.click('[data-overview-kpi="change-thay_doi"]');
  await page.waitForFunction(() => location.hash.includes("v=source"), { timeout: 10_000 });

  // 3. Điện thoại: không cuộn ngang.
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${APP_URL}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector('[data-overview-kpi="change-sai_lech"]', { timeout: 15_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `điện thoại cuộn ngang ${overflow}px`);

  // 4. Tổng hợp báo cáo.
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}#v=reports`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => /33%/.test(document.querySelector('[data-overview-kpi="change-thay_doi"]')?.textContent ?? ""), { timeout: 15_000 });
  const rTd = await tile("thay_doi");
  console.log("Báo cáo:", rTd.text);
  assert.match(rTd.text, /1\/3 đã xong · quá hạn 1/);
  const heading = await page.evaluate(() => document.body.innerText.includes("DỮ LIỆU BỔ SUNG — phiếu Thay đổi / Sai lệch"));
  assert.ok(heading, "thiếu nhãn hàng dữ liệu bổ sung");
  // StatTile: hàng nhãn → ô số (anh kế tiếp) → dòng phụ.
  const vmpTile = await page.evaluate(() => {
    const o = (re) => {
      const hang = [...document.querySelectorAll(".vmp-tile span")].find((el) => re.test(el.textContent.trim()))?.parentElement;
      return { value: hang?.nextElementSibling?.textContent.trim(), sub: hang?.nextElementSibling?.nextElementSibling?.textContent.trim() };
    };
    return { vmp: o(/^Hoàn thành VMP$/), tongNam: o(/^Tổng hạng mục năm/) };
  });
  console.log("Báo cáo Hoàn thành VMP:", vmpTile);
  const m = vmpTile.vmp.sub?.match(/^(\d+)\/(\d+) · quá hạn \d+ · gồm 3 phiếu thay đổi\/sai lệch$/);
  assert.ok(m, "thẻ Hoàn thành VMP phải ghi 'gồm 3 phiếu thay đổi/sai lệch'");
  assert.equal(Number(m[2]), Number(vmpTile.tongNam.value) + PHIEU_GOP.total, "tổng phải = hạng mục VMP + phiếu chưa gắn đợt");
  assert.equal(vmpTile.vmp.value, `${tyLe(Number(m[1]), Number(m[2]))}%`);

  // 5. Lỗi tải: hiện lời báo, không hiện số giả.
  may.fail = true;
  await page.goto(`${APP_URL}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('[data-overview-kpi="change-thay_doi"]')?.textContent?.includes("Không"), { timeout: 15_000 });
  const err = await tile("thay_doi");
  console.log("Khi lỗi:", err.text);
  assert.doesNotMatch(err.text, /\d+%/);
  await page.waitForFunction(() => document.querySelector("[data-overview-change-note]")?.textContent?.includes("chưa gồm"), { timeout: 15_000 });
  const vErr = await vong();
  console.log("Vòng năm khi lỗi:", vErr);
  assert.equal(vErr.rate, tyLe(vErr.done, vErr.total), "lỗi tải phiếu thì giữ tỉ lệ VMP gốc");

  assert.deepEqual(chanNgoai, [], "không được gọi ra mạng ngoài");
  assert.deepEqual(browserErrors, []);
  console.log("change summary tiles E2E: pass");
} finally {
  await browser.close();
}

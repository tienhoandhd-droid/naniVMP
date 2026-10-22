/* E2E trợ lý VMP (khung chat) trên giả lập Supabase.
 * Bước AI (n8n) bị chặn mạng trong bộ kiểm → kiểm luôn đường dự phòng:
 *   1. Bấm gợi ý → gọi thẳng rpc_tro_ly_tra_loi, hiện "Tôi hiểu là", bảng, nguồn.
 *   2. Gõ câu phổ biến khi AI không phản hồi → đoán từ khoá, có ghi chú.
 *   3. Thiết bị khớp nhiều → nút hỏi lại → bấm → ra bảng của đúng thiết bị.
 *   4. Câu không đoán được → báo thật + gợi ý, không bịa.
 *   5. Đánh giá 👍 gửi đúng id nhật ký.
 *   6. Máy chủ từ chối tham số → hiện lý do tiếng Việt.
 * Luật số liệu/quyền thật đã kiểm bằng tests/sql/tro-ly-vmp-moi.sql. */
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
if (!supabaseUrl) throw new Error("Không tìm thấy Supabase URL công khai cho E2E trợ lý");

const may = { hoi: [], nhatKy: [], danhGia: [] };
const COT = [{ key: "ma", nhan: "Mã thẩm định" }, { key: "doi_tuong", nhan: "Đối tượng" },
  { key: "han", nhan: "Hạn đích VMP" }, { key: "con", nhan: "Còn" }];
const dong = (i) => ({ ma: `KNTB${100 + i}/2026.01-OQ`, doi_tuong: `KNTB${100 + i} · Máy thử ${i}`,
  han: "01/10/2026", con: `trễ ${21 - i} ngày` });

function traLoiGia(body) {
  const congCu = body?.p_cong_cu;
  const thamSo = body?.p_tham_so ?? {};
  may.hoi.push({ congCu, thamSo });
  const chung = { ok: true, cong_cu: congCu, tham_so: thamSo, nguon: "Kế hoạch VMP năm 2026 · hạn đích VMP",
    luc: "2026-10-22T08:00:00Z" };
  if (congCu === "qua_han" && thamSo.bo_phan === "abc") return { ok: false, loi: "Bộ phận phải là một trong: xsx, cd, kho, qc, rd, qa." };
  if (congCu === "qua_han") {
    return { ...chung, hieu_la: `Quá hạn${thamSo.bo_phan === "xsx" ? " · Xưởng sản xuất" : ""}`,
      tra_loi: "Có 12 hạng mục quá hạn đích VMP.",
      bang: { cot: COT, dong: Array.from({ length: 12 }, (_, i) => dong(i)), tong_dong: 12 },
      goi_y: [{ nhan: "Chia theo bộ phận", cong_cu: "tien_do", tham_so: { theo: "bo_phan" } }] };
  }
  if (congCu === "tien_do") return { ok: false, loi: "Chỉ chia được theo bộ phận, nhóm công việc, khu vực hoặc loại." };
  if (congCu === "thiet_bi" && thamSo.tu_khoa === "TANK12") {
    return { ...chung, hieu_la: "Thiết bị / đối tượng: tank", tra_loi: "Có 2 đối tượng khớp \"tank\". Bạn chọn một:",
      hoi_lai: [
        { nhan: "TANK01 · Tank 1000 Mix (Tank 1) · C1", cong_cu: "thiet_bi", tham_so: { tu_khoa: "TANK01" } },
        { nhan: "TANK03 · Tank 1000 Mix (Tank 3) · C1", cong_cu: "thiet_bi", tham_so: { tu_khoa: "TANK03" } },
      ] };
  }
  if (congCu === "thiet_bi") {
    return { ...chung, hieu_la: `Thiết bị / đối tượng: ${thamSo.tu_khoa} · Tank 1000 Mix (Tank 3)`,
      tra_loi: "Tank 1000 Mix (Tank 3) (TANK03) có 1 hạng mục năm 2026.",
      bang: { cot: COT, dong: [{ ma: "TANK03/2026.01-PQ", doi_tuong: "TANK03 · Tank 1000 Mix (Tank 3)", han: "30/11/2026", con: "còn 39 ngày" }], tong_dong: 1 } };
  }
  return { ...chung, hieu_la: "Tổng quan năm 2026", tra_loi: "Năm 2026 có 448 hạng mục: đã xong 95 (21%).", so_lieu: {} };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", ...CHROME_GL_ARGS] });

try {
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    // Bước AI bị chặn mạng là cố ý → lỗi "[trợ lý] bước hiểu câu hỏi" là đúng kịch bản.
    if (message.type() === "error" && !/\[trợ lý\] bước hiểu câu hỏi|ERR_FAILED|net::|WebSocket connection/.test(message.text())) {
      browserErrors.push(`console: ${message.text()}`);
    }
  });
  await page.evaluateOnNewDocument(() => { window.__REACT_GRAB_DISABLED__ = true; });
  const { chanNgoai } = await caiGiaLap(page, {
    supabaseUrl, kichBan: "day", mangNghiemNgat: true, previewOrigin: APP_URL,
    suaKho: (store) => {
      store.rpc_tro_ly_tra_loi = traLoiGia;
      store.rpc_tro_ly_ghi_nhat_ky = (body) => {
        may.nhatKy.push(body);
        return { ok: true, id: may.nhatKy.length };
      };
      store.rpc_tro_ly_danh_gia = (body) => {
        may.danhGia.push(body);
        return { ok: true };
      };
    },
  });
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1280, height: 860 });
  await page.goto(`${APP_URL}#v=today`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".vmp-chat-fab", { timeout: 20_000 });
  await page.click(".vmp-chat-fab");
  await page.waitForSelector(".vmp-chat-panel");
  const soTinAi = () => page.$$eval(".vmp-chat-panel .vmp-tl-msg", (n) => n.length);
  const tinCuoi = () => page.$$eval(".vmp-chat-panel .vmp-tl-msg", (n) => n.at(-1)?.innerText ?? "");
  const choTin = async (n) => page.waitForFunction((k) =>
    document.querySelectorAll(".vmp-chat-panel .vmp-tl-msg").length >= k
    && !document.querySelector('.vmp-chat-panel [role="status"]'), { timeout: 20_000 }, n);
  const bamNut = (chu) => page.evaluate((c) => {
    const b = [...document.querySelectorAll(".vmp-chat-panel button")].find((x) => x.textContent?.trim() === c);
    if (!b) throw new Error(`không thấy nút ${c}`);
    b.click();
  }, chu);
  const hoi = async (cau) => {
    const truoc = await soTinAi();
    await page.type('.vmp-chat-panel textarea[aria-label="Nội dung câu hỏi"]', cau);
    await page.keyboard.press("Enter");
    await choTin(truoc + 2);
  };

  // 1. Gợi ý → RPC thẳng
  await bamNut("Hạng mục quá hạn");
  await choTin(2);
  let t = await tinCuoi();
  assert.match(t, /Tôi hiểu là: Quá hạn/);
  assert.match(t, /Có 12 hạng mục quá hạn đích VMP/);
  assert.match(t, /Nguồn: Kế hoạch VMP năm 2026/);
  assert.equal(await page.$$eval(".vmp-chat-panel .vmp-tl-bang > div", (n) => n.length), 8, "gọn 8 dòng đầu");
  await bamNut("Xem cả 12 dòng");
  assert.equal(await page.$$eval(".vmp-chat-panel .vmp-tl-bang > div", (n) => n.length), 12);
  assert.deepEqual(may.hoi.at(-1), { congCu: "qua_han", thamSo: {} });
  await page.waitForFunction(() => document.querySelector('.vmp-chat-panel button[aria-label="Câu trả lời đúng ý"]'));
  assert.equal(may.nhatKy.at(-1).p_duong, "goi_y");

  // 5. Đánh giá
  await page.click('.vmp-chat-panel button[aria-label="Câu trả lời đúng ý"]');
  await page.waitForFunction(() => document.querySelector(".vmp-chat-panel")?.innerText.includes("Đã ghi nhận đánh giá"));
  assert.deepEqual(may.danhGia.at(-1), { p_id: 1, p_diem: 1 });

  // 2. AI không phản hồi → đoán từ khoá
  await hoi("xưởng sản xuất có gì quá hạn");
  t = await tinCuoi();
  assert.match(t, /Tôi hiểu là: Quá hạn · Xưởng sản xuất/);
  assert.match(t, /đoán theo từ khoá/);
  assert.deepEqual(may.hoi.at(-1), { congCu: "qua_han", thamSo: { bo_phan: "xsx" } });
  assert.equal(may.nhatKy.at(-1).p_duong, "doan_nhanh");

  // 3. Thiết bị khớp nhiều → nút hỏi lại → bấm → bảng của đúng thiết bị
  await hoi("TANK12 thế nào rồi");
  assert.match(await tinCuoi(), /Có 2 đối tượng khớp/);
  const n3 = await soTinAi();
  await bamNut("TANK03 · Tank 1000 Mix (Tank 3) · C1");
  await choTin(n3 + 2);
  t = await tinCuoi();
  assert.match(t, /TANK03\/2026\.01-PQ/);
  assert.deepEqual(may.hoi.at(-1), { congCu: "thiet_bi", thamSo: { tu_khoa: "TANK03" } });

  // 4. Câu không đoán được → nói thật, có gợi ý; bấm gợi ý trong tin lỗi vẫn chạy
  await hoi("CSA của FDA khác gì CSV");
  assert.match(await tinCuoi(), /Bạn bấm một gợi ý bên dưới/);
  assert.equal(may.nhatKy.at(-1).p_duong, "loi");
  const n4 = await soTinAi();
  await page.evaluate(() => {
    const tin = [...document.querySelectorAll(".vmp-chat-panel .vmp-tl-msg")].at(-1);
    [...tin.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Tổng quan năm nay")?.click();
  });
  await choTin(n4 + 2);
  assert.match(await tinCuoi(), /Năm 2026 có 448 hạng mục/);

  // 6. Máy chủ từ chối → hiện lý do tiếng Việt (gợi ý "Chia theo bộ phận" ở tin đầu)
  const n6 = await soTinAi();
  await page.evaluate(() => {
    const b = [...document.querySelectorAll(".vmp-chat-panel button")].find((x) => x.textContent?.trim() === "Chia theo bộ phận");
    b?.click();
  });
  await choTin(n6 + 2);
  assert.match(await tinCuoi(), /Chỉ chia được theo bộ phận/);

  // Không gọi ra ngoài trừ n8n (bị chặn có chủ đích).
  const ngoai = chanNgoai.filter((u) => !/n8n|webhook/.test(u));
  assert.deepEqual(ngoai, [], `gọi ra ngoài: ${ngoai.join(", ")}`);
  assert.deepEqual(browserErrors, []);
  console.log("✅ tro-ly: gợi ý → SQL, đoán từ khoá khi AI không phản hồi, xem đủ bảng, đánh giá, báo thật khi không hiểu");
} finally {
  await browser.close();
}

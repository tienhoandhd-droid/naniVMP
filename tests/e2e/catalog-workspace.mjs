/* =====================================================================
 *  catalog-workspace.mjs — kiểm workspace Danh mục & Nhập liệu (Đợt B Task 6)
 *  ---------------------------------------------------------------------
 *  Chạy trên Supabase giả lập (gia-lap-supabase.mjs) — không request nào
 *  ra ngoài. Bộ này kiểm HỢP ĐỒNG của workspace sáu mục:
 *
 *   1. Sáu mục điều hướng đúng thứ tự: objects · products · alerts ·
 *      import · pending · history. Không còn "Người thực hiện".
 *   2. Quyền quyết định nút: đủ quyền thấy Thêm/Nhập Excel/Chờ áp dụng;
 *      viewer không thấy bất kỳ lối ghi nào.
 *   3. Bảng ngữ nghĩa thật: <caption>, header dính; mở dòng thấy chi tiết.
 *   4. Điện thoại 390×844: bảng ẩn hẳn, thẻ hiện, CÙNG số dòng và cùng
 *      hành động — một logic, hai cách trình bày.
 *   5. 1366×768 và 1093×720 không tràn ngang.
 *   6. Deep-link từ Tiến độ (nút "Mở trong Danh mục & Nhập liệu") mở đúng
 *      đối tượng rồi TỰ XOÁ — quay lại không bị dính bộ lọc cũ.
 *
 *  Chạy: bash scripts/with-preview.sh -- npm run e2e:catalog
 * ===================================================================== */
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";

const URL_SB = (() => {
  const noi = readFileSync(new URL("../../.env.local", import.meta.url).pathname, "utf8");
  const m = noi.match(/^VITE_SUPABASE_URL=(.+)$/m);
  if (!m) throw new Error(".env.local thiếu VITE_SUPABASE_URL");
  return m[1].trim();
})();

let soDat = 0;
let soHong = 0;

function kiem(dieuKien, ten, chiTiet = "") {
  if (dieuKien) { soDat += 1; return; }
  soHong += 1;
  console.error(`  ✗ ${ten}${chiTiet ? ` — ${chiTiet}` : ""}`);
}

const cho = (ms) => new Promise((r) => setTimeout(r, ms));

/** Quyền chỉ-đọc: mọi màn xem được nhưng không có hành động ghi nào. */
function quyenViewer(kho) {
  const goc = kho.rpc_my_ui_access;
  const screens = {};
  for (const [id, q] of Object.entries(goc.screens)) {
    screens[id] = { ...q, actions: ["view"] };
  }
  kho.rpc_my_ui_access = { ...goc, business_role: "viewer", screens };
}

async function moTrang(trinhDuyet, { hash = "source", rong = 1440, cao = 900, suaKho, isMobile = false } = {}) {
  const trang = await trinhDuyet.newPage();
  const loiConsole = [];
  trang.on("console", (m) => {
    if (m.type() === "error" && !/net::ERR_|realtime|WebSocket/i.test(m.text())) {
      loiConsole.push(m.text().slice(0, 110));
    }
  });
  trang.on("pageerror", (e) => loiConsole.push(`pageerror: ${String(e.message).slice(0, 110)}`));
  const { chanNgoai } = await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day", suaKho });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: rong, height: cao, isMobile });
  await trang.goto(`${GOC}#v=${hash}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await cho(2400);
  return { trang, loiConsole, chanNgoai };
}

const trinhDuyet = await puppeteer.launch({
  executablePath: CHROME, headless: "new", args: ["--no-sandbox"],
});

/* ---- 1. Đủ quyền: sáu mục, nút ghi, bảng ngữ nghĩa ------------------ */
{
  console.log("Đủ quyền — cấu trúc sáu mục:");
  const { trang, loiConsole, chanNgoai } = await moTrang(trinhDuyet);

  const kq = await trang.evaluate(() => {
    const nav = document.querySelector('[aria-label="Bộ dữ liệu danh mục"]');
    const muc = [...(nav?.querySelectorAll("[data-cw-nav]") ?? [])];
    const chuTrang = document.querySelector("main")?.innerText ?? document.body.innerText;
    const caption = document.querySelector(".lp-smart-table caption");
    const th = document.querySelector(".lp-smart-table th");
    const timKiem = document.querySelector('input[aria-label="Tìm trong danh mục"]');
    const nutThem = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Thêm");
    return {
      thuTu: muc.map((b) => b.dataset.cwNav).join(","),
      nhanNav: muc.map((b) => b.textContent.trim()),
      coThem: !!nutThem,
      coNhapExcel: muc.some((b) => b.textContent.includes("Nhập Excel")),
      coNguoiThucHien: chuTrang.includes("Người thực hiện"),
      caption: caption?.textContent?.trim() ?? "",
      thDinh: th ? getComputedStyle(th).position : "",
      coTimKiem: !!timKiem,
      soH1: document.querySelectorAll("h1").length,
      phuDe: chuTrang.includes("Dữ liệu gốc Supabase"),
    };
  });

  kiem(kq.thuTu === "objects,products,alerts,import,pending,history",
    "sáu mục nav đúng thứ tự", kq.thuTu || "(không thấy nav)");
  kiem(kq.coThem, "đủ quyền thấy nút Thêm");
  kiem(kq.coNhapExcel, "đủ quyền thấy mục Nhập Excel");
  kiem(!kq.coNguoiThucHien, "không còn chữ 'Người thực hiện' trên màn");
  kiem(kq.caption === "Đối tượng nguồn", "bảng có <caption> Đối tượng nguồn", kq.caption);
  kiem(kq.thDinh === "sticky", "header bảng dính khi cuộn", kq.thDinh);
  kiem(kq.coTimKiem, "có ô tìm kiếm có nhãn");
  kiem(kq.soH1 === 1, "đúng một h1", `thấy ${kq.soH1}`);
  kiem(kq.phuDe, "phụ đề nêu Supabase là dữ liệu gốc");

  /* Mở dòng chi tiết. */
  await trang.evaluate(() => {
    const nut = document.querySelector(".lp-smart-table__toggle");
    if (nut) nut.click();
  });
  await cho(400);
  const chiTiet = await trang.evaluate(() => {
    const o = document.querySelector(".lp-smart-table__detail");
    return {
      co: !!o,
      chu: o?.textContent ?? "",
      coSua: !!o?.querySelector("[data-cw-sua]"),
    };
  });
  kiem(chiTiet.co, "mở được dòng chi tiết");
  kiem(chiTiet.chu.includes("Nhóm công việc"), "chi tiết có nhóm công việc");
  kiem(chiTiet.chu.includes("Điểm trọng yếu") || chiTiet.chu.includes("trọng yếu"),
    "chi tiết có điểm trọng yếu");
  kiem(chiTiet.coSua, "chi tiết có hành động Sửa cho người đủ quyền");

  /* Chuyển sang Sản phẩm GMP — bảng riêng, cột riêng, dữ liệu server. */
  await trang.evaluate(() => document.querySelector('[data-cw-nav="products"]')?.click());
  await cho(1200);
  const sp = await trang.evaluate(() => ({
    caption: document.querySelector(".lp-smart-table caption")?.textContent?.trim() ?? "",
    soDong: document.querySelectorAll(".lp-smart-table tbody tr").length,
  }));
  kiem(sp.caption === "Sản phẩm GMP", "chuyển được sang bảng Sản phẩm GMP", sp.caption);
  kiem(sp.soDong > 0, "bảng sản phẩm có dữ liệu từ RPC danh mục", `${sp.soDong} dòng`);

  kiem(loiConsole.length === 0, "console sạch", loiConsole[0] || "");
  kiem(chanNgoai.length === 0, "không gọi ra ngoài môi trường cách ly", chanNgoai[0] || "");
  await trang.close();
}

/* ---- 2. Viewer: không một lối ghi nào ------------------------------- */
{
  console.log("\nViewer — không lối ghi:");
  const { trang } = await moTrang(trinhDuyet, { suaKho: quyenViewer });

  const kq = await trang.evaluate(() => {
    const nav = document.querySelector('[aria-label="Bộ dữ liệu danh mục"]');
    const muc = [...(nav?.querySelectorAll("[data-cw-nav]") ?? [])].map((b) => b.dataset.cwNav);
    const nutThem = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Thêm");
    return {
      muc: muc.join(","),
      coThem: !!nutThem,
      coSua: !!document.querySelector("[data-cw-sua]"),
      soDong: document.querySelectorAll(".lp-smart-table tbody tr").length,
    };
  });

  kiem(kq.muc === "objects,products,alerts,history",
    "viewer chỉ thấy bốn mục đọc", kq.muc || "(không thấy nav)");
  kiem(!kq.coThem, "viewer không thấy nút Thêm");
  kiem(!kq.coSua, "viewer không thấy nút Sửa");
  kiem(kq.soDong > 0, "viewer vẫn đọc được dữ liệu", `${kq.soDong} dòng`);
  await trang.close();
}

/* ---- 3. Điện thoại 390×844: thẻ thay bảng, cùng dữ liệu -------------- */
{
  console.log("\nĐiện thoại 390×844:");
  const { trang } = await moTrang(trinhDuyet, { rong: 390, cao: 844, isMobile: true });

  const kq = await trang.evaluate(() => {
    const bang = document.querySelector(".lp-smart-table");
    const ds = document.querySelectorAll(".lp-mobile-task-list");
    const the = document.querySelectorAll(".lp-mobile-task");
    const nutNho = [...document.querySelectorAll(".lp-mobile-task button")]
      .filter((b) => b.getBoundingClientRect().height < 44).length;
    return {
      bangAn: !bang || getComputedStyle(bang).display === "none",
      soDanhSach: ds.length,
      soThe: the.length,
      soDongBang: document.querySelectorAll(".lp-smart-table tbody tr").length,
      nutNho,
      tranNgang: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  kiem(kq.bangAn, "bảng desktop ẩn hẳn trên điện thoại");
  kiem(kq.soDanhSach === 1, "đúng một danh sách thẻ có nhãn", `thấy ${kq.soDanhSach}`);
  kiem(kq.soThe > 0, "có thẻ dữ liệu", `${kq.soThe} thẻ`);
  kiem(kq.soThe === kq.soDongBang, "thẻ và bảng cùng số dòng — một view-model",
    `thẻ ${kq.soThe} vs bảng ${kq.soDongBang}`);
  kiem(kq.nutNho === 0, "mọi nút trong thẻ đạt 44px", `${kq.nutNho} nút chưa đạt`);
  kiem(kq.tranNgang <= 1, "không tràn ngang", `${kq.tranNgang}px`);
  await trang.close();
}

/* ---- 4. Hai khổ desktop hẹp không tràn ngang ------------------------ */
for (const [rong, cao] of [[1366, 768], [1093, 720]]) {
  console.log(`\nKhổ ${rong}×${cao}:`);
  const { trang } = await moTrang(trinhDuyet, { rong, cao });
  const tran = await trang.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  kiem(tran <= 1, `không tràn ngang ở ${rong}×${cao}`, `${tran}px`);
  await trang.close();
}

/* ---- 5. Deep-link từ Tiến độ mở đúng đối tượng rồi tự xoá ----------- */
{
  console.log("\nDeep-link từ Tiến độ:");
  const { trang } = await moTrang(trinhDuyet, { hash: "progress" });

  /* Sang cách nhóm "Theo đối tượng", mở một đối tượng, bấm lối nhảy. */
  await trang.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Theo đối tượng")?.click();
  });
  await cho(1200);
  const maDaMo = await trang.evaluate(() => {
    const dong = [...document.querySelectorAll("button")]
      .find((b) => /^TB-\d/.test(b.textContent.trim()));
    if (!dong) return null;
    const ma = dong.textContent.trim().match(/TB-\d+/)?.[0] ?? null;
    dong.click();
    return ma;
  });
  await cho(600);
  const daBam = await trang.evaluate(() => {
    const nut = [...document.querySelectorAll("button")]
      .find((b) => b.textContent.includes("Mở trong Danh mục"));
    if (!nut) return false;
    nut.click();
    return true;
  });
  await cho(2000);

  const kq = await trang.evaluate(() => ({
    navObjects: document.querySelector('[data-cw-nav="objects"]')?.getAttribute("aria-pressed"),
    timKiem: document.querySelector('input[aria-label="Tìm trong danh mục"]')?.value ?? "",
    coChiTiet: !!document.querySelector(".lp-smart-table__detail"),
  }));
  kiem(daBam, "có lối nhảy 'Mở trong Danh mục & Nhập liệu' ở Tiến độ");
  kiem(kq.navObjects === "true", "deep-link mở đúng mục Đối tượng");
  kiem(maDaMo !== null && kq.timKiem === maDaMo,
    "ô tìm được điền sẵn mã đối tượng", `"${kq.timKiem}" vs "${maDaMo}"`);
  kiem(kq.coChiTiet, "dòng đối tượng được mở sẵn chi tiết");

  /* Tự xoá: rời sang Sản phẩm rồi quay lại — không dính bộ lọc cũ. */
  await trang.evaluate(() => document.querySelector('[data-cw-nav="products"]')?.click());
  await cho(700);
  await trang.evaluate(() => document.querySelector('[data-cw-nav="objects"]')?.click());
  await cho(900);
  const sau = await trang.evaluate(() => ({
    timKiem: document.querySelector('input[aria-label="Tìm trong danh mục"]')?.value ?? "",
  }));
  kiem(sau.timKiem === "", "deep-link chỉ áp một lần — quay lại không dính bộ lọc cũ",
    `"${sau.timKiem}"`);
  await trang.close();
}

await trinhDuyet.close();

console.log(`\n${"─".repeat(52)}`);
console.log(`${soDat} đạt · ${soHong} hỏng`);
if (soHong > 0) { console.error("KHÔNG ĐẠT."); process.exit(1); }
console.log("ĐẠT.");

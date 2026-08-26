/* =====================================================================
 *  catalog-workspace.mjs — kiểm workspace Danh mục & Nhập liệu (Đợt B Task 6)
 *  ---------------------------------------------------------------------
 *  Chạy trên Supabase giả lập (gia-lap-supabase.mjs) — không request nào
 *  ra ngoài. Bộ này kiểm HỢP ĐỒNG của workspace sáu mục:
 *
 *   1. Sáu mục điều hướng đúng thứ tự: objects · products · alerts ·
 *      import · pending · history. Không còn "Người thực hiện".
 *   2. Quyền quyết định nút: đủ quyền thấy Thêm/Nhập Excel/Chờ áp dụng;
 *      nhân viên xưởng không thấy bất kỳ lối ghi nào và không mở Lịch sử.
 *   3. Bảng ngữ nghĩa thật: <caption>, header dính; mở dòng thấy chi tiết.
 *   4. Điện thoại 390×844: bảng ẩn hẳn, thẻ hiện, CÙNG số dòng và cùng
 *      hành động — một logic, hai cách trình bày.
 *   5. 1366×768 và 1093×720 không tràn ngang.
 *   6. Deep-link từ Tiến độ (nút "Mở trong Dữ liệu nguồn") mở đúng
 *      đối tượng rồi TỰ XOÁ — quay lại không bị dính bộ lọc cũ.
 *
 *  Chạy: bash scripts/with-preview.sh -- npm run e2e:catalog
 * ===================================================================== */
import { readFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/** Nhân viên xưởng là persona chỉ-đọc cho Danh mục: không có audit. */
function quyenNhanVienXuong(kho) {
  const goc = kho.rpc_my_ui_access;
  const screens = {};
  for (const [id, q] of Object.entries(goc.screens)) {
    screens[id] = { ...q, actions: ["view"] };
  }
  screens.audit = { can_view: false, scope: "none", actions: [] };
  kho.rpc_my_ui_access = { ...goc, business_role: "workshop_staff", screens };
}

function quyenQuanLyQa(kho) {
  const goc = kho.rpc_my_ui_access;
  kho.rpc_my_ui_access = { ...goc, business_role: "qa_manager" };
}

async function moTrang(trinhDuyet, { hash = "source", rong = 1440, cao = 900, suaKho, isMobile = false } = {}) {
  const trang = await trinhDuyet.newPage();
  const loiConsole = [];
  trang.on("console", (m) => {
    if (m.type() !== "error") return;
    /* Kèm URL nguồn lỗi: "Failed to load resource: 404" mà không có URL
       thì flake trên CI không thể chẩn đoán (đã dính một lần). Font
       Google là thứ duy nhất được phép ra mạng ngoài — CDN của nó thi
       thoảng 404 một biến thể, không phải lỗi của app. */
    const url = m.location()?.url || "";
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
    if (/net::ERR_|realtime|WebSocket/i.test(m.text())) return;
    loiConsole.push(`${m.text().slice(0, 90)} @ ${url.slice(0, 90)}`);
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

/* ---- Hợp đồng V2: ghi đè deadline hạng mục đã có tiến độ ------------- */
const CHANGE_ID_V2 = "change-v2-progressed";
const REVISION_V2 = 41;
const MA_HANG_MUC_V2 = "CCTB01/2026.01-PQ";
const VERSION_HANG_MUC_V2 = 7;
const LY_DO_AP_V2 = "Xác nhận theo biên bản QA-26/08";

const nhanChonDeadlineV2 = `Chọn cập nhật deadline ${MA_HANG_MUC_V2}`;

async function moXemTruocDeadlineV2(applyResult) {
  const applyBodies = [];
  const pageState = await moTrang(trinhDuyet, {
    suaKho(kho) {
      kho.rpc_apply_catalog_change_v2 = (body) => {
        applyBodies.push(body);
        return applyResult;
      };
    },
  });
  const { trang } = pageState;

  await trang.waitForSelector("[data-cw-sua]", { timeout: 10_000 });
  await trang.click("[data-cw-sua]");
  await trang.waitForSelector("#cof-frequency_months", { timeout: 10_000 });
  await trang.select("#cof-frequency_months", "6");
  await trang.waitForSelector("#cof-ly-do", { timeout: 10_000 });
  await trang.type("#cof-ly-do", "Điều chỉnh tần suất theo hồ sơ QA");
  await trang.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => button.textContent?.trim() === "Lưu" && !button.disabled), { timeout: 10_000 });
  await trang.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Lưu")?.click());

  await trang.waitForFunction((label) => [...document.querySelectorAll("div")]
    .some((node) => node.textContent?.trim() === "Ảnh hưởng tới timeline")
    && [...document.querySelectorAll('input[type="checkbox"]')]
      .some((input) => input.getAttribute("aria-label") === label),
  { timeout: 10_000 }, nhanChonDeadlineV2);

  return { ...pageState, applyBodies };
}

async function chuanBiApDeadlineV2(trang) {
  await trang.evaluate((label) => {
    const candidate = [...document.querySelectorAll('input[type="checkbox"]')]
      .find((input) => input.getAttribute("aria-label") === label);
    candidate?.click();
  }, nhanChonDeadlineV2);
  await trang.waitForFunction((label) => [...document.querySelectorAll('input[type="checkbox"]')]
    .some((input) => input.getAttribute("aria-label") === label && input.checked),
  { timeout: 10_000 }, nhanChonDeadlineV2);

  const reasonSelector = 'input[placeholder="Câu này đi vào nhật ký, người sau đọc để hiểu vì sao timeline đổi."]';
  await trang.type(reasonSelector, LY_DO_AP_V2);
  await trang.waitForFunction((selector, reason) => document.querySelector(selector)?.value === reason,
    { timeout: 10_000 }, reasonSelector, LY_DO_AP_V2);

  await trang.evaluate(() => {
    const label = [...document.querySelectorAll("label")]
      .find((node) => node.textContent?.includes("Tôi xác nhận chỉ cập nhật các deadline kế hoạch đã chọn"));
    label?.querySelector('input[type="checkbox"]')?.click();
  });
  await trang.waitForFunction((label, selector, reason) => {
    const candidate = [...document.querySelectorAll('input[type="checkbox"]')]
      .find((input) => input.getAttribute("aria-label") === label);
    const confirmation = [...document.querySelectorAll("label")]
      .find((node) => node.textContent?.includes("Tôi xác nhận chỉ cập nhật các deadline kế hoạch đã chọn"))
      ?.querySelector('input[type="checkbox"]');
    return candidate?.checked === true
      && document.querySelector(selector)?.value === reason
      && confirmation?.checked === true
      && [...document.querySelectorAll("button")]
        .some((button) => button.textContent?.trim() === "Áp vào timeline" && !button.disabled);
  }, { timeout: 10_000 }, nhanChonDeadlineV2, reasonSelector, LY_DO_AP_V2);
}

async function bamApDeadlineV2(trang) {
  await trang.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Áp vào timeline")?.click());
}

function expectedApplyBodyV2() {
  return {
    p_change_id: CHANGE_ID_V2,
    p_reason: LY_DO_AP_V2,
    p_expected_timeline_revision: REVISION_V2,
    p_deadline_overrides: [{ validation_code: MA_HANG_MUC_V2, expected_item_version: VERSION_HANG_MUC_V2 }],
    p_override_confirmed: true,
  };
}

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
      phuDe: chuTrang.includes("Dữ liệu nguồn"),
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
  kiem(kq.phuDe, "phụ đề nêu đây là dữ liệu nguồn");

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

/* ---- 2. Nhân viên xưởng: không một lối ghi hoặc audit nào ------------ */
{
  console.log("\nNhân viên xưởng — không lối ghi:");
  const { trang } = await moTrang(trinhDuyet, { suaKho: quyenNhanVienXuong });

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

  kiem(kq.muc === "objects,products,alerts",
    "nhân viên xưởng không thấy Lịch sử audit", kq.muc || "(không thấy nav)");
  kiem(!kq.coThem, "nhân viên xưởng không thấy nút Thêm");
  kiem(!kq.coSua, "nhân viên xưởng không thấy nút Sửa");
  kiem(kq.soDong > 0, "nhân viên xưởng vẫn đọc được dữ liệu", `${kq.soDong} dòng`);
  await trang.close();
}

/* ---- 2b. Quản lý QA vẫn được đọc Lịch sử ---------------------------- */
{
  console.log("\nQuản lý QA — còn Lịch sử:");
  const { trang } = await moTrang(trinhDuyet, { suaKho: quyenQuanLyQa });
  const coLichSu = await trang.evaluate(() => !!document.querySelector('[data-cw-nav="history"]'));
  kiem(coLichSu, "quản lý QA vẫn thấy mục Lịch sử");
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
  kiem(daBam, "có lối nhảy 'Mở trong Dữ liệu nguồn' ở Tiến độ");
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

/* ---- 6. Nhập Excel: tải mẫu, chặn file sai, xem trước, Ghi bị chặn --- */
{
  console.log("\nNhập Excel:");

  /* File mẫu dựng bằng CHÍNH generator của app (qua tsx). */
  const thuMucMau = mkdtempSync(join(tmpdir(), "vmp-mau-"));
  execFileSync(process.execPath,
    ["--import", "tsx", new URL("./tao-mau-catalog.mjs", import.meta.url).pathname, thuMucMau],
    { stdio: "pipe" });

  const { trang } = await moTrang(trinhDuyet);

  /* Đếm mọi request staging — file sai cấu trúc không được sinh RPC nào. */
  const gọiStaging = [];
  trang.on("request", (req) => {
    if (req.url().includes("rpc_stage_catalog_import")) gọiStaging.push(req.url());
  });

  await trang.evaluate(() => document.querySelector('[data-cw-nav="import"]')?.click());
  await cho(800);

  /* 6a. Nút tải với đúng tên file cho từng dataset. */
  const taiVe = await trang.evaluate(() => ({
    mau: document.querySelector('[data-cw-taive="mau"]')?.getAttribute("data-cw-ten-file") ?? "",
    hienTai: document.querySelector('[data-cw-taive="hientai"]')?.getAttribute("data-cw-ten-file") ?? "",
  }));
  kiem(taiVe.mau === "VMP_Mau_Doi_Tuong_Goc_v1.xlsx",
    "tên file mẫu trống đúng hợp đồng", taiVe.mau);
  kiem(taiVe.hienTai === "VMP_Doi_Tuong_Goc_Hien_Tai_v1.xlsx",
    "tên file dữ liệu hiện tại đúng hợp đồng", taiVe.hienTai);

  await trang.evaluate(() =>
    document.querySelector('[data-cw-imp-dataset="products_gmp"]')?.click());
  await cho(400);
  const taiVeSP = await trang.evaluate(() => ({
    mau: document.querySelector('[data-cw-taive="mau"]')?.getAttribute("data-cw-ten-file") ?? "",
    hienTai: document.querySelector('[data-cw-taive="hientai"]')?.getAttribute("data-cw-ten-file") ?? "",
  }));
  kiem(taiVeSP.mau === "VMP_Mau_San_Pham_GMP_v1.xlsx",
    "tên file mẫu sản phẩm đúng hợp đồng", taiVeSP.mau);
  kiem(taiVeSP.hienTai === "VMP_San_Pham_GMP_Hien_Tai_v1.xlsx",
    "tên file sản phẩm hiện tại đúng hợp đồng", taiVeSP.hienTai);
  await trang.evaluate(() =>
    document.querySelector('[data-cw-imp-dataset="source_objects"]')?.click());
  await cho(400);

  /* 6b. File sai fingerprint: từ chối rõ ràng, KHÔNG một RPC staging nào. */
  const oChonFile = await trang.$('input[aria-label="Chọn file Excel theo mẫu"]');
  kiem(!!oChonFile, "có ô chọn file có nhãn");
  if (oChonFile) {
    await oChonFile.uploadFile(join(thuMucMau, "sai-fingerprint.xlsx"));
    await cho(1200);
    const loi = await trang.evaluate(() => ({
      chu: document.querySelector(".cw-import__loi")?.textContent ?? "",
      coXemTruoc: !!document.querySelector("[data-cw-tong]"),
    }));
    kiem(loi.chu.includes("không khớp mẫu"), "file sai bị từ chối với lời giải thích", loi.chu.slice(0, 80));
    kiem(!loi.coXemTruoc, "file sai không sinh bảng xem trước");
    kiem(gọiStaging.length === 0, "file sai không sinh một RPC staging nào",
      `${gọiStaging.length} lần gọi`);
  }

  /* 6c. File hợp lệ: phân loại mới/sửa/không đổi/lỗi + A3 cho dòng sửa. */
  if (oChonFile) {
    await oChonFile.uploadFile(join(thuMucMau, "hop-le.xlsx"));
    await cho(1800);
    const kq = await trang.evaluate(() => {
      const tong = {};
      for (const o of document.querySelectorAll("[data-cw-tong]")) {
        tong[o.getAttribute("data-cw-tong")] = o.textContent?.trim();
      }
      return {
        tong,
        coNutA3: !!document.querySelector("[data-cw-imp-a3]"),
        coXuatLoi: !!document.querySelector("[data-cw-xuat-loi]"),
      };
    });
    kiem(kq.tong.moi === "1", "đếm đúng 1 dòng tạo mới", String(kq.tong.moi));
    kiem(kq.tong.sua === "1", "đếm đúng 1 dòng sửa", String(kq.tong.sua));
    kiem(kq.tong.khongdoi === "1", "đếm đúng 1 dòng không đổi", String(kq.tong.khongdoi));
    kiem(kq.tong.loi === "1", "đếm đúng 1 dòng lỗi", String(kq.tong.loi));
    kiem(kq.coNutA3, "dòng sửa có nút mở đối chiếu A3");
    kiem(kq.coXuatLoi, "có nút xuất sổ lỗi");

    await trang.evaluate(() => document.querySelector("[data-cw-imp-a3]")?.click());
    await cho(400);
    const a3 = await trang.evaluate(() => {
      const o = document.querySelector(".cw-import-a3");
      return { co: !!o, chu: o?.textContent ?? "" };
    });
    kiem(a3.co, "đối chiếu A3 mở được");
    kiem(a3.chu.includes("Máy dập viên xoay tròn") && a3.chu.includes("Máy dập viên đã đổi tên"),
      "A3 hiện cả giá trị hiện tại lẫn giá trị mới");

    /* 6d. Ghi bị CHẶN khi server chưa có RPC staging (Task 9 chưa áp). */
    const ghi = await trang.evaluate(() => ({
      chan: document.querySelector("[data-cw-ghi-chan]")?.textContent ?? "",
      nutKhoa: document.querySelector("[data-cw-ghi]")?.disabled ?? null,
    }));
    kiem(ghi.chan.includes("BỊ CHẶN"), "khu Ghi nói rõ BỊ CHẶN vì thiếu staging", ghi.chan.slice(0, 80));
    kiem(ghi.nutKhoa === true, "nút Ghi vào hệ thống bị khoá");
  }

  await trang.close();
}

/* ---- 7. Ô bắt buộc không bị giấu, và mọi thao tác đều có phản hồi ---- *
 *  Hai thứ bộ cũ không phủ, mà đều là lý do người dùng nghĩ web hỏng:
 *   · nút Lưu mờ câm trong khi ô cần điền nằm trong phần Nâng cao đang
 *     đóng — bấm không có gì xảy ra, không biết phải mở cái gì ra;
 *   · lưu xong hộp thoại đóng cái rụp, không nói đã ghi hay chưa.
 * --------------------------------------------------------------------- */
{
  console.log("\nÔ bắt buộc và phản hồi thành công/thất bại:");
  const { trang, loiConsole } = await moTrang(trinhDuyet);

  // Sang mục Người nhận cảnh báo rồi mở hộp thoại tạo mới.
  await trang.evaluate(() => {
    document.querySelector('[data-cw-nav="alerts"]')?.click();
  });
  await cho(900);
  await trang.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Thêm")?.click();
  });
  await cho(600);

  const banDau = await trang.evaluate(() => ({
    moHop: !!document.querySelector(".cw-than"),
    phamVi: document.querySelector("#cw-alerts-scope_type")?.value ?? "",
    loaiCanhBao: document.querySelector("#cw-alerts-alert_kind")?.value ?? "",
    nhanBatBuoc: [...document.querySelectorAll(".cw-bat-buoc-chu")].map((o) => o.textContent.trim()),
    emailRequired: document.querySelector("#cw-alerts-email")?.required ?? null,
    nutTao: [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Tạo mới")?.disabled ?? null,
  }));
  kiem(banDau.moHop, "hộp thoại tạo người nhận mở được");
  kiem(banDau.phamVi === "tất cả", "tạo mới có sẵn Phạm vi = tất cả", banDau.phamVi);
  kiem(banDau.loaiCanhBao === "cả hai", "tạo mới có sẵn Loại cảnh báo = cả hai", banDau.loaiCanhBao);
  kiem(banDau.nhanBatBuoc.includes("Bắt buộc"), "ô bắt buộc có nhãn chữ đọc được");
  kiem(banDau.emailRequired === true, "ô Email mang thuộc tính required thật");

  /* Bấm Tạo mới khi còn trống: KHÔNG được im lặng. Con trỏ phải nhảy vào
     đúng ô còn thiếu, và dòng "Còn thiếu" phải gọi tên ô đó. */
  await trang.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Tạo mới")?.click();
  });
  await cho(400);
  const sauKhiBam = await trang.evaluate(() => ({
    oDangChon: document.activeElement?.id ?? "",
    conThieu: [...document.querySelectorAll(".cw-loi")].map((o) => o.textContent.trim()).join(" | "),
    conMo: !!document.querySelector(".cw-than"),
  }));
  kiem(sauKhiBam.oDangChon === "cw-alerts-email",
    "bấm Tạo mới khi thiếu thì con trỏ nhảy vào đúng ô", sauKhiBam.oDangChon || "(không ô nào)");
  kiem(sauKhiBam.conThieu.includes("Email"), "dòng Còn thiếu gọi đúng tên ô", sauKhiBam.conThieu.slice(0, 80));
  kiem(sauKhiBam.conMo, "thiếu ô thì hộp thoại vẫn mở, không mất dữ liệu đang gõ");

  /* Email sai định dạng phải chặn ngay tại form — luật này từng nằm chết
     trong datasetForm.ts, không file nào import. */
  await trang.evaluate(() => {
    const o = document.querySelector("#cw-alerts-email");
    const dat = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    dat.call(o, "sai@");
    o.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await cho(300);
  const emailSai = await trang.evaluate(() => ({
    loi: [...document.querySelectorAll(".cw-loi")].map((o) => o.textContent.trim()).join(" | "),
    coToast: !!document.querySelector(".vmp-toast--thanhCong"),
  }));
  kiem(emailSai.loi.includes("Email không hợp lệ"), "email sai định dạng bị chặn tại form",
    emailSai.loi.slice(0, 80));
  kiem(!emailSai.coToast, "email sai thì không có toast thành công nào");

  /* Email hợp lệ rồi bấm lưu: dù server giả lập trả gì, PHẢI có phản hồi. */
  await trang.evaluate(() => {
    const o = document.querySelector("#cw-alerts-email");
    const dat = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    dat.call(o, "nguoi.moi@example.com");
    o.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await cho(300);
  await trang.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Tạo mới")?.click();
  });
  await cho(1500);
  const sauLuu = await trang.evaluate(() => {
    const toast = document.querySelector(".vmp-toast");
    return {
      coToast: !!toast,
      loaiToast: toast?.getAttribute("data-vmp-toast") ?? "",
      chuToast: toast?.textContent?.trim() ?? "",
      conMo: !!document.querySelector(".cw-than"),
    };
  });
  kiem(sauLuu.coToast, "lưu xong luôn có phản hồi trên màn hình", sauLuu.chuToast.slice(0, 60));
  kiem(sauLuu.loaiToast !== "dang",
    "toast được chốt thành công hoặc thất bại, không treo ở 'đang chạy'", sauLuu.loaiToast);
  // Lưu hỏng thì hộp thoại phải còn nguyên để người dùng không gõ lại từ đầu.
  kiem(sauLuu.loaiToast !== "loi" || sauLuu.conMo,
    "lưu hỏng thì hộp thoại vẫn mở", `${sauLuu.loaiToast}/${sauLuu.conMo}`);

  kiem(loiConsole.length === 0, "không lỗi console", loiConsole.join(" · ").slice(0, 160));
  await trang.close();
}

/* ---- 8. Ô danh mục mở phải cho thấy TOÀN BỘ giá trị đang có ---------- *
 *  Bản đầu dựng các ô này bằng `<input list>` + datalist. Trình duyệt tự
 *  lọc gợi ý theo chữ đang có trong ô, nên một đối tượng đã mang "Line 1"
 *  thì bấm xuống chỉ thấy đúng một dòng — người dùng tưởng hệ thống chỉ
 *  biết một giá trị và gõ tay lại từ đầu. Đây là phép kiểm chặn nó quay lại.
 * --------------------------------------------------------------------- */
{
  console.log("\nÔ khu vực / line cho thấy đủ danh sách:");
  const { trang, loiConsole } = await moTrang(trinhDuyet);

  // Mở form sửa của đối tượng đầu tiên.
  await trang.evaluate(() => {
    const nut = [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Sửa" || b.getAttribute("data-cw-sua") !== null);
    nut?.click();
  });
  await cho(900);

  const o = await trang.evaluate(() => {
    const doc = (id) => {
      const el = document.getElementById(id);
      if (!el) return { co: false };
      return {
        co: true,
        the: el.tagName.toLowerCase(),
        soLuaChon: el.tagName.toLowerCase() === "select" ? el.options.length : 0,
        nhan: el.tagName.toLowerCase() === "select"
          ? [...el.options].map((x) => x.textContent.trim()) : [],
        giaTri: el.value,
      };
    };
    return { moHop: !!document.querySelector(".cw-than"), kv: doc("cof-area_code"), line: doc("cof-line") };
  });

  kiem(o.moHop, "form sửa đối tượng mở được");
  kiem(o.kv.the === "select", "ô Khu vực là ô chọn, không phải ô gõ tự do", String(o.kv.the));
  kiem(o.line.the === "select", "ô Line là ô chọn, không phải ô gõ tự do", String(o.line.the));
  /* Kho giả lập có 3 khu vực và 2 line: cộng mục "— chọn —" và mục "Khác"
     là 5 và 4. Kiểm số thật chứ không kiểm "nhiều hơn 1" — datalist lọc
     nhầm vẫn cho ra 2 mục và sẽ lọt. */
  kiem(o.kv.soLuaChon === 5, "ô Khu vực hiện đủ 3 khu vực + chọn + Khác", String(o.kv.soLuaChon));
  kiem(o.line.soLuaChon === 4, "ô Line hiện đủ 2 line + chọn + Khác", String(o.line.soLuaChon));
  kiem(o.kv.nhan.some((n) => n.startsWith("Khác")), "ô Khu vực có lối thoát nhập giá trị mới",
    o.kv.nhan.join(" / ").slice(0, 90));
  kiem(o.kv.giaTri !== "", "giá trị khu vực đang có của bản ghi được chọn sẵn", o.kv.giaTri);

  kiem(loiConsole.length === 0, "không lỗi console", loiConsole.join(" · ").slice(0, 160));
  await trang.close();
}

/* ---- 9. V2: ghi đè deadline khi hạng mục đã có tiến độ -------------- */
{
  console.log("\nGhi đè deadline V2 — thành công:");
  const { trang, loiConsole, chanNgoai, applyBodies } = await moXemTruocDeadlineV2({
    ok: true,
    so_tao: 0,
    so_sua: 0,
    so_dung: 0,
    so_ghi_de_deadline: 1,
    da_ap_truoc_do: false,
  });

  const preview = await trang.evaluate((label) => {
    const candidate = [...document.querySelectorAll('input[type="checkbox"]')]
      .find((input) => input.getAttribute("aria-label") === label);
    const article = candidate?.closest("article");
    return { unchecked: candidate?.checked === false, text: article?.textContent ?? "" };
  }, nhanChonDeadlineV2);
  kiem(preview.unchecked, "candidate deadline V2 bắt đầu chưa được chọn");
  for (const text of [
    MA_HANG_MUC_V2,
    "actual_validation_date: 20/03/2026",
    "10/02/2026", "24/02/2026",
    "20/02/2026", "05/03/2026",
    "25/02/2026", "10/03/2026",
    "28/02/2026", "15/03/2026",
  ]) {
    kiem(preview.text.includes(text), `candidate V2 hiển thị ${text}`, preview.text.slice(0, 240));
  }

  await chuanBiApDeadlineV2(trang);
  await bamApDeadlineV2(trang);
  await trang.waitForFunction(() => document.querySelector('.vmp-toast[data-vmp-toast="thanhCong"]')
    ?.textContent?.includes("Đã áp thay đổi vào timeline") === true, { timeout: 10_000 });
  await trang.waitForFunction(() => ![...document.querySelectorAll("div")]
    .some((node) => node.textContent?.trim() === "Ảnh hưởng tới timeline"), { timeout: 10_000 });
  const success = await trang.evaluate(() => ({
    toast: document.querySelector('.vmp-toast[data-vmp-toast="thanhCong"]')?.textContent ?? "",
    dialogConMo: [...document.querySelectorAll("div")]
      .some((node) => node.textContent?.trim() === "Ảnh hưởng tới timeline"),
  }));
  kiem(JSON.stringify(applyBodies) === JSON.stringify([expectedApplyBodyV2()]),
    "apply V2 gửi đúng change/version/override/xác nhận", JSON.stringify(applyBodies));
  kiem(success.toast.includes("Đã áp thay đổi vào timeline"), "toast báo áp timeline thành công", success.toast);
  kiem(!success.dialogConMo, "áp thành công đóng hộp xem trước timeline");
  kiem(loiConsole.length === 0, "không lỗi console ở luồng override V2", loiConsole.join(" · ").slice(0, 160));
  kiem(chanNgoai.length === 0, "override V2 không gọi ra ngoài", chanNgoai[0] || "");
  await trang.close();
}

const LOI_AP_DUNG_V2 = [
  {
    code: "MISSING_SOURCE_DATA",
    response: {
      ok: false,
      error_code: "MISSING_SOURCE_DATA",
      error: "Không tính đủ deadline cho CCTB01/2026.01-PQ",
      missing: [{ validation_code: MA_HANG_MUC_V2, fields: ["Tháng thẩm định đầu tiên"] }],
    },
    phaiThay: ["Không tính đủ deadline cho CCTB01/2026.01-PQ", "thiếu: Tháng thẩm định đầu tiên"],
    giuTrangThai: false,
  },
  {
    code: "VERSION_CONFLICT",
    response: {
      ok: false,
      error_code: "VERSION_CONFLICT",
      error: "Timeline đã thay đổi, hãy xem trước lại",
      details: [{ validation_code: MA_HANG_MUC_V2, expected_item_version: 7, current_item_version: 8 }],
    },
    phaiThay: ["Timeline đã thay đổi, hãy xem trước lại"],
    giuTrangThai: true,
  },
  {
    code: "ITEM_STATE_CHANGED",
    response: {
      ok: false,
      error_code: "ITEM_STATE_CHANGED",
      error: "Hạng mục CCTB01/2026.01-PQ đã đổi trạng thái, hãy xem trước lại",
      details: [{ validation_code: MA_HANG_MUC_V2, expected_item_version: 7, current_item_version: 8 }],
    },
    phaiThay: ["Hạng mục CCTB01/2026.01-PQ đã đổi trạng thái, hãy xem trước lại"],
    giuTrangThai: false,
  },
  {
    code: "FORBIDDEN",
    response: {
      ok: false,
      error_code: "FORBIDDEN",
      error: "Chỉ Admin và Quản lý QA được cập nhật deadline của hạng mục đã có tiến độ",
    },
    phaiThay: ["Chỉ Admin và Quản lý QA được cập nhật deadline của hạng mục đã có tiến độ"],
    giuTrangThai: false,
  },
];

for (const scenario of LOI_AP_DUNG_V2) {
  console.log(`\nGhi đè deadline V2 — ${scenario.code}:`);
  const { trang, loiConsole, chanNgoai, applyBodies } = await moXemTruocDeadlineV2(scenario.response);
  await chuanBiApDeadlineV2(trang);
  await bamApDeadlineV2(trang);
  await trang.waitForSelector('[role="alert"]', { timeout: 10_000 });
  await trang.evaluate(() => new Promise((resolve) => requestAnimationFrame(
    () => requestAnimationFrame(resolve),
  )));

  const failure = await trang.evaluate((label, reason) => {
    const candidate = [...document.querySelectorAll('input[type="checkbox"]')]
      .find((input) => input.getAttribute("aria-label") === label);
    const confirmation = [...document.querySelectorAll("label")]
      .find((node) => node.textContent?.includes("Tôi xác nhận chỉ cập nhật các deadline kế hoạch đã chọn"))
      ?.querySelector('input[type="checkbox"]');
    return {
      alert: document.querySelector('[role="alert"]')?.textContent ?? "",
      dialogConMo: [...document.querySelectorAll("div")]
        .some((node) => node.textContent?.trim() === "Ảnh hưởng tới timeline"),
      candidateDuocChon: candidate?.checked === true,
      lyDoConLai: document.querySelector('input[placeholder="Câu này đi vào nhật ký, người sau đọc để hiểu vì sao timeline đổi."]')?.value === reason,
      daXacNhan: confirmation?.checked === true,
    };
  }, nhanChonDeadlineV2, LY_DO_AP_V2);

  for (const text of scenario.phaiThay) {
    kiem(failure.alert.includes(text), `${scenario.code} hiện đúng lỗi: ${text}`, failure.alert);
  }
  kiem(failure.dialogConMo, `${scenario.code} giữ hộp xem trước mở`);
  kiem(JSON.stringify(applyBodies) === JSON.stringify([expectedApplyBodyV2()]),
    `${scenario.code} chỉ gọi đúng một mutation`, JSON.stringify(applyBodies));
  if (scenario.giuTrangThai) {
    kiem(failure.candidateDuocChon && failure.lyDoConLai && failure.daXacNhan,
      "VERSION_CONFLICT giữ lựa chọn, lý do và xác nhận", JSON.stringify(failure));
  }
  kiem(loiConsole.length === 0, `${scenario.code} không lỗi console`, loiConsole.join(" · ").slice(0, 160));
  kiem(chanNgoai.length === 0, `${scenario.code} không gọi ra ngoài`, chanNgoai[0] || "");
  await trang.close();
}

await trinhDuyet.close();

console.log(`\n${"─".repeat(52)}`);
console.log(`${soDat} đạt · ${soHong} hỏng`);
if (soHong > 0) { console.error("KHÔNG ĐẠT."); process.exit(1); }
console.log("ĐẠT.");

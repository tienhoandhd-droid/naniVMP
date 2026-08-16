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

await trinhDuyet.close();

console.log(`\n${"─".repeat(52)}`);
console.log(`${soDat} đạt · ${soHong} hỏng`);
if (soHong > 0) { console.error("KHÔNG ĐẠT."); process.exit(1); }
console.log("ĐẠT.");

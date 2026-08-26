/* =====================================================================
 *  luong-gia-lap.mjs — kiểm luồng chính trên Supabase giả lập
 *  ---------------------------------------------------------------------
 *  Bộ E2E cũ (`npm run e2e`) đăng nhập bằng tài khoản THẬT trên project
 *  production. Đợt Lotus Pearl không có project Supabase cách ly, nên
 *  những bộ đó hiện không chạy được — và chạy chúng lên production chỉ
 *  để kiểm giao diện là điều không nên làm.
 *
 *  Bộ này lấp đúng khoảng trống ấy: mở thật trong Chrome, điều hướng thật
 *  qua cả mười lăm màn, nhưng mọi câu trả lời từ Supabase đến từ
 *  `gia-lap-supabase.mjs`. Nó KHÔNG thay thế bộ kiểm nghiệp vụ — nó chứng
 *  minh app dựng được, điều hướng được và không ném lỗi.
 *
 *  Chạy: bash scripts/with-preview.sh -- npm run e2e:gialap
 * ===================================================================== */
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien, dungHangMuc, NGUOI_DUNG } from "./gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";

const URL_SB = (() => {
  const noi = readFileSync(new URL("../../.env.local", import.meta.url).pathname, "utf8");
  const m = noi.match(/^VITE_SUPABASE_URL=(.+)$/m);
  if (!m) throw new Error(".env.local thiếu VITE_SUPABASE_URL");
  return m[1].trim();
})();

const MAN = [
  ["today", "Việc hôm nay"],
  ["overview", "Tổng quan VMP"],
  ["timeline", "Dòng thời gian VMP"],
  ["alerts", "Cảnh báo & ưu tiên"],
  ["progress", "Cập nhật tiến độ"],
  ["source", "Dữ liệu nguồn"],
  ["workload", "Phân công & khối lượng"],
  ["reports", "Báo cáo"],
  ["rules", "Quy tắc nghiệp vụ"],
  ["accounts", "Tài khoản & quyền truy cập"],
  ["phanquyen", "Vai trò & phạm vi"],
  ["health", "Chất lượng dữ liệu"],
  ["audit", "Nhật ký thay đổi"],
  ["admin", "Cấu hình hệ thống"],
];

/* Lỗi console được phép bỏ qua — đều là hệ quả của việc CHẶN MẠNG, không
   phải lỗi của ứng dụng. Danh sách đóng: thứ gì không khớp thì bộ kiểm
   phải kêu, vì nếu nới ra thì nó không còn bắt được gì. */
const BO_QUA = [
  /WebSocket connection to .* failed/i,
  /realtime/i,
  /net::ERR_(FAILED|BLOCKED|ABORTED|NAME_NOT_RESOLVED)/i,
];

const laLoiThat = (chu) => !BO_QUA.some((re) => re.test(chu));

let soDat = 0;
let soHong = 0;

function kiem(dieuKien, ten, chiTiet = "") {
  if (dieuKien) { soDat += 1; return; }
  soHong += 1;
  console.error(`  ✗ ${ten}${chiTiet ? ` — ${chiTiet}` : ""}`);
}

const trinhDuyet = await puppeteer.launch({
  executablePath: CHROME, headless: "new", args: ["--no-sandbox"],
});

/* ---- 1. Màn đăng nhập dựng đúng khi chưa có phiên ------------------- */
{
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(GOC, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 1200));

  const kq = await trang.evaluate(() => ({
    coMatKhau: document.querySelectorAll('input[type="password"]').length,
    soH1: document.querySelectorAll("h1").length,
    visual: document.documentElement.dataset.visual,
  }));
  console.log("Đăng nhập:");
  kiem(kq.coMatKhau === 1, "có đúng một ô mật khẩu", `thấy ${kq.coMatKhau}`);
  kiem(kq.soH1 === 1, "có đúng một h1", `thấy ${kq.soH1}`);
  kiem(kq.visual === "lotus-pearl", "đã gắn ngôn ngữ thị giác", kq.visual);
  await trang.close();
}

/* ---- 2. Mở lần lượt mười lăm màn ------------------------------------ */
console.log("\nĐiều hướng:");
for (const [id, ten] of MAN) {
  const trang = await trinhDuyet.newPage();
  const loiConsole = [];
  trang.on("console", (m) => { if (m.type() === "error" && laLoiThat(m.text())) loiConsole.push(m.text().slice(0, 110)); });
  trang.on("pageerror", (e) => loiConsole.push(`pageerror: ${String(e.message).slice(0, 110)}`));

  const { chanNgoai } = await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(`${GOC}#v=${id}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2200));

  const kq = await trang.evaluate(() => ({
    soH1: document.querySelectorAll("h1").length,
    tieuDe: document.querySelector("h1")?.textContent?.trim() || "",
    conManDangNhap: document.querySelectorAll('input[type="password"]').length > 0,
    coLoiVo: !!document.querySelector("pre")?.textContent?.includes("TypeError"),
    tranNgang: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));

  const dat = kq.soH1 === 1 && !kq.conManDangNhap && !kq.coLoiVo
    && kq.tranNgang <= 1 && loiConsole.length === 0 && chanNgoai.length === 0;
  console.log(`  ${dat ? "✓" : "✗"} ${ten.padEnd(26)} h1="${kq.tieuDe}"`);

  kiem(kq.soH1 === 1, `${ten}: đúng một h1`, `thấy ${kq.soH1}`);
  kiem(!kq.conManDangNhap, `${ten}: đã vào được sau cửa đăng nhập`);
  kiem(!kq.coLoiVo, `${ten}: không có màn lỗi`);
  kiem(kq.tranNgang <= 1, `${ten}: không tràn ngang`, `${kq.tranNgang}px`);
  kiem(loiConsole.length === 0, `${ten}: console sạch`, loiConsole[0] || "");
  kiem(chanNgoai.length === 0, `${ten}: không gọi ra ngoài môi trường cách ly`, chanNgoai[0] || "");

  await trang.close();
}

/* ---- 2b. Grant people cũ không khôi phục menu hay editor ------------ */
{
  console.log("\nNhân sự đã gỡ — grant cũ chỉ rơi về màn được phép:");
  const trang = await trinhDuyet.newPage();
  const { chanNgoai } = await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1440, height: 900 });
  // Fixture admin vẫn trả `people` và `edit_operational_people`; frontend
  // phải bỏ qua grant lịch sử đó và chọn today, không dựng editor cũ.
  await trang.goto(`${GOC}#v=people`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2200));

  const desktop = await trang.evaluate(() => ({
    coMenuNhanSu: !!document.querySelector('.vmp-sidebar [data-view="people"]'),
    tieuDe: document.querySelector("h1")?.textContent?.trim() || "",
    coEditorCu: !!document.querySelector('input[aria-label="Họ và tên trong danh bạ"]'),
  }));
  kiem(!desktop.coMenuNhanSu, "desktop không còn mục Nhân sự dù fixture còn grant");
  kiem(desktop.tieuDe === "Việc hôm nay", "#v=people rơi về today khi today + overview đều được cấp", desktop.tieuDe);
  kiem(!desktop.coEditorCu, "#v=people không dựng editor hồ sơ Nhân sự cũ");
  kiem(chanNgoai.length === 0, "fallback people không gọi ra ngoài môi trường cách ly", chanNgoai[0] || "");
  await trang.close();

  const dienThoai = await trinhDuyet.newPage();
  await caiGiaLap(dienThoai, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(dienThoai, { supabaseUrl: URL_SB });
  await dienThoai.setViewport({ width: 390, height: 844, isMobile: true });
  await dienThoai.goto(`${GOC}#v=today`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2200));
  await dienThoai.click('[aria-label="Mở menu"]');
  await dienThoai.waitForSelector("#vmp-mobile-drawer");
  const mobile = await dienThoai.evaluate(() =>
    !!document.querySelector('#vmp-mobile-drawer [data-view="people"]'));
  kiem(!mobile, "mobile drawer không còn mục Nhân sự dù fixture còn grant");
  await dienThoai.close();
}

/* ---- 3. Màn tiến độ trên điện thoại dùng thẻ, không phải bảng ------- */
{
  console.log("\nĐiện thoại — màn Cập nhật tiến độ:");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 390, height: 844, isMobile: true });
  await trang.goto(`${GOC}#v=progress`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2400));

  const kq = await trang.evaluate(() => {
    const bang = document.querySelector(".vmp-chi-desktop");
    const the = document.querySelectorAll(".lp-mobile-task");
    const nutNho = [...document.querySelectorAll(".lp-mobile-task button")]
      .filter((b) => b.getBoundingClientRect().height < 44).length;
    return {
      bangAn: !bang || getComputedStyle(bang).display === "none",
      soThe: the.length,
      nutNho,
      tranNgang: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  kiem(kq.bangAn, "bảng desktop đã ẩn trên điện thoại");
  kiem(kq.soThe > 0, "có thẻ hạng mục", `thấy ${kq.soThe}`);
  kiem(kq.nutNho === 0, "mọi nút trong thẻ đạt 44px", `${kq.nutNho} nút chưa đạt`);
  kiem(kq.tranNgang <= 1, "không tràn ngang", `${kq.tranNgang}px`);
  console.log(`  ${kq.soThe} thẻ · bảng ẩn: ${kq.bangAn} · tràn ngang: ${kq.tranNgang}px`);
  await trang.close();
}

/* ---- 3b. Tiến độ Lotus: KPI, dải ưu tiên, lịch sử trong hộp sửa ----- */
{
  console.log("\nTiến độ Lotus (desktop):");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(`${GOC}#v=progress`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2400));

  const kpi = await trang.evaluate(() => {
    const nhan = [...document.querySelectorAll(".lp-metric .lp-metric__label")]
      .map((o) => o.textContent?.trim());
    const hero = document.querySelector(".lp-metric--hero .lp-metric__label")?.textContent?.trim();
    return {
      nhan,
      hero,
      coDaiUuTien: !!document.querySelector(".lp-priority-strip"),
      soUuTien: document.querySelectorAll(".lp-priority-strip .lp-priority").length,
    };
  });
  kiem(["Đang thực hiện", "Cần xử lý", "Quá hạn", "Độ hoàn thiện dữ liệu"]
    .every((t) => kpi.nhan.includes(t)),
  "đủ bốn KPI đúng nhãn", kpi.nhan.join(" | "));
  kiem(kpi.hero === "Cần xử lý", "Cần xử lý là ô hero duy nhất", kpi.hero || "(không có hero)");
  kiem(kpi.coDaiUuTien, "có dải Cần xử lý trước tiên");
  kiem(kpi.soUuTien > 0 && kpi.soUuTien <= 5, "dải ưu tiên có 1–5 mục", `${kpi.soUuTien}`);

  /* Mở hộp sửa dòng đầu rồi mở Lịch sử thay đổi. */
  await trang.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Cập nhật")?.click();
  });
  await new Promise((r) => setTimeout(r, 900));
  const daBamLichSu = await trang.evaluate(() => {
    const nut = [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Lịch sử thay đổi"));
    if (!nut) return false;
    nut.click();
    return true;
  });
  await new Promise((r) => setTimeout(r, 1000));
  const lichSu = await trang.evaluate(() => ({
    coDong: document.body.innerText.includes("Cập nhật theo biên bản PQ-230426"),
    coVai: document.body.innerText.includes("qa_manager")
      || document.body.innerText.includes("Người kiểm thử"),
  }));
  kiem(daBamLichSu, "hộp sửa có mục Lịch sử thay đổi");
  kiem(lichSu.coDong, "lịch sử hiện lý do từ rpc_item_progress_history");
  kiem(lichSu.coVai, "lịch sử hiện người thao tác");

  /* Nhân sự xưởng ngay trong hộp sửa — người có quyền
     assign_workshop_staff thấy phân công hiện tại và lối gán mới. */
  const daBamXuong = await trang.evaluate(() => {
    const nut = [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Nhân sự xưởng"));
    if (!nut) return false;
    nut.click();
    return true;
  });
  await new Promise((r) => setTimeout(r, 1000));
  const xuong = await trang.evaluate(() => ({
    coNguoi: document.body.innerText.includes("Trần Văn Xưởng"),
    coTim: !!document.querySelector('input[aria-label="Tìm nhân sự xưởng"]'),
    coGoBo: [...document.querySelectorAll("button")]
      .some((b) => b.textContent?.trim() === "Gỡ phân công"),
  }));
  kiem(daBamXuong, "hộp sửa có mục Nhân sự xưởng");
  kiem(xuong.coNguoi, "hiện phân công xưởng hiện tại từ rpc_item_assignments");
  kiem(xuong.coTim, "có ô tìm nhân sự xưởng để gán mới");
  kiem(xuong.coGoBo, "phân công hiện tại có nút gỡ (kèm lý do)");
  await trang.close();
}

/* ---- 3d. Hôm nay ≥1600: supporting pane có dữ liệu ------------------ */
{
  console.log("\nHôm nay — supporting pane (1600px):");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1680, height: 950 });
  await trang.goto(`${GOC}#v=today`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2400));

  const banDau = await trang.evaluate(() => {
    const pane = document.querySelector(".hn-pane");
    return {
      coPane: !!pane && getComputedStyle(pane).display !== "none",
      coVali: !!pane?.querySelector("[data-lp-vali]"),
    };
  });
  kiem(banDau.coPane, "≥1600 có supporting pane");
  kiem(banDau.coVali, "chưa chọn gì thì pane là Vali hướng dẫn");

  /* Chọn một việc → pane hiện chi tiết + nút Cập nhật. */
  const maChon = await trang.evaluate(() => {
    const nut = document.querySelector(".hn-muc__mo");
    if (!nut) return null;
    const ma = nut.querySelector(".hn-muc__ma")?.textContent?.trim() ?? null;
    nut.click();
    return ma;
  });
  await new Promise((r) => setTimeout(r, 500));
  const daChon = await trang.evaluate(() => ({
    chuPane: document.querySelector(".hn-pane")?.textContent ?? "",
    coCapNhat: [...(document.querySelector(".hn-pane")?.querySelectorAll("button") ?? [])]
      .some((b) => b.textContent?.trim() === "Cập nhật"),
  }));
  kiem(maChon !== null && daChon.chuPane.includes(maChon),
    "chọn một việc thì pane hiện đúng mã đó", `"${maChon}"`);
  kiem(daChon.coCapNhat, "pane có hành động Cập nhật");

  /* Bỏ chọn → quay về Vali. */
  await trang.evaluate(() => {
    [...(document.querySelector(".hn-pane")?.querySelectorAll("button") ?? [])]
      .find((b) => b.textContent?.trim() === "Bỏ chọn")?.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  const boChon = await trang.evaluate(() =>
    !!document.querySelector(".hn-pane [data-lp-vali]"));
  kiem(boChon, "bỏ chọn thì pane quay về Vali hướng dẫn");

  /* Dưới 1600 pane ẩn — không ép hai cột vào màn hẹp. */
  await trang.setViewport({ width: 1440, height: 900 });
  await new Promise((r) => setTimeout(r, 500));
  const heo = await trang.evaluate(() => {
    const pane = document.querySelector(".hn-pane");
    return !pane || getComputedStyle(pane).display === "none";
  });
  kiem(heo, "dưới 1600 pane ẩn, bố cục cũ giữ nguyên");
  await trang.close();
}

/* ---- 3c. Timeline: 2D mặc định, 3D là tab khám phá có trí nhớ ------- */
{
  console.log("\nTimeline — tab Xem bản đồ 3D:");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(`${GOC}#v=timeline`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2400));

  /* Strip 4 dải tình trạng (nghiên cứu Timeline đợt 1): hero là Quá hạn,
     bấm ô nào là bộ lọc tình trạng nhảy đúng giá trị đó. */
  const strip = await trang.evaluate(() => {
    const nhan = [...document.querySelectorAll(".lp-metric .lp-metric__label")]
      .map((o) => o.textContent?.trim());
    return {
      nhan,
      hero: document.querySelector(".lp-metric--hero .lp-metric__label")?.textContent?.trim(),
    };
  });
  kiem(["Quá hạn", "Sắp đến hạn", "Đang thực hiện", "Hoàn thành"]
    .every((t) => strip.nhan.includes(t)),
  "strip đủ bốn dải tình trạng", strip.nhan.join(" | "));
  kiem(strip.hero === "Quá hạn", "Quá hạn là ô hero", strip.hero || "(không có)");

  /* Action narrative (nghiên cứu đợt 2): một câu kết luận dưới strip —
     hạng mục trễ nặng nhất và pha nút thắt, không cần thêm biểu đồ. */
  const narrative = await trang.evaluate(() =>
    document.querySelector(".tl-narrative")?.textContent?.trim() || "");
  kiem(narrative.includes("Nặng nhất") && narrative.includes("Nút thắt"),
    "strip có thuyết minh Nặng nhất + Nút thắt", narrative.slice(0, 110) || "(không có)");

  await trang.evaluate(() => {
    [...document.querySelectorAll(".lp-metric--action")]
      .find((b) => b.textContent?.includes("Sắp đến hạn"))?.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  const locSoon = await trang.evaluate(() =>
    document.querySelector('select[aria-label="Lọc theo tình trạng"]')?.value);
  kiem(locSoon === "soon", "bấm Sắp đến hạn thì bộ lọc nhảy sang soon", String(locSoon));

  const macDinh = await trang.evaluate(() => ({
    coCanvas: !!document.querySelector("canvas"),
    coNutMo: [...document.querySelectorAll("button")]
      .some((b) => b.textContent?.includes("Xem bản đồ 3D")),
  }));
  kiem(!macDinh.coCanvas, "mặc định KHÔNG dựng canvas 3D — 2D là mặt chính");
  kiem(macDinh.coNutMo, "có nút Xem bản đồ 3D");

  await trang.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Xem bản đồ 3D"))?.click();
  });
  await new Promise((r) => setTimeout(r, 2600));
  const daMo = await trang.evaluate(() => !!document.querySelector("canvas"));
  kiem(daMo, "bấm Xem bản đồ 3D thì canvas xuất hiện (lazy)");

  /* Trí nhớ: tải lại trang, lựa chọn còn nguyên. */
  await trang.reload({ waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 2800));
  const conNho = await trang.evaluate(() => !!document.querySelector("canvas"));
  kiem(conNho, "tải lại vẫn nhớ đang mở 3D (localStorage)");
  await trang.close();
}

/* ---- 3d. Timeline: advanced filters share the same result sets ------- */
{
  console.log("\nTimeline — bộ lọc nâng cao:");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1680, height: 950 });
  await trang.goto(`${GOC}#v=timeline`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2400));

  await trang.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Dòng thời gian")?.click();
    document.querySelector("[data-timeline-filter-toggle]")?.click();
  });
  await trang.waitForFunction(() => !!document.querySelector("[data-timeline-filter-panel]"));
  const panel = await trang.evaluate(() => ({
    expanded: document.querySelector("[data-timeline-filter-toggle]")?.getAttribute("aria-expanded"),
    filters: [...document.querySelectorAll("[data-timeline-filter]")].map((o) => o.getAttribute("data-timeline-filter")),
    live: document.querySelector("[data-timeline-filter-count]")?.getAttribute("aria-live"),
  }));
  kiem(panel.expanded === "true", "nút bộ lọc nâng cao công bố trạng thái mở", String(panel.expanded));
  kiem(["type", "owner", "phase", "readiness"].every((id) => panel.filters.includes(id)),
    "panel có đủ type · owner · phase · readiness", panel.filters.join(" | "));
  kiem(panel.live === "polite", "số hạng mục lọc được công bố nhẹ nhàng", String(panel.live));

  /* Bộ lọc mới tạo chip có thể bỏ riêng, còn Xoá lọc trả mọi điều kiện về all. */
  await trang.select("[data-timeline-filter=\"type\"]", "IQ");
  await trang.waitForFunction(() =>
    document.querySelector("[data-timeline-filter=\"type\"]")?.value === "IQ"
    && [...document.querySelectorAll("[data-timeline-filter-chip]")].some((chip) => chip.textContent?.includes("Loại: IQ")));
  const chip = await trang.evaluate(() => ({
    text: [...document.querySelectorAll("[data-timeline-filter-chip]")].map((o) => o.textContent?.trim()).join(" | "),
    label: document.querySelector("[data-timeline-filter-chip]")?.getAttribute("aria-label"),
  }));
  kiem(chip.text.includes("Loại: IQ"), "lọc loại tạo chip đang áp dụng", chip.text || "(không có)");
  kiem(chip.label?.startsWith("Bỏ "), "chip có tên bỏ lọc cho bàn phím/trợ năng", String(chip.label));
  await trang.click("[data-timeline-clear-filters]");
  await trang.waitForFunction(() =>
    document.querySelector("[data-timeline-filter=\"type\"]")?.value === "all"
    && !document.querySelector("[data-timeline-filter-chip]"));
  kiem(true, "Xoá lọc xoá cả filter mới và chip");

  /* KPI tình trạng đếm trên summary base và bấm nó phải khớp explorer/display. */
  await trang.evaluate(() => {
    [...document.querySelectorAll(".lp-metric--action")]
      .find((b) => b.textContent?.includes("Sắp đến hạn"))?.click();
  });
  await trang.waitForFunction(() =>
    document.querySelector('select[aria-label="Lọc theo tình trạng"]')?.value === "soon");
  const statusCounts = await trang.evaluate(() => ({
    kpi: Number([...document.querySelectorAll(".lp-metric")]
      .find((o) => o.querySelector(".lp-metric__label")?.textContent?.trim() === "Sắp đến hạn")
      ?.querySelector(".lp-metric__value")?.textContent || "NaN"),
    display: Number(document.querySelector("[data-timeline-filter-count]")?.textContent?.match(/^\s*(\d+)/)?.[1] || "NaN"),
  }));
  kiem(statusCounts.kpi === statusCounts.display,
    "KPI Sắp đến hạn bằng đúng số dòng status-filter", `${statusCounts.kpi} / ${statusCounts.display}`);

  /* Chọn một hàng rồi thay điều kiện loại khác: selection phải tự đóng. */
  await trang.click("[data-timeline-clear-filters]");
  await trang.waitForSelector(".timeline-day-row");
  const selected = await trang.evaluate(() => {
    const row = document.querySelector(".timeline-day-row");
    const code = row?.querySelector(".timeline-card-code")?.textContent?.trim() || "";
    row?.click();
    return code;
  });
  await trang.waitForFunction(() => !!document.querySelector("[data-timeline-inspector]"));
  const differentType = await trang.evaluate((code) => {
    const current = code.split("-").at(-1);
    return [...document.querySelectorAll("[data-timeline-filter=\"type\"] option")]
      .map((o) => o.value).find((value) => value !== "all" && value !== current) || "all";
  }, selected);
  await trang.select("[data-timeline-filter=\"type\"]", differentType);
  await trang.waitForFunction(() => !document.querySelector("[data-timeline-inspector]"));
  kiem(differentType !== "all", "đổi type khác hàng đã chọn làm selection tự xoá", `${selected} → ${differentType}`);
  await trang.close();
}

/* ---- 3e. Timeline: inspector supporting pane ≥1600 ------------------ */
{
  console.log("\nTimeline — inspector ≥1600:");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1680, height: 950 });
  await trang.goto(`${GOC}#v=timeline`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2400));

  /* Mặc định là workspace Tổng quan — chuyển sang tab Timeline để có bảng. */
  await trang.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Dòng thời gian")?.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  /* Chưa chọn gì: KHÔNG có pane — bảng dùng trọn bề ngang (màn GMP,
     yêu cầu chủ dự án 16/08: minh hoạ không được lấy cột của dữ liệu). */
  const truocChon = await trang.evaluate(() => ({
    coPane: !!document.querySelector("[data-timeline-inspector]"),
    coVali: !!document.querySelector(".timeline-page-shell [data-lp-vali]"),
  }));
  kiem(!truocChon.coPane, "chưa chọn hàng thì KHÔNG chiếm cột pane");
  kiem(!truocChon.coVali, "không có Vali trong màn dòng thời gian");

  /* Bấm một hàng: chi tiết đổ sang pane, KHÔNG bật modal. */
  const maHang = await trang.evaluate(() => {
    const hang = document.querySelector(".timeline-day-row");
    const ma = hang?.querySelector(".timeline-card-code")?.textContent?.trim() || "";
    hang?.click();
    return ma;
  });
  await new Promise((r) => setTimeout(r, 600));
  const sauChon = await trang.evaluate(() => ({
    paneChua: document.querySelector("[data-timeline-inspector]")?.textContent || "",
    coModal: document.body.innerText.includes("Chi tiết hạng mục"),
    coNutHoSo: [...document.querySelectorAll("[data-timeline-inspector] button")]
      .some((b) => b.textContent?.includes("Hồ sơ đầy đủ")),
  }));
  kiem(!!maHang && sauChon.paneChua.includes(maHang),
    "bấm hàng thì mã đổ sang pane", `${maHang} trong pane: ${sauChon.paneChua.includes(maHang)}`);
  kiem(!sauChon.coModal, "màn rộng KHÔNG bật modal khi bấm hàng");
  kiem(sauChon.coNutHoSo, "pane có nút Hồ sơ đầy đủ (mở modal khi cần)");

  await trang.evaluate(() => {
    [...document.querySelectorAll("[data-timeline-inspector] button")]
      .find((b) => b.textContent?.includes("Hồ sơ đầy đủ"))?.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  const moDayDu = await trang.evaluate(() => document.body.innerText.includes("Chi tiết hạng mục"));
  kiem(moDayDu, "nút Hồ sơ đầy đủ mở đúng modal chi tiết");
  await trang.close();
}

/* ---- 3f. Đổi mật khẩu: phải chứng minh bằng mật khẩu cũ ------------- */
{
  console.log("\nĐổi mật khẩu:");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(`${GOC}#v=today`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2200));

  await trang.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Mật khẩu"))?.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  const soO = await trang.evaluate(() =>
    document.querySelectorAll('input[type="password"]').length);
  kiem(soO === 3, "hộp thoại có BA ô: hiện tại · mới · nhắc lại", `${soO} ô`);

  const dienVaGui = async (cu, moi, nhacLai) => {
    await trang.evaluate(([a, b, c]) => {
      const os = [...document.querySelectorAll('input[type="password"]')];
      const dat = (o, v) => {
        if (!o) return; // RED: thiếu ô thì để assert báo, đừng crash suite
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        set.call(o, v);
        o.dispatchEvent(new Event("input", { bubbles: true }));
      };
      dat(os[0], a); dat(os[1], b); dat(os[2], c);
      [...document.querySelectorAll("button")]
        .find((n) => n.textContent?.trim() === "Xác nhận")?.click();
    }, [cu, moi, nhacLai]);
    await new Promise((r) => setTimeout(r, 700));
    return trang.evaluate(() =>
      [...document.querySelectorAll('[role="alert"], [role="status"]')]
        .map((n) => n.textContent?.trim()).filter(Boolean).join(" | "));
  };

  const saiCu = await dienVaGui("sai-bet", "matkhau-moi-1", "matkhau-moi-1");
  kiem(/Mật khẩu hiện tại không đúng/.test(saiCu),
    "sai mật khẩu cũ → báo 'Mật khẩu hiện tại không đúng'", saiCu || "(im lặng)");

  const khongKhop = await dienVaGui("mat-khau-dung", "matkhau-moi-1", "matkhau-moi-2");
  kiem(/không khớp/i.test(khongKhop),
    "hai mật khẩu mới lệch nhau → báo 'không khớp'", khongKhop || "(im lặng)");

  const thanhCong = await dienVaGui("mat-khau-dung", "matkhau-moi-1", "matkhau-moi-1");
  kiem(/thành công/i.test(thanhCong),
    "đúng mật khẩu cũ + cặp mới khớp → báo thành công", thanhCong || "(im lặng)");
  await trang.close();
}

/* ---- 3g. Quên mật khẩu ở màn đăng nhập ------------------------------ */
{
  console.log("\nQuên mật khẩu:");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  /* KHÔNG nhét phiên — và phải XOÁ localStorage: các mục trước đã nhét
     phiên vào cùng origin nên không xoá là auto-đăng-nhập, mất màn login. */
  await trang.evaluateOnNewDocument(() => localStorage.clear());
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(GOC, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await trang.waitForSelector('input[type="password"]', { timeout: 15_000 });

  const coNut = await trang.evaluate(() =>
    [...document.querySelectorAll("button")]
      .some((b) => /quên mật khẩu/i.test(b.textContent || "")));
  kiem(coNut, "màn đăng nhập có nút Quên mật khẩu");

  /* Bấm khi chưa nhập email → phải nhắc nhập email, không gửi khống. */
  await trang.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /quên mật khẩu/i.test(b.textContent || ""))?.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  const nhacEmail = await trang.evaluate(() =>
    [...document.querySelectorAll('[role="alert"], [role="status"]')]
      .map((n) => n.textContent?.trim()).filter(Boolean).join(" | "));
  kiem(/email/i.test(nhacEmail), "chưa nhập email thì nhắc nhập email", nhacEmail || "(im lặng)");

  /* Nhập email rồi bấm → báo đã gửi mail. */
  await trang.type("#vmp-login-email", "kiem-thu@vi-du.test");
  await trang.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /quên mật khẩu/i.test(b.textContent || ""))?.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  const daGui = await trang.evaluate(() =>
    [...document.querySelectorAll('[role="alert"], [role="status"]')]
      .map((n) => n.textContent?.trim()).filter(Boolean).join(" | "));
  kiem(/đã gửi/i.test(daGui), "có email thì báo ĐÃ GỬI mail đặt lại", daGui || "(im lặng)");
  await trang.close();
}

/* ---- 3h. Tổng quan 1366: Phân tích chi tiết KHÔNG đè chữ ------------ */
{
  console.log("\nTổng quan 1366 — không đè chữ:");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1366, height: 768 });
  await trang.goto(`${GOC}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2200));
  await trang.evaluate(() => {
    [...document.querySelectorAll("button.vmp-mo-sau")]
      .find((x) => x.textContent?.includes("Phân tích chi tiết"))?.click();
  });
  await new Promise((r) => setTimeout(r, 1000));

  /* Khối phân tích phải có khu đất grid RIÊNG, không cùng ô với thẻ khác. */
  const khu = await trang.evaluate(() => {
    const sau = document.querySelector(".vmp-bento > .b-sau");
    const wide = document.querySelector(".vmp-bento > .card.b-wide, .vmp-bento > .b-wide");
    if (!sau || !wide) return { co: false };
    const a = sau.getBoundingClientRect(); const b = wide.getBoundingClientRect();
    const giaoDoc = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return { co: true, giaoDoc };
  });
  kiem(khu.co && khu.giaoDoc <= 0, "khối phân tích không chồng lên thẻ khác",
    `giao dọc ${khu.giaoDoc}px`);

  /* Quét chồng chữ THẬT bằng elementFromPoint qua toàn trang. */
  const chong = await trang.evaluate(async () => {
    const main = document.querySelector("main");
    main.scrollTo({ top: 0 });
    const loi = [];
    for (let buoc = 0; buoc < 10; buoc++) {
      await new Promise((r) => setTimeout(r, 100));
      const la = [...document.querySelectorAll("main *")]
        .filter((e) => e.children.length === 0 && (e.textContent || "").trim().length > 2);
      for (const e of la) {
        /* Chữ đang ẨN (tooltip đóng, lớp opacity 0) vẫn có rect — không
           phải chữ người dùng thấy, bỏ qua. */
        if (e.checkVisibility && !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        const r0 = e.getBoundingClientRect();
        if (r0.width < 8 || r0.height < 8) continue;
        if (r0.top < 90 || r0.bottom > innerHeight) continue;
        const tren = document.elementFromPoint(r0.left + r0.width / 2, r0.top + r0.height / 2);
        if (!tren || tren === e || tren.contains(e) || e.contains(tren)) continue;
        /* Chỉ tính phần tử đè có CHỮ TRỰC TIẾP của chính nó: div bọc
           trong suốt, svg biểu đồ, lớp hover pointer-events:none không
           phải là "đè chữ" theo nghĩa người dùng thấy. */
        if (tren.closest("svg, canvas")) continue;
        if (getComputedStyle(tren).pointerEvents === "none") continue;
        const chuRieng = [...tren.childNodes]
          .some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
        if (!chuRieng) continue;
        const chuTren = (tren.textContent || "").trim();
        if (chuTren && !chuTren.includes((e.textContent || "").trim().slice(0, 10))) {
          loi.push(`${e.textContent.trim().slice(0, 24)} << ${(tren.className || tren.tagName)}`.slice(0, 60));
        }
      }
      main.scrollBy(0, 560);
    }
    return loi;
  });
  kiem(chong.length === 0, "không phần tử chữ nào bị phần tử khác đè",
    chong.slice(0, 3).join(" | ") || "");

  /* Nhãn Vòng năm không được tràn khung svg — đã dính thật với "T3 40"
     (nhãn mang số dài ra, sườn phải bị cắt, phản hồi chủ dự án 16/08). */
  const nhanTran = await trang.evaluate(() => {
    const svg = document.querySelector(".vmp-vongnam-svg")?.getBoundingClientRect();
    if (!svg) return ["(không thấy vòng năm)"];
    return [...document.querySelectorAll(".vmp-vongnam-svg text")].filter((x) => {
      const r = x.getBoundingClientRect();
      return r.left < svg.left - 1 || r.right > svg.right + 1;
    }).map((x) => x.textContent || "");
  });
  kiem(nhanTran.length === 0, "nhãn Vòng năm nằm trọn trong khung",
    nhanTran.join(" | "));
  await trang.close();
}

/* ---- 3i. Thanh tra = chế độ trình bày có nghĩa ---------------------- */
{
  console.log("\nChế độ trình bày thanh tra:");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(`${GOC}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2000));

  const sidebar = await trang.evaluate(() =>
    [...document.querySelectorAll("aside button, nav button")]
      .some((b) => b.textContent?.trim() === "Thanh tra"));
  kiem(!sidebar, "user card KHÔNG còn toggle Thanh tra vô danh");

  const coVali = await trang.evaluate(() => {
    const v = document.querySelector("[data-lp-vali]");
    return !!v && getComputedStyle(v).display !== "none";
  });
  kiem(coVali, "bình thường Vali hiển thị (tiền đề cho phép thử ẩn)");

  await trang.goto(`${GOC}#v=reports`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2200));
  await trang.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => /chế độ thanh tra/i.test(b.textContent || ""))?.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  const sauBat = await trang.evaluate(() => ({
    banner: !!document.querySelector("[data-thanhtra-banner]"),
    chuBanner: document.querySelector("[data-thanhtra-banner]")?.textContent || "",
  }));
  kiem(sauBat.banner && /trình bày thanh tra/i.test(sauBat.chuBanner),
    "bật ở Báo cáo thì banner hiện ngay", sauBat.chuBanner.slice(0, 60) || "(không có)");

  /* Sang trang khác: banner còn, Vali bị ẩn. */
  await trang.goto(`${GOC}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2000));
  const oTrangKhac = await trang.evaluate(() => ({
    banner: !!document.querySelector("[data-thanhtra-banner]"),
    valiHien: (() => {
      const v = document.querySelector("[data-lp-vali]");
      return !!v && getComputedStyle(v).display !== "none";
    })(),
  }));
  kiem(oTrangKhac.banner, "banner theo sang trang khác");
  kiem(!oTrangKhac.valiHien, "Vali và trang trí bị ẩn khi trình bày thanh tra");

  await trang.evaluate(() => {
    document.querySelector("[data-thanhtra-banner] button")?.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  const daTat = await trang.evaluate(() => !document.querySelector("[data-thanhtra-banner]"));
  kiem(daTat, "nút Tắt trên banner tắt được tại chỗ");
  await trang.close();
}

/* ---- 3k. Báo cáo: khối VMP 2D là mặc định, 3D là khám phá ----------- */
{
  console.log("\nBáo cáo — khối VMP 2D mặc định:");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(`${GOC}#v=reports`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2600));
  const kq = await trang.evaluate(() => {
    const khoi = document.querySelector(".vmp-space3d");
    return {
      coKhoi: !!khoi,
      coCanvas: !!khoi?.querySelector("canvas"),
      nut2dChon: khoi?.querySelector('button[data-map-mode="2d"]')?.className.includes("is-chon"),
      coNut3d: !!khoi?.querySelector('button[data-map-mode="3d"]'),
      nhan3d: khoi?.querySelector('button[data-map-mode="3d"]')?.textContent?.trim(),
    };
  });
  kiem(kq.coKhoi, "khối không gian VMP có mặt ở Báo cáo");
  kiem(!kq.coCanvas, "mặc định KHÔNG dựng canvas — 2D là mặt chính");
  kiem(!!kq.nut2dChon, "nút 2D (Bản đồ tiến độ) đang được chọn");
  kiem(kq.coNut3d && kq.nhan3d === "Xem bản đồ 3D",
    "nút khám phá mang đúng tên 'Xem bản đồ 3D'", kq.nhan3d || "(không có)");
  await trang.close();
}

/* ---- 3l. Trang Luật: phân quyền đúng năm vai hiện hành -------------- */
{
  console.log("\nLuật đang áp dụng — năm vai:");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(`${GOC}#v=rules`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2400));
  const chu = await trang.evaluate(() => document.querySelector("main")?.innerText || "");
  kiem(["workshop_manager", "workshop_staff", "qa_staff"].every((v) => chu.includes(v)),
    "phân quyền liệt kê đủ các vai nghiệp vụ mới", chu.includes("workshop_manager") ? "" : "(thiếu vai xưởng)");
  kiem(!chu.includes("(viewer)"), "không còn Viewer trong danh sách vai hiệu lực");
  kiem(!chu.includes("department_user"), "không còn vai cũ department_user");
  kiem(/Chế độ quyền màn hình/.test(chu), "hiện chế độ áp quyền (preview/enforced)");
  kiem(!/Google Sheet'?\s*$/m.test(chu) && /Sheet chỉ còn tham chiếu/.test(chu),
    "nguồn công thức ghi đúng: database là gốc, Sheet chỉ tham chiếu");
  await trang.close();
}

/* ---- 3m. Hiệu năng: bảng timeline ẢO HOÁ khi >100 dòng -------------- */
{
  console.log("\nẢo hoá bảng timeline (180 dòng):");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, {
    supabaseUrl: URL_SB, kichBan: "day",
    suaKho: (kho) => {
      const ds = kho.rpc_get_vmp_dashboard.activities;
      for (let i = ds.length; i < 180; i++) ds.push(dungHangMuc(i));
    },
  });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(`${GOC}#v=timeline`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2600));
  await trang.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Dòng thời gian")?.click();
  });
  await new Promise((r) => setTimeout(r, 1200));

  const truoc = await trang.evaluate(() => ({
    soHang: document.querySelectorAll("tbody tr.timeline-day-row").length,
    tongLoc: document.querySelector(".timeline-map-surface__head span")?.textContent || "",
  }));
  kiem(/180 hạng mục/.test(truoc.tongLoc), "bộ lọc thấy đủ 180 hạng mục", truoc.tongLoc.slice(0, 40));
  kiem(truoc.soHang > 0 && truoc.soHang < 120,
    "DOM chỉ dựng lát đang thấy (<120 hàng), không phải cả 180", `${truoc.soHang} hàng`);

  /* Cuộn xuống đáy: các hàng cuối phải hiện ra (đệm giữ đúng tổng cao). */
  const cuoi = await trang.evaluate(async () => {
    const khung = document.querySelector(".timeline-day-board");
    khung.scrollTop = khung.scrollHeight;
    await new Promise((r) => setTimeout(r, 500));
    const hang = [...document.querySelectorAll("tbody tr.timeline-day-row")];
    return {
      soHang: hang.length,
      maCuoi: hang[hang.length - 1]?.querySelector(".timeline-card-code")?.textContent || "",
    };
  });
  kiem(cuoi.soHang < 120 && cuoi.maCuoi.length > 0,
    "cuộn tới đáy vẫn chỉ dựng lát nhìn thấy và có hàng cuối", `${cuoi.soHang} hàng · ${cuoi.maCuoi}`);
  await trang.close();
}

/* ---- 3n. Hợp đồng hiệu năng: KHÔNG tải chunk 3D trước khi mở -------- */
{
  console.log("\nHợp đồng lazy 3D:");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  /* Các mục trước có thể đã bật trí nhớ 3D — phải xoá để đo đường lạnh. */
  await trang.evaluateOnNewDocument(() => {
    localStorage.removeItem("vmp-timeline-3d");
    localStorage.removeItem("vmp-workload-3d");
  });
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(`${GOC}#v=timeline`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2600));

  const truocMo = await trang.evaluate(() =>
    performance.getEntriesByType("resource")
      .map((e) => e.name)
      .filter((u) => /WorkloadSpace3D|VmpSpace3D|RiskSpace3D|NhanTruc/i.test(u)));
  kiem(truocMo.length === 0,
    "chưa bấm Xem bản đồ 3D thì KHÔNG chunk three.js nào được tải",
    truocMo.map((u) => u.split("/").pop()).join(", "));

  await trang.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Xem bản đồ 3D"))?.click();
  });
  await new Promise((r) => setTimeout(r, 2600));
  const sauMo = await trang.evaluate(() =>
    performance.getEntriesByType("resource")
      .some((e) => /WorkloadSpace3D|NhanTruc/i.test(e.name)));
  kiem(sauMo, "bấm Xem bản đồ 3D thì chunk 3D mới được tải");
  await trang.close();
}

/* ---- 3o. Không WebGL: câu tiếng Việt tử tế, 2D nguyên vẹn ----------- */
{
  console.log("\nKhông WebGL:");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.evaluateOnNewDocument(() => {
    const goc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (loai, ...con) {
      if (loai === "webgl" || loai === "webgl2" || loai === "experimental-webgl") return null;
      return goc.call(this, loai, ...con);
    };
  });
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(`${GOC}#v=reports`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2600));
  const kq = await trang.evaluate(() => ({
    thongBao: document.querySelector(".vmp-3d-khong-ho-tro")?.textContent || "",
    conNut3d: !!document.querySelector('.vmp-space3d button[data-map-mode="3d"]'),
    co2D: !!document.querySelector(".vmp-space3d"),
  }));
  kiem(/không hỗ trợ chế độ 3D/i.test(kq.thongBao),
    "có câu tiếng Việt tử tế thay vì lỗi kỹ thuật", kq.thongBao.slice(0, 60) || "(im lặng)");
  kiem(!kq.conNut3d, "nút Xem bản đồ 3D được giấu khi máy không có WebGL");
  kiem(kq.co2D, "dữ liệu 2D vẫn nguyên vẹn");
  await trang.close();
}

/* ---- 3p. Chưa xác minh quyền: tuyệt đối không vẽ bản lưu ------------- */
{
  console.log("\nChưa xác minh quyền — không vẽ bản lưu:");
  const trang = await trinhDuyet.newPage();
  /* RPC màn hình và mode đều bị trễ 4 giây. Bản lưu tồn tại sẵn trong
     localStorage nhưng outer shell không được mount dữ liệu bảo vệ trước
     khi access RPC, và snapshot vẫn không được đọc trước item permission. */
  await caiGiaLap(trang, {
    supabaseUrl: URL_SB, kichBan: "day",
    doTre: { rpc_my_ui_access: 4000, item_permissions_mode: 4000, rpc_get_vmp_dashboard: 4000 },
  });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  /* Dấu vân tay 25 hạng mục: nếu nó xuất hiện trước RPC thì đã đọc snapshot
     trái phép. */
  const hangMucSnap = Array.from({ length: 24 }, (_, i) => dungHangMuc(i));
  const rieng = dungHangMuc(0);
  hangMucSnap.push({
    ...rieng, id: "SNAP-CU-99-IQ", code: "SNAP-CU-99-IQ",
    _raw: { ...rieng._raw, validation_code: "SNAP-CU-99-IQ" },
  });
  await trang.evaluateOnNewDocument((snap) => {
    localStorage.setItem("vmp_snapshot_v2", JSON.stringify({
      ...snap, year: new Date().getFullYear(), at: Date.now(),
    }));
  }, { v: 2, userId: NGUOI_DUNG.id, mode: "preview", objects: [], activities: hangMucSnap });
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(`${GOC}#v=timeline`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 3500));
  const truocXacMinh = await trang.evaluate(() => ({
    coSnapshot: /\/25 hạng mục/.test(document.body.innerText || ""),
    coTrangBaoVe: !!document.querySelector(".vmp-view-enter"),
  }));
  kiem(!truocXacMinh.coSnapshot && !truocXacMinh.coTrangBaoVe,
    "trước RPC quyền: không vẽ snapshot hoặc trang bảo vệ");
  /* Bản mới về (sau ≥4s) phải là dữ liệu server 24 hạng mục, không phải
     bản lưu cũ 25 hạng mục. */
  let moiVe = false;
  for (let i = 0; i < 100; i += 1) {
    const kq = await trang.evaluate(() => ({
      conSnap: /\/25 hạng mục/.test(document.body.innerText || ""),
      conBanner: /bản lưu|Đang tải dữ liệu/i.test(document.body.innerText || ""),
      coDuLieu: /\/24 hạng mục/.test(document.body.innerText || ""),
    }));
    if (!kq.conSnap && !kq.conBanner && kq.coDuLieu) { moiVe = true; break; }
    await new Promise((r) => setTimeout(r, 150));
  }
  kiem(moiVe, "sau xác minh: dữ liệu server (24 hạng mục) hiện thay vì snapshot cũ");
  await trang.close();
}

/* ---- 3q. Mất WebGL context giữa chừng → tự rơi về 2D ---------------- */
{
  console.log("\nMất WebGL context giữa chừng:");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(`${GOC}#v=timeline`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2600));
  const coWebGL2 = await trang.evaluate(() => {
    try { return !!document.createElement("canvas").getContext("webgl2"); }
    catch { return false; }
  });
  if (!coWebGL2) {
    // Headless không có WebGL2 thì nút 3D vốn bị giấu (đã kiểm ở 3o) —
    // kịch bản mất context không tồn tại để kiểm. Không tính là hỏng.
    console.log("  (bỏ qua: môi trường không có WebGL2 — nút 3D bị giấu, đã kiểm ở 3o)");
  } else {
    // Mở góc khám phá 3D trên Timeline (chunk Three lazy-load từ đây).
    const moKham = await trang.evaluate(() => {
      const nut = [...document.querySelectorAll("button")]
        .find((b) => /khám phá 3d|xem bản đồ 3d/i.test(b.textContent || ""));
      if (!nut) return false;
      nut.click();
      return true;
    });
    kiem(moKham, "có nút mở góc 3D trên Timeline");
    // Chunk Three lazy-load rồi mới mount canvas.
    let coCanvas = false;
    for (let i = 0; i < 40; i += 1) {
      coCanvas = await trang.evaluate(() => !!document.querySelector("#workload-map-3d canvas"));
      if (coCanvas) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    kiem(coCanvas, "cảnh 3D mount được canvas");
    if (coCanvas) {
      // WEBGL_lose_context sinh ra đúng để mô phỏng tình huống này.
      const mat = await trang.evaluate(() => {
        const canvas = document.querySelector("#workload-map-3d canvas");
        const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
        const ext = gl?.getExtension("WEBGL_lose_context");
        if (!ext) return false;
        ext.loseContext();
        return true;
      });
      kiem(mat, "mô phỏng được mất context (WEBGL_lose_context)");
      let ve2d = false;
      for (let i = 0; i < 30; i += 1) {
        ve2d = await trang.evaluate(() =>
          !document.querySelector("#workload-map-3d canvas")
          && !!document.querySelector('button[data-map-mode="2d"].is-chon'));
        if (ve2d) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      kiem(ve2d, "canvas chết thì trang tự rơi về bảng 2D, không màn trắng");
    }
  }
  await trang.close();
}

/* ---- 4. Chuyển sáng/tối đổi thật bảng màu --------------------------- */
{
  console.log("\nChế độ sáng/tối:");
  const doc = {};
  for (const che of ["light", "dark"]) {
    const trang = await trinhDuyet.newPage();
    await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
    await nhetPhien(trang, { supabaseUrl: URL_SB, cheDo: che });
    await trang.setViewport({ width: 1440, height: 900 });
    await trang.goto(`${GOC}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 1600));
    doc[che] = await trang.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        canvas: cs.getPropertyValue("--lp-canvas").trim(),
        ink: cs.getPropertyValue("--lp-ink").trim(),
        nenThan: getComputedStyle(document.body).backgroundColor,
      };
    });
    await trang.close();
  }
  kiem(doc.light.canvas !== doc.dark.canvas, "nền đổi theo chế độ",
    `${doc.light.canvas} vs ${doc.dark.canvas}`);
  kiem(doc.light.ink !== doc.dark.ink, "màu chữ đổi theo chế độ",
    `${doc.light.ink} vs ${doc.dark.ink}`);
  console.log(`  sáng ${doc.light.canvas} · tối ${doc.dark.canvas}`);
}

/* ---- 5. Trạng thái rỗng không để lại màn trắng ---------------------- */
{
  console.log("\nDữ liệu rỗng:");
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "rong" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(`${GOC}#v=progress`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2200));
  const kq = await trang.evaluate(() => ({
    coChu: (document.querySelector("main")?.innerText || "").trim().length,
    coLoiVo: !!document.querySelector("pre")?.textContent?.includes("TypeError"),
  }));
  kiem(kq.coChu > 200, "màn rỗng vẫn giải thích bằng chữ", `${kq.coChu} ký tự`);
  kiem(!kq.coLoiVo, "màn rỗng không vỡ");
  console.log(`  ${kq.coChu} ký tự nội dung`);
  await trang.close();
}

await trinhDuyet.close();

console.log(`\n${"─".repeat(52)}`);
console.log(`${soDat} đạt · ${soHong} hỏng`);
if (soHong > 0) { console.error("KHÔNG ĐẠT."); process.exit(1); }
console.log("ĐẠT.");

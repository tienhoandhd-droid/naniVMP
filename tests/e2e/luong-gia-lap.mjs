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
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";

const URL_SB = (() => {
  const noi = readFileSync(new URL("../../.env.local", import.meta.url).pathname, "utf8");
  const m = noi.match(/^VITE_SUPABASE_URL=(.+)$/m);
  if (!m) throw new Error(".env.local thiếu VITE_SUPABASE_URL");
  return m[1].trim();
})();

const MAN = [
  ["today", "Hôm nay"],
  ["overview", "Tổng quan"],
  ["timeline", "Timeline VMP"],
  ["alerts", "Cảnh báo & Rủi ro"],
  ["progress", "Cập nhật tiến độ"],
  ["source", "Danh mục & Nhập liệu"],
  ["workload", "Phân công & Tải việc"],
  ["reports", "Báo cáo & AI"],
  ["rules", "Luật đang áp dụng"],
  ["people", "Nhân sự & phân công"],
  ["accounts", "Tài khoản & quyền truy cập"],
  ["phanquyen", "Phân quyền & trách nhiệm"],
  ["health", "Sức khoẻ dữ liệu"],
  ["audit", "Audit log"],
  ["admin", "Quản trị"],
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
    coVai: document.body.innerText.includes("quan_ly_chat_luong")
      || document.body.innerText.includes("Người kiểm thử"),
  }));
  kiem(daBamLichSu, "hộp sửa có mục Lịch sử thay đổi");
  kiem(lichSu.coDong, "lịch sử hiện lý do từ rpc_item_progress_history");
  kiem(lichSu.coVai, "lịch sử hiện người thao tác");
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

/* =====================================================================
 *  lotus-shell.mjs — hợp đồng shell Lotus Pearl trong trình duyệt thật
 *  ---------------------------------------------------------------------
 *  Kiểm những thứ chỉ lộ ra khi chạy thật: hình học hộp thoại, bẫy tiêu
 *  điểm, nền có trơ không, tiêu điểm có quay về chỗ cũ không, bề rộng
 *  sidebar, và ngăn kéo trên điện thoại.
 *
 *  Không dùng route giả hay hộp thoại chỉ-để-test: điểm vào là đúng nút
 *  "Mật khẩu" mà người dùng thật bấm.
 *
 *  Chạy: bash scripts/with-preview.sh -- npm run shell
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

let soDat = 0; let soHong = 0;
function kiem(dk, ten, chiTiet = "") {
  if (dk) { soDat += 1; console.log(`  ✓ ${ten}`); return; }
  soHong += 1;
  console.error(`  ✗ ${ten}${chiTiet ? ` — ${chiTiet}` : ""}`);
}

async function moApp(trinhDuyet, { w = 1440, h = 900, che = "light", mobile = false } = {}) {
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB, cheDo: che });
  await trang.setViewport({ width: w, height: h, isMobile: mobile });
  await trang.goto(`${GOC}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2400));
  return trang;
}

const trinhDuyet = await puppeteer.launch({
  executablePath: CHROME, headless: "new", args: ["--no-sandbox"],
});

/* ---- 1. Hình học sidebar -------------------------------------------- */
{
  console.log("Sidebar:");
  const trang = await moApp(trinhDuyet);
  const kq = await trang.evaluate(() => {
    const sb = document.querySelector(".vmp-sidebar");
    const nhom = [...document.querySelectorAll(".vmp-sidebar nav > div > div:first-child")]
      .map((d) => d.textContent.trim()).filter(Boolean);
    return { rong: sb ? Math.round(sb.getBoundingClientRect().width) : 0, nhom };
  });
  kiem(kq.rong === 248, "bề rộng đúng 248px", `${kq.rong}px`);
  kiem(kq.nhom.length >= 3, "các nhóm menu đều hiện", kq.nhom.join(" · "));
  await trang.close();
}

/* ---- 2. Hộp thoại Đổi mật khẩu — điểm vào thật ---------------------- */
{
  console.log("\nHộp thoại Đổi mật khẩu:");
  const trang = await moApp(trinhDuyet);

  const moDuoc = await trang.evaluate(() => {
    const nut = [...document.querySelectorAll("button")].find((b) => /Mật khẩu/.test(b.textContent || ""));
    if (!nut) return false;
    nut.setAttribute("data-thu-nghiem", "mo-doi-mk");
    /* focus() rồi mới click(): chuột thật đặt tiêu điểm lên nút trước khi
       kích hoạt nó, còn `click()` gọi từ JavaScript thì không. Thiếu dòng
       focus, bài kiểm "trả tiêu điểm về chỗ cũ" đo nhầm sang <body>. */
    nut.focus();
    nut.click();
    return true;
  });
  kiem(moDuoc, "tìm thấy nút Mật khẩu trong shell thật");
  await new Promise((r) => setTimeout(r, 700));

  const kq = await trang.evaluate(() => {
    const hop = document.querySelector('[role="dialog"]');
    if (!hop) return { co: false };
    const r = hop.getBoundingClientRect();
    const nen = [...document.body.children]
      .filter((el) => !el.hasAttribute("data-lp-dialog-host"));
    return {
      co: true,
      modal: hop.getAttribute("aria-modal") === "true",
      coNhan: !!hop.getAttribute("aria-labelledby"),
      lechDoc: Math.abs((r.top + r.bottom) / 2 - window.innerHeight / 2),
      caoVua: r.height <= window.innerHeight - 40,
      chanTrongMan: (() => {
        const f = hop.querySelector(".lp-dialog__footer");
        return !f || f.getBoundingClientRect().bottom <= window.innerHeight + 1;
      })(),
      thanTranKhoa: getComputedStyle(document.body).overflow === "hidden",
      nenTro: nen.every((el) => el.hasAttribute("inert") && el.getAttribute("aria-hidden") === "true"),
      focusTrongHop: hop.contains(document.activeElement),
    };
  });

  kiem(kq.co, "hộp thoại đã mở");
  kiem(kq.modal, "được đánh dấu aria-modal");
  kiem(kq.coNhan, "có nhãn cho trình đọc màn hình");
  kiem(kq.lechDoc <= 12, "căn giữa theo chiều dọc trong 12px", `lệch ${Math.round(kq.lechDoc)}px`);
  kiem(kq.caoVua, "không cao quá màn hình");
  kiem(kq.chanTrongMan, "hàng nút vẫn nằm trong màn");
  kiem(kq.thanTranKhoa, "nền không cuộn được sau lưng hộp thoại");
  kiem(kq.nenTro, "mọi khối nền đã trơ và ẩn khỏi trình đọc màn hình");
  kiem(kq.focusTrongHop, "tiêu điểm đã nhảy vào trong hộp");

  /* Tab chạy vòng, không thoát ra sau lớp phủ */
  for (let i = 0; i < 8; i += 1) await trang.keyboard.press("Tab");
  const conTrong = await trang.evaluate(() =>
    document.querySelector('[role="dialog"]')?.contains(document.activeElement) === true);
  kiem(conTrong, "Tab tám lần vẫn không thoát khỏi hộp thoại");

  /* Escape đóng và trả tiêu điểm về đúng nút đã mở nó */
  await trang.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 600));
  const sauKhiDong = await trang.evaluate(() => ({
    conHop: !!document.querySelector('[role="dialog"]'),
    veDungNut: document.activeElement?.getAttribute("data-thu-nghiem") === "mo-doi-mk",
    conTro: [...document.body.children].some((el) => el.hasAttribute("inert")),
    tranDaTra: getComputedStyle(document.body).overflow !== "hidden",
  }));
  kiem(!sauKhiDong.conHop, "Escape đóng hộp thoại");
  kiem(sauKhiDong.veDungNut, "tiêu điểm quay về đúng nút đã mở");
  kiem(!sauKhiDong.conTro, "không còn khối nào bị bỏ quên ở trạng thái trơ");
  kiem(sauKhiDong.tranDaTra, "trả lại khả năng cuộn cho thân trang");

  await trang.close();
}

/* ---- 3. Hộp thoại trên điện thoại ------------------------------------ */
{
  console.log("\nHộp thoại ở 390×844:");
  const trang = await moApp(trinhDuyet, { w: 390, h: 844, mobile: true });
  await trang.evaluate(() => {
    const nut = [...document.querySelectorAll("button")].find((b) => /Mật khẩu/.test(b.textContent || ""));
    nut?.click();
  });
  await new Promise((r) => setTimeout(r, 700));
  const kq = await trang.evaluate(() => {
    const hop = document.querySelector('[role="dialog"]');
    if (!hop) return { co: false };
    const r = hop.getBoundingClientRect();
    return {
      co: true,
      trongMan: r.left >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1,
      tranNgang: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  kiem(kq.co, "mở được trên điện thoại");
  kiem(kq.trongMan, "nằm trọn trong màn hình");
  kiem(kq.tranNgang <= 1, "không làm trang tràn ngang", `${kq.tranNgang}px`);
  await trang.close();
}

/* ---- 4. Tên màn cũ vẫn dẫn đúng chỗ --------------------------------- */
{
  console.log("\nĐường dẫn cũ:");
  for (const [hash, mongDoi, ghiChu] of [
    ["risk", "Cảnh báo & Rủi ro", "gộp vào Cảnh báo"],
    ["inventory", "Cập nhật tiến độ", "Tiến độ gộp theo đối tượng"],
  ]) {
    const trang = await trinhDuyet.newPage();
    await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
    await nhetPhien(trang, { supabaseUrl: URL_SB });
    await trang.setViewport({ width: 1440, height: 900 });
    await trang.goto(`${GOC}#v=${hash}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 2400));
    const kq = await trang.evaluate(() => ({
      h1: document.querySelector("h1")?.textContent?.trim() || "",
      trang: !document.querySelector("main")?.innerText?.trim(),
    }));
    kiem(kq.h1 === mongDoi, `#v=${hash} dẫn tới "${mongDoi}" (${ghiChu})`, `thấy "${kq.h1}"`);
    kiem(!kq.trang, `#v=${hash} không dẫn vào trang trắng`);
    await trang.close();
  }

  /* `inventory` phải giữ được ý nghĩa của nó, không chỉ đúng màn. */
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(`${GOC}#v=inventory`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2400));
  const gop = await trang.evaluate(() => {
    const nut = [...document.querySelectorAll(".vmp-doi-nhom button")]
      .find((b) => /Theo đối tượng/.test(b.textContent || ""));
    return nut?.classList.contains("is-chon") === true;
  });
  kiem(gop, "#v=inventory mở sẵn chế độ gộp theo đối tượng");
  await trang.close();
}

/* ---- 5. Giảm chuyển động -------------------------------------------- */
{
  console.log("\nGiảm chuyển động:");
  const trang = await trinhDuyet.newPage();
  await trang.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(`${GOC}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2200));
  await trang.evaluate(() => {
    const nut = [...document.querySelectorAll("button")].find((b) => /Mật khẩu/.test(b.textContent || ""));
    nut?.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  const kq = await trang.evaluate(() => {
    const hop = document.querySelector(".lp-dialog__panel");
    const cs = hop && getComputedStyle(hop);
    return {
      co: !!hop,
      khongChay: !cs || cs.animationName === "none",
      moCard: getComputedStyle(document.documentElement).getPropertyValue("--lp-mo-card").trim(),
    };
  });
  kiem(kq.co, "hộp thoại vẫn mở được");
  kiem(kq.khongChay, "không chạy hoạt ảnh mở");
  kiem(kq.moCard === "1ms", "thời lượng chuyển động đã rút về gần 0", kq.moCard);
  await trang.close();
}

await trinhDuyet.close();

console.log(`\n${"─".repeat(52)}`);
console.log(`${soDat} đạt · ${soHong} hỏng`);
if (soHong > 0) { console.error("KHÔNG ĐẠT."); process.exit(1); }
console.log("ĐẠT.");

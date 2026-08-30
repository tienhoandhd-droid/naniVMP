/* =====================================================================
 *  atelier.mjs — bộ kiểm Lotus Pearl Atelier
 *  ---------------------------------------------------------------------
 *  Kiểm những luật MỚI của nghiên cứu 15/08 (docs/design/lotus-pearl-
 *  atelier.md) mà bộ `thammy` chưa phủ:
 *
 *   1. Desktop rộng 1600/1920: không tràn ngang, đúng một h1, và
 *      --lp-shell-pad thật sự giãn theo khổ (36px/48px).
 *   2. Lớp nghệ thuật: mọi vùng [data-lp-art] không chứa bảng/form,
 *      không bắt chuột, opacity nằm trong ngưỡng đã khai (≤12% thường,
 *      12–20% riêng panel đăng nhập).
 *   3. Vali: có mặt ở Phân công, VẮNG MẶT ở Audit log và Cảnh báo.
 *   4. Không emoji trong chữ nghiệp vụ của các màn vận hành.
 *   5. Vàng champagne không được dùng làm chữ nhỏ (nó chỉ đạt ~2.4:1).
 *
 *  Chạy: bash scripts/with-preview.sh -- npm run atelier
 * ===================================================================== */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";
const URL_SB = (() => {
  const noi = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
  const m = noi.match(/^VITE_SUPABASE_URL=(.+)$/m);
  if (!m) throw new Error(".env.local thiếu VITE_SUPABASE_URL");
  return m[1].trim();
})();

let soDat = 0;
let soHong = 0;
function kiem(ok, ten, chiTiet = "") {
  if (ok) { soDat += 1; return; }
  soHong += 1;
  console.error(`  ✗ ${ten}${chiTiet ? ` — ${chiTiet}` : ""}`);
}

const trinhDuyet = await puppeteer.launch({
  executablePath: CHROME, headless: "new", args: ["--no-sandbox"],
});

async function moTrang({ man, w, h, che = "light", dangNhap = true }) {
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  if (dangNhap) {
    await nhetPhien(trang, { supabaseUrl: URL_SB, cheDo: che });
  } else {
    /* localStorage dùng CHUNG cả browser: các trang trước đã nhét phiên,
       không xoá thì màn "chưa đăng nhập" sẽ tự đăng nhập mất. */
    await trang.evaluateOnNewDocument(() => {
      try { localStorage.clear(); sessionStorage.clear(); } catch { /* storage bị chặn thì thôi */ }
    });
  }
  await trang.setViewport({ width: w, height: h });
  await trang.goto(man ? `${GOC}#v=${man}` : GOC, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2200));
  return trang;
}

/* Chạy trong trang: gom số liệu về art, emoji, vàng, Vali. */
const DO_TRONG_TRANG = () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2728}\u{1F900}-\u{1F9FF}]/u;
  const art = [...document.querySelectorAll("[data-lp-art]")].map((el) => {
    const sau = getComputedStyle(el, "::after");
    return {
      motif: el.dataset.lpArt,
      chuaDuLieu: !!el.querySelector("table, form, input, select, textarea"),
      opacity: Number(sau.opacity),
      batChuot: getComputedStyle(el).pointerEvents !== "none"
        && el.matches(".vq-brand-art, [data-lp-art]") && false, // wrapper được phép nhận chuột nếu chứa nội dung
      pseudoBatChuot: sau.pointerEvents !== "none",
    };
  });

  /* Vàng làm chữ nhỏ: quét mọi phần tử có chữ trực tiếp. */
  const laVang = (mau) => {
    const m = mau.match(/rgba?\((\d+),?\s*(\d+),?\s*(\d+)/);
    if (!m) return false;
    const [r, g, b] = [+m[1], +m[2], +m[3]];
    // hai sắc gold của token: #C7A15B và #D6B56E, sai số ±10 mỗi kênh
    return (Math.abs(r - 199) < 10 && Math.abs(g - 161) < 10 && Math.abs(b - 91) < 10)
      || (Math.abs(r - 214) < 10 && Math.abs(g - 181) < 10 && Math.abs(b - 110) < 10);
  };
  let chuVangNho = 0;
  for (const el of document.querySelectorAll("body *")) {
    const coChu = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent && n.textContent.trim().length > 0);
    if (!coChu) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (laVang(cs.color) && parseFloat(cs.fontSize) < 18) chuVangNho += 1;
  }

  const chuMain = (document.querySelector("main")?.innerText || document.body.innerText || "");
  return {
    art,
    soVali: document.querySelectorAll("[data-lp-vali]").length,
    coEmoji: emoji.test(chuMain),
    viDuEmoji: (chuMain.match(emoji) || [])[0] || "",
    chuVangNho,
    tranNgang: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    soH1: document.querySelectorAll("h1").length,
    shellPad: getComputedStyle(document.documentElement).getPropertyValue("--lp-shell-pad").trim(),
  };
};

/* ---- 1. Desktop rộng: 4 khổ × 2 chế độ trên ba màn chính ------------ */
console.log("Desktop rộng (1366/1440/1600/1920 × sáng/tối):");
const KHO = [
  { w: 1366, h: 768, pad: "24px" },
  { w: 1440, h: 900, pad: "32px" },
  { w: 1600, h: 900, pad: "36px" },
  { w: 1920, h: 1080, pad: "48px" },
];
for (const kho of KHO) {
  for (const che of ["light", "dark"]) {
    for (const man of ["today", "overview", "workload"]) {
      const trang = await moTrang({ man, w: kho.w, h: kho.h, che });
      const kq = await trang.evaluate(DO_TRONG_TRANG);
      const ten = `${man} ${kho.w}px ${che}`;
      kiem(kq.tranNgang <= 1, `${ten}: không tràn ngang`, `${kq.tranNgang}px`);
      kiem(kq.soH1 === 1, `${ten}: đúng một h1`, `thấy ${kq.soH1}`);
      kiem(kq.shellPad === kho.pad, `${ten}: --lp-shell-pad = ${kho.pad}`, `thấy "${kq.shellPad}"`);
      kiem(!kq.coEmoji, `${ten}: không emoji nghiệp vụ`, kq.viDuEmoji);
      kiem(kq.chuVangNho === 0, `${ten}: vàng không làm chữ nhỏ`, `${kq.chuVangNho} chỗ`);
      for (const a of kq.art) {
        kiem(!a.chuaDuLieu, `${ten}: art "${a.motif}" không chứa bảng/form`);
        kiem(!a.pseudoBatChuot, `${ten}: art "${a.motif}" không bắt chuột`);
        kiem(a.opacity <= 0.12, `${ten}: art "${a.motif}" opacity ≤ 12%`, String(a.opacity));
      }
      await trang.close();
    }
  }
  console.log(`  ✓ khổ ${kho.w}×${kho.h} xong`);
}

/* ---- 2. Vali đúng chỗ ------------------------------------------------ */
console.log("\nVali đúng chỗ:");
{
  const trang = await moTrang({ man: "workload", w: 1440, h: 900 });
  const kq = await trang.evaluate(DO_TRONG_TRANG);
  kiem(kq.soVali >= 1, "Phân công có Vali", `thấy ${kq.soVali}`);
  await trang.close();
}
for (const man of ["audit", "alerts"]) {
  const trang = await moTrang({ man, w: 1440, h: 900 });
  const kq = await trang.evaluate(DO_TRONG_TRANG);
  kiem(kq.soVali === 0, `${man} KHÔNG có Vali`, `thấy ${kq.soVali}`);
  await trang.close();
}

/* ---- 3. Panel đăng nhập: lacquer sweep đậm đúng ngưỡng riêng --------- */
console.log("\nĐăng nhập:");
{
  const trang = await moTrang({ man: "", w: 1440, h: 900, dangNhap: false });
  const kq = await trang.evaluate(() => {
    const panel = document.querySelector(".vq-brand-panel");
    const art = document.querySelector('[data-lp-art="login-sweep"]');
    const sau = art ? getComputedStyle(art, "::after") : null;
    const form = document.querySelector(".vq-login-panel");
    return {
      coArt: !!art,
      opacity: sau ? Number(sau.opacity) : 0,
      artTrongPanel: !!(panel && art && panel.contains(art)),
      formSachArt: !!form && !form.querySelector("[data-lp-art]"),
      tranNgang: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  kiem(kq.coArt, "panel thương hiệu có lotus sweep");
  kiem(kq.artTrongPanel, "sweep nằm trong panel sơn mài");
  kiem(kq.opacity >= 0.10 && kq.opacity <= 0.20,
    "sweep đậm 10–20% (vùng duy nhất được đậm)", String(kq.opacity));
  kiem(kq.formSachArt, "panel form KHÔNG có art");
  kiem(kq.tranNgang <= 1, "đăng nhập không tràn ngang", `${kq.tranNgang}px`);
  await trang.close();
}

/* ---- 4. Giảm chuyển động: Vali không animate ------------------------- */
console.log("\nGiảm chuyển động:");
{
  const trang = await trinhDuyet.newPage();
  await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day" });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await trang.setViewport({ width: 1440, height: 900 });
  await trang.goto(`${GOC}#v=workload`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 2200));
  const kq = await trang.evaluate(() => {
    const v = document.querySelector("[data-lp-vali]");
    return v ? getComputedStyle(v).animationName : "(không thấy Vali)";
  });
  kiem(kq === "none", "reduced-motion: Vali đứng yên", kq);
  await trang.close();
}

await trinhDuyet.close();

console.log(`\n${"─".repeat(52)}`);
console.log(`${soDat} đạt · ${soHong} hỏng`);
if (soHong > 0) { console.error("KHÔNG ĐẠT."); process.exit(1); }
console.log("ĐẠT.");

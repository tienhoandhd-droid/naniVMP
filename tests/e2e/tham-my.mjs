/* =====================================================================
 *  tham-my.mjs — áp bộ luật thẩm mỹ vào trang thật
 *  ---------------------------------------------------------------------
 *  Luật và nguồn: docs/design/luat-tham-my.md
 *
 *  Nguyên tắc của bộ kiểm này: chỉ kiểm thứ ĐO ĐƯỢC. Không có luật nào
 *  kiểu "trông chưa sang". Mỗi phát hiện phải chỉ đúng phần tử, đúng con
 *  số đo được và đúng ngưỡng bị vượt — nếu không thì người sửa chỉ biết
 *  đoán mò.
 *
 *  Chạy: bash scripts/with-preview.sh -- npm run thammy
 * ===================================================================== */
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";

/** Các khổ màn đại diện: laptop phổ biến, laptop hẹp, tablet, điện thoại. */
const KHO_MAN = [
  { ten: "1440×900", w: 1440, h: 900 },
  { ten: "1366×768", w: 1366, h: 768 },
  { ten: "768×1024", w: 768, h: 1024 },
  { ten: "390×844", w: 390, h: 844 },
];

const CHE_DO = ["light", "dark"];

/* =====================================================================
 *  Phép đo chạy TRONG trình duyệt
 * ===================================================================== */

function doTrongTrang() {
  /* ---- công cụ màu ---- */
  const soRGB = (s) => {
    const m = String(s).match(/-?[\d.]+/g);
    if (!m) return null;
    const [r, g, b, a] = m.map(Number);
    return { r, g, b, a: a === undefined ? 1 : a };
  };

  const doSang = ({ r, g, b }) => {
    const f = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  const tuongPhan = (a, b) => {
    const la = doSang(a); const lb = doSang(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  /** Trộn màu có alpha lên nền phía sau. */
  const tron = (tren, duoi) => ({
    r: Math.round(tren.r * tren.a + duoi.r * (1 - tren.a)),
    g: Math.round(tren.g * tren.a + duoi.g * (1 - tren.a)),
    b: Math.round(tren.b * tren.a + duoi.b * (1 - tren.a)),
    a: 1,
  });

  /** Nền thực tế của một phần tử: leo dần lên tổ tiên cho tới khi gặp một
   *  nền đục. Gặp gradient/ảnh thì trả null — đo tương phản trên gradient
   *  không đáng tin, thà bỏ qua còn hơn báo bừa. */
  function nenThat(el) {
    let node = el;
    let ketQua = { r: 255, g: 255, b: 255, a: 1 };
    const chong = [];
    while (node && node !== document.documentElement.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      const mau = soRGB(cs.backgroundColor);
      if (mau && mau.a > 0) {
        chong.push(mau);
        if (mau.a >= 0.999) { ketQua = mau; break; }
      }
      node = node.parentElement;
    }
    for (let i = chong.length - 2; i >= 0; i -= 1) ketQua = tron(chong[i], ketQua);
    return ketQua;
  }

  const hienThi = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const chuTrucTiep = (el) => Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent.trim())
    .join(" ")
    .trim();

  const moTa = (el) => {
    const lop = (el.className && typeof el.className === "string")
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
    return `${el.tagName.toLowerCase()}${lop}`;
  };

  const loi = [];
  const canh = [];
  const bao = (nang, ma, thongDiep) => (nang ? loi : canh).push({ ma, thongDiep });

  const tatCa = Array.from(document.querySelectorAll("body *")).filter(hienThi);

  /* ---- A2 · tràn ngang ---- */
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) {
    bao(true, "A2", `trang tràn ngang ${de.scrollWidth - de.clientWidth}px`);
  }

  /* ---- A1 · thang 4px ---- */
  const leThang = new Set();
  for (const el of tatCa) {
    const cs = getComputedStyle(el);
    for (const t of ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "gap"]) {
      const v = parseFloat(cs[t]);
      if (Number.isFinite(v) && v > 0 && v % 4 !== 0) leThang.add(`${moTa(el)} ${t}=${v}px`);
    }
  }
  if (leThang.size > 0) {
    bao(false, "A1", `${leThang.size} giá trị lệch thang 4px, vd: ${[...leThang].slice(0, 3).join(" · ")}`);
  }

  /* ---- A3 · vùng chạm ----
   * Đo vùng chạm HIỆU DỤNG, không phải hộp của riêng thẻ. Mẫu "ô nhập
   * trong vỏ" rất phổ biến: <input> cao 22px nằm giữa một khung cao 48px,
   * và bấm bất cứ đâu trong khung đó đều đưa con trỏ vào ô. Đo mỗi thẻ
   * input sẽ báo sai hàng loạt, rồi người ta tắt luật đi — tệ hơn nhiều
   * so với việc đo cho đúng ngay từ đầu. */
  const vungChamHieuDung = (el) => {
    const r = el.getBoundingClientRect();
    if (!["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return r;
    const cha = el.parentElement;
    if (!cha) return r;
    const rc = cha.getBoundingClientRect();
    /* Cha được tính là "vỏ" khi nó bao trọn ô nhập theo chiều dọc và bản
       thân nó vẫn là một hàng control (không cao quá 80px). Không ràng
       buộc bề ngang: vỏ luôn rộng hơn ô nhập, và rộng hơn bao nhiêu là
       tuỳ chỗ đặt icon — lấy đó làm điều kiện thì luật vỡ mỗi lần đổi
       khoảng đệm. */
    const laVo = rc.height >= r.height && rc.height <= 80
      && rc.top <= r.top + 1 && rc.bottom >= r.bottom - 1;
    return laVo ? rc : r;
  };

  const bamDuoc = tatCa.filter((el) =>
    ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)
    || el.getAttribute("role") === "button");
  for (const el of bamDuoc) {
    const r = vungChamHieuDung(el);
    const nho = Math.min(r.width, r.height);
    if (nho < 24) bao(true, "A3", `${moTa(el)} chỉ ${Math.round(r.width)}×${Math.round(r.height)}px, dưới 24px`);
    else if (nho < 44) bao(false, "A3", `${moTa(el)} ${Math.round(r.width)}×${Math.round(r.height)}px, dưới khuyến nghị 44px`);
  }

  /* ---- A5 · thứ bậc tiêu đề ---- */
  const tieuDe = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter(hienThi);
  const soH1 = tieuDe.filter((h) => h.tagName === "H1").length;
  if (soH1 !== 1) bao(true, "A5", `có ${soH1} thẻ h1, phải đúng 1`);
  let truoc = 0;
  for (const h of tieuDe) {
    const cap = Number(h.tagName[1]);
    if (truoc && cap > truoc + 1) bao(true, "A5", `nhảy cấp h${truoc} → h${cap} ở "${h.textContent.trim().slice(0, 40)}"`);
    truoc = cap;
  }

  /* ---- B1 · tương phản chữ ---- */
  const mauChu = new Set();
  const mauNen = new Set();
  const coCu = new Set();
  const hoPhong = new Set();

  for (const el of tatCa) {
    const chu = chuTrucTiep(el);
    const cs = getComputedStyle(el);
    const co = parseFloat(cs.fontSize);
    const dam = Number(cs.fontWeight) >= 700;

    hoPhong.add(cs.fontFamily.split(",")[0].replace(/["']/g, "").trim());
    const nen = soRGB(cs.backgroundColor);
    if (nen && nen.a > 0.05) mauNen.add(`${nen.r},${nen.g},${nen.b}`);

    if (!chu) continue;
    coCu.add(co);
    const truoc_mau = soRGB(cs.color);
    if (truoc_mau) mauChu.add(`${truoc_mau.r},${truoc_mau.g},${truoc_mau.b}`);

    /* C3 · cỡ tối thiểu */
    if (co < 12) bao(true, "C3", `${moTa(el)} cỡ chữ ${co}px, dưới 12px — "${chu.slice(0, 30)}"`);

    /* C4 · chiều cao dòng */
    const cao = parseFloat(cs.lineHeight);
    if (Number.isFinite(cao) && chu.length > 60 && cao / co < 1.4) {
      bao(false, "C4", `${moTa(el)} line-height ${(cao / co).toFixed(2)}, dưới 1.4`);
    }

    /* A4 · chiều dài dòng */
    if (chu.length > 90) {
      const rong = el.getBoundingClientRect().width;
      const kyTuMoiDong = rong / (co * 0.5);
      if (kyTuMoiDong > 85) bao(false, "A4", `${moTa(el)} khoảng ${Math.round(kyTuMoiDong)} ký tự/dòng, trên 85`);
    }

    /* B1 · tỷ số tương phản */
    const nen_that = nenThat(el);
    if (!nen_that || !truoc_mau) continue;
    const truoc_tron = truoc_mau.a < 1 ? tron(truoc_mau, nen_that) : truoc_mau;
    const ty = tuongPhan(truoc_tron, nen_that);
    const nguong = (co >= 24 || (co >= 18.66 && dam)) ? 3 : 4.5;
    if (ty < nguong) {
      bao(true, "B1",
        `${moTa(el)} tương phản ${ty.toFixed(2)}:1 < ${nguong}:1 (chữ ${co}px) — "${chu.slice(0, 34)}"`);
    }
  }

  /* ---- B4 · màu không phải kênh duy nhất ---- */
  for (const el of tatCa) {
    if (!/\blp-tone--/.test(el.className || "")) continue;
    if (!el.textContent.trim()) bao(true, "B4", `${moTa(el)} mang sắc thái nhưng không có chữ nào`);
  }

  /* ---- B5 / C1 / C2 · số lượng biến thể ---- */
  if (mauChu.size > 12) bao(false, "B5", `${mauChu.size} màu chữ khác nhau, trên 12`);
  if (mauNen.size > 12) bao(false, "B5", `${mauNen.size} màu nền khác nhau, trên 12`);
  const phongThat = [...hoPhong].filter((f) => !/^(system-ui|-apple-system|sans-serif|serif|monospace|Georgia|ui-)/.test(f));
  if (phongThat.length > 2) bao(true, "C1", `${phongThat.length} họ phông: ${phongThat.join(", ")}`);
  if (coCu.size > 10) bao(false, "C2", `${coCu.size} cỡ chữ khác nhau, trên 10`);

  /* ---- D1 · chữ giữ chỗ và rác kỹ thuật ---- */
  const rac = /\b(Lorem ipsum|TODO|FIXME|undefined|NaN|\[object Object\]|Infinity)\b/;
  for (const el of tatCa) {
    const chu = chuTrucTiep(el);
    if (chu && rac.test(chu)) bao(true, "D1", `${moTa(el)} chứa rác kỹ thuật: "${chu.slice(0, 40)}"`);
  }

  /* ---- D2 · nút và liên kết có tên ---- */
  for (const el of tatCa) {
    if (!["BUTTON", "A"].includes(el.tagName)) continue;
    const ten = (el.textContent || "").trim()
      || el.getAttribute("aria-label")
      || el.getAttribute("title")
      || (el.querySelector("img")?.getAttribute("alt") || "");
    if (!ten.trim()) bao(true, "D2", `${moTa(el)} không có tên đọc được`);
  }

  /* ---- D3 · ảnh có alt ---- */
  for (const el of tatCa) {
    if (el.tagName === "IMG" && el.getAttribute("alt") === null) {
      bao(true, "D3", `img ${el.getAttribute("src")?.slice(0, 40)} thiếu thuộc tính alt`);
    }
  }

  return { loi, canh, soPhanTu: tatCa.length };
}

/* =====================================================================
 *  Điều phối
 * ===================================================================== */

const trinhDuyet = await puppeteer.launch({
  executablePath: CHROME, headless: "new", args: ["--no-sandbox"],
});

let tongLoi = 0;
let tongCanh = 0;
const bangKe = [];

for (const che of CHE_DO) {
  for (const kho of KHO_MAN) {
    const trang = await trinhDuyet.newPage();
    await trang.setViewport({ width: kho.w, height: kho.h });
    await trang.evaluateOnNewDocument((c) => { localStorage.setItem("vmp-theme", c); }, che);
    await trang.goto(GOC, { waitUntil: "networkidle2", timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 700));

    const kq = await trang.evaluate(doTrongTrang);
    await trang.close();

    const nhan = `${che} · ${kho.ten}`;
    tongLoi += kq.loi.length;
    tongCanh += kq.canh.length;
    bangKe.push({ nhan, ...kq });

    const dau = kq.loi.length ? "✗" : "✓";
    console.log(`${dau} ${nhan.padEnd(18)} ${String(kq.soPhanTu).padStart(4)} phần tử · `
      + `${kq.loi.length} vi phạm nặng · ${kq.canh.length} cảnh báo`);

    for (const v of kq.loi) console.log(`    [${v.ma}] ${v.thongDiep}`);
    for (const v of kq.canh.slice(0, 4)) console.log(`    (nhẹ) [${v.ma}] ${v.thongDiep}`);
    if (kq.canh.length > 4) console.log(`    (nhẹ) … còn ${kq.canh.length - 4} cảnh báo nữa`);
  }
}

await trinhDuyet.close();

console.log(`\nTổng: ${tongLoi} vi phạm nặng · ${tongCanh} cảnh báo`
  + ` trên ${bangKe.length} tổ hợp chế độ × khổ màn.`);
console.log("Luật và nguồn: docs/design/luat-tham-my.md");

if (tongLoi > 0) {
  console.error("\nKHÔNG ĐẠT — phải sửa hết vi phạm nặng trước khi commit.");
  process.exit(1);
}
console.log("ĐẠT.");

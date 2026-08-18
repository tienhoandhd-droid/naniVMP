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
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

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
  /* ---- công cụ màu ----
   * Chrome trả về HAI cú pháp khác nhau, và chúng dùng thang khác nhau:
   *   · rgb(51, 37, 52)                          → kênh 0–255
   *   · color(srgb 1 0.992157 0.988235 / 0.92)   → kênh 0–1
   * Cái thứ hai xuất hiện mỗi khi CSS dùng color-mix(). Đọc nhầm thang là
   * "1" biến thành gần đen thay vì trắng, và bộ kiểm báo hàng loạt vi phạm
   * tương phản không có thật. */
  const soRGB = (s) => {
    const chuoi = String(s);
    if (!chuoi || chuoi === "none" || chuoi === "transparent") return null;

    const m = chuoi.match(/-?[\d.]+(?:e-?\d+)?/g);
    if (!m) return null;
    const so = m.map(Number);

    if (/^color\(/i.test(chuoi)) {
      // color(srgb r g b / a) — bỏ qua tên không gian màu, kênh là 0–1.
      const [r, g, b, a] = so;
      return { r: r * 255, g: g * 255, b: b * 255, a: a === undefined ? 1 : a };
    }

    const [r, g, b, a] = so;
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

  /* Mô tả đủ để người sửa tìm ra chỗ. Một "span" trần không giúp được gì
     trong một trang có ba trăm span, nên khi phần tử không có class thì
     leo lên lấy tổ tiên gần nhất có class làm mốc. */
  const moTa = (el) => {
    const ten = (n) => {
      const lop = (n.className && typeof n.className === "string")
        ? `.${n.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
      return `${n.tagName.toLowerCase()}${lop}`;
    };
    if (el.className && typeof el.className === "string" && el.className.trim()) return ten(el);
    let cha = el.parentElement;
    for (let i = 0; i < 3 && cha; i += 1) {
      if (cha.className && typeof cha.className === "string" && cha.className.trim()) {
        return `${ten(cha)} > ${el.tagName.toLowerCase()}`;
      }
      cha = cha.parentElement;
    }
    return ten(el);
  };

  const hex = (m) => "#" + [m.r, m.g, m.b]
    .map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

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

    /* Ô đánh dấu và nút chọn gần như luôn đi kèm một <label>, và bấm vào
       nhãn cũng kích hoạt ô. Đo riêng cái ô 20×20 là bỏ qua toàn bộ vùng
       chạm thật mà người dùng đang dùng. */
    if (el.type === "checkbox" || el.type === "radio") {
      const nhan = el.closest("label")
        || (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null);
      return nhan ? nhan.getBoundingClientRect() : r;
    }

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

  /* Ngưỡng khuyến nghị phụ thuộc thiết bị trỏ, không phải một con số duy
     nhất. Ngón tay cần 44px (Apple HIG, Material 48dp); con trỏ chuột
     chính xác hơn nhiều, và chính bảng component token của nghiên cứu đặt
     filter chip ở 36px. Áp 44px cho desktop chỉ tạo ra hàng nghìn cảnh báo
     mà không ai sửa — mà một luật không ai sửa thì sớm bị tắt. */
  const beRong = document.documentElement.clientWidth;
  const nguongKhuyenNghi = beRong <= 768 ? 44 : 36;

  const bamDuoc = tatCa.filter((el) =>
    ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)
    || el.getAttribute("role") === "button");
  for (const el of bamDuoc) {
    const r = vungChamHieuDung(el);
    const nho = Math.min(r.width, r.height);
    if (nho < 24) bao(true, "A3", `${moTa(el)} chỉ ${Math.round(r.width)}×${Math.round(r.height)}px, dưới 24px`);
    /* Ô đánh dấu và nút chọn có kích thước chuẩn riêng: 24px là quy ước
       của mọi bảng dữ liệu dày, và phóng lên 36px thì một bảng hai mươi
       dòng trông như bảng câu hỏi trắc nghiệm. Chúng vẫn phải đạt ngưỡng
       BẮT BUỘC ở trên, chỉ miễn ngưỡng khuyến nghị. */
    else if (el.type === "checkbox" || el.type === "radio") { /* đạt */ }
    else if (nho < nguongKhuyenNghi) {
      bao(false, "A3", `${moTa(el)} ${Math.round(r.width)}×${Math.round(r.height)}px,`
        + ` dưới khuyến nghị ${nguongKhuyenNghi}px cho khổ ${beRong}px`);
    }
  }

  /* ---- A7 · điện thoại không phải kéo ngang để đọc dữ liệu ----
   * WCAG 1.4.10 Reflow cấm bắt người dùng cuộn theo cả hai chiều. A2 đã
   * bắt trang tràn ngang, nhưng một bảng đặt min-width rồi bọc trong khung
   * cuộn riêng thì lọt: trang không tràn, mà người dùng vẫn phải kéo ngang
   * cả bảng chỉ để sửa một dòng. Đây đúng là tình trạng màn Tiến độ trước
   * khi có bản thẻ cho điện thoại. */
  if (document.documentElement.clientWidth <= 768) {
    for (const el of tatCa) {
      const thua = el.scrollWidth - el.clientWidth;
      if (thua <= 40) continue;

      /* Chỉ tính phần tử THẬT SỰ cuộn được. Một nhãn đặt `overflow: hidden`
         kèm `text-overflow: ellipsis` cũng có scrollWidth lớn hơn clientWidth,
         nhưng người dùng không kéo được gì cả — chữ chỉ bị cắt và hiện dấu
         ba chấm. Bắt nó là báo sai bản chất luật. */
      const tran = getComputedStyle(el).overflowX;
      if (tran !== "auto" && tran !== "scroll") continue;

      // Vùng cuộn ngang CÓ CHỦ Ý (ma trận, dải chip lọc) đánh dấu riêng.
      if (el.closest('[data-lp-scroll="ngang"]')) continue;

      /* Vùng bọc trực tiếp một <table> cũng là ngoại lệ, không cần đánh dấu
         tay: bảng dữ liệu chính là "nội dung cần bố cục hai chiều" mà
         WCAG 1.4.10 miễn trừ. Suy ra từ cấu trúc thì bền hơn bắt mỗi bảng
         mới phải nhớ thêm một thuộc tính. */
      if (el.querySelector(":scope > table")) continue;

      bao(true, "A7", `${moTa(el)} bắt kéo ngang ${thua}px trên khổ điện thoại`);
    }
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
        `${moTa(el)} ${ty.toFixed(2)}:1 < ${nguong}:1 · chữ ${hex(truoc_tron)} trên nền ${hex(nen_that)}`
        + ` · ${co}px — "${chu.slice(0, 28)}"`);
    }
  }

  /* ---- B6 · bề mặt lớn phải theo chế độ ----
   * Một khối nền sáng nằm giữa giao diện tối (hoặc ngược lại) thì tương
   * phản CHỮ vẫn có thể đạt, nên B1 không kêu — nhưng nhìn thì như một
   * mảnh vá. Nguyên nhân gần như luôn là mã màu cứng quên đảo theo chế độ.
   * Chỉ xét khối đủ lớn (>= 40.000 px², cỡ một thẻ nội dung trở lên) để
   * không bắt nhầm chip hay badge — badge sáng trên nền tối là có chủ ý. */
  const laToi = document.documentElement.getAttribute("data-theme") === "dark";
  for (const el of tatCa) {
    /* Miễn trừ CÓ KHAI BÁO: một khối cố ý giữ nguyên nền ở cả hai chế độ
       (panel thương hiệu, ảnh bìa) đánh dấu bằng data-lp-surface="fixed".
       Khai báo chủ ý ngay trong markup tốt hơn nhiều so với việc nới ngưỡng
       hay bỏ luật — người đọc code sau này thấy ngay đó là quyết định, và
       bộ kiểm vẫn canh mọi khối còn lại. */
    if (el.closest('[data-lp-surface="fixed"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 40_000) continue;
    const cs = getComputedStyle(el);

    /* Nền có thể là màu đặc HOẶC gradient. Bỏ qua gradient thì lọt đúng
       những khối trang trí nặng nhất — thẻ hero, banner — vì chúng gần như
       luôn được tô bằng gradient. Với gradient thì lấy trung bình các chặng
       màu: đủ chính xác để biết khối đó sáng hay tối. */
    let nen = soRGB(cs.backgroundColor);
    if ((!nen || nen.a < 0.9) && cs.backgroundImage && cs.backgroundImage !== "none") {
      const chang = cs.backgroundImage.match(/(?:rgba?\([^)]+\)|color\([^)]+\))/g) || [];
      const mau = chang.map(soRGB).filter((m) => m && m.a > 0.5);
      if (mau.length >= 2) {
        nen = {
          r: mau.reduce((t, m) => t + m.r, 0) / mau.length,
          g: mau.reduce((t, m) => t + m.g, 0) / mau.length,
          b: mau.reduce((t, m) => t + m.b, 0) / mau.length,
          a: 1,
        };
      }
    }
    if (!nen || nen.a < 0.9) continue;
    const sang = doSang(nen);
    if (laToi && sang > 0.5) {
      bao(true, "B6", `${moTa(el)} nền ${hex(nen)} sáng giữa chế độ tối`
        + ` (${Math.round(r.width)}×${Math.round(r.height)}px)`);
    }
    if (!laToi && sang < 0.12) {
      bao(true, "B6", `${moTa(el)} nền ${hex(nen)} tối giữa chế độ sáng`
        + ` (${Math.round(r.width)}×${Math.round(r.height)}px)`);
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

const MAN = [
  { id: "today", ten: "Hôm nay" },
  { id: "overview", ten: "Tổng quan" },
  { id: "timeline", ten: "Dòng thời gian VMP" },
  { id: "alerts", ten: "Cảnh báo & ưu tiên" },
  { id: "progress", ten: "Cập nhật tiến độ" },
  { id: "source", ten: "Dữ liệu nguồn" },
  { id: "workload", ten: "Phân công & khối lượng" },
  { id: "reports", ten: "Báo cáo" },
  { id: "rules", ten: "Quy tắc nghiệp vụ" },
  { id: "people", ten: "Nhân sự" },
  { id: "accounts", ten: "Tài khoản & quyền" },
  { id: "phanquyen", ten: "Phân quyền" },
  { id: "health", ten: "Chất lượng dữ liệu" },
  { id: "audit", ten: "Nhật ký thay đổi" },
  { id: "admin", ten: "Quản trị" },
];

const URL_SB = docCauHinh();

function docCauHinh() {
  const f = new URL("../../.env.local", import.meta.url).pathname;
  const noi = readFileSync(f, "utf8");
  const m = noi.match(/^VITE_SUPABASE_URL=(.+)$/m);
  if (!m) throw new Error(".env.local thiếu VITE_SUPABASE_URL");
  return m[1].trim();
}

/** Gộp kết quả nhiều lượt đo, gom theo mã luật để báo cáo đọc được. */
function gomTheoLuat(danhSach) {
  const gom = new Map();
  for (const { nhan, ma, thongDiep } of danhSach) {
    if (!gom.has(ma)) gom.set(ma, []);
    gom.get(ma).push({ nhan, thongDiep });
  }
  return [...gom.entries()].sort((a, b) => b[1].length - a[1].length);
}

const trinhDuyet = await puppeteer.launch({
  executablePath: CHROME, headless: "new", args: ["--no-sandbox"],
});

const loiTatCa = [];
const canhTatCa = [];
let soLuot = 0;
let soChanNgoai = 0;

/** Một lượt đo: mở một màn ở một chế độ, một khổ, một kịch bản dữ liệu. */
async function doMotLuot({ nhan, hash, che, kho, kichBan, canDangNhap }) {
  const trang = await trinhDuyet.newPage();
  let chan = { chanNgoai: [] };

  if (canDangNhap) {
    chan = await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan });
    await nhetPhien(trang, { supabaseUrl: URL_SB, cheDo: che });
  } else {
    await trang.evaluateOnNewDocument((c) => { localStorage.setItem("vmp-theme", c); }, che);
  }

  await trang.setViewport({ width: kho.w, height: kho.h });

  /* Chờ theo DOM chứ không theo "mạng rảnh": app giữ một WebSocket realtime
     luôn thử kết nối lại, nên networkidle2 không bao giờ tới và mọi màn đều
     hết giờ sau 30 giây. */
  let kq;
  try {
    await trang.goto(`${GOC}${hash}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await new Promise((r) => setTimeout(r, canDangNhap ? 2600 : 900));
    kq = await trang.evaluate(doTrongTrang);
  } catch (err) {
    // Một màn hỏng không được giết cả bộ kiểm — ghi lại rồi đi tiếp, vì
    // dừng ở màn thứ ba nghĩa là không biết gì về mười hai màn còn lại.
    kq = { loi: [{ ma: "X0", thongDiep: `không đo được: ${String(err.message).slice(0, 80)}` }], canh: [], soPhanTu: 0 };
  } finally {
    await trang.close().catch(() => {});
  }

  soLuot += 1;
  soChanNgoai += chan.chanNgoai.length;
  for (const v of kq.loi) loiTatCa.push({ nhan, ...v });
  for (const v of kq.canh) canhTatCa.push({ nhan, ...v });

  const dau = kq.loi.length ? "✗" : "✓";
  console.log(`${dau} ${nhan.padEnd(34)} ${String(kq.soPhanTu).padStart(4)} phần tử`
    + ` · ${String(kq.loi.length).padStart(2)} nặng · ${String(kq.canh.length).padStart(2)} nhẹ`);
  return kq;
}

/* ---- 1. Màn đăng nhập: không cần giả lập, đủ hai chế độ và bốn khổ ---- */
console.log("\n── Màn đăng nhập ──");
for (const che of CHE_DO) {
  for (const kho of KHO_MAN) {
    await doMotLuot({
      nhan: `đăng nhập · ${che} · ${kho.ten}`, hash: "", che, kho,
      kichBan: "day", canDangNhap: false,
    });
  }
}

/* ---- 2. Mười lăm màn trong, dữ liệu đầy ---- */
console.log("\n── Các màn có dữ liệu ──");
for (const man of MAN) {
  for (const che of CHE_DO) {
    for (const kho of [KHO_MAN[0], KHO_MAN[3]]) {
      await doMotLuot({
        nhan: `${man.ten} · ${che} · ${kho.ten}`, hash: `#v=${man.id}`, che, kho,
        kichBan: "day", canDangNhap: true,
      });
    }
  }
}

/* ---- 3. Cùng các màn nhưng dữ liệu RỖNG ----
 * Trạng thái rỗng là chỗ hay bị bỏ quên nhất: có dữ liệu thì màn nào cũng
 * đẹp, rỗng thì lòi ra bảng trơ khung, con số 0 không ai giải thích, và
 * những khoảng trắng không ai thiết kế. */
console.log("\n── Các màn khi dữ liệu rỗng ──");
for (const man of MAN) {
  await doMotLuot({
    nhan: `${man.ten} · rỗng`, hash: `#v=${man.id}`, che: "light", kho: KHO_MAN[0],
    kichBan: "rong", canDangNhap: true,
  });
}

await trinhDuyet.close();

/* ---- Báo cáo ---- */
console.log(`\n${"─".repeat(66)}`);
console.log(`Đã đo ${soLuot} lượt · ${loiTatCa.length} vi phạm nặng · ${canhTatCa.length} cảnh báo`);
if (soChanNgoai > 0) {
  console.error(`CẢNH BÁO: ${soChanNgoai} request bị chặn vì gọi ra ngoài môi trường cách ly.`);
}

if (loiTatCa.length) {
  console.log("\nVI PHẠM NẶNG, gom theo luật:");
  for (const [ma, ds] of gomTheoLuat(loiTatCa)) {
    console.log(`\n  [${ma}] ${ds.length} lượt`);
    const mau = new Map();
    for (const { nhan, thongDiep } of ds) {
      if (!mau.has(thongDiep)) mau.set(thongDiep, []);
      mau.get(thongDiep).push(nhan);
    }
    const gioiHan = Number(process.env.THAMMY_CHI_TIET || "8");
    for (const [thongDiep, nhans] of [...mau.entries()].slice(0, gioiHan)) {
      console.log(`    · ${thongDiep}`);
      console.log(`      ở: ${nhans.slice(0, 3).join(" / ")}${nhans.length > 3 ? ` … +${nhans.length - 3}` : ""}`);
    }
    if (mau.size > gioiHan) console.log(`    … còn ${mau.size - gioiHan} kiểu vi phạm nữa`);
  }
}

if (canhTatCa.length) {
  console.log("\nCẢNH BÁO NHẸ, gom theo luật:");
  for (const [ma, ds] of gomTheoLuat(canhTatCa)) console.log(`  [${ma}] ${ds.length} lượt`);
}

console.log("\nLuật và nguồn: docs/design/luat-tham-my.md");

if (loiTatCa.length > 0) {
  console.error("\nKHÔNG ĐẠT — phải sửa hết vi phạm nặng trước khi commit.");
  process.exit(1);
}
console.log("ĐẠT.");

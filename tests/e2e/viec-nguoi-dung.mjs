/* =====================================================================
 *  viec-nguoi-dung.mjs — Checklist theo VIỆC của từng vai trò
 *  ---------------------------------------------------------------------
 *  Khác với bộ kiểm kỹ thuật: ở đây không hỏi "màn có dựng được không" mà
 *  hỏi "người ta có làm xong việc của mình không, mất mấy bước".
 *
 *  Ba vai trò, đúng ba cách dùng app khác hẳn nhau:
 *   · QA phụ trách — mở máy buổi sáng, xem việc của mình, cập nhật, đóng.
 *   · Bộ phận (xưởng/QC/cơ điện) — chỉ quan tâm việc của bộ phận mình.
 *   · Người nhập liệu — sửa hàng loạt, cần tìm nhanh và không mất chỗ.
 *
 *  Mỗi mục ghi rõ SỐ BƯỚC phải bấm. Việc hằng ngày mà quá 3 bước là hỏng.
 *
 *  Chạy: node tests/e2e/viec-nguoi-dung.mjs
 * ===================================================================== */
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { dangNhap as vaoHeThong, doiVaiTrenMan } from "./dang-nhap.mjs";
import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { LA_UI_ACCESS, uiAccessAdmin } from "./ui-access.mjs";

const GOC = "http://localhost:4173";
const QA = "Nguyễn Thị Hương";

await choServer(GOC);

const b = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});
const p = await b.newPage();
const cho = (ms) => new Promise((r) => setTimeout(r, ms));
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};
const answer = (request, body) => request.method() === "OPTIONS"
  ? request.respond({ status: 204, headers: cors, body: "" })
  : request.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
await p.setRequestInterception(true);
p.on("request", (request) => {
  // Các persona trong fixture chỉ đổi localStorage; giữ ScreenGuard enforced
  // bằng payload quyền màn hình cố định, còn dashboard vẫn là dữ liệu thật.
  if (LA_UI_ACCESS.test(request.url())) return answer(request, uiAccessAdmin);
  return request.continue();
});
/* Tách LỖI MÃ NGUỒN khỏi SỰ CỐ MẠNG. Máy chạy kiểm thỉnh thoảng mất phân
   giải tên miền Supabase (ERR_NAME_NOT_RESOLVED); lúc đó không có dữ liệu
   nào tải về nên mọi mục đều đỏ — nhưng đỏ vì mất mạng chứ không phải vì
   app hỏng. Gộp hai loại đó làm một là cách chắc chắn nhất để người ta
   quen với màu đỏ rồi thôi đọc nó. */
const LOI_MANG = /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK|Failed to fetch|WebSocket connection|net::ERR_/i;
const loiJs = [];
const loiMang = [];
const ghiLoi = (t) => (LOI_MANG.test(t) ? loiMang : loiJs).push(t);
p.on("pageerror", (e) => ghiLoi(e.message));
p.on("console", (m) => { if (m.type() === "error") ghiLoi(m.text()); });

const dangNhap = (ten = QA) => p.evaluate((t) => {
  const cu = JSON.parse(localStorage.getItem("vmp_monitor_user_v1") || "{}");
  localStorage.setItem("vmp_monitor_user_v1", JSON.stringify({
    ...cu, name: t, email: "e2e@test.local", role: "admin", perm: "admin",
  }));
}, ten);

const moMan = async (v, ten = QA) => {
  const dich = v === "overview" ? GOC : `${GOC}#v=${v}`;
  await Promise.all([
    p.waitForNavigation({ waitUntil: "networkidle2" }),
    p.evaluate(([url, t]) => {
      const cu = JSON.parse(localStorage.getItem("vmp_monitor_user_v1") || "{}");
      localStorage.setItem("vmp_monitor_user_v1", JSON.stringify({
        ...cu, name: t, email: "e2e@test.local", role: "admin", perm: "admin",
      }));
      history.replaceState(null, "", url);
      location.reload();
    }, [dich, ten]),
  ]);
  await cho(3000);
  const state = await p.evaluate(() => ({
    href: location.href,
    hash: location.hash,
    main: document.querySelector("main")?.innerText.slice(0, 240) || "",
  }));
  const expectedHash = v === "overview" ? "" : `#v=${v}`;
  if (state.hash !== expectedHash) {
    throw new Error(`moMan target=${v}, expected hash=${JSON.stringify(expectedHash)}: ${JSON.stringify(state)}`);
  }
};
const chu = () => p.evaluate(() => document.querySelector("main")?.innerText || "");
const bam = (re) => p.evaluate((r) => {
  const t = [...document.querySelectorAll("button, a[href], [role=button]")]
    .find((x) => new RegExp(r).test((x.textContent || "").trim()));
  if (!t) return false;
  t.click();
  return true;
}, re.source ?? re);

const ket = [];
const kiem = (vai, viec, dat, ghi = "", buoc = null) => {
  ket.push({ vai, viec, dat, ghi, buoc });
  const bieu = dat ? "✅" : "❌";
  const sb = buoc == null ? "" : `  [${buoc} bước]`;
  console.log(`  ${bieu} ${viec}${sb}${ghi ? ` — ${ghi}` : ""}`);
};

await p.setViewport({ width: 1440, height: 900 });
await vaoHeThong(p, GOC);
await dangNhap();

/* ---- Điều kiện tiên quyết: dữ liệu thật đã tải về chưa ----
   Không có dữ liệu thì mọi phép kiểm bên dưới đều vô nghĩa. Dừng sớm và
   nói rõ lý do, thay vì in ra một bảng toàn dấu đỏ. */
await p.goto(`${GOC}#v=overview`, { waitUntil: "networkidle2" });
await dangNhap();
await p.reload({ waitUntil: "networkidle2" });
await cho(3500);
const coDuLieu = await p.evaluate(() => {
  const el = [...document.querySelectorAll("span")].find((s) => /\d+\/\d+ hạng mục/.test(s.textContent || ""));
  const m = el && (el.textContent || "").match(/(\d+)\/(\d+)/);
  return m ? +m[2] : 0;
});
if (coDuLieu < 50) {
  console.log("\n⏭  KHÔNG KIỂM ĐƯỢC — chưa tải được dữ liệu thật từ Supabase");
  console.log(`   chỉ thấy ${coDuLieu} hạng mục.`);
  if (loiMang.length) console.log(`   sự cố mạng: ${loiMang[0].slice(0, 120)}`);
  console.log("   Bộ kiểm này cần dữ liệu thật; chạy lại khi mạng ổn định.\n");
  await b.close();
  process.exit(0);
}

/* ==================== VAI 1 · QA PHỤ TRÁCH ==================== */
console.log("\n── VAI 1 · QA phụ trách (mở máy buổi sáng) ──");
await moMan("today");
let t = await chu();
kiem("QA", "Mở app thấy ngay việc của mình, không phải lọc",
  /Việc hôm nay của/.test(t) && new RegExp(QA).test(t), "", 1);
kiem("QA", "Biết ngay có bao nhiêu việc đã trễ",
  /Đã trễ \(\d+\)/.test(t), (t.match(/Đã trễ \((\d+)\)/) || [])[0] || "");
kiem("QA", "Biết việc nào tới hạn trong tuần",
  /Tới hạn trong 7 ngày \(\d+\)/.test(t), (t.match(/Tới hạn trong 7 ngày \((\d+)\)/) || [])[0] || "");
kiem("QA", "Biết hồ sơ nào còn thiếu để điền nốt",
  /Cần điền nốt \(\d+\)/.test(t), (t.match(/Cần điền nốt \((\d+)\)/) || [])[0] || "");

const coNutCapNhat = await p.evaluate(() =>
  [...document.querySelectorAll("button")].some((x) => /Cập nhật/.test(x.textContent || "")));
kiem("QA", "Mỗi dòng có nút cập nhật ngay tại chỗ", coNutCapNhat, "", 2);

if (coNutCapNhat) {
  const maTruoc = await p.evaluate(() => {
    const d = document.querySelector(".hn-dong .hn-ten b");
    return d ? d.textContent.trim() : "";
  });
  await p.evaluate(() => {
    const d = [...document.querySelectorAll(".hn-dong")][0];
    d?.querySelector("button")?.click();
  });
  await cho(2500);
  const sau = await chu();
  kiem("QA", "Bấm Cập nhật nhảy tới ĐÚNG hạng mục đó",
    !!maTruoc && sau.includes(maTruoc), `mã ${maTruoc}`, 2);
  const soDong = await p.evaluate(() => document.querySelectorAll("tbody tr").length);
  kiem("QA", "Không phải cuộn qua hàng trăm dòng để tìm",
    soDong > 0 && soDong <= 12, `${soDong} dòng hiện ra`);
}

await moMan("today");
kiem("QA", "Có thể xem việc của cả đội khi cần",
  await p.evaluate(() => [...document.querySelectorAll("label")]
    .some((x) => /Xem của mọi người/.test(x.textContent || ""))), "", 1);

/* ==================== VAI 2 · BỘ PHẬN ==================== */
console.log("\n── VAI 2 · Bộ phận (xưởng / QC / cơ điện) ──");
await p.goto(`${GOC}#v=timeline&dept=xsx`, { waitUntil: "networkidle2" });
await dangNhap();
await p.reload({ waitUntil: "networkidle2" });
await cho(3500);
const chip = await p.evaluate(() => {
  const el = [...document.querySelectorAll("span")].find((s) => /\d+\/\d+ hạng mục/.test(s.textContent || ""));
  const m = el && (el.textContent || "").match(/(\d+)\/(\d+)/);
  return m ? { hien: +m[1], tong: +m[2] } : null;
});
kiem("Bộ phận", "Lọc được chỉ việc của bộ phận mình bằng URL",
  !!chip && chip.hien < chip.tong, chip ? `${chip.hien}/${chip.tong}` : "", 1);
t = await chu();
kiem("Bộ phận", "Thấy tháng nào bị dồn việc mà không phải tự đếm",
  /gánh \d+ hạng mục|dồn \d+ hạng mục|nặng nhất/.test(t), "");
kiem("Bộ phận", "Đọc được số của từng ô mà không cần rê chuột",
  await p.evaluate(() => [...document.querySelectorAll("button")]
    .some((x) => /Bảng nhiệt 2D/.test(x.textContent || ""))), "có bản 2D in được", 2);

await moMan("alerts");
t = await chu();
kiem("Bộ phận", "Danh sách cảnh báo gom theo cụm, không phải trăm dòng giống nhau",
  /Đang gom cụm/.test(t), "");
kiem("Bộ phận", "Biết thứ tự ưu tiên dựa trên gì",
  /máy chấm/.test(t), "có cảnh báo điểm chưa QA duyệt");

/* ==================== VAI 3 · NGƯỜI NHẬP LIỆU ==================== */
console.log("\n── VAI 3 · Người nhập liệu ──");
await moMan("progress");
t = await chu();
kiem("Nhập liệu", "Có bộ lọc sẵn cho các lỗi phải sửa",
  /Hoàn thành nhưng thiếu ngày|thiếu ngày/.test(t), "");
kiem("Nhập liệu", "Phân trang có chọn số dòng và nhảy trang",
  await p.evaluate(() => !!document.querySelector('select[aria-label="Số dòng mỗi trang"]')), "", 1);
kiem("Nhập liệu", "Hàng đã ngừng không chen vào danh sách làm việc",
  await p.evaluate(() => [...document.querySelectorAll("label")]
    .some((x) => /Hiện cả mục đã ngừng/.test(x.textContent || ""))), "ẩn mặc định");

const timDuoc = await p.evaluate(async () => {
  const o = [...document.querySelectorAll("input")].find((x) => /Tìm theo mã/.test(x.placeholder || ""));
  if (!o) return null;
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  set.call(o, "HT-16");
  o.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
});
await cho(900);
const soSauTim = await p.evaluate(() => document.querySelectorAll("tbody tr").length);
kiem("Nhập liệu", "Tìm theo mã ra kết quả ngay", !!timDuoc && soSauTim > 0 && soSauTim < 20,
  `${soSauTim} dòng`, 1);

kiem("Nhập liệu", "Đổi được cách nhóm mà không phải sang màn khác",
  await p.evaluate(() => [...document.querySelectorAll("button")]
    .some((x) => /Theo đối tượng/.test(x.textContent || ""))), "", 1);

/* ---- Cả ba khối 3D: có nút 2D, và KHÔNG có chú thích đè lên hình ---- */
console.log("\n── Khối 3D · bản 2D thay thế và chú thích không che hình ──");
for (const [v, ten, truoc] of [
  ["timeline", "Địa hình tải việc", null],
  ["reports", "VMP bốn giai đoạn", "3. Đánh giá so với mục tiêu"],
  ["alerts", "Ma trận rủi ro QRM", null],
]) {
  await moMan(v);
  if (v === "alerts") {
    await p.evaluate(() => {
      const x = [...document.querySelectorAll("button")].find((e) => /QRM|Ma trận/.test(e.textContent || ""));
      x?.click();
    });
    await cho(3500);
  }
  if (truoc) {
    await p.evaluate((t) => {
      const el = [...document.querySelectorAll("*")].find((x) => (x.textContent || "").trim().startsWith(t));
      el?.scrollIntoView({ block: "start" });
    }, truoc);
    await cho(4000);
  }
  const r = await p.evaluate(() => ({
    nut2d: [...document.querySelectorAll("button")].some((x) => /Bảng nhiệt 2D/.test(x.textContent || "")),
    deLen: !!document.querySelector(".vmp-space3d-hover"),
    coKhoi: !!document.querySelector(".vmp-space3d"),
  }));
  kiem("Khối 3D", `${ten} · có nút chuyển sang bảng 2D`, r.coKhoi && r.nut2d, "", 1);
  kiem("Khối 3D", `${ten} · không có chú thích đè lên hình`, !r.deLen, "");
}

/* ==================== VAI 4 · DÙNG TRÊN MÁY TÍNH BẢNG / ĐIỆN THOẠI ====
   Người ở xưởng và kho hiếm khi ngồi trước máy để bàn. Màn hình hẹp là
   điều kiện làm việc thật của họ, không phải trường hợp hiếm. */
console.log("\n── VAI 4 · Khổ hẹp (máy tính bảng / điện thoại) ──");
for (const [w, h, ten] of [[820, 1180, "máy tính bảng"], [390, 844, "điện thoại"]]) {
  await p.setViewport({ width: w, height: h });
  for (const v of ["today", "overview", "progress"]) {
    await moMan(v);
    const tran = await p.evaluate(() => {
      const d = document.documentElement;
      const thu = [];
      document.querySelectorAll("main *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > d.clientWidth + 4 && getComputedStyle(el).overflowX === "visible") {
          thu.push(`${el.tagName}.${String(el.className).slice(0, 24)} ${Math.round(r.width)}px`);
        }
      });
      return { trang: d.scrollWidth > d.clientWidth + 2, thu: thu.slice(0, 2), rong: d.clientWidth };
    });
    kiem("Khổ hẹp", `${ten} · ${v} không tràn ngang`, !tran.trang,
      tran.thu.join(" | "));
  }
}
await p.setViewport({ width: 1440, height: 900 });

/* ==================== VAI 5 · TRẠNG THÁI RỖNG & NGƯỜI LẠ ==================== */
console.log("\n── VAI 5 · Trạng thái rỗng và người chưa được gán việc ──");
await moMan("today", "Người Chưa Có Việc");
t = await chu();
kiem("Rỗng", "Người chưa được gán việc được nói RÕ lý do, không im lặng hiện 0",
  /Chưa nhận ra tên bạn|Xem của mọi người/.test(t), "");

await moMan("progress");
try {
  await p.waitForFunction(() => [...document.querySelectorAll("input")]
    .some((x) => /Tìm theo mã/.test(x.placeholder || "")));
} catch {
  const state = await p.evaluate(() => ({
    hash: location.hash,
    main: document.querySelector("main")?.innerText.slice(0, 500) || "",
    inputs: [...document.querySelectorAll("input")].map((x) => x.placeholder || x.type),
  }));
  throw new Error(`Vai 5 phải về progress có input “Tìm theo mã”: ${JSON.stringify(state)}`);
}
await p.evaluate(() => {
  const o = [...document.querySelectorAll("input")].find((x) => /Tìm theo mã/.test(x.placeholder || ""));
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  set.call(o, "KHONGCOMANAY123");
  o.dispatchEvent(new Event("input", { bubbles: true }));
});
await cho(900);
t = await chu();
kiem("Rỗng", "Tìm không ra thì nói rõ bộ lọc nào đang bật, không để trắng",
  /Không có hạng mục nào|bộ lọc/.test(t), "");

/* ==================== VAI 6 · CHẾ ĐỘ TỐI ==================== */
console.log("\n── VAI 6 · Chế độ tối ──");
await p.evaluate(() => { localStorage.setItem("vmp-theme", "dark"); });
await moMan("today");
const toi = await p.evaluate(() => {
  const hex = (c) => {
    const m = c.match(/[\d.]+/g); if (!m) return [0, 0, 0, 1];
    const k = /^color\(/.test(c) ? 255 : 1;
    return [+m[0] * k, +m[1] * k, +m[2] * k, m[3] === undefined ? 1 : +m[3]];
  };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const nen = hex(getComputedStyle(document.body).backgroundColor);
  let xau = 0; let tong = 0;
  document.querySelectorAll("main *").forEach((el) => {
    if (el.children.length || !(el.textContent || "").trim()) return;
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const cs = getComputedStyle(el);
    let n = el; let day = null;
    while (n && n !== document.documentElement) {
      const c = hex(getComputedStyle(n).backgroundColor);
      if (c[3] >= 0.999) { day = c; break; }
      if (getComputedStyle(n).backgroundImage !== "none") return;
      n = n.parentElement;
    }
    if (!day) day = nen;
    tong += 1;
    const c = hex(cs.color);
    const l1 = lum(c); const l2 = lum(day);
    const tp = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (tp < 4.5 && parseFloat(cs.fontSize) < 24) xau += 1;
  });
  return { xau, tong, themeAttr: document.documentElement.getAttribute("data-theme") };
});
kiem("Chế độ tối", "Bật được và toàn bộ chữ vẫn đủ tương phản",
  toi.themeAttr === "dark" && toi.xau / Math.max(1, toi.tong) < 0.03,
  `${toi.xau}/${toi.tong} phần tử dưới ngưỡng`);
await p.evaluate(() => localStorage.removeItem("vmp-theme"));

/* ==================== VAI 7 · IN RA GIẤY ==================== */
console.log("\n── VAI 7 · In ra giấy (hồ sơ GMP) ──");
await moMan("today");
const coIn = await p.evaluate(() => [...document.styleSheets].some((ss) => {
  try { return [...ss.cssRules].some((r) => r.conditionText && /print/.test(r.conditionText)); }
  catch { return false; }
}));
kiem("In", "Có kiểu dáng riêng cho bản in", coIn, coIn ? "" : "chưa có @media print");

/* ==================== CHUNG ==================== */
console.log("\n── CHUNG ──");
kiem("Chung", "Không có lỗi JS trong suốt phiên", loiJs.length === 0,
  loiJs.slice(0, 2).join(" | "));
if (loiMang.length) {
  console.log(`  ⏭  ${loiMang.length} sự cố mạng (không tính là lỗi app): ${loiMang[0].slice(0, 90)}`);
}

await b.close();

const dat = ket.filter((k) => k.dat).length;
console.log(`\n═══ ${dat}/${ket.length} mục ĐẠT ═══`);
const hong = ket.filter((k) => !k.dat);
if (hong.length) {
  console.log("\nCHƯA ĐẠT:");
  for (const h of hong) console.log(`  · [${h.vai}] ${h.viec}${h.ghi ? ` — ${h.ghi}` : ""}`);
  process.exitCode = 1;
}
console.log("");

/* =====================================================================
 *  cham-giao-dien.mjs — Chấm điểm giao diện trên bốn trục
 *  ---------------------------------------------------------------------
 *  Bốn trục: GIAO DIỆN · NỘI DUNG · CHỨC NĂNG · TIỆN LỢI.
 *
 *  Nguyên tắc: chỉ chấm những thứ ĐO ĐƯỢC trên trình duyệt thật với dữ
 *  liệu thật. Không có mục nào chấm theo cảm nhận — cảm nhận thì tranh
 *  luận được, còn "nút này 18px, dưới ngưỡng 24px" thì không.
 *
 *  Chạy: node tests/e2e/cham-giao-dien.mjs
 * ===================================================================== */
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { dangNhap as vaoHeThong, doiVaiTrenMan } from "./dang-nhap.mjs";
import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { LA_UI_ACCESS, uiAccessAdmin } from "./ui-access.mjs";

const GOC = process.env.E2E_URL || "http://localhost:4173";

const MAN = [
  ["today", "Hôm nay"],
  ["overview", "Tổng quan"],
  ["timeline", "Timeline VMP"],
  ["alerts", "Cảnh báo & Rủi ro"],
  ["progress", "Cập nhật tiến độ"],
  ["workload", "Phân công & Tải việc"],
  ["reports", "Báo cáo & AI"],
];

await choServer(GOC);

const b = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});
const p = await b.newPage();
const cho = (ms) => new Promise((r) => setTimeout(r, ms));
const overlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
const rect = (r) => ({ left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) });

/* Audit chỉ mô phỏng response quyền màn hình trong chính trình duyệt. Nó
   không đổi quyền ở server, không gửi mutation và vẫn lấy dữ liệu dashboard
   qua phiên chỉ-xem thật. Nhờ vậy có thể bắt đường redirect enforced một
   cách lặp lại, thay vì phụ thuộc cấu hình quyền live của tài khoản E2E. */
let uiAccess = uiAccessAdmin;
const uiAccessOverviewOnly = {
  ...uiAccessAdmin,
  screens: { overview: uiAccessAdmin.screens.overview },
};
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};
await p.setRequestInterception(true);
p.on("request", (request) => {
  if (!LA_UI_ACCESS.test(request.url())) return request.continue();
  return request.respond(request.method() === "OPTIONS"
    ? { status: 204, headers: cors, body: "" }
    : { status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(uiAccess) });
});

const assertNoOverflow = async (viewport, context) => {
  const geometry = await p.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  if (geometry.scrollWidth > geometry.viewportWidth + 2) {
    throw new Error(`${context}: document.documentElement.scrollWidth=${geometry.scrollWidth} > clientWidth=${geometry.viewportWidth} at ${viewport.width}x${viewport.height}`);
  }
};

const assertMobileLogin = async () => {
  await p.setViewport({ width: 390, height: 844 });
  await p.goto(GOC, { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#vmp-login-email");
  const geometry = await p.evaluate(() => {
    const selector = 'button.vq-luxury-btn[type="submit"]';
    const submit = document.querySelector(selector);
    const r = submit?.getBoundingClientRect();
    return {
      selector,
      submit: r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null,
      viewportHeight: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  if (!geometry.submit) throw new Error(`unauth 390x844: missing ${geometry.selector}`);
  if (geometry.submit.bottom > geometry.viewportHeight) {
    throw new Error(`unauth 390x844: ${geometry.selector} bottom=${Math.round(geometry.submit.bottom)} > viewportHeight=${geometry.viewportHeight}`);
  }
  if (geometry.scrollWidth > geometry.viewportWidth + 2) {
    throw new Error(`unauth 390x844: document.documentElement.scrollWidth=${geometry.scrollWidth} > clientWidth=${geometry.viewportWidth}`);
  }
  await p.click(geometry.selector);
  await p.waitForFunction(() => document.body.innerText.includes("Vui lòng nhập email"));
  console.log(`✅ unauth 390×844 · ${geometry.selector} bottom=${Math.round(geometry.submit.bottom)}/${geometry.viewportHeight} · no overflow`);
};

const assertNoChatOverlap = async (viewport) => {
  await p.waitForSelector(".vmp-chat-fab");
  await p.waitForSelector(".vmp-mo-sau");
  await p.$eval(".vmp-mo-sau", (button) => button.scrollIntoView({ block: "end" }));
  const geometry = await p.evaluate(() => {
    const selector = ".vmp-chat-fab";
    const chat = document.querySelector(selector);
    const chatRect = chat?.getBoundingClientRect();
    const primary = [...document.querySelectorAll(".vmp-mo-sau, .hn-nut")]
      .map((button) => ({ button, rect: button.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight)
      .map(({ button, rect }) => ({ selector: button.matches(".vmp-mo-sau") ? ".vmp-mo-sau" : ".hn-nut", rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } }));
    return {
      position: chat ? getComputedStyle(chat).position : null,
      chat: chatRect ? { left: chatRect.left, top: chatRect.top, right: chatRect.right, bottom: chatRect.bottom } : null,
      primary,
    };
  });
  if (!geometry.chat) throw new Error(`auth ${viewport.width}x${viewport.height}: missing .vmp-chat-fab`);
  if (geometry.position !== "fixed") throw new Error(`auth ${viewport.width}x${viewport.height}: .vmp-chat-fab position=${geometry.position}, expected fixed`);
  if (!geometry.primary.length) throw new Error(`auth ${viewport.width}x${viewport.height}: no visible primary selector (.vmp-mo-sau, .hn-nut) after scroll`);
  const hit = geometry.primary.find((button) => overlap(geometry.chat, button.rect));
  if (hit) throw new Error(`auth ${viewport.width}x${viewport.height}: fixed .vmp-chat-fab ${JSON.stringify(rect(geometry.chat))} overlaps visible primary ${hit.selector} ${JSON.stringify(rect(hit.rect))}`);
};

const assertMobileShell = async () => {
  const viewport = { width: 390, height: 844 };
  await p.setViewport(viewport);
  await p.goto(`${GOC}#v=overview`, { waitUntil: "domcontentloaded" });
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForSelector('[aria-label="Mở menu"]');
  await p.waitForSelector(".vmp-chat-fab");
  const geometry = await p.evaluate(() => {
    const selector = '[aria-label="Mở menu"]';
    const opener = document.querySelector(selector);
    const chat = document.querySelector(".vmp-chat-fab");
    const openerRect = opener?.getBoundingClientRect();
    const openerStyle = opener ? getComputedStyle(opener) : null;
    const hit = openerRect && opener
      ? document.elementFromPoint(openerRect.left + openerRect.width / 2, openerRect.top + openerRect.height / 2)
      : null;
    return {
      opener: openerRect ? { left: openerRect.left, top: openerRect.top, right: openerRect.right, bottom: openerRect.bottom, width: openerRect.width, height: openerRect.height } : null,
      openerStyle: openerStyle ? { display: openerStyle.display, visibility: openerStyle.visibility, opacity: openerStyle.opacity } : null,
      hitOpener: !!(opener && hit && opener.contains(hit)),
      chatPosition: chat ? getComputedStyle(chat).position : null,
    };
  });
  if (!geometry.opener || !geometry.openerStyle) throw new Error('auth 390x844: missing [aria-label="Mở menu"]');
  if (geometry.openerStyle.display === "none" || geometry.openerStyle.visibility !== "visible" || parseFloat(geometry.openerStyle.opacity) <= 0 || geometry.opener.width <= 0 || geometry.opener.height <= 0) {
    throw new Error(`auth 390x844: [aria-label="Mở menu"] unusable display=${geometry.openerStyle.display} visibility=${geometry.openerStyle.visibility} opacity=${geometry.openerStyle.opacity} rect=${JSON.stringify(rect(geometry.opener))}`);
  }
  if (geometry.opener.left < 0 || geometry.opener.top < 0 || geometry.opener.right > viewport.width || geometry.opener.bottom > viewport.height) {
    throw new Error(`auth 390x844: [aria-label="Mở menu"] ${JSON.stringify(rect(geometry.opener))} outside all viewport edges 0,0–390,844`);
  }
  if (!geometry.hitOpener) {
    throw new Error(`auth 390x844: [aria-label="Mở menu"] center hit-test missed opener rect=${JSON.stringify(rect(geometry.opener))}`);
  }
  if (geometry.chatPosition === "fixed") throw new Error("auth 390x844: .vmp-chat-fab remains fixed and can cover primary actions");
  await assertNoOverflow(viewport, "auth overview");
  console.log("✅ auth 390×844 · mobile menu opener visible · chat static · no overflow");
};

const assertNoDeadNotification = async (viewport) => {
  const dead = await p.$$('button[title="Thông báo"]');
  if (dead.length) throw new Error(`auth ${viewport.width}x${viewport.height}: dead notification selector button[title="Thông báo"] count=${dead.length}`);
};

const assertEnforcedRedirectHasMain = async () => {
  uiAccess = uiAccessOverviewOnly;
  try {
    await p.setViewport({ width: 1366, height: 768 });
    await p.goto(`${GOC}#v=progress`, { waitUntil: "domcontentloaded" });
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => location.hash === "" && !!document.querySelector("main .vmp-bento"));
    const fallback = await p.$eval("main", (element) => ({
      hash: location.hash,
      hasOverviewBento: !!element.querySelector(".vmp-bento"),
      textLength: element.innerText.trim().length,
      text: element.innerText.slice(0, 100),
    }));
    if (fallback.hash !== "") throw new Error(`enforced redirect #v=progress: expected canonical overview hash="", got ${JSON.stringify(fallback.hash)}`);
    if (!fallback.hasOverviewBento || fallback.textLength <= 160) {
      throw new Error(`enforced redirect #v=progress: overview fallback blank hasOverviewBento=${fallback.hasOverviewBento} textLength=${fallback.textLength} text=${JSON.stringify(fallback.text)}`);
    }
    console.log(`✅ enforced redirect #v=progress → overview canonical hash="" · main textLength=${fallback.textLength}`);
  } finally {
    uiAccess = uiAccessAdmin;
  }
};

await assertMobileLogin();
/* Đăng nhập thật một lần, các lượt sau chỉ đổi vai ở vế client. */
const dangNhap = () => doiVaiTrenMan(p, "admin", "Tào Tiến Hoàn");

await p.setViewport({ width: 1440, height: 900 });
await vaoHeThong(p, GOC);
await dangNhap();

/* Hàm đo chạy TRONG trang. Tương phản tính theo WCAG 2.1 (relative
   luminance), ngưỡng 4.5:1 cho chữ thường và 3:1 cho chữ ≥18.66px đậm. */
const DO = () => {
  /* Chrome trả `color-mix()` dưới dạng `color(srgb 1 1 1 / 0.92)` — các
     thành phần nằm trong khoảng 0–1, KHÔNG phải 0–255. Bản đo đầu đọc
     thẳng ra [1,1,1] và tưởng đó là gần đen, nên báo nhãn trục 3D chỉ đạt
     1.31:1 trong khi thực tế là chữ đậm trên nền trắng. */
  const hex = (c) => {
    const m = c.match(/[\d.]+/g);
    if (!m) return [0, 0, 0, 1];
    const zeroMot = /^color\(/.test(c);
    const k = zeroMot ? 255 : 1;
    return [+m[0] * k, +m[1] * k, +m[2] * k, m[3] === undefined ? 1 : +m[3]];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const tron = (tren, duoi) => {
    const a = tren[3];
    return [0, 1, 2].map((i) => tren[i] * a + duoi[i] * (1 - a));
  };
  /* Nền thật = chồng mọi lớp nền trong suốt từ gốc xuống. Trả về null khi
     gặp ẢNH NỀN (gradient): không tính được bằng công thức, mà đoán bừa thì
     ra kết quả sai — nút gradient chữ trắng sẽ bị chấm 1:1 dù thực tế đọc
     rất rõ. Chỗ nào null thì bỏ qua, và đếm riêng để biết đã bỏ bao nhiêu. */
  const nenThat = (el) => {
    /* Đi ngược lên cây, gom các lớp nền TRONG SUỐT cho tới khi gặp một nền
       ĐỤC — nền đục là đáy, không nhìn xuyên qua được nên không cần đi tiếp.
       Gặp ẢNH NỀN (gradient) TRƯỚC khi gặp nền đục thì trả null: không tính
       được bằng công thức, mà đoán bừa thì ra kết quả sai.
       Lưu ý: <body> có gradient, nên nếu không dừng ở nền đục thì mọi phần
       tử đều bị bỏ qua — đó chính là lỗi của bản đo đầu tiên. */
    let n = el;
    const chong = [];
    let day = [255, 255, 255];
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      const c = hex(cs.backgroundColor);
      if (c[3] >= 0.999) { day = [c[0], c[1], c[2]]; break; }
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      if (c[3] > 0) chong.unshift(c);
      n = n.parentElement;
    }
    let nen = day;
    for (const c of chong) nen = tron(c, nen);
    return nen;
  };
  const tuongPhan = (a, b) => {
    const l1 = lum(a); const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  const loi = { tuongPhan: [], nutNho: [], khongTen: [], oNhapKhongNhan: [], bangThieuTh: [] };
  let soChu = 0; let soNut = 0; let boQua = 0;

  document.querySelectorAll("*").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") return;

    const chu = (el.textContent || "").trim();
    if (chu && el.children.length === 0) {
      soChu += 1;
      const co = parseFloat(cs.fontSize);
      const dam = parseInt(cs.fontWeight, 10) >= 700;
      const nguong = (co >= 24 || (co >= 18.66 && dam)) ? 3 : 4.5;
      const nen = nenThat(el);
      if (!nen) { boQua += 1; return; }
      const mau = tron(hex(cs.color), nen);
      const tp = tuongPhan(mau, nen);
      if (tp < nguong) {
        loi.tuongPhan.push({ chu: chu.slice(0, 40), tp: +tp.toFixed(2), nguong, co,
                             the: el.tagName, lop: String(el.className.baseVal ?? el.className).slice(0, 34),
                             mau: cs.color, nen: `rgb(${nen.map(Math.round).join(",")})` });
      }
    }

    const bam = el.matches("button, a[href], [role=button], select, input[type=checkbox], summary");
    if (bam) {
      soNut += 1;
      if (r.width < 24 || r.height < 24) {
        loi.nutNho.push({ the: el.tagName, chu: (el.textContent || "").trim().slice(0, 24),
                          w: Math.round(r.width), h: Math.round(r.height) });
      }
      const label = el.closest("label")?.innerText.trim()
        || (el.id && [...document.querySelectorAll("label")].find((candidate) => candidate.htmlFor === el.id)?.innerText.trim())
        || "";
      const ten = (el.textContent || "").trim() || el.getAttribute("aria-label")
        || el.getAttribute("title") || el.getAttribute("alt") || label;
      if (!ten) loi.khongTen.push({ the: el.tagName, lop: String(el.className).slice(0, 30) });
    }

    if (el.matches("input:not([type=checkbox]):not([type=hidden]), select, textarea")) {
      const co = el.getAttribute("aria-label") || el.getAttribute("placeholder")
        || el.getAttribute("title")
        || (el.id && document.querySelector(`label[for="${el.id}"]`))
        || el.closest("label");
      if (!co) loi.oNhapKhongNhan.push({ the: el.tagName, ten: el.getAttribute("name") || "" });
    }

    if (el.tagName === "TABLE" && !el.querySelector("th")) {
      loi.bangThieuTh.push({ dong: el.rows.length });
    }
  });

  return {
    loi, soChu, soNut, boQua,
    tranNgang: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    caoTrang: document.querySelector("main")?.scrollHeight || 0,
  };
};

/* Điều kiện tiên quyết như ở viec-nguoi-dung.mjs: không có dữ liệu thật
   thì mọi số đo đều vô nghĩa (trang rỗng thì đương nhiên không lỗi gì). */
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
  await b.close();
  throw new Error(`Audit dừng: overview span khớp /(\\d+)\\/(\\d+) hạng mục/ chỉ cho ${coDuLieu} hạng mục; không được coi trang thiếu dữ liệu là PASS.`);
}

const bang = [];
const desktopViewports = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
];
for (const viewport of desktopViewports) {
  await p.setViewport(viewport);
  for (const [id, ten] of MAN) {
    await p.goto(`${GOC}#v=${id}`, { waitUntil: "networkidle2" });
    await dangNhap();
    await p.reload({ waitUntil: "networkidle2" });
    await cho(3200);
    await assertNoOverflow(viewport, `auth ${ten}`);
    if (id === "overview") await assertNoChatOverlap(viewport);
    if (id === "reports") await assertNoDeadNotification(viewport);
    // Bảng điểm giữ mốc desktop chuẩn 1440×900 như trước; 1366×768 là
    // regression geometry riêng nên không làm thay đổi điểm lịch sử.
    if (viewport.width === 1440) {
      const r = await p.evaluate(DO);
      bang.push({ id, ten, ...r });
    }
  }
  console.log(`✅ auth ${viewport.width}×${viewport.height} · ${MAN.length} màn không tràn · chat/notification sạch`);
}

await assertMobileShell();
await assertEnforcedRedirectHasMain();

/* ---- Có nhìn thấy viền focus khi đi bằng bàn phím không ---- */
await p.goto(`${GOC}#v=today`, { waitUntil: "networkidle2" });
await dangNhap();
await p.reload({ waitUntil: "networkidle2" });
await cho(2500);
let coFocus = 0;
let thuFocus = 0;
for (let i = 0; i < 14; i += 1) {
  await p.keyboard.press("Tab");
  const ok = await p.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const co = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0)
      || cs.boxShadow !== "none";
    return co;
  });
  if (ok !== null) { thuFocus += 1; if (ok) coFocus += 1; }
}

await b.close();

/* ======================== CHẤM ĐIỂM ======================== */
const gop = (k) => bang.reduce((s, m) => s + m.loi[k].length, 0);
const tongChu = bang.reduce((s, m) => s + m.soChu, 0);
const tongBoQua = bang.reduce((s, m) => s + m.boQua, 0);
const tongNut = bang.reduce((s, m) => s + m.soNut, 0);
const soTran = bang.filter((m) => m.tranNgang).length;
/* Chiều dài chỉ chấm ở TỔNG QUAN. Đây là màn duy nhất có nghĩa vụ gói gọn:
   nó phải trả lời "có gì cháy, đang ở đâu" trong một tầm mắt.
   Không chấm "Hôm nay" và các màn bảng: chúng là DANH SÁCH VIỆC — dài đúng
   bằng số việc phải làm, và cắt ngắn chúng là giấu việc đi. */
const caoNhat = Math.max(...bang.filter((m) => m.id === "overview").map((m) => m.caoTrang));

const diem = (dat, tong) => (tong === 0 ? 10 : Math.max(0, Math.round((1 - dat / tong) * 100) / 10));

const muc = [
  ["GIAO DIỆN · tương phản chữ đạt WCAG AA", diem(gop("tuongPhan"), tongChu),
    `${gop("tuongPhan")}/${tongChu} phần tử chữ dưới ngưỡng (bỏ qua ${tongBoQua} chỗ nền gradient)`],
  ["GIAO DIỆN · không tràn ngang", soTran === 0 ? 10 : 10 - soTran * 2,
    `${soTran}/${bang.length} màn bị tràn ngang`],
  ["CHỨC NĂNG · nút đủ lớn để bấm (≥24px)", diem(gop("nutNho"), tongNut),
    `${gop("nutNho")}/${tongNut} nút nhỏ hơn 24px`],
  ["CHỨC NĂNG · nút có tên đọc được", diem(gop("khongTen"), tongNut),
    `${gop("khongTen")}/${tongNut} nút không có tên`],
  ["NỘI DUNG · ô nhập có nhãn", diem(gop("oNhapKhongNhan"), Math.max(1, tongNut / 4)),
    `${gop("oNhapKhongNhan")} ô nhập thiếu nhãn`],
  ["NỘI DUNG · bảng có hàng tiêu đề", gop("bangThieuTh") === 0 ? 10 : 6,
    `${gop("bangThieuTh")} bảng thiếu <th>`],
  ["TIỆN LỢI · đi bàn phím thấy viền focus", thuFocus ? Math.round((coFocus / thuFocus) * 100) / 10 : 0,
    `${coFocus}/${thuFocus} phần tử có viền focus`],
  ["TIỆN LỢI · Tổng quan gọn trong ~2 màn", caoNhat <= 2000 ? 10 : caoNhat <= 2700 ? 8 : caoNhat <= 4000 ? 6 : 4,
    `dài nhất ${caoNhat}px (≈${(caoNhat / 900).toFixed(1)} màn)`],
];

console.log("\n╔══════════════════════════════════════════════════════════════════╗");
console.log("║  CHẤM ĐIỂM GIAO DIỆN — đo trên trình duyệt thật, dữ liệu thật    ║");
console.log("╚══════════════════════════════════════════════════════════════════╝\n");
for (const [ten, d, ghi] of muc) {
  const sao = "█".repeat(Math.round(d)) + "░".repeat(10 - Math.round(d));
  console.log(` ${String(d).padStart(4)}/10  ${sao}  ${ten}`);
  console.log(`            ${ghi}`);
}
const tb = Math.round((muc.reduce((s, m) => s + m[1], 0) / muc.length) * 10) / 10;
console.log(`\n ĐIỂM TRUNG BÌNH: ${tb}/10\n`);

console.log("── CHI TIẾT LỖI NẶNG NHẤT ──");
for (const m of bang) {
  const tp = m.loi.tuongPhan.slice(0, 3);
  const nn = m.loi.nutNho.slice(0, 3);
  if (!tp.length && !nn.length && !m.tranNgang) continue;
  console.log(`\n ${m.ten}${m.tranNgang ? "  ⚠ TRÀN NGANG" : ""}`);
  for (const x of tp) console.log(`   tương phản ${x.tp}:1 (cần ${x.nguong}) · ${x.co}px · "${x.chu}" · <${x.the}.${x.lop}> ${x.mau} trên ${x.nen}`);
  for (const x of nn) console.log(`   nút ${x.w}×${x.h}px · "${x.chu}"`);
}
console.log("");

const zeroDefects = {
  horizontalOverflow: soTran,
  lowContrast: gop("tuongPhan"),
  unnamedControls: gop("khongTen"),
  missingInputLabels: gop("oNhapKhongNhan"),
};
const failedGates = Object.entries(zeroDefects).filter(([, count]) => count !== 0);
if (failedGates.length) {
  throw new Error(`Audit zero-defect gate failed: ${failedGates.map(([name, count]) => `${name}=${count}`).join(", ")}`);
}

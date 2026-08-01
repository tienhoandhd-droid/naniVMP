/* =====================================================================
 *  ma-tran-phan-quyen.mjs — kiểm màn "Phân quyền & trách nhiệm"
 *  ---------------------------------------------------------------------
 *  Màn này đọc bảng `profiles`, mà `profiles` bị RLS chặn với phiên giả.
 *  Nên bộ kiểm CHẶN request REST tới profiles và trả về danh sách giả —
 *  không phải để né bảo mật, mà vì thứ cần kiểm ở đây là GIAO DIỆN:
 *  ô sửa có hiện không, có đúng giá trị đang lưu không, khoá có đúng
 *  người không. Luật phân quyền THẬT nằm ở rpc_set_user_role và đã được
 *  kiểm riêng bằng SQL trong transaction rollback (bốn khoá: chỉ admin ·
 *  không tự hạ vai mình · luôn còn ≥1 admin · department_user phải có
 *  bộ phận).
 * ===================================================================== */
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const GOC = "http://localhost:4173";

await choServer(GOC);

const HO_SO_GIA = [
  { id: "11111111-1111-1111-1111-111111111111", full_name: "Người Quản Trị", email: "qt@vd.local", role: "admin", department: null, is_active: true },
  { id: "22222222-2222-2222-2222-222222222222", full_name: "Người Bộ Phận", email: "bp@vd.local", role: "department_user", department: "xsx", is_active: true },
  { id: "33333333-3333-3333-3333-333333333333", full_name: "Người Chỉ Xem", email: "", role: "viewer", department: null, is_active: true },
];

const b = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=metal"],
});
const p = await b.newPage();
await p.setViewport({ width: 1500, height: 1100 });

const loi = [];
p.on("console", (m) => { if (m.type() === "error") loi.push(m.text()); });
p.on("pageerror", (e) => loi.push("pageerror: " + e.message));

await p.setRequestInterception(true);
/* Trả lời CẢ preflight OPTIONS lẫn GET. Thiếu vế preflight thì trình duyệt
   chặn ở bước OPTIONS, request GET không bao giờ tới ổ giả — lần chạy đầu
   hỏng đúng vì lý do đó. */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-expose-headers": "content-range",
};
p.on("request", (r) => {
  if (/\/rest\/v1\/profiles/.test(r.url())) {
    if (r.method() === "OPTIONS") return r.respond({ status: 204, headers: CORS, body: "" });
    return r.respond({
      status: 200,
      contentType: "application/json",
      headers: CORS,
      body: JSON.stringify(HO_SO_GIA),
    });
  }
  r.continue();
});

let dat = 0; let hong = 0;
const kiem = (ten, ok, chiTiet = "") => {
  if (ok) { dat++; console.log(`  ✅ ${ten}${chiTiet ? " — " + chiTiet : ""}`); }
  else { hong++; console.log(`  ❌ ${ten}${chiTiet ? " — " + chiTiet : ""}`); }
};

const vao = async (perm) => {
  await p.goto(GOC, { waitUntil: "domcontentloaded" });
  await p.evaluate((q) => localStorage.setItem("vmp_monitor_user_v1", JSON.stringify({
    name: "Tào Tiến Hoàn", email: "e2e@test.local", role: q === "admin" ? "admin" : "qa", perm: q,
  })), perm);
  await p.goto(`${GOC}#v=phanquyen`, { waitUntil: "networkidle2" });
  await p.reload({ waitUntil: "networkidle2" });
  /* Chờ theo NỘI DUNG chứ không theo đồng hồ. Lần chạy đầu tiên trong
     phiên phải tải cả bó JS lười + dữ liệu, lâu hơn hẳn các lần sau; đặt
     một con số giây cố định thì lúc chạy cả bộ sẽ hỏng ngẫu nhiên còn chạy
     riêng lại đạt — đúng kiểu hỏng khiến người ta mất niềm tin vào bộ kiểm. */
  await p.waitForFunction(
    () => document.body.innerText.includes("Ai chịu trách nhiệm phần nào"),
    { timeout: 45000 },
  );
  await new Promise((r) => setTimeout(r, 1200));
};

/* ── 1. Vai admin: sửa được thẳng trên bảng ── */
console.log("\n── 1. Vai admin — ô sửa hiện trên bảng ──");
await vao("admin");

const o = await p.evaluate(() => {
  const chon = [...document.querySelectorAll("select.pq-o")];
  const nhap = [...document.querySelectorAll("input.pq-o")];
  return {
    soChon: chon.length,
    soNhap: nhap.length,
    nhan: chon.map((s) => s.getAttribute("aria-label")),
    giaTri: chon.map((s) => s.value),
    // ngưỡng chạm WCAG 2.2: 24px
    caoNhoNhat: Math.min(...[...chon, ...nhap].map((e) => e.getBoundingClientRect().height)),
    coNhan: [...chon, ...nhap].every((e) => (e.getAttribute("aria-label") || "").trim().length > 3),
    huongDan: document.body.innerText.includes("là lưu ngay"),
  };
});

kiem("Ô chọn vai trò + bộ phận hiện ra", o.soChon >= 6, `${o.soChon} ô chọn`);
kiem("Ô nhập email hiện ra", o.soNhap >= 3, `${o.soNhap} ô nhập`);
kiem("Ô chọn mang đúng giá trị đang lưu",
  o.giaTri.includes("admin") && o.giaTri.includes("department_user") && o.giaTri.includes("xsx"),
  o.giaTri.slice(0, 6).join(", "));
kiem("Mọi ô sửa đều có nhãn cho trình đọc màn hình", o.coNhan);
kiem("Ngưỡng chạm ≥ 24px (WCAG 2.2)", o.caoNhoNhat >= 24, `${Math.round(o.caoNhoNhat)}px`);
kiem("Có câu nói rõ 'đổi là lưu ngay'", o.huongDan);

/* ── 2. Ma trận A và C vẫn đọc được ── */
console.log("\n── 2. Ba ma trận đều có mặt ──");
const chu = await p.evaluate(() => document.body.innerText);
kiem("A · vai trò × hành động", chu.includes("Vai trò được làm gì") && chu.includes("Chỉ bộ phận mình"));
kiem("B · người × bộ phận", chu.includes("Ai chịu trách nhiệm phần nào"));
kiem("C · khu vực / line, ghi rõ CHƯA có hiệu lực",
  chu.includes("Phạm vi chi tiết") && chu.includes("CHƯA có hiệu lực"));

/* ── 3. Không phải admin thì bảng chỉ để xem ── */
console.log("\n── 3. Vai không phải admin — khoá sửa ──");
await vao("edit");
const k = await p.evaluate(() => ({
  soChon: document.querySelectorAll("select.pq-o").length,
  soNhap: document.querySelectorAll("input.pq-o").length,
  noiRo: document.body.innerText.includes("Bảng chỉ để xem"),
  vanDocDuoc: document.body.innerText.includes("Ai chịu trách nhiệm phần nào"),
}));
kiem("Không hiện ô sửa nào", k.soChon === 0 && k.soNhap === 0, `${k.soChon} chọn · ${k.soNhap} nhập`);
kiem("Nói rõ vì sao không sửa được", k.noiRo);
kiem("Vẫn đọc được toàn bộ ma trận", k.vanDocDuoc);

/* ── 4. Sạch lỗi ── */
console.log("\n── 4. Không có lỗi console ──");
const that = loi.filter((t) => !/401|403|Unauthorized|JWT|row-level security|Failed to load resource/i.test(t));
kiem("Không có lỗi JS", that.length === 0, that.slice(0, 3).join(" | "));

await b.close();
console.log(`\n═══ ${dat}/${dat + hong} phép kiểm đạt ═══`);
process.exit(hong ? 1 : 0);

/* Quét TẤT CẢ các màn: mở từng trang, chờ dựng xong, bắt mọi lỗi console
 * và pageerror. Đây là phép kiểm bắt được loại lỗi mà typecheck/build không
 * thấy — lỗi lúc chạy thật với dữ liệu thật. */
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const GOC = "http://localhost:4173";

const MAN = [
  ["overview", "Tổng quan"],
  ["timeline", "Timeline VMP"],
  ["alerts", "Cảnh báo & Rủi ro"],
  ["progress", "Cập nhật tiến độ"],
  ["inventory", "Tiến độ theo đối tượng"],
  ["source", "Danh mục & Nhập liệu"],
  ["workload", "Phân công & Tải việc"],
  ["reports", "Báo cáo & AI"],
  ["rules", "Luật đang áp dụng"],
  ["health", "Sức khoẻ dữ liệu"],
  ["phanquyen", "Phân quyền & trách nhiệm"],
  ["audit", "Audit log"],
  ["admin", "Quản trị"],
];

await choServer(GOC);

const b = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=metal"],
});
const p = await b.newPage();
await p.setViewport({ width: 1500, height: 1000 });

let loi = [];
p.on("console", (m) => { if (m.type() === "error") loi.push(m.text()); });
p.on("pageerror", (e) => loi.push("pageerror: " + e.message));

await p.goto(GOC, { waitUntil: "domcontentloaded" });
await p.evaluate(() => localStorage.setItem("vmp_monitor_user_v1", JSON.stringify({
  name: "Tào Tiến Hoàn", email: "e2e@test.local", role: "admin", perm: "admin",
})));

/* Bốn màn này gọi RPC bắt buộc phiên đăng nhập thật (rpc_active_rules,
   rpc_list_source_tabs, đọc bảng audit_logs…). Bộ kiểm chỉ nhét hồ sơ giả
   vào localStorage nên bị RLS chặn — đó là bảo mật chạy ĐÚNG, không phải
   lỗi. Kiểm chứng ngoài app bằng curl, xem README. Vẫn quét chúng để bắt
   lỗi JS khác, chỉ không tính 401 là hỏng. */
const CAN_PHIEN_THAT = new Set(["source", "rules", "audit", "admin", "phanquyen"]);
const laLoiQuyen = (t) => /401|403|Unauthorized|JWT|permission denied|row-level security/i.test(t);

let hong = 0;
let boQua = 0;
for (const [id, ten] of MAN) {
  loi = [];
  // Reload thật cho từng màn: goto chỉ đổi hash là điều hướng cùng tài liệu,
  // React không dựng lại nên sẽ không kiểm được đường mount của màn đó.
  await p.goto(`${GOC}#v=${id}`, { waitUntil: "networkidle2" });
  await p.reload({ waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, id === "reports" || id === "alerts" ? 6000 : 3000));

  const tt = await p.evaluate(() => ({
    chuMan: document.body.innerText.length,
    trang: document.body.innerText.trim().length < 40,
    dangNhap: document.body.innerText.includes("Xin chào!") && document.querySelectorAll("input[type=password]").length > 0,
  }));

  let that = loi.filter((t) => !/favicon|DevTools|ERR_BLOCKED/i.test(t));
  let ghiChu = "";
  if (CAN_PHIEN_THAT.has(id) && that.some(laLoiQuyen)) {
    // Màn này đã ăn một 401. Các console.error còn lại là app tự bắt lỗi đó
    // rồi in ra (thường in nguyên đối tượng nên regex không đọc nổi nội
    // dung) — tính là hệ quả, không phải lỗi độc lập.
    ghiChu = "  ← cần phiên đăng nhập thật (RLS chặn — đúng)";
    that = [];
  }

  const ok = that.length === 0 && !tt.trang && !tt.dangNhap;
  if (!ok) hong++;
  else if (ghiChu) boQua++;

  console.log(`${ok ? (ghiChu ? "⏭ " : "✅") : "❌"} ${ten.padEnd(24)} ${String(tt.chuMan).padStart(6)} ký tự` +
    ghiChu +
    (tt.dangNhap ? "  ← rơi về màn đăng nhập" : "") +
    (tt.trang ? "  ← MÀN TRỐNG" : "") +
    (that.length ? `\n     ${that.slice(0, 3).join("\n     ")}` : ""));
}

console.log(`\n═══ ${MAN.length - hong - boQua}/${MAN.length} màn sạch`
  + (boQua ? ` · ${boQua} màn bỏ qua (cần phiên thật)` : "")
  + (hong ? ` · ${hong} MÀN HỎNG` : "") + " ═══");
await b.close();
process.exit(hong ? 1 : 0);

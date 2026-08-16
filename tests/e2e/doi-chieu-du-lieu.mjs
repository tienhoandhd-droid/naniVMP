/* =====================================================================
 *  doi-chieu-du-lieu.mjs — Số trên màn có ĐÚNG với database không
 *  ---------------------------------------------------------------------
 *  Ba câu hỏi, ba cách kiểm khác nhau:
 *
 *  1. ĐÚNG NGUỒN — gọi thẳng RPC mà app dùng, tự đếm lại từ dữ liệu thô,
 *     rồi so với con số đang hiện trên màn. Đây là phép kiểm mạnh nhất:
 *     nó bắt được cả lỗi ở tầng biến đổi lẫn lỗi ở tầng hiển thị.
 *
 *  2. NHẤT QUÁN GIỮA CÁC MÀN — cùng một đại lượng thì mọi màn phải ra
 *     cùng một số. Lệch nhau nghĩa là hai màn đang dùng hai định nghĩa,
 *     và người dùng không có cách nào biết nên tin bên nào.
 *
 *  3. SỬA MỘT Ô THÌ CÁC Ô KHÁC CÓ THEO KHÔNG — không ghi thật vào DB
 *     (RLS chặn phiên giả, và bộ kiểm không được sửa dữ liệu thật). Thay
 *     vào đó kiểm CƠ CHẾ: dữ liệu chỉ có MỘT nguồn trong bộ nhớ, mọi màn
 *     đọc từ đó, và sau khi ghi thì app kéo lại toàn bộ. Kiểm bằng cách
 *     đổi bộ lọc — nó buộc mọi ô tính lại từ cùng một mảng, đúng cơ chế
 *     mà một lần ghi sẽ đi qua.
 *
 *  Chạy: node tests/e2e/doi-chieu-du-lieu.mjs
 * ===================================================================== */
import puppeteer from "puppeteer-core";
import { choServer } from "./cho-server.mjs";
import { dangNhap as vaoHeThong, doiVaiTrenMan } from "./dang-nhap.mjs";
import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";

const GOC = "http://localhost:4173";

await choServer(GOC);

const b = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});
const p = await b.newPage();
const cho = (ms) => new Promise((r) => setTimeout(r, ms));
/* Đăng nhập thật một lần, các lượt sau chỉ đổi vai ở vế client. */
const dangNhap = () => doiVaiTrenMan(p, "admin", "Tào Tiến Hoàn");

const ket = [];
const kiem = (nhom, ten, dat, ghi = "") => {
  ket.push({ nhom, ten, dat, ghi });
  console.log(`  ${dat ? "✅" : "❌"} ${ten}${ghi ? ` — ${ghi}` : ""}`);
};

const moMan = async (v) => {
  await p.goto(`${GOC}#v=${v}`, { waitUntil: "networkidle2" });
  await dangNhap();
  await p.reload({ waitUntil: "networkidle2" });
  await cho(3200);
};

await p.setViewport({ width: 1500, height: 1000 });
await vaoHeThong(p, GOC);
await dangNhap();
await moMan("overview");

/* ==================== 1 · ĐÚNG NGUỒN ====================
   Lấy dữ liệu thô bằng CHÍNH client Supabase của app (window.__vmpSb do
   supabaseClient gắn ra khi ở chế độ kiểm), rồi tự đếm lại. */
console.log("\n── 1 · Số trên màn so với database ──");

const goc = await p.evaluate(async () => {
  const sb = window.__vmpSb;
  if (!sb) return { loi: "không lấy được client Supabase" };
  const nam = new Date().getFullYear();
  const { data, error } = await sb.rpc("rpc_get_vmp_dashboard", { p_year: nam });
  if (error) return { loi: error.message };
  const acts = (data && (data.activities || data.acts)) || [];
  const song = acts.filter((a) => (a.state || a.item_state || "active") === "active");
  /* HAI cái bẫy khi tự đếm lại, cả hai đều đã sập một lần:
     · tt_vmp nằm trong _raw chứ không phải trường gốc → đọc nhầm chỗ ra 0.
     · giá trị là enum tiếng Anh (not_started / in_progress / completed),
       không phải "x" hay "Hoàn thành" như hồi còn đọc từ Google Sheet.
     Đếm sai rồi kết luận "app hiển thị sai" là cách nhanh nhất để đi sửa
     một thứ không hỏng. */
  const hoanThanh = (v) => /^(completed|done|x|có|co|hoàn thành|hoan thanh|✓|yes|true|1)$/i
    .test(String(v ?? "").trim());
  const dem = {
    tong: acts.length,
    song: song.length,
    ngung: acts.length - song.length,
    xong: song.filter((a) => hoanThanh((a._raw || {}).tt_vmp)).length,
    coMocVmp: song.filter((a) => String((a._raw || {}).dl_vmp || "").trim()).length,
    theoBoPhan: {},
  };
  for (const a of song) {
    const ds = Array.isArray(a.depts) && a.depts.length ? a.depts : [a.dept || "qa"];
    for (const d of ds) dem.theoBoPhan[d] = (dem.theoBoPhan[d] || 0) + 1;
  }
  return dem;
});

if (goc.loi) {
  console.log(`\n⏭  KHÔNG ĐỐI CHIẾU ĐƯỢC — ${goc.loi}`);
  console.log("   Cần client Supabase truy cập được từ trang. Bỏ qua nhóm 1.\n");
} else {
  const man = await p.evaluate(() => {
    const t = document.querySelector("main").innerText;
    const chip = [...document.querySelectorAll("span")]
      .find((s) => /\d+\/\d+ hạng mục/.test(s.textContent || ""));
    const m = chip && chip.textContent.match(/(\d+)\/(\d+)/);
    return {
      chipTong: m ? +m[2] : null,
      xong: (t.match(/Hoàn thành[\s\S]{0,40}?(\d+)/) || [])[1],
      tyLe: (t.match(/Hoàn thành VMP\s*(\d+)%/) || [])[1],
    };
  });
  kiem("Nguồn", "Tổng hạng mục trên thanh lọc = số dòng đang hoạt động trong DB",
    man.chipTong === goc.song,
    `màn ${man.chipTong} · DB ${goc.song} đang hoạt động + ${goc.ngung} đã ngừng`);
  kiem("Nguồn", "Số hoàn thành trên màn = số tt_vmp đã đánh dấu xong trong DB",
    Number(man.xong) === goc.xong, `màn ${man.xong} · DB ${goc.xong}`);
  const tyDb = goc.song ? Math.round((goc.xong / goc.song) * 100) : 0;
  kiem("Nguồn", "Tỉ lệ hoàn thành khớp phép chia trên dữ liệu gốc",
    Math.abs(Number(man.tyLe) - tyDb) <= 1, `màn ${man.tyLe}% · DB ${tyDb}%`);
}

/* ==================== 2 · NHẤT QUÁN GIỮA CÁC MÀN ==================== */
console.log("\n── 2 · Cùng một đại lượng, các màn có ra cùng số không ──");

const docChip = () => p.evaluate(() => {
  const el = [...document.querySelectorAll("span")].find((s) => /\d+\/\d+ hạng mục/.test(s.textContent || ""));
  const m = el && el.textContent.match(/(\d+)\/(\d+)/);
  return m ? { hien: +m[1], tong: +m[2] } : null;
});

const soTheoMan = {};
for (const v of ["overview", "timeline", "alerts", "progress", "workload"]) {
  await moMan(v);
  soTheoMan[v] = await docChip();
}
const tongs = Object.entries(soTheoMan).filter(([, x]) => x).map(([v, x]) => [v, x.tong]);
const khac = [...new Set(tongs.map(([, n]) => n))];
kiem("Nhất quán", "Mẫu số của thanh lọc giống nhau ở mọi màn",
  khac.length === 1, tongs.map(([v, n]) => `${v}=${n}`).join(" · "));

/* Lọc theo một bộ phận: mọi màn phải cùng ra một con số đã lọc. */
for (const v of ["overview", "timeline", "alerts", "progress", "workload"]) {
  await p.goto(`${GOC}#v=${v}&dept=xsx`, { waitUntil: "networkidle2" });
  await dangNhap();
  await p.reload({ waitUntil: "networkidle2" });
  await cho(3000);
  soTheoMan[`${v}:xsx`] = await docChip();
}
const loc = Object.entries(soTheoMan).filter(([k, x]) => k.includes(":xsx") && x).map(([k, x]) => [k, x.hien]);
const khacLoc = [...new Set(loc.map(([, n]) => n))];
kiem("Nhất quán", "Lọc cùng một bộ phận thì mọi màn cùng ra một số",
  khacLoc.length === 1, loc.map(([k, n]) => `${k.split(":")[0]}=${n}`).join(" · "));

/* ==================== 3 · LIÊN KẾT: ĐỔI ĐẦU VÀO THÌ MỌI Ô TÍNH LẠI ==== */
console.log("\n── 3 · Đổi một đầu vào thì các ô khác có tự tính lại không ──");

await moMan("overview");
const truoc = await p.evaluate(() => {
  const t = document.querySelector("main").innerText;
  return {
    chip: (t.match(/(\d+)\s*\/(\d+) hạng mục/) || []).slice(1).join("/"),
    quaHan: (t.match(/Quá hạn\s*(\d+)/) || [])[1],
    tyLe: (t.match(/Hoàn thành VMP\s*(\d+)%/) || [])[1],
    ketLuan: (t.match(/(\d+) tháng đã qua gánh (\d+) hạng mục/) || []).slice(1).join("/"),
    vanDe: (t.match(/Vấn đề dữ liệu\s*(\d+)/) || [])[1],
  };
});

/* Đổi bộ lọc = đổi tập dữ liệu đầu vào của MỌI ô trên trang. Đây đúng là
   con đường mà một lần ghi sẽ đi: mảng acts đổi → mọi useMemo tính lại. */
await p.goto(`${GOC}#v=overview&dept=qc`, { waitUntil: "networkidle2" });
await dangNhap();
await p.reload({ waitUntil: "networkidle2" });
await cho(3200);
const sau = await p.evaluate(() => {
  const t = document.querySelector("main").innerText;
  return {
    chip: (t.match(/(\d+)\s*\/(\d+) hạng mục/) || []).slice(1).join("/"),
    quaHan: (t.match(/Quá hạn\s*(\d+)/) || [])[1],
    tyLe: (t.match(/Hoàn thành VMP\s*(\d+)%/) || [])[1],
    ketLuan: (t.match(/(\d+) tháng đã qua gánh (\d+) hạng mục/) || []).slice(1).join("/"),
    vanDe: (t.match(/Vấn đề dữ liệu\s*(\d+)/) || [])[1],
  };
});

const doi = (k) => truoc[k] !== sau[k];
kiem("Liên kết", "Ô 'Quá hạn' tính lại theo tập dữ liệu mới",
  doi("quaHan"), `${truoc.quaHan} → ${sau.quaHan}`);
kiem("Liên kết", "Ô 'Hoàn thành VMP' tính lại", doi("tyLe"), `${truoc.tyLe}% → ${sau.tyLe}%`);
kiem("Liên kết", "Câu kết luận của biểu đồ tính lại theo dữ liệu mới",
  doi("ketLuan"), `${truoc.ketLuan} → ${sau.ketLuan}`);
kiem("Liên kết", "Ô 'Vấn đề dữ liệu' tính lại", doi("vanDe"), `${truoc.vanDe} → ${sau.vanDe}`);

/* Có đúng MỘT nguồn dữ liệu trong bộ nhớ không — nếu mỗi màn tự gọi RPC
   riêng thì sửa một chỗ sẽ không lan sang chỗ khác cho tới khi tải lại. */
const soLanGoi = await p.evaluate(async () => {
  let dem = 0;
  const sb = window.__vmpSb;
  if (!sb) return null;
  const goc = sb.rpc.bind(sb);
  sb.rpc = (...a) => { if (a[0] === "rpc_get_vmp_dashboard") dem += 1; return goc(...a); };
  const nut = [...document.querySelectorAll("a, button")];
  for (const ten of ["Dòng thời gian VMP", "Cảnh báo & ưu tiên", "Phân công & khối lượng"]) {
    const x = nut.find((e) => (e.textContent || "").trim() === ten);
    x?.click();
    await new Promise((r) => setTimeout(r, 1200));
  }
  return dem;
});
kiem("Liên kết", "Đổi màn KHÔNG gọi lại RPC — mọi màn dùng chung một mảng",
  soLanGoi === 0, soLanGoi == null ? "không đo được" : `${soLanGoi} lần gọi`);

await b.close();

const dat = ket.filter((k) => k.dat).length;
console.log(`\n═══ ${dat}/${ket.length} mục ĐẠT ═══`);
const hong = ket.filter((k) => !k.dat);
if (hong.length) {
  console.log("\nCHƯA ĐẠT:");
  for (const h of hong) console.log(`  · [${h.nhom}] ${h.ten}${h.ghi ? ` — ${h.ghi}` : ""}`);
  process.exitCode = 1;
}
console.log("");

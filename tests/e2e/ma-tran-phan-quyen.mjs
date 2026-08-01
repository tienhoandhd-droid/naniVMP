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

const LUAT_GIA = [
  ["update_progress", "admin", "co"], ["update_progress", "qa_manager", "co"],
  ["update_progress", "department_user", "bo_phan"], ["update_progress", "viewer", "khong"],
  ["set_item_state", "admin", "co"], ["set_item_state", "qa_manager", "co"],
  ["set_item_state", "department_user", "khong"], ["set_item_state", "viewer", "khong"],
  ["generate_timeline", "admin", "co"], ["generate_timeline", "qa_manager", "co"],
  ["generate_timeline", "department_user", "khong"], ["generate_timeline", "viewer", "khong"],
  ["edit_catalog", "admin", "co"], ["edit_catalog", "qa_manager", "co"],
  ["edit_catalog", "department_user", "khong"], ["edit_catalog", "viewer", "khong"],
  ["admin_users", "admin", "co"], ["admin_users", "qa_manager", "khong"],
  ["admin_users", "department_user", "khong"], ["admin_users", "viewer", "khong"],
].map(([hanh_dong, vai_tro, muc]) => ({ hanh_dong, vai_tro, muc }));

const NGUOI_TH_GIA = [
  { id: "bbbb2222-0000-4000-8000-000000000001", performer_name: "Tào Tiến Hoàn", email: "tth@vd.local", department: "qa", is_active: true },
  { id: "bbbb2222-0000-4000-8000-000000000002", performer_name: "Lê Xuân Đức", email: null, department: "qa", is_active: true },
  { id: "bbbb2222-0000-4000-8000-000000000003", performer_name: "Thợ Xưởng Một", email: "tx1@vd.local", department: "xsx", is_active: true },
  { id: "bbbb2222-0000-4000-8000-000000000004", performer_name: "Chưa Gán Ai", email: null, department: null, is_active: true },
];

const PHAN_CONG_GIA = [
  { staff_name: "Tào Tiến Hoàn", department: "qa", validation_type: "PQ", line: "*", vai_tro: "thuc_hien" },
  { staff_name: "Lê Xuân Đức", department: "qa", validation_type: "OQ", line: "*", vai_tro: "ho_tro" },
];

const HO_SO_GIA = [
  { id: "11111111-1111-1111-1111-111111111111", full_name: "Người Quản Trị", email: "qt@vd.local", role: "admin", department: null, is_active: true },
  { id: "22222222-2222-2222-2222-222222222222", full_name: "Người Bộ Phận", email: "bp@vd.local", role: "department_user", department: "xsx", is_active: true },
  { id: "33333333-3333-3333-3333-333333333333", full_name: "Người Chỉ Xem", email: "", role: "viewer", department: null, is_active: true },
];

const NHAN_SU_GIA = [
  { id: "aaaa1111-0000-4000-8000-000000000001", staff_name: "Tào Tiến Hoàn", email: "tth@vd.local", department: "qa", is_active: true },
  { id: "aaaa1111-0000-4000-8000-000000000002", staff_name: "Lê Xuân Đức", email: "lxd@vd.local", department: "qa", is_active: true },
  { id: "aaaa1111-0000-4000-8000-000000000003", staff_name: "Thợ Xưởng Một", email: "tx1@vd.local", department: "xsx", is_active: true },
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
const traLoi = (r, body, ma = 200) => (r.method() === "OPTIONS"
  ? r.respond({ status: 204, headers: CORS, body: "" })
  : r.respond({ status: ma, contentType: "application/json", headers: CORS, body: JSON.stringify(body) }));

p.on("request", (r) => {
  if (/\/rest\/v1\/vmp_assignment_matrix/.test(r.url())) return traLoi(r, PHAN_CONG_GIA);
  if (/\/rest\/v1\/vmp_role_permissions/.test(r.url())) return traLoi(r, LUAT_GIA);
  if (/\/rest\/v1\/vmp_performers/.test(r.url())) return traLoi(r, NGUOI_TH_GIA);
  if (/\/rest\/v1\/rpc\/rpc_set_role_permission/.test(r.url())) {
    // Ô (Sinh timeline × viewer) cố tình hỏng để kiểm đường báo lỗi.
    const than = r.postData() || "";
    if (/generate_timeline/.test(than) && /viewer/.test(than)) {
      return traLoi(r, { ok: false, error: "Ô này bị khoá (giả lập để kiểm)" });
    }
    return traLoi(r, { ok: true, msg: "Đã lưu luật phân quyền" });
  }
  if (/\/rest\/v1\/rpc\/rpc_upsert_performer/.test(r.url())) {
    return traLoi(r, { ok: true, msg: "Đã lưu" });
  }
  if (/\/rest\/v1\/vmp_staff_emails/.test(r.url())) return traLoi(r, NHAN_SU_GIA);
  if (/\/rest\/v1\/rpc\/rpc_set_assignment/.test(r.url())) {
    return traLoi(r, { ok: true, msg: "Đã lưu phân công", vai_tro: "thuc_hien" });
  }
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

const goiRpc = [];
p.on("request", (r) => { if (/\/rest\/v1\/rpc\//.test(r.url())) goiRpc.push(r.url().split("/rpc/")[1]); });

/* Màn có bốn thanh Lưu. Chọn bằng querySelector trần sẽ luôn vớ phải cái
   ĐẦU TIÊN (khối Danh bạ) rồi báo sai về khối đang kiểm — nên mọi phép
   kiểm dưới đây đều đi qua hàm này để khoanh đúng thẻ cần xét. */
const KHOI = {
  danhba: "Danh bạ người thực hiện theo bộ phận",
  A: "A · Vai trò được làm gì",
  B: "B · Ai chịu trách nhiệm phần nào",
  D: "D · Ai làm loại thẩm định nào",
};

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
  /* Thử lại một lần nếu lần đầu không dựng xong. Chạy ngay sau `npm run
     build`, lần tải đầu tiên có lúc vớ phải chunk đang được ghi dở — tải
     lại là xong. Không thử lại thì bộ kiểm hỏng ngẫu nhiên, mà bộ kiểm
     hỏng ngẫu nhiên thì người ta bỏ qua cả những lần hỏng thật. */
  for (let lan = 0; ; lan++) {
    try {
      await p.waitForFunction(
        () => document.body.innerText.includes("Ai chịu trách nhiệm phần nào"),
        { timeout: 30000 },
      );
      break;
    } catch (e) {
      if (lan >= 1) throw e;
      console.log("  … màn chưa dựng xong, tải lại lần 2");
      await p.reload({ waitUntil: "networkidle2" });
    }
  }
  await new Promise((r) => setTimeout(r, 1200));
};

/* ── 1. Vai admin — ô tích chọn hiện ra, không có ô gõ chữ thừa ── */
console.log("\n── 1. Ô tích chọn + thanh Lưu ──");
await vao("admin");

const catKhoi = `window.__khoi = (ten) => [...document.querySelectorAll("div.card")]
  .find((c) => (c.innerText || "").trim().startsWith(ten));`;
await p.evaluateOnNewDocument(catKhoi);
await p.evaluate(catKhoi);

const o = await p.evaluate((K) => {
  void K;
  const tich = [...document.querySelectorAll(".pq-tich")];
  const chip = [...document.querySelectorAll(".pq-chip")];
  const nhap = [...document.querySelectorAll("input.pq-o")];
  const oSua = [...tich, ...chip];
  return {
    soTich: tich.length,
    soChip: chip.length,
    soNhap: nhap.length,
    // Ô sổ xuống chỉ được còn ở hai ô LỌC của bảng D
    soSoXuong: document.querySelectorAll("select.pq-o:not(.pq-loc)").length,
    coNhan: oSua.every((e) => (e.getAttribute("aria-label") || "").trim().length > 3),
    caoNhoNhat: Math.min(...oSua.map((e) => e.getBoundingClientRect().height)),
    soThanhLuu: document.querySelectorAll(".pq-thanhluu").length,
    nutLuuTat: [...document.querySelectorAll(".pq-nut.la-chinh")].every((b) => b.disabled),
    chuThanh: document.querySelector(".pq-thanhluu-chu")?.innerText || "",
  };
}, KHOI);

kiem("Ma trận A dùng ô tích, không dùng ô sổ xuống", o.soSoXuong === 0, `${o.soSoXuong} ô sổ xuống`);
kiem("Có ô tích cho ma trận A và D", o.soTich >= 24, `${o.soTich} ô tích`);
kiem("Vai trò và bộ phận là chip chọn-một", o.soChip >= 20, `${o.soChip} chip`);
kiem("Chỉ còn ô gõ chữ ở nơi không có danh sách (tên, email)", o.soNhap >= 3, `${o.soNhap} ô nhập`);
kiem("Mọi ô sửa đều có nhãn cho trình đọc màn hình", o.coNhan);
kiem("Ngưỡng chạm ≥ 24px (WCAG 2.2)", o.caoNhoNhat >= 24, `${Math.round(o.caoNhoNhat)}px`);
kiem("Mỗi bảng sửa được có một thanh Lưu", o.soThanhLuu >= 4, `${o.soThanhLuu} thanh`);
kiem("Chưa sửa gì thì nút Lưu tắt", o.nutLuuTat);

/* ── 2. Sửa ma trận A: tích → đếm → Lưu → xác nhận ── */
console.log("\n── 2. Ma trận A — tích, đếm, Lưu, xác nhận ──");

/* Chỉ lấy ô của KHỐI A: hàng "Xem số liệu" khoá sẵn, ô admin × quản trị
   đóng băng, nên .filter(!disabled) đã loại chúng. */
const bamOA = async (n) => p.evaluate(([k, ten]) => {
  const o = [...window.__khoi(ten).querySelectorAll(".pq-tich")].filter((x) => !x.disabled);
  o[k].click();
  return o[k].getAttribute("aria-label");
}, [n, KHOI.A]);

const nhan0 = await bamOA(0);
await bamOA(1);
await new Promise((r) => setTimeout(r, 300));

const sauTich = await p.evaluate((ten) => {
  const k = window.__khoi(ten);
  return {
    soNhap: k.querySelectorAll(".pq-tich.la-nhap").length,
    chu: k.querySelector(".pq-thanhluu-chu")?.innerText || "",
    nutBat: !k.querySelector(".pq-nut.la-chinh")?.disabled,
  };
}, KHOI.A);
kiem("Tích xong ô hiện viền 'chưa lưu'", sauTich.soNhap >= 2, `${sauTich.soNhap} ô`);
kiem("Thanh dưới đếm đúng số thay đổi chưa lưu", /2\s*thay đổi chưa lưu/.test(sauTich.chu), sauTich.chu.trim());
kiem("Có thay đổi thì nút Lưu bật lên", sauTich.nutBat, nhan0);

await p.evaluate((ten) => window.__khoi(ten).querySelector(".pq-nut.la-chinh").click(), KHOI.A);
await new Promise((r) => setTimeout(r, 1500));
const sauLuu = await p.evaluate((ten) => {
  const k = window.__khoi(ten);
  return {
    chu: k.querySelector(".pq-thanhluu-chu")?.innerText || "",
    conNhap: k.querySelectorAll(".pq-tich.la-nhap").length,
    nutTat: k.querySelector(".pq-nut.la-chinh")?.disabled,
  };
}, KHOI.A);
kiem("Lưu xong báo rõ đã lưu mấy thay đổi", /Đã lưu \d+\/\d+/.test(sauLuu.chu), sauLuu.chu.trim());
kiem("Lưu xong bản nháp sạch, nút Lưu tắt lại", sauLuu.conNhap === 0 && sauLuu.nutTat);

/* Ô hỏng: máy chủ giả từ chối (Sinh timeline × viewer) → phải báo lý do
   và GIỮ thay đổi lại, không được nuốt mất. */
console.log("\n── 3. Ô lưu hỏng — báo lý do và giữ lại thay đổi ──");
await p.evaluate((ten) => {
  [...window.__khoi(ten).querySelectorAll(".pq-tich")]
    .find((x) => !x.disabled && /Sinh timeline.*viewer/i.test(x.getAttribute("aria-label") || ""))
    .click();
}, KHOI.A);
await new Promise((r) => setTimeout(r, 300));
await p.evaluate((ten) => window.__khoi(ten).querySelector(".pq-nut.la-chinh").click(), KHOI.A);
await new Promise((r) => setTimeout(r, 1500));
const oLoi = await p.evaluate((ten) => {
  const k = window.__khoi(ten);
  return {
    coHop: !!k.querySelector(".pq-loi"),
    chu: k.querySelector(".pq-loi")?.innerText || "",
    oHong: k.querySelectorAll(".pq-tich.la-hong").length,
  };
}, KHOI.A);
kiem("Hiện hộp lỗi nêu đích danh ô nào hỏng", oLoi.coHop && /Sinh timeline/.test(oLoi.chu), oLoi.chu.split("\n")[0]);
kiem("Nêu lý do máy chủ trả về", /Ô này bị khoá/.test(oLoi.chu));
kiem("Ô hỏng giữ viền đỏ, thay đổi không bị nuốt mất", oLoi.oHong >= 1, `${oLoi.oHong} ô`);

/* ── Danh bạ người thực hiện chia theo bộ phận ── */
console.log("\n── 3b. Danh bạ người thực hiện theo bộ phận ──");
const db = await p.evaluate(() => {
  const t = document.body.innerText;
  return {
    coKhoi: t.includes("Danh bạ người thực hiện theo bộ phận"),
    coQA: /QA · QA – QLCL\s*\n?\s*2 người/.test(t) || /QA – QLCL[\s\S]{0,40}người/.test(t),
    coXSX: t.includes("Thợ Xưởng Một"),
    coChuaGan: t.includes("Chưa gán bộ phận") && t.includes("Chưa Gán Ai"),
    coThem: t.includes("Thêm vào danh bạ"),
  };
});
kiem("Có khối danh bạ chia theo bộ phận", db.coKhoi);
kiem("Người XSX nằm ở nhóm XSX", db.coXSX);
kiem("Người chưa gán bộ phận được tách riêng và cảnh báo", db.coChuaGan);
kiem("Có chỗ thêm người mới vào danh bạ", db.coThem);

/* ── Vai không phải admin thì bảng chỉ để xem ── */
console.log("\n── 3c. Vai không phải admin — khoá sửa ──");
await vao("view");
const k = await p.evaluate(() => ({
  tichBat: [...document.querySelectorAll(".pq-tich")].filter((x) => !x.disabled).length,
  chipBat: [...document.querySelectorAll(".pq-chip")].filter((x) => !x.disabled).length,
  coNutLuu: document.querySelectorAll(".pq-nut.la-chinh").length,
  noiRo: document.body.innerText.includes("Bảng chỉ để xem"),
  vanDocDuoc: document.body.innerText.includes("Ai chịu trách nhiệm phần nào"),
}));
kiem("Không ô tích nào bấm được", k.tichBat === 0, `${k.tichBat} ô`);
kiem("Không chip nào bấm được", k.chipBat === 0, `${k.chipBat} chip`);
kiem("Không hiện nút Lưu", k.coNutLuu === 0);
kiem("Nói rõ vì sao không sửa được", k.noiRo);
kiem("Vẫn đọc được toàn bộ ma trận", k.vanDocDuoc);

/* ── 4. Ma trận D · phân công theo loại thẩm định và line ── */
console.log("\n── 4. Ma trận D — tích chọn loại thẩm định theo line ──");
await vao("admin");

goiRpc.length = 0;
const chonBp = async (bp) => {
  await p.evaluate((v) => {
    const s = [...document.querySelectorAll("select.pq-loc")]
      .find((x) => [...x.options].some((o) => o.value === "xsx") && [...x.options].some((o) => o.value === "qa"));
    const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    set.call(s, v);
    s.dispatchEvent(new Event("change", { bubbles: true }));
  }, bp);
  await new Promise((r) => setTimeout(r, 700));
};

await chonBp("qa");
const d = await p.evaluate((ten) => {
  const chu = document.body.innerText;
  const o = [...window.__khoi(ten).querySelectorAll(".pq-tich")];
  return {
    soO: o.length,
    daTich: o.filter((x) => x.textContent.trim() !== "＋").map((x) => x.getAttribute("aria-label")),
    coBangD: chu.includes("D · Ai làm loại thẩm định nào"),
    coDuLoai: ["DQ", "FAT/SAT", "IQ", "OQ", "PQ", "PV", "GSP", "GDP"].every((t) => chu.includes(t)),
    coChuThich: chu.includes("Thực hiện — người trực tiếp làm") && chu.includes("Hỗ trợ — phối hợp"),
    caoNhoNhat: Math.min(...o.map((x) => x.getBoundingClientRect().height)),
  };
}, KHOI.D);
kiem("Bảng D hiện với đủ 8 loại thẩm định", d.coBangD && d.coDuLoai);
kiem("Có ô tích cho từng người × từng loại", d.soO >= 16, `${d.soO} ô`);
kiem("Ô đã phân công đọc đúng từ database",
  d.daTich.some((t) => /Tào Tiến Hoàn · PQ .*: Thực hiện/.test(t))
  && d.daTich.some((t) => /Lê Xuân Đức · OQ .*: Hỗ trợ/.test(t)),
  d.daTich.join(" | ").slice(0, 120));
kiem("Ngưỡng chạm ô tích ≥ 24px", d.caoNhoNhat >= 24, `${Math.round(d.caoNhoNhat)}px`);
kiem("Có chú thích ba trạng thái", d.coChuThich);

/* Bấm một ô trống: phải đi lên bậc 'Thực hiện' và ghi lại ngay trên màn. */
const truoc = await p.evaluate((ten) => {
  const o = [...window.__khoi(ten).querySelectorAll(".pq-tich")]
    .find((x) => x.textContent.trim() === "＋");
  o.dataset.moc = "1";
  return o.getAttribute("aria-label");
}, KHOI.D);
await p.evaluate(() => document.querySelector('.pq-tich[data-moc="1"]').click());
await new Promise((r) => setTimeout(r, 900));
const sau = await p.evaluate(() => {
  const o = document.querySelector('.pq-tich[data-moc="1"]');
  return { nhan: o.getAttribute("aria-label"), ky: o.textContent.trim() };
});
kiem("Bấm ô trống → chuyển sang 'Thực hiện' ngay trên màn",
  sau.ky === "●" && /Thực hiện/.test(sau.nhan), `${truoc} → ${sau.nhan}`);

/* Chưa bấm Lưu thì KHÔNG được gọi RPC — đó là cả điểm của bản nháp. */
kiem("Chưa bấm Lưu thì chưa gọi RPC nào", goiRpc.length === 0, goiRpc.join(", "));
await p.evaluate((ten) => window.__khoi(ten).querySelector(".pq-nut.la-chinh").click(), KHOI.D);
await new Promise((r) => setTimeout(r, 1200));
kiem("Bấm Lưu mới gọi rpc_set_assignment",
  goiRpc.some((u) => /rpc_set_assignment/.test(u)), goiRpc.join(", "));

/* Đổi bộ phận thì danh sách người phải đổi theo danh bạ, không giữ nguyên. */
await chonBp("xsx");
const xsx = await p.evaluate(() => document.body.innerText);
kiem("Đổi bộ phận thì thành viên lấy theo danh bạ của bộ phận đó",
  xsx.includes("Thợ Xưởng Một") && !xsx.includes("Tào Tiến Hoàn · PQ"));
kiem("Bộ phận có chia line thì hiện danh sách line thật",
  /Nang mềm|BFS|Khí dung/.test(xsx));

/* ── 5. Sạch lỗi ── */
console.log("\n── 5. Không có lỗi console ──");
const that = loi.filter((t) => !/401|403|Unauthorized|JWT|row-level security|Failed to load resource/i.test(t));
kiem("Không có lỗi JS", that.length === 0, that.slice(0, 3).join(" | "));

await b.close();
console.log(`\n═══ ${dat}/${dat + hong} phép kiểm đạt ═══`);
process.exit(hong ? 1 : 0);

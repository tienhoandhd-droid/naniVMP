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
import { dangNhap as vaoHeThong, doiVaiTrenMan } from "./dang-nhap.mjs";
import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";

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

const EMAIL_GIA = [
  { email: "qt@vd.local", ghi_chu: "Quản trị", is_active: true },
  { email: "chua-tao-tk@vd.local", ghi_chu: "Đã duyệt, chưa tạo tài khoản", is_active: true },
  { email: "da-bo@vd.local", ghi_chu: "Đã nghỉ", is_active: false },
];

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

/* Nửa XEM của ma trận quyền — đúng hình dạng rpc_luat_xem trả về, lấy từ
   policy RLS thật đang chạy (migration 20260801130000). Bốn dạng mức đều
   có mặt vì mỗi dạng vẽ ra một ký hiệu khác nhau, và một dạng 'khong_ro'
   để chắc rằng giao diện chịu hiện dấu hỏi thay vì đoán bừa. */
const LUAT_XEM_GIA = {
  ok: true,
  noi_dung: [
    {
      bang: "vmp_plan_items", nhan: "Số liệu thẩm định — hạng mục, tiến độ, ngày tháng",
      bieu_thuc: "true",
      muc: { admin: "tat_ca", qa_manager: "tat_ca", department_user: "tat_ca", viewer: "tat_ca" },
    },
    {
      bang: "profiles", nhan: "Danh sách người dùng — họ tên, email, vai trò",
      bieu_thuc: "((id = auth.uid()) OR is_admin_or_qa())",
      muc: { admin: "tat_ca", qa_manager: "tat_ca", department_user: "cua_minh", viewer: "cua_minh" },
    },
    {
      bang: "audit_logs", nhan: "Nhật ký thay đổi — ai sửa gì, lúc nào, vì sao",
      bieu_thuc: "is_admin_or_qa()",
      muc: { admin: "tat_ca", qa_manager: "tat_ca", department_user: "khong", viewer: "khong" },
    },
    {
      bang: "system_config", nhan: "Cấu hình hệ thống",
      bieu_thuc: "((NOT is_sensitive) OR (auth_user_role() = 'admin'::user_role))",
      muc: { admin: "tat_ca", qa_manager: "mot_phan", department_user: "mot_phan", viewer: "mot_phan" },
    },
    {
      bang: "vmp_bang_la", nhan: "Bảng có policy dạng lạ",
      bieu_thuc: "(cot_nao_do = current_setting('vmp.gi_do'))",
      muc: { admin: "khong_ro", qa_manager: "khong_ro", department_user: "khong_ro", viewer: "khong_ro" },
    },
  ],
};

/* Một dòng một người — đúng hình dạng rpc_nguoi_va_quyen trả về
   (migration 20260801110000). Bốn tình huống cần có mặt vì mỗi cái làm hỏng
   một kiểu khác nhau:
     · Tào Tiến Hoàn  — người ĐÃ nối với tài khoản. Trước migration đây là
       HAI dòng vì tên ở hai bảng khác nhau.
     · Thợ Xưởng Một  — có tài khoản, vai cho phép sửa, mà sửa được 0 hạng
       mục: kiểu hỏng im lặng mà bảng phải gọi tên ra.
     · Lê Xuân Đức    — đứng tên hạng mục nhưng chưa có tài khoản.
     · Người Chỉ Xem  — tài khoản chưa nối với người nào, là nguồn cho ô
       "nối với tài khoản". */
const NGUOI_QUYEN_GIA = {
  ok: true,
  tong_hang_muc: 448,
  nguoi: [
    {
      pid: "bbbb2222-0000-4000-8000-000000000001", user_id: "11111111-1111-1111-1111-111111111111",
      ten: "Tào Tiến Hoàn", email: "tth@vd.local", bo_phan: "qa",
      bo_phan_nguoi: "qa", bo_phan_tai_khoan: null, vai: "admin",
      pham_vi_rieng: null, muc: "co", co_tai_khoan: true, tk_hoat_dong: true,
      so_sua_duoc: 448, so_dung_ten: 62, so_phan_cong: 1,
    },
    {
      pid: "bbbb2222-0000-4000-8000-000000000002", user_id: null,
      ten: "Lê Xuân Đức", email: "lxd@vd.local", bo_phan: "qa",
      bo_phan_nguoi: "qa", bo_phan_tai_khoan: null, vai: null,
      pham_vi_rieng: null, muc: null, co_tai_khoan: false, tk_hoat_dong: true,
      so_sua_duoc: 0, so_dung_ten: 8, so_phan_cong: 1,
    },
    {
      pid: "bbbb2222-0000-4000-8000-000000000003", user_id: "22222222-2222-2222-2222-222222222222",
      ten: "Thợ Xưởng Một", email: "tx1@vd.local", bo_phan: "xsx",
      bo_phan_nguoi: "xsx", bo_phan_tai_khoan: "xsx", vai: "department_user",
      pham_vi_rieng: "phan_cong", muc: "phan_cong", co_tai_khoan: true, tk_hoat_dong: true,
      so_sua_duoc: 0, so_dung_ten: 0, so_phan_cong: 0,
    },
    {
      pid: "bbbb2222-0000-4000-8000-000000000004", user_id: null,
      ten: "Chưa Gán Ai", email: null, bo_phan: null,
      bo_phan_nguoi: null, bo_phan_tai_khoan: null, vai: null,
      pham_vi_rieng: null, muc: null, co_tai_khoan: false, tk_hoat_dong: true,
      so_sua_duoc: 0, so_dung_ten: 0, so_phan_cong: 0,
    },
    {
      pid: null, user_id: "33333333-3333-3333-3333-333333333333",
      ten: "Người Chỉ Xem", email: "", bo_phan: null,
      bo_phan_nguoi: null, bo_phan_tai_khoan: null, vai: "viewer",
      pham_vi_rieng: null, muc: "khong", co_tai_khoan: true, tk_hoat_dong: true,
      so_sua_duoc: 0, so_dung_ten: 0, so_phan_cong: 0,
    },
  ],
};

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
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
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
  if (/\/rest\/v1\/vmp_email_cho_phep/.test(r.url())) return traLoi(r, EMAIL_GIA);
  if (/\/rest\/v1\/rpc\/rpc_set_email_cho_phep/.test(r.url())) {
    return traLoi(r, { ok: true, msg: "Đã cho phép email này tạo tài khoản" });
  }
  if (/\/rest\/v1\/vmp_performers/.test(r.url())) return traLoi(r, NGUOI_TH_GIA);
  if (/\/rest\/v1\/rpc\/rpc_nguoi_va_quyen/.test(r.url())) return traLoi(r, NGUOI_QUYEN_GIA);
  if (/\/rest\/v1\/rpc\/rpc_luat_xem/.test(r.url())) return traLoi(r, LUAT_XEM_GIA);
  if (/\/rest\/v1\/rpc\/rpc_lien_ket_tai_khoan/.test(r.url())) {
    return traLoi(r, { ok: true, msg: "Đã nối với tài khoản" });
  }
  if (/\/rest\/v1\/rpc\/rpc_set_user_role/.test(r.url())) {
    return traLoi(r, { ok: true, msg: "Đã cập nhật phân quyền" });
  }
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
  email: "1 · Ai được phép có tài khoản",
  A: "2 · Vai nào xem được gì, sửa được gì",
  /* Ma trận trách nhiệm & quyền — nuốt cả khối phân công cũ. Không còn
     khối "4 · ..." nào để khoanh riêng. */
  B: "3 · Ma trận trách nhiệm",
};

let dat = 0; let hong = 0;
const kiem = (ten, ok, chiTiet = "") => {
  if (ok) { dat++; console.log(`  ✅ ${ten}${chiTiet ? " — " + chiTiet : ""}`); }
  else { hong++; console.log(`  ❌ ${ten}${chiTiet ? " — " + chiTiet : ""}`); }
};

let daVao = false;
const vao = async (perm) => {
  if (!daVao) { await vaoHeThong(p, GOC); daVao = true; }
  await doiVaiTrenMan(p, perm, "Tào Tiến Hoàn");
  // Realtime/polling giữ request nền nên networkidle2 có thể không bao giờ
  // tới khi chạy sau các E2E khác. Chờ DOM rồi dùng nội dung thật bên dưới.
  await p.goto(`${GOC}#v=phanquyen`, { waitUntil: "domcontentloaded" });
  await p.reload({ waitUntil: "domcontentloaded" });
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
        () => document.body.innerText.includes("Ma trận trách nhiệm"),
        { timeout: 30000 },
      );
      break;
    } catch (e) {
      if (lan >= 1) throw e;
      console.log("  … màn chưa dựng xong, tải lại lần 2");
      await p.reload({ waitUntil: "domcontentloaded" });
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
    // Ma trận vai trò cũ không dùng select; danh bạ chuẩn mới có select
    // bộ phận/phân loại đúng nghiệp vụ và được kiểm ở bài E2E riêng.
    soSoXuong: [...document.querySelectorAll("select.pq-o:not(.pq-loc)")]
      .filter((element) => !element.closest(".ip-workspace")).length,
    coNhan: oSua.every((e) => (e.getAttribute("aria-label") || "").trim().length > 3),
    caoNhoNhat: Math.min(...oSua.map((e) => e.getBoundingClientRect().height)),
    soThanhLuu: document.querySelectorAll(".pq-thanhluu").length,
    nutLuuTat: [...document.querySelectorAll(".pq-nut.la-chinh")].every((b) => b.disabled),
    chuThanh: document.querySelector(".pq-thanhluu-chu")?.innerText || "",
  };
}, KHOI);

kiem("Ma trận quyền dùng ô tích, không dùng ô sổ xuống", o.soSoXuong === 0, `${o.soSoXuong} ô sổ xuống`);
kiem("Có ô tích cho ma trận quyền và ma trận phân công", o.soTich >= 24, `${o.soTich} ô tích`);
kiem("Vai trò, bộ phận, phạm vi là chip chọn-một", o.soChip >= 20, `${o.soChip} chip`);
kiem("Chỉ còn ô gõ chữ ở nơi không có danh sách (tên, email)", o.soNhap >= 3, `${o.soNhap} ô nhập`);
kiem("Mọi ô sửa đều có nhãn cho trình đọc màn hình", o.coNhan);
kiem("Ngưỡng chạm ≥ 24px (WCAG 2.2)", o.caoNhoNhat >= 24, `${Math.round(o.caoNhoNhat)}px`);
/* Gộp sáu khối còn ba: hai khối sửa được (ma trận quyền · ma trận trách
   nhiệm) nên đúng HAI thanh Lưu. Nhiều hơn nghĩa là còn khối trùng chưa
   gộp — đây là phép kiểm chống việc màn hình phình lại. */
kiem("Hai khối sửa được, mỗi khối một thanh Lưu", o.soThanhLuu === 2, `${o.soThanhLuu} thanh`);
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
    nutBat: !k.querySelector(".pq-thanhluu .pq-nut.la-chinh")?.disabled,
  };
}, KHOI.A);
kiem("Tích xong ô hiện viền 'chưa lưu'", sauTich.soNhap >= 2, `${sauTich.soNhap} ô`);
kiem("Thanh dưới đếm đúng số thay đổi chưa lưu", /2\s*thay đổi chưa lưu/.test(sauTich.chu), sauTich.chu.trim());
kiem("Có thay đổi thì nút Lưu bật lên", sauTich.nutBat, nhan0);

await p.evaluate((ten) => window.__khoi(ten).querySelector(".pq-thanhluu .pq-nut.la-chinh").click(), KHOI.A);
await new Promise((r) => setTimeout(r, 1500));
const sauLuu = await p.evaluate((ten) => {
  const k = window.__khoi(ten);
  return {
    chu: k.querySelector(".pq-thanhluu-chu")?.innerText || "",
    conNhap: k.querySelectorAll(".pq-tich.la-nhap").length,
    nutTat: k.querySelector(".pq-thanhluu .pq-nut.la-chinh")?.disabled,
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
await p.evaluate((ten) => window.__khoi(ten).querySelector(".pq-thanhluu .pq-nut.la-chinh").click(), KHOI.A);
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

/* ── Bốn mức quyền của hàng "Cập nhật tiến độ" ── */
console.log("\n── 3z. Bốn mức quyền, chỉ hàng Cập nhật tiến độ có mức mịn ──");
const mucA = await p.evaluate((ten) => {
  const k = window.__khoi(ten);
  const nhan = (r) => [...k.querySelectorAll(".pq-tich")]
    .map((x) => x.getAttribute("aria-label") || "")
    .filter((t) => t.startsWith(r));
  return {
    chu: k.innerText,
    capNhat: nhan("Cập nhật tiến độ ×"),
    sinhTl: nhan("Sinh timeline từ danh mục nguồn ×"),
  };
}, KHOI.A);
kiem("Chú thích nêu đủ bốn mức",
  /Được — mọi hạng mục/.test(mucA.chu) && /quản lý .*hoặc.* thực hiện/.test(mucA.chu)
  && /Theo phân công/.test(mucA.chu) && /◔/.test(mucA.chu));
kiem("Nói rõ 'bộ phận mình' tính cả bộ phận thực hiện",
  /quản lý .*hoặc.* thực hiện/.test(mucA.chu));

/* Bấm ô update_progress × department_user cho đi hết một vòng bốn mức. */
const vong = [];
for (let i = 0; i < 4; i++) {
  vong.push(await p.evaluate((ten) => {
    const o = [...window.__khoi(ten).querySelectorAll(".pq-tich")]
      .find((x) => /^Cập nhật tiến độ × department_user/.test(x.getAttribute("aria-label") || ""));
    o.click();
    return o.getAttribute("aria-label");
  }, KHOI.A));
  await new Promise((r) => setTimeout(r, 150));
}
kiem("Ô 'Cập nhật tiến độ' đi qua đủ bốn mức rồi quay lại",
  new Set(vong.map((t) => t.split(":")[1]?.trim().split(" (")[0])).size === 4,
  vong.map((t) => t.split(":")[1]?.trim().split(" (")[0]).join(" → "));
await p.evaluate((ten) => {
  const b = window.__khoi(ten).querySelector(".pq-nut:not(.la-chinh)");
  if (b && !b.disabled) b.click();
}, KHOI.A);
await new Promise((r) => setTimeout(r, 300));

/* ── Danh sách email được phép có tài khoản ── */
console.log("\n── 3a. Ai được phép có tài khoản ──");
const dse = await p.evaluate(() => {
  const t = document.body.innerText;
  return {
    coKhoi: t.includes("Ai được phép có tài khoản"),
    demDung: /2 email được phép tạo tài khoản/.test(t),
    baoChuaCoTk: t.includes("chưa — người này còn phải được tạo tài khoản"),
    coBaBuoc: t.includes("Thêm một người mới, đủ ba bước"),
    coNutBo: [...document.querySelectorAll("button")].some((b) => /^Bỏ$/.test(b.innerText.trim())),
  };
});
kiem("Có khối danh sách email được phép", dse.coKhoi);
kiem("Đếm đúng số email đang được phép (không tính email đã bỏ)", dse.demDung);
kiem("Chỉ rõ email đã duyệt mà chưa tạo tài khoản", dse.baoChuaCoTk);
kiem("Ghi rõ ba bước thêm người mới", dse.coBaBuoc);
kiem("Admin có nút bỏ email khỏi danh sách", dse.coNutBo);

/* ── Nửa XEM của ma trận quyền ──
   Trước khi gộp, màn này không trả lời được câu "ai xem được gì" — nửa đó
   nằm ở policy RLS, không ở bảng luật nào mà giao diện đọc. */
console.log("\n── 3b. Ma trận quyền — nửa XEM đọc từ RLS ──");
const xem = await p.evaluate((ten) => {
  const k = window.__khoi(ten);
  const nhan = (r) => [...k.querySelectorAll(".pq-tich")]
    .map((x) => ({ nhan: x.getAttribute("aria-label") || "", chu: x.title || "", khoa: x.disabled }))
    .filter((x) => x.nhan.startsWith(r));
  return {
    chu: k.innerText,
    nhatKy: nhan("Nhật ký thay đổi"),
    hoSo: nhan("Danh sách người dùng"),
    la: nhan("Bảng có policy dạng lạ"),
  };
}, KHOI.A);
kiem("Có nửa XEM và nửa SỬA trong cùng một ma trận",
  /XEM ĐƯỢC GÌ/.test(xem.chu) && /SỬA ĐƯỢC GÌ/.test(xem.chu));
kiem("Nói rõ nửa XEM do RLS quyết, không sửa ở đây",
  /Row Level Security/.test(xem.chu) && xem.nhatKy.every((x) => x.khoa));
kiem("Nhật ký: admin và QA xem được, hai vai còn lại không",
  /Xem được toàn bộ/.test(xem.nhatKy[0]?.nhan) && /Xem được toàn bộ/.test(xem.nhatKy[1]?.nhan)
  && /Không xem được/.test(xem.nhatKy[2]?.nhan) && /Không xem được/.test(xem.nhatKy[3]?.nhan),
  xem.nhatKy.map((x) => x.nhan.split(": ")[1]).join(" · "));
kiem("Danh sách người dùng: vai thường chỉ xem được của chính mình",
  /chính mình/.test(xem.hoSo[2]?.nhan || ""), xem.hoSo[2]?.nhan);
kiem("Policy dạng lạ thì hiện dấu hỏi và nguyên văn, không đoán bừa",
  /Chưa phân loại được/.test(xem.la[0]?.nhan || "")
  && /current_setting/.test(xem.la[0]?.chu || ""), xem.la[0]?.nhan);

/* ── Bảng Người đã nuốt khối danh bạ cũ ── */
console.log("\n── 3b2. Bảng Người gộp cả danh bạ ──");
const db = await p.evaluate((ten) => {
  const k = window.__khoi(ten);
  const t = k.innerText;
  return {
    khongConKhoiCu: !document.body.innerText.includes("Danh bạ người thực hiện theo bộ phận"),
    coXSX: t.includes("Thợ Xưởng Một"),
    coChuaGan: t.includes("Chưa Gán Ai"),
    coThem: t.includes("Thêm người"),
    /* Một ô bộ phận cho mỗi người, không phải hai ô ở hai khối như trước
       khi gộp. Đếm theo TÊN: trùng tên trong danh sách này nghĩa là màn
       hình lại đang cho sửa cùng một người ở hai chỗ. */
    oBoPhan: [...k.querySelectorAll('[role="group"]')]
      .map((g) => g.getAttribute("aria-label") || "")
      .filter((t) => /^Bộ phận của /.test(t) && !/người mới$/.test(t)),
  };
}, KHOI.B);
kiem("Khối danh bạ riêng đã biến mất khỏi màn", db.khongConKhoiCu);
kiem("Người của mọi bộ phận nằm chung một bảng", db.coXSX && db.coChuaGan);
kiem("Vẫn thêm được người mới ngay tại bảng", db.coThem);
kiem("Mỗi người đúng MỘT ô bộ phận, không phải hai bảng hai ô",
  db.oBoPhan.length > 0 && new Set(db.oBoPhan).size === db.oBoPhan.length,
  `${db.oBoPhan.length} ô, ${new Set(db.oBoPhan).size} tên khác nhau`);

/* ── Bảng B: một dòng một người, gộp ở database ──
   Phép kiểm quan trọng nhất ở đây là ĐẾM DÒNG. Trước migration 20260801110000
   màn này gộp bằng chuỗi tên, nên một người có tên khác nhau ở hai bảng sẽ ra
   hai dòng — và hai dòng đó nói ngược nhau về cùng một người. */
console.log("\n── 3bb. Bảng B — một dòng một người ──");
const bb = await p.evaluate((ten) => {
  const k = window.__khoi(ten);
  const dong = [...k.querySelectorAll("tbody tr")];
  const cotNguoi = dong.map((r) => (r.querySelector("td")?.innerText || "").split("\n")[0].trim());
  return {
    chu: k.innerText,
    demHoan: cotNguoi.filter((t) => t === "Tào Tiến Hoàn").length,
    demThoXuong: cotNguoi.filter((t) => t === "Thợ Xưởng Một").length,
    coCotSuaDuoc: /Sửa được/.test(k.innerText),
    /* 448/448 cho admin, 0/448 cho hai người bị chặn. */
    coSoThat: /448\/448/.test(k.innerText) && /0\/448/.test(k.innerText),
    chipPhamVi: [...k.querySelectorAll(".pq-chip")]
      .filter((x) => /^Phạm vi riêng của/.test(x.getAttribute("aria-label") || "")).length,
    phamViDangChon: [...k.querySelectorAll(".pq-chip.la-chon")]
      .filter((x) => /^Phạm vi riêng của/.test(x.getAttribute("aria-label") || ""))
      .map((x) => x.getAttribute("aria-label")),
    coONoi: [...k.querySelectorAll("select")]
      .some((s) => /nối .* với tài khoản/i.test(s.getAttribute("aria-label") || "")),
  };
}, KHOI.B);
kiem("Mỗi người đúng MỘT dòng, không tách theo tên",
  bb.demHoan === 1 && bb.demThoXuong === 1, `Tào Tiến Hoàn ×${bb.demHoan}`);
kiem("Có cột 'Sửa được' đọc số thật từ database", bb.coCotSuaDuoc && bb.coSoThat);
kiem("Có chip phạm vi riêng cho từng tài khoản", bb.chipPhamVi >= 15, `${bb.chipPhamVi} chip`);
kiem("Phạm vi riêng đọc đúng giá trị đang lưu",
  bb.phamViDangChon.some((t) => /Thợ Xưởng Một.*theo phân công/.test(t)),
  bb.phamViDangChon.join(" | "));
kiem("Gọi tên người có tài khoản mà sửa được 0 hạng mục",
  /sửa được 0 hạng mục/i.test(bb.chu.replace(/\s+/g, " ")) && /Thợ Xưởng Một/.test(bb.chu));
kiem("Người chưa có tài khoản có ô nối tay với tài khoản chưa nhận chủ", bb.coONoi);

/* Đổi phạm vi riêng: phải vào bản nháp, đếm ở thanh Lưu, chưa gọi RPC. */
goiRpc.length = 0;
await p.evaluate((ten) => {
  [...window.__khoi(ten).querySelectorAll(".pq-chip")]
    .find((x) => /^Phạm vi riêng của Tào Tiến Hoàn: ◑/.test(x.getAttribute("aria-label") || ""))
    .click();
}, KHOI.B);
await new Promise((r) => setTimeout(r, 400));
const bbNhap = await p.evaluate((ten) => ({
  chu: window.__khoi(ten).querySelector(".pq-thanhluu-chu")?.innerText || "",
}), KHOI.B);
kiem("Đổi phạm vi riêng vào bản nháp, chưa gọi RPC",
  /1\s*thay đổi chưa lưu/.test(bbNhap.chu) && goiRpc.length === 0,
  `${bbNhap.chu.trim()} · ${goiRpc.join(", ")}`);
await p.evaluate((ten) => window.__khoi(ten).querySelector(".pq-thanhluu .pq-nut.la-chinh").click(), KHOI.B);
await new Promise((r) => setTimeout(r, 1500));
kiem("Bấm Lưu mới gọi rpc_set_user_role",
  goiRpc.some((u) => /rpc_set_user_role/.test(u)), goiRpc.join(", "));

/* ── Vai không phải admin thì bảng chỉ để xem ── */
console.log("\n── 3c. Vai không thuộc allowlist — chặn truy cập ──");
await doiVaiTrenMan(p, "view", "Tào Tiến Hoàn");
await p.goto(`${GOC}#v=phanquyen`, { waitUntil: "domcontentloaded" });
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForFunction(
  () => document.body.innerText.includes("Không có quyền truy cập"),
  { timeout: 30000 },
);
const k = await p.evaluate(() => ({
  tichBat: [...document.querySelectorAll(".pq-tich")].filter((x) => !x.disabled).length,
  chipBat: [...document.querySelectorAll(".pq-chip")].filter((x) => !x.disabled).length,
  coNutLuu: document.querySelectorAll(".pq-nut.la-chinh").length,
  noiRo: /không có quyền truy cập màn Phân quyền/i.test(document.body.innerText),
  vanDocDuoc: document.body.innerText.includes("Ma trận trách nhiệm"),
}));
kiem("Không ô tích nào bấm được", k.tichBat === 0, `${k.tichBat} ô`);
kiem("Không chip nào bấm được", k.chipBat === 0, `${k.chipBat} chip`);
kiem("Không hiện nút Lưu", k.coNutLuu === 0);
kiem("Nói rõ vì sao không được vào", k.noiRo);
kiem("Không lộ ma trận qua URL gõ tay", !k.vanDocDuoc);

/* ── 4. Nửa TRÁCH NHIỆM của ma trận đã gộp ──
   Bảng phân công cũ đứng riêng và có ô chọn BỘ PHẬN. Ô đó là ảo: khoá duy
   nhất của vmp_assignment_matrix là (staff_name, validation_type, line) —
   bộ phận không nằm trong khoá. Nay ô phân công nằm ngay trên dòng của
   người, bộ phận lấy từ chính dòng đó. */
console.log("\n── 4. Ma trận trách nhiệm — phân công nằm cùng dòng với quyền ──");
await vao("admin");

goiRpc.length = 0;
const chonLine = async (v) => {
  await p.evaluate((x) => {
    const s = [...document.querySelectorAll("select.pq-loc")]
      .find((e) => [...e.options].some((o) => o.value === "*"));
    const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    set.call(s, x);
    s.dispatchEvent(new Event("change", { bubbles: true }));
  }, v);
  await new Promise((r) => setTimeout(r, 700));
};

const d = await p.evaluate((ten) => {
  const k = window.__khoi(ten);
  const chu = k.innerText;
  const o = [...k.querySelectorAll(".pq-tich")];
  /* Dải bộ phận: gộp xong vẫn phải thấy "bộ phận nào có những ai", đó là
     việc mà khối danh bạ cũ làm và không được mất khi bỏ khối đó. */
  const dai = [...k.querySelectorAll("tbody tr")]
    .map((r) => r.querySelector("td[colspan]")?.innerText || "")
    .filter((t) => /\d+ người/.test(t));
  return {
    khongConOChonBoPhan: ![...document.querySelectorAll("select.pq-loc")]
      .some((e) => [...e.options].some((x) => x.value === "xsx")),
    coHaiVe: /ĐƯỢC PHÉP LÀM GÌ/.test(chu) && /ĐANG NHẬN LÀM GÌ/.test(chu),
    soO: o.length,
    daTich: o.filter((x) => !/^[＋]$/.test(x.textContent.trim()))
      .map((x) => x.getAttribute("aria-label")),
    coDuLoai: ["DQ", "FAT/SAT", "IQ", "OQ", "PQ", "PV", "GSP", "GDP"].every((t) => chu.includes(t)),
    coChuThich: chu.includes("Thực hiện — người trực tiếp làm") && chu.includes("Hỗ trợ — phối hợp"),
    caoNhoNhat: Math.min(...o.map((x) => x.getBoundingClientRect().height)),
    dai,
  };
}, KHOI.B);
kiem("Hai vế quyền và trách nhiệm nằm trong cùng một bảng", d.coHaiVe);
kiem("Ô chọn bộ phận — chiều không có thật — đã bỏ", d.khongConOChonBoPhan);
kiem("Đủ 8 loại thẩm định làm cột", d.coDuLoai);
kiem("Có ô tích cho từng người × từng loại", d.soO >= 24, `${d.soO} ô`);
kiem("Vẫn thấy bộ phận nào có những ai (dải nhóm)",
  d.dai.length >= 2, d.dai.map((t) => t.split("\n")[0]).join(" | ").slice(0, 110));
kiem("Ô đã phân công đọc đúng từ database",
  d.daTich.some((t) => /Tào Tiến Hoàn · PQ .*: Thực hiện/.test(t))
  && d.daTich.some((t) => /Lê Xuân Đức · OQ .*: Hỗ trợ/.test(t)),
  d.daTich.join(" | ").slice(0, 120));
kiem("Ngưỡng chạm ô tích ≥ 24px", d.caoNhoNhat >= 24, `${Math.round(d.caoNhoNhat)}px`);
kiem("Có chú thích ba trạng thái", d.coChuThich);

/* Người chưa gán bộ phận thì KHÔNG phân công được — và ô phải nói ra lý
   do, vì "bấm không ăn" mà im lặng là cách nhanh nhất để người dùng kết
   luận màn hình hỏng. */
const khoaBp = await p.evaluate((ten) => {
  const o = [...window.__khoi(ten).querySelectorAll(".pq-tich")]
    .filter((x) => /^Chưa Gán Ai · /.test(x.getAttribute("aria-label") || ""));
  return { so: o.length, khoaHet: o.length > 0 && o.every((x) => x.disabled),
           nhan: o[0]?.getAttribute("aria-label") || "" };
}, KHOI.B);
kiem("Người chưa gán bộ phận thì ô phân công khoá và nói rõ vì sao",
  khoaBp.khoaHet && /chưa gán bộ phận/.test(khoaBp.nhan), khoaBp.nhan);

/* Bấm một ô trống: phải đi lên bậc 'Thực hiện' và ghi lại ngay trên màn. */
const truoc = await p.evaluate((ten) => {
  const o = [...window.__khoi(ten).querySelectorAll(".pq-tich")]
    .find((x) => !x.disabled && x.textContent.trim() === "＋");
  o.dataset.moc = "1";
  return o.getAttribute("aria-label");
}, KHOI.B);
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

/* MỘT nút Lưu cho cả dòng: tích thêm một ô quyền rồi Lưu một lần phải đẩy
   được cả hai loại thay đổi xuống. Tách hai nút thì sửa một dòng lại phải
   bấm hai chỗ, và quên một chỗ là mất nửa thay đổi. */
await p.evaluate((ten) => {
  [...window.__khoi(ten).querySelectorAll(".pq-chip")]
    .find((x) => /^Phạm vi riêng của Tào Tiến Hoàn: ◑/.test(x.getAttribute("aria-label") || ""))
    .click();
}, KHOI.B);
await new Promise((r) => setTimeout(r, 300));
const demTruocLuu = await p.evaluate((ten) => window.__khoi(ten)
  .querySelector(".pq-thanhluu-chu")?.innerText || "", KHOI.B);
kiem("Một thanh Lưu đếm chung cả ô quyền lẫn ô phân công",
  /2\s*thay đổi chưa lưu/.test(demTruocLuu), demTruocLuu.trim());

await p.evaluate((ten) => window.__khoi(ten)
  .querySelector(".pq-thanhluu .pq-nut.la-chinh").click(), KHOI.B);
await new Promise((r) => setTimeout(r, 1800));
kiem("Bấm Lưu một lần đẩy cả hai loại thay đổi xuống",
  goiRpc.some((u) => /rpc_set_assignment/.test(u))
  && goiRpc.some((u) => /rpc_set_user_role/.test(u)),
  [...new Set(goiRpc)].join(", "));

/* Đổi line: ô phân công phải khai cho line vừa chọn, và người thuộc bộ
   phận không có line đó thì bị khoá kèm lý do. */
if (await p.evaluate(() => [...document.querySelectorAll("select.pq-loc option")].length > 1)) {
  const line = await p.evaluate(() => {
    const s = [...document.querySelectorAll("select.pq-loc")]
      .find((e) => [...e.options].some((o) => o.value === "*"));
    return s.options.length > 1 ? s.options[1].value : "";
  });
  if (line) {
    await chonLine(line);
    const theoLine = await p.evaluate((ten) => {
      const o = [...window.__khoi(ten).querySelectorAll(".pq-tich")];
      return {
        nhan: o.map((x) => x.getAttribute("aria-label") || ""),
        coKhoaViLine: o.some((x) => x.disabled && /không có line/.test(x.title || "")),
      };
    }, KHOI.B);
    kiem("Đổi line thì ô phân công khai cho đúng line đó",
      theoLine.nhan.some((t) => t.includes(line)), line);
    kiem("Người thuộc bộ phận không có line đó thì ô khoá kèm lý do",
      theoLine.coKhoaViLine);
  }
}
/* ── 5. Sạch lỗi ── */
console.log("\n── 5. Không có lỗi console ──");
const that = loi.filter((t) => !/401|403|Unauthorized|JWT|row-level security|Failed to load resource/i.test(t));
kiem("Không có lỗi JS", that.length === 0, that.slice(0, 3).join(" | "));

await b.close();
console.log(`\n═══ ${dat}/${dat + hong} phép kiểm đạt ═══`);
process.exit(hong ? 1 : 0);

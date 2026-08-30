/* =====================================================================
 *  quyen-admin.mjs — kiểm e2e các chức năng của vai ADMIN
 *  ---------------------------------------------------------------------
 *  Chạy trên Supabase giả lập (gia-lap-supabase.mjs) — không request nào
 *  ra ngoài. Bộ này KHÔNG sửa gia-lap-supabase.mjs; mọi dữ liệu admin cần
 *  mà kho giả lập chưa có (rpc_business_roles, rpc_set_business_role,
 *  rpc_set_user_active, rpc_item_permission_preflight, danh sách
 *  nguoi_dung của rpc_trang_thai_he_thong) được chỉnh TẠI CHỖ qua tham số
 *  `suaKho` của `caiGiaLap`, theo đúng khuôn của catalog-workspace.mjs.
 *
 *  Bộ kiểm:
 *   1. Admin thấy các màn và khối quản trị tài khoản/chính sách.
 *   2. QA không dựng được khối quản trị qua deep-link; quản lý xưởng chỉ
 *      còn workspace phân công riêng.
 *   3. Cấu hình hệ thống không còn bảng đổi vai trùng lặp.
 *   4. Vai trò & phạm vi: bản nháp/Huỷ không ghi; Lưu đổi vai và bật/tắt
 *      gọi đúng một RPC, đúng UUID ngay cả khi hai tài khoản trùng email.
 *   5. Thẻ "Chế độ áp dụng quyền theo hạng mục" ở Vai trò & phạm vi: admin
 *      thấy; nút "Bật áp dụng quyền thật" khoá khi thiếu lý do/chữ xác
 *      nhận, mở khoá khi nhập đủ.
 *   6. Nút "Tính lại trạng thái" ở Chất lượng dữ liệu → tab "Kiểm tra trên
 *      máy chủ" chỉ hiện với vai NGHIỆP VỤ admin (không phải chỉ cần thấy
 *      được màn).
 *
 *  Chạy: bash scripts/with-preview.sh -- npm run e2e:admin
 *  (hoặc: npx vite build && npx vite preview --host 127.0.0.1 --port 4173
 *   chạy nền, rồi node tests/e2e/quyen-admin.mjs)
 * ===================================================================== */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien, NGUOI_DUNG } from "./gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";

const URL_SB = (() => {
  const noi = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
  const m = noi.match(/^VITE_SUPABASE_URL=(.+)$/m);
  if (!m) throw new Error(".env.local thiếu VITE_SUPABASE_URL");
  return m[1].trim();
})();

let soDat = 0;
let soHong = 0;

function kiem(dieuKien, ten, chiTiet = "") {
  if (dieuKien) { soDat += 1; return; }
  soHong += 1;
  console.error(`  ✗ ${ten}${chiTiet ? ` — ${chiTiet}` : ""}`);
}

const cho = (ms) => new Promise((r) => setTimeout(r, ms));

/** Màn chỉ-admin CÓ MẶT TRÊN MENU. `accounts` vẫn là screenId hợp lệ ở
 *  server nhưng màn đó đã gộp vào "Vai trò & phạm vi" nên không còn mục
 *  nav — kiểm nó ở ca 1b (chuyển hướng) thay vì ở đây. */
const MAN_CHI_ADMIN = ["phanquyen", "health", "audit", "admin"];

/** Bồi thêm những gì màn Cấu hình hệ thống / Vai trò & phạm vi cần mà kho
 *  giả lập gốc chưa có. KHÔNG đổi rpc_my_ui_access ở đây — vai vẫn admin
 *  mặc định của kho ("day"). */
function suaKhoAdmin(kho) {
  kho.rpc_trang_thai_he_thong = {
    ...kho.rpc_trang_thai_he_thong,
    nguoi_dung: [{
      ten: "Người kiểm thử",
      email: NGUOI_DUNG.email,
      vai_tro: "admin",
      bo_phan: null,
      dang_dung: true,
      dang_nhap_gan_nhat: "2026-08-15T02:00:00Z",
    }],
  };
  kho.rpc_business_roles = {
    ok: true,
    nguoi: [{
      user_id: NGUOI_DUNG.id,
      email: NGUOI_DUNG.email,
      business_role: "admin",
      unresolved_reason: null,
    }],
  };
  kho.rpc_set_business_role = { ok: true };
  kho.rpc_set_user_active = { ok: true };
  kho.rpc_item_permission_preflight = { mode: "preview", blocking_errors: [], warnings: [] };
  /* rpc_dashboard_kpi trong kho gốc trả hình phẳng {total,done,overdue,...}
     — đúng cho một chỗ dùng khác, nhưng ServerChecksPage.tsx (màn "Kiểm
     tra trên máy chủ") đọc ServerKpi.validation.done/over/todo/total và sẽ
     ném TypeError, làm cả màn rơi vào error boundary ("Tải lại trang").
     Not sửa gia-lap-supabase.mjs (dùng chung với bộ khác) — vá tại chỗ
     đúng hình dạng thật của ServerKpi (xem src/lib/supabaseData.ts). */
  kho.rpc_dashboard_kpi = {
    updated_at: "2026-08-15T02:00:00Z",
    validation: { done: 6, over: 4, todo: 14, total: 24 },
    documentation: { done: 3, over: 2, todo: 19, total: 24 },
    mismatch_count: 0,
  };
}

const USER_B = "22222222-2222-4222-8222-222222222222";

/** Hai tài khoản cố ý trùng email để khóa hợp đồng: mọi thao tác phải chọn
 *  bằng UUID, tuyệt đối không ghép theo email/tên. Mutation cập nhật kho
 *  giả lập để lần reload đối chiếu sau ghi nhìn thấy trạng thái mới. */
function suaKhoRolePanel(kho) {
  suaKhoAdmin(kho);
  const accounts = [
    {
      pid: "pf-a", user_id: NGUOI_DUNG.id, ten: "Người A", email: "trung@vmp.test",
      bo_phan: "qa", bo_phan_nguoi: "qa", bo_phan_tai_khoan: "qa", vai: "admin",
      pham_vi_rieng: null, muc: null, co_tai_khoan: true, tk_hoat_dong: true,
      so_sua_duoc: 0, so_dung_ten: 0, so_phan_cong: 0,
    },
    {
      pid: "pf-b", user_id: USER_B, ten: "Người B", email: "trung@vmp.test",
      bo_phan: "qa", bo_phan_nguoi: "qa", bo_phan_tai_khoan: "qa", vai: "department_user",
      pham_vi_rieng: null, muc: null, co_tai_khoan: true, tk_hoat_dong: true,
      so_sua_duoc: 0, so_dung_ten: 0, so_phan_cong: 1,
    },
  ];
  const roles = [
    { user_id: NGUOI_DUNG.id, email: "trung@vmp.test", business_role: "admin", unresolved_reason: null },
    { user_id: USER_B, email: "trung@vmp.test", business_role: "qa_staff", unresolved_reason: null },
  ];
  kho.rpc_nguoi_va_quyen = () => ({ ok: true, tong_hang_muc: 0, nguoi: accounts });
  kho.rpc_business_roles = () => ({ ok: true, nguoi: roles });
  kho.rpc_item_permission_directory = {
    ok: true,
    people: accounts.map((row) => ({
      person_id: row.pid, user_id: row.user_id, employee_code: row.pid.toUpperCase(),
      full_name: row.ten, department: "qa", email: row.email, account_status: "linked",
      access_class: row.user_id === USER_B ? "qa_progress_editor" : "admin",
      scope_departments: [], scope_factory_ids: [], scope_area_ids: [], scope_line_ids: [],
      version: 1, access_areas: [], email_sent_confirmed: true, is_active: true,
      match_status: "unique",
    })),
  };
  kho.rpc_set_business_role = (body) => {
    const role = roles.find((row) => row.user_id === body?.p_user_id);
    if (role) role.business_role = body.p_business_role;
    return { ok: true };
  };
  kho.rpc_set_user_active = (body) => {
    const account = accounts.find((row) => row.user_id === body?.p_user_id);
    if (account) account.tk_hoat_dong = body.p_active;
    return { ok: true };
  };
}

/** Nhân viên xưởng: ẩn hẳn 4 màn chỉ-admin theo payload server. */
function suaKhoNhanVienXuong(kho) {
  suaKhoAdmin(kho);
  kho.profiles = kho.profiles.map((p) => ({ ...p, role: "department_user" }));
  const goc = kho.rpc_my_ui_access;
  const screens = {};
  for (const [id, q] of Object.entries(goc.screens)) {
    screens[id] = MAN_CHI_ADMIN.includes(id)
      ? { can_view: false, scope: "none", actions: [] }
      : { ...q, actions: ["view"] };
  }
  kho.rpc_my_ui_access = { ...goc, business_role: "workshop_staff", screens };
}

function suaKhoUiAccessLoi(kho) {
  suaKhoAdmin(kho);
  kho.rpc_errors = { rpc_my_ui_access: { status: 500, message: "Không đọc được quyền giả lập" } };
}

function suaKhoViewerCuDaTat(kho) {
  suaKhoAdmin(kho);
  kho.profiles = kho.profiles.map((p) => ({ ...p, role: "viewer" }));
  kho.rpc_my_ui_access = {
    ...kho.rpc_my_ui_access,
    business_role: "viewer",
    unresolved_reason: "legacy_role_disabled",
    screens: { overview: { can_view: true, scope: "all", actions: ["view"] } },
  };
}

/** Quản lý QA theo ĐÚNG bảng quyền của server — dùng cho MỌI ca quản lý QA.
 *
 *  Bản trước có thêm một kho "qa_manager" chỉ hạ `profiles.role` mà vẫn để
 *  nguyên danh sách hành động đầy đủ của admin. Kho đó nói dối: nó chỉ bắt
 *  được lỗi ở những chỗ giao diện suy quyền từ `role`, và bỏ lọt sạch những
 *  chỗ hỏi `access.can` — đúng loại chỗ mà quyền thật sự được quyết. Đã bỏ.
 *
 *  Nguồn của bảng dưới đây:
 *  (VMP-noibo/supabase/migrations/20260812090000_six_business_roles_and_screen_access.sql):
 *  người, danh mục, workload, rules thì có; toàn bộ nhóm Quản trị và
 *  `accounts` thì KHÔNG. Mock cho họ đủ quyền như admin là mock nói dối, và
 *  bộ kiểm sẽ bỏ lọt đúng loại lỗi "hiện nút mà server từ chối". */
function suaKhoQaTheoLuatServer(kho, businessRole = "qa_manager") {
  suaKhoAdmin(kho);
  kho.profiles = kho.profiles.map((p) => ({ ...p, role: businessRole }));
  const goc = kho.rpc_my_ui_access;
  const screens = {};
  for (const [id, q] of Object.entries(goc.screens)) {
    if (id === "accounts" || MAN_CHI_ADMIN.includes(id)) {
      screens[id] = { can_view: false, scope: "none", actions: [] };
    } else if (id === "people") {
      screens[id] = { ...q, can_view: true, actions: ["view", "edit_operational_people"] };
    } else {
      screens[id] = { ...q, actions: (q.actions || []).filter((h) => h !== "manage_accounts"
        && h !== "manage_authorization_policy") };
    }
  }
  kho.rpc_my_ui_access = { ...goc, business_role: businessRole, screens };
}

function suaKhoQaStaffTheoLuatServer(kho) {
  suaKhoQaTheoLuatServer(kho, "qa_staff");
}

/** Mô phỏng server preview cũ cấp nhầm toàn bộ capability Admin cho QA.
 * Frontend vẫn phải khóa cứng nhóm Quản trị theo vai canonical. */
function suaKhoQaPreviewBiCapNham(kho) {
  suaKhoAdmin(kho);
  kho.rpc_my_ui_access = {
    ...kho.rpc_my_ui_access,
    mode: "preview",
    business_role: "qa_manager",
  };
}

/** Quản lý xưởng không được mở bất cứ hạng mục nào trong khu vực Quản trị. */
function suaKhoQuanLyXuongTheoLuatServer(kho) {
  suaKhoAdmin(kho);
  kho.profiles = kho.profiles.map((p) => ({ ...p, role: "department_user" }));
  const goc = kho.rpc_my_ui_access;
  const screens = {};
  for (const [id, q] of Object.entries(goc.screens)) {
    screens[id] = id === "accounts" || MAN_CHI_ADMIN.includes(id)
      ? { ...q, can_view: false, scope: "none", actions: [] }
      : { ...q, actions: ["view"] };
  }
  kho.rpc_my_ui_access = { ...goc, business_role: "workshop_manager", screens };
}

const EMAIL_AUTH_KHAC_HO_SO = "tai-khoan-auth@vi-du.test";
const EMAIL_CHUA_CO_TAI_KHOAN = "chua-co-tai-khoan@vi-du.test";

/** rpc_nguoi_va_quyen mô tả email hồ sơ người thực hiện, còn
 *  rpc_business_roles là nguồn email của TÀI KHOẢN Auth. Hai email được cố
 *  ý làm khác nhau để trạng thái allowlist không được ghép nhầm theo hồ sơ. */
function suaKhoAllowlistTheoEmailAuth(kho) {
  suaKhoAdmin(kho);
  kho.vmp_email_cho_phep = [
    { email: EMAIL_AUTH_KHAC_HO_SO, ghi_chu: "Tài khoản đã có nhưng hồ sơ dùng email khác", is_active: true },
    { email: EMAIL_CHUA_CO_TAI_KHOAN, ghi_chu: "Chưa tạo Auth user", is_active: true },
  ];
  kho.rpc_nguoi_va_quyen = {
    ok: true,
    tong_hang_muc: 0,
    nguoi: [{
      pid: "performer-khac-email", user_id: NGUOI_DUNG.id, ten: "Người có tài khoản",
      email: "ho-so-nguoi-thuc-hien@vi-du.test", bo_phan: "qa",
      bo_phan_nguoi: "qa", bo_phan_tai_khoan: "qa", vai: "admin",
      pham_vi_rieng: null, muc: null, co_tai_khoan: true, tk_hoat_dong: true,
      so_sua_duoc: 0, so_dung_ten: 0, so_phan_cong: 0,
    }],
  };
  kho.rpc_business_roles = {
    ok: true,
    nguoi: [{
      user_id: NGUOI_DUNG.id, email: EMAIL_AUTH_KHAC_HO_SO,
      business_role: "admin", unresolved_reason: null,
    }],
  };
}

async function moTrang(trinhDuyet, { hash = "today", rong = 1440, cao = 900, suaKho, doTre } = {}) {
  const trang = await trinhDuyet.newPage();
  const loiConsole = [];
  trang.on("console", (m) => {
    if (m.type() !== "error") return;
    const url = m.location()?.url || "";
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
    if (/net::ERR_|realtime|WebSocket/i.test(m.text())) return;
    loiConsole.push(`${m.text().slice(0, 90)} @ ${url.slice(0, 90)}`);
  });
  trang.on("pageerror", (e) => loiConsole.push(`pageerror: ${String(e.message).slice(0, 110)}`));

  /* Mọi trang trong cùng trình duyệt dùng CHUNG localStorage của một origin,
     nên hồ sơ người dùng mà ca trước lưu lại (vmp_monitor_user_v1) sẽ chảy
     sang ca sau: hạ vai xuống qa_manager trong kho giả lập mà web vẫn đọc
     "admin" từ cache và hiện đủ nút. Xoá cache trước mỗi ca để mỗi phép
     kiểm đứng một mình — rò rỉ trạng thái giữa các ca là loại lỗi khiến bộ
     kiểm xanh/đỏ theo thứ tự chạy, gần như không chẩn đoán nổi. */
  await trang.evaluateOnNewDocument(() => {
    try {
      localStorage.removeItem("vmp_monitor_user_v1");
      localStorage.removeItem("vmp_snapshot_v2");
    } catch { /* trình duyệt chặn localStorage thì cũng chẳng có cache nào */ }
  });

  /* Puppeteer treo cả trang nếu window.prompt/confirm mở ra mà không ai
     xử lý. Kế hoạch được set trước mỗi lần bấm nút mở hộp thoại; mặc định
     (không có kế hoạch) là dismiss để không bao giờ treo im lặng. */
  let ke = null;
  const datKeHoach = (k) => { ke = k; };
  trang.on("dialog", async (dialog) => {
    const k = ke; ke = null;
    try {
      if (k && k.accept) await dialog.accept(k.text ?? "");
      else await dialog.dismiss();
    } catch { /* trang đã đóng hoặc dialog đã tự mất — bỏ qua */ }
  });

  const goiRpc = {};
  trang.on("request", (req) => {
    if (req.method() === "OPTIONS") return; // preflight CORS, không phải lời gọi thật
    const m = req.url().match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/i);
    if (!m) return;
    const ten = m[1];
    (goiRpc[ten] ||= []).push(req);
  });

  const { chanNgoai } = await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day", suaKho, doTre });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: rong, height: cao });
  await trang.goto(`${GOC}#v=${hash}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await cho(2200);
  return { trang, loiConsole, chanNgoai, goiRpc, datKeHoach };
}

const trinhDuyet = await puppeteer.launch({
  executablePath: CHROME, headless: "new", args: ["--no-sandbox"],
});

/* ---- 1. Admin: thấy 4 màn chỉ-admin trên nav ------------------------ */
{
  console.log("Admin — màn chỉ-admin trên nav:");
  const { trang, loiConsole } = await moTrang(trinhDuyet, { suaKho: suaKhoAdmin });

  const kq = await trang.evaluate((ids) => {
    const co = {};
    for (const id of ids) co[id] = !!document.querySelector(`[data-view="${id}"]`);
    return co;
  }, MAN_CHI_ADMIN);

  for (const id of MAN_CHI_ADMIN) {
    kiem(kq[id], `admin thấy mục nav "${id}"`);
  }
  kiem(loiConsole.length === 0, "console sạch (admin)", loiConsole[0] || "");
  await trang.close();
}

/* ---- 1b. Link cũ #v=accounts không được rơi vào trang trắng ---------- *
 *  Màn "Tài khoản & quyền truy cập" đã gộp vào "Vai trò & phạm vi". Ai đang
 *  lưu dấu trang link cũ phải được đưa sang màn mới, không phải nhìn một
 *  trang trắng và tưởng web hỏng.
 * --------------------------------------------------------------------- */
{
  console.log("\nLink cũ #v=accounts chuyển sang Vai trò & phạm vi:");
  const { trang, loiConsole } = await moTrang(trinhDuyet,
    { suaKho: suaKhoAdmin, hash: "accounts" });
  await cho(1200);
  const kq = await trang.evaluate(() => ({
    hash: location.hash,
    coNoiDung: document.body.innerText.length > 200,
    // Dấu hiệu đang ở đúng màn Vai trò & phạm vi.
    thayDanhBa: document.body.innerText.includes("Danh bạ chuẩn")
      || document.body.innerText.includes("Tài khoản & quyền"),
    khongCoMucNav: !document.querySelector('[data-view="accounts"]'),
  }));
  kiem(kq.hash.includes("phanquyen"), "hash đổi sang #v=phanquyen", kq.hash || "(rỗng)");
  kiem(kq.coNoiDung, "không phải trang trắng");
  kiem(kq.thayDanhBa, "hiện đúng nội dung màn Vai trò & phạm vi");
  kiem(kq.khongCoMucNav, "menu không còn mục Tài khoản & quyền truy cập");
  kiem(loiConsole.length === 0, "console sạch khi đi qua link cũ", loiConsole[0] || "");
  await trang.close();
}

/* ---- 2. Nhân viên xưởng: không thấy màn chỉ-admin -------------------- */
{
  console.log("\nNhân viên xưởng — không thấy màn chỉ-admin:");
  const { trang } = await moTrang(trinhDuyet, { suaKho: suaKhoNhanVienXuong });

  const kq = await trang.evaluate((ids) => {
    const co = {};
    for (const id of ids) co[id] = !!document.querySelector(`[data-view="${id}"]`);
    // Một mục KHÔNG chỉ-admin, để chắc menu không biến mất toàn bộ.
    // (không phải toàn bộ nav biến mất vì lỗi).
    co._today = !!document.querySelector('[data-view="today"]');
    return co;
  }, MAN_CHI_ADMIN);

  for (const id of MAN_CHI_ADMIN) {
    kiem(!kq[id], `nhân viên xưởng KHÔNG thấy mục nav "${id}"`);
  }
  kiem(kq._today, "nhân viên xưởng vẫn thấy mục nav thường (today) — menu không vỡ toàn bộ");
  await trang.close();
}

/* ---- 2b. RPC quyền lỗi: không có Layout/menu/page bảo vệ ------------- */
{
  console.log("\nQuản lý QA — deep-link bốn mục Quản trị đều rơi về Việc hôm nay:");
  for (const id of MAN_CHI_ADMIN) {
    const { trang } = await moTrang(trinhDuyet,
      { suaKho: suaKhoQaTheoLuatServer, hash: id });
    await trang.waitForFunction(() =>
      document.querySelector("h1")?.textContent?.includes("Việc hôm nay"),
    { timeout: 10_000 });
    const biChan = await trang.evaluate((view) => ({
      khongCoNav: !document.querySelector(`[data-view="${view}"]`),
      oToday: document.querySelector("h1")?.textContent?.includes("Việc hôm nay") === true,
    }), id);
    kiem(biChan.khongCoNav && biChan.oToday,
      `quản lý QA không thể mở trực tiếp mục Quản trị "${id}"`);
    await trang.close();
  }
}

/* ---- 2c. RPC quyền lỗi: không có Layout/menu/page bảo vệ ------------- */
{
  console.log("\nQuản lý QA — preview cấp nhầm vẫn không dựng Chất lượng dữ liệu:");
  const { trang, goiRpc } = await moTrang(trinhDuyet,
    { suaKho: suaKhoQaPreviewBiCapNham, hash: "health" });
  const kq = await trang.evaluate(() => ({
    oToday: document.querySelector("h1")?.textContent?.includes("Việc hôm nay") === true,
    coHealth: !!document.querySelector('[data-view="health"]'),
    coNutTinhLai: [...document.querySelectorAll("button")]
      .some((button) => button.textContent.includes("Tính lại trạng thái")),
  }));
  const rpcHealth = ["rpc_dashboard_kpi", "rpc_check_data_quality", "rpc_due_alerts",
    "rpc_refresh_computed_status"];
  kiem(kq.oToday && !kq.coHealth && !kq.coNutTinhLai,
    "preview không nới quyền Quản trị cho Quản lý QA");
  kiem(!rpcHealth.some((name) => (goiRpc[name] || []).length > 0),
    "deep-link bị chặn không gọi RPC của Chất lượng dữ liệu");
  await trang.close();
}

/* ---- 2d. RPC quyền lỗi: không có Layout/menu/page bảo vệ ------------- */
for (const [ten, suaKho] of [
  ["RPC quyền lỗi", suaKhoUiAccessLoi],
  ["Viewer cũ bị vô hiệu", suaKhoViewerCuDaTat],
]) {
  console.log(`\n${ten} — fail closed:`);
  const { trang } = await moTrang(trinhDuyet, { suaKho });
  const kq = await trang.evaluate(() => ({
    state: document.querySelector("[data-access-state]")?.getAttribute("data-access-state"),
    coSidebar: !!document.querySelector(".vmp-sidebar"),
    coMenu: document.querySelectorAll("[data-view]").length,
    coTrangBaoVe: !!document.querySelector(".vmp-view-enter"),
    coThuLai: document.body.innerText.includes("Thử lại"),
    coThoat: document.body.innerText.includes("Thoát tài khoản"),
  }));
  kiem(kq.state === "error", `${ten}: hiện trạng thái lỗi xác minh`, kq.state || "(trống)");
  kiem(!kq.coSidebar && kq.coMenu === 0 && !kq.coTrangBaoVe,
    `${ten}: không dựng Layout/menu/nội dung bảo vệ`);
  kiem(kq.coThuLai && kq.coThoat, `${ten}: còn nút Thử lại và Thoát tài khoản`);
  await trang.close();
}

/* ---- 3. Cấu hình hệ thống không còn bảng đổi vai trùng lặp ---------- */
{
  console.log("\nCấu hình hệ thống — không còn quản trị vai trùng lặp:");
  const { trang } = await moTrang(trinhDuyet, { suaKho: suaKhoRolePanel, hash: "admin" });
  const kq = await trang.evaluate(() => ({
    coBangCu: document.body.innerText.includes("Người dùng & phân quyền"),
    coSelectCu: !!document.querySelector('select[aria-label^="Vai của "]'),
  }));
  kiem(!kq.coBangCu, "đã bỏ thẻ Người dùng & phân quyền khỏi Cấu hình hệ thống");
  kiem(!kq.coSelectCu, "Cấu hình hệ thống không còn select đổi vai cũ");
  await trang.close();
}

/* ---- 4. Vai trò & phạm vi: draft/Huỷ không ghi, Lưu đúng UUID ------- */
{
  console.log("\nVai trò & phạm vi — đổi vai bằng UUID dù trùng email:");
  const { trang, goiRpc, chanNgoai, loiConsole } = await moTrang(trinhDuyet,
    { suaKho: suaKhoRolePanel, hash: "phanquyen" });
  const articleB = 'article[aria-label="Người B"]';
  await trang.waitForSelector(articleB, { timeout: 10_000 });

  await trang.evaluate((selector) => {
    [...document.querySelectorAll(`${selector} button`)]
      .find((button) => button.textContent.trim() === "Sửa vai")?.click();
  }, articleB);
  await trang.waitForSelector('select[aria-label="Vai nghiệp vụ mới"]');
  await trang.select('select[aria-label="Vai nghiệp vụ mới"]', "qa_manager");
  await cho(150);
  kiem((goiRpc.rpc_set_business_role || []).length === 0,
    "chọn vai mới chỉ tạo bản nháp, chưa gọi RPC");
  await trang.evaluate(() => {
    const editor = document.querySelector('section[aria-labelledby="account-role-editor-title"]');
    [...(editor?.querySelectorAll("button") || [])]
      .find((button) => button.textContent.trim() === "Hủy")?.click();
  });
  await cho(150);
  kiem((goiRpc.rpc_set_business_role || []).length === 0,
    "Hủy bản nháp không gọi rpc_set_business_role");

  await trang.select('select[aria-label="Vai nghiệp vụ mới"]', "qa_manager");
  await trang.type('textarea[aria-label="Lý do đổi vai"]', "Điều chuyển E2E theo UUID");
  await trang.evaluate(() => {
    const editor = document.querySelector('section[aria-labelledby="account-role-editor-title"]');
    [...(editor?.querySelectorAll("button") || [])]
      .find((button) => button.textContent.trim() === "Lưu thay đổi")?.click();
  });
  await cho(900);

  const calls = goiRpc.rpc_set_business_role || [];
  kiem(calls.length === 1, "đổi vai gọi RPC đúng một lần", `${calls.length} lần`);
  if (calls[0]) {
    const body = JSON.parse(calls[0].postData() || "null");
    kiem(body?.p_user_id === USER_B, "đổi đúng UUID Người B dù email trùng", body?.p_user_id);
    kiem(body?.p_business_role === "qa_manager", "vai mới đúng qa_manager", body?.p_business_role);
    kiem(body?.p_reason === "Điều chuyển E2E theo UUID", "lý do được gửi đúng", body?.p_reason);
  }
  kiem(chanNgoai.length === 0, "ca đổi vai không có request thoát giả lập", chanNgoai[0] || "");
  kiem(loiConsole.length === 0, "console sạch khi đổi vai", loiConsole[0] || "");
  await trang.close();
}

/* ---- 4b. Bật/tắt: Hủy không ghi, bấm nhanh vẫn đúng một UUID -------- */
{
  console.log("\nVai trò & phạm vi — tắt tài khoản đúng một lần bằng UUID:");
  const { trang, goiRpc, chanNgoai, loiConsole } = await moTrang(trinhDuyet, {
    suaKho: suaKhoRolePanel,
    hash: "phanquyen",
    doTre: { rpc_set_user_active: 450 },
  });
  const articleB = 'article[aria-label="Người B"]';
  await trang.waitForSelector(articleB, { timeout: 10_000 });
  const moDialog = () => trang.evaluate((selector) => {
    [...document.querySelectorAll(`${selector} button`)]
      .find((button) => button.textContent.trim() === "Tắt")?.click();
  }, articleB);

  await moDialog();
  await trang.waitForSelector('textarea[aria-label="Lý do đổi trạng thái"]');
  await trang.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Đổi trạng thái tài khoản"]');
    [...(dialog?.querySelectorAll("button") || [])]
      .find((button) => button.textContent.trim() === "Hủy")?.click();
  });
  kiem((goiRpc.rpc_set_user_active || []).length === 0,
    "Hủy trước xác nhận không gọi rpc_set_user_active");

  await moDialog();
  await trang.type('textarea[aria-label="Lý do đổi trạng thái"]', "Tạm khóa E2E theo UUID");
  await trang.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Đổi trạng thái tài khoản"]');
    const button = [...(dialog?.querySelectorAll("button") || [])]
      .find((candidate) => candidate.textContent.trim() === "Xác nhận");
    button?.click();
    button?.click();
  });
  await cho(1200);

  const calls = goiRpc.rpc_set_user_active || [];
  kiem(calls.length === 1, "bấm xác nhận nhanh vẫn gọi active RPC đúng một lần", `${calls.length} lần`);
  if (calls[0]) {
    const body = JSON.parse(calls[0].postData() || "null");
    kiem(body?.p_user_id === USER_B, "tắt đúng UUID Người B dù email trùng", body?.p_user_id);
    kiem(body?.p_active === false, "trạng thái đích là tắt", JSON.stringify(body));
    kiem(body?.p_reason === "Tạm khóa E2E theo UUID", "lý do tắt được gửi đúng", body?.p_reason);
  }
  kiem(chanNgoai.length === 0, "ca tắt tài khoản không có request thoát giả lập", chanNgoai[0] || "");
  kiem(loiConsole.length === 0, "console sạch khi tắt tài khoản", loiConsole[0] || "");
  await trang.close();
}

/* ---- 5. Thẻ "Chế độ áp dụng quyền theo hạng mục" ở Vai trò & phạm vi - */
{
  console.log("\nVai trò & phạm vi — thẻ chế độ áp dụng quyền theo hạng mục:");
  const { trang } = await moTrang(trinhDuyet, { suaKho: suaKhoAdmin, hash: "phanquyen" });
  await cho(900); // fetchPermissionPreflight() là async riêng, cần thêm thời gian tải

  const banDau = await trang.evaluate(() => {
    const h2 = document.getElementById("ipm-tieu-de");
    const nut = [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Bật áp dụng quyền thật");
    return { coThe: !!h2, tieuDe: h2?.textContent.trim() || "", coNut: !!nut, khoa: nut?.disabled ?? null };
  });
  kiem(banDau.coThe, "admin thấy thẻ Chế độ áp dụng quyền theo hạng mục");
  kiem(banDau.tieuDe === "Chế độ áp dụng quyền theo hạng mục", "đúng tiêu đề thẻ", banDau.tieuDe);
  kiem(banDau.coNut, "có nút 'Bật áp dụng quyền thật'");
  kiem(banDau.khoa === true, "nút bị khoá khi chưa nhập lý do và chưa gõ chữ xác nhận",
    String(banDau.khoa));

  /* Nhập lý do và chữ xác nhận — mở khoá. */
  await trang.evaluate(() => {
    const inputs = [...document.querySelectorAll(".ip-form.is-compact input.pq-o")];
    const set = (el, v) => {
      const dat = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      dat.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    if (inputs[0]) set(inputs[0], "Bật quyền theo hạng mục để kiểm tra tự động");
    if (inputs[1]) set(inputs[1], "AP DUNG");
  });
  await cho(300);
  const sauKhiDien = await trang.evaluate(() => {
    const nut = [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Bật áp dụng quyền thật");
    return { khoa: nut?.disabled ?? null };
  });
  kiem(sauKhiDien.khoa === false, "nhập đủ lý do + chữ xác nhận thì mở khoá nút",
    String(sauKhiDien.khoa));
  await trang.close();
}

/* ---- 6. "Tính lại trạng thái" chỉ hiện với vai nghiệp vụ admin ------- */
{
  console.log("\nChất lượng dữ liệu → Kiểm tra trên máy chủ — nút Tính lại trạng thái:");

  // 6a. Admin: thấy nút.
  const a = await moTrang(trinhDuyet, { suaKho: suaKhoAdmin, hash: "health" });
  await a.trang.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.includes("Kiểm tra trên máy chủ"))?.click();
  });
  await cho(900);
  const coNutAdmin = await a.trang.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Tính lại trạng thái")));
  kiem(coNutAdmin, "admin thấy nút Tính lại trạng thái ở tab Kiểm tra trên máy chủ");
  await a.trang.close();

  // 6b. Quản lý QA bị chặn cả màn, nên không thể dựng nút ghi.
  const b = await moTrang(trinhDuyet, { suaKho: suaKhoQaTheoLuatServer, hash: "health" });
  const moDuocMan = await b.trang.evaluate(() => !!document.querySelector('[data-view="health"]'));
  const coNutQaManager = await b.trang.evaluate(() =>
    [...document.querySelectorAll("button")].some((btn) => btn.textContent.includes("Tính lại trạng thái")));
  kiem(!moDuocMan, "quản lý QA không thấy mục Chất lượng dữ liệu");
  kiem(!coNutQaManager, "quản lý QA không dựng nút Tính lại trạng thái");
  await b.trang.close();
}

/* ---- 7. Quản lý QA KHÔNG thấy lối đổi vai / tắt tài khoản ----------- *
 *  `isAdmin` của web nghĩa là "admin HOẶC quản lý QA" (permMap), nên gate
 *  bằng nó là hiện nút cho người mà máy chủ chắc chắn từ chối. Hai phép
 *  kiểm dưới đây chặn việc đó quay lại.
 * --------------------------------------------------------------------- */
{
  console.log("\nCấu hình hệ thống — quản lý QA không có lối đổi vai:");

  const { trang, loiConsole } = await moTrang(trinhDuyet,
    { suaKho: suaKhoQaTheoLuatServer, hash: "admin" });
  await cho(900);

  const kq = await trang.evaluate(() => {
    const chu = document.body.innerText;
    return {
      coBangNguoiDung: /Người dùng .* phân quyền/.test(chu) || chu.includes("Người dùng"),
      coODoiVai: !!document.querySelector('select[aria-label^="Vai của "]'),
      coNutTat: [...document.querySelectorAll("button")]
        .some((b) => ["Tắt", "Bật lại"].includes(b.textContent.trim())),
      coCotThaoTac: [...document.querySelectorAll("th")]
        .some((th) => th.textContent.trim() === "Thao tác"),
      noiRoViSao: chu.includes("không đổi được vai hay bật/tắt tài khoản"),
    };
  });

  /* Theo bảng quyền của server, quản lý QA KHÔNG có screen `admin` — nên
     đúng đắn nhất là họ không vào được màn này. Ba phép kiểm dưới đây là
     lưới an toàn hai lớp: dù có lọt vào (gõ thẳng URL ở chế độ đối chiếu,
     hoặc server đổi luật), giao diện vẫn không được hiện lối đổi vai. */
  kiem(!kq.coODoiVai, "quản lý QA KHÔNG thấy ô đổi vai");
  kiem(!kq.coNutTat, "quản lý QA KHÔNG thấy nút Tắt / Bật lại");
  kiem(!kq.coCotThaoTac, "bảng không hiện cột Thao tác rỗng cho quản lý QA");
  kiem(loiConsole.length === 0, "không lỗi console", loiConsole.join(" · ").slice(0, 160));
  await trang.close();
}

/* ---- 8. Quản trị quyền phải SỬA ĐƯỢC TRÊN WEB ----------------------- *
 *  Hai thẻ "Ai được phép có tài khoản" và "Vai nào xem được gì, sửa được
 *  gì" từng nằm trong khối bị tắt bằng cờ `SHOW_LEGACY_PERMISSION_WORKSPACE
 *  = false` — tồn tại trong mã nguồn mà không ai mở được, nên việc chỉnh
 *  quyền phải làm bằng SQL tay. Phép kiểm này chặn chúng biến mất lần nữa.
 * --------------------------------------------------------------------- */
{
  console.log("\nVai trò & phạm vi — quản trị quyền sửa được ngay trên web:");

  const a = await moTrang(trinhDuyet, { suaKho: suaKhoAdmin, hash: "phanquyen" });
  await cho(1400);
  const admin = await a.trang.evaluate(() => {
    const chu = document.body.innerText;
    return {
      coEmail: chu.includes("Ai được phép có tài khoản"),
      coMaTranCu: chu.includes("Vai nào xem được gì, sửa được gì")
        || chu.includes("tích ở đây là đổi quyền thật"),
      coMaTranMoi: chu.includes("Màn hình bạn được xem"),
      huongDanDungBaBuoc: chu.includes("Sẵn sàng theo vai trò & phạm vi"),
    };
  });
  kiem(admin.coEmail, "admin thấy thẻ Ai được phép có tài khoản");
  /* Ma trận 4 vai cũ đã XOÁ. Thứ thay nó là ma trận năm vai hiệu lực
     "Màn hình bạn được xem", đọc từ rpc_my_ui_access. */
  kiem(!admin.coMaTranCu, "không còn ma trận 4 vai của hệ cũ");
  kiem(admin.coMaTranMoi, "admin thấy ma trận năm vai Màn hình bạn được xem");
  kiem(admin.huongDanDungBaBuoc, "hướng dẫn thêm người trỏ đúng sang thẻ sẵn sàng vai trò");
  await a.trang.close();

  /* QA không có bất cứ workspace quản trị nào. Dùng deep-link để chặn cả
     trường hợp menu đã ẩn nhưng component vẫn mount theo hash cũ. */
  for (const [ten, suaKho] of [
    ["quản lý QA", suaKhoQaTheoLuatServer],
    ["nhân viên QA", suaKhoQaStaffTheoLuatServer],
  ]) {
    const b = await moTrang(trinhDuyet, { suaKho, hash: "phanquyen" });
    const qa = await b.trang.evaluate(() => {
      const chu = document.body.innerText;
      return {
        sanSang: chu.includes("Sẵn sàng theo vai trò & phạm vi"),
        taiKhoan: chu.includes("Tài khoản & quyền"),
        danhBa: !!document.getElementById("ip-directory-title"),
      };
    });
    kiem(!qa.sanSang, `${ten} deep-link không mount khối Sẵn sàng theo vai trò & phạm vi`);
    kiem(!qa.taiKhoan, `${ten} deep-link không mount khối Tài khoản & quyền`);
    kiem(!qa.danhBa, `${ten} deep-link không mount khối Danh bạ chuẩn`);
    await b.trang.close();
  }
}

/* ---- 8b. Quản lý xưởng không được mở khu vực Quản trị -------------- */
{
  console.log("\nQuản lý xưởng — không thấy khu vực Quản trị:");
  const { trang, loiConsole } = await moTrang(trinhDuyet,
    { suaKho: suaKhoQuanLyXuongTheoLuatServer, hash: "phanquyen" });
  await trang.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Việc hôm nay"),
    { timeout: 10_000 });
  const kq = await trang.evaluate(() => {
    const chu = document.body.innerText;
    return {
      workspace: chu.includes("Phân công theo hạng mục"),
      danhBaPhanCong: !!document.getElementById("ip-directory-title"),
      sanSang: chu.includes("Sẵn sàng theo vai trò & phạm vi"),
      taiKhoan: chu.includes("Tài khoản & quyền"),
    };
  });
  kiem(!kq.workspace && !kq.danhBaPhanCong,
    "quản lý xưởng không dựng workspace hay tải danh bạ Quản trị");
  kiem(!kq.sanSang && !kq.taiKhoan,
    "workspace xưởng không dựng khối quản trị tài khoản");
  kiem(loiConsole.length === 0, "console sạch khi chặn Quản lý xưởng", loiConsole[0] || "");
  await trang.close();
}

/* ---- 8c. Allowlist đối chiếu email tài khoản Auth, không email hồ sơ -- */
{
  console.log("\nAllowlist — trạng thái tài khoản theo email Auth:");
  const { trang } = await moTrang(trinhDuyet,
    { suaKho: suaKhoAllowlistTheoEmailAuth, hash: "phanquyen" });
  await trang.waitForFunction((coTaiKhoan, chuaCoTaiKhoan) =>
    document.body.innerText.includes(coTaiKhoan) && document.body.innerText.includes(chuaCoTaiKhoan),
  { timeout: 10_000 }, EMAIL_AUTH_KHAC_HO_SO, EMAIL_CHUA_CO_TAI_KHOAN);
  const trangThai = await trang.evaluate((emails) => Object.fromEntries(
    [...document.querySelectorAll("tr")].flatMap((tr) => {
      const cells = [...tr.querySelectorAll("td")].map((td) => td.textContent?.replace(/\s+/g, " ").trim() || "");
      return emails.includes(cells[0]) ? [[cells[0], cells[3] || ""]] : [];
    }),
  ), [EMAIL_AUTH_KHAC_HO_SO, EMAIL_CHUA_CO_TAI_KHOAN]);
  kiem(trangThai[EMAIL_AUTH_KHAC_HO_SO] === "rồi",
    "email Auth đã có account khác email performer vẫn báo rồi", trangThai[EMAIL_AUTH_KHAC_HO_SO]);
  kiem(trangThai[EMAIL_CHUA_CO_TAI_KHOAN].startsWith("chưa"),
    "email allowlist chưa có account báo chưa", trangThai[EMAIL_CHUA_CO_TAI_KHOAN]);
  await trang.close();
}

/* ---- 9. Grant people lịch sử không mở lại page Nhân sự -------------- */
{
  console.log("\nNhân sự đã gỡ — quản lý QA theo luật server vẫn rơi về today:");
  // Fixture này cố ý còn cấp people/edit_operational_people từ server.
  const { trang } = await moTrang(trinhDuyet, { suaKho: suaKhoQaTheoLuatServer, hash: "people" });
  await cho(1400);
  const kq = await trang.evaluate(() => ({
    tieuDe: document.querySelector("h1")?.textContent?.trim() || "",
    coMenuNhanSu: !!document.querySelector('[data-view="people"]'),
    coEditorCu: !!document.querySelector('input[aria-label="Họ và tên trong danh bạ"]'),
    coNutLuuCu: [...document.querySelectorAll("button")]
      .some((b) => /Lưu hồ sơ|Thêm vào danh bạ/.test(b.textContent || "")),
  }));
  kiem(kq.tieuDe === "Việc hôm nay", "#v=people của quản lý QA rơi về today", kq.tieuDe);
  kiem(!kq.coMenuNhanSu, "grant people lịch sử không hiện lại menu Nhân sự");
  kiem(!kq.coEditorCu && !kq.coNutLuuCu,
    "fallback không dựng editor hay nút lưu hồ sơ Nhân sự cũ");
  await trang.close();
}

/* ---- 9b. Xem trước ảnh hưởng trước khi bật quyền theo hạng mục ------- *
 *  Bật `enforced` là cú bấm khó lùi: ai không được phân công sẽ mất quyền
 *  xem ngay. Khối "Xem trước ảnh hưởng" phải có mặt và phải CHỈ đo khi
 *  người dùng bấm — tự nã một loạt RPC mỗi lần mở màn là cách chắc chắn
 *  làm màn Phân quyền chậm và người dùng tránh dùng nó.
 * --------------------------------------------------------------------- */
{
  console.log("\nCông tắc quyền — có xem trước ảnh hưởng:");
  const { trang } = await moTrang(trinhDuyet, { suaKho: suaKhoAdmin, hash: "phanquyen" });
  await cho(1600);

  const kq = await trang.evaluate(() => {
    const nut = [...document.querySelectorAll("button")]
      .find((b) => /Xem trước ảnh hưởng/.test(b.textContent || ""));
    return {
      coNut: !!nut,
      // Chưa bấm thì chưa có bảng nào — dấu hiệu nó không tự chạy.
      chuaCoBang: !document.body.innerText.includes("Hạng mục xem được"),
    };
  });
  kiem(kq.coNut, "có nút Xem trước ảnh hưởng khi bật");
  kiem(kq.chuaCoBang, "chưa bấm thì chưa đo — không tự nã RPC lúc mở màn");
  await trang.close();
}

/* ---- 10. Nhóm "Tài khoản & quyền truy cập" sau khi gộp --------------- *
 *  Màn cũ đã gộp vào Vai trò & phạm vi. Hai thứ nó mang theo — nối/gỡ tài
 *  khoản và ma trận quyền màn hình — phải còn nguyên với Admin. Các ca
 *  QA deep-link không mount workspace được kiểm riêng ở 8.
 * --------------------------------------------------------------------- */
{
  console.log("\nTài khoản & quyền truy cập (đã gộp) — còn đủ và đúng người:");

  /* Panel "Nối tài khoản" chỉ dựng khi ĐÃ CHỌN một người
     (AccountLinkPanel.tsx:109) — nó cần hồ sơ để nói đang nối cho ai. Phải
     chọn người trước rồi mới kiểm, nếu không phép kiểm đỏ oan. */
  const chonMotNguoi = async (trang) => {
    await trang.evaluate(() => {
      const o = document.querySelector('input[aria-label="Tìm tên hoặc tài khoản"]');
      if (!o) return;
      const dat = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      dat.call(o, "Ng");                      // ≥2 ký tự mới kích hoạt tìm
      o.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await cho(1200);
    return trang.evaluate(() => {
      const nut = document.querySelector("#ip-directory-results button");
      if (!nut) return false;
      nut.click();
      return true;
    });
  };

  const a = await moTrang(trinhDuyet, { suaKho: suaKhoAdmin, hash: "phanquyen" });
  await cho(1500);
  const chonDuoc = await chonMotNguoi(a.trang);
  await cho(1200);
  kiem(chonDuoc, "chọn được một người trong danh bạ để thao tác");
  const admin = await a.trang.evaluate(() => {
    const chu = document.body.innerText;
    return {
      coNoiTaiKhoan: chu.includes("Nối tài khoản"),
      coMaTranManHinh: chu.includes("Màn hình bạn được xem"),
      coQuyenHieuLuc: chu.includes("Quyền") && chu.includes("hiệu lực"),
    };
  });
  kiem(admin.coNoiTaiKhoan, "admin vẫn nối/gỡ được tài khoản sau khi gộp màn");
  kiem(admin.coMaTranManHinh, "ma trận Màn hình bạn được xem theo sang màn mới");
  kiem(admin.coQuyenHieuLuc, "vẫn xem được quyền đang có hiệu lực của người được chọn");
  await a.trang.close();

}

await trinhDuyet.close();

console.log(`\n${"─".repeat(52)}`);
console.log(`${soDat} đạt · ${soHong} hỏng`);
if (soHong > 0) { console.error("KHÔNG ĐẠT."); process.exit(1); }
console.log("ĐẠT.");

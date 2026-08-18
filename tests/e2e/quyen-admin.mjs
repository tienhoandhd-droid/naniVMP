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
 *   1. Admin thấy 4 màn chỉ-admin trên thanh điều hướng.
 *   2. Vai không phải admin (viewer) không thấy 4 màn đó.
 *   3. Cấu hình hệ thống: có bảng người dùng, ô đổi vai, nút Tắt/Bật lại;
 *      bấm Huỷ ở hộp hỏi lý do thì KHÔNG gọi rpc_set_business_role.
 *   4. Đổi vai có nhập lý do: gọi rpc_set_business_role đúng 1 lần, đúng
 *      tham số vai mới.
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
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien, NGUOI_DUNG } from "./gia-lap-supabase.mjs";

const GOC = process.env.VMP_E2E_URL || "http://127.0.0.1:4173/";

const URL_SB = (() => {
  const noi = readFileSync(new URL("../../.env.local", import.meta.url).pathname, "utf8");
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
const MAN_CHI_ADMIN = ["health", "audit", "admin"];

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

/** Vai KHÔNG phải admin: ẩn hẳn 4 màn chỉ-admin trên rpc_my_ui_access, và
 *  hạ luôn profiles.role để user.perm/isAdmin phía client cũng khớp —
 *  không để hai nguồn quyền lệch nhau trong chính bộ kiểm. */
function suaKhoViewer(kho) {
  suaKhoAdmin(kho);
  kho.profiles = kho.profiles.map((p) => ({ ...p, role: "viewer" }));
  const goc = kho.rpc_my_ui_access;
  const screens = {};
  for (const [id, q] of Object.entries(goc.screens)) {
    screens[id] = MAN_CHI_ADMIN.includes(id)
      ? { can_view: false, scope: "none", actions: [] }
      : { ...q, actions: ["view"] };
  }
  kho.rpc_my_ui_access = { ...goc, business_role: "viewer", screens };
}

/** Vai nghiệp vụ qa_manager: THẤY được màn Chất lượng dữ liệu (không nằm
 *  trong bốn màn chỉ-admin theo access.ts thật — nhưng business_role đổi
 *  để kiểm riêng luật "nút Tính lại trạng thái chỉ hiện với admin", tách
 *  bạch với luật "thấy được màn". */
function suaKhoQaManager(kho) {
  suaKhoAdmin(kho);
  const goc = kho.rpc_my_ui_access;
  kho.rpc_my_ui_access = { ...goc, business_role: "qa_manager" };
}


/** Quản lý QA khi server CHƯA có `rpc_my_ui_access` — web rơi về luật dự
 *  phòng `legacyAccessContext`. Đó là luật đang chạy ở chế độ dự thảo. */
function suaKhoQaKhongCoUiAccess(kho) {
  suaKhoAdmin(kho);
  kho.profiles = kho.profiles.map((p) => ({ ...p, role: "qa_manager" }));
  delete kho.rpc_my_ui_access;
}

/** Quản lý QA khi server CÓ cấp `edit_operational_people`. Ca này chứng
 *  minh giao diện đã sẵn sàng: mọi thứ chỉ còn chờ luật ở server. */
function suaKhoQaDuocSuaNhanSu(kho) {
  suaKhoAdmin(kho);
  kho.profiles = kho.profiles.map((p) => ({ ...p, role: "qa_manager" }));
  const goc = kho.rpc_my_ui_access;
  const screens = {};
  for (const [id, q] of Object.entries(goc.screens)) {
    screens[id] = id === "people"
      ? { ...q, can_view: true, actions: ["view", "edit_operational_people"] }
      : q;
  }
  kho.rpc_my_ui_access = { ...goc, business_role: "qa_manager", screens };
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
 *  người, danh mục, workload, rules, health, audit thì có; `accounts` và
 *  `admin` thì KHÔNG. Mock cho họ đủ quyền như admin là mock nói dối, và
 *  bộ kiểm sẽ bỏ lọt đúng loại lỗi "hiện nút mà server từ chối". */
function suaKhoQaTheoLuatServer(kho) {
  suaKhoAdmin(kho);
  kho.profiles = kho.profiles.map((p) => ({ ...p, role: "qa_manager" }));
  const goc = kho.rpc_my_ui_access;
  const screens = {};
  for (const [id, q] of Object.entries(goc.screens)) {
    if (id === "accounts" || id === "admin") {
      screens[id] = { can_view: false, scope: "none", actions: [] };
    } else if (id === "people") {
      screens[id] = { ...q, can_view: true, actions: ["view", "edit_operational_people"] };
    } else if (id === "phanquyen") {
      // Server khai đây là CỬA VÀO: xem được nhưng không có hành động riêng.
      screens[id] = { can_view: true, scope: "none", actions: [] };
    } else {
      screens[id] = { ...q, actions: (q.actions || []).filter((h) => h !== "manage_accounts"
        && h !== "manage_authorization_policy") };
    }
  }
  kho.rpc_my_ui_access = { ...goc, business_role: "qa_manager", screens };
}

async function moTrang(trinhDuyet, { hash = "today", rong = 1440, cao = 900, suaKho } = {}) {
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

  const { chanNgoai } = await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day", suaKho });
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

/* ---- 2. Viewer: không thấy màn chỉ-admin ----------------------------- */
{
  console.log("\nViewer — không thấy màn chỉ-admin:");
  const { trang } = await moTrang(trinhDuyet, { suaKho: suaKhoViewer });

  const kq = await trang.evaluate((ids) => {
    const co = {};
    for (const id of ids) co[id] = !!document.querySelector(`[data-view="${id}"]`);
    // Một mục KHÔNG chỉ-admin, để chắc là viewer vẫn thấy menu nói chung
    // (không phải toàn bộ nav biến mất vì lỗi).
    co._today = !!document.querySelector('[data-view="today"]');
    return co;
  }, MAN_CHI_ADMIN);

  for (const id of MAN_CHI_ADMIN) {
    kiem(!kq[id], `viewer KHÔNG thấy mục nav "${id}"`);
  }
  kiem(kq._today, "viewer vẫn thấy mục nav thường (today) — menu không vỡ toàn bộ");
  await trang.close();
}

/* ---- 3. Cấu hình hệ thống: bảng người dùng, ô đổi vai, nút Tắt ------- */
{
  console.log("\nCấu hình hệ thống — bảng người dùng và nút:");
  const { trang } = await moTrang(trinhDuyet, { suaKho: suaKhoAdmin, hash: "admin" });

  const kq = await trang.evaluate(() => {
    const trs = document.querySelectorAll("table tbody tr");
    const select = document.querySelector('select[aria-label^="Vai của "]');
    const nutTat = [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Tắt" || b.textContent.trim() === "Bật lại");
    return {
      coBang: trs.length > 0,
      soDong: trs.length,
      coOVai: !!select,
      nhanOVai: select?.getAttribute("aria-label") || "",
      coNutTatBat: !!nutTat,
      chuNutTatBat: nutTat?.textContent.trim() || "",
    };
  });

  kiem(kq.coBang, "màn Cấu hình hệ thống có bảng người dùng", `${kq.soDong} dòng`);
  kiem(kq.coOVai, "có ô đổi vai (select) cho tài khoản", kq.nhanOVai);
  kiem(kq.coNutTatBat, "có nút Tắt/Bật lại", kq.chuNutTatBat);
  await trang.close();
}

/* Khối 3 tách riêng phần "Huỷ" ra một trang mới để tránh state của select
 * bị kẹt giữa hai kịch bản (đã đổi ở DOM nhưng React coi như chưa đổi). */
{
  console.log("\nCấu hình hệ thống — Huỷ hộp hỏi lý do thì KHÔNG gọi RPC:");
  const { trang, datKeHoach, goiRpc } = await moTrang(trinhDuyet, { suaKho: suaKhoAdmin, hash: "admin" });

  datKeHoach({ accept: false }); // Huỷ hộp prompt
  await trang.select('select[aria-label^="Vai của "]', "qa_manager");
  await cho(700);

  const soLanGoi = (goiRpc.rpc_set_business_role || []).length;
  kiem(soLanGoi === 0, "Huỷ hộp hỏi lý do thì KHÔNG gọi rpc_set_business_role",
    `${soLanGoi} lần gọi`);
  await trang.close();
}

/* ---- 4. Đổi vai có nhập lý do: gọi RPC đúng 1 lần, đúng tham số ------ */
{
  console.log("\nCấu hình hệ thống — nhập lý do thì gọi đúng 1 lần, đúng vai mới:");
  const { trang, datKeHoach, goiRpc } = await moTrang(trinhDuyet, { suaKho: suaKhoAdmin, hash: "admin" });

  datKeHoach({ accept: true, text: "Đổi vai để kiểm tra tự động (e2e quyen-admin)" });
  await trang.select('select[aria-label^="Vai của "]', "qa_manager");
  await cho(900);

  const goi = goiRpc.rpc_set_business_role || [];
  kiem(goi.length === 1, "gọi rpc_set_business_role đúng một lần", `${goi.length} lần`);
  if (goi.length >= 1) {
    let body = null;
    try { body = JSON.parse(goi[0].postData() || "null"); } catch { body = null; }
    kiem(body?.p_business_role === "qa_manager",
      "tham số vai mới đúng qa_manager", JSON.stringify(body));
    kiem(body?.p_user_id === NGUOI_DUNG.id, "tham số user_id đúng người đang sửa", body?.p_user_id);
    kiem(typeof body?.p_reason === "string" && body.p_reason.trim().length > 0,
      "tham số lý do được gửi kèm, không rỗng", JSON.stringify(body?.p_reason));
  }
  /* Sau khi RPC thành công, màn phải cho biết đã đổi — không im lặng. */
  const ketQua = await trang.evaluate(() =>
    document.body.innerText.includes("nay là") || document.body.innerText.includes("QA quản lý"));
  kiem(ketQua, "màn báo kết quả sau khi đổi vai thành công");
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

  // 6b. qa_manager (thấy được màn, nhưng KHÔNG phải vai nghiệp vụ admin):
  //     không được thấy nút, dù màn vẫn mở được.
  const b = await moTrang(trinhDuyet, { suaKho: suaKhoQaManager, hash: "health" });
  const moDuocMan = await b.trang.evaluate(() => !!document.querySelector('[data-view="health"]'));
  await b.trang.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((btn) => btn.textContent.includes("Kiểm tra trên máy chủ"))?.click();
  });
  await cho(900);
  const coNutQaManager = await b.trang.evaluate(() =>
    [...document.querySelectorAll("button")].some((btn) => btn.textContent.includes("Tính lại trạng thái")));
  kiem(moDuocMan, "qa_manager vẫn mở được màn Chất lượng dữ liệu (không lẫn với luật thấy-màn)");
  kiem(!coNutQaManager, "qa_manager KHÔNG thấy nút Tính lại trạng thái (chỉ businessRole admin)");
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
      coMaTran: chu.includes("Vai nào xem được gì, sửa được gì"),
      // Nửa SỬA phải là ô tích bấm được, không phải bảng chỉ để ngắm.
      coOTichSuaDuoc: [...document.querySelectorAll("button, input[type=checkbox]")]
        .some((el) => /vmp_role_permissions|sửa được/i.test(el.getAttribute("aria-label") || "")) 
        || chu.includes("tích ở đây là đổi quyền thật"),
      huongDanDungBaBuoc: chu.includes("Cấu hình hệ thống"),
    };
  });
  kiem(admin.coEmail, "admin thấy thẻ Ai được phép có tài khoản");
  kiem(admin.coMaTran, "admin thấy ma trận Vai nào xem được gì, sửa được gì");
  kiem(admin.coOTichSuaDuoc, "nửa SỬA nói rõ tích là đổi quyền thật");
  kiem(admin.huongDanDungBaBuoc, "hướng dẫn thêm người trỏ đúng sang màn Cấu hình hệ thống");
  await a.trang.close();

  // Quản lý QA: KHÔNG thấy hai thẻ này — RPC quản trị chỉ nhận admin thật.
  const b = await moTrang(trinhDuyet, { suaKho: suaKhoQaTheoLuatServer, hash: "phanquyen" });
  await cho(1400);
  const qa = await b.trang.evaluate(() => {
    const chu = document.body.innerText;
    return {
      coEmail: chu.includes("Ai được phép có tài khoản"),
      coMaTran: chu.includes("Vai nào xem được gì, sửa được gì"),
      /* Thẻ nay tên "Tài khoản & quyền" (hồ sơ nhân sự đã chuyển sang màn
         Nhân sự), nhưng panel danh bạ vẫn còn để CHỌN người xem quyền. */
      conThayDanhBa: chu.includes("Danh bạ chuẩn"),
    };
  });
  kiem(!qa.coEmail, "quản lý QA không thấy thẻ danh sách email");
  kiem(!qa.coMaTran, "quản lý QA không thấy ma trận vai × quyền");
  kiem(qa.conThayDanhBa, "quản lý QA vẫn chọn được người trong danh bạ (không chặn nhầm cả màn)");
  await b.trang.close();
}

/* ---- 9. Màn "Nhân sự" — quản lý QA thật sự sửa được gì? ------------- *
 *  Màn này sinh ra để quản lý QA sửa hồ sơ nhân sự mà không đụng vòng đời
 *  tài khoản. Câu hỏi là luật quyền có cho họ làm thật không. Đo hai tình
 *  huống thay vì suy đoán.
 * --------------------------------------------------------------------- */
{
  console.log("\nMàn Nhân sự — quản lý QA sửa được tới đâu:");

  const doSuaDuoc = async (suaKho) => {
    const { trang } = await moTrang(trinhDuyet, { suaKho, hash: "people" });
    await cho(1600);
    const kq = await trang.evaluate(() => {
      const oTen = document.querySelector('input[aria-label="Họ và tên trong danh bạ"]');
      const nutLuu = [...document.querySelectorAll("button")]
        .find((b) => /Lưu hồ sơ|Thêm vào danh bạ/.test(b.textContent || ""));
      return {
        moDuocMan: document.body.innerText.includes("Nhân sự")
          || !!document.querySelector('[data-view="people"]'),
        coOTen: !!oTen,
        oTenSuaDuoc: oTen ? !oTen.disabled : false,
        coNutLuu: !!nutLuu,
        noiKhongCoQuyen: document.body.innerText.includes("Chỉ Admin và Quản lý QA sửa"),
      };
    });
    await trang.close();
    return kq;
  };

  // 9a. Luật dự phòng (chế độ dự thảo, không có rpc_my_ui_access).
  const duPhong = await doSuaDuoc(suaKhoQaKhongCoUiAccess);
  kiem(duPhong.moDuocMan, "quản lý QA mở được màn Nhân sự ở luật dự phòng");
  kiem(duPhong.coOTen, "màn Nhân sự có ô hồ sơ để xem");
  /* Luật dự phòng nay chép theo đúng bảng quyền của server: Quản lý QA có
     `edit_operational_people`, nên ô hồ sơ phải MỞ. Trước đây nó cấp
     ["view"] cho mọi vai không phải admin — ngày RPC hỏng là Quản lý QA
     mất sạch việc hằng ngày và tưởng web hỏng. Phép kiểm này giữ cho lưới
     dự phòng khỏi hẹp lại lần nữa. */
  kiem(duPhong.oTenSuaDuoc === true,
    "ở luật dự phòng, quản lý QA VẪN sửa được hồ sơ (khớp bảng quyền server)",
    `oTenSuaDuoc=${duPhong.oTenSuaDuoc}`);

  // 9b. Server cấp edit_operational_people: giao diện phải mở khoá ngay.
  const duocCap = await doSuaDuoc(suaKhoQaDuocSuaNhanSu);
  kiem(duocCap.oTenSuaDuoc === true,
    "server cấp edit_operational_people thì quản lý QA sửa được ngay, không cần sửa web",
    `oTenSuaDuoc=${duocCap.oTenSuaDuoc}`);
  kiem(duocCap.coNutLuu, "và có nút lưu hồ sơ");
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
 *  khoản và ma trận quyền màn hình — phải còn nguyên với Admin, và phải
 *  KHÔNG hiện cho vai mà server không cấp `manage_accounts`.
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

  const b = await moTrang(trinhDuyet, { suaKho: suaKhoQaTheoLuatServer, hash: "phanquyen" });
  await cho(1500);
  await chonMotNguoi(b.trang);   // chọn cùng một người, để so cùng điều kiện
  await cho(1200);
  const qa = await b.trang.evaluate(() => {
    const chu = document.body.innerText;
    return {
      coNoiTaiKhoan: chu.includes("Nối tài khoản"),
      coMaTranManHinh: chu.includes("Màn hình bạn được xem"),
      vaoDuocMan: chu.includes("Danh bạ chuẩn"),
    };
  });
  /* Đây là phép kiểm cho đúng lỗi vừa sửa: bản trước gate nút nối tài khoản
     bằng `isAdmin`, mà cờ đó bật cả với quản lý QA — họ thấy nút rồi bấm và
     bị máy chủ từ chối. Nay hỏi thẳng access.can("accounts","manage_accounts"). */
  kiem(!qa.coNoiTaiKhoan, "quản lý QA KHÔNG thấy nút nối tài khoản (server không cấp manage_accounts)");
  kiem(!qa.coMaTranManHinh, "quản lý QA không thấy ma trận quyền màn hình");
  kiem(qa.vaoDuocMan, "quản lý QA vẫn vào được màn và chọn được người");
  await b.trang.close();
}

await trinhDuyet.close();

console.log(`\n${"─".repeat(52)}`);
console.log(`${soDat} đạt · ${soHong} hỏng`);
if (soHong > 0) { console.error("KHÔNG ĐẠT."); process.exit(1); }
console.log("ĐẠT.");

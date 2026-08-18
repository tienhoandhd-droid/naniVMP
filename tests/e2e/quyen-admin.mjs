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

/** Bốn màn chỉ-admin, theo src/lib/access.ts (MAN_CHI_ADMIN + accounts). */
const MAN_CHI_ADMIN = ["accounts", "health", "audit", "admin"];

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

/** Quản lý QA THẬT: `profiles.role = "qa_manager"`. Đây là ca dễ lọt nhất —
 *  `permMap` của web gán perm "admin" cho qa_manager, nên cờ `isAdmin` phía
 *  client vẫn bật. Nếu nút quản trị tài khoản gate bằng `isAdmin` thì quản
 *  lý QA sẽ THẤY ô đổi vai và nút Tắt, bấm vào thì RPC từ chối — người dùng
 *  không hiểu vì sao. Kho này giữ nguyên quyền xem màn để tách bạch hai
 *  luật: "thấy được màn" khác "làm được thao tác ghi". */
function suaKhoQaManagerThat(kho) {
  suaKhoAdmin(kho);
  kho.profiles = kho.profiles.map((p) => ({ ...p, role: "qa_manager" }));
  const goc = kho.rpc_my_ui_access;
  kho.rpc_my_ui_access = { ...goc, business_role: "qa_manager" };
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
  console.log("Admin — 4 màn chỉ-admin trên nav:");
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

/* ---- 2. Viewer: không thấy 4 màn chỉ-admin --------------------------- */
{
  console.log("\nViewer — không thấy 4 màn chỉ-admin:");
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
    { suaKho: suaKhoQaManagerThat, hash: "admin" });
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

  kiem(kq.coBangNguoiDung, "quản lý QA vẫn xem được bảng người dùng");
  kiem(!kq.coODoiVai, "quản lý QA KHÔNG thấy ô đổi vai");
  kiem(!kq.coNutTat, "quản lý QA KHÔNG thấy nút Tắt / Bật lại");
  kiem(!kq.coCotThaoTac, "bảng không hiện cột Thao tác rỗng cho quản lý QA");
  // Ẩn nút mà không nói gì thì người dùng tưởng web hỏng hoặc mình bị mất quyền.
  kiem(kq.noiRoViSao, "màn nói rõ vì sao không đổi được, thay vì ẩn câm");
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
  const b = await moTrang(trinhDuyet, { suaKho: suaKhoQaManagerThat, hash: "phanquyen" });
  await cho(1400);
  const qa = await b.trang.evaluate(() => {
    const chu = document.body.innerText;
    return {
      coEmail: chu.includes("Ai được phép có tài khoản"),
      coMaTran: chu.includes("Vai nào xem được gì, sửa được gì"),
      conThayDanhBa: chu.includes("Danh bạ nhân sự"),
    };
  });
  kiem(!qa.coEmail, "quản lý QA không thấy thẻ danh sách email");
  kiem(!qa.coMaTran, "quản lý QA không thấy ma trận vai × quyền");
  kiem(qa.conThayDanhBa, "quản lý QA vẫn dùng được danh bạ nhân sự (không chặn nhầm cả màn)");
  await b.trang.close();
}

await trinhDuyet.close();

console.log(`\n${"─".repeat(52)}`);
console.log(`${soDat} đạt · ${soHong} hỏng`);
if (soHong > 0) { console.error("KHÔNG ĐẠT."); process.exit(1); }
console.log("ĐẠT.");

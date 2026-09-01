/* =====================================================================
 *  catalog-workspace.mjs — kiểm workspace Danh mục & Nhập liệu (Đợt B Task 6)
 *  ---------------------------------------------------------------------
 *  Chạy trên Supabase giả lập (gia-lap-supabase.mjs) — không request nào
 *  ra ngoài. Bộ này kiểm HỢP ĐỒNG workspace theo quyền:
 *
 *   1. Admin/Quản lý QA có tám mục: objects · coverage · products · alerts ·
 *      revalidation · import · pending · history. Không còn "Người thực hiện".
 *   2. Quyền quyết định nút: đủ quyền thấy Thêm/Nhập Excel/Chờ áp dụng;
 *      nhân viên xưởng không thấy bất kỳ lối ghi nào và không mở Lịch sử.
 *   3. Bảng ngữ nghĩa thật: <caption>, header dính; mở dòng thấy chi tiết.
 *   4. Điện thoại 390×844: bảng ẩn hẳn, thẻ hiện, CÙNG số dòng và cùng
 *      hành động — một logic, hai cách trình bày.
 *   5. 1366×768 và 1093×720 không tràn ngang.
 *   6. Deep-link từ Tiến độ (nút "Mở trong Dữ liệu nguồn") mở đúng
 *      đối tượng rồi TỰ XOÁ — quay lại không bị dính bộ lọc cũ.
 *
 *  Chạy: bash scripts/with-preview.sh -- npm run e2e:catalog
 * ===================================================================== */
import { readFileSync, mkdtempSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

import { CHROME } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

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

/** Nhân viên xưởng là persona chỉ-đọc cho Danh mục: không có audit. */
function quyenNhanVienXuong(kho) {
  const goc = kho.rpc_my_ui_access;
  const screens = {};
  for (const [id, q] of Object.entries(goc.screens)) {
    screens[id] = { ...q, actions: ["view"] };
  }
  screens.audit = { can_view: false, scope: "none", actions: [] };
  kho.rpc_my_ui_access = { ...goc, business_role: "workshop_staff", screens };
}

function quyenQuanLyQa(kho) {
  const goc = kho.rpc_my_ui_access;
  kho.rpc_my_ui_access = { ...goc, business_role: "qa_manager" };
}

async function moTrang(trinhDuyet, { hash = "source", rong = 1440, cao = 900, suaKho, isMobile = false } = {}) {
  const trang = await trinhDuyet.newPage();
  const loiConsole = [];
  trang.on("console", (m) => {
    if (m.type() !== "error") return;
    /* Kèm URL nguồn lỗi: "Failed to load resource: 404" mà không có URL
       thì flake trên CI không thể chẩn đoán (đã dính một lần). Font
       Google là thứ duy nhất được phép ra mạng ngoài — CDN của nó thi
       thoảng 404 một biến thể, không phải lỗi của app. */
    const url = m.location()?.url || "";
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
    if (/net::ERR_|realtime|WebSocket/i.test(m.text())) return;
    loiConsole.push(`${m.text().slice(0, 90)} @ ${url.slice(0, 90)}`);
  });
  trang.on("pageerror", (e) => loiConsole.push(`pageerror: ${String(e.message).slice(0, 110)}`));
  const { chanNgoai } = await caiGiaLap(trang, { supabaseUrl: URL_SB, kichBan: "day", suaKho });
  await nhetPhien(trang, { supabaseUrl: URL_SB });
  await trang.setViewport({ width: rong, height: cao, isMobile });
  await trang.goto(`${GOC}#v=${hash}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await cho(2400);
  return { trang, loiConsole, chanNgoai };
}

const trinhDuyet = await puppeteer.launch({
  executablePath: CHROME, headless: "new", args: ["--no-sandbox"],
});

/* ---- Hợp đồng V2: ghi đè deadline hạng mục đã có tiến độ ------------- */
const CHANGE_ID_V2 = "94000000-0000-4000-8000-000000000001";
const REVISION_V2 = 3;
const MA_HANG_MUC_V2 = "CCTB01/2026.01-PQ";
const VERSION_HANG_MUC_V2 = 7;
const LY_DO_AP_V2 = "Xác nhận theo biên bản QA-26/08";

const nhanChonDeadlineV2 = `Chọn cập nhật deadline ${MA_HANG_MUC_V2}`;

async function moXemTruocDeadlineV2(applyResult, moChat = false) {
  const applyBodies = [];
  const applyResults = [];
  const previewBodies = [];
  const previewResults = [];
  const saveBodies = [];
  const saveResults = [];
  const pageState = await moTrang(trinhDuyet, {
    suaKho(kho) {
      const source = kho.vmp_source_objects[0];
      Object.assign(source, {
        code: "CCTB01",
        object_code: "CCTB01",
        obj: "CCTB01",
        object_name: "Thiết bị deadline có tiến độ",
        name: "Thiết bị deadline có tiến độ",
        objName: "Thiết bị deadline có tiến độ",
        frequency_months: 12,
        first_month: 3,
        version: 4,
      });
      const save = kho.rpc_save_catalog_object;
      const preview = kho.rpc_preview_catalog_change_v2;
      const apply = kho.rpc_apply_catalog_change_v2;
      kho.rpc_save_catalog_object = (body) => {
        const result = save(body);
        saveBodies.push(body); saveResults.push(result);
        return result;
      };
      kho.rpc_preview_catalog_change_v2 = (body) => {
        const result = preview(body);
        previewBodies.push(body); previewResults.push(result);
        return result;
      };
      kho.rpc_apply_catalog_change_v2 = (body) => {
        const result = applyResult ?? apply(body);
        applyBodies.push(body);
        applyResults.push(result);
        return result;
      };
    },
  });
  const { trang } = pageState;

  await trang.waitForSelector("[data-cw-sua]", { timeout: 10_000 });
  if (moChat) {
    await trang.click('[aria-label="Trò chuyện cùng công chúa Vali"]');
    await trang.waitForSelector(".vmp-chat-panel", { timeout: 10_000 });
    await trang.evaluate(() => {
      const edit = document.querySelector("[data-cw-sua]");
      if (edit instanceof HTMLElement) edit.focus();
    });
    await trang.keyboard.press("Enter");
  } else {
    await trang.click("[data-cw-sua]");
  }
  await trang.waitForSelector("#cof-frequency_months", { timeout: 10_000 });
  await trang.select("#cof-frequency_months", "6");
  await trang.waitForSelector("#cof-ly-do", { timeout: 10_000 });
  await trang.type("#cof-ly-do", "Điều chỉnh tần suất theo hồ sơ QA");
  await trang.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => button.textContent?.trim() === "Lưu" && !button.disabled), { timeout: 10_000 });
  await trang.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Lưu")?.click());

  await trang.waitForFunction((label) => [...document.querySelectorAll('.lp-dialog__panel[role="dialog"] .lp-dialog__title')]
    .some((node) => node.textContent?.trim() === "Ảnh hưởng tới timeline")
    && [...document.querySelectorAll('input[type="checkbox"]')]
      .some((input) => input.getAttribute("aria-label") === label),
  { timeout: 10_000 }, nhanChonDeadlineV2);
  return { ...pageState, applyBodies, applyResults, previewBodies, previewResults, saveBodies, saveResults };
}

async function chuanBiApDeadlineV2(trang) {
  await trang.evaluate((label) => {
    const candidate = [...document.querySelectorAll('input[type="checkbox"]')]
      .find((input) => input.getAttribute("aria-label") === label);
    candidate?.click();
  }, nhanChonDeadlineV2);
  await trang.waitForFunction((label) => [...document.querySelectorAll('input[type="checkbox"]')]
    .some((input) => input.getAttribute("aria-label") === label && input.checked),
  { timeout: 10_000 }, nhanChonDeadlineV2);

  const reasonSelector = 'input[placeholder="Câu này đi vào nhật ký, người sau đọc để hiểu vì sao timeline đổi."]';
  await trang.type(reasonSelector, LY_DO_AP_V2);
  await trang.waitForFunction((selector, reason) => document.querySelector(selector)?.value === reason,
    { timeout: 10_000 }, reasonSelector, LY_DO_AP_V2);

  await trang.evaluate(() => {
    const label = [...document.querySelectorAll("label")]
      .find((node) => node.textContent?.includes("Tôi xác nhận chỉ cập nhật các deadline kế hoạch đã chọn"));
    label?.querySelector('input[type="checkbox"]')?.click();
  });
  await trang.waitForFunction((label, selector, reason) => {
    const candidate = [...document.querySelectorAll('input[type="checkbox"]')]
      .find((input) => input.getAttribute("aria-label") === label);
    const confirmation = [...document.querySelectorAll("label")]
      .find((node) => node.textContent?.includes("Tôi xác nhận chỉ cập nhật các deadline kế hoạch đã chọn"))
      ?.querySelector('input[type="checkbox"]');
    return candidate?.checked === true
      && document.querySelector(selector)?.value === reason
      && confirmation?.checked === true
      && [...document.querySelectorAll("button")]
        .some((button) => button.textContent?.trim() === "Áp vào timeline" && !button.disabled);
  }, { timeout: 10_000 }, nhanChonDeadlineV2, reasonSelector, LY_DO_AP_V2);
}

async function bamApDeadlineV2(trang) {
  await trang.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Áp vào timeline")?.click());
}

function expectedApplyBodyV2() {
  return {
    p_change_id: CHANGE_ID_V2,
    p_reason: LY_DO_AP_V2,
    p_expected_timeline_revision: REVISION_V2,
    p_deadline_overrides: [{ validation_code: MA_HANG_MUC_V2, expected_item_version: VERSION_HANG_MUC_V2 }],
    p_override_confirmed: true,
  };
}

function expectedSaveResultV2() {
  return {
    ok: true,
    object_code: "CCTB01",
    version: 4,
    change_id: CHANGE_ID_V2,
    timeline_revision: REVISION_V2,
    pending_timeline: true,
  };
}

function expectedApplySuccessV2() {
  return {
    ok: true,
    change_id: CHANGE_ID_V2,
    object_code: "CCTB01",
    so_tao: 0,
    so_sua: 0,
    so_dung: 0,
    so_giu_nguyen: 1,
    so_deadline_override: 1,
    timeline_revision: REVISION_V2,
    actor_id: "00000000-0000-4000-8000-000000000001",
    effective_role: "admin",
    reason: LY_DO_AP_V2,
    deadline_overrides: [{
      validation_code: MA_HANG_MUC_V2,
      item_version_cu: VERSION_HANG_MUC_V2,
      item_version_moi: 8,
      deadline_protocol_cu: "2026-06-30",
      deadline_protocol_moi: "2026-01-18",
      deadline_validation_cu: "2026-07-31",
      deadline_validation_moi: "2026-03-24",
      deadline_report_cu: "2026-08-15",
      deadline_report_moi: "2026-03-26",
      deadline_vmp_cu: "2026-08-31",
      deadline_vmp_moi: "2026-03-31",
      actual_dates_unchanged: true,
      statuses_unchanged: true,
    }],
    da_ap_truoc_do: false,
  };
}

const XEM_TRUOC_V1_OK = {
  ok: true,
  change_id: CHANGE_ID_V2,
  object_code: "CCTB01",
  timeline_revision: REVISION_V2,
  tao: [],
  sua: [{
    validation_code: MA_HANG_MUC_V2,
    validation_type: "PQ",
    deadline_vmp_cu: "2026-08-31",
    deadline_vmp_moi: "2026-03-31",
  }],
  dung: [],
  giu_nguyen: [],
  canh_bao: [],
};

const XEM_TRUOC_V2_CO_GHI_DE = {
  ...XEM_TRUOC_V1_OK,
  sua: [],
  giu_nguyen: [{
    validation_code: MA_HANG_MUC_V2,
    ly_do: "Đã có tiến độ; chỉ cập nhật deadline kế hoạch khi xác nhận đặc biệt",
  }],
  deadline_overrides: [{
    validation_code: MA_HANG_MUC_V2,
    item_version: VERSION_HANG_MUC_V2,
    eligible: true,
    blocker_code: null,
    blocker_reason: null,
    missing: [],
    progress: {
      actual_protocol_date: null, actual_validation_date: "2026-03-20",
      actual_report_date: null, actual_vmp_date: null,
      status_protocol: "chua", status_validation: "completed",
      status_report: "chua", status_vmp: "chua",
    },
    deadline_protocol_cu: "2026-06-30", deadline_protocol_moi: "2026-01-18",
    deadline_validation_cu: "2026-07-31", deadline_validation_moi: "2026-03-24",
    deadline_report_cu: "2026-08-15", deadline_report_moi: "2026-03-26",
    deadline_vmp_cu: "2026-08-31", deadline_vmp_moi: "2026-03-31",
  }],
};

const AP_DUNG_V1_OK = {
  ok: true,
  so_tao: 0,
  so_sua: 1,
  so_dung: 0,
  so_giu_nguyen: 0,
};

function expectedApplyBodyV1() {
  return {
    p_change_id: CHANGE_ID_V2,
    p_reason: LY_DO_AP_V2,
    p_expected_timeline_revision: REVISION_V2,
  };
}

function expectedApplyBodyV2WithoutOverride() {
  return {
    p_change_id: CHANGE_ID_V2,
    p_reason: LY_DO_AP_V2,
    p_expected_timeline_revision: REVISION_V2,
    p_deadline_overrides: [],
    p_override_confirmed: false,
  };
}

async function moXemTruocFallbackV2({ previewV2Error, applyV2Error, previewV2 = XEM_TRUOC_V1_OK } = {}) {
  const v1PreviewBodies = [];
  const v1ApplyBodies = [];
  const v2PreviewBodies = [];
  const v2ApplyBodies = [];
  const rpcSequence = [];
  const pageState = await moTrang(trinhDuyet, {
    suaKho(kho) {
      const source = kho.vmp_source_objects[0];
      Object.assign(source, {
        code: "CCTB01", object_code: "CCTB01", obj: "CCTB01",
        object_name: "Thiết bị deadline có tiến độ", name: "Thiết bị deadline có tiến độ",
        objName: "Thiết bị deadline có tiến độ", frequency_months: 12, first_month: 3, version: 4,
      });
      if (previewV2Error || applyV2Error) {
        kho.rpc_errors = {
          ...(previewV2Error ? { rpc_preview_catalog_change_v2: previewV2Error } : {}),
          ...(applyV2Error ? { rpc_apply_catalog_change_v2: applyV2Error } : {}),
        };
      }
      kho.rpc_preview_catalog_change_v2 = () => previewV2;
      kho.rpc_apply_catalog_change_v2 = () => AP_DUNG_V1_OK;
      kho.rpc_preview_catalog_change = (body) => {
        v1PreviewBodies.push(body); rpcSequence.push({ rpc: "rpc_preview_catalog_change", body });
        return XEM_TRUOC_V1_OK;
      };
      kho.rpc_apply_catalog_change = (body) => {
        v1ApplyBodies.push(body); rpcSequence.push({ rpc: "rpc_apply_catalog_change", body });
        return AP_DUNG_V1_OK;
      };
    },
  });
  const { trang } = pageState;
  /* `traLoi` trả configured error trước khi gọi handler fixture. Ghi tại
     biên trình duyệt nên vẫn thấy yêu cầu V2 đã gây fallback, và cùng một
     cách đo được cả request V1 sau đó mà không sửa fixture dùng chung. */
  trang.on("request", (request) => {
    if (request.method() !== "POST") return;
    const rpc = new URL(request.url()).pathname.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/i)?.[1];
    if (!rpc) return;
    let body = null;
    try { body = JSON.parse(request.postData() || "null"); } catch { body = null; }
    if (rpc === "rpc_preview_catalog_change_v2") {
      v2PreviewBodies.push(body); rpcSequence.push({ rpc, body });
    } else if (rpc === "rpc_apply_catalog_change_v2") {
      v2ApplyBodies.push(body); rpcSequence.push({ rpc, body });
    }
  });
  await trang.waitForSelector("[data-cw-sua]", { timeout: 10_000 });
  await trang.click("[data-cw-sua]");
  await trang.waitForSelector("#cof-frequency_months", { timeout: 10_000 });
  await trang.select("#cof-frequency_months", "6");
  await trang.waitForSelector("#cof-ly-do", { timeout: 10_000 });
  await trang.type("#cof-ly-do", "Điều chỉnh tần suất theo hồ sơ QA");
  await trang.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => button.textContent?.trim() === "Lưu" && !button.disabled), { timeout: 10_000 });
  await trang.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent?.trim() === "Lưu")?.click());
  return { ...pageState, v1PreviewBodies, v1ApplyBodies, v2PreviewBodies, v2ApplyBodies, rpcSequence };
}

async function chuanBiApV1(trang) {
  const reasonSelector = 'input[placeholder="Câu này đi vào nhật ký, người sau đọc để hiểu vì sao timeline đổi."]';
  await trang.waitForSelector(reasonSelector, { timeout: 10_000 });
  await trang.type(reasonSelector, LY_DO_AP_V2);
  await trang.waitForFunction((selector, reason) => document.querySelector(selector)?.value === reason,
    { timeout: 10_000 }, reasonSelector, LY_DO_AP_V2);
  await trang.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => button.textContent?.trim() === "Áp vào timeline" && !button.disabled), { timeout: 10_000 });
}

/* ---- 1. Đủ quyền: tám mục, nút ghi, bảng ngữ nghĩa ----------------- */
{
  console.log("Đủ quyền — cấu trúc tám mục:");
  const { trang, loiConsole, chanNgoai } = await moTrang(trinhDuyet);

  const kq = await trang.evaluate(() => {
    const nav = document.querySelector('[aria-label="Bộ dữ liệu danh mục"]');
    const muc = [...(nav?.querySelectorAll("[data-cw-nav]") ?? [])];
    const chuTrang = document.querySelector("main")?.innerText ?? document.body.innerText;
    const caption = document.querySelector(".lp-smart-table caption");
    const th = document.querySelector(".lp-smart-table th");
    const timKiem = document.querySelector('input[aria-label="Tìm trong danh mục"]');
    /* 31/08 — nút mang nhãn đầy đủ "Thêm đối tượng"; bám data-cw-them cho bền. */
    const nutThem = document.querySelector("[data-cw-them]");
    return {
      thuTu: muc.map((b) => b.dataset.cwNav).join(","),
      nhanNav: muc.map((b) => b.textContent.trim()),
      coThem: !!nutThem,
      coNhapExcel: muc.some((b) => b.textContent.includes("Nhập Excel")),
      coNguoiThucHien: chuTrang.includes("Người thực hiện"),
      caption: caption?.textContent?.trim() ?? "",
      thDinh: th ? getComputedStyle(th).position : "",
      coTimKiem: !!timKiem,
      soH1: document.querySelectorAll("h1").length,
      phuDe: chuTrang.includes("Dữ liệu nguồn"),
    };
  });

  kiem(kq.thuTu === "objects,coverage,products,alerts,revalidation,import,pending,history",
    "tám mục nav đúng thứ tự", kq.thuTu || "(không thấy nav)");
  kiem(kq.coThem, "đủ quyền thấy nút Thêm");
  kiem(kq.coNhapExcel, "đủ quyền thấy mục Nhập Excel");
  kiem(!kq.coNguoiThucHien, "không còn chữ 'Người thực hiện' trên màn");
  kiem(kq.caption === "Đối tượng nguồn", "bảng có <caption> Đối tượng nguồn", kq.caption);
  kiem(kq.thDinh === "sticky", "header bảng dính khi cuộn", kq.thDinh);
  kiem(kq.coTimKiem, "có ô tìm kiếm có nhãn");
  kiem(kq.soH1 === 1, "đúng một h1", `thấy ${kq.soH1}`);
  kiem(kq.phuDe, "phụ đề nêu đây là dữ liệu nguồn");

  /* Mở dòng chi tiết. */
  await trang.evaluate(() => {
    const nut = document.querySelector(".lp-smart-table__toggle");
    if (nut) nut.click();
  });
  await cho(400);
  const chiTiet = await trang.evaluate(() => {
    const o = document.querySelector(".lp-smart-table__detail");
    return {
      co: !!o,
      chu: o?.textContent ?? "",
      coSua: !!o?.querySelector("[data-cw-sua]"),
    };
  });
  kiem(chiTiet.co, "mở được dòng chi tiết");
  kiem(chiTiet.chu.includes("Nhóm công việc"), "chi tiết có nhóm công việc");
  kiem(chiTiet.chu.includes("Điểm trọng yếu") || chiTiet.chu.includes("trọng yếu"),
    "chi tiết có điểm trọng yếu");
  kiem(chiTiet.coSua, "chi tiết có hành động Sửa cho người đủ quyền");

  /* Chuyển sang Sản phẩm GMP — bảng riêng, cột riêng, dữ liệu server. */
  await trang.evaluate(() => document.querySelector('[data-cw-nav="products"]')?.click());
  await cho(1200);
  const sp = await trang.evaluate(() => ({
    caption: document.querySelector(".lp-smart-table caption")?.textContent?.trim() ?? "",
    soDong: document.querySelectorAll(".lp-smart-table tbody tr").length,
  }));
  kiem(sp.caption === "Sản phẩm GMP", "chuyển được sang bảng Sản phẩm GMP", sp.caption);
  kiem(sp.soDong > 0, "bảng sản phẩm có dữ liệu từ RPC danh mục", `${sp.soDong} dòng`);

  kiem(loiConsole.length === 0, "console sạch", loiConsole[0] || "");
  kiem(chanNgoai.length === 0, "không gọi ra ngoài môi trường cách ly", chanNgoai[0] || "");
  await trang.close();
}

/* ---- 2. Nhân viên xưởng: không một lối ghi hoặc audit nào ------------ */
{
  console.log("\nNhân viên xưởng — không lối ghi:");
  const { trang } = await moTrang(trinhDuyet, { suaKho: quyenNhanVienXuong });

  const kq = await trang.evaluate(() => {
    const nav = document.querySelector('[aria-label="Bộ dữ liệu danh mục"]');
    const muc = [...(nav?.querySelectorAll("[data-cw-nav]") ?? [])].map((b) => b.dataset.cwNav);
    const nutThem = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Thêm");
    return {
      muc: muc.join(","),
      coThem: !!nutThem,
      coSua: !!document.querySelector("[data-cw-sua]"),
      soDong: document.querySelectorAll(".lp-smart-table tbody tr").length,
    };
  });

  kiem(kq.muc === "objects",
    "nhân viên xưởng chỉ thấy đối tượng Source theo quyền", kq.muc || "(không thấy nav)");
  kiem(!kq.coThem, "nhân viên xưởng không thấy nút Thêm");
  kiem(!kq.coSua, "nhân viên xưởng không thấy nút Sửa");
  kiem(kq.soDong > 0, "nhân viên xưởng vẫn đọc được dữ liệu", `${kq.soDong} dòng`);
  await trang.close();
}

/* ---- 2b. Quản lý QA vẫn được đọc Lịch sử ---------------------------- */
{
  console.log("\nQuản lý QA — còn Lịch sử:");
  const { trang } = await moTrang(trinhDuyet, { suaKho: quyenQuanLyQa });
  const coLichSu = await trang.evaluate(() => !!document.querySelector('[data-cw-nav="history"]'));
  kiem(coLichSu, "quản lý QA vẫn thấy mục Lịch sử");
  await trang.close();
}

/* ---- 2c. Bộ lọc Đối tượng: một mảng cho đếm/bảng/thẻ/xuất ------------ */
{
  console.log("\nBộ lọc nâng cao Đối tượng:");
  const { trang, loiConsole } = await moTrang(trinhDuyet, { suaKho(kho) {
    const mau = kho.vmp_source_objects[0];
    kho.vmp_source_objects = Array.from({ length: 31 }, (_, index) => ({
      ...mau,
      id: 81_000 + index,
      code: index === 0 ? "TB-FILTER-ONE" : `TB-FILTER-${index}`,
      object_code: index === 0 ? "TB-FILTER-ONE" : `TB-FILTER-${index}`,
      object_name: index === 0 ? "Máy lọc mục tiêu" : `Máy lọc nền ${index}`,
      kind: "Thiết bị", object_kind: "Thiết bị",
      department: index === 0 ? " QA " : "SX",
      area_code: index === 0 ? " A1 " : "B2",
      owner_name: index === 0 ? " Nguyễn An " : "Trần Bình",
      validate_flag: "y", first_month: index === 0 ? 4 : 3,
      frequency_months: 12, note: index === 0 ? "Theo dõi nhiệt độ" : "Dòng nền",
    }));
  } });

  await trang.waitForSelector("[data-cw-filter-toggle]", { timeout: 10_000 });
  await trang.waitForFunction(() => document.querySelectorAll(".lp-smart-table tbody tr").length === 25,
    { timeout: 10_000 });
  await trang.click(".cw-pager__nut:last-child");
  await trang.waitForFunction(() => document.querySelector(".cw-pager .cw-nhe")?.textContent?.includes("26–31") === true,
    { timeout: 10_000 });
  await trang.waitForFunction(() => document.querySelectorAll(".lp-smart-table tbody tr").length === 6
    && document.querySelector(".lp-smart-table__toggle")?.getAttribute("aria-expanded") === "false",
  { timeout: 10_000 });
  await trang.click(".lp-smart-table__toggle");
  await trang.waitForFunction(() => document.querySelector(".lp-smart-table__toggle")?.getAttribute("aria-expanded") === "true"
    && !!document.querySelector(".lp-smart-table__detail"), { timeout: 10_000 });

  await trang.click("[data-cw-filter-toggle]");
  await trang.waitForFunction(() => document.querySelector("[data-cw-filter-panel]")?.hasAttribute("hidden") === false,
    { timeout: 10_000 });
  await trang.select('[data-cw-filter="validation"]', "validated");
  await trang.waitForFunction(() => document.querySelector(".cw-pager .cw-nhe")?.textContent?.includes("1–25 / 31") === true
    && !document.querySelector(".lp-smart-table__detail"), { timeout: 10_000 });

  await trang.select('[data-cw-filter="department"]', "qa");
  await trang.select('[data-cw-filter="area"]', "a1");
  await trang.select('[data-cw-filter="first-month"]', "present");
  await trang.select('[data-cw-filter="owner"]', "owner:nguyễn an");
  await trang.select('[data-cw-filter="frequency"]', "lte12");
  await trang.waitForFunction(() => {
    const count = document.querySelector("[data-cw-filter-count]")?.textContent ?? "";
    return count.includes("6 điều kiện") && count.includes("1 đối tượng")
      && document.querySelectorAll(".lp-smart-table tbody tr").length === 1
      && document.querySelector("[data-cw-export-count]")?.getAttribute("data-cw-export-count") === "1";
  }, { timeout: 10_000 });
  const desktop = await trang.evaluate(() => ({
    chips: document.querySelectorAll("[data-cw-filter-chip]").length,
    row: document.querySelector(".lp-smart-table tbody tr")?.textContent ?? "",
    exportCount: document.querySelector("[data-cw-export-count]")?.getAttribute("data-cw-export-count"),
  }));
  kiem(desktop.chips === 6, "sáu chip phản ánh sáu bộ lọc nâng cao", String(desktop.chips));
  kiem(desktop.row.includes("TB-FILTER-ONE"), "bảng dùng đúng mảng đã lọc", desktop.row);
  kiem(desktop.exportCount === "1", "xuất Excel nhận đúng toàn bộ mảng đã lọc", String(desktop.exportCount));

  await trang.waitForFunction(() => document.querySelectorAll(".lp-mobile-task").length === 1, { timeout: 10_000 });
  const mobile = await trang.evaluate(() => document.querySelector(".lp-mobile-task")?.textContent ?? "");
  kiem(mobile.includes("TB-FILTER-ONE"), "thẻ điện thoại dùng cùng mảng đã lọc", mobile);

  await trang.click("[data-cw-clear-filters]");
  await trang.waitForFunction(() => !document.querySelector("[data-cw-filter-count]")
    && document.querySelector('[data-cw-kind="Thiết bị"]')?.getAttribute("aria-pressed") === "true"
    && document.querySelectorAll(".lp-mobile-task").length === 25, { timeout: 10_000 });
  kiem(true, "xóa bộ lọc giữ nguyên loại đối tượng đang chọn");

  await trang.type('input[aria-label="Tìm trong danh mục"]', "Máy lọc");
  await cho(500); // chờ debounce + page Source theo từ khóa mới
  await trang.waitForFunction(() => document.querySelector("[data-cw-filter-count]")?.textContent?.includes("1 điều kiện") === true
    && document.querySelector(".cw-pager .cw-nhe")?.textContent?.includes("1–25 / 31") === true, { timeout: 10_000 });
  await trang.click(".cw-pager__nut:last-child");
  await trang.waitForFunction(() => document.querySelector(".cw-pager .cw-nhe")?.textContent?.includes("26–31") === true,
    { timeout: 10_000 });
  await trang.waitForFunction(() => document.querySelectorAll(".lp-smart-table tbody tr").length === 6
    && document.querySelector(".lp-smart-table__toggle")?.getAttribute("aria-expanded") === "false",
  { timeout: 10_000 });
  await trang.click(".lp-smart-table__toggle");
  await trang.waitForFunction(() => document.querySelector(".lp-smart-table__toggle")?.getAttribute("aria-expanded") === "true"
    && !!document.querySelector(".lp-smart-table__detail"), { timeout: 10_000 });
  await trang.evaluate(() => [...document.querySelectorAll("[data-cw-filter-chip]")]
    .find((chip) => chip.getAttribute("aria-label")?.startsWith("Bỏ lọc Từ khóa:"))?.click());
  await trang.waitForFunction(() => !document.querySelector("[data-cw-filter-count]")
    && document.querySelector(".cw-pager .cw-nhe")?.textContent?.includes("1–25 / 31") === true
    && !document.querySelector(".lp-smart-table__detail"), { timeout: 10_000 });
  kiem(true, "bỏ chip từ khóa trở về trang đầu và đóng chi tiết");
  kiem(loiConsole.length === 0, "không lỗi console ở bộ lọc đối tượng", loiConsole.join(" · ").slice(0, 160));
  await trang.close();
}

/* ---- 3. Điện thoại 390×844: thẻ thay bảng, cùng dữ liệu -------------- */
{
  console.log("\nĐiện thoại 390×844:");
  const { trang } = await moTrang(trinhDuyet, { rong: 390, cao: 844, isMobile: true });

  const kq = await trang.evaluate(() => {
    const bang = document.querySelector(".lp-smart-table");
    const ds = document.querySelectorAll(".lp-mobile-task-list");
    const the = document.querySelectorAll(".lp-mobile-task");
    const nutNho = [...document.querySelectorAll(".lp-mobile-task button")]
      .filter((b) => b.getBoundingClientRect().height < 44).length;
    return {
      bangAn: !bang || getComputedStyle(bang).display === "none",
      soDanhSach: ds.length,
      soThe: the.length,
      soDongBang: document.querySelectorAll(".lp-smart-table tbody tr").length,
      nutNho,
      tranNgang: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  kiem(kq.bangAn, "bảng desktop ẩn hẳn trên điện thoại");
  kiem(kq.soDanhSach === 1, "đúng một danh sách thẻ có nhãn", `thấy ${kq.soDanhSach}`);
  kiem(kq.soThe > 0, "có thẻ dữ liệu", `${kq.soThe} thẻ`);
  kiem(kq.soThe === kq.soDongBang, "thẻ và bảng cùng số dòng — một view-model",
    `thẻ ${kq.soThe} vs bảng ${kq.soDongBang}`);
  kiem(kq.nutNho === 0, "mọi nút trong thẻ đạt 44px", `${kq.nutNho} nút chưa đạt`);
  kiem(kq.tranNgang <= 1, "không tràn ngang", `${kq.tranNgang}px`);
  await trang.close();
}

/* ---- 4. Hai khổ desktop hẹp không tràn ngang ------------------------ */
for (const [rong, cao] of [[1366, 768], [1093, 720]]) {
  console.log(`\nKhổ ${rong}×${cao}:`);
  const { trang } = await moTrang(trinhDuyet, { rong, cao });
  const tran = await trang.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  kiem(tran <= 1, `không tràn ngang ở ${rong}×${cao}`, `${tran}px`);
  await trang.close();
}

/* ---- 5. Deep-link từ Tiến độ mở đúng đối tượng rồi tự xoá ----------- */
{
  console.log("\nDeep-link từ Tiến độ:");
  const { trang } = await moTrang(trinhDuyet, { hash: "progress" });

  /* Sang cách nhóm "Theo đối tượng", mở một đối tượng, bấm lối nhảy. */
  await trang.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Theo đối tượng")?.click();
  });
  await cho(1200);
  const maDaMo = await trang.evaluate(() => {
    const dong = [...document.querySelectorAll("button")]
      .find((b) => /^TB-\d/.test(b.textContent.trim()));
    if (!dong) return null;
    const ma = dong.textContent.trim().match(/TB-\d+/)?.[0] ?? null;
    dong.click();
    return ma;
  });
  await cho(600);
  const daBam = await trang.evaluate(() => {
    const nut = [...document.querySelectorAll("button")]
      .find((b) => b.textContent.includes("Mở trong Danh mục"));
    if (!nut) return false;
    nut.click();
    return true;
  });
  await cho(2000);

  const kq = await trang.evaluate(() => ({
    navObjects: document.querySelector('[data-cw-nav="objects"]')?.getAttribute("aria-pressed"),
    timKiem: document.querySelector('input[aria-label="Tìm trong danh mục"]')?.value ?? "",
    coChiTiet: !!document.querySelector(".lp-smart-table__detail"),
  }));
  kiem(daBam, "có lối nhảy 'Mở trong Dữ liệu nguồn' ở Tiến độ");
  kiem(kq.navObjects === "true", "deep-link mở đúng mục Đối tượng");
  kiem(maDaMo !== null && kq.timKiem === maDaMo,
    "ô tìm được điền sẵn mã đối tượng", `"${kq.timKiem}" vs "${maDaMo}"`);
  kiem(kq.coChiTiet, "dòng đối tượng được mở sẵn chi tiết");

  /* Tự xoá: rời sang Sản phẩm rồi quay lại — không dính bộ lọc cũ. */
  await trang.evaluate(() => document.querySelector('[data-cw-nav="products"]')?.click());
  await cho(700);
  await trang.evaluate(() => document.querySelector('[data-cw-nav="objects"]')?.click());
  await cho(900);
  const sau = await trang.evaluate(() => ({
    timKiem: document.querySelector('input[aria-label="Tìm trong danh mục"]')?.value ?? "",
  }));
  kiem(sau.timKiem === "", "deep-link chỉ áp một lần — quay lại không dính bộ lọc cũ",
    `"${sau.timKiem}"`);
  await trang.close();
}

/* ---- 6. Nhập Excel: preview server, lý do, commit và biên nhận ------- */
{
  console.log("\nNhập Excel:");

  /* File mẫu dựng bằng CHÍNH generator của app (qua tsx). */
  const thuMucMau = mkdtempSync(join(tmpdir(), "vmp-mau-"));
  execFileSync(process.execPath,
    ["--import", "tsx", fileURLToPath(new URL("./tao-mau-catalog.mjs", import.meta.url)), thuMucMau],
    { stdio: "pipe" });

  let stageCalls = 0;
  let reasonCalls = 0;
  const batches = [
    "d1000000-0000-4000-8000-000000000001",
    "d1000000-0000-4000-8000-000000000002",
  ];
  const previewRow = (row_number, business_key, classification, current_snapshot, patch, errors = []) => ({
    row_number, business_key, object_kind: "Thiết bị", classification,
    current_snapshot, patch, errors, row_reason: null,
  });
  const { trang } = await moTrang(trinhDuyet, { suaKho(kho) {
    kho.rpc_stage_catalog_import = () => {
      const batch_id = batches[Math.min(stageCalls, batches.length - 1)];
      stageCalls += 1;
      return { ok: true, batch_id, status: "validated", total: 4 };
    };
    kho.rpc_catalog_import_preview = (body) => {
      const clean = body.p_batch_id === batches[1];
      const allRows = [
        previewRow(2, "TB-999", "create", null, { object_code: "TB-999", object_name: "Máy mới toanh" }),
        previewRow(3, "TB-100", "update", { object_name: "Máy dập viên xoay tròn" }, { object_name: "Máy dập viên đã đổi tên" }),
        previewRow(4, "TB-101", "unchanged", { object_name: "Máy đóng nang tự động" }, {}),
        clean
          ? previewRow(5, "TB-998", "unchanged", { object_name: "Máy đã bổ sung tên" }, {})
          : previewRow(5, "TB-998", "error", null, {}, [{ code: "REQUIRED", message: "Thiếu tên đối tượng", field: "object_name" }]),
      ];
      const counts = clean
        ? { created: 1, updated: 1, unchanged: 2, errors: 0 }
        : { created: 1, updated: 1, unchanged: 1, errors: 1 };
      const second = Number(body.p_cursor ?? 0) > 0;
      return {
        ok: true,
        batch: { id: body.p_batch_id, dataset: "source_objects", status: "validated", total: 4, counts, created_at: "2026-09-01T01:00:00Z", committed_at: null },
        rows: second ? allRows.slice(2) : allRows.slice(0, 2),
        next_cursor: second ? null : 3,
      };
    };
    kho.rpc_set_catalog_import_row_reason = () => {
      reasonCalls += 1;
      return reasonCalls === 1
        ? { ok: false, error_code: "TRANSIENT", error: "Lỗi lưu lý do có chủ đích" }
        : { ok: true };
    };
    kho.rpc_commit_catalog_import = () => ({
      ok: true, created: 1, updated: 1, unchanged: 2,
      committed_at: "2026-09-01T03:15:00Z",
      pending_change_ids: ["e1000000-0000-4000-8000-000000000001"],
    });
  } });

  /* Đếm mọi request staging — file sai cấu trúc không được sinh RPC nào. */
  const gọiStaging = [];
  trang.on("request", (req) => {
    if (req.url().includes("rpc_stage_catalog_import")) gọiStaging.push(req.url());
  });

  await trang.evaluate(() => document.querySelector('[data-cw-nav="import"]')?.click());
  await cho(800);

  /* 6a. Nút tải với đúng tên file cho từng dataset. */
  const taiVe = await trang.evaluate(() => ({
    mau: document.querySelector('[data-cw-taive="mau"]')?.getAttribute("data-cw-ten-file") ?? "",
    hienTai: document.querySelector('[data-cw-taive="hientai"]')?.getAttribute("data-cw-ten-file") ?? "",
  }));
  kiem(taiVe.mau === "VMP_Mau_Doi_Tuong_Goc_v1.xlsx",
    "tên file mẫu trống đúng hợp đồng", taiVe.mau);
  kiem(taiVe.hienTai === "VMP_Doi_Tuong_Goc_Hien_Tai_v1.xlsx",
    "tên file dữ liệu hiện tại đúng hợp đồng", taiVe.hienTai);

  await trang.evaluate(() =>
    document.querySelector('[data-cw-imp-dataset="products_gmp"]')?.click());
  await cho(400);
  const taiVeSP = await trang.evaluate(() => ({
    mau: document.querySelector('[data-cw-taive="mau"]')?.getAttribute("data-cw-ten-file") ?? "",
    hienTai: document.querySelector('[data-cw-taive="hientai"]')?.getAttribute("data-cw-ten-file") ?? "",
  }));
  kiem(taiVeSP.mau === "VMP_Mau_San_Pham_GMP_v1.xlsx",
    "tên file mẫu sản phẩm đúng hợp đồng", taiVeSP.mau);
  kiem(taiVeSP.hienTai === "VMP_San_Pham_GMP_Hien_Tai_v1.xlsx",
    "tên file sản phẩm hiện tại đúng hợp đồng", taiVeSP.hienTai);
  await trang.evaluate(() =>
    document.querySelector('[data-cw-imp-dataset="source_objects"]')?.click());
  await cho(400);

  /* 6b. File sai fingerprint: từ chối rõ ràng, KHÔNG một RPC staging nào. */
  const oChonFile = await trang.$('input[aria-label="Chọn file Excel theo mẫu"]');
  kiem(!!oChonFile, "có ô chọn file có nhãn");
  if (oChonFile) {
    await oChonFile.uploadFile(join(thuMucMau, "sai-fingerprint.xlsx"));
    await cho(1200);
    const loi = await trang.evaluate(() => ({
      chu: document.querySelector(".cw-import__loi")?.textContent ?? "",
      coXemTruoc: !!document.querySelector("[data-cw-tong]"),
    }));
    kiem(loi.chu.includes("không khớp mẫu"), "file sai bị từ chối với lời giải thích", loi.chu.slice(0, 80));
    kiem(!loi.coXemTruoc, "file sai không sinh bảng xem trước");
    kiem(gọiStaging.length === 0, "file sai không sinh một RPC staging nào",
      `${gọiStaging.length} lần gọi`);
  }

  /* 6c. File hợp lệ: server phân loại, A3, phân trang và lưu lý do dòng. */
  if (oChonFile) {
    await oChonFile.uploadFile(join(thuMucMau, "hop-le.xlsx"));
    await trang.waitForSelector("[data-cw-import-preview-table]", { timeout: 15_000 });
    const kq = await trang.evaluate(() => {
      const tong = {};
      for (const o of document.querySelectorAll("[data-cw-preview-count]")) {
        tong[o.getAttribute("data-cw-preview-count")] = o.querySelector("b")?.textContent?.trim();
      }
      return {
        tong,
        coBang: !!document.querySelector("[data-cw-import-preview-table]"),
        coXuatLoi: !!document.querySelector("[data-cw-xuat-loi]"),
      };
    });
    kiem(kq.tong.create === "1" && kq.tong.update === "1" && kq.tong.unchanged === "1" && kq.tong.error === "1",
      "tổng create/update/unchanged/error đến từ server", JSON.stringify(kq.tong));
    kiem(kq.coBang, "Source dùng bảng preview server có ngữ nghĩa");
    kiem(kq.coXuatLoi, "có nút xuất sổ lỗi");

    await trang.evaluate(() => {
      const row = [...document.querySelectorAll("tbody tr")].find((item) => item.textContent?.includes("TB-100"));
      row?.querySelector("button")?.click();
    });
    await trang.waitForFunction(() => document.body.innerText.includes("Máy dập viên xoay tròn") && document.body.innerText.includes("Máy dập viên đã đổi tên"));
    kiem(true, "A3 hiển thị đúng trước → sau do server trả");

    await trang.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Tải thêm")?.click());
    await trang.waitForFunction(() => document.body.innerText.includes("TB-998"));
    kiem(true, "Tải thêm nối trang server không mất dòng");

    await trang.type("#cw-import-row-reason-3", "Chuẩn hóa tên theo hồ sơ");
    await trang.evaluate(() => document.querySelector("#cw-import-row-reason-3")?.parentElement?.querySelector("button")?.click());
    await trang.waitForFunction(() => document.body.innerText.includes("Lỗi lưu lý do có chủ đích"));
    const draftSauLoi = await trang.$eval("#cw-import-row-reason-3", (node) => node.value);
    kiem(draftSauLoi === "Chuẩn hóa tên theo hồ sơ", "lưu lý do lỗi vẫn giữ bản nháp", draftSauLoi);
    await trang.evaluate(() => document.querySelector("#cw-import-row-reason-3")?.parentElement?.querySelector("button")?.click());
    await trang.waitForFunction(() => document.querySelector("#cw-import-row-reason-3")?.parentElement?.textContent?.includes("Đã lưu"));
    kiem(true, "lưu lại lý do có phản hồi thành công");

    /* Batch đầu có lỗi nên click Ghi phải giải thích, không bị khóa im lặng. */
    await trang.evaluate(() => document.querySelector("[data-cw-ghi]")?.click());
    await trang.waitForFunction(() => document.body.innerText.includes("Còn 1 dòng lỗi"));
    const nutKhoa = await trang.$eval("[data-cw-ghi]", (node) => node.disabled);
    kiem(nutKhoa === false, "nút Ghi chỉ khóa khi đang gửi, lỗi nghiệp vụ được giải thích");

    /* Batch thứ hai sạch: thiếu lý do focus đúng ô, sau đó commit có receipt. */
    await oChonFile.uploadFile(join(thuMucMau, "hop-le.xlsx"));
    await trang.waitForFunction(() => document.querySelector('[data-cw-preview-count="error"] b')?.textContent?.trim() === "0", { timeout: 15_000 });
    await trang.evaluate(() => document.querySelector("[data-cw-ghi]")?.click());
    await trang.waitForFunction(() => document.activeElement?.id === "cw-import-batch-reason");
    kiem(true, "thiếu lý do batch thì focus đúng textarea");
    await trang.type("#cw-import-batch-reason", "Nhập theo biên bản rà soát tháng 9");
    await trang.evaluate(() => document.querySelector("[data-cw-ghi]")?.click());
    await trang.waitForSelector("[data-cw-import-receipt]", { timeout: 15_000 });
    const receipt = await trang.$eval("[data-cw-import-receipt]", (node) => node.textContent ?? "");
    kiem(receipt.includes("1 tạo mới") && receipt.includes("1 cập nhật") && receipt.includes("Mở Chờ áp dụng (1)"),
      "commit thành công giữ biên nhận và lối Chờ áp dụng", receipt.slice(0, 140));
  }

  await trang.close();
}

/* ---- 7. Ô bắt buộc không bị giấu, và mọi thao tác đều có phản hồi ---- *
 *  Hai thứ bộ cũ không phủ, mà đều là lý do người dùng nghĩ web hỏng:
 *   · nút Lưu mờ câm trong khi ô cần điền nằm trong phần Nâng cao đang
 *     đóng — bấm không có gì xảy ra, không biết phải mở cái gì ra;
 *   · lưu xong hộp thoại đóng cái rụp, không nói đã ghi hay chưa.
 * --------------------------------------------------------------------- */
{
  console.log("\nÔ bắt buộc và phản hồi thành công/thất bại:");
  const { trang, loiConsole } = await moTrang(trinhDuyet);

  // Sang mục Người nhận cảnh báo rồi mở hộp thoại tạo mới.
  await trang.evaluate(() => {
    document.querySelector('[data-cw-nav="alerts"]')?.click();
  });
  await cho(900);
  await trang.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Thêm")?.click();
  });
  await cho(600);

  const banDau = await trang.evaluate(() => ({
    moHop: !!document.querySelector(".cw-than"),
    phamVi: document.querySelector("#cw-alerts-scope_type")?.value ?? "",
    loaiCanhBao: document.querySelector("#cw-alerts-alert_kind")?.value ?? "",
    nhanBatBuoc: [...document.querySelectorAll(".cw-bat-buoc-chu")].map((o) => o.textContent.trim()),
    emailRequired: document.querySelector("#cw-alerts-email")?.required ?? null,
    nutTao: [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Tạo mới")?.disabled ?? null,
  }));
  kiem(banDau.moHop, "hộp thoại tạo người nhận mở được");
  kiem(banDau.phamVi === "tất cả", "tạo mới có sẵn Phạm vi = tất cả", banDau.phamVi);
  kiem(banDau.loaiCanhBao === "cả hai", "tạo mới có sẵn Loại cảnh báo = cả hai", banDau.loaiCanhBao);
  kiem(banDau.nhanBatBuoc.includes("Bắt buộc"), "ô bắt buộc có nhãn chữ đọc được");
  kiem(banDau.emailRequired === true, "ô Email mang thuộc tính required thật");

  /* Bấm Tạo mới khi còn trống: KHÔNG được im lặng. Con trỏ phải nhảy vào
     đúng ô còn thiếu, và dòng "Còn thiếu" phải gọi tên ô đó. */
  await trang.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Tạo mới")?.click();
  });
  await cho(400);
  const sauKhiBam = await trang.evaluate(() => ({
    oDangChon: document.activeElement?.id ?? "",
    conThieu: [...document.querySelectorAll(".cw-loi")].map((o) => o.textContent.trim()).join(" | "),
    conMo: !!document.querySelector(".cw-than"),
  }));
  kiem(sauKhiBam.oDangChon === "cw-alerts-email",
    "bấm Tạo mới khi thiếu thì con trỏ nhảy vào đúng ô", sauKhiBam.oDangChon || "(không ô nào)");
  kiem(sauKhiBam.conThieu.includes("Email"), "dòng Còn thiếu gọi đúng tên ô", sauKhiBam.conThieu.slice(0, 80));
  kiem(sauKhiBam.conMo, "thiếu ô thì hộp thoại vẫn mở, không mất dữ liệu đang gõ");

  /* Email sai định dạng phải chặn ngay tại form — luật này từng nằm chết
     trong datasetForm.ts, không file nào import. */
  await trang.evaluate(() => {
    const o = document.querySelector("#cw-alerts-email");
    const dat = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    dat.call(o, "sai@");
    o.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await cho(300);
  const emailSai = await trang.evaluate(() => ({
    loi: [...document.querySelectorAll(".cw-loi")].map((o) => o.textContent.trim()).join(" | "),
    coToast: !!document.querySelector(".vmp-toast--thanhCong"),
  }));
  kiem(emailSai.loi.includes("Email không hợp lệ"), "email sai định dạng bị chặn tại form",
    emailSai.loi.slice(0, 80));
  kiem(!emailSai.coToast, "email sai thì không có toast thành công nào");

  /* Email hợp lệ rồi bấm lưu: dù server giả lập trả gì, PHẢI có phản hồi. */
  await trang.evaluate(() => {
    const o = document.querySelector("#cw-alerts-email");
    const dat = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    dat.call(o, "nguoi.moi@example.com");
    o.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await cho(300);
  await trang.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Tạo mới")?.click();
  });
  await cho(1500);
  const sauLuu = await trang.evaluate(() => {
    const toast = document.querySelector(".vmp-toast");
    return {
      coToast: !!toast,
      loaiToast: toast?.getAttribute("data-vmp-toast") ?? "",
      chuToast: toast?.textContent?.trim() ?? "",
      conMo: !!document.querySelector(".cw-than"),
    };
  });
  kiem(sauLuu.coToast, "lưu xong luôn có phản hồi trên màn hình", sauLuu.chuToast.slice(0, 60));
  kiem(sauLuu.loaiToast !== "dang",
    "toast được chốt thành công hoặc thất bại, không treo ở 'đang chạy'", sauLuu.loaiToast);
  // Lưu hỏng thì hộp thoại phải còn nguyên để người dùng không gõ lại từ đầu.
  kiem(sauLuu.loaiToast !== "loi" || sauLuu.conMo,
    "lưu hỏng thì hộp thoại vẫn mở", `${sauLuu.loaiToast}/${sauLuu.conMo}`);

  kiem(loiConsole.length === 0, "không lỗi console", loiConsole.join(" · ").slice(0, 160));
  await trang.close();
}

/* ---- 8. Ô danh mục mở phải cho thấy TOÀN BỘ giá trị đang có ---------- *
 *  Bản đầu dựng các ô này bằng `<input list>` + datalist. Trình duyệt tự
 *  lọc gợi ý theo chữ đang có trong ô, nên một đối tượng đã mang "Line 1"
 *  thì bấm xuống chỉ thấy đúng một dòng — người dùng tưởng hệ thống chỉ
 *  biết một giá trị và gõ tay lại từ đầu. Đây là phép kiểm chặn nó quay lại.
 * --------------------------------------------------------------------- */
{
  console.log("\nÔ khu vực / line cho thấy đủ danh sách:");
  const { trang, loiConsole } = await moTrang(trinhDuyet);

  // Mở form sửa của đối tượng đầu tiên.
  await trang.evaluate(() => {
    const nut = [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Sửa" || b.getAttribute("data-cw-sua") !== null);
    nut?.click();
  });
  await cho(900);

  const o = await trang.evaluate(() => {
    const doc = (id) => {
      const el = document.getElementById(id);
      if (!el) return { co: false };
      return {
        co: true,
        the: el.tagName.toLowerCase(),
        soLuaChon: el.tagName.toLowerCase() === "select" ? el.options.length : 0,
        nhan: el.tagName.toLowerCase() === "select"
          ? [...el.options].map((x) => x.textContent.trim()) : [],
        giaTri: el.value,
      };
    };
    return { moHop: !!document.querySelector(".cw-than"), kv: doc("cof-area_code"), line: doc("cof-line") };
  });

  kiem(o.moHop, "form sửa đối tượng mở được");
  kiem(o.kv.the === "select", "ô Khu vực là ô chọn, không phải ô gõ tự do", String(o.kv.the));
  kiem(o.line.the === "select", "ô Line là ô chọn, không phải ô gõ tự do", String(o.line.the));
  /* Kho giả lập có 3 khu vực và 2 line: cộng mục "— chọn —" và mục "Khác"
     là 5 và 4. Kiểm số thật chứ không kiểm "nhiều hơn 1" — datalist lọc
     nhầm vẫn cho ra 2 mục và sẽ lọt. */
  kiem(o.kv.soLuaChon === 5, "ô Khu vực hiện đủ 3 khu vực + chọn + Khác", String(o.kv.soLuaChon));
  kiem(o.line.soLuaChon === 4, "ô Line hiện đủ 2 line + chọn + Khác", String(o.line.soLuaChon));
  kiem(o.kv.nhan.some((n) => n.startsWith("Khác")), "ô Khu vực có lối thoát nhập giá trị mới",
    o.kv.nhan.join(" / ").slice(0, 90));
  kiem(o.kv.giaTri !== "", "giá trị khu vực đang có của bản ghi được chọn sẵn", o.kv.giaTri);

  kiem(loiConsole.length === 0, "không lỗi console", loiConsole.join(" · ").slice(0, 160));
  await trang.close();
}

/* ---- 9. V2: ghi đè deadline khi hạng mục đã có tiến độ -------------- */
{
  console.log("\nGhi đè deadline V2 — thành công:");
  const {
    trang, loiConsole, chanNgoai, applyBodies, applyResults, previewBodies, previewResults, saveBodies, saveResults,
  } = await moXemTruocDeadlineV2(undefined, true);

  const modalOverChat = await trang.evaluate(() => {
    const panel = document.querySelector(".lp-dialog__panel");
    const footer = panel?.querySelector(".lp-dialog__footer");
    const chat = document.querySelector(".vmp-chat-panel");
    if (!(panel instanceof HTMLElement) || !(footer instanceof HTMLElement) || !(chat instanceof HTMLElement)) {
      return { shared: false, intersectsChatAtRightEdge: false, topAtIntersection: false, tabStaysInside: false };
    }
    const footerBox = footer.getBoundingClientRect();
    const chatBox = chat.getBoundingClientRect();
    const left = Math.max(footerBox.left, chatBox.left);
    const right = Math.min(footerBox.right, chatBox.right);
    const top = Math.max(footerBox.top, chatBox.top);
    const bottom = Math.min(footerBox.bottom, chatBox.bottom);
    const intersectsChatAtRightEdge = right > left && bottom > top && right >= footerBox.right - 1;
    const target = intersectsChatAtRightEdge
      ? document.elementFromPoint(right - 1, top + Math.min(20, bottom - top - 1))
      : null;
    const focusable = [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (last instanceof HTMLElement) last.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    return {
      shared: true,
      intersectsChatAtRightEdge,
      topAtIntersection: target instanceof Element && target.closest(".lp-dialog__footer") !== null,
      tabWrapsToFirst: document.activeElement === first,
    };
  });
  kiem(modalOverChat.shared && modalOverChat.intersectsChatAtRightEdge && modalOverChat.topAtIntersection && modalOverChat.tabWrapsToFirst,
    "preview giao với chat tại mép phải footer, footer phủ trên chat và Tab vòng trong hộp", JSON.stringify(modalOverChat));

  const preview = await trang.evaluate((label) => {
    const candidate = [...document.querySelectorAll('input[type="checkbox"]')]
      .find((input) => input.getAttribute("aria-label") === label);
    const article = candidate?.closest("article");
    return { unchecked: candidate?.checked === false, text: article?.textContent ?? "" };
  }, nhanChonDeadlineV2);
  kiem(preview.unchecked, "candidate deadline V2 bắt đầu chưa được chọn");
  for (const text of [
    MA_HANG_MUC_V2,
    "actual_validation_date: 20/03/2026",
    "30/06/2026", "18/01/2026",
    "31/07/2026", "24/03/2026",
    "15/08/2026", "26/03/2026",
    "31/08/2026", "31/03/2026",
  ]) {
    kiem(preview.text.includes(text), `candidate V2 hiển thị ${text}`, preview.text.slice(0, 240));
  }
  kiem(JSON.stringify(saveBodies.map((body) => body?.p_object_code)) === JSON.stringify(["CCTB01"]),
    "save V2 liên kết cùng đối tượng CCTB01", JSON.stringify(saveBodies));
  kiem(JSON.stringify(saveResults) === JSON.stringify([expectedSaveResultV2()]),
    "save V2 trả UUID/change/revision đã duyệt", JSON.stringify(saveResults));
  kiem(JSON.stringify(previewBodies) === JSON.stringify([{ p_change_id: CHANGE_ID_V2 }]),
    "preview V2 dùng đúng UUID change đã lưu", JSON.stringify(previewBodies));
  kiem(previewResults.length === 1
    && previewResults[0]?.object_code === "CCTB01"
    && previewResults[0]?.change_id === CHANGE_ID_V2
    && previewResults[0]?.timeline_revision === REVISION_V2
    && JSON.stringify(previewResults[0]?.giu_nguyen) === JSON.stringify([{
      validation_code: MA_HANG_MUC_V2,
      ly_do: "Đã có tiến độ; chỉ cập nhật deadline kế hoạch khi xác nhận đặc biệt",
    }]),
  "preview V2 giữ base giu_nguyen cùng candidate progressed", JSON.stringify(previewResults));

  await chuanBiApDeadlineV2(trang);
  await bamApDeadlineV2(trang);
  await trang.waitForFunction(() => document.querySelector('.vmp-toast[data-vmp-toast="thanhCong"]')
    ?.textContent?.includes("Đã áp thay đổi vào timeline") === true, { timeout: 10_000 });
  await trang.waitForFunction(() => ![...document.querySelectorAll('.lp-dialog__panel[role="dialog"] .lp-dialog__title')]
    .some((node) => node.textContent?.trim() === "Ảnh hưởng tới timeline"), { timeout: 10_000 });
  const success = await trang.evaluate(() => ({
    toast: document.querySelector('.vmp-toast[data-vmp-toast="thanhCong"]')?.textContent ?? "",
    dialogConMo: [...document.querySelectorAll('.lp-dialog__panel[role="dialog"] .lp-dialog__title')]
      .some((node) => node.textContent?.trim() === "Ảnh hưởng tới timeline"),
  }));
  kiem(JSON.stringify(applyBodies) === JSON.stringify([expectedApplyBodyV2()]),
    "apply V2 gửi đúng change/version/override/xác nhận", JSON.stringify(applyBodies));
  kiem(JSON.stringify(applyResults) === JSON.stringify([expectedApplySuccessV2()]),
    "apply V2 trả đủ hợp đồng so_deadline_override đã duyệt", JSON.stringify(applyResults));
  kiem(success.toast.includes("Đã áp thay đổi vào timeline"), "toast báo áp timeline thành công", success.toast);
  kiem(!success.dialogConMo, "áp thành công đóng hộp xem trước timeline");
  kiem(loiConsole.length === 0, "không lỗi console ở luồng override V2", loiConsole.join(" · ").slice(0, 160));
  kiem(chanNgoai.length === 0, "override V2 không gọi ra ngoài", chanNgoai[0] || "");
  await trang.close();
}

const LOI_AP_DUNG_V2 = [
  {
    code: "MISSING_SOURCE_DATA",
    response: {
      ok: false,
      error_code: "MISSING_SOURCE_DATA",
      error: "Không tính đủ deadline cho CCTB01/2026.01-PQ",
      missing: [{ validation_code: MA_HANG_MUC_V2, fields: ["Tháng thẩm định đầu tiên"] }],
    },
    phaiThay: ["Không tính đủ deadline cho CCTB01/2026.01-PQ", "thiếu: Tháng thẩm định đầu tiên"],
    giuTrangThai: false,
  },
  {
    code: "VERSION_CONFLICT",
    response: {
      ok: false,
      error_code: "VERSION_CONFLICT",
      error: "Timeline đã đổi — xem trước lại",
      expected_timeline_revision: REVISION_V2,
      current_timeline_revision: 4,
    },
    phaiThay: ["Timeline đã đổi — xem trước lại"],
    giuTrangThai: true,
  },
  {
    code: "ITEM_STATE_CHANGED",
    response: {
      ok: false,
      error_code: "ITEM_STATE_CHANGED",
      error: "Hạng mục CCTB01/2026.01-PQ đã đổi sau khi xem trước; hãy xem trước lại",
      validation_code: MA_HANG_MUC_V2,
      expected_item_version: VERSION_HANG_MUC_V2,
      current_item_version: 8,
      requires_fresh_preview: true,
    },
    phaiThay: ["Hạng mục CCTB01/2026.01-PQ đã đổi sau khi xem trước; hãy xem trước lại"],
    giuTrangThai: false,
  },
  {
    code: "FORBIDDEN",
    response: {
      ok: false,
      error_code: "FORBIDDEN",
      error: "Chỉ Admin và Quản lý QA được cập nhật deadline của hạng mục đã có tiến độ",
    },
    phaiThay: ["Chỉ Admin và Quản lý QA được cập nhật deadline của hạng mục đã có tiến độ"],
    giuTrangThai: false,
  },
];

for (const scenario of LOI_AP_DUNG_V2) {
  console.log(`\nGhi đè deadline V2 — ${scenario.code}:`);
  const { trang, loiConsole, chanNgoai, applyBodies, applyResults } = await moXemTruocDeadlineV2(scenario.response);
  await chuanBiApDeadlineV2(trang);
  await bamApDeadlineV2(trang);
  await trang.waitForSelector('[role="alert"]', { timeout: 10_000 });
  await trang.evaluate(() => new Promise((resolve) => requestAnimationFrame(
    () => requestAnimationFrame(resolve),
  )));

  const failure = await trang.evaluate((label, reason) => {
    const candidate = [...document.querySelectorAll('input[type="checkbox"]')]
      .find((input) => input.getAttribute("aria-label") === label);
    const confirmation = [...document.querySelectorAll("label")]
      .find((node) => node.textContent?.includes("Tôi xác nhận chỉ cập nhật các deadline kế hoạch đã chọn"))
      ?.querySelector('input[type="checkbox"]');
    return {
      alert: document.querySelector('[role="alert"]')?.textContent ?? "",
      dialogConMo: [...document.querySelectorAll('.lp-dialog__panel[role="dialog"] .lp-dialog__title')]
        .some((node) => node.textContent?.trim() === "Ảnh hưởng tới timeline"),
      candidateDuocChon: candidate?.checked === true,
      lyDoConLai: document.querySelector('input[placeholder="Câu này đi vào nhật ký, người sau đọc để hiểu vì sao timeline đổi."]')?.value === reason,
      daXacNhan: confirmation?.checked === true,
    };
  }, nhanChonDeadlineV2, LY_DO_AP_V2);

  for (const text of scenario.phaiThay) {
    kiem(failure.alert.includes(text), `${scenario.code} hiện đúng lỗi: ${text}`, failure.alert);
  }
  kiem(failure.dialogConMo, `${scenario.code} giữ hộp xem trước mở`);
  kiem(JSON.stringify(applyBodies) === JSON.stringify([expectedApplyBodyV2()]),
    `${scenario.code} chỉ gọi đúng một mutation`, JSON.stringify(applyBodies));
  kiem(JSON.stringify(applyResults) === JSON.stringify([scenario.response]),
    `${scenario.code} trả đúng payload RPC đã duyệt`, JSON.stringify(applyResults));
  if (scenario.giuTrangThai) {
    kiem(failure.candidateDuocChon && failure.lyDoConLai && failure.daXacNhan,
      "VERSION_CONFLICT giữ lựa chọn, lý do và xác nhận", JSON.stringify(failure));
  }
  kiem(loiConsole.length === 0, `${scenario.code} không lỗi console`, loiConsole.join(" · ").slice(0, 160));
  kiem(chanNgoai.length === 0, `${scenario.code} không gọi ra ngoài`, chanNgoai[0] || "");
  await trang.close();
}

/* ---- 10. V2 chưa có: chỉ fallback chính xác, không hạ an toàn -------- */
{
  console.log("\nCatalog V2 fallback — preview PGRST202:");
  const { trang, loiConsole, chanNgoai, v2PreviewBodies, v1PreviewBodies, v1ApplyBodies, rpcSequence } = await moXemTruocFallbackV2({
    previewV2Error: { status: 404, code: "PGRST202", message: "V2 chưa được triển khai" },
  });
  await trang.waitForFunction(() => [...document.querySelectorAll('.lp-dialog__panel[role="dialog"] .lp-dialog__title')]
    .some((node) => node.textContent?.trim() === "Ảnh hưởng tới timeline"), { timeout: 10_000 });
  /* Tiêu đề hộp thoại xuất hiện ngay khi effect preview BẮT ĐẦU, nên không
     chứng minh fallback V1 đã trả về. Đợi hết trạng thái tải — khi đó RPC
     V1 đã được mock ghi nhận trước lúc React vẽ kết quả. */
  await trang.waitForFunction(() => !document.body.innerText.includes("Đang tính ảnh hưởng…"), { timeout: 10_000 });
  const state = await trang.evaluate((label) => ({
    hasOverrideCheckbox: [...document.querySelectorAll('input[type="checkbox"]')]
      .some((input) => input.getAttribute("aria-label") === label),
    hasAlert: !!document.querySelector('[role="alert"]'),
  }), nhanChonDeadlineV2);
  kiem(JSON.stringify(v2PreviewBodies) === JSON.stringify([{ p_change_id: CHANGE_ID_V2 }]),
    "PGRST202 preview gọi V2 trước với đúng change id", JSON.stringify(v2PreviewBodies));
  kiem(JSON.stringify(v1PreviewBodies) === JSON.stringify([{ p_change_id: CHANGE_ID_V2 }]),
    "PGRST202 preview sau đó fallback V1 với đúng change id", JSON.stringify(v1PreviewBodies));
  kiem(JSON.stringify(rpcSequence) === JSON.stringify([
    { rpc: "rpc_preview_catalog_change_v2", body: { p_change_id: CHANGE_ID_V2 } },
    { rpc: "rpc_preview_catalog_change", body: { p_change_id: CHANGE_ID_V2 } },
  ]), "PGRST202 preview theo đúng thứ tự V2 rồi V1", JSON.stringify(rpcSequence));
  kiem(v1ApplyBodies.length === 0, "PGRST202 preview chưa tạo mutation V1");
  kiem(!state.hasOverrideCheckbox, "preview V1 không mở lối ghi đè deadline");
  kiem(!state.hasAlert, "PGRST202 preview fallback không báo lỗi giả");
  kiem(chanNgoai.length === 0, "PGRST202 preview fallback không gọi ra ngoài", chanNgoai[0] || "");
  await trang.close();
}

{
  console.log("\nCatalog V2 fallback — apply 42883 không có override:");
  const { trang, loiConsole, chanNgoai, v2ApplyBodies, v1ApplyBodies, rpcSequence } = await moXemTruocFallbackV2({
    applyV2Error: { status: 404, code: "42883", message: "V2 chưa được triển khai" },
  });
  await trang.waitForFunction(() => [...document.querySelectorAll('.lp-dialog__panel[role="dialog"] .lp-dialog__title')]
    .some((node) => node.textContent?.trim() === "Ảnh hưởng tới timeline"), { timeout: 10_000 });
  rpcSequence.splice(0);
  await chuanBiApV1(trang);
  await bamApDeadlineV2(trang);
  await trang.waitForFunction(() => document.querySelector('.vmp-toast[data-vmp-toast="thanhCong"]')
    ?.textContent?.includes("Đã áp thay đổi vào timeline") === true, { timeout: 10_000 });
  kiem(JSON.stringify(v2ApplyBodies) === JSON.stringify([expectedApplyBodyV2WithoutOverride()]),
    "42883 apply gọi V2 trước với body không override đầy đủ", JSON.stringify(v2ApplyBodies));
  kiem(JSON.stringify(v1ApplyBodies) === JSON.stringify([expectedApplyBodyV1()]),
    "42883 apply sau đó fallback giữ nguyên body V1", JSON.stringify(v1ApplyBodies));
  const applySequence = rpcSequence.filter(({ rpc }) => rpc.includes("apply_catalog_change"));
  kiem(JSON.stringify(applySequence) === JSON.stringify([
    { rpc: "rpc_apply_catalog_change_v2", body: expectedApplyBodyV2WithoutOverride() },
    { rpc: "rpc_apply_catalog_change", body: expectedApplyBodyV1() },
  ]), "42883 apply theo đúng thứ tự V2 rồi V1 với body đầy đủ", JSON.stringify(applySequence));
  kiem(chanNgoai.length === 0, "42883 apply fallback không gọi ra ngoài", chanNgoai[0] || "");
  await trang.close();
}

{
  console.log("\nCatalog V2 fallback — PGRST203 không được hạ về V1:");
  const { trang, loiConsole, chanNgoai, v2PreviewBodies, v1PreviewBodies, v1ApplyBodies, rpcSequence } = await moXemTruocFallbackV2({
    previewV2Error: { status: 400, code: "PGRST203", message: "RPC overload mơ hồ" },
  });
  await trang.waitForSelector('[role="alert"]', { timeout: 10_000 });
  const state = await trang.evaluate(() => ({
    alert: document.querySelector('[role="alert"]')?.textContent ?? "",
    dialogOpen: [...document.querySelectorAll('.lp-dialog__panel[role="dialog"] .lp-dialog__title')]
      .some((node) => node.textContent?.trim() === "Ảnh hưởng tới timeline"),
  }));
  kiem(JSON.stringify(v2PreviewBodies) === JSON.stringify([{ p_change_id: CHANGE_ID_V2 }]),
    "PGRST203 gọi đúng V2 preview trước khi báo lỗi", JSON.stringify(v2PreviewBodies));
  kiem(v1PreviewBodies.length === 0 && v1ApplyBodies.length === 0,
    "PGRST203 không gọi bất kỳ RPC V1 nào", JSON.stringify({ v1PreviewBodies, v1ApplyBodies }));
  kiem(JSON.stringify(rpcSequence) === JSON.stringify([
    { rpc: "rpc_preview_catalog_change_v2", body: { p_change_id: CHANGE_ID_V2 } },
  ]), "PGRST203 chỉ gọi V2, không có fallback", JSON.stringify(rpcSequence));
  kiem(state.dialogOpen && state.alert.includes("RPC overload mơ hồ"),
    "PGRST203 giữ hộp và hiện lỗi thật", JSON.stringify(state));
  kiem(chanNgoai.length === 0, "PGRST203 không gọi ra ngoài", chanNgoai[0] || "");
  await trang.close();
}

{
  console.log("\nCatalog V2 fallback — đã chọn override thì phải chặn:");
  const { trang, loiConsole, chanNgoai, v2ApplyBodies, v1ApplyBodies, rpcSequence } = await moXemTruocFallbackV2({
    applyV2Error: { status: 404, code: "PGRST202", message: "V2 chưa được triển khai" },
    previewV2: XEM_TRUOC_V2_CO_GHI_DE,
  });
  await trang.waitForFunction((label) => [...document.querySelectorAll('input[type="checkbox"]')]
    .some((input) => input.getAttribute("aria-label") === label), { timeout: 10_000 }, nhanChonDeadlineV2);
  rpcSequence.splice(0);
  await chuanBiApDeadlineV2(trang);
  await bamApDeadlineV2(trang);
  await trang.waitForSelector('[role="alert"]', { timeout: 10_000 });
  const state = await trang.evaluate((label, reason) => ({
    alert: document.querySelector('[role="alert"]')?.textContent ?? "",
    dialogOpen: [...document.querySelectorAll('.lp-dialog__panel[role="dialog"] .lp-dialog__title')]
      .some((node) => node.textContent?.trim() === "Ảnh hưởng tới timeline"),
    selected: [...document.querySelectorAll('input[type="checkbox"]')]
      .some((input) => input.getAttribute("aria-label") === label && input.checked),
    reason: document.querySelector('input[placeholder="Câu này đi vào nhật ký, người sau đọc để hiểu vì sao timeline đổi."]')?.value === reason,
  }), nhanChonDeadlineV2, LY_DO_AP_V2);
  kiem(JSON.stringify(v2ApplyBodies) === JSON.stringify([expectedApplyBodyV2()]),
    "override đã chọn gọi đúng V2 apply trước khi bị chặn", JSON.stringify(v2ApplyBodies));
  kiem(v1ApplyBodies.length === 0, "override đã chọn không được fallback sang V1");
  const applySequence = rpcSequence.filter(({ rpc }) => rpc.includes("apply_catalog_change"));
  kiem(JSON.stringify(applySequence) === JSON.stringify([
    { rpc: "rpc_apply_catalog_change_v2", body: expectedApplyBodyV2() },
  ]), "override đã chọn chỉ gọi V2, không có fallback", JSON.stringify(applySequence));
  kiem(state.dialogOpen && state.selected && state.reason && state.alert.includes("V2 chưa được triển khai"),
    "override bị chặn nhưng giữ nguyên bằng chứng người dùng đã nhập", JSON.stringify(state));
  kiem(chanNgoai.length === 0, "override bị chặn không gọi ra ngoài", chanNgoai[0] || "");
  await trang.close();
}

await trinhDuyet.close();

console.log(`\n${"─".repeat(52)}`);
console.log(`${soDat} đạt · ${soHong} hỏng`);
if (soHong > 0) { console.error("KHÔNG ĐẠT."); process.exit(1); }
console.log("ĐẠT.");

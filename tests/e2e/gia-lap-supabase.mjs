/* =====================================================================
 *  gia-lap-supabase.mjs — Supabase giả lập cho bộ kiểm thẩm mỹ
 *  ---------------------------------------------------------------------
 *  Vì sao cần: bộ kiểm thẩm mỹ phải mở được cả 17 màn, mà mọi màn đều
 *  đứng sau cửa đăng nhập. Dự án hiện chỉ có MỘT project Supabase và nó
 *  là production — mở bộ kiểm giao diện lên đó nghĩa là mỗi lần chạy lại
 *  đọc dữ liệu thật của nhà máy.
 *
 *  Ở đây không có kết nối nào ra ngoài. Toàn bộ request tới Supabase bị
 *  chặn ở tầng trình duyệt và trả lời bằng dữ liệu dựng sẵn. Đổi lại,
 *  đây KHÔNG phải bộ kiểm nghiệp vụ: nó không chứng minh số liệu đúng,
 *  chỉ chứng minh giao diện dựng đúng với một dữ liệu cho trước.
 *
 *  Hai kịch bản, vì hai kịch bản này hỏng theo hai kiểu khác nhau:
 *    · "rong"  — mọi RPC trả rỗng. Bắt lỗi màn trắng, lỗi "0 hạng mục"
 *                hiện ra như thể dữ liệu chưa tải xong.
 *    · "day"   — có dữ liệu mẫu. Bắt lỗi tràn bảng, chữ chồng, màu loạn.
 * ===================================================================== */

/** Lấy project ref y như supabase-js: phần đầu của hostname. */
export function layRef(url) {
  return new URL(url).hostname.split(".")[0];
}

const NGUOI_DUNG = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "kiem-thu@vi-du.test",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  user_metadata: { full_name: "Người kiểm thử" },
  app_metadata: { provider: "email" },
  created_at: "2026-01-01T00:00:00Z",
};

/** Phiên giả có hạn xa, để supabase-js không đi làm mới token qua mạng. */
export function phienGia() {
  const hetHan = Math.floor(Date.now() / 1000) + 60 * 60 * 8;
  return {
    access_token: "gia-lap-khong-phai-token-that",
    token_type: "bearer",
    expires_in: 28_800,
    expires_at: hetHan,
    refresh_token: "gia-lap-refresh",
    user: NGUOI_DUNG,
  };
}

/* ------------------------------------------------------------------ *
 *  Dữ liệu mẫu
 * ------------------------------------------------------------------ */

const BO_PHAN = ["xsx", "cd", "kho", "qc", "rd", "qa"];
const TRANG_THAI = ["chua", "dang_dc", "cho_td", "dang_td", "cho_bc", "bc", "done"];
const LOAI = ["IQ", "OQ", "PQ", "PV", "GSP"];

const TEN_DOI_TUONG = [
  "Máy dập viên xoay tròn", "Máy đóng nang tự động", "Nồi bao phim",
  "Máy trộn cao tốc", "Hệ thống nước tinh khiết RO", "Tủ sấy tầng sôi",
  "Máy ép vỉ", "Hệ thống khí nén sạch", "Kho lạnh bảo quản vaccine",
  "Xe tải lạnh vận chuyển", "Máy đo độ hoà tan", "Cân phân tích",
];

/** Ngày dạng chuỗi, lệch `lech` ngày so với mốc cố định của bộ kiểm.
 *  Dùng mốc cố định thay vì hôm nay để hai lần chạy cho cùng kết quả. */
function ngay(lech) {
  const goc = new Date("2026-08-15T00:00:00Z");
  goc.setDate(goc.getDate() + lech);
  return goc.toISOString().slice(0, 10);
}

function dungHangMuc(i) {
  const bo = BO_PHAN[i % BO_PHAN.length];
  const tt = TRANG_THAI[i % TRANG_THAI.length];
  const loai = LOAI[i % LOAI.length];
  const ten = TEN_DOI_TUONG[i % TEN_DOI_TUONG.length];
  const maDoiTuong = `TB-${String(100 + i).padStart(3, "0")}`;
  // Rải mốc: một phần quá hạn, một phần sắp tới, còn lại còn xa.
  const lech = [-45, -12, -3, 5, 20, 60, 120][i % 7];

  const raw = {
    validation_code: `${maDoiTuong}-${loai}`,
    object_code: maDoiTuong,
    object_name: ten,
    validation_type: loai,
    department: bo,
    exec_depts: [bo],
    owner_name: `Người phụ trách ${(i % 5) + 1}`,
    support_name: `Hỗ trợ ${(i % 3) + 1}`,
    year: 2026,
    state: "active",
    status: tt,
    computed_status: tt,
    criticality: ["Cao", "TB", "Thấp"][i % 3],
    criticality_score: (i % 9) + 1,
    classification: ["tb", "qt", "kho", "ht", "vc"][i % 5],
    dl_vmp: ngay(lech),
    target_date: ngay(lech),
    protocol_date: ngay(lech - 30),
    validation_date: tt === "chua" ? null : ngay(lech - 15),
    report_date: tt === "done" ? ngay(lech - 2) : null,
    protocol_done: tt !== "chua",
    validation_done: ["cho_bc", "bc", "done"].includes(tt),
    report_done: tt === "done",
    updated_at: "2026-08-15T02:00:00Z",
  };

  return {
    id: raw.validation_code,
    code: raw.validation_code,
    obj: maDoiTuong,
    objName: ten,
    name: ten,
    type: loai,
    vtype: loai,
    cls: raw.classification,
    dept: bo,
    depts: [bo],
    execDepts: [bo],
    owner: raw.owner_name,
    owner_name: raw.owner_name,
    year: 2026,
    state: "active",
    crit: raw.criticality,
    score: raw.criticality_score,
    _raw: raw,
  };
}

function dungDoiTuong(i) {
  const ten = TEN_DOI_TUONG[i % TEN_DOI_TUONG.length];
  return {
    code: `TB-${String(100 + i).padStart(3, "0")}`,
    name: ten,
    object_name: ten,
    dept: BO_PHAN[i % BO_PHAN.length],
    department: BO_PHAN[i % BO_PHAN.length],
    cls: ["tb", "qt", "kho", "ht", "vc"][i % 5],
    classification: ["tb", "qt", "kho", "ht", "vc"][i % 5],
    kind: ["Thiết bị", "Quy trình", "Kho", "Hệ thống phụ trợ", "Vận chuyển"][i % 5],
    object_code: `TB-${String(100 + i).padStart(3, "0")}`,
    validate_flag: "y",
    frequency_months: 12,
    first_month: (i % 12) + 1,
    is_active: true,
    active: true,
  };
}

/** Toàn bộ quyền màn hình — bộ kiểm cần mở được mọi màn. */
function quyenDayDu() {
  const man = [
    "today", "overview", "timeline", "alerts", "progress", "source",
    "workload", "reports", "rules", "people", "accounts", "phanquyen",
    "health", "audit", "admin", "chat", "risk",
  ];
  const screens = {};
  for (const m of man) {
    screens[m] = { can_view: true, scope: "all", actions: ["view", "edit", "export", "manage"] };
  }
  return {
    mode: "enforced",
    business_role: "quan_ly_chat_luong",
    person_id: NGUOI_DUNG.id,
    screens,
  };
}

/* ------------------------------------------------------------------ *
 *  Bảng tra câu trả lời
 * ------------------------------------------------------------------ */

export function dungKhoDuLieu(kichBan) {
  const day = kichBan === "day";
  const soHangMuc = day ? 24 : 0;

  const hangMuc = Array.from({ length: soHangMuc }, (_, i) => dungHangMuc(i));
  const doiTuong = Array.from({ length: day ? 12 : 0 }, (_, i) => dungDoiTuong(i));

  const nhanSu = Array.from({ length: day ? 6 : 0 }, (_, i) => ({
    id: `pf-${i}`,
    person_id: `pf-${i}`,
    full_name: `Người phụ trách ${i + 1}`,
    name: `Người phụ trách ${i + 1}`,
    email: `nguoi${i + 1}@vi-du.test`,
    department: BO_PHAN[i % BO_PHAN.length],
    dept: BO_PHAN[i % BO_PHAN.length],
    role: ["qa", "xuong", "viewer"][i % 3],
    access_class: ["qa", "xuong", "viewer"][i % 3],
    is_active: true,
    active: true,
    user_id: i === 0 ? NGUOI_DUNG.id : null,
  }));

  return {
    /* --- Auth --- */
    "/auth/v1/token": phienGia(),
    "/auth/v1/user": NGUOI_DUNG,

    /* --- Bảng --- */
    profiles: [{
      id: NGUOI_DUNG.id,
      email: NGUOI_DUNG.email,
      full_name: "Người kiểm thử",
      role: "admin",
      is_active: true,
    }],
    vmp_performers: nhanSu,
    vmp_source_objects: doiTuong,
    vmp_source_rows: [],
    vmp_products_gmp: day ? [{ id: 1, product_name: "Paracetamol 500mg", dosage_form: "Viên nén", is_active: true }] : [],
    vmp_alert_recipients: day ? [{ id: 1, email: "canh-bao@vi-du.test", is_active: true }] : [],
    vmp_staff_emails: day ? [{ id: 1, email: "nhan-vien@vi-du.test", full_name: "Nhân viên mẫu" }] : [],
    vmp_email_cho_phep: day ? [{ email: "kiem-thu@vi-du.test", role: "admin" }] : [],
    vmp_role_permissions: [],
    vmp_assignment_matrix: [],
    audit_logs: day ? Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      action: ["create", "update", "delete"][i % 3],
      table_name: "vmp_plan_items",
      record_id: `TB-${100 + i}-IQ`,
      actor_email: NGUOI_DUNG.email,
      created_at: `2026-08-${String(8 + i).padStart(2, "0")}T03:00:00Z`,
      changes: { status: { from: "chua", to: "dang_dc" } },
    })) : [],

    /* --- RPC --- */
    rpc_my_ui_access: quyenDayDu(),
    item_permissions_mode: "preview",
    vmp_my_item_rights: [],
    rpc_get_vmp_dashboard: {
      activities: hangMuc,
      objects: doiTuong,
      updated_at: "2026-08-15T02:00:00Z",
    },
    rpc_get_vmp_watermark: { year: 2026, plan_items: soHangMuc, objects: doiTuong.length, updated_at: "2026-08-15T02:00:00Z" },
    rpc_get_missing_items: [],
    rpc_dashboard_kpi: day
      ? { total: 24, done: 6, overdue: 4, soon: 3, in_progress: 11, rate: 25 }
      : { total: 0, done: 0, overdue: 0, soon: 0, in_progress: 0, rate: 0 },
    rpc_due_alerts: day ? hangMuc.slice(0, 7).map((a) => ({
      validation_code: a.code,
      object_name: a.objName,
      department: a.dept,
      stage: "validation",
      due_date: a._raw.dl_vmp,
      days_left: -12,
      kind: "over",
    })) : [],
    rpc_generate_timeline: day ? hangMuc.slice(0, 12).map((a) => ({
      validation_code: a.code,
      object_code: a.obj,
      object_name: a.objName,
      department: a.dept,
      target_date: a._raw.dl_vmp,
      status: a._raw.status,
    })) : [],
    rpc_check_data_quality: [],
    rpc_source_warnings: {
      nam: 2026,
      thieu_thang_dau: day ? [{ object_kind: "Thiết bị", object_code: "TB-107", object_name: "Máy ép vỉ" }] : [],
      chua_tung_iq: [],
      show_tat: [],
      chua_hoat_dong: [],
      ma_tam: [],
    },
    rpc_get_audit_logs: [],
    rpc_active_rules: {
      deadline_rules: day ? [{ code: "R1", name: "Hạn đề cương trước 30 ngày", value: 30 }] : [],
      alert_rules: [],
      updated_at: "2026-08-15T02:00:00Z",
    },
    rpc_trang_thai_he_thong: {
      supabase: "ok", n8n: "ok", last_sync: "2026-08-15T02:00:00Z",
      plan_items: soHangMuc, objects: doiTuong.length,
    },
    rpc_list_source_tabs: day
      ? [{ source_tab: "thiet_bi", rows: 12, columns: 9 }]
      : [],
  };
}

/* ------------------------------------------------------------------ *
 *  Cài vào một trang Puppeteer
 * ------------------------------------------------------------------ */

/**
 * Chặn mạng và trả lời thay Supabase.
 *
 * PHẢI gọi TRƯỚC lần điều hướng đầu tiên của trang. Mọi host ngoài
 * loopback và Google Fonts đều bị chặn — nếu một request lạ lọt ra ngoài
 * thì nó bị huỷ, và số lần huỷ được trả về để bộ kiểm tự tố cáo chính nó.
 */
export async function caiGiaLap(trang, { supabaseUrl, kichBan = "day" } = {}) {
  const kho = dungKhoDuLieu(kichBan);
  const hostSupabase = new URL(supabaseUrl).host;
  const chanNgoai = [];

  await trang.setRequestInterception(true);

  trang.on("request", (req) => {
    const url = req.url();

    if (url.startsWith("data:") || url.startsWith("blob:")) { req.continue(); return; }

    const u = new URL(url);
    const laNoiBo = u.hostname === "127.0.0.1" || u.hostname === "localhost";
    const laFont = /^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);

    if (laNoiBo) { req.continue(); return; }
    if (laFont && req.method() === "GET") { req.continue(); return; }

    if (u.host === hostSupabase) { req.respond(traLoi(kho, u, req)); return; }

    // Bất cứ thứ gì khác: chặn và ghi sổ. Bộ kiểm không được phép gọi ra
    // ngoài — nhất là tới production hay webhook n8n.
    chanNgoai.push(url);
    req.abort();
  });

  return { chanNgoai };
}

function traLoi(kho, u, req) {
  /* Đủ bộ header CORS. Thiếu Allow-Headers là preflight trượt và trình
     duyệt chặn thẳng — lúc đó lỗi hiện ra dưới dạng "net::ERR_FAILED",
     rất dễ tưởng nhầm là mock chưa chạy. */
  const dau = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS,HEAD",
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,content-profile,accept,accept-profile,prefer,range,x-client-info",
    "Access-Control-Expose-Headers": "content-range,content-profile",
    "Access-Control-Max-Age": "600",
  };

  if (req.method() === "OPTIONS") return { status: 204, headers: dau, body: "" };

  /* Auth */
  if (u.pathname.startsWith("/auth/v1/token")) {
    return { status: 200, headers: dau, body: JSON.stringify(phienGia()) };
  }
  if (u.pathname.startsWith("/auth/v1/user")) {
    return { status: 200, headers: dau, body: JSON.stringify(NGUOI_DUNG) };
  }
  if (u.pathname.startsWith("/auth/v1/logout")) {
    return { status: 204, headers: dau, body: "" };
  }

  /* RPC */
  const rpc = u.pathname.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/i);
  if (rpc) {
    const ten = rpc[1];
    const co = Object.prototype.hasOwnProperty.call(kho, ten);
    // RPC chưa dựng sẵn trả null thay vì lỗi: màn nào dùng nó phải tự
    // xoay xở được, và đó cũng là điều luật trạng thái rỗng đòi hỏi.
    return { status: 200, headers: dau, body: JSON.stringify(co ? kho[ten] : null) };
  }

  /* Bảng */
  const bang = u.pathname.match(/\/rest\/v1\/([a-z0-9_]+)/i);
  if (bang) {
    const ten = bang[1];
    const rows = Array.isArray(kho[ten]) ? kho[ten] : [];
    // .single() gửi Accept: application/vnd.pgrst.object+json và đòi đúng
    // một dòng; trả mảng cho nó là supabase-js báo lỗi ngay.
    const motDong = (req.headers().accept || "").includes("pgrst.object");
    if (motDong) {
      if (rows.length === 0) {
        return {
          status: 406, headers: dau,
          body: JSON.stringify({ code: "PGRST116", message: "không có dòng nào" }),
        };
      }
      return { status: 200, headers: dau, body: JSON.stringify(rows[0]) };
    }
    return { status: 200, headers: dau, body: JSON.stringify(rows) };
  }

  return { status: 200, headers: dau, body: "null" };
}

/** Nhét phiên giả vào localStorage trước khi trang chạy JavaScript. */
export async function nhetPhien(trang, { supabaseUrl, cheDo = "light" } = {}) {
  const khoa = `sb-${layRef(supabaseUrl)}-auth-token`;
  await trang.evaluateOnNewDocument((k, phien, che) => {
    localStorage.setItem(k, JSON.stringify(phien));
    localStorage.setItem("vmp-theme", che);
  }, khoa, phienGia(), cheDo);
}

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

/** Mật khẩu "đúng" của người kiểm thử — bộ đổi-mật-khẩu re-auth với nó. */
export const MAT_KHAU_DUNG = "mat-khau-dung";

export const NGUOI_DUNG = {
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

/* Fixture V2 cho luồng ghi đè deadline của hạng mục đã có tiến độ.  Mọi
 * scenario E2E dùng cùng bản xem trước thật này; chỉ response apply được
 * thay cục bộ theo từng boundary server. */
const CHANGE_ID_TIMELINE_V2 = "94000000-0000-4000-8000-000000000001";
const TIMELINE_REVISION_V2 = 3;
const VALIDATION_CODE_TIMELINE_V2 = "CCTB01/2026.01-PQ";
const ITEM_VERSION_TIMELINE_V2 = 7;

const UNG_VIEN_DEADLINE_DA_TIEN_DO = {
  validation_code: VALIDATION_CODE_TIMELINE_V2,
  item_version: ITEM_VERSION_TIMELINE_V2,
  eligible: true,
  blocker_code: null,
  blocker_reason: null,
  missing: [],
  progress: {
    actual_protocol_date: null,
    actual_validation_date: "2026-03-20",
    actual_report_date: null,
    actual_vmp_date: null,
    status_protocol: "chua",
    status_validation: "completed",
    status_report: "chua",
    status_vmp: "chua",
  },
  deadline_protocol_cu: "2026-06-30",
  deadline_protocol_moi: "2026-01-18",
  deadline_validation_cu: "2026-07-31",
  deadline_validation_moi: "2026-03-24",
  deadline_report_cu: "2026-08-15",
  deadline_report_moi: "2026-03-26",
  deadline_vmp_cu: "2026-08-31",
  deadline_vmp_moi: "2026-03-31",
};

const LUU_DANH_MUC_V2_OK = {
  ok: true,
  object_code: "CCTB01",
  version: 4,
  change_id: CHANGE_ID_TIMELINE_V2,
  timeline_revision: TIMELINE_REVISION_V2,
  pending_timeline: true,
};

const XEM_TRUOC_TIMELINE_V2_OK = {
  ok: true,
  change_id: CHANGE_ID_TIMELINE_V2,
  object_code: "CCTB01",
  timeline_revision: TIMELINE_REVISION_V2,
  tao: [],
  sua: [],
  dung: [],
  giu_nguyen: [{
    validation_code: VALIDATION_CODE_TIMELINE_V2,
    ly_do: "Đã có tiến độ; chỉ cập nhật deadline kế hoạch khi xác nhận đặc biệt",
  }],
  canh_bao: [],
  deadline_overrides: [UNG_VIEN_DEADLINE_DA_TIEN_DO],
};

const AP_DUNG_TIMELINE_V2_OK = {
  ok: true,
  change_id: CHANGE_ID_TIMELINE_V2,
  object_code: "CCTB01",
  so_tao: 0,
  so_sua: 0,
  so_dung: 0,
  so_giu_nguyen: 1,
  so_deadline_override: 1,
  timeline_revision: TIMELINE_REVISION_V2,
  actor_id: NGUOI_DUNG.id,
  effective_role: "admin",
  reason: "Xác nhận theo biên bản QA-26/08",
  deadline_overrides: [{
    validation_code: VALIDATION_CODE_TIMELINE_V2,
    item_version_cu: ITEM_VERSION_TIMELINE_V2,
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

/** Ngày dạng chuỗi, lệch `lech` ngày so với mốc cố định của bộ kiểm.
 *  Dùng mốc cố định thay vì hôm nay để hai lần chạy cho cùng kết quả. */
function ngay(lech) {
  const goc = new Date("2026-08-15T00:00:00Z");
  goc.setDate(goc.getDate() + lech);
  return goc.toISOString().slice(0, 10);
}

/** Xuất cho bộ kiểm cần dữ liệu LỚN (suaKho nhân bản hạng mục — kiểm ảo
 *  hoá hàng của bảng timeline với >100 dòng). */
export function dungHangMuc(i) {
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
    /* person_id thật: màn "Hôm nay" chỉ nhận diện người phụ trách bằng id,
       không bằng tên. Thiếu nó thì mọi hạng mục rơi vào nhóm "hồ sơ chưa
       đủ" và bộ kiểm không còn phản ánh đúng cảnh vận hành.
       Cứ mỗi 8 hạng mục thì để trống một cái, để nhóm đó vẫn có mẫu. */
    owner_person_id: i % 8 === 7 ? null : `00000000-0000-4000-8000-${String(100 + i).padStart(12, "0")}`,
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
    ownerPersonId: raw.owner_person_id,
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
    // Dữ liệu thật luôn có khoá chính; mock thiếu nó từng che một lỗi thật.
    id: 1000 + i,
    code: `TB-${String(100 + i).padStart(3, "0")}`,
    name: ten,
    object_name: ten,
    dept: BO_PHAN[i % BO_PHAN.length],
    department: BO_PHAN[i % BO_PHAN.length],
    cls: ["tb", "qt", "kho", "ht", "vc"][i % 5],
    classification: ["tb", "qt", "kho", "ht", "vc"][i % 5],
    kind: ["Thiết bị", "Quy trình", "Kho", "Hệ thống phụ trợ", "Vận chuyển"][i % 5],
    object_code: `TB-${String(100 + i).padStart(3, "0")}`,
    /* Khu vực / line / nhóm công việc có trong dữ liệu thật và là nguồn
       gợi ý cho các ô chọn của form đối tượng. Thiếu chúng thì ô chọn rơi
       về ô gõ tự do và bộ kiểm không thấy được lỗi "bấm vào chỉ hiện một
       dòng" mà người dùng gặp. */
    area_code: `KV-${["A", "B", "C"][i % 3]}`,
    line: `Line ${(i % 2) + 1}`,
    work_group: ["Cơ khí", "Tiện ích", "Sạch"][i % 3],
    validate_flag: "y",
    frequency_months: 12,
    first_month: (i % 12) + 1,
    is_active: true,
    active: true,
  };
}

/** Toàn bộ quyền màn hình — bộ kiểm cần mở được mọi màn.
 *  Danh sách hành động phải là TÊN THẬT mà `rpc_my_ui_access` trả về
 *  (xem HANH_DONG_ADMIN trong src/lib/access.ts): giao diện gate nút bằng
 *  `access.can("source", "edit_catalog")`, nên mock ghi "edit" chung chung
 *  là mọi nút ghi biến mất và bộ kiểm không còn phản ánh cảnh thật. */
function quyenDayDu() {
  const man = [
    "today", "overview", "timeline", "alerts", "progress", "source",
    "workload", "reports", "rules", "people", "accounts", "phanquyen",
    "health", "audit", "admin", "chat", "risk",
  ];
  const hanhDong = [
    "view", "edit", "export", "manage",
    "edit_catalog", "edit_operational_people", "generate_timeline",
    "edit_vertical_timeline", "record_actual_validation_date",
    "assign_workshop_staff", "view_workload", "view_rules",
    "manage_accounts", "manage_authorization_policy",
  ];
  const screens = {};
  for (const m of man) {
    screens[m] = { can_view: true, scope: "all", actions: hanhDong };
  }
  return {
    ok: true,
    mode: "enforced",
    business_role: "admin",
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

  /* Hai bộ danh mục phụ có đủ khoá nghiệp vụ + version — workspace Danh mục
     đọc chúng qua rpc_list_catalog_dataset và cần các cột này để dựng dòng. */
  const sanPham = Array.from({ length: day ? 4 : 0 }, (_, i) => ({
    id: i + 1,
    bfo_code: `BFO-${200 + i}`,
    product_name: ["Paracetamol 500mg", "Amoxicillin 250mg", "Vitamin C 100mg", "Omeprazol 20mg"][i],
    dosage_form: ["Viên nén", "Viên nang", "Viên sủi", "Viên nang"][i],
    production_line: `Line ${(i % 2) + 1}`,
    batch_size: `${(i + 1) * 100} kg`,
    is_active: true,
    version: 1,
    updated_at: "2026-08-15T02:00:00Z",
  }));
  const nguoiNhan = Array.from({ length: day ? 3 : 0 }, (_, i) => ({
    id: i + 1,
    email: `canh-bao-${i + 1}@vi-du.test`,
    recipient_name: `Người nhận ${i + 1}`,
    scope_type: "tất cả",
    alert_kind: "cả hai",
    is_enabled: true,
    ai_report_enabled: i === 0,
    version: 1,
    updated_at: "2026-08-15T02:00:00Z",
  }));

  /* rpc_list_catalog_dataset là RPC đọc theo THAM SỐ (p_dataset, p_search,
     p_limit/p_offset) — trả cứng một mảng là mọi dataset trông giống nhau.
     Giá trị dạng HÀM được traLoi() gọi với body của request. */
  const listCatalogDataset = (body) => {
    const nguon = body?.p_dataset === "products_gmp" ? sanPham
      : body?.p_dataset === "alert_recipients" ? nguoiNhan
      : null;
    if (!nguon) {
      return { ok: false, error_code: "DATASET_UNKNOWN", error: "Không có dataset" };
    }
    const q = String(body?.p_search ?? "").trim().toLowerCase();
    const khop = q
      ? nguon.filter((r) => JSON.stringify(r).toLowerCase().includes(q))
      : nguon;
    const off = Number(body?.p_offset ?? 0);
    const lim = Number(body?.p_limit ?? 100);
    return { ok: true, total: khop.length, rows: khop.slice(off, off + lim) };
  };

  const nhanSu = Array.from({ length: day ? 6 : 0 }, (_, i) => ({
    id: `pf-${i}`,
    person_id: `pf-${i}`,
    full_name: `Người phụ trách ${i + 1}`,
    name: `Người phụ trách ${i + 1}`,
    email: `nguoi${i + 1}@vi-du.test`,
    department: BO_PHAN[i % BO_PHAN.length],
    dept: BO_PHAN[i % BO_PHAN.length],
    role: ["qa", "xuong", "workshop_staff"][i % 3],
    access_class: ["qa", "xuong", "workshop_staff"][i % 3],
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
    vmp_products_gmp: sanPham,
    vmp_alert_recipients: nguoiNhan,
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
    /* Hình dạng phải khớp `ServerKpi` trong src/lib/supabaseData.ts: hai
       nhóm lồng `validation` và `documentation`. Bản trước trả một object
       PHẲNG {total, done, overdue…} — màn "Chất lượng dữ liệu → Kiểm tra
       trên máy chủ" đọc `kpi.validation.done` nên nổ TypeError và rơi vào
       lưới an toàn "Tải lại trang". Mock sai hình dạng che đúng loại lỗi
       mà bộ kiểm sinh ra để bắt. */
    rpc_dashboard_kpi: day
      ? {
        updated_at: "2026-08-15T02:00:00Z",
        validation: { done: 6, over: 4, todo: 14, total: 24 },
        documentation: { done: 5, over: 2, todo: 17, total: 24 },
        mismatch_count: 2,
      }
      : {
        updated_at: "2026-08-15T02:00:00Z",
        validation: { done: 0, over: 0, todo: 0, total: 0 },
        documentation: { done: 0, over: 0, todo: 0, total: 0 },
        mismatch_count: 0,
      },
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
    /* Hình dạng khớp RPC mới: phân quyền năm vai hiệu lực đọc từ bảng +
       chế độ áp dụng. */
    rpc_active_rules: {
      cap_nhat: "2026-08-15T02:00:00Z",
      diem_trong_yeu: {
        cong_thuc: "Điểm trọng yếu = Điểm mức độ phức tạp × Điểm ảnh hưởng tới chất lượng sản phẩm",
        thang: "1 … 9",
        phuc_tap: [{ muc: "Cao", diem: 3, mo_ta: "Hệ nhiều thành phần", vi_du: "LAF" }],
        anh_huong: [{ muc: "Trực tiếp", diem: 3, mo_ta: "Chạm sản phẩm", vi_du: "Khí nén" }],
        phan_bo: day ? [{ diem: 9, so_luong: 3 }, { diem: 3, so_luong: 5 }] : [],
        da_duyet: day ? 5 : 0, cho_duyet: day ? 3 : 0,
      },
      sinh_timeline: {
        loc: "Chỉ sinh cho đối tượng có Thẩm định = y",
        loai_tham_dinh: [{ phan_loai: "Thiết bị", loai: "IQ/OQ/PQ" }],
        lan_dau: "Năm nhập = năm thẩm định", so_lan_trong_nam: "max(1, 12 ÷ tần suất)",
        ma_id: "{Mã}/{Năm}.{Lần}-{Loại}",
        moc_thoi_gian: ["T = ngày cuối tháng đích", "Hạn báo cáo = T − 5 ngày"],
        khoang_cach_bao_cao: [{ dieu_kien: "Phân loại báo cáo: A", ngay: 10 }],
      },
      phan_quyen: [
        { vai_tro: "Quản trị (admin)", quyen: "Thấy 17/17 màn · phạm vi dữ liệu: toàn hệ thống" },
        { vai_tro: "Quản lý QA (qa_manager)", quyen: "Thấy 17/17 màn · phạm vi dữ liệu: toàn hệ thống" },
        { vai_tro: "QA (qa_staff)", quyen: "Thấy 14/17 màn · phạm vi dữ liệu: toàn hệ thống" },
        { vai_tro: "Quản lý xưởng (workshop_manager)", quyen: "Thấy 9/17 màn · phạm vi: theo xưởng" },
        { vai_tro: "Nhân viên xưởng (workshop_staff)", quyen: "Thấy 6/17 màn · phạm vi: được phân công" },
      ],
      phan_quyen_che_do: "Đang đối chiếu (preview) — chưa khoá ai, chỉ ghi nhận lệch",
      phan_quyen_ghi_chu: "Ma trận đầy đủ xem và sửa ở màn Vai trò & phạm vi.",
      toan_ven_du_lieu: ["Mọi thao tác ghi đi qua RPC kiểm quyền phía server"],
      so_lieu_hien_tai: { doi_tuong_nguon: doiTuong.length, co_tham_dinh: doiTuong.length,
        hang_muc: soHangMuc, ban_ghi_audit: day ? 8 : 0 },
    },
    rpc_trang_thai_he_thong: {
      supabase: "ok", n8n: "ok", last_sync: "2026-08-15T02:00:00Z",
      plan_items: soHangMuc, objects: doiTuong.length,
    },
    rpc_list_source_tabs: day
      ? [{ source_tab: "thiet_bi", rows: 12, columns: 9 }]
      : [],
    rpc_list_catalog_dataset: listCatalogDataset,
    rpc_save_catalog_object: () => LUU_DANH_MUC_V2_OK,
    rpc_preview_catalog_change_v2: () => XEM_TRUOC_TIMELINE_V2_OK,
    rpc_apply_catalog_change_v2: () => AP_DUNG_TIMELINE_V2_OK,
    /* Phân công xưởng của MỘT hạng mục — WorkshopAssignmentInline đọc/ghi.
       Hình dạng phải qua được decodeAssignment/decodeDirectoryPerson. */
    rpc_item_assignments: {
      ok: true,
      assignments: day ? [{
        assignment_id: "as-1", validation_code: "TB-100-IQ",
        person_id: "pf-x1", user_id: null, staff_name: "Trần Văn Xưởng",
        employee_code: "NV-901", assignment_kind: "equipment_department",
        assignment_role: null, source: "manual", source_text: null,
        unresolved_reason: null, expires_at: null, is_active: true,
        grants_access: true, object_department: "xsx", area: "A1", line: null,
      }] : [],
    },
    rpc_item_permission_directory: {
      ok: true,
      people: day ? [
        { person_id: "pf-x1", user_id: null, employee_code: "NV-901",
          full_name: "Trần Văn Xưởng", department: "xsx", email: null,
          account_status: "unlinked", access_class: "workshop_staff",
          scope_departments: ["xsx"], scope_factory_ids: [], scope_area_ids: [],
          scope_line_ids: [], access_areas: [], version: 1,
          email_sent_confirmed: false, is_active: true, match_status: "unique" },
        { person_id: "pf-x2", user_id: null, employee_code: "NV-902",
          full_name: "Lê Thị Máy", department: "xsx", email: null,
          account_status: "unlinked", access_class: "workshop_staff",
          scope_departments: ["xsx"], scope_factory_ids: [], scope_area_ids: [],
          scope_line_ids: [], access_areas: [], version: 1,
          email_sent_confirmed: false, is_active: true, match_status: "unique" },
      ] : [],
    },
    rpc_set_item_assignment: { ok: true },
    rpc_item_progress_history: day ? {
      ok: true, total: 2, limit: 50, offset: 0,
      history: [
        { id: "au-p1", created_at: "2026-08-14T03:00:00Z", actor: "Người kiểm thử",
          effective_business_role: "admin", action: "UPDATE",
          changed_fields: ["ngay_validation"], reason: "Cập nhật theo biên bản PQ-230426",
          source: "rpc_update_progress", has_detail: true },
        { id: "au-p2", created_at: "2026-08-12T03:00:00Z", actor: "Người kiểm thử",
          effective_business_role: "admin", action: "UPDATE",
          changed_fields: ["status"], reason: "Bắt đầu thẩm định",
          source: "rpc_update_progress", has_detail: true },
      ],
    } : { ok: true, total: 0, limit: 50, offset: 0, history: [] },
    rpc_list_catalog_changes: {
      ok: true,
      total: day ? 1 : 0,
      changes: day ? [{
        id: "ch-1", object_kind: "Thiết bị", object_code: "TB-100",
        status: "pending", source_version: 3, timeline_revision: null,
        created_at: "2026-08-15T02:00:00Z", created_by_name: "Người kiểm thử",
        has_impact: true, apply_reason: null, last_error: null,
      }] : [],
    },
    rpc_catalog_history: {
      ok: true,
      total: day ? 2 : 0,
      history: day ? Array.from({ length: 2 }, (_, i) => ({
        id: `au-${i + 1}`, created_at: `2026-08-1${4 + i}T03:00:00Z`,
        actor: "kiem-thu@vi-du.test", effective_business_role: "admin",
        action: "update", table_name: "vmp_source_objects", record_id: "TB-100",
        changed_fields: ["frequency_months"], reason: "Điều chỉnh tần suất",
        source: "web", has_detail: true,
      })) : [],
    },
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
export async function caiGiaLap(trang, { supabaseUrl, kichBan = "day", suaKho, doTre } = {}) {
  const kho = dungKhoDuLieu(kichBan);
  /* Cho một bộ kiểm sửa kho trước khi cài — vd hạ quyền xuống nhân viên xưởng để
     kiểm "không thấy nút ghi". Sửa tại chỗ, không trả kho ra ngoài. */
  if (typeof suaKho === "function") suaKho(kho);
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

    if (u.host === hostSupabase) {
      const phanHoi = traLoi(kho, u, req);
      /* doTre: { ten_rpc: ms } — giả lập mạng chậm cho TỪNG RPC, để kiểm
         được trạng thái trung gian (vẽ sớm từ bản lưu, banner đang tải).
         Không trễ preflight OPTIONS: trình duyệt chờ preflight xong mới
         gửi request thật, trễ cả hai là nhân đôi ngoài ý muốn. */
      const rpc = u.pathname.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/i);
      const ms = rpc && doTre && req.method() !== "OPTIONS" ? doTre[rpc[1]] : 0;
      if (ms > 0) setTimeout(() => { req.respond(phanHoi).catch(() => {}); }, ms);
      else req.respond(phanHoi);
      return;
    }

    // Bất cứ thứ gì khác: chặn và ghi sổ. Bộ kiểm không được phép gọi ra
    // ngoài — nhất là tới production hay webhook n8n.
    chanNgoai.push(url);
    req.abort();
  });

  return { chanNgoai };
}

export function traLoi(kho, u, req) {
  /* Đủ bộ header CORS. Thiếu Allow-Headers là preflight trượt và trình
     duyệt chặn thẳng — lúc đó lỗi hiện ra dưới dạng "net::ERR_FAILED",
     rất dễ tưởng nhầm là mock chưa chạy. */
  const dau = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,content-profile,accept,accept-profile,prefer,range,x-client-info,x-supabase-api-version",
    "Access-Control-Expose-Headers": "content-range,content-profile",
    "Access-Control-Max-Age": "600",
  };

  if (req.method() === "OPTIONS") return { status: 204, headers: dau, body: "" };

  /* Auth */
  if (u.pathname.startsWith("/auth/v1/token")) {
    /* grant_type=password có KIỂM mật khẩu: bộ đổi-mật-khẩu re-auth bằng
       mật khẩu cũ, nên mock phải phân biệt đúng/sai. Mật khẩu đúng của
       người kiểm thử là MAT_KHAU_DUNG; refresh_token luôn qua. */
    let body = null;
    try { body = JSON.parse(req.postData() || "null"); } catch { body = null; }
    const laPassword = u.search.includes("grant_type=password");
    if (laPassword && body && body.password !== MAT_KHAU_DUNG) {
      return {
        status: 400, headers: dau,
        body: JSON.stringify({
          code: 400, error_code: "invalid_credentials",
          error_description: "Invalid login credentials",
          msg: "Invalid login credentials",
        }),
      };
    }
    return { status: 200, headers: dau, body: JSON.stringify(phienGia()) };
  }
  if (u.pathname.startsWith("/auth/v1/recover")) {
    // Quên mật khẩu: GoTrue trả 200 rỗng dù email tồn tại hay không.
    return { status: 200, headers: dau, body: "{}" };
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
    const loi = kho.rpc_errors?.[ten];
    if (loi) return {
      status: Number(loi.status) || 500,
      headers: dau,
      body: JSON.stringify({ message: loi.message || "RPC giả lập lỗi" }),
    };
    const co = Object.prototype.hasOwnProperty.call(kho, ten);
    // RPC chưa dựng sẵn trả null thay vì lỗi: màn nào dùng nó phải tự
    // xoay xở được, và đó cũng là điều luật trạng thái rỗng đòi hỏi.
    if (!co) return { status: 200, headers: dau, body: "null" };
    let giaTri = kho[ten];
    if (typeof giaTri === "function") {
      // RPC phụ thuộc tham số: gọi hàm với body đã parse của request.
      let body = null;
      try { body = JSON.parse(req.postData() || "null"); } catch { body = null; }
      giaTri = giaTri(body);
    }
    return { status: 200, headers: dau, body: JSON.stringify(giaTri) };
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

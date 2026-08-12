/* =====================================================================
 *  catalogForm.ts — luật của form Danh mục nguồn, tách khỏi giao diện
 *  ---------------------------------------------------------------------
 *  Thiết kế §5: một màn hình, ưu tiên trường cần thiết, phần nâng cao thu
 *  gọn. Bốn nhóm, đúng thứ tự người nhập liệu nghĩ:
 *
 *      1. Thông tin chính     — luôn hiện
 *      2. Kế hoạch thẩm định  — chỉ hiện khi có thẩm định
 *      3. Phân công           — chọn người, không gõ tên
 *      4. Nâng cao            — mặc định thu gọn
 *
 *  File này KHÔNG import React: nó là luật, và luật thì phải kiểm được mà
 *  không cần dựng trình duyệt. Giao diện ở CatalogObjectForm.tsx chỉ vẽ
 *  theo những gì khai ở đây.
 *
 *  Vì sao tách khỏi bảng sửa-tại-chỗ cũ: nhấn đúp vào ô rồi gõ thì không
 *  có chỗ nào nói "trường này bắt buộc", không kiểm được liên hệ giữa các
 *  trường (có thẩm định thì phải có tháng đầu tiên), và không có nơi nhập
 *  lý do thay đổi. Ba thứ đó là lý do tồn tại của form.
 * ===================================================================== */

/** Bốn nhóm hiển thị. Thứ tự trong mảng chính là thứ tự trên màn hình. */
export type NhomTruong = "chinh" | "ke_hoach" | "phan_cong" | "nang_cao";

export interface TruongForm {
  key: string;
  label: string;
  nhom: NhomTruong;
  /** Không để trống được. */
  batBuoc?: boolean;
  /** Khoá sau khi bản ghi đã tạo — mã đối tượng là khoá nghiệp vụ. */
  khoaSauKhiTao?: boolean;
  /** Chỉ nhận số. */
  so?: boolean;
  /** Ô chọn thay vì gõ tự do; giá trị lấy từ danh sách. */
  chon?: readonly string[];
  /** Chọn người theo `person_id`, không gõ tên. */
  chonNguoi?: "owner" | "support";
  /** Câu giải thích đặt ngay cạnh ô nhập — đây là chỗ người nhập hay sai. */
  goiY?: string;
}

export const TINH_TRANG = ["Đang dùng", "Ngừng dùng", "Dự phòng"] as const;
export const CO_KHONG = ["y", "n"] as const;
export const PHAN_LOAI_BAO_CAO = [
  "Không phụ thuộc", "Hóa lý", "Nhiễm khuẩn", "Vô khuẩn",
] as const;
/** 12 ÷ tần suất = số lần thẩm định trong năm. */
export const TAN_SUAT = ["6", "12", "24", "36", "60"] as const;
export const THANG = Array.from({ length: 12 }, (_, i) => String(i + 1));
export const DIEM_1_3 = ["1", "2", "3"] as const;

export const TRUONG_FORM: readonly TruongForm[] = [
  // ---- 1. Thông tin chính ----
  { key: "object_code", label: "Mã đối tượng", nhom: "chinh", batBuoc: true, khoaSauKhiTao: true,
    goiY: "Khoá nghiệp vụ, không đổi được sau khi tạo. Timeline tham chiếu bằng mã này." },
  { key: "object_name", label: "Tên đối tượng", nhom: "chinh", batBuoc: true },
  { key: "department", label: "Bộ phận quản lý", nhom: "chinh", batBuoc: true },
  { key: "area_code", label: "Khu vực", nhom: "chinh" },
  { key: "line", label: "Line", nhom: "chinh" },
  { key: "status", label: "Tình trạng", nhom: "chinh", chon: TINH_TRANG },
  { key: "validate_flag", label: "Có thẩm định", nhom: "chinh", chon: CO_KHONG,
    goiY: "Chỉ 'y' mới sinh hạng mục timeline. 'n' là loại khỏi kế hoạch." },

  // ---- 2. Kế hoạch thẩm định — chỉ hiện khi validate_flag = 'y' ----
  { key: "frequency_months", label: "Tần suất (tháng)", nhom: "ke_hoach", so: true, chon: TAN_SUAT,
    goiY: "Số lần thẩm định trong năm = 12 ÷ tần suất, tối thiểu 1." },
  { key: "first_month", label: "Tháng thẩm định đầu tiên", nhom: "ke_hoach", so: true, chon: THANG,
    batBuoc: true,
    goiY: "Thiếu tháng này thì không tính được mốc thời gian nào của đối tượng." },
  { key: "year_ref", label: "Năm nhập / ban hành", nhom: "ke_hoach", so: true,
    goiY: "Bằng năm thẩm định và chưa từng có IQ ⇒ sinh đủ DQ, FAT/SAT, IQ, OQ, PQ một lần." },
  { key: "report_class", label: "Phân loại báo cáo", nhom: "ke_hoach", chon: PHAN_LOAI_BAO_CAO,
    goiY: "Khoảng cách báo cáo: không phụ thuộc 2 · hóa lý 2 · nhiễm khuẩn 7 · vô khuẩn 16 ngày." },
  { key: "workdays", label: "Số ngày công", nhom: "ke_hoach", so: true,
    goiY: "Ngày bắt đầu thẩm định = ngày kết thúc − số ngày công." },

  // ---- 3. Phân công ----
  { key: "owner_person_id", label: "QA phụ trách", nhom: "phan_cong", chonNguoi: "owner",
    goiY: "Chọn từ danh bạ. Tên gõ tay không dùng làm khoá được — người trùng tên sẽ gán nhầm." },
  { key: "support_person_id", label: "Người hỗ trợ", nhom: "phan_cong", chonNguoi: "support" },
  { key: "work_group", label: "Nhóm công việc", nhom: "phan_cong" },

  // ---- 4. Nâng cao ----
  { key: "validate_reason", label: "Lý do thẩm định", nhom: "nang_cao" },
  { key: "complexity_score", label: "Độ phức tạp", nhom: "nang_cao", so: true, chon: DIEM_1_3,
    goiY: "3 Cao · 2 Trung bình · 1 Thấp" },
  { key: "quality_impact_score", label: "Ảnh hưởng chất lượng", nhom: "nang_cao", so: true, chon: DIEM_1_3,
    goiY: "3 Trực tiếp · 2 Gián tiếp · 1 Không ảnh hưởng" },
  { key: "criticality_score", label: "Điểm trọng yếu", nhom: "nang_cao", so: true,
    goiY: "Tự tính = phức tạp × ảnh hưởng. Sửa tay thì dòng chuyển sang 'đã duyệt', không bị chấm lại." },
  { key: "show_flag", label: "Hiện trên bảng", nhom: "nang_cao", chon: CO_KHONG },
  { key: "note", label: "Ghi chú", nhom: "nang_cao" },
];

export type GiaTriForm = Record<string, string>;
export type LoiForm = Record<string, string>;

/** Có phải đối tượng cần thẩm định — quyết định nhóm 2 hiện hay ẩn. */
export function coThamDinh(form: GiaTriForm): boolean {
  return String(form.validate_flag ?? "").trim().toLowerCase() === "y";
}

/** Trường nào đang thật sự hiển thị. Nhóm kế hoạch ẩn thì cũng không kiểm. */
export function truongDangHien(form: GiaTriForm): readonly TruongForm[] {
  const co = coThamDinh(form);
  return TRUONG_FORM.filter((t) => t.nhom !== "ke_hoach" || co);
}

/**
 * Kiểm dữ liệu nhập. Trả về map trường → thông báo; rỗng nghĩa là hợp lệ.
 *
 * Chỉ kiểm trường ĐANG HIỆN: bắt người dùng điền tháng thẩm định cho một
 * đối tượng họ vừa khai là không thẩm định thì vô nghĩa.
 */
export function validateCatalogForm(form: GiaTriForm): LoiForm {
  const loi: LoiForm = {};

  for (const t of truongDangHien(form)) {
    const raw = String(form[t.key] ?? "").trim();

    if (t.batBuoc && !raw) {
      loi[t.key] = t.key === "first_month"
        ? "Phải chọn tháng thẩm định đầu tiên"
        : `Phải nhập ${t.label.toLowerCase()}`;
      continue;
    }
    if (!raw) continue;

    if (t.so && !/^\d+$/.test(raw)) {
      loi[t.key] = `${t.label} phải là số`;
      continue;
    }
    if (t.chon && !t.chon.includes(raw)) {
      loi[t.key] = `${t.label} phải chọn trong danh sách`;
    }
  }

  if (coThamDinh(form)) {
    const thang = Number(form.first_month);
    if (form.first_month && Number.isInteger(thang) && (thang < 1 || thang > 12)) {
      loi.first_month = "Tháng phải từ 1 đến 12";
    }
  }

  // Tên người là bản sao để hiển thị, không phải khoá. Có tên mà không có
  // ID nghĩa là dữ liệu cũ chưa nối — bắt chọn lại thay vì gán theo tên.
  for (const [ten, id] of [["owner_name", "owner_person_id"], ["support_name", "support_person_id"]]) {
    if (String(form[ten] ?? "").trim() && !String(form[id] ?? "").trim()) {
      loi[id] = "Phải chọn người từ danh bạ, không dùng tên gõ tay";
    }
  }

  return loi;
}

/**
 * Dựng patch để gửi lên `rpc_save_catalog_object`.
 *
 * Chỉ gửi trường ĐÃ ĐỔI so với bản ghi hiện có — gửi cả form thì mọi lần
 * lưu đều trông như sửa tần suất, và `timeline_revision` sẽ tăng oan, kéo
 * theo một thẻ "chờ áp timeline" không có thật.
 *
 * Không bao giờ gửi `owner_name`/`support_name`: server tự điền tên từ hồ
 * sơ đang hoạt động.
 */
export function buildCatalogPatch(
  form: GiaTriForm,
  banGoc: Record<string, unknown> = {},
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const t of truongDangHien(form)) {
    if (t.key === "owner_name" || t.key === "support_name") continue;

    const moi = String(form[t.key] ?? "").trim();
    const cu = banGoc[t.key] === null || banGoc[t.key] === undefined
      ? "" : String(banGoc[t.key]).trim();
    if (moi === cu) continue;

    if (t.so) patch[t.key] = moi === "" ? null : Number(moi);
    else patch[t.key] = moi === "" ? null : moi;
  }

  return patch;
}

/** Sửa thứ ảnh hưởng timeline thì bắt buộc nhập lý do — khớp với luật của
 *  `vmp_catalog_timeline_fields()` phía Supabase. Hai nơi phải cùng danh
 *  sách, nếu không người dùng sẽ bị server từ chối mà form không báo trước. */
export const TRUONG_ANH_HUONG_TIMELINE: readonly string[] = [
  "frequency_months", "first_month", "report_class", "workdays",
  "validate_flag", "is_active", "owner_person_id", "support_person_id",
];

export function canLyDo(patch: Record<string, unknown>, dangTaoMoi: boolean): boolean {
  if (dangTaoMoi) return false;
  return TRUONG_ANH_HUONG_TIMELINE.some((k) => k in patch);
}

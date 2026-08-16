/* =====================================================================
 *  supabaseData.js — Đọc & ghi dữ liệu VMP trên Supabase
 *  ---------------------------------------------------------------------
 *  Từ 2026-07-29 Supabase là NƠI LƯU DỮ LIỆU GỐC. Google Sheet chuyển sang
 *  chỉ đọc (nguồn tham chiếu), nhánh sync 5 phút của WF-04 đã tắt.
 *
 *  Mọi thao tác ghi đi qua RPC có kiểm soát quyền phía server (SECURITY
 *  DEFINER + đọc role/bộ phận từ bảng profiles). Client KHÔNG có quyền ghi
 *  thẳng bảng, nên không thể lách bằng cách gọi supabase.from(...).update().
 *
 *  Phân quyền: admin/qa_manager toàn quyền · department_user chỉ sửa tiến độ
 *  hạng mục thuộc bộ phận mình · viewer chỉ đọc.
 * ===================================================================== */
import { supabase } from "./supabaseClient.ts";
import { deriveActivityFields } from "./n8nAdapter.ts";
import { buildSetItemPerformerByIdArgs } from "../features/itemPermissions/performerSelection.ts";
import type {
  Activity, GenerateTimelineResult, ObjectKind, RpcResult,
  SourceObjectRow, VmpDataset, VmpObject, AlertRecipientRow, StaffEmailRow,
  PerformerRow,
} from "../types/domain.ts";

/** RPC trả jsonb nên type sinh tự động là Json — ép về hình dạng đã biết ngay
 *  tại biên đọc, để phần còn lại của ứng dụng làm việc với kiểu thật. */
function asShape<T>(data: unknown): T {
  return data as T;
}

// ============================================================
// ĐỌC: Dashboard data từ Supabase RPC
// ============================================================
export async function fetchVmpDataFromSupabase(
  year?: number,
  includeMissing = false,
): Promise<VmpDataset> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");

  const { data, error } = await supabase.rpc("rpc_get_vmp_dashboard", {
    p_year: year || new Date().getFullYear(),
    p_include_missing: includeMissing,
  });

  if (error) throw new Error("Lỗi đọc Supabase: " + error.message);

  // computed_status trong DB được tính tại thời điểm GHI (CURRENT_DATE lúc đó),
  // nên một hạng mục quá hạn THEO THỜI GIAN (deadline trôi qua mà không có thao
  // tác ghi) sẽ không tự đổi sang 'over'. Vì vậy tính lại st/docDone/target từ
  // _raw (có dl_vmp + trạng thái) ngay khi đọc — luôn tươi theo ngày hôm nay,
  // đồng nhất với đường ghi lạc quan và đường đọc qua n8n.
  const payload = asShape<{ activities?: Activity[]; objects?: VmpObject[]; updated_at?: string }>(data);
  const activities: Activity[] = (payload.activities || []).map((a: Activity) =>
    a && a._raw ? ({ ...a, ...deriveActivityFields(a._raw) } as Activity) : a
  );

  return {
    objects: payload.objects || [],
    activities,
    source: "supabase",
    count: activities.length,
    updated_at: payload.updated_at,
  };
}

// ============================================================
// ĐỌC: Watermark nhẹ để poll phát hiện thay đổi (không kéo cả payload)
// ============================================================
// Trả { year, plan_items, objects, updated_at }. Frontend so chuỗi watermark
// trước khi refetch toàn bộ dashboard → poll 20s gần như miễn phí khi không đổi.
export async function fetchVmpWatermark(year?: number): Promise<unknown> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("rpc_get_vmp_watermark", {
    p_year: year || new Date().getFullYear(),
  });
  if (error) { console.warn("fetchVmpWatermark:", error.message); return null; }
  return data || null;
}

// ============================================================
// ĐỌC: Danh sách mã đã mất khỏi Sheet (cho admin review)
// ============================================================
export async function fetchMissingItems(year?: number): Promise<unknown[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("rpc_get_missing_items", {
    p_year: year || new Date().getFullYear(),
  });
  if (error) { console.error("fetchMissingItems:", error.message); return []; }
  return (data as unknown[]) || [];
}

// ============================================================
// ĐỌC: 5 danh mục nguồn (thiết bị / quy trình / kho / hệ thống phụ trợ /
//      vận chuyển) — đây là nơi nhập liệu chính thay cho Google Sheet
// ============================================================
export const SOURCE_KINDS: ObjectKind[] = [
  "Thiết bị", "Quy trình", "Kho", "Hệ thống phụ trợ", "Vận chuyển",
];

export async function fetchSourceObjects(
  { kind = null, includeInactive = false }:
    { kind?: ObjectKind | null; includeInactive?: boolean } = {},
): Promise<SourceObjectRow[]> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  let q = supabase.from("vmp_source_objects").select("*");
  if (kind) q = q.eq("object_kind", kind);
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q.order("object_kind").order("object_code");
  if (error) throw new Error("Lỗi đọc danh mục nguồn: " + error.message);
  return data || [];
}

export async function fetchAlertRecipients(): Promise<AlertRecipientRow[]> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.from("vmp_alert_recipients").select("*").order("email");
  if (error) throw new Error("Lỗi đọc danh sách nhận cảnh báo: " + error.message);
  return data || [];
}

export async function fetchStaffEmails(): Promise<StaffEmailRow[]> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.from("vmp_staff_emails").select("*").order("staff_name");
  if (error) throw new Error("Lỗi đọc danh bạ: " + error.message);
  return data || [];
}

export async function fetchPerformers(): Promise<PerformerRow[]> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.from("vmp_performers").select("*").order("performer_name");
  if (error) throw new Error("Lỗi đọc danh sách người thực hiện: " + error.message);
  return data || [];
}

export type TimelinePermissionMode = "preview" | "enforced";

export interface TimelineFieldPermission {
  mode: TimelinePermissionMode;
  canView: boolean;
  editableFields: readonly string[];
  reason: string;
}

/** Quyền hiệu lực của chính người đang đăng nhập trên một hạng mục.
 *  Wrapper tự lấy auth.uid ở database; client tuyệt đối không truyền uid. */
export async function fetchTimelineFieldPermission(
  validationCode: string,
): Promise<TimelineFieldPermission> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");

  const [modeResult, rightsResult] = await Promise.all([
    supabase.rpc("item_permissions_mode" as never),
    supabase.rpc("vmp_my_item_rights" as never, {
      p_validation_code: validationCode,
    } as never),
  ]);
  if (modeResult.error) throw new Error("Không đọc được chế độ phân quyền: " + modeResult.error.message);
  if (rightsResult.error) throw new Error("Không đọc được quyền hạng mục: " + rightsResult.error.message);

  const mode = modeResult.data;
  if (mode !== "preview" && mode !== "enforced") {
    throw new Error("Chế độ phân quyền không hợp lệ");
  }
  const rows = Array.isArray(rightsResult.data) ? rightsResult.data : [rightsResult.data];
  const row = (rows[0] || {}) as Record<string, unknown>;
  const editableFields = Array.isArray(row.editable_fields)
    ? row.editable_fields.filter((field): field is string => typeof field === "string")
    : [];
  return {
    mode,
    canView: row.can_view === true,
    editableFields,
    reason: typeof row.view_reason === "string" && row.view_reason.trim()
      ? row.view_reason
      : editableFields.length ? "Theo quyền hiệu lực" : "Chỉ xem",
  };
}

// ============================================================
// GHI: qua RPC — server tự kiểm tra quyền, client không ghi thẳng bảng
// ============================================================

// RPC trả { ok, error } thay vì ném lỗi SQL, nên phải kiểm cả hai tầng.
function unwrap<T extends RpcResult = RpcResult>(
  data: unknown,
  error: { message: string } | null,
  fallbackMsg: string,
): T {
  if (error) throw new Error(fallbackMsg + ": " + error.message);
  const r = data as RpcResult | null;
  if (r && r.ok === false) {
    const e = new Error(r.error || fallbackMsg) as Error & {
      code?: string; currentVersion?: number;
    };
    if (r.code) e.code = r.code;                    // vd 'version_conflict'
    if (r.current_version != null) e.currentVersion = r.current_version;
    throw e;
  }
  return r as T;
}

/** Cập nhật tiến độ một hạng mục timeline.
 *  expectedVersion bật khoá lạc quan: nếu người khác đã sửa trước, RPC trả
 *  code='version_conflict' để UI bảo người dùng tải lại thay vì ghi đè. */
export async function updateProgressSupabase(
  validationCode: string,
  patch: Record<string, unknown>,
  reason?: string | null,
  sheetPatch?: unknown,
  expectedVersion?: number | null,
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  void sheetPatch;  // Sheet là chỉ đọc — tham số giữ lại cho tương thích chữ ký cũ
  // PHẢI gửi ĐỦ 5 khoá, và dùng `null` chứ KHÔNG dùng `undefined`.
  //
  // Trên DB đang tồn tại HAI overload của rpc_update_progress: bản 4 tham số
  // (cũ) và bản 5 tham số có p_expected_version (mới). JSON.stringify vứt bỏ
  // mọi khoá mang giá trị undefined, nên khi thiếu version/lý do thì thân yêu
  // cầu chỉ còn 2–3 khoá — và CẢ HAI overload đều khớp vì phần còn lại đều có
  // DEFAULT. PostgREST không chọn được, trả về:
  //     PGRST203 "Could not choose the best candidate function between…"
  // Người dùng chỉ thấy "Cập nhật tiến độ thất bại" mà không biết vì sao.
  //
  // Đây chính là lý do 461/461 hạng mục còn ở version 0 và nhật ký kiểm toán
  // không có lấy một dòng nguồn 'dashboard_rpc': đường ghi từ web chưa bao giờ
  // chạy được. Có khoá p_expected_version trong thân là bản 4 tham số hết cửa
  // khớp, nên chỉ cần luôn gửi nó — kể cả khi giá trị là null.
  const { data, error } = await supabase.rpc("rpc_update_progress", {
    p_validation_code: validationCode,
    p_patch: patch as never,
    p_reason: reason ?? null,
    p_sheet_patch: null,
    p_expected_version: expectedVersion ?? null,
  } as never);
  return unwrap(data, error, "Cập nhật thất bại");
}

/* ------------------------------------------------------------------
 * Cập nhật tiến độ từ FORM giao diện
 * ------------------------------------------------------------------
 * Form dùng tên kiểu Sheet (ngay_de_cuong, tt_de_cuong…) và nhãn tiếng
 * Việt, còn rpc_update_progress nhận tên cột DB và enum phase_status.
 * Ánh xạ đặt ở đây để chỉ có MỘT chỗ phải sửa khi đổi form hay đổi cột.
 * ------------------------------------------------------------------ */

/** Tên trường trên form -> cột trong vmp_plan_items. */
const FORM_TO_COLUMN: Record<string, string> = {
  ngay_de_cuong:   "actual_protocol_date",
  tt_de_cuong:     "status_protocol",
  lich_td:         "scheduled_at",
  ngay_tham_dinh:  "actual_validation_date",
  tt_tham_dinh:    "status_validation",
  ngay_bao_cao:    "actual_report_date",
  tt_bao_cao:      "status_report",
  ngay_vmp:        "actual_vmp_date",
  tt_vmp:          "status_vmp",
};

/** Nhãn tiếng Việt trên dropdown -> enum phase_status của Postgres. */
const LABEL_TO_STATUS: Record<string, string> = {
  "Hoàn thành":      "completed",
  "Đang thực hiện":  "in_progress",
  "Chưa hoàn thành": "not_started",
  "Kế hoạch":        "not_started",
};

/** datetime-local không mang timezone. Dữ liệu nghiệp vụ luôn được hiểu theo
 * Asia/Bangkok (+07, không DST), rồi đổi sang ISO trước khi gửi timestamptz. */
function bangkokLocalToIso(value: string): string {
  const local = value.trim();
  if (!local) return local;
  const match = local.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/);
  if (match) return new Date(`${match[1]}T${match[2]}:${match[3] || "00"}+07:00`).toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(local)) return new Date(`${local}T00:00:00+07:00`).toISOString();
  const parsed = new Date(local);
  return Number.isNaN(parsed.getTime()) ? local : parsed.toISOString();
}

/**
 * Cập nhật tiến độ một hạng mục từ form.
 * Trả về lỗi rõ ràng khi RPC từ chối — ví dụ thiếu LÝ DO lúc đánh dấu hoàn
 * thành (yêu cầu GMP), hoặc version_conflict khi người khác vừa sửa.
 */
export async function updateItemProgress(
  validationCode: string,
  form: Record<string, unknown>,
  reason?: string,
  expectedVersion?: number,
): Promise<RpcResult> {
  // `form` là BẢN CHÊNH — hộp sửa chỉ đưa vào những ô người dùng thật sự đổi.
  // Nhờ vậy phân biệt được ba việc khác hẳn nhau:
  //    khoá vắng mặt      → không đụng tới ô đó
  //    khoá = ""          → XOÁ TRẮNG (nhập nhầm ngày, sửa lại cho đúng)
  //    khoá có giá trị    → ghi giá trị mới
  // Bản cũ `if (raw === "") continue` gộp hai trường hợp đầu làm một, nên xoá
  // một ngày nhập nhầm là bấm Lưu xong không có gì xảy ra. Nó cũng gửi lên
  // TOÀN BỘ 9 cột mỗi lần lưu, khiến nhật ký kiểm toán ghi cả những ô không ai
  // đụng vào — soi hồ sơ về sau không biết lần đó người ta sửa cái gì.
  const patch: Record<string, unknown> = {};
  for (const [formKey, col] of Object.entries(FORM_TO_COLUMN)) {
    if (!Object.prototype.hasOwnProperty.call(form, formKey)) continue;
    const raw = form[formKey];
    if (raw === undefined || raw === null || raw === "") {
      // Ngày xoá được về trắng. Trạng thái thì KHÔNG để null: cột này nuôi
      // stageOf / bản đồ giai đoạn / mọi phép đếm, null vào là các màn đó
      // rơi vào nhánh "không rõ". "Chưa nhập" đúng nghĩa là not_started.
      patch[col] = col.startsWith("status_") ? "not_started" : null;
    } else if (col.startsWith("status_")) {
      const mapped = LABEL_TO_STATUS[String(raw)];
      if (mapped) patch[col] = mapped;      // nhãn lạ thì bỏ qua, không đoán
    } else {
      patch[col] = col === "scheduled_at"
        ? bangkokLocalToIso(String(raw))
        : String(raw);                      // ngày đã ở dạng yyyy-mm-dd
    }
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Chưa có thay đổi nào để lưu" };
  }
  return updateProgressSupabase(validationCode, patch, reason, null, expectedVersion);
}

/** Thêm hạng mục timeline. Mã sinh theo quy ước VMP01: {mã}/{năm}.{lần}-{loại} */
export async function createPlanItem(
  { objectCode, validationType, year, occurrence = 1, patch = {} }: {
    objectCode: string; validationType: string; year?: number;
    occurrence?: number; patch?: Record<string, unknown>;
  },
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_create_plan_item", {
    p_object_code: objectCode,
    p_validation_type: validationType,
    p_year: year ?? undefined,
    p_occurrence: occurrence,
    p_patch: patch as never,
  });
  return unwrap(data, error, "Tạo hạng mục thất bại");
}

/** Xoá mềm hạng mục timeline (giữ lại để audit). Bắt buộc có lý do. */
export async function deletePlanItem(validationCode: string, reason: string): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_delete_plan_item", {
    p_validation_code: validationCode,
    p_reason: reason,
  });
  return unwrap(data, error, "Xoá hạng mục thất bại");
}

/* upsertSourceObject / deleteSourceObject đã GỠ (Đợt B Task 6): mọi lối
 * ghi danh mục đi qua rpc_save_catalog_object — có lý do, có khoá phiên
 * bản, có audit. Ngừng dùng = tắt is_active trong hộp thoại, không còn
 * lệnh riêng đi vòng qua đối chiếu trước/sau. */

/** Sinh hạng mục timeline từ danh mục nguồn, theo đúng luật VMP01.
 *  commit=false chỉ xem trước. Idempotent: mã đã có thì bỏ qua, và không
 *  bao giờ đè lên cột tiến độ người dùng đã nhập. */
/** Một nhóm cảnh báo về dữ liệu nguồn — mỗi phần tử là một đối tượng cần rà. */
/* ---- Lịch sử một hạng mục (rpc_item_progress_history, Đợt B Task 11) ---- */
export interface ItemProgressHistoryEntry {
  id: string;
  created_at: string;
  actor: string;
  effective_business_role: string;
  action: string;
  changed_fields: string[] | null;
  reason: string | null;
  source: string | null;
  has_detail: boolean;
}

export async function fetchItemProgressHistory(
  validationCode: string, limit = 50, offset = 0,
): Promise<{ ok: boolean; total: number; history: ItemProgressHistoryEntry[]; error?: string }> {
  if (!supabase) return { ok: false, total: 0, history: [], error: "Supabase chưa cấu hình" };
  const goi = supabase.rpc.bind(supabase) as unknown as (
    fn: string, args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await goi("rpc_item_progress_history", {
    p_validation_code: validationCode, p_limit: limit, p_offset: offset,
  });
  if (error) return { ok: false, total: 0, history: [], error: error.message };
  const kq = (data || {}) as Record<string, unknown>;
  if (kq.ok !== true) {
    return { ok: false, total: 0, history: [], error: String(kq.error ?? "Không đọc được lịch sử") };
  }
  return {
    ok: true,
    total: Number(kq.total ?? 0),
    history: (Array.isArray(kq.history) ? kq.history : []) as ItemProgressHistoryEntry[],
  };
}

export interface SourceWarnings {
  nam: number;
  /** Chắc chắn sai: không có tháng đầu tiên thì mọi mốc đều hỏng. */
  thieu_thang_dau: Array<{ object_kind: string; object_code: string; object_name: string }>;
  /** Cần người xem: có thể là thiết bị cũ (bình thường) hoặc bỏ lỡ một năm. */
  chua_tung_iq: Array<{ object_kind: string; object_code: string; object_name: string; nam_nhap: number }>;
  /** Cần người xem: có thẩm định nhưng cờ hiển thị tắt. */
  show_tat: Array<{ object_kind: string; object_code: string; object_name: string; show_flag: string }>;
  /** Cần người xem: "Chưa hoạt động" chính là thứ CẦN DQ/IQ nên không lọc tự động. */
  chua_hoat_dong: Array<{ object_kind: string; object_code: string; object_name: string; tinh_trang: string }>;
  /** Chắc chắn cần xử lý: dòng Sheet trùng mã / không mã, đã cứu vào với mã TẠM. */
  ma_tam?: Array<{ object_kind: string; object_code: string; object_name: string; note: string }>;
}

export async function fetchSourceWarnings(year?: number): Promise<SourceWarnings> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_source_warnings", { p_year: year ?? undefined });
  if (error) throw new Error("Lỗi rà dữ liệu nguồn: " + error.message);

  /* Điền đủ năm nhóm cảnh báo trước khi trả về.
   *
   * Vì sao cần: màn Danh mục đọc thẳng `.chua_hoat_dong.length` trong một
   * useMemo. Chỉ cần RPC trả thiếu một nhóm — phiên bản hàm cũ hơn, hoặc
   * một nhánh trả sớm — là `undefined.length` ném lỗi ngay trong lúc
   * render, và ErrorBoundary nuốt trọn cả màn: người dùng thấy trang lỗi
   * đỏ thay vì thấy danh mục. Một trường thiếu không đáng đổi lấy cả màn.
   */
  const tho = asShape<Partial<SourceWarnings>>(data);
  const mang = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
  return {
    nam: typeof tho.nam === "number" ? tho.nam : (year ?? new Date().getFullYear()),
    thieu_thang_dau: mang(tho.thieu_thang_dau),
    chua_tung_iq: mang(tho.chua_tung_iq),
    show_tat: mang(tho.show_tat),
    chua_hoat_dong: mang(tho.chua_hoat_dong),
    ma_tam: mang(tho.ma_tam),
  };
}

export async function generateTimeline(
  year?: number | null, commit = false,
): Promise<GenerateTimelineResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_generate_timeline", {
    p_year: year ?? undefined,
    p_commit: commit,
  });
  return unwrap<GenerateTimelineResult>(data, error, "Sinh timeline thất bại");
}

/* ============================================================
 * Các hàm tính SẴN Ở SERVER — trước đây web tự tính lại ở client
 * hoặc bỏ không dùng. Dùng bản server để số liệu trên web khớp
 * đúng số liệu mà n8n và báo cáo dùng.
 * ============================================================ */

/** KPI tổng hợp: hạng mục & hồ sơ theo done/over/todo + số lệch. */
export interface ServerKpi {
  updated_at: string;
  validation: { done: number; over: number; todo: number; total: number };
  documentation: { done: number; over: number; todo: number; total: number };
  mismatch_count: number;
}

export async function fetchDashboardKpi(year?: number): Promise<ServerKpi> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_dashboard_kpi", { p_year: year ?? undefined });
  if (error) throw new Error("Lỗi đọc KPI: " + error.message);
  return asShape<ServerKpi>(data);
}

/** Một vấn đề chất lượng dữ liệu do server phát hiện. */
export interface ServerQualityIssue {
  id: string;
  type: string;
  severity: string;
  msg: string;
}

export async function checkDataQuality(year?: number): Promise<ServerQualityIssue[]> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_check_data_quality", { p_year: year ?? undefined });
  if (error) throw new Error("Lỗi kiểm tra chất lượng dữ liệu: " + error.message);
  return asShape<ServerQualityIssue[]>(data) || [];
}

/** Một hạng mục đến hạn — ĐÚNG dữ liệu mà workflow cảnh báo dùng để gửi mail. */
export interface DueAlert {
  validation_code: string;
  validation_type: string;
  object_code: string;
  object_name: string;
  department: string;
  owner_name: string;
  stage: string;
  due_date: string;
  days_left: number;
  alert_type: "overdue" | "due_soon";
}

export async function fetchDueAlerts(year?: number, soonDays = 7): Promise<DueAlert[]> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_due_alerts", {
    p_year: year ?? undefined, p_soon_days: soonDays,
  });
  if (error) throw new Error("Lỗi đọc cảnh báo: " + error.message);
  return asShape<DueAlert[]>(data) || [];
}

/** Tính lại computed_status cho toàn bộ hạng mục (theo ngày hôm nay). */
export async function refreshComputedStatus(): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_refresh_computed_status");
  return unwrap(data, error, "Tính lại trạng thái thất bại");
}

/** Nhật ký thao tác, lọc phía server thay vì kéo hết về client. */
export async function fetchAuditLogs(opts: {
  limit?: number; offset?: number; table?: string | null;
  action?: string | null; userEmail?: string | null; recordId?: string | null;
} = {}): Promise<unknown> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_get_audit_logs", {
    p_limit: opts.limit ?? 100,
    p_offset: opts.offset ?? 0,
    p_table_name: opts.table ?? undefined,
    p_action: opts.action ?? undefined,
    p_user_email: opts.userEmail ?? undefined,
    p_record_id: opts.recordId ?? undefined,
  });
  if (error) throw new Error("Lỗi đọc nhật ký: " + error.message);
  return data;
}

/* ---- Trạng thái hệ thống (màn Quản trị) ---- */
/** Người dùng, cấu hình, lịch chạy tự động, khối lượng dữ liệu, lỗi workflow.
 *  Gom một lời gọi để màn Quản trị không phải bắn 6 truy vấn rời. */
export interface SystemStatus {
  ok?: boolean;
  error?: string;
  nguoi_dung?: Array<{ ten: string; email: string; vai_tro: string; bo_phan: string | null; dang_dung: boolean; dang_nhap_gan_nhat: string | null }>;
  cau_hinh?: Array<{ khoa: string; gia_tri: unknown }>;
  lich_tu_dong?: Array<{ ten: string; lich: string; dang_bat: boolean; lenh: string }>;
  dong_bo_gan_nhat?: { luc: string; trang_thai: string; so_dong_nguon: number; so_ma_trung: number } | null;
  du_lieu?: Record<string, string | number>;
  workflow_loi_7_ngay?: Array<{ ten: string; luc: string; loi: string }>;
}

export async function fetchSystemStatus(): Promise<SystemStatus> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_trang_thai_he_thong");
  if (error) throw new Error("Lỗi đọc trạng thái hệ thống: " + error.message);
  return asShape<SystemStatus>(data);
}

/* ---- Luật đang áp dụng ---- */

/** Luật hệ thống đang chạy, đọc THẲNG từ DB nên không thể lệch thực tế. */
export interface ActiveRules {
  cap_nhat: string;
  diem_trong_yeu: {
    cong_thuc: string;
    thang: string;
    phuc_tap: Array<{ muc: string; diem: number; mo_ta?: string; vi_du?: string }>;
    anh_huong: Array<{ muc: string; diem: number; mo_ta?: string; vi_du?: string }>;
    phan_bo: Array<{ diem: number; so_luong: number }>;
    /** Phân bố từng trục — cho thấy trục nào thật sự phân biệt được. */
    phan_bo_truc?: {
      phuc_tap: Array<{ diem: number; so_luong: number }>;
      anh_huong: Array<{ diem: number; so_luong: number }>;
    };
    da_duyet: number;
    cho_duyet: number;
  };
  sinh_timeline: {
    loc: string;
    loai_tham_dinh: Array<{ phan_loai: string; loai: string }>;
    lan_dau: string;
    so_lan_trong_nam: string;
    ma_id: string;
    moc_thoi_gian: string[];
    khoang_cach_bao_cao: Array<{ dieu_kien: string; ngay: number }>;
  };
  phan_quyen: Array<{ vai_tro: string; quyen: string }>;
  /** Chế độ áp quyền màn hình (preview/enforced) — RPC mới mới có. */
  phan_quyen_che_do?: string;
  /** Ghi chú nơi xem/sửa ma trận đầy đủ — RPC mới mới có. */
  phan_quyen_ghi_chu?: string;
  toan_ven_du_lieu: string[];
  so_lieu_hien_tai: {
    doi_tuong_nguon: number; co_tham_dinh: number;
    hang_muc: number; ban_ghi_audit: number;
  };
}

export async function fetchActiveRules(): Promise<ActiveRules> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_active_rules");
  if (error) throw new Error("Lỗi đọc luật: " + error.message);

  /* Điền đủ cây mặc định trước khi trả về — cùng lý do với
   * fetchSourceWarnings: màn Luật đọc thẳng `rules.so_lieu_hien_tai.doi_tuong_nguon`,
   * nên chỉ cần RPC thiếu một nhánh là cả màn thành trang lỗi đỏ. Thiếu
   * số liệu thì hiện số 0; thiếu cả màn thì không ai đọc được luật nào. */
  const tho = asShape<Partial<ActiveRules>>(data);
  const mang = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
  const obj = <T extends object>(v: T | undefined, mac_dinh: T): T =>
    (v && typeof v === "object" ? { ...mac_dinh, ...v } : mac_dinh);

  return {
    cap_nhat: tho.cap_nhat || "",
    diem_trong_yeu: obj(tho.diem_trong_yeu, {
      cong_thuc: "", thang: "", phuc_tap: [], anh_huong: [], phan_bo: [],
      da_duyet: 0, cho_duyet: 0,
    }),
    sinh_timeline: obj(tho.sinh_timeline, {
      loc: "", loai_tham_dinh: [], lan_dau: "", so_lan_trong_nam: "",
      ma_id: "", moc_thoi_gian: [], khoang_cach_bao_cao: [],
    }),
    phan_quyen: mang(tho.phan_quyen),
    phan_quyen_che_do: typeof tho.phan_quyen_che_do === "string" ? tho.phan_quyen_che_do : undefined,
    phan_quyen_ghi_chu: typeof tho.phan_quyen_ghi_chu === "string" ? tho.phan_quyen_ghi_chu : undefined,
    toan_ven_du_lieu: mang(tho.toan_ven_du_lieu),
    so_lieu_hien_tai: obj(tho.so_lieu_hien_tai, {
      doi_tuong_nguon: 0, co_tham_dinh: 0, hang_muc: 0, ban_ghi_audit: 0,
    }),
  };
}

/** Chấm lại điểm trọng yếu. Mặc định chỉ đụng dòng chưa được QA chốt tay. */
export async function recalcCriticality(onlyAuto = true): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_recalc_criticality", { p_only_auto: onlyAuto });
  return unwrap(data, error, "Chấm lại điểm trọng yếu thất bại");
}

/* ---- Tab thô (mọi tab của workbook) ---- */

/** Một dòng thô trong vmp_source_rows. */
export interface SourceRow {
  id: number;
  source_tab: string;
  row_number: number;
  payload: Record<string, unknown>;
}

export async function listSourceTabs(): Promise<
  Array<{ source_tab: string; rows: number; columns: number }>
> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_list_source_tabs");
  if (error) throw new Error("Lỗi đọc danh sách tab: " + error.message);
  return asShape(data);
}

export async function fetchSourceRows(tab: string): Promise<SourceRow[]> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase
    .from("vmp_source_rows")
    .select("id,source_tab,row_number,payload")
    .eq("source_tab", tab)
    .order("row_number");
  if (error) throw new Error("Lỗi đọc dữ liệu tab: " + error.message);
  return asShape(data || []);
}

export async function upsertSourceRow(
  tab: string, rowNumber: number | null, payload: Record<string, unknown>,
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_upsert_source_row", {
    p_source_tab: tab,
    // NULL = thêm mới, RPC tự lấy số dòng kế tiếp.
    p_row_number: (rowNumber ?? null) as unknown as number,
    p_payload: payload as never,
  });
  return unwrap(data, error, "Lưu dòng thất bại");
}

export async function deleteSourceRow(tab: string, rowNumber: number): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_delete_source_row", {
    p_source_tab: tab, p_row_number: rowNumber,
  });
  return unwrap(data, error, "Xoá dòng thất bại");
}

/* ---- Người nhận cảnh báo & Danh bạ nhân sự ----
 * Bốn hàm upsert/delete cũ đã GỠ (Đợt B Task 6): người nhận cảnh báo ghi
 * qua rpc_save_alert_recipient (features/catalogWorkspace/api.ts); danh bạ
 * nhân sự quản lý ở màn Nhân sự & phân công (features/itemPermissions).
 * fetchAlertRecipients/fetchStaffEmails giữ lại vì AiMailModal còn đọc. */

/* ---- Phân quyền người dùng ----
 * Ba chốt an toàn nằm ở RPC chứ không ở đây: chỉ admin gọi được, không tự
 * hạ vai mình, và luôn còn ít nhất một admin hoạt động. Đặt ở server vì
 * client luôn có thể bị bỏ qua. */
export async function setUserRole(
  userId: string, role: string, department: string | null, reason?: string,
  phamVi?: string | null,
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  // Kiểu RPC sinh tự động từ schema (src/types/database.ts) chưa có hàm này
  // vì file đó sinh trước migration 20260801050000. Chạy `npm run gen:types`
  // là hết cần ép kiểu — ép ở đây để không phải sinh lại cả file ngay lúc này.
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string, args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)("rpc_set_user_role", {
    p_user_id: userId,
    p_role: role,
    p_department: department,
    p_reason: reason ?? null,
    // Rỗng = "theo mức chung của vai", đúng nghĩa NULL ở cột profiles.pham_vi.
    p_pham_vi: phamVi || null,
  });
  return unwrap(data, error, "Đổi phân quyền thất bại");
}

/* ---- Một người, một dòng (migration 20260801110000) ----
 * Trước đây màn Phân quyền đọc bốn nguồn — profiles, vmp_performers,
 * vmp_staff_emails, owner_name — rồi tự gộp bằng JavaScript, gộp theo CHUỖI
 * TÊN. Gộp theo tên thì "Tào Tiến Hoàn" ở bảng người thực hiện và "Admin
 * chính" ở bảng tài khoản là hai người khác nhau, dù cùng một email. Nay
 * database gộp một lần bằng email + user_id và trả về một dòng một người.
 *
 * `so_sua_duoc` là số hạng mục người đó THẬT SỰ sửa được, đếm bằng đúng luật
 * đang chạy — không phải bản mô tả luật viết lại ở client rồi lệch dần. */
export interface NguoiQuyenRow {
  /** id trong vmp_performers. null = tài khoản chưa nối với người nào. */
  pid: string | null;
  /** id tài khoản đăng nhập. null = người này chưa có tài khoản. */
  user_id: string | null;
  ten: string | null;
  email: string | null;
  bo_phan: string | null;
  bo_phan_nguoi: string | null;
  bo_phan_tai_khoan: string | null;
  vai: string | null;
  /** Phạm vi riêng đặt cho người này. null = theo mức chung của vai. */
  pham_vi_rieng: "co" | "bo_phan" | "phan_cong" | "khong" | null;
  /** Mức hiệu lực = phạm vi riêng nếu có, không thì mức của vai. */
  muc: "co" | "bo_phan" | "phan_cong" | "khong" | null;
  co_tai_khoan: boolean;
  tk_hoat_dong: boolean;
  so_sua_duoc: number;
  so_dung_ten: number;
  so_phan_cong: number;
}

export interface NguoiVaQuyen {
  tongHangMuc: number;
  nguoi: NguoiQuyenRow[];
}

export async function fetchNguoiVaQuyen(): Promise<NguoiVaQuyen> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)("rpc_nguoi_va_quyen");
  if (error) throw new Error(error.message);
  const o = (data || {}) as { ok?: boolean; error?: string; tong_hang_muc?: number; nguoi?: NguoiQuyenRow[] };
  if (o.ok === false) throw new Error(o.error || "Không đọc được danh sách người");
  return { tongHangMuc: o.tong_hang_muc || 0, nguoi: o.nguoi || [] };
}

/* ---- Nửa "XEM" của ma trận quyền (migration 20260801130000) ----
 * Quyền ĐỌC không nằm trong vmp_role_permissions mà nằm ở policy RLS của
 * Postgres. rpc_luat_xem đi đọc đúng những policy đang chạy rồi phân loại
 * ra mức cho từng vai — nên bảng trên màn hình không thể lệch với luật
 * thật. Mức 'khong_ro' nghĩa là hàm gặp một dạng biểu thức nó chưa nhận
 * diện được; lúc đó giao diện hiện nguyên văn biểu thức thay vì đoán. */
export type MucXem = "tat_ca" | "mot_phan" | "cua_minh" | "khong" | "khong_ro";

export interface LuatXemRow {
  bang: string;
  nhan: string;
  /** Nguyên văn biểu thức RLS đang chạy. null = bảng không có policy đọc nào. */
  bieu_thuc: string | null;
  muc: Record<string, MucXem>;
}

export async function fetchLuatXem(): Promise<LuatXemRow[]> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)("rpc_luat_xem");
  if (error) throw new Error(error.message);
  const o = (data || {}) as { ok?: boolean; error?: string; noi_dung?: LuatXemRow[] };
  if (o.ok === false) throw new Error(o.error || "Không đọc được luật xem");
  return o.noi_dung || [];
}

/** Nối tay một người thực hiện với một tài khoản, cho trường hợp email hai
 *  bên khác nhau nên bước nối tự động ở migration không bắt được.
 *  userId = null là gỡ nối. */
export async function lienKetTaiKhoan(
  performerId: string, userId: string | null,
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string, args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)("rpc_lien_ket_tai_khoan", {
    p_performer_id: performerId,
    p_user_id: userId,
  });
  return unwrap(data, error, "Nối tài khoản thất bại");
}

/* ---- Danh sách email được phép có tài khoản ---- */
export interface EmailChoPhepRow {
  email: string;
  ghi_chu: string | null;
  is_active: boolean;
}

export async function fetchEmailChoPhep(): Promise<EmailChoPhepRow[]> {
  if (!supabase) return [];
  // Bảng sinh ở migration 20260801090000 — chưa có trong types sinh tự động.
  const { data, error } = await supabase
    .from("vmp_email_cho_phep" as never)
    .select("email,ghi_chu,is_active");
  if (error) throw new Error(error.message);
  return ((data || []) as unknown as EmailChoPhepRow[])
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function setEmailChoPhep(
  email: string, choPhep: boolean, ghiChu?: string,
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string, args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)("rpc_set_email_cho_phep", {
    p_email: email, p_cho_phep: choPhep, p_ghi_chu: ghiChu ?? null,
  });
  return unwrap(data, error, "Lưu danh sách email thất bại");
}

/* ---- Ma trận A: luật vai trò × hành động (bảng vmp_role_permissions) ---- */
export interface RolePermRow {
  hanh_dong: string;
  vai_tro: string;
  muc: "co" | "bo_phan" | "phan_cong" | "khong";
}

export async function fetchRolePermissions(): Promise<RolePermRow[]> {
  if (!supabase) return [];
  // Bảng sinh ở migration 20260801070000 — chưa có trong types sinh tự động.
  const { data, error } = await supabase
    .from("vmp_role_permissions" as never)
    .select("hanh_dong,vai_tro,muc");
  if (error) throw new Error(error.message);
  return (data || []) as unknown as RolePermRow[];
}

export async function setRolePermission(
  hanhDong: string, vaiTro: string, muc: "co" | "bo_phan" | "phan_cong" | "khong",
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string, args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)("rpc_set_role_permission", {
    p_hanh_dong: hanhDong, p_vai_tro: vaiTro, p_muc: muc,
  });
  return unwrap(data, error, "Lưu luật phân quyền thất bại");
}

/* ---- Ma trận phân công: nhân viên × loại thẩm định × line ---- */
export interface AssignmentRow {
  staff_name: string;
  department: string;
  validation_type: string;
  /** '*' nghĩa là mọi line của bộ phận. */
  line: string;
  vai_tro: "thuc_hien" | "ho_tro";
}

export async function fetchAssignments(): Promise<AssignmentRow[]> {
  if (!supabase) return [];
  // Bảng sinh ở migration 20260801060000, sau lần sinh types gần nhất, nên
  // src/types/database.ts chưa biết nó. `npm run gen:types` (cần Docker
  // chạy) là hết cần ép kiểu ở đây.
  const { data, error } = await supabase
    .from("vmp_assignment_matrix" as never)
    .select("staff_name,department,validation_type,line,vai_tro")
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return (data || []) as unknown as AssignmentRow[];
}

/** vaiTro rỗng = bỏ tích ô đó. */
export async function setAssignment(
  staffName: string, department: string, validationType: string,
  line: string, vaiTro: "" | "thuc_hien" | "ho_tro",
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string, args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)("rpc_set_assignment", {
    p_staff_name: staffName,
    p_department: department,
    p_validation_type: validationType,
    p_line: line,
    p_vai_tro: vaiTro,
  });
  return unwrap(data, error, "Lưu phân công thất bại");
}

/* ---- Người thực hiện ---- */
export async function upsertPerformer(
  id: string | null, patch: Record<string, unknown>,
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_upsert_performer", {
    // NULL nghĩa là 'tạo mới'; type sinh tự động khai uuid không nullable.
    p_id: (id ?? null) as unknown as string,
    p_patch: patch as never,
  });
  return unwrap(data, error, "Lưu người thực hiện thất bại");
}

/** Gán người thực hiện cho một hạng mục.
 *  Ghi vào ĐỐI TƯỢNG (vmp_source_objects) rồi đẩy xuống mọi hạng mục của nó —
 *  owner_name trên hạng mục bị WF-04 ghi đè mỗi lần đồng bộ nên không giữ được.
 *  Tên rỗng = bỏ gán. Tên không có trong danh sách thì RPC từ chối. */
export async function setItemPerformer(
  validationCode: string, performerName: string,
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_set_item_performer", {
    p_validation_code: validationCode,
    p_performer_name: performerName,
  });
  return unwrap(data, error, "Gán người thực hiện thất bại");
}

/** Gán bằng khóa danh bạ ổn định; tên chỉ còn là dữ liệu hiển thị legacy. */
export async function setItemPerformerById(
  validationCode: string,
  personId: string | null,
  reason: string,
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc(
    "rpc_set_item_performer_by_id" as never,
    buildSetItemPerformerByIdArgs(validationCode, personId, reason) as never,
  );
  return unwrap(data, error, "Gán người thực hiện thất bại");
}

export async function deletePerformer(id: string): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_delete_performer", { p_id: id });
  return unwrap(data, error, "Xoá người thực hiện thất bại");
}

/* ---- Sản phẩm GMP ----
 * upsertProductGmp/deleteProductGmp/fetchProductsGmp đã GỠ (Đợt B Task 6):
 * đọc qua rpc_list_catalog_dataset, ghi qua rpc_save_product_gmp — đều
 * nằm ở features/catalogWorkspace/api.ts. Không còn xoá vật lý. */

export async function upsertObjectSupabase(obj: {
  code: string; name: string; classification: string; department?: string | null;
  area?: string | null; criticality?: string; frequency_months?: number | null;
  notes?: string | null;
}): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  // rpc_upsert_object yêu cầu department/area/frequency_months không rỗng
  // (xem chữ ký trong types/database.ts) — điền mặc định giống DB.
  const { data, error } = await supabase.rpc("rpc_upsert_object", {
    p_code: obj.code,
    p_name: obj.name,
    p_classification: obj.classification,
    p_department: obj.department ?? "",
    p_area: obj.area ?? "—",
    p_criticality: obj.criticality ?? "medium",
    p_frequency_months: obj.frequency_months ?? 12,
    p_notes: obj.notes ?? undefined,
  });
  return unwrap(data, error, "Lưu đối tượng thất bại");
}

export async function resolveMissingItem(
  validationCode: string, decision: string, reason: string,
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_resolve_missing", {
    p_validation_code: validationCode, p_decision: decision, p_reason: reason,
  });
  return unwrap(data, error, "Xử lý mã mất thất bại");
}

// ---- Các API chỉ có nghĩa trong kiến trúc cũ (ghi ngược Google Sheet) ----
// Sheet nay là dữ liệu gốc CHỈ ĐỌC; outbox đã bị vô hiệu hoá ngay trong RPC.
function sheetIsReadOnly() {
  return new Error("Google Sheet là dữ liệu gốc chỉ đọc. Nhập liệu thực hiện trên dashboard.");
}

export async function resolveOutbox(outboxId: number, ok: boolean, error?: string): Promise<never> {
  void outboxId; void ok; void error;
  throw sheetIsReadOnly();
}

export async function pushToSheet(
  n8nWriteUrl: string, validationCode: string, patch: unknown,
): Promise<never> {
  void n8nWriteUrl; void validationCode; void patch;
  throw sheetIsReadOnly();
}

// ============================================================
// GHI: Danh mục nguồn qua RPC có kiểm version
// ============================================================
/** Kết quả `rpc_save_catalog_object`. `pending_timeline` là thứ giao diện
 *  dùng để hiện thẻ "Danh mục đã đổi, timeline chưa cập nhật" — không được
 *  hiển thị timeline như thể đã đồng bộ khi cờ này bật. */
export interface KetQuaLuuDanhMuc {
  ok: boolean;
  object_code?: string;
  /** Chỉ có khi thay đổi chạm tới timeline — dùng để mở màn xem trước. */
  change_id?: string;
  version?: number;
  timeline_revision?: number;
  timeline_applied_revision?: number;
  pending_timeline?: boolean;
  error?: string;
  error_code?: string;
  current_version?: number;
}

export async function saveCatalogObject(
  objectKind: ObjectKind,
  objectCode: string,
  patch: Record<string, unknown>,
  reason: string | null,
  expectedVersion: number | null,
): Promise<KetQuaLuuDanhMuc> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");

  /* Chưa có trong database.ts vì types sinh từ schema trước migration
     20260812120000. Ép kiểu tại đúng một chỗ, và PHẢI bind — supabase.rpc
     dùng `this` bên trong. */
  const goi = supabase.rpc.bind(supabase) as unknown as (
    fn: string, args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;

  const { data, error } = await goi("rpc_save_catalog_object", {
    p_object_kind: objectKind,
    p_object_code: objectCode,
    p_patch: patch,
    p_reason: reason,
    p_expected_version: expectedVersion,
  });
  if (error) throw new Error("Lưu danh mục thất bại: " + error.message);
  return asShape<KetQuaLuuDanhMuc>(data);
}

// ============================================================
// Xem trước và áp thay đổi danh mục vào timeline
// ============================================================
export interface AnhHuongTimeline {
  ok: boolean;
  change_id?: string;
  object_code?: string;
  timeline_revision?: number;
  tao?: { validation_code: string; validation_type: string; deadline_vmp: string | null; thieu: string[] }[];
  sua?: { validation_code: string; deadline_vmp_cu: string | null; deadline_vmp_moi: string | null }[];
  dung?: { validation_code: string; ly_do: string }[];
  giu_nguyen?: { validation_code: string; ly_do: string }[];
  canh_bao?: string[];
  error?: string;
  error_code?: string;
}

export interface KetQuaApDung {
  ok: boolean;
  so_tao?: number;
  so_sua?: number;
  so_dung?: number;
  so_giu_nguyen?: number;
  error?: string;
  error_code?: string;
}

/** Ép kiểu tại một chỗ: types sinh từ schema trước migration 20260812130000.
 *  PHẢI bind — supabase.rpc dùng `this` bên trong. */
function goiRpc() {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  return supabase.rpc.bind(supabase) as unknown as (
    fn: string, args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

export async function previewCatalogChange(changeId: string): Promise<AnhHuongTimeline> {
  const { data, error } = await goiRpc()("rpc_preview_catalog_change", { p_change_id: changeId });
  if (error) throw new Error("Không xem trước được ảnh hưởng: " + error.message);
  return asShape<AnhHuongTimeline>(data);
}

export async function applyCatalogChange(
  changeId: string, reason: string, expectedTimelineRevision: number | null,
): Promise<KetQuaApDung> {
  const { data, error } = await goiRpc()("rpc_apply_catalog_change", {
    p_change_id: changeId,
    p_reason: reason,
    p_expected_timeline_revision: expectedTimelineRevision,
  });
  if (error) throw new Error("Áp vào timeline thất bại: " + error.message);
  return asShape<KetQuaApDung>(data);
}

// ============================================================
// ĐỌC: Quyền MÀN HÌNH của phiên hiện tại
// ============================================================
/* Ba kết quả, không phải hai — cùng lý do như layPhien() ở supabaseClient:
   "server chưa có RPC này" và "gọi được nhưng lỗi" là hai chuyện khác hẳn,
   bên gọi phải xử lý khác nhau.

   `chua_co_rpc` là trạng thái BÌNH THƯỜNG trong giai đoạn chuyển tiếp:
   migration phân quyền màn hình đi sau bản web này. Lúc đó phải rơi về
   quyền cũ (legacyAccessContext), chứ coi là "không có quyền gì" thì mọi
   người mất sạch menu chỉ vì thứ tự triển khai. */
export type UiAccessKetQua =
  | { trangThai: "co"; payload: unknown }
  | { trangThai: "chua_co_rpc" }
  | { trangThai: "loi"; thongDiep: string };

/** Mã lỗi PostgREST/Postgres khi hàm chưa tồn tại trong schema. */
const MA_LOI_THIEU_HAM = new Set(["PGRST202", "42883"]);

export async function fetchUiAccess(): Promise<UiAccessKetQua> {
  if (!supabase) return { trangThai: "loi", thongDiep: "Supabase chưa cấu hình" };

  /* `rpc_my_ui_access` chưa có trong src/types/database.ts vì file đó sinh từ
     schema live, mà migration tạo hàm này chưa chạy. Ép kiểu tại đúng một
     chỗ, có chú thích, thay vì tắt kiểm kiểu cả file. Sinh lại types sau khi
     migration chạy thì xoá được đoạn ép này.

     PHẢI `bind`: `supabase.rpc` là method dùng `this` bên trong (this.rest).
     Gán nó ra biến rồi gọi trần làm mất receiver, và lỗi hiện ra ở tận
     runtime dưới dạng "Cannot read properties of undefined (reading 'rest')"
     — typecheck không bắt được. Bộ kiểm E2E bắt được. */
  const goi = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

  const { data, error } = await goi("rpc_my_ui_access");

  if (error) {
    if (error.code && MA_LOI_THIEU_HAM.has(error.code)) return { trangThai: "chua_co_rpc" };
    return { trangThai: "loi", thongDiep: error.message };
  }
  if (data == null) return { trangThai: "chua_co_rpc" };
  return { trangThai: "co", payload: data };
}

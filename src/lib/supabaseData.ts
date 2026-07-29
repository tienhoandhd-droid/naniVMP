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
import type {
  Activity, GenerateTimelineResult, ObjectKind, ProductGmpRow, RpcResult,
  SourceObjectRow, VmpDataset, VmpObject, AlertRecipientRow, StaffEmailRow,
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

export async function fetchProductsGmp(): Promise<ProductGmpRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("vmp_products_gmp").select("*").order("bfo_code");
  if (error) { console.error("fetchProductsGmp:", error.message); return []; }
  return data || [];
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
  const { data, error } = await supabase.rpc("rpc_update_progress", {
    p_validation_code: validationCode,
    p_patch: patch as never,
    p_reason: reason ?? undefined,
    p_sheet_patch: undefined,
    p_expected_version: expectedVersion ?? undefined,
  });
  return unwrap(data, error, "Cập nhật thất bại");
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

/** Thêm/sửa một dòng danh mục nguồn (1 trong 5 mục). */
export async function upsertSourceObject(
  objectKind: ObjectKind,
  objectCode: string,
  patch: Record<string, unknown>,
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_upsert_source_object", {
    p_object_kind: objectKind,
    p_object_code: objectCode,
    p_patch: patch as never,
  });
  return unwrap(data, error, "Lưu danh mục thất bại");
}

/** Ngừng sử dụng một dòng danh mục nguồn (xoá mềm — timeline vẫn tham chiếu mã). */
export async function deleteSourceObject(
  objectKind: ObjectKind, objectCode: string, reason: string,
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_delete_source_object", {
    p_object_kind: objectKind,
    p_object_code: objectCode,
    p_reason: reason,
  });
  return unwrap(data, error, "Ngừng dùng đối tượng thất bại");
}

/** Sinh hạng mục timeline từ danh mục nguồn, theo đúng luật VMP01.
 *  commit=false chỉ xem trước. Idempotent: mã đã có thì bỏ qua, và không
 *  bao giờ đè lên cột tiến độ người dùng đã nhập. */
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

/* ---- Người nhận cảnh báo ---- */
export async function upsertAlertRecipient(
  id: string | null, patch: Record<string, unknown>,
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_upsert_alert_recipient", {
    // RPC nhận NULL để nghĩa là 'tạo mới'; type sinh tự động khai uuid không
    // nullable nên phải ép kiểu ở đây.
    p_id: (id ?? null) as unknown as string,
    p_patch: patch as never,
  });
  return unwrap(data, error, "Lưu người nhận thất bại");
}

export async function deleteAlertRecipient(id: string): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_delete_alert_recipient", { p_id: id });
  return unwrap(data, error, "Xoá người nhận thất bại");
}

/* ---- Danh bạ nhân sự ---- */
export async function upsertStaffEmail(
  id: string | null, patch: Record<string, unknown>,
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_upsert_staff_email", {
    // RPC nhận NULL để nghĩa là 'tạo mới'; type sinh tự động khai uuid không
    // nullable nên phải ép kiểu ở đây.
    p_id: (id ?? null) as unknown as string,
    p_patch: patch as never,
  });
  return unwrap(data, error, "Lưu nhân sự thất bại");
}

export async function deleteStaffEmail(id: string): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_delete_staff_email", { p_id: id });
  return unwrap(data, error, "Xoá nhân sự thất bại");
}

/* ---- Sản phẩm GMP ---- */
export async function upsertProductGmp(
  bfoCode: string, patch: Record<string, unknown>,
): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_upsert_product_gmp", {
    p_bfo_code: bfoCode, p_patch: patch as never,
  });
  return unwrap(data, error, "Lưu sản phẩm thất bại");
}

export async function deleteProductGmp(bfoCode: string): Promise<RpcResult> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_delete_product_gmp", { p_bfo_code: bfoCode });
  return unwrap(data, error, "Xoá sản phẩm thất bại");
}

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

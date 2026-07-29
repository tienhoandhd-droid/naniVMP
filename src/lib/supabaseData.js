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
import { supabase } from "./supabaseClient.js";
import { deriveActivityFields } from "./n8nAdapter.js";

// ============================================================
// ĐỌC: Dashboard data từ Supabase RPC
// ============================================================
export async function fetchVmpDataFromSupabase(year, includeMissing = false) {
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
  const activities = (data.activities || []).map((a) =>
    a && a._raw ? { ...a, ...deriveActivityFields(a._raw) } : a
  );

  return {
    objects: data.objects || [],
    activities,
    source: "supabase",
    count: activities.length,
    updated_at: data.updated_at,
  };
}

// ============================================================
// ĐỌC: Watermark nhẹ để poll phát hiện thay đổi (không kéo cả payload)
// ============================================================
// Trả { year, plan_items, objects, updated_at }. Frontend so chuỗi watermark
// trước khi refetch toàn bộ dashboard → poll 20s gần như miễn phí khi không đổi.
export async function fetchVmpWatermark(year) {
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
export async function fetchMissingItems(year) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("rpc_get_missing_items", {
    p_year: year || new Date().getFullYear(),
  });
  if (error) { console.error("fetchMissingItems:", error.message); return []; }
  return data || [];
}

// ============================================================
// ĐỌC: 5 danh mục nguồn (thiết bị / quy trình / kho / hệ thống phụ trợ /
//      vận chuyển) — đây là nơi nhập liệu chính thay cho Google Sheet
// ============================================================
export const SOURCE_KINDS = [
  "Thiết bị", "Quy trình", "Kho", "Hệ thống phụ trợ", "Vận chuyển",
];

export async function fetchSourceObjects({ kind = null, includeInactive = false } = {}) {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  let q = supabase.from("vmp_source_objects").select("*");
  if (kind) q = q.eq("object_kind", kind);
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q.order("object_kind").order("object_code");
  if (error) throw new Error("Lỗi đọc danh mục nguồn: " + error.message);
  return data || [];
}

export async function fetchProductsGmp() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("vmp_products_gmp").select("*").order("bfo_code");
  if (error) { console.error("fetchProductsGmp:", error.message); return []; }
  return data || [];
}

// ============================================================
// GHI: qua RPC — server tự kiểm tra quyền, client không ghi thẳng bảng
// ============================================================

// RPC trả { ok, error } thay vì ném lỗi SQL, nên phải kiểm cả hai tầng.
function unwrap(data, error, fallbackMsg) {
  if (error) throw new Error(fallbackMsg + ": " + error.message);
  if (data && data.ok === false) {
    const e = new Error(data.error || fallbackMsg);
    if (data.code) e.code = data.code;              // vd 'version_conflict'
    if (data.current_version != null) e.currentVersion = data.current_version;
    throw e;
  }
  return data;
}

/** Cập nhật tiến độ một hạng mục timeline.
 *  expectedVersion bật khoá lạc quan: nếu người khác đã sửa trước, RPC trả
 *  code='version_conflict' để UI bảo người dùng tải lại thay vì ghi đè. */
export async function updateProgressSupabase(validationCode, patch, reason, sheetPatch, expectedVersion) {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  void sheetPatch;  // Sheet là chỉ đọc — tham số giữ lại cho tương thích chữ ký cũ
  const { data, error } = await supabase.rpc("rpc_update_progress", {
    p_validation_code: validationCode,
    p_patch: patch,
    p_reason: reason || null,
    p_sheet_patch: null,
    p_expected_version: expectedVersion ?? null,
  });
  return unwrap(data, error, "Cập nhật thất bại");
}

/** Thêm hạng mục timeline. Mã sinh theo quy ước VMP01: {mã}/{năm}.{lần}-{loại} */
export async function createPlanItem({ objectCode, validationType, year, occurrence = 1, patch = {} }) {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_create_plan_item", {
    p_object_code: objectCode,
    p_validation_type: validationType,
    p_year: year ?? null,
    p_occurrence: occurrence,
    p_patch: patch,
  });
  return unwrap(data, error, "Tạo hạng mục thất bại");
}

/** Xoá mềm hạng mục timeline (giữ lại để audit). Bắt buộc có lý do. */
export async function deletePlanItem(validationCode, reason) {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_delete_plan_item", {
    p_validation_code: validationCode,
    p_reason: reason,
  });
  return unwrap(data, error, "Xoá hạng mục thất bại");
}

/** Thêm/sửa một dòng danh mục nguồn (1 trong 5 mục). */
export async function upsertSourceObject(objectKind, objectCode, patch) {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_upsert_source_object", {
    p_object_kind: objectKind,
    p_object_code: objectCode,
    p_patch: patch,
  });
  return unwrap(data, error, "Lưu danh mục thất bại");
}

/** Ngừng sử dụng một dòng danh mục nguồn (xoá mềm — timeline vẫn tham chiếu mã). */
export async function deleteSourceObject(objectKind, objectCode, reason) {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_delete_source_object", {
    p_object_kind: objectKind,
    p_object_code: objectCode,
    p_reason: reason,
  });
  return unwrap(data, error, "Ngừng dùng đối tượng thất bại");
}

export async function upsertObjectSupabase(obj) {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_upsert_object", {
    p_code: obj.code, p_name: obj.name, p_classification: obj.classification,
    p_department: obj.department, p_area: obj.area, p_criticality: obj.criticality,
    p_frequency_months: obj.frequency_months, p_notes: obj.notes ?? null,
  });
  return unwrap(data, error, "Lưu đối tượng thất bại");
}

export async function resolveMissingItem(validationCode, decision, reason) {
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

export async function resolveOutbox(outboxId, ok, error) {
  void outboxId; void ok; void error;
  throw sheetIsReadOnly();
}

export async function pushToSheet(n8nWriteUrl, validationCode, patch) {
  void n8nWriteUrl; void validationCode; void patch;
  throw sheetIsReadOnly();
}

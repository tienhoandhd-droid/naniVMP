/* =====================================================================
 *  supabaseData.js — Đọc dữ liệu VMP từ Supabase
 *  ---------------------------------------------------------------------
 *  Google Sheet là nguồn chỉnh sửa duy nhất. Supabase là read model cho web.
 *  Các hàm ghi cũ vẫn giữ chữ ký để tương thích nhưng luôn từ chối ở client.
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
// GHI: bị khóa — Google Sheet là nguồn canonical
// ============================================================
function readOnlyError() {
  return new Error("Google Sheet là nguồn dữ liệu chuẩn. Dashboard Supabase chỉ đọc.");
}

export async function updateProgressSupabase(validationCode, patch, reason, sheetPatch, expectedVersion) {
  void validationCode; void patch; void reason; void sheetPatch; void expectedVersion;
  throw readOnlyError();
}

// API tương thích cũ: bị khóa trong chế độ Sheet-canonical.
export async function resolveOutbox(outboxId, ok, error) {
  void outboxId; void ok; void error;
  throw readOnlyError();
}

// API tương thích cũ: bị khóa trong chế độ Sheet-canonical.
export async function upsertObjectSupabase(obj) {
  void obj;
  throw readOnlyError();
}

// API tương thích cũ: xử lý mã mất trực tiếp tại Google Sheet.
export async function resolveMissingItem(validationCode, decision, reason) {
  void validationCode; void decision; void reason;
  throw readOnlyError();
}

// API tương thích cũ: dashboard không ghi ngược Google Sheet.
export async function pushToSheet(n8nWriteUrl, validationCode, patch) {
  void n8nWriteUrl; void validationCode; void patch;
  throw readOnlyError();
}

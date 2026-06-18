/* =====================================================================
 *  supabaseData.js — Đọc/ghi dữ liệu VMP trực tiếp với Supabase
 *  ---------------------------------------------------------------------
 *  Định hướng kiến trúc:
 *  - Google Sheet = nguồn nhập liệu chính
 *  - Supabase = lưu trữ + bảo mật + phục vụ đọc nhanh cho dashboard
 *  - Dashboard ĐỌC trực tiếp Supabase RPC (không qua n8n)
 *  - Cập nhật tiến độ: ghi Supabase RPC + (tuỳ chọn) đẩy về Sheet qua n8n
 * ===================================================================== */
import { supabase, getAccessToken } from "./supabaseClient.js";
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
// GHI: Cập nhật tiến độ qua RPC (có kiểm tra quyền + lý do)
// ============================================================
export async function updateProgressSupabase(validationCode, patch, reason) {
  if (!supabase) throw new Error("Supabase chưa cấu hình");

  const { data, error } = await supabase.rpc("rpc_update_progress", {
    p_validation_code: validationCode,
    p_patch: patch,
    p_reason: reason || null,
  });

  if (error) throw new Error(error.message);
  return data; // { ok, error?, msg?, reason_logged? }
}

// ============================================================
// GHI: Upsert đối tượng qua RPC (mapping cột rõ ràng)
// ============================================================
export async function upsertObjectSupabase(obj) {
  if (!supabase) throw new Error("Supabase chưa cấu hình");

  // Map field frontend → tham số RPC
  const critMap = { Cao: "high", TB: "medium", "Thấp": "low" };
  const { data, error } = await supabase.rpc("rpc_upsert_object", {
    p_code: obj.code,
    p_name: obj.name,
    p_classification: obj.cls,
    p_department: obj.dept,
    p_area: obj.area || "",
    p_criticality: critMap[obj.crit] || "medium",
    p_frequency_months: Number(obj.freq) || 0,
    p_notes: obj.reason || null,
  });

  if (error) throw new Error(error.message);
  return data;
}

// ============================================================
// GHI: Xử lý mã mất (admin: hồi sinh hoặc xác nhận hủy)
// ============================================================
export async function resolveMissingItem(validationCode, decision, reason) {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const { data, error } = await supabase.rpc("rpc_resolve_missing", {
    p_validation_code: validationCode,
    p_decision: decision, // 'keep_active' | 'deactivate'
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data;
}

// ============================================================
// DUAL-WRITE: Đẩy cập nhật về Google Sheet qua n8n (song song Supabase)
// ============================================================
export async function pushToSheet(n8nWriteUrl, validationCode, patch) {
  if (!n8nWriteUrl) return { ok: false, skipped: true };
  try {
    const token = await getAccessToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(n8nWriteUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "updateRow", id: validationCode, patch }),
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok && (!json || json.ok !== false), status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

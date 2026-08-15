/* =====================================================================
 *  api.ts — lớp gọi RPC của workspace Danh mục
 *  ---------------------------------------------------------------------
 *  Mọi lời gọi Supabase của màn Danh mục đi qua đây. Component không gọi
 *  thẳng: gọi thẳng thì mỗi màn tự xử lý lỗi một kiểu, và tên RPC rải
 *  khắp nơi khiến đổi hợp đồng phải sửa hàng chục chỗ.
 *
 *  Nguyên tắc: KHÔNG nuốt lỗi. Mỗi hàm trả về một kết quả có `ok` và mã
 *  lỗi rõ ràng; nơi gọi quyết định hiển thị thế nào. Không hàm nào ném
 *  ngoại lệ cho lỗi nghiệp vụ — ngoại lệ chỉ dành cho hỏng hạ tầng.
 * ===================================================================== */
import { supabase } from "../../lib/supabaseClient.ts";
import { layDataset } from "./definitions.ts";
import type {
  CatalogAuditRow, CatalogChangeRow, CatalogDatasetId, CatalogListFilters,
  CatalogListResult, CatalogListRow, CatalogRecord, CatalogSaveResult,
} from "./contracts.ts";

/** Bọc lỗi hạ tầng thành kết quả có mã, để nơi gọi không phải try/catch. */
function loiHaTang(e: unknown): { ok: false; errorCode: string; error: string } {
  const msg = e instanceof Error ? e.message : String(e);
  return { ok: false, errorCode: "NETWORK", error: `Không gọi được máy chủ: ${msg}` };
}

function chuaCauHinh(): { ok: false; errorCode: string; error: string } {
  return { ok: false, errorCode: "NOT_CONFIGURED", error: "Supabase chưa được cấu hình." };
}

/** Chuẩn hoá một dòng thô từ server về hình dạng chung. */
function veDong(dataset: CatalogDatasetId, raw: CatalogRecord): CatalogListRow {
  const def = layDataset(dataset);
  return {
    dataset,
    recordId: String(raw.id ?? raw[def.businessKeyField] ?? ""),
    businessKey: String(raw[def.businessKeyField] ?? ""),
    version: Number(raw.version ?? 1),
    updatedAt: String(raw.updated_at ?? ""),
    data: raw,
  };
}

/* ------------------------------------------------------------------ *
 *  Đọc
 * ------------------------------------------------------------------ */

export async function listDataset({
  dataset, query, filters, page = 0, pageSize = 50,
}: {
  dataset: CatalogDatasetId;
  query?: string;
  filters?: Partial<CatalogListFilters> & { onlyActive?: boolean };
  page?: number;
  pageSize?: number;
}): Promise<CatalogListResult> {
  if (!supabase) return { ...chuaCauHinh(), total: 0, rows: [] };
  const def = layDataset(dataset);

  try {
    const { data, error } = await supabase.rpc("rpc_list_catalog_dataset" as never, {
      p_dataset: def.serverName,
      p_search: query?.trim() || null,
      p_filters: { only_active: filters?.onlyActive ?? false },
      p_limit: pageSize,
      p_offset: page * pageSize,
    } as never);

    if (error) {
      return { ok: false, total: 0, rows: [], errorCode: "RPC_ERROR", error: error.message };
    }

    const kq = (data || {}) as Record<string, unknown>;
    if (kq.ok !== true) {
      return {
        ok: false, total: 0, rows: [],
        errorCode: String(kq.error_code ?? "UNKNOWN"),
        error: String(kq.error ?? "Không đọc được danh mục"),
      };
    }

    const rows = Array.isArray(kq.rows) ? (kq.rows as CatalogRecord[]) : [];
    return { ok: true, total: Number(kq.total ?? rows.length), rows: rows.map((r) => veDong(dataset, r)) };
  } catch (e) {
    return { ...loiHaTang(e), total: 0, rows: [] };
  }
}

/* ------------------------------------------------------------------ *
 *  Ghi
 * ------------------------------------------------------------------ */

export async function saveRecord({
  dataset, businessKey, recordId, patch, reason, expectedVersion,
}: {
  dataset: CatalogDatasetId;
  businessKey: string;
  recordId?: string;
  patch: CatalogRecord;
  reason?: string | null;
  expectedVersion?: number | null;
}): Promise<CatalogSaveResult> {
  if (!supabase) return chuaCauHinh();

  /* Không có gì đổi thì KHÔNG gọi server. Một lệnh ghi rỗng vẫn tăng
     version và vẫn sinh một dòng audit trống — làm bẩn hồ sơ và tạo xung
     đột khoá lạc quan cho người đang sửa cùng bản ghi. */
  if (Object.keys(patch).length === 0) {
    return { ok: false, errorCode: "NO_CHANGE", error: "Không có thay đổi nào để lưu." };
  }

  try {
    let data: unknown;
    let error: { message: string } | null = null;

    if (dataset === "products") {
      ({ data, error } = await supabase.rpc("rpc_save_product_gmp" as never, {
        p_bfo_code: businessKey,
        p_patch: patch,
        p_reason: reason?.trim() || null,
        p_expected_version: expectedVersion ?? null,
      } as never));
    } else if (dataset === "alerts") {
      ({ data, error } = await supabase.rpc("rpc_save_alert_recipient" as never, {
        p_id: recordId || null,
        p_patch: patch,
        p_reason: reason?.trim() || null,
        p_expected_version: expectedVersion ?? null,
      } as never));
    } else {
      ({ data, error } = await supabase.rpc("rpc_save_catalog_object" as never, {
        p_object_kind: String(patch.object_kind ?? "Thiết bị"),
        p_object_code: businessKey,
        p_patch: patch,
        p_reason: reason?.trim() || null,
        p_expected_version: expectedVersion ?? null,
      } as never));
    }

    if (error) return { ok: false, errorCode: "RPC_ERROR", error: error.message };

    const kq = (data || {}) as Record<string, unknown>;
    if (kq.ok !== true) {
      return {
        ok: false,
        errorCode: String(kq.error_code ?? "UNKNOWN"),
        error: String(kq.error ?? "Lưu không thành công"),
        currentVersion: kq.current_version == null ? undefined : Number(kq.current_version),
      };
    }
    return {
      ok: true,
      version: kq.version == null ? undefined : Number(kq.version),
      recordId: kq.id == null ? recordId : String(kq.id),
    };
  } catch (e) {
    return loiHaTang(e);
  }
}

/* ------------------------------------------------------------------ *
 *  Hàng đợi thay đổi và lịch sử
 * ------------------------------------------------------------------ */

export async function listPendingChanges(objectKind?: string): Promise<{
  ok: boolean; total: number; changes: CatalogChangeRow[]; error?: string;
}> {
  if (!supabase) return { ok: false, total: 0, changes: [], error: chuaCauHinh().error };
  try {
    const { data, error } = await supabase.rpc("rpc_list_catalog_changes" as never, {
      p_object_kind: objectKind || null, p_status: null, p_limit: 50, p_offset: 0,
    } as never);
    if (error) return { ok: false, total: 0, changes: [], error: error.message };
    const kq = (data || {}) as Record<string, unknown>;
    if (kq.ok !== true) return { ok: false, total: 0, changes: [], error: String(kq.error ?? "") };
    return { ok: true, total: Number(kq.total ?? 0), changes: (kq.changes || []) as CatalogChangeRow[] };
  } catch (e) {
    return { ok: false, total: 0, changes: [], error: loiHaTang(e).error };
  }
}

export async function listHistory(filters: {
  tableName?: string; recordId?: string; action?: string; from?: string; to?: string;
}, page = 0, pageSize = 50): Promise<{
  ok: boolean; total: number; history: CatalogAuditRow[]; error?: string;
}> {
  if (!supabase) return { ok: false, total: 0, history: [], error: chuaCauHinh().error };
  const loc: Record<string, string> = {};
  if (filters.tableName) loc.table_name = filters.tableName;
  if (filters.recordId) loc.record_id = filters.recordId;
  if (filters.action) loc.action = filters.action;
  if (filters.from) loc.from = filters.from;
  if (filters.to) loc.to = filters.to;

  try {
    const { data, error } = await supabase.rpc("rpc_catalog_history" as never, {
      p_filters: loc, p_limit: pageSize, p_offset: page * pageSize,
    } as never);
    if (error) return { ok: false, total: 0, history: [], error: error.message };
    const kq = (data || {}) as Record<string, unknown>;
    if (kq.ok !== true) return { ok: false, total: 0, history: [], error: String(kq.error ?? "") };
    return { ok: true, total: Number(kq.total ?? 0), history: (kq.history || []) as CatalogAuditRow[] };
  } catch (e) {
    return { ok: false, total: 0, history: [], error: loiHaTang(e).error };
  }
}

export async function historyDetail(id: string): Promise<{
  ok: boolean; history?: Record<string, unknown>; error?: string;
}> {
  if (!supabase) return { ok: false, error: chuaCauHinh().error };
  try {
    const { data, error } = await supabase.rpc("rpc_catalog_history_detail" as never,
      { p_id: id } as never);
    if (error) return { ok: false, error: error.message };
    const kq = (data || {}) as Record<string, unknown>;
    if (kq.ok !== true) return { ok: false, error: String(kq.error ?? "Không đọc được chi tiết") };
    return { ok: true, history: kq.history as Record<string, unknown> };
  } catch (e) {
    return { ok: false, error: loiHaTang(e).error };
  }
}

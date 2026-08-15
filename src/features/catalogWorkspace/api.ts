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
  CatalogAuditRow, CatalogChangeRow, CatalogDatasetId, CatalogImportBatch,
  CatalogImportCommitResult, CatalogImportRowPayload, CatalogListFilters,
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
  dataset, businessKey, recordId, patch, reason, expectedVersion, objectKind,
}: {
  dataset: CatalogDatasetId;
  businessKey: string;
  recordId?: string;
  patch: CatalogRecord;
  reason?: string | null;
  expectedVersion?: number | null;
  /** Chỉ dùng cho dataset `objects`: loại đối tượng của bản ghi. */
  objectKind?: string | null;
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
      /* Loại đối tượng quyết định bảng nào bị ghi. Đoán bừa "Thiết bị" thì
         một lần sửa quy trình sẽ ghi nhầm sang bảng thiết bị — nên thà
         dừng lại và nói rõ còn hơn ghi sai chỗ. */
      const loai = String(objectKind ?? patch.object_kind ?? "").trim();
      if (!loai) {
        return { ok: false, errorCode: "MISSING_OBJECT_KIND", error: "Thiếu loại đối tượng." };
      }
      ({ data, error } = await supabase.rpc("rpc_save_catalog_object" as never, {
        p_object_kind: loai,
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

/* ------------------------------------------------------------------ *
 *  Nhập Excel theo lô — ba RPC staging thuộc Đợt B Task 9 (migration
 *  chưa áp). Lớp gọi này đã đúng tên RPC; chừng nào server chưa có hàm,
 *  mọi lời gọi trả `NOT_AVAILABLE` để giao diện hiện trạng thái BỊ CHẶN
 *  thay vì một lỗi mạng khó hiểu — và tự mở khoá khi migration được áp.
 * ------------------------------------------------------------------ */

const CHUA_CO_STAGING = {
  ok: false as const,
  errorCode: "NOT_AVAILABLE",
  error: "Server chưa có RPC staging của đợt nhập Excel (Đợt B Task 9 chưa áp).",
};

/** PostgREST trả PGRST202 khi hàm không tồn tại; mock giả lập trả null. */
function thieuHam(error: { message: string } | null, data: unknown): boolean {
  if (error) return /PGRST202|Could not find the function|does not exist/i.test(error.message);
  return data === null || data === undefined;
}

export async function stageCatalogImport(input: {
  dataset: string;
  templateVersion: string;
  fingerprint: string;
  fileHash?: string | null;
  rows: CatalogImportRowPayload[];
}): Promise<{ ok: boolean; batch?: CatalogImportBatch; errorCode?: string; error?: string }> {
  if (!supabase) return chuaCauHinh();
  try {
    const { data, error } = await supabase.rpc("rpc_stage_catalog_import" as never, {
      p_dataset: input.dataset,
      p_template_version: input.templateVersion,
      p_fingerprint: input.fingerprint,
      p_file_hash: input.fileHash ?? null,
      p_rows: input.rows,
    } as never);
    if (thieuHam(error, data)) return CHUA_CO_STAGING;
    if (error) return { ok: false, errorCode: "RPC_ERROR", error: error.message };
    const kq = (data || {}) as Record<string, unknown>;
    if (kq.ok !== true) {
      return { ok: false, errorCode: String(kq.error_code ?? "UNKNOWN"), error: String(kq.error ?? "") };
    }
    return {
      ok: true,
      batch: {
        id: String(kq.batch_id ?? ""),
        status: String(kq.status ?? "validated") as CatalogImportBatch["status"],
        total: Number(kq.total ?? input.rows.length),
      },
    };
  } catch (e) {
    return loiHaTang(e);
  }
}

export async function setCatalogImportRowReason(
  batchId: string, rowNumber: number, reason: string,
): Promise<{ ok: boolean; errorCode?: string; error?: string }> {
  if (!supabase) return chuaCauHinh();
  try {
    const { data, error } = await supabase.rpc("rpc_set_catalog_import_row_reason" as never, {
      p_batch_id: batchId, p_row_number: rowNumber, p_reason: reason,
    } as never);
    if (thieuHam(error, data)) return CHUA_CO_STAGING;
    if (error) return { ok: false, errorCode: "RPC_ERROR", error: error.message };
    const kq = (data || {}) as Record<string, unknown>;
    return kq.ok === true
      ? { ok: true }
      : { ok: false, errorCode: String(kq.error_code ?? "UNKNOWN"), error: String(kq.error ?? "") };
  } catch (e) {
    return loiHaTang(e);
  }
}

export async function commitCatalogImport(
  batchId: string, reason: string,
): Promise<CatalogImportCommitResult> {
  if (!supabase) return chuaCauHinh();
  try {
    const { data, error } = await supabase.rpc("rpc_commit_catalog_import" as never, {
      p_batch_id: batchId, p_reason: reason,
    } as never);
    if (thieuHam(error, data)) return CHUA_CO_STAGING;
    if (error) return { ok: false, errorCode: "RPC_ERROR", error: error.message };
    const kq = (data || {}) as Record<string, unknown>;
    if (kq.ok !== true) {
      return { ok: false, errorCode: String(kq.error_code ?? "UNKNOWN"), error: String(kq.error ?? "") };
    }
    return {
      ok: true,
      created: Number(kq.created ?? 0),
      updated: Number(kq.updated ?? 0),
      unchanged: Number(kq.unchanged ?? 0),
      pendingChangeIds: Array.isArray(kq.pending_change_ids)
        ? (kq.pending_change_ids as string[]).map(String) : [],
    };
  } catch (e) {
    return loiHaTang(e);
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

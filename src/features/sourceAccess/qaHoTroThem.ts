/* QA hỗ trợ thêm của một hạng mục (migration 20261017100000): ngoài QA phụ
 * trách và Người hỗ trợ, một hạng mục có thể có nhiều QA cùng làm và cùng
 * báo kết quả. Server quyết định ai được xem/sửa; ở đây chỉ gọi và kiểm dạng. */
import { supabase } from "../../lib/supabaseClient.ts";

export interface QaHoTroThemRow {
  performerId: string;
  performerName: string;
  lyDo: string;
}

export interface QaHoTroThemDanhSach {
  coTheSua: boolean;
  rows: QaHoTroThemRow[];
}

export type KetQua<T> = { ok: true; data: T } | { ok: false; error: string };

/** Kiểm đúng dạng server trả; sai dạng thì báo lỗi thay vì hiện danh sách sai. */
export function docQaHoTroThem(value: unknown): QaHoTroThemDanhSach {
  if (!value || typeof value !== "object") throw new Error("Máy chủ không trả dữ liệu");
  const goc = value as Record<string, unknown>;
  if (goc.ok !== true) throw new Error(String(goc.error ?? "Máy chủ từ chối"));
  if (typeof goc.co_the_sua !== "boolean") throw new Error("Thiếu co_the_sua");
  if (!Array.isArray(goc.rows)) throw new Error("Thiếu danh sách rows");
  return {
    coTheSua: goc.co_the_sua,
    rows: goc.rows.map((dong, i) => {
      const r = (dong ?? {}) as Record<string, unknown>;
      if (typeof r.performer_id !== "string" || typeof r.performer_name !== "string") {
        throw new Error(`Dòng ${i + 1} sai định dạng`);
      }
      return { performerId: r.performer_id, performerName: r.performer_name, lyDo: typeof r.ly_do === "string" ? r.ly_do : "" };
    }),
  };
}

export async function layQaHoTroThem(objectCode: string): Promise<KetQua<QaHoTroThemDanhSach>> {
  if (!supabase) return { ok: false, error: "Hệ thống chưa cấu hình kết nối." };
  const { data, error } = await supabase.rpc("rpc_source_supporters" as never, { p_object_code: objectCode } as never);
  if (error) {
    console.error("[QA hỗ trợ thêm] Không tải được danh sách:", error);
    return { ok: false, error: "Không tải được danh sách." };
  }
  // Máy chủ từ chối có lý do nghiệp vụ thì giữ nguyên lý do đó.
  const tuChoi = data as { ok?: unknown; error?: unknown } | null;
  if (tuChoi && tuChoi.ok === false) return { ok: false, error: String(tuChoi.error ?? "Không được phép.") };
  try {
    return { ok: true, data: docQaHoTroThem(data) };
  } catch (loi) {
    console.error("[QA hỗ trợ thêm] Dữ liệu danh sách không hợp lệ:", loi);
    return { ok: false, error: "Không đọc được danh sách." };
  }
}

export async function datQaHoTroThem(
  objectCode: string, performerId: string, them: boolean, lyDo: string,
): Promise<KetQua<{ thayDoi: boolean }>> {
  if (!supabase) return { ok: false, error: "Hệ thống chưa cấu hình kết nối." };
  const { data, error } = await supabase.rpc("rpc_source_supporter_dat" as never, {
    p_object_code: objectCode,
    p_performer_id: performerId,
    p_them: them,
    p_ly_do: lyDo,
  } as never);
  if (error) {
    console.error("[QA hỗ trợ thêm] Không lưu được:", error);
    return { ok: false, error: "Không lưu được." };
  }
  const kq = (data ?? {}) as Record<string, unknown>;
  if (kq.ok !== true) return { ok: false, error: String(kq.error ?? "Không lưu được") };
  return { ok: true, data: { thayDoi: kq.thay_doi === true } };
}

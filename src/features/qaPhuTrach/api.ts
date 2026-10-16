/* Danh sách QA phụ trách (migration 20261016160000): ai được chọn làm QA
 * phụ trách/hỗ trợ ở Dữ liệu nguồn. Chỉ Admin đọc/sửa — server kiểm quyền. */
import { supabase } from "../../lib/supabaseClient.ts";

export interface QaPhuTrachRow {
  performerId: string;
  performerName: string;
  trongDanhSach: boolean;
  vai: string | null;
  /** null = đủ điều kiện để thêm. */
  lyDoChuaThemDuoc: string | null;
}

export type KetQua<T> = { ok: true; data: T } | { ok: false; error: string };

/** Kiểm đúng dạng server trả; sai dạng thì báo lỗi thay vì hiện bảng sai. */
export function docDanhSachQaPhuTrach(value: unknown): QaPhuTrachRow[] {
  if (!value || typeof value !== "object") throw new Error("Máy chủ không trả dữ liệu");
  const goc = value as Record<string, unknown>;
  if (goc.ok !== true) throw new Error(String(goc.error ?? "Máy chủ từ chối"));
  if (!Array.isArray(goc.rows)) throw new Error("Thiếu danh sách rows");
  return goc.rows.map((dong, i) => {
    const r = (dong ?? {}) as Record<string, unknown>;
    if (typeof r.performer_id !== "string" || typeof r.performer_name !== "string" || typeof r.trong_danh_sach !== "boolean") {
      throw new Error(`Dòng ${i + 1} sai định dạng`);
    }
    return {
      performerId: r.performer_id,
      performerName: r.performer_name,
      trongDanhSach: r.trong_danh_sach,
      vai: typeof r.vai === "string" ? r.vai : null,
      lyDoChuaThemDuoc: typeof r.ly_do_chua_them_duoc === "string" ? r.ly_do_chua_them_duoc : null,
    };
  });
}

export async function layDanhSachQaPhuTrach(): Promise<KetQua<QaPhuTrachRow[]>> {
  if (!supabase) return { ok: false, error: "Hệ thống chưa cấu hình kết nối." };
  const { data, error } = await supabase.rpc("rpc_qa_phu_trach_danh_sach" as never);
  if (error) return { ok: false, error: `Không tải được danh sách: ${error.message}` };
  try {
    return { ok: true, data: docDanhSachQaPhuTrach(data) };
  } catch (loi) {
    return { ok: false, error: loi instanceof Error ? loi.message : String(loi) };
  }
}

export async function datQaPhuTrach(performerId: string, trongDanhSach: boolean, lyDo: string): Promise<KetQua<null>> {
  if (!supabase) return { ok: false, error: "Hệ thống chưa cấu hình kết nối." };
  const { data, error } = await supabase.rpc("rpc_qa_phu_trach_dat" as never, {
    p_performer_id: performerId,
    p_trong_danh_sach: trongDanhSach,
    p_ly_do: lyDo,
  } as never);
  if (error) return { ok: false, error: `Không lưu được: ${error.message}` };
  const kq = (data ?? {}) as Record<string, unknown>;
  if (kq.ok !== true) return { ok: false, error: String(kq.error ?? "Không lưu được") };
  return { ok: true, data: null };
}

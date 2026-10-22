import { supabase, vePhien } from "../../lib/supabaseClient.ts";
import { supabaseAnonKey } from "../../lib/supabaseConfig.ts";
import {
  decodeHieu,
  decodeTraLoi,
  TroLyTuChoiError,
  type CongCuDuLieu,
  type Hieu,
  type ThamSo,
  type TraLoi,
} from "./contracts.ts";

/** Quá thời gian này thì coi như AI bận và chuyển sang đoán nhanh. */
const HIEU_TIMEOUT_MS = 15000;

const LOI_AI: Record<string, string> = {
  PHIEN_HET_HAN: "Phiên đăng nhập đã hết hạn. Tải lại trang rồi đăng nhập lại.",
  AI_BAN: "Trợ lý AI đang bận.",
};

function client() {
  if (!supabase) throw new Error("Chưa kết nối được dữ liệu.");
  return supabase;
}

/** Bước 1 — AI đổi câu hỏi thành công cụ + tham số (n8n "Vani VMP 9"). */
export async function hieuCauHoi(
  cauHoi: string,
  truoc: { congCu: string; thamSo: ThamSo } | null,
): Promise<Hieu> {
  const url = import.meta.env.VITE_N8N_CHAT_URL as string | undefined;
  const token = import.meta.env.VITE_N8N_CHAT_TOKEN as string | undefined;
  if (!url) throw new Error("Trợ lý AI chưa được cấu hình.");

  const ve = await vePhien();
  const ctrl = new AbortController();
  const hen = setTimeout(() => ctrl.abort(), HIEU_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(ve ? { Authorization: `Bearer ${ve}` } : {}),
        // Token công khai của ô chat: chỉ chặn quét bừa, không phải bí mật.
        ...(token ? { "x-vmp-chat": token } : {}),
      },
      body: JSON.stringify({
        cau_hoi: cauHoi,
        truoc: truoc ? { cong_cu: truoc.congCu, tham_so: truoc.thamSo } : null,
        // Khoá công khai (anon) để n8n kiểm phiên với Supabase.
        apikey: supabaseAnonKey,
      }),
    });
    const data: unknown = await r.json().catch((loi: unknown) => {
      console.error("[trợ lý] n8n trả dữ liệu không phải JSON:", r.status, loi);
      return null;
    });
    try {
      return decodeHieu(data);
    } catch (cause) {
      if (cause instanceof TroLyTuChoiError) throw new TroLyTuChoiError(LOI_AI[cause.message] ?? "Trợ lý AI chưa hiểu câu này.");
      console.error("[trợ lý] kết quả hiểu câu hỏi sai dạng:", r.status, cause, data);
      throw new Error("Trợ lý AI trả kết quả lạ.");
    }
  } finally {
    clearTimeout(hen);
  }
}

/** Bước 2 — SQL trả lời bằng quyền của người hỏi. */
export async function traLoi(congCu: CongCuDuLieu, thamSo: ThamSo): Promise<TraLoi> {
  const { data, error } = await client().rpc("rpc_tro_ly_tra_loi" as never, {
    p_cong_cu: congCu, p_tham_so: thamSo,
  } as never);
  if (error) {
    console.error("[trợ lý] rpc_tro_ly_tra_loi lỗi:", error);
    throw new Error("Không tra được dữ liệu. Thử lại sau giây lát.");
  }
  try {
    return decodeTraLoi(data);
  } catch (cause) {
    if (cause instanceof TroLyTuChoiError) throw cause;
    console.error("[trợ lý] câu trả lời sai dạng:", cause, data);
    throw new Error("Dữ liệu trả về không hợp lệ.");
  }
}

export interface NhatKy {
  cauHoi: string;
  congCu: string | null;
  thamSo: ThamSo | null;
  duong: "ai" | "doan_nhanh" | "goi_y" | "loi";
  moHinh: string | null;
  ok: boolean;
  soDong: number | null;
  thoiGianMs: number;
}

/** Ghi nhật ký; lỗi ghi không chặn câu trả lời (chỉ log). Trả id để đánh giá. */
export async function ghiNhatKy(n: NhatKy): Promise<number | null> {
  const { data, error } = await client().rpc("rpc_tro_ly_ghi_nhat_ky" as never, {
    p_cau_hoi: n.cauHoi.slice(0, 500),
    p_cong_cu: n.congCu,
    p_tham_so: n.thamSo,
    p_duong: n.duong,
    p_mo_hinh: n.moHinh,
    p_ok: n.ok,
    p_so_dong: n.soDong,
    p_thoi_gian_ms: Math.round(n.thoiGianMs),
  } as never);
  if (error) {
    console.error("[trợ lý] ghi nhật ký lỗi:", error);
    return null;
  }
  const id = (data as { id?: unknown } | null)?.id;
  return typeof id === "number" ? id : null;
}

export async function danhGia(id: number, diem: 1 | -1): Promise<void> {
  const { data, error } = await client().rpc("rpc_tro_ly_danh_gia" as never, { p_id: id, p_diem: diem } as never);
  if (error || (data as { ok?: unknown } | null)?.ok !== true) {
    console.error("[trợ lý] gửi đánh giá lỗi:", error ?? data);
    throw new Error("Chưa gửi được đánh giá.");
  }
}

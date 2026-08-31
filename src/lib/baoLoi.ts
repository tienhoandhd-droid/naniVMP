/* =====================================================================
 *  baoLoi.ts — tai mắt production: gom lỗi runtime, báo về Supabase
 *  ---------------------------------------------------------------------
 *  Trước 31/08, cách duy nhất biết web hỏng là người dùng gọi điện:
 *  ErrorBoundary chỉ console.error vào trình duyệt của chính họ.
 *
 *  Nguyên tắc sống còn — máy báo lỗi KHÔNG ĐƯỢC tự gây lỗi:
 *   · Mọi đường gửi bọc try/catch, thất bại là im lặng (không toast,
 *     không throw, không retry — retry lúc bão lỗi chỉ đổ thêm dầu).
 *   · Chống bão phía client: cùng một thông điệp trong cùng một phút chỉ
 *     gửi MỘT lần; tối đa 10 lỗi một phiên (server còn rate-limit 20/phút).
 *   · RPC chưa tồn tại (migration 20260831170000 CHƯA áp) → mã PGRST202 /
 *     42883 → tự tắt cho hết phiên, không thử lại từng lỗi.
 *  Model gom lỗi thuần (taoBoGomLoi) tách riêng cho node --test.
 * ===================================================================== */
import { supabase } from "./supabaseClient.ts";

export type NguonLoi = "window.onerror" | "unhandledrejection" | "error-boundary" | "thu-cong";

export interface BoGomLoi {
  /** true = nên gửi; false = trùng/quá hạn mức, bỏ. */
  nhan(message: string, luc: number): boolean;
}

export function taoBoGomLoi({ mailToiDa = 10, cuaSoMs = 60_000 } = {}): BoGomLoi {
  const daGui = new Map<string, number>();
  let tong = 0;
  return {
    nhan(message, luc) {
      if (tong >= mailToiDa) return false;
      const khoa = message.slice(0, 200);
      const lanTruoc = daGui.get(khoa);
      if (lanTruoc !== undefined && luc - lanTruoc < cuaSoMs) return false;
      daGui.set(khoa, luc);
      tong += 1;
      return true;
    },
  };
}

let boGom: BoGomLoi | null = null;
let rpcVang = false; // migration chưa áp — tắt cho hết phiên

async function gui(message: string, stack: string | null, source: NguonLoi): Promise<void> {
  try {
    if (!supabase || rpcVang) return;
    boGom ??= taoBoGomLoi();
    if (!boGom.nhan(message, Date.now())) return;
    /* RPC nằm ngoài types sinh tự động (gen types chạy lại sau khi áp
       migration 20260831170000) — ép kiểu tạm, có PGRST202 đỡ phía dưới. */
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      ten: string, thamSo: Record<string, unknown>,
    ) => Promise<{ error: { code?: string } | null }>;
    const { error } = await rpc("rpc_ghi_loi_client", {
      p_message: message.slice(0, 2000),
      ...(stack ? { p_stack: stack.slice(0, 8000) } : {}),
      p_url: `${location.pathname}${location.hash}`.slice(0, 500),
      p_source: source,
    });
    // PGRST202: PostgREST không thấy hàm; 42883: Postgres không có hàm.
    if (error && (error.code === "PGRST202" || error.code === "42883")) rpcVang = true;
  } catch {
    /* Tuyệt đối im lặng — xem đầu file. */
  }
}

/** Gọi MỘT lần ở main.tsx, trước khi React mount. */
export function caiDatBaoLoi(): void {
  try {
    window.addEventListener("error", (event) => {
      const msg = event.message || String(event.error || "Lỗi không rõ");
      // Lỗi tải tài nguyên (img/script 404) có target ≠ window — bỏ qua:
      // chúng không làm app vỡ và đã có ngân sách/CI canh.
      if (event.target !== window && !(event instanceof ErrorEvent)) return;
      void gui(msg, (event.error as Error | undefined)?.stack ?? null, "window.onerror");
    });
    window.addEventListener("unhandledrejection", (event) => {
      const ly_do = event.reason as Error | string | undefined;
      const msg = typeof ly_do === "string" ? ly_do : ly_do?.message || "Promise bị từ chối không rõ lý do";
      void gui(msg, typeof ly_do === "object" ? ly_do?.stack ?? null : null, "unhandledrejection");
    });
  } catch {
    /* im lặng */
  }
}

/** ErrorBoundary gọi khi bắt được crash render. */
export function baoLoiRender(err: Error, componentStack?: string | null): void {
  void gui(err.message || String(err),
    [err.stack, componentStack].filter(Boolean).join("\n---\n") || null,
    "error-boundary");
}

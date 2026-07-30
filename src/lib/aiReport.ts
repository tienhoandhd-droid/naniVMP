/* =====================================================================
 *  lib/aiReport.ts — Gọi workflow n8n "Vani VMP 5 — Nhận xét AI"
 *  ---------------------------------------------------------------------
 *  Một đường duy nhất cho cả hai chỗ dùng trên web:
 *    - Trang Báo cáo & AI  → loai = "bao_cao"  (nhận xét cho báo cáo quản lý)
 *    - Trang Cảnh báo      → loai = "canh_bao" (phân tích quá hạn / sắp tới hạn)
 *
 *  Và cho cả hai việc: chỉ XEM trên web, hoặc XEM RỒI GỬI MAIL. Gộp làm một
 *  hàm vì nếu tách thì cùng một phân tích phải chạy AI hai lần — tốn tiền và
 *  hai bản chữ khác nhau, người đọc mail và người xem web sẽ cãi nhau về số.
 *
 *  Số liệu trong mail do chính n8n đọc lại từ Supabase, KHÔNG lấy từ trình
 *  duyệt: mail là bằng chứng gửi ra ngoài, không được phụ thuộc vào cái tab
 *  đang mở đã cũ tới đâu.
 * ===================================================================== */

/** Loại phân tích — quyết định prompt bên n8n. */
export type AiKind = "bao_cao" | "canh_bao";

/** Kỳ báo cáo — AI phải đọc ĐÚNG lát cắt đang hiện trên màn hình.
 *  Thiếu kỳ thì n8n lấy cả năm hiện tại (hành vi cũ). */
export interface AiPeriod {
  nam: number;
  /** Tháng đầu và cuối của kỳ, 1..12. Kỳ luôn là dải tháng liền nhau nên
   *  hai số là đủ — không cần truyền danh sách. */
  thang_tu: number;
  thang_den: number;
  /** Nhãn để AI và mail gọi tên kỳ giống hệt trên web. */
  nhan: string;
}

export interface AiRequest {
  loai: AiKind;
  /** Mã bộ phận, hoặc "all" cho toàn nhà máy. */
  pham_vi?: string;
  ky?: AiPeriod;
  /** Có gửi mail không. Không gửi thì chỉ trả chữ về web. */
  gui_mail?: boolean;
  /** Email gõ tay / chọn trong hộp thoại. */
  email_nhan?: string[];
  /** Lấy thêm người nhận đang bật "Mail phân tích AI" trong danh mục. */
  dung_danh_sach?: boolean;
}

export interface AiResult {
  ok: boolean;
  ai_text: string;
  /** Lỗi do n8n trả về (đã chạy nhưng hỏng), khác lỗi mạng. */
  error?: string;
  so_hang_muc?: number;
  so_qua_han?: number;
  pham_vi?: string;
  ky_nhan?: string;
  loai?: AiKind;
  nguon?: string;
  luc?: string;
  /** Có gửi mail không và gửi cho ai — để web nói thật thay vì đoán. */
  mail?: {
    da_gui: string[];
    that_bai: { email: string; loi: string }[];
  };
}

export const AI_URL: string = import.meta.env.VITE_N8N_AI_REPORT_URL || "";
const AI_TOKEN: string = import.meta.env.VITE_N8N_CHAT_TOKEN || "";

/** Cấu hình đủ để bấm nút chưa? Dùng để hiện lời nhắc thay vì giấu nút đi. */
export function aiConfigured(): boolean {
  return !!AI_URL;
}

export const AI_SETUP_HINT =
  "Chưa cấu hình đường gọi AI. Đặt biến VITE_N8N_AI_REPORT_URL " +
  "(ví dụ https://n8n.cpc1hn.com/webhook/vmp-ai-report) trong file .env khi chạy máy, " +
  "hoặc trong GitHub → Settings → Secrets and variables → Actions → Variables khi deploy.";

/** Kiểm email đủ chặt để không gửi nhầm, đủ lỏng để không chặn tên miền lạ. */
export function emailHopLe(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

/** Tách chuỗi người dùng gõ (phẩy, chấm phẩy, xuống dòng, khoảng trắng). */
export function tachEmail(raw: string): string[] {
  return [...new Set(
    raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean),
  )];
}

/**
 * Gọi n8n. Ném Error khi không gọi được (mạng/timeout); trả về `ok:false`
 * kèm `error` khi n8n chạy nhưng không dựng được nhận xét.
 */
export async function chayPhanTichAi(req: AiRequest, signal?: AbortSignal): Promise<AiResult> {
  if (!AI_URL) throw new Error(AI_SETUP_HINT);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (AI_TOKEN) headers["x-vmp-chat"] = AI_TOKEN;

  const res = await fetch(AI_URL, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      loai: req.loai,
      pham_vi: req.pham_vi || "all",
      ky: req.ky || null,
      gui_mail: !!req.gui_mail,
      email_nhan: (req.email_nhan || []).filter(emailHopLe),
      dung_danh_sach: !!req.dung_danh_sach,
    }),
  });

  if (!res.ok) throw new Error(`n8n trả mã ${res.status} ${res.statusText}`);

  // n8n có thể trả chuỗi rỗng khi workflow chạy nhưng không tới node phản hồi.
  const raw = await res.text();
  if (!raw.trim()) throw new Error("n8n không trả nội dung — kiểm tra workflow Vani VMP 5 còn bật không.");

  let json: AiResult;
  try {
    json = JSON.parse(raw) as AiResult;
  } catch {
    throw new Error("n8n trả về dữ liệu không đọc được: " + raw.slice(0, 160));
  }
  return json;
}

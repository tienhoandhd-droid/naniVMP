/* =====================================================================
 *  doiChieuModel.ts — bảng ĐỐI CHIẾU client vs server (Bàn quản trị 01/09)
 *  ---------------------------------------------------------------------
 *  Câu hỏi vận hành duy nhất của màn Chất lượng dữ liệu là: "số trên máy
 *  tôi có đang nói dối không?". Trước đây phải tự so hai tab bằng mắt.
 *  Model này đặt từng cặp số cạnh nhau và CHỈ đánh dấu dòng lệch.
 *
 *  Không React — node --test chạy thẳng.
 * ===================================================================== */

export interface CapSo {
  nhan: string;
  /** null = phía đó chưa có số (server chưa tải được / client không tính). */
  client: number | null;
  server: number | null;
}

export interface DongDoiChieu extends CapSo {
  lech: boolean;
  /** Chênh server − client (null khi thiếu một vế). */
  chenh: number | null;
}

export function soSanhDoiChieu(cacCap: readonly CapSo[]): {
  rows: DongDoiChieu[];
  soLech: number;
  /** true khi có ít nhất một vế server null — chưa đối chiếu trọn. */
  thieuServer: boolean;
} {
  const rows = cacCap.map((c) => {
    const du = c.client !== null && c.server !== null;
    const lech = du && c.client !== c.server;
    return { ...c, lech, chenh: du ? (c.server as number) - (c.client as number) : null };
  });
  return {
    rows,
    soLech: rows.filter((r) => r.lech).length,
    thieuServer: rows.some((r) => r.server === null),
  };
}

/** Câu kết luận — một dòng nói thẳng, không bắt người đọc tự đếm. */
export function ketLuanDoiChieu(kq: ReturnType<typeof soSanhDoiChieu>): {
  chinh: string; tone: "ok" | "warn" | "over";
} {
  if (kq.thieuServer) {
    return {
      chinh: "Chưa đối chiếu được đầy đủ — máy chủ chưa trả về số (thiếu quyền hoặc lỗi mạng). Các dòng có số vẫn so bình thường.",
      tone: "warn",
    };
  }
  if (kq.soLech === 0) {
    return { chinh: "Mọi con số client khớp máy chủ — bản đang xem không nói dối.", tone: "ok" };
  }
  return {
    chinh: `${kq.soLech} con số đang LỆCH giữa bản trên máy và máy chủ — bấm Làm mới; nếu vẫn lệch, số MÁY CHỦ là số báo cáo/email dùng.`,
    tone: "over",
  };
}

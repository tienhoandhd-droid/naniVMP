/* Hợp đồng dữ liệu của trợ lý VMP.
 *
 * Hai nguồn:
 *  · n8n "Vani VMP 9" — AI chỉ trả {cong_cu, tham_so} (hiểu câu hỏi).
 *  · rpc_tro_ly_tra_loi — SQL trả câu trả lời và bảng (số liệu thật).
 * Mọi thứ đi vào giao diện đều qua các hàm decode dưới đây; dữ liệu sai
 * dạng thì ném lỗi, không đoán. */

export const CONG_CU_DU_LIEU = [
  "tong_quan", "qua_han", "sap_den_han", "tien_do", "thiet_bi",
  "theo_nguoi", "viec_cua_toi", "thay_doi",
] as const;
export const CONG_CU_TAI_CHO = ["huong_dan", "kien_thuc", "chao_hoi", "khong_ho_tro"] as const;

export type CongCuDuLieu = (typeof CONG_CU_DU_LIEU)[number];
export type CongCuTaiCho = (typeof CONG_CU_TAI_CHO)[number];
export type CongCu = CongCuDuLieu | CongCuTaiCho;
export type ThamSo = Record<string, string | number>;

export interface GoiY { nhan: string; congCu: CongCu; thamSo: ThamSo }
export interface CotBang { key: string; nhan: string }
export interface Bang { cot: CotBang[]; dong: Record<string, string>[]; tongDong: number }

/** Câu trả lời từ SQL. */
export interface TraLoi {
  hieuLa: string;
  traLoi: string;
  bang: Bang | null;
  hoiLai: GoiY[];
  goiY: GoiY[];
  nguon: string;
  luc: string;
  congCu: CongCuDuLieu;
  thamSo: ThamSo;
}

/** Kết quả bước hiểu câu hỏi (n8n). */
export interface Hieu {
  congCu: CongCu;
  thamSo: ThamSo;
  kienThuc: string | null;
  moHinh: string | null;
}

/** Server từ chối có lý do đọc được (vd tham số sai, phiên hết hạn). */
export class TroLyTuChoiError extends Error {}

function laObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function laCongCu(v: unknown): v is CongCu {
  return typeof v === "string"
    && ((CONG_CU_DU_LIEU as readonly string[]).includes(v) || (CONG_CU_TAI_CHO as readonly string[]).includes(v));
}

export function laCongCuDuLieu(v: unknown): v is CongCuDuLieu {
  return typeof v === "string" && (CONG_CU_DU_LIEU as readonly string[]).includes(v);
}

function decodeThamSo(v: unknown): ThamSo {
  if (v === undefined || v === null) return {};
  if (!laObject(v)) throw new Error("tham_so phải là object");
  const ra: ThamSo = {};
  for (const [k, x] of Object.entries(v)) {
    if (typeof x === "string" || (typeof x === "number" && Number.isFinite(x))) ra[k] = x;
    else throw new Error(`tham_so.${k} sai kiểu`);
  }
  return ra;
}

function decodeGoiY(v: unknown): GoiY[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error("gợi ý phải là mảng");
  return v.map((g) => {
    if (!laObject(g) || typeof g.nhan !== "string" || !laCongCu(g.cong_cu)) throw new Error("gợi ý sai dạng");
    return { nhan: g.nhan, congCu: g.cong_cu, thamSo: decodeThamSo(g.tham_so) };
  });
}

function decodeBang(v: unknown): Bang | null {
  if (v === undefined || v === null) return null;
  if (!laObject(v) || !Array.isArray(v.cot) || !Array.isArray(v.dong)) throw new Error("bảng sai dạng");
  const cot = v.cot.map((c) => {
    if (!laObject(c) || typeof c.key !== "string" || typeof c.nhan !== "string") throw new Error("cột sai dạng");
    return { key: c.key, nhan: c.nhan };
  });
  const dong = v.dong.map((d) => {
    if (!laObject(d)) throw new Error("dòng sai dạng");
    const ra: Record<string, string> = {};
    for (const c of cot) {
      const x = d[c.key];
      ra[c.key] = x === undefined || x === null ? "—" : String(x);
    }
    return ra;
  });
  const tong = typeof v.tong_dong === "number" ? v.tong_dong : dong.length;
  return { cot, dong, tongDong: tong };
}

export function decodeTraLoi(data: unknown): TraLoi {
  if (!laObject(data)) throw new Error("kết quả không phải object");
  if (data.ok !== true) {
    const lyDo = typeof data.loi === "string" ? data.loi
      : typeof data.error === "string" ? data.error : "Không tra được câu này.";
    throw new TroLyTuChoiError(lyDo);
  }
  if (typeof data.tra_loi !== "string" || typeof data.hieu_la !== "string" || !laCongCuDuLieu(data.cong_cu)) {
    throw new Error("thiếu tra_loi/hieu_la/cong_cu");
  }
  return {
    hieuLa: data.hieu_la,
    traLoi: data.tra_loi,
    bang: decodeBang(data.bang),
    hoiLai: decodeGoiY(data.hoi_lai),
    goiY: decodeGoiY(data.goi_y),
    nguon: typeof data.nguon === "string" ? data.nguon : "",
    luc: typeof data.luc === "string" ? data.luc : "",
    congCu: data.cong_cu,
    thamSo: decodeThamSo(data.tham_so),
  };
}

export function decodeHieu(data: unknown): Hieu {
  if (!laObject(data)) throw new Error("kết quả hiểu câu hỏi không phải object");
  if (data.ok !== true) throw new TroLyTuChoiError(typeof data.loi === "string" ? data.loi : "AI_LOI");
  if (!laCongCu(data.cong_cu)) throw new Error("công cụ lạ");
  return {
    congCu: data.cong_cu,
    thamSo: decodeThamSo(data.tham_so),
    kienThuc: typeof data.tra_loi_kien_thuc === "string" && data.tra_loi_kien_thuc.trim()
      ? data.tra_loi_kien_thuc.trim() : null,
    moHinh: typeof data.mo_hinh === "string" ? data.mo_hinh : null,
  };
}

/** Giờ:phút theo giờ Việt Nam cho dòng nguồn. */
export function gioPhut(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
}

/* Đoán nhanh bằng từ khoá — dự phòng khi AI không trả lời (mất mạng, hết
 * hạn mức). Chỉ bắt các câu phổ biến, rõ nghĩa. Không chắc thì trả null để
 * giao diện mời bấm gợi ý, thay vì đoán bừa ra một câu trả lời sai. */
import type { CongCu, ThamSo } from "./contracts.ts";

export interface DoanNhanh { congCu: CongCu; thamSo: ThamSo }

function boDau(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

const BO_PHAN: Array<[RegExp, string]> = [
  [/\b(xuong|san xuat|xsx)\b/, "xsx"],
  [/\bco dien\b/, "cd"],
  [/\b(qc|kiem nghiem)\b/, "qc"],
  [/\b(rd|nghien cuu)\b/, "rd"],
  [/\b(qa|qlcl)\b/, "qa"],
  [/\bkho\b/, "kho"],
];

function timBoPhan(s: string): string | null {
  for (const [re, ma] of BO_PHAN) if (re.test(s)) return ma;
  return null;
}

function soNgay(s: string): number | null {
  const m = s.match(/(\d{1,3})\s*ngay/);
  if (m) return Number(m[1]);
  if (/\b2 tuan\b/.test(s)) return 14;
  if (/\btuan\b/.test(s)) return 7;
  if (/\bthang\b/.test(s)) return 30;
  if (/\bquy\b/.test(s)) return 90;
  return null;
}

export function doanNhanh(cauHoi: string): DoanNhanh | null {
  const s = boDau(cauHoi).replace(/\s+/g, " ").trim();
  if (!s) return null;

  if (/^(xin )?chao\b|^hello\b|^hi\b|ban la ai|cam on/.test(s)) return { congCu: "chao_hoi", thamSo: {} };
  if (/\b(phieu thay doi|change control|\bcc\b|cc-)/.test(s)) {
    if (/qua han|tre/.test(s)) return { congCu: "thay_doi", thamSo: { loc: "qua_han" } };
    if (/chua gan/.test(s)) return { congCu: "thay_doi", thamSo: { loc: "chua_gan" } };
    return { congCu: "thay_doi", thamSo: {} };
  }
  if (/\b(cua toi|toi can|toi phai|toi con|viec cua minh)\b/.test(s)) {
    const n = soNgay(s);
    return { congCu: "viec_cua_toi", thamSo: n ? { so_ngay: Math.min(Math.max(n, 1), 180) } : {} };
  }

  // Mã thiết bị kiểu KNTB133, PCTB504, HT-12.
  const ma = cauHoi.match(/\b([A-Za-z]{2,6}-?\d{2,5}[A-Za-z]?)\b/);
  if (ma && !/^(iq|oq|pq|dq)\d/i.test(ma[1])) return { congCu: "thiet_bi", thamSo: { tu_khoa: ma[1] } };

  const boPhan = timBoPhan(s);
  if (/qua han|tre han|cham tien do|bi tre/.test(s)) {
    return { congCu: "qua_han", thamSo: boPhan ? { bo_phan: boPhan } : {} };
  }
  if (/sap (den|toi) han|den han|toi han/.test(s)) {
    const n = soNgay(s) ?? 30;
    return { congCu: "sap_den_han", thamSo: { so_ngay: Math.min(Math.max(n, 1), 180), ...(boPhan ? { bo_phan: boPhan } : {}) } };
  }
  if (/(bo phan|xuong) nao|theo bo phan/.test(s)) return { congCu: "tien_do", thamSo: { theo: "bo_phan" } };
  if (/tong quan|ty le|ti le|phan tram|hoan thanh bao nhieu|tinh hinh chung/.test(s)) {
    return { congCu: "tong_quan", thamSo: {} };
  }
  return null;
}

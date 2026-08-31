/* =====================================================================
 *  vmpSpace3dShared — hằng hình học + màu giai đoạn của bản đồ tháng
 *  ---------------------------------------------------------------------
 *  Dùng chung giữa VmpSpace3D (vỏ 2D + toggle, KHÔNG kéo three.js) và
 *  VmpSpace3DCanvas (phần WebGL, lazy). Tách 31/08 khi đo hiệu năng:
 *  mở màn Báo cáo không được kéo chunk three ~227KB gzip.
 *
 *  MAU3D ở đây là HOLDER thay vì biến module: getter của GIAI_DOAN đọc
 *  holder.current mỗi lần render nên đổi theme là cả 2D lẫn 3D đổi màu,
 *  dù hai nửa nằm ở hai chunk khác nhau.
 * ===================================================================== */
import { docMauLotus3D } from "../../lib/lotus3dColors.ts";

export interface O3D {
  thang: number;        // 1..12
  giaiDoan: number;     // 0..3
  tyLe: number | null;  // % hoàn thành, null khi tháng đó không có hạng mục nào
  xong: number;
  tong: number;
}

export const mau3dHolder = { current: docMauLotus3D() };

export function capNhatMau3D(mau: ReturnType<typeof docMauLotus3D>): void {
  mau3dHolder.current = mau;
}

/** Vị trí camera gốc — dùng chung cho khung nhìn và biên góc xoay. */
export const VI_TRI: [number, number, number] = [7.4, 3.9, 3.4];

/* Màu giai đoạn = semantic token (khớp alias --lp-stage-* của CSS). */
export const GIAI_DOAN = [
  { khoa: "tt_de_cuong", ten: "Đề cương", get mau() { return mau3dHolder.current.plum; } },
  { khoa: "tt_tham_dinh", ten: "Thẩm định", get mau() { return mau3dHolder.current.info; } },
  { khoa: "tt_bao_cao", ten: "Báo cáo", get mau() { return mau3dHolder.current.rose; } },
  { khoa: "tt_vmp", ten: "Đích VMP", get mau() { return mau3dHolder.current.success; } },
];

export const CAO = 2.0;        // đơn vị cảnh cho mốc 100%
/* Mặt phẳng mục tiêu là NGƯỠNG trung tính, không phải báo động. */
export const MAU_MUC_TIEU = { get mau() { return mau3dHolder.current.inkMuted; } };
export const BUOC_T = 0.46;    // khoảng cách giữa hai tháng (trục sâu)
export const BUOC_G = 0.72;    // khoảng cách giữa hai giai đoạn (trục ngang)

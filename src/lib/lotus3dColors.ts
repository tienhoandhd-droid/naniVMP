/* =====================================================================
 *  lotus3dColors.ts — cầu token Lotus → màu 3D (đợt 4, nghiên cứu 4+5)
 *  ---------------------------------------------------------------------
 *  THREE.Color KHÔNG đọc CSS cascade, nên các scene 3D từng gắn cứng hex
 *  riêng (#8168CE, #D6486D, #C72D62…) và nhìn như "một app khác gắn vào
 *  naniVMP". Cầu này đọc token thật từ :root lúc dựng scene — theme đổi
 *  (sáng/tối) thì lần dựng sau tự đúng màu.
 *
 *  Fallback = giá trị token light hiện hành, để node --test và môi trường
 *  không DOM vẫn chạy. Grid/floor cần MÀU ĐẶC (gridHelper không nhận
 *  alpha) nên có pha() trộn mực lên nền thay cho rgb(... / a).
 * ===================================================================== */

export interface MauLotus3D {
  canvas: string;
  surface2: string;
  inkMuted: string;
  plum: string;
  plum2: string;
  rose: string;
  danger: string;
  success: string;
  warning: string;
  info: string;
  /** Lưới sàn: mực pha loãng trên nền — màu đặc cho gridHelper. */
  gridMinor: string;
  gridMajor: string;
}

const MAC_DINH: Record<string, string> = {
  "--lp-canvas": "#F7F0F3",
  "--lp-surface-2": "#EEE3E8",
  "--lp-ink": "#2F2430",
  "--lp-ink-muted": "#625560",
  "--lp-plum": "#5A3158",
  "--lp-plum-2": "#70446A",
  "--lp-rose": "#A74F72",
  "--lp-danger": "#A93F5A",
  "--lp-success": "#386958",
  "--lp-warning": "#8B5D24",
  "--lp-info": "#416B8C",
};

function docBien(ten: string): string {
  if (typeof document === "undefined") return MAC_DINH[ten] ?? "#5A3158";
  const v = getComputedStyle(document.documentElement).getPropertyValue(ten).trim();
  return v || (MAC_DINH[ten] ?? "#5A3158");
}

function heHex(mau: string): [number, number, number] | null {
  const m = mau.match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Trộn `tren` lên `duoi` theo tỷ lệ 0..1 — trả màu đặc dạng hex. */
export function pha(duoi: string, tren: string, tyLe: number): string {
  const a = heHex(duoi); const b = heHex(tren);
  if (!a || !b) return duoi;
  const kenh = a.map((x, i) => Math.round(x + (b[i] - x) * tyLe));
  return `#${kenh.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function docMauLotus3D(): MauLotus3D {
  const canvas = docBien("--lp-canvas");
  const ink = docBien("--lp-ink");
  return {
    canvas,
    surface2: docBien("--lp-surface-2"),
    inkMuted: docBien("--lp-ink-muted"),
    plum: docBien("--lp-plum"),
    plum2: docBien("--lp-plum-2"),
    rose: docBien("--lp-rose"),
    danger: docBien("--lp-danger"),
    success: docBien("--lp-success"),
    warning: docBien("--lp-warning"),
    info: docBien("--lp-info"),
    gridMinor: pha(canvas, ink, 0.08),
    gridMajor: pha(canvas, ink, 0.16),
  };
}

/** Có WebGL không — hỏi TRƯỚC khi mount Canvas (nghiên cứu 4+5: người
 *  dùng phải nhận câu tiếng Việt tử tế, không phải "WebGL context lost"). */
export function coWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/* =====================================================================
 *  PageArtLayer — vùng được phép mang artwork chìm
 *  ---------------------------------------------------------------------
 *  Cách DUY NHẤT để đặt motif nghệ thuật vào một màn. Không component nào
 *  tự viết background-image sen/ngọc trai riêng — luật asset kit của
 *  docs/design/lotus-pearl-atelier.md §2.
 *
 *  `data-lp-art` để bộ kiểm `npm run atelier` tìm được mọi vùng art và
 *  xác nhận chúng không chứa bảng/form/audit — vùng đó phải là khoảng
 *  trống trang trí, không phải vùng dữ liệu.
 * ===================================================================== */
import type { ReactNode } from "react";

export type LotusArtMotif =
  | "lotus-corner"   // cành sen góc trên phải — page hero
  | "lotus-stem"     // thân sen dọc — supporting pane, vùng trống cao
  | "pearl-orbit"    // quỹ đạo ngọc trai — khoảng trống quanh hero
  | "whiplash"       // đường cong ngang — đáy trang rộng
  | "login-sweep";   // riêng panel thương hiệu màn đăng nhập

export default function PageArtLayer({ motif, className, children }: {
  motif: LotusArtMotif;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`lp-art-layer lp-art-layer--${motif}${className ? ` ${className}` : ""}`}
      data-lp-art={motif}
    >
      {children}
    </div>
  );
}

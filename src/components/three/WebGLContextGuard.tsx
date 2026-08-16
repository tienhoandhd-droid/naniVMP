/* =====================================================================
 *  WebGLContextGuard — tai runtime cho Canvas 3D (nghiên cứu 7)
 *  ---------------------------------------------------------------------
 *  coWebGL() kiểm NĂNG LỰC trước khi mount, ThreeFallbackBoundary đỡ lỗi
 *  RENDER — nhưng WebGL context còn có thể chết GIỮA CHỪNG (GPU reset,
 *  hết tài nguyên, máy đổi GPU rời/tích hợp). Lúc đó không có exception
 *  nào ném ra React cả: canvas chỉ lặng lẽ trắng. Component này nghe
 *  đúng sự kiện `webglcontextlost` và báo lên để trang rơi về 2D.
 *
 *  Không retry: đây là giao diện phân tích, dữ liệu 2D có đủ 100% thông
 *  tin — mất context một lần là đủ lý do để thôi 3D trong phiên này.
 * ===================================================================== */
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

export function WebGLContextGuard({ onLost }: { onLost: () => void }) {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const xuLy = (e: Event) => {
      // Chặn default để trình duyệt không tự khôi phục nửa vời rồi treo.
      e.preventDefault();
      onLost();
    };
    canvas.addEventListener("webglcontextlost", xuLy);
    return () => canvas.removeEventListener("webglcontextlost", xuLy);
  }, [gl, onLost]);

  return null;
}

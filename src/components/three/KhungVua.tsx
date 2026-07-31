/* =====================================================================
 *  components/three/KhungVua.tsx — Khung nhìn vừa khít cho ba khối 3D
 *  ---------------------------------------------------------------------
 *  Hai khuyết tật của bản trước, cả hai đo được chứ không phải cảm tính:
 *
 *  1. ĐỘ THU PHÓNG ĐẶT CỨNG. `zoom={98}` là con số gõ tay cho một bề rộng
 *     khung nhất định. Khung rộng 1116px thì hình chỉ chiếm ~700px giữa,
 *     hai bên bỏ trắng ~40%. Đổi bề rộng cửa sổ là sai tiếp một kiểu khác.
 *     Ở đây tính lại: chiếu tám đỉnh hộp bao của cảnh về hệ toạ độ camera,
 *     lấy bề rộng/bề cao thật trên màn, rồi chọn zoom để nó vừa khít khung
 *     (chừa một lề nhỏ). Đổi cỡ khung thì tính lại.
 *
 *  2. KÉO XOAY TỰ DO 360°. Không chặn góc phương vị nên chỉ cần kéo mạnh
 *     một cái là cả biểu đồ quay ra sau, nửa hình rơi khỏi khung, nhãn
 *     trục lộn ngược — đúng cảm giác "nhìn lộn xộn, không biết tháng nào".
 *     Xoay là để liếc mặt bị khuất, không phải để lạc mất biểu đồ. Nên
 *     chặn quanh góc gốc: đủ để nhìn vòng qua cột chắn, không đủ để lạc.
 * ===================================================================== */
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

/** Nửa kích thước hộp bao của cảnh, tính từ tâm quay. */
export interface HopBao {
  rong: number;   // theo trục X
  cao: number;    // theo trục Y
  sau: number;    // theo trục Z
  /** Tâm hộp — thường trùng target của OrbitControls. */
  tam?: [number, number, number];
}

/**
 * Đặt lại `camera.zoom` để hộp bao vừa khít khung vẽ.
 * Chạy lúc gắn và mỗi khi khung đổi cỡ.
 */
export function KhungVua({ hop, le = 1.08 }: { hop: HopBao; le?: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const [tx, ty, tz] = hop.tam ?? [0, 0, 0];

    // Tám đỉnh hộp, đưa về hệ toạ độ camera rồi lấy biên. Phải dùng ma trận
    // thật của camera chứ không ước lượng bằng lượng giác: camera nghiêng cả
    // hai trục nên hình chiếu là một lục giác, không phải hình chữ nhật.
    camera.updateMatrixWorld();
    const nghich = new THREE.Matrix4().copy(camera.matrixWorldInverse);
    let maxX = 0;
    let maxY = 0;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const v = new THREE.Vector3(
            tx + sx * hop.rong,
            ty + sy * hop.cao,
            tz + sz * hop.sau,
          ).applyMatrix4(nghich);
          maxX = Math.max(maxX, Math.abs(v.x));
          maxY = Math.max(maxY, Math.abs(v.y));
        }
      }
    }

    // Camera trực giao của R3F dựng theo nửa bề rộng/cao khung chia zoom.
    const nuaW = (camera.right - camera.left) / 2;
    const nuaH = (camera.top - camera.bottom) / 2;
    const z = Math.min(nuaW / (maxX * le), nuaH / (maxY * le));
    if (Number.isFinite(z) && z > 0) {
      camera.zoom = z;
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width, size.height, hop.rong, hop.cao, hop.sau, hop.tam, le]);

  return null;
}

/**
 * Biên góc phương vị quanh hướng nhìn gốc.
 * @param viTri vị trí camera gốc [x, y, z]
 * @param bien  biên lệch cho phép, tính bằng radian (mặc định ±34°)
 */
export function bienPhuongVi(viTri: [number, number, number], bien = 0.6):
{ minAzimuthAngle: number; maxAzimuthAngle: number } {
  const goc = Math.atan2(viTri[0], viTri[2]);
  return { minAzimuthAngle: goc - bien, maxAzimuthAngle: goc + bien };
}

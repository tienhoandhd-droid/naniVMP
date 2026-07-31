/* =====================================================================
 *  components/three/LoginCrown.tsx — Vương miện 3D ở màn đăng nhập
 *  ---------------------------------------------------------------------
 *  Dùng LẠI đúng cảnh của hero trang Tổng quan, không dựng cảnh thứ hai.
 *  Hai lý do, và lý do thứ hai mới là lý do thật:
 *    - Kỹ thuật: chung một chunk three.js, không tốn thêm byte nào.
 *    - Ý nghĩa: cái vương miện chào người dùng ở cửa chính là cái họ sẽ
 *      thấy bên trong với dữ liệu thật của mình. Ở đây bốn viên ngọc sáng
 *      đều — đó là hình dáng của một kế hoạch hoàn tất, tức là đích đến.
 *
 *  Đặt ở panel tối bên trái, nơi KHÔNG có con số nào phải đọc, nên được
 *  phép để đồ hoạ chiếm chỗ. Ô nhập email/mật khẩu nằm panel bên phải và
 *  không bị đụng tới.
 * ===================================================================== */
import { lazy, Suspense, useEffect, useState } from "react";
import type { GemStat } from "./CrownScene.tsx";

const CrownScene = lazy(() => import("./CrownScene.tsx"));

/** Bốn giai đoạn ở trạng thái hoàn tất — hình mẫu, không phải số liệu thật.
 *  Cố ý không đọc DB: màn đăng nhập chưa có phiên, kéo dữ liệu ở đây vừa
 *  chậm vừa lộ số cho người chưa đăng nhập. */
const NGOC_MAU: GemStat[] = [
  { label: "Đề cương", rate: 100, color: "#A991EA" },
  { label: "Thẩm định thực tế", rate: 100, color: "#6BB8EE" },
  { label: "Báo cáo", rate: 100, color: "#EE8FB4" },
  { label: "VMP", rate: 100, color: "#4FC7A5" },
];

export default function LoginCrown() {
  const [bat, setBat] = useState(false);

  useEffect(() => {
    let ok = true;
    try {
      const c = document.createElement("canvas");
      ok = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch { ok = false; }
    if (!ok) return;
    // Ô nhập phải dùng được ngay; đồ hoạ xếp sau.
    const t = setTimeout(() => setBat(true), 200);
    return () => clearTimeout(t);
  }, []);

  const giam = typeof window !== "undefined"
    && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  if (!bat) return null;
  return (
    <div className="vq-login-crown" aria-hidden="true">
      <Suspense fallback={null}>
        <CrownScene gems={NGOC_MAU} giamChuyenDong={giam} />
      </Suspense>
    </div>
  );
}

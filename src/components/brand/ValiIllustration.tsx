/* =====================================================================
 *  ValiIllustration — chọn nhân vật theo giao diện sáng/tối (17/08/2026)
 *  ---------------------------------------------------------------------
 *  Chủ dự án chốt 17/08: hệ có HAI nhân vật, không phải một nhân vật đổi
 *  màu.
 *    · nền sáng → Công chúa Vali (Art Nouveau, tranh in)
 *    · nền tối  → Dũng sĩ Vali (chibi, mô phỏng ảnh chủ dự án cấp)
 *
 *  Vì sao đọc theme bằng MutationObserver chứ không bằng matchMedia:
 *  app ghi thẳng `data-theme` lên <html> (Layout.tsx) và có chế độ "auto",
 *  nên thuộc tính ấy — chứ không phải sở thích hệ điều hành — mới là
 *  nguồn sự thật: bấm đổi theme là nhân vật đổi ngay, không cần tải lại trang.
 *
 *  Hợp đồng KHÔNG đổi (nơi dùng không phải sửa gì):
 *   · props (mood / size / decorative / className);
 *   · `data-lp-vali={mood}` — bộ kiểm atelier đếm đúng thuộc tính này;
 *   · khung 4:5 và lớp `.lp-vali-enter`.
 *
 *  Render đầu tiên trả về bản SÁNG: khi chưa có DOM (SSR, node --test)
 *  đoán sáng an toàn hơn — sai thì lần vẽ ngay sau đó sửa lại, còn đoán
 *  tối trên nền sáng thì nhân vật đen sì trên nền trắng.
 * ===================================================================== */
import { useEffect, useState } from "react";
import CongChuaVali from "./CongChuaVali.tsx";
import DungSiVali from "./DungSiVali.tsx";
import type { ValiProps } from "./valiTypes.ts";

export type { ValiMood } from "./valiTypes.ts";

function docThemeToi(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-theme") === "dark";
}

/** Hook: true khi giao diện đang ở chế độ tối, cập nhật ngay khi đổi. */
export function dungThemeToi(): boolean {
  const [toi, setToi] = useState(docThemeToi);
  useEffect(() => {
    setToi(docThemeToi());
    const mo = new MutationObserver(() => setToi(docThemeToi()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return toi;
}

export default function ValiIllustration(props: ValiProps) {
  return dungThemeToi() ? <DungSiVali {...props} /> : <CongChuaVali {...props} />;
}

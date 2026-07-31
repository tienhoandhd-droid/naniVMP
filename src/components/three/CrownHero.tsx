/* =====================================================================
 *  components/three/CrownHero.tsx — Lớp bọc cho vương miện 3D
 *  ---------------------------------------------------------------------
 *  Ba việc, và cả ba đều là điều kiện để thứ 3D kia được phép có mặt trên
 *  một màn hình dùng cho công việc thật:
 *    1. Tính tỉ lệ bốn giai đoạn từ chính dữ liệu đang hiện trên trang.
 *    2. Nạp cảnh WebGL theo yêu cầu (React.lazy) — máy không mở trang Tổng
 *       quan thì không tải một byte three.js nào.
 *    3. Luôn có đường lùi: không WebGL, hoặc người dùng bật "giảm chuyển
 *       động", thì vẫn phải đọc được đủ số. Con số nằm ở lớp HTML nên
 *       trình đọc màn hình và thao tác bôi-chép đều hoạt động bình thường.
 * ===================================================================== */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { C, TEXT, NUM } from "../../constants/theme.ts";
import { STAGE_COLOR } from "../../constants/vmp.ts";
import { wlIsDone } from "../../utils/helpers.ts";
import type { Activity } from "../../types/domain.ts";
import type { GemStat } from "./CrownScene.tsx";

const CrownScene = lazy(() => import("./CrownScene.tsx"));

/** Máy có WebGL không. Hỏi một lần rồi nhớ — tạo context để dò mỗi lần
 *  render là cách chắc chắn làm giật trang. */
let coWebgl: boolean | null = null;
function hoWebgl(): boolean {
  if (coWebgl !== null) return coWebgl;
  try {
    const c = document.createElement("canvas");
    coWebgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { coWebgl = false; }
  return coWebgl;
}

function dungGiamChuyenDong(): boolean {
  const [giam, setGiam] = useState(
    () => typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const doi = () => setGiam(mq.matches);
    mq.addEventListener?.("change", doi);
    return () => mq.removeEventListener?.("change", doi);
  }, []);
  return !!giam;
}

/** Bốn giai đoạn, đọc cùng nguồn với trang Báo cáo (cột trạng thái đã
 *  chuẩn hoá), để hai màn không bao giờ nói hai con số khác nhau. */
export function tinhBonGiaiDoan(acts: Activity[]): GemStat[] {
  const A = acts.filter((a) => (a.state || "active") === "active");
  const tong = A.length;
  const dem = (khoa: string) =>
    A.filter((a) => wlIsDone((a._raw as Record<string, unknown> | undefined)?.[khoa])).length;
  const ty = (n: number) => (tong ? Math.round((n / tong) * 100) : 0);

  return [
    { label: STAGE_COLOR.protocol.label, rate: ty(dem("tt_de_cuong")), color: "#8168CE" },
    { label: STAGE_COLOR.validation.label, rate: ty(dem("tt_tham_dinh")), color: "#4497D2" },
    { label: STAGE_COLOR.report.label, rate: ty(dem("tt_bao_cao")), color: "#E4749F" },
    { label: STAGE_COLOR.vmp.label, rate: ty(dem("tt_vmp")), color: "#2A9E82" },
  ];
}

export default function CrownHero({ acts, rate, total }: {
  acts: Activity[];
  /** Tỉ lệ hoàn thành VMP để in to giữa vương miện. */
  rate: number;
  total: number;
}) {
  const gems = useMemo(() => tinhBonGiaiDoan(acts), [acts]);
  const giam = dungGiamChuyenDong();
  const [ve3d, setVe3d] = useState(false);

  // Chỉ bật 3D sau khi trang đã dựng xong: hạng mục quá hạn phải hiện ra
  // trước, cái vương miện xếp sau — không để đồ hoạ chặn đường đọc số.
  useEffect(() => {
    if (!hoWebgl()) return;
    const t = setTimeout(() => setVe3d(true), 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="vmp-crown-hero">
      <div className="vmp-crown-stage" aria-hidden="true">
        {ve3d && (
          <Suspense fallback={null}>
            <CrownScene gems={gems} giamChuyenDong={giam} />
          </Suspense>
        )}
      </div>

      {/* Lớp chữ nằm TRÊN canvas, là nguồn đọc thật của khối này. */}
      <div className="vmp-crown-figure">
        <div style={{ fontFamily: NUM, fontSize: 46, fontWeight: 800, color: C.plum, lineHeight: 1 }}>
          {rate}%
        </div>
        <div style={{ fontSize: 10.5, color: C.plumSoft, fontWeight: 800, letterSpacing: ".14em", marginTop: 4 }}>
          HOÀN THÀNH VMP
        </div>
        <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 700, marginTop: 2 }}>
          trên {total} hạng mục
        </div>
      </div>

      {/* Chú giải bốn viên ngọc — đây là phần luôn đọc được, kể cả khi
          không có WebGL. Thứ tự trùng thứ tự chạy quanh vành. */}
      <ul className="vmp-crown-legend">
        {gems.map((g) => (
          <li key={g.label}>
            <span className="vmp-crown-dot" style={{ background: g.color }} />
            <span className="vmp-crown-label">{g.label}</span>
            <span className="vmp-crown-bar">
              <i style={{ width: `${g.rate}%`, background: g.color }} />
            </span>
            <b style={{ fontFamily: NUM, color: C.plum }}>{g.rate}%</b>
          </li>
        ))}
      </ul>

      <div className="vmp-crown-note" style={{ fontFamily: TEXT }}>
        Mỗi viên ngọc là một giai đoạn; lõi sáng cao theo tỉ lệ hoàn thành.
      </div>
    </div>
  );
}

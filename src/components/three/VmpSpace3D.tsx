/* =====================================================================
 *  components/three/VmpSpace3D.tsx — Không gian VMP ba chiều
 *  ---------------------------------------------------------------------
 *  Dữ liệu VMP vốn CÓ ba chiều, và bản 2D đang phải bỏ bớt một chiều:
 *
 *      trục tiến vào sâu (Z) : thời gian — 12 tháng đích VMP
 *      trục ngang       (X) : giai đoạn — Đề cương → Thẩm định → Báo cáo → VMP
 *      chiều cao        (Y) : % hoàn thành của ô đó
 *
 *  Vẽ phẳng thì phải tách thành bốn biểu đồ rời, và mắt không ghép lại
 *  được. Dựng khối thì thấy ngay thứ quan trọng nhất: cái PHỄU tụt dần
 *  theo trục ngang, và nó tụt sâu thêm ở những tháng nào.
 *
 *  Ba luật giữ cho khối này vẫn ĐỌC ĐƯỢC, không thành đồ trang trí:
 *
 *  1. Phép chiếu TRỰC GIAO. Phối cảnh vẽ vật ở xa nhỏ đi, nên cột tháng 12
 *     đứng sau sẽ thấp hơn cột tháng 1 dù hai tỉ lệ bằng nhau — biểu đồ tự
 *     nói dối. Đó mới là lý do biểu đồ 3D bị mang tiếng, không phải vì có
 *     chiều thứ ba. Trực giao giữ nguyên độ dài ở mọi độ sâu.
 *  2. XOAY ĐƯỢC. Khối nào cũng có góc bị che; cho xoay thì cái bị che luôn
 *     lôi ra xem được. Đây là điều kiện, không phải tính năng thêm.
 *  3. Chữ và số ở lớp HTML, không vẽ vào WebGL — và mọi con số đều đọc
 *     được ở bảng bên dưới kể cả khi máy không có WebGL.
 * ===================================================================== */
import { useState, useMemo, lazy, Suspense } from "react";
import { coWebGL, docMauLotus3D, dungMauLotus3D } from "../../lib/lotus3dColors.ts";

/* three.js CHỈ tải khi người dùng bấm "Xem bản đồ 3D" — chú thích ở
 * VmpSpace3DCanvas.tsx. Hằng hình học + kiểu O3D chuyển sang
 * vmpSpace3dShared.ts để hai nửa dùng chung mà không kéo nhau. */
const Canvas3D = lazy(() => import("./VmpSpace3DCanvas.tsx"));
import { wlIsDone } from "../../utils/helpers.ts";
import { CauKetLuan } from "../ui/Primitives.tsx";
import BanDoNhiet from "../dashboard/BanDoNhiet.tsx";
import type { ONhiet } from "../dashboard/BanDoNhiet.tsx";
import type { Activity } from "../../types/domain.ts";

/* O3D, GIAI_DOAN, hằng hình học: chuyển sang vmpSpace3dShared.ts (dùng
 * chung với chunk 3D lazy). MAU3D local chỉ phục vụ phần 2D; mỗi render
 * đồng bộ vào holder chung để getter màu của cả hai nửa cùng đổi theme. */
import {
  GIAI_DOAN, capNhatMau3D,
} from "./vmpSpace3dShared.ts";
import type { O3D } from "./vmpSpace3dShared.ts";
export type { O3D } from "./vmpSpace3dShared.ts";

let MAU3D = docMauLotus3D();

/** Ma trận 12 tháng × 4 giai đoạn. Tháng lấy theo MỐC ĐÍCH VMP, đúng như
 *  mọi chỗ khác trong app (hanVmp / deadline_vmp), để hai màn không bao giờ
 *  nói hai con số khác nhau. */
export function dungMaTran(acts: Activity[], nam: number): O3D[] {
  const A = acts.filter((a) => (a.state || "active") === "active");
  const theoThang: Activity[][] = Array.from({ length: 12 }, () => []);
  for (const a of A) {
    const raw = (a._raw || {}) as Record<string, unknown>;
    const han = String(raw.dl_vmp || "");
    if (han.slice(0, 4) !== String(nam)) continue;
    const m = Number(han.slice(5, 7));
    if (m >= 1 && m <= 12) theoThang[m - 1].push(a);
  }

  const o: O3D[] = [];
  for (let t = 0; t < 12; t++) {
    const ds = theoThang[t];
    for (let g = 0; g < GIAI_DOAN.length; g++) {
      const tong = ds.length;
      const xong = ds.filter((a) =>
        wlIsDone((a._raw as Record<string, unknown> | undefined)?.[GIAI_DOAN[g].khoa])).length;
      o.push({
        thang: t + 1, giaiDoan: g, tong, xong,
        tyLe: tong ? Math.round((xong / tong) * 100) : null,
      });
    }
  }
  return o;
}

/** Sắc "ngưỡng" dùng chung: đường mục tiêu ở biểu đồ phẳng và đường giới
 *  hạn ±3σ của biểu đồ kiểm soát đều dùng màu này. Một khái niệm, một màu. */



export default function VmpSpace3D({ acts, nam, giamChuyenDong }: {
  acts: Activity[]; nam: number; giamChuyenDong: boolean;
}) {
  const o3d = useMemo(() => dungMaTran(acts, nam), [acts, nam]);
  const [chon, setChon] = useState<O3D | null>(null);
  /* Đổi 3D ↔ 2D. Giữ 3D làm mặc định vì mặt phẳng mục tiêu cắt ngang khối
     là thứ bản phẳng không làm được; nhưng ai cần đọc số chính xác — hoặc
     cần IN RA GIẤY — thì có bảng tương đương, cùng một bộ số. */
  /* 2D mặc định (nghiên cứu (3) P0) — 3D là khám phá tự chọn. */
  const [kieu, setKieu] = useState<"3d" | "2d">("2d");
  const ho3D = useMemo(coWebGL, []);
  MAU3D = dungMauLotus3D(); // màu theo theme, cập nhật cả scene đang mở
  capNhatMau3D(MAU3D);
  const oNhiet: ONhiet[] = useMemo(() => o3d
    .filter((x) => x.tyLe != null)
    .map((x) => ({
      hang: x.giaiDoan, cot: x.thang - 1, gt: x.tyLe as number, phu: x.xong,
      ghiChu: `${GIAI_DOAN[x.giaiDoan].ten} · Tháng ${x.thang}: ${x.tyLe}% (${x.xong}/${x.tong} hạng mục)`,
    })), [o3d]);

  /* CÂU KẾT LUẬN. Hình khối cho thấy có một cái phễu, nhưng người xem vẫn
     phải tự đo xem nó tụt mạnh nhất ở khâu nào. Đó chính là con số quyết
     định phải đi gỡ chỗ nào — nên nói thẳng ra bằng chữ. */
  const ketLuan = useMemo(() => {
    const tbGiaiDoan = GIAI_DOAN.map((_, g) => {
      const o = o3d.filter((x) => x.giaiDoan === g && x.tyLe != null);
      const tongXong = o.reduce((s, x) => s + x.xong, 0);
      const tong = o.reduce((s, x) => s + x.tong, 0);
      return tong ? Math.round((tongXong / tong) * 100) : null;
    });
    if (tbGiaiDoan.some((v) => v == null)) return null;

    // Khâu tụt sâu nhất = chênh lệch lớn nhất giữa hai giai đoạn liền nhau.
    let hut = 0;
    for (let g = 1; g < tbGiaiDoan.length; g += 1) {
      if ((tbGiaiDoan[g - 1] as number) - (tbGiaiDoan[g] as number)
        > (tbGiaiDoan[hut] as number) - (tbGiaiDoan[hut + 1] as number)) hut = g - 1;
    }
    const rong = (tbGiaiDoan[hut] as number) - (tbGiaiDoan[hut + 1] as number);

    // Tháng nào tụt sâu nhất ở đích VMP — chỗ cần nhìn trước tiên.
    const dichVmp = o3d.filter((x) => x.giaiDoan === 3 && x.tyLe != null && x.tong > 0);
    const te = [...dichVmp].sort((a, b) => (a.tyLe as number) - (b.tyLe as number))[0];

    return {
      chinh: rong >= 8
        ? `Phễu tụt sâu nhất ở khâu ${GIAI_DOAN[hut].ten} → ${GIAI_DOAN[hut + 1].ten}: `
          + `${tbGiaiDoan[hut]}% xuống ${tbGiaiDoan[hut + 1]}%, mất ${rong} điểm.`
        : `Bốn giai đoạn đi khá đều nhau (${tbGiaiDoan.join("% → ")}%) — không có khâu nào tắc riêng.`,
      phu: te
        ? `Tháng ${te.thang} yếu nhất ở đích VMP: ${te.tyLe}% (${te.xong}/${te.tong} hạng mục).`
        : "",
      tone: (rong >= 20 ? "over" : rong >= 8 ? "warn" : "ok") as "over" | "warn" | "ok",
    };
  }, [o3d]);

  return (
    <div className="vmp-space3d">
      {ketLuan && <CauKetLuan chinh={ketLuan.chinh} phu={ketLuan.phu} tone={ketLuan.tone} />}
      {/* Bọc hẳn một div có chiều cao rõ ràng. Bản trước tôi đặt chiều cao
          bằng bộ chọn `> div:first-child` và trượt: R3F tự sinh lớp bọc
          riêng, canvas co lại còn 150px nên cột bị cắt mất ngọn. */}
      {!ho3D && <p className="vmp-3d-khong-ho-tro" role="status">
        Thiết bị này không hỗ trợ chế độ 3D. Dữ liệu đầy đủ vẫn có ở cách hiển thị hai chiều.
      </p>}
      <div className="vmp-space3d-doi">
        {ho3D && <button type="button" data-map-mode="3d" onClick={() => setKieu("3d")}
          className={kieu === "3d" ? "is-chon" : ""}>Xem bản đồ 3D</button>}
        <button type="button" data-map-mode="2d" onClick={() => setKieu("2d")}
          className={kieu === "2d" ? "is-chon" : ""}>Bản đồ tiến độ</button>
      </div>

      {(!ho3D || kieu === "2d") ? (
        <BanDoNhiet
          tenHang="Giai đoạn" tenCot="Tháng"
          o={oNhiet}
          nhanHang={GIAI_DOAN.map((g) => g.ten)}
          nhanCot={Array.from({ length: 12 }, (_, i) => `T${i + 1}`)}
          donVi="%" phuLabel="xong" hauTo="%" congTong={false}
          sacDo={MAU3D.success}
        />
      ) : (
      <div className="vmp-space3d-than">
        {/* KHÔNG có tooltip nổi bám con trỏ nữa. Nó che đúng thứ người ta
            đang trỏ vào: cột bị chính chú thích của nó phủ lên, muốn nhìn
            lại cột thì phải bỏ chuột ra, mà bỏ chuột ra thì mất chú thích.
            Chi tiết nay hiện ở dải bên phải — ngang tầm mắt với khung vẽ,
            không cách xa như hồi nó còn nằm dưới khung. */}
        <div className="vmp-space3d-khung">
            <Suspense fallback={<div style={{ height: 380 }} />}>
              <Canvas3D o3d={o3d} chon={chon} giamChuyenDong={giamChuyenDong}
                onHover={setChon} onLost={() => setKieu("2d")} mau={MAU3D} />
            </Suspense>
        </div>

        <div className="vmp-space3d-canh">
        <div className="vmp-space3d-chu">
          {GIAI_DOAN.map((g) => (
            <span key={g.ten}>
              <i style={{ background: g.mau }} />{g.ten}
            </span>
          ))}
          <span className="vmp-space3d-muc"><i />Mặt phẳng mục tiêu 50% — cột nhô lên khỏi mặt là tháng đạt</span>
        </div>

        <div className={`vmp-space3d-tip ${chon ? "is-tro" : ""}`} role="status" aria-live="polite">
          {chon ? (
            <>
              <b>Tháng {chon.thang} · {GIAI_DOAN[chon.giaiDoan].ten}</b>
              {" — "}{chon.tyLe}% ({chon.xong}/{chon.tong} hạng mục có mốc đích VMP tháng này)
            </>
          ) : "Kéo để xoay khối · đưa chuột lên một cột để xem số. Trục sâu là 12 tháng, trục ngang là bốn giai đoạn, chiều cao là % hoàn thành."}
        </div>
        </div>
      </div>
      )}
    </div>
  );
}

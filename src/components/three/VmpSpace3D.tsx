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
import { useRef, useState, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { coWebGL, docMauLotus3D, dungMauLotus3D } from "../../lib/lotus3dColors.ts";
import { OrthographicCamera, OrbitControls, Edges } from "@react-three/drei";
import { KhungVua, bienPhuongVi } from "./KhungVua.tsx";
import * as THREE from "three";
import { wlIsDone } from "../../utils/helpers.ts";
import { CauKetLuan } from "../ui/Primitives.tsx";
import BanDoNhiet from "../dashboard/BanDoNhiet.tsx";
import type { ONhiet } from "../dashboard/BanDoNhiet.tsx";
import { NhanTruc } from "./NhanTruc.tsx";
import type { MotNhan } from "./NhanTruc.tsx";
import type { Activity } from "../../types/domain.ts";

export interface O3D {
  thang: number;        // 1..12
  giaiDoan: number;     // 0..3
  tyLe: number | null;  // % hoàn thành, null khi tháng đó không có hạng mục nào
  xong: number;
  tong: number;
}

/** Vị trí camera gốc — dùng chung cho khung nhìn và biên góc xoay. */
/* Phương vị nghiêng về trục tháng để 12 tháng trải ngang khung —
   xem lý do đầy đủ ở WorkloadSpace3D.tsx. */
const VI_TRI: [number, number, number] = [7.4, 3.9, 3.4];

/* Màu giai đoạn = semantic token (khớp alias --lp-stage-* của CSS):
 * đề cương plum · thẩm định info · báo cáo rose · đích success.
 * Đọc lúc nạp chunk — hết bộ tím/xanh "demo" tách rời Lotus. */
let MAU3D = docMauLotus3D();
/* getter: đọc MAU3D HIỆN HÀNH mỗi lần render — theme đổi là màu đổi. */
const GIAI_DOAN = [
  { khoa: "tt_de_cuong", ten: "Đề cương", get mau() { return MAU3D.plum; } },
  { khoa: "tt_tham_dinh", ten: "Thẩm định", get mau() { return MAU3D.info; } },
  { khoa: "tt_bao_cao", ten: "Báo cáo", get mau() { return MAU3D.rose; } },
  { khoa: "tt_vmp", ten: "Đích VMP", get mau() { return MAU3D.success; } },
];

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

const CAO = 2.0;        // đơn vị cảnh cho mốc 100%
/** Sắc "ngưỡng" dùng chung: đường mục tiêu ở biểu đồ phẳng và đường giới
 *  hạn ±3σ của biểu đồ kiểm soát đều dùng màu này. Một khái niệm, một màu. */
/* Mặt phẳng mục tiêu là NGƯỠNG trung tính, không phải báo động —
 * nghiên cứu (3): "không dùng danger cho một đường target trung tính". */
const MAU_MUC_TIEU = { get mau() { return MAU3D.inkMuted; } };
const BUOC_T = 0.46;    // khoảng cách giữa hai tháng (trục sâu)
const BUOC_G = 0.72;    // khoảng cách giữa hai giai đoạn (trục ngang)

function Cot({ o, x, z, chon, giamChuyenDong, onHover }: {
  o: O3D; x: number; z: number; chon: boolean; giamChuyenDong: boolean;
  onHover: (o: O3D | null) => void;
}) {
  const luoi = useRef<THREE.Mesh>(null);
  const dich = ((o.tyLe ?? 0) / 100) * CAO;
  const hienTai = useRef(0);

  /* frameloop="demand": hoạt ảnh tự xin frame tới khi chạm đích rồi ngừng. */
  const invalidate = useThree((state) => state.invalidate);
  useFrame((_, dt) => {
    if (!luoi.current) return;
    if (giamChuyenDong) hienTai.current = dich; // giảm chuyển động: hiện thẳng
    else hienTai.current += (dich - hienTai.current) * Math.min(1, dt * 4.5);
    const h = Math.max(0.004, hienTai.current);
    luoi.current.scale.y = h;
    luoi.current.position.y = h / 2;
    if (!giamChuyenDong && Math.abs(dich - hienTai.current) > 0.003) invalidate();
  });

  const mau = GIAI_DOAN[o.giaiDoan].mau;
  // Tháng không có hạng mục nào: KHÔNG vẽ cột 0% — 0% ở tháng trống không
  // phải là "chưa đạt", nó là "không có gì để đạt". Vẽ ra là nói sai.
  if (o.tyLe == null) return null;

  return (
    <mesh ref={luoi} position={[x, 0, z]}
      onPointerOver={(e) => { e.stopPropagation(); onHover(o); }}
      onPointerOut={() => onHover(null)}>
      <boxGeometry args={[0.4, 1, 0.28]} />
      <meshPhysicalMaterial
        color={mau} roughness={0.34} metalness={0.04}
        emissive={mau} emissiveIntensity={chon ? 0.45 : 0}
        transparent opacity={chon ? 1 : 0.93}
      />
      <Edges threshold={15} color="#ffffff" />
    </mesh>
  );
}

function Canh({ o3d, chon, giamChuyenDong, onHover }: {
  giamChuyenDong: boolean;
  o3d: O3D[]; chon: O3D | null; onHover: (o: O3D | null) => void; }) {
  const sauZ = 12 * BUOC_T;
  const rongX = GIAI_DOAN.length * BUOC_G;
  const z0 = -sauZ / 2 + BUOC_T / 2;
  const x0 = -rongX / 2 + BUOC_G / 2;

  /* Chỉ mốc quý đứng đậm; tháng còn lại nhỏ và mờ, sáng lên khi trỏ vào
     cột của tháng đó. Tên trục bỏ mũi tên — khối xoay được nên mũi tên vẽ
     cứng theo góc ban đầu sẽ chỉ sai sau khi xoay. */
  const nhan: MotNhan[] = [
    ...Array.from({ length: 12 }, (_, i) => ({
      // Mép GẦN camera — xem lý do ở WorkloadSpace3D.tsx.
      // Lật trục thời gian để T1 nằm bên trái — xem WorkloadSpace3D.tsx.
      vt: [rongX / 2 + 0.42, 0.02, -(z0 + i * BUOC_T)] as [number, number, number],
      chu: `T${i + 1}`,
      cap: ((i + 1) % 3 === 1 ? "chinh" : "phu") as "chinh" | "phu",
      sang: chon?.thang === i + 1,
    })),
    ...GIAI_DOAN.map((g, i) => ({
      vt: [x0 + i * BUOC_G, 0.02, sauZ / 2 + 0.36] as [number, number, number],
      chu: g.ten,
      cap: "chinh" as const,
      sang: chon?.giaiDoan === i,
    })),
    // Tên trục bỏ khỏi cảnh — phụ đề thẻ đã nói, mà để trong cảnh thì nó
    // đẩy khung rộng ra và chen vào dãy nhãn giai đoạn.
    /* Nhãn nằm NGAY TRÊN mép gần của mặt phẳng, ở cấp đậm nhất: đây là mốc
       để đọc cả khối, không phải một chú thích phụ. */
    { vt: [rongX / 2 + 0.55, CAO / 2 + 0.03, sauZ / 2 + 0.2], chu: "Mục tiêu 50%", cap: "truc" as const },
  ];

  return (
    <>
      <OrthographicCamera makeDefault position={VI_TRI} />
      <KhungVua le={1.02}
        hop={{ rong: rongX / 2 + 0.62, cao: CAO / 2 + 0.2, sau: sauZ / 2 + 0.4,
               tam: [0, CAO / 2, 0] }} />
      {/* Không tự xoay, và chặn góc quanh hướng gốc — xem WorkloadSpace3D.tsx. */}
      <OrbitControls
        makeDefault enablePan={false} enableZoom={false}
        // Chặn không cho lật xuống dưới sàn: nhìn từ dưới lên thì cột nào
        // cũng che nhau và không còn đọc được gì.
        minPolarAngle={0.34} maxPolarAngle={Math.PI / 2.5}
        {...bienPhuongVi(VI_TRI, 0.55)}
        autoRotate={false}
        target={[0, CAO / 2, 0]}
      />

      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 9, 6]} intensity={1.15} />
      <directionalLight position={[-6, 4, -5]} intensity={0.22} color="#f2edf2" />

      {/* Sàn + lưới: cho khối chỗ đứng và cho mắt cái mốc để ước lượng. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]}>
        <planeGeometry args={[rongX + 0.5, sauZ + 0.4]} />
        <meshBasicMaterial color={MAU3D.canvas} />
      </mesh>

      {/* MẶT PHẲNG MỤC TIÊU 50% — cắt ngang cả khối.
          Đây mới là thứ khiến khối 3D này đáng dựng: ở bản phẳng, mục tiêu
          là một nét đứt dễ bỏ qua; ở đây nó là MẶT NƯỚC, và câu hỏi "tháng
          nào đạt" trở thành câu hỏi "cột nào nhô lên khỏi mặt" — trả lời
          được cho cả 48 ô cùng một lúc, không phải dò từng cột.

          Bản trước để opacity 0.1 nên gần như vô hình, tức là mất luôn tác
          dụng đó. Nay: mặt đậm hơn, CÓ VIỀN (mặt trong suốt mà không viền
          thì chỗ nào không có cột xuyên qua sẽ biến mất hẳn), và có cột mốc
          ở bốn góc để mắt bám được độ cao của mặt phẳng trong không gian.
          Màu dùng sắc "ngưỡng" của app — cùng màu với đường mục tiêu trên
          biểu đồ phẳng và đường giới hạn của biểu đồ kiểm soát. */}
      <group position={[0, CAO / 2, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <planeGeometry args={[rongX + 0.42, sauZ + 0.36]} />
          <meshBasicMaterial color={MAU_MUC_TIEU.mau} transparent opacity={0.16}
            side={THREE.DoubleSide} depthWrite={false} />
          <Edges threshold={1} color={MAU_MUC_TIEU.mau} />
        </mesh>
        {/* Bốn cột mốc rất mảnh nối mặt phẳng xuống sàn: không có chúng thì
            mặt phẳng trông như trôi lơ lửng và mắt không định được nó cao
            bao nhiêu so với chân cột. */}
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
          <mesh key={i} position={[sx * (rongX + 0.42) / 2, -CAO / 4, sz * (sauZ + 0.36) / 2]}>
            <boxGeometry args={[0.012, CAO / 2, 0.012]} />
            <meshBasicMaterial color={MAU_MUC_TIEU.mau} transparent opacity={0.45} />
          </mesh>
        ))}
      </group>

      <NhanTruc nhan={nhan} tam={[0, CAO / 2, 0]} />

      {o3d.map((o) => (
        <Cot key={`${o.thang}-${o.giaiDoan}`} o={o} giamChuyenDong={giamChuyenDong}
          x={x0 + o.giaiDoan * BUOC_G} z={-(z0 + (o.thang - 1) * BUOC_T)}
          chon={!!chon && chon.thang === o.thang && chon.giaiDoan === o.giaiDoan}
          onHover={onHover} />
      ))}
    </>
  );
}

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
          className={kieu === "3d" ? "is-chon" : ""}>Khám phá 3D</button>}
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
            <Canvas dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}
            frameloop="demand">
            <Canh o3d={o3d} chon={chon} giamChuyenDong={giamChuyenDong} onHover={setChon} />
          </Canvas>
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

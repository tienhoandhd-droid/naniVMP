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
import { Canvas, useFrame } from "@react-three/fiber";
import { OrthographicCamera, OrbitControls, Edges } from "@react-three/drei";
import { KhungVua, bienPhuongVi } from "./KhungVua.tsx";
import * as THREE from "three";
import { wlIsDone } from "../../utils/helpers.ts";
import { CauKetLuan } from "../ui/Primitives.tsx";
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

const GIAI_DOAN = [
  { khoa: "tt_de_cuong", ten: "Đề cương", mau: "#8168CE" },
  { khoa: "tt_tham_dinh", ten: "Thẩm định", mau: "#4497D2" },
  { khoa: "tt_bao_cao", ten: "Báo cáo", mau: "#E4749F" },
  { khoa: "tt_vmp", ten: "Đích VMP", mau: "#2A9E82" },
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
const BUOC_T = 0.46;    // khoảng cách giữa hai tháng (trục sâu)
const BUOC_G = 0.72;    // khoảng cách giữa hai giai đoạn (trục ngang)

function Cot({ o, x, z, chon, onHover }: {
  o: O3D; x: number; z: number; chon: boolean;
  onHover: (o: O3D | null) => void;
}) {
  const luoi = useRef<THREE.Mesh>(null);
  const dich = ((o.tyLe ?? 0) / 100) * CAO;
  const hienTai = useRef(0);

  useFrame((_, dt) => {
    if (!luoi.current) return;
    hienTai.current += (dich - hienTai.current) * Math.min(1, dt * 4.5);
    const h = Math.max(0.004, hienTai.current);
    luoi.current.scale.y = h;
    luoi.current.position.y = h / 2;
  });

  const mau = GIAI_DOAN[o.giaiDoan].mau;
  // Tháng không có hạng mục nào: KHÔNG vẽ cột 0% — 0% ở tháng trống không
  // phải là "chưa đạt", nó là "không có gì để đạt". Vẽ ra là nói sai.
  if (o.tyLe == null) return null;

  return (
    <mesh ref={luoi} position={[x, 0, z]}
      onPointerOver={(e) => { e.stopPropagation(); onHover(o); }}
      onPointerOut={() => onHover(null)}
      castShadow receiveShadow>
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

function Canh({ o3d, chon, onHover }: {
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
    { vt: [rongX / 2 + 0.55, CAO / 2, 0], chu: "mục tiêu 50%", cap: "phu" as const },
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
      <directionalLight position={[6, 9, 6]} intensity={1.15} castShadow
        shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-6, 4, -5]} intensity={0.4} color="#ffe4f1" />

      {/* Sàn + lưới: cho khối chỗ đứng và cho mắt cái mốc để ước lượng. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]} receiveShadow>
        <planeGeometry args={[rongX + 0.5, sauZ + 0.4]} />
        <meshBasicMaterial color="#F7F1F8" />
      </mesh>

      {/* Mặt phẳng 50% cắt ngang cả khối. Ở 2D đây là một nét đứt dễ bỏ qua;
          ở 3D nó là mặt nước — cột nào nhô lên khỏi mặt là thấy ngay, trên
          toàn bộ 12 tháng cùng lúc. */}
      <mesh position={[0, CAO / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[rongX + 0.35, sauZ + 0.3]} />
        <meshBasicMaterial color="#8168CE" transparent opacity={0.1}
          side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      <NhanTruc nhan={nhan} tam={[0, CAO / 2, 0]} />

      {o3d.map((o) => (
        <Cot key={`${o.thang}-${o.giaiDoan}`} o={o}
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
  const [chuot, setChuot] = useState<{ x: number; y: number } | null>(null);

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
      <div className="vmp-space3d-than">
        <div className="vmp-space3d-khung"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setChuot({ x: e.clientX - r.left, y: e.clientY - r.top });
          }}
          onPointerLeave={() => setChuot(null)}>
          {chon && chuot && (
            <div className="vmp-space3d-hover" style={{ left: chuot.x, top: chuot.y }} aria-hidden="true">
              <b>{GIAI_DOAN[chon.giaiDoan].ten} · Tháng {chon.thang}</b>
              <span>
                <i style={{ background: GIAI_DOAN[chon.giaiDoan].mau }} />{chon.tyLe}% xong
                <em>{chon.xong}/{chon.tong} hạng mục</em>
              </span>
            </div>
          )}
          <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, alpha: true }}
            frameloop={giamChuyenDong ? "demand" : "always"}>
            <Canh o3d={o3d} chon={chon} onHover={setChon} />
          </Canvas>
        </div>

        <div className="vmp-space3d-canh">
        <div className="vmp-space3d-chu">
          {GIAI_DOAN.map((g) => (
            <span key={g.ten}>
              <i style={{ background: g.mau }} />{g.ten}
            </span>
          ))}
          <span className="vmp-space3d-muc"><i />Mặt phẳng mục tiêu 50%</span>
        </div>

        <div className="vmp-space3d-tip" role="status" aria-live="polite">
          {chon ? (
            <>
              <b>Tháng {chon.thang} · {GIAI_DOAN[chon.giaiDoan].ten}</b>
              {" — "}{chon.tyLe}% ({chon.xong}/{chon.tong} hạng mục có mốc đích VMP tháng này)
            </>
          ) : "Kéo để xoay khối · đưa chuột lên một cột để xem số. Trục sâu là 12 tháng, trục ngang là bốn giai đoạn, chiều cao là % hoàn thành."}
        </div>
        </div>
      </div>
    </div>
  );
}

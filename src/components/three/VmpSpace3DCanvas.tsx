/* =====================================================================
 *  VmpSpace3DCanvas — RIÊNG phần WebGL của bản đồ tiến độ tháng
 *  ---------------------------------------------------------------------
 *  Tách khỏi VmpSpace3D (31/08, đo hiệu năng): file cũ import three.js
 *  tĩnh nên MỞ màn Báo cáo là kéo ~227KB gzip three dù mặc định là bản
 *  2D và phần lớn người dùng không bao giờ bấm "Xem bản đồ 3D". Nay
 *  three chỉ tải khi người dùng thật sự mở 3D (lazy ở VmpSpace3D).
 * ===================================================================== */
import { useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, OrbitControls, Edges } from "@react-three/drei";
import * as THREE from "three";

import { docMauLotus3D } from "../../lib/lotus3dColors.ts";
import { KhungVua, bienPhuongVi } from "./KhungVua.tsx";
import { WebGLContextGuard } from "./WebGLContextGuard.tsx";
import { NhanTruc } from "./NhanTruc.tsx";
import type { MotNhan } from "./NhanTruc.tsx";
import { GIAI_DOAN, CAO, BUOC_T, BUOC_G, MAU_MUC_TIEU, VI_TRI } from "./vmpSpace3dShared.ts";
import type { O3D } from "./vmpSpace3dShared.ts";

let MAU3D = docMauLotus3D();

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

export default function VmpSpace3DCanvas({ o3d, chon, giamChuyenDong, onHover, onLost, mau }: {
  o3d: O3D[];
  chon: O3D | null;
  giamChuyenDong: boolean;
  onHover: (o: O3D | null) => void;
  onLost: () => void;
  mau: ReturnType<typeof docMauLotus3D>;
}) {
  MAU3D = mau;
  return (
    <Canvas dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}
      frameloop="demand">
      <WebGLContextGuard onLost={onLost} />
      <Canh o3d={o3d} chon={chon} giamChuyenDong={giamChuyenDong} onHover={onHover} />
    </Canvas>
  );
}

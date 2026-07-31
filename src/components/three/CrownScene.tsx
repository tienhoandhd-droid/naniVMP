/* =====================================================================
 *  components/three/CrownScene.tsx — Vương miện thẩm định (WebGL)
 *  ---------------------------------------------------------------------
 *  Đây KHÔNG phải đồ trang trí. Bốn viên ngọc trên vành là bốn giai đoạn
 *  của một hạng mục — Đề cương → Thẩm định thực tế → Báo cáo → Đích VMP —
 *  và lõi sáng bên trong mỗi viên cao đúng bằng tỉ lệ hoàn thành thật của
 *  giai đoạn đó. Nhìn cái vương miện là biết khâu nào đang hụt: viên nào
 *  tối, khâu đó chậm.
 *
 *  Vì sao dựng bằng code chứ không phải nhập mô hình dựng sẵn: không có
 *  tệp lạ, không tải gì từ CDN (đúng luật của app này), và hình khối đổi
 *  được theo dữ liệu — thứ mà mô hình tĩnh không làm được.
 *
 *  Nạp qua React.lazy, KHÔNG nằm trong bundle chính. Chữ và số vẫn nằm ở
 *  lớp HTML bên trên, không vẽ vào WebGL: chữ trong canvas thì nhoè, bôi
 *  đen không được, trình đọc màn hình không thấy — với màn hình mà người ta
 *  đọc để biết hạn thẩm định thì không đánh đổi được.
 * ===================================================================== */
import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, ContactShadows, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";

export interface GemStat {
  /** Nhãn giai đoạn — chỉ dùng cho thẻ trợ năng ở lớp HTML. */
  label: string;
  /** Tỉ lệ hoàn thành 0..100. */
  rate: number;
  /** Màu giai đoạn, đồng bộ với STAGE_COLOR của app. */
  color: string;
}

/** Đọc biến CSS ra hex để cảnh 3D đi theo chủ đề sáng/tối của app. */
function bienCss(ten: string, duPhong: string): string {
  if (typeof window === "undefined") return duPhong;
  const v = getComputedStyle(document.documentElement).getPropertyValue(ten).trim();
  return v || duPhong;
}

/* ---------- Vành vương miện ---------- */
function Vanh({ mauVang }: { mauVang: string }) {
  return (
    <group>
      {/* torusGeometry mặc định nằm trong mặt phẳng XY — tức là dựng đứng như
          cái vòng đeo tay cầm thẳng trước mặt. Vành vương miện phải NẰM NGANG,
          nên xoay -90° quanh trục X. Thiếu đúng dòng này là ra hình chữ W. */}
      <mesh castShadow receiveShadow position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.05, 0.085, 24, 96]} />
        <meshPhysicalMaterial color={mauVang} metalness={0.95} roughness={0.22} />
      </mesh>
      {/* Gờ dưới, mảnh hơn — hai tầng ánh sáng thay vì một khối bẹt */}
      <mesh castShadow position={[0, -0.72, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.02, 0.042, 20, 96]} />
        <meshPhysicalMaterial color={mauVang} metalness={0.95} roughness={0.32} />
      </mesh>
      {/* Thân vương miện: hình nón cụt hở, nối hai gờ lại thành một khối liền,
          không còn là hai cái vòng trôi rời nhau. */}
      <mesh castShadow receiveShadow position={[0, -0.61, 0]}>
        <cylinderGeometry args={[1.05, 1.02, 0.24, 96, 1, true]} />
        <meshPhysicalMaterial color={mauVang} metalness={0.9} roughness={0.35}
          side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ---------- Năm chóp nhọn ---------- */
function Chop({ mauVang }: { mauVang: string }) {
  // Tám chóp xen kẽ cao–thấp. Bốn chóp CAO là chỗ đặt bốn viên ngọc (xem
  // component Ngoc): ngọc nằm trên đỉnh chóp thì không bao giờ bị lòng vành
  // che, còn đặt áp vào thân vành thì góc xoay nào cũng có lúc khuất.
  const chops = useMemo(() => {
    const n = 8;
    return Array.from({ length: n }, (_, i) => ({
      g: (i / n) * Math.PI * 2,
      cao: i % 2 === 0 ? 0.66 : 0.3,
      to: i % 2 === 0,
    }));
  }, []);
  const r = 1.03;
  return (
    <group>
      {chops.map(({ g, cao, to }, i) => (
        <mesh key={i} castShadow
          position={[Math.sin(g) * r, -0.38 + cao / 2, Math.cos(g) * r]}
          rotation={[0, g, 0]}>
          <coneGeometry args={[to ? 0.13 : 0.1, cao, 4]} />
          <meshPhysicalMaterial color={mauVang} metalness={0.85} roughness={0.24} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- Một viên ngọc = một giai đoạn ---------- */
function Ngoc({ stat, goc, giam }: { stat: GemStat; goc: number; giam: boolean }) {
  const loi = useRef<THREE.Mesh>(null);
  const r = 1.03;                       // trùng bán kính chóp — ngọc đậu đúng đỉnh
  const ty = Math.max(0, Math.min(1, stat.rate / 100));

  useFrame(({ clock }) => {
    if (!loi.current || giam) return;
    // Lõi thở rất chậm. Biên độ nhỏ để không thành đèn nháy — đây là bảng
    // theo dõi, không phải cây thông Noel.
    const t = clock.getElapsedTime();
    const n = 1 + Math.sin(t * 0.9 + goc * 2) * 0.035;
    loi.current.scale.set(n, n, n);
  });

  return (
    <group position={[Math.sin(goc) * r, 0.32, Math.cos(goc) * r]}>
      {/* Vỏ ngọc trong suốt */}
      <mesh castShadow>
        <octahedronGeometry args={[0.17, 0]} />
        <meshPhysicalMaterial
          color={stat.color} transmission={0.82} thickness={0.6} roughness={0.06}
          ior={1.7} metalness={0} transparent opacity={0.92}
          clearcoat={1} clearcoatRoughness={0.05}
        />
      </mesh>
      {/* Lõi phát sáng — CAO ĐÚNG BẰNG TỈ LỆ HOÀN THÀNH.
          Giai đoạn 0% thì lõi biến mất hẳn, không còn gì để nhìn nhầm. */}
      {ty > 0.02 && (
        <mesh ref={loi} scale={[1, 1, 1]}>
          <octahedronGeometry args={[0.155 * ty, 0]} />
          <meshBasicMaterial color={stat.color} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function Canh({ gems, giam, mauVang }: { gems: GemStat[]; giam: boolean; mauVang: string }) {
  const nhom = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (nhom.current && !giam) nhom.current.rotation.y += dt * 0.18;
  });

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 4]} intensity={1.5} castShadow
        shadow-mapSize={[1024, 1024]} />
      {/* Đèn viền phía sau: tách vương miện khỏi nền, thứ khiến khối kim loại
          trông có chất liệu thay vì phẳng lì. */}
      <directionalLight position={[-5, 2, -4]} intensity={0.9} color="#ffd9ec" />
      <pointLight position={[0, -1.5, 2]} intensity={0.5} color="#ffffff" />

      {/* Kim loại KHÔNG có gì để phản chiếu thì render ra gần như đen — bản
          đầu vàng bị xỉn như đồng là vì thiếu đúng thứ này. Dựng phòng chụp
          bằng Lightformer ngay tại chỗ, KHÔNG dùng preset của drei vì preset
          tải tệp HDR từ CDN, mà app này không được phép gọi ra ngoài. */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.6} color="#fff6e2"
          position={[0, 3, 2]} scale={[6, 3, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.4} color="#ffd7e8"
          position={[-4, 1, -2]} scale={[4, 4, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={1.8} color="#ffffff"
          position={[3, 2, 3]} scale={2.5} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.8} color="#c9b6ff"
          position={[0, -3, 1]} scale={[5, 2, 1]} target={[0, 0, 0]} />
      </Environment>

      <Float speed={giam ? 0 : 1.1} rotationIntensity={giam ? 0 : 0.12} floatIntensity={giam ? 0 : 0.35}>
        <group ref={nhom} position={[0, 0.42, 0]}>
          <Vanh mauVang={mauVang} />
          <Chop mauVang={mauVang} />
          {/* Góc phải TRÙNG góc bốn chóp cao (0, ¼, ½, ¾ vòng), nếu lệch nửa
              bước thì ngọc rơi vào giữa hai chóp và treo lơ lửng. */}
          {gems.map((g, i) => (
            <Ngoc key={g.label} stat={g} goc={(i / gems.length) * Math.PI * 2} giam={giam} />
          ))}
        </group>
      </Float>

      <ContactShadows position={[0, -0.85, 0]} opacity={0.28} scale={5} blur={2.8} far={2.5} />
    </>
  );
}

export default function CrownScene({ gems, giamChuyenDong }: {
  gems: GemStat[];
  giamChuyenDong: boolean;
}) {
  const mauVang = bienCss("--c-gold", "#EDB033");
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      // Nhìn hơi chếch từ trên xuống (~14°): thấy được cả mặt trước lẫn lòng
      // vành, góc mà đồ kim hoàn hay được chụp. Nhìn ngang thì vành thành một
      // vạch, nhìn thẳng từ trên thì mất hết chóp.
      camera={{ position: [0, 1.15, 3.5], fov: 40 }}
      // Dừng vẽ khi tab ẩn hoặc cảnh đứng yên — máy văn phòng ở xưởng
      // không có card rời, không được để một cái vương miện ăn hết CPU.
      frameloop={giamChuyenDong ? "demand" : "always"}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ pointerEvents: "none" }}
    >
      <Canh gems={gems} giam={giamChuyenDong} mauVang={mauVang} />
    </Canvas>
  );
}

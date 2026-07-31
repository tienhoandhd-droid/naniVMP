/* =====================================================================
 *  components/three/WorkloadSpace3D.tsx — Địa hình tải việc theo thời gian
 *  ---------------------------------------------------------------------
 *      trục sâu   Z : thời gian — 12 tháng theo mốc đích VMP
 *      trục ngang X : bộ phận
 *      chiều cao  Y : số hạng mục đến hạn của bộ phận đó trong tháng đó
 *      màu          : phần CHƯA XONG so với tổng — cột càng đỏ càng dồn việc
 *
 *  Vì sao trang Timeline cần thêm khối này: bảng Gantt liệt kê 461 dòng,
 *  mỗi dòng một hạng mục. Nó trả lời rất tốt câu "hạng mục X đang ở đâu",
 *  nhưng KHÔNG trả lời được câu mà người xếp lịch hỏi mỗi tháng: "tháng nào
 *  bộ phận nào bị dồn việc". Muốn biết thì phải tự đếm 461 dòng bằng mắt.
 *
 *  Khối này là bản đồ địa hình của đúng câu đó: chỗ nào nhô cao là chỗ dồn,
 *  nhô cao mà đỏ là dồn và chưa làm.
 *
 *  Trực giao + xoay được, cùng lý do đã ghi ở VmpSpace3D.tsx.
 * ===================================================================== */
import { useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrthographicCamera, OrbitControls, Edges, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { DEPTS } from "../../constants/vmp.ts";
import { NhanTruc } from "./NhanTruc.tsx";
import type { MotNhan } from "./NhanTruc.tsx";
import type { Activity } from "../../types/domain.ts";

export interface OTai {
  thang: number;      // 1..12
  bp: number;         // chỉ số trong DEPTS
  tong: number;
  chuaXong: number;
}

export function dungTaiViec(acts: Activity[], nam: number): OTai[] {
  const o = new Map<string, OTai>();
  for (const a of acts) {
    if ((a.state || "active") !== "active") continue;
    const han = String((a._raw as Record<string, unknown> | undefined)?.dl_vmp || "");
    if (han.slice(0, 4) !== String(nam)) continue;
    const t = Number(han.slice(5, 7));
    if (!(t >= 1 && t <= 12)) continue;

    // Một hạng mục có thể thuộc NHIỀU bộ phận — đếm vào từng bộ phận, đúng
    // như bộ lọc bộ phận ở các trang khác. Cột vì thế là "khối lượng bộ
    // phận đó phải gánh", không phải "số hạng mục duy nhất".
    const ds = (a.depts && a.depts.length ? a.depts : [a.dept]).filter(Boolean) as string[];
    for (const d of ds) {
      const bp = DEPTS.findIndex((x) => x.id === d);
      if (bp < 0) continue;
      const k = `${t}|${bp}`;
      let c = o.get(k);
      if (!c) { c = { thang: t, bp, tong: 0, chuaXong: 0 }; o.set(k, c); }
      c.tong++;
      if (a.st !== "done") c.chuaXong++;
    }
  }
  return [...o.values()];
}

const BUOC_T = 0.44;
const BUOC_B = 0.62;
const CAO_MAX = 2.1;

/** Xanh khi làm gần xong, đỏ khi còn nguyên. Đây là thang LIÊN TỤC theo tỉ
 *  lệ chưa xong, nên dùng nội suy hai cực chứ không phải bảng màu rời. */
function mauTheoTonDong(tyLeChuaXong: number): THREE.Color {
  const xanh = new THREE.Color("#2A9E82");
  const do_ = new THREE.Color("#D6486D");
  return xanh.clone().lerp(do_, Math.max(0, Math.min(1, tyLeChuaXong)));
}

function Cot({ o, caoNhat, chon, onHover }: {
  o: OTai; caoNhat: number; chon: boolean; onHover: (o: OTai | null) => void;
}) {
  const m = useRef<THREE.Mesh>(null);
  const dich = (o.tong / Math.max(1, caoNhat)) * CAO_MAX;
  const hien = useRef(0);

  useFrame((_, dt) => {
    if (!m.current) return;
    hien.current += (dich - hien.current) * Math.min(1, dt * 4.5);
    const h = Math.max(0.004, hien.current);
    m.current.scale.y = h;
    m.current.position.y = h / 2;
  });

  const mau = useMemo(
    () => mauTheoTonDong(o.tong ? o.chuaXong / o.tong : 0),
    [o.tong, o.chuaXong],
  );

  return (
    <mesh ref={m}
      position={[(o.bp - (DEPTS.length - 1) / 2) * BUOC_B, 0, (o.thang - 6.5) * BUOC_T]}
      onPointerOver={(e) => { e.stopPropagation(); onHover(o); }}
      onPointerOut={() => onHover(null)}
      castShadow receiveShadow>
      <boxGeometry args={[0.4, 1, 0.3]} />
      <meshPhysicalMaterial color={mau} roughness={0.34} metalness={0.04}
        emissive={mau} emissiveIntensity={chon ? 0.5 : 0} />
      <Edges threshold={15} color="#ffffff" />
    </mesh>
  );
}

function Canh({ o3d, caoNhat, chon, onHover }: {
  o3d: OTai[]; caoNhat: number; chon: OTai | null;
  onHover: (o: OTai | null) => void;
}) {
  const rongX = DEPTS.length * BUOC_B;
  const sauZ = 12 * BUOC_T;

  /* Nhãn trục. Tháng chạy dọc mép trái, bộ phận chạy dọc mép trước, và mỗi
     trục có một nhãn tên đặt ở đầu — không có tên trục thì người xem vẫn
     phải đoán "dãy số 1..12 này là tháng hay là tuần". */
  const nhan: MotNhan[] = [
    ...Array.from({ length: 12 }, (_, i) => ({
      vt: [-rongX / 2 - 0.34, 0.02, (i + 1 - 6.5) * BUOC_T] as [number, number, number],
      chu: `T${i + 1}`,
    })),
    ...DEPTS.map((d, i) => ({
      vt: [(i - (DEPTS.length - 1) / 2) * BUOC_B, 0.02, sauZ / 2 + 0.3] as [number, number, number],
      chu: (d.id || "").toUpperCase(),
    })),
    // Tên trục đặt HẲN ngoài vùng cột, không thì camera chếch làm chữ rơi
    // vào giữa khối và trông như một cột bị dán nhãn sai.
    // Tên trục đặt ở ĐẦU GẦN (cạnh T12), không phải đầu xa: đầu xa bị góc
    // camera chiếu vào giữa rừng cột và trông như nhãn của một cột nào đó.
    { vt: [-rongX / 2 - 1.05, 0.02, sauZ / 2 + 0.2], chu: "↖ Tháng", dam: true },
    { vt: [rongX / 2 + 0.9, 0.02, sauZ / 2 + 0.62], chu: "Bộ phận →", dam: true },
    { vt: [-rongX / 2 - 0.75, CAO_MAX + 0.3, -sauZ / 2 - 0.2], chu: `↑ cao nhất ${caoNhat}`, dam: true },
  ];

  /* Ghi số thẳng lên NĂM đỉnh cao nhất. Đây là chỗ mắt nhìn vào đầu tiên và
     cũng là chỗ người xếp lịch cần con số; ghi số lên mọi cột thì thành bãi
     chữ và che mất chính hình khối. */
  const dinh = [...o3d].sort((a, b) => b.tong - a.tong).slice(0, 5);
  for (const o of dinh) {
    nhan.push({
      vt: [
        (o.bp - (DEPTS.length - 1) / 2) * BUOC_B,
        (o.tong / Math.max(1, caoNhat)) * CAO_MAX + 0.15,
        (o.thang - 6.5) * BUOC_T,
      ],
      chu: String(o.tong),
    });
  }

  return (
    <>
      <OrthographicCamera makeDefault position={[5, 4.2, 6] } zoom={98} />
      {/* Không tự xoay. Khối quay liên tục thì nhãn trục chạy theo và người
          xem phải đuổi theo chữ — chống lại đúng mục tiêu "nhìn là hiểu".
          Ai cần xem mặt khuất thì tự kéo. */}
      <OrbitControls makeDefault enablePan={false} enableZoom={false}
        minPolarAngle={0.25} maxPolarAngle={Math.PI / 2.35}
        autoRotate={false} target={[0, 0.6, 0]} />

      <ambientLight intensity={0.78} />
      <directionalLight position={[6, 9, 6]} intensity={1.15} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-6, 4, -5]} intensity={0.4} color="#ffe4f1" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]} receiveShadow>
        <planeGeometry args={[rongX + 0.5, sauZ + 0.5]} />
        <meshBasicMaterial color="#F7F1F8" />
      </mesh>
      <gridHelper args={[Math.max(rongX, sauZ) + 0.5, 12, "#E7DAEB", "#F1E8F3"]} position={[0, 0.001, 0]} />
      {/* Bóng tiếp xúc: chân cột dính xuống sàn. Thiếu nó thì cả rừng cột
          trông như đang lơ lửng, và độ cao mất mốc so sánh. */}
      <ContactShadows position={[0, 0.002, 0]} opacity={0.42}
        scale={Math.max(rongX, sauZ) + 1} blur={1.6} far={1.2} resolution={1024} />

      <NhanTruc nhan={nhan} />

      {o3d.map((o) => (
        <Cot key={`${o.thang}-${o.bp}`} o={o} caoNhat={caoNhat}
          chon={!!chon && chon.thang === o.thang && chon.bp === o.bp} onHover={onHover} />
      ))}
    </>
  );
}

export default function WorkloadSpace3D({ acts, nam, giamChuyenDong }: {
  acts: Activity[]; nam: number; giamChuyenDong: boolean;
}) {
  const o3d = useMemo(() => dungTaiViec(acts, nam), [acts, nam]);
  const caoNhat = useMemo(() => o3d.reduce((m, o) => Math.max(m, o.tong), 1), [o3d]);
  const [chon, setChon] = useState<OTai | null>(null);

  const dinh = useMemo(() => {
    let t: OTai | null = null;
    for (const o of o3d) if (!t || o.tong > t.tong) t = o;
    return t;
  }, [o3d]);

  /* CÂU KẾT LUẬN. Đây mới là thứ người xem cần: biểu đồ phải tự nói ra điều
     nó phát hiện, chứ không bày số ra rồi bắt người ta tự rút ra. Mọi con số
     trong câu đều tính từ chính dữ liệu đang vẽ — không có chỗ nào ước lượng. */
  const ketLuan = useMemo(() => {
    if (!o3d.length || !dinh) return "";
    const theoThang = new Map<number, number>();
    for (const o of o3d) theoThang.set(o.thang, (theoThang.get(o.thang) || 0) + o.tong);
    const tb = [...theoThang.values()].reduce((a, b) => a + b, 0) / Math.max(1, theoThang.size);
    const thangDinh = theoThang.get(dinh.thang) || 0;
    const lan = tb > 0 ? thangDinh / tb : 0;
    const bp = DEPTS[dinh.bp]?.name || DEPTS[dinh.bp]?.id;
    const tyChuaXong = dinh.tong ? Math.round((dinh.chuaXong / dinh.tong) * 100) : 0;

    const cau = [`Nặng nhất là ${bp} tháng ${dinh.thang}: ${dinh.tong} hạng mục đến hạn, ${dinh.chuaXong} chưa xong (${tyChuaXong}%).`];
    if (lan >= 1.3) {
      cau.push(`Cả tháng ${dinh.thang} gánh ${thangDinh} hạng mục — gấp ${lan.toFixed(1)} lần mức trung bình tháng (${Math.round(tb)}).`);
    }
    const trong = [...theoThang.entries()].filter(([, n]) => n === 0).map(([t]) => t);
    if (trong.length >= 2) cau.push(`Tháng ${trong.join(", ")} không có hạng mục nào — còn chỗ để giãn bớt.`);
    return cau.join(" ");
  }, [o3d, dinh]);

  return (
    <div className="vmp-space3d">
      {ketLuan && <p className="vmp-space3d-ketluan">{ketLuan}</p>}
      <div className="vmp-space3d-khung">
        <Canvas
          dpr={[1, 2]}
          // Bóng mềm (PCFSoft) thay bóng cứng: mép bóng nhoè dần theo khoảng
          // cách là tín hiệu chiều sâu mà mắt người đọc rất nhanh — cột nào
          // đứng trước, cột nào đứng sau, không cần xoay mới biết.
          shadows="soft"
          gl={{
            antialias: true, alpha: true,
            // ACES filmic: giữ được chi tiết ở vùng sáng thay vì cháy trắng.
            // Không có nó thì đỉnh cột màu đậm bệt thành một mảng.
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.05,
            outputColorSpace: THREE.SRGBColorSpace,
          }}
          frameloop={giamChuyenDong ? "demand" : "always"}>
          <Canh o3d={o3d} caoNhat={caoNhat} chon={chon} onHover={setChon} />
        </Canvas>
      </div>

      <div className="vmp-space3d-chu">
        <span><i style={{ background: "#2A9E82" }} />Gần xong hết</span>
        <span><i style={{ background: "#8B7B96" }} />Đang làm dở</span>
        <span><i style={{ background: "#D6486D" }} />Còn nguyên — dồn việc</span>
      </div>

      <div className="vmp-space3d-tip" role="status" aria-live="polite">
        {chon ? (
          <>
            <b>Tháng {chon.thang} · {DEPTS[chon.bp]?.name || DEPTS[chon.bp]?.id}</b>
            {" — "}<b>{chon.tong}</b> hạng mục đến hạn, còn <b>{chon.chuaXong}</b> chưa xong
          </>
        ) : o3d.length
          ? "Đưa chuột lên một cột để xem chi tiết · kéo để xoay nếu có cột bị khuất."
          : "Không có hạng mục nào có mốc đích VMP trong năm đang chọn."}
      </div>
    </div>
  );
}

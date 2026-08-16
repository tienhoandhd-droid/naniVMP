/* =====================================================================
 *  components/three/RiskSpace3D.tsx — Ma trận rủi ro QRM dựng khối
 *  ---------------------------------------------------------------------
 *      trục ngang X : Mức nghiêm trọng 1..9  (qrmSeverity)
 *      trục sâu   Z : Khả năng xảy ra 0..3   (qrmOccurrence)
 *      chiều cao  Y : SỐ HẠNG MỤC nằm ở ô đó
 *      màu        : mức RPN theo ngưỡng sẵn có (qrmLevel)
 *
 *  Vì sao chiều cao là SỐ LƯỢNG chứ không phải "khả năng phát hiện":
 *  ICH Q9 đầy đủ có ba trục — nghiêm trọng × khả năng xảy ra × khả năng
 *  phát hiện. Dữ liệu VMP hiện tại KHÔNG có trường khả năng phát hiện, và
 *  bịa ra một thang điểm rồi dán nhãn ICH Q9 lên là làm giả dữ liệu rủi ro
 *  GxP. Nên trục thứ ba ở đây là thứ đếm được thật: bao nhiêu hạng mục đang
 *  đứng ở ô rủi ro đó.
 *
 *  Nhờ vậy khối trả lời đúng câu mà bản 2D không trả lời được: ô đỏ kia có
 *  MỘT hạng mục hay có BỐN MƯƠI. Bản 2D tô cùng một sắc đỏ cho cả hai.
 *
 *  Vẫn trực giao và vẫn xoay được — xem chú thích ở VmpSpace3D.tsx.
 * ===================================================================== */
import { useRef, useState, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, OrbitControls } from "@react-three/drei";
import { KhungVua, bienPhuongVi } from "./KhungVua.tsx";
import { WebGLContextGuard } from "./WebGLContextGuard.tsx";
import * as THREE from "three";
import { qrmSeverity, qrmOccurrence, qrmLevel } from "../../utils/helpers.ts";
import { coWebGL, docMauLotus3D, dungMauLotus3D } from "../../lib/lotus3dColors.ts";
import { CauKetLuan } from "../ui/Primitives.tsx";
import BanDoNhiet from "../dashboard/BanDoNhiet.tsx";
import type { ONhiet } from "../dashboard/BanDoNhiet.tsx";
import { NhanTruc } from "./NhanTruc.tsx";
import type { MotNhan } from "./NhanTruc.tsx";
import type { Activity } from "../../types/domain.ts";

export interface ORui {
  ng: number;      // nghiêm trọng 1..9
  kn: number;      // khả năng xảy ra 0..3
  n: number;       // số hạng mục
  rpn: number;
  ma: string[];    // vài mã đầu, để chú thích khi rê chuột
}

/** Vị trí camera gốc — dùng chung cho khung nhìn và biên góc xoay. */
/* Ở khối này trục DÀI là X (mức nghiêm trọng 1..9), nên nghiêng ngược
   với hai khối kia: nhìn gần dọc trục Z để 9 mức trải ngang khung. */
const VI_TRI: [number, number, number] = [3.2, 4.2, 7.4];

/* Màu đọc từ token Lotus lúc nạp chunk (đợt 4 — hết hex "3D demo").
 * Đổi theme giữa phiên thì lần dựng scene sau mới ăn màu mới. */
let MAU3D = docMauLotus3D();
/* getter: đọc MAU3D hiện hành mỗi lần render — theme đổi là màu đổi. */
const MAU = {
  get cao() { return MAU3D.danger; },
  get tb() { return MAU3D.warning; },
  get thap() { return MAU3D.success; },
};

export function dungKhoiRuiRo(acts: Activity[]): ORui[] {
  const o = new Map<string, ORui>();
  for (const a of acts) {
    if ((a.state || "active") !== "active") continue;
    const ng = Math.max(1, Math.min(9, Math.round(qrmSeverity(a))));
    const kn = Math.max(0, Math.min(3, qrmOccurrence(a)));
    const k = `${ng}|${kn}`;
    let c = o.get(k);
    if (!c) { c = { ng, kn, n: 0, rpn: ng * kn, ma: [] }; o.set(k, c); }
    c.n++;
    if (c.ma.length < 3) c.ma.push(String(a.code || a.id));
  }
  return [...o.values()];
}

const TEN_KN = ["Đã xong — hết rủi ro", "Mới lên kế hoạch", "Đang làm", "Quá hạn"];

const BUOC_X = 0.5;
const BUOC_Z = 0.72;
const CAO_MAX = 2.2;

function Cot({ o, caoNhat, chon, giamChuyenDong, onHover }: {
  o: ORui; caoNhat: number; chon: boolean; giamChuyenDong: boolean;
  onHover: (o: ORui | null) => void;
}) {
  const m = useRef<THREE.Mesh>(null);
  const dich = (o.n / Math.max(1, caoNhat)) * CAO_MAX;
  const hien = useRef(0);

  /* frameloop="demand": hoạt ảnh tự xin frame tới khi chạm đích rồi ngừng. */
  const invalidate = useThree((state) => state.invalidate);
  useFrame((_, dt) => {
    if (!m.current) return;
    if (giamChuyenDong) hien.current = dich;   // giảm chuyển động: hiện thẳng
    else hien.current += (dich - hien.current) * Math.min(1, dt * 4.5);
    const h = Math.max(0.004, hien.current);
    m.current.scale.y = h;
    m.current.position.y = h / 2;
    if (!giamChuyenDong && Math.abs(dich - hien.current) > 0.003) invalidate();
  });

  const mau = MAU[qrmLevel(o.rpn)];
  return (
    <mesh ref={m}
      position={[(o.ng - 5) * BUOC_X, 0, (o.kn - 1.5) * BUOC_Z]}
      onPointerOver={(e) => { e.stopPropagation(); onHover(o); }}
      onPointerOut={() => onHover(null)}>
      <boxGeometry args={[0.36, 1, 0.5]} />
      {/* meshStandard mờ + không viền trắng từng cột (nghiên cứu 5):
          analytics không phải đồ chơi bóng. Chọn = nhấn emissive nhẹ. */}
      <meshStandardMaterial color={mau} roughness={0.72} metalness={0}
        emissive={chon ? MAU3D.rose : "#000000"} emissiveIntensity={chon ? 0.12 : 0} />
    </mesh>
  );
}

function Canh({ o3d, caoNhat, chon, giamChuyenDong, onHover }: {
  giamChuyenDong: boolean;
  o3d: ORui[]; caoNhat: number; chon: ORui | null;
  onHover: (o: ORui | null) => void;
}) {
  const rongX = 9 * BUOC_X;
  const sauZ = 4 * BUOC_Z;

  /* Thang nghiêm trọng 1..9: chỉ các mốc lẻ đứng đậm cho đỡ rợp, mốc đang
     trỏ tới sáng lên. Tên trục bỏ mũi tên vì khối xoay được. */
  const nhan: MotNhan[] = [
    ...Array.from({ length: 9 }, (_, i) => ({
      vt: [(i + 1 - 5) * BUOC_X, 0.02, sauZ / 2 + 0.34] as [number, number, number],
      chu: String(i + 1),
      cap: ((i + 1) % 2 === 1 ? "chinh" : "phu") as "chinh" | "phu",
      sang: chon?.ng === i + 1,
    })),
    ...TEN_KN.map((t, i) => ({
      vt: [-rongX / 2 - 0.52, 0.02, (i - 1.5) * BUOC_Z] as [number, number, number],
      chu: t.split(" —")[0],
      cap: "chinh" as const,
      sang: chon?.kn === i,
    })),
    // Tên trục bỏ khỏi cảnh — xem lý do ở WorkloadSpace3D.tsx.
  ];

  return (
    <>
      <OrthographicCamera makeDefault position={VI_TRI} />
      <KhungVua le={1.02}
        hop={{ rong: rongX / 2 + 0.4, cao: CAO_MAX / 2 + 0.24, sau: sauZ / 2 + 0.72,
               tam: [0, CAO_MAX / 2, 0] }} />
      {/* Không tự xoay, và chặn góc quanh hướng gốc — xem WorkloadSpace3D.tsx. */}
      <OrbitControls makeDefault enablePan={false} enableZoom={false}
        minPolarAngle={0.34} maxPolarAngle={Math.PI / 2.5}
        {...bienPhuongVi(VI_TRI, 0.55)}
        autoRotate={false} target={[0, CAO_MAX / 2, 0]} />

      <ambientLight intensity={0.78} />
      <directionalLight position={[6, 9, 6]} intensity={1.15} />
      <directionalLight position={[-6, 4, -5]} intensity={0.22} color="#f2edf2" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]}>
        <planeGeometry args={[rongX + 0.6, sauZ + 0.5]} />
        <meshBasicMaterial color={MAU3D.canvas} />
      </mesh>
      <gridHelper args={[Math.max(rongX, sauZ) + 0.6, 12, MAU3D.gridMajor, MAU3D.gridMinor]} position={[0, 0.001, 0]} />

      <NhanTruc nhan={nhan} tam={[0, CAO_MAX / 2, 0]} />

      {o3d.map((o) => (
        <Cot key={`${o.ng}-${o.kn}`} o={o} caoNhat={caoNhat} giamChuyenDong={giamChuyenDong}
          chon={!!chon && chon.ng === o.ng && chon.kn === o.kn} onHover={onHover} />
      ))}
    </>
  );
}

export default function RiskSpace3D({ acts, giamChuyenDong }: {
  acts: Activity[]; giamChuyenDong: boolean;
}) {
  const o3d = useMemo(() => dungKhoiRuiRo(acts), [acts]);
  const caoNhat = useMemo(() => o3d.reduce((m, o) => Math.max(m, o.n), 1), [o3d]);
  const [chon, setChon] = useState<ORui | null>(null);
  /* Đổi 3D ↔ 2D — xem lý do ở WorkloadSpace3D.tsx. Ở khối này bản 2D còn
     có một lợi thế riêng: ma trận rủi ro là thứ hay phải dán vào hồ sơ
     thẩm định, mà WebGL thì không in được. */
  /* 2D mặc định (nghiên cứu (3) P0) — 3D là khám phá tự chọn. */
  const [kieu, setKieu] = useState<"3d" | "2d">("2d");
  /* Không có WebGL2: giấu hẳn cửa 3D, nói bằng tiếng Việt tử tế. */
  const ho3D = useMemo(coWebGL, []);
  MAU3D = dungMauLotus3D();
  const oNhiet: ONhiet[] = useMemo(() => o3d.map((x) => ({
    hang: x.kn, cot: x.ng - 1, gt: x.n,
    ghiChu: `Nghiêm trọng ${x.ng} · ${TEN_KN[x.kn]}: ${x.n} hạng mục · RPN ${x.rpn}`,
  })), [o3d]);

  /* CÂU KẾT LUẬN. Ma trận rủi ro chỉ có giá trị khi nó chỉ ra được KHỐI
     hạng mục đang đứng ở ô nguy hiểm nhất — chứ không phải bày ra một
     rừng ô có màu rồi để người xem tự nhặt. */
  const ketLuan = useMemo(() => {
    if (!o3d.length) return null;
    const tong = o3d.reduce((s, o) => s + o.n, 0);
    const cao = o3d.filter((o) => qrmLevel(o.rpn) === "cao");
    const nCao = cao.reduce((s, o) => s + o.n, 0);
    const oNang = [...o3d].sort((a, b) => b.rpn - a.rpn || b.n - a.n)[0];

    return {
      chinh: nCao > 0
        ? `${nCao} hạng mục (${Math.round((nCao / tong) * 100)}% tổng) đang nằm ở vùng RPN cao — `
          + `dồn nhất là ô nghiêm trọng ${oNang.ng} × ${TEN_KN[oNang.kn].toLowerCase()}, ${oNang.n} hạng mục.`
        : `Không hạng mục nào rơi vào vùng RPN cao; ô nặng nhất là RPN ${oNang.rpn} với ${oNang.n} hạng mục.`,
      phu: nCao > 0
        ? "Annex 15 đòi xử vùng này trước — chiều cao cột cho biết gỡ một ô là gỡ được bao nhiêu hạng mục."
        : "Thứ tự xử hiện tại phù hợp với mức rủi ro; giữ nhịp.",
      tone: (nCao >= tong * 0.15 ? "over" : nCao > 0 ? "warn" : "ok") as "over" | "warn" | "ok",
    };
  }, [o3d]);

  return (
    <div className="vmp-space3d">
      {ketLuan && <CauKetLuan chinh={ketLuan.chinh} phu={ketLuan.phu} tone={ketLuan.tone} />}
      {!ho3D && <p className="vmp-3d-khong-ho-tro" role="status">
        Thiết bị này không hỗ trợ chế độ 3D. Dữ liệu đầy đủ vẫn có ở cách hiển thị hai chiều.
      </p>}
      <div className="vmp-space3d-doi">
        {ho3D && <button type="button" data-map-mode="3d" onClick={() => setKieu("3d")}
          className={kieu === "3d" ? "is-chon" : ""}>Khám phá 3D</button>}
        <button type="button" data-map-mode="2d" onClick={() => setKieu("2d")}
          className={kieu === "2d" ? "is-chon" : ""}>Ma trận rủi ro</button>
      </div>

      {(!ho3D || kieu === "2d") ? (
        <BanDoNhiet
          tenHang="Khả năng xảy ra" tenCot="Mức nghiêm trọng"
          o={oNhiet}
          nhanHang={TEN_KN}
          nhanCot={Array.from({ length: 9 }, (_, i) => String(i + 1))}
          donVi="hạng mục"
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
            <WebGLContextGuard onLost={() => setKieu("2d")} />
            <Canh o3d={o3d} caoNhat={caoNhat} chon={chon} giamChuyenDong={giamChuyenDong} onHover={setChon} />
          </Canvas>
        </div>

        <div className="vmp-space3d-canh">
        <div className="vmp-space3d-chu">
          <span><i style={{ background: MAU.cao }} />RPN ≥ 15 — cao</span>
          <span><i style={{ background: MAU.tb }} />RPN 7–14 — trung bình</span>
          <span><i style={{ background: MAU.thap }} />RPN &lt; 7 — thấp</span>
        </div>

        <div className={`vmp-space3d-tip ${chon ? "is-tro" : ""}`} role="status" aria-live="polite">
          {chon ? (
            <>
              <b>Nghiêm trọng {chon.ng} · {TEN_KN[chon.kn]}</b>
              {" — "}RPN {chon.rpn} · <b>{chon.n}</b> hạng mục
              {chon.ma.length ? ` (${chon.ma.join(", ")}${chon.n > chon.ma.length ? "…" : ""})` : ""}
            </>
          ) : "Kéo để xoay · trục ngang là mức nghiêm trọng 1–9, trục sâu là khả năng xảy ra, chiều cao là SỐ HẠNG MỤC ở ô đó. Dữ liệu chưa có trường khả năng phát hiện nên không dựng trục thứ ba của ICH Q9."}
        </div>
        </div>
      </div>
      )}
    </div>
  );
}

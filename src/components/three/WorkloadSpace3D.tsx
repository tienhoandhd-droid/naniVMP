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
import { KhungVua, bienPhuongVi } from "./KhungVua.tsx";
import * as THREE from "three";
import { DEPTS } from "../../constants/vmp.ts";
import { CauKetLuan } from "../ui/Primitives.tsx";
import BanDoNhiet from "../dashboard/BanDoNhiet.tsx";
import type { ONhiet } from "../dashboard/BanDoNhiet.tsx";
import { NhanTruc } from "./NhanTruc.tsx";
import type { MotNhan } from "./NhanTruc.tsx";
import type { Activity } from "../../types/domain.ts";
import { buildWorkloadMap, workloadCellColor } from "../../lib/workloadMap.ts";
import type { WorkloadCell } from "../../lib/workloadMap.ts";

/** Vị trí camera gốc — dùng chung cho khung nhìn và biên góc xoay. */
/* Hướng nhìn chếch HẲN về phía trục tháng. Bản trước đặt [5, 4.2, 6] —
   phương vị ~40°, tức nhìn chéo góc: cả 12 tháng lẫn 6 bộ phận đều chiếu
   xuống một dải chéo hẹp, nên 12 nhãn tháng chen nhau trong ~150px và
   hình thì gầy so với khung rộng 1116px (bỏ trắng hai bên ~40%).
   Kéo phương vị lên ~64°: trục 12 tháng trải NGANG gần hết bề rộng khung —
   hình lấp đầy khung, và khoảng cách giữa hai nhãn tháng tăng hơn gấp đôi. */
const VI_TRI: [number, number, number] = [7.6, 3.9, 3.3];

const BUOC_T = 0.44;
const BUOC_B = 0.62;
const CAO_MAX = 2.1;

function Cot({ o, caoNhat, chon, onHover }: {
  o: WorkloadCell; caoNhat: number; chon: boolean; onHover: (o: WorkloadCell | null) => void;
}) {
  const m = useRef<THREE.Mesh>(null);
  const dich = (o.total / Math.max(1, caoNhat)) * CAO_MAX;
  const hien = useRef(0);

  useFrame((_, dt) => {
    if (!m.current) return;
    hien.current += (dich - hien.current) * Math.min(1, dt * 4.5);
    const h = Math.max(0.004, hien.current);
    m.current.scale.y = h;
    m.current.position.y = h / 2;
  });

  const mau = useMemo(
    () => new THREE.Color(workloadCellColor(o.completionRate)),
    [o.completionRate],
  );

  return (
    <mesh ref={m}
      // (6.5 - thang) chứ không phải (thang - 6.5): với hướng camera hiện
      // tại, +Z chiếu về phía TRÁI màn hình. Để nguyên thì T12 nằm trái và
      // T1 nằm phải — thời gian chạy ngược, thứ mà mắt luôn đọc sai.
      position={[(o.departmentIndex - (DEPTS.length - 1) / 2) * BUOC_B, 0, (6.5 - o.month) * BUOC_T]}
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
  o3d: WorkloadCell[]; caoNhat: number; chon: WorkloadCell | null;
  onHover: (o: WorkloadCell | null) => void;
}) {
  const rongX = DEPTS.length * BUOC_B;
  const sauZ = 12 * BUOC_T;

  /* Nhãn trục. Tháng chạy dọc mép trái, bộ phận chạy dọc mép trước.
     Không nhồi cả 12 tháng cùng một mức: chỉ MỐC QUÝ (T1·T4·T7·T10) đứng
     đậm làm mốc định vị, các tháng còn lại nhỏ và mờ. Trỏ vào cột nào thì
     tháng và bộ phận của cột đó sáng lên — cần chính xác thì hỏi, không
     phải lúc nào cũng bày ra hết. */
  const nhan: MotNhan[] = [
    ...Array.from({ length: 12 }, (_, i) => {
      const thang = i + 1;
      const quy = thang % 3 === 1;              // T1 · T4 · T7 · T10
      const sang = chon?.month === thang;
      return {
        // Mép GẦN camera. Bản trước đặt ở mép -X, mà camera đứng phía +X —
        // nhãn rơi vào nửa xa, bị làm mờ theo độ sâu tới mức gần như biến
        // mất. Nhãn trục phải nằm ở phía người xem đang đứng.
        vt: [rongX / 2 + 0.4, 0.02, (6.5 - thang) * BUOC_T] as [number, number, number],
        chu: `T${thang}`,
        cap: (quy ? "chinh" : "phu") as "chinh" | "phu",
        sang,
      };
    }),
    ...DEPTS.map((d, i) => ({
      // Giãn 1.18 lần và đẩy xa mép thêm chút. Hướng camera mới trải trục
      // tháng ra rộng nhưng bù lại NÉN trục bộ phận, hai nhãn liền nhau chỉ
      // còn cách 29px. Giãn ra ngoài rìa cột là cách rẻ nhất để lấy lại
      // khoảng thở mà không phải đổi hướng nhìn.
      vt: [(i - (DEPTS.length - 1) / 2) * BUOC_B * 1.18, 0.02, sauZ / 2 + 0.5] as [number, number, number],
      chu: d.short || (d.id || "").toUpperCase(),
      cap: "chinh" as const,
      sang: chon?.departmentIndex === i,
    })),
    /* KHÔNG đặt tên trục trong cảnh nữa. Ba lý do, phát hiện khi chụp lại:
       tên trục nằm ngoài rìa nên đẩy khung nhìn rộng ra, làm chính hình bị
       thu nhỏ; nó chen vào dãy nhãn bộ phận ("BỘ PHẬN" đè lên "Kho"); và
       phụ đề của thẻ đã nói đủ ba trục rồi. Nhãn trong cảnh chỉ giữ thứ
       KHÔNG nói được bằng chữ ngoài hình: giá trị của từng vạch. */
  ];

  /* Ghi số thẳng lên NĂM đỉnh cao nhất. Đây là chỗ mắt nhìn vào đầu tiên và
     cũng là chỗ người xếp lịch cần con số; ghi số lên mọi cột thì thành bãi
     chữ và che mất chính hình khối. */
  const dinh = [...o3d].sort((a, b) => b.total - a.total).slice(0, 5);
  for (const o of dinh) {
    nhan.push({
      vt: [
        (o.departmentIndex - (DEPTS.length - 1) / 2) * BUOC_B,
        (o.total / Math.max(1, caoNhat)) * CAO_MAX + 0.17,
        (6.5 - o.month) * BUOC_T,
      ],
      chu: String(o.total),
      cap: "so",
      sang: chon?.month === o.month && chon?.departmentIndex === o.departmentIndex,
    });
  }
  // Cột đang trỏ tới luôn được ghi số, kể cả khi không nằm trong tốp năm.
  if (chon && !dinh.some((d) => d.month === chon.month && d.departmentIndex === chon.departmentIndex)) {
    nhan.push({
      vt: [
        (chon.departmentIndex - (DEPTS.length - 1) / 2) * BUOC_B,
        (chon.total / Math.max(1, caoNhat)) * CAO_MAX + 0.17,
        (6.5 - chon.month) * BUOC_T,
      ],
      chu: String(chon.total),
      cap: "so",
      sang: true,
    });
  }

  return (
    <>
      <OrthographicCamera makeDefault position={VI_TRI} />
      {/* Khung nhìn tính theo cỡ khung thật, không đặt zoom cứng — xem lý do
          ở KhungVua.tsx. */}
      <KhungVua le={1.02}
        hop={{ rong: rongX / 2 + 0.5, cao: CAO_MAX / 2 + 0.24, sau: sauZ / 2 + 0.42,
               tam: [0, CAO_MAX / 2, 0] }} />
      {/* Không tự xoay, và CHẶN góc xoay quanh hướng gốc. Xoay là để liếc
          mặt bị cột khác che, không phải để lạc mất biểu đồ: thả tự do 360°
          thì chỉ một cú kéo là nửa hình ra khỏi khung và trục lộn ngược. */}
      <OrbitControls makeDefault enablePan={false} enableZoom={false}
        minPolarAngle={0.34} maxPolarAngle={Math.PI / 2.5}
        {...bienPhuongVi(VI_TRI, 0.55)}
        autoRotate={false} target={[0, CAO_MAX / 2, 0]} />

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

      <NhanTruc nhan={nhan} tam={[0, CAO_MAX / 2, 0]} />

      {o3d.map((o) => (
        <Cot key={`${o.month}-${o.departmentIndex}`} o={o} caoNhat={caoNhat}
          chon={!!chon && chon.month === o.month && chon.departmentIndex === o.departmentIndex} onHover={onHover} />
      ))}
    </>
  );
}

export default function WorkloadSpace3D({ acts, nam, giamChuyenDong }: {
  acts: Activity[]; nam: number; giamChuyenDong: boolean;
}) {
  const o3d = useMemo(() => buildWorkloadMap(acts, nam), [acts, nam]);
  const caoNhat = useMemo(() => o3d.reduce((m, o) => Math.max(m, o.total), 1), [o3d]);
  const [chon, setChon] = useState<WorkloadCell | null>(null);

  const dinh = useMemo(() => {
    let t: WorkloadCell | null = null;
    for (const o of o3d) if (!t || o.total > t.total) t = o;
    return t;
  }, [o3d]);

  /* CÂU KẾT LUẬN. Đây mới là thứ người xem cần: biểu đồ phải tự nói ra điều
     nó phát hiện, chứ không bày số ra rồi bắt người ta tự rút ra. Mọi con số
     trong câu đều tính từ chính dữ liệu đang vẽ — không có chỗ nào ước lượng. */
  const ketLuan = useMemo(() => {
    if (!o3d.length || !dinh) return null;
    const theoThang = new Map<number, number>();
    for (const o of o3d) theoThang.set(o.month, (theoThang.get(o.month) || 0) + o.total);
    const tb = [...theoThang.values()].reduce((a, b) => a + b, 0) / Math.max(1, theoThang.size);
    const thangDinh = theoThang.get(dinh.month) || 0;
    const lan = tb > 0 ? thangDinh / tb : 0;
    const bp = DEPTS[dinh.departmentIndex]?.name || DEPTS[dinh.departmentIndex]?.id;
    const chuaXong = dinh.total - dinh.completed;
    const tyChuaXong = dinh.total ? Math.round((chuaXong / dinh.total) * 100) : 0;

    const phu: string[] = [];
    if (lan >= 1.3) {
      phu.push(`Cả tháng ${dinh.month} gánh ${thangDinh} hạng mục — gấp ${lan.toFixed(1)} lần mức trung bình tháng (${Math.round(tb)}).`);
    }
    const trong = [...theoThang.entries()].filter(([, n]) => n === 0).map(([t]) => t);
    if (trong.length >= 2) phu.push(`Tháng ${trong.join(", ")} không có hạng mục nào — còn chỗ để giãn bớt.`);

    return {
      chinh: `Nặng nhất là ${bp} tháng ${dinh.month}: ${dinh.total} hạng mục đến hạn, ${chuaXong} chưa xong (${tyChuaXong}%).`,
      phu: phu.join(" "),
      tone: (lan >= 1.5 || tyChuaXong >= 80 ? "over" : lan >= 1.3 ? "warn" : "ok") as "over" | "warn" | "ok",
    };
  }, [o3d, dinh]);

  /* Tooltip bám con trỏ. Trước đây chi tiết cột chỉ hiện ở dòng chữ DƯỚI
     khung — muốn đọc phải rời mắt khỏi cột đang trỏ, mà rời mắt là mất
     luôn cột nào đang trỏ. Nay số hiện ngay cạnh con trỏ; dòng dưới vẫn
     giữ vì đó là bản mà trình đọc màn hình đọc được. */
  /* Nút chuyển 3D ↔ 2D. Giữ 3D làm mặc định vì nó trả lời "chỗ nào nhô cao"
     nhanh nhất, nhưng ai cần đọc số chính xác — hoặc cần IN RA GIẤY, thứ mà
     WebGL không làm được — thì có bản đồ nhiệt tương đương. Cùng một bộ số,
     không phải hai phép đếm khác nhau. */
  const [kieu, setKieu] = useState<"3d" | "2d">("3d");
  const oNhiet: ONhiet[] = useMemo(() => o3d.map((x) => ({
    hang: x.departmentIndex, cot: x.month - 1, gt: x.total, phu: x.total - x.completed,
    ghiChu: `${DEPTS[x.departmentIndex]?.name || DEPTS[x.departmentIndex]?.id} · Tháng ${x.month}: `
      + `${x.total} hạng mục đến hạn, ${x.total - x.completed} chưa xong`,
  })), [o3d]);

  return (
    <div className="vmp-space3d">
      {ketLuan && <CauKetLuan chinh={ketLuan.chinh} phu={ketLuan.phu} tone={ketLuan.tone} />}
      <div className="vmp-space3d-doi">
        <button type="button" onClick={() => setKieu("3d")}
          className={kieu === "3d" ? "is-chon" : ""}>Khối 3D</button>
        <button type="button" onClick={() => setKieu("2d")}
          className={kieu === "2d" ? "is-chon" : ""}>Bảng nhiệt 2D</button>
      </div>

      {kieu === "2d" ? (
        <BanDoNhiet
          tenHang="Bộ phận" tenCot="Tháng"
          o={oNhiet}
          nhanHang={DEPTS.map((d) => d.short || d.id)}
          nhanCot={Array.from({ length: 12 }, (_, i) => `T${i + 1}`)}
          donVi="hạng mục" phuLabel="chưa xong"
        />
      ) : (
      <div className="vmp-space3d-than">
        {/* KHÔNG có tooltip nổi bám con trỏ nữa. Nó che đúng thứ người ta
            đang trỏ vào: cột bị chính chú thích của nó phủ lên, muốn nhìn
            lại cột thì phải bỏ chuột ra, mà bỏ chuột ra thì mất chú thích.
            Chi tiết nay hiện ở dải bên phải — ngang tầm mắt với khung vẽ,
            không cách xa như hồi nó còn nằm dưới khung. */}
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

        <div className="vmp-space3d-canh">
        <div className="vmp-space3d-chu">
          <span><i style={{ background: "#2A9E82" }} />Gần xong hết</span>
          <span><i style={{ background: "#8B7B96" }} />Đang làm dở</span>
          <span><i style={{ background: "#D6486D" }} />Còn nguyên — dồn việc</span>
        </div>

        <div className={`vmp-space3d-tip ${chon ? "is-tro" : ""}`} role="status" aria-live="polite">
          {chon ? (
            <>
              <b>Tháng {chon.month} · {DEPTS[chon.departmentIndex]?.name || DEPTS[chon.departmentIndex]?.id}</b>
              {" — "}<b>{chon.total}</b> hạng mục đến hạn, còn <b>{chon.total - chon.completed}</b> chưa xong
            </>
          ) : o3d.length
            ? "Đưa chuột lên một cột để xem chi tiết · kéo để xoay nếu có cột bị khuất."
            : "Không có hạng mục nào có mốc đích VMP trong năm đang chọn."}
        </div>
        </div>
      </div>
      )}
    </div>
  );
}

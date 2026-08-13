import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Edges, OrthographicCamera, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { DEPTS } from "../../constants/vmp.ts";
import type { Activity } from "../../types/domain.ts";
import { buildWorkloadMap, workloadCellColor } from "../../lib/workloadMap.ts";
import type { WorkloadCell } from "../../lib/workloadMap.ts";
import BanDoNhiet from "../dashboard/BanDoNhiet.tsx";
import type { ONhiet } from "../dashboard/BanDoNhiet.tsx";
import { NhanTruc } from "./NhanTruc.tsx";
import type { MotNhan } from "./NhanTruc.tsx";
import { ThreeFallbackBoundary } from "./ThreeFallbackBoundary.tsx";
import { CauKetLuan } from "../ui/Primitives.tsx";

const DEFAULT_TARGET: [number, number, number] = [0, 0.9, 0];
const MONTH_STEP = 0.54;
const DEPARTMENT_STEP = 0.72;
const CAO_MAX = 2.1;
const RASPBERRY = "#C72D62";
const DEFAULT_ELEVATION_DEGREES = 35;
const CAMERA_AZIMUTH = Math.PI / 4;
const CAMERA_PADDING = .84;

const cellKey = (cell: WorkloadCell) => `${cell.month}-${cell.departmentId}`;
const deptName = (cell: WorkloadCell) => DEPTS[cell.departmentIndex]?.name || cell.departmentId;

/** Projected extents are shared by the camera and browser contract: the fitted
 * frustum must reserve room for 12 month columns, labels, caps and axis labels. */
export function workloadCameraFit(viewportWidth: number, viewportHeight: number) {
  const aspect = Math.max(1, viewportWidth) / Math.max(1, viewportHeight);
  const sceneWidth = 12 * MONTH_STEP + 1.35;
  const sceneDepth = DEPTS.length * DEPARTMENT_STEP + 1.25;
  const sceneHeight = CAO_MAX + .52;
  const elevation = THREE.MathUtils.degToRad(DEFAULT_ELEVATION_DEGREES);
  const projectedWidth = (sceneWidth + sceneDepth) * Math.sin(CAMERA_AZIMUTH);
  const projectedHeight = (sceneWidth + sceneDepth) * Math.sin(elevation) * Math.cos(CAMERA_AZIMUTH)
    + sceneHeight * Math.cos(elevation);
  const halfHeight = Math.max(projectedHeight / (2 * CAMERA_PADDING), projectedWidth / (2 * aspect * CAMERA_PADDING));
  const horizontalDistance = 8 * Math.SQRT2;
  const verticalDistance = horizontalDistance * Math.tan(elevation);
  const position: [number, number, number] = [8, DEFAULT_TARGET[1] + verticalDistance, 8];
  return {
    aspect, halfHeight, projectedWidth, projectedHeight,
    fillWidth: projectedWidth / (halfHeight * 2 * aspect),
    fillHeight: projectedHeight / (halfHeight * 2),
    elevationDegrees: DEFAULT_ELEVATION_DEGREES,
    defaultZoom: 1, minZoom: .78, maxZoom: 1.55,
    position,
  };
}

export function workloadActiveCell(selected: WorkloadCell | null, hover: WorkloadCell | null) {
  return hover || selected;
}

function Column({ cell, maxTotal, selected, selectionActive, giamChuyenDong, onHover, onSelect }: {
  cell: WorkloadCell;
  maxTotal: number;
  selected: boolean;
  selectionActive: boolean;
  giamChuyenDong: boolean;
  onHover: (cell: WorkloadCell | null) => void;
  onSelect: (cell: WorkloadCell) => void;
}) {
  const body = useRef<THREE.Mesh>(null);
  const cap = useRef<THREE.Mesh>(null);
  const targetHeight = cell.total / Math.max(1, maxTotal) * CAO_MAX;
  const capHeight = cell.total > 0
    ? cell.overdue / cell.total * Math.min(targetHeight * .34, .28)
    : 0;
  const shownHeight = useRef(giamChuyenDong ? targetHeight : 0.004);
  const shownCap = useRef(giamChuyenDong ? capHeight : 0.004);
  const opacity = selectionActive && !selected ? .3 : 1;

  useFrame((_, delta) => {
    if (!body.current || giamChuyenDong) return;
    shownHeight.current += (targetHeight - shownHeight.current) * Math.min(1, delta * 4.5);
    shownCap.current += (capHeight - shownCap.current) * Math.min(1, delta * 4.5);
    const height = Math.max(.004, shownHeight.current);
    const capScale = Math.max(.004, shownCap.current);
    body.current.scale.y = height;
    body.current.position.y = height / 2;
    if (cap.current) {
      cap.current.scale.y = capScale;
      cap.current.position.y = height + capScale / 2;
    }
  });

  const position: [number, number, number] = [(cell.month - 6.5) * MONTH_STEP, 0, (cell.departmentIndex - (DEPTS.length - 1) / 2) * DEPARTMENT_STEP];
  return (
    <group position={position}>
      <mesh ref={body}
        scale={[1, giamChuyenDong ? Math.max(.004, targetHeight) : .004, 1]}
        position={[0, giamChuyenDong ? targetHeight / 2 : .002, 0]}
        onPointerOver={(event) => { event.stopPropagation(); onHover(cell); }}
        onPointerOut={() => onHover(null)}
        onClick={(event) => { event.stopPropagation(); onSelect(cell); }}
        castShadow receiveShadow>
        <boxGeometry args={[.46, 1, .5]} />
        <meshPhysicalMaterial color={workloadCellColor(cell.completionRate)} transparent opacity={opacity}
          roughness={.34} metalness={.04} emissive={workloadCellColor(cell.completionRate)} emissiveIntensity={selected ? .45 : 0} />
        <Edges threshold={15} color="#ffffff" />
      </mesh>
      {cell.overdue > 0 && <mesh ref={cap}
        scale={[1, giamChuyenDong ? Math.max(.004, capHeight) : .004, 1]}
        position={[0, targetHeight + (giamChuyenDong ? capHeight : .004) / 2, 0]}
        onPointerOver={(event) => { event.stopPropagation(); onHover(cell); }}
        onPointerOut={() => onHover(null)}
        onClick={(event) => { event.stopPropagation(); onSelect(cell); }}>
        <boxGeometry args={[.5, 1, .54]} />
        <meshStandardMaterial color={RASPBERRY} transparent opacity={opacity} roughness={.3} />
      </mesh>}
    </group>
  );
}

function Scene({ cells, maxTotal, selected, hover, giamChuyenDong, onHover, onSelect, onResetReady }: {
  cells: WorkloadCell[];
  maxTotal: number;
  selected: WorkloadCell | null;
  hover: WorkloadCell | null;
  giamChuyenDong: boolean;
  onHover: (cell: WorkloadCell | null) => void;
  onSelect: (cell: WorkloadCell) => void;
  onResetReady: (reset: () => void) => void;
}) {
  const { gl, size } = useThree();
  const camera = useRef<THREE.OrthographicCamera>(null);
  const controls = useRef<any>(null);
  const fit = useMemo(() => workloadCameraFit(size.width, size.height), [size.height, size.width]);
  const active = workloadActiveCell(selected, hover);
  const width = 12 * MONTH_STEP;
  const depth = DEPTS.length * DEPARTMENT_STEP;

  const labels = useMemo(() => {
    const labels: MotNhan[] = [
      ...Array.from({ length: 12 }, (_, index) => ({
        vt: [(index + 1 - 6.5) * MONTH_STEP, .02, depth / 2 + .42] as [number, number, number],
        chu: `T${index + 1}`,
        cap: (index % 3 === 0 ? "chinh" : "phu") as "chinh" | "phu",
        sang: active?.month === index + 1,
      })),
      ...DEPTS.map((department, index) => ({
        vt: [-width / 2 - .48, .02, (index - (DEPTS.length - 1) / 2) * DEPARTMENT_STEP] as [number, number, number],
        chu: department.short || department.id.toUpperCase(),
        cap: "chinh" as const,
        sang: active?.departmentIndex === index,
      })),
    ];
    const meaningful = [
      ...[...cells].sort((a, b) => b.total - a.total).slice(0, 5),
      ...(selected ? [selected] : []),
      ...cells.filter((cell) => cell.total > 0 && cell.overdue / cell.total >= .5),
    ];
    const labelled = new Set<string>();
    for (const cell of meaningful) {
      if (labelled.has(cellKey(cell))) continue;
      labelled.add(cellKey(cell));
      labels.push({
        vt: [(cell.month - 6.5) * MONTH_STEP, cell.total / Math.max(1, maxTotal) * CAO_MAX + .18,
          (cell.departmentIndex - (DEPTS.length - 1) / 2) * DEPARTMENT_STEP] as [number, number, number],
        chu: String(cell.total), cap: "so", sang: !!active && cellKey(active) === cellKey(cell),
      });
    }
    return labels;
  }, [active, cells, depth, maxTotal, selected, width]);

  useEffect(() => {
    const reset = () => {
      camera.current?.position.set(...fit.position);
      if (camera.current) {
        camera.current.zoom = fit.defaultZoom;
        camera.current.updateProjectionMatrix();
      }
      controls.current?.target.set(...DEFAULT_TARGET);
      controls.current?.update();
    };
    onResetReady(reset);
    return () => onResetReady(() => {});
  }, [fit, onResetReady]);

  useEffect(() => {
    const host = document.getElementById("workload-map-3d");
    host?.setAttribute("data-workload-fit", JSON.stringify({
      fillWidth: fit.fillWidth, fillHeight: fit.fillHeight, elevationDegrees: fit.elevationDegrees,
    }));
  }, [fit, gl]);

  return <>
    <OrthographicCamera ref={camera} makeDefault position={fit.position}
      left={-fit.halfHeight * fit.aspect} right={fit.halfHeight * fit.aspect}
      top={fit.halfHeight} bottom={-fit.halfHeight} zoom={fit.defaultZoom} />
    <OrbitControls ref={controls} enablePan={false} enableZoom minZoom={fit.minZoom} maxZoom={fit.maxZoom}
      minPolarAngle={.55} maxPolarAngle={1.25}
      minAzimuthAngle={.35} maxAzimuthAngle={1.25} target={DEFAULT_TARGET} />
    <ambientLight intensity={.8} />
    <directionalLight position={[6, 9, 6]} intensity={1.15} castShadow />
    <directionalLight position={[-6, 4, -5]} intensity={.35} color="#ffe4f1" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.004, 0]} receiveShadow>
      <planeGeometry args={[width + 1.4, depth + 1.4]} /><meshBasicMaterial color="#F7F1F8" />
    </mesh>
    <gridHelper args={[Math.max(width, depth) + 1, 12, "#E7DAEB", "#F1E8F3"]} position={[0, .001, 0]} />
    <ContactShadows position={[0, .002, 0]} opacity={.42} scale={Math.max(width, depth) + 1} blur={1.6} far={1.2} resolution={1024} />
    <NhanTruc nhan={labels} tam={[0, CAO_MAX / 2, 0]} />
    {cells.map((cell) => <Column key={cellKey(cell)} cell={cell} maxTotal={maxTotal}
      selected={!!selected && cellKey(selected) === cellKey(cell)} selectionActive={!!selected}
      giamChuyenDong={giamChuyenDong} onHover={onHover} onSelect={onSelect} />)}
  </>;
}

export function WorkloadCellDetail({ cell, onOpenCell }: { cell: WorkloadCell | null; onOpenCell?: (cell: WorkloadCell) => void }) {
  if (!cell) return <div className="vmp-space3d-tip" role="status">Chọn hoặc đưa chuột lên một cột để xem chi tiết.</div>;
  return <div className="vmp-space3d-tip is-tro" role="status" aria-live="polite">
    <b>Tháng {cell.month} · {deptName(cell)}</b>
    <span> · Tổng {cell.total} · Hoàn thành {cell.completed} · Quá hạn {cell.overdue} · {Math.round(cell.completionRate * 100)}% hoàn thành</span>
    {onOpenCell && <button type="button" className="workload-map-open-list" onClick={() => onOpenCell(cell)}>Xem danh sách</button>}
  </div>;
}

export default function WorkloadSpace3D({ acts, nam, giamChuyenDong, onOpenCell }: {
  acts: Activity[];
  nam: number;
  giamChuyenDong: boolean;
  onOpenCell?: (cell: WorkloadCell) => void;
}) {
  const cells = useMemo(() => buildWorkloadMap(acts, nam), [acts, nam]);
  const maxTotal = useMemo(() => cells.reduce((max, cell) => Math.max(max, cell.total), 1), [cells]);
  const [hover, setHover] = useState<WorkloadCell | null>(null);
  const [selected, setSelected] = useState<WorkloadCell | null>(null);
  const [mode, setMode] = useState<"3d" | "2d">(() => (
    typeof window !== "undefined" && window.matchMedia?.("(max-width: 760px)").matches ? "2d" : "3d"
  ));
  const resetRef = useRef<() => void>(() => {});
  const onResetReady = useCallback((reset: () => void) => { resetRef.current = reset; }, []);
  const detail = workloadActiveCell(selected, hover);
  const heatCells: ONhiet[] = useMemo(() => cells.map((cell) => ({
    hang: cell.departmentIndex, cot: cell.month - 1, gt: cell.total, phu: cell.overdue,
    ghiChu: `${deptName(cell)} · Tháng ${cell.month}: ${cell.total} hạng mục, ${cell.completed} hoàn thành, ${cell.overdue} quá hạn`,
  })), [cells]);
  const conclusion = useMemo(() => {
    const peak = [...cells].sort((a, b) => b.total - a.total)[0];
    if (!peak) return null;
    const byMonth = new Map<number, number>();
    for (const cell of cells) byMonth.set(cell.month, (byMonth.get(cell.month) || 0) + cell.total);
    const average = [...byMonth.values()].reduce((sum, total) => sum + total, 0) / Math.max(1, byMonth.size);
    const monthTotal = byMonth.get(peak.month) || 0;
    const loadRatio = average ? monthTotal / average : 0;
    return {
      chinh: `Nặng nhất là ${deptName(peak)} tháng ${peak.month}: ${peak.total} hạng mục đến hạn, ${peak.total - peak.completed} chưa xong (${Math.round((1 - peak.completionRate) * 100)}%).`,
      phu: loadRatio >= 1.3 ? `Cả tháng ${peak.month} gánh ${monthTotal} hạng mục — gấp ${loadRatio.toFixed(1)} lần mức trung bình tháng.` : "",
      tone: (loadRatio >= 1.5 || peak.completionRate <= .2 ? "over" : loadRatio >= 1.3 ? "warn" : "ok") as "over" | "warn" | "ok",
    };
  }, [cells]);

  return <div className="vmp-space3d">
    {conclusion && <CauKetLuan chinh={conclusion.chinh} phu={conclusion.phu} tone={conclusion.tone} />}
    <div className="vmp-space3d-doi" aria-label="Chế độ bản đồ tải việc">
      <button type="button" data-map-mode="3d" onClick={() => setMode("3d")} className={mode === "3d" ? "is-chon" : ""}>Bản đồ 3D</button>
      <button type="button" data-map-mode="2d" onClick={() => setMode("2d")} className={mode === "2d" ? "is-chon" : ""}>Bảng nhiệt 2D</button>
    </div>
    {mode === "3d" ? <div className="vmp-space3d-than">
      <div id="workload-map-3d" className="vmp-space3d-khung" data-testid="workload-map-3d">
        <ThreeFallbackBoundary onUse2D={() => setMode("2d")}>
          <Canvas dpr={[1, 2]} shadows="soft" frameloop={giamChuyenDong ? "demand" : "always"}
            gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, outputColorSpace: THREE.SRGBColorSpace }}>
            <Scene cells={cells} maxTotal={maxTotal} selected={selected} hover={hover} giamChuyenDong={giamChuyenDong}
              onHover={setHover} onSelect={setSelected} onResetReady={onResetReady} />
          </Canvas>
        </ThreeFallbackBoundary>
      </div>
      <div className="vmp-space3d-canh">
        <button type="button" className="workload-map-reset" aria-label="Về góc chuẩn" onClick={() => resetRef.current()}>Về góc chuẩn</button>
        <div className="vmp-space3d-chu" data-testid="workload-map-legend">
          <span><i style={{ background: "#2A9E82" }} />Hoàn thành</span>
          <span><i style={{ background: RASPBERRY }} />Quá hạn</span>
        </div>
      </div>
    </div> : <BanDoNhiet tenHang="Bộ phận" tenCot="Tháng" o={heatCells}
      nhanHang={DEPTS.map((department) => department.short || department.id)}
      nhanCot={Array.from({ length: 12 }, (_, index) => `T${index + 1}`)} donVi="hạng mục" phuLabel="quá hạn"
      selected={selected ? { hang: selected.departmentIndex, cot: selected.month - 1 } : undefined}
      onSelect={(cell) => setSelected(cells.find((item) => item.departmentIndex === cell.hang && item.month === cell.cot + 1) || null)} />}
    <WorkloadCellDetail cell={detail} onOpenCell={onOpenCell} />
  </div>;
}

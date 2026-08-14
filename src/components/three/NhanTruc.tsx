/* =====================================================================
 *  components/three/NhanTruc.tsx — Nhãn trục cho các khối 3D
 *  ---------------------------------------------------------------------
 *  Dùng <Html> của drei chứ KHÔNG dùng <Text>: <Text> chạy trên
 *  troika-three-text và mặc định tải phông từ CDN — app này không được
 *  phép gọi ra ngoài. <Html> dựng thẻ DOM thật neo theo toạ độ 3D, nên
 *  chữ sắc nét ở mọi mức thu phóng, bôi-chép được, và trình đọc màn hình
 *  thấy được.
 *
 *  ĐÃ KIỂM: <Html> tự chiếu lại vị trí MỖI FRAME. Đo trực tiếp bằng
 *  puppeteer — kéo xoay khối rồi đọc lại toạ độ màn hình của cả 26 nhãn:
 *  26/26 đều dịch theo (T1 từ [858,613] sang [791,955]). Nhãn KHÔNG hề
 *  đứng yên. Vậy nên chuyện "nhãn không khớp cột" có nguyên nhân khác, và
 *  đây là ba nguyên nhân thật, đã sửa ở file này:
 *
 *  1. NHÃN MẶT XA VẼ ĐÈ LÊN CỘT GẦN. `occlude={false}` cho mọi nhãn nổi
 *     lên trên tất cả, nên một nhãn nằm ở rìa PHÍA SAU rừng cột lại hiện
 *     ngay trước mũi một cột phía trước — mắt gán nó cho cột đó. Nay nhãn
 *     ở nửa xa bị làm mờ và thu nhỏ theo độ sâu thật, nên nó lùi lại đúng
 *     lớp của mình.
 *  2. CHỮ QUÁ NHỎ. 10.5px, nhỏ hơn cả bảng số liệu ngay bên dưới (13px).
 *     Nay 12.5px cho nhãn trục, 13px cho tên trục, có nền chip đặc hơn.
 *  3. NHỒI ĐỦ 12 THÁNG. Nay chỉ mốc quý đứng đậm; các tháng còn lại nhỏ và
 *     mờ, sáng lên khi trỏ vào cột của tháng đó.
 * ===================================================================== */
import { useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** Cấp hiển thị — quyết định cỡ chữ và mức nổi, không quyết định màu. */
export type CapNhan = "truc" | "chinh" | "phu" | "so";

export interface MotNhan {
  /** Toạ độ trong cảnh. */
  vt: [number, number, number];
  chu: string;
  /** Nhãn nhấn mạnh (tên trục) hay nhãn thường (vạch chia). */
  dam?: boolean;
  /** Cấp hiển thị. Mặc định suy từ `dam` để code cũ không vỡ. */
  cap?: CapNhan;
  /** Đang được trỏ tới — kéo lên mức đậm nhất bất kể cấp. */
  sang?: boolean;
  /** Ưu tiên giữ nhãn số khi hình chiếu lên màn hình bị va chạm. */
  priority?: number;
}

const LOP: Record<CapNhan, string> = {
  truc: "vmp-nhan-truc vmp-nhan-truc-dam",
  chinh: "vmp-nhan-truc",
  phu: "vmp-nhan-truc vmp-nhan-truc-phu",
  so: "vmp-nhan-truc vmp-nhan-truc-so",
};

/** Một nhãn. Tự mờ dần khi nằm ở nửa xa của cảnh so với camera. */
function Nhan({ n, tam }: { n: MotNhan; tam: THREE.Vector3 }) {
  const o = useRef<HTMLSpanElement>(null);
  const vt = useRef(new THREE.Vector3(...n.vt));
  const huong = useRef(new THREE.Vector3());
  const lech = useRef(new THREE.Vector3());

  useFrame(({ camera }) => {
    const el = o.current;
    if (!el) return;
    // Nhãn nằm trước hay sau tâm cảnh, xét theo hướng nhìn của camera.
    // Tích vô hướng dương = nằm phía xa. Rẻ hơn raycast rất nhiều và không
    // giật như cách bật/tắt hẳn nhãn theo che khuất.
    camera.getWorldDirection(huong.current);
    lech.current.copy(vt.current).sub(tam);
    const sau = lech.current.dot(huong.current);
    // Chuẩn hoá theo bán kính cảnh, và mờ TỐI ĐA 45%. Bản trước mờ tới 72%
    // nên nhãn ở nửa xa gần như biến mất — mờ là để lùi lớp, không phải để
    // xoá. Chỉ cần đủ để mắt biết nhãn nào thuộc mặt trước.
    /* Mờ TỐI ĐA 30%, tức sàn 0.70. Đo bằng máy: ở mức mờ 0.55 thì tương
       phản chữ tụt xuống 1.3:1–2:1, dưới xa ngưỡng WCAG 4.5:1 — nhãn lùi
       lớp là đúng, nhưng lùi tới mức không đọc được thì thành lỗi. */
    const xa = THREE.MathUtils.clamp(sau / 3.2, 0, 1);
    const mo = n.sang ? 1 : 1 - xa * 0.3;
    el.style.opacity = String(mo);
    el.style.transform = `scale(${(n.sang ? 1.06 : 1) - xa * 0.1})`;
    // Nhãn ở xa lùi xuống dưới lớp nhãn gần, không tranh chỗ đọc.
    el.style.zIndex = String(Math.round((1 - xa) * 100));
  });

  const cap: CapNhan = n.cap ?? (n.dam ? "truc" : "chinh");
  return (
    <Html position={n.vt} center occlude={false} zIndexRange={[30, 0]}
      style={{ pointerEvents: "none", userSelect: "none" }}>
      <span ref={o} className={`${LOP[cap]}${n.sang ? " vmp-nhan-truc-sang" : ""}`}
        data-label-priority={cap === "so" ? n.priority || 0 : undefined}>
        {n.chu}
      </span>
    </Html>
  );
}

export function NhanTruc({ nhan, tam = [0, 0, 0], declutterSo = false }: {
  nhan: MotNhan[];
  /** Tâm cảnh — mốc để phân biệt nhãn mặt gần với nhãn mặt xa. */
  tam?: [number, number, number];
  /** Ẩn nhãn số ưu tiên thấp hơn khi hình chữ nhật DOM chồng nhau. */
  declutterSo?: boolean;
}) {
  const t = useRef(new THREE.Vector3(...tam));
  const collisionState = useRef({ pending: "", applied: "" });
  t.current.set(...tam);
  const numericLabels = nhan.filter((label) => label.cap === "so");
  const numericSignature = numericLabels
    .map((label) => `${label.chu}:${label.priority || 0}:${label.vt.join(",")}`)
    .join("|");
  useFrame(({ camera, size, invalidate }) => {
    if (!declutterSo) return;
    const matrixSignature = [...camera.projectionMatrix.elements, ...camera.matrixWorld.elements]
      .map((value) => value.toFixed(5)).join(",");
    const snapshot = `${size.width}x${size.height}|${numericSignature}|${matrixSignature}`;
    if (collisionState.current.applied === snapshot) return;
    // Wait one rendered frame after a camera/label change so drei <Html> has
    // committed its new screen transform before any layout geometry is read.
    if (collisionState.current.pending !== snapshot) {
      collisionState.current.pending = snapshot;
      invalidate();
      return;
    }
    const labels = [...document.querySelectorAll<HTMLElement>("#workload-map-3d .vmp-nhan-truc-so")]
      .map((element, order) => ({
        element,
        order,
        priority: Number(element.dataset.labelPriority || 0),
        rect: element.getBoundingClientRect(),
      }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0);
    if (labels.length !== numericLabels.length) {
      invalidate();
      return;
    }
    labels.sort((a, b) => b.priority - a.priority || a.order - b.order);
    const kept: DOMRect[] = [];
    for (const label of labels) {
      const collides = kept.some((rect) => !(label.rect.right + 2 <= rect.left
        || rect.right + 2 <= label.rect.left
        || label.rect.bottom + 2 <= rect.top
        || rect.bottom + 2 <= label.rect.top));
      label.element.style.visibility = collides ? "hidden" : "visible";
      if (!collides) kept.push(label.rect);
    }
    collisionState.current.applied = snapshot;
  });
  return (
    <>
      {nhan.map((n, i) => <Nhan key={`${n.chu}-${i}`} n={n} tam={t.current} />)}
    </>
  );
}

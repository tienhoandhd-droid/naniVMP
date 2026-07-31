/* =====================================================================
 *  components/three/NhanTruc.tsx — Nhãn trục cho các khối 3D
 *  ---------------------------------------------------------------------
 *  Ba khối 3D bản đầu KHÔNG có nhãn trục nào: muốn biết đang nhìn gì thì
 *  phải đọc câu mô tả bên dưới. Một biểu đồ bắt người xem đọc chú thích
 *  mới hiểu được trục là biểu đồ chưa xong.
 *
 *  Dùng <Html> của drei chứ KHÔNG dùng <Text>: <Text> chạy trên
 *  troika-three-text và mặc định tải phông từ CDN — app này không được
 *  phép gọi ra ngoài. <Html> dựng thẻ DOM thật neo theo toạ độ 3D, nên
 *  chữ sắc nét ở mọi mức thu phóng, bôi-chép được, và trình đọc màn hình
 *  thấy được.
 * ===================================================================== */
import { Html } from "@react-three/drei";

export interface MotNhan {
  /** Toạ độ trong cảnh. */
  vt: [number, number, number];
  chu: string;
  /** Nhãn nhấn mạnh (tên trục) hay nhãn thường (vạch chia). */
  dam?: boolean;
}

export function NhanTruc({ nhan }: { nhan: MotNhan[] }) {
  return (
    <>
      {nhan.map((n, i) => (
        <Html key={`${n.chu}-${i}`} position={n.vt} center
          // Không tính che khuất: nhãn trục luôn phải đọc được, kể cả khi
          // có cột đứng chắn trước nó.
          occlude={false}
          zIndexRange={[10, 0]}
          style={{ pointerEvents: "none", userSelect: "none" }}>
          <span className={n.dam ? "vmp-nhan-truc vmp-nhan-truc-dam" : "vmp-nhan-truc"}>
            {n.chu}
          </span>
        </Html>
      ))}
    </>
  );
}

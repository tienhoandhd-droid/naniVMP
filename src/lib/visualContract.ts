/* =====================================================================
 *  visualContract.ts — hằng số thị giác Lotus Pearl dùng chung
 *  ---------------------------------------------------------------------
 *  Ba track redesign (danh mục/tiến độ, giám sát/phân tích, quản trị/bằng
 *  chứng) đều đọc từ đây. Đây là NƠI DUY NHẤT giữ các con số này ở phía
 *  TypeScript; giá trị màu thật nằm ở src/styles/lotus-tokens.css.
 *
 *  Vì sao tách đôi: màu phải đổi được theo chế độ sáng/tối nên bắt buộc
 *  sống trong CSS variable. Còn bán kính, mã định danh và bảng màu biểu
 *  đồ thì WebGL/canvas cần dưới dạng số và chuỗi hex thật, không đọc
 *  được `var(...)`.
 * ===================================================================== */

/** Giá trị của thuộc tính `data-visual` trên thẻ <html>. */
export const LOTUS_VISUAL_ID = "lotus-pearl" as const;

/** Bán kính bo góc — spec §6.4. Bốn vai trò, không thêm bậc nào nữa. */
export const LOTUS_RADII = {
  /** Nút, ô nhập, chip nhỏ. */
  control: 10,
  /** Thẻ nội dung. */
  card: 18,
  /** Panel hero, hộp thoại. */
  panel: 24,
  /** Viên thuốc — chỉ cho filter và status hợp cảnh. */
  pill: 999,
} as const;

/** Bảng màu duy nhất cho biểu đồ và WebGL.
 *
 *  Ba màu, ba nghĩa cố định: raspberry = quá hạn/lỗi, jade = hoàn thành,
 *  plum = thương hiệu/trung tính. Biểu đồ nào cần nhiều hơn ba nhóm thì
 *  đổi độ đậm nhạt trong cùng một sắc, không bịa thêm màu mới — bịa thêm
 *  là phá luật màu ngữ nghĩa ở spec §5.3.
 */
export const LOTUS_CHART_COLORS = {
  raspberry: "#B64A63",
  plum: "#5E365D",
  jade: "#467866",
} as const;

export type LotusRadiusRole = keyof typeof LOTUS_RADII;
export type LotusChartColor = keyof typeof LOTUS_CHART_COLORS;

/* =====================================================================
 *  Vai trò dùng chung của bộ bề mặt
 * ===================================================================== */

/** Bậc nền: thường · nổi · chìm · thương hiệu. */
export type SurfaceTone = "default" | "raised" | "sunk" | "brand";

/** Sắc thái ngữ nghĩa. Mỗi sắc mang đúng một nghĩa, xem spec §5.3. */
export type SemanticTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

/** Mức ưu tiên của một ô số liệu trong lưới. */
export type MetricPriority = "hero" | "supporting";

/** Năm trạng thái mà mọi vùng dữ liệu phải xử lý — thiếu một trạng thái là
 *  lỗi hay gặp nhất: có dữ liệu thì đẹp, rỗng thì trắng trang. */
export type BoundaryState = "loading" | "empty" | "filtered-empty" | "error" | "forbidden";

/** Hành động mà người dùng nên được mời làm ở mỗi trạng thái. */
export type BoundaryAction = "none" | "retry" | "clear-filters";

/** Mặc định là ô phụ. Một lưới chỉ nên có một ô hero; để mặc định là hero
 *  thì mọi ô đều to bằng nhau và mắt không biết nhìn đâu trước. */
export function normalizeMetricPriority(priority?: MetricPriority | null): MetricPriority {
  return priority === "hero" ? "hero" : "supporting";
}

/** Chọn hành động theo trạng thái.
 *
 *  Phân biệt quan trọng: "rỗng vì bộ lọc" thì mời XOÁ BỘ LỌC, còn "rỗng
 *  thật" thì đừng mời gì cả — mời xoá bộ lọc trong khi không có bộ lọc nào
 *  chỉ khiến người dùng bấm rồi ngơ ngác vì không có gì đổi.
 */
export function stateBoundaryAction(state: BoundaryState | "network-error"): BoundaryAction {
  if (state === "filtered-empty") return "clear-filters";
  if (state === "error" || state === "network-error") return "retry";
  return "none";
}

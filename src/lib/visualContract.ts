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

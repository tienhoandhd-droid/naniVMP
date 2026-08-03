/* =====================================================================
 *  tailMan.ts — nạp màn lazy có thử lại và tự phục hồi sau khi deploy
 *  ---------------------------------------------------------------------
 *  Mỗi màn được tách thành một chunk riêng, tên có kèm mã băm nội dung:
 *  `PhanQuyenPage--5pFLJvF.js`. Mỗi lần build lại, mã băm đổi và file cũ
 *  BIẾN MẤT khỏi server.
 *
 *  Hệ quả: ai đang mở web lúc có bản deploy mới sẽ giữ trong tay một
 *  `index.html` cũ, trỏ tới những chunk không còn tồn tại. Bấm sang màn
 *  khác là `import()` trả 404, Suspense ném lỗi, ErrorBoundary bung ra màn
 *  "Ứng dụng gặp lỗi khi hiển thị". Người dùng tải lại thì thường hết —
 *  nên nó hiện ra đúng dạng khó chịu nhất: "thỉnh thoảng bị lỗi tải lại
 *  trang", không lần nào giống lần nào, không tài nào tái hiện theo ý.
 *
 *  KHÔNG có bước "thử import lại" ở đây, và đó là chủ ý — bản đầu của file
 *  này có, rồi đo mới biết nó vô nghĩa. Trình duyệt ghi cả THẤT BẠI vào
 *  module registry: `import()` lần hai cùng một URL trả về đúng promise đã
 *  reject lần đầu, không phát thêm một request nào. Đo bằng puppeteer
 *  (2026-08-03): chặn chunk rồi gọi lại hai lần → chỉ thấy MỘT lượt mạng.
 *  Giữ vòng thử lại chỉ tạo cảm giác an tâm giả, nên bỏ hẳn.
 *
 *  Cách xử lý ở đây:
 *    1. Import hỏng → tự tải lại trang MỘT lần để lấy `index.html` mới,
 *       tức đúng việc người dùng vẫn phải làm tay. Đây là cách duy nhất
 *       thoát được cache module nói trên.
 *    2. Tải lại rồi mà vẫn hỏng → ném lỗi cho ErrorBoundary. Không tự tải
 *       lại lần nữa: một vòng lặp tải lại vô tận còn tệ hơn hẳn một thông
 *       báo lỗi, vì nó không cho người dùng cả cơ hội đọc xem chuyện gì.
 *
 *  Cờ chống lặp nằm ở sessionStorage: mất khi đóng tab, nên không có
 *  chuyện tuần sau vẫn bị chặn phục hồi vì một lần hỏng từ lâu.
 * ===================================================================== */

const KHOA_DA_TAI_LAI = "vmp_da_tai_lai_vi_chunk";
/** Trong 60 giây mà hỏng lại thì coi như tải lại không cứu được. */
const HAN_CHONG_LAP_MS = 60_000;

function daVuaTaiLai(): boolean {
  try {
    const t = Number(sessionStorage.getItem(KHOA_DA_TAI_LAI) || 0);
    return Number.isFinite(t) && Date.now() - t < HAN_CHONG_LAP_MS;
  } catch { return false; }
}

function ghiNhanTaiLai(): void {
  try { sessionStorage.setItem(KHOA_DA_TAI_LAI, String(Date.now())); } catch { /* chặn storage thì thôi */ }
}

/**
 * Bọc một `() => import(...)` để dùng với React.lazy().
 * Chữ ký giữ nguyên nên chỗ gọi chỉ cần bọc thêm một lớp.
 */
export function nhapCoThuLai<T>(nhap: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      return await nhap();
    } catch (loi) {
      // Nhiều khả năng chunk cũ đã bị bản deploy mới xoá.
      if (!daVuaTaiLai()) {
        ghiNhanTaiLai();
        location.reload();
        /* Trả về một promise không bao giờ giải quyết: trang sắp bị thay,
           không được để React kịp dựng màn lỗi rồi loé lên một nhịp. */
        return new Promise<T>(() => { /* cố ý treo */ });
      }
      // Đã tải lại mà vẫn hỏng → để ErrorBoundary hiện thông báo thật.
      throw loi;
    }
  };
}

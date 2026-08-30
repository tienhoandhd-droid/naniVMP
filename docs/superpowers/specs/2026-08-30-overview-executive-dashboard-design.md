# Tổng quan VMP — Executive Botanical Dashboard

**Status:** Thiết kế hội thoại đã được người dùng duyệt; chờ duyệt bản viết cuối  
**Phạm vi:** Thanh lọc toàn cục bản đầy đủ và nội dung màn Tổng quan VMP. Không đổi công thức, population, URL state, quyền, RPC/database hoặc các màn khác.

## Mục tiêu

Tổng quan phải đọc được theo bốn tầng rõ ràng:

1. Chọn lát cắt dữ liệu.
2. Hiểu tiến độ năm trong vài giây.
3. Đọc báo cáo nhanh của Vali.
4. Khám phá báo cáo tổng hợp khi cần phân tích.

Loại bỏ nội dung lặp với `Việc hôm nay` và giảm công cụ phụ trên thanh lọc.

## 1. Thanh lọc toàn cục

### Hàng chính

- Badge `Toàn hệ thống`, select nhân sự khi có quyền và một nút chính `Bộ lọc (N)`.
- Bỏ hoàn toàn `Chép liên kết`.
- Bỏ hoàn toàn cụm kết quả dạng `shown / total hạng mục`, bao gồm `/ 448 hạng mục` và tooltip giải thích mẫu số khỏi thanh lọc.
- Giữ `role="group"` và `aria-label="Phạm vi toàn hệ thống"` để không phá contract truy cập hiện tại.

### Hàng trạng thái

- Chỉ xuất hiện khi có Bộ phận, Khu vực hoặc Ngày đang lọc.
- Chip gỡ đúng từng điều kiện; `Xóa tất cả` nằm cuối hàng.
- Nhân sự đã hiện trong select nên không lặp thành chip.

### Panel lọc

- Một panel chia ba `fieldset`: Khoảng thời gian, Bộ phận, Khu vực.
- Lọc áp dụng ngay; không thêm draft state hoặc nút Áp dụng giả.
- Trigger có `aria-expanded`/`aria-controls`; Escape đóng và trả focus; click ngoài đóng.
- Footer chỉ có nút `Xong`; không lặp số kết quả đã bị loại khỏi thanh.
- Mobile không tràn ngang và mọi control tối thiểu 44px.

### Giữ nguyên

- Props/setter, logic lọc, URL và population hiện hành.
- Quyền chọn nhân sự, `TodayScopeControl`, bản `rutGon` và `GlobalFilterBarLegacy`.

## 2. Tiến độ năm — Đồng hồ năm · Hào quang hoa sen

`VongNam` tiếp tục là hình chính của Tổng quan nhưng chuyển ngôn ngữ hình ảnh:

- Lõi dữ liệu là mặt đồng hồ 12 tháng, T1–T12 đặt theo chu vi.
- Cung tiến độ và các đoạn trạng thái giữ đúng màu semantic hiện hành: đã xong, tới hạn chưa xong, chưa tới hạn và hôm nay.
- Kim mảnh chỉ vị trí `Hôm nay`, giúp đọc ngay phần năm đã qua và thời gian còn lại.
- Tâm đồng hồ giữ tỷ lệ hoàn thành lớn và số hoàn thành/tổng kế hoạch.
- Một vòng cánh sen mờ nằm ngoài mặt đồng hồ chỉ làm hào quang trang trí; cánh sen không mã hóa số liệu, không tạo cách hiểu thứ hai.
- Narrative về nhịp tháng và bảng chú giải hiện hành được giữ nhưng rút gọn hierarchy để đồng hồ là điểm nhìn đầu tiên.
- Giữ `role="img"`, aria-label động và nút xem bảng số 12 tháng.
- Không dùng ảnh raster từ mockup trong production; dựng bằng SVG/CSS hiện hành để số liệu chính xác và responsive.

## 3. Báo cáo nhanh · Vali

Vali chỉ làm nhiệm vụ tổng hợp ngắn, không thay Báo cáo tổng hợp.

- `PrincessCommentary` dùng trực tiếp bộ WebP mới:
  - `vali-guide.webp`
  - `vali-concern.webp`
  - `vali-celebrate.webp`
- Bộ WebP này được dùng trong thẻ Báo cáo nhanh ở cả light/dark để đồng bộ hình ảnh; `ValiIllustration` và Dũng sĩ Vali ở các nơi khác không thay đổi.
- Thẻ thấp, bố cục ngang: ảnh Vali ở một bên, nội dung ở một bên.
- Nội dung tối đa:
  - tiêu đề `Báo cáo nhanh`;
  - một câu kết luận chính;
  - tối đa ba tín hiệu ngắn theo mức ưu tiên;
  - một lời khuyến nghị kết.
- Không có ma trận, danh sách dài, CTA trùng hoặc lời chào dài theo giờ.
- Mood giữ từ dữ liệu hiện hành; hình ảnh có alt/aria phù hợp thay vì SVG trang trí cũ.

## 4. Bỏ nội dung lặp

- Xóa toàn bộ card `Việc gấp nhất` (`b-wide`) khỏi Overview.
- Xóa derivation `vieCGap` chỉ phục vụ card đó.
- Không đổi màn `Việc hôm nay`; đó tiếp tục là chủ sở hữu duy nhất của danh sách công việc cần xử lý.
- Gỡ grid-area `wide` khỏi bố cục Overview nếu không còn consumer.

## 5. Báo cáo tổng hợp

Thay disclosure `Phân tích chi tiết` bằng một khu `Báo cáo tổng hợp` luôn hiện trên màn hình.

- Header ngắn giải thích đây là lớp phân tích sâu, tách khỏi Báo cáo nhanh của Vali.
- Hai tab semantic:
  1. `Dòng chảy tiến độ` — render `MaTranTienDo`.
  2. `Cơ cấu hoàn thành` — render `CompletionDashboard`.
- Mặc định mở `Dòng chảy tiến độ`; state tab chỉ là UI local, không thêm URL/localStorage.
- Chỉ panel đang chọn render/hiển thị để trang không dài và tránh hai dashboard nặng cùng lúc.
- Tab dùng native buttons, `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`; panel có `role="tabpanel"`.
- Desktop dùng header/tab như một dải editorial; mobile tab cuộn ngang hoặc chia đều nhưng target ≥44px.
- Dùng token Lotus, đường vàng mảnh và nền botanical rất nhẹ; không hard-code palette mới.

## 6. Luồng dữ liệu và boundary

- `Overview` tiếp tục nhận `acts`, `now`, `year`, `access`, `setView`; không tạo data source mới.
- `VongNam`, `MaTranTienDo`, `CompletionDashboard` giữ nguyên công thức và input.
- Không thay đổi quyền điều hướng, QRM, deadline, Supabase hoặc renderer 3D.
- Không thêm dependency.

## 7. Accessibility và responsive

- Native controls, focus-visible rõ, trạng thái không chỉ dựa vào màu.
- Filter panel hỗ trợ Escape/focus return.
- Tab có semantic và điều hướng bàn phím theo Tab + Enter/Space; không tự chế arrow-key contract nếu chưa dùng widget tab hoàn chỉnh.
- 390px không tràn ngang; filter, tab và chip có hit target ≥43.5px.
- 1024/1366/1440 không cắt chữ; Vali WebP dùng kích thước cố định để tránh CLS.
- Respect `prefers-reduced-motion` cho mọi chuyển động trang trí.

## 8. Kiểm thử chấp nhận

1. Thanh lọc không còn `Chép liên kết` và không còn `/ total hạng mục`.
2. Panel đóng mặc định, trigger/panel ARIA khớp; facet/chip/reset trỏ đúng state; Escape trả focus.
3. `VongNam` có 12 tháng, kim Hôm nay, tâm tỷ lệ và aria-label động; hào quang sen không mang dữ liệu.
4. `PrincessCommentary` dùng đúng WebP theo mood, ngắn và không vượt quá ba tín hiệu.
5. Không còn `Việc gấp nhất` hoặc `vieCGap` trong Overview.
6. `Báo cáo tổng hợp` hiện ngay; mặc định tab Dòng chảy; đổi tab render đúng dashboard và ARIA.
7. Mobile 390px không overflow, control ≥43.5px.
8. Targeted unit + một targeted E2E Overview, axe Overview, visual light/dark, typecheck, build fallback và `git diff --check` đạt.

## 9. Ngoài phạm vi

- Không redesign Việc hôm nay, Timeline, Alerts hoặc các bộ lọc riêng của màn khác.
- Không tạo preset lọc, tìm kiếm facet, chia sẻ link hoặc báo cáo server mới.
- Không chỉnh sửa nội dung bên trong `MaTranTienDo`/`CompletionDashboard` ngoài wrapper hiển thị nếu không có lỗi trực tiếp.
- Không thay các ảnh Vali ở Today hoặc dark-theme character system ngoài thẻ Báo cáo nhanh.

## 10. Tài liệu trực quan

Hai mockup preview-only được tạo bằng công cụ ImageGen từ ảnh local hiện tại:

- Hoa sen 12 tháng: nhấn mạnh bản sắc botanical nhưng chậm đọc thời gian hơn.
- Đồng hồ 12 tháng: đọc phần năm đã qua/còn lại nhanh hơn.

Quyết định được duyệt: dùng đồng hồ làm lõi dữ liệu và hào quang sen làm lớp trang trí không mang số liệu.

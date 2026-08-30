# Không gian phân tích chuyên sâu trên Tổng quan

Ngày: 2026-08-30  
Trạng thái: phương án 1 đã được người dùng duyệt ngày 2026-08-30  
Phạm vi: màn `Overview` và hai khối phân tích hiện có `MaTranTienDo`, `CompletionDashboard`

## Mục tiêu

Biến phần “Phân tích chi tiết” từ một nút mở/gập thành một không gian phân tích luôn hiển thị, có thứ tự đọc rõ ràng và không nhắc lại các số liệu đã xuất hiện ở KPI, Vòng năm hoặc báo cáo Vali.

Người xem phải trả lời được ba câu hỏi theo đúng thứ tự:

1. Tiến độ đang nghẽn ở bước nào?
2. Điểm nghẽn tập trung tại hàng hoặc đối tượng nào?
3. Cơ cấu nào đang dẫn đầu hoặc tụt lại?

## Cấu trúc giao diện

### 1. Tiêu đề không gian phân tích

- Bỏ hoàn toàn nút `Phân tích chi tiết`, trạng thái đóng/mở và state `sau`.
- Render trực tiếp một `section` có tiêu đề “Phân tích chuyên sâu”.
- Phụ đề mô tả ba lớp: dòng chảy, điểm nghẽn và so sánh cơ cấu.
- Không tạo thêm KPI tổng hợp ở tiêu đề.

### 2. Lớp “Dòng chảy 4 giai đoạn”

- Thay bốn thẻ tỷ lệ rời nhau bằng một dải/phễu liên kết gồm bốn bước hiện có.
- Mỗi bước vẫn hiển thị tên, số hoàn thành/tổng và tỷ lệ.
- Chênh lệch giữa hai bước liền nhau được thể hiện trực tiếp trên liên kết, giúp người dùng không phải tự trừ.
- Giữ một câu kết luận về khâu nghẽn nhất.
- Không render `StatusBreakdown`, vì trạng thái tổng đã có ở KPI, Vòng năm và Vali.
- Bộ lọc phân tích chỉ xuất hiện một lần trong lớp này và tiếp tục điều khiển các phân tích cơ cấu phía dưới.

### 3. Lớp “Ma trận điểm nghẽn”

- Giữ chức năng đổi trục hàng, đổi cột, mở danh sách hạng mục trong ô và hiện thêm hàng.
- Sắp xếp lại phần điều khiển thành thanh công cụ rõ hai nhóm: “Xem theo” và “Cột”.
- Giữ chú giải trạng thái nhưng thu gọn thành một hàng dễ quét.
- Điểm chất lượng dữ liệu được thu thành huy hiệu/ngữ cảnh trong phần đầu ma trận; bỏ thẻ “Chất lượng dữ liệu” riêng vì trùng với KPI “Vấn đề dữ liệu”.
- Giữ “Đối tượng cần chú ý nhất” vì đây là xếp hạng hành động, không phải bản sao số liệu tổng.

### 4. Lớp “So sánh cơ cấu”

- Không đồng thời render lưới loại thẩm định và bảng phân chiều dài phía dưới.
- Dùng một bộ chuyển chế độ duy nhất để chọn chiều so sánh.
- Chế độ mặc định là “Loại thẩm định”; các chiều hiện có của bảng phân tích tiếp tục khả dụng.
- Mỗi lần chỉ hiển thị một biểu diễn so sánh, kèm một câu kết luận dẫn đầu/tụt lại nếu đủ dữ liệu.
- Không lặp lại bốn tỷ lệ giai đoạn trong lớp này.

## Ngôn ngữ thị giác

- Giữ hệ Lotus B+ hiện tại: nền sáng, đường viền hồng/lavender, điểm nhấn mâm xôi–cúc vàng–xanh ngọc.
- Dùng một khung biên tập chung cho toàn bộ không gian thay vì nhiều `Card` mạnh ngang nhau.
- Ba lớp được phân biệt bằng số thứ tự, tiêu đề và khoảng trắng; không dùng thêm màu chỉ để trang trí.
- Phễu dùng chiều rộng và liên kết để mã hóa tiến trình; nhãn số vẫn luôn hiện để không phụ thuộc màu.
- Ma trận là thành phần dữ liệu chính, được ưu tiên chiều rộng và độ tương phản.

## Responsive và accessibility

- Desktop: phễu bốn bước trên một hàng; ma trận toàn chiều rộng; phần xếp hạng đặt cạnh hoặc dưới tùy không gian.
- Tablet: phễu hai hàng; thanh công cụ được phép xuống dòng.
- Mobile: bốn bước thành dòng dọc có liên kết; bảng ma trận cuộn ngang trong vùng riêng, không làm tràn trang.
- Mọi nút chuyển chế độ dùng `aria-pressed`; section có heading thật và `aria-labelledby`.
- Điều khiển có vùng chạm tối thiểu 44 px trên mobile.
- Trạng thái không được truyền đạt chỉ bằng màu; giữ icon, nhãn và số.

## Dữ liệu và hành vi

- Không thêm API, RPC hoặc nguồn dữ liệu mới.
- Tiếp tục sử dụng `acts` đã qua phạm vi lọc của `Overview`.
- Bộ lọc nội bộ của `CompletionDashboard` tiếp tục thu hẹp dữ liệu cho dòng chảy và so sánh cơ cấu.
- Ma trận tiếp tục nhận cùng `acts`; không thay đổi quy tắc đếm nhiều bộ phận hoặc chấm trạng thái.
- Empty state phải mô tả đúng lớp đang trống, không render các thẻ 0% lặp lại.

## Nội dung bị loại bỏ để tránh trùng

- Nút và state đóng/mở “Phân tích chi tiết”.
- `StatusBreakdown` trong `CompletionDashboard`.
- Thẻ “Chất lượng dữ liệu” đứng riêng trong `MaTranTienDo`.
- Bốn `MetricCard` rời nhau sau khi đã được biểu diễn bằng dòng chảy liên kết.
- Việc render đồng thời lưới loại thẩm định và bảng phân chiều.
- Import `Pill` không còn dùng sau khi thẻ “Việc gấp nhất” đã được bỏ.

## Kiểm thử chấp nhận

1. Overview không còn nút có chữ “Phân tích chi tiết” và không còn thẻ “Việc gấp nhất”.
2. Không gian phân tích được render ngay khi Overview tải, không cần click.
3. Chỉ có một bản phân rã trạng thái tổng trong màn đầu.
4. Dòng chảy có đúng bốn bước và hiển thị chênh lệch giữa các bước liền nhau.
5. Ma trận vẫn đổi được trục/cột và mở được danh sách của một ô.
6. Chất lượng dữ liệu xuất hiện dạng huy hiệu, không còn một card riêng.
7. So sánh cơ cấu chỉ render một chế độ tại một thời điểm.
8. Mobile không tràn ngang toàn trang; chỉ vùng bảng được phép cuộn ngang.
9. Các kiểm tra E2E Overview mục tiêu, typecheck và production build đều đạt.

## Ngoài phạm vi

- Không thay đổi công thức tally, deadline, chấm giai đoạn hoặc dữ liệu Supabase.
- Không chỉnh lại KPI, Vòng năm, Vali hoặc các màn Giám sát khác.
- Không thêm biểu đồ 3D, thư viện chart hoặc dependency mới.
- Không sửa quyền truy cập hay điều hướng.

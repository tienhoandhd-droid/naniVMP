# Tổng quan VMP — Vòng năm và Vali biên tập

## Phạm vi

Chỉ chỉnh hai vùng trên trang Tổng quan:

- `VongNam` trong thẻ tổng quan năm;
- `PrincessCommentary` trong vùng báo cáo nhanh của Vali.

Không đổi công thức số liệu, điều hướng, quyền truy cập, các thẻ KPI hoặc màn hình khác.

## Vòng năm

### Mục tiêu

Biến ba khối rời hiện tại thành một bố cục biên tập thống nhất, giảm khoảng trống và tạo thứ tự đọc rõ: kết luận trước, số liệu sau, hành động cuối.

### Bố cục được duyệt

- Ở thẻ rộng, đồng hồ chiếm khoảng 56% bên trái; báo cáo chiếm khoảng 44% bên phải.
- Dải kết luận không còn nằm riêng toàn chiều rộng. Kết luận được chuyển vào đầu cột báo cáo.
- Cột báo cáo lần lượt gồm: kết luận ngắn, tiêu đề tiến độ năm, ba chỉ số, tỷ lệ hồ sơ, chú giải và nút xem bảng 12 tháng.
- Đồng hồ giữ nguyên 12 rãnh, chiều dài cánh động, nhãn tháng ngoài vòng, kim hôm nay và thông tin ở lõi.
- Nền chỉ dùng ánh vỏ trứng/ngọc trai nhẹ và một nét vàng mảnh; không thêm hoa văn làm nhiễu số liệu.
- Khi container hẹp, đồng hồ xếp trước và báo cáo xếp sau theo một cột.

## PrincessCommentary

### Mục tiêu

Dùng đúng Công chúa Vali chibi của tab Thực hiện và tận dụng vùng nội dung rộng để tạo một bảng tin tổng hợp, vẫn ngắn hơn trang Báo cáo chuyên sâu.

### Nội dung

- Hiển thị một câu kết luận chính dựa trên mức ưu tiên hiện tại.
- Hiển thị bốn chỉ số cố định: tiến độ VMP, hồ sơ hoàn thiện, hồ sơ quá hạn và hồ sơ tới hạn trong 30 ngày.
- Mỗi tỷ lệ phải kèm phân số `đã xong / tổng` khi dữ liệu có sẵn; số quá hạn và tới hạn dùng số đếm trực tiếp.
- Hiển thị hai nhận xét bổ sung: số hạng mục chưa hoàn tất và số hồ sơ lệch pha. Giá trị bằng 0 vẫn hiển thị để người đọc biết hệ thống đã kiểm tra.
- Kết bằng một câu ưu tiên hành động theo thứ tự: xử lý quá hạn → theo dõi tới hạn → đồng bộ lệch pha → duy trì tiến độ.
- Bỏ lời chào theo giờ và câu động viên chung chung.
- Mọi con số tiếp tục lấy từ `stats`; không tạo số hoặc suy luận ngoài dữ liệu hiện có.

### Hình ảnh và bố cục

- Dùng đúng `vali-chibi-guide.webp`, `vali-chibi-concern.webp` hoặc `vali-chibi-celebrate.webp`, cùng luật mood với tab Thực hiện.
- Chibi nằm bên trái như tab Thực hiện; bảng tin nằm bên phải và chiếm phần lớn chiều rộng.
- Bốn chỉ số dùng lưới 4 cột trên màn rộng, 2 cột trên tablet và 1 cột trên mobile.
- Hai nhận xét nằm thành một dải dưới lưới chỉ số; câu ưu tiên hành động là dòng cuối cùng.
- Ảnh là minh họa có trạng thái nên mang tên truy cập `Công chúa Vali <nhãn mood>`; trạng thái đồng thời được diễn đạt bằng chữ, không phụ thuộc vào ảnh.
- Trên màn hẹp, giảm chibi còn khoảng 72–88px nhưng không ẩn; nội dung vẫn đứng sau ảnh trong DOM và không bị chồng lấp.
- Không thay `ValiIllustration` toàn hệ thống; chỉ thay hình trong báo cáo nhanh này.

## Khả năng truy cập

- Không dùng màu làm tín hiệu duy nhất: trạng thái luôn có câu chữ và số.
- Nút bảng 12 tháng giữ nguyên phần tử `button`, tên truy cập và focus hiện có.
- Văn bản thường đạt tương phản WCAG 2.2 AA trên cả giao diện sáng và tối.
- Không thêm chuyển động lặp; tôn trọng `prefers-reduced-motion`.

## Kiểm tra chấp nhận

- Unit test xác nhận cách chọn mood, bốn chỉ số, hai nhận xét và câu ưu tiên theo số liệu.
- E2E Tổng quan xác nhận kết luận nằm trong cột báo cáo, ảnh Vali chibi đúng mood, đủ bốn chỉ số và không tràn trên mobile.
- Chạy targeted unit, targeted E2E Tổng quan, typecheck và production build.
- Dự án không có script lint; ghi rõ trạng thái này khi bàn giao.

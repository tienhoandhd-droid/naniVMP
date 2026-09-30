# Cải tiến giao diện xu hướng ba hệ thống

Trạng thái: người dùng đã chọn hướng khuyến nghị ngày 30/09/2026; yêu cầu bổ sung dùng biểu đồ chung và đánh giá cho cùng hệ thống.

## Nhu cầu và phạm vi

Người dùng muốn cải tiến giao diện xu hướng khí nén, khí nitơ và hơi tinh khiết. Mã nguồn hiện tại là MA-NGUON-HIEN-TAI, HEAD 3506d29. Ba trang dùng chung runs.html, runs.css và runs.js; giữ cơ chế truy cập từng hệ thống đang có.

Hiện bộ lọc, biểu đồ giá trị, biểu đồ giới hạn, bảng nguồn rộng và diễn biến qua các đợt nối thành một trang dài. Tiêu đề trang riêng chưa thể hiện rõ hệ thống. Mục tiêu là thấy ngay đang xem hệ thống nào, chọn dữ liệu dễ hơn và dành vùng chính cho biểu đồ cần đọc.

## Các hướng đã xem xét

1. **Khuyến nghị: bộ lọc chung và ba chế độ xem biểu đồ.** Giảm chiều dài trang, dùng được trên điện thoại; cần chọn chế độ khi chuyển giữa giá trị, giới hạn và diễn biến.
2. **Giữ ba biểu đồ xếp dọc, chỉ chỉnh bố cục.** Ít thay đổi thói quen; trang vẫn dài, khó tập trung vào diễn biến qua các đợt.
3. **Đặt các biểu đồ cạnh nhau trên màn hình lớn.** So sánh nhanh; các điểm lấy mẫu và nhãn bị chật khi có nhiều dữ liệu, không phù hợp làm mặc định.

## Thiết kế đề nghị

| Vùng | Nội dung |
| --- | --- |
| Đầu trang | “Xu hướng · Khí nén”, “Xu hướng · Khí nitơ” hoặc “Xu hướng · Hơi tinh khiết”; mô tả ngắn về số liệu đã lưu |
| Bộ lọc | Đợt/tháng, biểu mẫu, chỉ tiêu có đơn vị, điểm lấy mẫu; hệ thống giữ cố định khi vào trang xu hướng riêng |
| Tóm tắt | Đợt/tháng đang xem, số điểm, số kết quả đo, số ngoài giới hạn và số chưa đủ cơ sở; luôn có chữ, không chỉ dùng màu |
| Chế độ biểu đồ | “Theo điểm lấy mẫu” (mặc định), “Giới hạn hành động”, “Qua các đợt đã đóng” |
| Vùng biểu đồ chính | Biểu đồ lớn, tiêu đề chỉ tiêu và đơn vị, chú giải phù hợp chế độ; mỗi lần đo được giữ riêng |
| Điểm hiển thị | Chọn/ẩn điểm và hiện lại tất cả; chú giải rõ mã/tên điểm, làm nổi điểm bằng bàn phím hoặc chuột |
| Số liệu chi tiết | Khu vực mở/thu gọn cho bảng số liệu của chế độ đang xem; giữ đủ dòng nguồn, kể cả điểm đã ẩn trên biểu đồ |
| Nguồn hồ sơ | Khu vực mở/thu gọn cho PDF nguồn và vấn đề cần xem xét |

Mặc định hiển thị đầy đủ điểm. Khi chọn chế độ qua các đợt, biểu đồ chỉ dùng hồ sơ đã đóng được phép xem. Chọn/ẩn điểm cũng áp dụng nhất quán cho chế độ này; bảng vẫn giữ dữ liệu đầy đủ. Nếu người dùng ẩn hết điểm, thông báo “Đã ẩn tất cả điểm” và có nút hiện lại, phân biệt với chưa có dữ liệu.

Chỉ một biểu đồ chính hiển thị tại một thời điểm. Chế độ theo điểm có cột riêng từng lần đo, đặt giới hạn từng điểm lên cùng biểu đồ; chế độ giới hạn dùng ký hiệu điểm để đọc sát ngưỡng. Diễn biến qua đợt dùng đường riêng theo điểm/lần đo, không nối tháng trống. Tóm tắt đánh giá luôn ghi rõ phạm vi đợt đang chọn; phần qua đợt chỉ mô tả số chuỗi/hồ sơ, không suy ra kết luận đạt hay độ ổn định thống kê cho toàn hệ thống.

Tham khảo [NIST Run-Sequence Plot](https://www.itl.nist.gov/div898/handbook/eda/section3/eda33p.htm): thứ tự quan sát phục vụ xem diễn biến/biến động. Lựa chọn cột cho các vị trí rời rạc và đường cho thời gian là quyết định thiết kế của task. Giới hạn đề cương lấy từ snapshot, không tự đặt giới hạn kiểm soát thống kê.

Màu nền và đường viền nhẹ theo giao diện VMP hiện hành; dùng token cho sáng/tối. Thanh chọn chế độ và nhãn bộ lọc rõ focus, chạm dễ; điện thoại xếp dọc, chỉ vùng biểu đồ/bảng được cuộn ngang. Chú giải đường theo đợt có tên điểm, lần đo và kiểu nét giúp đọc các chuỗi.

## Dữ liệu, trạng thái và ranh giới

Giữ các yêu cầu backend, snapshot phiên bản và cơ chế làm mới quyền hiện hành. Không thêm thư viện, API hoặc truy vấn mới. Không sửa evaluator, công thức, ngưỡng, PDF, trạng thái hồ sơ, phân công, quyền QA hay database. Không suy rộng ủy quyền phát hành lần trước sang tự push/deploy giao diện mới.

Đang tải: báo đang tải và chưa đưa ra kết luận giới hạn. Lỗi tải tiêu chí: giữ thông báo và nút thử lại. Chưa có hồ sơ: hướng dẫn chọn dữ liệu khi có, không đưa ra số kết quả đạt/không đạt giả. Chưa có quyền/hết phiên: tuân thủ khóa hiện tại. Thiếu số không thành 0, không lấy trung bình hoặc trộn đơn vị. Việc đếm kết quả ngoài giới hạn chỉ tóm tắt đối chiếu hiện có, không thay kết luận hồ sơ.

## Kế hoạch kiểm chứng và bàn giao

Primary giữ tuần tự ba file dùng chung. Viết kiểm thử hành vi còn thiếu trước: chuyển ba chế độ bằng click/bàn phím, giữ lựa chọn bộ lọc; trang riêng đúng hệ thống; chọn/ẩn/hiện điểm nhất quán; bảng vẫn đủ dòng; rỗng/đang tải/lỗi tải tiêu chí; không trộn đơn vị hoặc nối khoảng trống.

Kiểm headless với hồ sơ giả đã có số liệu cho cả ba hệ thống, nhiều điểm/lần đo/đợt; sáng/tối, mobile 320/390 và desktop 1440, focus và accessibility. Chặn yêu cầu ngoài fixture và xác nhận không ghi nghiệp vụ. Chạy unit liên quan, typecheck, build, drift và budget; không lặp lại kiểm tra database/Auth/performance không bị thay đổi.

Sau GREEN, reviewer độc lập chỉ đọc diff và bằng chứng; primary xử lý nhận xét và kiểm lại phần bị ảnh hưởng. Rollback bằng khôi phục đúng các file UI/tests của thay đổi này, không rollback database. Cập nhật PROJECT-STATE ở root và thư mục thẩm định, ghi rõ local/chưa push/chưa deploy.

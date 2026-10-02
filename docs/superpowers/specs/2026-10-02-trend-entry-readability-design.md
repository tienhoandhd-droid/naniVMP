# Nhập số liệu và đọc biểu đồ xu hướng dễ hơn

Trạng thái: người dùng đã duyệt và yêu cầu triển khai ngày 02/10/2026.

## Kiểm tra hiện tại

Nguồn đang làm: MA-NGUON-HIEN-TAI, commit 3a689f0. Biểu đồ đọc hồ sơ đã lưu, tách hệ thống/biểu mẫu/chỉ tiêu/đơn vị/phiên bản. Nhập liệu ở biểu mẫu; khí nén/nitơ có mở bản nháp JSON, chưa có luồng dán bảng Excel trong các tệp nhập đã kiểm. Trang còn nhiều nhãn Individual chart, Boxplot, Q1–Q3, IQR; phần qua các đợt lấy chỉ tiêu đầu tiên nếu chọn nhiều chỉ tiêu.

Kiểm tra nền ngày 02/10: 24 unit đạt; E2E biểu đồ ba hệ thống đạt, gồm 18 kiểm tra axe theo giao diện/kích thước. Dữ liệu giả; không xác minh dữ liệu production hoặc chốt thẩm mỹ.

## Các hướng

1. Chỉ sửa cách trình bày: nhanh, chưa cải thiện nhập nhiều số đo.
2. Cải thiện biểu đồ và thêm dán bảng Excel vào biểu mẫu hiện có: khuyến nghị, giảm thao tác và giữ đường lưu hồ sơ hiện tại.
3. Nhập file Excel/CSV, chọn sheet và ghép cột: phù hợp nhiều định dạng nhưng cần xác định mẫu tệp trước.

## Hướng khuyến nghị

- Bộ lọc theo thứ tự Đợt, Biểu mẫu, Chỉ tiêu, Điểm lấy mẫu. Luôn thấy đợt, đơn vị và giới hạn đang dùng.
- Giữ hai biểu đồ đã chọn trước đây. Đổi tên thành “Số đo theo điểm” và “Phân bố số đo”. Nhãn đủ lớn, các điểm và trục thẳng hàng, giảm chữ lặp. Số đo vượt giới hạn có ký hiệu và chữ giải thích, không chỉ đổi màu.
- Dùng “Số đo khác biệt” cho dấu ngoại lai, kèm giải thích “Khác biệt so với các số đo cùng điểm; không đồng nghĩa với vượt giới hạn”. Chi tiết IQR và tứ phân vị nằm trong phần mở rộng. Không đổi phép tính.
- Phần “Qua các đợt” có lựa chọn một chỉ tiêu rõ ràng, không ngầm dùng chỉ tiêu đầu tiên. Không nối qua tháng thiếu số liệu, không trộn đơn vị.
- Đề xuất nhập: chọn đúng đợt đang mở và biểu mẫu, dán bảng theo mẫu có mã điểm/lần đo/các trường số gốc, xem trước, sửa lỗi rồi đưa vào biểu mẫu. Thao tác này chưa lưu lên hệ thống; người dùng vẫn tính và lưu bằng luồng hiện tại. Thông báo phân biệt chưa lưu và đã lưu.
- Không tự đoán dấu phân cách số. Ô trống khác số 0; mã điểm không có trong phạm vi, số không hợp lệ hoặc dòng trùng phải được chỉ rõ. Chỉ bổ sung ô trống; thay số đã lưu theo luồng đính chính có lý do hiện hành. Không mở khóa hồ sơ đóng.

## Ranh giới và tổ chức

Bộ đọc/kiểm tra dữ liệu dán là mô-đun riêng với adapter cho gas/app. runs và pq-charts phụ trách bộ lọc/cách đọc. Giữ API, quyền, lưu phiên bản, evaluator, tiêu chí, biểu mẫu in và dữ liệu thật. Chưa thêm thư viện hoặc migration. File chung và adapter nhập sửa tuần tự, review độc lập trước giao.

## Kiểm tra và hoàn tác

Viết test thất bại cho từng hành vi mới, sửa tối thiểu rồi chạy lại. Kiểm số âm, dấu phẩy, 0/ô trống, dòng trùng, sai điểm, sai đợt, mất phiên, hồ sơ đóng và lỗi lưu giữ số đang nhập. E2E dán → xem lỗi → sửa → đưa vào biểu mẫu → lưu → tải lại → xem biểu đồ dùng backend giả lập. Kiểm nhãn/giới hạn/số gốc, bàn phím, sáng/tối, 320/390/1440px và zoom. Chạy typecheck/build và kiểm ngân sách sau cùng. Reviewer độc lập xem diff và ảnh; primary xác minh lại.

Giữ artifact 3a689f0 để hoàn tác. Chỉ tạo bản local mới sau khi duyệt thiết kế; không thay gói đang dùng trước verification. Phát hành web không thuộc lần đề xuất này.

## Quyết định đã chốt

Đã duyệt hướng 2: dán bảng Excel vào biểu mẫu, sau kiểm thử cập nhật gói local. Yêu cầu đã rõ: biểu đồ dễ đọc, thân thiện, lời hướng dẫn ngắn và tự nhiên.

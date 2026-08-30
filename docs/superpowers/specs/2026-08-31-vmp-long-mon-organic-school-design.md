# Thiết kế cụm đàn cá hữu cơ cho Long Môn VMP

## 1. Vấn đề

Thuật toán hiện tại giữ mọi cá cùng deadline ở cùng tọa độ ngang rồi đẩy lần lượt xuống các lane. Kết quả là cá tạo thành cột thẳng, bố cục giống bảng dữ liệu và chiều cao tăng tuyến tính theo số hạng mục trùng ngày.

## 2. Mục tiêu

- Giữ deadline VMP là mốc nghiệp vụ duy nhất quyết định tâm ngang của mỗi cụm.
- Mỗi thiết bị vẫn là một cá riêng, bấm được và mở đúng hồ sơ.
- Cá cùng deadline tạo thành một đàn bơi tự nhiên; các đàn gần ngày so le mà không nhập làm một.
- Nén chiều cao của nhóm trùng ngày khoảng hai đến ba lần so với cách xếp một cá mỗi lane.
- Vị trí ổn định giữa các lần render; lọc dữ liệu không làm cá còn lại nhảy ngẫu nhiên.

## 3. Bố cục được duyệt

Mỗi deadline là một điểm neo vô hình tại `xPct` chính xác. Các cá thuộc cùng ngày được bố trí quanh điểm neo bằng một mẫu đội hình hình thoi/cánh quạt có tối đa ba cá trên một hàng:

- Cột giữa nằm đúng điểm neo.
- Hai cột phụ lệch tối đa `22px` sang trái hoặc phải.
- Khoảng cách dọc giữa hai hàng khoảng `44–48px`, cho phép vây và đuôi chồng nhẹ như một đàn cá nhưng không che mã hồ sơ.
- Cá luân phiên cao thấp `6–12px`, nghiêng rất nhẹ và có tỷ lệ `0.90–1.04` để bỏ cảm giác lưới máy móc.
- Sai lệch chỉ là tọa độ trình bày; model vẫn giữ `xPct` deadline nguyên bản để sắp xếp, kiểm thử và đọc bằng công nghệ hỗ trợ.

Chỉ các cá có cùng ngày mới thuộc cùng một cụm. Mỗi ngày khác nhau luôn có một điểm neo riêng. Các cụm deadline gần nhau được bộ đóng gói đặt vào dải nước còn trống theo bounding box của cả cụm, thay vì cấp lane riêng cho từng cá. Nhờ đó số lane tính theo số hàng của đàn, không theo tổng số cá trùng ngày.

Khoảng mở ngang của mỗi đàn được giới hạn bởi nửa khoảng cách đến điểm neo ngày liền trước và liền sau. Hai ngày sát nhau sẽ tự thu cánh quạt ngang và ưu tiên so le dọc; hai ngày đủ xa mới dùng hết biên `22px`. Vì vậy cá không thể vượt sang lãnh địa ngày khác hoặc làm đảo thứ tự thời gian.

## 4. Tính ổn định và truy vết

- Mẫu offset lấy từ thứ tự ổn định `deadline + code + id`, không dùng `Math.random()`.
- `renderOffsetX` được co theo khoảng cách tới deadline lân cận; thứ tự các điểm neo khác ngày không bao giờ bị đảo.
- `aria-label`, tooltip và modal tiếp tục hiển thị deadline thật; không hiển thị ngày suy từ vị trí lệch.
- Cá quá hạn, loài, màu và số đếm legend giữ nguyên quy tắc hiện hành.
- Nếu một ngày có nhiều hơn sức chứa ba cột, đàn mở thêm hàng dọc và vùng tranh được phép cuộn dọc; không ẩn hoặc gom cá.

## 5. Responsive và chuyển động

- Desktop dùng đầy đủ đội hình ba cột.
- Mobile giữ cùng đội hình trong canvas nội bộ có cuộn ngang; tự căn vào “Hôm nay” như hiện tại.
- Không thêm animation liên tục. Hover/focus chỉ nhấc nhẹ cá; `prefers-reduced-motion` tiếp tục tắt transform chuyển động.

## 6. Kiểm thử chấp nhận

- Ba cá cùng deadline có cùng `xPct` nghiệp vụ nhưng ít nhất hai `renderOffsetX` khác nhau.
- Hai deadline khác nhau luôn giữ hai điểm neo khác nhau; đàn của ngày trước không vượt qua trung điểm với ngày sau.
- Sáu cá cùng deadline dùng không quá hai hàng cơ sở và chiều cao nhỏ hơn cách xếp sáu lane cũ.
- Offset ngang tuyệt đối không vượt `22px` và không làm cá bị cắt mép canvas.
- Thứ tự/offset không đổi khi chạy model hai lần với cùng input.
- E2E desktop không có cột ba cá trùng tâm X; mobile vẫn căn được vạch hôm nay, không tràn document và mọi nút cá tối thiểu `44×44px`.
- Unit, typecheck, build và E2E Long Môn mục tiêu đều qua.

## 7. Phạm vi không đổi

Không thay API, RPC, quyền, database, bộ lọc, công thức deadline, ánh xạ sáu trạng thái, tranh nền hoặc sprite cá đã duyệt.

# Vòng năm — bản gốc tinh chỉnh

## Mục tiêu

Giữ nguyên biểu đồ 12 cánh dữ liệu của bản gốc và nâng độ tinh tế, khả năng đọc. Không thay bằng hoa sen trang trí, đồng hồ cung mảnh hoặc hình cố định.

## Quy tắc dữ liệu

- Mỗi tháng luôn chiếm đúng 30°.
- Chiều dài cánh tháng được chuẩn hóa theo tháng có nhiều hạng mục nhất trong tập dữ liệu hiện tại. Dữ liệu đổi thì hình hoa thị đổi theo.
- Phần đã xong nằm phía trong cánh và tỷ lệ thuận với `xong / tong`.
- Tháng không có hạng mục chỉ hiển thị rãnh nền.
- Màu không thay thế số và chiều dài: nhãn trực tiếp và bảng 12 tháng vẫn tồn tại.

## Thẩm mỹ

- Nền vỏ trứng ấm; hình khối dùng một họ mận sơn, không phủ nhiều màu bão hòa trên diện tích lớn.
- Quá hạn chỉ có nắp đỏ son ở đầu cánh; tháng hiện tại có viền vàng cổ; tháng tương lai giảm độ đậm; phần hoàn thành dùng xanh xà cừ trầm.
- Viền vàng là đường khảm mảnh, không phải mảng vàng lớn.
- Bỏ hoàn toàn hào quang/cánh sen cố định.

## Chữ và bố cục

- Nhãn tháng là hai dòng `Tn` và số lượng, đặt ngoài bán kính cánh tối đa ít nhất 16 đơn vị SVG.
- Nhãn tháng hiện tại có nền huy hiệu nhỏ; các nhãn khác không dùng hộp để tránh rối.
- Lõi trung tâm chiếm khoảng 30% đường kính; tỷ lệ là cấp chữ lớn nhất, hai dòng mô tả nhỏ hơn và không chạm vành.
- Chỉ báo hôm nay là kim vàng ngắn, chỉ chạy trong vùng cánh; không cắt qua lõi hoặc chữ.
- Ở thẻ rộng, vòng chiếm 55–58% và báo cáo chiếm 40–42%; khi hẹp, hai phần xếp dọc.

## Tinh chỉnh sáng và cân bằng

- Giữ nguyên hình học và ý nghĩa dữ liệu, chỉ nâng nền vỏ trứng gần trắng và giảm sắc xám của rãnh.
- Màu mận, đỏ son, vàng cổ và xanh xà cừ được nâng độ sáng vừa phải nhưng vẫn đủ tương phản với nền.
- Ở bố cục hai cột, vòng và báo cáo canh đầu; tỷ lệ gần 54/46 để nội dung báo cáo bớt chật.
- Báo cáo dùng panel ngọc trai rất nhẹ để gom thông tin thành một điểm đọc, không cạnh tranh với vòng năm.

## Khả năng truy cập

- SVG giữ `role="img"` và mô tả tổng hợp hiện có.
- Mỗi tháng giữ `title` mô tả số lượng, tỷ lệ và trạng thái.
- Màu không phải tín hiệu duy nhất: nhãn số trực tiếp, văn bản chú giải và bảng 12 tháng vẫn có.
- Tôn trọng chế độ giảm chuyển động; không thêm animation bắt buộc.

## Kiểm tra chấp nhận

- Unit test chứng minh độ dài tương đối thay đổi theo số lượng và được chuẩn hóa đúng.
- E2E chứng minh có 12 tháng, 12 rãnh, cánh dữ liệu động, không còn cánh sen cố định, nhãn nằm ngoài vòng dữ liệu và nút bảng số vẫn hoạt động.
- Chạy targeted unit, targeted Overview E2E, typecheck và build.

# Ngư đồ Long Môn mở rộng theo chiều dài và mật độ nhóm

## Bối cảnh

Scene nhóm hiện cố định ở chiều cao mô hình 520px. Thuật toán có thể bố trí tối đa 16 cá tập trung trong cùng một tuần; từ 20 cá trở lên không tìm được đủ hàng, trả về tập vị trí rỗng và các cá giữ tọa độ mặc định `(0, 0)`, gây chồng toàn bộ đàn.

## Thiết kế được duyệt

- Chế độ **Cả nhóm QA** dùng hồ dài cố định 1.800px để ba tháng có đủ không gian ngang; viewport tự căn vùng hôm nay và cho cuộn ngang.
- Tuần trống giữ nhãn nhưng co về 58% trọng số cơ sở. Tuần có cá nhận trọng số lớn hơn theo mật độ, có giới hạn, để nhường không gian cho đàn cá mà vẫn giữ đủ ba tháng.
- Cá trong tuần dùng nhiều cột theo bề rộng thực tế thay vì chỉ hai cột.
- Chế độ nhóm tính chiều cao scene từ số hàng va chạm thực tế, tối thiểu 520px và chỉ tăng khi chiều dài 1.800px vẫn chưa đủ.
- Chế độ **Cá nhân** tiếp tục dùng scene 520px và bố cục cong gọn hiện tại.
- Canvas nhận `sceneWidthPx` và `sceneHeightPx` từ model; trang tự tăng chiều cao, không tạo vùng cuộn dọc lồng bên trong Ngư đồ.
- Không thu nhỏ cá để che mật độ và không gộp nhiều thiết bị thành một biểu tượng.
- Nếu mật độ tăng, nền nước phủ toàn bộ scene; mốc tháng, tuần và hôm nay vẫn kéo dài xuyên suốt chiều cao mới.

## An toàn và kiểm thử

- Không được có nhánh trả về vị trí rỗng cho đàn cá nhóm chỉ vì thiếu chiều cao.
- Kiểm thử hồi quy với 20, 30 và 40 cá cùng tuần phải dùng `sceneWidthPx === 1800`, có đủ tọa độ và không chồng lấn.
- Kiểm thử tuần trống xác nhận chiều rộng nhỏ hơn rõ rệt tuần có cá, tổng chiều rộng tuần bằng 100% và vạch hôm nay đi theo tỷ lệ mới.
- Kiểm thử 12 cá cùng tuần, hai tuần đông liền kề, 48 cá phân bố trong ba tháng và bố cục cá nhân phải tiếp tục đạt.
- E2E xác nhận canvas dùng chiều cao model và giao diện cá nhân vẫn gọn.

## Ngoài phạm vi

- Không thay đổi quyền xem Cả nhóm/Cá nhân.
- Không thay đổi cách tính trạng thái, loài cá hoặc hạn VMP.
- Không thêm animation, gom cụm hay phân trang.

# Ngư đồ Long Môn mở rộng theo mật độ nhóm

## Bối cảnh

Scene nhóm hiện cố định ở chiều cao mô hình 520px. Thuật toán có thể bố trí tối đa 16 cá tập trung trong cùng một tuần; từ 20 cá trở lên không tìm được đủ hàng, trả về tập vị trí rỗng và các cá giữ tọa độ mặc định `(0, 0)`, gây chồng toàn bộ đàn.

## Thiết kế được duyệt

- Giữ chiều rộng và trục thời gian ba tháng như hiện tại.
- Chế độ **Cả nhóm QA** tính chiều cao scene từ số hàng va chạm thực tế, tối thiểu 520px và tăng đủ để mọi cá có vị trí hợp lệ.
- Chế độ **Cá nhân** tiếp tục dùng scene 520px và bố cục cong gọn hiện tại.
- Canvas nhận `sceneHeightPx` từ model; trang tự tăng chiều cao, không tạo vùng cuộn dọc lồng bên trong Ngư đồ.
- Không thu nhỏ cá để che mật độ và không gộp nhiều thiết bị thành một biểu tượng.
- Nếu mật độ tăng, nền nước phủ toàn bộ scene; mốc tháng, tuần và hôm nay vẫn kéo dài xuyên suốt chiều cao mới.

## An toàn và kiểm thử

- Không được có nhánh trả về vị trí rỗng cho đàn cá nhóm chỉ vì thiếu chiều cao.
- Kiểm thử hồi quy với 20, 30 và 40 cá cùng tuần phải có đủ tọa độ, không chồng lấn và `sceneHeightPx > 520`.
- Kiểm thử 12 cá cùng tuần, hai tuần đông liền kề, 48 cá phân bố trong ba tháng và bố cục cá nhân phải tiếp tục đạt.
- E2E xác nhận canvas dùng chiều cao model và giao diện cá nhân vẫn gọn.

## Ngoài phạm vi

- Không thay đổi quyền xem Cả nhóm/Cá nhân.
- Không thay đổi cách tính trạng thái, loài cá hoặc hạn VMP.
- Không thêm animation, gom cụm hay phân trang.

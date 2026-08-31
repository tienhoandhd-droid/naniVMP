# Công cụ tài khoản trong Bảng kiểm soát

## Mục tiêu

Bỏ tab riêng `Liên kết & quyền` nhưng giữ hai chức năng quản trị cần thiết ngay tại `Bảng kiểm soát`.

## Thiết kế đã duyệt

- Nút `Liên kết tài khoản` nằm tại phần đầu bảng tài khoản. Khi mở, Admin chọn nhân sự từ Dữ liệu nguồn rồi nối hoặc gỡ tài khoản.
- Mỗi dòng tài khoản đã nối hồ sơ có nút `Xem quyền`. Khi mở, quyền hiệu lực của đúng nhân sự được hiển thị ngay dưới bảng.
- Hai công cụ dùng chung một vùng nội dung có nút `Đóng`; nút mở có `aria-expanded` và `aria-controls`.
- Nhân sự chưa có tài khoản không bị đưa vào bảng tài khoản và không bị tính là trạng thái lỗi.
- Không thay đổi RPC, luật quyền, Dữ liệu nguồn hoặc thao tác ghi hiện có.

## Kiểm thử

- Unit render xác nhận có hai thao tác, tên truy cập và liên kết vùng nội dung.
- Contract trang xác nhận tab `chi-tiet` đã bị loại bỏ nhưng các panel liên kết/quyền vẫn được dùng.
- E2E xác nhận mở công cụ liên kết từ Bảng kiểm soát; unit render xác nhận thao tác xem quyền theo dòng.

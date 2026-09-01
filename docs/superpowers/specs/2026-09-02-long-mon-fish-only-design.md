# Long Môn fish-only design

## Mục tiêu

Làm mặt tranh Long Môn thoáng hơn bằng cách bỏ mã chữ hiển thị trên thân từng
con cá.

## Thiết kế đã duyệt

- Xóa `long-mon-race__code` khỏi nội dung nhìn thấy của từng nút cá.
- Giữ nguyên sprite, chuyển động, vị trí, vùng bấm `44×44px` và focus keyboard.
- Giữ `aria-label` đầy đủ và tooltip khi hover/focus; bấm cá vẫn mở chi tiết.
- Giữ tiêu đề, Hôm nay, mốc tháng và chú giải trạng thái.
- Không thay model, dữ liệu, quyền hoặc API.

## Kiểm chứng

SSR không còn mã chữ trong thân cá nhưng vẫn có accessible name và tooltip.
Unit Long Môn, typecheck và build phải đạt; preview tiếp tục ở cổng `4175`.

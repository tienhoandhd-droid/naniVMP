# Thiết kế Botanical QA Ledger cho “Việc hôm nay”

## Mục tiêu

Làm danh sách công việc trong màn “Việc hôm nay” dễ quét, đẹp và có chất Botanical Editorial hơn cho người dùng QA. Dòng tóm tắt chỉ hiển thị người QA phụ trách; bộ phận không xuất hiện trong bảng hoặc thẻ tóm tắt trên mobile.

## Phạm vi

- Chỉnh `TodayQueueSection` và `TodayQueueRow` dùng chung cho bốn nhóm: Quá hạn, Đến hạn hôm nay, Trong 7 ngày tới và Hồ sơ cần hoàn thiện.
- Nhóm Quá hạn có sắc thái cảnh báo mạnh hơn nhưng vẫn dùng cùng cấu trúc bảng.
- Đổi tiêu đề cột `Phụ trách · Bộ phận` thành `QA phụ trách`.
- Trong dòng tóm tắt, chỉ hiển thị `row.ownerName`.
- Giữ `row.department` trong `TodayRowDetails` khi người dùng mở chi tiết.
- Không sửa model dữ liệu, thứ tự ưu tiên, deep-link cập nhật tiến độ, phân quyền hoặc các màn khác.

## Bố cục bảng

Bảng desktop giữ sáu vùng để QA quét nhanh:

1. Mã
2. Hạng mục
3. Mốc
4. QA phụ trách
5. Trễ / còn hạn
6. Thao tác

Tên QA là nội dung duy nhất trong cột phụ trách. Trạng thái thời gian dùng chữ và dấu hiệu hình học, không phụ thuộc màu đơn thuần. Nút thao tác vẫn mở đúng luồng hiện có.

Trên mobile, mỗi hàng chuyển thành thẻ công việc. Thẻ vẫn hiển thị mã, hạng mục, mốc, QA phụ trách và trạng thái thời gian nhưng không hiển thị bộ phận. Nút chính cao tối thiểu 44px.

## Ngôn ngữ thị giác

- Khung nhóm dùng nền giấy sáng, viền vàng mảnh và bóng thấp.
- Tiêu đề nhóm có một chi tiết cành/lá nhỏ bằng CSS; không thêm ảnh trang trí.
- Hàng dữ liệu có nhịp sọc rất nhẹ để đọc theo chiều ngang.
- Nhóm Quá hạn dùng vệt mận/đỏ ở mép trái và con dấu thời gian gọn; không phủ đỏ toàn hàng.
- Mã giữ kiểu mono; tên hạng mục và người QA có phân cấp rõ.
- Hover/focus chỉ nâng nền nhẹ, không làm hàng dịch chuyển gây khó quét.
- Tôn trọng `prefers-reduced-motion` và dùng token Lotus hiện có.

## Khả năng truy cập

- Giữ nút native cho mở chi tiết và cập nhật.
- Giữ quan hệ `aria-expanded`/`aria-controls` hiện có.
- Focus keyboard phải nhìn thấy rõ.
- Trạng thái trễ có chữ cụ thể như `Trễ 4 ngày`, không truyền đạt chỉ bằng màu.
- Nội dung phòng ban vẫn tra được trong vùng chi tiết có `role="region"`.

## Dữ liệu và hành vi

Không thay đổi dữ liệu hay thuật toán. `TodayActionRow.department` vẫn được giữ và vẫn được render trong `TodayRowDetails`; chỉ phần tóm tắt của hàng không render trường này. Mọi callback `onToggle`, `onOpenProgress` và quyền `canEditProgress` giữ nguyên.

## Kiểm tra chấp nhận

- Unit render xác nhận tiêu đề có `QA phụ trách`, không còn `Phụ trách · Bộ phận`.
- E2E desktop xác nhận dòng tóm tắt chỉ hiện tên QA, mở chi tiết vẫn thấy `Phòng ban`.
- E2E xác nhận nút Cập nhật tiến độ vẫn mở đúng hạng mục.
- E2E mobile 390×844 xác nhận không tràn ngang và mục tiêu chạm tối thiểu 44px.
- Chạy targeted unit, targeted E2E, typecheck và production build.

## Dữ liệu nguồn — ngoài phạm vi triển khai này

Các đề xuất đã thống nhất để cân nhắc sau: phân tầng thanh công cụ, nâng cảnh báo hiện có thành lối lọc trực tiếp, thêm số lượng vào chip loại đối tượng, tối ưu cột cố định và áp Botanical Registry nhẹ. Đợt này không sửa `CatalogWorkspaceShell` hoặc `catalog-workspace.css`.

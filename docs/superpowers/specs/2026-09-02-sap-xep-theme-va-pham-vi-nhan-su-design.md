# Thiết kế sắp xếp nút giao diện và phạm vi nhân sự

## Mục tiêu

Làm hai điều khiển dễ hiểu và cân đối hơn trên desktop mà không thay đổi hành vi:

- đổi giao diện là tùy chọn cá nhân;
- chọn nhân sự là phạm vi dữ liệu đang xem.

## Bố cục được duyệt

1. Chuyển `ThemeToggle` khỏi góc phải `Topbar` thành một hàng tùy chọn riêng ngay phía trên thẻ tài khoản ở cuối `Sidebar`.
2. Hàng tùy chọn có nhãn `Giao diện`, nút đổi theme ở mép phải và khoảng cách thị giác rõ ràng với thẻ tài khoản; không đặt nút theme trong cùng vùng chứa với hành động `Thoát` để tránh bấm nhầm.
3. Trên mobile, giữ `ThemeToggle` trong khối tài khoản của drawer như hiện tại.
4. Trong `GlobalFilterBar`, để nhãn phạm vi và nút `Bộ lọc` ở bên trái; chuyển bộ chọn nhân sự sang mép phải.
5. Trình bày bộ chọn nhân sự như một capsule có biểu tượng, nhãn `Tiến độ của` và select `Cả nhóm`/tên nhân sự.
6. Khi không đủ ngang, capsule xuống hàng tự nhiên; không thay đổi thứ tự bàn phím, nhãn truy cập hoặc logic lọc.

## Phạm vi kỹ thuật

- Chỉ sửa `Layout.tsx`, `App.tsx` và CSS shell liên quan.
- Không thay đổi quyền, dữ liệu, API, RPC hoặc cách lưu theme.
- Kiểm thử phải chứng minh desktop chỉ có một nút theme trong hàng tùy chọn riêng, thẻ tài khoản không chứa nút theme, bộ chọn nhân sự nằm trong vùng điều khiển căn phải, và các control vẫn có accessible name.

## Tiêu chí hoàn thành

- Topbar không còn nút theme đứng một mình.
- Sidebar desktop có đúng một nút theme trong hàng `Giao diện` riêng phía trên thẻ tài khoản.
- Nút theme không nằm trong thẻ chứa hành động `Thoát`.
- Thanh phạm vi cân hai đầu ở desktop và không tràn ngang ở kích thước nhỏ.
- Theme sáng/tối/tự động và lọc theo nhân sự vẫn hoạt động như trước.

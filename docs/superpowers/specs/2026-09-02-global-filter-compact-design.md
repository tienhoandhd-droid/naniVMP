# Thiết kế GlobalFilterBar compact

Ngày: 02/09/2026  
Phạm vi: `GlobalFilterBar` bản đầy đủ trong `src/App.tsx`

## 1. Mục tiêu

Làm thanh lọc dữ liệu gọn và dễ hiểu hơn bằng cách nối ba phần thông tin thành một cụm điều khiển duy nhất:

`Bộ lọc dữ liệu | Tất cả dữ liệu | Thay đổi`

Thay đổi chỉ thuộc bố cục, copy và khả năng truy cập của thanh lọc. Không đổi dữ liệu, điều kiện lọc, URL state, popover, phân quyền, token màu, font hay ngôn ngữ hình ảnh Lotus.

## 2. Ngữ cảnh sử dụng

- Người dùng: nhân viên QA, quản lý QA và quản trị viên.
- Bề mặt: màn vận hành và giám sát dùng dữ liệu VMP.
- Quyết định đầu tiên: dữ liệu đang được xem trong phạm vi nào và có cần thay đổi phạm vi hay không.
- Rủi ro hiện tại: outer card chiếm toàn chiều ngang dù có ít nội dung; “Toàn hệ thống” có thể bị hiểu thành phạm vi quyền thay vì trạng thái lọc dữ liệu; mobile tách nhãn và nút thành hai hàng lớn.

## 3. Phạm vi giữ nguyên

- Giữ `GlobalFilterBar` bản `rutGon` như hiện tại.
- Giữ nguyên `id` của trigger và panel để không phá hợp đồng E2E.
- Giữ cấu trúc fieldset, lựa chọn ngày, bộ phận, khu vực và nút `Xong` trong popover.
- Giữ cách tạo, xoá từng chip và `Xóa tất cả`.
- Giữ focus return từ panel về trigger sau khi đóng.
- Giữ `personControl`; chỉ sắp lại vị trí theo breakpoint.

## 4. Bố cục được duyệt

### Desktop

- Bỏ cảm giác một card rỗng kéo toàn hàng. Wrapper chỉ làm nhiệm vụ bố cục và không tạo bề mặt lớn.
- Cụm chính là một capsule `inline-flex`, rộng theo nội dung, gồm ba segment nối liền:
  1. Icon lọc + nhãn `Bộ lọc dữ liệu`.
  2. Trạng thái `Tất cả dữ liệu` khi chưa lọc; khi có lọc, tóm tắt các điều kiện đang áp dụng.
  3. Trigger `Thay đổi`; số điều kiện vẫn có thể hiện trong accessible name hoặc text phụ khi cần.
- Các segment dùng chung một outline, chỉ ngăn nhau bằng đường kẻ mảnh. Không tạo ba button/card rời.
- `personControl`, nếu có, nằm cùng hàng về bên phải.
- Chip điều kiện chỉ tạo hàng thứ hai khi thực sự có điều kiện lọc.

### Mobile

- Cụm chính rộng 100%, cao tối thiểu 44px và vẫn nằm trên một hàng ở 390px.
- Segment trạng thái được co giãn và dùng ellipsis; nhãn hành động không bị đẩy ra ngoài màn.
- `personControl`, nếu có, chuyển thành hàng riêng bên dưới vì đây là điều khiển độc lập.
- Chip được wrap tự nhiên, không gây cuộn ngang toàn trang.

## 5. Nội dung và trạng thái

### Không có điều kiện lọc

- Nhãn nhóm: `Bộ lọc dữ liệu`.
- Trạng thái nhìn thấy: `Tất cả dữ liệu`.
- Trigger: `Thay đổi`.
- Accessible label của group: `Bộ lọc dữ liệu: đang xem tất cả`.

### Có điều kiện lọc

- Trạng thái tóm tắt ưu tiên bộ phận, khu vực, rồi khoảng ngày.
- Hiện tối đa hai nhãn ngắn trong segment; phần còn lại dùng `+N`.
- Chip đầy đủ ở hàng dưới vẫn là nguồn thông tin và nơi xoá từng điều kiện; không làm mất dữ liệu chỉ để gọn.
- Accessible label của group: `Bộ lọc dữ liệu: N điều kiện đang áp dụng`.
- Trigger nhìn thấy vẫn là `Thay đổi`; không lặp lại số lượng nếu segment trạng thái đã hiển thị rõ.

## 6. Hành vi

- Click segment `Thay đổi` mở đúng dialog hiện tại.
- `aria-expanded`, `aria-controls`, `aria-labelledby` và focus management giữ nguyên.
- Xoá chip cập nhật ngay trạng thái tóm tắt.
- `Xóa tất cả` đưa trạng thái về `Tất cả dữ liệu`.
- Không thêm request, state hoặc persistence mới.

## 7. Component và CSS

- Chỉ sửa markup cục bộ của nhánh đầy đủ trong `GlobalFilterBar` tại `src/App.tsx`.
- Chỉ sửa nhóm `.vmp-global-filter*` trong `src/features/overview/overview-executive.css`.
- Có thể thêm một hàm thuần nhỏ để tạo nhãn tóm tắt; không tách component hoặc đổi kiến trúc nếu chưa cần.
- Không thay token trong `lotus-tokens.css` và không thêm thư viện UI.

## 8. Tiêu chí chấp nhận

1. Ở 1440px, cụm lọc không kéo thành card rỗng toàn chiều ngang.
2. Ở 390px, cụm `Bộ lọc dữ liệu | trạng thái | Thay đổi` nằm trên một hàng, không tràn ngang.
3. Người dùng nhìn được đây là bộ lọc dữ liệu, không nhầm với phạm vi quyền.
4. Khi có hơn hai điều kiện, segment dùng `+N` nhưng chip đầy đủ vẫn còn.
5. Popover, chọn điều kiện, xoá chip, xoá tất cả và focus return hoạt động như trước.
6. `rutGon` không đổi hành vi và không phát sinh khoảng trống.
7. Light/dark mode dùng nguyên token Lotus hiện tại.

## 9. Kiểm thử

- Unit/source-contract: copy group, trạng thái rỗng, trạng thái có N điều kiện và các ID accessibility.
- E2E mục tiêu: mở/đóng panel, chọn hai điều kiện, kiểm summary/chip, xoá từng chip, xoá tất cả và focus return.
- Responsive: đo overflow ở 390×844 và bố cục cùng hàng ở 1440×900.
- Visual: chụp light/dark ở desktop/mobile và đối chiếu với selector React Grab đã xác nhận.
- Gate cuối: typecheck và build.

## 10. Ngoài phạm vi

- Không thiết kế lại toàn bộ shell hoặc các màn.
- Không đổi hành trình `Tổng quan → Dòng thời gian → Cảnh báo` trong thay đổi này.
- Không sửa bảng, hero, typography toàn hệ thống hoặc responsive của component khác.
- Không deploy, push hoặc thay đổi dịch vụ remote.

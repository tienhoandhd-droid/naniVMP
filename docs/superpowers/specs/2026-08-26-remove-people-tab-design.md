# Thiết kế loại bỏ màn Nhân sự

## Mục tiêu

Loại bỏ hoàn toàn tab và màn “Nhân sự” khỏi giao diện VMP vì không còn phù hợp
với quy trình vận hành hiện tại. Đường dẫn cũ không được mở lại màn ẩn mà phải
rơi về màn đầu tiên người dùng có quyền xem.

## Phạm vi giữ nguyên

Không xóa dữ liệu nhân sự, bảng cơ sở dữ liệu, RPC, migration hoặc quyền phía
server. Các thành phần dùng chung cho “Vai trò & phạm vi”, phân công nhân sự
xưởng và người nhận email vẫn được giữ nguyên.

## Thay đổi giao diện

- Bỏ mục `people` khỏi danh sách điều hướng.
- Bỏ `people` khỏi hợp đồng màn hình và thứ tự điều hướng phía frontend.
- Bỏ lazy import và nhánh render `OperationalPeopleView` trong `App.tsx`.
- Xóa ba file chỉ phục vụ riêng màn đã bỏ:
  - `src/pages/OperationalPeoplePage.tsx`;
  - `src/features/operationalPeople/OperationalPeopleWorkspace.tsx`;
  - `src/features/operationalPeople/operational-people.css`.
- Bỏ import CSS tương ứng khỏi `src/main.tsx`.

Hash cũ `#v=people` được xử lý bởi cơ chế điều hướng hiện có: vì `people`
không còn là màn hợp lệ, ứng dụng chọn màn đầu tiên người dùng được phép xem.
Không tạo redirect hoặc route mới.

## Nội dung hướng dẫn

Các câu hiện hướng người dùng sang màn “Nhân sự” phải được sửa để không chỉ tới
một màn đã mất. Khi hồ sơ nhân sự thiếu email hoặc cần cập nhật, giao diện hướng
người dùng liên hệ quản trị viên. Nội dung ở “Vai trò & phạm vi” chỉ mô tả các
chức năng thật sự còn tồn tại tại màn đó.

## Dữ liệu và phân quyền

Mã màn `people` trong payload server và ma trận production được giữ nguyên để
tránh migration production không cần thiết. Frontend bỏ qua màn này vì nó không
còn nằm trong hợp đồng màn hình. Không thay đổi năm vai trò nghiệp vụ hoặc quyền
của các màn còn lại.

## Kiểm thử

Kiểm thử phải chứng minh:

- menu desktop và mobile không còn tab “Nhân sự”;
- `#v=people` không dựng màn cũ và rơi về màn hợp lệ;
- ba E2E cốt lõi vẫn đạt sau khi cập nhật danh sách màn mong đợi;
- luồng “Vai trò & phạm vi”, phân công xưởng và email không mất các thành phần
  nhân sự dùng chung;
- typecheck, unit test và production build đạt.

Các kiểm thử cũ dành riêng cho chỉnh sửa màn “Nhân sự” được bỏ hoặc chuyển thành
kiểm thử màn không còn truy cập được. Không chạy lại visual, accessibility hoặc
ma trận E2E đầy đủ vì cổng phát hành đã được tinh gọn theo quyết định trước đó.

## Phục hồi

Nếu phát hiện một quy trình thật sự còn cần màn này, hoàn tác commit UI sẽ khôi
phục tab, route và các file trang. Dữ liệu production không cần phục hồi vì thay
đổi này không ghi hoặc xóa dữ liệu.

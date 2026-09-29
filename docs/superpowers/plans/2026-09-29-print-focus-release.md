# Mở hộp in khi quyền PQ đang được làm mới

## Phạm vi và thiết kế

Kiểm tra web thật sau deploy 061c4ed phát hiện lần bấm In đầu tiên vào iframe kích hoạt focus. Bootstrap làm mới quyền, tạm xóa context theo nguyên tắc từ chối mặc định; `show()` đồng bộ thấy chưa có quyền và bỏ qua thao tác. Các lần tải PDF nguồn sau đó đã thành công; không đổi Storage hoặc dữ liệu.

Chọn chờ `getSession()` hiện có, vốn gộp yêu cầu context đang chạy, rồi kiểm tra lại quyền và danh tính trước mở dialog. Không giữ quyền cũ trong thời gian refresh, không tự thử lại click, không thêm timer. Giữ khóa hồ sơ đã đóng và renderer PDF. Có thông báo đang kiểm tra/lỗi mạng ngay cạnh nút; không xóa dữ liệu khi lỗi.

## Trình tự và sở hữu

Primary sửa tuần tự `public/tham-dinh-thuc-te/entry-tools.js` và test mới. Không thay backend, schema, migration, mẫu in hoặc nghiệp vụ. Reviewer độc lập kiểm diff và bằng chứng trước push. Yêu cầu hoàn tất phát hành và tự giải quyết quyết định kỹ thuật nhỏ đã được người dùng ủy quyền.

1. RED: test browser với script entry-tools thật, trì hoãn kết quả kiểm quyền; sau cấp quyền hộp in phải mở từ lần gọi đầu. Kiểm từ chối quyền, lỗi mạng giữ dữ liệu, đổi hồ sơ, đổi người dùng và kết thúc phiên khi đang chờ.
2. GREEN: `show()` bất đồng bộ; chờ session, kiểm token yêu cầu + khóa trạng thái + actor + quyền; chỉ mở dialog nếu mọi điều kiện còn đúng. Hiển thị lỗi có thể thử lại, không bật quyền thủ công.
3. Chạy test mới, regression quyền/UI hiện có, typecheck và build. Kiểm bằng browser headless trên bản build local với dữ liệu đã lưu, chặn mọi ghi production.
4. Reviewer độc lập xác nhận. Commit/push main bình thường, chờ tất cả CI và Pages. Không chạy lại migration đã thành công.
5. Đối chiếu artifact/live theo SHA mới, kiểm năm hồ sơ có dữ liệu và PDF; lưu bàn giao Desktop đúng bản cuối. Giữ bằng chứng 061c4ed và các lần chẩn đoán.

Rollback chỉ phần web về commit trước qua CI nếu cần; server PQ đã áp và không được xóa hay chạy lại. Không coi đóng gói hoặc CI đạt là bằng chứng web thật trước khi kiểm tra trực tiếp.

# Thiết kế bộ lọc gọn cho Cập nhật tiến độ

## Mục tiêu

Thu gọn vùng lọc của màn Cập nhật tiến độ để người dùng nhìn thấy tác vụ chính ngay lập tức, đồng thời giữ nguyên toàn bộ khả năng lọc và quy tắc đếm facet hiện có.

## Phạm vi

Chỉ thay đổi cấu trúc hiển thị và CSS của vùng `.pr-loc` trong `UpdatePage`. Không đổi dữ liệu, quyền cập nhật, cách tính số lượng, KPI, phân trang hoặc bảng kết quả.

## Cấu trúc được chọn

Thanh chính luôn hiển thị trên một hàng khi đủ chỗ:

1. Ô tìm kiếm theo mã, tên và QA.
2. Hai nút lọc nhanh `Cần xử lý` và `Quá hạn`, kèm số lượng facet.
3. Nút `Bộ lọc` mở/đóng phần nâng cao và hiển thị số bộ lọc nâng cao đang áp dụng.
4. Bộ đếm `đang hiện / tổng số hạng mục`.
5. Nút `Xóa lọc` chỉ xuất hiện khi có bất kỳ điều kiện nào đang áp dụng.

Phần nâng cao mở ngay dưới thanh chính, không dùng modal hoặc drawer. Nội dung gồm:

- Trạng thái.
- Giai đoạn.
- Kỳ.
- Tùy chọn hiện hạng mục đã ngừng, nếu có dữ liệu.
- Nhóm lỗi chi tiết: thiếu ngày hoàn thành, thiếu deadline VMP, chưa phân công QA và lệch pha hồ sơ.

Hai lựa chọn `Cần xử lý` và `Quá hạn` không lặp lại trong phần nâng cao. Khi một bộ lọc lỗi chi tiết đang bật, phần nâng cao tự mở để trạng thái đang áp dụng không bị che khuất.

## Hành vi và trạng thái

- Tìm kiếm và các bộ lọc tiếp tục dùng state hiện có: `q`, `fix`, `fst`, `stageF`, `period`, `hienNgung`.
- Nút lọc nhanh bật/tắt theo `aria-pressed` và giữ phép đếm facet hiện tại.
- Nút `Bộ lọc` dùng `aria-expanded` và `aria-controls` trỏ tới vùng nâng cao.
- Số trên nút `Bộ lọc` chỉ đếm Trạng thái, Giai đoạn, Kỳ, mục đã ngừng và lỗi chi tiết; không đếm tìm kiếm hoặc hai lọc nhanh.
- `Xóa lọc` gọi đúng `clearFilters` hiện có và đưa danh sách về trạng thái mặc định.
- Gợi ý cho lỗi chi tiết chỉ hiện bên trong vùng nâng cao khi lỗi đó đang được chọn.

## Responsive và accessibility

- Desktop: thanh chính ưu tiên một hàng; ô tìm kiếm co giãn, các nút có chiều cao thống nhất.
- Màn hẹp: ô tìm kiếm chiếm toàn hàng; nhóm hành động xuống hàng nhưng không tạo cuộn ngang.
- Mọi điều khiển dùng `button`, `input`, `select`, `label` thật; vùng nâng cao vẫn nằm trong thứ tự Tab tự nhiên.
- Focus ring hiện rõ; trạng thái chọn có chữ và `aria-pressed`, không phụ thuộc riêng vào màu.
- Kích thước chạm tối thiểu 44px trên mobile.

## Kiểm thử chấp nhận

1. Khi chưa lọc, chỉ thanh chính xuất hiện và phần nâng cao đóng.
2. `Cần xử lý` và `Quá hạn` lọc đúng danh sách và bật/tắt được bằng bàn phím.
3. Mở `Bộ lọc` cho thấy đầy đủ Trạng thái, Giai đoạn, Kỳ, mục đã ngừng và bốn lỗi chi tiết.
4. Chọn lọc nâng cao làm số đếm trên nút thay đổi; tải lại component không che bộ lọc đang bật trong phiên hiện tại.
5. `Xóa lọc` xóa cả tìm kiếm, lọc nhanh và lọc nâng cao.
6. Không có tràn ngang ở 390px và bố cục vẫn gọn ở 1440px.
7. Unit test mô hình lọc, typecheck, E2E mục tiêu và production build đều đạt.

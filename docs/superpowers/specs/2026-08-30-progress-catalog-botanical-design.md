# Thiết kế Botanical Editorial cho Tiến độ và Catalog

## Mục tiêu

Giảm trùng lặp và mật độ thị giác trên hai chế độ của màn Cập nhật tiến độ, giúp người dùng tìm đúng hạng mục và mở hộp nhập nhanh hơn. Giao diện dùng ngôn ngữ thiên nhiên–hoa lá theo hệ Lotus hiện có, không thay đổi nghiệp vụ hoặc đường ghi dữ liệu.

## Phạm vi

- Chế độ `Theo hạng mục`: bỏ dải KPI trùng với thanh lọc và cải tiến bảng tiến độ.
- Chế độ `Theo đối tượng`: bỏ ghi chú “Thêm đối tượng mới…”, thu gọn vùng đầu trang, bộ lọc và các nhóm đối tượng.
- Giữ nguyên `ProgressEditModal`, logic lọc, facet, phân trang, quyền cập nhật, optimistic locking và yêu cầu lý do ALCOA+.
- Không thay đổi các màn khác hoặc component `MetricGrid` dùng ở nơi khác.

## Theo hạng mục

### Nội dung được bỏ

Xóa toàn bộ `MetricGrid` gồm Đang thực hiện, Cần xử lý, Quá hạn và Độ hoàn thiện dữ liệu khỏi `UpdatePage`. Hai hành động quan trọng đã nằm trên thanh lọc; số liệu còn lại không cần lặp lại giữa bộ lọc và bảng.

### Bảng mới

Bảng desktop còn sáu cột:

1. `Hạng mục`: mã và tên trên hai cấp chữ.
2. `Loại`.
3. `QA`.
4. `Mốc & hạn`: giai đoạn hiện tại và deadline trong cùng ô.
5. `Trạng thái`.
6. `Cập nhật`: giữ nút mở hộp nhập hiện tại và đường tắt hoàn thành đang có.

Header bảng cố định trong vùng cuộn. Mã dùng mono, tên dùng chữ chính, thông tin phụ có độ tương phản vừa đủ. Hàng quá hạn có điểm nhấn lá/hoa màu cảnh báo ở mép trái; hàng đang focus giữ viền vàng. Không biến cả hàng thành nút để tránh mở nhầm khi quét bảng.

## Theo đối tượng

### Vùng đầu trang và bộ lọc

- Bỏ hoàn toàn ghi chú “Thêm đối tượng mới ở Danh mục & Nhập liệu…”.
- Giữ tiêu đề, mô tả ngắn và tổng số đối tượng/hạng mục.
- Thanh chính chỉ hiển thị tìm kiếm, nút `Bộ lọc`, bộ đếm kết quả và `Xóa lọc` khi cần.
- Panel nâng cao mở tại chỗ chứa Nhóm, Bộ phận, Tình trạng, Năm và Có thẩm định. Các state `cls`, `dept`, `status`, `year`, `tdinh` tiếp tục lọc theo luật hiện tại.

### Nhóm đối tượng

- Mỗi đối tượng là một accordion có `aria-expanded` và `aria-controls`.
- Dòng đóng hiển thị mã, tên, nhóm/bộ phận/khu vực và tối đa ba chỉ dấu dễ quét: số loại/lần, số hoàn thành, số quá hạn.
- Trạng thái mở dùng nền Lotus nhẹ và một họa tiết cánh hoa CSS ở mép, không dùng ảnh nền mới.
- Các badge trọng yếu, báo cáo và cảnh báo lệch vẫn giữ nguyên ý nghĩa nhưng được chuẩn hóa bằng class thay cho inline style rời rạc.
- Phần mở giữ lối sang Danh mục & Nhập liệu và bảng bốn mốc. Bảng con được làm lại header, khoảng cách, màu hàng và nút Cập nhật; không đổi dữ liệu hoặc hành động.

## Ngôn ngữ thị giác

- Dùng token Lotus hiện có: mận, hồng sen, vàng nhạt, mint và danger.
- Họa tiết thiên nhiên chỉ dùng pseudo-element CSS dạng cánh hoa/đường cong mảnh; không phủ lên dữ liệu.
- Radius theo hệ 10/16/24/999; bóng thấp, viền tóc vàng; tránh gradient mạnh hoặc nhiều badge cạnh tranh.
- Trạng thái được truyền đạt bằng chữ và hình dạng, không chỉ bằng màu.

## Responsive và accessibility

- Desktop ưu tiên quét ngang và giữ header bảng khi cuộn.
- Mobile tiếp tục dùng `MobileTaskList` ở chế độ Theo hạng mục; bảng Catalog con được cuộn ngang trong vùng riêng, không làm tràn toàn trang.
- Tất cả nút tối thiểu 44px trên mobile, có focus ring và tên truy cập.
- Panel bộ lọc Catalog dùng `aria-expanded`, `aria-controls`, label thật cho input/select và thứ tự Tab tự nhiên.
- Accordion Catalog dùng button thật, liên kết đúng panel chi tiết qua id ổn định từ mã đối tượng.

## Kiểm thử chấp nhận

1. Chế độ Theo hạng mục không còn `.lp-metric-grid` nhưng thanh lọc và bảng vẫn hoạt động.
2. Bảng desktop có đúng sáu header đã thiết kế và nút Cập nhật vẫn mở đúng hạng mục.
3. Chế độ Theo đối tượng không còn câu ghi chú đã yêu cầu bỏ.
4. Bộ lọc Catalog đóng mặc định, mở ra đủ năm điều khiển và lọc đúng số nhóm như trước.
5. Accordion đối tượng công bố đúng trạng thái mở/đóng và giữ đủ bảng bốn mốc.
6. Không tràn ngang toàn trang ở 390px; các bảng con chỉ cuộn trong container của chúng.
7. Unit test mục tiêu, E2E hai chế độ, typecheck, build và `git diff --check` đều đạt.

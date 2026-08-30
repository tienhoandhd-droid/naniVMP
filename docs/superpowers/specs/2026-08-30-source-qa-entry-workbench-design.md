# Thiết kế Dữ liệu nguồn — bàn nhập liệu nhanh cho QA

## Mục tiêu

Biến vùng `Đối tượng` của màn Dữ liệu nguồn thành bàn làm việc giúp QA tìm đúng đối tượng, nhận ra dữ liệu còn thiếu và mở cập nhật nhanh. Các công cụ quản trị vẫn tồn tại nhưng không cạnh tranh với tác vụ nhập liệu chính.

Thiết kế chỉ thay đổi cách trình bày và phân cấp hành động. Không thay đổi dữ liệu, quyền, RPC, RLS, phân trang, bộ lọc, nhập Excel, hàng chờ áp dụng, lịch sử, optimistic locking hoặc luật sinh timeline.

## Phạm vi

### Trong phạm vi

- Vùng `Đối tượng` trong `CatalogWorkspaceShell`.
- Bảng/thẻ đối tượng trong `CatalogSmartTable`.
- Cách trình bày cảnh báo chất lượng dữ liệu trong workspace Source.
- CSS responsive và accessibility trực tiếp phục vụ các vùng trên.
- Kiểm thử mục tiêu cho thao tác tìm, lọc, mở đúng đối tượng và mobile.

### Ngoài phạm vi

- Không thiết kế lại form `CatalogObjectForm` hoặc các dataset Sản phẩm GMP, Người nhận cảnh báo, Nhập Excel, Chờ áp dụng và Lịch sử.
- Không thay đổi `SmartTable` dùng chung nếu yêu cầu có thể giải quyết bằng markup/class riêng của Source.
- Không sửa Dòng thời gian VMP, biểu đồ hoặc 3D trong đợt này.
- Không đổi API, migration, quyền phân công QA hoặc hợp đồng dữ liệu.

## Kiến trúc thông tin

Thanh điều hướng dataset bên trái được giữ nguyên vì nó phản ánh đúng các miền nghiệp vụ. Vùng `Đối tượng` được tổ chức theo thứ tự tác vụ:

1. Tìm và thêm đối tượng.
2. Chọn loại đối tượng và lọc khi cần.
3. Nhận biết lỗi dữ liệu chặn timeline.
4. Quét bảng, mở chi tiết hoặc cập nhật.
5. Dùng công cụ dữ liệu ít thường xuyên hơn.

Mô tả dài đầu workspace được rút thành một câu nghiệp vụ ngắn. Phạm vi và thời điểm cập nhật vẫn hiển thị như metadata, không lặp lại tiêu đề trang.

## Thanh hành động

Thanh chính phải giữ một hàng ở màn desktop 1440px:

- Ô tìm kiếm chiếm phần co giãn lớn nhất.
- `Bộ lọc` là hành động phụ và vẫn công bố `aria-expanded`/`aria-controls`.
- `+ Thêm đối tượng` là hành động chính, đặt ở cuối hàng.
- `Tải lại`, `Xuất Excel` và `Sinh timeline` nằm trong disclosure `Công cụ dữ liệu`, mặc định đóng. Disclosure dùng phần tử ngữ nghĩa, thao tác được bằng bàn phím và không tạo menu tự chế.

Ở mobile, tìm kiếm và nút thêm chiếm toàn hàng riêng; disclosure và bộ lọc xuống hàng tự nhiên. Không có cuộn ngang toàn trang.

## Bộ chọn loại và bộ lọc

- Giữ nguyên năm loại và giá trị lọc hiện có.
- Dải chọn loại dùng nhịp tab/pill rõ trạng thái, họa tiết cánh lá nhỏ bằng CSS và không che chữ.
- Panel bộ lọc vẫn đóng mặc định, giữ đủ sáu trường hiện tại cùng phép giao điều kiện.
- Chip bộ lọc tiếp tục bỏ từng điều kiện chính xác; `Xóa bộ lọc` đưa toàn bộ state về mặc định.
- Bộ đếm kết quả dùng live region hiện có và phải khớp dữ liệu bảng/thẻ.

## Cảnh báo chất lượng dữ liệu

`CatalogWarningsSummary` vẫn mở mặc định các cảnh báo chặn timeline để QA không bỏ sót lỗi bắt buộc. Phần trình bày được thu gọn:

- Dòng tổng hợp nêu số nhóm lỗi và số nhóm chặn.
- Các nhóm cảnh báo dùng khoảng cách nhỏ hơn, viền semantic và nút disclosure rõ ràng.
- Mã đối tượng vẫn đọc được đầy đủ; trạng thái không truyền đạt chỉ bằng màu.
- Cảnh báo không phủ lên hoặc thay đổi dữ liệu bảng.

## Bảng đối tượng QA

Bảng desktop có sáu cột nghiệp vụ:

1. `Đối tượng`: mã trên dòng nhấn mạnh, tên bên dưới; đây là cột rộng nhất.
2. `Bộ phận · Khu vực`.
3. `Lịch thẩm định`: trạng thái, tháng đầu và tần suất trong cùng ô.
4. `QA phụ trách`.
5. `Trọng yếu`.
6. `Cập nhật`: nút mở form đúng bản ghi.

Nút `Chi tiết` do `SmartTable` cung cấp vẫn tồn tại như disclosure riêng, vì xem toàn bộ metadata và cập nhật là hai ý định khác nhau. Nhãn hành động đổi từ `Sửa` sang `Cập nhật` nhưng callback và quyền không đổi.

Tên đối tượng không bị ép xuống từng từ ở desktop. Hàng được phân cấp bằng mã màu mận, tên đậm vừa, metadata dịu và viền cảnh báo ở đối tượng thiếu dữ liệu. Không biến toàn bộ hàng thành nút.

## Mobile

`MobileTaskList` tiếp tục nhận chính mảng rows của desktop. Mỗi thẻ hiển thị:

- Mã và trạng thái kế hoạch.
- Tên đối tượng.
- Bộ phận/khu vực.
- QA phụ trách.
- Lịch thẩm định hoặc lỗi thiếu tháng.
- Nút `Cập nhật` cao tối thiểu 44px khi có quyền.

Thẻ không lặp thông tin ít quan trọng và không làm tràn viewport 390px.

## Ngôn ngữ thị giác

- Dùng token Lotus hiện có: nền raised, mận, hồng sen, vàng hairline, mint và danger.
- Họa tiết thiên nhiên chỉ là pseudo-element cánh lá hoặc đường cong mảnh ở tiêu đề/dải loại; không thêm ảnh nền hoặc gradient mạnh.
- Radius theo hệ hiện có; bóng thấp; focus ring luôn nhìn thấy.
- Trạng thái dùng đồng thời chữ, hình dạng và màu.
- Tôn trọng `prefers-reduced-motion`.

## Dữ liệu, lỗi và quyền

- Mọi bộ lọc, cursor và phân trang tiếp tục dùng model hiện tại.
- Loading, error, filtered-empty và empty tiếp tục dùng `StateBoundary`.
- Nút cập nhật chỉ render khi `canEdit`; quyền server vẫn fail-closed.
- Lưu thất bại giữ nguyên form và dữ liệu vừa nhập; version conflict tiếp tục hiển thị bản server.
- Không đưa dữ liệu phòng ban, QA hoặc cảnh báo từ nguồn khác vào bảng nếu record hiện tại không cung cấp.

## Kiểm thử chấp nhận

1. Desktop 1440px giữ thanh hành động chính trên một hàng; tìm kiếm không bị bó hẹp và nút thêm nổi bật.
2. `Công cụ dữ liệu` mặc định đóng, mở ra đủ Tải lại, Xuất Excel và Sinh timeline theo đúng quyền hiện hành.
3. Bảng đối tượng có đúng sáu header nghiệp vụ; ô Đối tượng chứa cả mã và tên.
4. `Cập nhật` mở đúng form của mã được chọn; `Chi tiết` vẫn mở đúng dòng và giữ đủ metadata.
5. Các bộ lọc hiện tại tiếp tục trả đúng cùng tập rows, chip bỏ đúng điều kiện và bộ đếm khớp.
6. Cảnh báo chặn timeline vẫn mở mặc định và đọc được bằng bàn phím/trình đọc màn hình.
7. Mobile 390px dùng cùng rows, không tràn ngang và mọi nút trong thẻ cao tối thiểu 44px.
8. Unit test mục tiêu, một E2E Source mục tiêu, typecheck, production build và `git diff --check` đều đạt.

## Ranh giới với Dòng thời gian VMP

Dòng thời gian sẽ được phân tích trong một đặc tả riêng sau khi bàn nhập liệu Source hoàn tất. Đợt này không chỉnh Gantt, sơ đồ, model tổng hợp hoặc `WorkloadSpace3D`.

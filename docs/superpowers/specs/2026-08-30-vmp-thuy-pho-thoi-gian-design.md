# Thiết kế VMP “Thủy phổ thời gian”

## 1. Mục tiêu

Thay cảnh “trường hà” trong mục Giám sát bằng một bản đồ thời gian trừu tượng, giúp người xem trả lời nhanh bốn câu hỏi:

1. Thiết bị nào đến hạn VMP vào ngày nào?
2. Thiết bị đang ở giai đoạn tiến độ nào?
3. Thiết bị nào đã quá hạn hoặc sắp đến hạn?
4. Khi chọn một thiết bị, hành động tiếp theo là gì?

Thiết kế vẫn dùng cá chibi làm hình ảnh nhận diện, nhưng không mô phỏng một con sông hay cảnh quan tự nhiên.

## 2. Phạm vi

- Chỉ thay phần trực quan dòng thời gian VMP trong mục Giám sát.
- Giữ nguyên dữ liệu, quy tắc phân quyền và cách tính hạn hiện có.
- Không thêm trường dữ liệu, API, RPC hoặc thay đổi cơ sở dữ liệu.
- Không thiết kế lại các màn hình Giám sát khác.

## 3. Ngôn ngữ hình ảnh

### 3.1. Nền “thủy phổ”

- Nền là mặt lụa màu ngà pha xanh xám rất nhạt, không có núi, bờ sông, hoa sen hoặc đường chân trời.
- Ba đến năm dải chuyển sắc mờ chạy ngang gợi dòng thời gian; các dải chỉ tạo nhịp thị giác, không mang dữ liệu.
- Thớ giấy rất nhẹ và đồng nhất với chất liệu cá; không dùng ảnh phong cảnh làm nền.
- Các vạch tháng, ngày và đường “Hôm nay” nằm trên cùng hệ lưới để vị trí thời gian luôn đọc được.

### 3.2. Cá tiến độ

- Giữ dáng cá chibi tròn đã được duyệt, hướng bơi thống nhất từ trái sang phải.
- Bỏ hiệu ứng “chìm dưới nước”, lớp màn nước và khúc xạ phức tạp.
- Cá dùng sắc độ hơi trầm, viền cùng tông và không có bóng đổ kiểu sticker.
- Sáu màu biểu diễn đúng sáu trạng thái:
  - Xám mực: chưa hoàn thành đề cương.
  - Lam chàm: hoàn thành đề cương.
  - Lục ngọc: hoàn thành thẩm định thực tế.
  - Tím khói: hoàn thành báo cáo.
  - Hoàng thổ: hoàn thành VMP.
  - Chu sa: quá hạn VMP.
- Màu quá hạn ghi đè màu tiến độ trên thân cá; thẻ chi tiết vẫn hiển thị giai đoạn thực tế trước khi quá hạn.

### 3.3. Tín hiệu ưu tiên

- Quá hạn: cá màu chu sa và một vòng gợn mảnh, không nhấp nháy.
- Sắp đến hạn: vòng gợn màu hoàng thổ nhạt; thân cá vẫn giữ màu giai đoạn.
- Bình thường: không có vòng gợn.
- Không thêm nhiều huy hiệu lên thân cá; toàn bộ chi tiết nằm trong tooltip và thẻ thông tin.

## 4. Bố cục và ánh xạ dữ liệu

### 4.1. Trục thời gian

- Khung chính hiển thị ba tháng: tháng trước, tháng hiện tại và tháng kế tiếp.
- Tọa độ ngang của mỗi cá được tính trực tiếp từ hạn VMP trong cửa sổ ba tháng.
- Thiết bị ngoài cửa sổ không bị ép vào hai mép; hai chỉ báo ở mép trái/phải cho biết còn bao nhiêu thiết bị ngoài khung.
- Thanh tổng quan 12 tháng phía trên thể hiện vị trí cửa sổ ba tháng và cho phép chuyển cửa sổ thời gian.

### 4.2. Luồng bơi chống chồng lấn

- Tọa độ dọc không biểu diễn độ sâu. Nó là các luồng bố trí kín đáo dùng để tránh cá chồng lên nhau.
- Cá được xếp vào luồng trống gần nhất theo thứ tự hạn VMP; cùng dữ liệu phải luôn cho cùng một bố cục.
- Khi mật độ quá cao, cá vẫn giữ đúng tọa độ thời gian; hệ thống tăng số luồng trong giới hạn chiều cao thay vì dịch hạn sang ngày khác.
- Nếu một ngày có quá nhiều thiết bị để hiển thị rõ, cụm cá được gom thành một cụm có số lượng. Chọn cụm sẽ mở danh sách đúng ngày đó.

### 4.3. Thẻ thông tin

- Chọn một cá sẽ tạo đường nối mảnh tới thẻ thông tin cố định bên dưới bản đồ.
- Thẻ gồm: tên/mã thiết bị, hạn VMP, trạng thái màu, số ngày còn lại hoặc quá hạn, giai đoạn thực tế và bước tiếp theo.
- Không lặp lại cùng thông tin ở nhiều khối trong màn hình.

## 5. Tương tác và khả năng tiếp cận

- Hover hoặc focus hiển thị tooltip ngắn; click, Enter hoặc Space chọn cá.
- Cá được chọn tăng kích thước vừa phải nhưng không đổi hệ màu hoặc tách khỏi nền.
- Có chú giải sáu màu luôn nhìn thấy; màu không phải tín hiệu duy nhất vì tooltip và thẻ đều ghi tên trạng thái.
- Mọi cá có nhãn truy cập gồm tên thiết bị, trạng thái và ngày hạn.
- Tôn trọng `prefers-reduced-motion`; chuyển động bơi chỉ là dịch chuyển rất nhẹ và không làm thay đổi tọa độ deadline.
- Trên màn hình hẹp, bản đồ cho phép cuộn ngang; không nén ba tháng đến mức cá và nhãn mất khả năng đọc.

## 6. Thành phần dự kiến

- `TimeOverview`: thanh tổng quan 12 tháng và cửa sổ ba tháng.
- `TimeCanvas`: trục ngày, nền thủy phổ và đường hôm nay.
- `FishMarker`: cá tiến độ, trạng thái chọn và tooltip.
- `FishCluster`: cụm thiết bị có cùng vùng thời gian khi quá mật độ.
- `SelectionConnector`: đường nối từ cá được chọn đến thẻ chi tiết.
- `DeviceDetail`: thông tin duy nhất của thiết bị được chọn.
- `StatusLegend`: chú giải sáu trạng thái.

Các thành phần chỉ nhận dữ liệu trình bày đã được chuẩn hóa; quy tắc ánh xạ ngày, màu và xếp luồng nằm trong hàm thuần để có thể kiểm thử độc lập.

## 7. Trạng thái biên và lỗi

- Không có thiết bị trong cửa sổ: giữ trục thời gian và hiển thị thông báo ngắn cùng thao tác quay về tháng hiện tại.
- Hạn VMP không hợp lệ hoặc bị thiếu: không đặt cá lên bản đồ; đưa mục vào cảnh báo dữ liệu cần bổ sung.
- Dữ liệu đang tải: dùng skeleton theo hình trục thời gian, không dùng cá giả.
- Lỗi tải: hiển thị thông báo lỗi và nút thử lại, không giữ dữ liệu cũ mà không có cảnh báo.

## 8. Kiểm thử và tiêu chí nghiệm thu

- Kiểm thử đơn vị cho ánh xạ ngày sang tọa độ, sáu màu trạng thái, ghi đè quá hạn, xếp luồng và gom cụm.
- Kiểm thử UI đích cho chọn cá, điều hướng bàn phím, tooltip, thẻ chi tiết và chuyển cửa sổ ba tháng.
- Kiểm thử một luồng E2E tại mục Giám sát với dữ liệu có đủ: bình thường, sắp hạn, quá hạn và nhiều thiết bị cùng ngày.
- Chạy typecheck và build trước khi bàn giao.
- Nghiệm thu thị giác ở 1366 px và 1920 px: cá không chồng không kiểm soát, ngày hạn đọc đúng, sáu màu phân biệt được, nền không lấn át dữ liệu và không còn yếu tố phong cảnh trường hà.

## 9. Ngoài phạm vi

- Không tạo mô hình 3D, canvas vật lý hoặc hoạt cảnh đàn cá phức tạp.
- Không thay đổi quy trình nghiệp vụ VMP.
- Không dùng hình cá để mã hóa thêm bộ phận, người phụ trách hoặc loại thẩm định; các thuộc tính này chỉ xuất hiện trong bộ lọc và thẻ chi tiết.

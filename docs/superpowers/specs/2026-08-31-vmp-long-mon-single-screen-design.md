# Thiết kế Long Môn VMP trong một bức tranh toàn màn hình

## Mục tiêu

Người xem phải nhìn được toàn bộ đàn cá trong cửa sổ ba tháng bằng một bức tranh duy nhất, không cuộn dọc bên trong ngư đồ. Chế độ cá nhân ít cá phải được tái bố trí thành một đội hình cân đối, không giữ khoảng trống và chiều cao dành cho cả nhóm.

Thay đổi chỉ áp dụng cho bố cục Long Môn. Phạm vi quyền, dữ liệu, sáu trạng thái VMP, cách xác định tuần và chi tiết mở khi bấm cá không đổi.

## Kích thước bức tranh

### Desktop và tablet ngang

- Long Môn chiếm toàn bộ chiều rộng vùng nội dung còn lại sau sidebar.
- Phần mặt nước dùng chiều cao cố định theo viewport, không theo `laneCount`: `clamp(460px, 62dvh, 640px)`.
- Toàn bộ thẻ gồm tiêu đề, mặt nước và chú giải phải nằm gọn trong một lượt xem ở viewport kiểm thử 1440×1000. Trang không tạo thanh cuộn dọc riêng cho mặt nước.
- Ba tháng luôn nằm trọn trong chiều rộng bức tranh. Không có thao tác kéo ngang trên desktop từ 1024px trở lên.

### Mobile

- Mặt nước cao `min(62dvh, 560px)` và không cuộn dọc nội bộ.
- Giữ canvas tối thiểu 880px để cá và nhãn tuần không bị thu quá nhỏ. Người dùng được kéo ngang để xem ba tháng; đây vẫn là một bức tranh liên tục, không chia trang và không chia slide.
- Khi đổi từ cả nhóm sang cá nhân, vị trí cuộn ngang được đưa tới vùng chứa đàn cá hoặc vạch hôm nay gần nhất.

## Hai chiến lược bố cục

Model nhận thêm `audience: "team" | "personal"` và kích thước vùng vẽ chuẩn. Kết quả trả về tọa độ `xPct/yPct`, tỷ lệ, góc bơi và kích thước hộp va chạm; component chỉ chuyển thành CSS variables.

### Cả nhóm

- Cá vẫn được neo vào vùng tuần theo hạn VMP. Tọa độ chính xác không biểu diễn ngày; ngày chỉ hiện khi bấm.
- Trên toàn chiều cao cố định, model tạo 6–9 dòng nước cong. Mỗi dòng có pha và biên độ khác nhau để không tạo hàng ngang.
- Với từng cá, hash ổn định từ ID sinh thứ tự các vị trí ứng viên quanh vùng tuần. Bộ xếp hai chiều chọn vị trí đầu tiên không va chạm.
- Tuần đông không tạo một cột dọc. Model sinh một đám điểm so le hai chiều quanh tâm tuần theo vòng xoắn vàng đã làm dẹt, rồi uốn các điểm theo dòng nước. Cách này tạo nhiều cao độ và nhiều tọa độ ngang khác nhau nhưng vẫn giữ đàn cá gần đúng vùng tuần.
- Các tuần được xếp theo mật độ giảm dần: tuần nhiều cá được giữ vùng trống trước, sau đó tuần thưa mới điền vào các khoảng còn lại. Kiểm tra va chạm là toàn cục nên cá ở hai tuần kế bên cũng không đè nhau.
- Khi mật độ tăng, model thử lại toàn đàn theo ba mức tỷ lệ `1`, `0.91`, `0.82`; mọi cá trong cùng một lần vẽ dùng chung mức mật độ để tranh không lộn xộn.
- Vùng tuần được phép nới thành một cụm rộng tối đa hai lần chiều rộng tuần để xếp so le. Tâm cụm vẫn nằm tại tuần và `data-week` không đổi.
- Mức chấp nhận tối thiểu: 48 cá trong ba tháng và 12 cá cùng một tuần phải cùng nằm trong mặt nước cố định, không chồng hộp và không làm tăng chiều cao.

### Cá nhân

- Không tái sử dụng tọa độ của đội hình cả nhóm. Mỗi lần chọn người QA, model tính lại bố cục từ tập cá đã lọc.
- 1 cá: đặt tại cao độ trung tâm, vẫn giữ đúng vùng tuần theo trục ngang.
- 2–4 cá: xếp thành vòng cung nông, xen kẽ trên và dưới tâm tranh.
- 5–12 cá: xếp theo đường chữ S mềm gồm hai dải so le, ưu tiên khoảng thở rộng và tỷ lệ `1.02–1.08`.
- Trên 12 cá: dùng chiến lược cả nhóm nhưng bắt đầu ở mật độ rộng nhất.
- Tọa độ và góc vẫn là giả ngẫu nhiên ổn định theo ID. Tải lại hoặc chuyển đi rồi quay lại cùng một người phải cho cùng đội hình.
- Cá của các tuần xa nhau không bị kéo về giữa theo trục ngang; “cân đối” chỉ áp dụng cho cao độ và nhịp phân bố, không làm sai thứ tự thời gian.

## Mỹ thuật và khả năng đọc

- Tranh tĩnh hoàn toàn; không thêm animation.
- Sáu loài giữ sprite và màu hiện tại. Góc bơi lấy từ tiếp tuyến gần đúng của dòng cong, cộng sai lệch tối đa 1.5° theo ID.
- Mã thiết bị luôn hiện trên desktop. Ở mức mật độ `0.82`, nhãn được giữ nguyên cỡ chữ và tách khỏi phép scale của thân cá.
- Cá có vùng bấm tối thiểu 44×44px, focus ring rõ và thứ tự bàn phím theo deadline rồi mã thiết bị, không theo tọa độ ngẫu nhiên.
- Chỉ dùng các lớp dòng nước và khoảng trống đang có; không thêm sen, bong bóng hoặc họa tiết trang trí mới.

## Thuật toán đóng gói cố định

1. Tính vùng ba tháng và các dải tuần như hiện tại.
2. Chọn chiến lược theo `audience` và số cá.
3. Sinh danh sách điểm ứng viên xác định từ ID trên các đường cong trong hình chữ nhật chuẩn 820×520.
4. Sắp tuần theo số cá giảm dần, sau đó sắp cá trong tuần theo deadline và mã; thử điểm theo thứ tự hash riêng của từng cá. Kết quả cuối cùng vẫn trả theo deadline và mã để giữ thứ tự bàn phím.
5. Kiểm tra va chạm bằng kích thước đã nhân theo mức mật độ, gồm thân cá và nhãn mã.
6. Nếu còn cá chưa đặt, giảm toàn bộ đàn sang mức mật độ kế tiếp và chạy lại từ đầu.
7. Nếu fixture vượt năng lực thiết kế (trên 48 cá hoặc trên 12 cá một tuần), vẫn hiển thị mọi cá ở mức `0.82` và ghi cảnh báo kỹ thuật vào console trong môi trường phát triển; không gộp, giấu hoặc thay bằng con số. Trường hợp này được ghi nhận là giới hạn dữ liệu cần đánh giá tiếp, không tự làm tăng chiều cao.

Không dùng `Math.random`; không lưu tọa độ vào database và không thay đổi dữ liệu nghiệp vụ.

## Luồng dữ liệu và ranh giới component

1. `TimelinePage` tiếp tục lọc dữ liệu theo vai trò và người QA.
2. `LongMonRace` truyền `scopeControl.audience` vào model; khi không có `scopeControl`, mặc định `team` để giữ tương thích.
3. `buildLongMonRaceModel` nhận tùy chọn bố cục, trả `densityScale` và tọa độ phần trăm trong mặt nước chuẩn 820×520; model không quyết định chiều cao DOM.
4. CSS quyết định kích thước viewport thực tế; tọa độ phần trăm co giãn theo mặt nước mà không cần đo DOM hoặc chạy lại layout trong effect.
5. Đổi Cả nhóm/Cá nhân chỉ dựng lại model; không gọi thêm API và không thay KPI hoặc bảng Timeline.

## Trạng thái rỗng và chuyển phạm vi

- Cá nhân không có cá: giữ bức tranh ở chiều cao tối thiểu, empty state nằm giữa mặt nước.
- 1–2 cá không bị phóng quá lớn; chỉ tăng tối đa 8% so với kích thước chuẩn.
- Khi đổi phạm vi, tranh cập nhật tức thời. Không dùng hiệu ứng bay hoặc tween vị trí.
- `aria-live` chỉ đọc số cá và tên phạm vi, không đọc lại toàn bộ đàn.

## Kiểm thử chấp nhận

1. Unit test xác nhận chiều cao scene không phụ thuộc `laneCount` và không tăng giữa fixture 1, 12, 48 cá.
2. Unit test 1, 4 và 10 cá cá nhân tạo đội hình trung tâm/vòng cung/chữ S; cùng input cho cùng kết quả.
3. Unit test 48 cá toàn nhóm và 12 cá cùng tuần không có cặp hộp va chạm, có ít nhất 6 tọa độ ngang và 6 cao độ khác nhau trong tuần đông, tất cả tọa độ nằm trong scene.
4. Unit test hai tuần đông liền kề xác nhận phép va chạm toàn cục và kết quả không phụ thuộc thứ tự input.
5. Component test xác nhận `audience` được truyền vào model, canvas dùng lớp fixed-scene và không có style height từ `laneCount`.
6. E2E 1440×1000: toàn bộ đầu tranh, mặt nước và chú giải xuất hiện trong một viewport; viewport Long Môn không cuộn dọc.
7. E2E chuyển sang một QA ít cá: chiều cao tranh không đổi, cá được tái bố trí rộng và không còn giữ tọa độ của đàn nhóm.
8. E2E mobile 390px: không cuộn dọc nội bộ, được kéo ngang, mọi cá vẫn nằm trong canvas và bấm mở đúng deadline.
9. Chạy targeted unit, targeted E2E, typecheck và production build; không mở rộng sang bộ regression ngoài Long Môn.

## Ngoài phạm vi

- Không sửa RPC, RLS, Supabase, dữ liệu deadline hoặc ma trận quyền.
- Không tạo chế độ toàn màn hình bằng modal và không thêm nút phóng to.
- Không đổi tranh nền hoặc sprite cá đã được duyệt.
- Không áp chiến lược bố cục này cho biểu đồ khác.

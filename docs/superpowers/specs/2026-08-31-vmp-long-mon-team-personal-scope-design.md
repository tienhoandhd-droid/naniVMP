# Thiết kế phạm vi Cả nhóm/Cá nhân cho Ngư đồ Long Môn

Ngày chốt: 31/08/2026

## Mục tiêu

Làm đàn cá dễ đọc hơn bằng cách tổ chức theo vùng tuần và cho phép thu hẹp ngư đồ theo người QA, đồng thời giữ đúng ranh giới quyền:

- Admin và Quản lý QA được xem ngư đồ của cả nhóm hoặc chọn một cá nhân QA.
- Nhân viên QA chỉ được xem ngư đồ của chính mình.
- Không thay đổi dữ liệu, trạng thái tiến độ, deadline hay cách ánh xạ sáu loài cá.
- Không để cá hoặc nhãn thiết bị xếp chồng lên nhau.

## Trải nghiệm đã chốt

### Admin và Quản lý QA

Trong đầu thẻ Long Môn có bộ chuyển hai trạng thái bằng nút thật, hỗ trợ bàn phím:

1. **Cả nhóm QA** — hiển thị toàn bộ hạng mục mà máy chủ cho tài khoản quản lý nhìn thấy.
2. **Cá nhân** — mở ô chọn một người QA; ngư đồ chỉ còn hạng mục người đó phụ trách chính hoặc hỗ trợ.

Mặc định khi mở trang là **Cả nhóm QA**. Khi lần đầu chuyển sang **Cá nhân**, ưu tiên người đang đăng nhập nếu tài khoản có `personId` trong danh sách; nếu không thì chọn người đầu tiên theo thứ tự tên. Lựa chọn cá nhân được giữ trong thời gian component còn được mount.

### Nhân viên QA

- Không render bộ chuyển **Cả nhóm QA/Cá nhân**.
- Không render danh sách người QA khác.
- Tiêu đề phạm vi là **Ngư đồ của tôi**.
- Chỉ lấy hạng mục có `owner_person_id` hoặc `support_person_id` trùng `personId` của phiên hiện tại.
- Nếu tài khoản chưa liên kết `personId`, fail-closed: không hiện cá và hiển thị hướng dẫn nhờ Admin nối hồ sơ nhân sự.

### Vai trò khác

Không mở thêm quyền. Component chỉ sử dụng tập dữ liệu mà RPC và ScreenGuard hiện tại đã cho phép. Nếu một vai trò khác được phép vào Timeline theo cấu hình hiện tại, ngư đồ giữ tập dữ liệu server đã cấp và không xuất hiện bộ chọn QA.

## Bố cục

- Bộ chuyển phạm vi nằm ở góc phải phần đầu ngư đồ, cùng cấp với tiêu đề nhưng tách khỏi chú thích hướng nước.
- Dưới bộ chuyển là dòng tóm tắt: `18 cá · Cả nhóm QA` hoặc `5 cá · Nguyễn Văn A`.
- Khi chọn cá nhân, chiều rộng thẻ không đổi; chỉ đàn cá và tổng số trong chú giải cập nhật.
- Mobile xếp bộ chuyển và ô chọn thành một cột, điều khiển rộng toàn hàng; không mở thêm lớp phủ hay tab trình duyệt.

## Bản đồ theo vùng tuần

- Dòng sông ba tháng được chia thành các vùng tuần liên tiếp. Ranh giới tuần là dải sáng hoặc nhãn nhỏ, không dùng lưới ô cứng.
- Deadline chỉ quyết định cá thuộc vùng tuần nào; cá không còn bị ép vào tọa độ chính xác của từng ngày.
- Trong một vùng tuần, thuật toán xếp cá theo các luồng bơi cong và ổn định, với hộp va chạm bao gồm cả thân cá lẫn nhãn mã thiết bị.
- Khoảng cách tối thiểu giữa hai hộp va chạm là 8px. Thuật toán phải xác định theo dữ liệu và thứ tự ổn định, không dùng `Math.random`.
- Nếu một tuần đông cá, vùng tuần bổ sung hàng bơi theo chiều dọc và chiều cao canvas tăng trong giới hạn cuộn hiện có. Không thu cá dưới vùng bấm 44×44px, không giấu cá và không gộp thành con số.
- Các tuần liền kề cùng tham gia phép kiểm tra va chạm để cá ở hai bên ranh giới không đè lên nhau.
- Vạch **Hôm nay** và nhãn tháng vẫn giữ. Nhãn tuần thể hiện khoảng `dd/mm–dd/mm` để người xem đọc mật độ theo tuần.
- Ngày hạn VMP chính xác không được suy từ vị trí cá. Bấm cá mở chi tiết và phải thấy rõ `Hạn VMP: dd/mm/yyyy` cùng mã, tên, người QA và trạng thái.

## Chuyển động riêng theo loài

Chuyển động chỉ diễn ra trong phạm vi nhỏ quanh vị trí đã xếp, tối đa 4px tịnh tiến và 2° xoay; không làm cá đổi vùng tuần và không ảnh hưởng vùng bấm. Hộp va chạm phải tính cả biên độ chuyển động này:

- **Cá trê xám · chưa xong đề cương:** lướt chậm, đuôi nghiêng nhẹ; nhịp dài và trầm.
- **Cá lia thia lam · xong đề cương:** rung vây mềm, thân gần như đứng yên.
- **Cá chép ngọc · xong thực tế:** tiến–lùi đều và nhấp nhẹ theo dòng nước.
- **Cá thần tiên tím · xong báo cáo:** trôi lên–xuống thanh, biên độ nhỏ.
- **Cá rồng vàng · hoàn thành VMP:** lướt dài, uyển chuyển và chậm nhất.
- **Cá nóc chu sa · quá hạn VMP:** nảy ngắn, hơi nghiêng, tạo cảm giác khẩn nhưng không giật liên tục.

Animation áp vào sprite/wake bên trong; wrapper và button giữ nguyên để nhãn, tooltip, focus ring và click target không rung. Mỗi cá có độ trễ âm xác định từ ID để đàn cá không chuyển động đồng bộ. Khi `prefers-reduced-motion: reduce`, tắt animation nhưng giữ nguyên đội hình tĩnh.

## Kiến trúc và luồng dữ liệu

1. `App` truyền `businessRole` và `currentPersonId` vào `TimelineView`.
2. Một model thuần trong feature monitoring quyết định khả năng xem nhóm, chuẩn hóa phạm vi yêu cầu và lọc hạng mục theo person ID.
3. Model bố cục Long Môn chuyển từ neo ngày sang vùng tuần, xếp hộp va chạm không chồng lấn và sinh biến nhịp bơi ổn định theo ID.
4. `TimelineView` giữ trạng thái `team | personal` và `selectedPersonId`, chỉ lọc tập dữ liệu dành cho `LongMonRace`.
5. KPI, bảng Timeline và các bộ lọc khác không đổi trong đợt này.
6. `LongMonRace` nhận tập hạng mục đã lọc cùng metadata/handler của điều khiển phạm vi; component không tự suy quyền.

Nguồn danh sách cá nhân tái sử dụng `buildPersonProgressChoices(acts)`. Việc đối chiếu “của tôi” tái sử dụng quy tắc chính tắc: phụ trách chính hoặc hỗ trợ có person ID trùng khớp; không lọc bằng tên để tránh trùng tên.

## Ranh giới bảo mật

- `rpc_get_vmp_dashboard` hiện chỉ trả Source object mà `vmp_can_view_source_object` cho phép. Với `qa_staff`, predicate này yêu cầu performer của phiên là người phụ trách chính hoặc hỗ trợ.
- Lọc frontend là lớp trình bày bổ sung, không thay server authorization.
- Mọi trạng thái không hợp lệ đối với `qa_staff` (kể cả cố yêu cầu `team`) đều được chuẩn hóa về `personal` và person ID của phiên.
- Không cần migration hoặc thao tác remote cho thay đổi này.

## Trạng thái rỗng và lỗi

- Cá nhân không có hạng mục trong ba tháng: dùng empty state Long Môn hiện tại, bổ sung tên phạm vi.
- Tài khoản QA chưa có `personId`: thông báo rõ “Tài khoản chưa liên kết hồ sơ nhân sự”, không rơi về cả nhóm.
- Danh sách quản lý không có QA nào: vô hiệu hóa chế độ cá nhân và giải thích “Chưa có phân công QA trong dữ liệu hiện tại”.

## Truy cập

- Dùng `<button type="button" aria-pressed>` cho hai lựa chọn phạm vi.
- Dùng `<label>` gắn với `<select>` chọn QA.
- Focus ring luôn nhìn thấy; trạng thái không chỉ dựa vào màu.
- Thay đổi số cá có vùng `aria-live="polite"` ngắn, không đọc lại cả ngư đồ.

## Kiểm thử chấp nhận

1. Unit test ma trận quyền: Admin/Quản lý QA có `team` và `personal`; QA staff luôn bị khóa `personal`; thiếu `personId` trả danh sách rỗng.
2. Unit test lọc theo owner và support ID, không dùng tên.
3. Component test: quản lý thấy hai nút và select khi ở cá nhân; QA staff không có các điều khiển đó.
4. Unit test bố cục vùng tuần: cá đúng tuần, không có hai hộp va chạm, kết quả ổn định và tuần đông tự thêm hàng.
5. Component test xác nhận sáu lớp chuyển động riêng và reduced-motion không làm mất đội hình.
6. Một E2E quản lý: chuyển từ cả nhóm sang một QA làm giảm/đổi số cá; mọi cá không chồng lấn; bấm cá thấy đúng ngày hạn và mở hồ sơ hoạt động.
7. Kiểm tra desktop 1440px và mobile 390px; typecheck và production build.

## Ngoài phạm vi

- Không sửa RPC, RLS, migration hay quyền màn hình.
- Không áp phạm vi mới lên KPI, bảng Timeline hoặc các màn khác.
- Không đổi tranh nền, sprite cá hoặc màu trạng thái.
- Không lưu lựa chọn lên server hoặc URL trong đợt này.

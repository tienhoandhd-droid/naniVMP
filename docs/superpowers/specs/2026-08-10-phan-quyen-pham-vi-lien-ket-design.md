# Thiết kế tinh gọn Phân quyền & tài khoản và chọn phạm vi liên kết

Ngày: 2026-08-10  
Trạng thái: Đã duyệt, sẵn sàng triển khai

## 1. Mục tiêu

Màn Phân quyền & tài khoản chỉ giữ phần quản trị đang dùng và bảng quy tắc hiện tại. Các khối phân quyền legacy, hướng dẫn dài và các dòng cấu hình trùng lặp bên dưới bị loại khỏi giao diện.

Các trường phạm vi không cho nhập mã bằng tay. Người quản trị chọn dữ liệu có sẵn theo quan hệ:

`Bộ phận → Xưởng → Khu vực → Line`

Mỗi tầng phạm vi cho phép chọn nhiều giá trị. Danh sách ở tầng con chỉ chứa dữ liệu thuộc ít nhất một lựa chọn hợp lệ ở tầng cha.

## 2. Phạm vi

### Trong phạm vi

- Tinh gọn trang để chỉ còn danh bạ nhân sự & quyền, thao tác phân công cần thiết và bảng quyền hiệu lực/quy tắc hiện tại.
- Bỏ ba khối legacy đang được giữ để đối chiếu preview và phần hướng dẫn dài phía dưới.
- Giữ một bộ phận chính cho mỗi nhân sự.
- Cho phép chọn nhiều bộ phận, xưởng, khu vực và line trong phạm vi quyền.
- Bổ sung danh mục chuẩn xưởng và quan hệ xưởng–khu vực–line.
- Tự điền hồ sơ và phạm vi đã lưu khi chọn nhân sự có sẵn.
- Dùng danh bạ làm nguồn tên người thực hiện duy nhất; các bảng nghiệp vụ chỉ chọn người có sẵn.
- Lưu bản nháp bằng một lần xác nhận, kiểm tra nguyên khối tại máy chủ và ghi nhật ký.
- Tải lại bảng quyền hiệu lực sau khi lưu thành công.

### Ngoài phạm vi

- Không đổi cơ chế tạo tài khoản Supabase Authentication.
- Không tự động bật chế độ áp dụng quyền thật (`enforced`).
- Không cho phép suy đoán xưởng từ tên line hoặc chuỗi nhập tự do.
- Không tự lưu sau mỗi lần chọn hoặc bỏ chọn.
- Không thay đổi các quy tắc phân quyền nghiệp vụ ngoài việc bổ sung điều kiện phạm vi chuẩn hóa.

## 3. Giao diện trang

Trang giữ một workspace chính gồm:

1. **Danh bạ nhân sự & quyền** — tìm/chọn nhân sự, hiển thị trạng thái tài khoản và chỉnh hồ sơ/phạm vi.
2. **Phân công theo hạng mục** — chỉ dùng người đã chọn từ danh bạ chuẩn.
3. **Quyền hiệu lực theo từng đầu mục** — bảng quy tắc hiện tại theo nhân viên hoặc theo hạng mục.

Các khối legacy bị bỏ khỏi JSX của trang:

- Ai được phép có tài khoản.
- Ma trận vai trò × quyền cũ.
- Ma trận trách nhiệm & quyền cũ.
- Khối “Từ ma trận này làm gì tiếp” và hướng dẫn legacy liên quan.

Không xóa dữ liệu hoặc bảng database legacy trong hạng mục này. Việc bỏ chỉ áp dụng cho phần hiển thị để tránh thay đổi dữ liệu ngoài yêu cầu.

## 4. Hồ sơ nhân sự và tự điền

Người quản trị tìm theo họ tên, email hoặc mã nhân viên. Khi chọn đúng một nhân sự có sẵn, giao diện tự điền:

- Họ và tên.
- Mã nhân viên.
- Email và trạng thái nối tài khoản.
- Bộ phận chính.
- Phân loại quyền.
- Các bộ phận, xưởng, khu vực và line trong phạm vi đã lưu.
- Trạng thái xác nhận gửi email tài khoản.

Họ tên, mã nhân viên và email vẫn là dữ liệu hồ sơ. Bộ phận, xưởng, khu vực và line chỉ được chọn từ danh mục; không có ô nhập chuỗi phân cách bằng dấu chấm phẩy.

### 4.1 Nguồn chính của tên người thực hiện

Tab **Người thực hiện/Danh bạ** là nơi duy nhất cho phép tạo mới hoặc sửa tên người. Form này có nút **Lưu**, kiểm tra tên rỗng, tên chuẩn hóa bị trùng, email đã nối người khác và xung đột phiên bản trước khi ghi.

Các nơi dùng người thực hiện không được kiêm chức năng tạo tên mới:

- Ô Người thực hiện trong cửa sổ cập nhật tiến độ.
- Cột QA phụ trách và Người hỗ trợ của Danh mục nguồn.
- Thao tác điền hàng loạt cho hai cột người.
- Phân công theo hạng mục trên trang Phân quyền.

Các ô này chỉ tìm/chọn người đang hoạt động từ danh bạ. Sau khi chọn, giao diện giữ `person_id` trong bản nháp và hiển thị họ tên, email, bộ phận để người dùng đối chiếu. Thay đổi chỉ được ghi khi bấm nút **Lưu** hoặc **Áp dụng** có xác nhận; mất tiêu điểm, bấm Enter hay chọn một mục không tự gọi RPC ghi.

Tên hiển thị không phải khóa liên kết. Khi đổi tên trong danh bạ, các màn nghiệp vụ đọc lại tên mới theo `person_id`; không tạo một người thứ hai và không cần sửa chuỗi tên ở từng hạng mục.

## 5. Mô hình phạm vi

### 5.1 Bộ phận chính

Mỗi nhân sự có đúng một bộ phận chính. Trường này dùng lựa chọn đơn từ danh mục `departments` hiện có.

### 5.2 Phạm vi nhiều lựa chọn

Phạm vi quyền gồm bốn tập riêng:

- `scope_departments`: nhiều bộ phận.
- `scope_factories`: nhiều xưởng.
- `scope_areas`: nhiều khu vực.
- `scope_lines`: nhiều line.

Mỗi giá trị được lưu bằng mã ổn định, không lưu nhãn hiển thị làm khóa. Nhãn có thể đổi mà không làm mất liên kết.

### 5.3 Danh mục chuẩn

Bổ sung danh mục xưởng và quan hệ chuẩn để biểu diễn:

- Một bộ phận có nhiều xưởng.
- Một xưởng thuộc một bộ phận.
- Một xưởng có nhiều khu vực.
- Một khu vực thuộc một xưởng.
- Một khu vực có nhiều line.
- Một line thuộc một khu vực.

Dữ liệu khu vực và line hiện có trong VMP được dùng để đối chiếu và khởi tạo quan hệ, nhưng không được đoán xưởng chỉ từ tên chữ. Các quan hệ chưa xác định phải được bổ sung qua dữ liệu danh mục chuẩn trước khi xuất hiện trong ô chọn.

### 5.4 Ý nghĩa lọc

- Chọn nhiều bộ phận: hợp nhất các xưởng thuộc các bộ phận đã chọn.
- Chọn nhiều xưởng: hợp nhất các khu vực thuộc các xưởng đã chọn.
- Chọn nhiều khu vực: hợp nhất các line thuộc các khu vực đã chọn.
- Một lựa chọn con chỉ hợp lệ khi có đường liên kết đầy đủ tới ít nhất một lựa chọn cha đang chọn.
- Mỗi tầng có lựa chọn rõ nghĩa “Toàn bộ … thuộc các lựa chọn cha hiện tại”. Giá trị toàn bộ được lưu trong đúng tập của tầng đó; không trộn xưởng, khu vực và line vào cùng một mảng hoặc cùng một nhãn chung.

## 6. Thành phần chọn nhiều

Mỗi tầng dùng cùng một thành phần chọn nhiều có:

- Tìm theo mã hoặc tên.
- Danh sách lựa chọn hợp lệ theo tầng cha.
- Thẻ cho từng giá trị đã chọn.
- Nút bỏ từng thẻ và thao tác xóa toàn bộ.
- Số lượng đã chọn.
- Trạng thái khóa kèm lý do khi chưa chọn tầng cha hoặc chưa có dữ liệu danh mục.
- Điều hướng bàn phím và nhãn truy cập phù hợp.

Không tự lưu khi người dùng chọn hoặc bỏ chọn. Mọi thay đổi chỉ cập nhật bản nháp cục bộ.

## 7. Thay đổi lựa chọn cha

Khi bỏ một bộ phận, xưởng hoặc khu vực làm các lựa chọn con không còn hợp lệ:

1. Giao diện tính danh sách con sẽ bị loại.
2. Hiển thị xác nhận nêu rõ số lượng và tên các lựa chọn bị ảnh hưởng.
3. Nếu xác nhận, loại chúng khỏi bản nháp và tiếp tục.
4. Nếu hủy, giữ nguyên cả lựa chọn cha và con.

Giao diện không âm thầm giữ dữ liệu con sai quan hệ và cũng không âm thầm xóa trước khi người dùng xác nhận.

## 8. Luồng lưu

1. Người quản trị chọn hoặc tạo hồ sơ.
2. Các thay đổi nằm trong bản nháp; nút **Lưu hồ sơ** thể hiện trạng thái có thay đổi.
3. Khi bấm lưu, client kiểm tra trường bắt buộc và quan hệ phạm vi để phản hồi nhanh.
4. Máy chủ kiểm tra lại toàn bộ mã và quan hệ bằng dữ liệu danh mục chuẩn trong cùng transaction.
5. Nếu có một lỗi, từ chối toàn bộ; dữ liệu đang áp dụng không thay đổi.
6. Nếu hợp lệ, lưu hồ sơ và toàn bộ bốn tập phạm vi, tăng phiên bản bản ghi và ghi nhật ký giá trị cũ/mới, người sửa, thời gian và lý do.
7. Client tải lại hồ sơ, danh sách phân công và bảng quyền hiệu lực từ máy chủ.

Nút lưu bị khóa khi thiếu họ tên, bộ phận chính, phân loại quyền hoặc chưa chọn phạm vi ở một trong bốn tầng. Muốn cấp toàn bộ tại một tầng, người dùng phải chọn rõ lựa chọn “Toàn bộ … thuộc các lựa chọn cha hiện tại”; ô trống không mang nghĩa toàn bộ.

## 9. Kiểm tra phía máy chủ

Máy chủ phải từ chối:

- Mã bộ phận, xưởng, khu vực hoặc line không tồn tại/không hoạt động.
- Xưởng không thuộc một bộ phận đã chọn.
- Khu vực không thuộc một xưởng đã chọn.
- Line không thuộc một khu vực đã chọn.
- Hai phiên cùng sửa một hồ sơ và phiên cũ cố ghi đè phiên mới.
- Người gọi không có quyền sửa hồ sơ hoặc phạm vi tương ứng.
- Patch chứa trường ngoài allowlist.
- `person_id` không tồn tại, đã ngừng hoạt động hoặc không thuộc phạm vi người gọi được quản lý.
- Tên người chuẩn hóa trùng với một hồ sơ đang hoạt động khi tạo/sửa danh bạ.

RPC ghi phải dùng transaction, `search_path` cố định, quyền thực thi tối thiểu và trả lỗi có mã để giao diện chỉ đúng trường cần sửa.

## 10. Xử lý lỗi

- Không tải được danh mục: giữ dữ liệu hồ sơ đã tải, khóa các ô phụ thuộc và cho phép thử lại.
- Danh mục con rỗng: hiển thị “Chưa có dữ liệu xưởng/khu vực/line cho lựa chọn hiện tại”, không mở ô nhập tay thay thế.
- Lưu thất bại: giữ nguyên bản nháp và thông báo lỗi gần trường liên quan; dữ liệu đang áp dụng không đổi.
- Phiên hết hạn: yêu cầu đăng nhập lại, không xóa bản nháp trước khi người dùng có cơ hội sao chép hoặc thử lại.
- Xung đột phiên bản: tải giá trị mới nhất, chỉ rõ trường đã thay đổi và yêu cầu người dùng xác nhận lại.
- Lưu thành công nhưng tải lại thất bại: báo rõ dữ liệu đã được lưu và cung cấp thao tác tải lại; không gửi lại lệnh lưu một cách mù quáng.

## 11. Bảng quy tắc hiện tại

Bảng quyền hiệu lực là phần kết luận của trang, không phải bản mô tả chép tay. Nó phải đọc từ RPC tính quyền đang chạy và hiển thị:

- Nhân sự hoặc hạng mục đang xét.
- Có được xem hay không và lý do.
- Các cột timeline được phép sửa.
- Nguồn phân công.
- Phạm vi bộ phận/xưởng/khu vực/line đã khớp hoặc không khớp.
- Chế độ `preview` hay `enforced`.

Sau khi lưu hồ sơ hoặc phạm vi, bảng tự tải lại. Nếu đang ở `preview`, giao diện tiếp tục ghi rõ đây là quyền dự kiến, chưa áp dụng thật.

## 12. Di trú và tương thích

- Giữ `department` hiện tại làm bộ phận chính.
- Chuyển dữ liệu `scope_departments` hiện có sang tập bộ phận mới sau khi kiểm tra mã.
- Tách `access_areas` hiện đang trộn area/line thành `scope_areas` và `scope_lines` bằng cách đối chiếu danh mục chuẩn.
- Giá trị không phân loại duy nhất được đưa vào báo cáo tiền kiểm và không tự kích hoạt quyền.
- Chế độ vẫn là `preview` trong suốt quá trình chuyển đổi.
- Chỉ được cân nhắc bật `enforced` sau khi không còn lỗi bắt buộc và các kiểm thử phân quyền đạt.

## 13. Kiểm thử và tiêu chí nghiệm thu

### Giao diện

- Chọn nhân sự có sẵn tự điền đúng hồ sơ và bốn tầng phạm vi.
- Bộ phận chính chỉ chọn một; bốn tầng phạm vi chọn được nhiều.
- Danh sách xưởng chỉ chứa xưởng thuộc các bộ phận đã chọn.
- Danh sách khu vực chỉ chứa khu vực thuộc các xưởng đã chọn.
- Danh sách line chỉ chứa line thuộc các khu vực đã chọn.
- Bỏ lựa chọn cha yêu cầu xác nhận và xử lý đúng các lựa chọn con.
- Thay đổi không gọi RPC ghi trước khi bấm **Lưu hồ sơ**.
- Lưu lỗi giữ bản nháp; lưu thành công tải lại dữ liệu và bảng quyền.
- Không còn ô nhập chuỗi tự do cho phạm vi.
- Tab Người thực hiện/Danh bạ vẫn cho tạo hoặc sửa hồ sơ bằng form có nút **Lưu**.
- Mọi ô gán QA phụ trách, người hỗ trợ và người thực hiện chỉ cho chọn từ danh bạ; chọn hoặc mất tiêu điểm không tự lưu.
- Danh sách chọn người hiển thị đủ tên, email và bộ phận để phân biệt người trùng tên.
- Không còn ba khối legacy và hướng dẫn dài bên dưới.

### Máy chủ

- Lưu được nhiều giá trị hợp lệ ở cả bốn tầng.
- Từ chối từng trường hợp quan hệ sai và rollback toàn bộ transaction.
- Từ chối mã không tồn tại, patch trái phép, người gọi thiếu quyền và phiên bản cũ.
- Từ chối gán `person_id` không tồn tại/không hoạt động và từ chối tạo tên chuẩn hóa bị trùng.
- Đổi tên một người giữ nguyên mọi liên kết nghiệp vụ vì khóa là `person_id`.
- Nhật ký chứa đầy đủ trước/sau, người sửa, thời gian và lý do.
- RPC quyền hiệu lực phản ánh đúng các tập phạm vi mới ở cả `preview` và `enforced`.
- RLS/RPC đọc không làm lộ hạng mục ngoài phạm vi khi chuyển sang `enforced`.

### Hồi quy

- Tìm danh bạ, nối tài khoản và phân công theo hạng mục vẫn hoạt động.
- Import Excel hiện có báo rõ các cột cần chuyển đổi; không âm thầm đưa dữ liệu không hợp lệ vào quyền thật.
- Người không có quyền quản trị vẫn xem được phần được phép nhưng không sửa được danh mục hoặc hồ sơ.
- Build, unit test, integration test và các bài kiểm tra trình duyệt liên quan đều đạt.

## 14. Điều kiện hoàn thành

Hạng mục hoàn thành khi trang chỉ còn workspace hiện hành và bảng quyền hiệu lực; mọi phạm vi được chọn từ danh mục chuẩn theo quan hệ bộ phận–xưởng–khu vực–line; chọn nhiều và lưu nguyên khối hoạt động; dữ liệu sai bị chặn ở cả client lẫn server; nhật ký và bảng quyền được cập nhật sau lưu; toàn bộ kiểm thử nêu trên đạt.

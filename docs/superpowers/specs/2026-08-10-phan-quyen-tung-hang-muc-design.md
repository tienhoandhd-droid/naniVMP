# Thiết kế phân quyền VMP theo nhân viên, phạm vi, khu vực và cột timeline

Ngày sửa đổi: 2026-08-10
Trạng thái: Đã duyệt nguyên tắc nghiệp vụ; chờ duyệt bản đặc tả sửa đổi
Nguồn yêu cầu: `Phân quyền truy cập web VMP.xlsx` và phản hồi trực tiếp của người quản trị hệ thống.

## 1. Kết luận ngắn

Phân quyền VMP có hai chiều độc lập:

1. **Chiều dọc — được thấy hạng mục nào:** theo nhân viên được phân công, phạm vi bộ phận và khu vực/line.
2. **Chiều ngang — được sửa cột nào:** theo phân loại nhân viên; QA cập nhật bốn mốc hoàn thành, bộ phận quản lý thiết bị chỉ xếp lịch thẩm định.

Không còn quyền chung “Cập nhật tiến độ VMP”. Server phải kiểm từng trường trong bản cập nhật.

Bản đầu được triển khai ở chế độ `preview`: nhập danh sách, phân công và xem quyền dự kiến nhưng chưa thay đổi quyền đang chạy. Chỉ Admin được bật `enforced` sau khi dữ liệu nhân viên và phân công đạt kiểm tra tiền điều kiện.

## 2. Kết quả đọc file Excel

Workbook có một sheet `Trang tính1`, 1.000 dòng mẫu và chín cột:

| Cột | Ý nghĩa |
|---|---|
| STT | Số thứ tự |
| Bộ phận | Bộ phận của nhân viên |
| Mã nhân viên | Mã nhân sự nội bộ |
| Họ và tên | Tên nhân viên thực hiện |
| Phân loại | Nhóm quyền theo chức năng |
| Phạm vi | Phạm vi bộ phận/khối |
| Khu vực phân quyền | Khu vực, phòng hoặc line |
| Email nhận tài khoản | Email dùng liên kết Auth |
| Xác nhận gửi email | Trạng thái gửi thông tin tài khoản |

File hiện chỉ có một dòng nhân viên RD. Danh sách cũ của `Phân loại` chỉ có `View` và `Cập nhật tiến độ VMP`; danh sách này không đủ để chặn theo từng cột timeline và sẽ được thay bằng năm phân loại ở mục 5.

Danh sách phạm vi hiện có: Toàn nhà máy, Xưởng sản xuất, Cơ điện, Kho, RD, QA, QC. Danh sách khu vực hiện có các mã A1…S10, Hóa lý 1/2 và Vi sinh. Bản nhập mới phải cho phép nhiều khu vực hoặc “Toàn bộ khu vực trong phạm vi”.

## 3. Danh tính nhân viên

- Giai đoạn đầu khớp phân công bằng `Họ và tên` vì Mã nhân viên chưa được nhập đủ.
- Tên được chuẩn hóa bằng cách bỏ khoảng trắng thừa và không phân biệt chữ hoa–thường. Không tự bỏ dấu, đoán tên gần giống hoặc mở rộng tên viết tắt.
- Nếu một tên chỉ khớp đúng một người trong danh bạ thì hệ thống nối phân công nguồn với người đó.
- Nếu có hai người trùng tên, hoặc tên nguồn không khớp duy nhất, hệ thống không tự cấp quyền và yêu cầu quản lý nối tay đúng tài khoản.
- `Mã nhân viên` là trường tùy chọn trong bản đầu. Khi được bổ sung, mã phải duy nhất và sẽ trở thành khoá nghiệp vụ ưu tiên cho những lần nhập sau.
- Email dùng nối tài khoản Auth. Sau khi nối, `user_id` là khoá kỹ thuật cho mọi phép kiểm quyền; việc đổi cách nhận dạng sau này không làm đổi quyền đã nối.
- Nhân viên chưa có tài khoản hoặc chưa liên kết `user_id` vẫn được hiển thị trong danh sách phân công nhưng chưa nhận quyền thật.

### 3.1 Tìm và nối người tự động

- Ô Họ tên/Tài khoản trên web là ô tìm kiếm có gợi ý từ danh bạ người thực hiện, hồ sơ người dùng và tài khoản Auth mà người quản trị được phép xem.
- Gõ một phần tên sẽ trả các ứng viên kèm bộ phận và email. Người trùng tên phải được phân biệt bằng bộ phận/email trước khi chọn.
- Khi chọn một ứng viên, web tự điền họ tên, bộ phận, email, trạng thái tài khoản và `user_id`; người dùng không phải nhập lại.
- Nếu tên chưa có tài khoản, web giữ người đó ở trạng thái “chưa có tài khoản” và hướng dẫn mời/nối tài khoản; không tạo `user_id` giả.
- Bảng kiểm soát quyền chỉ nhận liên kết tới bản ghi người đã chọn từ danh bạ. Không cho lưu một chuỗi tên rời không có bản ghi nguồn.

## 4. Chiều dọc — nhân viên được thấy hạng mục nào

### 4.1 Nhân viên thường

Một nhân viên chỉ thấy hạng mục khi đồng thời thỏa cả ba điều kiện:

1. Có phân công đang hoạt động tới hạng mục.
2. Hạng mục nằm trong `Phạm vi` được cấp.
3. Đối tượng nằm trong một `Khu vực phân quyền` được cấp.

Thiếu một trong ba điều kiện là không được xem.

### 4.2 Nguồn phân công

Phân công tới hạng mục có thể đến từ:

- `QA phụ trách (QA nhập)` trong dữ liệu VMP nguồn.
- `Nhân sự bộ phận khác (Bộ phận khác nhập)` trong dữ liệu VMP nguồn.
- Quản lý QA phân công QA trên web.
- Quản lý bộ phận quản lý thiết bị phân công nhân viên bộ phận mình trên web.

Phân công nguồn bằng tên phải được đối chiếu duy nhất với `Họ và tên` đã chuẩn hóa và chuyển thành `user_id`. Tên chưa nối được hoặc trùng nhiều người tạo cảnh báo, không tự cấp quyền.

Phân công thủ công trên web được lưu riêng, không ghi đè chuỗi nguồn và không bị lần đồng bộ nguồn sau xoá mất. Giao diện phải chỉ rõ nguồn của từng phân công.

### 4.3 Quản lý

- Quản lý QA được xem toàn bộ hạng mục trong phạm vi/khu vực của mình để giám sát và phân công QA.
- Quản lý bộ phận quản lý thiết bị được xem các hạng mục có `vmp_objects.department` bằng bộ phận mình, đồng thời nằm trong phạm vi/khu vực được cấp.
- Admin xem toàn bộ để quản trị hệ thống.
- Quyền xem rộng của quản lý không tự mở quyền sửa ngoài các cột ở mục 6.

## 5. Phân loại nhân viên

Thay danh sách `View,Cập nhật tiến độ VMP` bằng:

| Mã nội bộ | Nhãn hiển thị | Quyền chính |
|---|---|---|
| `view_only` | Chỉ xem | Xem hạng mục được phân; không sửa timeline |
| `qa_progress_editor` | QA – Cập nhật 4 mốc hoàn thành | Xem hạng mục được phân và sửa tám trường QA ở mục 6.1 |
| `qa_manager` | Quản lý QA | Xem phạm vi QA quản lý, phân công QA và sửa tám trường QA |
| `equipment_scheduler` | Bộ phận quản lý thiết bị – Xếp lịch thẩm định | Xem hạng mục được phân và chỉ sửa lịch thẩm định |
| `equipment_manager` | Quản lý bộ phận quản lý thiết bị | Xem hạng mục bộ phận quản lý, phân công nhân viên bộ phận và sửa lịch thẩm định |

Admin là vai hệ thống hiện có, không khai bằng `Phân loại` trong file nhân viên.

Phân loại phải phù hợp với bộ phận. Ví dụ tài khoản không thuộc QA không được nhận `qa_progress_editor` hoặc `qa_manager`; `equipment_manager` chỉ quản lý đúng `profiles.department` của mình.

## 6. Chiều ngang — quyền sửa từng cột timeline

### 6.1 QA cập nhật bốn mốc hoàn thành

`qa_progress_editor` và `qa_manager` chỉ được sửa tám trường sau:

| Mốc | Ngày thực tế | Trạng thái |
|---|---|---|
| Đề cương | `actual_protocol_date` | `status_protocol` |
| Thẩm định thực tế | `actual_validation_date` | `status_validation` |
| Báo cáo | `actual_report_date` | `status_report` |
| Hoàn thành VMP | `actual_vmp_date` | `status_vmp` |

QA chỉ sửa hạng mục họ được phép thấy theo mục 4. Quản lý QA có thể sửa trong phạm vi quản lý; nhân viên QA thường phải có phân công.

### 6.2 Bộ phận quản lý thiết bị xếp lịch

`equipment_scheduler` và `equipment_manager` chỉ được sửa:

- `scheduled_at`: thời điểm “Bộ phận quản lý xếp lịch thẩm định (dd/mm/yyyy hh:mm:ss)”.

“Bộ phận quản lý thiết bị” lấy từ `vmp_objects.department`. Nó có thể là XSX, Cơ điện, Kho, QC, RD hoặc bộ phận khác; không mặc định là xưởng.

Nhân viên xếp lịch phải thuộc đúng bộ phận quản lý đối tượng. Nhân viên thường chỉ xếp lịch hạng mục được phân; quản lý bộ phận xếp lịch cho các hạng mục bộ phận mình quản lý trong phạm vi/khu vực.

### 6.3 Chặn theo trường ở server

- RPC nhận bản chênh `patch` và kiểm từng khoá.
- Chỉ cần có một khoá ngoài allowlist của người gọi thì toàn bộ transaction bị từ chối.
- Không bỏ qua khoá trái phép và ghi phần còn lại, vì như vậy người dùng tưởng đã lưu toàn bộ.
- Giao diện khoá các ô không được phép, nhưng đó chỉ là lớp trình bày; gọi thẳng RPC vẫn bị server chặn.
- Mọi cập nhật bắt buộc có lý do và ghi `audit_logs` đúng các trường đã đổi.

## 7. Phạm vi và khu vực

### 7.1 Phạm vi

Phạm vi là tập bộ phận/khối mà tài khoản được tiếp cận:

- Một hoặc nhiều bộ phận cụ thể; hoặc
- `*` = Toàn nhà máy.

Không dùng một chuỗi mô tả tự do để kiểm quyền. Khi nhập Excel, các nhãn tiếng Việt được chuẩn hóa thành mã bộ phận hệ thống.

### 7.2 Khu vực phân quyền

Khu vực là tập mã lấy từ `vmp_objects.area` và/hoặc `vmp_objects.line` theo dữ liệu có thật:

- Một hoặc nhiều mã; hoặc
- `*` = Toàn bộ khu vực trong phạm vi.

Giao diện dùng chọn nhiều. File Excel sửa đổi cho phép danh sách mã cách nhau bằng dấu chấm phẩy và có lựa chọn “Toàn bộ khu vực trong phạm vi”. Importer chuẩn hóa, loại trùng và từ chối mã không tồn tại.

### 7.3 Thứ tự lọc

1. Kiểm tài khoản hoạt động và liên kết nhân viên.
2. Xác định quyền quản lý hoặc phân công.
3. Kiểm phạm vi bộ phận.
4. Kiểm khu vực/line.
5. Trả hạng mục cùng lý do quyền hiệu lực.

## 8. Lưu thời điểm xếp lịch

Database hiện dùng `scheduled_date date`, làm mất giờ/phút/giây trong cột nguồn. Thiết kế mới dùng `scheduled_at timestamp` theo giờ nhà máy `Asia/Bangkok`.

- Migration backfill ngày cũ vào `scheduled_at` mà không làm mất `scheduled_date` trong giai đoạn tương thích.
- Parser nguồn đọc đúng `dd/mm/yyyy hh:mm:ss`.
- Form dùng `datetime-local`, không dùng `date`.
- Ngày hẹn được phép ở tương lai; không áp luật “ngày thực tế không vượt hôm nay”.
- Các báo cáo chỉ cần ngày dùng phần ngày của `scheduled_at`.
- Sau khi mọi đường đọc chuyển xong, `scheduled_date` trở thành trường tương thích và không còn là nguồn chính.

## 9. Mô hình dữ liệu

### 9.1 Hồ sơ truy cập nhân viên

Tạo bảng/hồ sơ chuẩn chứa:

- `employee_code` tùy chọn trong bản đầu; duy nhất khi có giá trị.
- `full_name`.
- `normalized_full_name` để khớp chính xác sau khi chuẩn hóa khoảng trắng/chữ hoa–thường.
- `user_id` duy nhất khi đã nối Auth.
- `department`.
- `access_class` thuộc năm giá trị mục 5.
- `scope_departments text[]`.
- `access_areas text[]`.
- `email`.
- `is_active`.
- Người/thời điểm tạo và cập nhật.

Bảng này là nguồn dữ liệu người chuẩn cho màn kiểm soát quyền. Các bảng phân công/quyền chỉ lưu khoá liên kết tới hồ sơ này và `user_id`, không sao chép họ tên thành một danh bạ thứ hai.

### 9.2 Phân công hạng mục

Mỗi dòng phân công chứa:

- `validation_code`.
- `staff_name`, `normalized_staff_name`, `employee_code` nếu đã có và `user_id` khi đã nối.
- `assignment_kind`: `qa` hoặc `equipment_department`.
- `source`: `sheet_qa`, `sheet_other_staff`, `qa_manager`, `equipment_manager`.
- `source_text` để truy vết chuỗi nguồn.
- `expires_at` tùy chọn.
- `is_active`.
- Người/thời điểm tạo, cập nhật và lý do.

Khoá nghiệp vụ ngăn trùng cùng hạng mục × `user_id` × loại phân công × nguồn sau khi đã nối. Dòng chưa nối dùng tên chuẩn hóa để phát hiện trùng tạm thời nhưng chưa có quyền thật. Phân công nguồn và phân công tay cùng tồn tại; quyền hiệu lực chỉ cần một phân công hợp lệ.

### 9.3 Chế độ vận hành

`item_permissions_mode` có hai giá trị:

- `preview`: tính quyền dự kiến, cho lưu hồ sơ/phân công nhưng chưa đổi RLS/RPC nghiệp vụ hiện tại.
- `enforced`: áp dụng quyền đọc và allowlist cột ghi.

Mặc định sau migration là `preview`.

## 10. Quyền phân công

- Admin quản trị danh bạ và phân công toàn hệ thống.
- `qa_manager` chỉ thêm/bỏ phân công loại `qa` trong phạm vi/khu vực của mình.
- `equipment_manager` chỉ thêm/bỏ phân công loại `equipment_department` cho nhân viên cùng bộ phận và hạng mục do bộ phận đó quản lý.
- Quản lý không được thay đổi mã nhân viên, bộ phận hay phân loại của người ngoài quyền quản trị nhân sự.
- Nhân viên thường không tự nhận việc hoặc chuyển việc cho người khác.
- Thay đổi phân công bắt buộc có lý do và nhật ký.

## 11. RLS, RPC đọc và chống lộ dữ liệu

Khi ở `enforced`:

- RLS trên `vmp_plan_items` dùng hàm quyền xem hiệu lực.
- Mọi RPC/dashboard trả danh sách hoặc số tổng hợp phải áp cùng phạm vi. Không được để RPC `SECURITY DEFINER` trả số liệu ngoài phạm vi dù bảng trực tiếp đã có RLS.
- Các trang Timeline, Hôm nay, Cảnh báo, Khối lượng, Báo cáo, Danh mục và trợ lý AI phải dùng tập dữ liệu đã lọc phù hợp người gọi.
- Admin và service role có đường quản trị/hệ thống riêng được kiểm rõ ràng.
- n8n/service role tiếp tục đọc toàn bộ để vận hành báo cáo và đồng bộ.
- `anon` không đọc danh bạ, phân công hoặc gọi RPC quản trị.

## 12. Giao diện Phân quyền

### 12.1 Danh bạ từ file Excel

Hiển thị đúng chín trường nguồn, nhưng `Phân loại`, `Phạm vi` và `Khu vực` dùng lựa chọn chuẩn hóa. Mỗi dòng hiển thị trạng thái nối tài khoản và lỗi dữ liệu.

- Ô Họ tên/Tài khoản có autocomplete.
- Chọn người có sẵn tự điền bộ phận, email và trạng thái tài khoản.
- Dòng nhập từ Excel được đối chiếu với danh bạ và đề xuất liên kết; quản lý xác nhận trước khi lưu.
- Bảng kiểm soát quyền lấy trực tiếp danh sách người từ danh bạ này.

### 12.2 Theo nhân viên

- Mã nhân viên, họ tên, bộ phận và phân loại.
- Phạm vi và nhiều khu vực.
- Hạng mục được thấy, nguồn phân công và quyền sửa từng cột.
- Cảnh báo mã/tên/email không nối được.

### 12.3 Theo hạng mục

- Bộ phận quản lý thiết bị, khu vực, line.
- QA phụ trách và nhân sự bộ phận khác từ nguồn.
- Phân công tay của quản lý.
- Ma trận cột: Xem; QA cập nhật 4 mốc; Bộ phận quản lý xếp lịch.
- Lời giải thích vì sao mỗi người được/không được quyền.

### 12.4 Nhật ký và cảnh báo

- Nhân viên chưa có tài khoản.
- Tên nguồn chưa khớp duy nhất với một người hoặc đang trùng tên.
- Hạng mục chưa có QA hoặc chưa có người xếp lịch.
- Người có phân công nhưng ngoài phạm vi/khu vực.
- Phân công sắp hết hạn hoặc đã hết hạn.
- Lịch sử thay đổi hồ sơ, phân loại, phạm vi, khu vực và phân công.

Banner `DỰ THẢO — CHƯA ÁP DỤNG QUYỀN THẬT` luôn hiện trong chế độ `preview`.

## 13. File Excel sửa đổi

- Giữ nguyên chín cột để người dùng không phải nhập lại biểu mẫu.
- Thay dropdown `Phân loại` bằng năm nhãn mục 5.
- Giữ danh sách bộ phận nhưng chuẩn hóa tên khi import.
- `Phạm vi` cho phép một hoặc nhiều phạm vi; `Toàn nhà máy` ánh xạ `*`.
- `Khu vực phân quyền` cho phép nhiều mã cách nhau bằng dấu chấm phẩy hoặc “Toàn bộ khu vực trong phạm vi”.
- Thêm sheet `Hướng dẫn` giải thích từng phân loại, phạm vi, khu vực và ví dụ.
- Không dùng macro; file phải mở được trong Excel/LibreOffice và importer server phải kiểm lại mọi giá trị.

## 14. Lỗi và an toàn

- Hai người trùng tên hoặc tên nguồn khớp nhiều người: không kích hoạt quyền, yêu cầu nối tay.
- Mã nhân viên trùng khi đã được bổ sung: không kích hoạt dòng, báo chính xác hai dòng xung đột.
- Email đã nối người khác: không ghi đè.
- Tên trong nguồn chưa nối: giữ cảnh báo, không đoán.
- Cấp phân loại sai bộ phận: từ chối.
- Phân công ngoài phạm vi quản lý: từ chối.
- Patch chứa trường trái phép: từ chối toàn bộ transaction và liệt kê trường.
- Xung đột phiên bản: không ghi đè thay đổi mới hơn.
- Phiên hết hạn: đưa về đăng nhập lại.
- RPC `SECURITY DEFINER` đặt `search_path`, thu quyền `public`/`anon` và chỉ cấp đúng vai.

## 15. Kiểm tra trước khi bật áp dụng

Database không cho chuyển sang `enforced` nếu còn lỗi bắt buộc:

- Nhân viên hoạt động thiếu họ tên, bộ phận, phân loại, phạm vi hoặc khu vực. Mã nhân viên được phép trống trong bản đầu.
- Tên trùng chưa nối tay, mã nhân viên trùng khi có giá trị hoặc liên kết `user_id` trùng.
- Phân loại không phù hợp bộ phận.
- Phân công tay vi phạm quyền quản lý.
- Hạng mục hoạt động thiếu bộ phận quản lý hoặc khu vực cần thiết để lọc.
- Còn patch/RPC ghi timeline chưa đi qua allowlist cột.
- Còn RPC đọc/tổng hợp có thể trả dữ liệu ngoài phạm vi.

File hiện chỉ có một nhân viên nên chắc chắn chưa đạt điều kiện bật; hệ thống phải ở `preview` cho tới khi danh sách đủ.

## 16. Kiểm thử

### 16.1 Danh tính và nhập Excel

- Tên chuẩn hóa khớp duy nhất thì nối được phân công.
- Tên trùng hoặc tên nguồn khớp nhiều người bị chặn và yêu cầu nối tay.
- Mã nhân viên để trống vẫn nhập được; mã trùng khi đã có bị chặn.
- Autocomplete trả đúng người theo từ khóa, kèm bộ phận/email để phân biệt tên trùng.
- Chọn người tự điền tài khoản; bảng kiểm soát quyền lưu đúng liên kết thay vì chuỗi tên.
- Nhiều phạm vi/khu vực được chuẩn hóa đúng.
- Mã khu vực không tồn tại bị báo.
- Năm phân loại nhập đúng; giá trị cũ được cảnh báo/chuyển đổi có chủ đích.

### 16.2 Quyền xem

- Nhân viên được phân nhưng ngoài phạm vi hoặc khu vực không thấy hạng mục.
- Nhân viên đúng cả ba điều kiện thấy đúng hạng mục.
- QA manager thấy phạm vi quản lý để phân công.
- Equipment manager chỉ thấy hạng mục bộ phận mình quản lý trong khu vực.
- RPC tổng hợp không làm lộ số lượng ngoài phạm vi.

### 16.3 Quyền sửa từng cột

- QA sửa được đúng tám trường hoàn thành và không sửa được `scheduled_at`.
- Equipment scheduler/manager sửa được `scheduled_at` và không sửa được tám trường QA.
- `view_only` không sửa được trường nào.
- Patch trộn một trường hợp lệ và một trường trái phép bị từ chối toàn bộ.
- Gọi RPC trực tiếp cho kết quả giống giao diện.
- Ngày thực tế tương lai bị chặn; lịch hẹn tương lai được phép.

### 16.4 Phân công quản lý

- QA manager chỉ phân công QA trong phạm vi.
- Equipment manager chỉ phân công người cùng bộ phận cho thiết bị bộ phận quản lý.
- Phân công nguồn và thủ công không xoá lẫn nhau.
- Thu hồi một nguồn nhưng còn nguồn hợp lệ khác vẫn giữ quyền.

### 16.5 Hồi quy và deploy

- Chế độ `preview` không thay đổi quyền đang chạy.
- TypeScript, Vite build, SQL security checks và toàn bộ e2e phân quyền đạt.
- n8n/service role tiếp tục hoạt động.
- URL online tải đúng bản mới và không lỗi console.

## 17. Tiêu chí hoàn tất

1. File Excel sửa đổi có đúng năm phân loại, nhiều phạm vi/khu vực và sheet hướng dẫn.
2. Danh bạ bản đầu khớp duy nhất bằng Họ tên; Mã nhân viên là tùy chọn để bổ sung dần; quyền thật luôn neo bằng `user_id` sau khi nối.
3. Ô tên/tài khoản tự gợi ý và điền dữ liệu; bảng kiểm soát quyền liên kết trực tiếp từ danh bạ chuẩn.
4. Phân công đọc được hai cột nguồn và cho phép hai loại quản lý phân công trên web.
5. Nhân viên chỉ thấy hạng mục thỏa phân công + phạm vi + khu vực.
6. QA chỉ sửa tám trường hoàn thành; bộ phận quản lý thiết bị chỉ sửa lịch thẩm định.
7. Lịch thẩm định giữ đủ ngày giờ.
8. Mọi UI/RLS/RPC và báo cáo tổng hợp dùng cùng luật quyền.
9. Bản đầu online ở `preview`, lưu được dữ liệu dự thảo và audit nhưng chưa ảnh hưởng quyền thật.
10. Kiểm thử đạt và production được xác minh trực tiếp sau deploy.

## 18. Ngoài phạm vi bản đầu

- Không tự động bật `enforced`.
- Không gửi email tự động khi quyền/phân công thay đổi.
- Không dùng macro Excel.
- Không cho một người quản lý nhiều bộ phận; nếu phát sinh sẽ thiết kế riêng.
- Không thay đổi quyền của service role/n8n.
- Không cho bộ phận quản lý thiết bị cập nhật các mốc hoàn thành QA.
- Bản đầu mỗi tài khoản có một phân loại chính; chưa hỗ trợ một người đồng thời mang cả phân loại QA và phân loại bộ phận quản lý thiết bị.

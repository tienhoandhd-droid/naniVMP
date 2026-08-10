# Thiết kế phân quyền tới từng hạng mục VMP

Ngày duyệt: 2026-08-10  
Trạng thái: Đã duyệt để lập kế hoạch triển khai  
Phạm vi bản đầu: Đưa bảng phân quyền dự thảo lên web online; chưa thay đổi quyền đang chạy cho tới khi Admin chủ động bật áp dụng.

## 1. Mục tiêu

Hệ thống hiện kiểm quyền chủ yếu theo vai trò, bộ phận và ma trận phân công loại thẩm định × line. Bản nâng cấp bổ sung một lớp ngoại lệ tới từng hạng mục VMP và từng tài khoản, tách riêng quyền Xem và Sửa.

Bản online đầu tiên phục vụ họp và thống nhất giữa các bộ phận. Người có thẩm quyền được lưu cấu hình dự thảo, xem quyền dự kiến và lịch sử thay đổi, nhưng cấu hình mới chưa tác động RLS hoặc RPC nghiệp vụ. Sau khi dữ liệu được rà đủ, Admin mới bật chế độ áp dụng chính thức.

## 2. Nguyên tắc đã chốt

1. Quyền Xem và Sửa là hai quyền độc lập.
2. Mỗi quyền có ba trạng thái: Kế thừa, Cho phép và Từ chối.
3. Ngoại lệ theo hạng mục ghi đè luật mặc định khi còn hiệu lực.
4. Được Sửa luôn kéo theo được Xem. Từ chối Xem đồng thời từ chối Sửa.
5. Chỉ người thực hiện và tài khoản thuộc bộ phận thực hiện của hạng mục mới đủ điều kiện nhận ngoại lệ. Admin và QA có quyền xem giám sát riêng nhưng không vì thế mà tự đủ điều kiện sửa.
6. Mọi thay đổi phải có lý do và được ghi nhật ký. Ngày hết hạn là tùy chọn.
7. Người chưa có tài khoản hoặc chưa liên kết `user_id` chỉ được hiển thị là người thực hiện; họ chưa nhận quyền hệ thống.
8. Quyền được nối bằng `user_id`, không khớp bằng tên người.
9. Quyền Sửa theo hạng mục áp dụng cho mọi thao tác làm thay đổi hạng mục. Thao tác nhạy cảm như Huỷ, Không áp dụng và Khôi phục còn phải vượt qua quyền hành động theo vai hiện có.
10. Database là chốt chặn. Giao diện chỉ trình bày và gửi yêu cầu, không tự quyết định quyền cuối cùng.

## 3. Người dùng và quyền mặc định

### 3.1 Admin

- Xem toàn bộ hạng mục và toàn bộ nhật ký phân quyền.
- Quản trị cấu hình quyền trên toàn hệ thống.
- Bật hoặc tắt chế độ áp dụng chính thức.
- Quyền sửa nội dung hạng mục vẫn tuân theo phân công, bộ phận thực hiện và ngoại lệ như các tài khoản khác.
- Không thể dùng ngoại lệ để chặn quyền xem quản trị của Admin.

### 3.2 Phụ trách QA (`qa_manager`)

- Xem toàn bộ hạng mục để giám sát chất lượng.
- Xem người đang có quyền, quyền dự kiến, lý do, ngày hết hạn và nhật ký.
- Chỉ sửa nội dung khi QA là bộ phận thực hiện hoặc bản thân được phân công trực tiếp, và không có ngoại lệ từ chối còn hiệu lực.
- Chỉ quản lý ngoại lệ khi QA là bộ phận thực hiện và hồ sơ tài khoản có cờ Quản lý bộ phận.
- Không thể dùng ngoại lệ để chặn quyền xem giám sát của `qa_manager`.

### 3.3 Nhân viên QA thông thường

- Không mặc nhiên xem toàn hệ thống.
- Xem hạng mục khi QA là bộ phận thực hiện hoặc bản thân là người thực hiện.
- Chỉ sửa khi là người thực hiện trực tiếp hoặc có ngoại lệ Cho phép Sửa.
- Không quản lý quyền nếu không có cờ Quản lý bộ phận.

### 3.4 Người thực hiện trực tiếp

- Mặc định được Xem và Sửa đúng hạng mục mình được phân công.
- Không tự động được sửa hạng mục khác.
- Nếu thuộc bộ phận thực hiện nhưng không được phân công, mặc định chỉ được Xem.
- Ngoại lệ Từ chối có thể thu hồi quyền. Giao diện phải cảnh báo khi người vẫn mang trách nhiệm nhưng bị thu hồi quyền thao tác.
- Không được tự cấp, chuyển hoặc thu hồi quyền của người khác nếu không đồng thời là quản lý bộ phận hợp lệ.

### 3.5 Quản lý bộ phận thực hiện

- Hồ sơ có `is_department_manager = true` và đúng bộ phận của tài khoản.
- Mặc định được Xem và Sửa các hạng mục có bộ phận mình trong `execution_departments`.
- Được quản lý ngoại lệ của các hạng mục thuộc phạm vi trên.
- Không quản lý quyền của hạng mục ngoài bộ phận.

### 3.6 Thành viên bộ phận thực hiện

- Mặc định được Xem hạng mục có bộ phận mình trong `execution_departments`.
- Không mặc định được Sửa nếu không phải người thực hiện hoặc quản lý bộ phận.
- Có thể nhận ngoại lệ Cho phép Sửa hoặc Từ chối Xem/Sửa.

## 4. Mô hình dữ liệu

### 4.1 Hồ sơ quản lý bộ phận

Thêm vào `profiles`:

- `is_department_manager boolean not null default false`.

Cờ này luôn đi cùng `profiles.department`. Một tài khoản chỉ quản lý đúng bộ phận ghi trên hồ sơ. Admin là ngoại lệ toàn hệ thống và không phụ thuộc cờ này.

### 4.2 Bảng ngoại lệ `vmp_item_permissions`

Mỗi dòng đại diện cho một cặp hạng mục × tài khoản:

- `id uuid primary key`.
- `validation_code text` tham chiếu mã duy nhất của `vmp_plan_items`.
- `user_id uuid` tham chiếu tài khoản.
- `view_override boolean null`: `NULL` = Kế thừa, `true` = Cho phép, `false` = Từ chối.
- `edit_override boolean null`: cùng quy ước.
- `expires_at timestamptz null`.
- `change_reason text not null`.
- `created_by`, `created_at`, `updated_by`, `updated_at`.
- Ràng buộc duy nhất `(validation_code, user_id)`.
- Ràng buộc không cho `view_override = false` đồng thời `edit_override = true`.
- Dòng có cả hai override là `NULL` không được lưu; thao tác đưa cả hai về Kế thừa sẽ xoá ngoại lệ.

Chỉ ngoại lệ chưa hết hạn tham gia tính quyền. So sánh hết hạn dùng thời gian của database, không dùng đồng hồ trình duyệt.

### 4.3 Chế độ vận hành

Thêm cấu hình hệ thống `item_permissions_mode` với hai giá trị:

- `preview`: lưu và tính quyền dự kiến nhưng không thay đổi RLS/RPC đang chạy.
- `enforced`: RLS và RPC nghiệp vụ dùng quyền hiệu lực theo hạng mục.

Giá trị ban đầu sau migration là `preview`. Chỉ Admin được đổi chế độ qua RPC chuyên dụng; trình duyệt không cập nhật trực tiếp bảng cấu hình.

### 4.4 Nhật ký

Tái sử dụng `audit_logs` hiện có:

- `table_name = 'vmp_item_permissions'`.
- `validation_code` và `record_id` xác định hạng mục/tài khoản.
- `old_data` và `new_data` chứa trạng thái Xem, Sửa và ngày hết hạn.
- `change_reason` là lý do người quản trị nhập.
- `changed_fields` ghi đúng các trường thay đổi.
- `source = 'dashboard_rpc'`.

Việc bật/tắt chế độ áp dụng cũng phải có một bản ghi `CONFIG_CHANGE` riêng.

## 5. Tính quyền hiệu lực

Database cung cấp một lõi kiểm quyền duy nhất. Các RPC đọc cho giao diện, policy RLS và RPC ghi nghiệp vụ phải dùng cùng lõi, không chép lại luật thành nhiều phiên bản.

### 5.1 Quyền Xem

Thứ tự quyết định:

1. Tài khoản không tồn tại hoặc không hoạt động: Từ chối.
2. Admin: Cho phép.
3. `qa_manager`: Cho phép.
4. Ngoại lệ Xem còn hiệu lực: dùng giá trị ngoại lệ.
5. Người thực hiện trực tiếp: Cho phép.
6. Tài khoản thuộc một bộ phận trong `execution_departments`: Cho phép.
7. Các trường hợp còn lại: Từ chối.

### 5.2 Quyền Sửa

Thứ tự quyết định:

1. Tài khoản không tồn tại hoặc không hoạt động: Từ chối.
2. Nếu quyền Xem hiệu lực là Từ chối: Từ chối.
3. Ngoại lệ Sửa còn hiệu lực: dùng giá trị ngoại lệ.
4. Người thực hiện trực tiếp: Cho phép.
5. Quản lý của một bộ phận trong `execution_departments`: Cho phép.
6. Các trường hợp còn lại: Từ chối.

Admin và `qa_manager` không có đường tắt ở quyền Sửa. Họ chỉ được sửa khi đi qua các điều kiện trên.

### 5.3 Người thực hiện trực tiếp

Ưu tiên nhận dạng bằng khoá tài khoản đã liên kết:

- `vmp_plan_items.owner_id = auth.uid()` khi có dữ liệu.
- Liên kết `vmp_performers.user_id` với người đứng tên hạng mục khi dữ liệu lịch sử chưa có `owner_id`.
- Ma trận phân công hiện tại chỉ là đường kế thừa để xác định trách nhiệm theo loại × line; ngoại lệ mới luôn lưu theo `user_id`.

Không cấp quyền thực tế cho một tên chưa liên kết tài khoản. Giao diện phải hiển thị cảnh báo thay vì đoán một tài khoản từ chuỗi tên.

### 5.4 Ngoại lệ hợp lệ

RPC lưu ngoại lệ từ chối mọi yêu cầu Cho phép nếu người nhận không phải:

- Người thực hiện của hạng mục; hoặc
- Tài khoản có `profiles.department` nằm trong `execution_departments` của hạng mục.

Ngoại lệ Từ chối chỉ áp dụng cho người đang có quyền mặc định hoặc ngoại lệ trước đó. Admin và `qa_manager` không thể bị từ chối Xem, nhưng có thể bị từ chối Sửa khi họ thuộc phạm vi sửa.

## 6. Quyền quản trị ngoại lệ

- Admin quản trị mọi hạng mục.
- Tài khoản có `is_department_manager = true` chỉ quản trị hạng mục có bộ phận mình trong `execution_departments`.
- `qa_manager` không tự có quyền quản trị ngoại lệ. Họ phải đồng thời là quản lý bộ phận QA và QA phải là bộ phận thực hiện.
- Người quản trị không được cấp quyền cho người ngoài phạm vi hợp lệ.
- Người dùng không được sửa trực tiếp bảng; tất cả thay đổi đi qua RPC `SECURITY DEFINER` có kiểm `auth.uid()` và phạm vi.
- `anon` không có quyền đọc danh sách quyền hoặc gọi RPC quản trị.

## 7. Giao diện

Mở rộng khối “Từng người” của trang Phân quyền thành “Người & hạng mục”, tránh tạo thêm các khối trùng ý nghĩa. Khối có bốn chế độ.

### 7.1 Theo hạng mục

Đây là chế độ mặc định:

- Tìm theo mã hoặc tên hạng mục.
- Lọc theo bộ phận, loại thẩm định và line.
- Hiển thị bộ phận thực hiện, người thực hiện và cảnh báo liên kết tài khoản.
- Hiển thị tóm tắt luật của Admin, QA, quản lý và người thực hiện.
- Danh sách chỉ gồm người đủ điều kiện, cộng với người đang có ngoại lệ cần xử lý.
- Mỗi dòng hiển thị quyền mặc định, ngoại lệ Xem/Sửa, ngày hết hạn và quyền hiệu lực dự kiến.
- Mỗi kết quả quyền có lời giải thích ngắn, ví dụ “Xem vì thuộc XSX”, “Sửa vì là quản lý XSX”, hoặc “Từ chối bởi ngoại lệ đến 30/09/2026”.

### 7.2 Theo người

- Chọn một tài khoản để xem các hạng mục họ được Xem/Sửa.
- Phân biệt quyền mặc định, ngoại lệ và quyền dự kiến.
- Dùng cho điều chuyển nhân sự và phát hiện người có quá nhiều hoặc không có hạng mục.

### 7.3 Sắp hết hạn

- Lọc quyền hết hạn trong 7 ngày, 30 ngày và đã hết hạn.
- Hiển thị người, hạng mục, quyền, bộ phận, ngày hết hạn và người cấp.

### 7.4 Nhật ký

- Lọc theo hạng mục, người nhận quyền, người thay đổi và khoảng thời gian.
- Hiển thị quyền cũ/mới và lý do.

### 7.5 Chỉnh sửa

- Xem và Sửa đều dùng ba trạng thái Kế thừa, Cho phép, Từ chối.
- Giao diện không cho tạo tổ hợp Từ chối Xem + Cho phép Sửa.
- Thay đổi nằm trong bản nháp cục bộ cho đến khi bấm Lưu.
- Bắt buộc nhập một lý do chung cho lần lưu; có thể đặt ngày hết hạn trên từng ngoại lệ.
- Có nút Hoàn tác và hộp xác nhận trước khi ghi.
- Một lần Lưu là một giao dịch nguyên tử: một thay đổi sai làm toàn bộ lần lưu không được ghi. RPC trả về đúng dòng và lý do để giao diện giữ bản nháp, đánh dấu lỗi và cho sửa lại.
- Tài khoản chỉ có quyền xem thấy toàn bộ lời giải thích nhưng điều khiển bị khoá.

### 7.6 Dấu hiệu chế độ dự thảo

Khi `item_permissions_mode = 'preview'`, trang luôn có banner nổi bật:

> DỰ THẢO — CHƯA ÁP DỤNG PHÂN QUYỀN TỪNG HẠNG MỤC

Banner hiển thị người sửa gần nhất, thời điểm, số ngoại lệ, số quyền sắp hết hạn và số cấu hình mâu thuẫn/cần chú ý. Không dùng màu sắc đơn lẻ để truyền đạt trạng thái; phải có chữ rõ ràng.

## 8. Luồng dữ liệu và RPC

Các tên hàm dưới đây là giao diện logic; kế hoạch triển khai có thể điều chỉnh tên theo quy ước hiện có nhưng không được tách luật kiểm quyền thành nhiều bản:

- Hàm lõi tính quyền một `user_id × validation_code`, trả Xem/Sửa và lý do.
- RPC đọc danh sách hạng mục cùng số liệu quyền dự kiến.
- RPC đọc chi tiết quyền và người đủ điều kiện của một hạng mục.
- RPC đọc quyền theo một người.
- RPC lưu một lô ngoại lệ trong một transaction.
- RPC đọc quyền sắp hết hạn và nhật ký.
- RPC kiểm tra điều kiện trước khi bật áp dụng.
- RPC Admin bật/tắt `preview`/`enforced` với lý do bắt buộc.

RPC đọc phải phân trang hoặc lọc phía server; không tải ma trận 448 hạng mục × toàn bộ người dùng về trình duyệt trong một lần.

## 9. Chế độ dự thảo và áp dụng chính thức

### 9.1 Dự thảo

- Là chế độ mặc định khi migration được áp.
- Cho phép lưu, sửa, hết hạn và kiểm toán ngoại lệ.
- Giao diện tính và hiển thị quyền dự kiến.
- RLS và RPC nghiệp vụ tiếp tục hành vi hiện tại.
- Không được mô tả quyền dự kiến như quyền đang có hiệu lực.

### 9.2 Kiểm tra trước khi bật

Database chặn chuyển sang `enforced` nếu còn lỗi bắt buộc:

- Hạng mục hoạt động chưa có bộ phận thực hiện.
- Ngoại lệ Cho phép vi phạm phạm vi người/bộ phận hợp lệ.
- Tổ hợp Xem/Sửa mâu thuẫn.
- Bản ghi tham chiếu tài khoản không hoạt động hoặc không tồn tại.

Các trường hợp người thực hiện chưa liên kết tài khoản được báo thành danh sách cảnh báo phải xác nhận, không bị im lặng bỏ qua. Admin phải xem báo cáo tiền kiểm và nhập lý do trước khi bật.

### 9.3 Áp dụng

- RLS đọc hạng mục dùng quyền Xem hiệu lực.
- Mọi RPC thay đổi một hạng mục dùng quyền Sửa hiệu lực trước khi xử lý.
- Thao tác nhạy cảm tiếp tục kiểm thêm quyền hành động theo vai.
- Các đường chạy `service_role` của n8n và tác vụ hệ thống không bị chặn.
- Admin có thể đưa hệ thống về `preview` khi phát hiện cấu hình sai; dữ liệu và nhật ký ngoại lệ được giữ nguyên.

## 10. Xử lý lỗi và an toàn

- Không có quyền: trả thông báo nêu quyền nào thiếu và vì sao.
- Người nhận không hợp lệ: không ghi và nêu bộ phận/người thực hiện hợp lệ.
- Phiên hết hạn: trả về luồng đăng nhập lại hiện có, không biến thành lỗi dữ liệu.
- Xung đột cập nhật: dùng thời điểm hoặc phiên bản để từ chối ghi đè bản mới hơn; giao diện tải lại và giữ nội dung người dùng vừa nhập khi có thể.
- Ngoại lệ đã hết hạn: bỏ qua khi tính quyền nhưng vẫn giữ trong nhật ký và màn Sắp hết hạn.
- Mọi RPC `SECURITY DEFINER` đặt `search_path`, thu quyền `public`/`anon` và chỉ cấp đúng vai cần thiết.
- Index phục vụ tra cứu theo `(validation_code, user_id)`, `user_id`, `expires_at` và các bộ lọc nhật ký.

## 11. Kiểm thử

### 11.1 SQL và bảo mật

- Admin và `qa_manager` xem toàn bộ nhưng không tự động sửa toàn bộ.
- Người thực hiện xem/sửa đúng hạng mục.
- Thành viên bộ phận thực hiện xem nhưng không mặc định sửa.
- Quản lý bộ phận xem/sửa và quản trị đúng phạm vi.
- Người ngoài phạm vi không nhận được ngoại lệ Cho phép.
- Từ chối Xem kéo theo Từ chối Sửa.
- Ngoại lệ hết hạn không còn hiệu lực.
- `anon` và người thường không gọi được RPC quản trị trực tiếp.
- Chế độ `preview` không thay đổi kết quả RLS/RPC nghiệp vụ hiện tại.
- Chế độ `enforced` chặn đúng cả truy cập trực tiếp lẫn RPC.
- `service_role` tiếp tục chạy các tác vụ hệ thống.

### 11.2 Giao diện

- Tìm, lọc và chọn hạng mục với dữ liệu thật.
- Hiển thị đúng bộ phận, người thực hiện, quyền mặc định, ngoại lệ và lời giải thích quyền dự kiến.
- Lưu/Hoàn tác Xem và Sửa độc lập.
- Bắt buộc lý do; ngày hết hạn hoạt động đúng.
- Lỗi transaction giữ bản nháp và đánh dấu đúng dòng.
- Các chế độ Theo người, Sắp hết hạn và Nhật ký trả đúng dữ liệu.
- Banner Dự thảo luôn hiện khi chưa áp dụng.
- Tài khoản chỉ xem không thể thao tác bằng giao diện hoặc gọi thẳng RPC.

### 11.3 Hồi quy và triển khai

- TypeScript và build Vite đạt.
- Bộ e2e phân quyền hiện có tiếp tục đạt sau khi cập nhật kỳ vọng có chủ đích.
- Thêm e2e cho quyền hạng mục và chế độ dự thảo.
- Kiểm tra với dữ liệu Supabase thật mà không làm thay đổi quyền đang chạy.
- Sau khi push `main`, xác minh URL online tải đúng bản mới, không lỗi console và hiển thị banner Dự thảo.

## 12. Tiêu chí hoàn tất bản online đầu tiên

1. Migration dữ liệu và RPC dự thảo được áp thành công, mặc định ở `preview`.
2. Web cho chọn từng hạng mục và hiển thị đúng quyền của Admin, QA, quản lý, người thực hiện và thành viên bộ phận.
3. Người có thẩm quyền lưu được cấu hình dự thảo có lý do, ngày hết hạn và nhật ký.
4. Không thể cấp quyền cho người ngoài phạm vi hợp lệ hoặc tạo quyền Xem/Sửa mâu thuẫn.
5. Không có thay đổi nào tới quyền thực tế khi vẫn ở `preview`.
6. Build, kiểm tra kiểu, SQL security checks và e2e liên quan đều đạt.
7. Code được push lên `main`; trang online được kiểm tra trực tiếp và sẵn sàng cho buổi trao đổi với các bộ phận.

## 13. Ngoài phạm vi bản đầu

- Không tự động bật chế độ `enforced`.
- Không gửi email khi quyền được cấp hoặc sắp hết hạn.
- Không cấp quyền theo nhóm tùy biến ngoài người, bộ phận và vai trò hiện có.
- Không hỗ trợ một tài khoản quản lý nhiều bộ phận.
- Không thay đổi quyền của n8n/service role.
- Không xây dựng quy trình phê duyệt nhiều cấp; lý do và audit log là mức kiểm soát của bản đầu.

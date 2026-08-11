# Thiết kế danh bạ QA và phân quyền theo từng hạng mục

Ngày: 2026-08-11  
Trạng thái: Đã duyệt thiết kế; chờ người dùng rà soát tài liệu viết

## 1. Kết luận

Danh bạ chuẩn chỉ xác định một người là ai, tài khoản nào thuộc về người đó và
người đó được thực hiện loại thao tác nào. Danh bạ QA không chứa phạm vi bộ
phận, xưởng, khu vực hoặc line.

Trách nhiệm và quyền truy cập của QA phát sinh từ phân công trực tiếp trên từng
hạng mục:

- Không có phân công đang hiệu lực: QA không nhìn thấy hạng mục.
- Có phân công đang hiệu lực: QA nhìn thấy hạng mục và cập nhật đúng tám trường
  ngày/trạng thái của bốn mốc QA.
- Một hạng mục có thể có một QA phụ trách chính và nhiều QA phối hợp.
- Chỉ Admin nối tài khoản và kích hoạt quyền; Quản lý QA phân công công việc
  nhưng không được tự cấp hoặc nâng quyền tài khoản.

## 2. Vấn đề cần sửa

Thiết kế hiện tại bắt mọi hồ sơ nhân sự hoạt động chọn đủ bốn tầng
`bộ phận → xưởng → khu vực → line`, rồi kết hợp phạm vi đó với phân công để
quyết định quyền QA. Cách này trộn hai khái niệm khác nhau:

- **Danh tính và năng lực:** người này là ai, tài khoản nào, được làm loại việc
  gì.
- **Trách nhiệm:** người này đang chịu trách nhiệm hạng mục nào.

Đối với QA, khu vực không phải căn cứ cấp quyền. Quản lý chỉ định QA trực tiếp
trên từng hạng mục mới là căn cứ nghiệp vụ chính xác. Việc giữ thêm điều kiện
phạm vi khiến cấu hình nặng, dễ khóa nhầm người và không trả lời rõ ai thực sự
chịu trách nhiệm.

## 3. Mục tiêu và phạm vi

### Trong phạm vi

- Mỗi người trong danh bạ có một `person_id` ổn định và duy nhất.
- Admin nối tối đa một tài khoản Auth `user_id` vào một `person_id`.
- Hồ sơ QA không nhập hoặc kiểm tra phạm vi xưởng/khu vực/line.
- Quản lý QA phân công một hoặc nhiều QA vào từng hạng mục.
- Mỗi hạng mục có tối đa một QA chính và nhiều QA phối hợp.
- QA chỉ đọc hạng mục được phân công và chỉ sửa tám trường tiến độ QA.
- Ngắt tài khoản, khóa hồ sơ hoặc thu hồi phân công làm mất quyền ngay.
- Mọi thay đổi quyền và trách nhiệm có nhật ký.
- RLS, RPC đọc, dashboard và số tổng hợp dùng cùng một phép kiểm quyền.

### Ngoài phạm vi

- Không cho QA tự nhận việc hoặc chuyển việc cho người khác.
- Không cấp quyền chỉ vì tên, email hoặc bộ phận trùng khớp.
- Không thay đổi quyền xếp lịch của bộ phận quản lý thiết bị ngoài phần cần
  thiết để tách quy tắc QA.
- Không tự bật chế độ `enforced`; hệ thống tiếp tục ở `preview` cho tới khi tiền
  kiểm và nghiệm thu đạt.
- Không xóa lịch sử phân công khi người dùng bị khóa hoặc ngắt tài khoản.

## 4. Danh tính và danh bạ chuẩn

### 4.1 Một người, một khóa nội bộ

Mỗi hồ sơ nhân sự có một `person_id` bất biến. Các định danh có vai trò riêng:

| Trường | Ý nghĩa | Có dùng làm khóa phân công không |
|---|---|---|
| `person_id` | Khóa nội bộ của hồ sơ nhân sự | Có |
| `user_id` | Tài khoản Supabase Auth được Admin nối | Không; dùng xác thực người đăng nhập |
| `employee_code` | Mã nhân viên để nghiệp vụ đối chiếu | Không |
| `full_name` | Tên hiển thị | Không |

Phân công luôn lưu `person_id`. Đổi họ tên, email hoặc mã nhân viên không làm
mất trách nhiệm đã gán. Hai người trùng tên vẫn là hai hồ sơ khác nhau và được
phân biệt bằng `person_id`, mã nhân viên, email và bộ phận.

### 4.2 Trường của hồ sơ QA

Form danh bạ QA gồm:

- Họ tên.
- Mã nhân viên.
- Bộ phận chính, bắt buộc là QA đối với phân loại QA.
- Email dự kiến dùng cho tài khoản.
- Phân loại `QA phụ trách` hoặc `Quản lý QA`.
- Trạng thái hoạt động.
- Trạng thái nối tài khoản và kích hoạt quyền.

Form QA không hiển thị và không yêu cầu:

- Phạm vi bộ phận.
- Xưởng.
- Khu vực.
- Line.

Các vai trò ngoài QA vẫn có thể dùng phạm vi phân cấp nếu nghiệp vụ của vai trò
đó cần. Giao diện và kiểm tra server phải dựa trên phân loại nhân sự, không bắt
mọi loại hồ sơ dùng chung một mẫu bắt buộc.

## 5. Nối tài khoản và kích hoạt quyền

Tạo hồ sơ danh bạ hoặc tạo phân công chưa tự cấp quyền hệ thống. Một QA chỉ có
quyền hiệu lực khi đồng thời thỏa mãn tất cả điều kiện:

1. Hồ sơ `person_id` tồn tại và đang hoạt động.
2. Admin đã nối đúng một `user_id` đang hoạt động vào hồ sơ đó.
3. Admin đã cấp phân loại `QA phụ trách` hoặc `Quản lý QA` phù hợp.
4. Với QA phụ trách, có phân công QA đang hiệu lực trên hạng mục đang xét.

Chỉ Admin được:

- Nối hoặc ngắt `user_id` với `person_id`.
- Cấp hoặc thay đổi phân loại quyền.
- Kích hoạt hoặc khóa hồ sơ nhân sự.

Email không tự tạo liên kết. Hệ thống có thể dùng email để đề xuất ứng viên cho
Admin, nhưng chỉ thao tác xác nhận của Admin mới ghi `user_id`.

Khi ngắt liên kết hoặc khóa hồ sơ, quyền bị thu hồi ngay. Các phân công được giữ
ở trạng thái nghiệp vụ để không mất lịch sử và có thể được quản lý chuyển sang
người khác.

## 6. Mô hình phân công QA

Mỗi phân công QA đang hoạt động biểu diễn quan hệ:

```text
validation_code + person_id + assignment_role
```

`assignment_role` có hai giá trị:

- `primary`: QA phụ trách chính.
- `collaborator`: QA phối hợp.

Quy tắc toàn vẹn:

- Một hạng mục có tối đa một phân công `primary` đang hoạt động.
- Một hạng mục có thể có nhiều phân công `collaborator` đang hoạt động.
- Một `person_id` chỉ có một phân công QA đang hoạt động trên cùng hạng mục.
- QA chính và QA phối hợp có cùng quyền xem và sửa tiến độ.
- Vai trò chính chỉ dùng cho trách nhiệm, báo cáo và ưu tiên thông báo.
- Đổi QA chính phải diễn ra trong một transaction: hạ hoặc thu hồi QA chính cũ
  và kích hoạt QA chính mới mà không tạo thời điểm có hai QA chính.
- Thu hồi phân công không xóa bản ghi; hệ thống lưu trạng thái, người thao tác,
  thời gian và lý do.

Có thể tạo phân công cho hồ sơ chưa nối tài khoản để chuẩn bị nhân sự. Phân công
đó chưa cấp quyền truy cập cho tới khi Admin hoàn tất nối và kích hoạt quyền.

## 7. Ma trận quyền

| Chủ thể | Xem hạng mục | Sửa tiến độ QA | Quản lý phân công | Nối/cấp quyền tài khoản |
|---|---|---|---|---|
| Admin | Toàn bộ | Theo quyền quản trị hiện hành | Toàn bộ | Có |
| Quản lý QA | Tập quản lý cần để phân công | Theo chính sách quản lý đã duyệt | Thêm, đổi, thu hồi QA | Không |
| QA chính | Chỉ hạng mục được phân | 8 trường QA | Không | Không |
| QA phối hợp | Chỉ hạng mục được phân | 8 trường QA | Không | Không |
| QA chưa phân công | Không thấy hạng mục | Không | Không | Không |
| Hồ sơ chưa nối/đã khóa | Không thấy dữ liệu | Không | Không | Không |

Tám trường QA là:

- Ngày thực tế và trạng thái đề cương.
- Ngày thực tế và trạng thái thẩm định thực tế.
- Ngày thực tế và trạng thái báo cáo.
- Ngày thực tế và trạng thái hoàn thành VMP.

QA không được sửa lịch xếp thẩm định, dữ liệu danh mục, quyền hoặc phân công.

## 8. Giao diện

### 8.1 Danh bạ nhân sự

Admin tìm hoặc tạo người bằng họ tên, mã nhân viên hoặc email. Khi chọn hồ sơ,
giao diện hiển thị:

- Thông tin nhận dạng.
- Phân loại.
- Trạng thái hồ sơ.
- Tài khoản đã nối hoặc cảnh báo chưa nối.
- Các thao tác dành riêng cho Admin: nối tài khoản, ngắt tài khoản, cấp quyền,
  khóa hoặc mở lại hồ sơ.

Khi phân loại là QA, khối phạm vi không được tải và không xuất hiện. Vì vậy lỗi
danh mục xưởng/khu vực/line không được làm gián đoạn việc tạo, xem hoặc nối hồ
sơ QA.

### 8.2 Phân công theo hạng mục

Quản lý QA:

1. Tìm hạng mục theo mã hoặc tên.
2. Tìm người trong danh bạ QA đang hoạt động.
3. Chọn `QA phụ trách chính` hoặc `QA phối hợp`.
4. Nhập lý do và xác nhận phân công.
5. Có thể đổi vai trò, thay QA chính hoặc thu hồi phân công.

Mỗi hạng mục hiển thị rõ:

- QA chính.
- Danh sách QA phối hợp.
- Người chưa nối tài khoản hoặc chưa được kích hoạt quyền.
- Thời điểm và người thực hiện thay đổi gần nhất.

### 8.3 Màn làm việc của QA

Sau khi đăng nhập, QA chỉ nhận các hạng mục có phân công đang hiệu lực khớp
`person_id` của tài khoản. Không dùng bộ lọc giao diện để che dữ liệu; server chỉ
trả đúng tập hạng mục được phép.

## 9. Luồng dữ liệu và kiểm quyền

Luồng đọc một hạng mục của QA:

```text
auth.uid()
→ hồ sơ Auth đang hoạt động
→ vmp_performers.user_id
→ person_id + phân loại QA đang hoạt động
→ phân công QA đang hoạt động theo validation_code
→ cho phép trả hạng mục
```

Luồng ghi tiến độ thêm bước kiểm allowlist tám trường QA. Một patch chứa cả
trường hợp lệ và trái phép phải bị từ chối toàn bộ transaction.

Một hàm quyền chuẩn ở database phải là nguồn dùng chung cho:

- RLS trên bảng hạng mục.
- RPC danh sách và chi tiết.
- RPC cập nhật tiến độ.
- Dashboard, cảnh báo và số tổng hợp.
- Bảng xem trước quyền trên màn quản trị.

Frontend chỉ phản ánh quyền; frontend không phải lớp bảo vệ dữ liệu.

## 10. API và tính nguyên tử

Các RPC cần tách theo trách nhiệm rõ ràng:

- Đọc/tìm danh bạ.
- Admin tạo hoặc sửa hồ sơ danh bạ.
- Admin nối/ngắt tài khoản và thay đổi phân loại quyền.
- Quản lý QA thêm, đổi vai trò hoặc thu hồi phân công.
- Tính và xem trước quyền hiệu lực.

RPC ghi phải:

- Kiểm vai trò người gọi tại server.
- Nhận `person_id`, không nhận tên làm khóa.
- Dùng optimistic version hoặc khóa transaction để chống ghi đè đồng thời.
- Kiểm uniqueness của QA chính tại database.
- Ghi thay đổi nghiệp vụ và audit trong cùng transaction.
- Đặt `search_path` cố định và thu quyền `public`/`anon`.

## 11. Xử lý lỗi và trạng thái biên

- **Hồ sơ chưa nối:** cho phép chuẩn bị phân công nhưng hiển thị rõ “chưa có
  quyền truy cập”.
- **Tài khoản đã nối người khác:** từ chối, không tự chuyển liên kết.
- **Hai người trùng tên:** bắt buộc chọn theo `person_id` kèm mã nhân viên,
  email và bộ phận.
- **Hai QA chính:** database từ chối; thao tác thay người phải dùng luồng đổi QA
  chính nguyên tử.
- **Hai quản lý sửa đồng thời:** phiên cũ nhận lỗi xung đột và tải lại trạng thái
  mới; không ghi đè âm thầm.
- **Thu hồi hoặc khóa:** lần đọc/ghi kế tiếp mất quyền ngay; không phụ thuộc cache
  frontend.
- **Danh mục phạm vi lỗi:** không ảnh hưởng form hoặc quyền QA.
- **Phiên đăng nhập hết hạn:** từ chối fail-closed và yêu cầu đăng nhập lại.
- **Lưu thành công nhưng tải lại lỗi:** báo rõ thay đổi đã được lưu, không gửi lại
  lệnh ghi một cách mù quáng.

## 12. Nhật ký

Các hành động sau bắt buộc có audit:

- Tạo, sửa, khóa hoặc mở hồ sơ.
- Nối hoặc ngắt `user_id`.
- Cấp hoặc đổi phân loại quyền.
- Thêm phân công, đổi QA chính/phối hợp và thu hồi phân công.

Mỗi bản ghi audit chứa người thao tác, thời điểm, lý do, đối tượng, giá trị trước
và sau. Nhật ký dùng `person_id` và `validation_code` làm khóa tham chiếu, đồng
thời chụp tên hiển thị để con người đọc được lịch sử.

## 13. Di trú từ thiết kế hiện tại

Production hiện chưa có RPC danh mục phạm vi và chưa áp migration
`20260810160000_pham_vi_xuong_khu_vuc_line_va_person_id.sql`. Không triển khai
migration đó nguyên trạng vì nó bắt QA chọn đủ bốn tầng phạm vi.

Kế hoạch triển khai phải:

1. Giữ phần tạo `person_id` và liên kết người theo ID.
2. Bỏ điều kiện phạm vi khỏi hồ sơ, tiền kiểm và phép tính quyền QA.
3. Giữ hoặc tách phạm vi phân cấp cho các vai trò ngoài QA nếu còn cần.
4. Bổ sung vai trò `primary`/`collaborator` và ràng buộc một QA chính.
5. Chuyển phân công QA hiện có sang `person_id`; tên không khớp duy nhất được
   đưa vào tiền kiểm, không tự đoán.
6. Giữ chế độ `preview` và đối chiếu quyền dự kiến trước khi bật `enforced`.

Nếu một môi trường khác đã áp migration phạm vi, dùng migration forward-only để
nới điều kiện QA; không sửa lịch sử migration đã chạy trên môi trường đó.

## 14. Tiền kiểm trước khi bật áp dụng

Tiền kiểm chặn `enforced` nếu còn:

- Tài khoản QA nối tới nhiều hồ sơ hoặc một hồ sơ nối nhiều tài khoản.
- Phân loại QA gắn cho người ngoài bộ phận QA.
- Phân công trỏ tới người không tồn tại hoặc đã ngừng hoạt động.
- Hai QA chính đang hoạt động trên cùng hạng mục.
- Tên nguồn QA chưa nối duy nhất sang `person_id`.
- RPC đọc/tổng hợp còn đường trả dữ liệu ngoài phân công.
- RPC cập nhật còn đường sửa trường ngoài tám trường QA.

QA không bị đánh dấu hồ sơ thiếu chỉ vì không có xưởng, khu vực hoặc line.

## 15. Kiểm thử và tiêu chí nghiệm thu

### Danh bạ và tài khoản

- Tạo hồ sơ QA không cần tải hoặc chọn danh mục phạm vi.
- Mỗi hồ sơ có `person_id` duy nhất và ổn định sau khi đổi tên/email.
- Admin nối đúng một `user_id`; người không phải Admin bị từ chối.
- Hồ sơ chưa nối, bị ngắt hoặc bị khóa không đọc được dữ liệu.
- Hai người trùng tên được phân biệt và phân công đúng bằng `person_id`.

### Phân công

- Một hạng mục nhận được một QA chính và nhiều QA phối hợp.
- Database từ chối hai QA chính đang hoạt động.
- Cùng một người không có hai phân công QA đang hoạt động trên một hạng mục.
- Có thể chuẩn bị phân công cho hồ sơ chưa nối nhưng chưa phát sinh quyền.
- Thu hồi phân công làm hạng mục biến mất ở lần đọc kế tiếp.
- Đổi QA chính là nguyên tử và giữ đầy đủ lịch sử.

### Quyền dữ liệu

- QA đã nối nhưng chưa phân công không thấy hạng mục.
- QA chính và QA phối hợp chỉ thấy các hạng mục của mình.
- Cả hai loại QA cập nhật được đúng tám trường QA.
- QA không sửa được lịch xếp thẩm định hoặc trường quản trị.
- Patch trộn trường hợp lệ và trái phép bị rollback toàn bộ.
- RLS, RPC chi tiết, dashboard, cảnh báo và số tổng hợp trả cùng một tập dữ liệu.
- Gọi API trực tiếp cho kết quả giống giao diện.

### Hồi quy và triển khai

- Admin và Quản lý QA vẫn tìm được danh bạ, phân công và xem quyền dự kiến.
- Luồng phạm vi của vai trò ngoài QA không bị thay đổi ngoài thiết kế.
- `preview` không làm thay đổi quyền production đang chạy.
- Unit, SQL integration, E2E phân quyền, TypeScript và production build đều đạt.
- Sau khi triển khai, API không còn trả lỗi thiếu RPC danh mục khi thao tác hồ sơ
  QA.

## 16. Điều kiện hoàn thành

Thiết kế hoàn thành khi danh bạ QA không còn phụ thuộc phạm vi; mỗi người được
liên kết ổn định bằng `person_id`; chỉ Admin kích hoạt quyền; Quản lý QA phân
công một QA chính và nhiều QA phối hợp theo từng hạng mục; chỉ người đủ điều
kiện nối tài khoản, phân loại và phân công mới đọc hoặc cập nhật đúng dữ liệu;
mọi đường API và mọi kiểm thử đều phản ánh cùng quy tắc đó.

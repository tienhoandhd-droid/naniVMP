# Thiết kế hiệu chỉnh vai trò tài khoản và quyền tiến độ

**Ngày:** 2026-08-27  
**Nguồn mã:** `origin/main@45d6c53075d17fa52effcab69eb25850bb28d060`  
**Phạm vi:** hiệu chỉnh phần đã xây; không xây lại hệ thống vai trò, phân công hoặc giao diện quản trị.

## 1. Mục tiêu

Đưa dữ liệu tài khoản và quyền cập nhật tiến độ về đúng các quyết định nghiệp vụ đã chốt:

- Đỗ Đắc Anh Khoa là Quản lý QA.
- Lê Hoàng Đạt là Nhân viên xưởng thuộc bộ phận Kiểm nghiệm.
- Nhân viên QA chỉ cập nhật bảy trường tiến độ trên hạng mục được phân công và không cập nhật Ngày thẩm định thực tế.
- Quản lý QA cập nhật đủ tám trường tiến độ trên toàn bộ hạng mục hoạt động, bao gồm Ngày thẩm định thực tế.
- Viewer không còn là vai trò nghiệp vụ hiệu lực hoặc lựa chọn trên giao diện quản trị tài khoản.

## 2. Phần đã có và được giữ nguyên

Không tạo lại các thành phần sau:

- danh mục năm vai trò nghiệp vụ;
- bảng và giao diện phân công theo từng hạng mục;
- hàm giải vai trò nghiệp vụ;
- hàm tính quyền xem và quyền sửa theo hạng mục;
- RPC cập nhật tiến độ có kiểm quyền tại máy chủ;
- giao diện quản trị vai trò bằng UUID tài khoản;
- cơ chế đồng bộ người phụ trách và người hỗ trợ từ dữ liệu nguồn sang phân công hạng mục;
- chế độ `preview` và `enforced` độc lập cho quyền màn hình và quyền hạng mục.

Thay đổi lần này chỉ sửa hợp đồng trường được cập nhật, bổ sung kiểm thử hồi quy và chuẩn bị thao tác dữ liệu có kiểm soát bằng các giao diện/RPC đã có.

## 3. Hiện trạng đã kiểm tra chỉ đọc trên production

Tại thời điểm 2026-08-27:

- `screen_access_mode = enforced`;
- `item_permissions_mode = preview`;
- ma trận quyền màn hình còn 102 dòng, trong đó có 17 dòng Viewer;
- ba profile Viewer vẫn hoạt động: Lê Hoàng Đạt và hai tài khoản thử nghiệm Viewer;
- Đỗ Đắc Anh Khoa đang là `department_user`, bộ phận QA, phân loại `qa_progress_editor`, nên được giải thành Nhân viên QA;
- Lê Hoàng Đạt đang là Viewer, bộ phận Kiểm nghiệm, chưa có phân loại quyền;
- `vmp_item_assignments` có 0 dòng;
- có 461 hạng mục hoạt động;
- 281 hạng mục có người phụ trách QA bằng `owner_person_id`;
- 126 hạng mục có người hỗ trợ QA bằng `support_person_id`;
- 180 hạng mục không có cả người phụ trách lẫn người hỗ trợ QA.

Các kiểm tra trên được chạy trong transaction chỉ đọc và kết thúc bằng rollback.

## 4. Hợp đồng quyền đích

### 4.1. Quản lý QA

Quản lý QA xem và cập nhật toàn bộ hạng mục hoạt động. Tám trường được cập nhật là:

1. Ngày đề cương thực tế — `actual_protocol_date`;
2. Trạng thái đề cương — `status_protocol`;
3. Ngày thẩm định thực tế — `actual_validation_date`;
4. Trạng thái thẩm định — `status_validation`;
5. Ngày báo cáo thực tế — `actual_report_date`;
6. Trạng thái báo cáo — `status_report`;
7. Ngày hoàn thành kế hoạch thẩm định gốc thực tế — `actual_vmp_date`;
8. Trạng thái hoàn thành kế hoạch thẩm định gốc — `status_vmp`.

Quản lý QA không cần phân công từng hạng mục để có quyền cập nhật tám trường này.

### 4.2. Nhân viên QA

Nhân viên QA chỉ xem và cập nhật hạng mục có phân công QA đang hiệu lực cho đúng `person_id`. Bảy trường được cập nhật là:

1. `actual_protocol_date`;
2. `status_protocol`;
3. `status_validation`;
4. `actual_report_date`;
5. `status_report`;
6. `actual_vmp_date`;
7. `status_vmp`.

Nhân viên QA không được cập nhật `actual_validation_date`, kể cả khi hạng mục được phân công. Máy chủ phải từ chối payload chỉ chứa trường bị cấm và payload trộn trường được phép với trường bị cấm; dữ liệu và version phải giữ nguyên sau lần từ chối.

### 4.3. Nhân viên xưởng

Nhân viên xưởng chỉ cập nhật `actual_validation_date` trên hạng mục được phân công đang hiệu lực. Bộ phận chỉ giúp giải đúng vai trò và kiểm tính hợp lệ của phân công; bộ phận Kiểm nghiệm không tự động cấp quyền trên mọi hạng mục có liên quan đến Kiểm nghiệm.

### 4.4. Admin và các vai trò khác

Quyền Admin, Quản lý xưởng và các quyền màn hình không thay đổi ngoài việc Viewer bị loại khỏi tập vai hiệu lực. Không mở rộng quyền đọc hoặc quyền ghi cho bất kỳ vai nào.

## 5. Hiệu chỉnh tài khoản

Các thao tác tài khoản phải dùng UUID đã đối chiếu từ dữ liệu production; không chọn bản ghi bằng tên hoặc email trong câu lệnh ghi.

### 5.1. Đỗ Đắc Anh Khoa

- profile đăng nhập: `qa_manager`;
- bộ phận profile: QA;
- phân loại hồ sơ nhân sự: `qa_manager`;
- bộ phận hồ sơ nhân sự: QA;
- trạng thái profile và hồ sơ nhân sự: hoạt động;
- kết quả bắt buộc: resolver trả `qa_manager`.

### 5.2. Lê Hoàng Đạt

- profile đăng nhập: `department_user`;
- bộ phận profile: Kiểm nghiệm (`qc` theo mã canonical hiện hành);
- phân loại hồ sơ nhân sự: `workshop_staff`;
- bộ phận hồ sơ nhân sự: Kiểm nghiệm;
- trạng thái profile và hồ sơ nhân sự: hoạt động;
- kết quả bắt buộc: resolver trả `workshop_staff`.

Đạt chỉ có quyền cập nhật hạng mục sau khi có phân công cụ thể. Việc đổi vai không tự tạo phân công rộng theo bộ phận.

### 5.3. Hai tài khoản thử nghiệm Viewer còn lại

Hai profile Viewer thử nghiệm được chuyển sang không hoạt động để biến mất khỏi danh sách tài khoản hoạt động và để token cũ không còn quyền. Không xóa vật lý Auth user, hồ sơ audit hoặc lịch sử nghiệp vụ. Không thay đổi các tài khoản thử nghiệm thuộc năm vai hợp lệ nếu chưa có chỉ thị riêng.

Giá trị enum PostgreSQL `viewer` có thể tiếp tục tồn tại như giá trị legacy bất hoạt; frontend, resolver và ma trận hiệu lực không được công nhận nó là vai nghiệp vụ.

## 6. Đồng bộ phân công đã có thiết kế

Không tạo bảng hoặc thuật toán phân công mới. Chạy đường đồng bộ canonical đã có để materialize:

- người phụ trách QA từ `owner_person_id` thành phân công QA chính;
- người hỗ trợ QA từ `support_person_id` thành phân công QA phối hợp;
- mỗi quan hệ dùng `person_id`, không khớp bằng tên;
- quan hệ trùng phải được hợp nhất theo constraint hiện hành;
- nguồn thiếu hoặc hồ sơ không hợp lệ phải tạo bằng chứng lỗi, không tự gán người khác.

Sau đồng bộ, 180 hạng mục chưa có cả người phụ trách lẫn người hỗ trợ vẫn không cấp quyền cho Nhân viên QA. Các hạng mục này phải được phân công thủ công qua giao diện đã có trước khi Nhân viên QA cập nhật.

Không tự động phân công Lê Hoàng Đạt cho toàn bộ hạng mục của bộ phận Kiểm nghiệm.

## 7. Kiến trúc thay đổi

Áp dụng một bản sửa tiến về phía trước trên `origin/main`:

1. test SQL mô tả quyền bảy trường của Nhân viên QA và tám trường của Quản lý QA;
2. test writer thật chứng minh trường bị cấm bị từ chối nguyên tử;
3. migration bổ sung thay định nghĩa quyền hạng mục nhưng giữ chữ ký RPC/RLS hiện hành;
4. contract frontend tách danh sách trường Quản lý QA khỏi danh sách trường Nhân viên QA nếu giao diện đang dùng chung một hằng;
5. test giao diện chứng minh trường Ngày thẩm định thực tế bị khóa với Nhân viên QA nhưng mở với Quản lý QA;
6. script/checker read-only xác minh đúng hai tài khoản thật, hai tài khoản Viewer thử nghiệm và kết quả đồng bộ phân công;
7. runbook dữ liệu dùng manifest UUID bên ngoài Git và yêu cầu xác nhận riêng trước mọi ghi production.

Database/RPC là biên bảo mật. Frontend chỉ trình bày `editable_fields` do máy chủ trả về và không tự suy quyền từ nhãn vai trò.

Bộ triển khai five-role ngày 24/08 là nguồn tham chiếu bảo mật nhưng entrypoint
`scripts/apply-five-role-hardening.sql` không được chạy nguyên trạng cho yêu cầu
này. Entrypoint cũ bắt buộc vô hiệu hóa đúng bảy profile gồm ba Viewer, ba
`department_user` và một `qa_manager`; điều đó sẽ vô hiệu hóa cả các tài khoản
thử nghiệm năm vai mà yêu cầu hiện tại không cho phép đụng tới, đồng thời vô
hiệu hóa Đạt trước khi chuyển vai. Kế hoạch triển khai phải tạo entrypoint mới
có precondition theo trạng thái live, tái sử dụng phần hardening schema đã
review nhưng dùng manifest riêng cho đúng bốn tài khoản cần hiệu chỉnh: Khoa,
Đạt và hai Viewer thử nghiệm còn lại.

## 8. Các phương án đã cân nhắc

### Phương án được chọn: bản sửa bổ sung trên `origin/main`

Giữ toàn bộ hệ thống đã xây, viết test trước rồi sửa đúng contract trường và dữ liệu. Phương án này ít thay đổi nhất, giữ được các bản vá năm vai và quản trị tài khoản mới nhất.

### Phương án không chọn: chỉ sửa dữ liệu bằng giao diện hiện có

Đổi được vai Khoa và Đạt nhưng không sửa được lỗi Nhân viên QA đang nhận quyền trên `actual_validation_date`; cũng không tạo được bằng chứng hồi quy ở máy chủ.

### Phương án không chọn: hợp nhất local `main` cũ vào `origin/main`

Hai lịch sử không có merge-base và khác phạm vi repository. Hợp nhất sẽ kéo lại hàng chục nghìn dòng migration/tài liệu/n8n đã được tách khỏi repo web, tạo rủi ro lớn không liên quan đến yêu cầu.

## 9. Kiểm thử và bằng chứng

Triển khai phải theo RED → GREEN:

- RED: Nhân viên QA đang nhận tám trường, bao gồm `actual_validation_date`;
- GREEN: Nhân viên QA chỉ nhận đúng bảy trường và writer từ chối `actual_validation_date`;
- GREEN: Quản lý QA vẫn nhận đủ tám trường trên hạng mục hoạt động, không cần assignment;
- GREEN: Nhân viên xưởng chỉ nhận `actual_validation_date` trên hạng mục được giao;
- GREEN: Viewer không resolve thành vai nghiệp vụ và không có màn/quyền hạng mục;
- GREEN: test unit, typecheck, build, test SQL quyền và E2E quyền liên quan đều đạt;
- GREEN: checker read-only báo đúng vai Khoa/Đạt, không còn Viewer hoạt động và số phân công sau đồng bộ khớp nguồn hợp lệ.

Primary phải tự kiểm tra mọi diff và chạy lại toàn bộ lệnh xác minh. Một reviewer độc lập có năng lực tương ứng rủi ro bảo mật phải kiểm tra migration, RPC writer, atomicity, ACL, rollback và false-green tests.

## 10. Triển khai production và rollback

Yêu cầu hiện tại cho phép xây dựng và xác minh thay đổi trong repository, không tự động cho phép ghi production, push, merge hoặc deploy.

Khi có phê duyệt production riêng:

1. chạy preflight hoàn toàn chỉ đọc và khóa UUID mục tiêu;
2. sao lưu trạng thái profile, performer, assignment, mode và định nghĩa hàm liên quan;
3. áp hardening schema five-role và migration quyền bổ sung bằng entrypoint mới; không gọi entrypoint bảy-account cũ;
4. thực hiện hiệu chỉnh đúng bốn tài khoản và đồng bộ phân công bằng đường quản trị đã duyệt;
5. mở kết nối mới và chạy postflight theo năm persona;
6. chỉ cân nhắc bật `item_permissions_mode = enforced` khi preflight không còn blocker quyền và kết quả phân công đã được người phụ trách nghiệp vụ duyệt.

Nếu migration lỗi trước commit, PostgreSQL rollback toàn transaction. Nếu lỗi sau commit, dùng bản sửa tiến về phía trước; không mở lại Viewer, không mở quyền Nhân viên QA trên Ngày thẩm định thực tế và không sửa migration cũ. Nếu một tài khoản hợp lệ bị khóa nhầm, đưa riêng tài khoản đó về trạng thái trước từ backup đã khóa và điều tra trước khi tiếp tục.

## 11. Ngoài phạm vi

- xây lại giao diện phân công hoặc quản trị tài khoản;
- thay đổi deadline kế hoạch hoặc logic phát sinh timeline;
- tự động gán toàn bộ hạng mục theo bộ phận;
- xóa vật lý Auth user hoặc lịch sử audit;
- xử lý các tài khoản thử nghiệm không mang vai Viewer;
- bật quyền hạng mục trên production khi còn blocker;
- push, merge, deploy hoặc ghi production khi chưa có phê duyệt riêng.

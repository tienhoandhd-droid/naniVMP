# Thiết kế áp deadline danh mục cho hạng mục đã có tiến độ

**Ngày:** 2026-08-26  
**Phạm vi:** Luồng Dữ liệu nguồn → Ảnh hưởng tới timeline  
**Mục tiêu:** Cho phép Admin hoặc Quản lý QA chủ động cập nhật deadline kế hoạch theo dữ liệu nguồn cho hạng mục đã có tiến độ, nhưng không thay đổi ngày thực tế, trạng thái, người thực hiện hay dữ liệu tiến độ khác.

## 1. Vấn đề hiện tại

`rpc_preview_catalog_change` xếp một hạng mục vào `giu_nguyen` nếu hạng mục có ít nhất một ngày thực tế hoặc một trạng thái khác `not_started`. `rpc_apply_catalog_change` không cập nhật các dòng này. Giao diện lại hướng dẫn sửa deadline tại màn Cập nhật tiến độ, trong khi màn đó không có trường deadline. Vì vậy người dùng không có đường hợp lệ để cập nhật deadline của `CCTB01/2026.01-PQ` và các trường hợp tương tự.

Thiếu dữ liệu nguồn và khóa vì đã có tiến độ là hai nguyên nhân độc lập. Giao diện phải phân biệt rõ hai trường hợp này.

## 2. Phương án được chọn

Giữ cơ chế áp thông thường cho hạng mục chưa bắt đầu. Với hạng mục đã có tiến độ và deadline tính lại khác deadline hiện tại, màn xem trước hiển thị riêng deadline cũ và mới, lý do hạng mục được bảo vệ, cùng lựa chọn xác nhận đặc biệt.

Người dùng chỉ được yêu cầu ghi đè deadline khi:

- phiên đăng nhập còn hoạt động;
- vai trò hiệu lực là `admin` hoặc `qa_manager`;
- thay đổi danh mục vẫn ở trạng thái chờ và chưa bị thay thế;
- phiên bản timeline vẫn đúng phiên bản vừa xem trước;
- mã hạng mục được chọn nằm đúng trong nhóm có tiến độ của lần xem trước;
- dữ liệu nguồn đủ để tính trọn bốn deadline mới;
- ít nhất một deadline mới khác deadline hiện tại;
- người dùng đã chọn xác nhận đặc biệt và nhập lý do không rỗng.

Không mở khả năng sửa deadline tùy ý tại màn Cập nhật tiến độ. Dữ liệu nguồn vẫn là nguồn tính deadline duy nhất.

## 3. Dữ liệu được phép thay đổi

Đường xác nhận đặc biệt chỉ được cập nhật bốn cột kế hoạch:

- `deadline_protocol`;
- `deadline_validation`;
- `deadline_report`;
- `deadline_vmp`.

Các cột sau phải giữ nguyên tuyệt đối:

- bốn ngày thực tế;
- bốn trạng thái tiến độ;
- trạng thái hoạt động của hạng mục;
- người thực hiện và phân công;
- mã hạng mục, loại thẩm định và đối tượng;
- trường nghiệp vụ không liên quan, ngoại trừ `version` phải tăng đúng một lần và trường kiểm toán mà cơ chế ghi hiện hành bắt buộc cập nhật.

## 4. Xem trước và giao diện

Mỗi dòng `giu_nguyen` trả thêm:

- bốn deadline hiện tại;
- bốn deadline mới được tính từ dữ liệu nguồn;
- danh sách trường dữ liệu nguồn còn thiếu;
- các ngày thực tế hoặc trạng thái cụ thể khiến hạng mục được coi là đã có tiến độ;
- cờ `co_the_ghi_de_deadline` và lý do khi cờ này là `false`;
- `item_version`, là phiên bản toàn hàng tăng đúng một lần sau mọi cập nhật nghiệp vụ.

Nếu deadline mới khác deadline hiện tại và không thiếu dữ liệu, giao diện hiện lựa chọn “Cập nhật deadline kế hoạch dù hạng mục đã có tiến độ”. Mặc định lựa chọn này tắt. Khi bật, người dùng thấy lại mã hạng mục, deadline cũ → mới và cảnh báo rõ ngày thực tế/trạng thái sẽ không đổi.

Nút áp chỉ sáng khi có ít nhất một thao tác thông thường hoặc một hạng mục được chọn ghi đè. Lý do là bắt buộc cho toàn bộ lần áp.

## 5. Hợp đồng lỗi chính xác

Mọi kết quả không thực hiện được phải trả `ok: false`, `error_code`, câu `error` bằng tiếng Việt và `missing` hoặc `details` khi có dữ liệu cụ thể. Không dùng một câu “Áp thất bại” cho lỗi nghiệp vụ đã biết. Trường hợp gửi lại một thay đổi đã áp là ngoại lệ idempotent: trả lại kết quả thành công cũ với `da_ap_truoc_do: true`, nhưng tuyệt đối không ghi lần hai.

| Mã | Khi nào | Nội dung bắt buộc |
|---|---|---|
| `ACCOUNT_DISABLED` / `ROLE_UNRESOLVED` | Phiên không còn hiệu lực | Nêu tài khoản bị vô hiệu hoặc vai trò chưa xác định |
| `FORBIDDEN` | Không phải Admin/Quản lý QA | Nêu đúng quyền cần có |
| `REASON_REQUIRED` | Lý do rỗng | Nêu trường Lý do bắt buộc |
| `CHANGE_NOT_FOUND` | Không tìm thấy thay đổi | Nêu thay đổi không còn tồn tại |
| Không có mã lỗi (idempotent) | Thay đổi đã áp | Trả `ok: true`, `da_ap_truoc_do: true` và kết quả cũ; không ghi lần hai |
| `SUPERSEDED` | Có thay đổi danh mục mới hơn | Yêu cầu mở lần xem trước mới |
| `OBJECT_NOT_FOUND` | Đối tượng nguồn không còn tồn tại | Nêu mã đối tượng |
| `VERSION_CONFLICT` | Timeline/danh mục đổi sau khi xem trước | Trả phiên bản đã xem và phiên bản hiện tại |
| `EXPECTED_REVISION_REQUIRED` | Request override thiếu phiên bản timeline | Nêu phải xem trước lại trước khi áp |
| `INVALID_OVERRIDE_PAYLOAD` | JSON sai kiểu, thiếu/thừa khóa, version null/không nguyên, mã rỗng hoặc trùng | Trả vị trí và lý do payload không hợp lệ |
| `NO_ACTIONABLE_CHANGE` | Không có deadline khác và không có thao tác thường | Nêu timeline đã khớp |
| `MISSING_SOURCE_DATA` | Không tính đủ deadline | Trả chính xác danh sách trường thiếu theo từng mã hạng mục |
| `OVERRIDE_NOT_CONFIRMED` | Có yêu cầu ghi đè nhưng chưa xác nhận | Nêu cần bật xác nhận đặc biệt |
| `INVALID_OVERRIDE_ITEM` | Mã chọn không thuộc nhóm được phép | Trả danh sách mã không hợp lệ |
| `ITEM_NOT_FOUND` | Hạng mục biến mất trước khi áp | Trả mã hạng mục |
| `ITEM_STATE_CHANGED` | Toàn hàng đã có cập nhật sau xem trước | Nêu mã hạng mục, phiên bản đã xem, phiên bản hiện tại và yêu cầu xem trước lại; không đoán cột thay đổi khi request không mang snapshot cũ |
| `WRITE_MISMATCH` | Số dòng cập nhật không đúng dự kiến | Không commit; trả mã chưa ghi được |
| `NETWORK` / lỗi máy chủ | Không gọi được máy chủ | Nêu chưa ghi dữ liệu và dữ liệu cũ còn nguyên |

Thông báo giao diện ưu tiên `error` và danh sách chi tiết do máy chủ trả về. Chỉ dùng câu dự phòng khi máy chủ không trả hợp đồng hợp lệ.

## 6. Tính nguyên tử, cạnh tranh và kiểm toán

Lần áp chạy trong một transaction. Tất cả thao tác tạo, đổi, dừng và ghi đè deadline cùng thành công hoặc toàn bộ rollback. Không có trạng thái cập nhật một nửa. Phần mutation nằm trong một PL/pgSQL exception subtransaction: nếu hậu kiểm phát hiện lệch, subtransaction rollback trước khi RPC trả JSON lỗi.

Mọi đường lưu danh mục, apply V1 và apply V2 lấy cùng transaction-scoped advisory mutex từ cặp bất biến `(object_kind, object_code)` trước row lock. Mutex khiến các đường cũ không thể giữ khóa chéo trên cùng đối tượng. Sau mutex, V2 khóa change → source object → toàn bộ hạng mục hiện có trong impact, sắp theo `validation_code`.

`vmp_plan_items.version` trở thành row revision thật: một trigger duy nhất đặt `NEW.version = OLD.version + 1` trên mọi UPDATE, kể cả writer cũ. Writer đang tự cộng version vẫn chỉ tăng đúng một lần vì trigger ghi đè về giá trị chuẩn. Máy chủ tính lại ảnh hưởng trong transaction, so phiên bản timeline và từng item version sau khi đã khóa. Hai người áp đồng thời không thể ghi chồng. Gửi lại cùng yêu cầu không ghi lần hai.

Apply V2 không tin bộ đếm do apply V1 trả về. Sau V1, nó kiểm hậu trạng thái của từng thao tác tạo/đổi/dừng thường và từng override. Bất kỳ dòng nào không đạt hậu trạng thái dự kiến đều trả `WRITE_MISMATCH` sau rollback toàn bộ subtransaction.

Kết quả áp và nhật ký phải chứa:

- người thực hiện và vai trò hiệu lực;
- lý do;
- mã hạng mục;
- bốn deadline cũ và mới, gồm cả `deadline_validation`;
- xác nhận rằng ngày thực tế và trạng thái không đổi;
- số hạng mục tạo, đổi thường, dừng, ghi đè và giữ nguyên.

## 7. Quyền và tương thích

RPC mới hoặc RPC được mở rộng phải giữ active-session guard của five-role hardening. Hai V2 public boundary là SECURITY DEFINER có `search_path` cố định và kiểm active session + role trước khi đọc dữ liệu. Helper mới là SECURITY INVOKER, owner-only. V2 chỉ gọi public V1 wrappers; không tham chiếu trực tiếp tên hidden `__five_role_impl_20260824`. Không cấp quyền trực tiếp lên bảng.

Public wrapper save và V1 apply được thay in-place để lấy shared object mutex trước khi chuyển vào implementation hiện có. ACL/owner cũ phải được giữ chính xác. Sau migration, browser/service function inventory được rebaseline thành hợp đồng cũ cộng đúng hai V2 boundary, không có delta khác; preflight unfiltered item-reader không được tăng ngoài thay đổi đã review.

Lời gọi áp ba tham số hiện tại tiếp tục hoạt động như cũ và không tự ghi đè deadline. Chỉ lời gọi có danh sách mã ghi đè và xác nhận tường minh mới dùng hành vi mới.

## 8. Kiểm thử và phát hành

- Unit RED/GREEN cho model giao diện, ánh xạ lỗi và payload xác nhận.
- SQL RED/GREEN trên cơ sở dữ liệu thử dùng fixture có tiến độ: deadline đổi, ngày thực tế/trạng thái giữ nguyên; thiếu dữ liệu, sai quyền, stale revision, stale item qua writer cũ, payload sai/trùng, mã không hợp lệ và ghi hai lần đều có kết quả chính xác.
- Kiểm thử transaction rollback khi một mã trong lô không hợp lệ.
- Kiểm thử fault injection sau khi V1 đã mutation để chứng minh rollback cả normal/override/audit/source revision.
- Kiểm thử hai session cho save/apply và apply/apply để chứng minh không deadlock/lost update.
- Kiểm thử post-V2 exact ACL inventory khi V2 đang được cài, không chỉ chạy lại baseline trước V2.
- E2E giả lập cho thao tác chọn ghi đè, lý do bắt buộc, thông báo thiếu dữ liệu và thông báo xung đột.
- Chạy typecheck, toàn bộ unit, build và E2E liên quan trước khi đề nghị push.
- Không chạy mutation test trên production. Production chỉ nhận migration đã review, backup đúng quy trình và postflight chỉ đọc sau khi có phê duyệt triển khai riêng.

## 9. Khôi phục

Frontend có thể quay lại bằng revert commit. Migration là forward-only: nếu cần vô hiệu hành vi mới, thu hồi EXECUTE của RPC ghi đè hoặc thay public boundary bằng bản trả `FEATURE_DISABLED`; không tự động phục hồi deadline đã được người dùng xác nhận trước đó. Mọi deadline cũ nằm trong nhật ký để xử lý nghiệp vụ có chủ đích.

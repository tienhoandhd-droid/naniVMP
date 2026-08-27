# Hiển thị hạng mục cập nhật theo phân công

**Ngày chốt:** 2026-08-27
**Phạm vi:** màn Cập nhật tiến độ, modal Cập nhật tiến độ và chế độ quyền hạng mục production.

## 1. Mục tiêu

Màn Cập nhật tiến độ chỉ hiển thị những hạng mục mà người đang đăng nhập thực sự có ít nhất một trường tiến độ được phép cập nhật. Trong modal, chỉ dựng các trường nằm trong danh sách quyền hiệu lực do database trả về. Người dùng không còn nhìn thấy hạng mục hoặc ô nhập mà họ không thể lưu.

## 2. Luật nghiệp vụ

- Admin và Quản lý QA thấy toàn bộ hạng mục hoạt động vì có quyền cập nhật trên toàn bộ hạng mục.
- Nhân viên QA chỉ thấy hạng mục có phân công QA đang hoạt động cho đúng hồ sơ của mình.
- Nhân viên xưởng chỉ thấy hạng mục có phân công xưởng đang hoạt động, chưa hết hạn và khớp phạm vi của mình.
- Hạng mục không có trường nào được phép cập nhật không xuất hiện trong màn Cập nhật tiến độ. Không hiển thị thẻ chỉ đọc và không cho mở modal.
- Khi Admin hoặc Quản lý QA chọn **QA phụ trách** từ danh bạ trong Dữ liệu nguồn bằng luồng hiện có, sau lần nạp quyền kế tiếp các hạng mục đã được luồng đó phân công phải xuất hiện ở màn Cập nhật tiến độ của người vừa được chọn.
- Khi luồng Dữ liệu nguồn hiện có xóa hoặc thay QA phụ trách, hạng mục phải biến mất khỏi màn Cập nhật tiến độ của người cũ và xuất hiện với người mới. Không thay đổi giao diện, RPC lưu, dữ liệu hoặc quyền truy cập của Dữ liệu nguồn trong đợt này.
- Quản lý QA thấy đúng tám trường: ngày và trạng thái của Đề cương, Thẩm định thực tế, Báo cáo và Tổng kết VMP.
- Nhân viên QA thấy đúng bảy trường trên hạng mục được phân công: tất cả tám trường trên trừ Ngày thẩm định thực tế.
- Nhân viên xưởng thấy đúng một trường trên hạng mục được phân công: Ngày thẩm định thực tế.
- Lịch thẩm định không thuộc danh sách 8/7/1 nên không xuất hiện như một ô cập nhật trong modal này.
- Tiêu đề bước và thông tin nền chỉ xuất hiện khi bước đó có ít nhất một trường được phép sửa. Trong một bước có quyền một phần, chỉ các ô được phép mới được dựng.
- Admin giữ quyền hiện tại do resolver server trả về; frontend không tự suy quyền từ tên vai trò.

## 3. Nguyên nhân hiện tại

Production đang để `item_permissions_mode = preview`. Ở chế độ này, frontend cố ý bỏ qua `editable_fields` và hiển thị toàn bộ form; writer vẫn dùng luật bộ phận cũ. Vì vậy người dùng có thể nhập rồi nhận lỗi khi lưu.

HT-02/2026.01-OQ hiện thuộc Cơ điện, không có `owner_person_id`, không có `support_person_id` và không có dòng phân công. Tôn Nữ Thiện My đúng vai Nhân viên QA nhưng quyền dự kiến trên hạng mục này là `can_view=false`, `editable_fields={}`. Theo thiết kế mới, HT-02 không xuất hiện trong màn Cập nhật tiến độ của Thiện My.

## 4. Kiến trúc

### 4.1. Database là nguồn quyền duy nhất

Thêm một RPC chỉ đọc, security-definer và tự lấy `auth.uid()`, trả về tập quyền cập nhật của phiên hiện tại theo cấu trúc:

```text
validation_code text
editable_fields text[]
view_reason text
```

RPC chỉ trả hạng mục hoạt động có `cardinality(editable_fields) > 0`. Nó gọi resolver chuẩn `vmp_item_rights`; không lặp lại luật vai trò/phân công trong frontend và không nhận user ID từ trình duyệt.

RPC phải fail-closed cho phiên không hoạt động, giữ ACL tối thiểu và có kiểm tra contract/hash tương ứng với các migration quyền hiện tại.

### 4.2. Danh sách Cập nhật tiến độ

Khi vào màn Cập nhật tiến độ, client tải tập quyền bằng một request theo lô. Danh sách `acts` được giao với tập `validation_code` từ RPC trước khi dựng bảng, bộ đếm, tìm kiếm và đường dẫn sâu.

Trong lúc đang tải hoặc tải quyền thất bại, màn không dựng hạng mục. Lỗi được hiển thị rõ và không dùng dữ liệu quyền cũ. Tập quyền được nạp lại khi:

- người dùng đổi phiên;
- tab quay lại trạng thái hiển thị hoặc cửa sổ lấy focus;
- thao tác phân công hoàn tất;
- dữ liệu chính được tải lại.

Không lọc toàn bộ dashboard toàn cục; các màn báo cáo và giám sát tiếp tục dùng phạm vi xem riêng của chúng. Luồng QA phụ trách tại Dữ liệu nguồn chỉ là đầu vào E2E để kiểm tra Cập nhật tiến độ phản ánh phân công; mã và database của Dữ liệu nguồn không thuộc phạm vi sửa.

### 4.3. Modal theo từng trường

`ProgressEditModal` nhận quyền của hạng mục từ tập quyền đã tải để dựng lần đầu và kiểm tra lại quyền server khi mở/focus nhằm chặn quyền vừa bị thu hồi.

- Một field chỉ được render khi tên cột database nằm trong `editable_fields`.
- Một bước chỉ được render khi còn ít nhất một field trong bước đó.
- Nút nhanh “Xong hôm nay” chỉ xuất hiện khi cả ngày và trạng thái của bước đều được phép sửa.
- Bản chênh gửi lên server chỉ chứa field đã render và thực sự thay đổi.
- Nếu quyền bị thu hồi trong lúc modal đang mở, modal xóa bản nháp, ẩn nội dung cập nhật và đưa hạng mục ra khỏi danh sách sau lần nạp lại.

Backend vẫn kiểm allowlist lần cuối; việc ẩn UI không thay thế kiểm tra bảo mật.

### 4.4. Áp quyền thật riêng cho Cập nhật tiến độ

`item_permissions_mode` tiếp tục ở `preview` vì nó điều khiển phạm vi xem hạng mục của nhiều màn khác và preflight toàn hệ thống còn blocker ngoài phạm vi Cập nhật tiến độ. Đợt này không ép bật mode toàn cục và không hạ mức preflight để đi vòng bộ chặn.

Forward migration thay riêng writer `rpc_update_progress` để luôn kiểm `vmp_allowed_timeline_fields()` trước khi ghi, không còn rơi vào luật bộ phận cũ khi mode toàn cục là preview. RPC quyền theo lô dành cho màn Cập nhật tiến độ cũng luôn trả quyền hiệu lực 8/7/1 từ `vmp_item_rights`, không dùng mode toàn cục để mở form.

Frontend bỏ banner “Quyền dự kiến chưa áp dụng” trong modal Cập nhật tiến độ và coi quyền writer này là enforced. Nếu frontend deploy thất bại sau migration, backend vẫn fail-closed; giao diện cũ có thể còn hiện ô thừa nhưng writer từ chối mọi field ngoài allowlist. Rollback dùng forward migration khôi phục wrapper/writer đã backup và deployment frontend trước, không đổi mode hoặc dữ liệu phân công.

## 5. Trạng thái giao diện

- **Đang kiểm tra quyền:** skeleton/thông báo tải, danh sách trống.
- **Không có phân công:** trạng thái rỗng “Bạn chưa có hạng mục được phân công để cập nhật.”
- **Lỗi đọc quyền:** thông báo lỗi và nút thử lại; không hiển thị hạng mục từ cache.
- **Có quyền:** chỉ hiển thị hạng mục và field được server cho phép.
- **Quyền bị thu hồi:** đóng/khóa modal hiện tại, tải lại tập quyền và bỏ hạng mục khỏi danh sách.

## 6. Kiểm thử chấp nhận

### Database

- Admin và Quản lý QA nhận toàn bộ hạng mục hoạt động cùng đúng tám trường.
- Nhân viên QA chỉ nhận hạng mục được phân công và đúng bảy trường.
- Nhân viên QA không nhận HT-02 khi chưa được phân công.
- Tập quyền cập nhật phản ánh phân công do luồng QA phụ trách hiện có tạo/thu hồi; đợt này không thay đổi contract lưu Dữ liệu nguồn.
- Nhân viên xưởng chỉ nhận hạng mục được phân công, đúng phạm vi và đúng một trường.
- Phiên inactive/Viewer không nhận dữ liệu.
- RPC không cho caller truyền user ID, không mở rộng EXECUTE và ổn định khi chạy lặp migration.

### Unit/UI

- Hàm lọc loại hạng mục không có quyền khỏi UpdatePage.
- Mỗi field không được phép hoàn toàn không tồn tại trong DOM.
- Bước không còn field không tồn tại trong DOM.
- Quick action và nút Lưu không thể tạo payload chứa field bị cấm.
- Lỗi quyền và quyền bị thu hồi đều fail-closed.

### E2E

- Quản lý QA thấy mọi hạng mục và tám field.
- QA được phân công thấy hạng mục cùng bảy field; không thấy Ngày thẩm định thực tế.
- QA không được phân công không thấy hạng mục trong danh sách.
- Nhân viên xưởng được phân công chỉ thấy Ngày thẩm định thực tế.
- Thu hồi phân công khi tab đang mở làm hạng mục biến mất sau refresh/focus.
- Luồng liên màn đầy đủ: Quản lý QA vào Dữ liệu nguồn, chọn QA phụ trách và lưu bằng luồng hiện có; đăng nhập đúng tài khoản QA, vào Cập nhật tiến độ và thấy hạng mục; trường Ngày thẩm định thực tế không tồn tại; lưu một trường hợp lệ thành công.
- Luồng ngược: Quản lý QA xóa hoặc thay người; sau khi tài khoản QA cũ refresh/focus, hạng mục biến mất; tài khoản QA mới thấy hạng mục. E2E phải kiểm request/payload thật của hai màn, không chỉ gọi trực tiếp hàm lọc frontend.
- Payload gửi lên không chứa field ẩn và database chấp nhận field hợp lệ.

## 7. Triển khai và rollback

1. Backup database và chạy preflight chỉ đọc.
2. Áp migration thêm RPC quyền theo lô và cưỡng chế allowlist riêng cho `rpc_update_progress`; giữ nguyên mode toàn cục.
3. Chạy database integration/security trên clone và postflight production mới.
4. Build và chạy unit/E2E trên exact SHA.
5. Deploy frontend exact SHA, kiểm tra persona thật và asset production.
6. Nếu có lỗi, áp forward recovery cho writer/RPC rồi rollback deployment frontend. Không đổi mode, không xóa phân công và không sửa trực tiếp dữ liệu tài khoản.

## 8. Ngoài phạm vi

- Không tự phân công HT-02 cho Thiện My hoặc bất kỳ nhân sự nào.
- Không thay đổi quyền của các màn báo cáo/giám sát khác.
- Không khôi phục Viewer.
- Không mở quyền Lịch thẩm định trong modal tiến độ.

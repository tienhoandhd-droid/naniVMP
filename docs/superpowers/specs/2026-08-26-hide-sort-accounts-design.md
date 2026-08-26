# Thiết kế ẩn và sắp xếp tài khoản

**Ngày:** 2026-08-26  
**Nền phát triển:** `origin/main` tại `79565b22fb88239952ed640ce230d47364e9e28d`  
**Phạm vi:** Màn **Vai trò & phạm vi**, danh bạ chuẩn và ô chọn tài khoản để nối.

## 1. Mục tiêu

- Không xóa tài khoản khỏi Supabase Auth và không xóa lịch sử nghiệp vụ.
- Bảy tài khoản trong manifest đã ký phải được vô hiệu hóa bằng quy trình
  five-role hardening hiện có, không đưa UUID riêng tư vào mã frontend.
- Tài khoản có `is_active=false` không xuất hiện trong danh sách hoặc ô chọn
  tài khoản của giao diện quản trị thông thường.
- Danh sách còn lại được xếp theo vai trò nghiệp vụ, sau đó theo họ tên và
  email để người quản trị tìm nhanh hơn.

## 2. Ranh giới an toàn

- Thay đổi giao diện không tự sửa production và không thay thế runbook đã ký.
- Không lọc theo email, tên miền, tên hiển thị hoặc biểu thức chính quy.
- Không nhúng bảy UUID hoặc digest manifest vào gói JavaScript công khai.
- Không sửa artifact SQL đã niêm phong của Cycle 3.
- Việc vô hiệu hóa bảy tài khoản vẫn phải chạy qua đúng manifest UUID đã ký,
  ghi bảy audit row và giữ nguyên `auth.users`, performer, assignment và audit
  lineage theo thiết kế five-role hardening.
- Nếu Cycle 3 chưa áp dụng thành công, giao diện mới chỉ có thể ẩn những dòng
  mà server đã đánh dấu inactive; không được giả vờ rằng tài khoản active đã
  bị vô hiệu hóa.

## 3. Hành vi hiển thị

### 3.1 Danh bạ chuẩn

Danh bạ vẫn giữ người đang hoạt động nhưng chưa có tài khoản để Admin có thể
hoàn thiện hồ sơ và nối tài khoản mới. Chỉ loại dòng có
`account_status="inactive"`; không loại dòng `unlinked`.

Các dòng còn lại xếp theo `access_class`:

1. `admin` — Quản trị viên, nếu payload server cung cấp phân loại này;
2. `qa_manager` — Quản lý chất lượng;
3. `qa_progress_editor` — Nhân viên chất lượng;
4. `equipment_manager` — Quản lý xưởng;
5. `workshop_staff` — Nhân viên xưởng;
6. phân loại cũ, thiếu hoặc chưa xác định.

Trong cùng nhóm, xếp theo `full_name` với locale `vi`, sau đó theo `email`, rồi
`person_id` làm khóa ổn định cuối cùng. Hàm không được sắp xếp trực tiếp mảng
đầu vào.

### 3.2 Ô chọn tài khoản để nối

Adapter `searchAccountCandidates()` loại mọi candidate có
`is_active=false` trước khi trả dữ liệu cho component. Component tiếp tục kiểm
tra phòng vệ để một caller khác không vô tình dựng option inactive.

Hợp đồng candidate hiện chỉ có login role cũ (`admin`, `qa_manager`,
`department_user`, `viewer`), chưa đủ dữ liệu để suy diễn ba vai phân xưởng/QA.
Vì vậy ô chọn này chỉ xếp theo thông tin server thực sự trả:

1. `admin`;
2. `qa_manager`;
3. `department_user`;
4. `viewer` hoặc giá trị chưa xác định;
5. cùng nhóm xếp theo `full_name`, `email`, rồi `user_id`.

Không đoán vai nghiệp vụ chi tiết từ email, bộ phận hoặc tên. Sau khi tài khoản
được nối với hồ sơ, danh bạ chuẩn mới là nơi hiển thị thứ tự năm vai đầy đủ.

## 4. Cấu trúc mã

- Thêm module thuần trong `src/features/itemPermissions/` chịu trách nhiệm lọc
  và sắp xếp. Module nhận mảng readonly và trả mảng mới.
- `api.ts` dùng module này cho kết quả candidate.
- `StaffDirectoryPanel.tsx` dùng module này cho kết quả danh bạ trước khi cập
  nhật state; các luồng reload theo `person_id` giữ nguyên.
- `AccountLinkPanel.tsx` không còn dựng option inactive. Không đổi RPC write,
  quyền Admin, debounce, sequence guard hoặc quy trình nối/gỡ tài khoản.

## 5. Trạng thái rỗng và lỗi

- Nếu mọi kết quả đều inactive, giao diện không dựng các dòng đó và giữ trạng
  thái không có kết quả hiện tại.
- Lỗi payload, lỗi RPC và lỗi quyền giữ nguyên hành vi fail-closed hiện có.
- Nếu một dòng thiếu phân loại, dòng đó vẫn hiển thị ở nhóm cuối; không loại
  người hợp lệ chỉ vì dữ liệu chưa hoàn thiện.

## 6. Kiểm thử

Thực hiện theo RED/GREEN:

- Unit: inactive directory row bị ẩn nhưng unlinked row vẫn còn.
- Unit: inactive account candidate bị ẩn.
- Unit: năm access class đúng thứ tự; cùng vai xếp tên/email/ID ổn định.
- Unit: login role của candidate đúng thứ tự legacy được phép.
- Unit: hàm không thay đổi mảng đầu vào và dữ liệu lạ nằm cuối.
- Component contract: không render option inactive kể cả khi được truyền trực
  tiếp.
- E2E giả lập vừa phải: màn Vai trò & phạm vi không hiện tài khoản inactive,
  vẫn hiện người chưa nối, và thứ tự vai trò đúng.
- Regression: unit đầy đủ, typecheck và build production.

## 7. Trình tự phát hành

1. Tạo test RED, triển khai tối thiểu và chạy GREEN trên worktree riêng.
2. Reviewer độc lập kiểm diff; Sol review cuối yêu cầu 0 Critical/0 Important.
3. Chạy E2E giả lập đã nêu, typecheck, unit và build.
4. Production account state chỉ được thay đổi qua runbook Cycle 3 đã ký. Nếu
   runbook vẫn bị chặn, báo rõ rằng tài khoản active chưa thể bị ẩn theo trạng
   thái, không tạo đường tắt frontend.
5. Khi verification đạt và trạng thái production hợp lệ, fast-forward/push
   nhánh lên `main` theo ủy quyền hiện có; không force-push.

## 8. Tiêu chí hoàn thành

- Không UUID riêng tư nào xuất hiện trong source hoặc build.
- Không tài khoản inactive nào xuất hiện ở hai bề mặt quản trị nêu trên.
- Người chưa nối tài khoản vẫn có thể được tìm và chọn.
- Thứ tự vai trò và thứ tự tên ổn định đúng mục 3.
- Không có thay đổi ngoài phạm vi, không xóa Auth user hoặc lịch sử.
- Kiểm thử và review mục 6–7 có bằng chứng mới.

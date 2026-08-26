# Thiết kế làm rõ vai trò và phạm vi

**Ngày:** 2026-08-26
**Nền phát triển:** `origin/main` tại `642e2b6103b682d3c82f776dbd688c453071de57`
**Phạm vi phát hành:** Chỉ frontend. Không migration, không ghi production và không tạo tài khoản Supabase Auth.

## 1. Mục tiêu

Màn **Vai trò & phạm vi** trở thành nơi duy nhất để quản trị viên hiểu trạng thái tài khoản, vai trò nghiệp vụ và phạm vi của một người. Đợt này phải:

- dùng đúng một từ vựng gồm năm vai trò nghiệp vụ;
- không chọn tài khoản hoặc đích ghi bằng email hay tên;
- cho biết người nào đã sẵn sàng và việc tiếp theo là gì;
- không ghi ngay khi quản trị viên vừa đổi ô chọn vai;
- không thay đổi luật quyền ở server, dữ liệu production hoặc chế độ áp dụng quyền.

## 2. Ngoài phạm vi

- Không tạo RPC hoặc migration mới.
- Không tạo tài khoản Auth, Edge Function hoặc service-role workflow.
- Không sửa dữ liệu phạm vi của hạng mục và không bật `item_permissions_mode=enforced`.
- Không mở lại tab Nhân sự.
- Không tuyên bố bản đối chiếu frontend là mô phỏng toàn bộ quyền server.

## 3. Một nguồn từ vựng

Tạo catalog frontend dùng chung với đúng năm vai:

1. `admin` — Quản trị.
2. `qa_manager` — Quản lý QA.
3. `qa_staff` — Nhân viên QA.
4. `workshop_manager` — Quản lý xưởng.
5. `workshop_staff` — Nhân viên xưởng.

Catalog chứa mã, nhãn và mô tả phạm vi. `src/lib/access.ts`, phần quản trị tài khoản và các nhãn liên quan phải dùng catalog này. Các mã kỹ thuật cũ như `department_user`, `viewer`, `qa_progress_editor` và `equipment_manager` không được trình bày như vai trò nghiệp vụ cho người dùng. Giá trị legacy vẫn được decoder nhận để hiển thị trạng thái chưa giải được; không được chọn mới.

Mô tả phạm vi chỉ có ba chế độ rõ ràng:

- `role_policy`: theo chính sách của vai Quản trị hoặc Quản lý QA;
- `qa_assignment`: theo phân công QA;
- `hierarchy`: theo bộ phận, xưởng, khu vực và dây chuyền canonical.

Mảng phạm vi rỗng không bao giờ được diễn giải thành “toàn bộ”. Với vai xưởng, thiếu bất kỳ tầng nào phải hiện **Chưa cấu hình**.

## 4. Read-model phía client chỉ nối bằng mã định danh

Đợt này dùng ba RPC hiện có:

- `rpc_nguoi_va_quyen`: tài khoản, `user_id` và `pid`;
- `rpc_business_roles`: `user_id`, vai hiệu lực và lý do chưa giải được;
- `rpc_item_permission_directory`: `person_id`, `user_id`, trạng thái tài khoản và bốn tầng phạm vi.

Model thuần ghép theo:

```text
account.user_id -> effectiveRole.user_id
account.pid -> directory.person_id
```

Email và tên chỉ để hiển thị hoặc tìm kiếm. Chúng không được dùng để chọn target cho `rpc_set_business_role` hoặc bất kỳ mutation nào. Dòng không ghép được bằng ID vẫn được hiển thị với trạng thái thiếu; không suy ghép bằng email.

## 5. Checklist sẵn sàng

Mỗi người có sáu trạng thái. Mỗi trạng thái là `ready`, `missing`, `not_applicable` hoặc `unknown`:

1. Tài khoản tồn tại và đang hoạt động.
2. Tài khoản đã nối đúng hồ sơ bằng ID.
3. Server giải được đúng một trong năm vai.
4. Bộ phận phù hợp với vai theo resolver hiện hành:
   - Quản trị: `not_applicable`.
   - Quản lý QA và Nhân viên QA: bộ phận hồ sơ là `QA`.
   - Hai vai xưởng: bộ phận tài khoản và bộ phận hồ sơ cùng một mã không rỗng.
5. Phạm vi phù hợp:
   - Quản trị và Quản lý QA: `not_applicable`, ghi “Theo chính sách vai”.
   - Nhân viên QA: `not_applicable`, ghi “Theo phân công QA”.
   - Hai vai xưởng: đủ cả bốn tầng canonical mới là `ready`.
6. Phân công: chỉ đánh dấu `ready` khi nguồn hiện tại chứng minh được; nếu RPC hiện có không đủ dữ liệu thì dùng `unknown`, tuyệt đối không đoán.

Mỗi mục `missing` có đúng một hành động tiếp theo, ví dụ **Nối tài khoản**, **Chọn đủ phạm vi** hoặc **Chọn lại vai để sửa dữ liệu lệch**.

## 6. Luồng đổi vai an toàn

- Chọn vai chỉ cập nhật bản nháp trong UI, không gọi RPC.
- Khối **Đối chiếu thay đổi** hiển thị tên, email, `user_id` rút gọn, vai cũ → vai mới và cách phạm vi sẽ được hiểu.
- Lý do là trường bắt buộc hiển thị trong trang; không dùng `window.prompt`.
- Chỉ nút **Lưu thay đổi** mới gọi `rpc_set_business_role` đúng một lần với `user_id` của dòng đang sửa.
- **Hủy** trả bản nháp về giá trị đã lưu và không gọi mutation.
- Khi người dùng chuyển từ A sang B trong lúc request A đang chạy, kết quả A không được ghi đè trạng thái B.
- Sau thành công, tải lại read-model bằng ID. Nếu server trả vai khác dự kiến, hiển thị lỗi đối chiếu và không tuyên bố thành công.

Đợt này gọi phần trên là **Đối chiếu thay đổi**, không dùng từ “mô phỏng quyền”. Preview quyền chính xác thuộc một đợt backend riêng.

## 7. Bố cục và ranh giới thành phần

- `src/lib/businessRoles.ts`: nguồn duy nhất cho năm vai và mô tả phạm vi.
- `src/features/accountAdministration/accountAdministrationModel.ts`: model thuần để join bằng ID, tính readiness và mô tả phạm vi.
- `src/features/accountAdministration/AccountRoleEditor.tsx`: state bản nháp, đối chiếu, lý do, lưu và hủy.
- `src/features/accountAdministration/AccountAdministrationPanel.tsx`: tải dữ liệu, hiển thị danh sách và checklist.
- `src/pages/PhanQuyenPage.tsx`: dựng panel trong màn **Vai trò & phạm vi**, quyền thao tác tiếp tục lấy từ `access.can(...)`.
- `src/App.tsx`: trang Quản trị chỉ giữ sức khỏe hệ thống, cấu hình, workflow và khối lượng; bỏ bảng đổi vai trùng lặp và phép nối email.

Không chia song song các thay đổi `App.tsx`, `PhanQuyenPage.tsx` và catalog chung vì chúng dùng chung state và hợp đồng. Model/test thuần và review chỉ đọc có thể chạy song song.

## 8. Lỗi và khả năng phục hồi

- Một RPC đọc lỗi không được làm màn trắng; panel hiện lỗi cụ thể và nút tải lại.
- Không đủ nguồn để xác minh phải hiện `unknown`, không chuyển thành `ready`.
- Mutation lỗi giữ nguyên bản nháp và lý do để quản trị viên đọc/sửa; không tự retry.
- Mutation thành công nhưng reload lỗi phải báo “đã ghi nhưng chưa đối chiếu lại được”, không gửi mutation lần hai.
- UI vẫn chỉ là lớp hỗ trợ; server tiếp tục là biên quyết định quyền cuối cùng.

## 9. Kiểm thử và cổng phát hành

RED/GREEN bắt buộc:

1. Catalog có đúng năm vai, không có Viewer và các consumer dùng cùng nhãn.
2. Hai fixture trùng email nhưng khác `user_id` không thể làm mutation nhắm nhầm UUID.
3. Checklist đúng với tài khoản inactive, chưa nối, vai chưa giải được, QA không dùng hierarchy và vai xưởng thiếu từng tầng.
4. Chọn vai hoặc hủy không gọi mutation.
5. Nhập lý do rồi lưu gọi mutation đúng một lần và đúng `user_id`.
6. Kết quả bất đồng bộ của A không ghi đè khi người dùng đã chuyển sang B.
7. E2E tại **Vai trò & phạm vi** thấy checklist; đổi select chưa gọi RPC; bấm lưu mới gọi đúng một lần.
8. Trang Quản trị không còn control đổi vai trùng lặp.

Cổng trước push: focused unit, full unit, typecheck, production build, `e2e:admin`, `e2e:gialap`, `git diff --check`, review độc lập và Sol review toàn diff đạt 0 Critical/0 Important.

## 10. Phát hành và rollback

Đợt này chỉ push frontend bằng fast-forward sau khi các cổng đạt. Theo dõi GitHub Actions và Pages đúng SHA rồi probe màn **Vai trò & phạm vi** chỉ đọc.

Rollback là revert commit frontend và redeploy Pages trước đó. Không có database rollback vì đợt này không thay đổi database, Auth hay tài khoản production.

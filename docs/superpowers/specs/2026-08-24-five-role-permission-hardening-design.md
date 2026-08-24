# Thiết kế siết phân quyền VMP còn năm vai trò

**Ngày:** 2026-08-24
**Production source:** `0a118d45119576c3e2ff0a776728c9fe6f1dd434`
**Phạm vi:** PostgreSQL/Supabase, hợp đồng quyền frontend, cache phiên và bảy tài khoản cần vô hiệu hóa.

## 1. Mục tiêu

Sau đợt triển khai này, VMP chỉ còn năm vai trò nghiệp vụ có hiệu lực:

1. `admin`
2. `qa_manager`
3. `qa_staff`
4. `workshop_manager`
5. `workshop_staff`

Vai `viewer` không còn được resolver, RPC, ma trận hay frontend công nhận. Ba tài khoản Viewer và bốn tài khoản test khác được vô hiệu hóa nhưng không bị xóa khỏi Supabase Auth hoặc khỏi lịch sử nghiệp vụ.

Bản vá đồng thời phải đóng hai lỗi server đã xác nhận:

- người dùng `authenticated` tự sửa `profiles.role` thành `admin`;
- mọi người dùng đã đăng nhập đọc được audit log liên bảng và snapshot `old_data/new_data` qua các RPC mang tên catalog history.

Frontend phải fail-closed khi chưa xác minh được quyền và không được render snapshot preview trước khi biết mode/quyền hiện tại.

## 2. Ngoài phạm vi

- Không xóa vật lý giá trị enum PostgreSQL `viewer`. Giá trị này được giữ làm legacy inert để tránh rewrite type và dependency.
- Không xóa `auth.users`, performer, assignment hoặc audit lineage của bảy tài khoản.
- Không bật `item_permissions_mode=enforced`. Production còn 481 blocker, gồm 461 hạng mục chưa có canonical scope; bật lúc này sẽ khóa người dùng hợp lệ.
- Không sửa dữ liệu scope/assignment để làm preflight xanh giả tạo.
- Không reconcile toàn bộ lịch sử migration backend đã bị loại khỏi nhánh production hiện tại.

## 3. Phương án được chọn

Áp dụng bản vá forward-only phối hợp database và frontend. Database là biên bảo mật và được triển khai trước; frontend theo sau để phản ánh đúng hợp đồng năm vai trò và loại bỏ fail-open/cache cũ.

Không chọn xóa enum `viewer` vì rủi ro lock, dependency và rollback lớn. Không chọn DB-only làm trạng thái cuối vì UI cũ vẫn fallback quyền legacy khi RPC lỗi.

## 4. Nguồn chuẩn và tính lặp lại

Worktree phải tách từ đúng `origin/main@0a118d45119576c3e2ff0a776728c9fe6f1dd434`, không lấy local `main` đang phân kỳ làm source production.

Nhánh production hiện không còn thư mục migration backend. Bản vá phải đưa trở lại một migration forward độc lập cùng checker và rollback runbook; không cherry-pick toàn bộ lịch sử SQL cũ và không sửa migration ledger để giả vờ đã chạy chuỗi migration.

Trước khi viết migration, định nghĩa live của các function, policy, ACL, mode và ma trận phải được trích xuất read-only, băm và dùng làm precondition. Nếu production drift khỏi precondition đã review, migration dừng trước thay đổi đầu tiên.

## 5. Năm vai trò hiệu lực

### 5.1 Resolver và ma trận

- `vmp_business_role(uuid)` chỉ trả một trong năm vai trò giữ lại.
- Profile có login role `viewer` trả `NULL`; unresolved reason là `legacy_role_disabled`.
- Profile inactive hoặc không resolve được vai trò trả zero access, không fallback.
- Xóa đúng 17 dòng `viewer` khỏi `vmp_screen_permissions`.
- Năm vai còn lại giữ nguyên byte-for-byte `can_view`, `data_scope` và `actions`.
- Postcondition bắt buộc: 85 dòng, đúng 17 dòng cho mỗi vai trò.
- `screen_access_mode` vẫn là `enforced`; `item_permissions_mode` vẫn là `preview`.

### 5.2 Hợp đồng RPC quyền

`rpc_my_ui_access()` chỉ trả payload có quyền khi phiên đang hoạt động và resolver trả một trong năm vai. Phiên inactive, role legacy hoặc payload không hợp lệ trả `mode=enforced` với tập màn hình rỗng.

## 6. Vô hiệu hóa bảy tài khoản

Manifest đã được khóa theo UUID tại thời điểm thiết kế:

- 3 Viewer đang hoạt động;
- 3 test account có login role `department_user`;
- 1 test account có login role `qa_manager`;
- 0 Admin;
- 7 UUID duy nhất;
- digest đã duyệt: `2c09501166eb45c3676451084230340e`.

Migration chỉ chạy khi count, role distribution, active state và digest vẫn khớp. Migration cập nhật đúng bảy profile thành inactive và ghi audit reason; không chọn tài khoản bằng regex tại lúc deploy.

Không sửa trực tiếp bảng nội bộ `auth.users`. Nếu có Supabase service-role credential hợp lệ, ban/thu hồi refresh session được thực hiện sau DB commit bằng Auth Admin API chính thức. Đây là defense-in-depth; active-session guard của DB phải chặn cả JWT cũ nên không phụ thuộc bước ban.

## 7. Khóa trust root `profiles`

- Thu hồi `INSERT`, `UPDATE`, `DELETE` trên `profiles` khỏi `PUBLIC`, `anon` và `authenticated`, gồm mọi column-level grant.
- Bỏ policy tự update theo `id = auth.uid()`.
- Giữ SELECT tối thiểu cho self và các vai quản trị hiện hành.
- Mọi thay đổi quyền/tài khoản tiếp tục đi qua RPC quản trị `SECURITY DEFINER` đã kiểm canonical Admin, reason và audit.
- Không cung cấp generic JSON patch cho `role`, `department`, `is_active` hoặc `pham_vi`.
- Thêm guard phòng thủ cho các cột authority để một grant regression tương lai không khôi phục đường tự nâng quyền. Migration/service operation không có JWT được xử lý tường minh; request có JWT chỉ canonical Admin mới được đi qua đường quản trị đã định danh.
- Postcondition bắt buộc: `authenticated` không có UPDATE trên bất kỳ cột nào của `profiles`.

Frontend production hiện chỉ SELECT trực tiếp `profiles`; account administration đã gọi RPC, nên việc thu hồi direct write không loại bỏ consumer hợp lệ đã biết.

## 8. Active-session guard

Một helper canonical ở server xác nhận đồng thời:

- có `auth.uid()`;
- profile tồn tại và `is_active=true`;
- resolver trả một trong năm vai hiệu lực.

Helper phải được áp dụng tại các biên web dùng thực tế:

- `rpc_my_ui_access`;
- dashboard, watermark, KPI và các aggregate reader;
- item-right wrapper, visible-item façade và RLS direct read của `vmp_plan_items`;
- catalog list/pending/history readers;
- mutation RPC của catalog, progress, assignment và account management;
- direct-table catalog surface đang cấp SELECT cho `authenticated`.

Mục tiêu là token đã phát hành của bảy tài khoản không còn đọc hoặc ghi dữ liệu ứng dụng ngay sau DB commit, kể cả khi access JWT chưa hết hạn.

## 9. Khóa catalog history

Giữ nguyên hai signature live và thay thân tại chỗ:

- `rpc_catalog_history(jsonb, integer, integer)`;
- `rpc_catalog_history_detail(uuid)`.

Luật mới:

- chỉ `admin` và `qa_manager` được phép;
- role lấy từ resolver server, không nhận từ client;
- chỉ trả audit thuộc bộ bảng catalog canonical: `vmp_objects`, `vmp_products_gmp` và `vmp_email_cho_phep`;
- list không trả `old_data/new_data`;
- detail chỉ trả snapshot cho một audit ID thuộc allowlist;
- ID không tồn tại và ID ngoài allowlist có cùng envelope `NOT_FOUND`, tránh existence oracle;
- limit/pagination được kẹp ở server;
- fixed `search_path=public, pg_temp`;
- raw SELECT `audit_logs` không cấp cho `authenticated`.

Tab History của Source workspace chỉ hiện khi `access.canView("audit")`, tức Admin và QA Manager theo ma trận đã duyệt.

## 10. Frontend fail-closed và cache

- Xóa `viewer` khỏi `BUSINESS_ROLES`, label, parser, fixture và workbook phân quyền.
- Parser coi payload `business_role=viewer` là invalid và trả zero access.
- `useAccess` bắt đầu ở trạng thái chưa xác minh, không dùng `legacyAccessContext` làm quyền tạm.
- RPC lỗi, missing hoặc malformed phải xóa access/cache và render trạng thái retry/logout; không render menu hoặc màn được bảo vệ.
- Chỉ dùng luật preview khi server đã trả rõ `mode=preview`; không suy preview từ lỗi.
- Không gọi `loadSnapshot(..., "preview")` trước `readItemPermissionContext()`.
- Snapshot chỉ được nạp sau khi UID, screen access, business role và item mode hiện tại đã được xác minh; mọi thay đổi session/role/mode hoặc access error xóa snapshot.
- Action UI tiếp tục đọc từ `AccessContext`; server vẫn là biên quyết định cuối.

## 11. Trình tự triển khai

1. Khóa source SHA và lấy live baseline/hash hoàn toàn read-only.
2. Khóa manifest bảy UUID và lưu input deploy riêng, không commit email.
3. Viết test RED cho DB và frontend.
4. Viết migration, checker, rollback runbook và frontend tối thiểu để test GREEN.
5. Chạy regression; review DB/security và frontend bằng hai reviewer độc lập.
6. Áp migration DB trong một transaction có precondition/postcondition.
7. Mở connection mới và chạy postflight read-only.
8. Nếu có Auth Admin credential, ban bảy user bằng API chính thức; không sửa trực tiếp auth schema.
9. Push commit đã review vào `main`; chờ GitHub Actions build/deploy xanh.
10. Kiểm live bundle và hành vi năm persona.

DB-first an toàn: frontend cũ vẫn hiểu năm vai còn lại, còn server mới đã fail-closed với Viewer, account inactive và RPC lỗi. Nếu frontend deploy lỗi, DB hardening vẫn được giữ.

## 12. TDD và verification

Các test bắt buộc phải được quan sát RED trước implementation rồi GREEN sau thay đổi:

1. Authenticated user tự update `profiles.role`, `department`, `is_active`, `pham_vi` hoặc patch hỗn hợp bị từ chối; row bất biến.
2. Viewer active resolve `NULL`, nhận 0 màn và không đọc dashboard/catalog/item.
3. Bảy account inactive với claims cũ bị từ chối ở screen, dashboard, catalog, item và writer.
4. Ma trận đúng 85 dòng, 17 dòng mỗi vai; năm vai giữ nguyên quyền cũ.
5. Department/workshop/QA staff gọi catalog history list/detail nhận `FORBIDDEN`.
6. Admin và QA Manager chỉ đọc audit thuộc allowlist; list không có snapshots; detail ngoài allowlist trả `NOT_FOUND`.
7. Access RPC lỗi/missing/malformed ở frontend render zero protected content và clear cache.
8. Snapshot cũ không render trước access verification.
9. Typecheck, toàn bộ unit test, SQL security test, E2E mock, drift check và production build đều qua.
10. `item_permissions_mode=preview` và 481 blocker không bị thay đổi ngoài dự kiến.

SQL mutation test không chạy trên production. Nó chạy trên disposable clone hoặc test database với role `authenticated` non-owner và JWT claims đại diện. Production chỉ nhận migration đã review và các postflight read-only sau commit.

## 13. Rollback và phục hồi

- Lỗi trước COMMIT: PostgreSQL rollback toàn transaction.
- DB đã commit: dùng forward correction; không mở lại direct profile UPDATE, Viewer hoặc audit leak.
- Frontend lỗi: rollback Pages artifact/commit frontend; giữ DB hardening.
- Rule khóa nhầm người hợp lệ: sửa forward đúng profile/rule, không tái sinh Viewer.
- Bảy tài khoản không tự động re-enable trong rollback kỹ thuật. Kích hoạt lại cần duyệt riêng theo UUID.
- Backup definition, ACL, policy, matrix và account state trước deploy được băm để phục vụ điều tra/restore rehearsal; không chứa secret.

## 14. Tiêu chí chấp nhận production

- Chỉ năm business role resolve được.
- Ma trận có đúng 85 dòng và giữ nguyên quyền của năm vai.
- Bảy profile inactive; không account nào bị hard-delete.
- Authenticated không có direct UPDATE trên `profiles` và không có raw SELECT `audit_logs`.
- Token cũ của account inactive không đọc/ghi được dữ liệu VMP.
- Chỉ Admin/QA Manager đọc catalog history trong allowlist.
- Access RPC failure không render protected UI; snapshot không xuất hiện trước xác minh quyền.
- GitHub Actions xanh và Pages phục vụ đúng asset của commit triển khai.
- `screen_access_mode=enforced`, `item_permissions_mode=preview`; 481 blocker vẫn được báo công khai là công việc tiếp theo, không bị che giấu.

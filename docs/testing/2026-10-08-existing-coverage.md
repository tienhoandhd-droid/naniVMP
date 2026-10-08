# Kiểm kê độ phủ kiểm thử nhập, sửa, xóa và lưu vết theo quyền

Ngày kiểm kê: 08/10/2026
Baseline kế hoạch: `8b8081e`
Phạm vi: test và script đã có trong repository, cùng các bản sao/bằng chứng riêng liên quan trong `.cpc1`. Đây là kiểm kê tĩnh; chưa chạy test hoặc ghi database trong bước này.

## Cách đọc mức bằng chứng

| Mức | Ý nghĩa | Có thể kết luận |
| --- | --- | --- |
| DB thật | SQL chạy dưới `anon`, `authenticated` hoặc `service_role`, đặt JWT claim và kiểm trạng thái bảng/audit trong PostgreSQL cách ly | RPC/RLS/trigger thật cho đúng fixture và schema được chạy |
| Browser + mock | Browser thật, nhưng `window.CPC1Backend`, Supabase hoặc network được giả lập trong test | Luồng UI, payload, refresh, lỗi và khóa thao tác; không chứng minh RLS/audit DB |
| Unit/model | Node test, VM hoặc kiểm model/API adapter | Validation, mapping payload và contract cục bộ; không chứng minh browser hoặc DB |
| Static/contract | Đọc source, regex, hash, ACL inventory hoặc migration text | Cấu trúc được ghim; không chứng minh hành vi runtime |
| Evidence cũ | Log/JSON/private clone từ một lần chạy trước | Bằng chứng lịch sử tại hash/môi trường ghi trong receipt; phải chạy lại cho ma trận mới |

Một nút bị ẩn, thông báo “không có quyền”, lời gọi mock bị từ chối, hoặc chuỗi `audit` xuất hiện trong source không được tính là kiểm chứng quyền/audit thật.

## Vai trò và persona hiện có

Năm vai trò nghiệp vụ canonical trong hardening hiện tại là `admin`, `qa_manager`, `qa_staff`, `workshop_manager`, `workshop_staff`. Các suite còn dùng role đăng nhập/legacy như `department_user` và `viewer`; chỉ được quy đổi sang business role khi chính fixture/resolver của suite chứng minh mapping qua performer/access class. Ngoài ra có persona `anon`, tài khoản inactive/revoked, người ngoài scope, và `service_role` dùng làm control đặc quyền.

| Persona | DB thật hiện có | Browser hiện có | Nhận xét nghiêm ngặt |
| --- | --- | --- | --- |
| Admin | Rộng nhất trong `five-role-hardening.sql`, các suite catalog/deadline/source, qualification security | `quyen-admin.mjs`, account/catalog flows chủ yếu mock | Có nhiều allow-path nhưng chưa có một CRUD×domain matrix thống nhất |
| QA Manager | Nhiều suite SQL cho catalog, ngày thực tế, source, tiến độ, qualification | Các màn phân quyền/source/catalog dùng mock | Có kiểm deny/allow theo domain; audit không đồng đều |
| QA Staff | Có trong five-role, deadline, source, tiến độ và qualification history/security | Một số màn scope/quyền mock | Chưa bao phủ đầy đủ create/update/delete ở mọi domain |
| Workshop Manager | Xuất hiện ít hơn và thường được xác định qua access class `equipment_manager` | Chủ yếu scope/progress mock | Đây là một trong các khoảng trống lớn nhất của ma trận đầy đủ |
| Workshop Staff | Nhiều fixture khởi đầu từ login role `department_user`, rồi resolver mới xác định business role | Nhiều luồng người dùng/progress mock | Mạnh ở update tiến độ được giao; yếu ở create/delete và audit toàn miền |
| Anonymous | Nhiều suite SQL kiểm ACL/EXECUTE/table denial | Login/session flows | Có deny ở nhiều boundary, chưa phải mọi RPC ghi |
| Inactive/revoked | Five-role, source, progress, qualification và session/MFA | Cache revocation/session expiry mock | Có containment tốt ở vài RPC; cần lặp cho toàn bộ write inventory |
| Out-of-scope | Source, progress, qualification history/PQ | Scope UI mock | Có bằng chứng tốt theo một số miền, chưa đồng nhất toàn bộ CRUD |
| Service role | Dùng control/fixture và kiểm ACL implementation | Không phải persona browser | Không dùng để suy quyền người dùng cuối |

## Bản đồ coverage theo miền dữ liệu

| Miền / hành vi | DB thật hiện có | Browser / unit hiện có | Audit thật được khẳng định | Khoảng trống chính |
| --- | --- | --- | --- | --- |
| Danh mục đối tượng và hạng mục kế hoạch | `tests/sql/five-role-hardening.sql`, `catalog-progressed-deadline-*.sql`, `manual-planned-deadline-*.sql`, `catalog-import-preview-security.sql` kiểm persona, version/conflict, direct-DML/hidden implementation và một số delta | `catalog-workspace.mjs`, `tao-mau-catalog.mjs`; `catalog-object-save.test.mjs` kiểm create/edit payload, explicit clear và từ chối đổi mã | Five-role và các suite tiến độ có đếm/đọc `audit_logs` ở một số ca; chưa phải mọi create/update/delete | Chưa có bảng đủ 5 vai trò × create/edit/soft-delete/restore; delete hạng mục và lịch sử before/after/actor/reason cần oracle riêng |
| Import danh mục | `catalog-import-preview-security.sql` kiểm ACL/preview boundary | `catalog-workspace.mjs`, các unit import/preview dùng mock/model | Chưa thấy khẳng định đầy đủ từng audit row sau apply/import | Cần browser→DB cho preview→apply, duplicate/idempotency, partial failure, rollback và audit từng thay đổi |
| Tiến độ, phân công, ngày kế hoạch/ngày thực tế | `assigned-progress-visibility*.sql`, `manual-planned-deadline*.sql`, `catalog-progressed-deadline*.sql`, `qa-manager-actual-date*.sql` | `phan-cong-cap-nhat-tien-do.mjs`, `timeline-deadline-edit.mjs`, workload/progress unit; backend giả lập | Một số security suite so sánh audit count và chống spoof `updated_by`; không đồng nghĩa nội dung audit đầy đủ | Cần đủ 5 vai trò, owner/non-owner, scope chéo, stale version, no-op, clear value và kiểm actor/before/after/reason trên DB |
| Source QA/workshop access | `source-qa-workshop-access-{behavior,security,performance}` qua runner clone riêng; có deny inactive/out-of-scope và recovery phases | `source-qa-entry-workbench.mjs`, `source-qa-workshop-access.mjs`, unit source contracts | Có các probe audit/delta trong SQL, nhưng cần map từng write RPC sang expected audit cụ thể | Bộ hiện có mạnh nhất; vẫn cần ma trận create/update/delete/restore nếu domain cho phép và xác nhận tên role legacy/canonical |
| Tài khoản, vai trò, phạm vi | `five-role-hardening.sql`, `qa-rights-account-alignment*.sql`, MFA guard; kiểm self-escalation, inactive, RPC/ACL và profile authority fields | `danh-ba-phan-quyen.mjs`, `quyen-admin.mjs`, account unit; phần lớn mock/static | Có fixture `audit_logs` và kiểm quyền đọc lịch sử; chưa chứng minh mọi thay đổi tài khoản sinh audit đúng | Cần DB thật cho tạo/kích hoạt/vô hiệu hóa/đổi vai trò/đổi scope theo từng actor, self/peer/superior, duplicate/stale, và audit bất biến |
| Revalidation proposals | `tests/sql/revalidation-proposals.sql` có behavior DB, nhưng tên role không hiện rõ trong kiểm kê nhanh | `revalidation-proposals.mjs`, `revalidation-contract.test.mjs` kiểm decode, reason, version và conflict | Chưa thấy oracle audit rõ trong suite hiện có | Cần đủ submit/approve/reject/cancel nếu hỗ trợ, role/scope/state matrix và audit actor/reason/before/after |
| Thẩm định thực tế: tạo đợt, scope, transition | `qualification_runs*.sql`, `qualification_runs_security.sql`, `qualification_run_workspace.sql`, `qualification_pq_access.sql` | `qualification-run-workspace.mjs`, PQ browser acceptance; backend giả lập | `run_events`, `run_requests`, revision/history được kiểm ở một số SQL; security suite kiểm delta không đổi khi bị từ chối | Chưa đủ mọi vai trò × system × open/closed; không có thao tác xóa đợt nếu sản phẩm không hỗ trợ thì phải ghi N/A thay vì PASS |
| Thẩm định: nhập, sửa, đính chính, khóa | `qualification_run_workspace.sql` kiểm save, no-op, reason/history, stale/out-of-scope; PQ access/security kiểm quyền liên kết | `qualification-entry-paste.mjs`, tablet/run workspace, entry history/race unit; mock backend | Point history kiểm path/before/measurement dates và no-op không tạo lịch sử; đây là audit nghiệp vụ thật cho các ca được chạy | Cần persona đầy đủ, từng system/form, closed-record denial, concurrent correction, idempotency và actor identity trong event/revision |
| Lịch sử/import nguồn PQ | `qualification_history*.sql`, `qualification_history_integrity.sql`, `qualification_pq_access.sql` kiểm immutable insert/update/delete, owner/cross-owner/anon và PDF access | Trend/history UI E2E mock | Có bất biến lịch sử nguồn thật; không phải audit CRUD chung | Cần xác nhận ai được import, duplicate fingerprint, failure atomicity và provenance/actor đầy đủ |
| Client error log, audit viewer, monitoring | Migration/static contracts ghim RPC; five-role kiểm quyền audit viewer ở một số persona | `quality-audit.mjs`, monitoring/client-error unit chủ yếu UI/model | Hiển thị log không chứng minh log được ghi đúng hoặc bất biến | Cần DB thật: ghi lỗi đã lọc PII, quyền đọc admin/QA, deny các vai trò khác, pagination/filter, không update/delete log |

## Những suite DB thật có giá trị cao nhất

Các lệnh dưới đây là ứng viên chạy trong Task 2, không phải kết quả đã chạy ở bước kiểm kê này.

1. `npm run test:db:five-role`
   - Chạy `tests/sql/five-role-hardening.sql` trên database local đã được parser kiểm tra.
   - Bao phủ resolver năm vai trò, inactive/legacy, direct RLS, ACL RPC, self-escalation, audit viewer và containment của một số RPC bị bỏ sót.
   - Runner hiện dùng database được chỉ định; cần primary bảo đảm đó là clone disposable đúng kế hoạch trước khi chạy.

2. `npm run test:db:source-access`
   - Tạo database clone có tên kiểm soát, dump/restore PostgreSQL 17, chạy các phase expand/failure/behavior/security/performance/recovery và cleanup.
   - Đây là runner có guard/cleanup rõ nhất; nên giữ log từng phase.

3. Các runner DB chuyên biệt:
   - `scripts/run-catalog-progressed-deadline-db-tests.sh`
   - `scripts/run-qa-manager-actual-date-db-tests.sh`
   - `scripts/run-qa-rights-account-alignment-db-tests.sh`
   - Chỉ chạy sau khi đọc guard target/cleanup và gắn case ID của ma trận; không suy coverage delete/audit ngoài assertion thật.

4. Qualification SQL trên clone chứa đúng schema/migration:
   - `supabase/tests/qualification_runs.sql`
   - `supabase/tests/qualification_runs_security.sql`
   - `supabase/tests/qualification_run_workspace.sql`
   - `supabase/tests/qualification_pq_access.sql`
   - `supabase/tests/qualification_history.sql`
   - `supabase/tests/qualification_history_integrity.sql`
   - Repository chưa có một script package duy nhất cho nhóm này; primary cần runner cách ly, transaction/cleanup và receipt riêng.

5. SQL bổ sung theo domain:
   - `tests/sql/assigned-progress-visibility.sql` và `-security.sql`
   - `tests/sql/manual-planned-deadline-edit.sql` và `-security.sql`
   - `tests/sql/catalog-import-preview-security.sql`
   - `tests/sql/revalidation-proposals.sql`
   - `tests/sql/mfa-session-guard.sql`

## Browser suites nên dùng và giới hạn kết luận

| Suite | Giá trị chính | Giới hạn |
| --- | --- | --- |
| `catalog-workspace.mjs` | Form create/edit, preview, error/conflict và payload UI | Backend giả lập; không chứng minh RLS/persistence/audit thật |
| `source-qa-entry-workbench.mjs`, `source-qa-workshop-access.mjs` | Capability, scope, stale/revoke và thao tác Source | Mock network/backend |
| `phan-cong-cap-nhat-tien-do.mjs`, `timeline-deadline-edit.mjs` | Owner/scope UI, reason/version/error | Mock RPC |
| `danh-ba-phan-quyen.mjs`, `quyen-admin.mjs`, `thu-hoi-cache-phan-quyen.mjs` | Hiển thị quyền, quản trị, revoke/cache/session | Không thay DB five-role suite |
| `revalidation-proposals.mjs` | Workflow UI và conflict handling | Không chứng minh policy/audit DB |
| `qualification-run-workspace.mjs`, `qualification-entry-paste.mjs`, `qualification-tablet-entry.mjs`, `qualification-pq-browser-acceptance.mjs` | Tạo/sửa/save/retry/closed/revoke UX trong trình duyệt | Fixtures thay backend; cần SQL cho authority/audit |

Nên chạy browser trên private build sau DB suites. Với case cần kết luận end-to-end, phải bổ sung browser dùng session thử nối vào clone; không đổi nhãn một test mock thành integration.

## Coverage audit: thật, một phần và chỉ mang tính hiển thị

**Audit thật đã thấy trong source test:**

- `five-role-hardening.sql` tạo/đọc fixture `audit_logs`, kiểm quyền history/audit và dùng delta để chứng minh denied RPC không đổi dữ liệu/audit.
- `assigned-progress-visibility-security.sql` đếm `audit_logs` trước/sau các lời gọi và kiểm spoof/denial không tạo tác dụng phụ.
- `qualification_run_workspace.sql` kiểm lịch sử đính chính theo path, before value, measurement dates; no-op không tạo revision/history.
- `qualification_runs_security.sql` so sánh `run_events`/`run_requests` và các bảng trước/sau probe bị từ chối.
- `qualification_history_integrity.sql` thử thật việc update/delete lịch sử nguồn và đòi lỗi bất biến.

**Chỉ một phần:** audit count tăng/không tăng không chứng minh `actor`, vai trò hiệu lực, `before`, `after`, `reason`, request ID và changed fields đều đúng. Mỗi write case quan trọng cần đọc đúng row vừa sinh và so toàn bộ trường liên quan.

**Chỉ hiển thị/model:** `quality-audit.mjs`, `audit-diff-model.test.mjs` và các màn lịch sử chứng minh render/diff; chúng không chứng minh trigger/RPC đã ghi log đúng hoặc log không thể sửa/xóa.

## Các ca thiếu có giá trị cao nhất

Ưu tiên theo rủi ro và khả năng phát hiện lỗi quyền/audit:

1. Một harness DB dùng cùng năm persona canonical, thêm `anon`, inactive và out-of-scope, chạy tất cả public write RPC trong inventory. Mỗi deny phải kiểm cả mã lỗi lẫn zero delta ở bảng nghiệp vụ, audit/event và idempotency table.
2. Với mỗi write được phép, reload qua public read boundary và kiểm actor UUID/email, effective role, before/after, changed fields, reason, request ID, timestamp hợp lệ; sau đó thử direct update/delete audit/event bằng browser role và đòi bị chặn.
3. Catalog: create mới, edit có clear/zero, duplicate key, stale version, soft-delete, delete đã có liên kết, restore nếu có; đủ năm vai trò và scope.
4. Account/role: admin tạo/vô hiệu hóa/kích hoạt/đổi vai trò/scope; QA Manager và ba vai trò còn lại bị chặn đúng boundary; self-escalation, sửa peer/superior, inactive actor và concurrent version.
5. Progress/assignment/date: assigned user được sửa đúng cột/hạng mục; non-owner/out-of-department bị chặn; QA/Admin override cần reason; no-op/stale/duplicate request; audit không tin `updated_by` từ client.
6. Source/import: preview không ghi; apply atomic; duplicate request/fingerprint; failed row không để partial write; revoke giữa preview và apply; audit từng object/link thay đổi.
7. Revalidation: submit và quyết định theo role/scope/state; reason bắt buộc; approve/reject hai lần; stale version; actor và before/after trong audit.
8. Qualification: create run, chỉnh calibration, save, correction, transition terminal, save sau khóa, out-of-scope form/point, cross-record ID, duplicate request và conflict. Xác nhận `entry_events`, `run_events`, revision và point history cùng actor/reason.
9. Delete matrix: phân biệt hard delete, soft delete, unlink, deactivate và “không hỗ trợ”. Không tạo kỳ vọng delete cho miền không có API; ghi `N/A — không có contract` thay vì PASS.
10. Một số ít ca browser→clone cho đường quan trọng nhất: catalog create/edit/delete, progress update, account deactivation, qualification save/correction/close. Browser phải reload và oracle trực tiếp DB/audit; các E2E mock còn lại tiếp tục làm regression UI.

## Rủi ro khi tổng hợp báo cáo

- Tên file có `security`, `audit`, `integration` hoặc `e2e` không tự xác định lớp bằng chứng; phải đọc cách backend được nối.
- Static tests ghim hash/ACL rất hữu ích chống drift nhưng không thay behavior SQL.
- Các suite qualification thường dùng role/login/PQ scope riêng, không tự động tương đương đủ năm business role.
- Private `.cpc1` có bản sao source và log của các đợt trước. Chỉ dùng để truy vết runner/receipt; không chạy bản copy cũ và không coi PASS cũ là PASS cho baseline hiện tại.
- `service_role` chỉ là control tin cậy. Thành công dưới `service_role` không chứng minh đường browser an toàn.
- Mọi kết quả Task 2 cần gắn commit/schema hash, database name đã làm sạch, case ID, expected/actual và cleanup status.

# Liên kết Thẩm định thực tế với quyền PQ
Ngày 29/09/2026. Phạm vi: liên kết khí nén/nitơ/hơi với PQ VMP và kế thừa quyền xem/nhập. Không đổi phân công hoặc role, không đổi tiến độ, công thức, biểu mẫu in hay số liệu đã chốt.

## Căn cứ và điểm đang chờ nghiệp vụ
- air = HT-12; nitrogen = HT-13. PQ2026 hiện mỗi đối tượng có đúng 1 hạng mục.
- steam config gộp17điểm hóa dược/sinh phẩm; người dùng đã xác nhận QA có quyền bất kỳ PQ HT-14 hoặc HT-15 đều xem/nhập toàn bộ biểu mẫu. Giữ liên kết cả hai và áp OR chỉ cho biểu mẫu chung này.
- Các việc đổi nhân sự theo sheet trước đó còn chờ; yêu cầu mới không tự phê duyệt đổi role Admin→QA hoặc danh tính My2.
- 5 hồ sơ/2 đợt có thật, đã đóng. Giữ nguyên revision, payload, evaluation, PDF nguồn. Liên kết dùng bảng phụ, không sửa đè bằng chứng lịch sử.

## Kiến trúc đề xuất trong phạm vi đã được yêu cầu
1. Bảng liên kết riêng record→PQ; khóa ngoại thật tới plan item, kiểm active/PQ/đúng mã hệ thống. Hồ sơ hơi ghim cả hai parent và dùng OR theo xác nhận người dùng; các hệ thống khác không được nới quyền.
2. Quyền dùng canonical vmp_item_rights(auth.uid(),PQ), cộng active session và QA/Admin gate hiện hữu. can_view phải true; nhập cần quyền cập nhật status_validation. Admin/QA manager kế thừa quyền vốn có tại PQ; không thêm role mới.
3. Creator/owner chỉ là người tạo, không phải điều kiện duy nhất để đọc. QA có quyền đúng PQ đọc/nhập chung; QA khác dù biết UUID/URL bị chặn. Chốt đợt không phải QA approval.
4. Tất cả public CPC1 RPC, idempotency replay, records/revisions/history/PDF Storage phải dùng cùng predicate. Retry chỉ trả cache sau kiểm quyền hiện tại. Run tổng hợp chỉ trả items/progress đã được xem; đóng đợt cần quyền mọi item, không âm thầm đóng phần bị ẩn.
5. Tạo mới có binding PQ rõ trong request hoặc chọn mặc định duy nhất hiện hữu cho hệ thống/năm; không tự chọn giữa nhiều PQ. Luồng chọn trên UI phải hiển thị mã PQ và quyền, không để người dùng đoán.
6. Thư viện/menu và form chỉ hiển thị hệ thống/phạm vi được cấp. Quyền thu hồi chặn các request tiếp; làm sạch dữ liệu hiển thị/draft khi revalidation báo từ chối. Draft vẫn phân tách actor+record/PQ; dữ liệu đã tải về máy không thể thu hồi từ xa.
7. Mẫu in/layout giữ nguyên. In đọc lại đúng revision qua quyền PQ trước tải template/render. SourcePDF chỉ tải khi có quyền hồ sơ liên quan, không cache-authority ở client.

## Tệp/phụ thuộc/quyền sở hữu
- Primary sở hữu migration Supabase, fixtures/tests SQL, preflight/backfill, áp dụng tuần tự.
- UI worker `pq_access_ui` sở hữu backend.js/bootstrap.js, home/runs/entry-tools/draft-recovery/run-entry và targeted frontend tests. Primary kiểm mọi diff và chạy lại gates.
- Reviewer riêng chỉ đọc design/diff/test; không sửa file/DB, không redesign ngoài phạm vi.
- Review độc lập `source_date_review`: SQL/security và sau đó UI; không sửa file hoặc DB.

## RED/GREEN và kiểm chứng
- RED: baseline owner-only chặn QA cùng PQ; unrelated CPC1 member có thể lấy config/evaluate không cần PQ; chưa có record→PQ FK.
- Synthetic fixtures trên clone PG17: QA_A chỉ air, QA_B chỉ nitrogen, QA_samePQ, QA_viewonly, QA_outside, admin, inactive/anonymous. Authenticated actual roles, không chỉ postgres/service.
- Deny wrong system/OQ/inactive/missing/forged binding; immutable binding vs data.system mismatch; load revision/list/history/config/evaluate/save/create/run/transition/storage; replay sau revoke và stale version.
- Run chứa nhiều hệ thống: không rò items/summary/trend/sourcePDF, quyền đóng tất cả rõ ràng.
- Concurrency: revoke vs save có linearization được chứng minh (guard/locks theo canonical relationship); two writers expected version; retry changed payload; atomic rollback.
- Preserve 5 closed snapshots + sourcePDF hashes; backfill chỉ metadata link/audit.
- Targeted unit/backend/route; headless populated E2E admin/QA scoped view/edit/revoke + in qua saved snapshot, không mở GUI. Typecheck/build/budget.
- Independent security review, primary đọc mọi diff và rerun relevant checks.

## Rollback / bước phát hành
- Backup/restore clone đã có cho lượt trước nhưng cần fresh backup trước lần đổi schema/quyền này.
- Additive migration transaction, private preflight hash/ACL/functions/snapshots. Không full-sync hoặc chạy lại migration cũ.
- Rehearsal migration + targeted tests + rollback/forward restore trước production.
- Chưa push/deploy/đổi production trong phần khảo sát. Mapping hơi đã chốt HT-14/HT-15 theo OR; trước binding production vẫn cần fresh preflight/backup.
- PROJECT-STATE cập nhật sau mỗi mốc; report phân biệt local verified và production applied, không tuyên bố GMP approved.


## Bằng chứng local hiện có (chưa phát hành)

- SQL fixture RED baseline: unrelated QA member còn gọi gas config được. GREEN clone ma trận quyền, đúng phạm vi record/run/history, replay sau revoke, staleversion, closedrun, immutablelinks.
- Reviewer yêu cầu exact template manifest (RED file cùng prefix còn lọt; GREEN chặn sau sửa), và archive capability (GREEN hồ sơ đã bind vẫn load/runconfig/frozen template khi không có PQ hiện tại).
- Context `can_view` gộp current/bound record; `can_enter` và `pq_codes` hiện tại; `can_view_archive`/`can_edit_archive` là quyền với hồ sơ đã bind, không kiểm tuổi. Từng RPC giữ thẩm quyền chính, client không cấp quyền.
- `cpc1_load` và run items trả `pq_codes` của chính hồ sơ, không thay payload/evaluation. Biểu mẫu hiện mã PQ để người nhập thấy liên kết; không phát minh deep link chưa được hỗ trợ.
- PostgreSQL17 clone: revoke-before-save, save-before-revoke và hai writer cùng expectedversion đạt. Đọc tài liệu PostgreSQL17 explicit locking và Supabase Storage access-control; không đổi API/library version.
- Fresh restore clone apply→SQLtest→rollback exact25definitions/newtables→forward→SQLtest đạt;8bảng có SHA256/count giống baseline.4gaslinks mới; steam chưa backfill.
- PDF renderer thật + mock client/nguồn private:18form có số liệu,106trang,180asset downloads; exactsnapshot và chặn hash sai/chưa lưu đạt. Không coi đây là phép thử quyền Supabase production.
- Backend/UI và gates cuối đang hoàn thiện. Gói build phải ra thư mục private `~/.local/share/cpc1/pq-link-20260929/build`; không ghi đè `dist` đang làm bản local cũ kết nối production vì server mới chưa áp.
- True QA staff chỉ-xem không có trong quyền canonical hiện hữu: assigned QA có status_validation; unassigned QA không view. Kiểm UI bằng synthetic view-only context là khả năng phòng vệ, không tự tạo role thật.

## Trạng thái trước khi nhận quyết định OR

Mốc trước đã dừng khi chưa xác nhận phạm vi hơi; phần này đã được giải quyết bằng quyết định OR bên dưới. Không reapply35effort_days của nhiệm vụ trước. Không thay phân công hoặc vai trò để né câu hỏi nhân sự đang chờ.

## Kết quả kiểm chứng cuối local

38 targeted unit tests, typecheck, private build/budget, diff check đạt. Headless real backend/bootstrap với mock client: populated save/reopen/print review, closed/read-only, revoke, temporary network, pending→offline→online, pending→revoke, startup/context race, runs old response và reload failure sau scoped revoke đạt; không external request/GUI. PDF renderer riêng18form106trang đạt. Independent SQL/UI review đã xử lý các finding; không có finding còn mở trong phạm vi được review.

Primary4unit context race kiểm latest scope, đổi actor, chia sẻ initialization và chờ replacement còn pending. Backend cũ bị thay thế phải theo context mới, không chỉ bỏ qua CONTEXT_STALE ở bootstrap (cách đó làm gate bị kẹt). Repo browser test có trường hợp deterministic này. Offline remembered state có kiểm request kết thúc trước online và vẫn giữ quyền/closed locks.

Code/database chỉ local. Không phát hành do chưa chốt phạm vi hơi. Trước production cần fresh backup/preflight, kiểm hồ sơ phát sinh kể từ baseline và bảo đảm các request ghi đang chạy không dùng writer cũ tạo record thiếu binding; giải pháp chuyển đổi/maintenance cần được hiện thực và kiểm trên clone trước apply. Đây là bước kỹ thuật còn lại, không yêu cầu người dùng tự chọn cơ chế khóa.

## Quyết định mới đã chốt: hơi dùng chung theo OR — 29/09/2026

Người dùng xác nhận biểu mẫu chung cho hai phần: QA có quyền của bất kỳ PQ hơi nào đều chỉnh sửa toàn bộ biểu mẫu. Quyết định này thay phần chờ tách/gộp và giả định AND trong bản thử trước.

- Khí nén HT-12, nitơ HT-13 giữ riêng. Hơi giữ nguyên biểu mẫu17điểm, ghim cả HT-14 và HT-15; view/edit được khi ít nhất một PQ ghim còn hiệu lực và actor có view/status_validation tương ứng. Quyền này chỉ áp cho biểu mẫu hơi chung, không cấp quyền hạng mục PQ VMP bên còn lại.
- Predicate OR chỉ áp đúng tập đối tượng hơi do bảng mapping xác định; metadata liên kết vẫn phải đủ, đúng hệ thống, PQ, không trùng. Không chuyển toàn bộ predicate của các hệ thống khác thành OR.
- PQ bị thu hồi/không hoạt động không đóng góp quyền; PQ còn lại hợp lệ vẫn cho phép. Tạo mới phải xác định duy nhất các danh tính PQ của năm; không tự chọn khi mơ hồ. Guard liên kết kiểm danh tính/hệ thống; quyền ghi kiểm riêng trước lưu.
- Primary sở hữu toàn bộ SQL, backfill5hồsơ/6links, tests và sửa caption giải thích biểu mẫu chung. Reviewer độc lập đọc diff; không có worker sửa bảng/file chung.
- RED test HT14-only và HT15-only trước khi thay predicate; GREEN config/context/load/evaluate/save/retry/run/history/template/sourcePDF, revoke1vẫncho/revoke2chặn, không nới air/nitrogen; mixed run close vẫn cần quyền từng hồ sơ.
- Dùng clone riêng từ bản baseline, không chạy lại migration vào clone đã áp. Rehearsal rollback/forward và exacthash hồ sơ/revision/source. Targeted UI có hơi với dữ liệu giả/nhãnOR; giữ mọi phép tính/biểu mẫu in. Sau review cập nhậtPROJECT-STATE và ghi rõ môi trường đã áp.
- Chưa có thao tác production/push/deploy của phần mới. Đánh giá preflight, backup và chuyển phiên writer cũ vẫn là bước phát hành riêng; không coi local green là production đã cập nhật.


## Kết quả sau quyết định OR

- Đã thêm mapping hơi và backfill metadata5records/6links trên clone. RED oldAND từ chối HT14-only đúng như vấn đề cần sửa. GREEN fullSQLmatrix gồm HT14-only,HT15-only, sharedcreatorcollaboration, giữ quyền khi còn mộtPQ, thu hồi hếtchặn, inactivealternative, Storage/history/replay và không cấpPQVMPcòn lại.
- Clone `qualification_pq_steam_or` rehearsal freshmigration→SQL→rollbackexact25bodies→forward→SQL.8bảng gốc exacthash/count không đổi. Clone `qualification_pq_steam_race` chứng minh save đợi thu hồi một quyền vẫn thành công qua quyền kia; thu hồi quyền cuối thì save đợi bị từ chối.
- Independent review `source_date_review` không có finding OR. Headless browser có thêm steam17điểm với caption dùng chung/hoặc, nhậpgiả12→tính→lưu giữ giá trị; toàn acceptance trước giữ qua. Không GUI/networkexternal.
- Chưa áp production/push/deploy. Không còn chờ quyết định nghiệp vụ hơi; bước còn lại thuộc phát hành kỹ thuật và phạm vi triển khai, không hỏi lại AND/tách/gộp.

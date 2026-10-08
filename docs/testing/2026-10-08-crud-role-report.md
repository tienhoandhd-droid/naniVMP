# Kết quả kiểm thử nhập, sửa, xóa/ngừng dùng và lưu vết theo quyền

Đợt kiểm tra 08/10/2026 thực hiện ba bước: lập kịch bản, chạy và ghi lỗi, sửa rồi kiểm lại. Đã sửa **10 lỗi được tái hiện** trên bản local. **Chưa commit/push, chưa áp migration production, chưa phát hành web cho đợt này.** Production vẫn là `8b8081e65486c75c6bdbd86257c6e7d795226a0a`.

Không kết luận toàn bộ 260 dòng ma trận đều đạt. Ma trận giữ riêng các ca đạt, ca mới kiểm một phần và chức năng thiếu trên server; tổng số assertion không thay thế độ phủ nghiệp vụ.

## Hồ sơ kiểm thử

- [Inventory dữ liệu và quyền](2026-10-08-data-write-inventory.md).
- [Ma trận 260 kịch bản](2026-10-08-crud-role-scenarios.csv): từ 217 dòng ban đầu, sửa inventory biểu mẫu và tách thành 56 ca trường nhập cụ thể.
- [Độ phủ các bộ kiểm trước đợt này](2026-10-08-existing-coverage.md).
- [Cách chạy lại](2026-10-08-crud-audit-runbook.md).
- [Receipt kiểm chứng](2026-10-08-verification.json).

Vai trò: Admin, Quản lý QA, nhân viên QA, quản lý xưởng, nhân viên xưởng; thêm anonymous, inactive, thu hồi quyền và ngoài phạm vi. Các RPC nghiệp vụ chạy dưới `authenticated`/`anon`, không mượn quyền postgres để ghi. Helper đặc quyền trong test chỉ dùng đọc kết quả và audit mà người dùng không được SELECT trực tiếp.

“Xóa” tuân thủ từng miền: ngừng sản phẩm, tắt người nhận, thu hồi phân công, hủy hạng mục hoặc xóa giá trị số đo. Không tạo quyền DELETE vật lý. **Deadline đã có không được xóa** (`DEADLINE_ERASURE_FORBIDDEN`); Source ảnh hưởng timeline phải tạo thay đổi chờ áp dụng; hồ sơ thẩm định đóng vẫn khóa.

## Môi trường và giới hạn bằng chứng

Clone PostgreSQL17 riêng `vmp_crud_audit_20261008`, giữ ACL hiện hành. Trước sửa đã so sánh read-only **385 định nghĩa hàm public/cpc1_private với production: 0 khác biệt**. Chỉ áp migration trên clone. Không restart Supabase, không ghi dữ liệu thử lên production, không sửa tiêu chí/công thức/mẫu in.

Browser headless → REST HTTP thật → PostgREST loopback15431 → database clone. Request nghiệp vụ giữ token/payload do trình duyệt phát ra; các đường mạng khác bị chặn. Auth `/user` được giả lập với phiên JWT thử: đây **không phải** kiểm đăng nhập mật khẩu qua Auth production. Năm vai được dựng theo profile + performer + phạm vi, không chỉ đổi nhãn UI.

Receipt browser cuối `catalog-real-db-1791446128228-444973.json`: Admin và Quản lý QA đều tạo/sửa/tải lại đủ 5 loại Source; nhập đủ trường sản phẩm và người nhận, đọc lại từng trường, sửa một trường, ngừng dùng và truy vấn lại chính bản ghi với bộ lọc gồm inactive. Hai lịch AI tuần/tháng được kiểm riêng. Ba vai còn lại không có nút ghi Source và RPC từ chối. Với inactive, UI hiện màn “Chưa xác minh được quyền truy cập”, không có nút ghi; RPC trả `ACCOUNT_DISABLED`. Không gọi màn đó là thông báo tài khoản bị khóa hoàn chỉnh.

## Lỗi đã tái hiện và sửa

| ID | Sai lệch | Bản sửa / bằng chứng |
|---|---|---|
| CRUD-001 | Ngừng sản phẩm trả thành công nhưng `is_active` vẫn true | Upsert lưu cờ thực; SQL + browser đọc lại false |
| CRUD-002 | Source nhận explicit null nhưng giữ giá trị cũ | Phân biệt key vắng mặt với key có null |
| CRUD-003 | Sản phẩm nhận explicit null nhưng giữ giá trị cũ | Cùng nguyên tắc cho trường nullable của sản phẩm |
| CRUD-004 | Người nhận cảnh báo không xóa được trường nullable | Lưu null cho scope/tên/ghi chú |
| CRUD-005 | Tạo Source bị ghi audit UPDATE, old_data không rỗng | Ghi INSERT, old_data null đúng thao tác tạo |
| CRUD-006 | Lịch sử danh mục bỏ sót Source/người nhận cảnh báo | Bổ sung đúng hai bảng vào history list/detail, giữ quyền đọc |
| CRUD-007 | Form tạo sản phẩm khóa mã BFO bắt buộc | Cho nhập mã lúc tạo; sau tạo vẫn khóa, quyền canEdit vẫn áp dụng |
| CRUD-008 | Chọn lịch AI tuần/tháng làm lưu người nhận thất bại do enum không khớp | Giá trị gửi `hằng tuần`/`hằng tháng` đúng schema, giữ nhãn hiển thị |
| CRUD-009 | Liên kết tài khoản QA hợp lệ bị từ chối khi bộ phận là `QA` thay vì `qa` | Chuẩn hóa so sánh theo canonical resolver; bộ phận khác và nonadmin vẫn bị từ chối |
| CRUD-010 | Hủy hạng mục lưu lý do vào dòng dữ liệu nhưng audit thiếu/sai lý do | Đặt audit reason/source quanh UPDATE và khôi phục context; kiểm thêm ghi tiếp không bị lẫn lý do |

Sáu lỗi đầu: RED 143 đạt/18 lỗi trong 161 phép kiểm ban đầu (`crud-catalog-role-red-v2.log`), GREEN 161/161; sau đó tăng lên **199 phép kiểm catalog** bằng kiểm pending=0 và no-effect khi bị từ chối. Lỗi BFO: `catalog-products-red.log`. Lỗi lịch AI: `catalog-alerts-first.log` và receipt tương ứng. Lỗi QA: `crud-people-plan-uppercase-red-v3.log`. Lỗi audit hủy: `final-db/crud-people-plan-lifecycle.log`. Reviewer phát hiện thêm nguy cơ khôi phục audit source rỗng; đã thêm RED `plan-audit-default-context-red.log`, sửa và kiểm GREEN.

Ba migration local có preflight hash, transaction, timeout; không đổi GRANT/RLS. Tám hàm thay đổi đã thử **khôi phục baseline rồi áp lại**, kiểm hash và ACL khớp (`all-migrations-rollback-rehearsal.log`). Không sửa audit lịch sử đã tồn tại.

## Các bộ kiểm hiện hành

| Bộ kiểm | Nội dung thực sự kiểm |
|---|---|
| `crud-catalog-role-audit.sql` | Source/sản phẩm/cảnh báo: tạo, sửa, null/0, version, ngừng/pending, quyền, audit, lịch sử, chống sửa/xóa audit và no-effect khi từ chối |
| `crud-progress-account-roles.sql` | 8 trường tiến độ × 5 vai: lưu/clear/reset/đọc lại/audit hoặc từ chối; deadline đổi và cấm xóa; phân công rồi thu hồi tức thì; khóa/bật tài khoản; allowlist |
| `crud-people-plan-lifecycle.sql` | Nhân sự tạo/sửa/ngừng, unlink/relink QA thường/hoa, sai bộ phận/nonadmin không đổi dữ liệu; tạo/hủy hạng mục, audit và cách ly reason/source |
| `crud-admin-role-mode-matrix.sql` | Admin đổi qua đủ 5 business role; kiểm profile/performer/audit; cấm tự hạ quyền; mode preview và từ chối nonadmin/inactive |
| `crud-source-assignment-role-matrix.sql` | Owner/support Source gán/đổi/clear; phạm vi xưởng thêm/sửa/thu hồi; version, audit, 5 vai/inactive/anonymous và no-effect |
| `crud_qualification_roles.sql` | 3 vai được nhập × 3 hệ thống, đủ 9 vòng tạo/lưu/đính chính/calibration/đóng; workshop/inactive/anon bị từ chối create/save/calibration/close trên run thật |
| `crud_qualification_all_forms.sql` | 13 biểu mẫu nhập, 56 trường: giá trị 0, đính chính có lý do, audit exact, clear bằng chuỗi rỗng, tải lại và ghi sau đóng bị từ chối; hai cỡ tiểu phân riêng |

Bảy suite chạy tuần tự bằng runner có kiểm marker DB disposable; receipt `final-db-v6/results.json`. Toàn bộ rollback sau mỗi suite.

Browser danh mục backend mock: **173 đạt/0 lỗi**. 15/17 bộ mock đầu tiên đạt; bộ Workload cũ sai fixture dashboard v1/v2 đã sửa và chạy đạt, thành 16 bộ hiện hành đã chạy đạt. Typecheck, drift và private build đạt; unit **1025 đạt, 1 skip sẵn có, 0 lỗi**. Unit/backend mock không được dùng thay SQL thật hoặc readback browser thật.

## Những phần chưa đủ bằng chứng hoặc chưa có backend

- Import Excel thiếu `rpc_catalog_import_preview` trên server hiện hành; các RPC proposal tái thẩm định cũng chưa có. Ma trận ghi `BLOCKED_SERVER_FEATURE`, không biến mock thành chứng minh persistence. Đây là các migration/tính năng triển khai riêng, không tự áp dụng production trong đợt audit này.
- Snapshot báo cáo chưa có backend theo contract hiện tại. Hiển thị kỳ VMP tiếp và đổi mã Source vẫn là yêu cầu chưa triển khai từ trước, không thuộc bản sửa 10 lỗi này.
- Không phải mọi tổ hợp invalid/retry/revocation của 260 dòng đều đã chạy thật. CSV giữ `PARTIAL`, `PARTIAL_SQL`, `NOT_RUN_FULL` nơi thiếu. Ví dụ QA assignment lifecycle được kiểm phối hợp Admin + QA manager, chưa lặp mọi nhánh cho từng persona; mode kiểm preview, chưa chứng minh bật enforced trên mọi cấu hình tiền kiểm.
- Bộ `qualification-pq-browser-acceptance.mjs` cũ vẫn dùng trang thư viện `.form-result` tại index và lưu hồ sơ không gắn run. Index hiện chuyển sang runs; test đó không còn phù hợp. Đã chạy và giữ lỗi, không tính PASS. Các bộ workspace/paste/tablet hiện hành cùng SQL ở trên kiểm luồng đang dùng.
- Nhiều SQL lịch sử dừng ở fixture hoặc pin schema cũ. Giữ log và phân loại trong tài liệu coverage, không sửa quyền nghiệp vụ để chiều các kỳ vọng cũ.

## Vì sao kiểm cũ bỏ sót

Các lần trước chủ yếu chứng minh giao diện gửi request đúng hoặc mock trả thành công. Chúng không kiểm đầy đủ hợp đồng UI→RPC→database và không đọc lại tất cả trường/trạng thái. Đợt này đã bắt được cả lỗi ngăn lưu và lỗi nguy hiểm hơn: báo thành công nhưng không lưu thay đổi. Các regression mới được giữ trong repo và có bằng chứng RED/GREEN, cùng reviewer độc lập kiểm cả bản sửa lẫn chất lượng phép kiểm.

Bằng chứng riêng nằm `/home/admin1/VMP/.cpc1/crud-audit-20261008/`; không đưa DB dump, token, dữ liệu cá nhân hoặc cấu hình riêng vào Git.

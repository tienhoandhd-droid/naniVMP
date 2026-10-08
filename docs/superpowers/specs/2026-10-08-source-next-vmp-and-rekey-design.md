# Dữ liệu nguồn: kỳ VMP tiếp theo, đổi mã và lỗi tạo mới

## Yêu cầu đã làm rõ
Người dùng xác nhận: khi đã hoàn thành VMP lần trước, hiển thị VMP sắp tới của chính đối tượng đó. Không dùng danh sách 90 ngày hoặc lịch công việc chung. Admin và quản lý QA được đổi mã đối tượng; kiểm tra lỗi thêm đối tượng cho cả hai vai trò. Có ủy quyền phát hành web.

## Hiển thị kỳ tiếp theo
Dùng quy tắc hiện có ở `20260901120000_revalidation_proposals.sql`: `actual_vmp_date + frequency_months`, chu kỳ từ Source, gắn với cùng đối tượng và loại thẩm định. Hiển thị cạnh dữ liệu đối tượng: ngày hoàn thành VMP trước, chu kỳ, ngày VMP kế tiếp, trạng thái đề xuất/đã tạo kỳ. Không tự biến đề xuất thành kế hoạch được duyệt. Không bịa ngày khi chưa hoàn thành VMP hoặc thiếu chu kỳ; không thay formula, hồ sơ ký hoặc snapshot.

Cần đọc theo Source scope, không dùng danh sách tối đa 200 proposal toàn cục rồi ghép tùy ý. Nên thêm RPC read-only nhận các UUID Source của trang, kiểm tra quyền hiện tại và item visibility, trả kỳ mới nhất còn hiệu lực theo loại thẩm định; trả rõ chưa có VMP hoàn thành hoặc chưa có kỳ đã lưu. Invalidate trên authorization revision và loại phản hồi cũ. Trạng thái pending/confirmed không được trộn với lịch sử dismissed/obsolete. Cần xác minh migration/proposal refresh hiện có trên production trước chốt endpoint.

## Đổi mã
RPC chuyên biệt nhận Source UUID, mã cũ/mới, expected version, lý do. Chỉ active admin/qa_manager có quyền; từ chối anonymous, sai role, stale version, blank và mã trùng. Giao dịch cập nhật master/Source/plan active và pending references, tăng revision quyền và audit trước/sau; giữ plan_item_id, quyền phân công, ngày/trạng thái và hồ sơ lịch sử.

Các bảng/guard bắt buộc kiểm: vmp_source_objects, vmp_objects, vmp_plan_items, pending vmp_catalog_changes, pending vmp_revalidation_proposals, cpc1_private.pq_system_objects và rule/scope references có object_code. Không đổi validation_code hay JSON của hồ sơ đã chốt. Trigger Source/master và FK hiện chặn rekey vòng; cần thiết kế constraint/guard giao dịch được review và test PostgreSQL, không chỉ mở khóa input hoặc nới whitelist chung. Mã HT-12/13/14/15 liên quan quyền PQ, phải có kiểm thử riêng.

## Bản sửa tạo mới đã làm local
Form đúng nhưng saveCatalogObject gửi object_code vào cả identity parameter lẫn mutable patch, bị server whitelist từ chối. Loại khóa khớp khỏi bản sao patch; vẫn gửi p_object_code, giữ version/reason/null/zero, từ chối mã khác qua đường upsert. Không đổi SQL/quyền. RED hai regression, GREEN 34 test form/transport/control matrix; typecheck/build và review độc lập đạt.

## Điều kiện kiểm chứng và phát hành
Role tests thật trên PostgreSQL clone cho admin/qa_manager allow và lower roles deny, duplicate/stale/concurrent/rollback, preserve historical/PQ links. Headless populated form create/reload/rename/next-cycle và scope revocation. Sau đó CI và artifact/live verification. Không ghi thử nghiệp vụ production.

Hiện bị chặn: Chromium setsockopt EPERM; Docker socket permission denied; PostgreSQL server binary không có; github.com không phân giải DNS. Chưa viết migration/đổi quyền/chưa kiểm tài khoản thật, chưa push/deploy. Không gọi thiết kế này là implementation đã hoàn tất.

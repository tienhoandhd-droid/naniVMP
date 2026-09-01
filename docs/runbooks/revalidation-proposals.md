# Proposal tái thẩm định

Proposal chỉ được sinh từ `actual_vmp_date` của hạng mục đã hoàn thành và
`frequency_months` của Dữ liệu nguồn. Deadline kế hoạch không được dùng thay cho
ngày hoàn thành thực tế.

## Kiểm chứng trước phát hành

1. Apply migration trên staging PostgreSQL 17.
2. Chạy `tests/sql/revalidation-proposals.sql` hai lần trên một database sạch.
3. Kiểm persona: chỉ Admin/Quản lý QA refresh, xác nhận hoặc bỏ qua; người dùng
   khác chỉ đọc proposal thuộc hạng mục họ được xem.
4. Xác nhận ngày 29/02, chu kỳ 6/12/24 tháng và thay đổi ngày hoàn thành không
   làm mất proposal lịch sử đã xác nhận.

## Vận hành

Refresh là idempotent. Proposal pending không còn khớp dữ liệu nguồn chuyển sang
`obsolete`; proposal `confirmed`/`dismissed` là lịch sử và không bị ghi đè.
Xác nhận dùng version-lock, bắt buộc lý do, gọi đường tạo plan item chuẩn và ghi
audit. Nếu có `VERSION_CONFLICT`, tải lại đúng proposal trước khi quyết định.

Không sửa trực tiếp bảng proposal trên production. Không bật lịch tự động trước
khi persona test và backup/restore staging đạt.

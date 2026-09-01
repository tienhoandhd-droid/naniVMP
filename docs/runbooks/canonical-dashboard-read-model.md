# Read model dashboard canonical

## Phạm vi

Migration `20260901110000_canonical_dashboard_read_model.sql` tạo contract v1
cho dashboard. Trạng thái, deadline, số ngày còn lại và KPI đều được dựng trong
cùng một transaction phía server theo ngày `Asia/Bangkok`.

## Trước khi apply

1. Khôi phục `supabase/schema.sql` trên PostgreSQL 17 và xác nhận receipt schema.
2. Chạy `scripts/check-canonical-dashboard-preflight.sql` trên staging.
3. Xác nhận backup staging có thể restore và biến `STAGING_DB_URL` trỏ đúng staging.

## Kiểm chứng staging

Áp migration rồi chạy `tests/sql/canonical-dashboard-status.sql` và
`scripts/check-canonical-dashboard-postflight.sql`. Kiểm thêm đủ năm vai trò:
Admin thấy toàn phạm vi; QA/xưởng chỉ thấy dòng từ `vmp_visible_plan_items()`;
tài khoản inactive hoặc vai trò lạ nhận `FORBIDDEN`.

Không apply production nếu payload không đúng `contract_version=1`, revision
không dương, KPI không khớp số activity, hoặc bất kỳ persona nào thấy ngoài phạm vi.

## Rollback

Client chưa chuyển sang v2 có thể tiếp tục dùng `rpc_get_vmp_dashboard`. Nếu cần
gỡ migration trước khi client v2 phát hành, thu hồi quyền và drop đúng hai function
v2/canonical. Không sửa dữ liệu `vmp_plan_items` trong rollback.

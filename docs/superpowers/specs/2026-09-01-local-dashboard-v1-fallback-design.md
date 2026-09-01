# Local dashboard v1 fallback design

## Mục tiêu

Cho bản local tải dữ liệu từ Supabase hiện tại trong lúc migration dashboard
canonical v2 chưa được áp dụng.

## Thiết kế đã duyệt

- Luôn gọi `rpc_get_vmp_dashboard_v2` trước.
- Chỉ khi PostgREST báo đúng lỗi thiếu hàm `PGRST202` mới gọi lại
  `rpc_get_vmp_dashboard`.
- Payload v1 đi qua decoder phân quyền hiện có, tính lại trường tương thích như
  adapter cũ và gắn `statusSource="compatibility"`.
- Lỗi phiên, quyền, mạng hoặc payload sai không được fallback và vẫn fail-closed.
- Không thay database, quyền hoặc luồng nhập/xuất Dữ liệu nguồn.

## Kiểm chứng

Unit phải chứng minh thứ tự v2 → v1 khi thiếu hàm và không fallback khi
`FORBIDDEN`. Sau đó chạy typecheck, build và kiểm preview `4175` trả HTTP 200.

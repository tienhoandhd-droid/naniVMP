# Bootstrap — dựng lại cơ sở dữ liệu VMP từ đầu

Bộ SQL này dựng lại **toàn bộ** database VMP trên một project Supabase mới (hoặc Postgres 17+ bất kỳ), không cần chạy lần lượt các migration lịch sử.

## Nội dung

| File | Vai trò |
|---|---|
| `01_schema_full.sql` | Toàn bộ schema `public` dump từ DB thật ngày 2026-07-23: 19 bảng, 46 hàm (đủ bộ `rpc_*`), view, index, trigger, **RLS policy + GRANT** cho các role Supabase (`anon`, `authenticated`, `service_role`) |
| `02_seed_config.sql` | Dữ liệu mồi 3 bảng cấu hình: `departments` (5 bộ phận, lưu ý mã Xưởng sản xuất là `xsx`), `vmp_deadline_rules` (4 luật deadline theo phân loại báo cáo), `system_config` (12 khóa cấu hình app) |

## Cách chạy

```bash
# 1. Schema (bảng, hàm, RLS, grant)
psql "$SUPABASE_DB_URL" --single-transaction -f 01_schema_full.sql

# 2. Dữ liệu cấu hình
psql "$SUPABASE_DB_URL" --single-transaction -f 02_seed_config.sql
```

Sau đó **dữ liệu nghiệp vụ** (vmp_plan_items, vmp_objects, vmp_sheet_rows…) KHÔNG cần restore tay — publish workflow n8n WF-04 (hoặc POST `/webhook/vmp-sheet-changed`) để sync từ Google Sheet, vì Sheet là nguồn chuẩn và Supabase chỉ là read model.

## Ghi chú

- `01_schema_full.sql` dump bằng `pg_dump --schema-only --no-owner` từ Postgres 17 — chạy được trên Supabase mặc định. Nếu gặp lỗi role không tồn tại (chạy ngoài Supabase), tạo trước 3 role: `anon`, `authenticated`, `service_role`.
- Bảng `profiles` tham chiếu `auth.users` của Supabase — tài khoản người dùng phải tạo qua Supabase Auth, không seed được.
- Quan hệ với `supabase/migrations/`: migrations là lịch sử tiến hóa (forward-only, vẫn là nguồn chân lý khi sửa tiếp schema); bootstrap này là ảnh chụp tương đương để dựng nhanh từ số 0. Sau khi dựng bằng bootstrap, các migration mới hơn 2026-07-23 vẫn áp bình thường.
- Đối chiếu chéo: `supabase/schema-snapshot-2026-07-23.sql` là bản dump không kèm GRANT, dùng để đọc/so sánh.

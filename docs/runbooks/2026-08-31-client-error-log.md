# Runbook — Bật giám sát lỗi client (20260831170000)

**Phạm vi:** tạo MỚI bảng `vmp_client_errors` + 2 RPC (`rpc_ghi_loi_client`, `rpc_doc_loi_client`). Không đụng bảng/hàm nào đang có.
**Rủi ro:** thấp — toàn đối tượng mới; frontend đã deploy sẵn đường gọi và **tự im lặng** khi RPC chưa tồn tại, nên thứ tự deploy không quan trọng.

## 1 · Apply

```bash
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260831170000_client_error_log.sql
```

File tự chứa precondition (bảng chưa tồn tại, hardening 20260824 đã áp) và postcondition (RLS bật, authenticated không đọc/ghi thẳng bảng, anon không gọi được RPC).

## 2 · Reload PostgREST

```sql
notify pgrst, 'reload schema';
```

## 3 · Kiểm

Mở web production, DevTools Console chạy: `throw new Error("thu-nghiem-bao-loi")`. Rồi:

```sql
begin read only;
select created_at, user_email, source, left(message, 60)
from public.vmp_client_errors order by created_at desc limit 5;
rollback;
```

Phải thấy dòng `thu-nghiem-bao-loi`. Xoá dòng thử: `delete from public.vmp_client_errors where message like 'thu-nghiem%';`

## 4 · Đọc hằng ngày

Admin/QA quản lý gọi `rpc_doc_loi_client(p_limit, p_offset, p_tu)` (qua SQL editor hoặc REST). Gợi ý thói quen: mỗi sáng `p_tu = now() - interval '1 day'`. (Màn UI đọc lỗi sẽ bổ sung ở wave sau; RPC đã sẵn.)

## 5 · Dọn định kỳ

Bảng tự phình theo lỗi. Mỗi quý: `delete from public.vmp_client_errors where created_at < now() - interval '90 days';`

## 6 · Forward recovery

Migration fail → transaction tự rollback, production không đổi. Muốn gỡ hẳn tính năng: `drop function rpc_ghi_loi_client, rpc_doc_loi_client; drop table vmp_client_errors;` — frontend tự im lặng trở lại (nhánh PGRST202).

## 7 · Sau khi áp: cập nhật types

```bash
npm run gen:types   # cần SUPABASE_DB_URL
```
rồi bỏ ép kiểu tạm trong `src/lib/baoLoi.ts` (đã ghi chú tại chỗ).

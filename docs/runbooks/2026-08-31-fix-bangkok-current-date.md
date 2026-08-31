# Runbook — Sửa lệch múi giờ luật "ngày không ở tương lai" (20260831160000)

**Phạm vi:** một hàm duy nhất `rpc_update_progress__assigned_impl_20260827`. Không đổi ACL, không đổi wrapper, không đổi bảng.
**Rủi ro:** thấp — hành vi chỉ đổi trong khung 00:00–07:00 giờ Bangkok (nới đúng, không siết). Ngoài khung đó hai công thức cho cùng kết quả.
**Người áp:** chủ dự án, qua `psql` với `SUPABASE_DB_URL` (role postgres).

## 1 · Preflight (read-only, connection bất kỳ)

```sql
begin read only;
select position('> current_date' in pg_get_functiondef(
  'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)'::regprocedure)) > 0
  as con_ban_cu;
rollback;
```

Kỳ vọng `con_ban_cu = t`. Nếu `f`: bản vá đã áp rồi hoặc định nghĩa đã trôi — DỪNG, đối chiếu tay với repo.

## 2 · Apply (một transaction, tự chứa pre/postcondition)

```bash
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 \
  -c "set lock_timeout='3s'" \
  -f supabase/migrations/20260831160000_fix_bangkok_current_date.sql
```

File tự `begin/commit`; precondition sai là abort trước khi đổi bất cứ gì. **Không retry mù** — đọc thông báo lỗi trước.

## 3 · Postflight (connection MỚI)

```sql
begin read only;
select position($m$(now() at time zone 'Asia/Bangkok')::date$m$ in pg_get_functiondef(
  'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)'::regprocedure)) > 0
  as da_bangkok;
rollback;
```

Kỳ vọng `da_bangkok = t`.

## 4 · Reload PostgREST rồi thử bằng phiên thật

```sql
notify pgrst, 'reload schema';
```

Đăng nhập một tài khoản QA, mở hộp Cập nhật tiến độ, nhập "ngày hôm nay" cho một hạng mục thử → phải lưu được. (Kiểm tra quyết định nhất là trong khung 00:00–07:00 sáng, nhưng ngoài khung vẫn xác nhận được đường lưu không vỡ.)

## 5 · Forward recovery

Fail TRƯỚC commit → production không đổi, sửa nguyên nhân rồi chạy lại.
Fail SAU commit (postflight tay không đạt) → impl vẫn hoạt động (thân hàm hợp lệ mới commit được); mở sự cố, KHÔNG tự lùi — bản cũ chỉ khác đúng khối múi giờ, muốn lùi thì áp lại thân hàm gốc trong `20260827130000:372-588`.

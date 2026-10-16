# Runbook — Đóng policy "true" ở bảng AI / tiến độ / nhật ký (20261016100000)

**Phạm vi:** gỡ 13 policy mở (`USING/WITH CHECK (true)` hoặc `auth.uid() IS NOT NULL`) trên 10 bảng, thay bằng policy đọc theo vai qua `vmp_la_vai`. Bảng vai nằm ở đầu file migration.
**Rủi ro:** thấp — trước khi viết đã đối chiếu `pg_stat_statements` (từ 21/06/2026): không có truy vấn PostgREST nào của vai người dùng tới các bảng này. RLS lọc dòng chứ không ném lỗi: nếu có chỗ bị siết oan, người dùng thấy RỖNG chứ không thấy lỗi.

## 0 · Điều kiện tiên quyết

- `20260831180000_close_true_policies.sql` đã áp (tạo `public.vmp_la_vai`). Migration tự kiểm và dừng nếu thiếu.
- Production còn đúng 13 policy đã liệt kê. Nếu đã có ai sửa tay, migration dừng ở PRECONDITION — đối chiếu lại, đừng sửa migration cho "khớp" mà không hiểu vì sao trôi.

## 1 · Preflight (read-only) — ghi kết quả vào hồ sơ

```sql
begin read only;
select tablename, policyname, cmd, coalesce(qual, with_check) dk
from pg_policies where schemaname='public' and tablename in
 ('vmp_ai_hoi_thoai','vmp_ai_cham_diem_log','vmp_rls_siet_log','vmp_ai_cache',
  'vmp_ai_cache_ngu_nghia','vmp_ai_report_cache','vmp_ai_reviews',
  'vmp_progress_events','vmp_report_snapshots','workflow_runs')
order by 1, 2;
rollback;
```

## 2 · Apply

```bash
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 \
  -c "set lock_timeout='3s'" \
  -f supabase/migrations/20261016100000_close_open_ai_progress_policies.sql
```

Sau đó: `notify pgrst, 'reload schema';`

## 3 · Postflight

- Chạy lại truy vấn preflight: không còn dòng nào có `dk = true`.
- Mở web bằng tài khoản admin: Việc hôm nay, Tổng quan, Báo cáo, Cấu hình hệ thống (thẻ workflow_runs) hiện dữ liệu như trước.
- Hỏi Vali một câu: vẫn trả lời (các hàm AI là SECURITY DEFINER, không qua RLS).

## 4 · Lùi từng phần (nếu một vai bị siết oan)

```sql
drop policy <tên_policy_mới> on public.<bảng>;
create policy <tên_policy_mới> on public.<bảng> for select to authenticated
  using (public.vmp_la_vai(array['admin','qa_manager','qa_staff','workshop_manager','workshop_staff']));
```

Ghi lý do vào hồ sơ sự cố. Không khôi phục lại `using (true)`.

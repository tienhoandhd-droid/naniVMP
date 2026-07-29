-- =====================================================================
-- Xoá 90.086 dòng nhật ký rỗng — có biên bản để lại
--
-- Người dùng quyết định xoá hẳn (29/07/2026). Trước khi xoá đã đối chiếu
-- toàn bộ 90.086 dòng trong audit_logs_archive:
--   · 90.086/90.086 là UPDATE của bảng vmp_objects
--   · 0 dòng có changed_fields
--   · 0 dòng có thay đổi thật (old_data = new_data sau khi bỏ cột kỹ thuật)
--   · 0 dòng có user_id — không thao tác nào của con người
--   · khoảng thời gian 22/06/2026 → 29/07/2026
-- Đây là dấu vết máy sinh do trigger cũ ghi mỗi lần đồng bộ chạm vào
-- dòng, không phải bằng chứng ALCOA+ của thao tác nào.
--
-- Xoá dữ liệu nhật ký là việc phải giải trình được, nên ghi lại BIÊN BẢN:
-- xoá bao nhiêu, theo tiêu chí nào, khoảng nào, phân bố theo ngày ra sao.
-- Biên bản nhỏ (một dòng) nhưng đủ để trả lời thanh tra "chỗ trống này
-- là gì".
-- =====================================================================

create table if not exists public.audit_logs_purge_log (
  id           bigserial primary key,
  purged_at    timestamptz not null default now(),
  purged_by    uuid,
  table_name   text not null,
  row_count    integer not null,
  date_from    date,
  date_to      date,
  criteria     text not null,
  reason       text not null,
  breakdown    jsonb
);

comment on table public.audit_logs_purge_log is
  'Biên bản mỗi lần xoá nhật ký thao tác: xoá bao nhiêu, tiêu chí nào, vì sao. Không bao giờ xoá bảng này.';

alter table public.audit_logs_purge_log enable row level security;
drop policy if exists purge_log_select on public.audit_logs_purge_log;
create policy purge_log_select on public.audit_logs_purge_log for select
  using ((select public.is_admin_or_qa()));
revoke insert, update, delete, truncate on public.audit_logs_purge_log from anon, authenticated;
revoke select on public.audit_logs_purge_log from anon;
grant select on public.audit_logs_purge_log to authenticated;

-- Ghi biên bản TRƯỚC khi xoá, lấy số liệu từ chính dữ liệu sắp xoá.
insert into public.audit_logs_purge_log
  (table_name, row_count, date_from, date_to, criteria, reason, breakdown)
select
  'vmp_objects',
  count(*),
  min(created_at)::date,
  max(created_at)::date,
  'table_name=vmp_objects · action=UPDATE · changed_fields IS NULL · old_data = new_data sau khi bỏ updated_at/source_sync_run_id/source_sheet_row/last_synced · user_id IS NULL',
  'Dấu vết máy sinh: trigger audit_object_changes cũ so cả updated_at nên mỗi lần đồng bộ ghi một bản chụp đầy đủ cho cả 217 đối tượng dù không có gì đổi. Trigger đã sửa ở migration 20260729590000.',
  (select jsonb_object_agg(ngay::text, n) from (
     select created_at::date as ngay, count(*) as n
     from public.audit_logs_archive group by 1 order by 1) d)
from public.audit_logs_archive;

-- Xoá.
truncate table public.audit_logs_archive;

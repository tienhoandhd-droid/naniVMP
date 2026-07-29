-- =====================================================================
-- Lưu trữ nhật ký cũ + dọn dữ liệu kỹ thuật, chạy tự động hàng tuần
--
-- Hai loại dữ liệu phình theo thời gian, phải xử lý KHÁC NHAU:
--
-- 1. audit_logs (158 MB / 100.400 dòng, +2.700 dòng/ngày) là bằng chứng
--    ALCOA+ — KHÔNG XOÁ. Chuyển bản ghi cũ hơn 12 tháng sang bảng lưu trữ
--    audit_logs_archive: vẫn tra được, chỉ là không nằm trong bảng nóng
--    nữa nên chỉ mục và truy vấn hàng ngày gọn lại.
--
-- 2. vmp_sheet_rows / vmp_sheet_row_extras / vmp_sheet_sync_backups là
--    dấu vết KỸ THUẬT của từng lần đồng bộ (83.215 dòng thô + 890 bản
--    sao lưu của những lần đã quá cũ). Chỉ giữ 30 lần gần nhất.
--
--    Bản ghi LẦN CHẠY (vmp_sheet_sync_runs) thì giữ nguyên tất cả — nó
--    nhỏ (648 kB) và vmp_plan_items trỏ tới nó để truy "dòng này vào hệ
--    thống từ lần đồng bộ nào".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bảng lưu trữ nhật ký thao tác
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs_archive
  (like public.audit_logs including defaults including constraints);

create index if not exists idx_audit_archive_time
  on public.audit_logs_archive (created_at desc);

comment on table public.audit_logs_archive is
  'Nhật ký thao tác cũ hơn 12 tháng, chuyển từ audit_logs. Giữ nguyên nội dung — chỉ đổi chỗ nằm.';

alter table public.audit_logs_archive enable row level security;
drop policy if exists audit_archive_select on public.audit_logs_archive;
create policy audit_archive_select on public.audit_logs_archive for select
  using ((select public.is_admin_or_qa()));
revoke insert, update, delete, truncate on public.audit_logs_archive from anon, authenticated;
revoke select on public.audit_logs_archive from anon;
grant select on public.audit_logs_archive to authenticated;

create or replace function public.vmp_luu_tru_nhat_ky(p_thang integer default 12)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare v_n integer;
begin
  with cu as (
    delete from public.audit_logs
    where created_at < now() - make_interval(months => p_thang)
    returning *
  )
  insert into public.audit_logs_archive select * from cu;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'da_chuyen', v_n,
    'msg', 'Đã chuyển ' || v_n || ' bản ghi cũ hơn ' || p_thang || ' tháng sang bảng lưu trữ');
end;
$fn$;

-- ---------------------------------------------------------------------
-- 2. Dọn dấu vết đồng bộ, giữ N lần gần nhất
-- ---------------------------------------------------------------------
create or replace function public.vmp_don_dau_vet_dong_bo(p_giu integer default 30)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare v_rows integer; v_extras integer; v_backups integer;
begin
  create temporary table tmp_giu on commit drop as
  select id from public.vmp_sheet_sync_runs order by started_at desc limit p_giu;

  delete from public.vmp_sheet_rows       where sync_run_id not in (select id from tmp_giu);
  get diagnostics v_rows = row_count;
  delete from public.vmp_sheet_row_extras where sync_run_id not in (select id from tmp_giu);
  get diagnostics v_extras = row_count;
  delete from public.vmp_sheet_sync_backups where sync_run_id not in (select id from tmp_giu);
  get diagnostics v_backups = row_count;

  return jsonb_build_object('ok', true, 'giu_lai_lan', p_giu,
    'dong_tho_da_xoa', v_rows, 'extras_da_xoa', v_extras, 'ban_sao_da_xoa', v_backups);
end;
$fn$;

revoke execute on function public.vmp_luu_tru_nhat_ky(integer) from public;
revoke execute on function public.vmp_don_dau_vet_dong_bo(integer) from public;
grant execute on function public.vmp_luu_tru_nhat_ky(integer) to service_role;
grant execute on function public.vmp_don_dau_vet_dong_bo(integer) to service_role;

-- ---------------------------------------------------------------------
-- 3. Hẹn giờ chạy — pg_cron có sẵn trên project này
--    · dọn dấu vết đồng bộ: 3h sáng Chủ nhật
--    · lưu trữ nhật ký:     3h30 sáng mùng 2 hàng tháng
-- ---------------------------------------------------------------------
do $$
begin
  perform cron.unschedule(jobid) from cron.job
   where jobname in ('vmp_don_dau_vet_dong_bo', 'vmp_luu_tru_nhat_ky');
  perform cron.schedule('vmp_don_dau_vet_dong_bo', '0 20 * * 6',
    $cmd$select public.vmp_don_dau_vet_dong_bo(30)$cmd$);      -- 20:00 UTC T7 = 3:00 CN giờ VN
  perform cron.schedule('vmp_luu_tru_nhat_ky', '30 20 1 * *',
    $cmd$select public.vmp_luu_tru_nhat_ky(12)$cmd$);          -- 3:30 sáng mùng 2 giờ VN
exception when others then
  raise notice 'Không đặt được lịch pg_cron (%): chạy tay hai hàm trên khi cần', sqlerrm;
end $$;

-- The validation trigger records a data-quality row from a BEFORE trigger.
-- Defer the FK until transaction end so the parent plan item can finish its
-- insert in the same statement. Rollback restores the backed-up issues exactly
-- and therefore must not synthesize new issues while restoring plan rows.

alter table public.data_quality_issues
  drop constraint if exists data_quality_issues_plan_item_id_fkey;

alter table public.data_quality_issues
  add constraint data_quality_issues_plan_item_id_fkey
  foreign key (plan_item_id)
  references public.vmp_plan_items(id)
  deferrable initially deferred;

create or replace function public.enforce_plan_item_validation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_source text;
  v_problem text := null;
begin
  if to_regclass('pg_temp.tmp_vmp_source') is not null then
    v_source := 'sheet_sync';
  else
    v_source := coalesce(current_setting('app.audit_source', true), 'unknown');
  end if;

  if new.validation_code is null or new.validation_code = '' then
    raise exception 'Thiếu mã thẩm định (validation_code)';
  end if;

  if new.status_vmp = 'completed' and new.actual_vmp_date is null then
    v_problem := 'Trạng thái VMP=hoàn thành nhưng thiếu ngày hoàn thành thực tế';
  elsif new.actual_vmp_date is not null
        and new.deadline_protocol is not null
        and new.actual_vmp_date < new.deadline_protocol then
    v_problem := 'Ngày hoàn thành VMP trước ngày bắt đầu đề cương';
  end if;

  if v_problem is not null then
    if v_source in ('dashboard_rpc', 'dashboard_inventory') then
      raise exception 'Mã %: %', new.validation_code, v_problem;
    elsif v_source <> 'sheet_sync_rollback' then
      insert into public.data_quality_issues (
        plan_item_id, issue_type, severity, message, detected_at
      ) values (
        new.id,
        'validation_conflict',
        'error',
        'Mã ' || new.validation_code || ': ' || v_problem || ' (nguồn: ' || v_source || ')',
        now()
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.rpc_rollback_vmp_sheet_sync(p_sync_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan_restored integer := 0;
  v_objects_restored integer := 0;
  v_quality_restored integer := 0;
  v_notifications_restored integer := 0;
  v_progress_restored integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('public.rpc_sync_vmp_sheet_snapshot'));

  if not exists (
    select 1
    from public.vmp_sheet_sync_backups
    where sync_run_id = p_sync_run_id
      and dataset = 'vmp_plan_items'
  ) then
    raise exception 'VMP_SYNC_BACKUP_NOT_FOUND: %', p_sync_run_id;
  end if;

  delete from public.data_quality_issues;
  delete from public.vmp_notifications;
  delete from public.vmp_progress_events;
  delete from public.vmp_plan_items;
  delete from public.vmp_objects;

  insert into public.vmp_objects
  select x.*
  from public.vmp_sheet_sync_backups b,
       jsonb_populate_recordset(null::public.vmp_objects, b.rows_json) x
  where b.sync_run_id = p_sync_run_id and b.dataset = 'vmp_objects';
  get diagnostics v_objects_restored = row_count;

  insert into public.vmp_plan_items
  select x.*
  from public.vmp_sheet_sync_backups b,
       jsonb_populate_recordset(null::public.vmp_plan_items, b.rows_json) x
  where b.sync_run_id = p_sync_run_id and b.dataset = 'vmp_plan_items';
  get diagnostics v_plan_restored = row_count;

  -- BEFORE INSERT validation can synthesize issues for restored legacy rows.
  -- Remove those transient issues, then restore the exact backed-up set.
  delete from public.data_quality_issues;

  insert into public.data_quality_issues
  select x.*
  from public.vmp_sheet_sync_backups b,
       jsonb_populate_recordset(null::public.data_quality_issues, b.rows_json) x
  where b.sync_run_id = p_sync_run_id and b.dataset = 'data_quality_issues';
  get diagnostics v_quality_restored = row_count;

  insert into public.vmp_notifications
  select x.*
  from public.vmp_sheet_sync_backups b,
       jsonb_populate_recordset(null::public.vmp_notifications, b.rows_json) x
  where b.sync_run_id = p_sync_run_id and b.dataset = 'vmp_notifications';
  get diagnostics v_notifications_restored = row_count;

  insert into public.vmp_progress_events
  select x.*
  from public.vmp_sheet_sync_backups b,
       jsonb_populate_recordset(null::public.vmp_progress_events, b.rows_json) x
  where b.sync_run_id = p_sync_run_id and b.dataset = 'vmp_progress_events';
  get diagnostics v_progress_restored = row_count;

  update public.vmp_sheet_sync_runs
  set status = 'rolled_back', completed_at = now()
  where id = p_sync_run_id;

  return jsonb_build_object(
    'ok', true,
    'sync_run_id', p_sync_run_id,
    'plan_restored', v_plan_restored,
    'objects_restored', v_objects_restored,
    'data_quality_restored', v_quality_restored,
    'notifications_restored', v_notifications_restored,
    'progress_restored', v_progress_restored
  );
end;
$$;

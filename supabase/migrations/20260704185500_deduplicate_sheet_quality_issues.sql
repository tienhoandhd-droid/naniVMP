-- A PostgreSQL upsert can invoke both BEFORE INSERT and BEFORE UPDATE triggers.
-- Keep one unresolved validation issue per plan/type/message and make the
-- trigger idempotent so periodic Sheet syncs cannot multiply identical issues.

with ranked as (
  select
    id,
    row_number() over (
      partition by plan_item_id, issue_type, message
      order by detected_at, id
    ) as duplicate_rank
  from public.data_quality_issues
  where is_resolved is not true
)
delete from public.data_quality_issues q
using ranked r
where q.id = r.id
  and r.duplicate_rank > 1;

create unique index if not exists uq_data_quality_unresolved_validation_issue
  on public.data_quality_issues (plan_item_id, issue_type, message)
  where is_resolved is not true;

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
      )
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

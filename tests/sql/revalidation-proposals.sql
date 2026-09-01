\set ON_ERROR_STOP on

begin;

insert into public.vmp_authorization_revision(singleton, revision)
values (true, 20)
on conflict (singleton) do update set revision = excluded.revision;

insert into public.vmp_objects(code, name, classification, is_active) values
  ('RV-06', 'Chu kỳ 6 tháng', 'tb', true),
  ('RV-12', 'Chu kỳ 12 tháng', 'tb', true),
  ('RV-24', 'Chu kỳ 24 tháng', 'tb', true),
  ('RV-NO-ACTUAL', 'Thiếu ngày hoàn thành', 'tb', true);

insert into public.vmp_source_objects(
  object_kind, object_code, object_name, source_tab, source_row,
  validate_flag, frequency_months, is_active
) values
  ('Thiết bị', 'RV-06', 'Chu kỳ 6 tháng', 'revalidation-test', 1, 'y', 6, true),
  ('Thiết bị', 'RV-12', 'Chu kỳ 12 tháng', 'revalidation-test', 2, 'y', 12, true),
  ('Thiết bị', 'RV-24', 'Chu kỳ 24 tháng', 'revalidation-test', 3, 'y', 24, true),
  ('Thiết bị', 'RV-NO-ACTUAL', 'Thiếu ngày hoàn thành', 'revalidation-test', 4, 'y', 12, true);

insert into public.vmp_plan_items(
  id, object_code, validation_code, validation_type, year,
  actual_vmp_date, status_vmp, is_active, missing_from_sheet
) values
  ('rv-item-06', 'RV-06', 'RV-06/2024.01-PQ', 'PQ', 2024, date '2024-01-31', 'completed', true, false),
  ('rv-item-12', 'RV-12', 'RV-12/2024.01-PQ', 'PQ', 2024, date '2024-02-29', 'completed', true, false),
  ('rv-item-24', 'RV-24', 'RV-24/2024.01-PQ', 'PQ', 2024, date '2024-03-15', 'completed', true, false),
  ('rv-item-no-actual', 'RV-NO-ACTUAL', 'RV-NO-ACTUAL/2024.01-PQ', 'PQ', 2024, null, 'completed', true, false);

do $cycle$
declare
  v_first jsonb;
  v_second jsonb;
begin
  v_first := public.rpc_refresh_revalidation_proposals(date '2026-09-01');
  v_second := public.rpc_refresh_revalidation_proposals(date '2026-09-01');

  if (v_first->>'created')::integer <> 3 then
    raise exception 'first refresh must create 3 proposals: %', v_first;
  end if;
  if (v_second->>'created')::integer <> 0
     or (v_second->>'unchanged')::integer <> 3 then
    raise exception 'second refresh must be idempotent: %', v_second;
  end if;
  if (select count(*) from public.vmp_revalidation_proposals) <> 3 then
    raise exception 'proposal count drifted';
  end if;
  if not exists (
    select 1 from public.vmp_revalidation_proposals
    where plan_item_id = 'rv-item-12' and due_date = date '2025-02-28'
  ) then
    raise exception 'leap-day + 12 months must resolve to 2025-02-28';
  end if;
  if exists (
    select 1 from public.vmp_revalidation_proposals
    where plan_item_id = 'rv-item-no-actual'
  ) then
    raise exception 'missing actual_vmp_date must not create a proposal';
  end if;
end
$cycle$;

do $decision_contract$
declare
  v_id uuid;
  v_version integer;
  v_result jsonb;
begin
  select id, version into v_id, v_version
  from public.vmp_revalidation_proposals
  where plan_item_id = 'rv-item-24';

  v_result := public.rpc_confirm_revalidation_proposal(v_id, 'ngắn', v_version);
  if v_result->>'error_code' <> 'REASON_REQUIRED' then
    raise exception 'confirm must require a meaningful reason: %', v_result;
  end if;
  v_result := public.rpc_dismiss_revalidation_proposal(v_id, 'Không cần trong chu kỳ này', v_version + 1);
  if v_result->>'error_code' <> 'VERSION_CONFLICT'
     or (v_result->>'current_version')::integer <> v_version then
    raise exception 'dismiss must preserve current version on conflict: %', v_result;
  end if;
  v_result := public.rpc_dismiss_revalidation_proposal(v_id, 'Không cần trong chu kỳ này', v_version);
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'dismiss should succeed with the expected version: %', v_result;
  end if;
end
$decision_contract$;

do $privileges$
begin
  if has_table_privilege('authenticated', 'public.vmp_revalidation_proposals', 'INSERT')
     or has_table_privilege('authenticated', 'public.vmp_revalidation_proposals', 'UPDATE')
     or has_table_privilege('authenticated', 'public.vmp_revalidation_proposals', 'DELETE') then
    raise exception 'authenticated must not mutate proposals directly';
  end if;
  if not has_table_privilege('authenticated', 'public.vmp_revalidation_proposals', 'SELECT') then
    raise exception 'authenticated requires RLS-scoped SELECT';
  end if;
  if has_function_privilege('authenticated', 'public.vmp_can_manage_revalidation()', 'EXECUTE') then
    raise exception 'authorization helper must not be callable by browser roles';
  end if;
end
$privileges$;

update public.vmp_revalidation_proposals
set status = 'confirmed', version = version + 1
where plan_item_id = 'rv-item-06';

update public.vmp_plan_items
set actual_vmp_date = date '2024-02-15'
where id = 'rv-item-06';

do $late_completion$
declare
  v_result jsonb := public.rpc_refresh_revalidation_proposals(date '2026-09-01');
begin
  if not exists (
    select 1 from public.vmp_revalidation_proposals
    where plan_item_id = 'rv-item-06'
      and due_date = date '2024-07-31'
      and status = 'confirmed'
  ) then
    raise exception 'refresh must preserve a confirmed historical proposal';
  end if;
  if not exists (
    select 1 from public.vmp_revalidation_proposals
    where plan_item_id = 'rv-item-06'
      and due_date = date '2024-08-15'
      and status = 'pending'
  ) then
    raise exception 'late completion must create the corrected due date';
  end if;
  if (select count(*) from public.vmp_revalidation_proposals
      where plan_item_id = 'rv-item-06' and due_date = date '2024-08-15') <> 1 then
    raise exception 'corrected due date must remain unique';
  end if;
end
$late_completion$;

select 'PASS REVALIDATION PROPOSALS' as result;

rollback;

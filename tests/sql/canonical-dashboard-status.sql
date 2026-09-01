\set ON_ERROR_STOP on

begin;

do $test$
declare
  v_as_of constant date := date '2026-09-01';
  v_item public.vmp_plan_items;
  v_status public.item_status;
begin
  v_item := jsonb_populate_record(null::public.vmp_plan_items, jsonb_build_object(
    'actual_vmp_date', '2026-08-31',
    'status_vmp', 'completed',
    'deadline_vmp', '2026-09-30'
  ));
  v_status := public.vmp_canonical_item_status(v_item, v_as_of);
  if v_status <> 'done' then raise exception 'completed expected done, got %', v_status; end if;

  v_item := jsonb_populate_record(null::public.vmp_plan_items, jsonb_build_object(
    'status_protocol', 'completed',
    'status_validation', 'in_progress',
    'deadline_vmp', '2026-09-30'
  ));
  v_status := public.vmp_canonical_item_status(v_item, v_as_of);
  if v_status <> 'prog' then raise exception 'in progress expected prog, got %', v_status; end if;

  v_item := jsonb_populate_record(null::public.vmp_plan_items, jsonb_build_object(
    'deadline_vmp', '2026-08-31'
  ));
  v_status := public.vmp_canonical_item_status(v_item, v_as_of);
  if v_status <> 'over' then raise exception 'past deadline expected over, got %', v_status; end if;

  v_item := jsonb_populate_record(null::public.vmp_plan_items, jsonb_build_object(
    'deadline_vmp', '2026-09-01'
  ));
  v_status := public.vmp_canonical_item_status(v_item, v_as_of);
  if v_status <> 'todo' then raise exception 'today deadline expected todo, got %', v_status; end if;

  v_item := jsonb_populate_record(null::public.vmp_plan_items, jsonb_build_object(
    'deadline_protocol', '2026-10-01'
  ));
  v_status := public.vmp_canonical_item_status(v_item, v_as_of);
  if v_status <> 'todo' then raise exception 'future deadline expected todo, got %', v_status; end if;

  v_item := jsonb_populate_record(null::public.vmp_plan_items, '{}'::jsonb);
  v_status := public.vmp_canonical_item_status(v_item, v_as_of);
  if v_status <> 'plan' then raise exception 'missing deadline expected plan, got %', v_status; end if;
end
$test$;

insert into public.vmp_authorization_revision(singleton, revision)
values (true, 7)
on conflict (singleton) do update set revision = excluded.revision;

insert into public.vmp_objects(code, name, classification, is_active) values
  ('TB-CANONICAL', 'Thiết bị canonical', 'tb', true),
  ('TB-HIDDEN', 'Thiết bị ẩn', 'tb', true);

insert into public.vmp_source_objects(
  object_kind, object_code, object_name, source_tab, source_row,
  validate_flag, is_active
) values
  ('Thiết bị', 'TB-CANONICAL', 'Thiết bị canonical', 'canonical-test', 1, 'y', true),
  ('Thiết bị', 'TB-HIDDEN', 'Thiết bị ẩn', 'canonical-test', 2, 'y', true);

insert into public.vmp_plan_items(
  id, object_code, validation_code, validation_type, year,
  deadline_vmp, is_active, missing_from_sheet
) values
  ('canonical-active', 'TB-CANONICAL', 'PQ-230426', 'PQ', 2026, date '2026-09-30', true, false),
  ('canonical-inactive', 'TB-HIDDEN', 'PQ-HIDDEN', 'PQ', 2026, date '2026-09-30', false, false);

do $rpc_test$
declare
  v_payload jsonb := public.rpc_get_vmp_dashboard_v2(2026, false);
  v_keys text[];
begin
  select array_agg(key order by key) into v_keys
  from jsonb_object_keys(v_payload) key;
  if v_keys <> array[
    'activities', 'authorization_revision', 'contract_version', 'kpi',
    'objects', 'updated_at', 'year'
  ]::text[] then
    raise exception 'unexpected top-level keys: %', v_keys;
  end if;
  if v_payload->>'contract_version' <> '1' then
    raise exception 'unexpected contract version';
  end if;
  if jsonb_array_length(v_payload->'activities') <> 1 then
    raise exception 'inactive rows must not enter the read model';
  end if;
  if v_payload#>>'{activities,0,id}' <> 'PQ-230426'
     or v_payload#>>'{activities,0,st}' <> 'todo'
     or v_payload#>>'{activities,0,canonical_deadline}' <> '2026-09-30'
     or not ((v_payload#>'{activities,0}') ? 'days_left')
     or not ((v_payload#>'{activities,0}') ? 'status_as_of') then
    raise exception 'canonical activity contract is incomplete: %', v_payload->'activities';
  end if;
  if (v_payload#>>'{kpi,validation,total}')::integer <> 1 then
    raise exception 'KPI must be aggregated from the visible active rows';
  end if;
end
$rpc_test$;

select 'PASS CANONICAL DASHBOARD STATUS' as result;

rollback;

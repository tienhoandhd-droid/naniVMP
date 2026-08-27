\set ON_ERROR_STOP on

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create function pg_temp.assert_true(p_condition boolean, p_rule_id text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception using errcode = 'check_violation', message = p_rule_id;
  end if;
end
$$;

create function pg_temp.assert_code(p_actual jsonb, p_code text, p_rule_id text)
returns void language plpgsql as $$
begin
  if p_actual ->> 'ok' is distinct from 'false'
     or coalesce(p_actual ->> 'code', p_actual ->> 'error_code')
        is distinct from p_code then
    raise exception using errcode = 'check_violation',
      message = format('%s expected=%s actual=%s', p_rule_id, p_code, p_actual);
  end if;
end
$$;

create function pg_temp.assert_unchanged(
  p_before jsonb,
  p_audit_count bigint,
  p_validation_code text,
  p_rule_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_after jsonb;
begin
  select to_jsonb(item) into strict v_after
  from public.vmp_plan_items item
  where item.validation_code = p_validation_code;

  if v_after is distinct from p_before
     or (select count(*) from public.audit_logs
         where validation_code = p_validation_code) <> p_audit_count then
    raise exception using errcode = 'check_violation', message = p_rule_id;
  end if;
end
$$;

create function pg_temp.audit_count(p_validation_code text)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*) from public.audit_logs
  where validation_code = p_validation_code
$$;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('98000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'qa-alignment-manager@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('98000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'qa-alignment-assigned@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('98000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'qa-alignment-unassigned@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('98000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
   'qa-alignment-workshop@example.test', 'x', now(), '{}', '{}', now(), now()),
  ('98000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated',
   'qa-alignment-unresolved@example.test', 'x', now(), '{}', '{}', now(), now());

insert into public.departments (id, name, short_name)
values
  ('QA', 'QA rights alignment fixture', 'QA'),
  ('QAALIGN_WS', 'QA rights workshop fixture', 'QAW');

insert into public.profiles (id, full_name, email, role, department, is_active)
values
  ('98000000-0000-4000-8000-000000000001', 'QA Alignment Manager',
   'qa-alignment-manager@example.test', 'qa_manager', 'QA', true),
  ('98000000-0000-4000-8000-000000000002', 'QA Alignment Assigned',
   'qa-alignment-assigned@example.test', 'department_user', 'QA', true),
  ('98000000-0000-4000-8000-000000000003', 'QA Alignment Unassigned',
   'qa-alignment-unassigned@example.test', 'department_user', 'QA', true),
  ('98000000-0000-4000-8000-000000000004', 'QA Alignment Workshop',
   'qa-alignment-workshop@example.test', 'department_user', 'QAALIGN_WS', true),
  ('98000000-0000-4000-8000-000000000005', 'QA Alignment Unresolved',
   'qa-alignment-unresolved@example.test', 'viewer', 'QA', true);

insert into public.vmp_scope_factories (
  id, code, name, department_id, is_active
)
values (
  '98000000-0000-4000-8000-000000000101', 'QAALIGN_FACTORY',
  'QA alignment factory', 'QAALIGN_WS', true
);

insert into public.vmp_scope_areas (id, code, name, factory_id, is_active)
values (
  '98000000-0000-4000-8000-000000000102', 'QAALIGN_AREA',
  'QA alignment area', '98000000-0000-4000-8000-000000000101', true
);

update public.vmp_performers
set department = case
      when user_id = '98000000-0000-4000-8000-000000000004'::uuid
        then 'QAALIGN_WS'
      else 'QA'
    end,
    access_class = case
      when user_id = '98000000-0000-4000-8000-000000000001'::uuid
        then 'qa_manager'
      when user_id in (
        '98000000-0000-4000-8000-000000000002'::uuid,
        '98000000-0000-4000-8000-000000000003'::uuid
      ) then 'qa_progress_editor'
      when user_id = '98000000-0000-4000-8000-000000000004'::uuid
        then 'workshop_staff'
      else 'view_only'
    end,
    scope_departments = case
      when user_id = '98000000-0000-4000-8000-000000000004'::uuid
        then array['QAALIGN_WS']::text[]
      else '{}'::text[]
    end,
    scope_factory_ids = case
      when user_id = '98000000-0000-4000-8000-000000000004'::uuid
        then array['98000000-0000-4000-8000-000000000101'::uuid]
      else '{}'::uuid[]
    end,
    scope_area_ids = case
      when user_id = '98000000-0000-4000-8000-000000000004'::uuid
        then array['98000000-0000-4000-8000-000000000102'::uuid]
      else '{}'::uuid[]
    end
where user_id between '98000000-0000-4000-8000-000000000001'::uuid
                  and '98000000-0000-4000-8000-000000000005'::uuid;

select pg_temp.assert_true(
  public.vmp_business_role('98000000-0000-4000-8000-000000000001') = 'qa_manager'
  and public.vmp_business_role('98000000-0000-4000-8000-000000000002') = 'qa_staff'
  and public.vmp_business_role('98000000-0000-4000-8000-000000000003') = 'qa_staff'
  and public.vmp_business_role('98000000-0000-4000-8000-000000000004') = 'workshop_staff'
  and public.vmp_business_role('98000000-0000-4000-8000-000000000005') is null,
  'QA_RIGHTS_ALIGNMENT_FIXTURE_ROLES');

insert into public.vmp_objects (
  code, name, classification, department, area, line, frequency_months
)
values
  ('QAALIGN-ONE', 'QA rights assigned item', 'tb', 'QAALIGN_WS',
   'QAALIGN_AREA', null, 12),
  ('QAALIGN-TWO', 'QA rights unassigned item', 'tb', 'QAALIGN_WS',
   'QAALIGN_AREA', null, 12);

insert into public.vmp_plan_items (
  id, validation_code, object_code, validation_type, year, report_class,
  effort_days, deadline_protocol, deadline_validation, deadline_report,
  deadline_vmp, status_protocol, status_validation, status_report, status_vmp,
  is_active, item_state, version, departments, execution_departments,
  source_sheet_data
)
values
  ('QAALIGN-ONE/2026.01-PQ', 'QAALIGN-ONE/2026.01-PQ', 'QAALIGN-ONE',
   'PQ', 2026, 'Hóa lý', 5, current_date + 30, current_date + 60,
   current_date + 90, current_date + 120, 'not_started', 'not_started',
   'not_started', 'not_started', true, 'active', 10,
   array['QAALIGN_WS'], array['QAALIGN_WS'], '{"fixture":"qa-alignment-one"}'),
  ('QAALIGN-TWO/2026.01-PQ', 'QAALIGN-TWO/2026.01-PQ', 'QAALIGN-TWO',
   'PQ', 2026, 'Hóa lý', 5, current_date + 30, current_date + 60,
   current_date + 90, current_date + 120, 'not_started', 'not_started',
   'not_started', 'not_started', true, 'active', 20,
   array['QAALIGN_WS'], array['QAALIGN_WS'], '{"fixture":"qa-alignment-two"}');

insert into public.vmp_item_assignments (
  validation_code, performer_id, user_id, staff_name, assignment_kind,
  source, assignment_role, is_active, change_reason, created_by, updated_by
)
select 'QAALIGN-ONE/2026.01-PQ', performer.id, performer.user_id,
       performer.performer_name, 'qa', 'qa_manager', 'collaborator', true,
       'QA rights assigned staff fixture',
       '98000000-0000-4000-8000-000000000001'::uuid,
       '98000000-0000-4000-8000-000000000001'::uuid
from public.vmp_performers performer
where performer.user_id = '98000000-0000-4000-8000-000000000002'::uuid
  and performer.is_active;

insert into public.vmp_item_assignments (
  validation_code, performer_id, user_id, staff_name, assignment_kind,
  source, assignment_role, is_active, change_reason, created_by, updated_by
)
select 'QAALIGN-ONE/2026.01-PQ', performer.id, performer.user_id,
       performer.performer_name, 'equipment_department', 'equipment_manager',
       null, true, 'QA rights workshop fixture',
       '98000000-0000-4000-8000-000000000001'::uuid,
       '98000000-0000-4000-8000-000000000001'::uuid
from public.vmp_performers performer
where performer.user_id = '98000000-0000-4000-8000-000000000004'::uuid
  and performer.is_active;

update public.system_config
set value = to_jsonb('enforced'::text)
where key = 'item_permissions_mode';

select set_config('request.jwt.claims', json_build_object(
  'sub', '98000000-0000-4000-8000-000000000002',
  'role', 'authenticated')::text, true);
set local role authenticated;

-- This is intentionally the first authorization assertion. Before the
-- forward migration the shared QA allowlist still contains the forbidden
-- actual_validation_date field, so --expect-red can prove the exact gap.
do $qa_assigned_rights$
declare
  v_right record;
begin
  select * into strict v_right
  from public.vmp_my_item_rights('QAALIGN-ONE/2026.01-PQ');

  if v_right.can_view is not true
     or v_right.editable_fields is distinct from array[
       'actual_protocol_date', 'status_protocol', 'status_validation',
       'actual_report_date', 'status_report',
       'actual_vmp_date', 'status_vmp'
     ]::text[]
     or v_right.editable_fields @> array['actual_validation_date']::text[] then
    raise exception using errcode = 'check_violation',
      message = 'QA_STAFF_ACTUAL_VALIDATION_DATE_MUST_BE_DENIED actual='
        || to_jsonb(v_right)::text;
  end if;
end
$qa_assigned_rights$;

do $qa_assignment_scope$
declare
  v_right record;
begin
  select * into strict v_right
  from public.vmp_my_item_rights('QAALIGN-TWO/2026.01-PQ');
  if coalesce(v_right.can_view, false)
     or v_right.editable_fields is distinct from '{}'::text[] then
    raise exception using errcode = 'check_violation',
      message = 'QA_STAFF_UNASSIGNED_ITEM_NOT_DENIED ' || to_jsonb(v_right)::text;
  end if;
end
$qa_assignment_scope$;

select set_config('request.jwt.claims', json_build_object(
  'sub', '98000000-0000-4000-8000-000000000003',
  'role', 'authenticated')::text, true);
do $qa_unassigned$
declare
  v_code text;
  v_right record;
begin
  foreach v_code in array array[
    'QAALIGN-ONE/2026.01-PQ', 'QAALIGN-TWO/2026.01-PQ'
  ] loop
    select * into strict v_right from public.vmp_my_item_rights(v_code);
    if coalesce(v_right.can_view, false)
       or v_right.editable_fields is distinct from '{}'::text[] then
      raise exception using errcode = 'check_violation',
        message = 'QA_STAFF_WITHOUT_ASSIGNMENT_NOT_DENIED ' || to_jsonb(v_right)::text;
    end if;
  end loop;
end
$qa_unassigned$;

select set_config('request.jwt.claims', json_build_object(
  'sub', '98000000-0000-4000-8000-000000000001',
  'role', 'authenticated')::text, true);
do $qa_manager_all_items$
declare
  v_code text;
  v_right record;
begin
  foreach v_code in array array[
    'QAALIGN-ONE/2026.01-PQ', 'QAALIGN-TWO/2026.01-PQ'
  ] loop
    select * into strict v_right from public.vmp_my_item_rights(v_code);
    if v_right.can_view is not true
       or v_right.editable_fields is distinct from array[
         'actual_protocol_date', 'status_protocol',
         'actual_validation_date', 'status_validation',
         'actual_report_date', 'status_report',
         'actual_vmp_date', 'status_vmp'
       ]::text[] then
      raise exception using errcode = 'check_violation',
        message = 'QA_MANAGER_NOT_EXACT_EIGHT_ON_ALL_ITEMS ' || to_jsonb(v_right)::text;
    end if;
  end loop;
end
$qa_manager_all_items$;

select set_config('request.jwt.claims', json_build_object(
  'sub', '98000000-0000-4000-8000-000000000004',
  'role', 'authenticated')::text, true);
do $workshop_assignment_scope$
declare
  v_right record;
begin
  select * into strict v_right
  from public.vmp_my_item_rights('QAALIGN-ONE/2026.01-PQ');
  if v_right.can_view is not true
     or v_right.editable_fields is distinct from
        array['actual_validation_date']::text[] then
    raise exception using errcode = 'check_violation',
      message = 'WORKSHOP_ASSIGNED_NOT_EXACT_ONE_FIELD ' || to_jsonb(v_right)::text;
  end if;

  select * into strict v_right
  from public.vmp_my_item_rights('QAALIGN-TWO/2026.01-PQ');
  if coalesce(v_right.can_view, false)
     or v_right.editable_fields is distinct from '{}'::text[] then
    raise exception using errcode = 'check_violation',
      message = 'WORKSHOP_UNASSIGNED_ITEM_NOT_DENIED ' || to_jsonb(v_right)::text;
  end if;
end
$workshop_assignment_scope$;

select set_config('request.jwt.claims', json_build_object(
  'sub', '98000000-0000-4000-8000-000000000005',
  'role', 'authenticated')::text, true);
select pg_temp.assert_true(
  (select count(*) from public.vmp_my_item_rights('QAALIGN-ONE/2026.01-PQ')) = 0,
  'UNRESOLVED_WRAPPER_MUST_FAIL_CLOSED');
select pg_temp.assert_code(
  public.rpc_update_progress(
    'QAALIGN-ONE/2026.01-PQ', '{"status_validation":"in_progress"}',
    null, null, null),
  'ROLE_UNRESOLVED', 'UNRESOLVED_WRITER_MUST_FAIL_CLOSED');

select set_config('request.jwt.claims', json_build_object(
  'sub', '98000000-0000-4000-8000-000000000002',
  'role', 'authenticated')::text, true);
do $qa_writer_denials$
declare
  v_before jsonb;
  v_result jsonb;
  v_audit_count bigint;
  v_version integer;
begin
  select to_jsonb(item), item.version into strict v_before, v_version
  from public.vmp_plan_items item
  where item.validation_code = 'QAALIGN-ONE/2026.01-PQ';
  v_audit_count := pg_temp.audit_count('QAALIGN-ONE/2026.01-PQ');

  v_result := public.rpc_update_progress(
    'QAALIGN-ONE/2026.01-PQ',
    jsonb_build_object('actual_validation_date', current_date),
    'forbidden QA actual validation date', null, v_version);
  perform pg_temp.assert_code(
    v_result, 'item_field_forbidden', 'QA_STAFF_FORBIDDEN_FIELD_WRITER_DENIAL');
  perform pg_temp.assert_unchanged(
    v_before, v_audit_count, 'QAALIGN-ONE/2026.01-PQ',
    'QA_STAFF_FORBIDDEN_FIELD_MUTATED');

  v_result := public.rpc_update_progress(
    'QAALIGN-ONE/2026.01-PQ',
    jsonb_build_object(
      'status_validation', 'in_progress',
      'actual_validation_date', current_date),
    'mixed QA payload', null, v_version);
  perform pg_temp.assert_code(
    v_result, 'item_field_forbidden', 'QA_STAFF_MIXED_WRITER_DENIAL');
  perform pg_temp.assert_unchanged(
    v_before, v_audit_count, 'QAALIGN-ONE/2026.01-PQ',
    'QA_STAFF_MIXED_PAYLOAD_NOT_ATOMIC');

  v_result := public.rpc_update_progress(
    'QAALIGN-ONE/2026.01-PQ', '{"status_validation":"in_progress"}',
    null, null, v_version);
  if v_result ->> 'ok' is distinct from 'true'
     or (v_result ->> 'version')::integer <> v_version + 1 then
    raise exception using errcode = 'check_violation',
      message = 'QA_STAFF_ALLOWED_STATUS_REJECTED ' || v_result::text;
  end if;
end
$qa_writer_denials$;

select set_config('request.jwt.claims', json_build_object(
  'sub', '98000000-0000-4000-8000-000000000004',
  'role', 'authenticated')::text, true);
do $workshop_writer$
declare
  v_result jsonb;
  v_version integer;
begin
  select version into strict v_version from public.vmp_plan_items
  where validation_code = 'QAALIGN-ONE/2026.01-PQ';
  v_result := public.rpc_update_progress(
    'QAALIGN-ONE/2026.01-PQ',
    jsonb_build_object('actual_validation_date', current_date),
    'workshop actual validation date', null, v_version);
  if v_result ->> 'ok' is distinct from 'true'
     or (v_result ->> 'version')::integer <> v_version + 1 then
    raise exception using errcode = 'check_violation',
      message = 'WORKSHOP_ASSIGNED_ACTUAL_DATE_REJECTED ' || v_result::text;
  end if;
end
$workshop_writer$;

select set_config('request.jwt.claims', json_build_object(
  'sub', '98000000-0000-4000-8000-000000000001',
  'role', 'authenticated')::text, true);
do $manager_writer$
declare
  v_result jsonb;
  v_version integer;
begin
  select version into strict v_version from public.vmp_plan_items
  where validation_code = 'QAALIGN-TWO/2026.01-PQ';
  v_result := public.rpc_update_progress(
    'QAALIGN-TWO/2026.01-PQ',
    jsonb_build_object('actual_validation_date', current_date),
    'manager actual validation date', null, v_version);
  if v_result ->> 'ok' is distinct from 'true'
     or (v_result ->> 'version')::integer <> v_version + 1 then
    raise exception using errcode = 'check_violation',
      message = 'QA_MANAGER_GLOBAL_ACTUAL_DATE_REJECTED ' || v_result::text;
  end if;
end
$manager_writer$;

\echo 'PASS BUSINESS QA manager eight QA staff seven workshop assigned one fail-closed atomic writer'
rollback;

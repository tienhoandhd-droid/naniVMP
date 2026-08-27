\set ON_ERROR_STOP on

begin;
set local lock_timeout = '3s';
set local statement_timeout = '90s';

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

create function pg_temp.item_snapshot(p_validation_code text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(item) from public.vmp_plan_items item
  where item.validation_code = p_validation_code
$$;

create function pg_temp.audit_count(p_validation_code text)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*) from public.audit_logs audit
  where audit.validation_code = p_validation_code
$$;

create function pg_temp.active_assignment_count(
  p_validation_code text,
  p_user_id uuid,
  p_kind text
)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*) from public.vmp_item_assignments assignment
  where assignment.validation_code = p_validation_code
    and assignment.user_id = p_user_id
    and assignment.assignment_kind = p_kind
    and assignment.is_active
    and (assignment.expires_at is null or assignment.expires_at > now())
$$;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('99010000-0000-4000-8000-000000000001','authenticated','authenticated',
   'assigned-progress-admin@example.test','x',now(),'{}','{}',now(),now()),
  ('99010000-0000-4000-8000-000000000002','authenticated','authenticated',
   'assigned-progress-manager@example.test','x',now(),'{}','{}',now(),now()),
  ('99010000-0000-4000-8000-000000000003','authenticated','authenticated',
   'assigned-progress-qa-one@example.test','x',now(),'{}','{}',now(),now()),
  ('99010000-0000-4000-8000-000000000004','authenticated','authenticated',
   'assigned-progress-qa-two@example.test','x',now(),'{}','{}',now(),now()),
  ('99010000-0000-4000-8000-000000000005','authenticated','authenticated',
   'assigned-progress-workshop@example.test','x',now(),'{}','{}',now(),now()),
  ('99010000-0000-4000-8000-000000000006','authenticated','authenticated',
   'assigned-progress-inactive@example.test','x',now(),'{}','{}',now(),now());

insert into public.departments (id, name, short_name)
values ('APV_WS', 'Assigned progress workshop fixture', 'APV');

insert into public.profiles (id, full_name, email, role, department, is_active)
values
  ('99010000-0000-4000-8000-000000000001','Assigned Progress Admin',
   'assigned-progress-admin@example.test','admin','qa',true),
  ('99010000-0000-4000-8000-000000000002','Assigned Progress QA Manager',
   'assigned-progress-manager@example.test','qa_manager','qa',true),
  ('99010000-0000-4000-8000-000000000003','Assigned Progress QA One',
   'assigned-progress-qa-one@example.test','department_user','qa',true),
  ('99010000-0000-4000-8000-000000000004','Assigned Progress QA Two',
   'assigned-progress-qa-two@example.test','department_user','qa',true),
  ('99010000-0000-4000-8000-000000000005','Assigned Progress Workshop',
   'assigned-progress-workshop@example.test','department_user','APV_WS',true),
  ('99010000-0000-4000-8000-000000000006','Assigned Progress Inactive',
   'assigned-progress-inactive@example.test','department_user','qa',false);

update public.vmp_performers
set department = case
      when user_id = '99010000-0000-4000-8000-000000000005'::uuid
        then 'APV_WS'
      else 'qa'
    end,
    access_class = case
      when user_id = '99010000-0000-4000-8000-000000000002'::uuid
        then 'qa_manager'
      when user_id in (
        '99010000-0000-4000-8000-000000000003'::uuid,
        '99010000-0000-4000-8000-000000000004'::uuid,
        '99010000-0000-4000-8000-000000000006'::uuid
      ) then 'qa_progress_editor'
      else 'workshop_staff'
    end,
    is_active = user_id <> '99010000-0000-4000-8000-000000000006'::uuid,
    scope_departments = case
      when user_id = '99010000-0000-4000-8000-000000000005'::uuid
        then array['APV_WS']::text[]
      else '{}'::text[]
    end,
    scope_factory_ids = case
      when user_id = '99010000-0000-4000-8000-000000000005'::uuid
        then array['99010000-0000-4000-8000-000000000101'::uuid]
      else '{}'::uuid[]
    end,
    scope_area_ids = case
      when user_id = '99010000-0000-4000-8000-000000000005'::uuid
        then array['99010000-0000-4000-8000-000000000102'::uuid]
      else '{}'::uuid[]
    end,
    scope_line_ids = '{}'::uuid[]
where user_id between '99010000-0000-4000-8000-000000000002'::uuid
                  and '99010000-0000-4000-8000-000000000006'::uuid;

select pg_temp.assert_true(
  (select count(*) from public.vmp_performers
   where user_id between '99010000-0000-4000-8000-000000000002'::uuid
                     and '99010000-0000-4000-8000-000000000006'::uuid) = 5,
  'ASSIGNED_PROGRESS_FIXTURE_LINKED_PERFORMERS');

insert into public.vmp_scope_factories (id, code, name, department_id, is_active)
values (
  '99010000-0000-4000-8000-000000000101', 'APV_FACTORY',
  'Assigned progress factory', 'APV_WS', true
);

insert into public.vmp_scope_areas (id, code, name, factory_id, is_active)
values (
  '99010000-0000-4000-8000-000000000102', 'APV_AREA',
  'Assigned progress area', '99010000-0000-4000-8000-000000000101', true
);

insert into public.vmp_objects (
  code, name, classification, department, area, line, frequency_months
)
values
  ('APV-ASSIGNED','Assigned progress cross-department item','tb',
   'APV_WS','APV_AREA',null,12),
  ('APV-UNASSIGNED','Assigned progress legacy-department trap','tb',
   'qa',null,null,12),
  ('APV-SOURCE','Assigned progress source-owner item','tb',
   'APV_WS','APV_AREA',null,12),
  ('APV-INACTIVE','Assigned progress inactive item','tb',
   'APV_WS','APV_AREA',null,12);

insert into public.vmp_plan_items (
  id, validation_code, object_code, validation_type, year, report_class,
  effort_days, deadline_protocol, deadline_validation, deadline_report,
  deadline_vmp, status_protocol, status_validation, status_report, status_vmp,
  is_active, item_state, version, departments, execution_departments,
  source_sheet_data
)
values
  ('APV-ASSIGNED/2026.01-PQ','APV-ASSIGNED/2026.01-PQ','APV-ASSIGNED',
   'PQ',2026,'Hóa lý',5,current_date+30,current_date+60,current_date+90,
   current_date+120,'not_started','not_started','not_started','not_started',
   true,'active',10,array['APV_WS'],array['APV_WS'],'{"fixture":"assigned"}'),
  ('APV-UNASSIGNED/2026.01-PQ','APV-UNASSIGNED/2026.01-PQ','APV-UNASSIGNED',
   'PQ',2026,'Hóa lý',5,current_date+30,current_date+60,current_date+90,
   current_date+120,'not_started','not_started','not_started','not_started',
   true,'active',20,array['qa'],array['qa'],'{"fixture":"unassigned"}'),
  ('APV-SOURCE/2026.01-PQ','APV-SOURCE/2026.01-PQ','APV-SOURCE',
   'PQ',2026,'Hóa lý',5,current_date+30,current_date+60,current_date+90,
   current_date+120,'not_started','not_started','not_started','not_started',
   true,'active',30,array['APV_WS'],array['APV_WS'],'{"fixture":"source"}'),
  ('APV-INACTIVE/2026.01-PQ','APV-INACTIVE/2026.01-PQ','APV-INACTIVE',
   'PQ',2026,'Hóa lý',5,current_date+30,current_date+60,current_date+90,
   current_date+120,'not_started','not_started','not_started','not_started',
   false,'active',40,array['APV_WS'],array['APV_WS'],'{"fixture":"inactive"}');

insert into public.vmp_source_objects (
  id, object_kind, object_code, object_name, department, area_code,
  validate_flag, frequency_months, report_class, workdays, first_month,
  year_ref, source_tab, source_row, version, timeline_revision,
  timeline_applied_revision
)
values (
  '99010000-0000-4000-8000-000000000201','Thiết bị','APV-SOURCE',
  'Assigned progress source-owner item','APV_WS','APV_AREA','y',12,
  'Hóa lý',5,1,2026,'assigned-progress-test',9901,1,0,0
);

insert into public.vmp_item_assignments (
  validation_code, performer_id, user_id, staff_name, assignment_kind,
  source, assignment_role, is_active, change_reason, created_by, updated_by
)
select 'APV-ASSIGNED/2026.01-PQ', performer.id, performer.user_id,
       performer.performer_name, 'qa', 'qa_manager', 'collaborator', true,
       'Assigned progress QA fixture',
       '99010000-0000-4000-8000-000000000002'::uuid,
       '99010000-0000-4000-8000-000000000002'::uuid
from public.vmp_performers performer
where performer.user_id = '99010000-0000-4000-8000-000000000003'::uuid;

insert into public.vmp_item_assignments (
  validation_code, performer_id, user_id, staff_name, assignment_kind,
  source, assignment_role, is_active, change_reason, created_by, updated_by
)
select 'APV-ASSIGNED/2026.01-PQ', performer.id, performer.user_id,
       performer.performer_name, 'equipment_department', 'equipment_manager',
       null, true, 'Assigned progress workshop fixture',
       '99010000-0000-4000-8000-000000000002'::uuid,
       '99010000-0000-4000-8000-000000000002'::uuid
from public.vmp_performers performer
where performer.user_id = '99010000-0000-4000-8000-000000000005'::uuid;

select pg_temp.assert_true(
  public.vmp_business_role('99010000-0000-4000-8000-000000000001')='admin'
  and public.vmp_business_role('99010000-0000-4000-8000-000000000002')='qa_manager'
  and public.vmp_business_role('99010000-0000-4000-8000-000000000003')='qa_staff'
  and public.vmp_business_role('99010000-0000-4000-8000-000000000004')='qa_staff'
  and public.vmp_business_role('99010000-0000-4000-8000-000000000005')='workshop_staff'
  and public.vmp_business_role('99010000-0000-4000-8000-000000000006') is null
  and (select value from public.system_config where key='item_permissions_mode')
      = '"preview"'::jsonb,
  'ASSIGNED_PROGRESS_FIXTURE_ROLES_AND_PREVIEW_MODE');

-- RED gate: every fixture and the current resolver were exercised above.
-- The forward migration must add this exact zero-argument browser boundary.
select pg_temp.assert_true(
  to_regprocedure('public.rpc_my_editable_progress_rights()') is not null,
  'ASSIGNED_PROGRESS_BATCH_RPC_MISSING');

set local role authenticated;

select set_config('request.jwt.claims', json_build_object(
  'sub','99010000-0000-4000-8000-000000000001','role','authenticated')::text,
  true);
do $admin_batch$
declare
  v_batch jsonb := public.rpc_my_editable_progress_rights();
  v_row jsonb;
  v_expected text[];
  v_codes text[];
begin
  select array_agg(value ->> 'validation_code' order by ordinality)
  into v_codes
  from jsonb_array_elements(v_batch -> 'rights') with ordinality rows(value, ordinality);
  if v_batch ->> 'ok' is distinct from 'true'
     or v_codes is distinct from (
       select array_agg(item.validation_code order by item.validation_code)
       from public.vmp_plan_items item where item.is_active
     ) then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_ADMIN_NOT_ALL_ACTIVE ' || v_batch::text;
  end if;
  for v_row in
    select value from jsonb_array_elements(v_batch -> 'rights') rows(value)
  loop
    select editable_fields into strict v_expected
    from public.vmp_my_item_rights(v_row ->> 'validation_code');
    if v_row -> 'editable_fields' is distinct from to_jsonb(v_expected) then
      raise exception using errcode='check_violation',
        message='ASSIGNED_PROGRESS_ADMIN_RESOLVER_FIELDS ' || v_row::text;
    end if;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(v_batch -> 'rights') value
    where value ->> 'validation_code' = 'APV-INACTIVE/2026.01-PQ'
  ) then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_ADMIN_INACTIVE_VISIBLE';
  end if;
end
$admin_batch$;

select set_config('request.jwt.claims', json_build_object(
  'sub','99010000-0000-4000-8000-000000000002','role','authenticated')::text,
  true);
do $manager_batch$
declare
  v_batch jsonb := public.rpc_my_editable_progress_rights();
  v_row jsonb;
  v_codes text[];
begin
  select array_agg(value ->> 'validation_code' order by ordinality)
  into v_codes
  from jsonb_array_elements(v_batch -> 'rights') with ordinality rows(value, ordinality);
  if v_batch ->> 'ok' is distinct from 'true'
     or v_codes is distinct from (
       select array_agg(item.validation_code order by item.validation_code)
       from public.vmp_plan_items item where item.is_active
     ) then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_MANAGER_NOT_ALL_ACTIVE ' || v_batch::text;
  end if;
  for v_row in select value from jsonb_array_elements(v_batch -> 'rights') value
  loop
    if v_row -> 'editable_fields' is distinct from '[
      "actual_protocol_date","status_protocol",
      "actual_validation_date","status_validation",
      "actual_report_date","status_report",
      "actual_vmp_date","status_vmp"
    ]'::jsonb then
      raise exception using errcode='check_violation',
        message='ASSIGNED_PROGRESS_MANAGER_FIELDS_NOT_EIGHT ' || v_row::text;
    end if;
  end loop;
end
$manager_batch$;

select set_config('request.jwt.claims', json_build_object(
  'sub','99010000-0000-4000-8000-000000000003','role','authenticated')::text,
  true);
select pg_temp.assert_true(
  public.rpc_my_editable_progress_rights() -> 'rights' = jsonb_build_array(
    jsonb_build_object(
      'validation_code','APV-ASSIGNED/2026.01-PQ',
      'editable_fields','[
        "actual_protocol_date","status_protocol","status_validation",
        "actual_report_date","status_report","actual_vmp_date","status_vmp"
      ]'::jsonb,
      'view_reason','Có phân công QA đang hoạt động'
    )
  ),
  'ASSIGNED_PROGRESS_QA_ONE_ONLY_ASSIGNED_SEVEN');

select set_config('request.jwt.claims', json_build_object(
  'sub','99010000-0000-4000-8000-000000000004','role','authenticated')::text,
  true);
select pg_temp.assert_true(
  public.rpc_my_editable_progress_rights() = '{"ok":true,"rights":[]}'::jsonb,
  'ASSIGNED_PROGRESS_QA_WITHOUT_ASSIGNMENT_EMPTY');

select set_config('request.jwt.claims', json_build_object(
  'sub','99010000-0000-4000-8000-000000000005','role','authenticated')::text,
  true);
do $workshop_batch$
declare
  v_batch jsonb := public.rpc_my_editable_progress_rights();
  v_row jsonb;
begin
  if v_batch ->> 'ok' is distinct from 'true'
     or jsonb_array_length(v_batch -> 'rights') <> 1 then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_WORKSHOP_BATCH_COUNT ' || v_batch::text;
  end if;
  v_row := v_batch -> 'rights' -> 0;
  if v_row ->> 'validation_code' <> 'APV-ASSIGNED/2026.01-PQ'
     or v_row -> 'editable_fields' <> '["actual_validation_date"]'::jsonb then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_WORKSHOP_ONLY_ACTUAL_VALIDATION ' || v_row::text;
  end if;
end
$workshop_batch$;

-- Dedicated progress enforcement must apply even while every other item
-- permission surface remains in preview mode.
select pg_temp.assert_true(
  (select value from public.system_config where key='item_permissions_mode')
    = '"preview"'::jsonb,
  'ASSIGNED_PROGRESS_WRITER_TEST_REQUIRES_PREVIEW_MODE');

select set_config('request.jwt.claims', json_build_object(
  'sub','99010000-0000-4000-8000-000000000003','role','authenticated')::text,
  true);
do $qa_writer$
declare
  v_before jsonb;
  v_after jsonb;
  v_audit_before bigint;
  v_result jsonb;
  v_version integer;
begin
  select version into strict v_version from public.vmp_plan_items
  where validation_code='APV-ASSIGNED/2026.01-PQ';
  v_result := public.rpc_update_progress(
    'APV-ASSIGNED/2026.01-PQ','{"status_validation":"in_progress"}',
    null,null,v_version);
  if v_result ->> 'ok' is distinct from 'true' then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_QA_CROSS_DEPARTMENT_ALLOWED_REJECTED '
        || v_result::text;
  end if;

  v_before := pg_temp.item_snapshot('APV-ASSIGNED/2026.01-PQ');
  v_audit_before := pg_temp.audit_count('APV-ASSIGNED/2026.01-PQ');
  v_version := (v_before ->> 'version')::integer;
  v_result := public.rpc_update_progress(
    'APV-ASSIGNED/2026.01-PQ',
    jsonb_build_object('actual_validation_date',current_date),
    'QA cannot write actual validation date',null,v_version);
  perform pg_temp.assert_code(
    v_result,'item_field_forbidden','ASSIGNED_PROGRESS_QA_ACTUAL_DATE_NOT_DENIED');
  v_after := pg_temp.item_snapshot('APV-ASSIGNED/2026.01-PQ');
  if v_after is distinct from v_before
     or pg_temp.audit_count('APV-ASSIGNED/2026.01-PQ') <> v_audit_before then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_QA_FORBIDDEN_DATE_MUTATED';
  end if;

  v_result := public.rpc_update_progress(
    'APV-ASSIGNED/2026.01-PQ',jsonb_build_object(
      'status_validation','completed','actual_validation_date',current_date),
    'Mixed allowed and forbidden QA patch',null,v_version);
  perform pg_temp.assert_code(
    v_result,'item_field_forbidden','ASSIGNED_PROGRESS_QA_MIXED_NOT_DENIED');
  v_after := pg_temp.item_snapshot('APV-ASSIGNED/2026.01-PQ');
  if v_after is distinct from v_before
     or pg_temp.audit_count('APV-ASSIGNED/2026.01-PQ') <> v_audit_before then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_QA_MIXED_NOT_ATOMIC';
  end if;

  v_before := pg_temp.item_snapshot('APV-UNASSIGNED/2026.01-PQ');
  v_audit_before := pg_temp.audit_count('APV-UNASSIGNED/2026.01-PQ');
  v_result := public.rpc_update_progress(
    'APV-UNASSIGNED/2026.01-PQ','{"status_validation":"in_progress"}',
    null,null,(v_before ->> 'version')::integer);
  perform pg_temp.assert_code(
    v_result,'item_field_forbidden','ASSIGNED_PROGRESS_UNASSIGNED_QA_NOT_DENIED');
  if pg_temp.item_snapshot('APV-UNASSIGNED/2026.01-PQ') is distinct from v_before
     or pg_temp.audit_count('APV-UNASSIGNED/2026.01-PQ') <> v_audit_before then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_UNASSIGNED_QA_MUTATED';
  end if;
end
$qa_writer$;

select set_config('request.jwt.claims', json_build_object(
  'sub','99010000-0000-4000-8000-000000000005','role','authenticated')::text,
  true);
do $workshop_writer$
declare
  v_before jsonb;
  v_result jsonb;
begin
  v_before := pg_temp.item_snapshot('APV-ASSIGNED/2026.01-PQ');
  v_result := public.rpc_update_progress(
    'APV-ASSIGNED/2026.01-PQ',
    jsonb_build_object('actual_validation_date',current_date),
    'Workshop records actual validation date',null,
    (v_before ->> 'version')::integer);
  if v_result ->> 'ok' is distinct from 'true' then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_WORKSHOP_ACTUAL_DATE_REJECTED '||v_result::text;
  end if;
  v_before := pg_temp.item_snapshot('APV-ASSIGNED/2026.01-PQ');
  v_result := public.rpc_update_progress(
    'APV-ASSIGNED/2026.01-PQ','{"status_validation":"completed"}',
    'Workshop cannot write QA status',null,(v_before ->> 'version')::integer);
  perform pg_temp.assert_code(
    v_result,'item_field_forbidden','ASSIGNED_PROGRESS_WORKSHOP_STATUS_NOT_DENIED');
  if pg_temp.item_snapshot('APV-ASSIGNED/2026.01-PQ') is distinct from v_before then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_WORKSHOP_FORBIDDEN_STATUS_MUTATED';
  end if;
end
$workshop_writer$;

-- Existing Dữ liệu nguồn behavior is an integration input only. These calls
-- prove that its existing owner cascade drives the new progress list.
select set_config('request.jwt.claims', json_build_object(
  'sub','99010000-0000-4000-8000-000000000002','role','authenticated')::text,
  true);
do $source_set_owner$
declare
  v_owner uuid;
  v_result jsonb;
begin
  select id into strict v_owner from public.vmp_performers
  where user_id='99010000-0000-4000-8000-000000000003'::uuid;
  v_result := public.rpc_save_catalog_object(
    'Thiết bị','APV-SOURCE',jsonb_build_object('owner_person_id',v_owner),
    'Assign QA owner from Source Data',1);
  if v_result ->> 'ok' is distinct from 'true'
     or (v_result ->> 'owner_assignments_ok')::integer <> 1
     or pg_temp.active_assignment_count(
       'APV-SOURCE/2026.01-PQ','99010000-0000-4000-8000-000000000003','qa') <> 1 then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_SOURCE_OWNER_SET_FAILED '||v_result::text;
  end if;
end
$source_set_owner$;

select set_config('request.jwt.claims', json_build_object(
  'sub','99010000-0000-4000-8000-000000000003','role','authenticated')::text,
  true);
select pg_temp.assert_true(
  exists (
    select 1 from jsonb_array_elements(
      public.rpc_my_editable_progress_rights() -> 'rights') value
    where value ->> 'validation_code'='APV-SOURCE/2026.01-PQ'
      and value -> 'editable_fields'='[
        "actual_protocol_date","status_protocol","status_validation",
        "actual_report_date","status_report","actual_vmp_date","status_vmp"
      ]'::jsonb
  ),
  'ASSIGNED_PROGRESS_SOURCE_OWNER_NOT_VISIBLE_TO_QA');

select set_config('request.jwt.claims', json_build_object(
  'sub','99010000-0000-4000-8000-000000000006','role','authenticated')::text,
  true);
select pg_temp.assert_code(
  public.rpc_my_editable_progress_rights(),
  'ACCOUNT_DISABLED','ASSIGNED_PROGRESS_INACTIVE_SESSION_NOT_DENIED');

select pg_temp.assert_true(
  (select value from public.system_config where key='item_permissions_mode')
    = '"preview"'::jsonb,
  'ASSIGNED_PROGRESS_SUITE_CHANGED_GLOBAL_MODE');

\echo 'PASS BUSINESS assigned-only list writer and Source Data owner cascade in preview mode'
rollback;

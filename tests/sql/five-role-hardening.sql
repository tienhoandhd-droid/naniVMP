\set ON_ERROR_STOP on

-- Persistent local fixture used before applying the migration to the
-- schema-only disposable clone. Refuse any non-empty matrix so this mode can
-- never overwrite the reviewed production matrix.
\if :{?seed_five_role_fixture}
begin;

do $$
begin
  if (select count(*) from public.vmp_screen_permissions) <> 0 then
    raise exception using errcode = 'check_violation',
      message = 'FIVE_ROLE_FIXTURE_REQUIRES_EMPTY_MATRIX';
  end if;
end
$$;

insert into public.vmp_screen_permissions (
  business_role, screen_id, can_view, data_scope, actions
)
select r.business_role, s.screen_id,
       coalesce(g.can_view, false),
       coalesce(g.data_scope, 'none'),
       coalesce(g.actions, '{}'::text[])
from (values
  ('admin'), ('qa_manager'), ('qa_staff'),
  ('workshop_manager'), ('workshop_staff'), ('viewer')
) as r(business_role)
cross join (values
  ('today'), ('overview'), ('timeline'), ('alerts'), ('risk'), ('progress'),
  ('inventory'), ('source'), ('workload'), ('reports'), ('rules'), ('people'),
  ('health'), ('audit'), ('accounts'), ('admin'), ('phanquyen')
) as s(screen_id)
left join (values
  ('admin','today',true,'all',array['view']),
  ('qa_manager','today',true,'all',array['view']),
  ('qa_staff','today',true,'assigned',array['view']),
  ('workshop_manager','today',true,'workshop',array['view']),
  ('workshop_staff','today',true,'workshop',array['view']),
  ('admin','overview',true,'all',array['view']),
  ('qa_manager','overview',true,'all',array['view']),
  ('qa_staff','overview',true,'all',array['view']),
  ('workshop_manager','overview',true,'workshop',array['view']),
  ('workshop_staff','overview',true,'workshop',array['view']),
  ('viewer','overview',true,'all',array['view']),
  ('admin','timeline',true,'all',array['view']),
  ('qa_manager','timeline',true,'all',array['view']),
  ('qa_staff','timeline',true,'all',array['view']),
  ('workshop_manager','timeline',true,'workshop',array['view']),
  ('workshop_staff','timeline',true,'workshop',array['view']),
  ('viewer','timeline',true,'all',array['view']),
  ('admin','alerts',true,'all',array['view']),
  ('qa_manager','alerts',true,'all',array['view']),
  ('qa_staff','alerts',true,'all',array['view']),
  ('workshop_manager','alerts',true,'workshop',array['view']),
  ('workshop_staff','alerts',true,'workshop',array['view']),
  ('viewer','alerts',true,'all',array['view']),
  ('admin','risk',true,'all',array['view']),
  ('qa_manager','risk',true,'all',array['view']),
  ('qa_staff','risk',true,'all',array['view']),
  ('workshop_manager','risk',true,'workshop',array['view']),
  ('workshop_staff','risk',true,'workshop',array['view']),
  ('viewer','risk',true,'all',array['view']),
  ('admin','reports',true,'all',array['view']),
  ('qa_manager','reports',true,'all',array['view']),
  ('qa_staff','reports',true,'all',array['view']),
  ('workshop_manager','reports',true,'workshop',array['view']),
  ('workshop_staff','reports',true,'workshop',array['view']),
  ('viewer','reports',true,'all',array['view']),
  ('admin','progress',true,'all',array['edit_vertical_timeline','record_actual_validation_date','assign_workshop_staff']),
  ('qa_manager','progress',true,'all',array['edit_vertical_timeline']),
  ('qa_staff','progress',true,'assigned',array['edit_vertical_timeline']),
  ('workshop_manager','progress',true,'workshop',array['assign_workshop_staff','record_actual_validation_date']),
  ('workshop_staff','progress',true,'workshop',array['record_actual_validation_date']),
  ('admin','inventory',true,'all',array['edit_vertical_timeline','record_actual_validation_date','assign_workshop_staff']),
  ('qa_manager','inventory',true,'all',array['edit_vertical_timeline']),
  ('qa_staff','inventory',true,'assigned',array['edit_vertical_timeline']),
  ('workshop_manager','inventory',true,'workshop',array['assign_workshop_staff','record_actual_validation_date']),
  ('workshop_staff','inventory',true,'workshop',array['record_actual_validation_date']),
  ('admin','source',true,'all',array['edit_catalog','generate_timeline']),
  ('qa_manager','source',true,'all',array['edit_catalog','generate_timeline']),
  ('qa_staff','source',true,'all',array['view']),
  ('workshop_manager','source',true,'workshop',array['view']),
  ('workshop_staff','source',true,'workshop',array['view']),
  ('viewer','source',true,'all',array['view']),
  ('admin','workload',true,'all',array['view_workload']),
  ('qa_manager','workload',true,'all',array['view_workload']),
  ('qa_staff','workload',true,'all',array['view_workload']),
  ('admin','rules',true,'all',array['view_rules']),
  ('qa_manager','rules',true,'all',array['view_rules']),
  ('qa_staff','rules',true,'all',array['view_rules']),
  ('admin','people',true,'all',array['edit_operational_people']),
  ('qa_manager','people',true,'all',array['edit_operational_people']),
  ('qa_staff','people',true,'all',array['view']),
  ('admin','health',true,'all',array['view']),
  ('qa_manager','health',true,'all',array['view']),
  ('admin','audit',true,'all',array['view']),
  ('qa_manager','audit',true,'all',array['view']),
  ('admin','accounts',true,'all',array['manage_accounts','manage_authorization_policy']),
  ('admin','admin',true,'all',array['view']),
  ('admin','phanquyen',true,'none','{}'::text[]),
  ('qa_manager','phanquyen',true,'none','{}'::text[]),
  ('qa_staff','phanquyen',true,'none','{}'::text[]),
  ('workshop_manager','phanquyen',true,'none',array['assign_workshop_staff'])
) as g(business_role, screen_id, can_view, data_scope, actions)
  on g.business_role = r.business_role and g.screen_id = s.screen_id;

do $$
declare
  v_implicit_array text;
  v_explicit_array text;
  v_implicit_csv text;
  v_explicit_csv text;
begin
  select md5(string_agg(concat_ws('|', business_role, screen_id,
           can_view, data_scope, actions::text), E'\n'
           order by business_role, screen_id)),
         md5(string_agg(concat_ws('|', business_role, screen_id,
           can_view::text, data_scope, actions::text), E'\n'
           order by business_role, screen_id)),
         md5(string_agg(concat_ws('|', business_role, screen_id,
           can_view, data_scope, array_to_string(actions, ',')), E'\n'
           order by business_role, screen_id)),
         md5(string_agg(concat_ws('|', business_role, screen_id,
           can_view::text, data_scope, array_to_string(actions, ',')), E'\n'
           order by business_role, screen_id))
    into v_implicit_array, v_explicit_array, v_implicit_csv, v_explicit_csv
  from public.vmp_screen_permissions;

  if v_implicit_array <> '0befb5a03f96dfe2dfa653f7da929cd0'
     or v_explicit_array <> 'f23b9883743f21e86145400e11dd1167'
     or v_implicit_csv <> '99813f36bc9dbc88fec26a18a1685d7c'
     or v_explicit_csv <> 'b5fb9554b5ed69ff247c3ea54a6e3b0e' then
    raise exception using errcode = 'check_violation',
      message = 'FIVE_ROLE_FIXTURE_MATRIX_DIGEST_MISMATCH';
  end if;
end
$$;

insert into public.system_config (key, value, description)
values
  ('screen_access_mode', to_jsonb('enforced'::text),
    'Reviewed local five-role fixture mode.'),
  ('item_permissions_mode', to_jsonb('preview'::text),
    'Reviewed local five-role fixture mode.'),
  ('five_role_test_fixture', 'true'::jsonb,
    'Local disposable-clone marker; never deploy to production.');

-- Reproduce the legacy fallback that made an inactive QA Manager retain the
-- old edit_catalog writer path through muc_quyen()/duoc_phep(). This is
-- synthetic non-PII state and exists only in the disposable clone.
insert into public.vmp_role_permissions (hanh_dong, vai_tro, muc)
values ('edit_catalog', 'qa_manager', 'co')
on conflict (hanh_dong, vai_tro) do update set muc = excluded.muc;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select id, 'authenticated', 'authenticated', email, 'not-used', now(),
       '{}'::jsonb, '{}'::jsonb, now(), now()
from (values
  ('71000000-0000-4000-8000-000000000001'::uuid, 'target-viewer-1@example.test'),
  ('71000000-0000-4000-8000-000000000002'::uuid, 'target-viewer-2@example.test'),
  ('71000000-0000-4000-8000-000000000003'::uuid, 'target-viewer-3@example.test'),
  ('71000000-0000-4000-8000-000000000004'::uuid, 'target-department-1@example.test'),
  ('71000000-0000-4000-8000-000000000005'::uuid, 'target-department-2@example.test'),
  ('71000000-0000-4000-8000-000000000006'::uuid, 'target-department-3@example.test'),
  ('71000000-0000-4000-8000-000000000007'::uuid, 'target-qa-manager@example.test'),
  ('71000000-0000-4000-8000-000000000098'::uuid, 'blocker-control@example.test'),
  ('71000000-0000-4000-8000-000000000099'::uuid, 'control-admin@example.test')
) as fixture_users(id, email)
on conflict (id) do update
set aud = excluded.aud,
    role = excluded.role,
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = excluded.updated_at;

insert into public.departments (id, name, short_name)
values ('FIVE_ROLE_TEST', 'Five-role local fixture', 'FRT'),
       ('qa', 'Five-role QA fixture', 'QA');

insert into public.profiles (id, full_name, email, role, department, is_active)
values
  ('71000000-0000-4000-8000-000000000001', 'Target Viewer 1', 'target-viewer-1@example.test', 'viewer', null, true),
  ('71000000-0000-4000-8000-000000000002', 'Target Viewer 2', 'target-viewer-2@example.test', 'viewer', null, true),
  ('71000000-0000-4000-8000-000000000003', 'Target Viewer 3', 'target-viewer-3@example.test', 'viewer', null, true),
  ('71000000-0000-4000-8000-000000000004', 'Target Department 1', 'target-department-1@example.test', 'department_user', 'FIVE_ROLE_TEST', true),
  ('71000000-0000-4000-8000-000000000005', 'Target Department 2', 'target-department-2@example.test', 'department_user', 'FIVE_ROLE_TEST', true),
  ('71000000-0000-4000-8000-000000000006', 'Target Department 3', 'target-department-3@example.test', 'department_user', 'FIVE_ROLE_TEST', true),
  ('71000000-0000-4000-8000-000000000007', 'Target QA manager', 'target-qa-manager@example.test', 'qa_manager', 'qa', true),
  ('71000000-0000-4000-8000-000000000098', 'Blocker control', 'blocker-control@example.test', 'qa_manager', 'FIVE_ROLE_TEST', true),
  ('71000000-0000-4000-8000-000000000099', 'Control Admin', 'control-admin@example.test', 'admin', null, true);

-- Keep the approved target QA Manager internally valid so disabling it does
-- not change the reviewed local preflight breakdown.  A separate non-target
-- synthetic control deliberately carries the one INVALID_MANAGER_PRINCIPAL
-- and INCOMPLETE_ACTIVE_PERSON findings represented in the 16-row digest.
update public.vmp_performers
set access_class = 'qa_manager', department = 'qa'
where user_id = '71000000-0000-4000-8000-000000000007'::uuid;
update public.vmp_performers
set employee_code = 'FIVE-ROLE-BLOCKER-CONTROL'
where user_id = '71000000-0000-4000-8000-000000000098'::uuid;

commit;
\quit
\endif
\set department_uid '11111111-1111-4111-8111-111111111111'
\set viewer_uid '22222222-2222-4222-8222-222222222222'
\set inactive_uid '33333333-3333-4333-8333-333333333333'
\set admin_uid '44444444-4444-4444-8444-444444444444'
\set qa_manager_uid '55555555-5555-4555-8555-555555555555'
\set profile_audit_id '66666666-6666-4666-8666-666666666666'
\set catalog_audit_id '77777777-7777-4777-8777-777777777777'
\set qa_staff_uid '88888888-8888-4888-8888-888888888888'
\set workshop_manager_uid '99999999-9999-4999-8999-999999999999'
\set workshop_staff_uid 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
\set rls_profile_uid 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
\set rls_inactive_profile_uid 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

begin;

create function pg_temp.assert_true(p_condition boolean, p_rule_id text)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condition, false) then
    raise exception using errcode = 'check_violation', message = p_rule_id;
  end if;
end
$$;

create function pg_temp.assert_denied_json(p_sql text, p_rule_id text)
returns void
language plpgsql
as $$
declare
  v_payload jsonb;
begin
  begin
    execute p_sql into v_payload;
  exception
    when insufficient_privilege then return;
  end;

  if coalesce(v_payload ->> 'error_code', '')
       not in ('ACCOUNT_DISABLED', 'ROLE_UNRESOLVED') then
    raise exception using errcode = 'check_violation', message = p_rule_id;
  end if;
end
$$;

create function pg_temp.assert_denied_scalar(p_sql text, p_rule_id text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception
    when insufficient_privilege then return;
  end;

  raise exception using errcode = 'check_violation', message = p_rule_id;
end
$$;

-- Execute as the current invoker and convert an EXECUTE revocation into the
-- same fail-closed shape as an active-session JSON denial.  This lets the
-- containment probes measure table/audit deltas without aborting the outer
-- transaction when an omitted legacy RPC is correctly no longer browser
-- executable.
create function pg_temp.capture_json_denial(p_sql text)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb;
begin
  begin
    execute p_sql into v_payload;
  exception
    when insufficient_privilege then
      return jsonb_build_object('ok', false, 'error_code', 'EXECUTE_REVOKED');
  end;
  return v_payload;
end
$$;
grant execute on function pg_temp.capture_json_denial(text) to authenticated;

-- The deployed UI invokes the resolver through SECURITY DEFINER RPCs. This
-- transaction-only grant isolates the resolver's five-role result from that
-- separate RPC ACL contract, and is undone by the final rollback.
grant execute on function public.vmp_business_role(uuid) to authenticated;
grant execute on function public.vmp_business_role_unresolved_reason(uuid) to authenticated;

select set_config('request.jwt.claims',
  json_build_object('role', 'service_role')::text, true);
with payload as (
  select public.rpc_item_permission_preflight() j
), codes as (
  select e ->> 'code' code, count(*) n
  from payload
  cross join lateral jsonb_array_elements(j -> 'blocking_errors') e
  group by 1
), summary as (
  select sum(n)::integer total,
         md5(string_agg(code || '=' || n, E'\n' order by code)) digest
  from codes
), warning_codes as (
  select coalesce(e ->> 'code', '<NULL>') code, count(*) n
  from payload
  cross join lateral jsonb_array_elements(j -> 'warnings') e
  group by 1
), warning_summary as (
  select coalesce(sum(n), 0)::integer total,
         coalesce(md5(string_agg(code || '=' || n, E'\n' order by code)),
           md5('')) digest
  from warning_codes
)
select pg_temp.assert_true(
  summary.total = 16
  and summary.digest = '51655dff70de3ba821367c8f3784d078'
  and warning_summary.total = 8
  and warning_summary.digest = '1dfde6e08513295b7e91472e406e2c6b',
  'ITEM_PERMISSION_BLOCKER_LOCAL_CONTRACT'
)
from payload cross join summary cross join warning_summary;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (:'department_uid'::uuid, 'authenticated', 'authenticated', 'department-fixture@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'viewer_uid'::uuid, 'authenticated', 'authenticated', 'viewer-fixture@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'inactive_uid'::uuid, 'authenticated', 'authenticated', 'inactive-fixture@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'admin_uid'::uuid, 'authenticated', 'authenticated', 'admin-fixture@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'qa_manager_uid'::uuid, 'authenticated', 'authenticated', 'qa-manager-fixture@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'qa_staff_uid'::uuid, 'authenticated', 'authenticated', 'qa-staff-fixture@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'workshop_manager_uid'::uuid, 'authenticated', 'authenticated', 'workshop-manager-fixture@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'workshop_staff_uid'::uuid, 'authenticated', 'authenticated', 'workshop-staff-fixture@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'rls_profile_uid'::uuid, 'authenticated', 'authenticated', 'rls-profile-fixture@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'rls_inactive_profile_uid'::uuid, 'authenticated', 'authenticated', 'rls-inactive-profile-fixture@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.departments (id, name, short_name)
values ('QA', 'Quality Assurance fixture', 'QA'),
       ('WS', 'Workshop fixture', 'WS');

insert into public.profiles (id, full_name, email, role, department, is_active)
values
  (:'department_uid'::uuid, 'Department fixture', 'department-fixture@example.test', 'department_user', 'QA', true),
  (:'viewer_uid'::uuid, 'Viewer fixture', 'viewer-fixture@example.test', 'viewer', 'QA', true),
  (:'inactive_uid'::uuid, 'Inactive fixture', 'inactive-fixture@example.test', 'qa_manager', 'QA', false),
  (:'admin_uid'::uuid, 'Admin fixture', 'admin-fixture@example.test', 'admin', 'QA', true),
  (:'qa_manager_uid'::uuid, 'QA manager fixture', 'qa-manager-fixture@example.test', 'qa_manager', 'QA', true),
  (:'qa_staff_uid'::uuid, 'QA staff fixture', 'qa-staff-fixture@example.test', 'department_user', 'QA', true),
  (:'workshop_manager_uid'::uuid, 'Workshop manager fixture', 'workshop-manager-fixture@example.test', 'department_user', 'WS', true),
  (:'workshop_staff_uid'::uuid, 'Workshop staff fixture', 'workshop-staff-fixture@example.test', 'department_user', 'WS', true);

-- Transaction-only grants make the four reviewed policies observable without
-- changing the deployed direct-profile-DML prohibition.  Their RED forms
-- fail on the old auth_user_role() dependency after the 64-entry ACL revoke.
insert into public.departments (id, name, short_name)
values ('FIVE_ROLE_RLS_DELETE', 'Five-role RLS delete fixture', 'FRD');
insert into public.system_config (key, value, description, is_sensitive)
values
  ('five_role_rls_public', '"public"'::jsonb, 'Five-role RLS public fixture', false),
  ('five_role_rls_sensitive', '"sensitive"'::jsonb, 'Five-role RLS sensitive fixture', true);
grant delete on public.departments to authenticated;
grant insert on public.profiles to authenticated;
grant select, update on public.system_config to authenticated;

update public.vmp_performers
set department = case
      when user_id in (:'workshop_manager_uid'::uuid, :'workshop_staff_uid'::uuid)
        then 'WS'
      else 'QA'
    end,
    access_class = case user_id
      when :'inactive_uid'::uuid then 'qa_manager'
      when :'qa_manager_uid'::uuid then 'qa_manager'
      when :'qa_staff_uid'::uuid then 'qa_progress_editor'
      when :'workshop_manager_uid'::uuid then 'equipment_manager'
      when :'workshop_staff_uid'::uuid then 'workshop_staff'
    end
where user_id in (
  :'inactive_uid'::uuid, :'qa_manager_uid'::uuid, :'qa_staff_uid'::uuid,
  :'workshop_manager_uid'::uuid, :'workshop_staff_uid'::uuid
);

-- A regression in the browser ACL left these policies referencing the
-- unexposed auth_user_role() helper.  Exercise policy behavior, rather than
-- policy text, under active Admin, inactive, and active non-Admin personas.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', :'admin_uid', 'role', 'authenticated')::text, true);
select pg_temp.assert_true(
  (select count(*) = 2 from public.system_config
   where key in ('five_role_rls_public', 'five_role_rls_sensitive')),
  'ACTIVE_ADMIN_CONFIG_SELECT_RLS'
);
with changed as (
  update public.system_config
  set description = description
  where key = 'five_role_rls_sensitive'
  returning key
)
select pg_temp.assert_true((select count(*) = 1 from changed),
  'ACTIVE_ADMIN_CONFIG_MODIFY_RLS');
delete from public.departments where id = 'FIVE_ROLE_RLS_DELETE';
select pg_temp.assert_true(
  not exists (select 1 from public.departments where id = 'FIVE_ROLE_RLS_DELETE'),
  'ACTIVE_ADMIN_DEPARTMENT_DELETE_RLS'
);
insert into public.profiles (id, full_name, email, role, department, is_active)
values (:'rls_profile_uid'::uuid, 'RLS profile fixture',
  'rls-profile-fixture@example.test', 'department_user', 'QA', true);
select pg_temp.assert_true(
  exists (select 1 from public.profiles where id = :'rls_profile_uid'::uuid),
  'ACTIVE_ADMIN_PROFILE_INSERT_RLS'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', :'inactive_uid', 'role', 'authenticated')::text, true);
select pg_temp.assert_true(
  (select count(*) = 0 from public.system_config
   where key in ('five_role_rls_public', 'five_role_rls_sensitive')),
  'INACTIVE_CONFIG_SELECT_FAILS_CLOSED'
);
with changed as (
  update public.system_config
  set description = description
  where key = 'five_role_rls_public'
  returning key
)
select pg_temp.assert_true((select count(*) = 0 from changed),
  'INACTIVE_CONFIG_MODIFY_FAILS_CLOSED'
);
select pg_temp.assert_denied_scalar(
  'insert into public.profiles (id, full_name, email, role, department, is_active) values (''cccccccc-cccc-4ccc-8ccc-cccccccccccc'', ''Inactive RLS profile fixture'', ''rls-inactive-profile-fixture@example.test'', ''department_user'', ''QA'', true)',
  'INACTIVE_PROFILE_INSERT_FAILS_CLOSED'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', :'qa_staff_uid', 'role', 'authenticated')::text, true);
select pg_temp.assert_true(
  (select count(*) = 1 from public.system_config
   where key in ('five_role_rls_public', 'five_role_rls_sensitive'))
  and exists (select 1 from public.system_config where key = 'five_role_rls_public')
  and not exists (select 1 from public.system_config where key = 'five_role_rls_sensitive'),
  'NON_ADMIN_CONFIG_SELECTS_ONLY_NON_SENSITIVE'
);

reset role;
revoke delete on public.departments from authenticated;
revoke insert on public.profiles from authenticated;
revoke select, update on public.system_config from authenticated;

set local session_replication_role = replica;
insert into public.vmp_objects (code, name)
values ('FIVE-ROLE-OBJECT-FIXTURE', 'Five-role object fixture');
insert into public.vmp_plan_items (id, object_code, validation_code, criticality_score)
values ('FIVE-ROLE-PLAN-FIXTURE', 'FIVE-ROLE-OBJECT-FIXTURE', 'FIVE-ROLE-VALIDATION-FIXTURE', 5);
set local session_replication_role = origin;

insert into public.audit_logs (
  id, action, table_name, record_id, old_data, new_data, change_reason, source, changed_fields
)
values
  (:'profile_audit_id'::uuid, 'UPDATE', 'profiles', :'department_uid',
    '{"role":"department_user","private":"old"}'::jsonb,
    '{"role":"admin","private":"new"}'::jsonb,
    'fixture profile audit', 'fixture', array['role']),
  (:'catalog_audit_id'::uuid, 'UPDATE', 'vmp_objects', 'FIVE-ROLE-OBJECT-FIXTURE',
    '{"private":"old"}'::jsonb, '{"private":"new"}'::jsonb,
    'fixture catalog audit', 'fixture', array['name']);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'department_uid', 'role', 'authenticated')::text, true);

do $$
declare
  v_rejected boolean;
  v_statement text;
begin
  foreach v_statement in array array[
    'update public.profiles set role = ''admin'' where id = auth.uid()',
    'update public.profiles set department = ''WS'' where id = auth.uid()',
    'update public.profiles set is_active = false where id = auth.uid()',
    'update public.profiles set pham_vi = ''all'' where id = auth.uid()',
    'update public.profiles set full_name = ''Changed'', role = ''admin'' where id = auth.uid()'
  ] loop
    v_rejected := false;
    begin
      execute v_statement;
      v_rejected := not found;
    exception
      when others then v_rejected := true;
    end;
    perform pg_temp.assert_true(v_rejected, 'PROFILE_SELF_ESCALATION_BLOCKED');
  end loop;
end
$$;

select pg_temp.assert_true(
  (select (role, department, is_active, pham_vi, full_name)
       is not distinct from ('department_user'::user_role, 'QA'::text,
         true, null::text, 'Department fixture'::text)
   from public.profiles where id = auth.uid()),
  'PROFILE_SELF_ESCALATION_BLOCKED'
);

-- Simulate a future column-grant regression: the defense-in-depth trigger
-- must still reject an authority-field update from the browser role.
reset role;
grant update (role, department, is_active, pham_vi)
  on public.profiles to authenticated;
create policy five_role_test_profile_update on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());
set local role authenticated;
do $$
declare
  v_rejected boolean := false;
begin
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
  exception
    when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.assert_true(v_rejected, 'PROFILE_AUTHORITY_TRIGGER_DEFENSE');
end
$$;
select pg_temp.assert_true(
  (select role = 'department_user'::user_role
   from public.profiles where id = auth.uid()),
  'PROFILE_AUTHORITY_TRIGGER_DEFENSE'
);
reset role;
drop policy five_role_test_profile_update on public.profiles;
revoke update (role, department, is_active, pham_vi)
  on public.profiles from authenticated;
set local role authenticated;

select pg_temp.assert_true(
  (public.rpc_catalog_history('{}', 10, 0)->>'error_code') = 'FORBIDDEN',
  'DEPARTMENT_CATALOG_HISTORY_FORBIDDEN'
);
select pg_temp.assert_true(
  (public.rpc_catalog_history_detail(:'profile_audit_id'::uuid)->>'error_code') = 'FORBIDDEN',
  'DEPARTMENT_CATALOG_HISTORY_DETAIL_FORBIDDEN'
);
select pg_temp.assert_true(
  (public.rpc_catalog_history('{"from":"not-a-timestamp"}', 10, 0)
    ->>'error_code') = 'FORBIDDEN',
  'CATALOG_ROLE_CHECK_PRECEDES_FILTER_PARSING'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims',
  json_build_object('role', 'service_role')::text, true);
select pg_temp.assert_true(
  coalesce(public.rpc_active_rules()->>'error_code', '')
    not in ('ACCOUNT_DISABLED', 'ROLE_UNRESOLVED'),
  'SERVICE_ROLE_RPC_COMPATIBILITY'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'viewer_uid', 'role', 'authenticated')::text, true);

select pg_temp.assert_true(
  public.vmp_business_role(:'viewer_uid'::uuid) is null,
  'LEGACY_VIEWER_DISABLED'
);
select pg_temp.assert_true(
  public.vmp_business_role_unresolved_reason(:'viewer_uid'::uuid) = 'legacy_role_disabled',
  'LEGACY_VIEWER_REASON'
);
select pg_temp.assert_true(
  (select count(*) = 0
   from jsonb_object_keys(coalesce(
     public.rpc_my_ui_access()->'screens', '{}'::jsonb))),
  'LEGACY_VIEWER_ZERO_UI_SCREENS'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'inactive_uid', 'role', 'authenticated')::text, true);

select pg_temp.assert_true(
  (select count(*) = 0 from public.vmp_plan_items where id = 'FIVE-ROLE-PLAN-FIXTURE'),
  'INACTIVE_USER_NO_VISIBLE_ITEMS'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.profiles where id = auth.uid()),
  'INACTIVE_USER_CAN_READ_DISABLED_SELF'
);
select pg_temp.assert_true(
  coalesce(public.rpc_get_vmp_dashboard()->>'ok', 'true') = 'false',
  'INACTIVE_USER_DASHBOARD_BLOCKED'
);
select pg_temp.assert_true(
  coalesce(public.rpc_catalog_history('{}', 10, 0)->>'ok', 'true') = 'false',
  'INACTIVE_USER_CATALOG_BLOCKED'
);
select pg_temp.assert_true(
  not public.vmp_current_session_is_active()
  and not public.is_admin()
  and not public.is_admin_or_qa()
  and not public.vmp_can_view_my_item('FIVE-ROLE-VALIDATION-FIXTURE'),
  'INACTIVE_BOOLEAN_HELPERS_FAIL_CLOSED'
);
select pg_temp.assert_true(
  (select coalesce(payload ->> 'error_code', '')
            in ('ACCOUNT_DISABLED', 'ROLE_UNRESOLVED')
          and not (payload::text ~ 'old_data|new_data')
   from (select public.rpc_get_audit_logs(
     10, 0, null, null, null, :'department_uid', null, null
   ) payload) denied),
  'INACTIVE_RAW_AUDIT_DENIED_WITHOUT_SNAPSHOTS'
);

reset role;
create temporary table five_role_assignment_probe (
  assignments_before integer not null,
  audits_before integer not null,
  response jsonb
) on commit drop;
insert into five_role_assignment_probe (assignments_before, audits_before)
select
  (select count(*) from public.vmp_assignment_matrix
   where staff_name = 'FIVE ROLE INACTIVE PROBE'
     and validation_type = 'DQ' and line = '*'),
  (select count(*) from public.audit_logs
   where table_name = 'vmp_assignment_matrix'
     and record_id = 'FIVE ROLE INACTIVE PROBE'
     and source = 'dashboard_rpc');
grant update on five_role_assignment_probe to authenticated;
set local role authenticated;
update five_role_assignment_probe
set response = public.rpc_set_assignment(
  'FIVE ROLE INACTIVE PROBE', 'QA', 'DQ', '*', 'thuc_hien'
);
reset role;
do $$
declare
  v_probe five_role_assignment_probe%rowtype;
  v_assignments_after integer;
  v_audits_after integer;
  v_denied boolean;
begin
  select * into strict v_probe from five_role_assignment_probe;
  select count(*) into v_assignments_after
  from public.vmp_assignment_matrix
  where staff_name = 'FIVE ROLE INACTIVE PROBE'
    and validation_type = 'DQ' and line = '*';
  select count(*) into v_audits_after
  from public.audit_logs
  where table_name = 'vmp_assignment_matrix'
    and record_id = 'FIVE ROLE INACTIVE PROBE'
    and source = 'dashboard_rpc';
  v_denied := coalesce(v_probe.response ->> 'error_code', '')
    in ('ACCOUNT_DISABLED', 'ROLE_UNRESOLVED');

  if not v_denied
     or v_assignments_after <> v_probe.assignments_before
     or v_audits_after <> v_probe.audits_before then
    raise exception using errcode = 'check_violation', message = format(
      'INACTIVE_RPC_SET_ASSIGNMENT_CONTAINMENT denied=%s assignment_delta=%s audit_delta=%s',
      v_denied,
      v_assignments_after - v_probe.assignments_before,
      v_audits_after - v_probe.audits_before
    );
  end if;
end
$$;

create temporary table five_role_omitted_rpc_probe (
  missing_from_sheet_before boolean,
  plan_audits_before integer not null,
  alert_rows_before integer not null,
  alert_audits_before integer not null,
  sheet_response jsonb,
  alert_response jsonb
) on commit drop;
insert into five_role_omitted_rpc_probe (
  missing_from_sheet_before, plan_audits_before,
  alert_rows_before, alert_audits_before
)
select
  (select missing_from_sheet from public.vmp_plan_items
   where validation_code = 'FIVE-ROLE-VALIDATION-FIXTURE'),
  (select count(*) from public.audit_logs
   where table_name = 'vmp_plan_items'
     and record_id = 'FIVE-ROLE-PLAN-FIXTURE'),
  (select count(*) from public.vmp_alert_recipients
   where lower(email) = 'five-role-inactive-probe@example.test'),
  (select count(*) from public.audit_logs
   where table_name = 'vmp_alert_recipients');
grant update on five_role_omitted_rpc_probe to authenticated;

set local role authenticated;
update five_role_omitted_rpc_probe
set sheet_response = pg_temp.capture_json_denial(
      $sql$select public.rpc_apply_sheet_sync(
        'update', 'FIVE-ROLE-VALIDATION-FIXTURE',
        '{"missing_from_sheet":true}'::jsonb)$sql$),
    alert_response = pg_temp.capture_json_denial(
      $sql$select public.rpc_upsert_alert_recipient(
        null::uuid, '{"email":"five-role-inactive-probe@example.test"}'::jsonb)$sql$);

reset role;
do $$
declare
  v_probe five_role_omitted_rpc_probe%rowtype;
  v_missing_from_sheet_after boolean;
  v_plan_audits_after integer;
  v_alert_rows_after integer;
  v_alert_audits_after integer;
begin
  select * into strict v_probe from five_role_omitted_rpc_probe;
  select missing_from_sheet into v_missing_from_sheet_after
  from public.vmp_plan_items
  where validation_code = 'FIVE-ROLE-VALIDATION-FIXTURE';
  select count(*) into v_plan_audits_after
  from public.audit_logs
  where table_name = 'vmp_plan_items'
    and record_id = 'FIVE-ROLE-PLAN-FIXTURE';
  select count(*) into v_alert_rows_after
  from public.vmp_alert_recipients
  where lower(email) = 'five-role-inactive-probe@example.test';
  select count(*) into v_alert_audits_after
  from public.audit_logs
  where table_name = 'vmp_alert_recipients';

  if coalesce(v_probe.sheet_response ->> 'error_code', '')
       not in ('ACCOUNT_DISABLED', 'ROLE_UNRESOLVED', 'EXECUTE_REVOKED')
     or coalesce(v_probe.alert_response ->> 'error_code', '')
       not in ('ACCOUNT_DISABLED', 'ROLE_UNRESOLVED', 'EXECUTE_REVOKED')
     or v_missing_from_sheet_after is distinct from v_probe.missing_from_sheet_before
     or v_plan_audits_after <> v_probe.plan_audits_before
     or v_alert_rows_after <> v_probe.alert_rows_before
     or v_alert_audits_after <> v_probe.alert_audits_before then
    raise exception using errcode = 'check_violation', message = format(
      'INACTIVE_OMITTED_RPC_CONTAINMENT sheet_code=%s alert_code=%s missing_from_sheet=%s->%s plan_audit_delta=%s alert_row_delta=%s alert_audit_delta=%s',
      coalesce(v_probe.sheet_response ->> 'error_code', '<none>'),
      coalesce(v_probe.alert_response ->> 'error_code', '<none>'),
      v_probe.missing_from_sheet_before, v_missing_from_sheet_after,
      v_plan_audits_after - v_probe.plan_audits_before,
      v_alert_rows_after - v_probe.alert_rows_before,
      v_alert_audits_after - v_probe.alert_audits_before
    );
  end if;
end
$$;
set local role authenticated;

select pg_temp.assert_denied_json('select public.rpc_active_rules()', 'INACTIVE_RPC_ACTIVE_RULES');
select pg_temp.assert_denied_scalar('select public.item_permissions_mode()', 'INACTIVE_ITEM_PERMISSIONS_MODE');
select pg_temp.assert_denied_scalar('select public.muc_quyen(''view'', ''admin'')', 'OUT_OF_INVENTORY_PURE_HELPER_REVOKED');
select pg_temp.assert_denied_scalar('select public.screen_access_mode()', 'OUT_OF_INVENTORY_MODE_HELPER_REVOKED');
select pg_temp.assert_denied_json('select public.rpc_apply_catalog_change(null::uuid, null::text, null::integer)', 'INACTIVE_RPC_APPLY_CATALOG_CHANGE');
select pg_temp.assert_denied_json('select public.rpc_business_roles()', 'INACTIVE_RPC_BUSINESS_ROLES');
select pg_temp.assert_denied_json('select public.rpc_check_data_quality(2026)', 'INACTIVE_RPC_CHECK_DATA_QUALITY');
select pg_temp.assert_denied_json('select public.rpc_commit_catalog_import(null::uuid, null::text)', 'INACTIVE_RPC_COMMIT_CATALOG_IMPORT');
select pg_temp.assert_denied_json('select public.rpc_create_plan_item(''x'', ''x'', 2026, 1, ''{}''::jsonb)', 'INACTIVE_RPC_CREATE_PLAN_ITEM');
select pg_temp.assert_denied_json('select public.rpc_dashboard_kpi(2026)', 'INACTIVE_RPC_DASHBOARD_KPI');
select pg_temp.assert_denied_json('select public.rpc_delete_performer(null::uuid)', 'INACTIVE_RPC_DELETE_PERFORMER');
select pg_temp.assert_denied_json('select public.rpc_delete_plan_item(''x'', ''x'')', 'INACTIVE_RPC_DELETE_PLAN_ITEM');
select pg_temp.assert_denied_json('select public.rpc_delete_source_row(''x'', 1)', 'INACTIVE_RPC_DELETE_SOURCE_ROW');
select pg_temp.assert_denied_json('select public.rpc_due_alerts(2026, 7)', 'INACTIVE_RPC_DUE_ALERTS');
select pg_temp.assert_denied_json('select public.rpc_generate_timeline(2026, false)', 'INACTIVE_RPC_GENERATE_TIMELINE');
select pg_temp.assert_denied_json('select public.rpc_get_audit_logs()', 'INACTIVE_RPC_GET_AUDIT_LOGS');
select pg_temp.assert_denied_json('select public.rpc_get_missing_items(2026)', 'INACTIVE_RPC_GET_MISSING_ITEMS');
select pg_temp.assert_denied_json('select public.rpc_get_vmp_dashboard(2026, false, false)', 'INACTIVE_RPC_GET_VMP_DASHBOARD');
select pg_temp.assert_denied_json('select public.rpc_get_vmp_watermark(2026)', 'INACTIVE_RPC_GET_VMP_WATERMARK');
select pg_temp.assert_denied_json('select public.rpc_import_item_permission_staff(''[]''::jsonb, null::text)', 'INACTIVE_RPC_IMPORT_ITEM_PERMISSION_STAFF');
select pg_temp.assert_denied_json('select public.rpc_item_assignments(null::text, null::uuid)', 'INACTIVE_RPC_ITEM_ASSIGNMENTS');
select pg_temp.assert_denied_json('select public.rpc_item_permission_account_candidates(null::text)', 'INACTIVE_RPC_ITEM_PERMISSION_ACCOUNT_CANDIDATES');
select pg_temp.assert_denied_json('select public.rpc_item_permission_directory(null::text)', 'INACTIVE_RPC_ITEM_PERMISSION_DIRECTORY');
select pg_temp.assert_denied_json('select public.rpc_item_permission_preflight()', 'INACTIVE_RPC_ITEM_PERMISSION_PREFLIGHT');
select pg_temp.assert_denied_json('select public.rpc_item_permission_scope_catalog()', 'INACTIVE_RPC_ITEM_PERMISSION_SCOPE_CATALOG');
select pg_temp.assert_denied_json('select public.rpc_item_progress_history(null::text, 10, 0)', 'INACTIVE_RPC_ITEM_PROGRESS_HISTORY');
select pg_temp.assert_denied_json('select public.rpc_link_item_permission_account(null::uuid, null::uuid, null::text, null::integer)', 'INACTIVE_RPC_LINK_ITEM_PERMISSION_ACCOUNT');
select pg_temp.assert_denied_json('select public.rpc_list_catalog_changes(null, null, 10, 0)', 'INACTIVE_RPC_LIST_CATALOG_CHANGES');
select pg_temp.assert_denied_json('select public.rpc_list_catalog_dataset(''objects'', null, ''{}''::jsonb, 10, 0)', 'INACTIVE_RPC_LIST_CATALOG_DATASET');
select pg_temp.assert_denied_json('select public.rpc_list_source_tabs()', 'INACTIVE_RPC_LIST_SOURCE_TABS');
select pg_temp.assert_denied_json('select public.rpc_luat_xem()', 'INACTIVE_RPC_LUAT_XEM');
select pg_temp.assert_denied_json('select public.rpc_my_ui_access()', 'INACTIVE_RPC_MY_UI_ACCESS');
select pg_temp.assert_denied_json('select public.rpc_nguoi_va_quyen()', 'INACTIVE_RPC_NGUOI_VA_QUYEN');
select pg_temp.assert_denied_json('select public.rpc_preview_catalog_change(null::uuid)', 'INACTIVE_RPC_PREVIEW_CATALOG_CHANGE');
select pg_temp.assert_denied_json('select public.rpc_preview_item_rights(null::uuid, null::text)', 'INACTIVE_RPC_PREVIEW_ITEM_RIGHTS');
select pg_temp.assert_denied_json('select public.rpc_recalc_criticality(true)', 'INACTIVE_RPC_RECALC_CRITICALITY');
select pg_temp.assert_denied_json('select public.rpc_refresh_computed_status()', 'INACTIVE_RPC_REFRESH_STATUS');
select pg_temp.assert_denied_json('select public.rpc_resolve_missing(''x'', ''keep'', ''x'')', 'INACTIVE_RPC_RESOLVE_MISSING');
select pg_temp.assert_denied_json('select public.rpc_save_alert_recipient(null::uuid, ''{}''::jsonb, null, null)', 'INACTIVE_RPC_SAVE_ALERT_RECIPIENT');
select pg_temp.assert_denied_json('select public.rpc_save_catalog_object(''object'', ''x'', ''{}''::jsonb, null, null)', 'INACTIVE_RPC_SAVE_CATALOG_OBJECT');
select pg_temp.assert_denied_json('select public.rpc_save_product_gmp(''x'', ''{}''::jsonb, null, null)', 'INACTIVE_RPC_SAVE_PRODUCT_GMP');
select pg_temp.assert_denied_json('select public.rpc_set_business_role(null::uuid, null::text, null::text, null::text)', 'INACTIVE_RPC_SET_BUSINESS_ROLE');
select pg_temp.assert_denied_json('select public.rpc_set_catalog_import_row_reason(null::uuid, 1, ''x'')', 'INACTIVE_RPC_SET_IMPORT_REASON');
select pg_temp.assert_denied_json('select public.rpc_set_email_cho_phep(null::text, false, null::text)', 'INACTIVE_RPC_SET_EMAIL_CHO_PHEP');
select pg_temp.assert_denied_json('select public.rpc_set_item_assignment(null::uuid, null::text, null::text, null::text, null::text, null::text, null::uuid)', 'INACTIVE_RPC_SET_ITEM_ASSIGNMENT');
select pg_temp.assert_denied_json('select public.rpc_set_item_performer(''x'', ''x'')', 'INACTIVE_RPC_SET_ITEM_PERFORMER');
select pg_temp.assert_denied_json('select public.rpc_set_item_performer_by_id(null::text, null::uuid, null::text)', 'INACTIVE_RPC_SET_ITEM_PERFORMER_BY_ID');
select pg_temp.assert_denied_json('select public.rpc_set_item_permissions_mode(null::text, null::text)', 'INACTIVE_RPC_SET_ITEM_PERMISSIONS_MODE');
select pg_temp.assert_denied_json('select public.rpc_set_item_state(''x'', ''x'', ''x'')', 'INACTIVE_RPC_SET_ITEM_STATE');
select pg_temp.assert_denied_json('select public.rpc_set_user_active(null::uuid, false, null::text)', 'INACTIVE_RPC_SET_USER_ACTIVE');
select pg_temp.assert_denied_json('select public.rpc_set_user_role(null::uuid, null::text, null::text, null::text, null::text)', 'INACTIVE_RPC_SET_USER_ROLE');
select pg_temp.assert_denied_json('select public.rpc_source_warnings(2026)', 'INACTIVE_RPC_SOURCE_WARNINGS');
select pg_temp.assert_denied_json('select public.rpc_stage_catalog_import(''objects'', ''x'', ''x'', null, ''[]''::jsonb)', 'INACTIVE_RPC_STAGE_IMPORT');
select pg_temp.assert_denied_json('select public.rpc_trang_thai_he_thong()', 'INACTIVE_RPC_SYSTEM_STATUS');
select pg_temp.assert_denied_json('select public.rpc_update_progress(''x'', ''{}''::jsonb, null, null, null)', 'INACTIVE_RPC_UPDATE_PROGRESS');
select pg_temp.assert_denied_json('select public.rpc_upsert_item_permission_staff(null::uuid, ''{}''::jsonb, null::text, null::integer)', 'INACTIVE_RPC_UPSERT_ITEM_PERMISSION_STAFF');
select pg_temp.assert_denied_json('select public.rpc_upsert_object(''x'', ''x'', null, null, null, null, null, null)', 'INACTIVE_RPC_UPSERT_OBJECT');
select pg_temp.assert_denied_json('select public.rpc_upsert_performer(null::uuid, ''{}''::jsonb)', 'INACTIVE_RPC_UPSERT_PERFORMER');
select pg_temp.assert_denied_json('select public.rpc_upsert_source_row(''x'', 1, ''{}''::jsonb)', 'INACTIVE_RPC_UPSERT_SOURCE_ROW');
select pg_temp.assert_true(
  (select count(*) = 0 from public.vmp_my_item_rights('FIVE-ROLE-VALIDATION-FIXTURE')),
  'INACTIVE_VMP_MY_ITEM_RIGHTS'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', :'workshop_staff_uid', 'role', 'authenticated')::text,
  true);
select pg_temp.assert_true(
  (select coalesce(payload ->> 'error_code', '') = 'FORBIDDEN'
          and not (payload::text ~ 'old_data|new_data')
   from (select public.rpc_get_audit_logs(
     10, 0, null, null, null, :'department_uid', null, null
   ) payload) denied),
  'WORKSHOP_STAFF_RAW_AUDIT_FORBIDDEN'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_uid', 'role', 'authenticated')::text, true);

select pg_temp.assert_true(
  not (public.rpc_catalog_history('{}', 10, 0)::text ~ 'old_data|new_data'),
  'ADMIN_CATALOG_HISTORY_NO_SNAPSHOTS'
);
select pg_temp.assert_true(
  (public.rpc_catalog_history('{}', 10, 0)->>'total')::integer = 1,
  'ADMIN_CATALOG_HISTORY_ALLOWLIST_ONLY'
);
select pg_temp.assert_true(
  (public.rpc_catalog_history_detail(:'profile_audit_id'::uuid)->>'error_code') = 'NOT_FOUND',
  'ADMIN_PROFILE_AUDIT_DETAIL_NOT_FOUND'
);
select pg_temp.assert_true(
  (public.rpc_catalog_history_detail(:'catalog_audit_id'::uuid)
    ->'history'->'old_data'->>'private') = 'old',
  'ADMIN_CATALOG_AUDIT_DETAIL_ALLOWED'
);
select pg_temp.assert_true(
  (public.rpc_get_audit_logs(
     10, 0, null, null, null, :'department_uid', null, null
   ) -> 'logs' -> 0 -> 'old_data' ->> 'private') = 'old'
  and
  (public.rpc_get_audit_logs(
     10, 0, null, null, null, :'department_uid', null, null
   ) -> 'logs' -> 0 -> 'new_data' ->> 'private') = 'new',
  'ADMIN_RAW_AUDIT_CONTRACT_PRESERVED'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'qa_manager_uid', 'role', 'authenticated')::text, true);

select pg_temp.assert_true(
  not (public.rpc_catalog_history('{}', 10, 0)::text ~ 'old_data|new_data'),
  'QA_MANAGER_CATALOG_HISTORY_NO_SNAPSHOTS'
);
select pg_temp.assert_true(
  (public.rpc_catalog_history('{}', 10, 0)->>'total')::integer = 1,
  'QA_MANAGER_CATALOG_HISTORY_ALLOWLIST_ONLY'
);
select pg_temp.assert_true(
  (public.rpc_catalog_history_detail(:'profile_audit_id'::uuid)->>'error_code') = 'NOT_FOUND',
  'QA_MANAGER_PROFILE_AUDIT_DETAIL_NOT_FOUND'
);
select pg_temp.assert_true(
  (public.rpc_get_audit_logs(
     10, 0, null, null, null, :'department_uid', null, null
   ) -> 'logs' -> 0 -> 'old_data' ->> 'private') = 'old'
  and
  (public.rpc_get_audit_logs(
     10, 0, null, null, null, :'department_uid', null, null
   ) -> 'logs' -> 0 -> 'new_data' ->> 'private') = 'new',
  'QA_MANAGER_RAW_AUDIT_CONTRACT_PRESERVED'
);

reset role;
select pg_temp.assert_true(
  public.vmp_business_role(:'admin_uid'::uuid) = 'admin'
  and public.vmp_business_role(:'qa_manager_uid'::uuid) = 'qa_manager'
  and public.vmp_business_role(:'qa_staff_uid'::uuid) = 'qa_staff'
  and public.vmp_business_role(:'workshop_manager_uid'::uuid) = 'workshop_manager'
  and public.vmp_business_role(:'workshop_staff_uid'::uuid) = 'workshop_staff',
  'EXACT_FIVE_ROLE_RESOLUTION'
);

select pg_temp.assert_true(
  (select count(*) = 7 from public.profiles
   where id = any(array[
     '71000000-0000-4000-8000-000000000001'::uuid,
     '71000000-0000-4000-8000-000000000002'::uuid,
     '71000000-0000-4000-8000-000000000003'::uuid,
     '71000000-0000-4000-8000-000000000004'::uuid,
     '71000000-0000-4000-8000-000000000005'::uuid,
     '71000000-0000-4000-8000-000000000006'::uuid,
     '71000000-0000-4000-8000-000000000007'::uuid
   ]) and not coalesce(is_active, true)),
  'EXACT_SEVEN_TARGETS_DISABLED'
);

select pg_temp.assert_true(
  (select count(*) = 85 from public.vmp_screen_permissions),
  'FIVE_ROLE_SCREEN_MATRIX_EXACT'
);
select pg_temp.assert_true(
  (select count(*) = 5
   from (select business_role from public.vmp_screen_permissions
         group by business_role having count(*) = 17) roles),
  'FIVE_ROLE_SCREEN_MATRIX_DISTRIBUTION'
);
select pg_temp.assert_true(
  (select md5(string_agg(concat_ws('|', business_role, screen_id,
     can_view, data_scope, actions::text), E'\n'
     order by business_role, screen_id)) = 'e6fdb0cc192a2ba344df02db4a5112c6'
   from public.vmp_screen_permissions),
  'FIVE_ROLE_SCREEN_MATRIX_RETAINED_IMPLICIT_ARRAY_DIGEST'
);
select pg_temp.assert_true(
  (select md5(string_agg(concat_ws('|', business_role, screen_id,
     can_view::text, data_scope, actions::text), E'\n'
     order by business_role, screen_id)) = '9be55626a34edb5123501d2b856d3480'
   from public.vmp_screen_permissions),
  'FIVE_ROLE_SCREEN_MATRIX_RETAINED_EXPLICIT_ARRAY_DIGEST'
);
select pg_temp.assert_true(
  (select md5(string_agg(concat_ws('|', business_role, screen_id,
     can_view, data_scope, array_to_string(actions, ',')), E'\n'
     order by business_role, screen_id)) = '59feb29d5614356f97325d71ade3599e'
   from public.vmp_screen_permissions),
  'FIVE_ROLE_SCREEN_MATRIX_RETAINED_IMPLICIT_CSV_DIGEST'
);
select pg_temp.assert_true(
  (select md5(string_agg(concat_ws('|', business_role, screen_id,
     can_view::text, data_scope, array_to_string(actions, ',')), E'\n'
     order by business_role, screen_id)) = '3586cad04d5900656b2b7f41ecb47e73'
   from public.vmp_screen_permissions),
  'FIVE_ROLE_SCREEN_MATRIX_RETAINED_EXPLICIT_CSV_DIGEST'
);

-- Restore the deployed ACL before catalog assertions; the two direct resolver
-- grants above were transaction-only test adapters for persona resolution.
revoke execute on function public.vmp_business_role(uuid) from authenticated;
revoke execute on function public.vmp_business_role_unresolved_reason(uuid)
  from authenticated;

select pg_temp.assert_true(
  (select count(*) = 64
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('public', p.oid, 'EXECUTE')))
  and (select count(*) = 64
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('public', p.oid, 'EXECUTE'))
  ),
  'EXACT_BROWSER_FUNCTION_SURFACE'
);
with inventory as (
  select p.oid::regprocedure::text identity,
         pg_get_function_result(p.oid) result_type,
         l.lanname language, p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), '') settings,
         md5(pg_get_functiondef(p.oid)) definition_hash,
         r.rolname owner,
         coalesce(array_to_string(p.proacl, ','), '') acl,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_exec,
         has_function_privilege('anon', p.oid, 'EXECUTE') anon_exec,
         has_function_privilege('public', p.oid, 'EXECUTE') public_exec
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  join pg_roles r on r.oid = p.proowner
  where n.nspname = 'public'
    and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('public', p.oid, 'EXECUTE'))
)
select pg_temp.assert_true(
  (select count(*) = 64 from inventory)
  and (select md5(string_agg(concat_ws('|', identity, result_type, language,
    prosecdef, settings, definition_hash, owner, acl, auth_exec, anon_exec,
    public_exec), E'\n' order by identity)) = 'e5631441c030967069e172ca6a68ebe1'
       from inventory),
  'EXACT_BROWSER_FUNCTION_CONTRACT'
);
select pg_temp.assert_true(
  has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.is_admin_or_qa()', 'EXECUTE')
  and has_function_privilege('authenticated',
    'public.vmp_current_session_is_active()', 'EXECUTE')
  and has_function_privilege('authenticated',
    'public.vmp_can_view_my_item(text)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.rpc_apply_sheet_sync(text,text,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.rpc_upsert_alert_recipient(uuid,jsonb)', 'EXECUTE')
  and has_function_privilege('service_role',
    'public.rpc_apply_sheet_sync(text,text,jsonb)', 'EXECUTE')
  and has_function_privilege('service_role',
    'public.rpc_upsert_alert_recipient(uuid,jsonb)', 'EXECUTE'),
  'BROWSER_ALLOWLIST_AND_SERVICE_AUTOMATION'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.muc_quyen(text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.vmp_business_role(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.screen_access_mode()', 'EXECUTE'),
  'OUT_OF_INVENTORY_HELPERS_NOT_BROWSER_EXECUTABLE'
);
with inventory as (
  select p.oid::regprocedure::text identity,
         pg_get_function_result(p.oid) result_type,
         l.lanname language, p.prosecdef,
         coalesce(array_to_string(p.proconfig, ','), '') settings,
         md5(pg_get_functiondef(p.oid)) definition_hash,
         r.rolname owner,
         coalesce(array_to_string(p.proacl, ','), '') acl,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_exec,
         has_function_privilege('anon', p.oid, 'EXECUTE') anon_exec,
         has_function_privilege('public', p.oid, 'EXECUTE') public_exec,
         has_function_privilege('service_role', p.oid, 'EXECUTE') service_exec
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  join pg_roles r on r.oid = p.proowner
  where n.nspname = 'public'
    and has_function_privilege('service_role', p.oid, 'EXECUTE')
), contract as (
  select count(*) count,
         md5(string_agg(concat_ws('|', identity, result_type, language,
           prosecdef, settings, definition_hash, owner, acl, auth_exec,
           anon_exec, public_exec, service_exec), E'\n' order by identity)) digest
  from inventory
)
select pg_temp.assert_true(
  contract.count = 207
  and contract.digest = 'b60d876fedc438540890578da071a693'
  and has_function_privilege('service_role',
    'public.rpc_set_item_assignment(uuid,text,text,text,text,text,uuid)',
    'EXECUTE'),
  'EXACT_SERVICE_ROLE_FUNCTION_CONTRACT'
)
from contract;

select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
  and not has_any_column_privilege('authenticated', 'public.profiles', 'UPDATE')
  and not has_table_privilege('anon', 'public.profiles', 'UPDATE')
  and not has_any_column_privilege('anon', 'public.profiles', 'UPDATE')
  and not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join lateral aclexplode(c.relacl) x on true
    where n.nspname = 'public' and c.relname = 'profiles'
      and x.grantee = 0 and x.privilege_type = 'UPDATE'
  )
  and not exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    left join lateral aclexplode(a.attacl) x on true
    where n.nspname = 'public' and c.relname = 'profiles'
      and a.attnum > 0 and not a.attisdropped
      and x.grantee = 0 and x.privilege_type = 'UPDATE'
  ),
  'PROFILE_DIRECT_UPDATE_REVOKED'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.audit_logs', 'SELECT'),
  'RAW_AUDIT_SELECT_REVOKED'
);
select pg_temp.assert_true(
  (select count(*) = 53
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like '%\_\_five\_role\_impl\_20260824' escape '\')
  and to_regprocedure('public.item_permissions_mode__five_role_impl_20260824()') is null
  and not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join pg_proc wrapper
      on wrapper.pronamespace = p.pronamespace
     and wrapper.proname = left(p.proname,
       -length('__five_role_impl_20260824'))
     and wrapper.proargtypes = p.proargtypes
    where n.nspname = 'public'
      and p.proname like '%\_\_five\_role\_impl\_20260824' escape '\'
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('service_role', p.oid, 'EXECUTE')
        or wrapper.oid is null
        or wrapper.proowner <> p.proowner
        or exists (
          select 1 from pg_depend d
          where d.refclassid = 'pg_proc'::regclass and d.refobjid = p.oid
        )
        or exists (
          select 1
          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.grantee <> p.proowner and a.privilege_type = 'EXECUTE'
        ))
  ),
  'RENAMED_IMPLEMENTATIONS_OWNER_ONLY_AND_UNREFERENCED'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from (values
      ('public.rpc_lien_ket_tai_khoan(uuid,uuid)'::regprocedure),
      ('public.rpc_set_item_performer(text,text)'::regprocedure)
    ) service_boundary(function_oid)
    join pg_proc p on p.oid = service_boundary.function_oid
    where has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('service_role', p.oid, 'EXECUTE')
       or exists (
         select 1
         from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
         where x.grantee <> p.proowner and x.privilege_type = 'EXECUTE'
       )
  ),
  'SERVICE_ONLY_RPCS_OWNER_ONLY'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = any(array[
        'audit_logs', 'data_quality_issues', 'vmp_alert_recipients',
        'vmp_assignment_matrix', 'vmp_chat_loi_cho', 'vmp_email_cho_phep',
        'vmp_performers', 'vmp_plan_items', 'vmp_source_objects',
        'vmp_source_rows', 'vmp_staff_emails'
      ]::text[])
      and exists (
        select 1 from unnest(p.roles) effective_role(role_name)
        where effective_role.role_name = 'public'
           or pg_has_role('authenticated', effective_role.role_name, 'USAGE')
      )
      and ((p.cmd in ('SELECT','UPDATE','DELETE','ALL')
            and coalesce(p.qual, '') not like '%vmp_current_session_is_active%')
        or (p.cmd in ('INSERT','UPDATE','ALL')
            and coalesce(p.with_check, '') not like '%vmp_current_session_is_active%'))
  ),
  'EFFECTIVE_AUTHENTICATED_RLS_POLICIES_GUARDED'
);

rollback;

\set ON_ERROR_STOP on
\set department_uid '11111111-1111-4111-8111-111111111111'
\set viewer_uid '22222222-2222-4222-8222-222222222222'
\set inactive_uid '33333333-3333-4333-8333-333333333333'
\set admin_uid '44444444-4444-4444-8444-444444444444'
\set qa_manager_uid '55555555-5555-4555-8555-555555555555'
\set profile_audit_id '66666666-6666-4666-8666-666666666666'

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

-- The deployed UI invokes the resolver through SECURITY DEFINER RPCs. This
-- transaction-only grant isolates the resolver's five-role result from that
-- separate RPC ACL contract, and is undone by the final rollback.
grant execute on function public.vmp_business_role(uuid) to authenticated;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (:'department_uid'::uuid, 'authenticated', 'authenticated', 'department-fixture@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'viewer_uid'::uuid, 'authenticated', 'authenticated', 'viewer-fixture@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'inactive_uid'::uuid, 'authenticated', 'authenticated', 'inactive-fixture@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'admin_uid'::uuid, 'authenticated', 'authenticated', 'admin-fixture@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'qa_manager_uid'::uuid, 'authenticated', 'authenticated', 'qa-manager-fixture@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.departments (id, name, short_name)
values ('QA', 'Quality Assurance fixture', 'QA');

insert into public.profiles (id, full_name, email, role, department, is_active)
values
  (:'department_uid'::uuid, 'Department fixture', 'department-fixture@example.test', 'department_user', 'QA', true),
  (:'viewer_uid'::uuid, 'Viewer fixture', 'viewer-fixture@example.test', 'viewer', 'QA', true),
  (:'inactive_uid'::uuid, 'Inactive fixture', 'inactive-fixture@example.test', 'qa_manager', 'QA', false),
  (:'admin_uid'::uuid, 'Admin fixture', 'admin-fixture@example.test', 'admin', 'QA', true),
  (:'qa_manager_uid'::uuid, 'QA manager fixture', 'qa-manager-fixture@example.test', 'qa_manager', 'QA', true);

update public.vmp_performers
set department = 'QA', access_class = 'qa_manager'
where user_id in (:'inactive_uid'::uuid, :'qa_manager_uid'::uuid);

set local session_replication_role = replica;
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
  ('77777777-7777-4777-8777-777777777777'::uuid, 'UPDATE', 'vmp_objects', 'FIVE-ROLE-OBJECT-FIXTURE',
    '{"private":"old"}'::jsonb, '{"private":"new"}'::jsonb,
    'fixture catalog audit', 'fixture', array['name']);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'department_uid', 'role', 'authenticated')::text, true);

do $$
declare
  v_rejected boolean := false;
begin
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    v_rejected := not found;
  exception
    when others then v_rejected := true;
  end;

  perform pg_temp.assert_true(v_rejected, 'PROFILE_SELF_ESCALATION_BLOCKED');
end
$$;

select pg_temp.assert_true(
  (select role = 'department_user' from public.profiles where id = auth.uid()),
  'PROFILE_SELF_ESCALATION_BLOCKED'
);

select pg_temp.assert_true(
  (public.rpc_catalog_history('{}', 10, 0)->>'error_code') = 'FORBIDDEN',
  'DEPARTMENT_CATALOG_HISTORY_FORBIDDEN'
);
select pg_temp.assert_true(
  (public.rpc_catalog_history_detail(:'profile_audit_id'::uuid)->>'error_code') = 'FORBIDDEN',
  'DEPARTMENT_CATALOG_HISTORY_DETAIL_FORBIDDEN'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'viewer_uid', 'role', 'authenticated')::text, true);

select pg_temp.assert_true(
  public.vmp_business_role(:'viewer_uid'::uuid) is null,
  'LEGACY_VIEWER_DISABLED'
);
select pg_temp.assert_true(
  jsonb_object_length(coalesce(public.rpc_my_ui_access()->'screens', '{}'::jsonb)) = 0,
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
  coalesce(public.rpc_get_vmp_dashboard()->>'ok', 'true') = 'false',
  'INACTIVE_USER_DASHBOARD_BLOCKED'
);
select pg_temp.assert_true(
  coalesce(public.rpc_catalog_history('{}', 10, 0)->>'ok', 'true') = 'false',
  'INACTIVE_USER_CATALOG_BLOCKED'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_uid', 'role', 'authenticated')::text, true);

select pg_temp.assert_true(
  not (public.rpc_catalog_history('{}', 10, 0)::text ~ 'old_data|new_data'),
  'ADMIN_CATALOG_HISTORY_NO_SNAPSHOTS'
);
select pg_temp.assert_true(
  (public.rpc_catalog_history_detail(:'profile_audit_id'::uuid)->>'error_code') = 'NOT_FOUND',
  'ADMIN_PROFILE_AUDIT_DETAIL_NOT_FOUND'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'qa_manager_uid', 'role', 'authenticated')::text, true);

select pg_temp.assert_true(
  not (public.rpc_catalog_history('{}', 10, 0)::text ~ 'old_data|new_data'),
  'QA_MANAGER_CATALOG_HISTORY_NO_SNAPSHOTS'
);
select pg_temp.assert_true(
  (public.rpc_catalog_history_detail(:'profile_audit_id'::uuid)->>'error_code') = 'NOT_FOUND',
  'QA_MANAGER_PROFILE_AUDIT_DETAIL_NOT_FOUND'
);

reset role;
select pg_temp.assert_true(
  (select count(*) = 85 from public.vmp_screen_permissions),
  'FIVE_ROLE_SCREEN_MATRIX_EXACT'
);

rollback;

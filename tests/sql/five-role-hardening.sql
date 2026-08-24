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
values ('FIVE_ROLE_TEST', 'Five-role local fixture', 'FRT');

insert into public.profiles (id, full_name, email, role, department, is_active)
values
  ('71000000-0000-4000-8000-000000000001', 'Target Viewer 1', 'target-viewer-1@example.test', 'viewer', null, true),
  ('71000000-0000-4000-8000-000000000002', 'Target Viewer 2', 'target-viewer-2@example.test', 'viewer', null, true),
  ('71000000-0000-4000-8000-000000000003', 'Target Viewer 3', 'target-viewer-3@example.test', 'viewer', null, true),
  ('71000000-0000-4000-8000-000000000004', 'Target Department 1', 'target-department-1@example.test', 'department_user', 'FIVE_ROLE_TEST', true),
  ('71000000-0000-4000-8000-000000000005', 'Target Department 2', 'target-department-2@example.test', 'department_user', 'FIVE_ROLE_TEST', true),
  ('71000000-0000-4000-8000-000000000006', 'Target Department 3', 'target-department-3@example.test', 'department_user', 'FIVE_ROLE_TEST', true),
  ('71000000-0000-4000-8000-000000000007', 'Target QA manager', 'target-qa-manager@example.test', 'qa_manager', 'FIVE_ROLE_TEST', true),
  ('71000000-0000-4000-8000-000000000099', 'Control Admin', 'control-admin@example.test', 'admin', null, true);

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

-- The deployed UI invokes the resolver through SECURITY DEFINER RPCs. This
-- transaction-only grant isolates the resolver's five-role result from that
-- separate RPC ACL contract, and is undone by the final rollback.
grant execute on function public.vmp_business_role(uuid) to authenticated;
grant execute on function public.vmp_business_role_unresolved_reason(uuid) to authenticated;

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
  (:'workshop_staff_uid'::uuid, 'authenticated', 'authenticated', 'workshop-staff-fixture@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

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

select pg_temp.assert_denied_json('select public.rpc_active_rules()', 'INACTIVE_RPC_ACTIVE_RULES');
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
select pg_temp.assert_denied_json('select public.rpc_list_catalog_changes(null, null, 10, 0)', 'INACTIVE_RPC_LIST_CATALOG_CHANGES');
select pg_temp.assert_denied_json('select public.rpc_list_catalog_dataset(''objects'', null, ''{}''::jsonb, 10, 0)', 'INACTIVE_RPC_LIST_CATALOG_DATASET');
select pg_temp.assert_denied_json('select public.rpc_list_source_tabs()', 'INACTIVE_RPC_LIST_SOURCE_TABS');
select pg_temp.assert_denied_json('select public.rpc_recalc_criticality(true)', 'INACTIVE_RPC_RECALC_CRITICALITY');
select pg_temp.assert_denied_json('select public.rpc_refresh_computed_status()', 'INACTIVE_RPC_REFRESH_STATUS');
select pg_temp.assert_denied_json('select public.rpc_resolve_missing(''x'', ''keep'', ''x'')', 'INACTIVE_RPC_RESOLVE_MISSING');
select pg_temp.assert_denied_json('select public.rpc_save_alert_recipient(null::uuid, ''{}''::jsonb, null, null)', 'INACTIVE_RPC_SAVE_ALERT_RECIPIENT');
select pg_temp.assert_denied_json('select public.rpc_save_catalog_object(''object'', ''x'', ''{}''::jsonb, null, null)', 'INACTIVE_RPC_SAVE_CATALOG_OBJECT');
select pg_temp.assert_denied_json('select public.rpc_save_product_gmp(''x'', ''{}''::jsonb, null, null)', 'INACTIVE_RPC_SAVE_PRODUCT_GMP');
select pg_temp.assert_denied_json('select public.rpc_set_catalog_import_row_reason(null::uuid, 1, ''x'')', 'INACTIVE_RPC_SET_IMPORT_REASON');
select pg_temp.assert_denied_json('select public.rpc_set_item_performer(''x'', ''x'')', 'INACTIVE_RPC_SET_ITEM_PERFORMER');
select pg_temp.assert_denied_json('select public.rpc_set_item_state(''x'', ''x'', ''x'')', 'INACTIVE_RPC_SET_ITEM_STATE');
select pg_temp.assert_denied_json('select public.rpc_source_warnings(2026)', 'INACTIVE_RPC_SOURCE_WARNINGS');
select pg_temp.assert_denied_json('select public.rpc_stage_catalog_import(''objects'', ''x'', ''x'', null, ''[]''::jsonb)', 'INACTIVE_RPC_STAGE_IMPORT');
select pg_temp.assert_denied_json('select public.rpc_trang_thai_he_thong()', 'INACTIVE_RPC_SYSTEM_STATUS');
select pg_temp.assert_denied_json('select public.rpc_update_progress(''x'', ''{}''::jsonb, null, null, null)', 'INACTIVE_RPC_UPDATE_PROGRESS');
select pg_temp.assert_denied_json('select public.rpc_upsert_object(''x'', ''x'', null, null, null, null, null, null)', 'INACTIVE_RPC_UPSERT_OBJECT');
select pg_temp.assert_denied_json('select public.rpc_upsert_performer(null::uuid, ''{}''::jsonb)', 'INACTIVE_RPC_UPSERT_PERFORMER');
select pg_temp.assert_denied_json('select public.rpc_upsert_source_row(''x'', 1, ''{}''::jsonb)', 'INACTIVE_RPC_UPSERT_SOURCE_ROW');
select pg_temp.assert_true(
  (select count(*) = 0 from public.vmp_my_item_rights('FIVE-ROLE-VALIDATION-FIXTURE')),
  'INACTIVE_VMP_MY_ITEM_RIGHTS'
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

select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
  and not has_any_column_privilege('authenticated', 'public.profiles', 'UPDATE'),
  'PROFILE_DIRECT_UPDATE_REVOKED'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.audit_logs', 'SELECT'),
  'RAW_AUDIT_SELECT_REVOKED'
);
select pg_temp.assert_true(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like '%\_\_five\_role\_impl\_20260824' escape '\'
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or exists (
          select 1
          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.grantee = 0 and a.privilege_type = 'EXECUTE'
        ))
  ),
  'RENAMED_IMPLEMENTATIONS_NOT_BROWSER_CALLABLE'
);

rollback;

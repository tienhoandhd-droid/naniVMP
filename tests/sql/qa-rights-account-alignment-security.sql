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

create function pg_temp.assert_sqlstate(
  p_statement text,
  p_expected_state text,
  p_rule_id text
)
returns void language plpgsql as $$
declare
  v_state text;
begin
  begin
    execute p_statement;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = p_expected_state then
      return;
    end if;
    raise exception using errcode = 'check_violation',
      message = format('%s expected_state=%s actual_state=%s',
        p_rule_id, p_expected_state, v_state);
  end;
  raise exception using errcode = 'check_violation',
    message = p_rule_id || ' statement unexpectedly succeeded';
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

with rights as (
  select p.oid, p.proowner, owner.rolname as owner_name,
         language.lanname as language_name, p.prosecdef, p.provolatile,
         p.proparallel, p.proisstrict, p.proleakproof, p.proconfig, p.proacl,
         pg_get_function_result(p.oid) as result_type,
         encode(extensions.digest(pg_get_functiondef(p.oid), 'sha256'), 'hex')
           as definition_hash
  from pg_proc p
  join pg_namespace namespace on namespace.oid = p.pronamespace
  join pg_roles owner on owner.oid = p.proowner
  join pg_language language on language.oid = p.prolang
  where namespace.nspname = 'public' and p.proname = 'vmp_item_rights'
)
select pg_temp.assert_true(
  (select count(*) from rights) = 1
  and (select oid from rights) = 'public.vmp_item_rights(uuid,text)'::regprocedure
  and (select result_type from rights) =
      'TABLE(can_view boolean, editable_fields text[], view_reason text, assignment_sources text[], scope_match boolean, area_match boolean)'
  and (select owner_name from rights) = 'postgres'
  and (select language_name from rights) = 'plpgsql'
  and (select prosecdef from rights)
  and (select provolatile from rights) = 's'
  and (select proparallel from rights) = 'u'
  and not (select proisstrict from rights)
  and not (select proleakproof from rights)
  and (select proconfig from rights) is not distinct from
      array['search_path=public, pg_temp']
  and (select definition_hash from rights) =
      '9cfba864d7ea650370d6d76c33e2afcfbf941bb6918a90eeedec77f0513ab0db',
  format('QA_RIGHTS_METADATA definition=%s',
    (select definition_hash from rights)));

select pg_temp.assert_true(
  has_function_privilege('service_role',
    'public.vmp_item_rights(uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.vmp_item_rights(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.vmp_item_rights(uuid,text)', 'EXECUTE')
  and not has_function_privilege('public',
    'public.vmp_item_rights(uuid,text)', 'EXECUTE')
  and (select proacl from pg_proc
       where oid = 'public.vmp_item_rights(uuid,text)'::regprocedure)
      is not distinct from array[
        'postgres=X/postgres', 'service_role=X/postgres'
      ]::aclitem[]
  and (select count(*)
       from pg_proc p
       cross join lateral aclexplode(
         coalesce(p.proacl, acldefault('f', p.proowner))) acl
       where p.oid = 'public.vmp_item_rights(uuid,text)'::regprocedure
         and acl.grantee <> p.proowner
         and acl.privilege_type = 'EXECUTE') = 1,
  'QA_RIGHTS_RAW_FUNCTION_SERVICE_ONLY_ACL');

select pg_temp.assert_true(
  has_function_privilege('authenticated',
    'public.vmp_my_item_rights(text)', 'EXECUTE')
  and has_function_privilege('authenticated',
    'public.rpc_update_progress(text,jsonb,text,jsonb,integer)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.vmp_my_item_rights(text)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.rpc_update_progress(text,jsonb,text,jsonb,integer)', 'EXECUTE')
  and (select owner.rolname from pg_proc p
       join pg_roles owner on owner.oid = p.proowner
       where p.oid = 'public.vmp_my_item_rights(text)'::regprocedure) = 'postgres'
  and (select owner.rolname from pg_proc p
       join pg_roles owner on owner.oid = p.proowner
       where p.oid =
         'public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure)
      = 'postgres'
  and (select proacl from pg_proc
       where oid = 'public.vmp_my_item_rights(text)'::regprocedure)
      is not distinct from array[
        'postgres=X/postgres', 'service_role=X/postgres',
        'authenticated=X/postgres'
      ]::aclitem[]
  and (select proacl from pg_proc where oid =
       'public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure)
      is not distinct from array[
        'postgres=X/postgres', 'service_role=X/postgres',
        'authenticated=X/postgres'
      ]::aclitem[]
  and (select prosecdef and provolatile = 'v'
         and proparallel = 'u' and not proisstrict and not proleakproof
         and proconfig is not distinct from array['search_path=public, pg_temp']
       from pg_proc where oid =
       'public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure),
  'QA_RIGHTS_GUARDED_BROWSER_BOUNDARIES');

select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.vmp_plan_items',
    'INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated',
    'public.vmp_plan_items', 'UPDATE')
  and not has_table_privilege('anon', 'public.vmp_plan_items',
    'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.audit_logs',
    'INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.audit_logs',
    'INSERT,UPDATE,DELETE'),
  'QA_RIGHTS_NO_DIRECT_ITEM_OR_AUDIT_MUTATION');

with dependency(signature, definition_hash) as (values
  ('public.vmp_business_role(uuid)',
   '45b2dfab1f9463b234a3754e8ee022450749f8418d6fc4a966b09fe8d52c3156'),
  ('public.vmp_manager_principal(uuid)',
   'f1d5c93ff47de4563100f1ce9a54ada9d7b6d0ee908a9914f14327f2fa7af849'),
  ('public.vmp_my_item_rights(text)',
   'c7a326defaedd0cf9056a284e480d69027a56cd35f2ca6f09b4a9e321f1ad76d'),
  ('public.vmp_allowed_timeline_fields(uuid,text)',
   '235d5d2e4ff760a7640e2687be430a8a188a56d380b7cf7b72e6018bc71d9a3c'),
  ('public.rpc_update_progress(text,jsonb,text,jsonb,integer)',
   'da25f8acbcc5aa3e029e581acb79f210cf1d6c61ab0e8458e4ff89146e75f4a0'),
  ('public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)',
   '55f7f86442b88a12c39e1f3cb6dd867d0aae0a684db78365bcef673a473e2644')
), installed as (
  select dependency.signature, dependency.definition_hash,
         encode(extensions.digest(pg_get_functiondef(
           dependency.signature::regprocedure), 'sha256'), 'hex') as actual_hash
  from dependency
)
select pg_temp.assert_true(
  not exists (
    select 1 from installed where actual_hash is distinct from definition_hash
  ),
  'QA_RIGHTS_WRAPPER_OR_WRITER_DRIFT');

with rls_contract as (
  select count(*) as policy_count,
         encode(extensions.digest(string_agg(format(
           '%s|%s|%s|%s|%s', namespace.nspname, relation.relname,
           policy.polname, policy.polcmd,
           coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') || '|'
             || coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '')
         ), E'\n' order by namespace.nspname, relation.relname, policy.polname),
         'sha256'), 'hex') as policy_hash
  from pg_policy policy
  join pg_class relation on relation.oid = policy.polrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname in ('vmp_plan_items', 'vmp_item_assignments')
)
select pg_temp.assert_true(
  policy_count = 2
  and policy_hash = 'ba1c481f16ede3625f6f47e4b0963536e7e89ae56f85b9d5f9ed60cdb4cf8fbf'
  and (select relrowsecurity from pg_class
       where oid = 'public.vmp_plan_items'::regclass)
  and (select relrowsecurity from pg_class
       where oid = 'public.vmp_item_assignments'::regclass),
  format('QA_RIGHTS_RLS_CHANGED count=%s hash=%s', policy_count, policy_hash))
from rls_contract;

select pg_temp.assert_true(
  (select value from public.system_config where key = 'screen_access_mode')
      = '"enforced"'::jsonb
  and (select value from public.system_config where key = 'item_permissions_mode')
      = '"preview"'::jsonb,
  'QA_RIGHTS_MIGRATION_CHANGED_PRODUCTION_MODES');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '98100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'qa-alignment-security@example.test', 'x', now(), '{}', '{}', now(), now()
);

insert into public.departments (id, name, short_name)
values ('QA', 'QA rights security fixture', 'QA');

insert into public.profiles (id, full_name, email, role, department, is_active)
values (
  '98100000-0000-4000-8000-000000000001', 'QA Alignment Security',
  'qa-alignment-security@example.test', 'department_user', 'QA', true
);

update public.vmp_performers
set department = 'QA', access_class = 'qa_progress_editor'
where user_id = '98100000-0000-4000-8000-000000000001'::uuid;

insert into public.vmp_objects (
  code, name, classification, department, frequency_months
)
values ('QAALIGN-SEC', 'QA rights security item', 'tb', 'QA', 12);

insert into public.vmp_plan_items (
  id, validation_code, object_code, validation_type, year, report_class,
  effort_days, deadline_protocol, deadline_validation, deadline_report,
  deadline_vmp, status_protocol, status_validation, status_report, status_vmp,
  is_active, item_state, version, departments, execution_departments,
  source_sheet_data
)
values (
  'QAALIGN-SEC/2026.01-PQ', 'QAALIGN-SEC/2026.01-PQ', 'QAALIGN-SEC',
  'PQ', 2026, 'Hóa lý', 5, current_date + 30, current_date + 60,
  current_date + 90, current_date + 120, 'not_started', 'not_started',
  'not_started', 'not_started', true, 'active', 30,
  array['QA'], array['QA'], '{"fixture":"qa-alignment-security"}'
);

insert into public.vmp_item_assignments (
  validation_code, performer_id, user_id, staff_name, assignment_kind,
  source, assignment_role, is_active, change_reason
)
select 'QAALIGN-SEC/2026.01-PQ', performer.id, performer.user_id,
       performer.performer_name, 'qa', 'qa_manager', 'collaborator', true,
       'QA rights security assignment'
from public.vmp_performers performer
where performer.user_id = '98100000-0000-4000-8000-000000000001'::uuid
  and performer.is_active;

update public.system_config
set value = to_jsonb('enforced'::text)
where key = 'item_permissions_mode';

select set_config('request.jwt.claims', json_build_object(
  'sub', '98100000-0000-4000-8000-000000000001',
  'role', 'authenticated')::text, true);
set local role authenticated;

select pg_temp.assert_sqlstate(
  $$select * from public.vmp_item_rights(
      '98100000-0000-4000-8000-000000000001'::uuid,
      'QAALIGN-SEC/2026.01-PQ')$$,
  '42501', 'QA_RIGHTS_RAW_CALL_NOT_DENIED');

do $wrapper$
declare
  v_right record;
begin
  select * into strict v_right
  from public.vmp_my_item_rights('QAALIGN-SEC/2026.01-PQ');
  if v_right.can_view is not true
     or v_right.editable_fields is distinct from array[
       'actual_protocol_date', 'status_protocol', 'status_validation',
       'actual_report_date', 'status_report',
       'actual_vmp_date', 'status_vmp'
     ]::text[] then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_GUARDED_WRAPPER_FAILED ' || to_jsonb(v_right)::text;
  end if;
end
$wrapper$;

select pg_temp.assert_sqlstate(
  $$update public.vmp_plan_items set status_validation = 'completed'
    where validation_code = 'QAALIGN-SEC/2026.01-PQ'$$,
  '42501', 'QA_RIGHTS_DIRECT_UPDATE_NOT_DENIED');

do $atomic_denials$
declare
  v_before jsonb;
  v_after jsonb;
  v_audit_count bigint;
  v_result jsonb;
  v_version integer;
begin
  select to_jsonb(item), item.version into strict v_before, v_version
  from public.vmp_plan_items item
  where item.validation_code = 'QAALIGN-SEC/2026.01-PQ';
  v_audit_count := pg_temp.audit_count('QAALIGN-SEC/2026.01-PQ');

  v_result := public.rpc_update_progress(
    'QAALIGN-SEC/2026.01-PQ',
    jsonb_build_object('actual_validation_date', current_date),
    'security forbidden actual date', null, v_version);
  perform pg_temp.assert_code(
    v_result, 'item_field_forbidden', 'QA_RIGHTS_FORBIDDEN_FIELD_NOT_DENIED');

  select to_jsonb(item) into strict v_after from public.vmp_plan_items item
  where item.validation_code = 'QAALIGN-SEC/2026.01-PQ';
  if v_after is distinct from v_before
     or pg_temp.audit_count('QAALIGN-SEC/2026.01-PQ') <> v_audit_count then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_FORBIDDEN_FIELD_MUTATED_BEFORE_DENIAL';
  end if;

  v_result := public.rpc_update_progress(
    'QAALIGN-SEC/2026.01-PQ',
    jsonb_build_object(
      'status_validation', 'in_progress',
      'actual_validation_date', current_date),
    'security mixed payload', null, v_version);
  perform pg_temp.assert_code(
    v_result, 'item_field_forbidden', 'QA_RIGHTS_MIXED_PAYLOAD_NOT_DENIED');

  select to_jsonb(item) into strict v_after from public.vmp_plan_items item
  where item.validation_code = 'QAALIGN-SEC/2026.01-PQ';
  if v_after is distinct from v_before
     or pg_temp.audit_count('QAALIGN-SEC/2026.01-PQ') <> v_audit_count then
    raise exception using errcode = 'check_violation',
      message = 'QA_RIGHTS_MIXED_PAYLOAD_NOT_ATOMIC';
  end if;
end
$atomic_denials$;

\echo 'PASS SECURITY raw denied wrapper allowed writer atomic ACL RLS modes overload metadata'
rollback;

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
returns void language plpgsql security invoker as $$
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
    raise exception using errcode='check_violation',
      message=format('%s expected_state=%s actual_state=%s',
        p_rule_id,p_expected_state,v_state);
  end;
  raise exception using errcode='check_violation',
    message=p_rule_id || ' statement unexpectedly succeeded';
end
$$;

create function pg_temp.item_snapshot(p_validation_code text)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select to_jsonb(item) from public.vmp_plan_items item
  where item.validation_code=p_validation_code
$$;

create function pg_temp.audit_count(p_validation_code text)
returns bigint
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select count(*) from public.audit_logs audit
  where audit.validation_code=p_validation_code
$$;

select pg_temp.assert_true(
  to_regprocedure('public.rpc_my_editable_progress_rights()') is not null
  and to_regprocedure(
    'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)'
  ) is not null,
  'ASSIGNED_PROGRESS_SECURITY_FUNCTIONS_MISSING');

with function_contract as (
  select p.oid::regprocedure::text identity,
         owner.rolname owner_name, language.lanname language_name,
         p.pronargs, pg_get_function_result(p.oid) result_type,
         p.prosecdef, p.provolatile, p.proparallel, p.proisstrict,
         p.proleakproof, p.proconfig, p.proacl
  from pg_proc p
  join pg_namespace namespace on namespace.oid=p.pronamespace
  join pg_roles owner on owner.oid=p.proowner
  join pg_language language on language.oid=p.prolang
  where namespace.nspname='public'
    and p.proname in (
      'rpc_my_editable_progress_rights',
      'rpc_update_progress__assigned_impl_20260827',
      'rpc_update_progress'
    )
)
select pg_temp.assert_true(
  (select count(*) from function_contract)=3
  and (select count(*) from function_contract
   where identity='rpc_my_editable_progress_rights()')=1
  and (select pronargs from function_contract
       where identity='rpc_my_editable_progress_rights()')=0
  and (select result_type from function_contract
       where identity='rpc_my_editable_progress_rights()')='jsonb'
  and (select owner_name from function_contract
       where identity='rpc_my_editable_progress_rights()')='postgres'
  and (select language_name from function_contract
       where identity='rpc_my_editable_progress_rights()')='plpgsql'
  and (select prosecdef and provolatile='s' and proparallel='u'
         and not proisstrict and not proleakproof
         and proconfig is not distinct from array['search_path=public, pg_temp']
       from function_contract
       where identity='rpc_my_editable_progress_rights()')
  and (select count(*) from function_contract
       where identity=
         'rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)')=1
  and (select owner_name='postgres' and language_name='plpgsql'
         and prosecdef and provolatile='v' and proparallel='u'
         and not proisstrict and not proleakproof
         and proconfig is not distinct from array['search_path=public, pg_temp']
       from function_contract
       where identity=
         'rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)')
  and (select count(*) from function_contract
       where identity='rpc_update_progress(text,jsonb,text,jsonb,integer)')=1
  and (select owner_name='postgres' and language_name='plpgsql'
         and prosecdef and provolatile='v' and proparallel='u'
         and not proisstrict and not proleakproof
         and proconfig is not distinct from array['search_path=public, pg_temp']
       from function_contract
       where identity='rpc_update_progress(text,jsonb,text,jsonb,integer)'),
  'ASSIGNED_PROGRESS_FUNCTION_METADATA_OR_PUBLIC_SIGNATURE');

select pg_temp.assert_true(
  has_function_privilege('authenticated',
    'public.rpc_my_editable_progress_rights()','EXECUTE')
  and has_function_privilege('service_role',
    'public.rpc_my_editable_progress_rights()','EXECUTE')
  and not has_function_privilege('anon',
    'public.rpc_my_editable_progress_rights()','EXECUTE')
  and not has_function_privilege('public',
    'public.rpc_my_editable_progress_rights()','EXECUTE')
  and has_function_privilege('authenticated',
    'public.rpc_update_progress(text,jsonb,text,jsonb,integer)','EXECUTE')
  and has_function_privilege('service_role',
    'public.rpc_update_progress(text,jsonb,text,jsonb,integer)','EXECUTE')
  and not has_function_privilege('anon',
    'public.rpc_update_progress(text,jsonb,text,jsonb,integer)','EXECUTE')
  and not has_function_privilege('public',
    'public.rpc_update_progress(text,jsonb,text,jsonb,integer)','EXECUTE')
  and not has_function_privilege('authenticated',
    'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)',
    'EXECUTE')
  and not has_function_privilege('anon',
    'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)',
    'EXECUTE')
  and not has_function_privilege('service_role',
    'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)',
    'EXECUTE')
  and not has_function_privilege('public',
    'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)',
    'EXECUTE'),
  'ASSIGNED_PROGRESS_BOUNDARY_OR_PRIVATE_ACL');

select pg_temp.assert_true(
  not has_table_privilege('authenticated','public.vmp_source_objects',
    'INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated','public.vmp_source_objects','UPDATE')
  and not has_table_privilege('authenticated','public.vmp_item_assignments',
    'INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated','public.vmp_item_assignments','UPDATE')
  and not has_table_privilege('authenticated','public.vmp_plan_items',
    'INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated','public.vmp_plan_items','UPDATE'),
  'ASSIGNED_PROGRESS_NO_DIRECT_SOURCE_ASSIGNMENT_OR_ITEM_MUTATION');

insert into auth.users (
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
values
  ('99011000-0000-4000-8000-000000000001','authenticated','authenticated',
   'assigned-progress-security@example.test','x',now(),'{}','{}',now(),now()),
  ('99011000-0000-4000-8000-000000000002','authenticated','authenticated',
   'assigned-progress-security-inactive@example.test','x',now(),'{}','{}',now(),now());

insert into public.profiles (id,full_name,email,role,department,is_active)
values
  ('99011000-0000-4000-8000-000000000001','Assigned Progress Security QA',
   'assigned-progress-security@example.test','department_user','qa',true),
  ('99011000-0000-4000-8000-000000000002','Assigned Progress Security Inactive',
   'assigned-progress-security-inactive@example.test','department_user','qa',false);

update public.vmp_performers
set department='qa', access_class='qa_progress_editor',
    is_active=user_id='99011000-0000-4000-8000-000000000001'::uuid
where user_id between '99011000-0000-4000-8000-000000000001'::uuid
                  and '99011000-0000-4000-8000-000000000002'::uuid;

insert into public.vmp_objects (
  code,name,classification,department,frequency_months
)
values ('APV-SECURITY','Assigned progress security item','tb','qa',12);

insert into public.vmp_plan_items (
  id,validation_code,object_code,validation_type,year,report_class,
  effort_days,deadline_protocol,deadline_validation,deadline_report,
  deadline_vmp,status_protocol,status_validation,status_report,status_vmp,
  is_active,item_state,version,departments,execution_departments,
  source_sheet_data
)
values (
  'APV-SECURITY/2026.01-PQ','APV-SECURITY/2026.01-PQ','APV-SECURITY',
  'PQ',2026,'Hóa lý',5,current_date+30,current_date+60,current_date+90,
  current_date+120,'not_started','not_started','not_started','not_started',
  true,'active',50,array['qa'],array['qa'],'{"fixture":"security"}'
);

insert into public.vmp_source_objects (
  id,object_kind,object_code,object_name,department,validate_flag,
  frequency_months,report_class,workdays,first_month,year_ref,
  source_tab,source_row,version,timeline_revision,timeline_applied_revision
)
values (
  '99011000-0000-4000-8000-000000000101','Thiết bị','APV-SECURITY',
  'Assigned progress security item','qa','y',12,'Hóa lý',5,1,2026,
  'assigned-progress-security',9901,1,0,0
);

insert into public.vmp_item_assignments (
  validation_code,performer_id,user_id,staff_name,assignment_kind,
  source,assignment_role,is_active,change_reason
)
select 'APV-SECURITY/2026.01-PQ',performer.id,performer.user_id,
       performer.performer_name,'qa','qa_manager','collaborator',true,
       'Assigned progress security assignment'
from public.vmp_performers performer
where performer.user_id='99011000-0000-4000-8000-000000000001'::uuid;

set local role anon;
select pg_temp.assert_sqlstate(
  $$select public.rpc_my_editable_progress_rights()$$,
  '42501','ASSIGNED_PROGRESS_ANON_BATCH_NOT_DENIED');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object(
  'sub','99011000-0000-4000-8000-000000000001','role','authenticated')::text,
  true);

select pg_temp.assert_sqlstate(
  $$select public.rpc_my_editable_progress_rights(
      '99011000-0000-4000-8000-000000000002'::uuid)$$,
  '42883','ASSIGNED_PROGRESS_UID_ARGUMENT_SPOOF_NOT_DENIED');

select pg_temp.assert_sqlstate(
  $$select public.rpc_update_progress__assigned_impl_20260827(
      'APV-SECURITY/2026.01-PQ','{}'::jsonb,null,null,null)$$,
  '42501','ASSIGNED_PROGRESS_PRIVATE_WRITER_AUTHENTICATED_CALL_NOT_DENIED');

select pg_temp.assert_sqlstate(
  $$update public.vmp_source_objects set owner_name='spoof'
    where object_code='APV-SECURITY'$$,
  '42501','ASSIGNED_PROGRESS_DIRECT_SOURCE_UPDATE_NOT_DENIED');

select pg_temp.assert_sqlstate(
  $$update public.vmp_item_assignments set is_active=false
    where validation_code='APV-SECURITY/2026.01-PQ'$$,
  '42501','ASSIGNED_PROGRESS_DIRECT_ASSIGNMENT_UPDATE_NOT_DENIED');

do $batch_payload_security$
declare
  v_batch jsonb := public.rpc_my_editable_progress_rights();
  v_row jsonb;
begin
  if v_batch ->> 'ok' is distinct from 'true'
     or jsonb_array_length(v_batch -> 'rights') <> 1 then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_SECURITY_BATCH_COUNT '||v_batch::text;
  end if;
  v_row := v_batch -> 'rights' -> 0;
  if v_row is distinct from '{
    "validation_code":"APV-SECURITY/2026.01-PQ",
    "editable_fields":[
      "actual_protocol_date","status_protocol","status_validation",
      "actual_report_date","status_report","actual_vmp_date","status_vmp"
    ],
    "view_reason":"Có phân công QA đang hoạt động"
  }'::jsonb
     or exists (
       select 1 from jsonb_object_keys(v_row) key
       where key not in ('validation_code','editable_fields','view_reason')
     ) then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_BATCH_IDENTITY_LEAK_OR_WRONG_FIELDS '||v_row::text;
  end if;
end
$batch_payload_security$;

do $malicious_mixed_patch$
declare
  v_before jsonb := pg_temp.item_snapshot('APV-SECURITY/2026.01-PQ');
  v_after jsonb;
  v_audit_before bigint := pg_temp.audit_count('APV-SECURITY/2026.01-PQ');
  v_result jsonb;
begin
  v_result := public.rpc_update_progress(
    'APV-SECURITY/2026.01-PQ',jsonb_build_object(
      'status_validation','in_progress',
      'actual_validation_date',current_date,
      'updated_by','99011000-0000-4000-8000-000000000002'),
    'Malicious mixed progress patch',null,(v_before ->> 'version')::integer);
  perform pg_temp.assert_code(
    v_result,'item_field_forbidden','ASSIGNED_PROGRESS_MALICIOUS_MIXED_NOT_DENIED');
  v_after := pg_temp.item_snapshot('APV-SECURITY/2026.01-PQ');
  if v_after is distinct from v_before
     or pg_temp.audit_count('APV-SECURITY/2026.01-PQ') <> v_audit_before then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_MALICIOUS_MIXED_NOT_ATOMIC';
  end if;
end
$malicious_mixed_patch$;

select set_config('request.jwt.claims',json_build_object(
  'sub','99011000-0000-4000-8000-000000000002','role','authenticated')::text,
  true);
do $inactive_batch$
declare
  v_result jsonb := public.rpc_my_editable_progress_rights();
begin
  if v_result ->> 'ok' is distinct from 'false'
     or coalesce(v_result ->> 'error_code',v_result ->> 'code')
        is distinct from 'ACCOUNT_DISABLED'
     or (v_result ? 'rights' and jsonb_array_length(v_result -> 'rights') > 0) then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_INACTIVE_RIGHTS_LEAK '||v_result::text;
  end if;
end
$inactive_batch$;

reset role;
set local role service_role;
select pg_temp.assert_sqlstate(
  $$select public.rpc_update_progress__assigned_impl_20260827(
      'APV-SECURITY/2026.01-PQ','{}'::jsonb,null,null,null)$$,
  '42501','ASSIGNED_PROGRESS_PRIVATE_WRITER_SERVICE_CALL_NOT_DENIED');
reset role;

select pg_temp.assert_true(
  (select value from public.system_config where key='item_permissions_mode')
    = '"preview"'::jsonb,
  'ASSIGNED_PROGRESS_SECURITY_CHANGED_GLOBAL_MODE');

\echo 'PASS SECURITY uid-bound batch private writer ACL atomic patches and direct mutation denial'
rollback;

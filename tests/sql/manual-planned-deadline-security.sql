\set ON_ERROR_STOP on

begin;

create function pg_temp.assert_true(p_condition boolean,p_rule_id text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then
    raise exception using errcode='check_violation',message=p_rule_id;
  end if;
end
$$;

select pg_temp.assert_true(
  to_regprocedure('public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)') is not null
  and pg_get_function_result('public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)'::regprocedure)='jsonb'
  and (select l.lanname='plpgsql' and p.prosecdef and p.provolatile='v'
       and p.proconfig is not distinct from array['search_path=public, pg_temp']
       and p.proowner=(select proowner from pg_proc
                       where oid='public.rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)'::regprocedure)
       from pg_proc p join pg_language l on l.oid=p.prolang
       where p.oid='public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)'::regprocedure),
  'MANUAL_BOUNDARY_METADATA');

select pg_temp.assert_true(
  has_function_privilege('authenticated',
    'public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)','EXECUTE')
  and has_function_privilege('service_role',
    'public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)','EXECUTE')
  and not has_function_privilege('anon',
    'public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)','EXECUTE')
  and not has_function_privilege('public',
    'public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)','EXECUTE')
  and (select count(*) from aclexplode(coalesce(
        (select proacl from pg_proc where oid=
          'public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)'::regprocedure),
        acldefault('f',(select proowner from pg_proc where oid=
          'public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)'::regprocedure)))) a
       where a.grantee<>(select proowner from pg_proc where oid=
          'public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)'::regprocedure)
         and a.privilege_type='EXECUTE')=2,
  'MANUAL_BOUNDARY_EXACT_ACL');

select pg_temp.assert_true(
  to_regprocedure('public.vmp_update_planned_deadlines_impl(text,jsonb,text,integer,boolean)') is not null
  and (select l.lanname='plpgsql' and not p.prosecdef and p.provolatile='v'
       and p.proconfig is not distinct from array['search_path=public, pg_temp']
       and p.proowner=(select proowner from pg_proc
                       where oid='public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)'::regprocedure)
       from pg_proc p join pg_language l on l.oid=p.prolang
       where p.oid='public.vmp_update_planned_deadlines_impl(text,jsonb,text,integer,boolean)'::regprocedure)
  and not has_function_privilege('authenticated',
    'public.vmp_update_planned_deadlines_impl(text,jsonb,text,integer,boolean)','EXECUTE')
  and not has_function_privilege('service_role',
    'public.vmp_update_planned_deadlines_impl(text,jsonb,text,integer,boolean)','EXECUTE')
  and not has_function_privilege('anon',
    'public.vmp_update_planned_deadlines_impl(text,jsonb,text,integer,boolean)','EXECUTE')
  and not has_function_privilege('public',
    'public.vmp_update_planned_deadlines_impl(text,jsonb,text,integer,boolean)','EXECUTE')
  and not exists (
    select 1 from aclexplode(coalesce(
      (select proacl from pg_proc where oid=
        'public.vmp_update_planned_deadlines_impl(text,jsonb,text,integer,boolean)'::regprocedure),
      acldefault('f',(select proowner from pg_proc where oid=
        'public.vmp_update_planned_deadlines_impl(text,jsonb,text,integer,boolean)'::regprocedure)))) a
    where a.grantee<>(select proowner from pg_proc where oid=
      'public.vmp_update_planned_deadlines_impl(text,jsonb,text,integer,boolean)'::regprocedure)
      and a.privilege_type='EXECUTE'),
  'MANUAL_HELPER_INVOKER_OWNER_ONLY');

select pg_temp.assert_true(
  to_regprocedure('public.vmp_preserve_manual_planned_deadline_state()') is not null
  and (select l.lanname='plpgsql' and not p.prosecdef and p.provolatile='v'
       and p.proconfig is not distinct from array['search_path=public, pg_temp']
       and p.proowner=(select proowner from pg_proc
                       where oid='public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)'::regprocedure)
       from pg_proc p join pg_language l on l.oid=p.prolang
       where p.oid='public.vmp_preserve_manual_planned_deadline_state()'::regprocedure)
  and not exists (
    select 1 from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where p.oid='public.vmp_preserve_manual_planned_deadline_state()'::regprocedure
      and a.grantee<>p.proowner and a.privilege_type='EXECUTE'
  )
  and (select count(*) from pg_trigger t
       where t.tgrelid='public.vmp_plan_items'::regclass
         and t.tgfoid='public.vmp_preserve_manual_planned_deadline_state()'::regprocedure
         and t.tgname='u_manual_planned_deadline_state'
         and not t.tgisinternal and (t.tgtype & 2)=2)=1,
  'MANUAL_STATE_PRESERVER_INVOKER_OWNER_ONLY');

select pg_temp.assert_true(
  to_regprocedure('public.vmp_invalidate_plan_item_revision_from_assignment()') is not null
  and (select l.lanname='plpgsql' and not p.prosecdef and p.provolatile='v'
       and p.proconfig is not distinct from array['search_path=public, pg_temp']
       and p.proowner=(select proowner from pg_proc
                       where oid='public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)'::regprocedure)
       from pg_proc p join pg_language l on l.oid=p.prolang
       where p.oid='public.vmp_invalidate_plan_item_revision_from_assignment()'::regprocedure)
  and not exists (
    select 1 from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where p.oid='public.vmp_invalidate_plan_item_revision_from_assignment()'::regprocedure
      and a.grantee<>p.proowner and a.privilege_type='EXECUTE'
  )
  and (select count(*) from pg_trigger t
       where t.tgrelid='public.vmp_item_assignments'::regclass
         and t.tgfoid='public.vmp_invalidate_plan_item_revision_from_assignment()'::regprocedure
         and t.tgname='vmp_item_assignment_plan_revision'
         and not t.tgisinternal
         and (t.tgtype & 1)=1 and (t.tgtype & 2)=0
         and (t.tgtype & 28)=28)=1,
  'MANUAL_ASSIGNMENT_REVISION_INVALIDATOR_OWNER_ONLY');

select pg_temp.assert_true(
  (select pg_get_constraintdef(oid) from pg_constraint
   where conrelid='public.audit_logs'::regclass
     and conname='audit_logs_effective_business_role_check')=
  'CHECK (((effective_business_role IS NULL) OR (effective_business_role = ANY (ARRAY[''admin''::text, ''qa_manager''::text, ''qa_staff''::text, ''workshop_manager''::text, ''workshop_staff''::text, ''viewer''::text, ''service_role''::text]))))',
  'MANUAL_SERVICE_ROLE_AUDIT_CONSTRAINT_EXPLICIT');

select pg_temp.assert_true(
  not has_table_privilege('authenticated','public.vmp_plan_items','INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated','public.vmp_plan_items','UPDATE')
  and not has_table_privilege('anon','public.vmp_plan_items','INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.audit_logs','INSERT,UPDATE,DELETE'),
  'MANUAL_NO_DIRECT_TABLE_OR_AUDIT_GRANT');

with findings as (
  select count(*) count,coalesce(string_agg(signature,',' order by signature),'') signatures
  from public.vmp_unfiltered_security_definer_item_readers()
)
select pg_temp.assert_true(
  count=3 and signatures='rpc_active_rules(),rpc_apply_catalog_change(uuid,text,integer),rpc_preview_catalog_change(uuid)',
  'MANUAL_NO_NEW_UNFILTERED_READER '||signatures)
from findings;

-- Exact post-manual inventory, pinned from the guarded disposable clone.
with browser_inventory as (
  select p.oid::regprocedure::text identity,
         pg_get_function_result(p.oid) result_type,l.lanname language,p.prosecdef,
         coalesce(array_to_string(p.proconfig,','),'') settings,
         encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex') definition_hash,
         r.rolname owner,coalesce(array_to_string(p.proacl,','),'') acl,
         has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec,
         has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
         has_function_privilege('public',p.oid,'EXECUTE') public_exec
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join pg_language l on l.oid=p.prolang join pg_roles r on r.oid=p.proowner
  where n.nspname='public' and (has_function_privilege('authenticated',p.oid,'EXECUTE')
    or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('public',p.oid,'EXECUTE'))
), browser_contract as (
  select count(*) count,encode(extensions.digest(string_agg(concat_ws('|',identity,result_type,language,
    prosecdef,settings,definition_hash,owner,acl,auth_exec,anon_exec,public_exec),E'\n' order by identity),'sha256'),'hex') digest
  from browser_inventory
), service_inventory as (
  select p.oid::regprocedure::text identity,
         pg_get_function_result(p.oid) result_type,l.lanname language,p.prosecdef,
         coalesce(array_to_string(p.proconfig,','),'') settings,
         encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex') definition_hash,
         r.rolname owner,coalesce(array_to_string(p.proacl,','),'') acl,
         has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec,
         has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
         has_function_privilege('public',p.oid,'EXECUTE') public_exec,
         has_function_privilege('service_role',p.oid,'EXECUTE') service_exec
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join pg_language l on l.oid=p.prolang join pg_roles r on r.oid=p.proowner
  where n.nspname='public' and has_function_privilege('service_role',p.oid,'EXECUTE')
), service_contract as (
  select count(*) count,encode(extensions.digest(string_agg(concat_ws('|',identity,result_type,language,
    prosecdef,settings,definition_hash,owner,acl,auth_exec,anon_exec,public_exec,service_exec),E'\n' order by identity),'sha256'),'hex') digest
  from service_inventory
)
select pg_temp.assert_true(
  browser_contract.count=67
  and browser_contract.digest='fbb5815077262640c78e2541ed4fe870e37e45b7c8b0806ba10b589696d1e3dc'
  and service_contract.count=210
  and service_contract.digest='216d718818f0ca1bc30091ae6a8db40e1d4ca518fcebf3825747f561a6dd9e95',
  format('MANUAL_INSTALLED_ACL_CONTRACT browser=%s/%s service=%s/%s',
    browser_contract.count,browser_contract.digest,service_contract.count,service_contract.digest))
from browser_contract cross join service_contract;

\echo 'PASS SECURITY manual planned-deadline metadata ACL inventories'
rollback;

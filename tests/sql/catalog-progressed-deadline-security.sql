\set ON_ERROR_STOP on

begin;

create function pg_temp.assert_true(p_condition boolean, p_rule_id text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception using errcode='check_violation',message=p_rule_id;
  end if;
end
$$;

-- Digests are pinned after the reviewed installed definitions are available.
-- The suite intentionally fails until those SHA-256 literals replace RED.
with browser_inventory as (
  select p.oid::regprocedure::text identity,
         pg_get_function_result(p.oid) result_type,
         l.lanname language, p.prosecdef,
         coalesce(array_to_string(p.proconfig,','),'') settings,
         encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex') definition_hash,
         r.rolname owner, coalesce(array_to_string(p.proacl,','),'') acl,
         has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec,
         has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
         has_function_privilege('public',p.oid,'EXECUTE') public_exec
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join pg_language l on l.oid=p.prolang join pg_roles r on r.oid=p.proowner
  where n.nspname='public' and (has_function_privilege('authenticated',p.oid,'EXECUTE')
    or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('public',p.oid,'EXECUTE'))
), browser_contract as (
  select count(*) count, encode(extensions.digest(string_agg(concat_ws('|',identity,result_type,language,
    prosecdef,settings,definition_hash,owner,acl,auth_exec,anon_exec,public_exec),E'\n' order by identity),'sha256'),'hex') digest
  from browser_inventory
), service_inventory as (
  select p.oid::regprocedure::text identity,
         pg_get_function_result(p.oid) result_type,
         l.lanname language, p.prosecdef,
         coalesce(array_to_string(p.proconfig,','),'') settings,
         encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex') definition_hash,
         r.rolname owner, coalesce(array_to_string(p.proacl,','),'') acl,
         has_function_privilege('authenticated',p.oid,'EXECUTE') auth_exec,
         has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
         has_function_privilege('public',p.oid,'EXECUTE') public_exec,
         has_function_privilege('service_role',p.oid,'EXECUTE') service_exec
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join pg_language l on l.oid=p.prolang join pg_roles r on r.oid=p.proowner
  where n.nspname='public' and has_function_privilege('service_role',p.oid,'EXECUTE')
), service_contract as (
  select count(*) count, encode(extensions.digest(string_agg(concat_ws('|',identity,result_type,language,
    prosecdef,settings,definition_hash,owner,acl,auth_exec,anon_exec,public_exec,service_exec),E'\n' order by identity),'sha256'),'hex') digest
  from service_inventory
)
select pg_temp.assert_true(
  browser_contract.count=67
  and browser_contract.digest='fbb5815077262640c78e2541ed4fe870e37e45b7c8b0806ba10b589696d1e3dc'
  and service_contract.count=210
  and service_contract.digest='216d718818f0ca1bc30091ae6a8db40e1d4ca518fcebf3825747f561a6dd9e95',
  format('POST_V2_ACL_CONTRACT browser=%s/%s service=%s/%s',browser_contract.count,browser_contract.digest,
    service_contract.count,service_contract.digest))
from browser_contract cross join service_contract;

select pg_temp.assert_true(
  has_function_privilege('authenticated','public.rpc_preview_catalog_change_v2(uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)','EXECUTE')
  and has_function_privilege('service_role','public.rpc_preview_catalog_change_v2(uuid)','EXECUTE')
  and has_function_privilege('service_role','public.rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)','EXECUTE')
  and not has_function_privilege('anon','public.rpc_preview_catalog_change_v2(uuid)','EXECUTE')
  and not has_function_privilege('public','public.rpc_preview_catalog_change_v2(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)','EXECUTE')
  and not has_function_privilege('public','public.rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)','EXECUTE'),
  'V2_BOUNDARY_ACL');

select pg_temp.assert_true(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where n.nspname='public'
      and p.proname in ('vmp_lock_catalog_object_v2','vmp_preview_catalog_change_v2_impl',
                        'vmp_apply_catalog_change_v2_impl','vmp_plan_item_row_revision_v2')
      and a.grantee<>p.proowner and a.privilege_type='EXECUTE'
  )
  and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like '%\_\_five\_role\_impl\_20260824' escape '\'
      and (has_function_privilege('authenticated',p.oid,'EXECUTE')
        or has_function_privilege('anon',p.oid,'EXECUTE')
        or has_function_privilege('service_role',p.oid,'EXECUTE'))
  ), 'HELPER_AND_HIDDEN_OWNER_ONLY');

select pg_temp.assert_true(
  not exists (
    select 1 from pg_depend d join pg_proc hidden on hidden.oid=d.refobjid
    join pg_namespace n on n.oid=hidden.pronamespace join pg_proc caller on caller.oid=d.objid
    where n.nspname='public' and hidden.proname like '%\_\_five\_role\_impl\_20260824' escape '\'
      and caller.proname in ('rpc_preview_catalog_change_v2','rpc_apply_catalog_change_v2',
        'vmp_preview_catalog_change_v2_impl','vmp_apply_catalog_change_v2_impl')
  ), 'NO_V2_HIDDEN_DEPENDENCY');

select pg_temp.assert_true(
  not has_table_privilege('authenticated','public.vmp_catalog_changes','INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.vmp_source_objects','INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.vmp_plan_items','INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated','public.vmp_plan_items','UPDATE')
  and not has_table_privilege('anon','public.vmp_plan_items','INSERT,UPDATE,DELETE'),
  'NO_DIRECT_TABLE_OR_COLUMN_GRANT_DELTA');

with findings as (
  select count(*) count,coalesce(string_agg(signature,',' order by signature),'') signatures
  from public.vmp_unfiltered_security_definer_item_readers()
)
select pg_temp.assert_true(
  count=3 and signatures='rpc_active_rules(),rpc_apply_catalog_change(uuid,text,integer),rpc_preview_catalog_change(uuid)',
  'NO_NEW_UNFILTERED_SECURITY_DEFINER_ITEM_READER '||signatures)
from findings;

\echo 'PASS SECURITY post-manual counts=67/210'
rollback;

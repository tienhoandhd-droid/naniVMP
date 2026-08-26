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

with principal as (
  select p.oid,p.proowner,r.rolname owner,l.lanname language,p.prosecdef,
         p.provolatile,p.proconfig,p.proacl,pg_get_function_result(p.oid) result_type,
         pg_get_functiondef(p.oid) definition,
         encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex') definition_hash
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join pg_roles r on r.oid=p.proowner join pg_language l on l.oid=p.prolang
  where n.nspname='public' and p.proname='vmp_manager_principal'
)
select pg_temp.assert_true(
  (select count(*) from principal)=1
  and (select oid from principal)='public.vmp_manager_principal(uuid)'::regprocedure
  and (select result_type from principal)=
    'TABLE(principal_kind text, profile_department text, performer_department text, scope_departments text[], access_areas text[])'
  and (select language from principal)='sql'
  and (select prosecdef from principal)
  and (select provolatile from principal)='s'
  and (select proconfig from principal) is not distinct from array['search_path=public, pg_temp']
  and (select proowner from pg_proc where oid=
       'public.vmp_manager_principal(uuid)'::regprocedure)=
      (select proowner from pg_proc where oid=
       'public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure)
  and (select definition_hash from principal)=
    'f1d5c93ff47de4563100f1ce9a54ada9d7b6d0ee908a9914f14327f2fa7af849'
  and (select (length(definition)-length(replace(definition,
        'upper(btrim(profile.department::text)) = ''QA''','')))
        / length('upper(btrim(profile.department::text)) = ''QA''') from principal)=1
  and (select (length(definition)-length(replace(definition,
        'upper(btrim(person.department::text)) = ''QA''','')))
        / length('upper(btrim(person.department::text)) = ''QA''') from principal)=1
  and (select definition not like '%profile.department = ''qa''%'
       and definition not like '%person.department = ''qa''%' from principal),
  format('QA_ACTUAL_PRINCIPAL_METADATA definition=%s',
         (select definition_hash from principal)));

select pg_temp.assert_true(
  has_function_privilege('service_role',
    'public.vmp_manager_principal(uuid)','EXECUTE')
  and not has_function_privilege('authenticated',
    'public.vmp_manager_principal(uuid)','EXECUTE')
  and not has_function_privilege('anon',
    'public.vmp_manager_principal(uuid)','EXECUTE')
  and not has_function_privilege('public',
    'public.vmp_manager_principal(uuid)','EXECUTE')
  and (select count(*) from pg_proc p
       cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
       where p.oid='public.vmp_manager_principal(uuid)'::regprocedure
         and acl.grantee<>p.proowner and acl.privilege_type='EXECUTE')=1,
  'QA_ACTUAL_PRINCIPAL_SERVICE_ONLY_ACL');

select pg_temp.assert_true(
  not has_table_privilege('authenticated','public.vmp_plan_items','INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated','public.vmp_plan_items','UPDATE')
  and not has_table_privilege('anon','public.vmp_plan_items','INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.audit_logs','INSERT,UPDATE,DELETE'),
  'QA_ACTUAL_NO_DIRECT_TABLE_OR_AUDIT_GRANT');

select pg_temp.assert_true(
  (select value from public.system_config where key='item_permissions_mode')='"preview"'::jsonb,
  'QA_ACTUAL_DID_NOT_ENABLE_ENFORCED_GLOBALLY');

with dependencies(signature,definition_sha256) as (values
  ('public.vmp_business_role(uuid)',
   '45b2dfab1f9463b234a3754e8ee022450749f8418d6fc4a966b09fe8d52c3156'),
  ('public.vmp_is_active_session(uuid)',
   'e52a0cece430ad8b8319819b633fd4fc8aa92bc2d2fac083a33b22f609e1f417'),
  ('public.vmp_item_rights(uuid,text)',
   'f82b266343a54d695e16df2e9a67867d39ddc50bd11233639266eae7ca1553aa'),
  ('public.vmp_my_item_rights(text)',
   'c7a326defaedd0cf9056a284e480d69027a56cd35f2ca6f09b4a9e321f1ad76d'),
  ('public.vmp_allowed_timeline_fields(uuid,text)',
   '235d5d2e4ff760a7640e2687be430a8a188a56d380b7cf7b72e6018bc71d9a3c'),
  ('public.rpc_update_progress(text,jsonb,text,jsonb,integer)',
   'da25f8acbcc5aa3e029e581acb79f210cf1d6c61ab0e8458e4ff89146e75f4a0'),
  ('public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)',
   '55f7f86442b88a12c39e1f3cb6dd867d0aae0a684db78365bcef673a473e2644'),
  ('public.audit_plan_item_changes_v2()',
   '4f69863a23c5353fda09332a04f7643c58b8d9e0ceb126b52790e4b61162ba4c'),
  ('public.vmp_plan_item_row_revision_v2()',
   'd00963d1f265c8d7457011cdafc331a9c7aafbb6b86e0bf7c82ce94bda4829c2')
), installed as (
  select signature,definition_sha256,
         encode(extensions.digest(pg_get_functiondef(signature::regprocedure),'sha256'),'hex') actual
  from dependencies
)
select pg_temp.assert_true(
  not exists (select 1 from installed where actual is distinct from definition_sha256),
  'QA_ACTUAL_DEPENDENCIES_UNCHANGED');

with findings as (
  select count(*) count,coalesce(string_agg(signature,',' order by signature),'') signatures
  from public.vmp_unfiltered_security_definer_item_readers()
)
select pg_temp.assert_true(
  count=3 and signatures=
    'rpc_active_rules(),rpc_apply_catalog_change(uuid,text,integer),rpc_preview_catalog_change(uuid)',
  'QA_ACTUAL_NO_NEW_UNFILTERED_READER '||signatures)
from findings;

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
    or has_function_privilege('anon',p.oid,'EXECUTE')
    or has_function_privilege('public',p.oid,'EXECUTE'))
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
  and service_contract.digest='e4f8eff24a6185e5aa4c9c4919c6064a7566d38a3ba6c5f25db58ede01ee9d00',
  format('QA_ACTUAL_INSTALLED_ACL_CONTRACT browser=%s/%s service=%s/%s',
    browser_contract.count,browser_contract.digest,service_contract.count,service_contract.digest))
from browser_contract cross join service_contract;

\echo 'PASS SECURITY QA Manager principal metadata ACL dependencies inventories'

rollback;

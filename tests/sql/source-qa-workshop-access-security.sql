\set ON_ERROR_STOP on

begin;
set local lock_timeout='3s';
set local statement_timeout='120s';

create function pg_temp.assert_true(p_condition boolean,p_rule_id text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then
    raise exception using errcode='check_violation',message=p_rule_id;
  end if;
end
$$;

create function pg_temp.assert_forbidden(p_actual jsonb,p_rule_id text)
returns void language plpgsql as $$
begin
  if p_actual->>'ok' is distinct from 'false'
     or upper(coalesce(p_actual->>'error_code',p_actual->>'code',''))<>'FORBIDDEN' then
    raise exception using errcode='check_violation',
      message=format('%s expected=FORBIDDEN actual=%s',p_rule_id,p_actual);
  end if;
end
$$;

create temp table expected_browser_function(
  signature text primary key,
  volatility "char" not null,
  classification text not null
) on commit drop;

insert into expected_browser_function(signature,volatility,classification)
values
  ('rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)','s','rights_reader'),
  ('rpc_source_object_facets(text,jsonb)','s','rights_reader'),
  ('rpc_export_source_objects(text,text,jsonb,jsonb,integer)','v','rights_reader'),
  ('rpc_source_field_suggestions(text,text,text,jsonb,integer)','s','manager_reader'),
  ('rpc_source_qa_candidates(text,jsonb,integer,uuid[])','s','manager_reader'),
  ('rpc_list_source_workshop_coverage(text,jsonb,integer)','s','manager_reader'),
  ('rpc_source_workshop_scope_choices(text,text,text,jsonb,integer)','s','manager_reader'),
  ('rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)','v','manager_writer'),
  ('rpc_get_vmp_dashboard(integer,boolean,boolean)','s','rights_reader'),
  ('rpc_get_vmp_watermark(integer)','s','rights_reader'),
  ('rpc_source_warnings(integer)','s','rights_reader'),
  ('rpc_my_editable_progress_rights()','s','rights_reader'),
  ('vmp_my_item_rights(text)','s','rights_reader'),
  ('rpc_update_progress(text,jsonb,text,jsonb,integer)','v','rights_writer'),
  ('rpc_save_catalog_object(text,text,jsonb,text,integer)','v','manager_writer'),
  ('rpc_list_catalog_dataset(text,text,jsonb,integer,integer)','s','manager_reader'),
  ('rpc_list_catalog_changes(text,text,integer,integer)','s','manager_reader'),
  ('rpc_catalog_history(jsonb,integer,integer)','s','manager_reader'),
  ('rpc_catalog_history_detail(uuid)','s','manager_reader'),
  ('rpc_stage_catalog_import(text,text,text,text,jsonb)','v','manager_writer'),
  ('rpc_commit_catalog_import(uuid,text)','v','manager_writer');

select pg_temp.assert_true(
  to_regclass('public.vmp_source_workshop_scope_grants') is not null
  and not exists (
    select 1 from expected_browser_function expected
    where to_regprocedure('public.'||expected.signature) is null
  ),
  'SOURCE_ACCESS_SECURITY_SCHEMA_OR_BROWSER_FUNCTION_MISSING rpc_list_source_objects vmp_source_workshop_scope_grants');

with actual as (
  select expected.signature,expected.volatility,expected.classification,
         procedure.oid,owner.rolname owner_name,language.lanname language_name,
         procedure.prosecdef,procedure.provolatile,procedure.proparallel,
         procedure.proisstrict,procedure.proleakproof,procedure.proconfig,
         procedure.proname
  from expected_browser_function expected
  join pg_proc procedure
    on procedure.oid=to_regprocedure('public.'||expected.signature)
  join pg_roles owner on owner.oid=procedure.proowner
  join pg_language language on language.oid=procedure.prolang
)
select pg_temp.assert_true(
  (select count(*) from actual)=(select count(*) from expected_browser_function)
  and not exists (
    select 1 from actual
    where owner_name<>'postgres' or language_name<>'plpgsql'
       or not prosecdef or provolatile<>volatility or proparallel<>'u'
       or proisstrict or proleakproof
       or proconfig is distinct from array['search_path=public, pg_temp']
       or not has_function_privilege('authenticated',oid,'EXECUTE')
       or not has_function_privilege('service_role',oid,'EXECUTE')
       or has_function_privilege('anon',oid,'EXECUTE')
       or has_function_privilege('public',oid,'EXECUTE')
       or (select count(*) from pg_proc overload
           join pg_namespace namespace on namespace.oid=overload.pronamespace
           where namespace.nspname='public' and overload.proname=actual.proname)<>1
  ),
  'SOURCE_ACCESS_BROWSER_OWNER_LANGUAGE_VOLATILITY_SEARCH_PATH_ACL_OVERLOAD');

select pg_temp.assert_true(
  (select owner.rolname='postgres' and language.lanname='sql'
          and procedure.provolatile='i' and not procedure.prosecdef
          and procedure.proparallel='s'
   from pg_proc procedure
   join pg_roles owner on owner.oid=procedure.proowner
   join pg_language language on language.oid=procedure.prolang
   where procedure.oid='public.vmp_source_scope_key(text)'::regprocedure)
  and (select count(*) from pg_proc procedure
       join pg_namespace namespace on namespace.oid=procedure.pronamespace
       where namespace.nspname='public' and procedure.proname='vmp_source_scope_key')=1,
  'SOURCE_ACCESS_SCOPE_KEY_EXACT_OWNER_LANGUAGE_IMMUTABLE_NO_OVERLOAD');

create temp table source_definer_inventory on commit drop as
select procedure.oid,procedure.oid::regprocedure::text signature,
       has_function_privilege('authenticated',procedure.oid,'EXECUTE') browser_execute,
       has_function_privilege('anon',procedure.oid,'EXECUTE') anon_execute,
       has_function_privilege('public',procedure.oid,'EXECUTE') public_execute,
       case
         when expected.signature is not null then expected.classification
         when not has_function_privilege('authenticated',procedure.oid,'EXECUTE')
          and not has_function_privilege('anon',procedure.oid,'EXECUTE')
          and not has_function_privilege('public',procedure.oid,'EXECUTE')
           then 'private_or_service_reviewed_by_inventory'
         else 'UNREVIEWED_BROWSER_READER'
       end classification
from pg_proc procedure
join pg_namespace namespace on namespace.oid=procedure.pronamespace
left join expected_browser_function expected
  on expected.signature=procedure.oid::regprocedure::text
where namespace.nspname='public' and procedure.prosecdef
  and (pg_get_functiondef(procedure.oid) ~* '\mvmp_source_objects\M'
    or pg_get_functiondef(procedure.oid) ~* '\mvmp_plan_items\M'
    or pg_get_functiondef(procedure.oid) ~* '\mvmp_item_assignments\M');

select pg_temp.assert_true(
  not exists (
    select 1 from source_definer_inventory
    where classification='UNREVIEWED_BROWSER_READER'
  ),
  'SOURCE_ACCESS_UNREVIEWED_EFFECTIVE_BROWSER_FUNCTION');

select pg_temp.assert_true(
  to_regprocedure('public.vmp_unfiltered_security_definer_item_readers()') is not null
  and pg_get_functiondef(
    'public.vmp_unfiltered_security_definer_item_readers()'::regprocedure
  ) ~* '\mvmp_source_objects\M'
  and pg_get_functiondef(
    'public.vmp_unfiltered_security_definer_item_readers()'::regprocedure
  ) ~* '\mvmp_plan_items\M'
  and pg_get_functiondef(
    'public.vmp_unfiltered_security_definer_item_readers()'::regprocedure
  ) ~* '\mvmp_item_assignments\M'
  and not exists (
    select 1 from public.vmp_unfiltered_security_definer_item_readers()
  ),
  'SOURCE_ACCESS_SECURITY_DEFINER_INVENTORY_HAS_UNREVIEWED_READER');

with source_policy as (
  select policy.polcmd,pg_get_expr(policy.polqual,policy.polrelid) using_expression,
         pg_get_expr(policy.polwithcheck,policy.polrelid) check_expression
  from pg_policy policy
  where policy.polrelid='public.vmp_source_objects'::regclass
), item_policy as (
  select policy.polcmd,pg_get_expr(policy.polqual,policy.polrelid) using_expression,
         pg_get_expr(policy.polwithcheck,policy.polrelid) check_expression
  from pg_policy policy
  where policy.polrelid='public.vmp_plan_items'::regclass
)
select pg_temp.assert_true(
  (select count(*) from source_policy)=1
  and (select polcmd='r'
         and using_expression='vmp_can_view_source_object(auth.uid(), id)'
         and check_expression is null from source_policy)
  and (select count(*) from item_policy)=1
  and (select polcmd='r'
         and using_expression='vmp_can_view_plan_item(auth.uid(), validation_code)'
         and check_expression is null from item_policy)
  and (select relrowsecurity from pg_class
       where oid='public.vmp_source_objects'::regclass)
  and (select relrowsecurity from pg_class
       where oid='public.vmp_plan_items'::regclass),
  'SOURCE_ACCESS_EXACT_SOURCE_ITEM_RLS_EXPRESSION');

select pg_temp.assert_true(
  (select relrowsecurity from pg_class
   where oid='public.vmp_source_workshop_scope_grants'::regclass)
  and (select relrowsecurity from pg_class
   where oid='public.vmp_item_assignments'::regclass)
  and (select count(*) from pg_policy
       where polrelid='public.vmp_source_workshop_scope_grants'::regclass)=1
  and (select count(*) from pg_policy
       where polrelid='public.vmp_item_assignments'::regclass)=1
  and not exists (
    select 1 from pg_policy policy
    where policy.polrelid in (
      'public.vmp_source_workshop_scope_grants'::regclass,
      'public.vmp_item_assignments'::regclass
    ) and policy.polpermissive
      and pg_get_expr(policy.polqual,policy.polrelid) in ('true','vmp_is_active_session(auth.uid())')
  ),
  'SOURCE_ACCESS_GRANT_ASSIGNMENT_RLS_FAILS_CLOSED');

select pg_temp.assert_true(
  not has_table_privilege('authenticated','public.vmp_source_objects','INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated','public.vmp_source_objects','UPDATE')
  and not has_table_privilege('authenticated','public.vmp_plan_items','INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated','public.vmp_plan_items','UPDATE')
  and not has_table_privilege('authenticated','public.vmp_item_assignments','INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated','public.vmp_item_assignments','UPDATE')
  and not has_table_privilege('authenticated','public.vmp_source_workshop_scope_grants','INSERT,UPDATE,DELETE')
  and not has_any_column_privilege('authenticated','public.vmp_source_workshop_scope_grants','UPDATE')
  and not has_table_privilege('authenticated','public.profiles','INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.vmp_performers','INSERT,UPDATE,DELETE'),
  'SOURCE_ACCESS_NO_DIRECT_AUTHENTICATED_MUTATION');

insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
values
  ('9a020000-0000-4000-8000-000000000001','authenticated','authenticated',
   'source-security-qa@example.test','x',now(),'{}','{}',now(),now()),
  ('9a020000-0000-4000-8000-000000000002','authenticated','authenticated',
   'source-security-workshop@example.test','x',now(),'{}','{}',now(),now());

insert into public.departments(id,name,short_name)
values ('QA','Source security QA fixture','QA'),
       ('SSEC_WS','Source security workshop fixture','SSW')
on conflict(id) do nothing;

insert into public.profiles(id,full_name,email,role,department,is_active)
values
  ('9a020000-0000-4000-8000-000000000001','Source Security QA',
   'source-security-qa@example.test','department_user','QA',true),
  ('9a020000-0000-4000-8000-000000000002','Source Security Workshop',
   'source-security-workshop@example.test','department_user','SSEC_WS',true);

update public.vmp_performers
set department=case when user_id='9a020000-0000-4000-8000-000000000001'
                    then 'QA' else 'SSEC_WS' end,
    access_class=case when user_id='9a020000-0000-4000-8000-000000000001'
                      then 'qa_progress_editor' else 'workshop_staff' end,
    is_active=true
where user_id in (
  '9a020000-0000-4000-8000-000000000001'::uuid,
  '9a020000-0000-4000-8000-000000000002'::uuid
);

create function pg_temp.assert_manager_surfaces_forbidden(p_persona text)
returns void language plpgsql security invoker as $$
begin
  perform pg_temp.assert_forbidden(
    public.rpc_list_catalog_dataset('products',null,'{}'::jsonb,1,0),
    p_persona||'_PRODUCTS_FORBIDDEN');
  perform pg_temp.assert_forbidden(
    public.rpc_list_catalog_dataset('alerts',null,'{}'::jsonb,1,0),
    p_persona||'_ALERTS_FORBIDDEN');
  perform pg_temp.assert_forbidden(
    public.rpc_stage_catalog_import(
      'objects','source-access-v1','source-access-fingerprint',null,'[]'::jsonb),
    p_persona||'_IMPORT_FORBIDDEN');
  perform pg_temp.assert_forbidden(
    public.rpc_list_catalog_changes('Thiết bị',null,1,0),
    p_persona||'_PENDING_FORBIDDEN');
  perform pg_temp.assert_forbidden(
    public.rpc_catalog_history('{}'::jsonb,1,0),
    p_persona||'_HISTORY_FORBIDDEN');
end
$$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object(
  'sub','9a020000-0000-4000-8000-000000000001','role','authenticated')::text,true);
select pg_temp.assert_manager_surfaces_forbidden('SOURCE_QA');

select set_config('request.jwt.claims',json_build_object(
  'sub','9a020000-0000-4000-8000-000000000002','role','authenticated')::text,true);
select pg_temp.assert_manager_surfaces_forbidden('SOURCE_WORKSHOP');

\echo 'PASS SECURITY exact metadata ACL overload RLS inventory direct mutation and manager-only surfaces'
rollback;

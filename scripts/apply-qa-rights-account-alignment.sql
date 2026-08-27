\set ON_ERROR_STOP on

\if :{?khoa_id}
\else
\echo 'khoa_id is required.'
do $$
begin
  raise exception using errcode = '22023',
    message = 'KHOA_ID_PSQL_VARIABLE_REQUIRED';
end
$$;
\endif

\if :{?dat_id}
\else
\echo 'dat_id is required.'
do $$
begin
  raise exception using errcode = '22023',
    message = 'DAT_ID_PSQL_VARIABLE_REQUIRED';
end
$$;
\endif

\if :{?viewer_ids}
\else
\echo 'viewer_ids is required (exactly two comma-separated UUIDs).'
do $$
begin
  raise exception using errcode = '22023',
    message = 'VIEWER_IDS_PSQL_VARIABLE_REQUIRED';
end
$$;
\endif

-- The five-role migration intentionally consumes transaction-local guards and
-- therefore needs the explicit transaction below. The four later migrations
-- own their BEGIN/COMMIT. ON_ERROR_STOP remains fail-fast between boundaries;
-- the account manifest owns a separate all-or-nothing account transaction.
\o /dev/null
with function_contract as (
  select p.oid::regprocedure::text identity,
         encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex') definition_hash,
         owner.rolname owner_name,p.prosecdef,p.provolatile,p.proconfig,p.proacl
  from pg_proc p join pg_roles owner on owner.oid=p.proowner
  where p.oid in (
    to_regprocedure('public.vmp_item_rights(uuid,text)'),
    to_regprocedure('public.vmp_my_item_rights(text)'),
    to_regprocedure('public.rpc_update_progress(text,jsonb,text,jsonb,integer)'),
    to_regprocedure('public.rpc_refresh_source_item_assignments()')
  )
), matrix_contract as (
  select count(*) row_count,count(distinct business_role) role_count,
         encode(extensions.digest(string_agg(format(
           '%s|%s|%s|%s|%s',business_role,screen_id,can_view,
           data_scope,array_to_string(actions,',')),E'\n'
           order by business_role,screen_id),'sha256'),'hex') matrix_hash
  from public.vmp_screen_permissions
)
select (
  to_regprocedure('public.vmp_is_active_session(uuid)') is not null
  and to_regprocedure('public.rpc_preview_catalog_change_v2(uuid)') is not null
  and to_regprocedure('public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)') is not null
  and to_regprocedure('public.vmp_manager_principal(uuid)') is not null
  and (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='vmp_item_rights')=1
  and (select row_count=85 and role_count=5
       and matrix_hash='6c8fb41b9ed3336bc91cdd3fa965474b39e0ad18a22f91d24eba071328938e85'
       from matrix_contract)
  and (select count(*)=4 from function_contract)
  and exists (select 1 from function_contract where identity='vmp_item_rights(uuid,text)'
    and definition_hash='9cfba864d7ea650370d6d76c33e2afcfbf941bb6918a90eeedec77f0513ab0db'
    and owner_name='postgres' and prosecdef and provolatile='s'
    and proconfig=array['search_path=public, pg_temp']
    and proacl=array['postgres=X/postgres','service_role=X/postgres']::aclitem[])
  and exists (select 1 from function_contract where identity='vmp_my_item_rights(text)'
    and definition_hash='c7a326defaedd0cf9056a284e480d69027a56cd35f2ca6f09b4a9e321f1ad76d'
    and owner_name='postgres' and prosecdef and provolatile='s'
    and proconfig=array['search_path=public, pg_temp']
    and proacl=array['postgres=X/postgres','service_role=X/postgres',
                     'authenticated=X/postgres']::aclitem[])
  and exists (select 1 from function_contract
    where identity='rpc_update_progress(text,jsonb,text,jsonb,integer)'
    and definition_hash='da25f8acbcc5aa3e029e581acb79f210cf1d6c61ab0e8458e4ff89146e75f4a0'
    and owner_name='postgres' and prosecdef and provolatile='v'
    and proconfig=array['search_path=public, pg_temp']
    and proacl=array['postgres=X/postgres','service_role=X/postgres',
                     'authenticated=X/postgres']::aclitem[])
  and exists (select 1 from function_contract
    where identity='rpc_refresh_source_item_assignments()'
    and definition_hash='a4bd208fc467a14b9d0383d6af486f59a66f52d8b68d4bc614b92627a73524e7'
    and owner_name='postgres' and prosecdef and provolatile='v'
    and proconfig=array['search_path=public, pg_temp']
    and proacl=array['postgres=X/postgres','service_role=X/postgres']::aclitem[])
  and public.screen_access_mode()='enforced'
  and public.item_permissions_mode()='preview'
)::text as qa_rights_schema_ready
\gset
\o

\if :qa_rights_schema_ready
\echo 'Reviewed QA-rights schema chain is already present; verifying the account manifest.'
\else
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
\ir ../supabase/migrations/20260824120000_five_role_permission_hardening.sql
commit;
\ir ../supabase/migrations/20260826130000_catalog_progressed_deadline_override.sql
\ir ../supabase/migrations/20260826170000_manual_planned_deadline_edit.sql
\ir ../supabase/migrations/20260826180000_qa_manager_actual_date_principal_normalization.sql
\ir ../supabase/migrations/20260827100000_qa_rights_account_alignment.sql
\endif

\ir apply-qa-rights-account-manifest.sql

-- Forward recovery for the assigned-progress writer only.
-- The additive batch RPC stays available; roles, assignments, Source Data
-- records and global permission modes are deliberately outside this artifact.
\set ON_ERROR_STOP on

begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';

do $ASSIGNED_PROGRESS_RECOVERY_PRECONDITION$
declare
  v_public oid := to_regprocedure(
    'public.rpc_update_progress(text,jsonb,text,jsonb,integer)');
  v_public_hash text;
begin
  if public.screen_access_mode() is distinct from 'enforced'
     or public.item_permissions_mode() is distinct from 'preview' then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_RECOVERY_PRECONDITION_PERMISSION_MODES';
  end if;

  if v_public is null then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_RECOVERY_PRECONDITION_PUBLIC_WRITER_MISSING';
  end if;
  select encode(extensions.digest(pg_get_functiondef(v_public),'sha256'),'hex')
    into v_public_hash;
  if v_public_hash not in (
       '7e36d2360211c68d203e1fc47f8b9ab5794e6a2a88b21c2fea24cefcac6b5f8e',
       'da25f8acbcc5aa3e029e581acb79f210cf1d6c61ab0e8458e4ff89146e75f4a0'
     ) then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_RECOVERY_PRECONDITION_PUBLIC_WRITER_DRIFT';
  end if;

  if exists (
    select 1
    from (values
      ('public.rpc_my_editable_progress_rights()',
       'a769f237d9f92c52ca9bfb5c5f6511a3b96078dd3015678bc6e78003f7243f6b',
       '2a1ef91d0f29fa4af8e8a31223aea79e81dbf05d2c6c031cc6225d41f1d27492'),
      ('public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)',
       'd0df69bd8e9f7a2d8cfa5f5f87bd15e4559599d05c125e0b35f038ca5b25865a',
       '796e6afd55e5b79a064cf28ea74ff5b0a79589434d67e373b2c529482669d661'),
      ('public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)',
       '55f7f86442b88a12c39e1f3cb6dd867d0aae0a684db78365bcef673a473e2644',
       'd53c3f00db2b7e3559362d1c0ddd08607a0e188d1050126612ffaa5d6e86b28e'),
      ('public.rpc_save_catalog_object(text,text,jsonb,text,integer)',
       '81fbd19e43d3859cd28cb958fc311f1f8b693f659aca9371155433a0b70a1d29',
       '895edcfcd1fc3695a3bed4f873c2089bc1f7c55def39c2dd70d97c53a2524c81'),
      ('public.rpc_refresh_source_item_assignments()',
       'a4bd208fc467a14b9d0383d6af486f59a66f52d8b68d4bc614b92627a73524e7',
       '6a9ed96b583771d86cc97d11693376ad337c51ef71cb4f9c5af974d0a86f76df')
    ) reviewed(signature,definition_hash,metadata_hash)
    left join pg_proc procedure
      on procedure.oid=to_regprocedure(reviewed.signature)
    left join pg_roles owner on owner.oid=procedure.proowner
    left join pg_language language on language.oid=procedure.prolang
    where procedure.oid is null
       or encode(extensions.digest(pg_get_functiondef(procedure.oid),'sha256'),'hex')
            is distinct from reviewed.definition_hash
       or encode(extensions.digest(concat_ws('|',owner.rolname,language.lanname,
            procedure.prosecdef::text,procedure.provolatile::text,
            procedure.proparallel::text,procedure.proisstrict::text,
            procedure.proleakproof::text,
            coalesce(array_to_string(procedure.proconfig,','),''),
            coalesce(array_to_string(procedure.proacl,','),''),
            pg_get_function_result(procedure.oid)),'sha256'),'hex')
            is distinct from reviewed.metadata_hash
  ) then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_RECOVERY_PRECONDITION_DEPENDENCY_DRIFT';
  end if;
end
$ASSIGNED_PROGRESS_RECOVERY_PRECONDITION$;

create or replace function public.rpc_update_progress(
  p_validation_code text,
  p_patch jsonb,
  p_reason text default null,
  p_sheet_patch jsonb default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $wrapper$ begin if coalesce(auth.role(), '') not in ('', 'service_role') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.rpc_update_progress__five_role_impl_20260824(p_validation_code, p_patch, p_reason, p_sheet_patch, p_expected_version); end $wrapper$;

alter function public.rpc_update_progress(text,jsonb,text,jsonb,integer)
  owner to postgres;
alter function public.rpc_update_progress(text,jsonb,text,jsonb,integer)
  volatile;
alter function public.rpc_update_progress(text,jsonb,text,jsonb,integer)
  security definer;
alter function public.rpc_update_progress(text,jsonb,text,jsonb,integer)
  set search_path=public,pg_temp;
revoke all on function public.rpc_update_progress(text,jsonb,text,jsonb,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_update_progress(text,jsonb,text,jsonb,integer)
  to service_role;
grant execute on function public.rpc_update_progress(text,jsonb,text,jsonb,integer)
  to authenticated;

do $ASSIGNED_PROGRESS_RECOVERY_POSTCONDITION$
declare
  v_public oid := 'public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure;
  v_metadata_hash text;
begin
  select encode(extensions.digest(concat_ws('|',owner.rolname,language.lanname,
           procedure.prosecdef::text,procedure.provolatile::text,
           procedure.proparallel::text,procedure.proisstrict::text,
           procedure.proleakproof::text,
           coalesce(array_to_string(procedure.proconfig,','),''),
           coalesce(array_to_string(procedure.proacl,','),''),
           pg_get_function_result(procedure.oid)),'sha256'),'hex')
    into strict v_metadata_hash
  from pg_proc procedure
  join pg_roles owner on owner.oid=procedure.proowner
  join pg_language language on language.oid=procedure.prolang
  where procedure.oid=v_public;

  if encode(extensions.digest(pg_get_functiondef(v_public),'sha256'),'hex')
       is distinct from
       'da25f8acbcc5aa3e029e581acb79f210cf1d6c61ab0e8458e4ff89146e75f4a0'
     or v_metadata_hash is distinct from
       '895edcfcd1fc3695a3bed4f873c2089bc1f7c55def39c2dd70d97c53a2524c81' then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_RECOVERY_POSTCONDITION_PUBLIC_WRITER';
  end if;

  if has_function_privilege('public',v_public,'EXECUTE')
     or has_function_privilege('anon',v_public,'EXECUTE')
     or not has_function_privilege('authenticated',v_public,'EXECUTE')
     or not has_function_privilege('service_role',v_public,'EXECUTE')
     or has_function_privilege('public',
       'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)','EXECUTE')
     or has_function_privilege('anon',
       'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)','EXECUTE')
     or has_function_privilege('service_role',
       'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)','EXECUTE') then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_RECOVERY_POSTCONDITION_ACL';
  end if;

  if public.screen_access_mode() is distinct from 'enforced'
     or public.item_permissions_mode() is distinct from 'preview'
     or encode(extensions.digest(pg_get_functiondef(
       'public.rpc_my_editable_progress_rights()'::regprocedure),'sha256'),'hex')
        is distinct from
        'a769f237d9f92c52ca9bfb5c5f6511a3b96078dd3015678bc6e78003f7243f6b'
     or encode(extensions.digest(pg_get_functiondef(
       'public.rpc_update_progress__assigned_impl_20260827(text,jsonb,text,jsonb,integer)'::regprocedure),'sha256'),'hex')
        is distinct from
        'd0df69bd8e9f7a2d8cfa5f5f87bd15e4559599d05c125e0b35f038ca5b25865a'
     or encode(extensions.digest(pg_get_functiondef(
       'public.rpc_save_catalog_object(text,text,jsonb,text,integer)'::regprocedure),'sha256'),'hex')
        is distinct from
        '81fbd19e43d3859cd28cb958fc311f1f8b693f659aca9371155433a0b70a1d29'
     or encode(extensions.digest(pg_get_functiondef(
       'public.rpc_refresh_source_item_assignments()'::regprocedure),'sha256'),'hex')
        is distinct from
        'a4bd208fc467a14b9d0383d6af486f59a66f52d8b68d4bc614b92627a73524e7' then
    raise exception using errcode='check_violation',
      message='ASSIGNED_PROGRESS_RECOVERY_POSTCONDITION_BOUNDARY_DRIFT';
  end if;
end
$ASSIGNED_PROGRESS_RECOVERY_POSTCONDITION$;

commit;

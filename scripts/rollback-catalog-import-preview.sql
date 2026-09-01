begin;

do $rollback_guard$
begin
  if to_regprocedure('public.rpc_export_source_objects__manager_lock_impl_20260901(text,text,jsonb,jsonb,integer)') is null then
    raise exception using errcode='undefined_function',
      message='CATALOG_IMPORT_PREVIEW_ROLLBACK_EXPORT_IMPL_MISSING';
  end if;
end
$rollback_guard$;

drop function if exists public.rpc_catalog_import_preview(uuid,integer,integer);
drop function if exists public.rpc_export_source_objects(text,text,jsonb,jsonb,integer);

alter function public.rpc_export_source_objects__manager_lock_impl_20260901(text,text,jsonb,jsonb,integer)
  rename to rpc_export_source_objects;
revoke all on function public.rpc_export_source_objects(text,text,jsonb,jsonb,integer)
  from public,anon;
grant execute on function public.rpc_export_source_objects(text,text,jsonb,jsonb,integer)
  to authenticated,service_role;

commit;

begin read only;

do $postflight$
declare
  v_definition text;
  v_acl_ok boolean;
begin
  if to_regprocedure('public.rpc_catalog_import_preview(uuid,integer,integer)') is null
     or to_regprocedure('public.rpc_export_source_objects(text,text,jsonb,jsonb,integer)') is null
     or to_regprocedure('public.rpc_export_source_objects__manager_lock_impl_20260901(text,text,jsonb,jsonb,integer)') is null then
    raise exception using errcode='undefined_function',
      message='CATALOG_IMPORT_PREVIEW_POSTFLIGHT_FUNCTION_MISSING';
  end if;

  select pg_get_functiondef('public.rpc_catalog_import_preview(uuid,integer,integer)'::regprocedure)
  into v_definition;
  if v_definition !~ 'batch\.uploaded_by\s*=\s*auth\.uid'
     or v_definition !~ 'row_number\s*>\s*p_cursor'
     or v_definition !~ 'BATCH_NOT_FOUND'
     or v_definition !~ 'service_role'
     or v_definition !~ 'next_cursor'
     or v_definition ~ '''(uploaded_by|expected_version|input)''' then
    raise exception using errcode='check_violation',
      message='CATALOG_IMPORT_PREVIEW_POSTFLIGHT_DEFINITION_DRIFT uploaded_by|expected_version|input';
  end if;

  select has_function_privilege('authenticated',
           'public.rpc_catalog_import_preview(uuid,integer,integer)','EXECUTE')
     and not has_function_privilege('anon',
           'public.rpc_catalog_import_preview(uuid,integer,integer)','EXECUTE')
     and not has_function_privilege('authenticated',
           'public.rpc_export_source_objects__manager_lock_impl_20260901(text,text,jsonb,jsonb,integer)','EXECUTE')
  into v_acl_ok;
  if not coalesce(v_acl_ok,false) then
    raise exception using errcode='insufficient_privilege',
      message='CATALOG_IMPORT_PREVIEW_POSTFLIGHT_ACL_DRIFT';
  end if;
end
$postflight$;

rollback;
select 'PASS CATALOG_IMPORT_PREVIEW_POSTFLIGHT' as result;

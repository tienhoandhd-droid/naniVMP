begin read only;

do $preflight$
declare
  v_missing text;
begin
  if to_regprocedure('public.rpc_catalog_import_preview(uuid,integer,integer)') is not null then
    raise exception using errcode='duplicate_function',
      message='CATALOG_IMPORT_PREVIEW_PREFLIGHT_RPC_ALREADY_EXISTS';
  end if;
  if to_regprocedure('public.rpc_export_source_objects(text,text,jsonb,jsonb,integer)') is null
     or to_regprocedure('public.rpc_stage_catalog_import(text,text,text,text,jsonb)') is null
     or to_regprocedure('public.rpc_commit_catalog_import(uuid,text)') is null
     or to_regprocedure('public.rpc_set_catalog_import_row_reason(uuid,integer,text)') is null
     or to_regprocedure('public.vmp_is_active_session(uuid)') is null
     or to_regprocedure('public.vmp_business_role(uuid)') is null then
    raise exception using errcode='undefined_function',
      message='CATALOG_IMPORT_PREVIEW_PREFLIGHT_REQUIRED_FUNCTION_MISSING';
  end if;
  if to_regclass('public.vmp_catalog_import_batches') is null
     or to_regclass('public.vmp_catalog_import_rows') is null then
    raise exception using errcode='undefined_table',
      message='CATALOG_IMPORT_PREVIEW_PREFLIGHT_STAGING_TABLE_MISSING';
  end if;

  select string_agg(required.column_name,', ' order by required.column_name)
  into v_missing
  from (values
    ('vmp_catalog_import_batches','id'),('vmp_catalog_import_batches','dataset'),
    ('vmp_catalog_import_batches','status'),('vmp_catalog_import_batches','total_rows'),
    ('vmp_catalog_import_batches','so_tao_moi'),('vmp_catalog_import_batches','so_sua'),
    ('vmp_catalog_import_batches','so_khong_doi'),('vmp_catalog_import_batches','so_loi'),
    ('vmp_catalog_import_batches','created_at'),('vmp_catalog_import_batches','committed_at'),
    ('vmp_catalog_import_batches','uploaded_by'),('vmp_catalog_import_rows','batch_id'),
    ('vmp_catalog_import_rows','row_number'),('vmp_catalog_import_rows','business_key'),
    ('vmp_catalog_import_rows','object_kind'),('vmp_catalog_import_rows','classification'),
    ('vmp_catalog_import_rows','current_snapshot'),('vmp_catalog_import_rows','patch'),
    ('vmp_catalog_import_rows','errors'),('vmp_catalog_import_rows','row_reason')
  ) required(table_name,column_name)
  where not exists (
    select 1 from information_schema.columns actual
    where actual.table_schema='public' and actual.table_name=required.table_name
      and actual.column_name=required.column_name);
  if v_missing is not null then
    raise exception using errcode='undefined_column',
      message='CATALOG_IMPORT_PREVIEW_PREFLIGHT_COLUMNS_MISSING: '||v_missing;
  end if;
end
$preflight$;

rollback;
select 'PASS CATALOG_IMPORT_PREVIEW_PREFLIGHT' as result;

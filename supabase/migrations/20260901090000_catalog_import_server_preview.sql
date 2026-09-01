begin;

do $precondition$
begin
  if to_regprocedure('public.rpc_export_source_objects(text,text,jsonb,jsonb,integer)') is null then
    raise exception using errcode='undefined_function',
      message='CATALOG_IMPORT_PREVIEW_MISSING_EXPORT_RPC';
  end if;
  if to_regprocedure('public.rpc_export_source_objects__manager_lock_impl_20260901(text,text,jsonb,jsonb,integer)') is not null then
    raise exception using errcode='duplicate_function',
      message='CATALOG_IMPORT_PREVIEW_EXPORT_IMPL_ALREADY_EXISTS';
  end if;
  if to_regprocedure('public.vmp_is_active_session(uuid)') is null
     or to_regprocedure('public.vmp_business_role(uuid)') is null then
    raise exception using errcode='undefined_function',
      message='CATALOG_IMPORT_PREVIEW_MISSING_AUTH_HELPER';
  end if;
  if to_regclass('public.vmp_catalog_import_batches') is null
     or to_regclass('public.vmp_catalog_import_rows') is null then
    raise exception using errcode='undefined_table',
      message='CATALOG_IMPORT_PREVIEW_MISSING_STAGING_TABLE';
  end if;
end
$precondition$;

-- Preserve the audited, scope-filtered export implementation and expose it
-- only through the manager guard below. Renaming keeps rollback lossless.
alter function public.rpc_export_source_objects(text,text,jsonb,jsonb,integer)
  rename to rpc_export_source_objects__manager_lock_impl_20260901;

revoke all on function
  public.rpc_export_source_objects__manager_lock_impl_20260901(text,text,jsonb,jsonb,integer)
  from public,anon,authenticated;

create function public.rpc_export_source_objects(
  p_object_kind text,
  p_search text,
  p_filters jsonb,
  p_cursor jsonb,
  p_limit integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
declare
  v_role text;
begin
  if coalesce(auth.role(),'')='service_role' then
    return public.rpc_export_source_objects__manager_lock_impl_20260901(
      p_object_kind,p_search,p_filters,p_cursor,p_limit);
  end if;

  if not public.vmp_is_active_session(auth.uid()) then
    return jsonb_build_object('ok',false,'error_code','SESSION_INACTIVE',
      'error','Phiên không hoạt động');
  end if;

  v_role:=public.vmp_business_role(auth.uid());
  if not (v_role in ('admin','qa_manager')) then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Chỉ Admin và Quản lý QA được xuất Dữ liệu nguồn');
  end if;

  return public.rpc_export_source_objects__manager_lock_impl_20260901(
    p_object_kind,p_search,p_filters,p_cursor,p_limit);
end
$function$;

create or replace function public.rpc_catalog_import_preview(
  p_batch_id uuid,
  p_cursor integer default 0,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare
  v_batch public.vmp_catalog_import_batches%rowtype;
  v_role text;
  v_is_service boolean:=coalesce(auth.role(),'')='service_role';
  v_allowed_fields constant text[]:=array[
    'object_code','object_name','department','area_code','line','validate_flag',
    'frequency_months','first_month','year_ref','report_class','work_group',
    'workdays','complexity_score','quality_impact_score','note','is_active'
  ]::text[];
  v_rows jsonb;
  v_has_more boolean;
  v_last_row integer;
begin
  if p_batch_id is null or p_cursor is null or p_cursor<0
     or p_limit is null or p_limit<1 or p_limit>200 then
    return jsonb_build_object('ok',false,'error_code','INVALID_ARGUMENT',
      'error','Tham số không hợp lệ');
  end if;

  if not v_is_service then
    if not public.vmp_is_active_session(auth.uid()) then
      return jsonb_build_object('ok',false,'error_code','SESSION_INACTIVE',
        'error','Phiên không hoạt động');
    end if;
    v_role:=public.vmp_business_role(auth.uid());
    if not (v_role in ('admin','qa_manager')) then
      return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
        'error','Chỉ Admin và Quản lý QA được xem trước dữ liệu nhập');
    end if;

    select batch.* into v_batch
    from public.vmp_catalog_import_batches batch
    where batch.id=p_batch_id and batch.uploaded_by=auth.uid()
      and batch.dataset in ('source_objects','objects');
  else
    select batch.* into v_batch
    from public.vmp_catalog_import_batches batch
    where batch.id=p_batch_id
      and batch.dataset in ('source_objects','objects');
  end if;

  if not found then
    return jsonb_build_object('ok',false,'error_code','BATCH_NOT_FOUND',
      'error','Không tìm thấy lô nhập');
  end if;
  if lower(v_batch.status)='expired' then
    return jsonb_build_object('ok',false,'error_code','BATCH_EXPIRED',
      'error','Lô nhập đã hết hạn');
  end if;

  with page_plus_one as (
    select import_row.*
    from public.vmp_catalog_import_rows import_row
    where import_row.batch_id=v_batch.id
      and import_row.row_number>p_cursor
    order by import_row.row_number
    limit p_limit+1
  ), returned as (
    select * from page_plus_one
    order by row_number
    limit p_limit
  ), encoded as (
    select returned.row_number,
      jsonb_build_object(
        'row_number',returned.row_number,
        'business_key',coalesce(returned.business_key,''),
        'object_kind',returned.object_kind,
        'classification',case lower(returned.classification)
          when 'create' then 'create' when 'new' then 'create'
          when 'moi' then 'create' when 'tao_moi' then 'create'
          when 'update' then 'update' when 'updated' then 'update'
          when 'sua' then 'update' when 'cap_nhat' then 'update'
          when 'unchanged' then 'unchanged' when 'no_change' then 'unchanged'
          when 'khongdoi' then 'unchanged' when 'khong_doi' then 'unchanged'
          else 'error' end,
        'current_snapshot',case
          when returned.current_snapshot is null then null
          else coalesce((select jsonb_object_agg(field.key,field.value)
            from jsonb_each(returned.current_snapshot) field
            where field.key=any(v_allowed_fields)),'{}'::jsonb) end,
        'patch',coalesce((select jsonb_object_agg(field.key,field.value)
          from jsonb_each(case when jsonb_typeof(returned.patch)='object'
            then returned.patch else '{}'::jsonb end) field
          where field.key=any(v_allowed_fields)),'{}'::jsonb),
        'errors',coalesce((select jsonb_agg(jsonb_build_object(
          'code',case when jsonb_typeof(error_item)='object'
            then coalesce(nullif(error_item->>'code',''),'ROW_ERROR') else 'ROW_ERROR' end,
          'message',case when jsonb_typeof(error_item)='object'
            then coalesce(nullif(error_item->>'message',''),'Lỗi dữ liệu')
            else trim(both '"' from error_item::text) end,
          'field',case when jsonb_typeof(error_item)='object'
            then nullif(error_item->>'field','') else null end
        )) from jsonb_array_elements(case when jsonb_typeof(returned.errors)='array'
          then returned.errors else '[]'::jsonb end) error_item),'[]'::jsonb),
        'row_reason',returned.row_reason
      ) payload
    from returned
  )
  select coalesce((select jsonb_agg(encoded.payload order by encoded.row_number)
                    from encoded),'[]'::jsonb),
         (select count(*) from page_plus_one)>p_limit,
         (select max(encoded.row_number) from encoded)
  into v_rows,v_has_more,v_last_row;

  return jsonb_build_object(
    'ok',true,
    'batch',jsonb_build_object(
      'id',v_batch.id,
      'dataset','source_objects',
      'status',lower(v_batch.status),
      'total',v_batch.total_rows,
      'counts',jsonb_build_object(
        'created',v_batch.so_tao_moi,
        'updated',v_batch.so_sua,
        'unchanged',v_batch.so_khong_doi,
        'errors',v_batch.so_loi),
      'created_at',v_batch.created_at,
      'committed_at',v_batch.committed_at),
    'rows',v_rows,
    'next_cursor',case when v_has_more then v_last_row else null end);
end
$function$;

comment on function public.rpc_catalog_import_preview(uuid,integer,integer) is
  'Manager-only, uploader-scoped, allowlisted preview of staged Source import rows.';
comment on function public.rpc_export_source_objects(text,text,jsonb,jsonb,integer) is
  'Manager-only wrapper for the audited Source export implementation.';

revoke all on function public.rpc_catalog_import_preview(uuid,integer,integer)
  from public,anon;
revoke all on function public.rpc_export_source_objects(text,text,jsonb,jsonb,integer)
  from public,anon;
grant execute on function public.rpc_catalog_import_preview(uuid,integer,integer)
  to authenticated,service_role;
grant execute on function public.rpc_export_source_objects(text,text,jsonb,jsonb,integer)
  to authenticated,service_role;

commit;

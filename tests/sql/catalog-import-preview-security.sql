begin;

do $security$
declare
  v_uploader uuid;
  v_other_manager uuid;
  v_lower uuid;
  v_batch uuid:=gen_random_uuid();
  v_other_batch uuid:=gen_random_uuid();
  v_result jsonb;
begin
  select profile.id into v_uploader
  from public.profiles profile
  where public.vmp_is_active_session(profile.id)
    and public.vmp_business_role(profile.id) in ('admin','qa_manager')
  order by (public.vmp_business_role(profile.id)='admin') desc,profile.id
  limit 1;
  select profile.id into v_other_manager
  from public.profiles profile
  where profile.id<>v_uploader and public.vmp_is_active_session(profile.id)
    and public.vmp_business_role(profile.id) in ('admin','qa_manager')
  order by profile.id limit 1;
  select profile.id into v_lower
  from public.profiles profile
  where public.vmp_is_active_session(profile.id)
    and public.vmp_business_role(profile.id) in ('qa_staff','workshop_manager','workshop_staff')
  order by profile.id limit 1;
  if v_uploader is null or v_other_manager is null or v_lower is null then
    raise exception using errcode='object_not_in_prerequisite_state',
      message='CATALOG_IMPORT_PREVIEW_SECURITY_NEEDS_TWO_MANAGERS_AND_ONE_LOWER_ROLE';
  end if;

  insert into public.vmp_catalog_import_batches(
    id,dataset,template_version,fingerprint,status,total_rows,
    so_tao_moi,so_sua,so_khong_doi,so_loi,uploaded_by
  ) values
    (v_batch,'source_objects','security-v1','security-owner','validated',2,1,1,0,0,v_uploader),
    (v_other_batch,'source_objects','security-v1','security-other','validated',1,1,0,0,0,v_other_manager);
  insert into public.vmp_catalog_import_rows(
    batch_id,row_number,business_key,object_kind,classification,
    current_snapshot,patch,errors,input,row_reason
  ) values
    (v_batch,2,'SEC-PREVIEW-001','Thiết bị','create',null,
      '{"object_code":"SEC-PREVIEW-001","object_name":"Máy kiểm thử","uploaded_by":"must-not-leak"}'::jsonb,
      '[]'::jsonb,'{"secret":"must-not-leak"}'::jsonb,null),
    (v_batch,3,'SEC-PREVIEW-002','Thiết bị','update',
      '{"object_code":"SEC-PREVIEW-002","object_name":"Tên cũ","expected_version":99}'::jsonb,
      '{"object_name":"Tên mới"}'::jsonb,'[]'::jsonb,'{}'::jsonb,'Lý do dòng');

  perform set_config('request.jwt.claims',json_build_object(
    'sub',v_uploader,'role','authenticated')::text,true);
  v_result:=public.rpc_catalog_import_preview(v_batch,0,1);
  if v_result->>'ok' is distinct from 'true'
     or v_result#>>'{batch,id}' is distinct from v_batch::text
     or jsonb_array_length(v_result->'rows')<>1
     or v_result->>'next_cursor' is distinct from '2'
     or v_result::text ~ 'uploaded_by|expected_version|must-not-leak' then
    raise exception using errcode='check_violation',
      message='CATALOG_IMPORT_PREVIEW_SECURITY_OWNER_OR_ALLOWLIST_FAILED';
  end if;
  v_result:=public.rpc_catalog_import_preview(v_batch,2,200);
  if v_result->>'ok' is distinct from 'true'
     or v_result#>>'{rows,0,row_number}' is distinct from '3'
     or v_result->'next_cursor' is distinct from 'null'::jsonb then
    raise exception using errcode='check_violation',
      message='CATALOG_IMPORT_PREVIEW_SECURITY_KEYSET_FAILED';
  end if;
  if public.rpc_catalog_import_preview(v_batch,0,0)->>'error_code' is distinct from 'INVALID_ARGUMENT'
     or public.rpc_catalog_import_preview(v_batch,0,201)->>'error_code' is distinct from 'INVALID_ARGUMENT' then
    raise exception using errcode='check_violation',
      message='CATALOG_IMPORT_PREVIEW_SECURITY_LIMIT_FAILED';
  end if;

  perform set_config('request.jwt.claims',json_build_object(
    'sub',v_other_manager,'role','authenticated')::text,true);
  if public.rpc_catalog_import_preview(v_batch,0,100)->>'error_code' is distinct from 'BATCH_NOT_FOUND' then
    raise exception using errcode='check_violation',
      message='CATALOG_IMPORT_PREVIEW_SECURITY_OTHER_MANAGER_LEAK';
  end if;

  perform set_config('request.jwt.claims',json_build_object(
    'sub',v_lower,'role','authenticated')::text,true);
  if public.rpc_catalog_import_preview(v_batch,0,100)->>'error_code' is distinct from 'FORBIDDEN'
     or public.rpc_export_source_objects(null,'','{}'::jsonb,null,10)->>'error_code' is distinct from 'FORBIDDEN'
     or public.rpc_stage_catalog_import('source_objects','security-v1','security-lower',null,'[]'::jsonb)->>'error_code' is distinct from 'FORBIDDEN' then
    raise exception using errcode='check_violation',
      message='CATALOG_IMPORT_PREVIEW_SECURITY_LOWER_ROLE_NOT_READ_ONLY';
  end if;

  perform set_config('request.jwt.claims',json_build_object(
    'role','service_role')::text,true);
  if public.rpc_catalog_import_preview(v_batch,0,100)->>'ok' is distinct from 'true' then
    raise exception using errcode='check_violation',
      message='CATALOG_IMPORT_PREVIEW_SECURITY_SERVICE_ROLE_FAILED';
  end if;

  if has_function_privilege('anon',
       'public.rpc_catalog_import_preview(uuid,integer,integer)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.rpc_export_source_objects__manager_lock_impl_20260901(text,text,jsonb,jsonb,integer)','EXECUTE') then
    raise exception using errcode='insufficient_privilege',
      message='CATALOG_IMPORT_PREVIEW_SECURITY_ACL_FAILED';
  end if;
end
$security$;

rollback;
select 'PASS CATALOG_IMPORT_PREVIEW_SECURITY' as result;

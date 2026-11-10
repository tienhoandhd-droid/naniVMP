-- Đợt A (rà soát 10/11/2026): Danh mục chặn trùng mã + thu hồi phạm vi xưởng.
-- Thân hàm chép nguyên văn bản mới nhất trong repo, chỉ chèn phần sửa:
--  * A1: rpc_save_catalog_object__five_role_impl_20260824 (từ 20261016140000).
--  * A2: rpc_set_source_workshop_scope_grant (từ 20260828150000).
-- Owner/SECURITY DEFINER/search_path giữ nguyên; create or replace giữ ACL.

CREATE OR REPLACE FUNCTION public.rpc_save_catalog_object__five_role_impl_20260824(p_object_kind text, p_object_code text, p_patch jsonb, p_reason text DEFAULT NULL::text, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_role text:=public.vmp_business_role(auth.uid());
  v_patch jsonb:=coalesce(p_patch,'{}'::jsonb);
  v_bad text[];
  v_source public.vmp_source_objects%rowtype;
  v_after public.vmp_source_objects%rowtype;
  v_owner public.vmp_performers%rowtype;
  v_support public.vmp_performers%rowtype;
  v_owner_id uuid;
  v_support_id uuid;
  v_master_patch jsonb;
  v_timeline_patch jsonb:='{}'::jsonb;
  v_timeline_old jsonb:='{}'::jsonb;
  v_result jsonb;
  v_access_change boolean;
  v_owner_change boolean;
  v_support_change boolean;
  v_timeline_change boolean;
  v_change_id uuid;
  v_changed_fields text[];
  v_created boolean;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    if not public.vmp_is_active_session(v_actor)
       or not public.vmp_can_manage_source_qa_assignment(v_actor) then
      return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
        'error','Chỉ Admin và Quản lý QA được sửa danh mục Source');
    end if;
  end if;

  if jsonb_typeof(v_patch)<>'object' then
    return jsonb_build_object('ok',false,'error_code','PATCH_INVALID',
      'error','Patch phải là JSON object');
  end if;
  select array_agg(key order by key) into v_bad
  from jsonb_object_keys(v_patch) key
  where key<>all(array[
    'object_name','department','area_code','line','status','show_flag',
    'validate_flag','validate_reason','frequency_months','report_class',
    'workdays','first_month','year_ref','note','critical_point','work_group',
    'complexity_score','quality_impact_score','criticality_score',
    'owner_person_id','support_person_id','owner_name','support_name',
    'is_active'
  ]::text[]);
  if v_bad is not null then
    return jsonb_build_object('ok',false,
      'error_code','PATCH_FIELD_NOT_ALLOWED',
      'error','Trường không được phép sửa: '||array_to_string(v_bad,', '));
  end if;
  if (v_patch?'owner_name' and not (v_patch?'owner_person_id'))
     or (v_patch?'support_name' and not (v_patch?'support_person_id')) then
    return jsonb_build_object('ok',false,'error_code','PERSON_ID_REQUIRED',
      'error','QA phụ trách/hỗ trợ phải được chọn bằng person_id');
  end if;

  -- Acquire the final table mode before the first Source tuple. The public
  -- wrapper already holds the per-object advisory drained by deployments.
  lock table public.vmp_source_objects in row exclusive mode;

  select source_object.* into v_source
  from public.vmp_source_objects source_object
  where source_object.object_kind=p_object_kind
    and source_object.object_code=p_object_code
  for update;

  v_created := not found;

  -- A1 (10/11/2026): thêm mới mà trùng mã thì báo lỗi, không ghi đè. Sửa bản
  -- ghi đã có luôn phải gửi version; không gửi version coi như "thêm mới".
  -- Chỉ áp cho người dùng web (role authenticated); luồng service như
  -- rpc_upsert_source_object luôn gọi với version null nên không bị chặn.
  if not v_created and p_expected_version is null
     and coalesce(auth.role(),'')='authenticated' then
    return jsonb_build_object('ok',false,'error_code','OBJECT_EXISTS',
      'error','Mã '||p_object_code||' đã có trong Danh mục. Mở đối tượng đó để sửa.',
      'current_version',v_source.version);
  end if;

  if not v_created and p_expected_version is not null
     and v_source.version is distinct from p_expected_version then
    return jsonb_build_object('ok',false,'error_code','VERSION_CONFLICT',
      'error','Bản ghi đã được người khác sửa','current_version',v_source.version);
  end if;

  select coalesce(jsonb_object_agg(entry.key,entry.value),'{}'::jsonb)
    into v_timeline_patch
  from jsonb_each(v_patch) entry
  where entry.key=any(public.vmp_catalog_timeline_fields());
  v_timeline_change:=v_timeline_patch<>'{}'::jsonb;

  begin
    if v_patch?'owner_person_id'
       and nullif(v_patch->>'owner_person_id','') is not null then
      v_owner_id:=(v_patch->>'owner_person_id')::uuid;
    elsif v_patch?'owner_person_id' then
      v_owner_id:=null;
    else
      v_owner_id:=v_source.owner_person_id;
    end if;
    if v_patch?'support_person_id'
       and nullif(v_patch->>'support_person_id','') is not null then
      v_support_id:=(v_patch->>'support_person_id')::uuid;
    elsif v_patch?'support_person_id' then
      v_support_id:=null;
    else
      v_support_id:=v_source.support_person_id;
    end if;
  exception when invalid_text_representation then
    return jsonb_build_object('ok',false,'error_code','INVALID_PERSON_ID',
      'error','person_id không đúng định dạng UUID');
  end;

  v_owner_change:=(v_patch?'owner_person_id')
    and v_owner_id is distinct from v_source.owner_person_id;
  v_support_change:=(v_patch?'support_person_id')
    and v_support_id is distinct from v_source.support_person_id;
  v_access_change:=v_owner_change or v_support_change;

  if (v_access_change or v_timeline_change)
     and nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok',false,'error_code','REASON_REQUIRED',
      'error','Sửa quyền hoặc timeline phải nhập lý do');
  end if;

  -- Retained now-ineligible selections do not block unrelated master saves.
  -- Any actual access change validates the complete resulting relationship.
  if v_access_change then
    perform 1 from public.profiles profile
    where profile.id in (
      select performer.user_id from public.vmp_performers performer
      where performer.id=any(array[v_owner_id,v_support_id]::uuid[])
    ) order by profile.id for share;
    perform 1 from public.vmp_performers performer
    where performer.id=any(array[v_owner_id,v_support_id]::uuid[])
    order by performer.id for share;

    if v_owner_id is not null then
      select performer.* into v_owner
      from public.vmp_performers performer
      join public.profiles profile on profile.id=performer.user_id
      where performer.id=v_owner_id and performer.is_active
        and performer.user_id is not null and profile.is_active
        and public.vmp_qa_assignable(performer.user_id, performer.department);
      if not found or (select count(*) from public.vmp_performers performer
                       where performer.user_id=v_owner.user_id
                         and performer.is_active)<>1 then
        return jsonb_build_object('ok',false,
          'error_code','PERSON_NOT_ELIGIBLE',
          'error','QA phụ trách không phải principal QA hoạt động duy nhất');
      end if;
    end if;
    if v_support_id is not null then
      select performer.* into v_support
      from public.vmp_performers performer
      join public.profiles profile on profile.id=performer.user_id
      where performer.id=v_support_id and performer.is_active
        and performer.user_id is not null and profile.is_active
        and public.vmp_qa_assignable(performer.user_id, performer.department);
      if not found or (select count(*) from public.vmp_performers performer
                       where performer.user_id=v_support.user_id
                         and performer.is_active)<>1 then
        return jsonb_build_object('ok',false,
          'error_code','PERSON_NOT_ELIGIBLE',
          'error','QA hỗ trợ không phải principal QA hoạt động duy nhất');
      end if;
    end if;
  end if;

  -- The legacy master upsert applies every key it receives immediately. Keep
  -- planned-timeline keys out of that call so mixed saves commit access/master
  -- now while the timeline subset remains pending until preview/apply.
  v_master_patch:=v_patch-array[
    'owner_person_id','support_person_id','owner_name','support_name',
    'frequency_months','first_month','report_class','workdays',
    'validate_flag','is_active'
  ]::text[];
  v_result:=public.vmp_upsert_source_object_before_person_id(
    p_object_kind,p_object_code,v_master_patch);
  if coalesce((v_result->>'ok')::boolean,false) is not true then
    return v_result;
  end if;

  select source_object.* into strict v_after
  from public.vmp_source_objects source_object
  where source_object.id=(v_result->>'id')::uuid
  for update;
  if v_source.id is null then
    v_source:=v_after;
  end if;

  select coalesce(jsonb_object_agg(field,to_jsonb(v_source)->field),
                  '{}'::jsonb)
    into v_timeline_old
  from unnest(public.vmp_catalog_timeline_fields()) field
  where v_timeline_patch?field;

  update public.vmp_source_objects source_object
  set owner_person_id=case when v_owner_change
        then v_owner_id else source_object.owner_person_id end,
      owner_name=case when v_owner_change
        then case when v_owner_id is null then null
                  else v_owner.performer_name end
        else source_object.owner_name end,
      support_person_id=case when v_support_change
        then v_support_id else source_object.support_person_id end,
      support_name=case when v_support_change
        then case when v_support_id is null then null
                  else v_support.performer_name end
        else source_object.support_name end,
      version=coalesce(source_object.version,1)+1,
      timeline_revision=coalesce(source_object.timeline_revision,0)+
        case when v_timeline_change then 1 else 0 end,
      updated_by=coalesce(v_actor,source_object.updated_by),updated_at=now()
  where source_object.id=v_after.id
  returning source_object.* into strict v_after;

  if v_access_change then
    perform public.vmp_reconcile_source_qa_projection(v_after.id);
  end if;

  -- Disposable-clone failpoint for the required runtime atomicity proof. It is
  -- inert unless the reviewed test fixture marker exists, and fires only after
  -- Source and every related item/assignment projection has been written in
  -- this function's subtransaction.
  if current_setting('vmp.source_access_save_failpoint',true)=
       'after_projection_before_audit'
     and exists (
       select 1 from public.system_config
       where key='five_role_test_fixture' and value='true'::jsonb
     ) then
    raise exception using errcode='check_violation',
      message='SACCESS_RUNTIME_SAVE_FAILURE_AFTER_PROJECTION';
  end if;

  select array_agg(key order by key) into v_changed_fields
  from jsonb_object_keys(v_patch) key;
  insert into public.audit_logs(
    user_id,action,table_name,record_id,changed_fields,change_reason,
    old_data,new_data,source,effective_business_role
  ) values (
    v_actor,(case when v_created then 'INSERT' else 'UPDATE' end)::public.audit_action,'vmp_source_objects',
    v_after.id::text,coalesce(v_changed_fields,'{}'::text[]),
    nullif(btrim(coalesce(p_reason,'')),''),
    case when v_created then null else to_jsonb(v_source) end,to_jsonb(v_after),
    'source_catalog_access_save',v_role
  );

  if v_timeline_change then
    update public.vmp_catalog_changes
    set status='superseded'
    where object_kind=p_object_kind and object_code=p_object_code
      and status in ('pending','previewed');
    insert into public.vmp_catalog_changes(
      object_kind,object_code,source_version,timeline_revision,
      old_data,new_data,created_by
    ) values (
      p_object_kind,p_object_code,v_after.version,v_after.timeline_revision,
      v_timeline_old,v_timeline_patch,v_actor
    ) returning id into v_change_id;
  end if;

  return jsonb_build_object(
    'ok',true,'object_code',p_object_code,'change_id',v_change_id,
    'version',v_after.version,'timeline_revision',v_after.timeline_revision,
    'timeline_applied_revision',v_after.timeline_applied_revision,
    'pending_timeline',coalesce(v_after.timeline_revision,0)>
                       coalesce(v_after.timeline_applied_revision,0),
    'reason',nullif(btrim(coalesce(p_reason,'')),'')
  );
exception when others then
  raise log 'SOURCE_ACCESS_SAVE_ERROR code=% sqlstate=% error=%',
    p_object_code,sqlstate,sqlerrm;
  return jsonb_build_object('ok',false,'error_code','SAVE_FAILED',
    'error',sqlerrm,'sqlstate',sqlstate);
end
$function$;

create or replace function public.rpc_set_source_workshop_scope_grant(
  p_grant_id uuid,p_performer_id uuid,p_department text,p_area_code text,
  p_line text,p_is_active boolean,p_reason text,p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
declare
  v_actor uuid:=auth.uid();
  v_role text:=public.vmp_business_role(auth.uid());
  v_existing public.vmp_source_workshop_scope_grants%rowtype;
  v_changed public.vmp_source_workshop_scope_grants%rowtype;
  v_performer public.vmp_performers%rowtype;
  v_department text:=nullif(btrim(p_department),'');
  v_area text:=nullif(btrim(p_area_code),'');
  v_line text:=nullif(btrim(p_line),'');
  v_old jsonb;
begin
  if not public.vmp_can_manage_source_workshop_scope(v_actor) then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Không có quyền quản lý phạm vi xưởng Source');
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok',false,'error_code','REASON_REQUIRED',
      'error','Thay đổi phạm vi xưởng phải nhập lý do');
  end if;
  if p_is_active is null then
    return jsonb_build_object('ok',false,'error_code','INVALID_ACTIVE_STATE',
      'error','Thiếu trạng thái phạm vi');
  end if;

  if p_grant_id is not null then
    select grant_row.* into v_existing
    from public.vmp_source_workshop_scope_grants grant_row
    where grant_row.id=p_grant_id;
    if not found then
      return jsonb_build_object('ok',false,'error_code','GRANT_NOT_FOUND',
        'error','Không tìm thấy phạm vi xưởng');
    end if;
    v_department:=coalesce(v_department,v_existing.department);
    v_area:=coalesce(v_area,v_existing.area_code);
    v_line:=case when p_line is null then null else v_line end;
  elsif not p_is_active then
    return jsonb_build_object('ok',false,'error_code','GRANT_NOT_FOUND',
      'error','Không thể thu hồi phạm vi chưa tồn tại');
  end if;

  if v_department is null or v_area is null then
    return jsonb_build_object('ok',false,'error_code','INVALID_SCOPE',
      'error','Phạm vi Source cần bộ phận và khu vực');
  end if;

  -- Lock every active Source row matching the requested tuple before the grant
  -- row. This preserves Source -> grant order for progress/revoke races.
  perform 1 from public.vmp_source_objects source_object
  where source_object.is_active
    and public.vmp_source_scope_key(source_object.department)=
        public.vmp_source_scope_key(v_department)
    and public.vmp_source_scope_key(source_object.area_code)=
        public.vmp_source_scope_key(v_area)
    and (v_line is null or public.vmp_source_scope_key(source_object.line)=
         public.vmp_source_scope_key(v_line))
  order by source_object.id for key share;
  -- A2 (10/11/2026): thu hồi (p_is_active=false) không cần khu vực còn đối
  -- tượng hoạt động; câu perform ở trên vẫn chạy để giữ thứ tự khoá.
  if p_is_active and not found then
    return jsonb_build_object('ok',false,'error_code','SCOPE_NOT_FOUND',
      'error','Phạm vi không tồn tại trên Source hoạt động');
  end if;

  if p_grant_id is not null then
    select grant_row.* into strict v_existing
    from public.vmp_source_workshop_scope_grants grant_row
    where grant_row.id=p_grant_id for update;
    if p_expected_version is null
       or v_existing.version is distinct from p_expected_version then
      return jsonb_build_object('ok',false,'error_code','VERSION_CONFLICT',
        'error','Phạm vi đã được người khác sửa',
        'current_version',v_existing.version);
    end if;
  elsif p_expected_version is not null then
    return jsonb_build_object('ok',false,'error_code','VERSION_CONFLICT',
      'error','Tạo mới không nhận version cũ');
  end if;

  perform 1 from public.profiles profile
  where profile.id=(select performer.user_id
                    from public.vmp_performers performer
                    where performer.id=p_performer_id)
  for share;
  select performer.* into v_performer
  from public.vmp_performers performer
  join public.profiles profile on profile.id=performer.user_id
  where performer.id=p_performer_id and performer.is_active
    and performer.user_id is not null and profile.is_active
    and public.vmp_business_role(performer.user_id) in (
      'workshop_manager','workshop_staff'
    ) for share of performer;
  -- A2: chỉ cấp/bật lại mới đòi người nhận còn đủ điều kiện; thu hồi thì không.
  if p_is_active and (not found or (select count(*) from public.vmp_performers performer
                   where performer.user_id=v_performer.user_id
                     and performer.is_active)<>1) then
    return jsonb_build_object('ok',false,
      'error_code','PERSON_NOT_ELIGIBLE',
      'error','Người xưởng không phải principal hoạt động duy nhất');
  end if;

  if p_grant_id is null then
    insert into public.vmp_source_workshop_scope_grants(
      performer_id,department,department_key,area_code,area_key,line,line_key,
      is_active,version,created_by,updated_by,change_reason
    ) values (
      p_performer_id,v_department,public.vmp_source_scope_key(v_department),
      v_area,public.vmp_source_scope_key(v_area),v_line,
      case when v_line is null then null
           else public.vmp_source_scope_key(v_line) end,
      true,1,v_actor,v_actor,btrim(p_reason)
    ) returning * into strict v_changed;
    insert into public.audit_logs(
      user_id,action,table_name,record_id,changed_fields,change_reason,
      old_data,new_data,source,effective_business_role
    ) values (
      v_actor,'INSERT'::public.audit_action,
      'vmp_source_workshop_scope_grants',v_changed.id::text,
      array['performer_id','department','area_code','line','is_active'],
      btrim(p_reason),null,to_jsonb(v_changed),'source_workshop_scope',v_role
    );
  else
    v_old:=to_jsonb(v_existing);
    -- A2: thu hồi chỉ đổi is_active; giữ nguyên người và phạm vi đã cấp.
    if not p_is_active then
      p_performer_id:=v_existing.performer_id;
      v_department:=v_existing.department;
      v_area:=v_existing.area_code;
      v_line:=v_existing.line;
    end if;
    update public.vmp_source_workshop_scope_grants grant_row
    set performer_id=p_performer_id,department=v_department,
        department_key=public.vmp_source_scope_key(v_department),
        area_code=v_area,area_key=public.vmp_source_scope_key(v_area),
        line=v_line,line_key=case when v_line is null then null
          else public.vmp_source_scope_key(v_line) end,
        is_active=p_is_active,version=grant_row.version+1,
        updated_at=transaction_timestamp(),updated_by=v_actor,
        change_reason=btrim(p_reason)
    where grant_row.id=p_grant_id
    returning * into strict v_changed;
    insert into public.audit_logs(
      user_id,action,table_name,record_id,changed_fields,change_reason,
      old_data,new_data,source,effective_business_role
    ) values (
      v_actor,'UPDATE'::public.audit_action,
      'vmp_source_workshop_scope_grants',v_changed.id::text,
      array['performer_id','department','area_code','line','is_active','version'],
      btrim(p_reason),v_old,to_jsonb(v_changed),'source_workshop_scope',v_role
    );
  end if;
  return jsonb_build_object('ok',true,'grant_id',v_changed.id,
    'version',v_changed.version,'is_active',v_changed.is_active);
exception
  when unique_violation then
    return jsonb_build_object('ok',false,'error_code','DUPLICATE_ACTIVE_SCOPE',
      'error','Phạm vi hoạt động đã tồn tại');
end
$function$;

revoke all on function public.rpc_set_source_workshop_scope_grant(
    uuid,uuid,text,text,text,boolean,text,integer)
  from public,anon;
grant execute on function public.rpc_set_source_workshop_scope_grant(
    uuid,uuid,text,text,text,boolean,text,integer)
  to authenticated,service_role;

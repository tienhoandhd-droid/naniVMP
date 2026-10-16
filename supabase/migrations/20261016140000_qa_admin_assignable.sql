-- =====================================================================
-- 20261016140000_qa_admin_assignable.sql — ADMIN PHÒNG QA ĐƯỢC PHÂN QA PHỤ TRÁCH
-- ---------------------------------------------------------------------
-- Yêu cầu chủ dự án 16/10: danh sách "QA phụ trách" ở Dữ liệu nguồn chỉ có
-- 3/9 người phòng QA. Ba người phòng QA mang vai admin (Đỗ Đắc Anh Khoa,
-- Nguyễn Thanh Thuỷ, Tào Tiến Hoàn) bị loại vì luật cũ chỉ nhận vai
-- qa_staff/qa_manager và nhóm quyền qa_*.
--
-- Luật mới (một chỗ duy nhất, vmp_qa_assignable): đủ điều kiện khi vai là
-- qa_staff/qa_manager, HOẶC vai admin và người thực hiện thuộc phòng QA.
-- Admin vốn cập nhật được mọi hạng mục nên không mở thêm quyền ghi nào.
-- Các điều kiện khác giữ nguyên: người thực hiện + tài khoản đang hoạt động,
-- đúng một hồ sơ người thực hiện cho mỗi tài khoản.
--
-- Bốn hàm bên dưới chép nguyên văn từ production (pg_get_functiondef 16/10),
-- chỉ thay điều kiện vai bằng vmp_qa_assignable (và ở danh sách: admin không
-- cần nhóm quyền qa_*). Không sửa file 20260828150000 (đã niêm phong).
-- =====================================================================

begin;

create or replace function public.vmp_qa_assignable(p_user_id uuid, p_department text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(public.vmp_business_role(p_user_id) in ('qa_staff', 'qa_manager'), false)
      or (coalesce(public.vmp_business_role(p_user_id) = 'admin', false)
          and upper(btrim(coalesce(p_department, ''))) = 'QA')
$function$;

comment on function public.vmp_qa_assignable(uuid, text) is
  'Người đủ điều kiện làm QA phụ trách/hỗ trợ: vai qa_staff/qa_manager, hoặc admin thuộc phòng QA. 20261016.';
revoke all on function public.vmp_qa_assignable(uuid, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.vmp_source_qa_candidates_page_path(p_actor uuid, p_search text, p_cursor jsonb, p_limit integer, p_include_ids uuid[])
 RETURNS TABLE(payload jsonb)
 LANGUAGE sql
 STABLE
AS $function$
with actor as (
  select public.vmp_business_role(p_actor) role_name,
         exists (
           select 1 from public.profiles profile
           where profile.id=p_actor and coalesce(profile.is_active,true)
         ) active_account
), cursor_input as (
  select case when p_cursor is null then true
              when jsonb_typeof(p_cursor)='object'
               and jsonb_typeof(p_cursor->'normalized_full_name')='string'
               and jsonb_typeof(p_cursor->'person_id')='string'
               and (p_cursor->>'person_id') ~*
                   '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then true else false end valid,
         case when p_cursor is not null
                and jsonb_typeof(p_cursor)='object'
                and jsonb_typeof(p_cursor->'person_id')='string'
                and (p_cursor->>'person_id') ~*
                    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (p_cursor->>'person_id')::uuid end cursor_id,
         case when p_cursor is not null and jsonb_typeof(p_cursor)='object'
                and jsonb_typeof(p_cursor->'normalized_full_name')='string'
              then p_cursor->>'normalized_full_name' end cursor_name
), candidate as (
  select performer.id person_id,performer.performer_name,
         performer.normalized_full_name,performer.email,performer.department,
         public.vmp_business_role(performer.user_id) role_name
  from public.vmp_performers performer
  join public.profiles profile on profile.id=performer.user_id
  where performer.is_active is true and performer.user_id is not null
    and (performer.access_class in ('qa_manager','qa_progress_editor')
         or public.vmp_business_role(profile.id) = 'admin')
    and coalesce(profile.is_active,true)
    and public.vmp_qa_assignable(profile.id, performer.department)
    and (coalesce(btrim(p_search),'')=''
         or performer.normalized_full_name like
              public.vmp_source_scope_key(p_search)||'%')
), cursor_status as (
  select cursor_input.*,
         p_cursor is null or exists (
           select 1 from candidate
           where candidate.normalized_full_name=cursor_input.cursor_name
             and candidate.person_id=cursor_input.cursor_id
         ) present
  from cursor_input
), paged as (
  select candidate.* from candidate cross join cursor_status
  where p_cursor is null
     or (candidate.normalized_full_name,candidate.person_id)>
        (cursor_status.cursor_name,cursor_status.cursor_id)
), limited as (
  select paged.* from paged
  order by normalized_full_name,person_id
  limit case when p_limit between 1 and 50 then p_limit+1 else 0 end
), returned as (
  select limited.* from limited order by normalized_full_name,person_id
  limit case when p_limit between 1 and 50 then p_limit else 0 end
), included as (
  select requested.person_id,performer.performer_name,
         performer.normalized_full_name,performer.email,performer.department,
         coalesce(
           public.vmp_qa_assignable(performer.user_id, performer.department),
           false
         ) eligible,
         case
           when performer.id is null then 'PERSON_NOT_FOUND'
           when not performer.is_active then 'PERFORMER_INACTIVE'
           when performer.user_id is null then 'ACCOUNT_UNLINKED'
           when not coalesce(profile.is_active,false) then 'ACCOUNT_DISABLED'
           when not coalesce(public.vmp_qa_assignable(performer.user_id, performer.department), false)
             then 'ROLE_INELIGIBLE'
           else null
         end ineligibility_reason
  from (
    select distinct unnest(coalesce(p_include_ids,'{}'::uuid[])) person_id
  ) requested
  left join public.vmp_performers performer on performer.id=requested.person_id
  left join public.profiles profile on profile.id=performer.user_id
)
select case
  when not actor.active_account then jsonb_build_object(
    'ok',false,'error_code','ACCOUNT_DISABLED','error','Tài khoản không hoạt động')
  when actor.role_name is null then jsonb_build_object(
    'ok',false,'error_code','ROLE_UNRESOLVED','error','Không xác định được vai trò nghiệp vụ')
  when actor.role_name not in ('admin','qa_manager') then jsonb_build_object(
    'ok',false,'error_code','FORBIDDEN','error','Không có quyền chọn QA phụ trách')
  when p_limit is null or p_limit<1 or p_limit>50 then jsonb_build_object(
    'ok',false,'error_code','INVALID_LIMIT','error','Giới hạn phải từ 1 đến 50')
  when not cursor_status.valid then jsonb_build_object(
    'ok',false,'error_code','INVALID_CURSOR','error','Con trỏ không hợp lệ')
  when not cursor_status.present then jsonb_build_object(
    'ok',false,'error_code','CURSOR_EXPIRED','error','Con trỏ không còn hiệu lực')
  else jsonb_build_object(
    'ok',true,
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'person_id',person_id,'performer_name',performer_name,
      'normalized_full_name',normalized_full_name,'email',email,
      'department',department,'role_name',role_name
    ) order by normalized_full_name,person_id) from returned),'[]'::jsonb),
    'included_current',coalesce((select jsonb_agg(to_jsonb(included)
      order by included.normalized_full_name nulls last,included.person_id)
      from included),'[]'::jsonb),
    'authorized_total',(select count(*) from candidate),
    'next_cursor',case when (select count(*) from limited)>p_limit then (
      select jsonb_build_object(
        'normalized_full_name',normalized_full_name,'person_id',person_id)
      from returned order by normalized_full_name desc,person_id desc limit 1
    ) else null end
  )
end payload
from actor cross join cursor_status
$function$;

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

CREATE OR REPLACE FUNCTION public.vmp_reconcile_source_access_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_validate_owner boolean := case when tg_op='INSERT' then true else
    old.owner_person_id is distinct from new.owner_person_id end;
  v_validate_support boolean := case when tg_op='INSERT' then true else
    old.support_person_id is distinct from new.support_person_id end;
begin
  -- Custom GUCs are caller-settable and cannot be trusted as an authorization
  -- fence. Validate only newly introduced/activated relations; an unchanged
  -- ineligible relation remains display-only for unrelated saves.
  if new.is_active is true and v_validate_owner
     and new.owner_person_id is not null
     and not exists (
       select 1
       from public.vmp_performers performer
       join public.profiles profile on profile.id=performer.user_id
       where performer.id=new.owner_person_id
         and performer.is_active is true
         and performer.user_id is not null
         and profile.is_active is true
         and public.vmp_qa_assignable(performer.user_id, performer.department)
         and (select count(*) from public.vmp_performers active_performer
              where active_performer.user_id=performer.user_id
                and active_performer.is_active is true)=1
     ) then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_TRIGGER_OWNER_NOT_ELIGIBLE';
  end if;
  if new.is_active is true and v_validate_support
     and new.support_person_id is not null
     and not exists (
       select 1
       from public.vmp_performers performer
       join public.profiles profile on profile.id=performer.user_id
       where performer.id=new.support_person_id
         and performer.is_active is true
         and performer.user_id is not null
         and profile.is_active is true
         and public.vmp_qa_assignable(performer.user_id, performer.department)
         and (select count(*) from public.vmp_performers active_performer
              where active_performer.user_id=performer.user_id
                and active_performer.is_active is true)=1
     ) then
    raise exception using errcode='check_violation',
      message='SOURCE_ACCESS_TRIGGER_SUPPORT_NOT_ELIGIBLE';
  end if;

  -- Every accepted active relation is reconciled before commit.
  perform public.vmp_reconcile_source_qa_projection(new.id);
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.vmp_reconcile_source_qa_projection(p_source_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source public.vmp_source_objects%rowtype;
  v_item public.vmp_plan_items%rowtype;
  v_owner public.vmp_performers%rowtype;
  v_support public.vmp_performers%rowtype;
  v_owner_user_snapshot uuid;
  v_support_user_snapshot uuid;
  v_assignment public.vmp_item_assignments%rowtype;
  v_changed public.vmp_item_assignments%rowtype;
  v_existing public.vmp_item_assignments%rowtype;
  v_old jsonb;
  v_reason text := 'Reconcile canonical Source QA projection';
  v_items integer := 0;
  v_plan_updated integer := 0;
  v_inserted integer := 0;
  v_reactivated integer := 0;
  v_revoked integer := 0;
  v_demoted integer := 0;
  v_rows integer;
  v_owner_eligible boolean := false;
  v_support_eligible boolean := false;
begin
  select source_object.* into strict v_source
  from public.vmp_source_objects source_object
  where source_object.id = p_source_id
  for update;

  -- Snapshot linkage only to identify profiles, then lock in the same global
  -- profile -> performer dependency order used by the migration and runtime.
  -- If linkage changes before the performer lock, the revalidation below
  -- fails and rolls back instead of proceeding with an unlocked profile.
  select performer.user_id into v_owner_user_snapshot
  from public.vmp_performers performer
  where performer.id = v_source.owner_person_id;
  select performer.user_id into v_support_user_snapshot
  from public.vmp_performers performer
  where performer.id = v_source.support_person_id;

  perform 1
  from public.profiles profile
  where profile.id = any (array[
    v_owner_user_snapshot, v_support_user_snapshot
  ]::uuid[])
  order by profile.id
  for update;

  perform 1
  from public.vmp_performers performer
  where performer.id = any (array[
    v_source.owner_person_id, v_source.support_person_id
  ]::uuid[])
  order by performer.id
  for update;

  -- Stable repair order: Source, principal evidence, related active items,
  -- then every assignment row that canonical conversion may change.
  perform 1
  from public.vmp_plan_items item
  where item.object_code = v_source.object_code and item.is_active is true
  order by item.validation_code, item.id
  for update;

  perform 1
  from public.vmp_item_assignments assignment
  where assignment.validation_code in (
      select item.validation_code
      from public.vmp_plan_items item
      where item.object_code = v_source.object_code and item.is_active is true
    )
    and assignment.assignment_kind = 'qa'
    and (
      assignment.source in ('source_owner', 'source_support')
      or (assignment.is_active and (
        assignment.performer_id in (
          v_source.owner_person_id, v_source.support_person_id
        )
        or assignment.assignment_role = 'primary'
      ))
    )
  order by assignment.validation_code, assignment.performer_id,
           assignment.assignment_role, assignment.source, assignment.id
  for update;

  -- Re-read after every required lock is held. Existing performer rows are
  -- retained for display even when they are not eligible for QA authority;
  -- only a missing performer row remains fail-closed because its display
  -- projection cannot be reconstructed safely.
  if v_source.owner_person_id is not null then
    select performer.* into strict v_owner
    from public.vmp_performers performer
    where performer.id = v_source.owner_person_id;

    select count(*) into v_rows
    from public.vmp_performers performer
    where performer.user_id = v_owner.user_id and performer.is_active is true;
    if v_owner.user_id is not null
       and v_owner.user_id is not distinct from v_owner_user_snapshot
       and v_owner.is_active is true
       and v_rows = 1
       and exists (
         select 1 from public.profiles profile
         where profile.id = v_owner.user_id and profile.is_active is true
           and public.vmp_qa_assignable(v_owner.user_id, v_owner.department)
       ) then
      v_owner_eligible := true;
    end if;
  end if;

  if v_source.support_person_id is not null then
    select performer.* into strict v_support
    from public.vmp_performers performer
    where performer.id = v_source.support_person_id;

    select count(*) into v_rows
    from public.vmp_performers performer
    where performer.user_id = v_support.user_id and performer.is_active is true;
    if v_support.user_id is not null
       and v_support.user_id is not distinct from v_support_user_snapshot
       and v_support.is_active is true
       and v_rows = 1
       and exists (
         select 1 from public.profiles profile
         where profile.id = v_support.user_id and profile.is_active is true
           and public.vmp_qa_assignable(v_support.user_id, v_support.department)
       ) then
      v_support_eligible := true;
    end if;
  end if;

  for v_item in
    select item.*
    from public.vmp_plan_items item
    where item.object_code = v_source.object_code and item.is_active is true
    order by item.validation_code, item.id
  loop
    v_items := v_items + 1;

    update public.vmp_plan_items item
    set owner_person_id = v_source.owner_person_id,
        support_person_id = v_source.support_person_id,
        owner_name = case when v_source.owner_person_id is null
                          then null else v_owner.performer_name end,
        secondary_owner = case when v_source.support_person_id is null
                               then null else v_support.performer_name end
    where item.id = v_item.id
      and (item.owner_person_id, item.support_person_id,
           item.owner_name, item.secondary_owner)
          is distinct from
          (v_source.owner_person_id, v_source.support_person_id,
           case when v_source.owner_person_id is null
                then null else v_owner.performer_name end,
           case when v_source.support_person_id is null
                then null else v_support.performer_name end);
    get diagnostics v_rows = row_count;
    v_plan_updated := v_plan_updated + v_rows;

    -- Revoke stale canonical rows first, including source_support when owner
    -- and support intentionally resolve to the same performer.
    for v_assignment in
      select assignment.*
      from public.vmp_item_assignments assignment
      where assignment.validation_code = v_item.validation_code
        and assignment.assignment_kind = 'qa' and assignment.is_active
        and (
          (assignment.source = 'source_owner' and not (
            v_owner_eligible
            and assignment.performer_id is not distinct from
                v_source.owner_person_id
          ))
          or
          (assignment.source = 'source_support' and not (
            v_support_eligible
            and
            assignment.performer_id is not distinct from
              v_source.support_person_id
            and v_source.support_person_id is not null
            and v_source.support_person_id is distinct from
              v_source.owner_person_id
          ))
        )
      order by assignment.performer_id, assignment.assignment_role,
               assignment.source, assignment.id
    loop
      v_old := to_jsonb(v_assignment);
      update public.vmp_item_assignments assignment
      set is_active = false, change_reason = v_reason, updated_by = null
      where assignment.id = v_assignment.id
      returning assignment.* into strict v_changed;
      insert into public.audit_logs(
        user_id, action, table_name, record_id, validation_code,
        changed_fields, change_reason, old_data, new_data, source,
        effective_business_role
      ) values (
        null, 'UPDATE'::public.audit_action, 'vmp_item_assignments',
        v_assignment.id::text, v_item.validation_code, array['is_active'],
        v_reason, v_old, to_jsonb(v_changed),
        'source_qa_projection_reconcile', null
      );
      v_revoked := v_revoked + 1;
    end loop;

    if v_owner_eligible then
      -- Preserve history: revoke same-person noncanonical rows rather than
      -- rewriting their source label into the canonical tuple.
      for v_assignment in
        select assignment.*
        from public.vmp_item_assignments assignment
        where assignment.validation_code = v_item.validation_code
          and assignment.assignment_kind = 'qa' and assignment.is_active
          and assignment.performer_id = v_source.owner_person_id
          and assignment.source <> 'source_owner'
        order by assignment.assignment_role, assignment.source, assignment.id
      loop
        v_old := to_jsonb(v_assignment);
        update public.vmp_item_assignments assignment
        set is_active = false, change_reason = v_reason, updated_by = null
        where assignment.id = v_assignment.id
        returning assignment.* into strict v_changed;
        insert into public.audit_logs(
          user_id, action, table_name, record_id, validation_code,
          changed_fields, change_reason, old_data, new_data, source,
          effective_business_role
        ) values (
          null, 'UPDATE'::public.audit_action, 'vmp_item_assignments',
          v_assignment.id::text, v_item.validation_code, array['is_active'],
          v_reason, v_old, to_jsonb(v_changed),
          'source_qa_projection_reconcile', null
        );
        v_revoked := v_revoked + 1;
      end loop;

      -- Keep the existing one-primary invariant: a different active primary
      -- is audited and demoted before canonical owner activation.
      for v_assignment in
        select assignment.*
        from public.vmp_item_assignments assignment
        where assignment.validation_code = v_item.validation_code
          and assignment.assignment_kind = 'qa' and assignment.is_active
          and assignment.assignment_role = 'primary'
          and assignment.performer_id is distinct from v_source.owner_person_id
        order by assignment.performer_id, assignment.source, assignment.id
      loop
        v_old := to_jsonb(v_assignment);
        update public.vmp_item_assignments assignment
        set assignment_role = 'collaborator', change_reason = v_reason,
            updated_by = null
        where assignment.id = v_assignment.id
        returning assignment.* into strict v_changed;
        insert into public.audit_logs(
          user_id, action, table_name, record_id, validation_code,
          changed_fields, change_reason, old_data, new_data, source,
          effective_business_role
        ) values (
          null, 'UPDATE'::public.audit_action, 'vmp_item_assignments',
          v_assignment.id::text, v_item.validation_code,
          array['assignment_role'], v_reason, v_old, to_jsonb(v_changed),
          'source_qa_projection_reconcile', null
        );
        v_demoted := v_demoted + 1;
      end loop;

      select assignment.* into v_existing
      from public.vmp_item_assignments assignment
      where assignment.validation_code = v_item.validation_code
        and assignment.performer_id = v_source.owner_person_id
        and assignment.assignment_kind = 'qa'
        and assignment.source = 'source_owner';
      if not found then
        insert into public.vmp_item_assignments(
          validation_code, performer_id, user_id, staff_name, employee_code,
          assignment_kind, source, assignment_role, expires_at, is_active,
          change_reason, created_by, updated_by
        ) values (
          v_item.validation_code, v_owner.id, v_owner.user_id,
          v_owner.performer_name, v_owner.employee_code, 'qa', 'source_owner',
          'primary', null, true, v_reason, null, null
        );
        v_inserted := v_inserted + 1;
      else
        update public.vmp_item_assignments assignment
        set user_id = v_owner.user_id,
            staff_name = v_owner.performer_name,
            employee_code = v_owner.employee_code,
            assignment_role = 'primary', expires_at = null, is_active = true,
            change_reason = v_reason, updated_by = null
        where assignment.id = v_existing.id
          and (assignment.user_id, assignment.staff_name,
               assignment.employee_code, assignment.assignment_role,
               assignment.expires_at, assignment.is_active,
               assignment.change_reason, assignment.updated_by)
              is distinct from
              (v_owner.user_id, v_owner.performer_name,
               v_owner.employee_code, 'primary'::text, null::timestamptz,
               true, v_reason, null::uuid);
        get diagnostics v_rows = row_count;
        if v_rows = 1 and not v_existing.is_active then
          v_reactivated := v_reactivated + 1;
        end if;
      end if;
    end if;

    if v_support_eligible
       and v_source.support_person_id is distinct from v_source.owner_person_id then
      for v_assignment in
        select assignment.*
        from public.vmp_item_assignments assignment
        where assignment.validation_code = v_item.validation_code
          and assignment.assignment_kind = 'qa' and assignment.is_active
          and assignment.performer_id = v_source.support_person_id
          and assignment.source <> 'source_support'
        order by assignment.assignment_role, assignment.source, assignment.id
      loop
        v_old := to_jsonb(v_assignment);
        update public.vmp_item_assignments assignment
        set is_active = false, change_reason = v_reason, updated_by = null
        where assignment.id = v_assignment.id
        returning assignment.* into strict v_changed;
        insert into public.audit_logs(
          user_id, action, table_name, record_id, validation_code,
          changed_fields, change_reason, old_data, new_data, source,
          effective_business_role
        ) values (
          null, 'UPDATE'::public.audit_action, 'vmp_item_assignments',
          v_assignment.id::text, v_item.validation_code, array['is_active'],
          v_reason, v_old, to_jsonb(v_changed),
          'source_qa_projection_reconcile', null
        );
        v_revoked := v_revoked + 1;
      end loop;

      select assignment.* into v_existing
      from public.vmp_item_assignments assignment
      where assignment.validation_code = v_item.validation_code
        and assignment.performer_id = v_source.support_person_id
        and assignment.assignment_kind = 'qa'
        and assignment.source = 'source_support';
      if not found then
        insert into public.vmp_item_assignments(
          validation_code, performer_id, user_id, staff_name, employee_code,
          assignment_kind, source, assignment_role, expires_at, is_active,
          change_reason, created_by, updated_by
        ) values (
          v_item.validation_code, v_support.id, v_support.user_id,
          v_support.performer_name, v_support.employee_code, 'qa',
          'source_support', 'collaborator', null, true, v_reason, null, null
        );
        v_inserted := v_inserted + 1;
      else
        update public.vmp_item_assignments assignment
        set user_id = v_support.user_id,
            staff_name = v_support.performer_name,
            employee_code = v_support.employee_code,
            assignment_role = 'collaborator', expires_at = null,
            is_active = true, change_reason = v_reason, updated_by = null
        where assignment.id = v_existing.id
          and (assignment.user_id, assignment.staff_name,
               assignment.employee_code, assignment.assignment_role,
               assignment.expires_at, assignment.is_active,
               assignment.change_reason, assignment.updated_by)
              is distinct from
              (v_support.user_id, v_support.performer_name,
               v_support.employee_code, 'collaborator'::text,
               null::timestamptz, true, v_reason, null::uuid);
        get diagnostics v_rows = row_count;
        if v_rows = 1 and not v_existing.is_active then
          v_reactivated := v_reactivated + 1;
        end if;
      end if;
    end if;
  end loop;

  if exists (
       select 1
       from public.vmp_plan_items item
       where item.object_code = v_source.object_code and item.is_active is true
         and (item.owner_person_id is distinct from v_source.owner_person_id
              or item.support_person_id is distinct from
                 v_source.support_person_id)
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       where item.object_code = v_source.object_code and item.is_active is true
         and v_source.owner_person_id is not null
         and v_owner_eligible
         and (select count(*)
              from public.vmp_item_assignments assignment
              where assignment.validation_code = item.validation_code
                and assignment.performer_id = v_source.owner_person_id
                and assignment.assignment_kind = 'qa'
                and assignment.source = 'source_owner'
                and assignment.assignment_role = 'primary'
                and assignment.is_active) <> 1
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       where item.object_code = v_source.object_code and item.is_active is true
         and v_source.support_person_id is not null
         and v_support_eligible
         and v_source.support_person_id is distinct from v_source.owner_person_id
         and (select count(*)
              from public.vmp_item_assignments assignment
              where assignment.validation_code = item.validation_code
                and assignment.performer_id = v_source.support_person_id
                and assignment.assignment_kind = 'qa'
                and assignment.source = 'source_support'
                and assignment.assignment_role = 'collaborator'
                and assignment.is_active) <> 1
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       where item.object_code = v_source.object_code and item.is_active is true
         and v_source.owner_person_id is not null
         and v_owner_eligible
         and v_source.owner_person_id is not distinct from
             v_source.support_person_id
         and (select count(*)
              from public.vmp_item_assignments assignment
              where assignment.validation_code = item.validation_code
                and assignment.performer_id = v_source.owner_person_id
                and assignment.assignment_kind = 'qa'
                and assignment.is_active) <> 1
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       join public.vmp_item_assignments assignment
         on assignment.validation_code = item.validation_code
        and assignment.assignment_kind = 'qa' and assignment.is_active
        and assignment.source in ('source_owner', 'source_support')
       where item.object_code = v_source.object_code and item.is_active is true
         and (
           (assignment.source = 'source_owner' and not (
             v_owner_eligible
             and assignment.performer_id is not distinct from
                 v_source.owner_person_id
           ))
           or
           (assignment.source = 'source_support' and not (
             v_support_eligible
             and
             assignment.performer_id is not distinct from
               v_source.support_person_id
             and v_source.support_person_id is not null
             and v_source.support_person_id is distinct from
               v_source.owner_person_id
           ))
         )
     )
     -- Ineligible existing relations are display-only and must have zero
     -- active canonical Source assignments after reconciliation.
     or exists (
       select 1
       from public.vmp_plan_items item
       join public.vmp_item_assignments assignment
         on assignment.validation_code = item.validation_code
        and assignment.assignment_kind = 'qa'
        and assignment.source = 'source_owner'
        and assignment.is_active
       where item.object_code = v_source.object_code and item.is_active is true
         and v_source.owner_person_id is not null
         and not v_owner_eligible
         and assignment.performer_id is not distinct from v_source.owner_person_id
     )
     or exists (
       select 1
       from public.vmp_plan_items item
       join public.vmp_item_assignments assignment
         on assignment.validation_code = item.validation_code
        and assignment.assignment_kind = 'qa'
        and assignment.source = 'source_support'
        and assignment.is_active
       where item.object_code = v_source.object_code and item.is_active is true
         and v_source.support_person_id is not null
         and not v_support_eligible
         and assignment.performer_id is not distinct from v_source.support_person_id
     )
     or exists (
       select 1 from pg_index index_row
       where index_row.indexrelid in (
         'public.vmp_item_assignments_one_active_qa_person'::regclass,
         'public.vmp_item_assignments_one_active_qa_primary'::regclass
       ) and (not index_row.indisunique or not index_row.indisvalid
              or not index_row.indisready)
     ) then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_RECONCILE_POSTCONDITION';
  end if;

  return jsonb_build_object(
    'ok', true, 'source_id', p_source_id, 'items', v_items,
    'plan_updated', v_plan_updated, 'inserted', v_inserted,
    'reactivated', v_reactivated, 'revoked', v_revoked,
    'demoted', v_demoted
  );
exception
  when no_data_found then
    raise exception using errcode = 'check_violation',
      message = 'SOURCE_ACCESS_RECONCILE_INVALID_SOURCE_OR_PRINCIPAL';
end
$function$;

commit;

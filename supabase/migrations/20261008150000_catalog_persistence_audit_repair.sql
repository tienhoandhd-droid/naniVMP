-- Fix catalog persistence and audit regressions proven by crud-catalog-role-audit.sql.
-- No role grants/RLS, existing history, formulas or qualification records change.
-- Missing patch keys preserve values; explicit null clears nullable fields.
-- Run against a reviewed clone first. Exact baseline guard prevents silently
-- replacing a newer server implementation. Existing function ACLs are retained.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $preflight$
declare r record;
begin
 for r in select * from (values
  ('public.vmp_upsert_source_object_before_person_id(text,text,jsonb)','10d7c5237b3c7451a09eed95f6d50643'),
  ('public.rpc_upsert_product_gmp(text,jsonb)','c4be67631f3684e85ea9987091c38e9a'),
  ('public.rpc_upsert_alert_recipient(uuid,jsonb)','b6ad5833a63a6d2947c2a13b0e9f299c'),
  ('public.rpc_save_catalog_object__five_role_impl_20260824(text,text,jsonb,text,integer)','4c9a29298a7ece4449094463ce3ec64f'),
  ('public.rpc_catalog_history(jsonb,integer,integer)','71f67876c8966aa8f4799f0dd2ffdc57'),
  ('public.rpc_catalog_history_detail(uuid)','467ffb2343fa5148d08a9c45050430d9')
 ) expected(signature,definition_md5) loop
  if to_regprocedure(r.signature) is null
     or md5(pg_get_functiondef(to_regprocedure(r.signature))) is distinct from r.definition_md5 then
   raise exception 'CRUD_CATALOG_BASELINE_CHANGED: %',r.signature;
  end if;
 end loop;
end $preflight$;

CREATE OR REPLACE FUNCTION public.vmp_upsert_source_object_before_person_id(p_object_kind text, p_object_code text, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_principal_kind text;
  v_id uuid;
  v_code text := nullif(btrim(p_object_code), '');
  v_kind text := nullif(btrim(p_object_kind), '');
  v_allowed constant text[] := array[
    'object_name', 'department', 'area_code', 'line', 'status', 'show_flag',
    'validate_flag', 'validate_reason', 'frequency_months', 'report_class',
    'workdays', 'critical_point', 'first_month', 'year_ref', 'note', 'is_active',
    'owner_name', 'support_name', 'work_group',
    'complexity_score', 'quality_impact_score', 'criticality_score'
  ];
  v_bad text[];
  v_touch_score boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    select principal.principal_kind into v_principal_kind
    from public.vmp_manager_principal(auth.uid()) principal;
    if v_principal_kind is null then
      return jsonb_build_object(
        'ok', false, 'error', 'Không xác định được người dùng'
      );
    end if;
    if v_principal_kind not in ('admin', 'qa_manager') then
      return jsonb_build_object(
        'ok', false,
        'error', 'Chỉ admin hoặc QA được thêm/sửa danh mục nguồn'
      );
    end if;
  end if;

  if v_code is null or v_kind is null then
    return jsonb_build_object(
      'ok', false, 'error', 'Thiếu mã hoặc loại đối tượng'
    );
  end if;
  if v_kind not in (
    'Thiết bị', 'Quy trình', 'Kho', 'Hệ thống phụ trợ', 'Vận chuyển'
  ) then
    return jsonb_build_object(
      'ok', false, 'error', 'Loại đối tượng không hợp lệ: ' || v_kind
    );
  end if;

  select array_agg(key) into v_bad
  from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) key
  where key <> all (v_allowed);
  if v_bad is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Trường không được phép sửa: ' || array_to_string(v_bad, ', ')
    );
  end if;

  v_touch_score := p_patch ?| array[
    'complexity_score', 'quality_impact_score', 'criticality_score'
  ];

  insert into public.vmp_source_objects (
    object_kind, object_code, source_tab, source_row, edited_on_web, updated_by
  ) values (
    v_kind, v_code, 'web', 0, true, auth.uid()
  )
  on conflict (object_kind, object_code) do update
  set edited_on_web = true, updated_by = auth.uid()
  returning id into v_id;

  update public.vmp_source_objects object
  set object_name = case when p_patch ? 'object_name' then p_patch->>'object_name' else object.object_name end,
      department = case when p_patch ? 'department' then p_patch->>'department' else object.department end,
      area_code = case when p_patch ? 'area_code' then p_patch->>'area_code' else object.area_code end,
      line = case when p_patch ? 'line' then p_patch->>'line' else object.line end,
      status = case when p_patch ? 'status' then p_patch->>'status' else object.status end,
      show_flag = case when p_patch ? 'show_flag' then p_patch->>'show_flag' else object.show_flag end,
      validate_flag = coalesce(
        lower(p_patch->>'validate_flag'), object.validate_flag
      ),
      validate_reason = case when p_patch ? 'validate_reason' then p_patch->>'validate_reason' else object.validate_reason end,
      report_class = case when p_patch ? 'report_class' then p_patch->>'report_class' else object.report_class end,
      critical_point = case when p_patch ? 'critical_point' then p_patch->>'critical_point' else object.critical_point end,
      note = case when p_patch ? 'note' then p_patch->>'note' else object.note end,
      owner_name = case when p_patch ? 'owner_name' then p_patch->>'owner_name' else object.owner_name end,
      support_name = case when p_patch ? 'support_name' then p_patch->>'support_name' else object.support_name end,
      work_group = case when p_patch ? 'work_group' then p_patch->>'work_group' else object.work_group end,
      frequency_months = case when p_patch ? 'frequency_months' then (p_patch->>'frequency_months')::integer else object.frequency_months end,
      workdays = case when p_patch ? 'workdays' then (p_patch->>'workdays')::integer else object.workdays end,
      first_month = case when p_patch ? 'first_month' then (p_patch->>'first_month')::integer else object.first_month end,
      year_ref = case when p_patch ? 'year_ref' then (p_patch->>'year_ref')::integer else object.year_ref end,
      complexity_score = case when p_patch ? 'complexity_score' then (p_patch->>'complexity_score')::integer else object.complexity_score end,
      quality_impact_score = case when p_patch ? 'quality_impact_score' then (p_patch->>'quality_impact_score')::integer else object.quality_impact_score end,
      criticality_score = case when p_patch ? 'criticality_score' then (p_patch->>'criticality_score')::integer else object.criticality_score end,
      criticality_source = case
        when v_touch_score then 'manual' else object.criticality_source
      end,
      is_active = coalesce(
        (p_patch->>'is_active')::boolean, object.is_active
      )
  where object.id = v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'object_code', v_code,
    'msg', case
      when v_touch_score then
        'Đã lưu — điểm trọng yếu chuyển sang ĐÃ DUYỆT, không bị chấm lại đè'
      else 'Đã lưu danh mục'
    end
  );
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end
$function$;

CREATE OR REPLACE FUNCTION public.rpc_upsert_product_gmp(p_bfo_code text, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_code text := nullif(btrim(p_bfo_code), '');
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được sửa danh mục sản phẩm');
  end if;
  if v_code is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập Mã BFO');
  end if;

  insert into public.vmp_products_gmp (bfo_code, source_row)
  values (v_code, 0)
  on conflict (bfo_code) do nothing;

  update public.vmp_products_gmp p set
    product_name     = case when p_patch ? 'product_name' then p_patch->>'product_name' else p.product_name end,
    ingredients      = case when p_patch ? 'ingredients' then p_patch->>'ingredients' else p.ingredients end,
    strength         = case when p_patch ? 'strength' then p_patch->>'strength' else p.strength end,
    production_line  = case when p_patch ? 'production_line' then p_patch->>'production_line' else p.production_line end,
    dosage_form      = case when p_patch ? 'dosage_form' then p_patch->>'dosage_form' else p.dosage_form end,
    primary_pack     = case when p_patch ? 'primary_pack' then p_patch->>'primary_pack' else p.primary_pack end,
    batch_size       = case when p_patch ? 'batch_size' then p_patch->>'batch_size' else p.batch_size end,
    note             = case when p_patch ? 'note' then p_patch->>'note' else p.note end,
    mixing_tank      = case when p_patch ? 'mixing_tank' then p_patch->>'mixing_tank' else p.mixing_tank end,
    final_batch_size = case when p_patch ? 'final_batch_size' then p_patch->>'final_batch_size' else p.final_batch_size end
    ,is_active = coalesce((p_patch->>'is_active')::boolean, p.is_active)
  where p.bfo_code = v_code;

  return jsonb_build_object('ok', true, 'bfo_code', v_code, 'msg', 'Đã lưu sản phẩm');
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_upsert_alert_recipient(p_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role  text;
  v_id    uuid := p_id;
  v_email text := nullif(btrim(p_patch ->> 'email'), '');
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if not public.duoc_phep('edit_catalog', v_role::text) then
    return jsonb_build_object('ok', false, 'error', 'Chỉ admin hoặc QA được sửa danh sách nhận cảnh báo');
  end if;
  if v_id is null and v_email is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập email');
  end if;

  if v_id is null then
    insert into public.vmp_alert_recipients (email, updated_by) values (v_email, auth.uid())
    returning id into v_id;
  end if;

  update public.vmp_alert_recipients r set
    is_enabled     = coalesce((p_patch ->> 'is_enabled')::boolean, r.is_enabled),
    scope_type     = coalesce(nullif(btrim(p_patch ->> 'scope_type'), ''), r.scope_type),
    scope          = case when p_patch ? 'scope' then p_patch->>'scope' else r.scope end,
    email          = coalesce(v_email,                      r.email),
    recipient_name = case when p_patch ? 'recipient_name' then p_patch->>'recipient_name' else r.recipient_name end,
    alert_kind     = coalesce(nullif(btrim(p_patch ->> 'alert_kind'), ''), r.alert_kind),
    threshold_days = coalesce((p_patch ->> 'threshold_days')::integer, r.threshold_days),
    note           = case when p_patch ? 'note' then p_patch->>'note' else r.note end,
    ai_report_enabled  = coalesce((p_patch ->> 'ai_report_enabled')::boolean, r.ai_report_enabled),
    ai_report_schedule = coalesce(nullif(btrim(p_patch ->> 'ai_report_schedule'), ''), r.ai_report_schedule),
    updated_by     = auth.uid()
  where r.id = v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'msg', 'Đã lưu người nhận');
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
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
        and public.vmp_business_role(performer.user_id) in ('qa_staff','qa_manager');
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
        and public.vmp_business_role(performer.user_id) in ('qa_staff','qa_manager');
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

CREATE OR REPLACE FUNCTION public.rpc_catalog_history(p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text;
  v_lim integer;
  v_off integer;
  v_table text;
  v_record text;
  v_action text;
  v_from timestamptz;
  v_to timestamptz;
  v_bad text[];
  v_total integer := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;

  v_role := public.vmp_business_role(auth.uid());
  if v_role not in ('admin', 'qa_manager') or v_role is null then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Không có quyền xem lịch sử danh mục');
  end if;

  v_lim := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off := greatest(coalesce(p_offset, 0), 0);
  v_table := nullif(btrim(coalesce(p_filters ->> 'table_name', '')), '');
  v_record := nullif(btrim(coalesce(p_filters ->> 'record_id', '')), '');
  v_action := nullif(btrim(coalesce(p_filters ->> 'action', '')), '');
  v_from := nullif(btrim(coalesce(p_filters ->> 'from', '')), '')::timestamptz;
  v_to := nullif(btrim(coalesce(p_filters ->> 'to', '')), '')::timestamptz;

  select array_agg(key order by key) into v_bad
  from jsonb_object_keys(coalesce(p_filters, '{}'::jsonb)) key
  where key <> all(array['table_name','record_id','action','from','to']::text[]);
  if v_bad is not null then
    return jsonb_build_object('ok', false, 'error_code', 'FILTER_NOT_ALLOWED',
      'error', 'Bộ lọc không được phép: ' || array_to_string(v_bad, ', '));
  end if;

  select count(*) into v_total
  from public.audit_logs a
  where a.table_name = any(array[
      'vmp_objects', 'vmp_products_gmp', 'vmp_email_cho_phep',
      'vmp_source_objects', 'vmp_alert_recipients'
    ]::text[])
    and (v_table is null or a.table_name = v_table)
    and (v_record is null or a.record_id = v_record)
    and (v_action is null or a.action::text = v_action)
    and (v_from is null or a.created_at >= v_from)
    and (v_to is null or a.created_at <= v_to);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id),
                  '[]'::jsonb)
    into v_rows
  from (
    select a.id, a.created_at,
           coalesce(a.user_name, a.user_email, '(không rõ)') as actor,
           coalesce(a.effective_business_role,
             'Không xác định (dữ liệu cũ)') as effective_business_role,
           a.action::text as action, a.table_name, a.record_id,
           a.changed_fields, a.change_reason as reason, a.source,
           (a.old_data is not null or a.new_data is not null) as has_detail
    from public.audit_logs a
    where a.table_name = any(array[
        'vmp_objects', 'vmp_products_gmp', 'vmp_email_cho_phep',
      'vmp_source_objects', 'vmp_alert_recipients'
      ]::text[])
      and (v_table is null or a.table_name = v_table)
      and (v_record is null or a.record_id = v_record)
      and (v_action is null or a.action::text = v_action)
      and (v_from is null or a.created_at >= v_from)
      and (v_to is null or a.created_at <= v_to)
    order by a.created_at desc, a.id
    limit v_lim offset v_off
  ) x;

  return jsonb_build_object('ok', true, 'total', v_total,
    'limit', v_lim, 'offset', v_off, 'history', v_rows);
end
$function$;

CREATE OR REPLACE FUNCTION public.rpc_catalog_history_detail(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text;
  v_row public.audit_logs%rowtype;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;

  v_role := public.vmp_business_role(auth.uid());
  if v_role not in ('admin', 'qa_manager') or v_role is null then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Không có quyền xem chi tiết lịch sử danh mục');
  end if;

  if p_id is not null then
    select * into v_row
    from public.audit_logs a
    where a.id = p_id
      and a.table_name = any(array[
        'vmp_objects', 'vmp_products_gmp', 'vmp_email_cho_phep',
      'vmp_source_objects', 'vmp_alert_recipients'
      ]::text[]);
  end if;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND',
      'error', 'Không tìm thấy dòng lịch sử này');
  end if;

  return jsonb_build_object('ok', true, 'history', jsonb_build_object(
    'id', v_row.id,
    'created_at', v_row.created_at,
    'actor', coalesce(v_row.user_name, v_row.user_email, '(không rõ)'),
    'effective_business_role', coalesce(v_row.effective_business_role,
      'Không xác định (dữ liệu cũ)'),
    'action', v_row.action::text,
    'table_name', v_row.table_name,
    'record_id', v_row.record_id,
    'changed_fields', v_row.changed_fields,
    'reason', v_row.change_reason,
    'source', v_row.source,
    'old_data', v_row.old_data,
    'new_data', v_row.new_data));
end
$function$;
commit;

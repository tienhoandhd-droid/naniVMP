-- Progressed catalog deadline override V2.
-- Fail closed against the reviewed five-role post-state, then install one
-- object mutex, a universal item row revision, guarded V2 boundaries and an
-- atomic V1+override implementation.

begin;

do $precondition$
declare
  v_owner oid;
  v_proc oid;
  v_hidden oid;
  v_required text;
begin
  if current_database() is null then
    raise exception using errcode='check_violation',message='CATALOG_V2_PRECONDITION_DATABASE';
  end if;

  foreach v_required in array array[
    'public.rpc_save_catalog_object(text,text,jsonb,text,integer)',
    'public.rpc_preview_catalog_change(uuid)',
    'public.rpc_apply_catalog_change(uuid,text,integer)',
    'public.rpc_save_catalog_object__five_role_impl_20260824(text,text,jsonb,text,integer)',
    'public.rpc_preview_catalog_change__five_role_impl_20260824(uuid)',
    'public.rpc_apply_catalog_change__five_role_impl_20260824(uuid,text,integer)',
    'public.vmp_tinh_moc_thoi_gian(integer,integer,integer,integer,text,numeric,text)',
    'public.audit_plan_item_changes_v2()',
    'public.vmp_is_active_session(uuid)',
    'public.vmp_session_denial()',
    'public.vmp_business_role(uuid)'
  ] loop
    if to_regprocedure(v_required) is null then
      raise exception using errcode='check_violation',
        message='CATALOG_V2_PRECONDITION_MISSING_FUNCTION ' || v_required;
    end if;
  end loop;

  if to_regclass('public.vmp_source_objects') is null
     or to_regclass('public.vmp_plan_items') is null
     or to_regclass('public.vmp_catalog_changes') is null
     or to_regclass('public.audit_logs') is null then
    raise exception using errcode='check_violation',message='CATALOG_V2_PRECONDITION_MISSING_TABLE';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('rpc_preview_catalog_change_v2','rpc_apply_catalog_change_v2')
  ) then
    raise exception using errcode='duplicate_function',message='CATALOG_V2_PRECONDITION_OVERLOAD_EXISTS';
  end if;

  select p.proowner into v_owner
  from pg_proc p where p.oid='public.rpc_apply_catalog_change(uuid,text,integer)'::regprocedure;

  foreach v_required in array array[
    'public.rpc_save_catalog_object(text,text,jsonb,text,integer)',
    'public.rpc_preview_catalog_change(uuid)',
    'public.rpc_apply_catalog_change(uuid,text,integer)'
  ] loop
    v_proc := v_required::regprocedure;
    select p.oid into v_proc from pg_proc p
    where p.oid=v_proc and p.proowner=v_owner and p.prosecdef
      and p.proconfig @> array['search_path=public, pg_temp'];
    if v_proc is null
       or not has_function_privilege('authenticated',v_required,'EXECUTE')
       or not has_function_privilege('service_role',v_required,'EXECUTE')
       or has_function_privilege('anon',v_required,'EXECUTE')
       or has_function_privilege('public',v_required,'EXECUTE')
       or (select count(*) from aclexplode(coalesce((select proacl from pg_proc where oid=v_required::regprocedure),
              acldefault('f',v_owner))) a
           where a.grantee<>v_owner and a.privilege_type='EXECUTE') <> 2 then
      raise exception using errcode='check_violation',
        message='CATALOG_V2_PRECONDITION_PUBLIC_WRAPPER ' || v_required;
    end if;
  end loop;

  foreach v_required in array array[
    'public.rpc_save_catalog_object__five_role_impl_20260824(text,text,jsonb,text,integer)',
    'public.rpc_preview_catalog_change__five_role_impl_20260824(uuid)',
    'public.rpc_apply_catalog_change__five_role_impl_20260824(uuid,text,integer)'
  ] loop
    v_hidden := v_required::regprocedure;
    if (select proowner from pg_proc where oid=v_hidden) <> v_owner
       or not (select prosecdef from pg_proc where oid=v_hidden)
       or not (select proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid=v_hidden)
       or exists (
         select 1 from aclexplode(coalesce((select proacl from pg_proc where oid=v_hidden),
           acldefault('f',v_owner))) a
         where a.grantee<>v_owner and a.privilege_type='EXECUTE'
       ) then
      raise exception using errcode='check_violation',
        message='CATALOG_V2_PRECONDITION_HIDDEN_IMPL ' || v_required;
    end if;
  end loop;

  v_proc := 'public.vmp_tinh_moc_thoi_gian(integer,integer,integer,integer,text,numeric,text)'::regprocedure;
  if (select proowner from pg_proc where oid=v_proc) <> v_owner
     or (select prosecdef from pg_proc where oid=v_proc)
     or (select provolatile from pg_proc where oid=v_proc) <> 'i'
     or has_function_privilege('authenticated',v_proc,'EXECUTE')
     or not has_function_privilege('service_role',v_proc,'EXECUTE')
     or has_function_privilege('anon',v_proc,'EXECUTE')
     or has_function_privilege('public',v_proc,'EXECUTE')
     or (select count(*) from aclexplode(coalesce((select proacl from pg_proc where oid=v_proc),
          acldefault('f',v_owner))) a
         where a.grantee<>v_owner and a.privilege_type='EXECUTE')<>1 then
    raise exception using errcode='check_violation',message='CATALOG_V2_PRECONDITION_DEADLINE_HELPER';
  end if;

  v_proc := 'public.audit_plan_item_changes_v2()'::regprocedure;
  if (select proowner from pg_proc where oid=v_proc) <> v_owner
     or not (select prosecdef from pg_proc where oid=v_proc)
     or not has_function_privilege('service_role',v_proc,'EXECUTE')
     or has_function_privilege('authenticated',v_proc,'EXECUTE')
     or has_function_privilege('anon',v_proc,'EXECUTE')
     or has_function_privilege('public',v_proc,'EXECUTE')
     or (select count(*) from aclexplode(coalesce((select proacl from pg_proc where oid=v_proc),
          acldefault('f',v_owner))) a
         where a.grantee<>v_owner and a.privilege_type='EXECUTE')<>1
     or not exists (
       select 1 from pg_trigger t
       where t.tgrelid='public.vmp_plan_items'::regclass
         and t.tgfoid=v_proc and t.tgname='audit_vmp_plan_items_v2'
         and not t.tgisinternal
     ) then
    raise exception using errcode='check_violation',message='CATALOG_V2_PRECONDITION_AUDIT';
  end if;

  if exists (
    select required.column_name
    from (values
      ('vmp_plan_items','validation_code'),('vmp_plan_items','object_code'),
      ('vmp_plan_items','validation_type'),('vmp_plan_items','year'),
      ('vmp_plan_items','version'),('vmp_plan_items','is_active'),
      ('vmp_plan_items','item_state'),('vmp_plan_items','deadline_protocol'),
      ('vmp_plan_items','deadline_validation'),('vmp_plan_items','deadline_report'),
      ('vmp_plan_items','deadline_vmp'),('vmp_plan_items','actual_protocol_date'),
      ('vmp_plan_items','actual_validation_date'),('vmp_plan_items','actual_report_date'),
      ('vmp_plan_items','actual_vmp_date'),('vmp_plan_items','status_protocol'),
      ('vmp_plan_items','status_validation'),('vmp_plan_items','status_report'),
      ('vmp_plan_items','status_vmp'),('vmp_source_objects','timeline_revision'),
      ('vmp_source_objects','timeline_applied_revision'),('vmp_source_objects','validate_flag'),
      ('vmp_source_objects','first_month'),('vmp_catalog_changes','apply_result'),
      ('audit_logs','changed_fields'),('audit_logs','effective_business_role')
    ) required(table_name,column_name)
    left join information_schema.columns c on c.table_schema='public'
      and c.table_name=required.table_name and c.column_name=required.column_name
    where c.column_name is null
  ) then
    raise exception using errcode='check_violation',message='CATALOG_V2_PRECONDITION_COLUMNS';
  end if;

  if (select atttypid from pg_attribute where attrelid='public.vmp_plan_items'::regclass
      and attname='version' and not attisdropped)<>'integer'::regtype
     or (select attnotnull from pg_attribute where attrelid='public.vmp_plan_items'::regclass
         and attname='version' and not attisdropped) is not true
     or exists (
       select 1 from unnest(array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp']) c(name)
       join pg_attribute a on a.attrelid='public.vmp_plan_items'::regclass
         and a.attname=c.name and not a.attisdropped
       where a.atttypid<>'date'::regtype
     )
     or exists (
       select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
       where t.tgrelid='public.vmp_plan_items'::regclass and not t.tgisinternal
         and (t.tgtype & 2)=2 and pg_get_functiondef(p.oid) ilike '%new.version%'
     ) then
    raise exception using errcode='check_violation',message='CATALOG_V2_PRECONDITION_ROW_REVISION';
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='public.vmp_source_objects'::regclass and c.contype='u'
      and pg_get_constraintdef(c.oid)='UNIQUE (object_kind, object_code)'
  ) then
    raise exception using errcode='check_violation',message='CATALOG_V2_PRECONDITION_OBJECT_IDENTITY';
  end if;
end
$precondition$;

create function public.vmp_lock_catalog_object_v2(p_object_kind text,p_object_code text)
returns void
language sql
volatile
security invoker
set search_path=public,pg_temp
as $function$
  select pg_advisory_xact_lock(hashtextextended(
    coalesce(p_object_kind,'') || chr(31) || coalesce(p_object_code,''),
    20260826130000
  ))
$function$;

revoke all on function public.vmp_lock_catalog_object_v2(text,text) from public,anon,authenticated,service_role;

create function public.vmp_plan_item_row_revision_v2()
returns trigger
language plpgsql
volatile
security invoker
set search_path=public,pg_temp
as $function$
begin
  new.version := old.version + 1;
  return new;
end
$function$;

revoke all on function public.vmp_plan_item_row_revision_v2() from public,anon,authenticated,service_role;
create trigger vmp_plan_item_row_revision_v2
before update on public.vmp_plan_items
for each row execute function public.vmp_plan_item_row_revision_v2();

comment on column public.vmp_plan_items.version is
  'Whole-row optimistic revision. Every UPDATE statement increments exactly once.';

create or replace function public.audit_plan_item_changes_v2()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_user_id uuid;
  v_action text;
  v_changed text[] := '{}';
  v_validation_code text;
  v_reason text;
  v_business_role text;
begin
  v_reason := nullif(current_setting('app.audit_reason',true),'');
  if tg_op='INSERT' then
    v_action := 'INSERT'; v_user_id := new.created_by; v_validation_code := new.validation_code;
  elsif tg_op='UPDATE' then
    v_user_id := coalesce(new.updated_by,old.updated_by);
    v_validation_code := coalesce(new.validation_code,old.validation_code);
    if old.status_protocol is distinct from new.status_protocol then v_changed:=array_append(v_changed,'status_protocol'); end if;
    if old.status_validation is distinct from new.status_validation then v_changed:=array_append(v_changed,'status_validation'); end if;
    if old.status_report is distinct from new.status_report then v_changed:=array_append(v_changed,'status_report'); end if;
    if old.status_vmp is distinct from new.status_vmp then v_changed:=array_append(v_changed,'status_vmp'); end if;
    if old.deadline_vmp is distinct from new.deadline_vmp then v_changed:=array_append(v_changed,'deadline_vmp'); end if;
    if old.deadline_protocol is distinct from new.deadline_protocol then v_changed:=array_append(v_changed,'deadline_protocol'); end if;
    if old.deadline_validation is distinct from new.deadline_validation then v_changed:=array_append(v_changed,'deadline_validation'); end if;
    if old.deadline_report is distinct from new.deadline_report then v_changed:=array_append(v_changed,'deadline_report'); end if;
    if old.owner_name is distinct from new.owner_name then v_changed:=array_append(v_changed,'owner_name'); end if;
    if old.is_active is distinct from new.is_active then v_changed:=array_append(v_changed,'is_active'); end if;
    if old.missing_from_sheet is distinct from new.missing_from_sheet then v_changed:=array_append(v_changed,'missing_from_sheet'); end if;
    if old.actual_vmp_date is distinct from new.actual_vmp_date then v_changed:=array_append(v_changed,'actual_vmp_date'); end if;
    if old.actual_protocol_date is distinct from new.actual_protocol_date then v_changed:=array_append(v_changed,'actual_protocol_date'); end if;
    if old.actual_validation_date is distinct from new.actual_validation_date then v_changed:=array_append(v_changed,'actual_validation_date'); end if;
    if old.actual_report_date is distinct from new.actual_report_date then v_changed:=array_append(v_changed,'actual_report_date'); end if;
    if old.item_state is distinct from new.item_state then v_changed:=array_append(v_changed,'item_state'); end if;
    if old.scheduled_date is distinct from new.scheduled_date then v_changed:=array_append(v_changed,'scheduled_date'); end if;
    if old.secondary_owner is distinct from new.secondary_owner then v_changed:=array_append(v_changed,'secondary_owner'); end if;
    if old.criticality_score is distinct from new.criticality_score then v_changed:=array_append(v_changed,'criticality_score'); end if;
    if array_length(v_changed,1) is null then return new; end if;
    if old.is_active and not new.is_active then v_action:='DELETE';
    elsif v_changed && array['status_protocol','status_validation','status_report','status_vmp'] then v_action:='STATUS_CHANGE';
    elsif v_changed && array['deadline_vmp','deadline_protocol','deadline_validation','deadline_report'] then v_action:='DEADLINE_CHANGE';
    else v_action:='UPDATE'; end if;
  elsif tg_op='DELETE' then
    v_action:='DELETE'; v_user_id:=old.updated_by; v_validation_code:=old.validation_code;
  end if;
  begin
    v_business_role:=public.vmp_business_role(coalesce(auth.uid(),v_user_id));
  exception when others then v_business_role:=null;
  end;
  insert into public.audit_logs (
    user_id,action,table_name,record_id,validation_code,changed_fields,
    change_reason,old_data,new_data,source,effective_business_role
  ) values (
    v_user_id,v_action::audit_action,'vmp_plan_items',coalesce(new.id,old.id),
    v_validation_code,v_changed,v_reason,
    case when tg_op<>'INSERT' then to_jsonb(old) else null end,
    case when tg_op<>'DELETE' then to_jsonb(new) else null end,
    coalesce(current_setting('app.audit_source',true),'trigger'),v_business_role
  );
  return coalesce(new,old);
end
$function$;

create or replace function public.rpc_save_catalog_object(
  p_object_kind text,p_object_code text,p_patch jsonb,
  p_reason text default null,p_expected_version integer default null
)
returns jsonb language plpgsql volatile security definer
set search_path=public,pg_temp
as $function$
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  perform public.vmp_lock_catalog_object_v2(p_object_kind,p_object_code);
  return public.rpc_save_catalog_object__five_role_impl_20260824(
    p_object_kind,p_object_code,p_patch,p_reason,p_expected_version);
end
$function$;

create or replace function public.rpc_apply_catalog_change(
  p_change_id uuid,p_reason text,p_expected_timeline_revision integer default null
)
returns jsonb language plpgsql volatile security definer
set search_path=public,pg_temp
as $function$
declare
  v_kind text;
  v_code text;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;
  select object_kind,object_code into v_kind,v_code
  from public.vmp_catalog_changes where id=p_change_id;
  if v_kind is not null then perform public.vmp_lock_catalog_object_v2(v_kind,v_code); end if;
  return public.rpc_apply_catalog_change__five_role_impl_20260824(
    p_change_id,p_reason,p_expected_timeline_revision);
end
$function$;

create function public.vmp_preview_catalog_change_v2_impl(p_change_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path=public,pg_temp
as $function$
declare
  v_base jsonb;
  v_change public.vmp_catalog_changes%rowtype;
  v_source public.vmp_source_objects%rowtype;
  v_item public.vmp_plan_items%rowtype;
  v_entry jsonb;
  v_candidates jsonb := '[]'::jsonb;
  v_match text[];
  v_occurrence integer;
  v_moc record;
  v_missing jsonb;
  v_eligible boolean;
  v_blocker text;
  v_reason text;
begin
  v_base := public.rpc_preview_catalog_change(p_change_id);
  if coalesce((v_base->>'ok')::boolean,false) is not true then return v_base; end if;
  select * into v_change from public.vmp_catalog_changes where id=p_change_id;
  select * into v_source from public.vmp_source_objects
  where object_kind=v_change.object_kind and object_code=v_change.object_code;

  for v_entry in select value from jsonb_array_elements(coalesce(v_base->'giu_nguyen','[]'::jsonb)) loop
    select * into v_item from public.vmp_plan_items
    where validation_code=v_entry->>'validation_code';
    v_match := case when v_item.id is null then null
      else regexp_match(v_item.validation_code,'/([0-9]{4})\.([0-9]+)-(.+)$') end;
    v_occurrence := null;
    if v_match is not null then
      begin v_occurrence:=v_match[2]::integer; exception when others then v_occurrence:=null; end;
    end if;
    if v_item.id is not null and v_occurrence is not null then
      select * into v_moc from public.vmp_tinh_moc_thoi_gian(
        v_item.year,v_source.first_month,coalesce(nullif(v_source.frequency_months,0),12),
        v_occurrence,v_source.report_class,v_source.workdays,v_item.validation_type);
      v_missing:=coalesce(to_jsonb(v_moc.thieu),'[]'::jsonb);
    else
      v_missing:='[]'::jsonb;
      v_moc.deadline_protocol:=null; v_moc.deadline_validation:=null;
      v_moc.deadline_report:=null; v_moc.deadline_vmp:=null;
    end if;

    v_blocker:=null; v_reason:=null;
    if v_item.id is null then v_blocker:='ITEM_NOT_FOUND'; v_reason:='Hạng mục không còn tồn tại';
    elsif v_item.object_code is distinct from v_source.object_code then v_blocker:='WRONG_MEMBERSHIP'; v_reason:='Hạng mục không còn thuộc đối tượng';
    elsif coalesce(lower(v_source.validate_flag),'n')<>'y' or not coalesce(v_source.is_active,true) then v_blocker:='STOP_FLOW'; v_reason:='Đối tượng đang thuộc luồng Dừng';
    elsif not coalesce(v_item.is_active,true) then v_blocker:='ITEM_INACTIVE'; v_reason:='Hạng mục không còn hiệu lực';
    elsif v_item.item_state is distinct from 'active' then v_blocker:='ITEM_STATE_INACTIVE'; v_reason:='Hạng mục đã hủy hoặc không áp dụng';
    elsif v_match is null or v_match[1]::integer<>v_item.year
       or v_match[1]::integer<>extract(year from now())::integer
       or v_match[3] is distinct from v_item.validation_type
       or v_item.validation_code is distinct from
          (v_item.object_code||'/'||v_match[1]||'.'||v_match[2]||'-'||v_match[3])
      then v_blocker:='INVALID_ITEM_IDENTITY'; v_reason:='Mã hạng mục không khớp định danh năm/lần/loại';
    elsif jsonb_array_length(v_missing)>0
       or v_moc.deadline_protocol is null or v_moc.deadline_validation is null
       or v_moc.deadline_report is null or v_moc.deadline_vmp is null
      then v_blocker:='MISSING_SOURCE_DATA'; v_reason:='Không tính đủ bốn deadline';
    elsif not (v_item.deadline_protocol is distinct from v_moc.deadline_protocol
       or v_item.deadline_validation is distinct from v_moc.deadline_validation
       or v_item.deadline_report is distinct from v_moc.deadline_report
       or v_item.deadline_vmp is distinct from v_moc.deadline_vmp)
      then v_blocker:='NO_ACTIONABLE_CHANGE'; v_reason:='Deadline hiện tại đã khớp nguồn';
    end if;
    v_eligible:=v_blocker is null;
    v_candidates:=v_candidates||jsonb_build_object(
      'validation_code',v_entry->>'validation_code','item_version',v_item.version,
      'eligible',v_eligible,'blocker_code',v_blocker,'blocker_reason',v_reason,
      'missing',v_missing,
      'progress',jsonb_build_object(
        'actual_protocol_date',v_item.actual_protocol_date,
        'actual_validation_date',v_item.actual_validation_date,
        'actual_report_date',v_item.actual_report_date,
        'actual_vmp_date',v_item.actual_vmp_date,
        'status_protocol',v_item.status_protocol,
        'status_validation',v_item.status_validation,
        'status_report',v_item.status_report,
        'status_vmp',v_item.status_vmp),
      'deadline_protocol_cu',v_item.deadline_protocol,'deadline_protocol_moi',v_moc.deadline_protocol,
      'deadline_validation_cu',v_item.deadline_validation,'deadline_validation_moi',v_moc.deadline_validation,
      'deadline_report_cu',v_item.deadline_report,'deadline_report_moi',v_moc.deadline_report,
      'deadline_vmp_cu',v_item.deadline_vmp,'deadline_vmp_moi',v_moc.deadline_vmp);
  end loop;
  return v_base||jsonb_build_object('deadline_overrides',v_candidates);
end
$function$;

revoke all on function public.vmp_preview_catalog_change_v2_impl(uuid) from public,anon,authenticated,service_role;

create function public.rpc_preview_catalog_change_v2(p_change_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if;
  if coalesce(auth.role(),'')<>'service_role'
     and coalesce(public.vmp_business_role(auth.uid()),'') not in ('admin','qa_manager') then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Chỉ Admin và Quản lý QA được cập nhật deadline của hạng mục đã có tiến độ');
  end if;
  return public.vmp_preview_catalog_change_v2_impl(p_change_id);
end
$function$;

create function public.vmp_apply_catalog_change_v2_impl(
  p_change_id uuid,p_reason text,p_expected_timeline_revision integer,
  p_deadline_overrides jsonb,p_override_confirmed boolean
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,pg_temp
as $function$
declare
  v_change public.vmp_catalog_changes%rowtype;
  v_source public.vmp_source_objects%rowtype;
  v_item public.vmp_plan_items%rowtype;
  v_selection jsonb;
  v_candidate jsonb;
  v_preview jsonb;
  v_entry jsonb;
  v_moc record;
  v_match text[];
  v_codes text[];
  v_expected integer;
  v_index integer:=0;
  v_count integer;
  v_v1 jsonb;
  v_snapshots jsonb:='{}'::jsonb;
  v_snapshot jsonb;
  v_deadline_results jsonb:='[]'::jsonb;
  v_result jsonb;
  v_effective_role text;
begin
  select * into v_change from public.vmp_catalog_changes where id=p_change_id;
  if v_change.id is null then
    return jsonb_build_object('ok',false,'error_code','CHANGE_NOT_FOUND','error','Không tìm thấy thay đổi này');
  end if;
  perform public.vmp_lock_catalog_object_v2(v_change.object_kind,v_change.object_code);
  select * into v_change from public.vmp_catalog_changes where id=p_change_id for update;
  if v_change.id is null then
    return jsonb_build_object('ok',false,'error_code','CHANGE_NOT_FOUND','error','Không tìm thấy thay đổi này');
  end if;
  if v_change.status='applied' then
    return coalesce(v_change.apply_result,jsonb_build_object('ok',true))
      ||jsonb_build_object('ok',true,'da_ap_truoc_do',true);
  end if;
  if v_change.status='superseded' then
    return jsonb_build_object('ok',false,'error_code','SUPERSEDED','error','Thay đổi này đã bị một thay đổi mới hơn thay thế');
  end if;
  if p_expected_timeline_revision is null then
    return jsonb_build_object('ok',false,'error_code','EXPECTED_REVISION_REQUIRED','error','Thiếu phiên bản timeline đã xem trước');
  end if;
  if p_deadline_overrides is null or jsonb_typeof(p_deadline_overrides)<>'array' then
    return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD',
      'error','Danh sách ghi đè deadline không hợp lệ',
      'details',jsonb_build_array(jsonb_build_object('index',null,'reason','TOP_LEVEL_MUST_BE_ARRAY')));
  end if;
  for v_selection in select value from jsonb_array_elements(p_deadline_overrides) loop
    if jsonb_typeof(v_selection)<>'object' then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
        'details',jsonb_build_array(jsonb_build_object('index',v_index,'reason','ITEM_MUST_BE_OBJECT')));
    end if;
    if not (v_selection?'validation_code' and v_selection?'expected_item_version')
       or (select count(*) from jsonb_object_keys(v_selection))<>2 then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
        'details',jsonb_build_array(jsonb_build_object('index',v_index,'reason','EXACT_KEYS_REQUIRED')));
    end if;
    if jsonb_typeof(v_selection->'validation_code')<>'string'
       or nullif(btrim(v_selection->>'validation_code'),'') is null then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
        'details',jsonb_build_array(jsonb_build_object('index',v_index,'reason','VALIDATION_CODE_REQUIRED')));
    end if;
    if jsonb_typeof(v_selection->'expected_item_version')<>'number'
       or (v_selection->>'expected_item_version')!~'^-?[0-9]+$' then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
        'details',jsonb_build_array(jsonb_build_object('index',v_index,'reason','INTEGER_VERSION_REQUIRED')));
    end if;
    begin v_expected:=(v_selection->>'expected_item_version')::integer;
    exception when numeric_value_out_of_range then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
        'details',jsonb_build_array(jsonb_build_object('index',v_index,'reason','INTEGER_VERSION_REQUIRED')));
    end;
    v_index:=v_index+1;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_deadline_overrides) e
      group by e->>'validation_code' having count(*)>1) then
    return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_PAYLOAD','error','Danh sách ghi đè deadline không hợp lệ',
      'details',jsonb_build_array(jsonb_build_object('index',null,'reason','DUPLICATE_VALIDATION_CODE')));
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok',false,'error_code','REASON_REQUIRED','error','Phải nhập lý do trước khi áp vào timeline');
  end if;
  if jsonb_array_length(p_deadline_overrides)>0 and p_override_confirmed is not true then
    return jsonb_build_object('ok',false,'error_code','OVERRIDE_NOT_CONFIRMED',
      'error','Cần xác nhận đặc biệt để áp deadline đã có tiến độ');
  end if;

  select * into v_source from public.vmp_source_objects
  where object_kind=v_change.object_kind and object_code=v_change.object_code for update;
  if v_source.id is null then
    return jsonb_build_object('ok',false,'error_code','OBJECT_NOT_FOUND','error','Đối tượng đã bị xoá khỏi danh mục');
  end if;
  if v_source.timeline_revision is distinct from p_expected_timeline_revision then
    return jsonb_build_object('ok',false,'error_code','VERSION_CONFLICT',
      'error','Timeline đã đổi — xem trước lại',
      'expected_timeline_revision',p_expected_timeline_revision,
      'current_timeline_revision',v_source.timeline_revision);
  end if;

  v_preview:=public.rpc_preview_catalog_change_v2(p_change_id);
  if coalesce((v_preview->>'ok')::boolean,false) is not true then return v_preview; end if;
  select array_agg(distinct code order by code) into v_codes from (
    select value->>'validation_code' code from jsonb_array_elements(coalesce(v_preview->'tao','[]'))
    union all select value->>'validation_code' from jsonb_array_elements(coalesce(v_preview->'sua','[]'))
    union all select value->>'validation_code' from jsonb_array_elements(coalesce(v_preview->'dung','[]'))
    union all select value->>'validation_code' from jsonb_array_elements(coalesce(v_preview->'giu_nguyen','[]'))
  ) impact where code is not null;
  perform 1 from public.vmp_plan_items
  where validation_code=any(coalesce(v_codes,'{}'::text[])) order by validation_code for update;

  for v_selection in select value from jsonb_array_elements(p_deadline_overrides) loop
    select * into v_item from public.vmp_plan_items where validation_code=v_selection->>'validation_code';
    if v_item.id is null then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_ITEM',
        'error','Mã ghi đè không hợp lệ: '||(v_selection->>'validation_code'),
        'details',jsonb_build_array(v_selection->>'validation_code'));
    end if;
    v_expected:=(v_selection->>'expected_item_version')::integer;
    if v_item.version is distinct from v_expected then
      return jsonb_build_object('ok',false,'error_code','ITEM_STATE_CHANGED',
        'error','Hạng mục '||(v_selection->>'validation_code')||' đã đổi sau khi xem trước; hãy xem trước lại',
        'validation_code',v_selection->>'validation_code','expected_item_version',v_expected,
        'current_item_version',v_item.version,'requires_fresh_preview',true);
    end if;
  end loop;

  v_preview:=public.rpc_preview_catalog_change_v2(p_change_id);
  for v_selection in select value from jsonb_array_elements(p_deadline_overrides) loop
    select value into v_candidate from jsonb_array_elements(coalesce(v_preview->'deadline_overrides','[]'))
    where value->>'validation_code'=v_selection->>'validation_code';
    if v_candidate is null then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_ITEM',
        'error','Mã ghi đè không hợp lệ: '||(v_selection->>'validation_code'),
        'details',jsonb_build_array(v_selection->>'validation_code'));
    end if;
    if v_candidate->>'blocker_code'='MISSING_SOURCE_DATA' then
      return jsonb_build_object('ok',false,'error_code','MISSING_SOURCE_DATA',
        'error','Không tính đủ deadline cho '||(v_selection->>'validation_code'),
        'missing',jsonb_build_array(jsonb_build_object('validation_code',v_selection->>'validation_code','fields',v_candidate->'missing')));
    end if;
    if v_candidate->>'blocker_code'='NO_ACTIONABLE_CHANGE' then
      return jsonb_build_object('ok',false,'error_code','NO_ACTIONABLE_CHANGE','error','Không có thay đổi để áp');
    end if;
    if coalesce((v_candidate->>'eligible')::boolean,false) is not true then
      return jsonb_build_object('ok',false,'error_code','INVALID_OVERRIDE_ITEM',
        'error','Mã ghi đè không hợp lệ: '||(v_selection->>'validation_code'),
        'details',jsonb_build_array(jsonb_build_object('validation_code',v_selection->>'validation_code',
          'reason',v_candidate->>'blocker_reason','blocker_code',v_candidate->>'blocker_code')));
    end if;
    select * into v_item from public.vmp_plan_items where validation_code=v_selection->>'validation_code';
    v_snapshots:=v_snapshots||jsonb_build_object(v_item.validation_code,to_jsonb(v_item));
  end loop;

  if jsonb_array_length(coalesce(v_preview->'tao','[]'))=0
     and jsonb_array_length(coalesce(v_preview->'sua','[]'))=0
     and jsonb_array_length(coalesce(v_preview->'dung','[]'))=0
     and jsonb_array_length(p_deadline_overrides)=0 then
    return jsonb_build_object('ok',false,'error_code','NO_ACTIONABLE_CHANGE','error','Không có thay đổi để áp');
  end if;

  begin
    perform set_config('app.audit_source','catalog_progressed_deadline_override',true);
    perform set_config('app.audit_reason',btrim(p_reason),true);
    v_v1:=public.rpc_apply_catalog_change(p_change_id,p_reason,p_expected_timeline_revision);
    if coalesce((v_v1->>'ok')::boolean,false) is not true then
      raise exception using errcode='P2001',message='V1_REJECTED';
    end if;

    for v_entry in select value from jsonb_array_elements(coalesce(v_preview->'tao','[]')) loop
      select * into v_item from public.vmp_plan_items where validation_code=v_entry->>'validation_code';
      if not found then raise exception using errcode='P2001',message='CREATE_ROW_MISSING'; end if;
      v_match:=regexp_match(v_item.validation_code,'/([0-9]{4})\.([0-9]+)-(.+)$');
      if v_match is null then raise exception using errcode='P2001',message='CREATE_IDENTITY'; end if;
      select * into v_moc from public.vmp_tinh_moc_thoi_gian(v_item.year,v_source.first_month,
        coalesce(nullif(v_source.frequency_months,0),12),v_match[2]::integer,
        v_source.report_class,v_source.workdays,v_item.validation_type);
      if v_item.object_code is distinct from v_source.object_code
         or v_item.validation_type is distinct from v_entry->>'validation_type'
         or v_item.year is distinct from extract(year from now())::integer
         or v_item.deadline_protocol is distinct from v_moc.deadline_protocol
         or v_item.deadline_validation is distinct from v_moc.deadline_validation
         or v_item.deadline_report is distinct from v_moc.deadline_report
         or v_item.deadline_vmp is distinct from v_moc.deadline_vmp then
        raise exception using errcode='P2001',message='CREATE_POSTSTATE';
      end if;
    end loop;
    for v_entry in select value from jsonb_array_elements(coalesce(v_preview->'sua','[]')) loop
      select * into v_item from public.vmp_plan_items where validation_code=v_entry->>'validation_code';
      if not found then raise exception using errcode='P2001',message='UPDATE_ROW_MISSING'; end if;
      v_match:=regexp_match(v_item.validation_code,'/([0-9]{4})\.([0-9]+)-(.+)$');
      if v_match is null then raise exception using errcode='P2001',message='UPDATE_IDENTITY'; end if;
      select * into v_moc from public.vmp_tinh_moc_thoi_gian(v_item.year,v_source.first_month,
        coalesce(nullif(v_source.frequency_months,0),12),v_match[2]::integer,
        v_source.report_class,v_source.workdays,v_item.validation_type);
      if v_item.object_code is distinct from v_source.object_code
         or (v_source.report_class is not null and v_item.report_class is distinct from v_source.report_class)
         or (v_source.workdays is not null and v_item.effort_days is distinct from v_source.workdays::numeric)
         or v_item.deadline_protocol is distinct from v_moc.deadline_protocol
         or v_item.deadline_validation is distinct from v_moc.deadline_validation
         or v_item.deadline_report is distinct from v_moc.deadline_report
         or v_item.deadline_vmp is distinct from v_moc.deadline_vmp then
        raise exception using errcode='P2001',message='UPDATE_POSTSTATE';
      end if;
    end loop;
    for v_entry in select value from jsonb_array_elements(coalesce(v_preview->'dung','[]')) loop
      select * into v_item from public.vmp_plan_items where validation_code=v_entry->>'validation_code';
      if not found or v_item.object_code is distinct from v_source.object_code
         or coalesce(v_item.is_active,true) or v_item.item_state is distinct from 'not_applicable' then
        raise exception using errcode='P2001',message='STOP_POSTSTATE';
      end if;
    end loop;

    for v_selection in select value from jsonb_array_elements(p_deadline_overrides) loop
      select value into v_candidate from jsonb_array_elements(v_preview->'deadline_overrides')
      where value->>'validation_code'=v_selection->>'validation_code';
      v_snapshot:=v_snapshots->(v_selection->>'validation_code');
      update public.vmp_plan_items set
        deadline_protocol=(v_candidate->>'deadline_protocol_moi')::date,
        deadline_validation=(v_candidate->>'deadline_validation_moi')::date,
        deadline_report=(v_candidate->>'deadline_report_moi')::date,
        deadline_vmp=(v_candidate->>'deadline_vmp_moi')::date,
        updated_by=auth.uid(),updated_at=now()
      where validation_code=v_selection->>'validation_code'
        and version=(v_selection->>'expected_item_version')::integer;
      get diagnostics v_count=row_count;
      if v_count<>1 then raise exception using errcode='P2001',message='OVERRIDE_ROWCOUNT'; end if;
      select * into v_item from public.vmp_plan_items where validation_code=v_selection->>'validation_code';
      if v_item.deadline_protocol is distinct from (v_candidate->>'deadline_protocol_moi')::date
         or v_item.deadline_validation is distinct from (v_candidate->>'deadline_validation_moi')::date
         or v_item.deadline_report is distinct from (v_candidate->>'deadline_report_moi')::date
         or v_item.deadline_vmp is distinct from (v_candidate->>'deadline_vmp_moi')::date
         or v_item.version<>(v_selection->>'expected_item_version')::integer+1
         or (to_jsonb(v_item)-array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp','computed_status','version','updated_at','updated_by'])
            is distinct from
            (v_snapshot-array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp','computed_status','version','updated_at','updated_by']) then
        raise exception using errcode='P2001',message='OVERRIDE_POSTSTATE';
      end if;
      v_deadline_results:=v_deadline_results||jsonb_build_object(
        'validation_code',v_item.validation_code,
        'item_version_cu',(v_selection->>'expected_item_version')::integer,'item_version_moi',v_item.version,
        'deadline_protocol_cu',v_candidate->'deadline_protocol_cu','deadline_protocol_moi',v_candidate->'deadline_protocol_moi',
        'deadline_validation_cu',v_candidate->'deadline_validation_cu','deadline_validation_moi',v_candidate->'deadline_validation_moi',
        'deadline_report_cu',v_candidate->'deadline_report_cu','deadline_report_moi',v_candidate->'deadline_report_moi',
        'deadline_vmp_cu',v_candidate->'deadline_vmp_cu','deadline_vmp_moi',v_candidate->'deadline_vmp_moi',
        'actual_dates_unchanged',true,'statuses_unchanged',true);
    end loop;

    if (select timeline_applied_revision from public.vmp_source_objects where id=v_source.id)
       is distinct from v_source.timeline_revision then
      raise exception using errcode='P2001',message='SOURCE_APPLIED_REVISION';
    end if;
    v_effective_role:=case when coalesce(auth.role(),'')='service_role' then 'service_role'
      else public.vmp_business_role(auth.uid()) end;
    v_result:=jsonb_build_object(
      'ok',true,'change_id',p_change_id,'object_code',v_source.object_code,
      'so_tao',jsonb_array_length(coalesce(v_preview->'tao','[]')),
      'so_sua',jsonb_array_length(coalesce(v_preview->'sua','[]')),
      'so_dung',jsonb_array_length(coalesce(v_preview->'dung','[]')),
      'so_giu_nguyen',jsonb_array_length(coalesce(v_preview->'giu_nguyen','[]')),
      'so_deadline_override',jsonb_array_length(p_deadline_overrides),
      'timeline_revision',v_source.timeline_revision,'actor_id',auth.uid(),
      'effective_role',v_effective_role,'reason',btrim(p_reason),
      'deadline_overrides',v_deadline_results,'da_ap_truoc_do',false);
    update public.vmp_catalog_changes set status='applied',impact=v_preview,apply_result=v_result,
      applied_by=auth.uid(),applied_at=now(),apply_reason=btrim(p_reason),last_error=null
    where id=p_change_id;
    get diagnostics v_count=row_count;
    if v_count<>1 then raise exception using errcode='P2001',message='RESULT_ROWCOUNT'; end if;
    return v_result;
  exception when sqlstate 'P2001' then
    return jsonb_build_object('ok',false,'error_code','WRITE_MISMATCH',
      'error','Không thể ghi nguyên tử; toàn bộ thay đổi đã được hoàn tác');
  end;
end
$function$;

revoke all on function public.vmp_apply_catalog_change_v2_impl(uuid,text,integer,jsonb,boolean)
  from public,anon,authenticated,service_role;

create function public.rpc_apply_catalog_change_v2(
  p_change_id uuid,p_reason text,p_expected_timeline_revision integer,
  p_deadline_overrides jsonb,p_override_confirmed boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if;
  if coalesce(auth.role(),'')<>'service_role'
     and coalesce(public.vmp_business_role(auth.uid()),'') not in ('admin','qa_manager') then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Chỉ Admin và Quản lý QA được cập nhật deadline của hạng mục đã có tiến độ');
  end if;
  return public.vmp_apply_catalog_change_v2_impl(
    p_change_id,p_reason,p_expected_timeline_revision,p_deadline_overrides,p_override_confirmed);
end
$function$;

do $owners$
declare v_owner name;
begin
  select r.rolname into v_owner from pg_proc p join pg_roles r on r.oid=p.proowner
  where p.oid='public.rpc_apply_catalog_change(uuid,text,integer)'::regprocedure;
  execute format('alter function public.vmp_lock_catalog_object_v2(text,text) owner to %I',v_owner);
  execute format('alter function public.vmp_plan_item_row_revision_v2() owner to %I',v_owner);
  execute format('alter function public.vmp_preview_catalog_change_v2_impl(uuid) owner to %I',v_owner);
  execute format('alter function public.vmp_apply_catalog_change_v2_impl(uuid,text,integer,jsonb,boolean) owner to %I',v_owner);
  execute format('alter function public.rpc_preview_catalog_change_v2(uuid) owner to %I',v_owner);
  execute format('alter function public.rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean) owner to %I',v_owner);
end
$owners$;

revoke all on function public.rpc_preview_catalog_change_v2(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_preview_catalog_change_v2(uuid) to authenticated,service_role;
grant execute on function public.rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean) to authenticated,service_role;

do $postcondition$
begin
  if not has_function_privilege('authenticated','public.rpc_preview_catalog_change_v2(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)','EXECUTE')
     or has_function_privilege('anon','public.rpc_preview_catalog_change_v2(uuid)','EXECUTE')
     or has_function_privilege('public','public.rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)','EXECUTE')
     or exists (
       select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       where n.nspname='public'
         and p.proname in ('vmp_lock_catalog_object_v2','vmp_plan_item_row_revision_v2',
           'vmp_preview_catalog_change_v2_impl','vmp_apply_catalog_change_v2_impl')
         and a.grantee<>p.proowner and a.privilege_type='EXECUTE'
     )
     or (select count(*) from pg_trigger t
         where t.tgrelid='public.vmp_plan_items'::regclass and not t.tgisinternal
           and t.tgname='vmp_plan_item_row_revision_v2' and (t.tgtype & 2)=2)<>1 then
    raise exception using errcode='check_violation',message='CATALOG_V2_POSTCONDITION_ACL';
  end if;
end
$postcondition$;

commit;

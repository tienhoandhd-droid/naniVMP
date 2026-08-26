-- Dedicated manual correction boundary for the complete four-date planned
-- deadline snapshot. This preserves catalog V2 as the source-calculated path
-- and shares its universal whole-row revision and audit trigger.

begin;

do $precondition$
declare
  v_owner oid;
  v_proc oid;
  v_required text;
begin
  if current_database() is null then
    raise exception using errcode='check_violation',
      message='MANUAL_DEADLINE_PRECONDITION_DATABASE';
  end if;

  foreach v_required in array array[
    'public.rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)',
    'public.rpc_preview_catalog_change_v2(uuid)',
    'public.vmp_plan_item_row_revision_v2()',
    'public.audit_plan_item_changes_v2()',
    'public.vmp_is_active_session(uuid)',
    'public.vmp_session_denial()',
    'public.vmp_business_role(uuid)',
    'public.rpc_set_item_assignment__five_role_impl_20260824(uuid,text,text,text,text,text,uuid)'
  ] loop
    if to_regprocedure(v_required) is null then
      raise exception using errcode='check_violation',
        message='MANUAL_DEADLINE_PRECONDITION_MISSING_FUNCTION '||v_required;
    end if;
  end loop;

  if to_regclass('public.vmp_plan_items') is null
     or to_regclass('public.vmp_item_assignments') is null
     or to_regclass('public.audit_logs') is null then
    raise exception using errcode='check_violation',
      message='MANUAL_DEADLINE_PRECONDITION_MISSING_TABLE';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('rpc_update_planned_deadlines',
                        'vmp_update_planned_deadlines_impl',
                        'vmp_preserve_manual_planned_deadline_state',
                        'vmp_invalidate_plan_item_revision_from_assignment')
  ) then
    raise exception using errcode='duplicate_function',
      message='MANUAL_DEADLINE_PRECONDITION_OVERLOAD_EXISTS';
  end if;

  select proowner into v_owner from pg_proc
  where oid='public.rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)'::regprocedure;

  if exists (
    select 1
    from (values
      ('public.rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)',
       '5190cbf570a45962e338a5b25be9e67070490d9b516691a870481a9a416345cf'),
      ('public.rpc_preview_catalog_change_v2(uuid)',
       '20fc1666be3fe495b8a63af689324a9b588b200e9c5a6e334f65045249837208'),
      ('public.vmp_plan_item_row_revision_v2()',
       'd00963d1f265c8d7457011cdafc331a9c7aafbb6b86e0bf7c82ce94bda4829c2'),
      ('public.audit_plan_item_changes_v2()',
       '4f69863a23c5353fda09332a04f7643c58b8d9e0ceb126b52790e4b61162ba4c'),
      ('public.vmp_is_active_session(uuid)',
       'e52a0cece430ad8b8319819b633fd4fc8aa92bc2d2fac083a33b22f609e1f417'),
      ('public.vmp_session_denial()',
       '8ff11d9d103ea62dd1c8786b1aa766bcfe6386bf6d4ec5b3729062c850609ad1'),
      ('public.vmp_business_role(uuid)',
       '45b2dfab1f9463b234a3754e8ee022450749f8418d6fc4a966b09fe8d52c3156'),
      ('public.rpc_set_item_assignment__five_role_impl_20260824(uuid,text,text,text,text,text,uuid)',
       '689e52011fba0eaf98642b2584e3ce634334f163c3e7ba97390a24f01153446d')
    ) reviewed(signature,definition_sha256)
    join pg_proc p on p.oid=reviewed.signature::regprocedure
    where encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')
          is distinct from reviewed.definition_sha256
  ) then
    raise exception using errcode='check_violation',
      message='MANUAL_DEADLINE_PRECONDITION_DEPENDENCY_DEFINITION';
  end if;

  foreach v_required in array array[
    'public.rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)',
    'public.rpc_preview_catalog_change_v2(uuid)'
  ] loop
    v_proc:=v_required::regprocedure;
    if (select proowner from pg_proc where oid=v_proc)<>v_owner
       or not (select prosecdef from pg_proc where oid=v_proc)
       or (select proconfig from pg_proc where oid=v_proc)
          is distinct from array['search_path=public, pg_temp']
       or not has_function_privilege('authenticated',v_proc,'EXECUTE')
       or not has_function_privilege('service_role',v_proc,'EXECUTE')
       or has_function_privilege('anon',v_proc,'EXECUTE')
       or has_function_privilege('public',v_proc,'EXECUTE')
       or (select count(*) from aclexplode(coalesce(
            (select proacl from pg_proc where oid=v_proc),acldefault('f',v_owner))) a
           where a.grantee<>v_owner and a.privilege_type='EXECUTE')<>2 then
      raise exception using errcode='check_violation',
        message='MANUAL_DEADLINE_PRECONDITION_V2_BOUNDARY '||v_required;
    end if;
  end loop;

  v_proc:='public.vmp_plan_item_row_revision_v2()'::regprocedure;
  if (select proowner from pg_proc where oid=v_proc)<>v_owner
     or (select prosecdef from pg_proc where oid=v_proc)
     or (select proconfig from pg_proc where oid=v_proc)
        is distinct from array['search_path=public, pg_temp']
     or exists (
       select 1 from aclexplode(coalesce(
         (select proacl from pg_proc where oid=v_proc),acldefault('f',v_owner))) a
       where a.grantee<>v_owner and a.privilege_type='EXECUTE'
     )
     or (select count(*) from pg_trigger t
         where t.tgrelid='public.vmp_plan_items'::regclass
           and t.tgfoid=v_proc and t.tgname='vmp_plan_item_row_revision_v2'
           and not t.tgisinternal and (t.tgtype & 2)=2)<>1 then
    raise exception using errcode='check_violation',
      message='MANUAL_DEADLINE_PRECONDITION_ROW_REVISION';
  end if;

  v_proc:='public.audit_plan_item_changes_v2()'::regprocedure;
  if (select proowner from pg_proc where oid=v_proc)<>v_owner
     or not (select prosecdef from pg_proc where oid=v_proc)
     or (select proconfig from pg_proc where oid=v_proc)
        is distinct from array['search_path=public']
     or (select count(*) from pg_trigger t
         where t.tgrelid='public.vmp_plan_items'::regclass
           and t.tgfoid=v_proc and t.tgname='audit_vmp_plan_items_v2'
           and not t.tgisinternal)<>1 then
    raise exception using errcode='check_violation',
      message='MANUAL_DEADLINE_PRECONDITION_AUDIT';
  end if;

  v_proc:='public.rpc_set_item_assignment__five_role_impl_20260824(uuid,text,text,text,text,text,uuid)'::regprocedure;
  if (select proowner from pg_proc where oid=v_proc)<>v_owner
     or not (select prosecdef from pg_proc where oid=v_proc)
     or (select provolatile from pg_proc where oid=v_proc)<>'v'
     or (select proconfig from pg_proc where oid=v_proc)
        is distinct from array['search_path=public, pg_temp']
     or exists (
       select 1 from aclexplode(coalesce(
         (select proacl from pg_proc where oid=v_proc),acldefault('f',v_owner))) a
       where a.grantee<>v_owner and a.privilege_type='EXECUTE'
     ) then
    raise exception using errcode='check_violation',
      message='MANUAL_DEADLINE_PRECONDITION_ASSIGNMENT_WRITER';
  end if;

  if exists (
    select required.column_name
    from (values
      ('vmp_plan_items','id','text'),
      ('vmp_plan_items','validation_code','text'),
      ('vmp_plan_items','version','integer'),
      ('vmp_plan_items','is_active','boolean'),
      ('vmp_plan_items','item_state','text'),
      ('vmp_plan_items','deadline_protocol','date'),
      ('vmp_plan_items','deadline_validation','date'),
      ('vmp_plan_items','deadline_report','date'),
      ('vmp_plan_items','deadline_vmp','date'),
      ('vmp_plan_items','computed_status','item_status'),
      ('vmp_plan_items','is_doc_complete','boolean'),
      ('vmp_plan_items','has_mismatch','text'),
      ('vmp_plan_items','updated_at','timestamp with time zone'),
      ('vmp_plan_items','updated_by','uuid'),
      ('vmp_item_assignments','id','uuid'),
      ('vmp_item_assignments','validation_code','text'),
      ('audit_logs','id','uuid'),
      ('audit_logs','user_id','uuid'),
      ('audit_logs','action','audit_action'),
      ('audit_logs','table_name','text'),
      ('audit_logs','record_id','text'),
      ('audit_logs','validation_code','text'),
      ('audit_logs','changed_fields','text[]'),
      ('audit_logs','change_reason','text'),
      ('audit_logs','old_data','jsonb'),
      ('audit_logs','new_data','jsonb'),
      ('audit_logs','source','text'),
      ('audit_logs','effective_business_role','text')
    ) required(table_name,column_name,data_type)
    left join pg_class rel on rel.relname=required.table_name
      and rel.relnamespace='public'::regnamespace
    left join pg_attribute a on a.attrelid=rel.oid
      and a.attname=required.column_name and not a.attisdropped
    where a.attname is null
       or format_type(a.atttypid,a.atttypmod) is distinct from required.data_type
  ) or (select attnotnull from pg_attribute
        where attrelid='public.vmp_plan_items'::regclass
          and attname='version' and not attisdropped) is not true then
    raise exception using errcode='check_violation',
      message='MANUAL_DEADLINE_PRECONDITION_COLUMNS';
  end if;

  if (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='public.audit_logs'::regclass
        and conname='audit_logs_effective_business_role_check')
     is distinct from
     'CHECK (((effective_business_role IS NULL) OR (effective_business_role = ANY (ARRAY[''admin''::text, ''qa_manager''::text, ''qa_staff''::text, ''workshop_manager''::text, ''workshop_staff''::text, ''viewer''::text]))))' then
    raise exception using errcode='check_violation',
      message='MANUAL_DEADLINE_PRECONDITION_AUDIT_ROLE_CONSTRAINT';
  end if;
end
$precondition$;

alter table public.audit_logs
  drop constraint audit_logs_effective_business_role_check;
alter table public.audit_logs
  add constraint audit_logs_effective_business_role_check
  check (effective_business_role is null or effective_business_role=any(array[
    'admin'::text,'qa_manager'::text,'qa_staff'::text,
    'workshop_manager'::text,'workshop_staff'::text,'viewer'::text,
    'service_role'::text
  ]));

create function public.vmp_preserve_manual_planned_deadline_state()
returns trigger
language plpgsql
volatile
security invoker
set search_path=public,pg_temp
as $function$
begin
  if current_setting('app.audit_source',true) in (
       'manual_planned_deadline_edit'
     ) or current_setting('app.assignment_revision_invalidation',true)='on' then
    new.computed_status:=old.computed_status;
    new.is_doc_complete:=old.is_doc_complete;
    new.has_mismatch:=old.has_mismatch;
  end if;
  return new;
end
$function$;

revoke all on function public.vmp_preserve_manual_planned_deadline_state()
  from public,anon,authenticated,service_role;
create trigger u_manual_planned_deadline_state
before update on public.vmp_plan_items
for each row execute function public.vmp_preserve_manual_planned_deadline_state();

create function public.vmp_invalidate_plan_item_revision_from_assignment()
returns trigger
language plpgsql
volatile
security invoker
set search_path=public,pg_temp
as $function$
declare
  v_code text;
  v_codes text[];
  v_previous_invalidation text:=current_setting(
    'app.assignment_revision_invalidation',true);
begin
  select array_agg(distinct code order by code) into v_codes
  from unnest(array[
    case when tg_op<>'INSERT' then old.validation_code end,
    case when tg_op<>'DELETE' then new.validation_code end
  ]) code
  where code is not null;

  perform set_config('app.assignment_revision_invalidation','on',true);
  foreach v_code in array coalesce(v_codes,'{}'::text[]) loop
    perform 1 from public.vmp_plan_items
    where validation_code=v_code
    for update;
    update public.vmp_plan_items set version=version
    where validation_code=v_code;
  end loop;
  perform set_config('app.assignment_revision_invalidation',
    coalesce(nullif(v_previous_invalidation,''),'off'),true);

  if tg_op='DELETE' then return old; end if;
  return new;
exception when others then
  perform set_config('app.assignment_revision_invalidation',
    coalesce(nullif(v_previous_invalidation,''),'off'),true);
  raise;
end
$function$;

revoke all on function public.vmp_invalidate_plan_item_revision_from_assignment()
  from public,anon,authenticated,service_role;
create trigger vmp_item_assignment_plan_revision
after insert or update or delete on public.vmp_item_assignments
for each row execute function public.vmp_invalidate_plan_item_revision_from_assignment();

create function public.vmp_update_planned_deadlines_impl(
  p_validation_code text,
  p_deadlines jsonb,
  p_reason text,
  p_expected_version integer,
  p_confirmed boolean
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,pg_temp
as $function$
declare
  v_key text;
  v_value jsonb;
  v_text text;
  v_parsed date;
  v_protocol date;
  v_validation date;
  v_report date;
  v_vmp date;
  v_before public.vmp_plan_items%rowtype;
  v_after public.vmp_plan_items%rowtype;
  v_before_json jsonb;
  v_after_json jsonb;
  v_old_deadlines jsonb;
  v_new_deadlines jsonb;
  v_changed_fields text[]:='{}'::text[];
  v_expected_audit_fields text[];
  v_actual_audit_fields text[];
  v_audit_ids uuid[];
  v_audit public.audit_logs%rowtype;
  v_audit_count integer;
  v_row_count integer;
  v_actor uuid:=auth.uid();
  v_effective_role text:=case when coalesce(auth.role(),'')='service_role'
    then 'service_role' else public.vmp_business_role(auth.uid()) end;
begin
  if p_deadlines is null or jsonb_typeof(p_deadlines)<>'object'
     or (select count(*) from jsonb_object_keys(p_deadlines))<>4
     or not (p_deadlines?'deadline_protocol'
         and p_deadlines?'deadline_validation'
         and p_deadlines?'deadline_report'
         and p_deadlines?'deadline_vmp') then
    return jsonb_build_object('ok',false,
      'error_code','INVALID_DEADLINE_PAYLOAD',
      'error','Payload deadline phải chứa đúng bốn ngày kế hoạch');
  end if;

  foreach v_key in array array[
    'deadline_protocol','deadline_validation','deadline_report','deadline_vmp'
  ] loop
    v_value:=p_deadlines->v_key;
    if v_value='null'::jsonb then
      continue;
    end if;
    if jsonb_typeof(v_value)<>'string' then
      return jsonb_build_object('ok',false,
        'error_code','INVALID_DEADLINE_PAYLOAD',
        'error','Deadline phải là ngày ISO YYYY-MM-DD hoặc null');
    end if;
    v_text:=p_deadlines->>v_key;
    if v_text!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      return jsonb_build_object('ok',false,
        'error_code','INVALID_DEADLINE_PAYLOAD',
        'error','Deadline phải là ngày ISO YYYY-MM-DD hoặc null');
    end if;
    begin
      v_parsed:=v_text::date;
      if to_char(v_parsed,'YYYY-MM-DD') is distinct from v_text then
        return jsonb_build_object('ok',false,
          'error_code','INVALID_DEADLINE_PAYLOAD',
          'error','Deadline phải là ngày ISO YYYY-MM-DD hoặc null');
      end if;
    exception when others then
      return jsonb_build_object('ok',false,
        'error_code','INVALID_DEADLINE_PAYLOAD',
        'error','Deadline phải là ngày ISO YYYY-MM-DD hoặc null');
    end;
  end loop;

  v_protocol:=(p_deadlines->>'deadline_protocol')::date;
  v_validation:=(p_deadlines->>'deadline_validation')::date;
  v_report:=(p_deadlines->>'deadline_report')::date;
  v_vmp:=(p_deadlines->>'deadline_vmp')::date;

  if p_expected_version is null then
    return jsonb_build_object('ok',false,
      'error_code','EXPECTED_REVISION_REQUIRED',
      'error','Thiếu phiên bản hạng mục đã tải');
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok',false,
      'error_code','REASON_REQUIRED',
      'error','Phải nhập lý do điều chỉnh deadline kế hoạch');
  end if;
  if p_confirmed is not true then
    return jsonb_build_object('ok',false,
      'error_code','CONFIRMATION_REQUIRED',
      'error','Phải xác nhận chỉ đổi bốn deadline kế hoạch');
  end if;

  select * into v_before from public.vmp_plan_items
  where validation_code=p_validation_code for update;
  if not found then
    return jsonb_build_object('ok',false,
      'error_code','ITEM_NOT_FOUND','error','Không tìm thấy hạng mục');
  end if;
  if v_before.is_active is distinct from true
     or v_before.item_state is distinct from 'active' then
    return jsonb_build_object('ok',false,
      'error_code','ITEM_STATE_INACTIVE',
      'error','Hạng mục không ở trạng thái hoạt động');
  end if;
  if v_before.version is distinct from p_expected_version then
    return jsonb_build_object(
      'ok',false,'error_code','VERSION_CONFLICT',
      'error','Hạng mục đã đổi sau khi tải dữ liệu',
      'validation_code',p_validation_code,
      'expected_version',p_expected_version,
      'current_version',v_before.version,
      'requires_reload',true);
  end if;

  if (v_before.deadline_protocol is not null and v_protocol is null)
     or (v_before.deadline_validation is not null and v_validation is null)
     or (v_before.deadline_report is not null and v_report is null)
     or (v_before.deadline_vmp is not null and v_vmp is null) then
    return jsonb_build_object('ok',false,
      'error_code','DEADLINE_ERASURE_FORBIDDEN',
      'error','Không được xoá deadline kế hoạch đã có');
  end if;

  if (v_protocol is not null and v_validation is not null and v_protocol>v_validation)
     or (v_protocol is not null and v_report is not null and v_protocol>v_report)
     or (v_protocol is not null and v_vmp is not null and v_protocol>v_vmp)
     or (v_validation is not null and v_report is not null and v_validation>v_report)
     or (v_validation is not null and v_vmp is not null and v_validation>v_vmp)
     or (v_report is not null and v_vmp is not null and v_report>v_vmp) then
    return jsonb_build_object('ok',false,
      'error_code','DEADLINE_ORDER_INVALID',
      'error','Bốn deadline kế hoạch phải theo đúng thứ tự');
  end if;

  if v_before.deadline_protocol is not distinct from v_protocol
     and v_before.deadline_validation is not distinct from v_validation
     and v_before.deadline_report is not distinct from v_report
     and v_before.deadline_vmp is not distinct from v_vmp then
    return jsonb_build_object('ok',false,
      'error_code','NO_ACTIONABLE_CHANGE','error','Không có deadline nào thay đổi');
  end if;

  if v_before.deadline_protocol is distinct from v_protocol then
    v_changed_fields:=array_append(v_changed_fields,'deadline_protocol');
  end if;
  if v_before.deadline_validation is distinct from v_validation then
    v_changed_fields:=array_append(v_changed_fields,'deadline_validation');
  end if;
  if v_before.deadline_report is distinct from v_report then
    v_changed_fields:=array_append(v_changed_fields,'deadline_report');
  end if;
  if v_before.deadline_vmp is distinct from v_vmp then
    v_changed_fields:=array_append(v_changed_fields,'deadline_vmp');
  end if;

  v_before_json:=to_jsonb(v_before);
  v_old_deadlines:=jsonb_build_object(
    'deadline_protocol',v_before.deadline_protocol,
    'deadline_validation',v_before.deadline_validation,
    'deadline_report',v_before.deadline_report,
    'deadline_vmp',v_before.deadline_vmp);
  v_new_deadlines:=jsonb_build_object(
    'deadline_protocol',v_protocol,
    'deadline_validation',v_validation,
    'deadline_report',v_report,
    'deadline_vmp',v_vmp);
  select coalesce(array_agg(id),'{}'::uuid[]) into v_audit_ids
  from public.audit_logs where validation_code=p_validation_code;

  perform set_config('app.audit_source','manual_planned_deadline_edit',true);
  perform set_config('app.audit_reason',btrim(p_reason),true);

  begin
    update public.vmp_plan_items set
      deadline_protocol=v_protocol,
      deadline_validation=v_validation,
      deadline_report=v_report,
      deadline_vmp=v_vmp,
      updated_by=v_actor,
      updated_at=clock_timestamp()
    where validation_code=p_validation_code and version=p_expected_version;
    get diagnostics v_row_count=row_count;
    if v_row_count<>1 then
      raise exception using errcode='P2001',message='MANUAL_UPDATE_ROWCOUNT';
    end if;

    select * into v_after from public.vmp_plan_items
    where validation_code=p_validation_code;
    v_after_json:=to_jsonb(v_after);
    if v_after.deadline_protocol is distinct from v_protocol
       or v_after.deadline_validation is distinct from v_validation
       or v_after.deadline_report is distinct from v_report
       or v_after.deadline_vmp is distinct from v_vmp
       or v_after.version is distinct from p_expected_version+1
       or v_after.updated_by is distinct from v_actor
       or v_after.updated_at is null
       or (v_after_json-array['deadline_protocol','deadline_validation',
            'deadline_report','deadline_vmp','version','updated_at','updated_by'])
          is distinct from
          (v_before_json-array['deadline_protocol','deadline_validation',
            'deadline_report','deadline_vmp','version','updated_at','updated_by']) then
      raise exception using errcode='P2001',message='MANUAL_UPDATE_POSTSTATE';
    end if;

    select count(*) into v_audit_count from public.audit_logs
    where validation_code=p_validation_code;
    if v_audit_count<>cardinality(v_audit_ids)+1 then
      raise exception using errcode='P2001',message='MANUAL_AUDIT_COUNT';
    end if;
    select * into strict v_audit from public.audit_logs
    where validation_code=p_validation_code and not (id=any(v_audit_ids));

    if v_audit.user_id is distinct from v_actor
       or v_audit.effective_business_role is distinct from v_effective_role then
      update public.audit_logs set
        user_id=v_actor,
        effective_business_role=v_effective_role
      where id=v_audit.id;
      select * into strict v_audit from public.audit_logs where id=v_audit.id;
    end if;

    select coalesce(array_agg(field order by field),'{}'::text[])
    into v_expected_audit_fields from unnest(v_changed_fields) field;
    select coalesce(array_agg(field order by field),'{}'::text[])
    into v_actual_audit_fields from unnest(v_audit.changed_fields) field;
    if v_audit.user_id is distinct from v_actor
       or v_audit.action::text is distinct from 'DEADLINE_CHANGE'
       or v_audit.table_name is distinct from 'vmp_plan_items'
       or v_audit.record_id is distinct from v_before.id
       or v_audit.validation_code is distinct from p_validation_code
       or v_audit.change_reason is distinct from btrim(p_reason)
       or v_audit.source is distinct from 'manual_planned_deadline_edit'
       or v_audit.effective_business_role is distinct from v_effective_role
       or v_audit.old_data is distinct from v_before_json
       or v_audit.new_data is distinct from v_after_json
       or v_actual_audit_fields is distinct from v_expected_audit_fields then
      raise exception using errcode='P2001',message='MANUAL_AUDIT_POSTSTATE';
    end if;

    return jsonb_build_object(
      'ok',true,
      'validation_code',p_validation_code,
      'old_deadlines',v_old_deadlines,
      'new_deadlines',v_new_deadlines,
      'changed_fields',to_jsonb(v_changed_fields),
      'previous_version',p_expected_version,
      'current_version',v_after.version,
      'actor_id',v_actor,
      'effective_role',v_effective_role,
      'reason',btrim(p_reason),
      'protected_fields_preserved',true);
  exception when sqlstate 'P2001' then
    return jsonb_build_object('ok',false,
      'error_code','WRITE_MISMATCH',
      'error','Không thể ghi nguyên tử; toàn bộ thay đổi đã được hoàn tác');
  end;
end
$function$;

revoke all on function public.vmp_update_planned_deadlines_impl(
  text,jsonb,text,integer,boolean) from public,anon,authenticated,service_role;

create function public.rpc_update_planned_deadlines(
  p_validation_code text,
  p_deadlines jsonb,
  p_reason text,
  p_expected_version integer,
  p_confirmed boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_temp
as $function$
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and public.vmp_is_active_session(auth.uid()) is not true then
    return public.vmp_session_denial();
  end if;
  if coalesce(auth.role(),'')<>'service_role'
     and coalesce(public.vmp_business_role(auth.uid()),'')
         not in ('admin','qa_manager') then
    return jsonb_build_object('ok',false,'error_code','FORBIDDEN',
      'error','Chỉ Admin và Quản lý QA được chỉnh deadline kế hoạch');
  end if;
  return public.vmp_update_planned_deadlines_impl(
    p_validation_code,p_deadlines,p_reason,p_expected_version,p_confirmed);
end
$function$;

do $owners$
declare v_owner name;
begin
  select r.rolname into v_owner from pg_proc p join pg_roles r on r.oid=p.proowner
  where p.oid='public.rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)'::regprocedure;
  execute format(
    'alter function public.vmp_preserve_manual_planned_deadline_state() owner to %I',
    v_owner);
  execute format(
    'alter function public.vmp_invalidate_plan_item_revision_from_assignment() owner to %I',
    v_owner);
  execute format(
    'alter function public.vmp_update_planned_deadlines_impl(text,jsonb,text,integer,boolean) owner to %I',
    v_owner);
  execute format(
    'alter function public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean) owner to %I',
    v_owner);
end
$owners$;

revoke all on function public.vmp_preserve_manual_planned_deadline_state()
  from public,anon,authenticated,service_role;
revoke all on function public.vmp_invalidate_plan_item_revision_from_assignment()
  from public,anon,authenticated,service_role;
revoke all on function public.vmp_update_planned_deadlines_impl(
  text,jsonb,text,integer,boolean) from public,anon,authenticated,service_role;
revoke all on function public.rpc_update_planned_deadlines(
  text,jsonb,text,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_update_planned_deadlines(
  text,jsonb,text,integer,boolean) to authenticated,service_role;

comment on function public.rpc_update_planned_deadlines(
  text,jsonb,text,integer,boolean) is
  'Manual complete-snapshot edit of exactly four planned deadlines; admin/qa_manager browser callers and reviewed service_role automation only.';
comment on function public.vmp_update_planned_deadlines_impl(
  text,jsonb,text,integer,boolean) is
  'Owner-only SECURITY INVOKER implementation for rpc_update_planned_deadlines.';
comment on function public.vmp_preserve_manual_planned_deadline_state() is
  'Owner-only trigger helper preserving computed fields for manual planned-deadline edits.';
comment on function public.vmp_invalidate_plan_item_revision_from_assignment() is
  'Owner-only trigger helper invalidating the plan-item whole-row revision after assignment changes.';

do $postcondition$
declare
  v_owner oid;
begin
  select proowner into v_owner from pg_proc
  where oid='public.rpc_apply_catalog_change_v2(uuid,text,integer,jsonb,boolean)'::regprocedure;
  if (select proowner from pg_proc where oid=
        'public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)'::regprocedure)<>v_owner
     or not (select prosecdef from pg_proc where oid=
        'public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)'::regprocedure)
     or (select proconfig from pg_proc where oid=
        'public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)'::regprocedure)
        is distinct from array['search_path=public, pg_temp']
     or not has_function_privilege('authenticated',
        'public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)','EXECUTE')
     or not has_function_privilege('service_role',
        'public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)','EXECUTE')
     or has_function_privilege('anon',
        'public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)','EXECUTE')
     or has_function_privilege('public',
        'public.rpc_update_planned_deadlines(text,jsonb,text,integer,boolean)','EXECUTE')
     or (select prosecdef from pg_proc where oid=
        'public.vmp_update_planned_deadlines_impl(text,jsonb,text,integer,boolean)'::regprocedure)
     or (select proconfig from pg_proc where oid=
        'public.vmp_update_planned_deadlines_impl(text,jsonb,text,integer,boolean)'::regprocedure)
        is distinct from array['search_path=public, pg_temp']
     or exists (
       select 1 from pg_proc p
       cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       where p.oid='public.vmp_update_planned_deadlines_impl(text,jsonb,text,integer,boolean)'::regprocedure
         and a.grantee<>p.proowner and a.privilege_type='EXECUTE'
     )
     or (select prosecdef from pg_proc where oid=
        'public.vmp_preserve_manual_planned_deadline_state()'::regprocedure)
     or (select proconfig from pg_proc where oid=
        'public.vmp_preserve_manual_planned_deadline_state()'::regprocedure)
        is distinct from array['search_path=public, pg_temp']
     or exists (
       select 1 from pg_proc p
       cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       where p.oid='public.vmp_preserve_manual_planned_deadline_state()'::regprocedure
         and a.grantee<>p.proowner and a.privilege_type='EXECUTE'
     )
     or (select count(*) from pg_trigger t
         where t.tgrelid='public.vmp_plan_items'::regclass
           and t.tgfoid='public.vmp_preserve_manual_planned_deadline_state()'::regprocedure
           and t.tgname='u_manual_planned_deadline_state'
           and not t.tgisinternal and (t.tgtype & 2)=2)<>1
     or (select prosecdef from pg_proc where oid=
        'public.vmp_invalidate_plan_item_revision_from_assignment()'::regprocedure)
     or (select proowner from pg_proc where oid=
        'public.vmp_invalidate_plan_item_revision_from_assignment()'::regprocedure)<>v_owner
     or (select proconfig from pg_proc where oid=
        'public.vmp_invalidate_plan_item_revision_from_assignment()'::regprocedure)
        is distinct from array['search_path=public, pg_temp']
     or exists (
       select 1 from pg_proc p
       cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       where p.oid='public.vmp_invalidate_plan_item_revision_from_assignment()'::regprocedure
         and a.grantee<>p.proowner and a.privilege_type='EXECUTE'
     )
     or (select count(*) from pg_trigger t
         where t.tgrelid='public.vmp_item_assignments'::regclass
           and t.tgfoid='public.vmp_invalidate_plan_item_revision_from_assignment()'::regprocedure
           and t.tgname='vmp_item_assignment_plan_revision'
           and not t.tgisinternal
           and (t.tgtype & 1)=1 and (t.tgtype & 2)=0
           and (t.tgtype & 28)=28)<>1
     or (select pg_get_constraintdef(oid) from pg_constraint
         where conrelid='public.audit_logs'::regclass
           and conname='audit_logs_effective_business_role_check')
        is distinct from
        'CHECK (((effective_business_role IS NULL) OR (effective_business_role = ANY (ARRAY[''admin''::text, ''qa_manager''::text, ''qa_staff''::text, ''workshop_manager''::text, ''workshop_staff''::text, ''viewer''::text, ''service_role''::text]))))' then
    raise exception using errcode='check_violation',
      message='MANUAL_DEADLINE_POSTCONDITION_ACL';
  end if;
end
$postcondition$;

commit;

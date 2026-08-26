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
    'public.vmp_parse_depts(text)',
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

  -- Pin the exact reviewed dependency bodies before trusting any wrapper,
  -- hidden implementation, authorization helper, deadline calculation or
  -- audit path. Metadata-only checks permit a body-drifted definer to pass.
  if exists (
    select 1
    from (values
      ('public.rpc_save_catalog_object(text,text,jsonb,text,integer)',
       'e7c6ac003f467a357d778b8b773bd58754c8ffb4c54483d1a8734426119daa95'),
      ('public.rpc_preview_catalog_change(uuid)',
       '2b23b696b0a8e56c88097b7acabe1bd3a37ef70c1f92ca1f0a693e054db0fb60'),
      ('public.rpc_apply_catalog_change(uuid,text,integer)',
       '580383f96aa3fb308ce74149257f9a353ef7181b15d81f2135d6e400f0c7353d'),
      ('public.rpc_save_catalog_object__five_role_impl_20260824(text,text,jsonb,text,integer)',
       '601c067cf9789772b1eb272c10754b980f50fa13647f7967eba2e893634cffbc'),
      ('public.rpc_preview_catalog_change__five_role_impl_20260824(uuid)',
       '76fc67a4a4eb71734ddb3eff69af25355596954a220e1d97dad2e9ee72a2e1eb'),
      ('public.rpc_apply_catalog_change__five_role_impl_20260824(uuid,text,integer)',
       '22bb11d3d91c02a2f98b95cf5d0ffdff504158a3f6e5a4703d11d9a6cda518b2'),
      ('public.vmp_tinh_moc_thoi_gian(integer,integer,integer,integer,text,numeric,text)',
       '8683f1d6f448b5326cd0f1a89b1f1954f1265243b9dca84f1a7268c27db5e8f1'),
      ('public.vmp_parse_depts(text)',
       'efdb744892bdeab64a932e2c9d6bdf2121250185b0f5ad0a08cec311d953c2bd'),
      ('public.audit_plan_item_changes_v2()',
       '07ac27f98feecfb5c9bd6941e17943fb910ea715e72ffdcb5c96132acdf26243'),
      ('public.vmp_is_active_session(uuid)',
       'e52a0cece430ad8b8319819b633fd4fc8aa92bc2d2fac083a33b22f609e1f417'),
      ('public.vmp_session_denial()',
       '8ff11d9d103ea62dd1c8786b1aa766bcfe6386bf6d4ec5b3729062c850609ad1'),
      ('public.vmp_business_role(uuid)',
       '45b2dfab1f9463b234a3754e8ee022450749f8418d6fc4a966b09fe8d52c3156')
    ) reviewed(signature,definition_sha256)
    join pg_proc p on p.oid=reviewed.signature::regprocedure
    where encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')
          is distinct from reviewed.definition_sha256
  ) then
    raise exception using errcode='check_violation',
      message='CATALOG_V2_PRECONDITION_DEPENDENCY_DEFINITION';
  end if;

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
    'public.vmp_is_active_session(uuid)',
    'public.vmp_session_denial()',
    'public.vmp_business_role(uuid)'
  ] loop
    v_proc:=v_required::regprocedure;
    if (select proowner from pg_proc where oid=v_proc)<>v_owner
       or not (select prosecdef from pg_proc where oid=v_proc)
       or (select proconfig from pg_proc where oid=v_proc)
          is distinct from array['search_path=public, pg_temp']
       or not has_function_privilege('service_role',v_proc,'EXECUTE')
       or has_function_privilege('authenticated',v_proc,'EXECUTE')
       or has_function_privilege('anon',v_proc,'EXECUTE')
       or has_function_privilege('public',v_proc,'EXECUTE')
       or (select count(*) from aclexplode(coalesce((select proacl from pg_proc where oid=v_proc),
            acldefault('f',v_owner))) a
           where a.grantee<>v_owner and a.privilege_type='EXECUTE')<>1 then
      raise exception using errcode='check_violation',
        message='CATALOG_V2_PRECONDITION_AUTH_HELPER '||v_required;
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

  v_proc := 'public.vmp_parse_depts(text)'::regprocedure;
  if (select proowner from pg_proc where oid=v_proc) <> v_owner
     or (select prosecdef from pg_proc where oid=v_proc)
     or (select provolatile from pg_proc where oid=v_proc) <> 'i'
     or (select proconfig from pg_proc where oid=v_proc)
        is distinct from array['search_path=public, pg_temp']
     or has_function_privilege('authenticated',v_proc,'EXECUTE')
     or not has_function_privilege('service_role',v_proc,'EXECUTE')
     or has_function_privilege('anon',v_proc,'EXECUTE')
     or has_function_privilege('public',v_proc,'EXECUTE')
     or (select count(*) from aclexplode(coalesce((select proacl from pg_proc where oid=v_proc),
          acldefault('f',v_owner))) a
         where a.grantee<>v_owner and a.privilege_type='EXECUTE')<>1
     or not exists (
       select 1 from aclexplode(coalesce((select proacl from pg_proc where oid=v_proc),
         acldefault('f',v_owner))) a
       where a.grantor=v_owner and a.grantee='service_role'::regrole
         and a.privilege_type='EXECUTE' and not a.is_grantable
     ) then
    raise exception using errcode='check_violation',message='CATALOG_V2_PRECONDITION_DEPARTMENT_HELPER';
  end if;

  v_proc := 'public.audit_plan_item_changes_v2()'::regprocedure;
  if (select proowner from pg_proc where oid=v_proc) <> v_owner
     or not (select prosecdef from pg_proc where oid=v_proc)
     or (select proconfig from pg_proc where oid=v_proc)
        is distinct from array['search_path=public']
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
      ('vmp_plan_items','id','text'),
      ('vmp_plan_items','validation_code','text'),('vmp_plan_items','object_code','text'),
      ('vmp_plan_items','validation_type','text'),('vmp_plan_items','report_class','text'),
      ('vmp_plan_items','effort_days','numeric(4,1)'),('vmp_plan_items','year','integer'),
      ('vmp_plan_items','version','integer'),('vmp_plan_items','is_active','boolean'),
      ('vmp_plan_items','item_state','text'),('vmp_plan_items','deadline_protocol','date'),
      ('vmp_plan_items','deadline_validation','date'),('vmp_plan_items','deadline_report','date'),
      ('vmp_plan_items','deadline_vmp','date'),('vmp_plan_items','actual_protocol_date','date'),
      ('vmp_plan_items','actual_validation_date','date'),('vmp_plan_items','actual_report_date','date'),
      ('vmp_plan_items','actual_vmp_date','date'),('vmp_plan_items','status_protocol','phase_status'),
      ('vmp_plan_items','status_validation','phase_status'),('vmp_plan_items','status_report','phase_status'),
      ('vmp_plan_items','status_vmp','phase_status'),('vmp_plan_items','computed_status','item_status'),
      ('vmp_plan_items','owner_id','uuid'),('vmp_plan_items','owner_name','text'),
      ('vmp_plan_items','secondary_owner','text'),
      ('vmp_plan_items','criticality','criticality'),
      ('vmp_plan_items','created_by','uuid'),('vmp_plan_items','updated_by','uuid'),
      ('vmp_plan_items','created_at','timestamp with time zone'),
      ('vmp_plan_items','updated_at','timestamp with time zone'),
      ('vmp_plan_items','missing_from_sheet','boolean'),('vmp_plan_items','scheduled_date','date'),
      ('vmp_plan_items','criticality_score','integer'),('vmp_plan_items','departments','text[]'),
      ('vmp_plan_items','is_doc_complete','boolean'),('vmp_plan_items','has_mismatch','text'),
      ('vmp_plan_items','requires_qa_approval','boolean'),('vmp_plan_items','qa_approved_by','uuid'),
      ('vmp_plan_items','qa_approved_at','timestamp with time zone'),
      ('vmp_plan_items','sheet_row_id','text'),('vmp_plan_items','last_synced','timestamp with time zone'),
      ('vmp_plan_items','deleted_from_sheet','boolean'),('vmp_plan_items','deleted_at','timestamp with time zone'),
      ('vmp_plan_items','delete_reason','text'),('vmp_plan_items','missing_since','timestamp with time zone'),
      ('vmp_plan_items','source_sync_run_id','uuid'),('vmp_plan_items','source_sheet_row','integer'),
      ('vmp_plan_items','source_sheet_data','jsonb'),('vmp_plan_items','execution_departments','text[]'),
      ('vmp_plan_items','status_protocol_text','text'),('vmp_plan_items','status_validation_text','text'),
      ('vmp_plan_items','status_report_text','text'),('vmp_plan_items','status_vmp_text','text'),
      ('vmp_plan_items','department_text','text'),('vmp_plan_items','work_group','text'),
      ('vmp_plan_items','scheduled_at','timestamp with time zone'),
      ('vmp_plan_items','owner_person_id','uuid'),('vmp_plan_items','support_person_id','uuid'),
      ('vmp_source_objects','id','uuid'),('vmp_source_objects','object_kind','text'),
      ('vmp_source_objects','object_code','text'),('vmp_source_objects','object_name','text'),
      ('vmp_source_objects','department','text'),('vmp_source_objects','area_code','text'),
      ('vmp_source_objects','line','text'),('vmp_source_objects','status','text'),
      ('vmp_source_objects','show_flag','text'),
      ('vmp_source_objects','validate_flag','text'),('vmp_source_objects','frequency_months','integer'),
      ('vmp_source_objects','validate_reason','text'),
      ('vmp_source_objects','report_class','text'),('vmp_source_objects','workdays','integer'),
      ('vmp_source_objects','critical_point','text'),('vmp_source_objects','first_month','integer'),
      ('vmp_source_objects','year_ref','integer'),('vmp_source_objects','source_tab','text'),
      ('vmp_source_objects','source_row','integer'),('vmp_source_objects','extra','jsonb'),
      ('vmp_source_objects','created_at','timestamp with time zone'),
      ('vmp_source_objects','updated_at','timestamp with time zone'),
      ('vmp_source_objects','is_active','boolean'),('vmp_source_objects','edited_on_web','boolean'),
      ('vmp_source_objects','updated_by','uuid'),('vmp_source_objects','note','text'),
      ('vmp_source_objects','complexity_score','integer'),
      ('vmp_source_objects','quality_impact_score','integer'),
      ('vmp_source_objects','criticality_score','integer'),
      ('vmp_source_objects','criticality_source','text'),('vmp_source_objects','owner_name','text'),
      ('vmp_source_objects','support_name','text'),('vmp_source_objects','work_group','text'),
      ('vmp_source_objects','owner_person_id','uuid'),('vmp_source_objects','support_person_id','uuid'),
      ('vmp_source_objects','version','integer'),
      ('vmp_source_objects','timeline_revision','integer'),
      ('vmp_source_objects','timeline_applied_revision','integer'),
      ('vmp_catalog_changes','id','uuid'),('vmp_catalog_changes','object_kind','text'),
      ('vmp_catalog_changes','object_code','text'),('vmp_catalog_changes','source_version','integer'),
      ('vmp_catalog_changes','timeline_revision','integer'),
      ('vmp_catalog_changes','old_data','jsonb'),('vmp_catalog_changes','new_data','jsonb'),
      ('vmp_catalog_changes','status','text'),('vmp_catalog_changes','impact','jsonb'),
      ('vmp_catalog_changes','apply_result','jsonb'),('vmp_catalog_changes','applied_by','uuid'),
      ('vmp_catalog_changes','applied_at','timestamp with time zone'),
      ('vmp_catalog_changes','apply_reason','text'),('vmp_catalog_changes','last_error','text'),
      ('vmp_catalog_changes','created_by','uuid'),('vmp_catalog_changes','created_at','timestamp with time zone'),
      ('audit_logs','id','uuid'),('audit_logs','user_id','uuid'),('audit_logs','user_email','text'),
      ('audit_logs','user_name','text'),('audit_logs','user_role','user_role'),
      ('audit_logs','action','audit_action'),
      ('audit_logs','table_name','text'),('audit_logs','record_id','text'),
      ('audit_logs','validation_code','text'),('audit_logs','changed_fields','text[]'),
      ('audit_logs','change_reason','text'),('audit_logs','old_data','jsonb'),
      ('audit_logs','new_data','jsonb'),('audit_logs','ip_address','inet'),
      ('audit_logs','user_agent','text'),('audit_logs','source','text'),
      ('audit_logs','created_at','timestamp with time zone'),('audit_logs','effective_business_role','text')
    ) required(table_name,column_name,data_type)
    left join pg_class rel on rel.relname=required.table_name
      and rel.relnamespace='public'::regnamespace
    left join pg_attribute a on a.attrelid=rel.oid and a.attname=required.column_name
      and not a.attisdropped
    where a.attname is null
       or format_type(a.atttypid,a.atttypmod) is distinct from required.data_type
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
  v_deadline_protocol date;
  v_deadline_validation date;
  v_deadline_report date;
  v_deadline_vmp date;
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
    v_deadline_protocol:=null; v_deadline_validation:=null;
    v_deadline_report:=null; v_deadline_vmp:=null; v_missing:='[]'::jsonb;
    if v_item.id is not null and v_occurrence is not null then
      select moc.deadline_protocol,moc.deadline_validation,
             moc.deadline_report,moc.deadline_vmp,coalesce(to_jsonb(moc.thieu),'[]'::jsonb)
      into v_deadline_protocol,v_deadline_validation,
           v_deadline_report,v_deadline_vmp,v_missing
      from public.vmp_tinh_moc_thoi_gian(
        v_item.year,v_source.first_month,coalesce(nullif(v_source.frequency_months,0),12),
        v_occurrence,v_source.report_class,v_source.workdays,v_item.validation_type) moc;
    end if;

    v_blocker:=null; v_reason:=null;
    if v_item.id is null then v_blocker:='ITEM_NOT_FOUND'; v_reason:='Hạng mục không còn tồn tại';
    elsif v_item.object_code is distinct from v_source.object_code then v_blocker:='WRONG_MEMBERSHIP'; v_reason:='Hạng mục không còn thuộc đối tượng';
    elsif coalesce(lower(v_source.validate_flag),'n')<>'y' or not coalesce(v_source.is_active,true) then v_blocker:='STOP_FLOW'; v_reason:='Đối tượng đang thuộc luồng Dừng';
    elsif not coalesce(v_item.is_active,true) then v_blocker:='ITEM_INACTIVE'; v_reason:='Hạng mục không còn hiệu lực';
    elsif v_item.item_state is distinct from 'active' then v_blocker:='ITEM_STATE_INACTIVE'; v_reason:='Hạng mục đã hủy hoặc không áp dụng';
    elsif v_match is null or v_occurrence is null or v_match[1]::integer<>v_item.year
       or v_match[1]::integer<>extract(year from now())::integer
       or v_match[3] is distinct from v_item.validation_type
       or v_item.validation_code is distinct from
          (v_item.object_code||'/'||v_match[1]||'.'||v_match[2]||'-'||v_match[3])
      then v_blocker:='INVALID_ITEM_IDENTITY'; v_reason:='Mã hạng mục không khớp định danh năm/lần/loại';
    elsif jsonb_array_length(v_missing)>0
       or v_deadline_protocol is null or v_deadline_validation is null
       or v_deadline_report is null or v_deadline_vmp is null
      then v_blocker:='MISSING_SOURCE_DATA'; v_reason:='Không tính đủ bốn deadline';
    elsif not (v_item.deadline_protocol is distinct from v_deadline_protocol
       or v_item.deadline_validation is distinct from v_deadline_validation
       or v_item.deadline_report is distinct from v_deadline_report
       or v_item.deadline_vmp is distinct from v_deadline_vmp)
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
      'deadline_protocol_cu',v_item.deadline_protocol,'deadline_protocol_moi',v_deadline_protocol,
      'deadline_validation_cu',v_item.deadline_validation,'deadline_validation_moi',v_deadline_validation,
      'deadline_report_cu',v_item.deadline_report,'deadline_report_moi',v_deadline_report,
      'deadline_vmp_cu',v_item.deadline_vmp,'deadline_vmp_moi',v_deadline_vmp);
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
  v_selected_codes text[];
  v_locked_codes text[];
  v_inventory_before text[];
  v_inventory_after text[];
  v_expected_inventory text[];
  v_year integer:=extract(year from now())::integer;
  v_expected integer;
  v_index integer:=0;
  v_count integer;
  v_v1 jsonb;
  v_snapshots jsonb:='{}'::jsonb;
  v_locked_snapshots jsonb:='{}'::jsonb;
  v_snapshot jsonb;
  v_source_snapshot jsonb;
  v_current jsonb;
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

  select coalesce(array_agg(value->>'validation_code' order by value->>'validation_code'),'{}'::text[])
  into v_selected_codes from jsonb_array_elements(p_deadline_overrides);

  -- Lock a deterministic stable superset before the authoritative preview:
  -- every row currently owned by the source object, every current-year row
  -- whose terminal identity names it, and every explicitly selected code.
  -- A later preview row outside this locked set is rejected before mutation.
  perform 1 from public.vmp_plan_items pi
  where pi.object_code=v_source.object_code
     or (pi.year=v_year and left(pi.validation_code,length(v_source.object_code)+1)=v_source.object_code||'/')
     or pi.validation_code=any(v_selected_codes)
  order by pi.validation_code for update;

  select coalesce(array_agg(pi.validation_code order by pi.validation_code),'{}'::text[]),
         coalesce(jsonb_object_agg(pi.validation_code,to_jsonb(pi) order by pi.validation_code),'{}'::jsonb)
  into v_locked_codes,v_locked_snapshots
  from public.vmp_plan_items pi
  where pi.object_code=v_source.object_code
     or (pi.year=v_year and left(pi.validation_code,length(v_source.object_code)+1)=v_source.object_code||'/')
     or pi.validation_code=any(v_selected_codes);

  select coalesce(array_agg(pi.validation_code order by pi.validation_code),'{}'::text[])
  into v_inventory_before
  from public.vmp_plan_items pi
  where pi.object_code=v_source.object_code
     or (pi.year=v_year and left(pi.validation_code,length(v_source.object_code)+1)=v_source.object_code||'/');
  v_source_snapshot:=to_jsonb(v_source);

  v_preview:=public.rpc_preview_catalog_change_v2(p_change_id);
  if coalesce((v_preview->>'ok')::boolean,false) is not true then return v_preview; end if;
  select coalesce(array_agg(distinct code order by code),'{}'::text[]) into v_codes from (
    select value->>'validation_code' code from jsonb_array_elements(coalesce(v_preview->'tao','[]'))
    union all select value->>'validation_code' from jsonb_array_elements(coalesce(v_preview->'sua','[]'))
    union all select value->>'validation_code' from jsonb_array_elements(coalesce(v_preview->'dung','[]'))
    union all select value->>'validation_code' from jsonb_array_elements(coalesce(v_preview->'giu_nguyen','[]'))
  ) impact where code is not null;
  if exists (
    select 1 from unnest(v_codes) impact(code)
    join public.vmp_plan_items pi on pi.validation_code=impact.code
    where not (impact.code=any(v_locked_codes))
  ) then
    return jsonb_build_object('ok',false,'error_code','WRITE_MISMATCH',
      'error','Không thể ghi nguyên tử; toàn bộ thay đổi đã được hoàn tác');
  end if;

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
      if v_item.id is distinct from v_entry->>'validation_code'
         or v_item.validation_code is distinct from v_entry->>'validation_code'
         or v_item.object_code is distinct from v_source.object_code
         or v_item.validation_type is distinct from v_entry->>'validation_type'
         or v_item.year is distinct from v_year
         or v_item.report_class is distinct from coalesce(v_source.report_class,'Không phụ thuộc')
         or v_item.effort_days is distinct from v_source.workdays::numeric
         or v_item.deadline_protocol is distinct from v_moc.deadline_protocol
         or v_item.deadline_validation is distinct from v_moc.deadline_validation
         or v_item.deadline_report is distinct from v_moc.deadline_report
         or v_item.deadline_vmp is distinct from v_moc.deadline_vmp
         or v_item.departments is distinct from public.vmp_parse_depts(coalesce(v_source.department,''))
         or v_item.created_by is distinct from auth.uid()
         or v_item.updated_by is distinct from auth.uid()
         or v_item.owner_id is not null or v_item.owner_name is not null
         or v_item.secondary_owner is not null
         or v_item.actual_protocol_date is not null or v_item.actual_validation_date is not null
         or v_item.actual_report_date is not null or v_item.actual_vmp_date is not null
         or v_item.status_protocol is distinct from 'not_started'
         or v_item.status_validation is distinct from 'not_started'
         or v_item.status_report is distinct from 'not_started'
         or v_item.status_vmp is distinct from 'not_started'
         or v_item.is_active is distinct from true
         or v_item.item_state is distinct from 'active'
         or v_item.version<>0
         or (to_jsonb(v_item)-array[
               'id','validation_code','object_code','validation_type','report_class','effort_days','year',
               'deadline_protocol','deadline_validation','deadline_report','deadline_vmp',
               'departments','created_by','updated_by','created_at','updated_at',
               'computed_status','is_doc_complete','has_mismatch',
               'status_protocol_text','status_validation_text','status_report_text','status_vmp_text'])
            is distinct from '{
              "owner_id":null,"owner_name":null,"secondary_owner":null,
              "criticality_score":null,"criticality":"medium",
              "actual_protocol_date":null,"actual_validation_date":null,
              "actual_report_date":null,"actual_vmp_date":null,"scheduled_date":null,
              "status_protocol":"not_started","status_validation":"not_started",
              "status_report":"not_started","status_vmp":"not_started",
              "is_active":true,"requires_qa_approval":false,
              "qa_approved_by":null,"qa_approved_at":null,
              "sheet_row_id":null,"last_synced":null,"deleted_from_sheet":false,
              "deleted_at":null,"delete_reason":null,"missing_from_sheet":false,
              "missing_since":null,"item_state":"active","version":0,
              "source_sync_run_id":null,"source_sheet_row":null,"source_sheet_data":{},
              "execution_departments":null,"department_text":null,"work_group":null,
              "scheduled_at":null,"owner_person_id":null,"support_person_id":null
            }'::jsonb then
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
      v_snapshot:=v_locked_snapshots->(v_entry->>'validation_code');
      if v_snapshot is null
         or v_item.object_code is distinct from v_source.object_code
         or (v_source.report_class is not null and v_item.report_class is distinct from v_source.report_class)
         or (v_source.workdays is not null and v_item.effort_days is distinct from v_source.workdays::numeric)
         or v_item.deadline_protocol is distinct from v_moc.deadline_protocol
         or v_item.deadline_validation is distinct from v_moc.deadline_validation
         or v_item.deadline_report is distinct from v_moc.deadline_report
         or v_item.deadline_vmp is distinct from v_moc.deadline_vmp
         or v_item.version is distinct from (v_snapshot->>'version')::integer+1
         or v_item.updated_by is distinct from auth.uid()
         or (to_jsonb(v_item)-array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp',
               'report_class','effort_days','computed_status','is_doc_complete','has_mismatch',
               'status_protocol_text','status_validation_text','status_report_text','status_vmp_text',
               'version','updated_at','updated_by'])
            is distinct from
            (v_snapshot-array['deadline_protocol','deadline_validation','deadline_report','deadline_vmp',
               'report_class','effort_days','computed_status','is_doc_complete','has_mismatch',
               'status_protocol_text','status_validation_text','status_report_text','status_vmp_text',
               'version','updated_at','updated_by']) then
        raise exception using errcode='P2001',message='UPDATE_POSTSTATE';
      end if;
    end loop;
    for v_entry in select value from jsonb_array_elements(coalesce(v_preview->'dung','[]')) loop
      select * into v_item from public.vmp_plan_items where validation_code=v_entry->>'validation_code';
      v_snapshot:=v_locked_snapshots->(v_entry->>'validation_code');
      if not found or v_snapshot is null
         or v_item.object_code is distinct from v_source.object_code
         or coalesce(v_item.is_active,true) or v_item.item_state is distinct from 'not_applicable'
         or v_item.version is distinct from (v_snapshot->>'version')::integer+1
         or v_item.updated_by is distinct from auth.uid()
         or (to_jsonb(v_item)-array['is_active','item_state','computed_status','is_doc_complete','has_mismatch',
               'status_protocol_text','status_validation_text','status_report_text','status_vmp_text',
               'version','updated_at','updated_by'])
            is distinct from
            (v_snapshot-array['is_active','item_state','computed_status','is_doc_complete','has_mismatch',
               'status_protocol_text','status_validation_text','status_report_text','status_vmp_text',
               'version','updated_at','updated_by']) then
        raise exception using errcode='P2001',message='STOP_POSTSTATE';
      end if;
    end loop;

    -- Inventory is exact: V1 may add only the authoritative `tao` codes and
    -- may neither delete nor create any other source row.
    select coalesce(array_agg(distinct code order by code),'{}'::text[])
    into v_expected_inventory from (
      select unnest(v_inventory_before) code
      union all
      select value->>'validation_code' from jsonb_array_elements(coalesce(v_preview->'tao','[]'))
    ) expected where code is not null;
    select coalesce(array_agg(pi.validation_code order by pi.validation_code),'{}'::text[])
    into v_inventory_after from public.vmp_plan_items pi
    where pi.object_code=v_source.object_code
       or (pi.year=v_year and left(pi.validation_code,length(v_source.object_code)+1)=v_source.object_code||'/');
    if v_inventory_after is distinct from v_expected_inventory then
      raise exception using errcode='P2001',message='ITEM_INVENTORY_POSTSTATE';
    end if;

    -- Every pre-existing row outside normal update/stop is byte-for-byte
    -- unchanged by V1. This includes progressed overrides and superset-only
    -- rows that the preview did not advertise.
    for v_entry in select to_jsonb(code) value from unnest(v_locked_codes) code loop
      if not exists (select 1 from jsonb_array_elements(coalesce(v_preview->'sua','[]')) e
                     where e->>'validation_code'=v_entry#>>'{}')
         and not exists (select 1 from jsonb_array_elements(coalesce(v_preview->'dung','[]')) e
                         where e->>'validation_code'=v_entry#>>'{}') then
        select to_jsonb(pi) into v_current from public.vmp_plan_items pi
        where pi.validation_code=v_entry#>>'{}';
        if v_current is distinct from v_locked_snapshots->(v_entry#>>'{}') then
          raise exception using errcode='P2001',message='UNCHANGED_ITEM_POSTSTATE';
        end if;
      end if;
    end loop;

    select to_jsonb(so) into v_current from public.vmp_source_objects so where so.id=v_source.id;
    if v_current is null
       or (v_current-array['timeline_applied_revision','updated_at'])
          is distinct from (v_source_snapshot-array['timeline_applied_revision','updated_at'])
       or (v_current->>'timeline_applied_revision')::integer is distinct from v_source.timeline_revision then
      raise exception using errcode='P2001',message='SOURCE_POSTSTATE';
    end if;

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

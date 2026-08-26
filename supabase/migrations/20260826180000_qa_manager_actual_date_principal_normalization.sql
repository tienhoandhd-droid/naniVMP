-- Normalize only the two QA department comparisons used by the canonical
-- manager principal. The item-rights allowlist and progress writer stay fixed.

begin;

do $precondition$
declare
  v_owner oid;
  v_proc oid:='public.vmp_manager_principal(uuid)'::regprocedure;
  v_required text;
  v_mode jsonb;
begin
  foreach v_required in array array[
    'public.vmp_manager_principal(uuid)',
    'public.vmp_business_role(uuid)',
    'public.vmp_is_active_session(uuid)',
    'public.vmp_item_rights(uuid,text)',
    'public.vmp_my_item_rights(text)',
    'public.vmp_allowed_timeline_fields(uuid,text)',
    'public.rpc_update_progress(text,jsonb,text,jsonb,integer)',
    'public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)',
    'public.audit_plan_item_changes_v2()',
    'public.vmp_plan_item_row_revision_v2()'
  ] loop
    if to_regprocedure(v_required) is null then
      raise exception using errcode='check_violation',
        message='QA_ACTUAL_DATE_PRECONDITION_MISSING_FUNCTION '||v_required;
    end if;
  end loop;

  if to_regclass('public.profiles') is null
     or to_regclass('public.vmp_performers') is null
     or to_regclass('public.vmp_plan_items') is null
     or to_regclass('public.audit_logs') is null
     or to_regclass('public.system_config') is null then
    raise exception using errcode='check_violation',
      message='QA_ACTUAL_DATE_PRECONDITION_MISSING_TABLE';
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='vmp_manager_principal')<>1 then
    raise exception using errcode='check_violation',
      message='QA_ACTUAL_DATE_PRECONDITION_PRINCIPAL_OVERLOAD';
  end if;

  select proowner into v_owner from pg_proc where oid=v_proc;
  if v_owner is distinct from (select proowner from pg_proc where oid=
       'public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure)
     or (select pg_get_function_result(v_proc)) is distinct from
       'TABLE(principal_kind text, profile_department text, performer_department text, scope_departments text[], access_areas text[])'
     or (select l.lanname from pg_proc p join pg_language l on l.oid=p.prolang
         where p.oid=v_proc) is distinct from 'sql'
     or not (select prosecdef from pg_proc where oid=v_proc)
     or (select provolatile from pg_proc where oid=v_proc)<>'s'
     or (select proconfig from pg_proc where oid=v_proc)
        is distinct from array['search_path=public, pg_temp']
     or encode(extensions.digest(pg_get_functiondef(v_proc),'sha256'),'hex')
        is distinct from 'dd06b754ecb397066aaa81047d82dcf4dc46a64c3da5b05f616f1a779090734c'
     or not has_function_privilege('service_role',v_proc,'EXECUTE')
     or has_function_privilege('authenticated',v_proc,'EXECUTE')
     or has_function_privilege('anon',v_proc,'EXECUTE')
     or has_function_privilege('public',v_proc,'EXECUTE')
     or (select count(*) from aclexplode(coalesce(
           (select proacl from pg_proc where oid=v_proc),acldefault('f',v_owner))) acl
         where acl.grantee<>v_owner and acl.privilege_type='EXECUTE')<>1 then
    raise exception using errcode='check_violation',
      message='QA_ACTUAL_DATE_PRECONDITION_PRINCIPAL_CONTRACT';
  end if;

  if exists (
    select 1
    from (values
      ('public.vmp_business_role(uuid)',
       '45b2dfab1f9463b234a3754e8ee022450749f8418d6fc4a966b09fe8d52c3156'),
      ('public.vmp_is_active_session(uuid)',
       'e52a0cece430ad8b8319819b633fd4fc8aa92bc2d2fac083a33b22f609e1f417'),
      ('public.vmp_item_rights(uuid,text)',
       'f82b266343a54d695e16df2e9a67867d39ddc50bd11233639266eae7ca1553aa'),
      ('public.vmp_my_item_rights(text)',
       'c7a326defaedd0cf9056a284e480d69027a56cd35f2ca6f09b4a9e321f1ad76d'),
      ('public.vmp_allowed_timeline_fields(uuid,text)',
       '235d5d2e4ff760a7640e2687be430a8a188a56d380b7cf7b72e6018bc71d9a3c'),
      ('public.rpc_update_progress(text,jsonb,text,jsonb,integer)',
       'da25f8acbcc5aa3e029e581acb79f210cf1d6c61ab0e8458e4ff89146e75f4a0'),
      ('public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)',
       '55f7f86442b88a12c39e1f3cb6dd867d0aae0a684db78365bcef673a473e2644'),
      ('public.audit_plan_item_changes_v2()',
       '4f69863a23c5353fda09332a04f7643c58b8d9e0ceb126b52790e4b61162ba4c'),
      ('public.vmp_plan_item_row_revision_v2()',
       'd00963d1f265c8d7457011cdafc331a9c7aafbb6b86e0bf7c82ce94bda4829c2')
    ) reviewed(signature,definition_sha256)
    join pg_proc p on p.oid=reviewed.signature::regprocedure
    where encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')
          is distinct from reviewed.definition_sha256
  ) then
    raise exception using errcode='check_violation',
      message='QA_ACTUAL_DATE_PRECONDITION_DEPENDENCY_DEFINITION';
  end if;

  if exists (
    select required.column_name
    from (values
      ('profiles','id','uuid'),
      ('profiles','role','user_role'),
      ('profiles','department','text'),
      ('profiles','is_active','boolean'),
      ('vmp_performers','id','uuid'),
      ('vmp_performers','user_id','uuid'),
      ('vmp_performers','department','text'),
      ('vmp_performers','access_class','text'),
      ('vmp_performers','is_active','boolean'),
      ('vmp_performers','scope_departments','text[]'),
      ('vmp_performers','access_areas','text[]'),
      ('vmp_plan_items','validation_code','text'),
      ('vmp_plan_items','version','integer'),
      ('vmp_plan_items','is_active','boolean'),
      ('audit_logs','effective_business_role','text')
    ) required(table_name,column_name,data_type)
    left join pg_class rel on rel.relname=required.table_name
      and rel.relnamespace='public'::regnamespace
    left join pg_attribute a on a.attrelid=rel.oid
      and a.attname=required.column_name and not a.attisdropped
    where a.attname is null
       or format_type(a.atttypid,a.atttypmod) is distinct from required.data_type
  ) then
    raise exception using errcode='check_violation',
      message='QA_ACTUAL_DATE_PRECONDITION_COLUMNS';
  end if;

  select value into v_mode from public.system_config
  where key='item_permissions_mode';
  if v_mode is null then
    raise exception using errcode='check_violation',
      message='QA_ACTUAL_DATE_PRECONDITION_PERMISSION_MODE';
  end if;
  perform set_config('app.qa_actual_permission_mode_before',v_mode::text,true);
end
$precondition$;

create or replace function public.vmp_manager_principal(p_uid uuid)
returns table(
  principal_kind text,
  profile_department text,
  performer_department text,
  scope_departments text[],
  access_areas text[]
)
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select
    case
      when profile.role::text = 'admin' then 'admin'
      when profile.role::text = 'qa_manager'
        and upper(btrim(profile.department::text)) = 'QA'
        and person.access_class = 'qa_manager'
        and upper(btrim(person.department::text)) = 'QA'
        then 'qa_manager'
      when profile.role::text = 'department_user'
        and nullif(btrim(coalesce(profile.department, '')), '') is not null
        and person.access_class = 'equipment_manager'
        and person.department = profile.department
        then 'equipment_manager'
      else null
    end,
    profile.department,
    person.department,
    coalesce(person.scope_departments, '{}'::text[]),
    coalesce(person.access_areas, '{}'::text[])
  from public.profiles profile
  left join public.vmp_performers person
    on person.user_id = profile.id and person.is_active
  where profile.id = p_uid and coalesce(profile.is_active, true)
$function$;

do $postcondition$
declare
  v_proc oid:='public.vmp_manager_principal(uuid)'::regprocedure;
  v_owner oid;
  v_definition text;
  v_reverted text;
  v_profile_expression constant text:=
    'upper(btrim(profile.department::text)) = ''QA''';
  v_person_expression constant text:=
    'upper(btrim(person.department::text)) = ''QA''';
begin
  select proowner,pg_get_functiondef(oid) into v_owner,v_definition
  from pg_proc where oid=v_proc;
  v_reverted:=replace(replace(
    v_definition,
    v_profile_expression,'profile.department = ''qa'''),
    v_person_expression,'person.department = ''qa''');

  if (length(v_definition)-length(replace(v_definition,v_profile_expression,'')))
       / length(v_profile_expression)<>1
     or (length(v_definition)-length(replace(v_definition,v_person_expression,'')))
       / length(v_person_expression)<>1
     or v_definition like '%profile.department = ''qa''%'
     or v_definition like '%person.department = ''qa''%'
     or encode(extensions.digest(v_definition,'sha256'),'hex')
        is distinct from 'f1d5c93ff47de4563100f1ce9a54ada9d7b6d0ee908a9914f14327f2fa7af849'
     or encode(extensions.digest(v_reverted,'sha256'),'hex')
        is distinct from 'dd06b754ecb397066aaa81047d82dcf4dc46a64c3da5b05f616f1a779090734c'
     or v_owner is distinct from (select proowner from pg_proc where oid=
       'public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure)
     or not (select prosecdef from pg_proc where oid=v_proc)
     or (select provolatile from pg_proc where oid=v_proc)<>'s'
     or (select proconfig from pg_proc where oid=v_proc)
        is distinct from array['search_path=public, pg_temp']
     or not has_function_privilege('service_role',v_proc,'EXECUTE')
     or has_function_privilege('authenticated',v_proc,'EXECUTE')
     or has_function_privilege('anon',v_proc,'EXECUTE')
     or has_function_privilege('public',v_proc,'EXECUTE')
     or (select count(*) from aclexplode(coalesce(
           (select proacl from pg_proc where oid=v_proc),acldefault('f',v_owner))) acl
         where acl.grantee<>v_owner and acl.privilege_type='EXECUTE')<>1
     or (select value::text from public.system_config
         where key='item_permissions_mode') is distinct from
        current_setting('app.qa_actual_permission_mode_before',true) then
    raise exception using errcode='check_violation',
      message='QA_ACTUAL_DATE_POSTCONDITION_CONTRACT';
  end if;

  if exists (
    select 1
    from (values
      ('public.vmp_item_rights(uuid,text)',
       'f82b266343a54d695e16df2e9a67867d39ddc50bd11233639266eae7ca1553aa'),
      ('public.vmp_my_item_rights(text)',
       'c7a326defaedd0cf9056a284e480d69027a56cd35f2ca6f09b4a9e321f1ad76d'),
      ('public.vmp_allowed_timeline_fields(uuid,text)',
       '235d5d2e4ff760a7640e2687be430a8a188a56d380b7cf7b72e6018bc71d9a3c'),
      ('public.rpc_update_progress(text,jsonb,text,jsonb,integer)',
       'da25f8acbcc5aa3e029e581acb79f210cf1d6c61ab0e8458e4ff89146e75f4a0'),
      ('public.rpc_update_progress__five_role_impl_20260824(text,jsonb,text,jsonb,integer)',
       '55f7f86442b88a12c39e1f3cb6dd867d0aae0a684db78365bcef673a473e2644')
    ) reviewed(signature,definition_sha256)
    join pg_proc p on p.oid=reviewed.signature::regprocedure
    where encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')
          is distinct from reviewed.definition_sha256
  ) then
    raise exception using errcode='check_violation',
      message='QA_ACTUAL_DATE_POSTCONDITION_ALLOWLIST_OR_WRITER_DRIFT';
  end if;
end
$postcondition$;

commit;

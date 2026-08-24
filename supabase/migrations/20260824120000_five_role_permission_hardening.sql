-- Five-role permission hardening. Forward-only and intended to run inside
-- scripts/apply-five-role-hardening.sql's transaction.

do $preconditions$
declare
  v_count integer;
  v_digest text;
  v_implicit_array text;
  v_explicit_array text;
  v_implicit_csv text;
  v_explicit_csv text;
  v_rpc_inventory jsonb;
begin
  if public.screen_access_mode() is distinct from 'enforced'
     or public.item_permissions_mode() is distinct from 'preview' then
    raise exception using errcode = 'check_violation',
      message = 'PRECONDITION_PERMISSION_MODES_DRIFTED';
  end if;

  select count(*),
         md5(string_agg(concat_ws('|', business_role, screen_id,
           can_view, data_scope, actions::text), E'\n'
           order by business_role, screen_id)),
         md5(string_agg(concat_ws('|', business_role, screen_id,
           can_view::text, data_scope, actions::text), E'\n'
           order by business_role, screen_id)),
         md5(string_agg(concat_ws('|', business_role, screen_id,
           can_view, data_scope, array_to_string(actions, ',')), E'\n'
           order by business_role, screen_id)),
         md5(string_agg(concat_ws('|', business_role, screen_id,
           can_view::text, data_scope, array_to_string(actions, ',')), E'\n'
           order by business_role, screen_id))
    into v_count, v_implicit_array, v_explicit_array,
         v_implicit_csv, v_explicit_csv
  from public.vmp_screen_permissions;

  if v_count <> 102
     or v_implicit_array <> '0befb5a03f96dfe2dfa653f7da929cd0'
     or v_explicit_array <> 'f23b9883743f21e86145400e11dd1167'
     or v_implicit_csv <> '99813f36bc9dbc88fec26a18a1685d7c'
     or v_explicit_csv <> 'b5fb9554b5ed69ff247c3ea54a6e3b0e' then
    raise exception using errcode = 'check_violation',
      message = 'PRECONDITION_SCREEN_MATRIX_DRIFTED';
  end if;

  if md5(pg_get_functiondef('public.auth_user_role()'::regprocedure))
       <> 'b23193f21fe23e5a88fa83569661a420'
     or md5(pg_get_functiondef('public.vmp_business_role(uuid)'::regprocedure))
       <> '5157bf108e294b174457701a20081aaa'
     or md5(pg_get_functiondef('public.vmp_business_role_unresolved_reason(uuid)'::regprocedure))
       <> 'c542eb92f60499f766d39f5960f52c92'
     or md5(pg_get_functiondef('public.rpc_my_ui_access()'::regprocedure))
       <> '7e03ac3e48da9f0d3a83e18cd92409ce'
     or md5(pg_get_functiondef('public.rpc_catalog_history(jsonb,integer,integer)'::regprocedure))
       <> 'd5cc4d836c5039230f7e46a936b42f57'
     or md5(pg_get_functiondef('public.rpc_catalog_history_detail(uuid)'::regprocedure))
       <> 'b2675c46e69e46492799ed0ea8841d13' then
    raise exception using errcode = 'check_violation',
      message = 'PRECONDITION_CORE_FUNCTION_DRIFTED';
  end if;

  select jsonb_agg(jsonb_build_object(
           'name', source_name,
           'identity', source_identity,
           'classification', source_classification
         ) order by source_name)
    into v_rpc_inventory
  from (values
    -- SOURCE_RPC_INVENTORY_BEGIN
    ('item_permissions_mode', 'item_permissions_mode()', 'guarded_explicit'),
    ('rpc_active_rules', 'rpc_active_rules()', 'guarded_wrapper'),
    ('rpc_apply_catalog_change', 'rpc_apply_catalog_change(uuid,text,integer)', 'guarded_wrapper'),
    ('rpc_business_roles', 'rpc_business_roles()', 'guarded_wrapper'),
    ('rpc_catalog_history', 'rpc_catalog_history(jsonb,integer,integer)', 'guarded_explicit'),
    ('rpc_catalog_history_detail', 'rpc_catalog_history_detail(uuid)', 'guarded_explicit'),
    ('rpc_check_data_quality', 'rpc_check_data_quality(integer)', 'guarded_wrapper'),
    ('rpc_commit_catalog_import', 'rpc_commit_catalog_import(uuid,text)', 'guarded_wrapper'),
    ('rpc_create_plan_item', 'rpc_create_plan_item(text,text,integer,integer,jsonb)', 'guarded_wrapper'),
    ('rpc_dashboard_kpi', 'rpc_dashboard_kpi(integer)', 'guarded_wrapper'),
    ('rpc_delete_performer', 'rpc_delete_performer(uuid)', 'guarded_explicit'),
    ('rpc_delete_plan_item', 'rpc_delete_plan_item(text,text)', 'guarded_wrapper'),
    ('rpc_delete_source_row', 'rpc_delete_source_row(text,integer)', 'guarded_wrapper'),
    ('rpc_due_alerts', 'rpc_due_alerts(integer,integer)', 'guarded_wrapper'),
    ('rpc_generate_timeline', 'rpc_generate_timeline(integer,boolean)', 'guarded_wrapper'),
    ('rpc_get_audit_logs', 'rpc_get_audit_logs(integer,integer,text,text,text,text,timestamp with time zone,timestamp with time zone)', 'guarded_wrapper'),
    ('rpc_get_missing_items', 'rpc_get_missing_items(integer)', 'guarded_wrapper'),
    ('rpc_get_vmp_dashboard', 'rpc_get_vmp_dashboard(integer,boolean,boolean)', 'guarded_wrapper'),
    ('rpc_get_vmp_watermark', 'rpc_get_vmp_watermark(integer)', 'guarded_wrapper'),
    ('rpc_import_item_permission_staff', 'rpc_import_item_permission_staff(jsonb,text)', 'guarded_wrapper'),
    ('rpc_item_assignments', 'rpc_item_assignments(text,uuid)', 'guarded_wrapper'),
    ('rpc_item_permission_account_candidates', 'rpc_item_permission_account_candidates(text)', 'guarded_wrapper'),
    ('rpc_item_permission_directory', 'rpc_item_permission_directory(text)', 'guarded_wrapper'),
    ('rpc_item_permission_preflight', 'rpc_item_permission_preflight()', 'guarded_wrapper'),
    ('rpc_item_permission_scope_catalog', 'rpc_item_permission_scope_catalog()', 'guarded_wrapper'),
    ('rpc_item_progress_history', 'rpc_item_progress_history(text,integer,integer)', 'guarded_wrapper'),
    ('rpc_lien_ket_tai_khoan', 'rpc_lien_ket_tai_khoan(uuid,uuid)', 'service_only'),
    ('rpc_link_item_permission_account', 'rpc_link_item_permission_account(uuid,uuid,text,integer)', 'guarded_wrapper'),
    ('rpc_list_catalog_changes', 'rpc_list_catalog_changes(text,text,integer,integer)', 'guarded_wrapper'),
    ('rpc_list_catalog_dataset', 'rpc_list_catalog_dataset(text,text,jsonb,integer,integer)', 'guarded_wrapper'),
    ('rpc_list_source_tabs', 'rpc_list_source_tabs()', 'guarded_wrapper'),
    ('rpc_luat_xem', 'rpc_luat_xem()', 'guarded_wrapper'),
    ('rpc_my_ui_access', 'rpc_my_ui_access()', 'guarded_explicit'),
    ('rpc_nguoi_va_quyen', 'rpc_nguoi_va_quyen()', 'guarded_wrapper'),
    ('rpc_preview_catalog_change', 'rpc_preview_catalog_change(uuid)', 'guarded_wrapper'),
    ('rpc_preview_item_rights', 'rpc_preview_item_rights(uuid,text)', 'guarded_wrapper'),
    ('rpc_recalc_criticality', 'rpc_recalc_criticality(boolean)', 'guarded_wrapper'),
    ('rpc_refresh_computed_status', 'rpc_refresh_computed_status()', 'guarded_wrapper'),
    ('rpc_resolve_missing', 'rpc_resolve_missing(text,text,text)', 'guarded_wrapper'),
    ('rpc_save_alert_recipient', 'rpc_save_alert_recipient(uuid,jsonb,text,integer)', 'guarded_wrapper'),
    ('rpc_save_catalog_object', 'rpc_save_catalog_object(text,text,jsonb,text,integer)', 'guarded_wrapper'),
    ('rpc_save_product_gmp', 'rpc_save_product_gmp(text,jsonb,text,integer)', 'guarded_wrapper'),
    ('rpc_set_assignment', 'rpc_set_assignment(text,text,text,text,text)', 'guarded_wrapper'),
    ('rpc_set_business_role', 'rpc_set_business_role(uuid,text,text,text)', 'guarded_wrapper'),
    ('rpc_set_catalog_import_row_reason', 'rpc_set_catalog_import_row_reason(uuid,integer,text)', 'guarded_wrapper'),
    ('rpc_set_email_cho_phep', 'rpc_set_email_cho_phep(text,boolean,text)', 'guarded_wrapper'),
    ('rpc_set_item_assignment', 'rpc_set_item_assignment(uuid,text,text,text,text,text,uuid)', 'guarded_wrapper'),
    ('rpc_set_item_performer', 'rpc_set_item_performer(text,text)', 'service_only'),
    ('rpc_set_item_performer_by_id', 'rpc_set_item_performer_by_id(text,uuid,text)', 'guarded_wrapper'),
    ('rpc_set_item_permissions_mode', 'rpc_set_item_permissions_mode(text,text)', 'guarded_wrapper'),
    ('rpc_set_item_state', 'rpc_set_item_state(text,text,text)', 'guarded_wrapper'),
    ('rpc_set_user_active', 'rpc_set_user_active(uuid,boolean,text)', 'guarded_wrapper'),
    ('rpc_set_user_role', 'rpc_set_user_role(uuid,text,text,text,text)', 'guarded_wrapper'),
    ('rpc_source_warnings', 'rpc_source_warnings(integer)', 'guarded_wrapper'),
    ('rpc_stage_catalog_import', 'rpc_stage_catalog_import(text,text,text,text,jsonb)', 'guarded_wrapper'),
    ('rpc_trang_thai_he_thong', 'rpc_trang_thai_he_thong()', 'guarded_wrapper'),
    ('rpc_update_progress', 'rpc_update_progress(text,jsonb,text,jsonb,integer)', 'guarded_wrapper'),
    ('rpc_upsert_item_permission_staff', 'rpc_upsert_item_permission_staff(uuid,jsonb,text,integer)', 'guarded_wrapper'),
    ('rpc_upsert_object', 'rpc_upsert_object(text,text,text,text,text,text,integer,text)', 'guarded_wrapper'),
    ('rpc_upsert_performer', 'rpc_upsert_performer(uuid,jsonb)', 'guarded_explicit'),
    ('rpc_upsert_source_row', 'rpc_upsert_source_row(text,integer,jsonb)', 'guarded_wrapper'),
    ('vmp_my_item_rights', 'vmp_my_item_rights(text)', 'guarded_wrapper')
    -- SOURCE_RPC_INVENTORY_END
  ) reviewed(source_name, source_identity, source_classification);

  perform set_config('vmp.five_role_source_rpc_inventory',
    v_rpc_inventory::text, true);

  with reviewed as (
    select * from jsonb_to_recordset(v_rpc_inventory)
      as i(name text, identity text, classification text)
  ), inventory as (
    select p.oid::regprocedure::text identity,
           pg_get_function_result(p.oid) result_type,
           l.lanname language,
           p.prosecdef security_definer,
           coalesce(array_to_string(p.proconfig, ','), '') settings,
           md5(pg_get_functiondef(p.oid)) definition_hash,
           r.rolname owner,
           coalesce(array_to_string(p.proacl, ','), '') acl
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    join pg_roles r on r.oid = p.proowner
    join reviewed w on w.name = p.proname
    where n.nspname = 'public'
  )
  select count(*),
         md5(string_agg(concat_ws('|', identity, result_type, language,
           security_definer, settings, definition_hash, owner, acl), E'\n'
           order by identity))
    into v_count, v_digest
  from inventory;

  if jsonb_array_length(v_rpc_inventory) <> 62
     or v_count <> 62
     or v_digest <> '10558e3cb339c9ee32e697d0643fd16f'
     or exists (
       select 1
       from jsonb_to_recordset(v_rpc_inventory)
         as i(name text, identity text, classification text)
       left join pg_proc p
         on p.oid = i.identity::regprocedure
       where p.oid is null
     ) then
    raise exception using errcode = 'check_violation',
      message = 'PRECONDITION_FUNCTION_INVENTORY_DRIFTED';
  end if;

  -- ALTER FUNCTION ... RENAME preserves the function OID. Refuse to rename a
  -- reviewed boundary when a policy, view, expression, trigger, or function is
  -- catalog-bound to that OID; such a dependent would otherwise bypass the
  -- replacement wrapper and call the owner-only implementation directly.
  if exists (
    select 1
    from jsonb_to_recordset(v_rpc_inventory)
      as i(name text, identity text, classification text)
    join pg_proc p on p.oid = i.identity::regprocedure
    join pg_depend d
      on d.refclassid = 'pg_proc'::regclass and d.refobjid = p.oid
    where i.classification = 'guarded_wrapper'
  ) then
    raise exception using errcode = 'dependent_objects_still_exist',
      message = 'PRECONDITION_GUARDED_RPC_HAS_OID_DEPENDENCY';
  end if;

  with direct_tables(table_name) as (values
    ('audit_logs'), ('data_quality_issues'), ('vmp_alert_recipients'),
    ('vmp_assignment_matrix'), ('vmp_chat_loi_cho'), ('vmp_email_cho_phep'),
    ('vmp_performers'), ('vmp_plan_items'), ('vmp_source_objects'),
    ('vmp_source_rows'), ('vmp_staff_emails'), ('profiles'),
    ('vmp_screen_permissions')
  ), inventory as (
    select d.table_name,
           coalesce(c.relkind::text, '') relkind,
           coalesce(c.relrowsecurity, false) relrowsecurity,
           coalesce(c.relforcerowsecurity, false) relforcerowsecurity,
           coalesce(has_table_privilege('authenticated', c.oid, 'SELECT'), false) auth_select,
           coalesce(has_table_privilege('authenticated', c.oid, 'INSERT'), false) auth_insert,
           coalesce(has_table_privilege('authenticated', c.oid, 'UPDATE'), false) auth_update,
           coalesce(has_table_privilege('authenticated', c.oid, 'DELETE'), false) auth_delete
    from direct_tables d
    left join pg_class c
      on c.relnamespace = 'public'::regnamespace and c.relname = d.table_name
  )
  select count(*),
         md5(string_agg(concat_ws('|', table_name, relkind, relrowsecurity,
           relforcerowsecurity, auth_select, auth_insert, auth_update,
           auth_delete), E'\n' order by table_name))
    into v_count, v_digest
  from inventory;

  if v_count <> 13 or v_digest <> 'daf0e505065cbf148aa86796ae5d18c4' then
    raise exception using errcode = 'check_violation',
      message = 'PRECONDITION_TABLE_INVENTORY_DRIFTED';
  end if;

  with direct_tables(table_name) as (values
    ('audit_logs'), ('data_quality_issues'), ('vmp_alert_recipients'),
    ('vmp_assignment_matrix'), ('vmp_chat_loi_cho'), ('vmp_email_cho_phep'),
    ('vmp_performers'), ('vmp_plan_items'), ('vmp_source_objects'),
    ('vmp_source_rows'), ('vmp_staff_emails'), ('profiles')
  ), policy_rows as (
    select p.tablename, p.policyname, p.permissive, p.roles, p.cmd,
           coalesce(p.qual, '') qual, coalesce(p.with_check, '') with_check
    from pg_policies p
    join direct_tables d on d.table_name = p.tablename
    where p.schemaname = 'public'
  )
  select count(*),
         md5(string_agg(concat_ws('|', tablename, policyname, permissive,
           roles::text, cmd, qual, with_check), E'\n'
           order by tablename, policyname))
    into v_count, v_digest
  from policy_rows;

  if v_count <> 17 or v_digest <> 'eaeb3e583e508ec43ce071ee1f8d7e74' then
    raise exception using errcode = 'check_violation',
      message = 'PRECONDITION_POLICY_INVENTORY_DRIFTED';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like '%\_\_five\_role\_impl\_20260824' escape '\'
  ) or to_regprocedure('public.vmp_is_active_session(uuid)') is not null
     or to_regprocedure('public.vmp_current_session_is_active()') is not null
     or to_regprocedure('public.vmp_profile_authority_guard()') is not null then
    raise exception using errcode = 'duplicate_object',
      message = 'PRECONDITION_HARDENING_OBJECT_ALREADY_EXISTS';
  end if;
end
$preconditions$;

create or replace function public.vmp_business_role(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with prof as (
    select p.id, p.role::text as login_role, p.department
    from public.profiles p
    where p.id = p_uid
      and coalesce(p.is_active, true)
      and p.role::text <> 'viewer'
  ), linked as (
    select case when count(*) = 1 then (array_agg(f.id))[1] end as person_id
    from public.vmp_performers f
    where f.user_id = p_uid and f.is_active
  ), person as (
    select f.* from public.vmp_performers f join linked l on l.person_id = f.id
  )
  select case
    when pr.login_role = 'admin' then 'admin'
    when pr.login_role = 'qa_manager'
      and upper(btrim(pe.department::text)) = 'QA'
      and pe.access_class = 'qa_manager' then 'qa_manager'
    when pr.login_role = 'department_user'
      and upper(btrim(pe.department::text)) = 'QA'
      and pe.access_class = 'qa_progress_editor' then 'qa_staff'
    when pr.login_role = 'department_user'
      and pr.department is not null and pe.department = pr.department
      and pe.access_class = 'equipment_manager' then 'workshop_manager'
    when pr.login_role = 'department_user'
      and pr.department is not null and pe.department = pr.department
      and pe.access_class = 'workshop_staff' then 'workshop_staff'
    else null
  end
  from prof pr left join person pe on true
$function$;

create or replace function public.vmp_business_role_unresolved_reason(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select case
    when public.vmp_business_role(p_uid) is not null then null
    when not exists (select 1 from public.profiles p where p.id = p_uid)
      then 'no_profile'
    when exists (
      select 1 from public.profiles p
      where p.id = p_uid and coalesce(p.is_active, true) = false
    ) then 'inactive_profile'
    when exists (
      select 1 from public.profiles p
      where p.id = p_uid and coalesce(p.is_active, true)
        and p.role::text = 'viewer'
    ) then 'legacy_role_disabled'
    when (select count(*) from public.vmp_performers f
          where f.user_id = p_uid and f.is_active) > 1
      then 'duplicate_person_link'
    when not exists (
      select 1 from public.vmp_performers f
      where f.user_id = p_uid and f.is_active
    ) then 'no_person_link'
    when exists (
      select 1 from public.vmp_performers f
      where f.user_id = p_uid and f.is_active and f.access_class is null
    ) then 'missing_access_class'
    else 'department_mismatch'
  end
$function$;

create function public.vmp_is_active_session(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select p_uid is not null
     and exists (
       select 1 from public.profiles p
       where p.id = p_uid and coalesce(p.is_active, true)
         and p.role::text <> 'viewer'
     )
     and public.vmp_business_role(p_uid) in
       ('admin','qa_manager','qa_staff','workshop_manager','workshop_staff')
$function$;

revoke execute on function public.vmp_is_active_session(uuid)
  from public, anon, authenticated;
grant execute on function public.vmp_is_active_session(uuid) to service_role;

create function public.vmp_current_session_is_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select public.vmp_is_active_session(auth.uid())
$function$;

revoke execute on function public.vmp_current_session_is_active()
  from public, anon;
grant execute on function public.vmp_current_session_is_active()
  to authenticated, service_role;

create function public.vmp_session_denial()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles p
    where p.id = v_uid and coalesce(p.is_active, true)
  ) then
    v_code := 'ACCOUNT_DISABLED';
  else
    v_code := 'ROLE_UNRESOLVED';
  end if;

  return jsonb_build_object(
    'ok', false,
    'error_code', v_code,
    'error', case v_code
      when 'ACCOUNT_DISABLED' then 'Tài khoản không hoạt động'
      else 'Không xác định được vai trò nghiệp vụ'
    end
  );
end
$function$;

revoke execute on function public.vmp_session_denial() from public, anon;
grant execute on function public.vmp_session_denial()
  to authenticated, service_role;

-- Preserve this function's OID because existing RLS policy expressions depend
-- on it directly. Replacing it in place keeps those dependencies pointed at
-- the public, guarded boundary instead of a renamed implementation.
create or replace function public.item_permissions_mode()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if coalesce(auth.role(), '') not in ('', 'service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    raise exception using errcode = '42501',
      message = public.vmp_session_denial() ->> 'error_code';
  end if;

  return coalesce((
    select value #>> '{}'
    from public.system_config
    where key = 'item_permissions_mode'
  ), 'preview');
end
$function$;

create or replace function public.auth_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select case
    when public.vmp_is_active_session(auth.uid()) then (
      select p.role from public.profiles p where p.id = auth.uid()
    )
    else null
  end
$function$;

revoke execute on function public.auth_user_role() from public, anon;
grant execute on function public.auth_user_role() to authenticated, service_role;

create or replace function public.rpc_my_ui_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid;
  v_mode text;
  v_role text;
  v_reason text;
  v_login text;
  v_class text;
  v_screens jsonb;
begin
  if coalesce(auth.role(), '') not in ('', 'service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial() || jsonb_build_object(
      'mode', 'enforced', 'business_role', null,
      'unresolved_reason', coalesce(
        public.vmp_business_role_unresolved_reason(auth.uid()),
        'role_unresolved'),
      'screens', '{}'::jsonb);
  end if;

  v_uid := auth.uid();
  v_mode := public.screen_access_mode();
  if v_uid is null then
    return jsonb_build_object(
      'ok', false, 'mode', 'enforced', 'business_role', null,
      'unresolved_reason', 'no_session', 'screens', '{}'::jsonb);
  end if;

  v_role := public.vmp_business_role(v_uid);
  v_reason := public.vmp_business_role_unresolved_reason(v_uid);

  if not public.vmp_is_active_session(v_uid) then
    return public.vmp_session_denial() || jsonb_build_object(
      'mode', 'enforced', 'business_role', null,
      'unresolved_reason', coalesce(v_reason, 'role_unresolved'),
      'screens', '{}'::jsonb);
  end if;

  if v_mode <> 'enforced' then
    select p.role::text into v_login
    from public.profiles p where p.id = v_uid;
    select f.access_class into v_class
    from public.vmp_performers f
    where f.user_id = v_uid and f.is_active
    limit 1;

    select jsonb_object_agg(s.screen_id, jsonb_build_object(
             'can_view', s.can_view,
             'data_scope', case when s.can_view then 'all' else 'none' end,
             'actions', case when s.can_view
               then '["view"]'::jsonb else '[]'::jsonb end))
      into v_screens
    from (
      select x.screen_id,
             case
               when v_login = 'admin' then true
               when x.screen_id in ('health','audit','admin','people','accounts')
                 then false
               when x.screen_id = 'phanquyen' then
                 v_login = 'qa_manager'
                 or v_class in ('qa_manager','equipment_manager')
               else true
             end as can_view
      from (select distinct screen_id from public.vmp_screen_permissions) x
    ) s;

    return jsonb_build_object(
      'ok', true, 'mode', 'preview', 'business_role', v_role,
      'unresolved_reason', null,
      'screens', coalesce(v_screens, '{}'::jsonb));
  end if;

  select jsonb_object_agg(p.screen_id, jsonb_build_object(
           'can_view', p.can_view,
           'data_scope', p.data_scope,
           'actions', to_jsonb(p.actions)))
    into v_screens
  from public.vmp_screen_permissions p
  where p.business_role = v_role;

  return jsonb_build_object(
    'ok', true, 'mode', 'enforced', 'business_role', v_role,
    'unresolved_reason', null,
    'screens', coalesce(v_screens, '{}'::jsonb));
end
$function$;

delete from public.vmp_screen_permissions where business_role = 'viewer';

alter table public.vmp_screen_permissions
  drop constraint vmp_screen_permissions_business_role_check;
alter table public.vmp_screen_permissions
  add constraint vmp_screen_permissions_business_role_check
  check (business_role = any(array[
    'admin'::text, 'qa_manager'::text, 'qa_staff'::text,
    'workshop_manager'::text, 'workshop_staff'::text
  ]));

revoke insert, update, delete on public.profiles
  from public, anon, authenticated;
revoke update (id, full_name, email, role, department, phone, title,
  is_active, last_login, created_at, updated_at, pham_vi)
  on public.profiles from public, anon, authenticated;
drop policy profiles_update on public.profiles;

create function public.vmp_profile_authority_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception using errcode = '42501',
      message = 'PROFILE_AUTHORITY_COLUMNS_REQUIRE_ADMIN_RPC';
  end if;
  return new;
end
$function$;

revoke execute on function public.vmp_profile_authority_guard()
  from public, anon, authenticated;

create trigger vmp_profiles_authority_guard
before update of role, department, is_active, pham_vi
on public.profiles
for each row execute function public.vmp_profile_authority_guard();

alter policy profiles_select on public.profiles
using (
  id = auth.uid()
  or (public.vmp_current_session_is_active() and public.is_admin_or_qa())
);
alter policy profiles_insert on public.profiles
with check (
  public.vmp_current_session_is_active()
  and public.auth_user_role() = 'admin'::public.user_role
);

do $policies$
declare
  r record;
  v_using text;
  v_check text;
begin
  for r in
    select n.nspname, c.relname, p.polname, p.polcmd,
           pg_get_expr(p.polqual, p.polrelid) as using_expr,
           pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(array[
        'audit_logs', 'data_quality_issues', 'vmp_alert_recipients',
        'vmp_assignment_matrix', 'vmp_chat_loi_cho', 'vmp_email_cho_phep',
        'vmp_performers', 'vmp_plan_items', 'vmp_source_objects',
        'vmp_source_rows', 'vmp_staff_emails'
      ]::text[])
      and exists (
        select 1
        from unnest(p.polroles) effective_role(role_oid)
        where case
          when effective_role.role_oid = 0 then true
          else pg_has_role('authenticated'::regrole::oid,
            effective_role.role_oid, 'USAGE')
        end
      )
    order by c.relname, p.polname
  loop
    v_using := format('(%s) and public.vmp_current_session_is_active()',
      coalesce(r.using_expr, 'true'));
    v_check := format('(%s) and public.vmp_current_session_is_active()',
      coalesce(r.check_expr, r.using_expr, 'true'));

    if r.polcmd = 'r' then
      execute format('alter policy %I on %I.%I using (%s)',
        r.polname, r.nspname, r.relname, v_using);
    elsif r.polcmd = 'a' then
      execute format('alter policy %I on %I.%I with check (%s)',
        r.polname, r.nspname, r.relname, v_check);
    elsif r.polcmd = 'd' then
      execute format('alter policy %I on %I.%I using (%s)',
        r.polname, r.nspname, r.relname, v_using);
    else
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',
        r.polname, r.nspname, r.relname, v_using, v_check);
    end if;
  end loop;
end
$policies$;

revoke all on public.audit_logs from public, anon, authenticated;

create or replace function public.rpc_catalog_history(
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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
      'vmp_objects', 'vmp_products_gmp', 'vmp_email_cho_phep'
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
        'vmp_objects', 'vmp_products_gmp', 'vmp_email_cho_phep'
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

create or replace function public.rpc_catalog_history_detail(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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
        'vmp_objects', 'vmp_products_gmp', 'vmp_email_cho_phep'
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

revoke execute on function public.rpc_catalog_history(jsonb,integer,integer)
  from public, anon;
revoke execute on function public.rpc_catalog_history_detail(uuid)
  from public, anon;
grant execute on function public.rpc_catalog_history(jsonb,integer,integer)
  to authenticated, service_role;
grant execute on function public.rpc_catalog_history_detail(uuid)
  to authenticated, service_role;

do $guarded_wrappers$
declare
  r record;
  a record;
  v_impl_name text;
  v_call_args text;
  v_body text;
  v_volatility text;
  v_expected_acl jsonb;
  v_actual_acl jsonb;
  v_wrapper_oid oid;
begin
  for r in
    select p.oid, p.proname, i.identity,
           pg_get_function_arguments(p.oid) as full_arguments,
           pg_get_function_identity_arguments(p.oid) as identity_arguments,
           pg_get_function_result(p.oid) as result_type,
           p.proargnames, p.pronargs, p.proretset, p.provolatile,
           p.proowner, owner_role.rolname as owner_name, p.proacl
    from jsonb_to_recordset(current_setting(
      'vmp.five_role_source_rpc_inventory')::jsonb)
      as i(name text, identity text, classification text)
    join pg_proc p on p.oid = i.identity::regprocedure
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles owner_role on owner_role.oid = p.proowner
    where n.nspname = 'public' and i.classification = 'guarded_wrapper'
    order by p.oid::regprocedure::text
  loop
    v_impl_name := r.proname || '__five_role_impl_20260824';
    select coalesce(string_agg(format('%I', arg_name), ', ' order by ord), '')
      into v_call_args
    from unnest(r.proargnames[1:r.pronargs]) with ordinality a(arg_name, ord);

    select coalesce(jsonb_agg(jsonb_build_array(
             x.grantee, x.privilege_type, x.is_grantable)
             order by x.grantee, x.privilege_type, x.is_grantable), '[]'::jsonb)
      into v_expected_acl
    from aclexplode(coalesce(r.proacl, acldefault('f', r.proowner))) x
    where x.grantee <> r.proowner and x.privilege_type = 'EXECUTE';

    execute format('alter function public.%I(%s) rename to %I',
      r.proname, r.identity_arguments, v_impl_name);

    -- The renamed implementation is owner-only, including any reviewed
    -- nonstandard grantee rather than only the four Supabase browser roles.
    for a in
      select distinct x.grantee, grantee_role.rolname as grantee_name
      from aclexplode(coalesce(r.proacl, acldefault('f', r.proowner))) x
      left join pg_roles grantee_role on grantee_role.oid = x.grantee
      where x.grantee <> r.proowner and x.privilege_type = 'EXECUTE'
    loop
      if a.grantee = 0 then
        execute format('revoke execute on function public.%I(%s) from public',
          v_impl_name, r.identity_arguments);
      elsif a.grantee_name is null then
        raise exception using errcode = 'undefined_object',
          message = 'HIDDEN_IMPLEMENTATION_GRANTEE_MISSING';
      else
        execute format('revoke execute on function public.%I(%s) from %I',
          v_impl_name, r.identity_arguments, a.grantee_name);
      end if;
    end loop;

    v_volatility := case r.provolatile
      when 'i' then 'immutable'
      when 's' then 'stable'
      else 'volatile'
    end;

    if r.proretset then
      v_body := format(
        'begin if coalesce(auth.role(), '''') not in ('''', ''service_role'') and not public.vmp_is_active_session(auth.uid()) then return; end if; return query select * from public.%I(%s); end',
        v_impl_name, v_call_args);
    elsif r.result_type in ('json', 'jsonb') then
      v_body := format(
        'begin if coalesce(auth.role(), '''') not in ('''', ''service_role'') and not public.vmp_is_active_session(auth.uid()) then return public.vmp_session_denial(); end if; return public.%I(%s); end',
        v_impl_name, v_call_args);
    else
      v_body := format(
        'begin if coalesce(auth.role(), '''') not in ('''', ''service_role'') and not public.vmp_is_active_session(auth.uid()) then raise exception using errcode = ''42501'', message = public.vmp_session_denial() ->> ''error_code''; end if; return public.%I(%s); end',
        v_impl_name, v_call_args);
    end if;

    execute format(
      'create function public.%I(%s) returns %s language plpgsql %s security definer set search_path = public, pg_temp as $wrapper$ %s $wrapper$',
      r.proname, r.full_arguments, r.result_type, v_volatility, v_body);

    execute format('alter function public.%I(%s) owner to %I',
      r.proname, r.identity_arguments, r.owner_name);

    select p.oid into strict v_wrapper_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = r.proname
      and pg_get_function_identity_arguments(p.oid) = r.identity_arguments;

    -- Remove CREATE FUNCTION defaults/default-ACL grants, then replay every
    -- reviewed non-owner EXECUTE grant with its grant-option bit.
    for a in
      select distinct x.grantee, grantee_role.rolname as grantee_name
      from pg_proc wrapper
      cross join lateral aclexplode(coalesce(wrapper.proacl,
        acldefault('f', wrapper.proowner))) x
      left join pg_roles grantee_role on grantee_role.oid = x.grantee
      where wrapper.oid = v_wrapper_oid and x.grantee <> wrapper.proowner
        and x.privilege_type = 'EXECUTE'
    loop
      if a.grantee = 0 then
        execute format('revoke execute on function public.%I(%s) from public',
          r.proname, r.identity_arguments);
      elsif a.grantee_name is null then
        raise exception using errcode = 'undefined_object',
          message = 'PUBLIC_WRAPPER_GRANTEE_MISSING';
      else
        execute format('revoke execute on function public.%I(%s) from %I',
          r.proname, r.identity_arguments, a.grantee_name);
      end if;
    end loop;

    for a in
      select x.grantee, grantee_role.rolname as grantee_name, x.is_grantable
      from aclexplode(coalesce(r.proacl, acldefault('f', r.proowner))) x
      left join pg_roles grantee_role on grantee_role.oid = x.grantee
      where x.grantee <> r.proowner and x.privilege_type = 'EXECUTE'
      order by x.grantee
    loop
      if a.grantee = 0 then
        execute format('grant execute on function public.%I(%s) to public%s',
          r.proname, r.identity_arguments,
          case when a.is_grantable then ' with grant option' else '' end);
      elsif a.grantee_name is null then
        raise exception using errcode = 'undefined_object',
          message = 'PUBLIC_WRAPPER_GRANTEE_MISSING';
      else
        execute format('grant execute on function public.%I(%s) to %I%s',
          r.proname, r.identity_arguments, a.grantee_name,
          case when a.is_grantable then ' with grant option' else '' end);
      end if;
    end loop;

    select coalesce(jsonb_agg(jsonb_build_array(
             x.grantee, x.privilege_type, x.is_grantable)
             order by x.grantee, x.privilege_type, x.is_grantable), '[]'::jsonb)
      into v_actual_acl
    from pg_proc wrapper
    cross join lateral aclexplode(coalesce(wrapper.proacl,
      acldefault('f', wrapper.proowner))) x
    where wrapper.oid = v_wrapper_oid and x.grantee <> wrapper.proowner
      and x.privilege_type = 'EXECUTE';

    if v_actual_acl is distinct from v_expected_acl
       or (select proowner from pg_proc where oid = v_wrapper_oid) <> r.proowner
       or (select proowner from pg_proc where oid = r.oid) <> r.proowner
       or exists (
         select 1 from pg_proc hidden
         cross join lateral aclexplode(coalesce(hidden.proacl,
           acldefault('f', hidden.proowner))) x
         where hidden.oid = r.oid and x.grantee <> hidden.proowner
           and x.privilege_type = 'EXECUTE'
       ) then
      raise exception using errcode = 'check_violation',
        message = 'WRAPPER_OWNER_OR_ACL_NOT_PRESERVED';
    end if;
  end loop;
end
$guarded_wrappers$;

create or replace function public.rpc_delete_performer(p_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $function$
  select case
    when coalesce(auth.role(), '') = 'service_role'
      or public.vmp_current_session_is_active() then jsonb_build_object(
        'ok', false,
        'error_code', 'LEGACY_RPC_DISABLED',
        'error', 'Đường xóa người thực hiện cũ đã ngừng; hãy ngừng hoạt động hồ sơ qua danh bạ phân quyền'
      )
    else public.vmp_session_denial()
  end
$function$;

create or replace function public.rpc_set_item_performer(
  p_validation_code text,
  p_performer_name text
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $function$
  select case
    when coalesce(auth.role(), '') = 'service_role'
      or public.vmp_current_session_is_active() then jsonb_build_object(
        'ok', false,
        'error_code', 'PERSON_ID_REQUIRED',
        'error', 'Đường gán theo tên đã ngừng hỗ trợ; phải chọn người bằng person_id'
      )
    else public.vmp_session_denial()
  end
$function$;

create or replace function public.rpc_upsert_performer(p_id uuid, p_patch jsonb)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $function$
  select case
    when coalesce(auth.role(), '') = 'service_role'
      or public.vmp_current_session_is_active() then jsonb_build_object(
        'ok', false,
        'error_code', 'LEGACY_RPC_DISABLED',
        'error', 'Đường lưu người thực hiện cũ đã ngừng; dùng danh bạ phân quyền có reason và version'
      )
    else public.vmp_session_denial()
  end
$function$;

do $postconditions$
declare
  v_count integer;
  v_implicit_array text;
  v_explicit_array text;
  v_implicit_csv text;
  v_explicit_csv text;
begin
  select count(*),
         md5(string_agg(concat_ws('|', business_role, screen_id,
           can_view, data_scope, actions::text), E'\n'
           order by business_role, screen_id)),
         md5(string_agg(concat_ws('|', business_role, screen_id,
           can_view::text, data_scope, actions::text), E'\n'
           order by business_role, screen_id)),
         md5(string_agg(concat_ws('|', business_role, screen_id,
           can_view, data_scope, array_to_string(actions, ',')), E'\n'
           order by business_role, screen_id)),
         md5(string_agg(concat_ws('|', business_role, screen_id,
           can_view::text, data_scope, array_to_string(actions, ',')), E'\n'
           order by business_role, screen_id))
    into v_count, v_implicit_array, v_explicit_array,
         v_implicit_csv, v_explicit_csv
  from public.vmp_screen_permissions;

  if v_count <> 85
     or v_implicit_array <> 'e6fdb0cc192a2ba344df02db4a5112c6'
     or v_explicit_array <> '9be55626a34edb5123501d2b856d3480'
     or v_implicit_csv <> '59feb29d5614356f97325d71ade3599e'
     or v_explicit_csv <> '3586cad04d5900656b2b7f41ecb47e73'
     or exists (
       select 1 from public.vmp_screen_permissions
       group by business_role having count(*) <> 17
     )
     or (select count(distinct business_role)
         from public.vmp_screen_permissions) <> 5 then
    raise exception using errcode = 'check_violation',
      message = 'POSTCONDITION_SCREEN_MATRIX_INVALID';
  end if;

  if public.screen_access_mode() is distinct from 'enforced'
     or public.item_permissions_mode() is distinct from 'preview' then
    raise exception using errcode = 'check_violation',
      message = 'POSTCONDITION_PERMISSION_MODES_CHANGED';
  end if;

  if has_table_privilege('authenticated', 'public.profiles', 'INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'public.profiles', 'INSERT,UPDATE,DELETE')
     or has_any_column_privilege('authenticated', 'public.profiles', 'UPDATE')
     or has_any_column_privilege('anon', 'public.profiles', 'UPDATE')
     or exists (
       select 1
       from pg_class c
       cross join lateral aclexplode(coalesce(c.relacl,
         acldefault('r', c.relowner))) x
       where c.oid = 'public.profiles'::regclass and x.grantee = 0
         and x.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
     )
     or exists (
       select 1
       from pg_attribute a
       cross join lateral aclexplode(a.attacl) x
       where a.attrelid = 'public.profiles'::regclass and a.attnum > 0
         and not a.attisdropped and x.grantee = 0
         and x.privilege_type = 'UPDATE'
     )
     or has_table_privilege('authenticated', 'public.audit_logs', 'SELECT') then
    raise exception using errcode = 'check_violation',
      message = 'POSTCONDITION_DIRECT_PRIVILEGE_REMAINS';
  end if;

  if exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = any(array[
        'audit_logs', 'data_quality_issues', 'vmp_alert_recipients',
        'vmp_assignment_matrix', 'vmp_chat_loi_cho', 'vmp_email_cho_phep',
        'vmp_performers', 'vmp_plan_items', 'vmp_source_objects',
        'vmp_source_rows', 'vmp_staff_emails'
      ]::text[])
      and exists (
        select 1 from unnest(p.roles) effective_role(role_name)
        where case
          when effective_role.role_name = 'public' then true
          else pg_has_role('authenticated', effective_role.role_name, 'USAGE')
        end
      )
      and ((p.cmd in ('SELECT','UPDATE','DELETE','ALL')
            and coalesce(p.qual, '')
              not like '%vmp_current_session_is_active%')
        or (p.cmd in ('INSERT','UPDATE','ALL')
            and coalesce(p.with_check, '')
              not like '%vmp_current_session_is_active%'))
  ) then
    raise exception using errcode = 'check_violation',
      message = 'POSTCONDITION_DIRECT_POLICY_UNGUARDED';
  end if;

  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like '%\_\_five\_role\_impl\_20260824' escape '\';
  if v_count <> 54 or exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join pg_proc wrapper
      on wrapper.pronamespace = p.pronamespace
     and wrapper.proname = left(p.proname,
       -length('__five_role_impl_20260824'))
     and wrapper.proargtypes = p.proargtypes
    where n.nspname = 'public'
      and p.proname like '%\_\_five\_role\_impl\_20260824' escape '\'
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('service_role', p.oid, 'EXECUTE')
        or wrapper.oid is null
        or wrapper.proowner <> p.proowner
        or exists (
          select 1
          from pg_depend dependency
          where dependency.refclassid = 'pg_proc'::regclass
            and dependency.refobjid = p.oid
        )
        or exists (
          select 1
          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.grantee <> p.proowner and a.privilege_type = 'EXECUTE'
        ))
  ) or exists (
    select 1
    from jsonb_to_recordset(current_setting(
      'vmp.five_role_source_rpc_inventory')::jsonb)
      as i(name text, identity text, classification text)
    join pg_proc p on p.oid = i.identity::regprocedure
    where i.classification = 'service_only'
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('service_role', p.oid, 'EXECUTE')
        or exists (
          select 1
          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.grantee <> p.proowner and a.privilege_type = 'EXECUTE'
        ))
  ) then
    raise exception using errcode = 'check_violation',
      message = 'POSTCONDITION_GUARDED_IMPLEMENTATION_EXPOSED';
  end if;
end
$postconditions$;

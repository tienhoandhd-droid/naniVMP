\set ON_ERROR_STOP on

begin read only;

do $checks$
declare
  v_implicit_array text;
  v_explicit_array text;
  v_implicit_csv text;
  v_explicit_csv text;
  v_count integer;
begin
  if public.screen_access_mode() is distinct from 'enforced'
     or public.item_permissions_mode() is distinct from 'preview' then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_PERMISSION_MODES';
  end if;
  raise notice 'PASS CHECK_PERMISSION_MODES';

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
     or (select count(distinct business_role)
         from public.vmp_screen_permissions) <> 5
     or exists (
       select 1 from public.vmp_screen_permissions
       group by business_role having count(*) <> 17
     ) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_FIVE_ROLE_MATRIX';
  end if;
  raise notice 'PASS CHECK_FIVE_ROLE_MATRIX';

  if to_regprocedure('public.vmp_is_active_session(uuid)') is null
     or to_regprocedure('public.vmp_current_session_is_active()') is null
     or to_regprocedure('public.vmp_business_role(uuid)') is null
     or to_regprocedure('public.auth_user_role()') is null
     or to_regprocedure('public.rpc_my_ui_access()') is null then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_ACTIVE_SESSION_CONTRACT';
  end if;
  raise notice 'PASS CHECK_ACTIVE_SESSION_CONTRACT';

  if has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.audit_logs', 'SELECT')
     or exists (
       select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = 'profiles'
         and p.policyname = 'profiles_update'
     )
     or not exists (
       select 1
       from pg_trigger t
       where t.tgrelid = 'public.profiles'::regclass
         and t.tgname = 'vmp_profiles_authority_guard'
         and not t.tgisinternal
     ) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_PROFILE_AND_AUDIT_PRIVILEGES';
  end if;
  raise notice 'PASS CHECK_PROFILE_AND_AUDIT_PRIVILEGES';

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
      and 'authenticated' = any(p.roles)
      and ((p.cmd in ('SELECT','UPDATE','DELETE','ALL')
            and coalesce(p.qual, '') not like '%vmp_current_session_is_active%')
        or (p.cmd in ('INSERT','UPDATE','ALL')
            and coalesce(p.with_check, '') not like '%vmp_current_session_is_active%'))
  ) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_DIRECT_TABLE_RLS_GUARDS';
  end if;
  raise notice 'PASS CHECK_DIRECT_TABLE_RLS_GUARDS';

  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like '%\_\_five\_role\_impl\_20260824' escape '\';
  if v_count <> 31 or exists (
    select 1
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like '%\_\_five\_role\_impl\_20260824' escape '\'
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or exists (
          select 1
          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.grantee = 0 and a.privilege_type = 'EXECUTE'
        ))
  ) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_GUARDED_RPC_IMPLEMENTATIONS';
  end if;
  raise notice 'PASS CHECK_GUARDED_RPC_IMPLEMENTATIONS';

  if has_function_privilege('public',
       'public.rpc_catalog_history(jsonb,integer,integer)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.rpc_catalog_history(jsonb,integer,integer)', 'EXECUTE')
     or not has_function_privilege('authenticated',
       'public.rpc_catalog_history(jsonb,integer,integer)', 'EXECUTE')
     or has_function_privilege('public',
       'public.rpc_catalog_history_detail(uuid)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.rpc_catalog_history_detail(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated',
       'public.rpc_catalog_history_detail(uuid)', 'EXECUTE') then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_CATALOG_HISTORY_ACL';
  end if;
  raise notice 'PASS CHECK_CATALOG_HISTORY_ACL';

  if (select count(*) from public.profiles
      where role::text = 'admin' and coalesce(is_active, true)) < 1 then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_ACTIVE_ADMIN_REMAINS';
  end if;
  raise notice 'PASS CHECK_ACTIVE_ADMIN_REMAINS';

  if (select count(*)
      from public.audit_logs a
      join public.profiles p on p.id::text = a.record_id
      where a.table_name = 'profiles'
        and a.source = 'five_role_hardening'
        and a.change_reason =
          'Loại Viewer và tài khoản test theo phê duyệt 2026-08-24'
        and not coalesce(p.is_active, true)) <> 7 then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_EXACT_SEVEN_DISABLED_AUDITS';
  end if;
  raise notice 'PASS CHECK_EXACT_SEVEN_DISABLED_AUDITS';
end
$checks$;

rollback;

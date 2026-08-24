\set ON_ERROR_STOP on

\if :{?account_ids}
\else
begin read only;
do $$
begin
  raise exception using errcode = '22023',
    message = 'CHECK_ACCOUNT_IDS_PSQL_VARIABLE_REQUIRED';
end
$$;
\endif

\if :{?five_role_local_test}
  \if :{?five_role_local_test_contract}
  \else
  begin read only;
  do $$
  begin
    raise exception using errcode = '42501',
      message = 'CHECK_LOCAL_TEST_SHELL_CONTRACT_REQUIRED';
  end
  $$;
  \endif
\endif

begin read only;

\o /dev/null
select set_config('vmp.five_role_check_account_ids', :'account_ids', true);
\if :{?five_role_local_test}
select set_config('vmp.five_role_check_expected_digest',
  '1f8213f705d26bd656781baa08cb1f42', true);
select set_config('vmp.five_role_check_local_test', 'on', true);
select set_config('vmp.five_role_local_test_contract',
  :'five_role_local_test_contract', true);
\else
select set_config('vmp.five_role_check_expected_digest',
  '2c09501166eb45c3676451084230340e', true);
select set_config('vmp.five_role_check_local_test', 'off', true);
\endif
\o

do $checks$
declare
  v_implicit_array text;
  v_explicit_array text;
  v_implicit_csv text;
  v_explicit_csv text;
  v_count integer;
  v_distinct integer;
  v_digest text;
  v_expected_digest text := current_setting(
    'vmp.five_role_check_expected_digest');
  v_local boolean := current_setting(
    'vmp.five_role_check_local_test') = 'on';
  v_preflight jsonb;
  v_warning_count integer;
begin
  if v_local and (
       current_setting('vmp.five_role_local_test_contract', true)
         is distinct from 'loopback-54322-postgres'
       or current_database() <> 'postgres'
       or current_user <> 'postgres'
       or not exists (
         select 1 from public.system_config
         where key = 'five_role_test_fixture' and value = 'true'::jsonb
       )
     ) then
    raise exception using errcode = '42501',
      message = 'CHECK_LOCAL_TEST_DATABASE_CONTRACT_MISMATCH';
  end if;

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

  if has_table_privilege('authenticated', 'public.profiles',
       'INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'public.profiles',
       'INSERT,UPDATE,DELETE')
     or has_any_column_privilege('authenticated', 'public.profiles', 'UPDATE')
     or has_any_column_privilege('anon', 'public.profiles', 'UPDATE')
     or exists (
       select 1 from pg_class c
       cross join lateral aclexplode(coalesce(c.relacl,
         acldefault('r', c.relowner))) x
       where c.oid = 'public.profiles'::regclass and x.grantee = 0
         and x.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
     )
     or exists (
       select 1 from pg_attribute a
       cross join lateral aclexplode(a.attacl) x
       where a.attrelid = 'public.profiles'::regclass and a.attnum > 0
         and not a.attisdropped and x.grantee = 0
         and x.privilege_type = 'UPDATE'
     )
     or has_table_privilege('authenticated', 'public.audit_logs', 'SELECT')
     or has_table_privilege('anon', 'public.audit_logs', 'SELECT')
     or exists (
       select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = 'profiles'
         and p.policyname = 'profiles_update'
     )
     or not exists (
       select 1 from pg_trigger t
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
      and exists (
        select 1 from unnest(p.roles) effective_role(role_name)
        where case
          when effective_role.role_name = 'public' then true
          else pg_has_role('authenticated', effective_role.role_name, 'USAGE')
        end
      )
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
  if v_count <> 53 or exists (
    select 1
    from pg_proc hidden
    join pg_namespace n on n.oid = hidden.pronamespace
    left join pg_proc wrapper
      on wrapper.pronamespace = hidden.pronamespace
     and wrapper.proname = left(hidden.proname,
       -length('__five_role_impl_20260824'))
     and wrapper.proargtypes = hidden.proargtypes
    where n.nspname = 'public'
      and hidden.proname like '%\_\_five\_role\_impl\_20260824' escape '\'
      and (wrapper.oid is null
        or wrapper.proowner <> hidden.proowner
        or has_function_privilege('authenticated', hidden.oid, 'EXECUTE')
        or has_function_privilege('anon', hidden.oid, 'EXECUTE')
        or has_function_privilege('service_role', hidden.oid, 'EXECUTE')
        or exists (
          select 1
          from pg_depend dependency
          where dependency.refclassid = 'pg_proc'::regclass
            and dependency.refobjid = hidden.oid
        )
        or exists (
          select 1
          from aclexplode(coalesce(hidden.proacl,
            acldefault('f', hidden.proowner))) x
          where x.grantee <> hidden.proowner
            and x.privilege_type = 'EXECUTE'
        ))
  ) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_GUARDED_RPC_IMPLEMENTATIONS';
  end if;
  raise notice 'PASS CHECK_GUARDED_RPC_IMPLEMENTATIONS';

  with inventory as (
    select p.oid::regprocedure::text identity,
           pg_get_function_result(p.oid) result_type,
           l.lanname language, p.prosecdef,
           coalesce(array_to_string(p.proconfig, ','), '') settings,
           md5(pg_get_functiondef(p.oid)) definition_hash,
           r.rolname owner,
           coalesce(array_to_string(p.proacl, ','), '') acl,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_exec,
           has_function_privilege('anon', p.oid, 'EXECUTE') anon_exec,
           has_function_privilege('public', p.oid, 'EXECUTE') public_exec
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    join pg_roles r on r.oid = p.proowner
    where n.nspname = 'public'
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('public', p.oid, 'EXECUTE'))
  )
  select count(*), md5(string_agg(concat_ws('|', identity, result_type,
           language, prosecdef, settings, definition_hash, owner, acl,
           auth_exec, anon_exec, public_exec), E'\n' order by identity))
    into v_count, v_digest
  from inventory;
  if v_count <> 64
     or v_digest <> 'c6f8edd60dfc7fb0cb049cac224729cc'
     or exists (
       select 1
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('public', p.oid, 'EXECUTE'))
     ) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_BROWSER_FUNCTION_CONTRACT';
  end if;
  raise notice 'PASS CHECK_BROWSER_FUNCTION_CONTRACT';

  if exists (
    select 1
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'rpc\_%' escape '\'
      and p.proname not like '%\_\_five\_role\_impl\_20260824' escape '\'
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and p.oid not in (
        'public.rpc_lien_ket_tai_khoan(uuid,uuid)'::regprocedure,
        'public.rpc_set_item_performer(text,text)'::regprocedure
      )
      and (not has_function_privilege('service_role', p.oid, 'EXECUTE')
        or exists (
          select 1
          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
          where x.grantee <> p.proowner
            and x.grantee <> 'service_role'::regrole::oid
            and x.privilege_type = 'EXECUTE'
        ))
  ) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_OMITTED_AUTOMATION_RPC_ACL';
  end if;
  raise notice 'PASS CHECK_OMITTED_AUTOMATION_RPC_ACL';

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  select public.rpc_item_permission_preflight() into v_preflight;
  with codes as (
    select e ->> 'code' code, count(*) n
    from jsonb_array_elements(v_preflight -> 'blocking_errors') e
    group by 1
  )
  select coalesce(sum(n), 0)::integer,
         md5(string_agg(code || '=' || n, E'\n' order by code))
    into v_count, v_digest
  from codes;
  v_warning_count := jsonb_array_length(v_preflight -> 'warnings');
  if (v_local and (v_count <> 16
       or v_digest <> '51655dff70de3ba821367c8f3784d078'
       or v_warning_count <> 8))
     or (not v_local and (v_count <> 481
       or v_digest <> 'a987324be3986521ed2d26a183c4c318'
       or v_warning_count <> 13)) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_ITEM_PERMISSION_BLOCKER_CONTRACT';
  end if;
  raise notice 'PASS CHECK_ITEM_PERMISSION_BLOCKER_CONTRACT';

  if exists (
    select 1
    from (values
      ('public.rpc_lien_ket_tai_khoan(uuid,uuid)'::regprocedure),
      ('public.rpc_set_item_performer(text,text)'::regprocedure)
    ) service_boundary(function_oid)
    join pg_proc p on p.oid = service_boundary.function_oid
    where has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('service_role', p.oid, 'EXECUTE')
       or exists (
         select 1
         from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
         where x.grantee <> p.proowner and x.privilege_type = 'EXECUTE'
       )
  ) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_SERVICE_ONLY_RPC_ACL';
  end if;
  raise notice 'PASS CHECK_SERVICE_ONLY_RPC_ACL';

  if has_function_privilege('public',
       'public.rpc_catalog_history(jsonb,integer,integer)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.rpc_catalog_history(jsonb,integer,integer)', 'EXECUTE')
     or not has_function_privilege('authenticated',
       'public.rpc_catalog_history(jsonb,integer,integer)', 'EXECUTE')
     or not has_function_privilege('service_role',
       'public.rpc_catalog_history(jsonb,integer,integer)', 'EXECUTE')
     or has_function_privilege('public',
       'public.rpc_catalog_history_detail(uuid)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.rpc_catalog_history_detail(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated',
       'public.rpc_catalog_history_detail(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role',
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

  with manifest as (
    select btrim(value)::uuid id
    from regexp_split_to_table(current_setting(
      'vmp.five_role_check_account_ids'), ',') value
  )
  select count(*), count(distinct id),
         md5(string_agg(id::text, ',' order by id))
    into v_count, v_distinct, v_digest
  from manifest;

  if v_count <> 7 or v_distinct <> 7 or v_digest <> v_expected_digest then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_ACCOUNT_MANIFEST_DIGEST';
  end if;

  if exists (
    with manifest as (
      select btrim(value)::uuid id
      from regexp_split_to_table(current_setting(
        'vmp.five_role_check_account_ids'), ',') value
    )
    select 1
    from manifest m
    left join public.profiles p on p.id = m.id
    where p.id is null or coalesce(p.is_active, true)
  ) or (select count(*)
        from public.profiles p
        where p.id in (
          select btrim(value)::uuid
          from regexp_split_to_table(current_setting(
            'vmp.five_role_check_account_ids'), ',') value
        )
          and p.role::text = 'viewer') <> 3
     or (select count(*)
         from public.profiles p
         where p.id in (
           select btrim(value)::uuid
           from regexp_split_to_table(current_setting(
             'vmp.five_role_check_account_ids'), ',') value
         )
           and p.role::text = 'department_user') <> 3
     or (select count(*)
         from public.profiles p
         where p.id in (
           select btrim(value)::uuid
           from regexp_split_to_table(current_setting(
             'vmp.five_role_check_account_ids'), ',') value
         )
           and p.role::text = 'qa_manager') <> 1 then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_EXACT_SEVEN_DISABLED_TARGETS';
  end if;

  if exists (
    with manifest as (
      select btrim(value)::uuid id
      from regexp_split_to_table(current_setting(
        'vmp.five_role_check_account_ids'), ',') value
    )
    select 1
    from manifest m
    left join lateral (
      select count(*) audit_count
      from public.audit_logs a
      where a.table_name = 'profiles'
        and a.record_id = m.id::text
        and a.source = 'five_role_hardening'
        and a.change_reason =
          'Loại Viewer và tài khoản test theo phê duyệt 2026-08-24'
    ) matching_audit on true
    where matching_audit.audit_count <> 1
  ) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_EXACT_ONE_AUDIT_PER_TARGET';
  end if;
  raise notice 'PASS CHECK_EXACT_SEVEN_DISABLED_AUDITS';
end
$checks$;

rollback;

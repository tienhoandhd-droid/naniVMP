/* Final-state attestation for the manually deployed item-permission repair.
 * This file is read-only. It observes the intentionally unreconciled migration
 * ledger; it never inserts or repairs ledger rows.
 */

do $guard$
begin
  if to_regprocedure('public.item_permissions_mode()') is null
      or to_regprocedure('public.vmp_manager_principal(uuid)') is null
      or to_regprocedure(
        'public.rpc_set_item_performer_by_id(text,uuid,text)'
      ) is null
      or to_regprocedure(
        'public.rpc_upsert_source_object(text,text,jsonb)'
      ) is null
      or to_regprocedure(
        'public.vmp_upsert_source_object_before_person_id(text,text,jsonb)'
      ) is null
      or to_regclass('public.vmp_performers') is null
      or to_regclass('public.vmp_source_objects') is null
      or to_regclass('public.vmp_plan_items') is null
      or to_regclass('public.vmp_item_assignments') is null
      or to_regclass('public.vmp_scope_factories') is null
      or to_regclass('public.vmp_scope_areas') is null
      or to_regclass('public.vmp_scope_lines') is null
      or to_regclass('public.vmp_email_cho_phep') is null
      or to_regclass('public.audit_logs') is null
      or to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'ITEM_PERMISSION_DEPLOY_STATE_UNSUPPORTED: thiếu schema bắt buộc';
  end if;
end
$guard$;

select 'ITEM_PERMISSION_DEPLOY_MODE|' || public.item_permissions_mode();

select format(
  'ITEM_PERMISSION_DEPLOY_BUSINESS|%s|%s|%s',
  relation_name,
  row_count,
  digest
)
from (
  select
    'vmp_item_assignments'::text as relation_name,
    count(*) as row_count,
    md5(coalesce(string_agg(
      md5(to_jsonb(row_data)::text), '' order by md5(to_jsonb(row_data)::text)
    ), '')) as digest
  from public.vmp_item_assignments row_data
  union all
  select
    'vmp_performers',
    count(*),
    md5(coalesce(string_agg(
      md5(to_jsonb(row_data)::text), '' order by md5(to_jsonb(row_data)::text)
    ), ''))
  from public.vmp_performers row_data
  union all
  select
    'vmp_plan_items',
    count(*),
    md5(coalesce(string_agg(
      md5(to_jsonb(row_data)::text), '' order by md5(to_jsonb(row_data)::text)
    ), ''))
  from public.vmp_plan_items row_data
  union all
  select
    'vmp_source_objects',
    count(*),
    md5(coalesce(string_agg(
      md5(to_jsonb(row_data)::text), '' order by md5(to_jsonb(row_data)::text)
    ), ''))
  from public.vmp_source_objects row_data
) business
order by relation_name;

select format(
  'ITEM_PERMISSION_DEPLOY_FIXTURES|%s',
  (
    select count(*) from auth.users account
    where account.email like 'source-writer-%@example.test'
       or account.email like 'e2e-task4-%@example.test'
  ) + (
    select count(*) from public.vmp_email_cho_phep allowed
    where allowed.email like 'source-writer-%@example.test'
       or allowed.email like 'e2e-%@example.test'
  ) + (
    select count(*) from public.vmp_performers person
    where person.performer_name like 'Source Writer %'
       or person.performer_name like 'E2E %'
       or person.employee_code like 'E2E-%'
       or person.email like 'source-writer-%@example.test'
       or person.email like 'e2e-%@example.test'
  ) + (
    select count(*) from public.vmp_item_assignments assignment
    where assignment.staff_name like 'E2E %'
       or assignment.source_text like 'E2E %'
       or assignment.change_reason like 'Fixture %'
  ) + (
    select count(*) from public.vmp_scope_factories factory
    where factory.code like 'E2E-%' or factory.name like 'E2E %'
  ) + (
    select count(*) from public.vmp_scope_areas area
    where area.code like 'E2E-%' or area.name like 'E2E %'
  ) + (
    select count(*) from public.vmp_scope_lines line
    where line.code like 'E2E-%' or line.name like 'E2E %'
  ) + (
    select count(*) from public.vmp_source_objects source
    where source.owner_name like 'E2E %'
       or source.support_name like 'E2E %'
       or source.note like 'AUTH-PROBE-%'
  ) + (
    select count(*) from public.vmp_plan_items item
    where item.owner_name like 'E2E %'
       or item.secondary_owner like 'E2E %'
  ) + (
    select count(*) from public.audit_logs audit
    where audit.change_reason like 'Canonical QA manager % probe'
       or audit.change_reason like 'Hybrid manager % forbidden'
       or audit.change_reason like 'Service role writer probe'
  )
);

select format(
  'ITEM_PERMISSION_DEPLOY_LEDGER|%s|%s|111200=%s',
  count(*),
  coalesce(max(version), 'none'),
  count(*) filter (where version = '20260811120000')
)
from supabase_migrations.schema_migrations;

do $assert_final_state$
declare
  v_set_writer regprocedure :=
    'public.rpc_set_item_performer_by_id(text,uuid,text)'::regprocedure;
  v_source_writer regprocedure :=
    'public.rpc_upsert_source_object(text,text,jsonb)'::regprocedure;
  v_predecessor regprocedure :=
    'public.vmp_upsert_source_object_before_person_id(text,text,jsonb)'::regprocedure;
  v_principal_helper regprocedure :=
    'public.vmp_manager_principal(uuid)'::regprocedure;
  v_set_definition text;
  v_source_definition text;
  v_predecessor_definition text;
  v_fixture_count bigint;
begin
  if public.item_permissions_mode() is distinct from 'preview' then
    raise exception 'ITEM_PERMISSION_DEPLOY_STATE_INVALID: mode phải là preview';
  end if;

  if (
      select count(*)
      from pg_proc procedure
      where procedure.pronamespace = 'public'::regnamespace
        and procedure.proname = 'rpc_set_item_performer_by_id'
    ) <> 1 or (
      select count(*)
      from pg_proc procedure
      where procedure.pronamespace = 'public'::regnamespace
        and procedure.proname = 'rpc_upsert_source_object'
    ) <> 1 then
    raise exception
      'ITEM_PERMISSION_DEPLOY_STATE_INVALID: writer thiếu hoặc còn overload';
  end if;

  if exists (
    select 1
    from pg_proc procedure
    where procedure.oid in (
      v_set_writer::oid, v_source_writer::oid, v_predecessor::oid
    ) and (
      not procedure.prosecdef
      or not coalesce(procedure.proconfig, '{}'::text[])
        @> array['search_path=public, pg_temp']
    )
  ) then
    raise exception
      'ITEM_PERMISSION_DEPLOY_STATE_INVALID: SECURITY DEFINER/search_path sai';
  end if;

  if exists (
    select 1
    from pg_proc procedure
    where procedure.oid in (
      v_set_writer::oid, v_source_writer::oid, v_predecessor::oid
    ) and has_function_privilege(
      procedure.proowner, v_principal_helper::oid, 'EXECUTE'
    ) is distinct from true
  ) then
    raise exception
      'ITEM_PERMISSION_DEPLOY_STATE_INVALID: writer owner không gọi được principal';
  end if;

  if has_function_privilege(
      'anon', v_set_writer, 'EXECUTE'
    ) or has_function_privilege(
      'anon', v_source_writer, 'EXECUTE'
    ) or has_function_privilege(
      'authenticated', v_set_writer, 'EXECUTE'
    ) is distinct from true or has_function_privilege(
      'authenticated', v_source_writer, 'EXECUTE'
    ) is distinct from true or has_function_privilege(
      'service_role', v_set_writer, 'EXECUTE'
    ) is distinct from true or has_function_privilege(
      'service_role', v_source_writer, 'EXECUTE'
    ) is distinct from true or has_function_privilege(
      'anon', v_predecessor, 'EXECUTE'
    ) or has_function_privilege(
      'authenticated', v_predecessor, 'EXECUTE'
    ) or has_function_privilege(
      'service_role', v_predecessor, 'EXECUTE'
    ) then
    raise exception 'ITEM_PERMISSION_DEPLOY_STATE_INVALID: runtime ACL sai';
  end if;

  if exists (
    select 1
    from pg_proc procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) privilege
    where procedure.oid in (v_set_writer::oid, v_source_writer::oid)
      and privilege.privilege_type = 'EXECUTE'
      and privilege.grantee not in (
        procedure.proowner,
        'authenticated'::regrole::oid,
        'service_role'::regrole::oid
      )
  ) or exists (
    select 1
    from pg_proc procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) privilege
    where procedure.oid = v_predecessor::oid
      and privilege.privilege_type = 'EXECUTE'
      and privilege.grantee <> procedure.proowner
  ) then
    raise exception 'ITEM_PERMISSION_DEPLOY_STATE_INVALID: raw ACL ngoài allowlist';
  end if;

  if (
      select procedure.proowner
      from pg_proc procedure
      where procedure.oid = v_source_writer::oid
    ) is distinct from (
      select procedure.proowner
      from pg_proc procedure
      where procedure.oid = v_predecessor::oid
    ) then
    raise exception
      'ITEM_PERMISSION_DEPLOY_STATE_INVALID: source wrapper/predecessor khác owner';
  end if;

  select pg_get_functiondef(v_set_writer) into v_set_definition;
  select pg_get_functiondef(v_source_writer) into v_source_definition;
  select pg_get_functiondef(v_predecessor) into v_predecessor_definition;
  if position(
      'vmp_manager_principal(auth.uid())' in v_set_definition
    ) = 0 or position(
      'vmp_manager_principal(auth.uid())' in v_source_definition
    ) = 0 or position(
      'vmp_manager_principal(auth.uid())' in v_predecessor_definition
    ) = 0
      or position('auth.role()' in v_set_definition) = 0
      or position('service_role' in v_set_definition) = 0
      or position('auth.role()' in v_source_definition) = 0
      or position('service_role' in v_source_definition) = 0
      or position('auth.role()' in v_predecessor_definition) = 0
      or position('service_role' in v_predecessor_definition) = 0
      or position('from public.profiles' in lower(v_set_definition)) > 0
      or position('from public.profiles' in lower(v_source_definition)) > 0
      or position('from public.profiles' in lower(v_predecessor_definition)) > 0 then
    raise exception
      'ITEM_PERMISSION_DEPLOY_STATE_INVALID: definition chưa canonical/service';
  end if;

  select (
    select count(*) from auth.users account
    where account.email like 'source-writer-%@example.test'
       or account.email like 'e2e-task4-%@example.test'
  ) + (
    select count(*) from public.vmp_email_cho_phep allowed
    where allowed.email like 'source-writer-%@example.test'
       or allowed.email like 'e2e-%@example.test'
  ) + (
    select count(*) from public.vmp_performers person
    where person.performer_name like 'Source Writer %'
       or person.performer_name like 'E2E %'
       or person.employee_code like 'E2E-%'
       or person.email like 'source-writer-%@example.test'
       or person.email like 'e2e-%@example.test'
  ) + (
    select count(*) from public.vmp_item_assignments assignment
    where assignment.staff_name like 'E2E %'
       or assignment.source_text like 'E2E %'
       or assignment.change_reason like 'Fixture %'
  ) + (
    select count(*) from public.vmp_scope_factories factory
    where factory.code like 'E2E-%' or factory.name like 'E2E %'
  ) + (
    select count(*) from public.vmp_scope_areas area
    where area.code like 'E2E-%' or area.name like 'E2E %'
  ) + (
    select count(*) from public.vmp_scope_lines line
    where line.code like 'E2E-%' or line.name like 'E2E %'
  ) + (
    select count(*) from public.vmp_source_objects source
    where source.owner_name like 'E2E %'
       or source.support_name like 'E2E %'
       or source.note like 'AUTH-PROBE-%'
  ) + (
    select count(*) from public.vmp_plan_items item
    where item.owner_name like 'E2E %'
       or item.secondary_owner like 'E2E %'
  ) + (
    select count(*) from public.audit_logs audit
    where audit.change_reason like 'Canonical QA manager % probe'
       or audit.change_reason like 'Hybrid manager % forbidden'
       or audit.change_reason like 'Service role writer probe'
  ) into v_fixture_count;
  if v_fixture_count <> 0 then
    raise exception
      'ITEM_PERMISSION_DEPLOY_STATE_INVALID: còn % fixture rows', v_fixture_count;
  end if;
end
$assert_final_state$;

select 'ITEM_PERMISSION_DEPLOY_STATE_OK';

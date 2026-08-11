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

select format(
  'ITEM_PERMISSION_DEPLOY_FUNCTION|%s|%s',
  procedure.oid::regprocedure::text,
  md5(pg_get_functiondef(procedure.oid))
)
from pg_proc procedure
where procedure.oid in (
  'public.rpc_set_item_performer_by_id(text,uuid,text)'::regprocedure::oid,
  'public.rpc_upsert_source_object(text,text,jsonb)'::regprocedure::oid,
  'public.vmp_upsert_source_object_before_person_id(text,text,jsonb)'::regprocedure::oid
)
order by procedure.oid::regprocedure::text;

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
  v_fixture_count bigint;
  v_ledger_count bigint;
  v_ledger_max text;
  v_ledger_111200 bigint;
begin
  if public.item_permissions_mode() is distinct from 'preview' then
    raise exception 'ITEM_PERMISSION_DEPLOY_STATE_INVALID: mode phải là preview';
  end if;

  if exists (
    with actual(relation_name, row_count, digest) as (
      select
        'vmp_item_assignments'::text,
        count(*),
        md5(coalesce(string_agg(
          md5(to_jsonb(row_data)::text),
          '' order by md5(to_jsonb(row_data)::text)
        ), ''))
      from public.vmp_item_assignments row_data
      union all
      select
        'vmp_performers',
        count(*),
        md5(coalesce(string_agg(
          md5(to_jsonb(row_data)::text),
          '' order by md5(to_jsonb(row_data)::text)
        ), ''))
      from public.vmp_performers row_data
      union all
      select
        'vmp_plan_items',
        count(*),
        md5(coalesce(string_agg(
          md5(to_jsonb(row_data)::text),
          '' order by md5(to_jsonb(row_data)::text)
        ), ''))
      from public.vmp_plan_items row_data
      union all
      select
        'vmp_source_objects',
        count(*),
        md5(coalesce(string_agg(
          md5(to_jsonb(row_data)::text),
          '' order by md5(to_jsonb(row_data)::text)
        ), ''))
      from public.vmp_source_objects row_data
    ), expected(relation_name, row_count, digest) as (
      values
        (
          'vmp_item_assignments'::text,
          0::bigint,
          'd41d8cd98f00b204e9800998ecf8427e'::text
        ),
        (
          'vmp_performers',
          7::bigint,
          'ed7fb3f12ffeaef9c321df8629e0acd7'
        ),
        (
          'vmp_plan_items',
          461::bigint,
          '990abf39e2a2e576cea1d84c50f77b16'
        ),
        (
          'vmp_source_objects',
          272::bigint,
          'dee67ba61bbec4b6abe3df9dc2e548ec'
        )
    )
    select 1
    from (
      (select * from actual except select * from expected)
      union all
      (select * from expected except select * from actual)
    ) drift
  ) then
    raise exception
      'ITEM_PERMISSION_DEPLOY_STATE_INVALID: business baseline count/digest lệch';
  end if;

  select
    count(*),
    max(version),
    count(*) filter (where version = '20260811120000')
  into v_ledger_count, v_ledger_max, v_ledger_111200
  from supabase_migrations.schema_migrations;
  if v_ledger_count <> 7
      or v_ledger_max is distinct from '20260704110201'
      or v_ledger_111200 <> 0 then
    raise exception
      'ITEM_PERMISSION_DEPLOY_STATE_INVALID: ledger legacy baseline lệch';
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
    with actual(procedure_oid, grantee, privilege_type, is_grantable) as (
      select
        procedure.oid,
        privilege.grantee,
        privilege.privilege_type,
        privilege.is_grantable
      from pg_proc procedure
      cross join lateral aclexplode(
        coalesce(procedure.proacl, acldefault('f', procedure.proowner))
      ) privilege
      where procedure.oid in (
        v_set_writer::oid, v_source_writer::oid, v_predecessor::oid
      )
    ), expected(procedure_oid, grantee, privilege_type, is_grantable) as (
      select
        v_set_writer::oid,
        procedure.proowner,
        'EXECUTE'::text,
        false
      from pg_proc procedure where procedure.oid = v_set_writer::oid
      union all
      select v_set_writer::oid, 'authenticated'::regrole::oid, 'EXECUTE', false
      union all
      select v_set_writer::oid, 'service_role'::regrole::oid, 'EXECUTE', false
      union all
      select
        v_source_writer::oid,
        procedure.proowner,
        'EXECUTE',
        false
      from pg_proc procedure where procedure.oid = v_source_writer::oid
      union all
      select v_source_writer::oid, 'authenticated'::regrole::oid, 'EXECUTE', false
      union all
      select v_source_writer::oid, 'service_role'::regrole::oid, 'EXECUTE', false
      union all
      select
        v_predecessor::oid,
        procedure.proowner,
        'EXECUTE',
        false
      from pg_proc procedure where procedure.oid = v_predecessor::oid
    )
    select 1
    from (
      (select * from actual except select * from expected)
      union all
      (select * from expected except select * from actual)
    ) acl_delta
  ) then
    raise exception 'ITEM_PERMISSION_DEPLOY_STATE_INVALID: raw ACL không exact';
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

  if md5(pg_get_functiondef(v_set_writer))
      <> '42791e7ff398d5503c201db8cbd2edea'
      or md5(pg_get_functiondef(v_source_writer))
      <> '0baecd0a45f59f92b3ebe9afdc25b7bd'
      or md5(pg_get_functiondef(v_predecessor))
      <> '10d7c5237b3c7451a09eed95f6d50643' then
    raise exception
      'ITEM_PERMISSION_DEPLOY_STATE_INVALID: function definition hash lệch';
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

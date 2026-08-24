-- Shared by the production and sealed local-test entrypoints. The caller must
-- set vmp.five_role_expected_account_digest to one of the two hardcoded
-- entrypoint values before including this file.

create temporary table five_role_account_manifest (
  id uuid not null
) on commit drop;

insert into five_role_account_manifest (id)
select btrim(value)::uuid
from regexp_split_to_table(:'account_ids', ',') value;

do $manifest_preconditions$
declare
  v_count integer;
  v_distinct integer;
  v_digest text;
  v_expected_digest text := current_setting(
    'vmp.five_role_expected_account_digest');
  v_viewers integer;
  v_department_users integer;
  v_qa_managers integer;
  v_admins integer;
  v_inactive integer;
begin
  select count(*), count(distinct id),
         md5(string_agg(id::text, ',' order by id))
    into v_count, v_distinct, v_digest
  from five_role_account_manifest;

  if v_count <> 7 or v_distinct <> 7 then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_REQUIRES_SEVEN_UNIQUE_UUIDS';
  end if;

  if v_expected_digest not in (
    '2c09501166eb45c3676451084230340e',
    '1f8213f705d26bd656781baa08cb1f42'
  ) then
    raise exception using errcode = '42501',
      message = 'ACCOUNT_MANIFEST_ENTRYPOINT_DIGEST_INVALID';
  end if;

  if v_expected_digest = '1f8213f705d26bd656781baa08cb1f42'
     and (current_setting('vmp.five_role_local_test_contract', true)
            is distinct from 'loopback-54322-postgres'
       or current_database() <> 'postgres'
       or current_user <> 'postgres'
       or not exists (
         select 1 from public.system_config
         where key = 'five_role_test_fixture' and value = 'true'::jsonb
       )) then
    raise exception using errcode = '42501',
      message = 'LOCAL_ACCOUNT_MANIFEST_CONTRACT_REQUIRED';
  end if;

  if v_digest <> v_expected_digest then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_DIGEST_MISMATCH';
  end if;

  select count(*) filter (where p.role::text = 'viewer'),
         count(*) filter (where p.role::text = 'department_user'),
         count(*) filter (where p.role::text = 'qa_manager'),
         count(*) filter (where p.role::text = 'admin'),
         count(*) filter (where not coalesce(p.is_active, true)),
         count(*)
    into v_viewers, v_department_users, v_qa_managers, v_admins,
         v_inactive, v_count
  from five_role_account_manifest m
  join public.profiles p on p.id = m.id;

  if v_count <> 7
     or v_viewers <> 3
     or v_department_users <> 3
     or v_qa_managers <> 1
     or v_admins <> 0
     or v_inactive <> 0 then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_PROFILE_STATE_MISMATCH';
  end if;
end
$manifest_preconditions$;

create temporary table five_role_account_before
on commit drop
as
select p.id, p.role, p.is_active,
       public.vmp_business_role(p.id) as effective_business_role
from public.profiles p
join five_role_account_manifest m on m.id = p.id;

do $disable_accounts$
declare
  v_updated integer;
  v_audited integer;
begin
  update public.profiles p
  set is_active = false,
      updated_at = now()
  from five_role_account_manifest m
  where p.id = m.id;
  get diagnostics v_updated = row_count;

  if v_updated <> 7 then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_DISABLE_UPDATE_COUNT_MISMATCH';
  end if;

  insert into public.audit_logs (
    action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields, effective_business_role
  )
  select 'UPDATE'::public.audit_action,
         'profiles', b.id::text,
         jsonb_build_object('is_active', coalesce(b.is_active, true)),
         jsonb_build_object('is_active', false),
         'Loại Viewer và tài khoản test theo phê duyệt 2026-08-24',
         'five_role_hardening', array['is_active']::text[],
         b.effective_business_role
  from five_role_account_before b
  order by b.id;
  get diagnostics v_audited = row_count;

  if v_audited <> 7 then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_DISABLE_AUDIT_COUNT_MISMATCH';
  end if;
end
$disable_accounts$;

do $apply_postconditions$
begin
  if (select count(*) from public.profiles p
      join five_role_account_manifest m on m.id = p.id
      where not coalesce(p.is_active, true)) <> 7 then
    raise exception using errcode = 'check_violation',
      message = 'POSTCONDITION_SEVEN_ACCOUNTS_NOT_DISABLED';
  end if;

  if exists (
    select 1
    from five_role_account_manifest m
    left join lateral (
      select count(*) as audit_count
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
      message = 'POSTCONDITION_EXACT_ONE_AUDIT_PER_TARGET_REQUIRED';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.role::text = 'admin' and coalesce(p.is_active, true)
  ) then
    raise exception using errcode = 'check_violation',
      message = 'POSTCONDITION_NO_ACTIVE_ADMIN';
  end if;

  if (select count(*) from public.vmp_screen_permissions) <> 85
     or public.screen_access_mode() is distinct from 'enforced'
     or public.item_permissions_mode() is distinct from 'preview' then
    raise exception using errcode = 'check_violation',
      message = 'POSTCONDITION_PERMISSION_STATE_INVALID';
  end if;

  if has_table_privilege('authenticated', 'public.profiles',
       'INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'public.profiles',
       'INSERT,UPDATE,DELETE')
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
     or has_table_privilege('authenticated', 'public.audit_logs', 'SELECT')
     or has_table_privilege('anon', 'public.audit_logs', 'SELECT') then
    raise exception using errcode = 'check_violation',
      message = 'POSTCONDITION_DIRECT_PRIVILEGE_REMAINS';
  end if;
end
$apply_postconditions$;

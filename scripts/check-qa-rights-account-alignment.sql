\set ON_ERROR_STOP on

\if :{?khoa_id}
\else
begin read only;
do $$ begin
  raise exception using errcode = '22023',
    message = 'CHECK_KHOA_ID_PSQL_VARIABLE_REQUIRED';
end $$;
\endif
\if :{?dat_id}
\else
begin read only;
do $$ begin
  raise exception using errcode = '22023',
    message = 'CHECK_DAT_ID_PSQL_VARIABLE_REQUIRED';
end $$;
\endif
\if :{?viewer_ids}
\else
begin read only;
do $$ begin
  raise exception using errcode = '22023',
    message = 'CHECK_VIEWER_IDS_PSQL_VARIABLE_REQUIRED';
end $$;
\endif

begin read only;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

\o /dev/null
select set_config('vmp.qa_alignment_check_khoa', :'khoa_id', true);
select set_config('vmp.qa_alignment_check_dat', :'dat_id', true);
select set_config('vmp.qa_alignment_check_viewers', :'viewer_ids', true);
\o

do $checks$
declare
  v_khoa uuid := current_setting('vmp.qa_alignment_check_khoa')::uuid;
  v_dat uuid := current_setting('vmp.qa_alignment_check_dat')::uuid;
  v_viewers uuid[];
  v_count integer;
  v_item text;
  v_person uuid;
  v_user uuid;
  v_dat_person uuid;
  v_right record;
begin
  select array_agg(btrim(value)::uuid order by btrim(value)::uuid)
    into v_viewers
  from regexp_split_to_table(
    current_setting('vmp.qa_alignment_check_viewers'), ',') value;

  if cardinality(v_viewers) <> 2
     or cardinality(array(select distinct unnest(v_viewers))) <> 2
     or v_khoa = v_dat or v_khoa = any(v_viewers) or v_dat = any(v_viewers) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_REQUIRES_FOUR_UNIQUE_UUIDS';
  end if;

  if public.screen_access_mode() is distinct from 'enforced'
     or public.item_permissions_mode() is distinct from 'preview' then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_PERMISSION_MODES';
  end if;
  raise notice 'PASS CHECK_PERMISSION_MODES';

  if (select count(*) from public.vmp_screen_permissions) <> 85
     or (select count(distinct business_role)
         from public.vmp_screen_permissions) <> 5
     or exists (
       select 1 from public.vmp_screen_permissions
       where business_role = 'viewer'
     )
     or exists (
       select 1 from public.vmp_screen_permissions
       group by business_role having count(*) <> 17
     ) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_FIVE_ROLE_MATRIX';
  end if;
  raise notice 'PASS CHECK_FIVE_ROLE_MATRIX';

  if (select count(*) from public.profiles profile
      join public.vmp_performers performer
        on performer.user_id = profile.id and performer.is_active
      where profile.id = v_khoa
        and profile.role::text = 'qa_manager'
        and profile.department = 'QA'
        and coalesce(profile.is_active, true)
        and performer.access_class = 'qa_manager'
        and performer.department = 'QA') <> 1
     or (select count(*) from public.vmp_performers
         where user_id = v_khoa and is_active) <> 1
     or public.vmp_business_role(v_khoa) is distinct from 'qa_manager' then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_QA_MANAGER_ACCOUNT';
  end if;
  raise notice 'PASS CHECK_QA_MANAGER_ACCOUNT';

  if (select count(*) from public.profiles profile
      join public.vmp_performers performer
        on performer.user_id = profile.id and performer.is_active
      where profile.id = v_dat
        and profile.role::text = 'department_user'
        and profile.department = 'qc'
        and coalesce(profile.is_active, true)
        and performer.access_class = 'workshop_staff'
        and performer.department = 'qc') <> 1
     or (select count(*) from public.vmp_performers
         where user_id = v_dat and is_active) <> 1
     or public.vmp_business_role(v_dat) is distinct from 'workshop_staff' then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_WORKSHOP_STAFF_ACCOUNT';
  end if;
  raise notice 'PASS CHECK_WORKSHOP_STAFF_ACCOUNT';

  if (select count(*) from public.profiles
      where id = any(v_viewers) and role::text = 'viewer'
        and not coalesce(is_active, true)) <> 2
     or exists (select 1 from public.profiles
                where role::text = 'viewer' and coalesce(is_active, true)) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_NO_ACTIVE_VIEWER';
  end if;
  raise notice 'PASS CHECK_NO_ACTIVE_VIEWER';

  if not exists (select 1 from public.profiles
                 where role::text = 'admin' and coalesce(is_active, true)) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_ACTIVE_ADMIN';
  end if;
  raise notice 'PASS CHECK_ACTIVE_ADMIN';

  if exists (
    select 1
    from (select v_khoa id union all select v_dat
          union all select unnest(v_viewers)) target
    left join lateral (
      select count(*) audit_count
      from public.audit_logs audit
      where audit.record_id = target.id::text
        and audit.source = 'qa_rights_account_alignment'
        and audit.old_data is not null and audit.new_data is not null
    ) matching on true
    where matching.audit_count <> 1
  ) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_EXACT_FOUR_ACCOUNT_AUDITS';
  end if;
  raise notice 'PASS CHECK_EXACT_FOUR_ACCOUNT_AUDITS';

  select validation_code into v_item
  from public.vmp_plan_items where is_active
  order by validation_code limit 1;
  if v_item is null then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_QA_MANAGER_EIGHT_FIELDS';
  end if;
  select * into v_right from public.vmp_item_rights(v_khoa, v_item);
  if v_right.can_view is not true
     or v_right.editable_fields is distinct from array[
       'actual_protocol_date','status_protocol','actual_validation_date',
       'status_validation','actual_report_date','status_report',
       'actual_vmp_date','status_vmp']::text[] then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_QA_MANAGER_EIGHT_FIELDS';
  end if;
  raise notice 'PASS CHECK_QA_MANAGER_EIGHT_FIELDS';

  select performer.user_id, assignment.validation_code
    into v_user, v_item
  from public.vmp_item_assignments assignment
  join public.vmp_performers performer
    on performer.id = assignment.performer_id and performer.is_active
  join public.vmp_plan_items item
    on item.validation_code = assignment.validation_code and item.is_active
  where assignment.assignment_kind = 'qa' and assignment.is_active
    and public.vmp_business_role(performer.user_id) = 'qa_staff'
  order by assignment.validation_code, performer.id limit 1;
  if v_user is null then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_QA_STAFF_SEVEN_FIELDS';
  end if;
  select * into v_right from public.vmp_item_rights(v_user, v_item);
  if v_right.can_view is not true
     or v_right.editable_fields is distinct from array[
       'actual_protocol_date','status_protocol','status_validation',
       'actual_report_date','status_report','actual_vmp_date','status_vmp']::text[]
     or 'actual_validation_date' = any(v_right.editable_fields) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_QA_STAFF_SEVEN_FIELDS';
  end if;
  raise notice 'PASS CHECK_QA_STAFF_SEVEN_FIELDS';

  select performer.user_id, performer.id, assignment.validation_code
    into v_user, v_person, v_item
  from public.vmp_item_assignments assignment
  join public.vmp_performers performer
    on performer.id = assignment.performer_id and performer.is_active
  join public.vmp_plan_items item
    on item.validation_code = assignment.validation_code and item.is_active
  where assignment.assignment_kind = 'equipment_department'
    and assignment.is_active
    and public.vmp_business_role(performer.user_id) = 'workshop_staff'
  order by (performer.user_id = v_dat) desc,
           assignment.validation_code, performer.id limit 1;
  if v_user is null then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_WORKSHOP_STAFF_ONE_FIELD';
  end if;
  select * into v_right from public.vmp_item_rights(v_user, v_item);
  if v_right.can_view is not true
     or v_right.editable_fields is distinct from
        array['actual_validation_date']::text[] then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_WORKSHOP_STAFF_ONE_FIELD';
  end if;
  raise notice 'PASS CHECK_WORKSHOP_STAFF_ONE_FIELD';

  if exists (
    select 1
    from public.vmp_plan_items item
    where item.is_active and item.owner_person_id is not null
      and not exists (
        select 1
        from public.vmp_performers performer
        join public.vmp_item_assignments assignment
          on assignment.performer_id = performer.id
         and assignment.user_id = performer.user_id
        where performer.id = item.owner_person_id and performer.is_active
          and assignment.validation_code = item.validation_code
          and assignment.assignment_kind = 'qa'
          and assignment.source in ('sheet_qa','qa_manager')
          and assignment.assignment_role in ('primary','collaborator')
          and assignment.unresolved_reason is null and assignment.is_active
          and (assignment.expires_at is null or assignment.expires_at > now())
      )
  ) or exists (
    select 1
    from public.vmp_plan_items item
    where item.is_active and item.support_person_id is not null
      and not exists (
        select 1
        from public.vmp_performers performer
        join public.vmp_item_assignments assignment
          on assignment.performer_id = performer.id
         and assignment.user_id = performer.user_id
        where performer.id = item.support_person_id and performer.is_active
          and assignment.validation_code = item.validation_code
          and assignment.assignment_kind = 'qa'
          and assignment.source in ('sheet_qa','qa_manager')
          and assignment.assignment_role in ('primary','collaborator')
          and assignment.unresolved_reason is null and assignment.is_active
          and (assignment.expires_at is null or assignment.expires_at > now())
      )
  ) or exists (
    select 1 from public.vmp_plan_items item
    join public.vmp_item_assignments assignment
      on assignment.validation_code = item.validation_code
    where item.is_active and item.owner_person_id is null
      and item.support_person_id is null and assignment.is_active
      and assignment.source like 'sheet\_qa%' escape '\'
  ) or exists (
    select 1
    from public.vmp_item_assignments assignment
    join public.vmp_plan_items item
      on item.validation_code = assignment.validation_code and item.is_active
    left join public.vmp_performers performer
      on performer.id = assignment.performer_id and performer.is_active
    where assignment.source = 'sheet_qa' and assignment.is_active
      and (assignment.expires_at is not null and assignment.expires_at <= now()
        or assignment.unresolved_reason is not null
        or performer.id is null
        or assignment.user_id is distinct from performer.user_id
        or assignment.performer_id is distinct from item.owner_person_id
           and assignment.performer_id is distinct from item.support_person_id)
  ) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_SOURCE_ASSIGNMENTS';
  end if;
  raise notice 'PASS CHECK_SOURCE_ASSIGNMENTS';

  select id into strict v_dat_person
  from public.vmp_performers where user_id = v_dat and is_active;
  select item.validation_code into v_item
  from public.vmp_plan_items item
  where item.is_active and not exists (
    select 1 from public.vmp_item_assignments assignment
    where assignment.validation_code = item.validation_code
      and assignment.performer_id = v_dat_person and assignment.is_active
  )
  order by item.validation_code limit 1;
  if v_item is null then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_DAT_HAS_NO_DEPARTMENT_WIDE_RIGHT';
  end if;
  select * into v_right from public.vmp_item_rights(v_dat, v_item);
  if v_right.can_view is not false
     or coalesce(cardinality(v_right.editable_fields), 0) <> 0 then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_DAT_HAS_NO_DEPARTMENT_WIDE_RIGHT';
  end if;
  raise notice 'PASS CHECK_DAT_HAS_NO_DEPARTMENT_WIDE_RIGHT';

  if has_table_privilege('authenticated', 'public.profiles',
       'INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'public.profiles',
       'INSERT,UPDATE,DELETE')
     or has_any_column_privilege('authenticated', 'public.profiles', 'UPDATE')
     or has_any_column_privilege('anon', 'public.profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.audit_logs', 'SELECT')
     or has_table_privilege('anon', 'public.audit_logs', 'SELECT')
     or has_function_privilege('authenticated',
          'public.vmp_item_rights(uuid,text)', 'EXECUTE')
     or has_function_privilege('anon',
          'public.vmp_item_rights(uuid,text)', 'EXECUTE')
     or has_function_privilege('public',
          'public.vmp_item_rights(uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated',
          'public.rpc_refresh_source_item_assignments()', 'EXECUTE')
     or has_function_privilege('anon',
          'public.rpc_refresh_source_item_assignments()', 'EXECUTE')
     or has_function_privilege('public',
          'public.rpc_refresh_source_item_assignments()', 'EXECUTE')
     or not has_function_privilege('service_role',
          'public.rpc_refresh_source_item_assignments()', 'EXECUTE')
     or not exists (
       select 1 from pg_proc function_row
       join pg_roles owner on owner.oid=function_row.proowner
       where function_row.oid='public.vmp_item_rights(uuid,text)'::regprocedure
         and owner.rolname='postgres' and function_row.prosecdef
         and function_row.provolatile='s'
         and function_row.proconfig=array['search_path=public, pg_temp']
         and function_row.proacl=array[
           'postgres=X/postgres','service_role=X/postgres']::aclitem[]
         and encode(extensions.digest(pg_get_functiondef(function_row.oid),
           'sha256'),'hex')='9cfba864d7ea650370d6d76c33e2afcfbf941bb6918a90eeedec77f0513ab0db'
     )
     or not exists (
       select 1 from pg_proc function_row
       join pg_roles owner on owner.oid=function_row.proowner
       where function_row.oid='public.vmp_my_item_rights(text)'::regprocedure
         and owner.rolname='postgres' and function_row.prosecdef
         and function_row.provolatile='s'
         and function_row.proconfig=array['search_path=public, pg_temp']
         and function_row.proacl=array['postgres=X/postgres',
           'service_role=X/postgres','authenticated=X/postgres']::aclitem[]
         and encode(extensions.digest(pg_get_functiondef(function_row.oid),
           'sha256'),'hex')='c7a326defaedd0cf9056a284e480d69027a56cd35f2ca6f09b4a9e321f1ad76d'
     )
     or not exists (
       select 1 from pg_proc function_row
       join pg_roles owner on owner.oid=function_row.proowner
       where function_row.oid=
         'public.rpc_update_progress(text,jsonb,text,jsonb,integer)'::regprocedure
         and owner.rolname='postgres' and function_row.prosecdef
         and function_row.provolatile='v'
         and function_row.proconfig=array['search_path=public, pg_temp']
         and function_row.proacl=array['postgres=X/postgres',
           'service_role=X/postgres','authenticated=X/postgres']::aclitem[]
         and encode(extensions.digest(pg_get_functiondef(function_row.oid),
           'sha256'),'hex')='da25f8acbcc5aa3e029e581acb79f210cf1d6c61ab0e8458e4ff89146e75f4a0'
     )
     or not exists (
       select 1 from pg_proc function_row
       join pg_roles owner on owner.oid=function_row.proowner
       where function_row.oid=
         'public.rpc_refresh_source_item_assignments()'::regprocedure
         and owner.rolname='postgres' and function_row.prosecdef
         and function_row.provolatile='v'
         and function_row.proconfig=array['search_path=public, pg_temp']
         and function_row.proacl=array[
           'postgres=X/postgres','service_role=X/postgres']::aclitem[]
         and encode(extensions.digest(pg_get_functiondef(function_row.oid),
           'sha256'),'hex')='a4bd208fc467a14b9d0383d6af486f59a66f52d8b68d4bc614b92627a73524e7'
     ) then
    raise exception using errcode = 'check_violation',
      message = 'CHECK_SECURITY_ACL';
  end if;
  raise notice 'PASS CHECK_SECURITY_ACL';
end
$checks$;

rollback;

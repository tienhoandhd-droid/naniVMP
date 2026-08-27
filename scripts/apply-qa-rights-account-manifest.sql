\set ON_ERROR_STOP on

\if :{?khoa_id}
\else
do $$ begin
  raise exception using errcode = '22023',
    message = 'KHOA_ID_PSQL_VARIABLE_REQUIRED';
end $$;
\endif
\if :{?dat_id}
\else
do $$ begin
  raise exception using errcode = '22023',
    message = 'DAT_ID_PSQL_VARIABLE_REQUIRED';
end $$;
\endif
\if :{?viewer_ids}
\else
do $$ begin
  raise exception using errcode = '22023',
    message = 'VIEWER_IDS_PSQL_VARIABLE_REQUIRED';
end $$;
\endif

begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';

create temporary table qa_rights_account_manifest (
  target_kind text not null,
  id uuid not null,
  profile_role text not null,
  profile_department text,
  profile_is_active boolean not null,
  performer_access_class text,
  performer_department text,
  primary key (target_kind)
) on commit drop;

insert into qa_rights_account_manifest (
  target_kind, id, profile_role, profile_department, profile_is_active,
  performer_access_class, performer_department
)
values
  ('khoa', :'khoa_id'::uuid, 'qa_manager', 'QA', true, 'qa_manager', 'QA'),
  ('dat', :'dat_id'::uuid, 'department_user', 'qc', true, 'workshop_staff', 'qc');

insert into qa_rights_account_manifest (
  target_kind, id, profile_role, profile_department, profile_is_active,
  performer_access_class, performer_department
)
select 'viewer_' || row_number() over (order by parsed.id),
       parsed.id, 'viewer', null, false, null, null
from (
  select btrim(value)::uuid id
  from regexp_split_to_table(:'viewer_ids', ',') value
) parsed;

do $manifest_shape$
declare
  v_count integer;
  v_distinct integer;
begin
  select count(*), count(distinct id)
    into v_count, v_distinct
  from qa_rights_account_manifest;

  if v_count <> 4 or v_distinct <> 4
     or (select count(*) from qa_rights_account_manifest
         where target_kind like 'viewer\_%' escape '\') <> 2 then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_REQUIRES_FOUR_UNIQUE_UUIDS';
  end if;
end
$manifest_shape$;

do $schema_preconditions$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.vmp_performers') is null
     or to_regclass('public.vmp_plan_items') is null
     or to_regclass('public.vmp_item_assignments') is null
     or to_regclass('public.vmp_screen_permissions') is null
     or to_regclass('public.audit_logs') is null
     or to_regclass('public.system_config') is null
     or to_regprocedure('public.vmp_business_role(uuid)') is null
     or to_regprocedure('public.vmp_item_rights(uuid,text)') is null
     or to_regprocedure('rpc_refresh_source_item_assignments()') is null then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_SCHEMA_PREREQUISITE_MISSING';
  end if;

  if exists (
    select required.column_name
    from (values
      ('profiles','id','uuid'), ('profiles','role','user_role'),
      ('profiles','department','text'), ('profiles','is_active','boolean'),
      ('vmp_performers','id','uuid'), ('vmp_performers','user_id','uuid'),
      ('vmp_performers','department','text'),
      ('vmp_performers','access_class','text'),
      ('vmp_performers','is_active','boolean'),
      ('vmp_performers','version','integer'),
      ('vmp_plan_items','validation_code','text'),
      ('vmp_plan_items','owner_person_id','uuid'),
      ('vmp_plan_items','support_person_id','uuid'),
      ('vmp_plan_items','is_active','boolean'),
      ('vmp_item_assignments','validation_code','text'),
      ('vmp_item_assignments','performer_id','uuid'),
      ('vmp_item_assignments','user_id','uuid'),
      ('vmp_item_assignments','assignment_kind','text'),
      ('vmp_item_assignments','assignment_role','text'),
      ('vmp_item_assignments','source','text'),
      ('vmp_item_assignments','is_active','boolean'),
      ('audit_logs','record_id','text'), ('audit_logs','old_data','jsonb'),
      ('audit_logs','new_data','jsonb'), ('audit_logs','source','text')
    ) required(table_name,column_name,data_type)
    left join pg_class relation on relation.relname = required.table_name
      and relation.relnamespace = 'public'::regnamespace
    left join pg_attribute attribute on attribute.attrelid = relation.oid
      and attribute.attname = required.column_name
      and not attribute.attisdropped
    where attribute.attname is null
       or format_type(attribute.atttypid, attribute.atttypmod)
          is distinct from required.data_type
  ) then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_SCHEMA_COLUMN_DRIFT';
  end if;

  if not exists (select 1 from public.departments where id = 'QA')
     or not exists (select 1 from public.departments where id = 'qc')
     or public.screen_access_mode() is distinct from 'enforced'
     or public.item_permissions_mode() is distinct from 'preview'
     or (select count(*) from public.vmp_screen_permissions) <> 85
     or (select count(distinct business_role)
         from public.vmp_screen_permissions) <> 5
     or exists (select 1 from public.vmp_screen_permissions
                where business_role = 'viewer')
     or not exists (
       select 1 from public.profiles
       where role::text = 'admin' and coalesce(is_active, true)
     ) then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_PERMISSION_STATE_MISMATCH';
  end if;
end
$schema_preconditions$;

do $lock_account_authority_rows$
declare
  v_profiles integer;
  v_performers integer;
begin
  perform profile.id
  from public.profiles profile
  join qa_rights_account_manifest manifest on manifest.id = profile.id
  order by profile.id
  for update of profile;
  get diagnostics v_profiles = row_count;

  perform performer.id
  from public.vmp_performers performer
  join qa_rights_account_manifest manifest on manifest.id = performer.user_id
  where manifest.target_kind in ('khoa','dat') and performer.is_active
  order by performer.id
  for update of performer;
  get diagnostics v_performers = row_count;

  if v_profiles <> 4 or v_performers <> 2 then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_AUTHORITY_ROW_LOCK_MISMATCH';
  end if;
end
$lock_account_authority_rows$;

create temporary table qa_rights_account_before
on commit drop
as
select manifest.target_kind, manifest.id,
       profile.role::text profile_role,
       profile.department profile_department,
       coalesce(profile.is_active, true) profile_is_active,
       person.id performer_id,
       person.access_class performer_access_class,
       person.department performer_department,
       person.is_active performer_is_active,
       person.version performer_version,
       public.vmp_business_role(profile.id) effective_business_role,
       jsonb_build_object(
         'role', profile.role::text,
         'department', profile.department,
         'is_active', coalesce(profile.is_active, true)
       ) profile_data,
       case when person.id is null then null else jsonb_build_object(
         'access_class', person.access_class,
         'department', person.department,
         'is_active', person.is_active,
         'version', person.version
       ) end performer_data
from qa_rights_account_manifest manifest
join public.profiles profile on profile.id = manifest.id
left join lateral (
  select performer.*
  from public.vmp_performers performer
  where performer.user_id = profile.id and performer.is_active
  order by performer.id
  limit 1
) person on true;

create temporary table qa_rights_release_state (
  apply_required boolean not null,
  old_claims text
) on commit drop;

do $account_preconditions$
declare
  v_legacy_count integer;
  v_final_count integer;
begin
  if (select count(*) from qa_rights_account_before) <> 4 then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_PROFILE_STATE_MISMATCH';
  end if;

  if (select count(*) from public.vmp_performers performer
      join qa_rights_account_manifest manifest on manifest.id = performer.user_id
      where manifest.target_kind in ('khoa','dat') and performer.is_active) <> 2
     or exists (
       select 1
       from qa_rights_account_manifest manifest
       where manifest.target_kind in ('khoa','dat')
         and (select count(*) from public.vmp_performers performer
              where performer.user_id = manifest.id and performer.is_active) <> 1
     ) then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_PERFORMER_LINK_MISMATCH';
  end if;

  select count(*) into v_legacy_count
  from qa_rights_account_before before_state
  where case before_state.target_kind
    when 'khoa' then before_state.profile_role = 'department_user'
      and before_state.profile_department = 'QA'
      and before_state.profile_is_active
      and before_state.performer_access_class = 'qa_progress_editor'
      and before_state.performer_department = 'QA'
      and before_state.performer_is_active
      and before_state.effective_business_role = 'qa_staff'
    when 'dat' then before_state.profile_role = 'viewer'
      and before_state.profile_department = 'qc'
      and before_state.profile_is_active
      and before_state.performer_access_class is null
      and before_state.performer_department = 'qc'
      and before_state.performer_is_active
      and before_state.effective_business_role is null
    else before_state.target_kind like 'viewer\_%' escape '\'
      and before_state.profile_role = 'viewer'
      and before_state.profile_is_active
      and before_state.effective_business_role is null
  end;

  select count(*) into v_final_count
  from qa_rights_account_before before_state
  where case before_state.target_kind
    when 'khoa' then before_state.profile_role = 'qa_manager'
      and before_state.profile_department = 'QA'
      and before_state.profile_is_active
      and before_state.performer_access_class = 'qa_manager'
      and before_state.performer_department = 'QA'
      and before_state.performer_is_active
      and before_state.effective_business_role = 'qa_manager'
    when 'dat' then before_state.profile_role = 'department_user'
      and before_state.profile_department = 'qc'
      and before_state.profile_is_active
      and before_state.performer_access_class = 'workshop_staff'
      and before_state.performer_department = 'qc'
      and before_state.performer_is_active
      and before_state.effective_business_role = 'workshop_staff'
    else before_state.target_kind like 'viewer\_%' escape '\'
      and before_state.profile_role = 'viewer'
      and not before_state.profile_is_active
      and before_state.effective_business_role is null
  end;

  if v_legacy_count = 4 then
    if exists (
      select 1 from public.audit_logs audit
      join qa_rights_account_manifest manifest
        on manifest.id::text = audit.record_id
      where audit.source = 'qa_rights_account_alignment'
    ) then
      raise exception using errcode = 'check_violation',
        message = 'ACCOUNT_MANIFEST_UNEXPECTED_PRIOR_AUDIT';
    end if;
    insert into qa_rights_release_state values (
      true, current_setting('request.jwt.claims', true));
  elsif v_final_count = 4 then
    if exists (
      select 1
      from qa_rights_account_manifest manifest
      left join lateral (
        select count(*) audit_count
        from public.audit_logs audit
        where audit.record_id = manifest.id::text
          and audit.source = 'qa_rights_account_alignment'
      ) matching on true
      where matching.audit_count <> 1
    ) then
      raise exception using errcode = 'check_violation',
        message = 'ACCOUNT_MANIFEST_FINAL_AUDIT_MISMATCH';
    end if;
    insert into qa_rights_release_state values (
      false, current_setting('request.jwt.claims', true));
  else
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_PARTIAL_STATE_REFUSED';
  end if;
end
$account_preconditions$;

do $mutate_khoa$
declare
  v_profiles integer;
  v_performers integer;
begin
  if not (select apply_required from qa_rights_release_state) then return; end if;

  update public.profiles profile
  set role = 'qa_manager'::public.user_role,
      department = 'QA', is_active = true, updated_at = now()
  from qa_rights_account_manifest manifest
  where manifest.target_kind = 'khoa' and profile.id = manifest.id;
  get diagnostics v_profiles = row_count;

  update public.vmp_performers performer
  set access_class = 'qa_manager', department = 'QA',
      version = performer.version + 1, updated_at = now()
  from qa_rights_account_manifest manifest
  where manifest.target_kind = 'khoa'
    and performer.user_id = manifest.id and performer.is_active;
  get diagnostics v_performers = row_count;

  if v_profiles <> 1 or v_performers <> 1 then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_KHOA_UPDATE_COUNT';
  end if;
  if current_setting('vmp.qa_alignment_fault', true) = 'after_khoa' then
    raise exception using errcode = 'raise_exception',
      message = 'QA_ALIGNMENT_INJECTED_AFTER_KHOA';
  end if;
end
$mutate_khoa$;

do $mutate_dat_and_viewers$
declare
  v_profiles integer;
  v_performers integer;
  v_viewers integer;
begin
  if not (select apply_required from qa_rights_release_state) then return; end if;

  update public.profiles profile
  set role = 'department_user'::public.user_role,
      department = 'qc', is_active = true, updated_at = now()
  from qa_rights_account_manifest manifest
  where manifest.target_kind = 'dat' and profile.id = manifest.id;
  get diagnostics v_profiles = row_count;

  update public.vmp_performers performer
  set access_class = 'workshop_staff', department = 'qc',
      version = performer.version + 1, updated_at = now()
  from qa_rights_account_manifest manifest
  where manifest.target_kind = 'dat'
    and performer.user_id = manifest.id and performer.is_active;
  get diagnostics v_performers = row_count;

  update public.profiles profile
  set is_active = false, updated_at = now()
  from qa_rights_account_manifest manifest
  where manifest.target_kind like 'viewer\_%' escape '\'
    and profile.id = manifest.id;
  get diagnostics v_viewers = row_count;

  if v_profiles <> 1 or v_performers <> 1 or v_viewers <> 2 then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_REMAINING_UPDATE_COUNT';
  end if;
end
$mutate_dat_and_viewers$;

do $account_audit$
declare
  v_count integer;
begin
  if not (select apply_required from qa_rights_release_state) then return; end if;

  insert into public.audit_logs (
    action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields, effective_business_role
  )
  select 'UPDATE'::public.audit_action,
         'account_authority', before_state.id::text,
         jsonb_build_object(
           'profile', before_state.profile_data,
           'performer', before_state.performer_data
         ),
         jsonb_build_object(
           'profile', jsonb_build_object(
             'role', profile.role::text,
             'department', profile.department,
             'is_active', coalesce(profile.is_active, true)
           ),
           'performer', case when performer.id is null then null
             else jsonb_build_object(
               'access_class', performer.access_class,
               'department', performer.department,
               'is_active', performer.is_active,
               'version', performer.version
             ) end
         ),
         'Hiệu chỉnh vai trò QA/QC và vô hiệu hóa Viewer thử nghiệm theo phê duyệt 2026-08-27',
         'qa_rights_account_alignment',
         case before_state.target_kind
           when 'khoa' then array['profile.role','performer.access_class']::text[]
           when 'dat' then array[
             'profile.role','profile.department',
             'performer.access_class','performer.department']::text[]
           else array['profile.is_active']::text[]
         end,
         before_state.effective_business_role
  from qa_rights_account_before before_state
  join public.profiles profile on profile.id = before_state.id
  left join public.vmp_performers performer
    on performer.id = before_state.performer_id
  order by before_state.target_kind;
  get diagnostics v_count = row_count;

  if v_count <> 4 then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_AUDIT_COUNT_MISMATCH';
  end if;
end
$account_audit$;

\o /dev/null
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'service_role')::text,
  true
)
where (select apply_required from qa_rights_release_state);
\o

do $refresh_assignments$
declare
  v_result jsonb;
begin
  if not (select apply_required from qa_rights_release_state) then return; end if;
  if current_setting('vmp.qa_alignment_fault', true) = 'before_refresh' then
    raise exception using errcode = 'raise_exception',
      message = 'QA_ALIGNMENT_INJECTED_BEFORE_REFRESH';
  end if;

  v_result := public.rpc_refresh_source_item_assignments();
  if v_result->>'ok' is distinct from 'true' then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_ASSIGNMENT_REFRESH_FAILED',
      detail = coalesce(v_result->>'error_code', v_result->>'error', 'unknown');
  end if;
end
$refresh_assignments$;

\o /dev/null
select set_config(
  'request.jwt.claims',
  coalesce((select old_claims from qa_rights_release_state), ''),
  true
)
where (select apply_required from qa_rights_release_state);
\o

do $postconditions$
declare
  v_dat_performer uuid;
  v_unassigned_code text;
  v_right record;
begin
  if public.screen_access_mode() is distinct from 'enforced'
     or public.item_permissions_mode() is distinct from 'preview'
     or (select count(*) from public.vmp_screen_permissions) <> 85
     or exists (select 1 from public.vmp_screen_permissions
                where business_role = 'viewer') then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_POST_PERMISSION_STATE';
  end if;

  if exists (
    select 1 from qa_rights_account_manifest manifest
    join public.profiles profile on profile.id = manifest.id
    left join public.vmp_performers performer
      on performer.user_id = manifest.id and performer.is_active
    where case manifest.target_kind
      when 'khoa' then profile.role::text <> 'qa_manager'
        or profile.department <> 'QA' or not coalesce(profile.is_active, true)
        or performer.access_class is distinct from 'qa_manager'
        or performer.department is distinct from 'QA'
        or public.vmp_business_role(manifest.id) is distinct from 'qa_manager'
      when 'dat' then profile.role::text <> 'department_user'
        or profile.department <> 'qc' or not coalesce(profile.is_active, true)
        or performer.access_class is distinct from 'workshop_staff'
        or performer.department is distinct from 'qc'
        or public.vmp_business_role(manifest.id) is distinct from 'workshop_staff'
      else coalesce(profile.is_active, true)
        or public.vmp_business_role(manifest.id) is not null
    end
  ) then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_POST_ACCOUNT_STATE';
  end if;

  if exists (select 1 from public.profiles
             where role::text = 'viewer' and coalesce(is_active, true))
     or not exists (select 1 from public.profiles
                    where role::text = 'admin' and coalesce(is_active, true))
     or exists (
       select 1 from qa_rights_account_manifest manifest
       left join lateral (
         select count(*) audit_count from public.audit_logs audit
         where audit.record_id = manifest.id::text
           and audit.source = 'qa_rights_account_alignment'
       ) matching on true
       where matching.audit_count <> 1
     ) then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_POST_GLOBAL_ACCOUNT_STATE';
  end if;

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
      message = 'ACCOUNT_MANIFEST_SOURCE_ASSIGNMENT_POSTSTATE';
  end if;

  select performer.id into strict v_dat_performer
  from public.vmp_performers performer
  join qa_rights_account_manifest manifest on manifest.id = performer.user_id
  where manifest.target_kind = 'dat' and performer.is_active;

  select item.validation_code into v_unassigned_code
  from public.vmp_plan_items item
  where item.is_active and not exists (
    select 1 from public.vmp_item_assignments assignment
    where assignment.validation_code = item.validation_code
      and assignment.performer_id = v_dat_performer and assignment.is_active
  )
  order by item.validation_code limit 1;
  if v_unassigned_code is null then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_DAT_QC_WIDE_ASSIGNMENT_REFUSED';
  end if;

  select * into v_right from public.vmp_item_rights(
    (select id from qa_rights_account_manifest where target_kind = 'dat'),
    v_unassigned_code);
  if v_right.can_view is not false
     or coalesce(cardinality(v_right.editable_fields), 0) <> 0 then
    raise exception using errcode = 'check_violation',
      message = 'ACCOUNT_MANIFEST_DAT_QC_WIDE_RIGHT_REFUSED';
  end if;
end
$postconditions$;

commit;

/* Siết principal quản lý, phạm vi đọc và liên kết phân công denormalized. */

create or replace function public.vmp_valid_scope_departments(p_scope text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select not exists (
    select 1
    from unnest(coalesce(p_scope, '{}'::text[])) value
    where value <> '*'
      and not exists (
        select 1 from public.departments department
        where department.id = value and coalesce(department.is_active, true)
      )
  )
$fn$;

create or replace function public.vmp_valid_access_areas(p_areas text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select not exists (
    select 1
    from unnest(coalesce(p_areas, '{}'::text[])) value
    where value <> '*'
      and not exists (
        select 1
        from public.vmp_objects object
        where btrim(coalesce(object.area, '')) = value
           or btrim(coalesce(object.line, '')) = value
      )
  )
$fn$;

alter function public.rpc_upsert_item_permission_staff(uuid, jsonb, text)
  rename to vmp_upsert_item_permission_staff_unvalidated;

revoke all on function public.vmp_upsert_item_permission_staff_unvalidated(uuid, jsonb, text)
  from public, anon, authenticated, service_role;

create or replace function public.rpc_upsert_item_permission_staff(
  p_person_id uuid,
  p_patch jsonb,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor_role text;
  v_old public.vmp_performers%rowtype;
  v_department text;
  v_access_class text;
  v_email text;
  v_user_id uuid;
  v_profile_role text;
  v_profile_department text;
  v_scope text[];
  v_areas text[];
begin
  select role::text into v_actor_role
  from public.profiles
  where id = auth.uid() and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Chỉ Admin được sửa hồ sơ trong danh bạ nhân sự & quyền'
    );
  end if;

  if p_person_id is not null then
    select * into v_old from public.vmp_performers where id = p_person_id;
  end if;

  v_department := case
    when p_patch ? 'department' then lower(nullif(btrim(p_patch->>'department'), ''))
    else v_old.department
  end;
  v_access_class := case
    when p_patch ? 'access_class' then nullif(btrim(p_patch->>'access_class'), '')
    else v_old.access_class
  end;
  v_email := case
    when p_patch ? 'email' then lower(nullif(btrim(p_patch->>'email'), ''))
    else v_old.email
  end;
  v_scope := case
    when p_patch ? 'scope_departments'
      then public.vmp_jsonb_text_array(p_patch, 'scope_departments')
    else v_old.scope_departments
  end;
  v_areas := case
    when p_patch ? 'access_areas'
      then public.vmp_jsonb_text_array(p_patch, 'access_areas')
    else v_old.access_areas
  end;

  if not public.vmp_valid_scope_departments(v_scope) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Phạm vi bộ phận chỉ nhận mã đang có trong danh mục departments hoặc *'
    );
  end if;
  if not public.vmp_valid_access_areas(v_areas) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Khu vực/line chỉ nhận giá trị đang có trên đối tượng thẩm định hoặc *'
    );
  end if;

  if v_email is not null then
    select profile.id, profile.role::text, profile.department
    into v_user_id, v_profile_role, v_profile_department
    from public.profiles profile
    where lower(btrim(profile.email)) = v_email
    order by profile.created_at
    limit 1;
  end if;

  if v_user_id is not null and v_access_class = 'equipment_manager'
      and (
        v_profile_role <> 'department_user'
        or nullif(btrim(coalesce(v_profile_department, '')), '') is null
        or v_department is distinct from v_profile_department
      ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Quản lý thiết bị phải có role department_user và khớp profiles.department'
    );
  end if;
  if v_user_id is not null and v_access_class = 'qa_manager'
      and (
        v_profile_role <> 'qa_manager'
        or v_profile_department is distinct from 'qa'
        or v_department is distinct from 'qa'
      ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Quản lý QA phải có role qa_manager và thuộc bộ phận QA ở cả hai hồ sơ'
    );
  end if;

  return public.vmp_upsert_item_permission_staff_unvalidated(
    p_person_id, p_patch, p_reason
  );
end
$fn$;

create or replace function public.rpc_import_item_permission_staff(
  p_rows jsonb,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row jsonb;
  v_result jsonb;
  v_imported integer := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'Dữ liệu nhập phải là một mảng dòng');
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Bắt buộc nhập lý do nhập file');
  end if;

  begin
    for v_row in select value from jsonb_array_elements(p_rows)
    loop
      v_result := public.rpc_upsert_item_permission_staff(
        null, v_row - 'row_number', p_reason
      );
      if coalesce((v_result->>'ok')::boolean, false) then
        v_imported := v_imported + 1;
      else
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'row_number', v_row -> 'row_number',
          'error', v_result ->> 'error'
        ));
      end if;
    end loop;

    if jsonb_array_length(v_errors) > 0 then
      raise exception 'VMP_IMPORT_ATOMIC_ROLLBACK' using errcode = 'VMP01';
    end if;
  exception
    when sqlstate 'VMP01' then
      return jsonb_build_object(
        'ok', false,
        'imported', 0,
        'errors', v_errors
      );
  end;

  return jsonb_build_object(
    'ok', true,
    'imported', v_imported,
    'errors', '[]'::jsonb
  );
end
$fn$;

revoke execute on function public.vmp_valid_scope_departments(text[]) from public, anon, authenticated;
revoke execute on function public.vmp_valid_access_areas(text[]) from public, anon, authenticated;
revoke execute on function public.rpc_upsert_item_permission_staff(uuid, jsonb, text)
  from public, anon;
revoke execute on function public.rpc_import_item_permission_staff(jsonb, text)
  from public, anon;
grant execute on function public.vmp_valid_scope_departments(text[]) to service_role;
grant execute on function public.vmp_valid_access_areas(text[]) to service_role;
grant execute on function public.rpc_upsert_item_permission_staff(uuid, jsonb, text)
  to authenticated, service_role;
grant execute on function public.rpc_import_item_permission_staff(jsonb, text)
  to authenticated, service_role;

create or replace function public.vmp_sync_item_assignments_from_performer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  update public.vmp_item_assignments assignment
  set user_id = new.user_id,
      employee_code = new.employee_code,
      staff_name = new.performer_name,
      unresolved_reason = case
        when new.user_id is null then 'account_unlinked'
        else null
      end
  where assignment.performer_id = new.id
    and (
      assignment.user_id is distinct from new.user_id
      or assignment.employee_code is distinct from new.employee_code
      or assignment.staff_name is distinct from new.performer_name
      or assignment.unresolved_reason is distinct from case
        when new.user_id is null then 'account_unlinked'
        else null
      end
    );
  return new;
end
$fn$;

drop trigger if exists vmp_sync_item_assignments_from_performer
  on public.vmp_performers;
create trigger vmp_sync_item_assignments_from_performer
after update of user_id, employee_code, performer_name
on public.vmp_performers
for each row execute function public.vmp_sync_item_assignments_from_performer();

update public.vmp_item_assignments assignment
set user_id = person.user_id,
    employee_code = person.employee_code,
    staff_name = person.performer_name,
    unresolved_reason = case
      when person.user_id is null then 'account_unlinked'
      else null
    end
from public.vmp_performers person
where assignment.performer_id = person.id;

revoke execute on function public.vmp_sync_item_assignments_from_performer()
  from public, anon, authenticated;

create table public.vmp_source_assignment_resolutions (
  validation_code text not null
    references public.vmp_plan_items(validation_code)
    on update cascade on delete cascade,
  assignment_kind text not null
    check (assignment_kind in ('qa', 'equipment_department')),
  source text not null
    check (source in ('sheet_qa', 'sheet_other_staff')),
  normalized_source_name text not null,
  performer_id uuid not null
    references public.vmp_performers(id) on delete cascade,
  change_reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (
    validation_code, assignment_kind, source, normalized_source_name
  )
);

alter table public.vmp_source_assignment_resolutions enable row level security;
revoke all on public.vmp_source_assignment_resolutions from public, anon, authenticated;
grant select, insert, update, delete on public.vmp_source_assignment_resolutions
  to service_role;

drop trigger if exists set_updated_at on public.vmp_source_assignment_resolutions;
create trigger set_updated_at
before update on public.vmp_source_assignment_resolutions
for each row execute function public.trigger_set_updated_at();

create or replace function public.rpc_refresh_source_item_assignments()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_inserted integer := 0;
  v_unresolved integer := 0;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = v_actor and coalesce(is_active, true);

  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Chỉ Admin hoặc service đồng bộ được phân công nguồn'
    );
  end if;

  delete from public.vmp_item_assignments
  where source in ('sheet_qa', 'sheet_other_staff');

  with source_names as (
    select
      item.validation_code,
      'qa'::text as assignment_kind,
      'sheet_qa'::text as source,
      coalesce(
        nullif(btrim(item.source_sheet_data -> 'values' ->> 17), ''),
        nullif(btrim(item.owner_name), '')
      ) as source_name
    from public.vmp_plan_items item
    where item.is_active

    union all

    select
      item.validation_code,
      'equipment_department'::text,
      'sheet_other_staff'::text,
      nullif(btrim(item.source_sheet_data -> 'values' ->> 19), '')
    from public.vmp_plan_items item
    where item.is_active
  ), valid_sources as (
    select source.*,
           public.vmp_normalize_person_name(source.source_name) as normalized_source_name
    from source_names source
    where source.source_name is not null
      and source.source_name !~ '^[-–—.·[:space:]]+$'
      and lower(source.source_name) <> '(chưa phân công)'
  ), matched as (
    select
      source.*,
      resolved.id as resolved_performer_id,
      automatic.match_count,
      automatic.performer_id as automatic_performer_id
    from valid_sources source
    left join public.vmp_source_assignment_resolutions resolution
      on resolution.validation_code = source.validation_code
     and resolution.assignment_kind = source.assignment_kind
     and resolution.source = source.source
     and resolution.normalized_source_name = source.normalized_source_name
    left join public.vmp_performers resolved
      on resolved.id = resolution.performer_id and resolved.is_active
    left join lateral (
      select
        count(*)::integer as match_count,
        case when count(*) = 1
          then (array_agg(person.id order by person.id))[1]
        end as performer_id
      from public.vmp_performers person
      where person.is_active
        and person.normalized_full_name = source.normalized_source_name
    ) automatic on true
  ), selected as (
    select matched.*,
           coalesce(resolved_performer_id, automatic_performer_id) as performer_id
    from matched
  )
  insert into public.vmp_item_assignments (
    validation_code, performer_id, user_id, staff_name, employee_code,
    assignment_kind, source, source_text, unresolved_reason,
    is_active, change_reason, created_by, updated_by
  )
  select
    selected.validation_code,
    selected.performer_id,
    person.user_id,
    coalesce(person.performer_name, selected.source_name),
    person.employee_code,
    selected.assignment_kind,
    selected.source,
    selected.source_name,
    case
      when selected.performer_id is null and selected.match_count = 0 then 'not_found'
      when selected.performer_id is null and selected.match_count > 1 then 'duplicate_name'
      when person.user_id is null then 'account_unlinked'
      else null
    end,
    true,
    'Đồng bộ phân công từ dữ liệu Sheet',
    v_actor,
    v_actor
  from selected
  left join public.vmp_performers person on person.id = selected.performer_id;
  get diagnostics v_inserted = row_count;

  select count(*) into v_unresolved
  from public.vmp_item_assignments
  where source in ('sheet_qa', 'sheet_other_staff')
    and unresolved_reason is not null;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, new_data,
    change_reason, source, changed_fields
  ) values (
    v_actor, 'CONFIG_CHANGE', 'vmp_item_assignments', 'source_refresh',
    jsonb_build_object('inserted', v_inserted, 'unresolved', v_unresolved),
    'Đối chiếu lại hai cột phân công từ Sheet',
    'sheet_assignment_refresh',
    array['sheet_qa', 'sheet_other_staff']
  );

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'unresolved', v_unresolved
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end
$fn$;

create or replace function public.rpc_resolve_source_item_assignment(
  p_assignment_id uuid,
  p_person_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_assignment public.vmp_item_assignments%rowtype;
  v_person public.vmp_performers%rowtype;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = v_actor and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Chỉ Admin resolve được tên nguồn');
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Bắt buộc nhập lý do resolve');
  end if;

  select * into v_assignment
  from public.vmp_item_assignments
  where id = p_assignment_id
    and source in ('sheet_qa', 'sheet_other_staff');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Không tìm thấy phân công nguồn');
  end if;
  select * into v_person
  from public.vmp_performers
  where id = p_person_id and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Không tìm thấy nhân viên hoạt động');
  end if;

  insert into public.vmp_source_assignment_resolutions (
    validation_code, assignment_kind, source, normalized_source_name,
    performer_id, change_reason, created_by, updated_by
  ) values (
    v_assignment.validation_code,
    v_assignment.assignment_kind,
    v_assignment.source,
    public.vmp_normalize_person_name(coalesce(v_assignment.source_text, v_assignment.staff_name)),
    v_person.id,
    btrim(p_reason),
    v_actor,
    v_actor
  )
  on conflict (validation_code, assignment_kind, source, normalized_source_name)
  do update set performer_id = excluded.performer_id,
                change_reason = excluded.change_reason,
                updated_by = excluded.updated_by;

  update public.vmp_item_assignments
  set performer_id = v_person.id,
      user_id = v_person.user_id,
      staff_name = v_person.performer_name,
      employee_code = v_person.employee_code,
      unresolved_reason = case
        when v_person.user_id is null then 'account_unlinked'
        else null
      end,
      change_reason = btrim(p_reason),
      updated_by = v_actor
  where id = p_assignment_id;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, new_data,
    change_reason, source, changed_fields, validation_code
  ) values (
    v_actor, 'UPDATE', 'vmp_item_assignments', p_assignment_id::text,
    jsonb_build_object('person_id', v_person.id, 'source', v_assignment.source),
    btrim(p_reason), 'dashboard_rpc',
    array['performer_id', 'user_id', 'unresolved_reason'],
    v_assignment.validation_code
  );

  return jsonb_build_object('ok', true, 'person_id', v_person.id);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end
$fn$;

revoke execute on function public.rpc_refresh_source_item_assignments() from public, anon;
revoke execute on function public.rpc_resolve_source_item_assignment(uuid, uuid, text)
  from public, anon;
grant execute on function public.rpc_refresh_source_item_assignments()
  to authenticated, service_role;
grant execute on function public.rpc_resolve_source_item_assignment(uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.vmp_manager_principal(p_uid uuid)
returns table (
  principal_kind text,
  profile_department text,
  performer_department text,
  scope_departments text[],
  access_areas text[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    case
      when profile.role::text = 'admin' then 'admin'
      when profile.role::text = 'qa_manager'
        and profile.department = 'qa'
        and person.access_class = 'qa_manager'
        and person.department = 'qa'
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
$fn$;

create or replace function public.rpc_item_permission_directory(
  p_query text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_principal record;
  v_query text := public.vmp_normalize_person_name(p_query);
  v_people jsonb;
begin
  select * into v_principal from public.vmp_manager_principal(v_actor);
  if v_principal.principal_kind is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Principal quản lý không hợp lệ hoặc không nhất quán'
    );
  end if;

  with candidates as (
    select
      person.*,
      count(*) over (partition by person.normalized_full_name) as same_name_count,
      profile.is_active as account_is_active
    from public.vmp_performers person
    left join public.profiles profile on profile.id = person.user_id
    where person.is_active
      and (
        v_principal.principal_kind = 'admin'
        or (v_principal.principal_kind = 'qa_manager' and person.department = 'qa')
        or (
          v_principal.principal_kind = 'equipment_manager'
          and person.department = v_principal.profile_department
        )
      )
      and (
        v_query = ''
        or person.normalized_full_name like '%' || v_query || '%'
        or lower(coalesce(person.email, '')) like
          '%' || lower(btrim(coalesce(p_query, ''))) || '%'
        or lower(coalesce(person.employee_code, '')) like
          '%' || lower(btrim(coalesce(p_query, ''))) || '%'
      )
  )
  select jsonb_agg(jsonb_build_object(
    'person_id', id,
    'user_id', user_id,
    'employee_code', employee_code,
    'full_name', performer_name,
    'department', department,
    'email', email,
    'account_status', case
      when user_id is null then 'unlinked'
      when coalesce(account_is_active, false) is false then 'inactive'
      else 'linked'
    end,
    'access_class', access_class,
    'scope_departments', scope_departments,
    'access_areas', access_areas,
    'email_sent_confirmed', email_sent_confirmed,
    'is_active', is_active,
    'match_status', case when same_name_count > 1 then 'ambiguous' else 'unique' end
  ) order by performer_name, department, email)
  into v_people
  from candidates;

  return jsonb_build_object('ok', true, 'people', coalesce(v_people, '[]'::jsonb));
end
$fn$;

create or replace function public.rpc_item_assignments(
  p_validation_code text default null,
  p_person_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_principal record;
  v_assignments jsonb;
begin
  select * into v_principal from public.vmp_manager_principal(v_actor);
  if v_principal.principal_kind is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Principal quản lý không hợp lệ hoặc không nhất quán'
    );
  end if;

  select jsonb_agg(jsonb_build_object(
    'assignment_id', assignment.id,
    'validation_code', assignment.validation_code,
    'person_id', assignment.performer_id,
    'user_id', assignment.user_id,
    'staff_name', assignment.staff_name,
    'employee_code', assignment.employee_code,
    'assignment_kind', assignment.assignment_kind,
    'source', assignment.source,
    'source_text', assignment.source_text,
    'unresolved_reason', assignment.unresolved_reason,
    'expires_at', assignment.expires_at,
    'is_active', assignment.is_active,
    'grants_access', active.grants_access,
    'object_department', object.department,
    'area', object.area,
    'line', object.line
  ) order by assignment.validation_code, assignment.assignment_kind, assignment.staff_name)
  into v_assignments
  from public.vmp_item_assignments assignment
  join public.vmp_plan_items item on item.validation_code = assignment.validation_code
  join public.vmp_objects object on object.code = item.object_code
  join public.vmp_active_item_assignments active on active.id = assignment.id
  left join public.vmp_performers target on target.id = assignment.performer_id
  where (p_validation_code is null or assignment.validation_code = p_validation_code)
    and (p_person_id is null or assignment.performer_id = p_person_id)
    and (
      v_principal.principal_kind = 'admin'
      or (
        v_principal.principal_kind = 'qa_manager'
        and assignment.assignment_kind = 'qa'
      )
      or (
        v_principal.principal_kind = 'equipment_manager'
        and target.department = v_principal.profile_department
        and object.department = v_principal.profile_department
        and (
          '*' = any(v_principal.scope_departments)
          or object.department = any(v_principal.scope_departments)
        )
        and (
          '*' = any(v_principal.access_areas)
          or object.area = any(v_principal.access_areas)
          or object.line = any(v_principal.access_areas)
        )
      )
    );

  return jsonb_build_object(
    'ok', true,
    'assignments', coalesce(v_assignments, '[]'::jsonb)
  );
end
$fn$;

revoke execute on function public.vmp_manager_principal(uuid)
  from public, anon, authenticated;
grant execute on function public.vmp_manager_principal(uuid) to service_role;
revoke execute on function public.rpc_item_permission_directory(text) from public, anon;
revoke execute on function public.rpc_item_assignments(text, uuid) from public, anon;
grant execute on function public.rpc_item_permission_directory(text)
  to authenticated, service_role;
grant execute on function public.rpc_item_assignments(text, uuid)
  to authenticated, service_role;

alter function public.rpc_set_item_assignment(uuid, text, text, text, text)
  rename to vmp_set_item_assignment_unhardened;
revoke all on function public.vmp_set_item_assignment_unhardened(uuid, text, text, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.rpc_set_item_assignment(
  p_person_id uuid,
  p_validation_code text,
  p_assignment_kind text,
  p_action text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_principal record;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return public.vmp_set_item_assignment_unhardened(
      p_person_id, p_validation_code, p_assignment_kind, p_action, p_reason
    );
  end if;
  select * into v_principal from public.vmp_manager_principal(auth.uid());
  if v_principal.principal_kind is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Principal quản lý không hợp lệ hoặc không nhất quán'
    );
  end if;
  return public.vmp_set_item_assignment_unhardened(
    p_person_id, p_validation_code, p_assignment_kind, p_action, p_reason
  );
end
$fn$;

revoke execute on function public.rpc_set_item_assignment(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.rpc_set_item_assignment(uuid, text, text, text, text)
  to authenticated, service_role;

create or replace function public.rpc_preview_item_rights(
  p_person_id uuid default null,
  p_validation_code text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_principal record;
  v_rows jsonb;
begin
  select * into v_principal from public.vmp_manager_principal(v_actor);
  if v_principal.principal_kind is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Principal quản lý không hợp lệ hoặc không nhất quán'
    );
  end if;
  if p_person_id is null and p_validation_code is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Chọn một nhân viên hoặc một hạng mục để xem quyền dự kiến'
    );
  end if;

  select jsonb_agg(jsonb_build_object(
    'person_id', person.id,
    'user_id', person.user_id,
    'full_name', person.performer_name,
    'validation_code', item.validation_code,
    'can_view', rights.can_view,
    'editable_fields', rights.editable_fields,
    'view_reason', rights.view_reason,
    'assignment_sources', rights.assignment_sources,
    'scope_match', rights.scope_match,
    'area_match', rights.area_match
  ) order by person.performer_name, item.validation_code)
  into v_rows
  from public.vmp_performers person
  cross join public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  cross join lateral public.vmp_item_rights(person.user_id, item.validation_code) rights
  where person.is_active and item.is_active
    and (p_person_id is null or person.id = p_person_id)
    and (p_validation_code is null or item.validation_code = p_validation_code)
    and (
      v_principal.principal_kind = 'admin'
      or (
        v_principal.principal_kind = 'qa_manager'
        and person.department = 'qa'
      )
      or (
        v_principal.principal_kind = 'equipment_manager'
        and person.department = v_principal.profile_department
        and object.department = v_principal.profile_department
        and (
          '*' = any(v_principal.scope_departments)
          or object.department = any(v_principal.scope_departments)
        )
        and (
          '*' = any(v_principal.access_areas)
          or object.area = any(v_principal.access_areas)
          or object.line = any(v_principal.access_areas)
        )
      )
    );

  return jsonb_build_object(
    'ok', true,
    'mode', public.item_permissions_mode(),
    'rights', coalesce(v_rows, '[]'::jsonb)
  );
end
$fn$;

revoke execute on function public.rpc_preview_item_rights(uuid, text) from public, anon;
grant execute on function public.rpc_preview_item_rights(uuid, text)
  to authenticated, service_role;

create or replace function public.vmp_item_rights(
  p_uid uuid,
  p_validation_code text
) returns table (
  can_view boolean,
  editable_fields text[],
  view_reason text,
  assignment_sources text[],
  scope_match boolean,
  area_match boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text;
  v_profile_department text;
  v_person_id uuid;
  v_person_department text;
  v_access_class text;
  v_scope text[];
  v_areas text[];
  v_object_department text;
  v_object_area text;
  v_object_line text;
  v_sources text[] := '{}'::text[];
  v_has_any_assignment boolean := false;
  v_has_qa_assignment boolean := false;
  v_has_equipment_assignment boolean := false;
  v_can_view boolean := false;
  v_fields text[] := '{}'::text[];
  v_reason text := 'Không xác định được quyền';
  v_scope_match boolean := false;
  v_area_match boolean := false;
begin
  select profile.role::text, profile.department
  into v_role, v_profile_department
  from public.profiles profile
  where profile.id = p_uid and coalesce(profile.is_active, true);

  if v_role is null then
    return query select false, '{}'::text[],
      'Tài khoản không tồn tại hoặc đã ngừng hoạt động',
      '{}'::text[], false, false;
    return;
  end if;

  select person.id, person.department, person.access_class,
         person.scope_departments, person.access_areas
  into v_person_id, v_person_department, v_access_class, v_scope, v_areas
  from public.vmp_performers person
  where person.user_id = p_uid and person.is_active;

  select object.department, object.area, object.line
  into v_object_department, v_object_area, v_object_line
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  where item.validation_code = p_validation_code and item.is_active;

  if not found then
    return query select false, '{}'::text[],
      'Không tìm thấy hạng mục hoạt động', '{}'::text[], false, false;
    return;
  end if;

  if v_role = 'admin' then
    return query select
      true,
      array[
        'actual_protocol_date', 'status_protocol',
        'actual_validation_date', 'status_validation',
        'actual_report_date', 'status_report',
        'actual_vmp_date', 'status_vmp',
        'scheduled_at'
      ]::text[],
      'Admin quản trị toàn hệ thống',
      array['system_admin']::text[],
      true,
      true;
    return;
  end if;

  if v_person_id is null then
    return query select false, '{}'::text[],
      'Tài khoản chưa nối với danh bạ nhân sự', '{}'::text[], false, false;
    return;
  end if;

  if (v_role = 'qa_manager' or v_access_class in ('qa_manager', 'equipment_manager'))
      and not (
        (
          v_role = 'qa_manager'
          and v_profile_department = 'qa'
          and v_access_class = 'qa_manager'
          and v_person_department = 'qa'
        )
        or (
          v_role = 'department_user'
          and nullif(btrim(coalesce(v_profile_department, '')), '') is not null
          and v_access_class = 'equipment_manager'
          and v_person_department = v_profile_department
        )
      ) then
    return query select false, '{}'::text[],
      'Principal quản lý không hợp lệ hoặc không nhất quán',
      '{}'::text[], false, false;
    return;
  end if;

  v_scope_match := coalesce('*' = any(v_scope), false)
    or coalesce(v_object_department = any(v_scope), false);
  v_area_match := coalesce('*' = any(v_areas), false)
    or coalesce(v_object_area = any(v_areas), false)
    or coalesce(v_object_line = any(v_areas), false);

  select
    coalesce(array_agg(distinct assignment.source order by assignment.source), '{}'::text[]),
    coalesce(bool_or(assignment.grants_access), false),
    coalesce(bool_or(
      assignment.grants_access and assignment.assignment_kind = 'qa'
    ), false),
    coalesce(bool_or(
      assignment.grants_access
      and assignment.assignment_kind = 'equipment_department'
    ), false)
  into v_sources, v_has_any_assignment,
       v_has_qa_assignment, v_has_equipment_assignment
  from public.vmp_active_item_assignments assignment
  where assignment.validation_code = p_validation_code
    and assignment.user_id = p_uid;

  if not v_scope_match then
    v_reason := 'Hạng mục nằm ngoài phạm vi bộ phận được cấp';
  elsif not v_area_match then
    v_reason := 'Hạng mục nằm ngoài khu vực/line được cấp';
  elsif v_role = 'qa_manager' and v_access_class = 'qa_manager' then
    v_can_view := true;
    v_reason := 'Quản lý QA trong phạm vi/khu vực được cấp';
  elsif v_role = 'department_user'
      and v_access_class = 'equipment_manager'
      and v_person_department = v_profile_department then
    v_can_view := v_object_department = v_profile_department;
    v_reason := case when v_can_view
      then 'Quản lý bộ phận quản lý thiết bị của hạng mục'
      else 'Hạng mục do bộ phận khác quản lý'
    end;
  elsif v_access_class = 'qa_progress_editor' then
    v_can_view := v_has_qa_assignment;
    v_reason := case when v_can_view
      then 'Có phân công QA, đúng phạm vi và khu vực'
      else 'Chưa có phân công QA đang hoạt động'
    end;
  elsif v_access_class = 'equipment_scheduler' then
    v_can_view := v_has_equipment_assignment
      and v_object_department = coalesce(v_person_department, v_profile_department);
    v_reason := case when v_can_view
      then 'Có phân công xếp lịch, đúng bộ phận quản lý, phạm vi và khu vực'
      else 'Chưa có phân công hợp lệ hoặc không thuộc bộ phận quản lý hạng mục'
    end;
  elsif v_access_class = 'view_only' then
    v_can_view := v_has_any_assignment;
    v_reason := case when v_can_view
      then 'Có phân công, đúng phạm vi và khu vực; phân loại chỉ xem'
      else 'Chưa có phân công đang hoạt động'
    end;
  else
    v_reason := 'Nhân viên chưa được cấp phân loại quyền';
  end if;

  if v_can_view and v_access_class in ('qa_progress_editor', 'qa_manager') then
    v_fields := array[
      'actual_protocol_date', 'status_protocol',
      'actual_validation_date', 'status_validation',
      'actual_report_date', 'status_report',
      'actual_vmp_date', 'status_vmp'
    ]::text[];
  elsif v_can_view and v_access_class in ('equipment_scheduler', 'equipment_manager') then
    v_fields := array['scheduled_at']::text[];
  end if;

  return query select
    v_can_view, v_fields, v_reason, v_sources, v_scope_match, v_area_match;
end
$fn$;

revoke execute on function public.vmp_item_rights(uuid, text) from public, anon;
grant execute on function public.vmp_item_rights(uuid, text)
  to authenticated, service_role;

revoke select on public.vmp_item_assignments from authenticated, anon;
revoke select on public.vmp_active_item_assignments from authenticated, anon;
grant select on public.vmp_item_assignments to service_role;
grant select on public.vmp_active_item_assignments to service_role;

do $verify$
begin
  if public.item_permissions_mode() <> 'preview' then
    raise exception 'Migration siết quyền không được tự bật enforced';
  end if;
  if has_table_privilege('authenticated', 'public.vmp_item_assignments', 'SELECT')
      or has_table_privilege('authenticated', 'public.vmp_active_item_assignments', 'SELECT')
      or has_table_privilege('anon', 'public.vmp_item_assignments', 'SELECT')
      or has_table_privilege('anon', 'public.vmp_active_item_assignments', 'SELECT') then
    raise exception 'Browser role vẫn SELECT trực tiếp phân công';
  end if;
end
$verify$;

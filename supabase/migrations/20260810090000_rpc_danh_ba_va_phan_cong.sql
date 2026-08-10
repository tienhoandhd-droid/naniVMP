/* =====================================================================
 * RPC danh bạ nhân sự & quyền. Mọi thay đổi đi qua server validation và
 * audit; client không ghi trực tiếp bảng vmp_performers.
 * ===================================================================== */

create or replace function public.vmp_jsonb_text_array(
  p_value jsonb,
  p_key text
) returns text[]
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(value order by value), '{}'::text[])
  from (
    select distinct btrim(item) as value
    from jsonb_array_elements_text(coalesce(p_value -> p_key, '[]'::jsonb)) item
    where nullif(btrim(item), '') is not null
  ) normalized
$fn$;

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
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_old public.vmp_performers%rowtype;
  v_person_id uuid := p_person_id;
  v_full_name text;
  v_employee_code text;
  v_department text;
  v_access_class text;
  v_email text;
  v_user_id uuid;
  v_scope text[];
  v_areas text[];
  v_is_active boolean;
  v_email_sent boolean;
  v_new jsonb;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = v_actor and coalesce(is_active, true);

  if v_actor_role <> 'admin' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Chỉ Admin được sửa hồ sơ trong danh bạ nhân sự & quyền'
    );
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Bắt buộc nhập lý do thay đổi');
  end if;

  if v_person_id is not null then
    select * into v_old
    from public.vmp_performers
    where id = v_person_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'Không tìm thấy nhân viên cần sửa');
    end if;
  end if;

  v_full_name := case
    when p_patch ? 'full_name' then nullif(btrim(p_patch ->> 'full_name'), '')
    else v_old.performer_name
  end;
  v_employee_code := case
    when p_patch ? 'employee_code' then nullif(btrim(p_patch ->> 'employee_code'), '')
    else v_old.employee_code
  end;
  v_department := case
    when p_patch ? 'department' then lower(nullif(btrim(p_patch ->> 'department'), ''))
    else v_old.department
  end;
  v_access_class := case
    when p_patch ? 'access_class' then nullif(btrim(p_patch ->> 'access_class'), '')
    else v_old.access_class
  end;
  v_email := case
    when p_patch ? 'email' then lower(nullif(btrim(p_patch ->> 'email'), ''))
    else v_old.email
  end;
  v_scope := case
    when p_patch ? 'scope_departments' then public.vmp_jsonb_text_array(p_patch, 'scope_departments')
    else v_old.scope_departments
  end;
  v_areas := case
    when p_patch ? 'access_areas' then public.vmp_jsonb_text_array(p_patch, 'access_areas')
    else v_old.access_areas
  end;
  v_is_active := case
    when p_patch ? 'is_active' then (p_patch ->> 'is_active')::boolean
    else coalesce(v_old.is_active, true)
  end;
  v_email_sent := case
    when p_patch ? 'email_sent_confirmed' then (p_patch ->> 'email_sent_confirmed')::boolean
    else coalesce(v_old.email_sent_confirmed, false)
  end;

  if v_full_name is null then
    return jsonb_build_object('ok', false, 'error', 'Phải nhập Họ và tên');
  end if;
  if v_email is not null
      and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'Email không đúng định dạng: ' || v_email);
  end if;
  if v_access_class is not null and v_access_class not in (
    'view_only', 'qa_progress_editor', 'qa_manager',
    'equipment_scheduler', 'equipment_manager'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Phân loại quyền không hợp lệ');
  end if;
  if v_access_class in ('qa_progress_editor', 'qa_manager')
      and v_department is distinct from 'qa' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Phân loại QA chỉ cấp cho nhân viên thuộc bộ phận QA'
    );
  end if;
  if v_is_active and (
    v_department is null
    or v_access_class is null
    or coalesce(cardinality(v_scope), 0) = 0
    or coalesce(cardinality(v_areas), 0) = 0
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Nhân viên hoạt động phải có bộ phận, phân loại, phạm vi và khu vực'
    );
  end if;

  if v_email is not null then
    select id into v_user_id
    from public.profiles
    where lower(btrim(email)) = v_email
    order by created_at
    limit 1;

    if v_user_id is not null and exists (
      select 1
      from public.vmp_performers
      where user_id = v_user_id and id is distinct from v_person_id
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'Email/tài khoản này đã nối với một nhân viên khác'
      );
    end if;
  end if;

  if v_person_id is null then
    insert into public.vmp_performers (
      performer_name, employee_code, email, department, user_id,
      access_class, scope_departments, access_areas,
      email_sent_confirmed, is_active, updated_by
    ) values (
      v_full_name, v_employee_code, v_email, v_department, v_user_id,
      v_access_class, v_scope, v_areas,
      v_email_sent, v_is_active, v_actor
    )
    returning id into v_person_id;

    select to_jsonb(person) into v_new
    from public.vmp_performers person
    where id = v_person_id;

    insert into public.audit_logs (
      user_id, action, table_name, record_id, new_data,
      change_reason, source, changed_fields
    ) values (
      v_actor, 'INSERT', 'vmp_performers', v_person_id::text, v_new,
      btrim(p_reason), 'dashboard_rpc', array(
        select jsonb_object_keys(p_patch)
      )
    );
  else
    update public.vmp_performers
    set performer_name = v_full_name,
        employee_code = v_employee_code,
        email = v_email,
        department = v_department,
        user_id = v_user_id,
        access_class = v_access_class,
        scope_departments = v_scope,
        access_areas = v_areas,
        email_sent_confirmed = v_email_sent,
        is_active = v_is_active,
        updated_by = v_actor
    where id = v_person_id;

    select to_jsonb(person) into v_new
    from public.vmp_performers person
    where id = v_person_id;

    insert into public.audit_logs (
      user_id, action, table_name, record_id, old_data, new_data,
      change_reason, source, changed_fields
    ) values (
      v_actor, 'UPDATE', 'vmp_performers', v_person_id::text,
      to_jsonb(v_old), v_new, btrim(p_reason), 'dashboard_rpc', array(
        select jsonb_object_keys(p_patch)
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'person_id', v_person_id,
    'user_id', v_user_id,
    'account_status', case when v_user_id is null then 'unlinked' else 'linked' end
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'error', 'Mã nhân viên đã tồn tại: ' || coalesce(v_employee_code, '')
    );
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end
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
  v_actor_role text;
  v_actor_department text;
  v_actor_class text;
  v_query text := public.vmp_normalize_person_name(p_query);
  v_people jsonb;
begin
  select profile.role::text, profile.department, performer.access_class
    into v_actor_role, v_actor_department, v_actor_class
  from public.profiles profile
  left join public.vmp_performers performer on performer.user_id = profile.id
  where profile.id = v_actor and coalesce(profile.is_active, true);

  if v_actor_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if v_actor_role not in ('admin', 'qa_manager')
      and v_actor_class not in ('qa_manager', 'equipment_manager') then
    return jsonb_build_object(
      'ok', false,
      'error', 'Chỉ Admin hoặc quản lý được xem danh bạ nhân sự & quyền'
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
        v_actor_role in ('admin', 'qa_manager')
        or v_actor_class = 'qa_manager'
        or person.department = v_actor_department
      )
      and (
        v_query = ''
        or person.normalized_full_name like '%' || v_query || '%'
        or lower(coalesce(person.email, '')) like '%' || lower(btrim(coalesce(p_query, ''))) || '%'
        or lower(coalesce(person.employee_code, '')) like '%' || lower(btrim(coalesce(p_query, ''))) || '%'
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
  v_patch jsonb;
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

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_patch := v_row - 'row_number';
    v_result := public.rpc_upsert_item_permission_staff(null, v_patch, p_reason);
    if coalesce((v_result ->> 'ok')::boolean, false) then
      v_imported := v_imported + 1;
    else
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'row_number', v_row -> 'row_number',
        'error', v_result ->> 'error'
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'imported', v_imported,
    'errors', v_errors
  );
end
$fn$;

revoke execute on function public.vmp_jsonb_text_array(jsonb, text) from public, anon;
revoke execute on function public.rpc_upsert_item_permission_staff(uuid, jsonb, text) from public, anon;
revoke execute on function public.rpc_item_permission_directory(text) from public, anon;
revoke execute on function public.rpc_import_item_permission_staff(jsonb, text) from public, anon;

grant execute on function public.vmp_jsonb_text_array(jsonb, text) to authenticated, service_role;
grant execute on function public.rpc_upsert_item_permission_staff(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.rpc_item_permission_directory(text) to authenticated, service_role;
grant execute on function public.rpc_import_item_permission_staff(jsonb, text) to authenticated, service_role;

do $verify$
begin
  if has_function_privilege(
    'anon',
    'public.rpc_upsert_item_permission_staff(uuid,jsonb,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.rpc_item_permission_directory(text)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.rpc_import_item_permission_staff(jsonb,text)',
    'EXECUTE'
  ) then
    raise exception 'anon vẫn gọi được RPC danh bạ phân quyền';
  end if;
end
$verify$;

/* ---------------------------------------------------------------------
 * Đối chiếu hai cột người trong Sheet với danh bạ chuẩn. Refresh chỉ thay
 * hai nguồn Sheet; phân công tay của quản lý giữ nguyên.
 * ------------------------------------------------------------------- */
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
      and current_user not in ('postgres', 'service_role')
      and v_actor_role <> 'admin' then
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
      ) as staff_name
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
    select *
    from source_names
    where staff_name is not null
      and staff_name !~ '^[-–—.·[:space:]]+$'
      and lower(staff_name) <> '(chưa phân công)'
  ), matched as (
    select
      source.*,
      match.match_count,
      match.performer_id,
      match.user_id,
      match.employee_code
    from valid_sources source
    left join lateral (
      select
        count(*)::integer as match_count,
        case when count(*) = 1 then (array_agg(person.id order by person.id))[1] end as performer_id,
        case when count(*) = 1 then (array_agg(person.user_id order by person.id))[1] end as user_id,
        case when count(*) = 1 then (array_agg(person.employee_code order by person.id))[1] end as employee_code
      from public.vmp_performers person
      where person.is_active
        and person.normalized_full_name = public.vmp_normalize_person_name(source.staff_name)
    ) match on true
  )
  insert into public.vmp_item_assignments (
    validation_code, performer_id, user_id, staff_name, employee_code,
    assignment_kind, source, source_text, unresolved_reason,
    is_active, change_reason, created_by, updated_by
  )
  select
    validation_code,
    performer_id,
    user_id,
    staff_name,
    employee_code,
    assignment_kind,
    source,
    staff_name,
    case
      when match_count = 0 then 'not_found'
      when match_count > 1 then 'duplicate_name'
      when user_id is null then 'account_unlinked'
      else null
    end,
    true,
    'Đồng bộ phân công từ dữ liệu Sheet',
    v_actor,
    v_actor
  from matched;
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
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_department text;
  v_actor_class text;
  v_actor_scope text[];
  v_actor_areas text[];
  v_target public.vmp_performers%rowtype;
  v_object_department text;
  v_object_area text;
  v_object_line text;
  v_source text;
  v_scope_match boolean;
  v_area_match boolean;
begin
  select
    profile.role::text,
    profile.department,
    performer.access_class,
    performer.scope_departments,
    performer.access_areas
  into
    v_actor_role,
    v_actor_department,
    v_actor_class,
    v_actor_scope,
    v_actor_areas
  from public.profiles profile
  left join public.vmp_performers performer on performer.user_id = profile.id
  where profile.id = v_actor and coalesce(profile.is_active, true);

  if v_actor_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Bắt buộc nhập lý do phân công');
  end if;
  if p_assignment_kind not in ('qa', 'equipment_department') then
    return jsonb_build_object('ok', false, 'error', 'Loại phân công không hợp lệ');
  end if;
  if p_action not in ('assign', 'revoke') then
    return jsonb_build_object('ok', false, 'error', 'Hành động chỉ nhận assign hoặc revoke');
  end if;

  select * into v_target
  from public.vmp_performers
  where id = p_person_id and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Không tìm thấy nhân viên hoạt động');
  end if;

  select object.department, object.area, object.line
  into v_object_department, v_object_area, v_object_line
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  where item.validation_code = p_validation_code and item.is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Không tìm thấy hạng mục thẩm định');
  end if;

  v_scope_match := coalesce('*' = any(v_actor_scope), false)
    or coalesce(v_object_department = any(v_actor_scope), false);
  v_area_match := coalesce('*' = any(v_actor_areas), false)
    or coalesce(v_object_area = any(v_actor_areas), false)
    or coalesce(v_object_line = any(v_actor_areas), false);

  if v_actor_role <> 'admin' then
    if v_actor_class = 'qa_manager' or v_actor_role = 'qa_manager' then
      if p_assignment_kind <> 'qa' then
        return jsonb_build_object('ok', false, 'error', 'Quản lý QA chỉ phân công loại QA');
      end if;
      if v_target.department <> 'qa'
          or v_target.access_class not in ('qa_progress_editor', 'qa_manager') then
        return jsonb_build_object('ok', false, 'error', 'Chỉ phân công được nhân viên QA hợp lệ');
      end if;
      if not coalesce(v_scope_match, false) or not coalesce(v_area_match, false) then
        return jsonb_build_object('ok', false, 'error', 'Hạng mục ngoài phạm vi/khu vực quản lý QA');
      end if;
    elsif v_actor_class = 'equipment_manager' then
      if p_assignment_kind <> 'equipment_department' then
        return jsonb_build_object(
          'ok', false, 'error', 'Quản lý bộ phận thiết bị chỉ phân công nhân sự bộ phận'
        );
      end if;
      if v_actor_department is null
          or v_target.department is distinct from v_actor_department
          or v_object_department is distinct from v_actor_department then
        return jsonb_build_object(
          'ok', false,
          'error', 'Chỉ phân công người cùng bộ phận cho hạng mục do bộ phận mình quản lý'
        );
      end if;
      if not coalesce(v_scope_match, false) or not coalesce(v_area_match, false) then
        return jsonb_build_object('ok', false, 'error', 'Hạng mục ngoài phạm vi/khu vực quản lý');
      end if;
    else
      return jsonb_build_object('ok', false, 'error', 'Bạn không có quyền phân công hạng mục');
    end if;
  end if;

  v_source := case
    when p_assignment_kind = 'qa' then 'qa_manager'
    else 'equipment_manager'
  end;

  if p_action = 'revoke' then
    update public.vmp_item_assignments
    set is_active = false,
        change_reason = btrim(p_reason),
        updated_by = v_actor
    where validation_code = p_validation_code
      and performer_id = p_person_id
      and assignment_kind = p_assignment_kind
      and source = v_source;
  else
    insert into public.vmp_item_assignments (
      validation_code, performer_id, user_id, staff_name, employee_code,
      assignment_kind, source, source_text, unresolved_reason,
      is_active, change_reason, created_by, updated_by
    ) values (
      p_validation_code, v_target.id, v_target.user_id,
      v_target.performer_name, v_target.employee_code,
      p_assignment_kind, v_source, v_target.performer_name,
      case when v_target.user_id is null then 'account_unlinked' else null end,
      true, btrim(p_reason), v_actor, v_actor
    )
    on conflict (validation_code, performer_id, assignment_kind, source)
      where performer_id is not null
    do update set
      user_id = excluded.user_id,
      staff_name = excluded.staff_name,
      employee_code = excluded.employee_code,
      source_text = excluded.source_text,
      unresolved_reason = excluded.unresolved_reason,
      is_active = true,
      change_reason = excluded.change_reason,
      updated_by = excluded.updated_by;
  end if;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, new_data,
    change_reason, source, changed_fields, validation_code
  ) values (
    v_actor,
    case when p_action = 'revoke' then 'DELETE'::public.audit_action else 'UPDATE'::public.audit_action end,
    'vmp_item_assignments',
    p_validation_code || '×' || p_person_id::text,
    jsonb_build_object(
      'person_id', p_person_id,
      'assignment_kind', p_assignment_kind,
      'source', v_source,
      'is_active', p_action = 'assign'
    ),
    btrim(p_reason),
    'dashboard_rpc',
    array['is_active'],
    p_validation_code
  );

  return jsonb_build_object(
    'ok', true,
    'action', p_action,
    'source', v_source,
    'account_status', case when v_target.user_id is null then 'unlinked' else 'linked' end
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
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
  v_actor_role text;
  v_actor_department text;
  v_actor_class text;
  v_assignments jsonb;
begin
  select profile.role::text, profile.department, performer.access_class
  into v_actor_role, v_actor_department, v_actor_class
  from public.profiles profile
  left join public.vmp_performers performer on performer.user_id = profile.id
  where profile.id = v_actor and coalesce(profile.is_active, true);

  if v_actor_role not in ('admin', 'qa_manager')
      and v_actor_class not in ('qa_manager', 'equipment_manager') then
    return jsonb_build_object('ok', false, 'error', 'Bạn không có quyền xem phân công hạng mục');
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
  where (p_validation_code is null or assignment.validation_code = p_validation_code)
    and (p_person_id is null or assignment.performer_id = p_person_id)
    and (
      v_actor_role in ('admin', 'qa_manager')
      or v_actor_class = 'qa_manager'
      or object.department = v_actor_department
    );

  return jsonb_build_object(
    'ok', true,
    'assignments', coalesce(v_assignments, '[]'::jsonb)
  );
end
$fn$;

revoke execute on function public.rpc_refresh_source_item_assignments() from public, anon;
revoke execute on function public.rpc_set_item_assignment(uuid, text, text, text, text) from public, anon;
revoke execute on function public.rpc_item_assignments(text, uuid) from public, anon;

grant execute on function public.rpc_refresh_source_item_assignments() to authenticated, service_role;
grant execute on function public.rpc_set_item_assignment(uuid, text, text, text, text) to authenticated, service_role;
grant execute on function public.rpc_item_assignments(text, uuid) to authenticated, service_role;

do $verify_assignments$
begin
  if has_function_privilege(
    'anon', 'public.rpc_refresh_source_item_assignments()', 'EXECUTE'
  ) or has_function_privilege(
    'anon', 'public.rpc_set_item_assignment(uuid,text,text,text,text)', 'EXECUTE'
  ) or has_function_privilege(
    'anon', 'public.rpc_item_assignments(text,uuid)', 'EXECUTE'
  ) then
    raise exception 'anon vẫn gọi được RPC phân công theo hạng mục';
  end if;
end
$verify_assignments$;

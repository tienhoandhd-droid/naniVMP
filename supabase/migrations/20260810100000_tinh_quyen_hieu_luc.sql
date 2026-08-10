/* =====================================================================
 * Một lõi tính quyền cho UI preview, RPC ghi và RLS enforced.
 * ===================================================================== */

create or replace function public.item_permissions_mode()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce((
    select value #>> '{}'
    from public.system_config
    where key = 'item_permissions_mode'
  ), 'preview')
$fn$;

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
    return query select false, '{}'::text[], 'Tài khoản không tồn tại hoặc đã ngừng hoạt động',
      '{}'::text[], false, false;
    return;
  end if;

  select
    person.id,
    person.department,
    person.access_class,
    person.scope_departments,
    person.access_areas
  into
    v_person_id,
    v_person_department,
    v_access_class,
    v_scope,
    v_areas
  from public.vmp_performers person
  where person.user_id = p_uid and person.is_active;

  select object.department, object.area, object.line
  into v_object_department, v_object_area, v_object_line
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  where item.validation_code = p_validation_code and item.is_active;

  if not found then
    return query select false, '{}'::text[], 'Không tìm thấy hạng mục hoạt động',
      '{}'::text[], false, false;
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
    return query select false, '{}'::text[], 'Tài khoản chưa nối với danh bạ nhân sự',
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
    coalesce(bool_or(assignment.grants_access and assignment.assignment_kind = 'qa'), false),
    coalesce(bool_or(assignment.grants_access and assignment.assignment_kind = 'equipment_department'), false)
  into
    v_sources,
    v_has_any_assignment,
    v_has_qa_assignment,
    v_has_equipment_assignment
  from public.vmp_active_item_assignments assignment
  where assignment.validation_code = p_validation_code
    and assignment.user_id = p_uid;

  if not v_scope_match then
    v_reason := 'Hạng mục nằm ngoài phạm vi bộ phận được cấp';
  elsif not v_area_match then
    v_reason := 'Hạng mục nằm ngoài khu vực/line được cấp';
  elsif v_access_class = 'qa_manager' or v_role = 'qa_manager' then
    v_can_view := true;
    v_reason := 'Quản lý QA trong phạm vi/khu vực được cấp';
  elsif v_access_class = 'equipment_manager' then
    v_can_view := v_object_department = coalesce(v_person_department, v_profile_department);
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
    v_can_view,
    v_fields,
    v_reason,
    v_sources,
    v_scope_match,
    v_area_match;
end
$fn$;

create or replace function public.vmp_can_view_item(
  p_uid uuid,
  p_validation_code text
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce((
    select rights.can_view
    from public.vmp_item_rights(p_uid, p_validation_code) rights
  ), false)
$fn$;

create or replace function public.vmp_allowed_timeline_fields(
  p_uid uuid,
  p_validation_code text
) returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce((
    select rights.editable_fields
    from public.vmp_item_rights(p_uid, p_validation_code) rights
  ), '{}'::text[])
$fn$;

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
  v_actor_role text;
  v_actor_class text;
  v_rows jsonb;
begin
  select profile.role::text, performer.access_class
  into v_actor_role, v_actor_class
  from public.profiles profile
  left join public.vmp_performers performer on performer.user_id = profile.id
  where profile.id = v_actor and coalesce(profile.is_active, true);

  if v_actor_role not in ('admin', 'qa_manager')
      and v_actor_class not in ('qa_manager', 'equipment_manager') then
    return jsonb_build_object('ok', false, 'error', 'Bạn không có quyền xem quyền dự kiến');
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
  cross join lateral public.vmp_item_rights(person.user_id, item.validation_code) rights
  where person.is_active and item.is_active
    and (p_person_id is null or person.id = p_person_id)
    and (p_validation_code is null or item.validation_code = p_validation_code);

  return jsonb_build_object(
    'ok', true,
    'mode', public.item_permissions_mode(),
    'rights', coalesce(v_rows, '[]'::jsonb)
  );
end
$fn$;

create or replace function public.rpc_item_permission_preflight()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor_role text;
  v_blocking jsonb;
  v_warnings jsonb;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = auth.uid() and coalesce(is_active, true);
  if v_actor_role <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Chỉ Admin chạy được tiền kiểm');
  end if;

  with errors as (
    select jsonb_build_object(
      'code', 'INCOMPLETE_ACTIVE_PERSON',
      'record_id', person.id,
      'message', 'Nhân viên hoạt động thiếu bộ phận, phân loại, phạm vi hoặc khu vực'
    ) as error
    from public.vmp_performers person
    where person.is_active and (
      nullif(btrim(person.performer_name), '') is null
      or nullif(btrim(coalesce(person.department, '')), '') is null
      or person.access_class is null
      or cardinality(person.scope_departments) = 0
      or cardinality(person.access_areas) = 0
    )

    union all

    select jsonb_build_object(
      'code', 'DUPLICATE_NORMALIZED_NAME',
      'record_id', duplicate.normalized_full_name,
      'message', 'Tên trùng phải được nối tay trước khi bật quyền'
    )
    from (
      select normalized_full_name
      from public.vmp_performers
      where is_active
      group by normalized_full_name
      having count(*) > 1
    ) duplicate

    union all

    select jsonb_build_object(
      'code', 'UNRESOLVED_ASSIGNMENT',
      'record_id', assignment.id,
      'message', 'Phân công chưa nối duy nhất với tài khoản'
    )
    from public.vmp_item_assignments assignment
    where assignment.is_active and assignment.unresolved_reason is not null

    union all

    select jsonb_build_object(
      'code', 'INVALID_QA_CLASS_DEPARTMENT',
      'record_id', person.id,
      'message', 'Phân loại QA đang cấp cho người ngoài QA'
    )
    from public.vmp_performers person
    where person.is_active
      and person.access_class in ('qa_progress_editor', 'qa_manager')
      and person.department is distinct from 'qa'

    union all

    select jsonb_build_object(
      'code', 'ITEM_MISSING_PERMISSION_DIMENSION',
      'record_id', item.validation_code,
      'message', 'Hạng mục thiếu bộ phận quản lý hoặc khu vực/line'
    )
    from public.vmp_plan_items item
    join public.vmp_objects object on object.code = item.object_code
    where item.is_active and (
      nullif(btrim(coalesce(object.department, '')), '') is null
      or (
        nullif(btrim(coalesce(object.area, '')), '') is null
        and nullif(btrim(coalesce(object.line, '')), '') is null
      )
    )
  )
  select jsonb_agg(error) into v_blocking from errors;

  with warnings as (
    select jsonb_build_object(
      'code', 'EMPLOYEE_CODE_MISSING',
      'record_id', person.id,
      'message', 'Mã nhân viên chưa có; được phép bổ sung sau'
    ) as warning
    from public.vmp_performers person
    where person.is_active and nullif(btrim(coalesce(person.employee_code, '')), '') is null
  )
  select jsonb_agg(warning) into v_warnings from warnings;

  return jsonb_build_object(
    'ok', true,
    'mode', public.item_permissions_mode(),
    'blocking_errors', coalesce(v_blocking, '[]'::jsonb),
    'warnings', coalesce(v_warnings, '[]'::jsonb)
  );
end
$fn$;

create or replace function public.rpc_set_item_permissions_mode(
  p_mode text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_old_mode text := public.item_permissions_mode();
  v_preflight jsonb;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = v_actor and coalesce(is_active, true);
  if v_actor_role <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Chỉ Admin đổi được chế độ phân quyền');
  end if;
  if p_mode not in ('preview', 'enforced') then
    return jsonb_build_object('ok', false, 'error', 'Chế độ chỉ nhận preview hoặc enforced');
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Bắt buộc nhập lý do đổi chế độ');
  end if;

  if p_mode = 'enforced' then
    v_preflight := public.rpc_item_permission_preflight();
    if jsonb_array_length(coalesce(v_preflight->'blocking_errors', '[]'::jsonb)) > 0 then
      return jsonb_build_object(
        'ok', false,
        'error', 'Chưa thể bật áp dụng vì tiền kiểm còn lỗi bắt buộc',
        'preflight', v_preflight
      );
    end if;
  end if;

  update public.system_config
  set value = to_jsonb(p_mode), updated_by = v_actor, updated_at = now()
  where key = 'item_permissions_mode';

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields
  ) values (
    v_actor, 'CONFIG_CHANGE', 'system_config', 'item_permissions_mode',
    jsonb_build_object('mode', v_old_mode),
    jsonb_build_object('mode', p_mode),
    btrim(p_reason), 'dashboard_rpc', array['value']
  );

  return jsonb_build_object('ok', true, 'mode', p_mode);
end
$fn$;

revoke execute on function public.item_permissions_mode() from public, anon;
revoke execute on function public.vmp_item_rights(uuid, text) from public, anon;
revoke execute on function public.vmp_can_view_item(uuid, text) from public, anon;
revoke execute on function public.vmp_allowed_timeline_fields(uuid, text) from public, anon;
revoke execute on function public.rpc_preview_item_rights(uuid, text) from public, anon;
revoke execute on function public.rpc_item_permission_preflight() from public, anon;
revoke execute on function public.rpc_set_item_permissions_mode(text, text) from public, anon;

grant execute on function public.item_permissions_mode() to authenticated, service_role;
grant execute on function public.vmp_item_rights(uuid, text) to authenticated, service_role;
grant execute on function public.vmp_can_view_item(uuid, text) to authenticated, service_role;
grant execute on function public.vmp_allowed_timeline_fields(uuid, text) to authenticated, service_role;
grant execute on function public.rpc_preview_item_rights(uuid, text) to authenticated, service_role;
grant execute on function public.rpc_item_permission_preflight() to authenticated, service_role;
grant execute on function public.rpc_set_item_permissions_mode(text, text) to authenticated, service_role;

do $verify$
begin
  if public.item_permissions_mode() <> 'preview' then
    raise exception 'Migration lõi quyền không được tự bật enforced';
  end if;
  if has_function_privilege(
    'anon', 'public.rpc_set_item_permissions_mode(text,text)', 'EXECUTE'
  ) or has_function_privilege(
    'anon', 'public.rpc_preview_item_rights(uuid,text)', 'EXECUTE'
  ) then
    raise exception 'anon vẫn gọi được RPC quyền hiệu lực';
  end if;
end
$verify$;

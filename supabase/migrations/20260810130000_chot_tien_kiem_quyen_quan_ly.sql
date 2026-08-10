/* 1200 bổ sung audit reader và thay preflight; override cuối giữ toàn bộ audit đó. */

create or replace function public.vmp_my_item_rights(p_validation_code text)
returns table (
  can_view boolean,
  editable_fields text[],
  view_reason text,
  assignment_sources text[],
  scope_match boolean,
  area_match boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select * from public.vmp_item_rights(auth.uid(), p_validation_code)
$fn$;

create or replace function public.vmp_can_view_my_item(p_validation_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select public.vmp_can_view_item(auth.uid(), p_validation_code)
$fn$;

revoke execute on function public.vmp_item_rights(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.vmp_can_view_item(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.vmp_allowed_timeline_fields(uuid, text)
  from public, anon, authenticated;
grant execute on function public.vmp_item_rights(uuid, text) to service_role;
grant execute on function public.vmp_can_view_item(uuid, text) to service_role;
grant execute on function public.vmp_allowed_timeline_fields(uuid, text) to service_role;

revoke execute on function public.vmp_my_item_rights(text) from public, anon;
revoke execute on function public.vmp_can_view_my_item(text) from public, anon;
grant execute on function public.vmp_my_item_rights(text)
  to authenticated, service_role;
grant execute on function public.vmp_can_view_my_item(text)
  to authenticated, service_role;

drop policy if exists vmp_plan_items_select_item_permissions
  on public.vmp_plan_items;
create policy vmp_plan_items_select_item_permissions
on public.vmp_plan_items
for select
to authenticated
using (
  public.item_permissions_mode() = 'preview'
  or public.vmp_can_view_my_item(validation_code)
  or public.is_admin()
);

drop policy if exists vmp_item_assignments_select_item_permissions
  on public.vmp_item_assignments;
create policy vmp_item_assignments_select_item_permissions
on public.vmp_item_assignments
for select
to authenticated
using (
  public.item_permissions_mode() = 'preview'
  or public.vmp_can_view_my_item(validation_code)
  or public.is_admin()
);

drop policy if exists performers_select on public.vmp_performers;
create policy performers_select
on public.vmp_performers
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

revoke select on public.vmp_performers from anon;
grant select on public.vmp_performers to authenticated, service_role;

/*
 * 1200 đã đổi nguồn activities sang vmp_visible_plan_items(), nhưng mảng
 * objects độc lập vẫn lấy toàn bộ source_objects. Gắn cùng tập visible item
 * khi enforced; preview, service và admin giữ hợp đồng trả toàn danh mục.
 */
do $harden_dashboard_objects$
declare
  v_signature regprocedure :=
    'public.rpc_get_vmp_dashboard(integer,boolean,boolean)'::regprocedure;
  v_old_definition text;
  v_new_definition text;
begin
  select pg_get_functiondef(v_signature) into v_old_definition;
  if position('where s.is_active' in v_old_definition) = 0 then
    raise exception 'Không tìm thấy predicate objects của rpc_get_vmp_dashboard';
  end if;

  v_new_definition := replace(
    v_old_definition,
    'where s.is_active',
    $predicate$where s.is_active
        and (
          public.item_permissions_mode() = 'preview'
          or auth.role() = 'service_role'
          or public.is_admin()
          or exists (
            select 1
            from public.vmp_visible_plan_items() visible_object_item
            where visible_object_item.object_code = s.object_code
              and visible_object_item.year = p_year
              and visible_object_item.is_active
              and (p_include_missing or not visible_object_item.missing_from_sheet)
              and (
                p_include_cancelled
                or coalesce(visible_object_item.item_state, 'active') <> 'cancelled'
              )
          )
        )$predicate$
  );
  execute v_new_definition;
end
$harden_dashboard_objects$;

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
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin' then
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
      'code', 'UNRESOLVED_ASSIGNMENT',
      'record_id', assignment.id,
      'message', 'Phân công chưa nối duy nhất với tài khoản'
    )
    from public.vmp_item_assignments assignment
    where assignment.is_active and assignment.unresolved_reason is not null

    union all

    select jsonb_build_object(
      'code', 'ASSIGNMENT_USER_MISMATCH',
      'record_id', assignment.id,
      'message', 'user_id denormalized của phân công không khớp performer'
    )
    from public.vmp_item_assignments assignment
    join public.vmp_performers person on person.id = assignment.performer_id
    where assignment.is_active
      and assignment.user_id is distinct from person.user_id

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
      'code', 'INVALID_MANAGER_PRINCIPAL',
      'record_id', coalesce(person.id, profile.id),
      'message', 'Role, access_class hoặc department của principal quản lý không nhất quán'
    )
    from public.profiles profile
    left join public.vmp_performers person
      on person.user_id = profile.id and person.is_active
    where coalesce(profile.is_active, true)
      and profile.role::text <> 'admin'
      and (
        profile.role::text = 'qa_manager'
        or person.access_class in ('qa_manager', 'equipment_manager')
      )
      and not (
        (
          profile.role::text = 'qa_manager'
          and profile.department = 'qa'
          and person.access_class = 'qa_manager'
          and person.department = 'qa'
        )
        or (
          profile.role::text = 'department_user'
          and nullif(btrim(coalesce(profile.department, '')), '') is not null
          and person.access_class = 'equipment_manager'
          and person.department = profile.department
        )
      )

    union all

    select jsonb_build_object(
      'code', 'INVALID_SCOPE_DEPARTMENT',
      'record_id', person.id,
      'message', 'scope_departments chứa mã không có trong departments'
    )
    from public.vmp_performers person
    where person.is_active
      and not public.vmp_valid_scope_departments(person.scope_departments)

    union all

    select jsonb_build_object(
      'code', 'INVALID_ACCESS_AREA',
      'record_id', person.id,
      'message', 'access_areas chứa area/line không tồn tại'
    )
    from public.vmp_performers person
    where person.is_active
      and not public.vmp_valid_access_areas(person.access_areas)

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

    union all

    select jsonb_build_object(
      'code', 'UNFILTERED_SECURITY_DEFINER_RPC',
      'record_id', audit.signature,
      'message', 'SECURITY DEFINER đọc hạng mục chưa dùng lõi quyền/allowlist'
    )
    from public.vmp_unfiltered_security_definer_item_readers() audit
  )
  select jsonb_agg(error) into v_blocking from errors;

  with warnings as (
    select jsonb_build_object(
      'code', 'EMPLOYEE_CODE_MISSING',
      'record_id', person.id,
      'message', 'Mã nhân viên chưa có; được phép bổ sung sau'
    ) as warning
    from public.vmp_performers person
    where person.is_active
      and nullif(btrim(coalesce(person.employee_code, '')), '') is null
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

revoke execute on function public.rpc_item_permission_preflight() from public, anon;
grant execute on function public.rpc_item_permission_preflight()
  to authenticated, service_role;

revoke select on public.vmp_item_assignments from authenticated, anon;
revoke select on public.vmp_active_item_assignments from authenticated, anon;
grant select on public.vmp_item_assignments to service_role;
grant select on public.vmp_active_item_assignments to service_role;

do $verify$
begin
  if public.item_permissions_mode() <> 'preview' then
    raise exception 'Migration chốt preflight không được tự bật enforced';
  end if;
  if exists (select 1 from public.vmp_unfiltered_security_definer_item_readers()) then
    raise exception 'Còn SECURITY DEFINER đọc hạng mục chưa lọc';
  end if;
  if has_table_privilege('authenticated', 'public.vmp_item_assignments', 'SELECT')
      or has_table_privilege('authenticated', 'public.vmp_active_item_assignments', 'SELECT') then
    raise exception 'authenticated vẫn SELECT trực tiếp phân công';
  end if;
  if has_table_privilege('anon', 'public.vmp_performers', 'SELECT') then
    raise exception 'anon vẫn SELECT trực tiếp danh bạ performer';
  end if;
  if has_function_privilege(
      'authenticated', 'public.vmp_item_rights(uuid,text)', 'EXECUTE'
    ) or has_function_privilege(
      'authenticated', 'public.vmp_can_view_item(uuid,text)', 'EXECUTE'
    ) or has_function_privilege(
      'authenticated', 'public.vmp_allowed_timeline_fields(uuid,text)', 'EXECUTE'
    ) then
    raise exception 'authenticated vẫn gọi được core quyền với p_uid tùy ý';
  end if;
  if not has_function_privilege(
      'authenticated', 'public.vmp_my_item_rights(text)', 'EXECUTE'
    ) then
    raise exception 'authenticated không gọi được wrapper quyền self';
  end if;
  if has_function_privilege(
      'service_role',
      'public.vmp_upsert_item_permission_staff_unvalidated(uuid,jsonb,text)',
      'EXECUTE'
    ) or has_function_privilege(
      'service_role',
      'public.vmp_set_item_assignment_unhardened(uuid,text,text,text,text)',
      'EXECUTE'
    ) then
    raise exception 'service_role còn gọi được RPC nội bộ bỏ qua validation';
  end if;
end
$verify$;

/* Chốt catalog department và giữ quyết định resolve khi performer biến mất. */

create or replace function public.vmp_valid_person_department(p_department text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.departments department
    where department.id = p_department
      and coalesce(department.is_active, true)
  )
$fn$;

alter function public.rpc_upsert_item_permission_staff(uuid, jsonb, text)
  rename to vmp_upsert_item_permission_staff_department_unchecked;
revoke all on function public.vmp_upsert_item_permission_staff_department_unchecked(uuid, jsonb, text)
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
  v_old public.vmp_performers%rowtype;
  v_department text;
  v_is_active boolean;
begin
  if p_person_id is not null then
    select * into v_old from public.vmp_performers where id = p_person_id;
  end if;
  v_department := case
    when p_patch ? 'department'
      then lower(nullif(btrim(p_patch->>'department'), ''))
    else v_old.department
  end;
  v_is_active := case
    when p_patch ? 'is_active' then (p_patch->>'is_active')::boolean
    else coalesce(v_old.is_active, true)
  end;

  if v_is_active and not public.vmp_valid_person_department(v_department) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Bộ phận nhân viên phải là mã đang có trong departments'
    );
  end if;
  return public.vmp_upsert_item_permission_staff_department_unchecked(
    p_person_id, p_patch, p_reason
  );
end
$fn$;

revoke execute on function public.vmp_valid_person_department(text)
  from public, anon, authenticated;
grant execute on function public.vmp_valid_person_department(text) to service_role;
revoke execute on function public.rpc_upsert_item_permission_staff(uuid, jsonb, text)
  from public, anon;
grant execute on function public.rpc_upsert_item_permission_staff(uuid, jsonb, text)
  to authenticated, service_role;

alter table public.vmp_item_assignments
  drop constraint if exists vmp_item_assignments_unresolved_reason_check;
alter table public.vmp_item_assignments
  add constraint vmp_item_assignments_unresolved_reason_check
  check (unresolved_reason is null or unresolved_reason in (
    'not_found', 'duplicate_name', 'account_unlinked', 'stale_resolution'
  ));

alter table public.vmp_source_assignment_resolutions
  drop constraint if exists vmp_source_assignment_resolutions_performer_id_fkey;
alter table public.vmp_source_assignment_resolutions
  alter column performer_id drop not null;
alter table public.vmp_source_assignment_resolutions
  add constraint vmp_source_assignment_resolutions_performer_id_fkey
  foreign key (performer_id) references public.vmp_performers(id)
  on delete set null;

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
  select
    rights.can_view,
    case when rights.can_view then rights.editable_fields else '{}'::text[] end,
    case when rights.can_view
      then rights.view_reason
      else 'Bạn không có quyền xem hạng mục'
    end,
    case when rights.can_view then rights.assignment_sources else '{}'::text[] end,
    case when rights.can_view then rights.scope_match else false end,
    case when rights.can_view then rights.area_match else false end
  from public.vmp_item_rights(auth.uid(), p_validation_code) rights
$fn$;

revoke execute on function public.vmp_my_item_rights(text) from public, anon;
grant execute on function public.vmp_my_item_rights(text)
  to authenticated, service_role;

revoke execute on function public.rpc_set_item_assignment(uuid, text, text, text, text)
  from service_role;
revoke insert, update, delete on public.vmp_item_assignments
  from authenticated, anon;
grant select, insert, update, delete on public.vmp_item_assignments
  to service_role;

create or replace function public.vmp_harden_dashboard_object_scope()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_signature regprocedure :=
    'public.rpc_get_vmp_dashboard(integer,boolean,boolean)'::regprocedure;
  v_definition text;
  v_start integer;
  v_tail_relative integer;
  v_tail_marker text := E'\n    ),\n    ''activities''';
  v_predicate text := $predicate$where s.is_active
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
        )$predicate$;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  v_start := position('where s.is_active' in v_definition);
  if v_start = 0 then
    raise exception 'Không tìm thấy predicate objects của rpc_get_vmp_dashboard';
  end if;
  v_tail_relative := position(v_tail_marker in substring(v_definition from v_start));
  if v_tail_relative = 0 then
    raise exception 'Không tìm thấy điểm kết thúc objects của rpc_get_vmp_dashboard';
  end if;

  v_definition := substring(v_definition from 1 for v_start - 1)
    || v_predicate
    || substring(v_definition from v_start + v_tail_relative - 1);
  execute v_definition;

  select pg_get_functiondef(v_signature) into v_definition;
  if regexp_count(v_definition, 'visible_object_item') <> 6 then
    raise exception 'Predicate dashboard objects không ở dạng chuẩn duy nhất';
  end if;
end
$fn$;

revoke execute on function public.vmp_harden_dashboard_object_scope()
  from public, anon, authenticated, service_role;
select public.vmp_harden_dashboard_object_scope();
select public.vmp_harden_dashboard_object_scope();

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
    select item.validation_code,
           'qa'::text as assignment_kind,
           'sheet_qa'::text as source,
           coalesce(
             nullif(btrim(item.source_sheet_data->'values'->>17), ''),
             nullif(btrim(item.owner_name), '')
           ) as source_name
    from public.vmp_plan_items item
    where item.is_active

    union all

    select item.validation_code,
           'equipment_department'::text,
           'sheet_other_staff'::text,
           nullif(btrim(item.source_sheet_data->'values'->>19), '')
    from public.vmp_plan_items item
    where item.is_active
  ), valid_sources as (
    select source.*,
           public.vmp_normalize_person_name(source.source_name)
             as normalized_source_name
    from source_names source
    where source.source_name is not null
      and source.source_name !~ '^[-–—.·[:space:]]+$'
      and lower(source.source_name) <> '(chưa phân công)'
  ), matched as (
    select
      source.*,
      resolution.validation_code is not null as has_resolution,
      resolution.performer_id as mapped_performer_id,
      resolved.id as active_resolved_performer_id,
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
      select count(*)::integer as match_count,
             case when count(*) = 1
               then (array_agg(person.id order by person.id))[1]
             end as performer_id
      from public.vmp_performers person
      where person.is_active
        and person.normalized_full_name = source.normalized_source_name
    ) automatic on true
  ), selected as (
    select matched.*,
           case when has_resolution
             then active_resolved_performer_id
             else automatic_performer_id
           end as performer_id
    from matched
  )
  insert into public.vmp_item_assignments (
    validation_code, performer_id, user_id, staff_name, employee_code,
    assignment_kind, source, source_text, unresolved_reason,
    is_active, change_reason, created_by, updated_by
  )
  select selected.validation_code,
         selected.performer_id,
         person.user_id,
         coalesce(person.performer_name, selected.source_name),
         person.employee_code,
         selected.assignment_kind,
         selected.source,
         selected.source_name,
         case
           when selected.has_resolution
             and selected.active_resolved_performer_id is null
             then 'stale_resolution'
           when selected.performer_id is null and selected.match_count = 0
             then 'not_found'
           when selected.performer_id is null and selected.match_count > 1
             then 'duplicate_name'
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
    'sheet_assignment_refresh', array['sheet_qa', 'sheet_other_staff']
  );

  return jsonb_build_object(
    'ok', true, 'inserted', v_inserted, 'unresolved', v_unresolved
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end
$fn$;

revoke execute on function public.rpc_refresh_source_item_assignments()
  from public, anon;
grant execute on function public.rpc_refresh_source_item_assignments()
  to authenticated, service_role;

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
      'code', 'INVALID_PERSON_DEPARTMENT',
      'record_id', person.id,
      'message', 'department của nhân viên không có trong catalog departments'
    )
    from public.vmp_performers person
    where person.is_active
      and not public.vmp_valid_person_department(person.department)

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
      'code', 'ASSIGNMENT_DENORMALIZED_MISMATCH',
      'record_id', assignment.id,
      'message', 'Mã, tên hoặc trạng thái liên kết phân công không khớp performer'
    )
    from public.vmp_item_assignments assignment
    join public.vmp_performers person on person.id = assignment.performer_id
    where assignment.is_active and (
      assignment.employee_code is distinct from person.employee_code
      or assignment.staff_name is distinct from person.performer_name
      or assignment.unresolved_reason is distinct from case
        when person.user_id is null then 'account_unlinked'
        else null
      end
    )

    union all

    select jsonb_build_object(
      'code', 'STALE_SOURCE_RESOLUTION',
      'record_id', resolution.validation_code || '×' || resolution.source
        || '×' || resolution.normalized_source_name,
      'message', 'Quyết định resolve đang trỏ tới performer không còn hoạt động'
    )
    from public.vmp_source_assignment_resolutions resolution
    left join public.vmp_performers person
      on person.id = resolution.performer_id and person.is_active
    where person.id is null

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

revoke execute on function public.rpc_item_permission_preflight()
  from public, anon;
grant execute on function public.rpc_item_permission_preflight()
  to authenticated, service_role;

do $verify$
begin
  if public.item_permissions_mode() <> 'preview' then
    raise exception 'Migration 1400 không được tự bật enforced';
  end if;
  if has_function_privilege(
    'service_role',
    'public.rpc_set_item_assignment(uuid,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role vẫn gọi RPC phụ thuộc auth.uid manager';
  end if;
  if has_table_privilege('authenticated', 'public.vmp_item_assignments', 'INSERT')
      or has_table_privilege('authenticated', 'public.vmp_item_assignments', 'UPDATE')
      or has_table_privilege('authenticated', 'public.vmp_item_assignments', 'DELETE')
      or has_table_privilege('anon', 'public.vmp_item_assignments', 'INSERT')
      or has_table_privilege('anon', 'public.vmp_item_assignments', 'UPDATE')
      or has_table_privilege('anon', 'public.vmp_item_assignments', 'DELETE') then
    raise exception 'Browser role vẫn mutation trực tiếp bảng phân công';
  end if;
  if not has_table_privilege('service_role', 'public.vmp_item_assignments', 'INSERT')
      or not has_table_privilege('service_role', 'public.vmp_item_assignments', 'UPDATE')
      or not has_table_privilege('service_role', 'public.vmp_item_assignments', 'DELETE') then
    raise exception 'service_role mất quyền mutation bảng phân công';
  end if;
end
$verify$;

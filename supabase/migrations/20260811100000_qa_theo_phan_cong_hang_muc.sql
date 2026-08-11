/* Nối tài khoản vào hồ sơ bằng xác nhận Admin; QA nhận quyền từ phân công. */

alter table public.vmp_item_assignments
  add column assignment_role text;

/* Một người có thể còn hai nguồn QA legacy trên cùng hạng mục. Giữ dòng
 * ưu tiên Sheet, rồi theo thời điểm/UUID ổn định; dòng dư chỉ ngừng active. */
with ranked as (
  select assignment.id,
         row_number() over (
           partition by assignment.validation_code, assignment.performer_id
           order by (assignment.source = 'sheet_qa') desc,
                    assignment.created_at,
                    assignment.id
         ) as position
  from public.vmp_item_assignments assignment
  where assignment.assignment_kind = 'qa'
    and assignment.performer_id is not null
    and assignment.is_active
)
update public.vmp_item_assignments assignment
set is_active = false,
    change_reason = 'Gộp nguồn phân công khi chuyển person_id'
from ranked
where assignment.id = ranked.id and ranked.position > 1;

update public.vmp_item_assignments
set assignment_role = 'collaborator'
where assignment_kind = 'qa';

with ranked as (
  select assignment.id,
         row_number() over (
           partition by assignment.validation_code
           order by (assignment.source = 'sheet_qa') desc,
                    assignment.created_at,
                    assignment.id
         ) as position
  from public.vmp_item_assignments assignment
  where assignment.assignment_kind = 'qa' and assignment.is_active
)
update public.vmp_item_assignments assignment
set assignment_role = 'primary'
from ranked
where assignment.id = ranked.id and ranked.position = 1;

alter table public.vmp_item_assignments
  add constraint vmp_item_assignments_role_check
  check (
    (assignment_kind = 'qa'
      and assignment_role is not null
      and assignment_role in ('primary', 'collaborator'))
    or (assignment_kind = 'equipment_department' and assignment_role is null)
  ) not valid;
alter table public.vmp_item_assignments
  validate constraint vmp_item_assignments_role_check;

create unique index vmp_item_assignments_one_active_qa_primary
on public.vmp_item_assignments(validation_code)
where assignment_kind = 'qa' and assignment_role = 'primary' and is_active;

create unique index vmp_item_assignments_one_active_qa_person
on public.vmp_item_assignments(validation_code, performer_id, assignment_kind)
where performer_id is not null and assignment_kind = 'qa' and is_active;

comment on column public.vmp_item_assignments.assignment_role is
  'Vai trò QA theo hạng mục: primary hoặc collaborator; phân công thiết bị để null.';

/* Chữ ký ba tham số đã được thay bằng optimistic version ở migration 1600.
 * Phải drop trước CREATE OR REPLACE để event-trigger không thấy overload RPC. */
drop function if exists public.rpc_upsert_item_permission_staff(uuid, jsonb, text);

create or replace function public.rpc_upsert_item_permission_staff(
  p_person_id uuid, p_patch jsonb, p_reason text, p_expected_version integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_old public.vmp_performers%rowtype;
  v_new public.vmp_performers%rowtype;
  v_person_id uuid := p_person_id;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_bad_fields text[];
  v_full_name text;
  v_employee_code text;
  v_department text;
  v_access_class text;
  v_email text;
  v_user_id uuid;
  v_departments text[];
  v_factories uuid[];
  v_areas uuid[];
  v_lines uuid[];
  v_legacy_areas text[];
  v_is_active boolean;
  v_email_sent boolean;
  v_requires_scope boolean;
  v_version integer;
begin
  select role::text into v_actor_role from public.profiles
  where id = v_actor and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin được sửa hồ sơ trong danh bạ nhân sự & quyền');
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Bắt buộc nhập lý do thay đổi');
  end if;

  select array_agg(key order by key) into v_bad_fields
  from jsonb_object_keys(v_patch) key
  where key <> all(array[
    'full_name', 'employee_code', 'department', 'access_class', 'email',
    'scope_departments', 'scope_factory_ids', 'scope_area_ids',
    'scope_line_ids', 'is_active', 'email_sent_confirmed'
  ]::text[]);
  if v_bad_fields is not null then
    return jsonb_build_object('ok', false, 'error_code', 'PATCH_FIELD_NOT_ALLOWED',
      'error', 'Trường không được phép sửa: ' || array_to_string(v_bad_fields, ', '));
  end if;

  if v_person_id is null then
    if p_expected_version is distinct from 0 then
      return jsonb_build_object('ok', false, 'error_code', 'VERSION_CONFLICT',
        'error', 'Hồ sơ mới phải có expected_version = 0', 'current_version', 0);
    end if;
  else
    select * into v_old from public.vmp_performers
    where id = v_person_id for update;
    if not found then
      return jsonb_build_object('ok', false, 'error_code', 'PERSON_NOT_FOUND',
        'error', 'Không tìm thấy nhân viên cần sửa');
    end if;
    if p_expected_version is distinct from v_old.version then
      return jsonb_build_object('ok', false, 'error_code', 'VERSION_CONFLICT',
        'error', 'Hồ sơ đã được cập nhật ở phiên khác',
        'current_version', v_old.version);
    end if;
  end if;

  v_full_name := case when v_patch ? 'full_name'
    then nullif(btrim(v_patch->>'full_name'), '') else v_old.performer_name end;
  v_employee_code := case when v_patch ? 'employee_code'
    then nullif(btrim(v_patch->>'employee_code'), '') else v_old.employee_code end;
  v_department := case when v_patch ? 'department'
    then lower(nullif(btrim(v_patch->>'department'), '')) else v_old.department end;
  v_access_class := case when v_patch ? 'access_class'
    then nullif(btrim(v_patch->>'access_class'), '') else v_old.access_class end;
  v_email := case when v_patch ? 'email'
    then lower(nullif(btrim(v_patch->>'email'), '')) else v_old.email end;
  v_departments := case when v_patch ? 'scope_departments'
    then public.vmp_jsonb_text_array(v_patch, 'scope_departments')
    else coalesce(v_old.scope_departments, '{}'::text[]) end;
  v_factories := case when v_patch ? 'scope_factory_ids'
    then public.vmp_jsonb_uuid_array(v_patch, 'scope_factory_ids')
    else coalesce(v_old.scope_factory_ids, '{}'::uuid[]) end;
  v_areas := case when v_patch ? 'scope_area_ids'
    then public.vmp_jsonb_uuid_array(v_patch, 'scope_area_ids')
    else coalesce(v_old.scope_area_ids, '{}'::uuid[]) end;
  v_lines := case when v_patch ? 'scope_line_ids'
    then public.vmp_jsonb_uuid_array(v_patch, 'scope_line_ids')
    else coalesce(v_old.scope_line_ids, '{}'::uuid[]) end;
  v_is_active := case when v_patch ? 'is_active'
    then (v_patch->>'is_active')::boolean else coalesce(v_old.is_active, true) end;
  v_email_sent := case when v_patch ? 'email_sent_confirmed'
    then (v_patch->>'email_sent_confirmed')::boolean
    else coalesce(v_old.email_sent_confirmed, false) end;

  if p_person_id is not null and v_old.user_id is not null and (
    (v_patch ? 'department' and v_department is distinct from v_old.department)
    or (v_patch ? 'access_class' and v_access_class is distinct from v_old.access_class)
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'ACCOUNT_RELINK_REQUIRED',
      'error', 'Phải gỡ tài khoản trước khi đổi bộ phận hoặc phân loại quyền');
  end if;
  if p_person_id is not null
      and v_old.user_id is not null
      and v_old.is_active
      and not v_is_active then
    return jsonb_build_object('ok', false,
      'error_code', 'ACCOUNT_UNLINK_REQUIRED',
      'error', 'Phải gỡ tài khoản trước khi ngừng hoạt động hồ sơ');
  end if;
  if v_full_name is null then
    return jsonb_build_object('ok', false, 'error_code', 'FULL_NAME_REQUIRED',
      'error', 'Phải nhập Họ và tên');
  end if;
  if v_email is not null
      and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_EMAIL',
      'error', 'Email không đúng định dạng: ' || v_email);
  end if;
  if v_access_class is not null and v_access_class not in (
    'view_only', 'qa_progress_editor', 'qa_manager',
    'equipment_scheduler', 'equipment_manager'
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_ACCESS_CLASS',
      'error', 'Phân loại quyền không hợp lệ');
  end if;
  if v_access_class in ('qa_progress_editor', 'qa_manager')
      and v_department is distinct from 'qa' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_QA_DEPARTMENT',
      'error', 'Phân loại QA chỉ cấp cho nhân viên thuộc bộ phận QA');
  end if;
  if v_is_active and not public.vmp_valid_person_department(v_department) then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DEPARTMENT',
      'error', 'Bộ phận nhân viên phải là mã đang có trong departments');
  end if;

  v_requires_scope := v_access_class not in ('qa_progress_editor', 'qa_manager');
  if v_is_active and v_requires_scope and not public.vmp_valid_permission_scope(
    v_departments, v_factories, v_areas, v_lines
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_SCOPE_HIERARCHY',
      'error', 'Phạm vi phải có đủ đường bộ phận → xưởng → khu vực → line đang hoạt động');
  end if;
  if not v_requires_scope then
    v_departments := '{}'::text[];
    v_factories := '{}'::uuid[];
    v_areas := '{}'::uuid[];
    v_lines := '{}'::uuid[];
    v_legacy_areas := '{}'::text[];
  else
    select coalesce(array_agg(code order by code), '{}'::text[])
    into v_legacy_areas
    from (
      select distinct area.code
      from public.vmp_scope_areas area where area.id = any(v_areas)
      union
      select distinct line.code
      from public.vmp_scope_lines line where line.id = any(v_lines)
    ) value;
  end if;

  /* Email chỉ là metadata. Liên kết account chỉ đi qua RPC xác nhận Admin. */
  v_user_id := case when v_person_id is null then null else v_old.user_id end;
  v_version := case when v_person_id is null then 1 else v_old.version + 1 end;
  if v_person_id is null then
    insert into public.vmp_performers (
      performer_name, employee_code, email, department, user_id, access_class,
      scope_departments, access_areas, scope_factory_ids, scope_area_ids,
      scope_line_ids, version, email_sent_confirmed, is_active, updated_by
    ) values (
      v_full_name, v_employee_code, v_email, v_department, v_user_id, v_access_class,
      v_departments, v_legacy_areas, v_factories, v_areas, v_lines, v_version,
      v_email_sent, v_is_active, v_actor
    ) returning * into v_new;
    v_person_id := v_new.id;
  else
    update public.vmp_performers set
      performer_name = v_full_name, employee_code = v_employee_code,
      email = v_email, department = v_department, user_id = v_user_id,
      access_class = v_access_class, scope_departments = v_departments,
      access_areas = v_legacy_areas, scope_factory_ids = v_factories,
      scope_area_ids = v_areas, scope_line_ids = v_lines, version = v_version,
      email_sent_confirmed = v_email_sent, is_active = v_is_active,
      updated_by = v_actor
    where id = v_person_id returning * into v_new;
  end if;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields
  ) values (
    v_actor,
    (case when p_person_id is null then 'INSERT' else 'UPDATE' end)::public.audit_action,
    'vmp_performers', v_person_id::text,
    case when p_person_id is null then null else to_jsonb(v_old) end,
    to_jsonb(v_new), btrim(p_reason), 'dashboard_rpc',
    array(select jsonb_object_keys(v_patch) order by 1)
  );
  return jsonb_build_object(
    'ok', true, 'person_id', v_person_id, 'user_id', v_user_id,
    'version', v_version,
    'account_status', case when v_user_id is null then 'unlinked' else 'linked' end
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error_code', 'UNIQUE_CONFLICT',
      'error', 'Mã nhân viên hoặc tài khoản đã tồn tại');
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_VALUE',
      'error', 'Giá trị patch không đúng định dạng');
  when others then
    return jsonb_build_object('ok', false, 'error_code', 'SAVE_FAILED',
      'error', sqlerrm);
end
$fn$;

create or replace function public.rpc_import_item_permission_staff(
  p_rows jsonb, p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row jsonb;
  v_result jsonb;
  v_imported integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'IMPORT_ROW_FAILED: dữ liệu nhập phải là mảng'
      using errcode = 'VMP01';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'IMPORT_ROW_FAILED: thiếu lý do nhập file'
      using errcode = 'VMP01';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_result := public.rpc_upsert_item_permission_staff(
      null, v_row - 'row_number', p_reason, 0
    );
    if coalesce((v_result->>'ok')::boolean, false) is not true then
      raise exception 'IMPORT_ROW_FAILED: dòng %, %',
        coalesce(v_row->>'row_number', '?'),
        coalesce(v_result->>'error', 'không hợp lệ')
        using errcode = 'VMP01';
    end if;
    v_imported := v_imported + 1;
  end loop;
  return jsonb_build_object(
    'ok', true, 'imported', v_imported, 'errors', '[]'::jsonb
  );
end
$fn$;

create or replace function public.rpc_item_permission_account_candidates(
  p_query text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor_role text;
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_accounts jsonb;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = auth.uid() and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin' then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin được xem danh sách tài khoản để nối'
    );
  end if;

  select jsonb_agg(jsonb_build_object(
    'user_id', profile.id,
    'email', profile.email,
    'full_name', profile.full_name,
    'role', profile.role::text,
    'department', profile.department,
    'is_active', coalesce(profile.is_active, true),
    'linked_person_id', person.id
  ) order by profile.full_name, profile.email, profile.id)
  into v_accounts
  from public.profiles profile
  left join public.vmp_performers person on person.user_id = profile.id
  where v_query = ''
    or lower(coalesce(profile.email, '')) like '%' || v_query || '%'
    or lower(coalesce(profile.full_name, '')) like '%' || v_query || '%';

  return jsonb_build_object(
    'ok', true, 'accounts', coalesce(v_accounts, '[]'::jsonb)
  );
end
$fn$;

create or replace function public.rpc_link_item_permission_account(
  p_person_id uuid,
  p_user_id uuid,
  p_reason text,
  p_expected_version integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_person public.vmp_performers%rowtype;
  v_new_person public.vmp_performers%rowtype;
  v_old_profile public.profiles%rowtype;
  v_profile public.profiles%rowtype;
  v_new_profile public.profiles%rowtype;
  v_version integer;
  v_lock_user_id uuid;
begin
  select role::text into v_actor_role
  from public.profiles
  where id = v_actor and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin' then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin được nối hoặc gỡ tài khoản'
    );
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Bắt buộc nhập lý do nối hoặc gỡ tài khoản'
    );
  end if;

  /* Serialize mọi mutation của cùng account trước khi lấy row lock.
   * Unlink lấy account hiện tại bằng snapshot; optimistic version bên dưới
   * từ chối nếu một link vừa thay snapshot trong lúc chờ performer. */
  v_lock_user_id := p_user_id;
  if v_lock_user_id is null then
    select user_id into v_lock_user_id
    from public.vmp_performers
    where id = p_person_id;
  end if;
  if v_lock_user_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'vmp:item-permission-account:' || v_lock_user_id::text, 0
      )
    );
  end if;

  select * into v_person
  from public.vmp_performers
  where id = p_person_id
  for update;
  if not found then
    return jsonb_build_object(
      'ok', false, 'error_code', 'PERSON_NOT_FOUND',
      'error', 'Không tìm thấy hồ sơ cần nối tài khoản'
    );
  end if;
  if p_expected_version is distinct from v_person.version then
    return jsonb_build_object(
      'ok', false, 'error_code', 'VERSION_CONFLICT',
      'error', 'Hồ sơ đã được cập nhật ở phiên khác',
      'current_version', v_person.version
    );
  end if;
  if p_user_id is null
      and v_lock_user_id is distinct from v_person.user_id then
    return jsonb_build_object(
      'ok', false, 'error_code', 'VERSION_CONFLICT',
      'error', 'Liên kết tài khoản đã đổi trong lúc chờ khóa hồ sơ',
      'current_version', v_person.version
    );
  end if;
  if p_user_id is not null and not v_person.is_active then
    return jsonb_build_object(
      'ok', false, 'error_code', 'PERSON_INACTIVE',
      'error', 'Không được nối tài khoản vào hồ sơ đã ngừng hoạt động'
    );
  end if;

  /* Performer được khóa trước, sau đó profile được khóa theo UUID ổn định. */
  perform profile.id
  from public.profiles profile
  where profile.id = v_person.user_id or profile.id = p_user_id
  order by profile.id
  for update;
  if v_person.user_id is not null then
    select * into v_old_profile
    from public.profiles where id = v_person.user_id;
  end if;

  if p_user_id is not null then
    if v_person.user_id is not null and v_person.user_id <> p_user_id then
      return jsonb_build_object(
        'ok', false, 'error_code', 'ACCOUNT_RELINK_REQUIRED',
        'error', 'Phải gỡ tài khoản hiện tại trước khi nối tài khoản khác'
      );
    end if;
    select * into v_profile from public.profiles where id = p_user_id;
    if not found then
      return jsonb_build_object(
        'ok', false, 'error_code', 'ACCOUNT_NOT_FOUND',
        'error', 'Không tìm thấy tài khoản cần nối'
      );
    end if;
    /* Snapshot trước update phải là chính profile đích của lần link đầu. */
    v_old_profile := v_profile;
    if not coalesce(v_profile.is_active, true) then
      return jsonb_build_object(
        'ok', false, 'error_code', 'ACCOUNT_INACTIVE',
        'error', 'Tài khoản đã ngừng hoạt động'
      );
    end if;
    if exists (
      select 1 from public.vmp_performers person
      where person.user_id = p_user_id and person.id <> p_person_id
    ) then
      return jsonb_build_object(
        'ok', false, 'error_code', 'ACCOUNT_ALREADY_LINKED',
        'error', 'Tài khoản này đã nối với một nhân viên khác'
      );
    end if;
    if v_person.access_class in ('qa_progress_editor', 'qa_manager')
        and v_profile.department is not null
        and v_profile.department <> 'qa' then
      return jsonb_build_object(
        'ok', false, 'error_code', 'INVALID_QA_PRINCIPAL',
        'error', 'Tài khoản QA phải thuộc bộ phận QA'
      );
    end if;
    if v_person.access_class = 'equipment_manager'
        and v_profile.role::text <> 'admin'
        and (
          v_profile.role::text <> 'department_user'
          or v_profile.department is distinct from v_person.department
        ) then
      return jsonb_build_object(
        'ok', false, 'error_code', 'INVALID_MANAGER_PRINCIPAL',
        'error', 'Quản lý thiết bị phải có role và department khớp hồ sơ'
      );
    end if;

    if v_person.access_class in ('qa_progress_editor', 'qa_manager')
        and v_profile.role::text <> 'admin' then
      update public.profiles
      set role = case when v_person.access_class = 'qa_manager'
            then 'qa_manager'::public.user_role
            else 'viewer'::public.user_role end,
          department = 'qa',
          updated_at = now()
      where id = p_user_id;
    end if;
  elsif v_person.user_id is not null
      and v_old_profile.role::text <> 'admin'
      and v_old_profile.role::text = 'qa_manager'
      and v_person.access_class in ('qa_progress_editor', 'qa_manager') then
    update public.profiles
    set role = 'viewer'::public.user_role, updated_at = now()
    where id = v_person.user_id;
  end if;

  v_version := v_person.version + 1;
  update public.vmp_performers
  set user_id = p_user_id, version = v_version, updated_by = v_actor
  where id = p_person_id
  returning * into v_new_person;

  update public.vmp_item_assignments assignment
  set user_id = p_user_id,
      employee_code = v_new_person.employee_code,
      staff_name = v_new_person.performer_name,
      unresolved_reason = case
        when p_user_id is null then 'account_unlinked'
        else null
      end,
      updated_by = v_actor
  where assignment.performer_id = p_person_id;

  if p_user_id is not null then
    select * into v_new_profile
    from public.profiles where id = p_user_id;
  elsif v_person.user_id is not null then
    select * into v_new_profile
    from public.profiles where id = v_person.user_id;
  end if;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields
  ) values (
    v_actor, 'UPDATE', 'vmp_performers', p_person_id::text,
    jsonb_build_object(
      'performer', to_jsonb(v_person),
      'profile', to_jsonb(v_old_profile)
    ),
    jsonb_build_object(
      'performer', to_jsonb(v_new_person),
      'profile', to_jsonb(v_new_profile)
    ),
    btrim(p_reason), 'dashboard_rpc',
    array['user_id', 'version', 'profile.role', 'profile.department']
  );

  return jsonb_build_object(
    'ok', true,
    'person_id', p_person_id,
    'user_id', p_user_id,
    'version', v_version,
    'account_status', case when p_user_id is null then 'unlinked' else 'linked' end
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ACCOUNT_ALREADY_LINKED',
      'error', 'Tài khoản này đã nối với một nhân viên khác'
    );
  when others then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ACCOUNT_LINK_FAILED', 'error', sqlerrm
    );
end
$fn$;

/* Các writer danh bạ đời cũ thiếu reason/version và làm lệch profile.
 * Giữ chữ ký để caller cũ nhận lỗi có nghĩa, nhưng tuyệt đối không mutate. */
create or replace function public.rpc_upsert_performer(
  p_id uuid, p_patch jsonb
) returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'ok', false,
    'error_code', 'LEGACY_RPC_DISABLED',
    'error', 'Đường lưu người thực hiện cũ đã ngừng; dùng danh bạ phân quyền có reason và version'
  )
$fn$;

create or replace function public.rpc_delete_performer(p_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'ok', false,
    'error_code', 'LEGACY_RPC_DISABLED',
    'error', 'Đường xóa người thực hiện cũ đã ngừng; hãy ngừng hoạt động hồ sơ qua danh bạ phân quyền'
  )
$fn$;

/* Giữ RPC quản trị user, nhưng profile đã linked phải unlink trước khi đổi
 * role/department để coarse role không lệch access_class của performer. */
create or replace function public.rpc_set_user_role(
  p_user_id uuid,
  p_role text,
  p_department text,
  p_reason text default null,
  p_pham_vi text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me uuid := auth.uid();
  v_my_role text;
  v_old public.profiles%rowtype;
  v_linked public.vmp_performers%rowtype;
  v_so_admin integer;
  v_pv text := nullif(btrim(coalesce(p_pham_vi, '')), '');
  v_department text := nullif(btrim(coalesce(p_department, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select role::text into v_my_role
  from public.profiles
  where id = v_me and coalesce(is_active, true);
  if v_my_role is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Không xác định được người dùng'
    );
  end if;
  if not public.duoc_phep('admin_users', v_my_role) then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ admin được đổi phân quyền'
    );
  end if;
  if v_reason is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Bắt buộc nhập lý do đổi phân quyền'
    );
  end if;

  /* Cùng advisory key và thứ tự lock với RPC link:
   * account advisory → performer → profile. */
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'vmp:item-permission-account:' || p_user_id::text, 0
    )
  );

  /* Refresh linked performer sau khi đã serialize account; không dùng snapshot
   * đọc trước lúc một RPC link concurrent commit. */
  select * into v_linked
  from public.vmp_performers
  where user_id = p_user_id
  for update;
  select * into v_old
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ACCOUNT_NOT_FOUND',
      'error', 'Không tìm thấy tài khoản'
    );
  end if;
  if p_role not in ('admin', 'qa_manager', 'department_user', 'viewer') then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_ROLE',
      'error', 'Vai trò không hợp lệ'
    );
  end if;
  if v_pv is not null and v_pv not in ('co', 'bo_phan', 'phan_cong', 'khong') then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_SCOPE',
      'error', 'Phạm vi không hợp lệ'
    );
  end if;
  if v_linked.id is not null and (
    p_role is distinct from v_old.role::text
    or v_department is distinct from v_old.department
  ) then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ACCOUNT_RELINK_REQUIRED',
      'error', 'Phải gỡ tài khoản khỏi hồ sơ trước khi đổi role hoặc department'
    );
  end if;
  if p_user_id = v_me and p_role <> 'admin' then
    return jsonb_build_object(
      'ok', false, 'error_code', 'SELF_DEMOTION_FORBIDDEN',
      'error', 'Không tự hạ vai của chính mình — hạ xong sẽ không vào lại được để sửa.'
    );
  end if;
  if v_old.role::text = 'admin' and p_role <> 'admin' then
    select count(*) into v_so_admin
    from public.profiles
    where role::text = 'admin' and coalesce(is_active, true) and id <> p_user_id;
    if v_so_admin = 0 then
      return jsonb_build_object(
        'ok', false, 'error_code', 'LAST_ADMIN_PROTECTED',
        'error', 'Đây là admin đang hoạt động cuối cùng — không thể hạ vai.'
      );
    end if;
  end if;
  if p_role = 'department_user' and v_department is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'DEPARTMENT_REQUIRED',
      'error', 'Vai department_user bắt buộc có bộ phận.'
    );
  end if;
  if v_pv = 'phan_cong' and not exists (
    select 1
    from public.vmp_assignment_matrix assignment
    left join public.vmp_performers person on person.user_id = p_user_id
    where assignment.is_active
      and lower(btrim(assignment.staff_name)) = lower(btrim(coalesce(
        person.performer_name, v_old.full_name, ''
      )))
  ) then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ASSIGNMENT_REQUIRED',
      'error', 'Người này chưa được tích ô phân công nào; hãy phân công trước.'
    );
  end if;

  update public.profiles
  set role = p_role::public.user_role,
      department = v_department,
      pham_vi = v_pv,
      updated_at = now()
  where id = p_user_id;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields
  ) values (
    v_me, 'UPDATE', 'profiles', p_user_id::text,
    jsonb_build_object(
      'role', v_old.role, 'department', v_old.department, 'pham_vi', v_old.pham_vi
    ),
    jsonb_build_object(
      'role', p_role, 'department', v_department, 'pham_vi', v_pv
    ),
    v_reason,
    'dashboard_rpc', array['role', 'department', 'pham_vi']
  );

  return jsonb_build_object(
    'ok', true, 'msg', 'Đã cập nhật phân quyền',
    'role', p_role, 'department', v_department, 'pham_vi', v_pv
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ROLE_UPDATE_FAILED', 'error', sqlerrm
    );
end
$fn$;

create or replace function public.rpc_item_permission_directory(p_query text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_principal record;
  v_query text := public.vmp_normalize_person_name(p_query);
  v_people jsonb;
begin
  select * into v_principal from public.vmp_manager_principal(auth.uid());
  if coalesce(auth.role(), '') <> 'service_role'
      and v_principal.principal_kind is null then
    return jsonb_build_object('ok', false, 'error',
      'Principal quản lý không hợp lệ hoặc không nhất quán');
  end if;
  with candidates as (
    select person.*,
      count(*) over (partition by person.normalized_full_name) same_name_count,
      profile.is_active account_is_active
    from public.vmp_performers person
    left join public.profiles profile on profile.id = person.user_id
    where person.is_active
      and (coalesce(auth.role(), '') = 'service_role'
        or v_principal.principal_kind = 'admin'
        or (v_principal.principal_kind = 'qa_manager' and person.department = 'qa')
        or (v_principal.principal_kind = 'equipment_manager'
          and person.department = v_principal.profile_department))
      and (v_query = ''
        or person.normalized_full_name like '%' || v_query || '%'
        or lower(coalesce(person.email, '')) like '%'
          || lower(btrim(coalesce(p_query, ''))) || '%'
        or lower(coalesce(person.employee_code, '')) like '%'
          || lower(btrim(coalesce(p_query, ''))) || '%')
  )
  select jsonb_agg(jsonb_build_object(
    'person_id', id, 'user_id', user_id, 'employee_code', employee_code,
    'full_name', performer_name, 'department', department, 'email', email,
    'account_status', case when user_id is null then 'unlinked'
      when coalesce(account_is_active, false) is false then 'inactive' else 'linked' end,
    'access_class', access_class, 'scope_departments', scope_departments,
    'access_areas', access_areas, 'scope_factory_ids', scope_factory_ids,
    'scope_area_ids', scope_area_ids, 'scope_line_ids', scope_line_ids,
    'version', version, 'email_sent_confirmed', email_sent_confirmed,
    'is_active', is_active,
    'match_status', case when same_name_count > 1 then 'ambiguous' else 'unique' end
  ) order by performer_name, department, email, id) into v_people
  from candidates;
  return jsonb_build_object(
    'ok', true, 'people', coalesce(v_people, '[]'::jsonb)
  );
end
$fn$;

/* Override đầy đủ để không làm mất bất kỳ nhánh security/source-resolution nào. */
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
      'code', 'INCOMPLETE_ACTIVE_PERSON', 'record_id', person.id,
      'message', 'Nhân viên hoạt động thiếu bộ phận, phân loại hoặc phạm vi bắt buộc'
    ) as error
    from public.vmp_performers person
    where person.is_active and (
      nullif(btrim(person.performer_name), '') is null
      or nullif(btrim(coalesce(person.department, '')), '') is null
      or person.access_class is null
      or (
        person.access_class not in ('qa_progress_editor', 'qa_manager')
        and (
          cardinality(person.scope_departments) = 0
          or cardinality(person.access_areas) = 0
        )
      )
    )

    union all
    select jsonb_build_object(
      'code', 'INVALID_PERSON_DEPARTMENT', 'record_id', person.id,
      'message', 'department của nhân viên không có trong catalog departments'
    )
    from public.vmp_performers person
    where person.is_active
      and not public.vmp_valid_person_department(person.department)

    union all
    select jsonb_build_object(
      'code', 'UNRESOLVED_ASSIGNMENT', 'record_id', assignment.id,
      'message', 'Phân công chưa nối duy nhất với tài khoản'
    )
    from public.vmp_item_assignments assignment
    where assignment.is_active and assignment.unresolved_reason is not null

    union all
    select jsonb_build_object(
      'code', 'ASSIGNMENT_USER_MISMATCH', 'record_id', assignment.id,
      'message', 'user_id denormalized của phân công không khớp performer'
    )
    from public.vmp_item_assignments assignment
    join public.vmp_performers person on person.id = assignment.performer_id
    where assignment.is_active
      and assignment.user_id is distinct from person.user_id

    union all
    select jsonb_build_object(
      'code', 'ASSIGNMENT_PERSON_INACTIVE', 'record_id', assignment.id,
      'message', 'Phân công đang trỏ tới nhân viên đã ngừng hoạt động'
    )
    from public.vmp_item_assignments assignment
    join public.vmp_performers person on person.id = assignment.performer_id
    where assignment.is_active and not person.is_active

    union all
    select jsonb_build_object(
      'code', 'ASSIGNMENT_DENORMALIZED_MISMATCH', 'record_id', assignment.id,
      'message', 'Mã, tên hoặc trạng thái liên kết phân công không khớp performer'
    )
    from public.vmp_item_assignments assignment
    join public.vmp_performers person on person.id = assignment.performer_id
    where assignment.is_active and (
      assignment.employee_code is distinct from person.employee_code
      or assignment.staff_name is distinct from person.performer_name
      or assignment.unresolved_reason is distinct from case
        when person.user_id is null then 'account_unlinked' else null end
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
      and exists (
        select 1 from public.vmp_item_assignments assignment
        where assignment.is_active
          and assignment.validation_code = resolution.validation_code
          and assignment.assignment_kind = resolution.assignment_kind
          and assignment.source = resolution.source
          and public.vmp_normalize_person_name(
            coalesce(assignment.source_text, assignment.staff_name)
          ) = resolution.normalized_source_name
      )

    union all
    select jsonb_build_object(
      'code', 'INVALID_QA_CLASS_DEPARTMENT', 'record_id', person.id,
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
      'code', 'INVALID_SCOPE_DEPARTMENT', 'record_id', person.id,
      'message', 'scope_departments chứa mã không có trong departments'
    )
    from public.vmp_performers person
    where person.is_active
      and cardinality(person.scope_departments) > 0
      and not public.vmp_valid_scope_departments(person.scope_departments)

    union all
    select jsonb_build_object(
      'code', 'INVALID_ACCESS_AREA', 'record_id', person.id,
      'message', 'access_areas chứa area/line không tồn tại'
    )
    from public.vmp_performers person
    where person.is_active
      and cardinality(person.access_areas) > 0
      and not public.vmp_valid_access_areas(person.access_areas)

    union all
    select jsonb_build_object(
      'code', 'ITEM_MISSING_PERMISSION_DIMENSION', 'record_id', item.validation_code,
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
      'code', 'UNFILTERED_SECURITY_DEFINER_RPC', 'record_id', audit.signature,
      'message', 'SECURITY DEFINER đọc hạng mục chưa dùng lõi quyền/allowlist'
    )
    from public.vmp_unfiltered_security_definer_item_readers() audit

    union all
    select jsonb_build_object(
      'code', 'INCOMPLETE_SCOPE_HIERARCHY', 'record_id', person.id,
      'message', 'Nhân viên hoạt động chưa chọn đủ xưởng, khu vực và line'
    )
    from public.vmp_performers person
    where person.is_active
      and person.access_class not in ('qa_progress_editor', 'qa_manager')
      and (
        cardinality(person.scope_departments) = 0
        or cardinality(person.scope_factory_ids) = 0
        or cardinality(person.scope_area_ids) = 0
        or cardinality(person.scope_line_ids) = 0
      )

    union all
    select jsonb_build_object(
      'code', 'INVALID_SCOPE_HIERARCHY', 'record_id', person.id,
      'message', 'Phạm vi xưởng, khu vực và line không nối đủ quan hệ cha'
    )
    from public.vmp_performers person
    where person.is_active
      and cardinality(person.scope_departments) > 0
      and cardinality(person.scope_factory_ids) > 0
      and cardinality(person.scope_area_ids) > 0
      and cardinality(person.scope_line_ids) > 0
      and not public.vmp_valid_permission_scope(
        person.scope_departments, person.scope_factory_ids,
        person.scope_area_ids, person.scope_line_ids
      )

    union all
    select jsonb_build_object(
      'code', 'UNRESOLVED_OWNER_PERSON_ID', 'record_id', source.id,
      'message', 'Tên QA phụ trách chưa nối duy nhất với person_id hoạt động'
    )
    from public.vmp_source_objects source
    where source.is_active and nullif(btrim(source.owner_name), '') is not null
      and source.owner_person_id is null

    union all
    select jsonb_build_object(
      'code', 'UNRESOLVED_SUPPORT_PERSON_ID', 'record_id', source.id,
      'message', 'Tên người hỗ trợ chưa nối duy nhất với person_id hoạt động'
    )
    from public.vmp_source_objects source
    where source.is_active and nullif(btrim(source.support_name), '') is not null
      and source.support_person_id is null

    union all
    select jsonb_build_object(
      'code', case when public.vmp_item_scope_path_count(item.validation_code) = 0
        then 'ITEM_SCOPE_HIERARCHY_UNRESOLVED'
        else 'ITEM_SCOPE_HIERARCHY_AMBIGUOUS' end,
      'record_id', item.validation_code,
      'message', 'Hạng mục không ánh xạ duy nhất vào hierarchy canonical'
    )
    from public.vmp_plan_items item
    where item.is_active
      and public.vmp_item_scope_path_count(item.validation_code) <> 1

    union all
    select jsonb_build_object(
      'code', 'INVALID_SOURCE_OWNER_PERSON_LINK', 'record_id', source.id,
      'message', 'owner_person_id thiếu/inactive hoặc không khớp owner_name canonical'
    )
    from public.vmp_source_objects source
    left join public.vmp_performers person on person.id = source.owner_person_id
    where source.is_active and (
      (nullif(btrim(source.owner_name), '') is not null and source.owner_person_id is null)
      or (source.owner_person_id is not null and (
        person.id is null or not person.is_active
        or public.vmp_normalize_person_name(source.owner_name)
          is distinct from person.normalized_full_name
      ))
    )

    union all
    select jsonb_build_object(
      'code', 'INVALID_SOURCE_SUPPORT_PERSON_LINK', 'record_id', source.id,
      'message', 'support_person_id thiếu/inactive hoặc không khớp support_name canonical'
    )
    from public.vmp_source_objects source
    left join public.vmp_performers person on person.id = source.support_person_id
    where source.is_active and (
      (nullif(btrim(source.support_name), '') is not null and source.support_person_id is null)
      or (source.support_person_id is not null and (
        person.id is null or not person.is_active
        or public.vmp_normalize_person_name(source.support_name)
          is distinct from person.normalized_full_name
      ))
    )

    union all
    select jsonb_build_object(
      'code', 'INVALID_PLAN_OWNER_PERSON_LINK', 'record_id', item.validation_code,
      'message', 'plan owner_person_id thiếu/inactive hoặc không khớp owner_name canonical'
    )
    from public.vmp_plan_items item
    left join public.vmp_performers person on person.id = item.owner_person_id
    where item.is_active and (
      (nullif(btrim(item.owner_name), '') is not null and item.owner_person_id is null)
      or (item.owner_person_id is not null and (
        person.id is null or not person.is_active
        or public.vmp_normalize_person_name(item.owner_name)
          is distinct from person.normalized_full_name
      ))
    )

    union all
    select jsonb_build_object(
      'code', 'INVALID_PLAN_SUPPORT_PERSON_LINK', 'record_id', item.validation_code,
      'message', 'plan support_person_id thiếu/inactive hoặc không khớp secondary_owner canonical'
    )
    from public.vmp_plan_items item
    left join public.vmp_performers person on person.id = item.support_person_id
    where item.is_active and (
      (nullif(btrim(item.secondary_owner), '') is not null and item.support_person_id is null)
      or (item.support_person_id is not null and (
        person.id is null or not person.is_active
        or public.vmp_normalize_person_name(item.secondary_owner)
          is distinct from person.normalized_full_name
      ))
    )
  )
  select jsonb_agg(error) into v_blocking from errors;

  with warnings as (
    select jsonb_build_object(
      'code', 'EMPLOYEE_CODE_MISSING', 'record_id', person.id,
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

/* Refresh nguồn phải sinh assignment_role hợp lệ và ưu tiên sheet_qa làm
 * primary. Mọi đường ghi assignment dùng cùng thứ tự performer → item. */
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

  perform person.id
  from public.vmp_performers person
  order by person.id
  for update;

  perform item.validation_code
  from public.vmp_plan_items item
  where item.is_active
  order by item.validation_code
  for update;

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
    select source.*,
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
    assignment_kind, assignment_role, source, source_text, unresolved_reason,
    is_active, change_reason, created_by, updated_by
  )
  select selected.validation_code,
         selected.performer_id,
         person.user_id,
         coalesce(person.performer_name, selected.source_name),
         person.employee_code,
         selected.assignment_kind,
         case when selected.assignment_kind = 'qa'
           then 'collaborator' else null end,
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
         selected.assignment_kind <> 'qa',
         'Đồng bộ phân công từ dữ liệu Sheet',
         v_actor,
         v_actor
  from selected
  left join public.vmp_performers person on person.id = selected.performer_id;
  get diagnostics v_inserted = row_count;

  update public.vmp_item_assignments duplicate
  set is_active = false,
      assignment_role = 'collaborator',
      change_reason = 'Gộp nguồn phân công khi chuyển person_id',
      updated_by = v_actor
  where duplicate.assignment_kind = 'qa'
    and duplicate.source <> 'sheet_qa'
    and duplicate.performer_id is not null
    and duplicate.is_active
    and exists (
      select 1
      from public.vmp_item_assignments sheet
      where sheet.validation_code = duplicate.validation_code
        and sheet.performer_id = duplicate.performer_id
        and sheet.assignment_kind = 'qa'
        and sheet.source = 'sheet_qa'
    );

  update public.vmp_item_assignments
  set is_active = true
  where assignment_kind = 'qa' and source = 'sheet_qa';

  update public.vmp_item_assignments
  set assignment_role = 'collaborator'
  where assignment_kind = 'qa'
    and assignment_role is distinct from 'collaborator';

  with ranked as (
    select assignment.id,
           row_number() over (
             partition by assignment.validation_code
             order by (assignment.source = 'sheet_qa') desc,
                      assignment.created_at,
                      assignment.id
           ) as position
    from public.vmp_item_assignments assignment
    where assignment.assignment_kind = 'qa' and assignment.is_active
  )
  update public.vmp_item_assignments assignment
  set assignment_role = 'primary'
  from ranked
  where assignment.id = ranked.id and ranked.position = 1;

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
    array['sheet_qa', 'sheet_other_staff', 'assignment_role']
  );

  return jsonb_build_object(
    'ok', true, 'inserted', v_inserted, 'unresolved', v_unresolved
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false, 'error_code', 'SOURCE_REFRESH_FAILED', 'error', sqlerrm
    );
end
$fn$;

revoke all on function public.rpc_set_item_assignment(uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
drop function public.rpc_set_item_assignment(uuid, text, text, text, text);

create function public.rpc_set_item_assignment(
  p_person_id uuid,
  p_validation_code text,
  p_assignment_kind text,
  p_assignment_role text,
  p_action text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := auth.uid();
  v_principal record;
  v_target public.vmp_performers%rowtype;
  v_object_department text;
  v_object_area text;
  v_object_line text;
  v_source text;
  v_scope_match boolean;
  v_area_match boolean;
  v_assignment_id uuid;
  v_existing_primary_id uuid;
  v_old_assignments jsonb;
  v_new_assignments jsonb;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Bắt buộc nhập lý do phân công'
    );
  end if;
  if p_assignment_kind is null
      or p_assignment_kind not in ('qa', 'equipment_department') then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_ASSIGNMENT_KIND',
      'error', 'Loại phân công không hợp lệ'
    );
  end if;
  if p_assignment_kind = 'qa'
      and (p_assignment_role is null
        or p_assignment_role not in ('primary', 'collaborator')) then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_ASSIGNMENT_ROLE',
      'error', 'Phân công QA phải là phụ trách chính hoặc phối hợp'
    );
  end if;
  if p_assignment_kind = 'equipment_department'
      and p_assignment_role is not null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_ASSIGNMENT_ROLE',
      'error', 'Phân công thiết bị không nhận vai trò QA'
    );
  end if;
  if p_action is null
      or p_action not in ('assign', 'revoke', 'replace_primary') then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_ASSIGNMENT_ACTION',
      'error', 'Hành động chỉ nhận assign, revoke hoặc replace_primary'
    );
  end if;
  if p_action = 'replace_primary'
      and (p_assignment_kind <> 'qa' or p_assignment_role <> 'primary') then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_ASSIGNMENT_ACTION',
      'error', 'replace_primary chỉ dùng để thay QA phụ trách chính'
    );
  end if;

  select * into v_principal from public.vmp_manager_principal(v_actor);
  if v_principal.principal_kind is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Principal quản lý không hợp lệ hoặc không nhất quán'
    );
  end if;

  select * into v_target
  from public.vmp_performers
  where id = p_person_id and is_active
  for update;
  if not found then
    return jsonb_build_object(
      'ok', false, 'error_code', 'PERSON_NOT_FOUND',
      'error', 'Không tìm thấy nhân viên hoạt động'
    );
  end if;
  if p_assignment_kind = 'qa' and (
      v_target.department is distinct from 'qa'
      or v_target.access_class is distinct from 'qa_progress_editor'
    ) then
    return jsonb_build_object(
      'ok', false, 'error_code', 'QA_TARGET_NOT_ASSIGNABLE',
      'error', 'Chỉ phân công được nhân viên QA xử lý tiến độ'
    );
  end if;

  select object.department, object.area, object.line
  into v_object_department, v_object_area, v_object_line
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  where item.validation_code = p_validation_code and item.is_active
  for update of item;
  if not found then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ITEM_NOT_FOUND',
      'error', 'Không tìm thấy hạng mục thẩm định'
    );
  end if;

  if v_principal.principal_kind = 'qa_manager' then
    if p_assignment_kind <> 'qa' then
      return jsonb_build_object(
        'ok', false, 'error_code', 'FORBIDDEN_ASSIGNMENT_KIND',
        'error', 'Quản lý QA chỉ phân công loại QA'
      );
    end if;
  elsif v_principal.principal_kind = 'equipment_manager' then
    if p_assignment_kind <> 'equipment_department' then
      return jsonb_build_object(
        'ok', false, 'error_code', 'FORBIDDEN_ASSIGNMENT_KIND',
        'error', 'Quản lý bộ phận thiết bị chỉ phân công nhân sự bộ phận'
      );
    end if;
    if v_principal.profile_department is null
        or v_target.department is distinct from v_principal.profile_department
        or v_object_department is distinct from v_principal.profile_department then
      return jsonb_build_object(
        'ok', false, 'error_code', 'OUTSIDE_MANAGER_DEPARTMENT',
        'error', 'Chỉ phân công người cùng bộ phận cho hạng mục do bộ phận mình quản lý'
      );
    end if;
    v_scope_match := coalesce(
      '*' = any(v_principal.scope_departments)
      or v_object_department = any(v_principal.scope_departments),
      false
    );
    v_area_match := coalesce(
      '*' = any(v_principal.access_areas)
      or v_object_area = any(v_principal.access_areas)
      or v_object_line = any(v_principal.access_areas),
      false
    );
    if not v_scope_match or not v_area_match then
      return jsonb_build_object(
        'ok', false, 'error_code', 'OUTSIDE_MANAGER_SCOPE',
        'error', 'Hạng mục ngoài phạm vi/khu vực quản lý'
      );
    end if;
  elsif v_principal.principal_kind <> 'admin' then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Bạn không có quyền phân công hạng mục'
    );
  end if;

  perform assignment.id
  from public.vmp_item_assignments assignment
  where assignment.validation_code = p_validation_code
    and assignment.assignment_kind = p_assignment_kind
  order by assignment.id
  for update;

  select coalesce(
    jsonb_agg(to_jsonb(assignment) order by assignment.id), '[]'::jsonb
  ) into v_old_assignments
  from public.vmp_item_assignments assignment
  where assignment.validation_code = p_validation_code
    and assignment.assignment_kind = p_assignment_kind;

  v_source := case when p_assignment_kind = 'qa'
    then 'qa_manager' else 'equipment_manager' end;

  if p_action = 'revoke' then
    update public.vmp_item_assignments
    set is_active = false,
        change_reason = btrim(p_reason),
        updated_by = v_actor
    where validation_code = p_validation_code
      and performer_id = p_person_id
      and assignment_kind = p_assignment_kind
      and is_active;
  else
    if p_assignment_kind = 'qa' and p_assignment_role = 'primary'
        and p_action = 'assign' then
      select assignment.id into v_existing_primary_id
      from public.vmp_item_assignments assignment
      where assignment.validation_code = p_validation_code
        and assignment.assignment_kind = 'qa'
        and assignment.assignment_role = 'primary'
        and assignment.is_active
        and assignment.performer_id is distinct from p_person_id
      order by assignment.id
      limit 1;
      if v_existing_primary_id is not null then
        return jsonb_build_object(
          'ok', false, 'error_code', 'PRIMARY_ALREADY_EXISTS',
          'error', 'Hạng mục đã có QA phụ trách chính'
        );
      end if;
    end if;

    if p_action = 'replace_primary' then
      update public.vmp_item_assignments
      set assignment_role = 'collaborator',
          change_reason = btrim(p_reason),
          updated_by = v_actor
      where validation_code = p_validation_code
        and assignment_kind = 'qa'
        and assignment_role = 'primary'
        and is_active;
    end if;

    select assignment.id into v_assignment_id
    from public.vmp_item_assignments assignment
    where assignment.validation_code = p_validation_code
      and assignment.performer_id = p_person_id
      and assignment.assignment_kind = p_assignment_kind
    order by assignment.is_active desc,
             (assignment.source = v_source) desc,
             assignment.created_at,
             assignment.id
    limit 1;

    if v_assignment_id is null then
      insert into public.vmp_item_assignments (
        validation_code, performer_id, user_id, staff_name, employee_code,
        assignment_kind, assignment_role, source, source_text,
        unresolved_reason, is_active, change_reason, created_by, updated_by
      ) values (
        p_validation_code, v_target.id, v_target.user_id,
        v_target.performer_name, v_target.employee_code,
        p_assignment_kind, p_assignment_role, v_source,
        v_target.performer_name,
        case when v_target.user_id is null then 'account_unlinked' else null end,
        true, btrim(p_reason), v_actor, v_actor
      ) returning id into v_assignment_id;
    else
      update public.vmp_item_assignments
      set user_id = v_target.user_id,
          staff_name = v_target.performer_name,
          employee_code = v_target.employee_code,
          assignment_role = p_assignment_role,
          source_text = v_target.performer_name,
          unresolved_reason = case when v_target.user_id is null
            then 'account_unlinked' else null end,
          is_active = true,
          change_reason = btrim(p_reason),
          updated_by = v_actor
      where id = v_assignment_id;
    end if;
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(assignment) order by assignment.id), '[]'::jsonb
  ) into v_new_assignments
  from public.vmp_item_assignments assignment
  where assignment.validation_code = p_validation_code
    and assignment.assignment_kind = p_assignment_kind;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields, validation_code
  ) values (
    v_actor,
    case when p_action = 'revoke'
      then 'DELETE'::public.audit_action else 'UPDATE'::public.audit_action end,
    'vmp_item_assignments',
    p_validation_code || '×' || p_person_id::text,
    jsonb_build_object('assignments', v_old_assignments),
    jsonb_build_object(
      'person_id', p_person_id,
      'assignment_kind', p_assignment_kind,
      'assignment_role', p_assignment_role,
      'action', p_action,
      'assignments', v_new_assignments
    ),
    btrim(p_reason), 'dashboard_rpc',
    array['assignment_role', 'is_active'], p_validation_code
  );

  return jsonb_build_object(
    'ok', true,
    'action', p_action,
    'source', v_source,
    'assignment_role', p_assignment_role,
    'account_status', case when v_target.user_id is null
      then 'unlinked' else 'linked' end
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ASSIGNMENT_CONFLICT',
      'error', 'Phân công vừa được thay đổi ở phiên khác'
    );
  when others then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ASSIGNMENT_MUTATION_FAILED', 'error', sqlerrm
    );
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
  v_principal record;
  v_assignments jsonb;
begin
  select * into v_principal from public.vmp_manager_principal(auth.uid());
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
    'assignment_role', assignment.assignment_role,
    'source', assignment.source,
    'source_text', assignment.source_text,
    'unresolved_reason', assignment.unresolved_reason,
    'expires_at', assignment.expires_at,
    'is_active', assignment.is_active,
    'grants_access', active.grants_access,
    'object_department', object.department,
    'area', object.area,
    'line', object.line
  ) order by assignment.validation_code, assignment.assignment_kind,
             assignment.assignment_role, assignment.staff_name)
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

alter function public.vmp_item_rights(uuid, text)
  rename to vmp_item_rights_before_assignment_only_qa;
alter function public.vmp_item_rights_before_assignment_only_qa(uuid, text)
  security invoker;
revoke all on function public.vmp_item_rights_before_assignment_only_qa(uuid, text)
  from public, anon, authenticated, service_role;

/* QA chạy trước hierarchy: performer đang hoạt động và liên kết account là
 * canonical principal; assignment dùng performer_id, không dùng scope. */
create function public.vmp_item_rights(p_uid uuid, p_validation_code text)
returns table (
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
  v_person public.vmp_performers%rowtype;
  v_principal record;
  v_has_qa_assignment boolean := false;
  v_sources text[] := '{}'::text[];
  v_old record;
  v_qa_fields constant text[] := array[
    'actual_protocol_date', 'status_protocol',
    'actual_validation_date', 'status_validation',
    'actual_report_date', 'status_report',
    'actual_vmp_date', 'status_vmp'
  ]::text[];
begin
  select profile.role::text into v_role
  from public.profiles profile
  where profile.id = p_uid and coalesce(profile.is_active, true);

  if v_role is null then
    return query select *
    from public.vmp_item_rights_before_assignment_only_qa(p_uid, p_validation_code);
    return;
  end if;

  if v_role = 'admin' then
    return query select *
    from public.vmp_item_rights_before_assignment_only_qa(p_uid, p_validation_code);
    return;
  end if;

  select * into v_person
  from public.vmp_performers person
  where person.user_id = p_uid and person.is_active;
  select * into v_principal
  from public.vmp_manager_principal(p_uid);

  if v_role = 'qa_manager' or v_person.access_class = 'qa_manager' then
    if v_principal.principal_kind = 'qa_manager'
        and exists (
          select 1
          from public.vmp_plan_items item
          where item.validation_code = p_validation_code and item.is_active
        ) then
      return query select true, v_qa_fields,
        'Quản lý QA xem toàn bộ hạng mục hoạt động',
        '{}'::text[], true, true;
      return;
    end if;
    return query select *
    from public.vmp_item_rights_before_assignment_only_qa(p_uid, p_validation_code);
    return;
  end if;

  if v_person.access_class = 'qa_progress_editor' then
    if not exists (
      select 1
      from public.vmp_plan_items item
      where item.validation_code = p_validation_code and item.is_active
    ) then
      return query select false, '{}'::text[],
        'Không tìm thấy hạng mục hoạt động', '{}'::text[], false, false;
      return;
    end if;

    select coalesce(bool_or(assignment.is_active), false),
           coalesce(
             array_agg(distinct assignment.source order by assignment.source),
             '{}'::text[]
           )
    into v_has_qa_assignment, v_sources
    from public.vmp_item_assignments assignment
    where assignment.validation_code = p_validation_code
      and assignment.performer_id = v_person.id
      and assignment.assignment_kind = 'qa'
      and assignment.is_active
      and (assignment.expires_at is null or assignment.expires_at > now());

    return query select
      v_has_qa_assignment,
      case when v_has_qa_assignment then v_qa_fields else '{}'::text[] end,
      case when v_has_qa_assignment then 'Có phân công QA đang hoạt động'
           else 'Chưa có phân công QA đang hoạt động' end,
      v_sources,
      v_has_qa_assignment,
      v_has_qa_assignment;
    return;
  end if;

  select * into v_old
  from public.vmp_item_rights_before_assignment_only_qa(p_uid, p_validation_code);
  return query select v_old.can_view, v_old.editable_fields, v_old.view_reason,
    v_old.assignment_sources, v_old.scope_match, v_old.area_match;
end
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
  v_principal record;
  v_rows jsonb;
begin
  select * into v_principal from public.vmp_manager_principal(auth.uid());
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
    'assignment_role', active_assignment.assignment_role,
    'can_view', rights.can_view,
    'editable_fields', rights.editable_fields,
    'view_reason', rights.view_reason,
    'assignment_sources', rights.assignment_sources,
    'scope_match', case when person.access_class in (
        'qa_progress_editor', 'qa_manager'
      ) then rights.scope_match else scope.scope_match end,
    'factory_match', case when person.access_class in (
        'qa_progress_editor', 'qa_manager'
      ) then rights.scope_match else scope.factory_match end,
    'area_match', case when person.access_class in (
        'qa_progress_editor', 'qa_manager'
      ) then rights.area_match else scope.area_match end,
    'line_match', case when person.access_class in (
        'qa_progress_editor', 'qa_manager'
      ) then rights.area_match else scope.line_match end
  ) order by person.performer_name, item.validation_code)
  into v_rows
  from public.vmp_performers person
  cross join public.vmp_visible_plan_items() item
  join public.vmp_objects object on object.code = item.object_code
  cross join lateral public.vmp_item_rights(person.user_id, item.validation_code) rights
  cross join lateral public.vmp_item_scope_matches(person.id, item.validation_code) scope
  left join lateral (
    select assignment.assignment_role
    from public.vmp_item_assignments assignment
    where assignment.validation_code = item.validation_code
      and assignment.performer_id = person.id
      and assignment.is_active
      and (assignment.expires_at is null or assignment.expires_at > now())
    order by (assignment.assignment_kind = 'qa') desc,
             (assignment.assignment_role = 'primary') desc,
             assignment.created_at,
             assignment.id
    limit 1
  ) active_assignment on true
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
      )
    );

  return jsonb_build_object(
    'ok', true,
    'mode', public.item_permissions_mode(),
    'rights', coalesce(v_rows, '[]'::jsonb)
  );
end
$fn$;

do $patch_qa_assignment_preflight$
declare
  v_signature regprocedure := 'public.rpc_item_permission_preflight()'::regprocedure;
  v_definition text;
  v_marker text := E'  )\n  select jsonb_agg(error) into v_blocking from errors;';
  v_extra text := $sql$

    union all
    select jsonb_build_object(
      'code', 'DUPLICATE_ACTIVE_QA_PRIMARY',
      'record_id', duplicate.validation_code,
      'message', 'Hạng mục có nhiều hơn một QA phụ trách chính đang hoạt động'
    )
    from (
      select assignment.validation_code
      from public.vmp_item_assignments assignment
      where assignment.assignment_kind = 'qa'
        and assignment.assignment_role = 'primary'
        and assignment.is_active
      group by assignment.validation_code
      having count(*) > 1
    ) duplicate

    union all
    select jsonb_build_object(
      'code', 'DUPLICATE_ACTIVE_QA_PERSON',
      'record_id', duplicate.validation_code || '×' || duplicate.performer_id::text,
      'message', 'Một nhân viên có nhiều nguồn phân công QA active trên cùng hạng mục'
    )
    from (
      select assignment.validation_code, assignment.performer_id
      from public.vmp_item_assignments assignment
      where assignment.performer_id is not null
        and assignment.assignment_kind = 'qa'
        and assignment.is_active
      group by assignment.validation_code, assignment.performer_id,
               assignment.assignment_kind
      having count(*) > 1
    ) duplicate$sql$;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position(v_marker in v_definition) = 0 then
    raise exception 'Không tìm thấy điểm nối QA duplicate trong preflight';
  end if;
  execute replace(v_definition, v_marker, v_extra || E'\n' || v_marker);
end
$patch_qa_assignment_preflight$;

revoke execute on function public.rpc_upsert_item_permission_staff(
  uuid, jsonb, text, integer
) from public, anon;
revoke execute on function public.rpc_import_item_permission_staff(jsonb, text)
  from public, anon;
revoke execute on function public.rpc_item_permission_account_candidates(text)
  from public, anon;
revoke execute on function public.rpc_link_item_permission_account(
  uuid, uuid, text, integer
) from public, anon;
revoke execute on function public.rpc_item_permission_directory(text)
  from public, anon;
revoke execute on function public.rpc_item_permission_preflight()
  from public, anon;
revoke all on function public.rpc_set_item_assignment(
  uuid, text, text, text, text, text
) from public, anon, service_role;
revoke execute on function public.rpc_item_assignments(text, uuid)
  from public, anon;
revoke all on function public.vmp_item_rights(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.rpc_preview_item_rights(uuid, text)
  from public, anon;
revoke all on function public.rpc_set_item_performer(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.vmp_set_item_assignment_unhardened(
  uuid, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.rpc_lien_ket_tai_khoan(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rpc_upsert_performer(uuid, jsonb)
  from public, anon;
revoke all on function public.rpc_delete_performer(uuid)
  from public, anon;
revoke all on function public.rpc_set_user_role(uuid, text, text, text, text)
  from public, anon;

grant execute on function public.rpc_upsert_item_permission_staff(
  uuid, jsonb, text, integer
) to authenticated, service_role;
grant execute on function public.rpc_import_item_permission_staff(jsonb, text)
  to authenticated, service_role;
grant execute on function public.rpc_item_permission_account_candidates(text)
  to authenticated, service_role;
grant execute on function public.rpc_link_item_permission_account(
  uuid, uuid, text, integer
) to authenticated, service_role;
grant execute on function public.rpc_item_permission_directory(text)
  to authenticated, service_role;
grant execute on function public.rpc_item_permission_preflight()
  to authenticated, service_role;
grant execute on function public.rpc_set_item_assignment(
  uuid, text, text, text, text, text
) to authenticated;
grant execute on function public.rpc_item_assignments(text, uuid)
  to authenticated, service_role;
grant execute on function public.vmp_item_rights(uuid, text)
  to service_role;
grant execute on function public.rpc_preview_item_rights(uuid, text)
  to authenticated, service_role;
grant execute on function public.rpc_upsert_performer(uuid, jsonb)
  to authenticated, service_role;
grant execute on function public.rpc_delete_performer(uuid)
  to authenticated, service_role;
grant execute on function public.rpc_set_user_role(uuid, text, text, text, text)
  to authenticated;

do $verify$
begin
  if public.item_permissions_mode() <> 'preview' then
    raise exception 'Migration nối account QA không được tự bật enforced';
  end if;
  if has_function_privilege(
      'anon', 'public.rpc_item_permission_account_candidates(text)', 'EXECUTE'
    ) or has_function_privilege(
      'anon',
      'public.rpc_link_item_permission_account(uuid,uuid,text,integer)',
      'EXECUTE'
    ) or not has_function_privilege(
      'authenticated', 'public.rpc_item_permission_account_candidates(text)', 'EXECUTE'
    ) or not has_function_privilege(
      'authenticated',
      'public.rpc_link_item_permission_account(uuid,uuid,text,integer)',
      'EXECUTE'
    ) or not has_function_privilege(
      'service_role', 'public.rpc_item_permission_account_candidates(text)', 'EXECUTE'
    ) or not has_function_privilege(
      'service_role',
      'public.rpc_link_item_permission_account(uuid,uuid,text,integer)',
      'EXECUTE'
    ) or has_function_privilege(
      'authenticated', 'public.rpc_lien_ket_tai_khoan(uuid,uuid)', 'EXECUTE'
    ) or has_function_privilege(
      'service_role', 'public.rpc_lien_ket_tai_khoan(uuid,uuid)', 'EXECUTE'
    ) then
    raise exception 'Quyền RPC nối account QA chưa tối thiểu hoặc còn đường legacy';
  end if;
  if to_regprocedure(
      'public.rpc_upsert_item_permission_staff(uuid,jsonb,text)'
    ) is not null
      or (
        select count(*)
        from pg_proc procedure
        join pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'public'
          and procedure.proname = 'rpc_upsert_item_permission_staff'
      ) <> 1 then
    raise exception 'RPC upsert danh bạ vẫn bị overload';
  end if;
  if not exists (
    select 1 from pg_event_trigger
    where evtname = 'chan_overload_rpc_tg' and evtenabled = 'O'
  ) then
    raise exception 'Event trigger chống overload RPC không còn bật';
  end if;
  if to_regprocedure(
      'public.rpc_set_item_assignment(uuid,text,text,text,text,text)'
    ) is null
      or to_regprocedure(
        'public.rpc_set_item_assignment(uuid,text,text,text,text)'
      ) is not null
      or (
        select count(*)
        from pg_proc procedure
        join pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'public'
          and procedure.proname = 'rpc_set_item_assignment'
      ) <> 1 then
    raise exception 'RPC phân công chưa thay đúng chữ ký sáu tham số';
  end if;
  if has_function_privilege(
      'service_role',
      'public.rpc_set_item_assignment(uuid,text,text,text,text,text)',
      'EXECUTE'
    ) or has_function_privilege(
      'anon',
      'public.rpc_set_item_assignment(uuid,text,text,text,text,text)',
      'EXECUTE'
    ) or not has_function_privilege(
      'authenticated',
      'public.rpc_set_item_assignment(uuid,text,text,text,text,text)',
      'EXECUTE'
    ) then
    raise exception 'Quyền RPC phân công QA chưa tối thiểu';
  end if;
  if not exists (
      select 1
      from pg_constraint constraint_row
      where constraint_row.conrelid = 'public.vmp_item_assignments'::regclass
        and constraint_row.conname = 'vmp_item_assignments_role_check'
        and constraint_row.convalidated
    ) or not exists (
      select 1 from pg_index index_row
      where index_row.indexrelid =
        'public.vmp_item_assignments_one_active_qa_primary'::regclass
        and index_row.indisunique and index_row.indisvalid
    ) or not exists (
      select 1 from pg_index index_row
      where index_row.indexrelid =
        'public.vmp_item_assignments_one_active_qa_person'::regclass
        and index_row.indisunique and index_row.indisvalid
    ) then
    raise exception 'Constraint/index assignment_role chưa được validate';
  end if;
end
$verify$;

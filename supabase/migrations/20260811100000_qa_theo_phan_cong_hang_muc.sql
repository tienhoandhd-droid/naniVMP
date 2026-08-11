/* Nối tài khoản vào hồ sơ bằng xác nhận Admin; QA nhận quyền từ phân công. */

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
      'code', 'ASSIGNMENT_ACCOUNT_MISMATCH', 'record_id', assignment.id,
      'message', 'Tài khoản trên phân công không khớp tài khoản đã xác nhận của nhân viên'
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
revoke all on function public.rpc_lien_ket_tai_khoan(uuid, uuid)
  from public, anon, authenticated, service_role;

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
end
$verify$;

/* Phạm vi chuẩn department → factory → area → line và liên kết person_id. */

create table public.vmp_scope_factories (
  id uuid primary key default gen_random_uuid(),
  code text not null check (nullif(btrim(code), '') is not null),
  name text not null check (nullif(btrim(name), '') is not null),
  department_id text not null references public.departments(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, code)
);

create table public.vmp_scope_areas (
  id uuid primary key default gen_random_uuid(),
  code text not null check (nullif(btrim(code), '') is not null),
  name text not null check (nullif(btrim(name), '') is not null),
  factory_id uuid not null references public.vmp_scope_factories(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (factory_id, code)
);

create table public.vmp_scope_lines (
  id uuid primary key default gen_random_uuid(),
  code text not null check (nullif(btrim(code), '') is not null),
  name text not null check (nullif(btrim(name), '') is not null),
  area_id uuid not null references public.vmp_scope_areas(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area_id, code)
);

comment on table public.vmp_scope_factories is
  'Danh mục xưởng chuẩn. Migration cố ý không suy đoán/tự sinh xưởng từ area hoặc line legacy.';
comment on table public.vmp_scope_areas is 'Khu vực chuẩn, bắt buộc thuộc một xưởng chuẩn.';
comment on table public.vmp_scope_lines is 'Line chuẩn, bắt buộc thuộc một khu vực chuẩn.';

create trigger set_updated_at before update on public.vmp_scope_factories
  for each row execute function public.trigger_set_updated_at();
create trigger set_updated_at before update on public.vmp_scope_areas
  for each row execute function public.trigger_set_updated_at();
create trigger set_updated_at before update on public.vmp_scope_lines
  for each row execute function public.trigger_set_updated_at();

alter table public.vmp_scope_factories enable row level security;
alter table public.vmp_scope_areas enable row level security;
alter table public.vmp_scope_lines enable row level security;
revoke all on public.vmp_scope_factories, public.vmp_scope_areas,
  public.vmp_scope_lines from public, anon, authenticated;
grant select, insert, update, delete on public.vmp_scope_factories,
  public.vmp_scope_areas, public.vmp_scope_lines to service_role;

alter table public.vmp_performers
  add column scope_factory_ids uuid[] not null default '{}'::uuid[],
  add column scope_area_ids uuid[] not null default '{}'::uuid[],
  add column scope_line_ids uuid[] not null default '{}'::uuid[],
  add column version integer not null default 1 check (version > 0);

alter table public.vmp_source_objects
  add column owner_person_id uuid references public.vmp_performers(id) on delete set null,
  add column support_person_id uuid references public.vmp_performers(id) on delete set null;
alter table public.vmp_plan_items
  add column owner_person_id uuid references public.vmp_performers(id) on delete set null,
  add column support_person_id uuid references public.vmp_performers(id) on delete set null;

create index vmp_source_objects_owner_person_idx
  on public.vmp_source_objects(owner_person_id) where owner_person_id is not null;
create index vmp_source_objects_support_person_idx
  on public.vmp_source_objects(support_person_id) where support_person_id is not null;
create index vmp_plan_items_owner_person_idx
  on public.vmp_plan_items(owner_person_id) where owner_person_id is not null;

/* Chỉ backfill khi tên chuẩn hóa khớp đúng một người đang hoạt động. */
update public.vmp_source_objects source
set owner_person_id = matched.person_id
from (
  select normalized_full_name, (array_agg(id order by id))[1] as person_id
  from public.vmp_performers where is_active
  group by normalized_full_name having count(*) = 1
) matched
where nullif(btrim(source.owner_name), '') is not null
  and matched.normalized_full_name = public.vmp_normalize_person_name(source.owner_name);

update public.vmp_source_objects source
set support_person_id = matched.person_id
from (
  select normalized_full_name, (array_agg(id order by id))[1] as person_id
  from public.vmp_performers where is_active
  group by normalized_full_name having count(*) = 1
) matched
where nullif(btrim(source.support_name), '') is not null
  and matched.normalized_full_name = public.vmp_normalize_person_name(source.support_name);

update public.vmp_plan_items item
set owner_person_id = matched.person_id
from (
  select normalized_full_name, (array_agg(id order by id))[1] as person_id
  from public.vmp_performers where is_active
  group by normalized_full_name having count(*) = 1
) matched
where nullif(btrim(item.owner_name), '') is not null
  and matched.normalized_full_name = public.vmp_normalize_person_name(item.owner_name);

update public.vmp_plan_items item
set support_person_id = matched.person_id
from (
  select normalized_full_name, (array_agg(id order by id))[1] as person_id
  from public.vmp_performers where is_active
  group by normalized_full_name having count(*) = 1
) matched
where nullif(btrim(item.secondary_owner), '') is not null
  and matched.normalized_full_name = public.vmp_normalize_person_name(item.secondary_owner);

create or replace function public.vmp_jsonb_uuid_array(p_value jsonb, p_key text)
returns uuid[]
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(value order by value), '{}'::uuid[])
  from (
    select distinct btrim(item)::uuid as value
    from jsonb_array_elements_text(coalesce(p_value -> p_key, '[]'::jsonb)) item
    where nullif(btrim(item), '') is not null
  ) normalized
$fn$;

create or replace function public.vmp_valid_permission_scope(
  p_departments text[], p_factories uuid[], p_areas uuid[], p_lines uuid[]
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select cardinality(coalesce(p_departments, '{}'::text[])) > 0
    and cardinality(coalesce(p_factories, '{}'::uuid[])) > 0
    and cardinality(coalesce(p_areas, '{}'::uuid[])) > 0
    and cardinality(coalesce(p_lines, '{}'::uuid[])) > 0
    and not exists (
      select 1
      from unnest(coalesce(p_departments, '{}'::text[])) scope_department(id)
      left join public.departments department
        on department.id = scope_department.id
       and coalesce(department.is_active, true)
      where department.id is null
    )
    and not exists (
      select 1
      from unnest(coalesce(p_factories, '{}'::uuid[])) scope_factory(id)
      left join public.vmp_scope_factories factory
        on factory.id = scope_factory.id and factory.is_active
      where factory.id is null
        or not (factory.department_id = any(p_departments))
    )
    and not exists (
      select 1
      from unnest(coalesce(p_areas, '{}'::uuid[])) scope_area(id)
      left join public.vmp_scope_areas area
        on area.id = scope_area.id and area.is_active
      where area.id is null or not (area.factory_id = any(p_factories))
    )
    and not exists (
      select 1
      from unnest(coalesce(p_lines, '{}'::uuid[])) scope_line(id)
      left join public.vmp_scope_lines line
        on line.id = scope_line.id and line.is_active
      where line.id is null or not (line.area_id = any(p_areas))
    )
$fn$;

create or replace function public.rpc_item_permission_scope_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor_role text;
  v_departments jsonb;
  v_factories jsonb;
  v_areas jsonb;
  v_lines jsonb;
begin
  select role::text into v_actor_role from public.profiles
  where id = auth.uid() and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role' and v_actor_role is null then
    return jsonb_build_object('ok', false, 'error', 'Không xác định được người dùng');
  end if;

  select jsonb_agg(jsonb_build_object(
    'id', id, 'code', id, 'label', name
  ) order by sort_order, name, id) into v_departments
  from public.departments where coalesce(is_active, true);
  select jsonb_agg(jsonb_build_object(
    'id', id, 'code', code, 'label', name, 'department_id', department_id
  ) order by name, code, id) into v_factories
  from public.vmp_scope_factories where is_active;
  select jsonb_agg(jsonb_build_object(
    'id', id, 'code', code, 'label', name, 'factory_id', factory_id
  ) order by name, code, id) into v_areas
  from public.vmp_scope_areas where is_active;
  select jsonb_agg(jsonb_build_object(
    'id', id, 'code', code, 'label', name, 'area_id', area_id
  ) order by name, code, id) into v_lines
  from public.vmp_scope_lines where is_active;
  return jsonb_build_object(
    'ok', true,
    'departments', coalesce(v_departments, '[]'::jsonb),
    'factories', coalesce(v_factories, '[]'::jsonb),
    'areas', coalesce(v_areas, '[]'::jsonb),
    'lines', coalesce(v_lines, '[]'::jsonb)
  );
end
$fn$;

/* Chữ ký ba tham số cũ phải biến mất trước khi tạo chữ ký canonical;
 * event trigger public.chan_overload_rpc cấm mọi overload rpc_*. */
drop function if exists public.rpc_upsert_item_permission_staff(uuid, jsonb, text);

/* Ghi hồ sơ trực tiếp đúng một lần và audit đúng trạng thái cuối. */
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
  v_profile_role text;
  v_profile_department text;
  v_departments text[];
  v_factories uuid[];
  v_areas uuid[];
  v_lines uuid[];
  v_legacy_areas text[];
  v_is_active boolean;
  v_email_sent boolean;
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
  if v_is_active and not public.vmp_valid_permission_scope(
    v_departments, v_factories, v_areas, v_lines
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_SCOPE_HIERARCHY',
      'error', 'Phạm vi phải có đủ đường bộ phận → xưởng → khu vực → line đang hoạt động');
  end if;

  if v_email is not null then
    select id, role::text, department
    into v_user_id, v_profile_role, v_profile_department
    from public.profiles where lower(btrim(email)) = v_email
    order by created_at limit 1;
    if v_user_id is not null and exists (
      select 1 from public.vmp_performers
      where user_id = v_user_id and id is distinct from v_person_id
    ) then
      return jsonb_build_object('ok', false, 'error_code', 'ACCOUNT_ALREADY_LINKED',
        'error', 'Email/tài khoản này đã nối với một nhân viên khác');
    end if;
  end if;
  if v_user_id is not null and v_access_class = 'equipment_manager'
      and (v_profile_role <> 'department_user'
        or v_profile_department is distinct from v_department) then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_MANAGER_PRINCIPAL',
      'error', 'Quản lý thiết bị phải có role department_user và khớp department');
  end if;
  if v_user_id is not null and v_access_class = 'qa_manager'
      and (v_profile_role <> 'qa_manager' or v_profile_department is distinct from 'qa') then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_MANAGER_PRINCIPAL',
      'error', 'Quản lý QA phải có role qa_manager và thuộc bộ phận QA');
  end if;

  select coalesce(array_agg(code order by code), '{}'::text[]) into v_legacy_areas
  from (
    select distinct area.code from public.vmp_scope_areas area where area.id = any(v_areas)
    union
    select distinct line.code from public.vmp_scope_lines line where line.id = any(v_lines)
  ) value;
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
      email_sent_confirmed = v_email_sent, is_active = v_is_active, updated_by = v_actor
    where id = v_person_id returning * into v_new;
  end if;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields
  ) values (
    v_actor, (case when p_person_id is null then 'INSERT' else 'UPDATE' end)::public.audit_action,
    'vmp_performers', v_person_id::text,
    case when p_person_id is null then null else to_jsonb(v_old) end,
    to_jsonb(v_new), btrim(p_reason), 'dashboard_rpc',
    array(select jsonb_object_keys(v_patch) order by 1)
  );
  return jsonb_build_object('ok', true, 'person_id', v_person_id,
    'user_id', v_user_id, 'version', v_version,
    'account_status', case when v_user_id is null then 'unlinked' else 'linked' end);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error_code', 'UNIQUE_CONFLICT',
      'error', 'Mã nhân viên hoặc tài khoản đã tồn tại');
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_VALUE',
      'error', 'Giá trị patch không đúng định dạng');
  when others then
    return jsonb_build_object('ok', false, 'error_code', 'SAVE_FAILED', 'error', sqlerrm);
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
    raise exception 'IMPORT_ROW_FAILED: dữ liệu nhập phải là mảng' using errcode = 'VMP01';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'IMPORT_ROW_FAILED: thiếu lý do nhập file' using errcode = 'VMP01';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_result := public.rpc_upsert_item_permission_staff(
      null, v_row - 'row_number', p_reason, 0
    );
    if coalesce((v_result->>'ok')::boolean, false) is not true then
      raise exception 'IMPORT_ROW_FAILED: dòng %, %',
        coalesce(v_row->>'row_number', '?'), coalesce(v_result->>'error', 'không hợp lệ')
        using errcode = 'VMP01';
    end if;
    v_imported := v_imported + 1;
  end loop;
  return jsonb_build_object('ok', true, 'imported', v_imported, 'errors', '[]'::jsonb);
end
$fn$;

/* Định nghĩa cũ được giữ tạm trong migration và drop ở cuối; không public. */
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
        or lower(coalesce(person.email, '')) like '%' || lower(btrim(coalesce(p_query, ''))) || '%'
        or lower(coalesce(person.employee_code, '')) like '%' || lower(btrim(coalesce(p_query, ''))) || '%')
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
  return jsonb_build_object('ok', true, 'people', coalesce(v_people, '[]'::jsonb));
end
$fn$;

create or replace function public.rpc_set_item_performer_by_id(
  p_validation_code text, p_person_id uuid, p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor_role text;
  v_object_code text;
  v_person public.vmp_performers%rowtype;
  v_name text;
  v_items integer;
begin
  select role::text into v_actor_role from public.profiles
  where id = auth.uid() and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role not in ('admin', 'qa_manager') then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin hoặc QA được phân công người thực hiện');
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED',
      'error', 'Bắt buộc nhập lý do phân công');
  end if;
  select object_code into v_object_code from public.vmp_visible_plan_items()
  where validation_code = p_validation_code and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'ITEM_NOT_FOUND',
      'error', 'Không tìm thấy mã thẩm định');
  end if;
  if p_person_id is not null then
    select * into v_person from public.vmp_performers
    where id = p_person_id and is_active;
    if not found then
      return jsonb_build_object('ok', false, 'error_code', 'PERSON_NOT_ACTIVE',
        'error', 'Người được chọn không tồn tại hoặc đã ngừng hoạt động');
    end if;
    if v_actor_role = 'qa_manager' and v_person.department is distinct from 'qa' then
      return jsonb_build_object('ok', false, 'error_code', 'PERSON_OUT_OF_SCOPE',
        'error', 'QA chỉ được chọn người trong bộ phận QA');
    end if;
    v_name := v_person.performer_name;
  end if;

  perform set_config('app.audit_source', 'dashboard_rpc', true);
  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.vmp_source_objects
  set owner_person_id = p_person_id, owner_name = v_name, updated_by = auth.uid()
  where object_code = v_object_code;
  update public.vmp_plan_items
  set owner_person_id = p_person_id, owner_name = v_name,
      updated_by = auth.uid(), updated_at = now()
  where object_code = v_object_code and is_active;
  get diagnostics v_items = row_count;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, new_data, change_reason,
    source, changed_fields, validation_code
  ) values (
    auth.uid(), 'UPDATE', 'vmp_source_objects', v_object_code,
    jsonb_build_object('owner_person_id', p_person_id, 'owner_name', v_name),
    btrim(p_reason), 'dashboard_rpc', array['owner_person_id', 'owner_name'],
    p_validation_code
  );
  return jsonb_build_object(
    'ok', true, 'object_code', v_object_code, 'person_id', p_person_id,
    'performer_name', v_name, 'email', v_person.email, 'items', v_items
  );
exception when others then
  return jsonb_build_object('ok', false, 'error_code', 'ASSIGNMENT_FAILED', 'error', sqlerrm);
end
$fn$;

/* Đường gán bằng tên cũ bị vô hiệu hóa; mọi caller phải gửi person_id. */
create or replace function public.rpc_set_item_performer(
  p_validation_code text, p_performer_name text
) returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'ok', false,
    'error_code', 'PERSON_ID_REQUIRED',
    'error', 'Đường gán theo tên đã ngừng hỗ trợ; phải chọn người bằng person_id'
  )
$fn$;
alter function public.rpc_set_item_performer(text, text)
  security invoker;
revoke all on function public.rpc_set_item_performer(text, text)
  from public, anon, authenticated, service_role;

/* Cho Source Catalog gửi person_id; hai cột tên chỉ là mirror tương thích. */
alter function public.rpc_upsert_source_object(text, text, jsonb)
  rename to vmp_upsert_source_object_before_person_id;
revoke all on function public.vmp_upsert_source_object_before_person_id(text, text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.rpc_upsert_source_object(
  p_object_kind text, p_object_code text, p_patch jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor_role text;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_owner public.vmp_performers%rowtype;
  v_support public.vmp_performers%rowtype;
  v_result jsonb;
begin
  select role::text into v_actor_role from public.profiles
  where id = auth.uid() and coalesce(is_active, true);
  if v_actor_role not in ('admin', 'qa_manager') then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ admin hoặc QA được thêm/sửa danh mục nguồn');
  end if;

  if (v_patch ? 'owner_name' and not (v_patch ? 'owner_person_id'))
      or (v_patch ? 'support_name' and not (v_patch ? 'support_person_id')) then
    return jsonb_build_object('ok', false, 'error_code', 'PERSON_ID_REQUIRED',
      'error', 'QA phụ trách/người hỗ trợ phải được chọn bằng person_id');
  end if;

  /* Xóa phân công cũng phải xóa mirror tên; caller không được giữ tên tự do. */
  if v_patch ? 'owner_person_id'
      and nullif(v_patch->>'owner_person_id', '') is null then
    v_patch := v_patch || jsonb_build_object('owner_name', null);
  end if;
  if v_patch ? 'support_person_id'
      and nullif(v_patch->>'support_person_id', '') is null then
    v_patch := v_patch || jsonb_build_object('support_name', null);
  end if;

  if v_patch ? 'owner_person_id' and nullif(v_patch->>'owner_person_id', '') is not null then
    select * into v_owner from public.vmp_performers
    where id = (v_patch->>'owner_person_id')::uuid and is_active;
    if not found then return jsonb_build_object('ok', false,
      'error_code', 'PERSON_NOT_ACTIVE',
      'error', 'QA phụ trách không tồn tại hoặc đã ngừng hoạt động'); end if;
    if v_actor_role = 'qa_manager' and v_owner.department is distinct from 'qa' then
      return jsonb_build_object('ok', false, 'error_code', 'PERSON_OUT_OF_SCOPE',
        'error', 'QA manager chỉ được chọn người thuộc bộ phận QA');
    end if;
    v_patch := v_patch || jsonb_build_object('owner_name', v_owner.performer_name);
  end if;
  if v_patch ? 'support_person_id' and nullif(v_patch->>'support_person_id', '') is not null then
    select * into v_support from public.vmp_performers
    where id = (v_patch->>'support_person_id')::uuid and is_active;
    if not found then return jsonb_build_object('ok', false,
      'error_code', 'PERSON_NOT_ACTIVE',
      'error', 'Người hỗ trợ không tồn tại hoặc đã ngừng hoạt động'); end if;
    if v_actor_role = 'qa_manager' and v_support.department is distinct from 'qa' then
      return jsonb_build_object('ok', false, 'error_code', 'PERSON_OUT_OF_SCOPE',
        'error', 'QA manager chỉ được chọn người thuộc bộ phận QA');
    end if;
    v_patch := v_patch || jsonb_build_object('support_name', v_support.performer_name);
  end if;
  v_result := public.vmp_upsert_source_object_before_person_id(
    p_object_kind, p_object_code,
    v_patch - 'owner_person_id' - 'support_person_id'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then return v_result; end if;

  update public.vmp_source_objects source
  set owner_person_id = case when v_patch ? 'owner_person_id'
        then nullif(v_patch->>'owner_person_id', '')::uuid else source.owner_person_id end,
      owner_name = case when v_patch ? 'owner_person_id'
        then nullif(v_patch->>'owner_name', '') else source.owner_name end,
      support_person_id = case when v_patch ? 'support_person_id'
        then nullif(v_patch->>'support_person_id', '')::uuid else source.support_person_id end,
      support_name = case when v_patch ? 'support_person_id'
        then nullif(v_patch->>'support_name', '') else source.support_name end
  where source.id = (v_result->>'id')::uuid;

  update public.vmp_plan_items item
  set owner_person_id = case when v_patch ? 'owner_person_id'
        then nullif(v_patch->>'owner_person_id', '')::uuid else item.owner_person_id end,
      owner_name = case when v_patch ? 'owner_person_id'
        then nullif(v_patch->>'owner_name', '') else item.owner_name end,
      support_person_id = case when v_patch ? 'support_person_id'
        then nullif(v_patch->>'support_person_id', '')::uuid else item.support_person_id end,
      secondary_owner = case when v_patch ? 'support_person_id'
        then nullif(v_patch->>'support_name', '') else item.secondary_owner end,
      updated_by = auth.uid(), updated_at = now()
  where item.object_code = p_object_code and item.is_active;
  return v_result;
exception when invalid_text_representation then
  return jsonb_build_object('ok', false, 'error_code', 'INVALID_PERSON_ID',
    'error', 'person_id không đúng định dạng UUID');
end
$fn$;

/* Bổ sung blocker hierarchy/person link vào preflight hiện hữu mà không đổi contract cũ. */
do $patch_preflight$
declare
  v_signature regprocedure := 'public.rpc_item_permission_preflight()'::regprocedure;
  v_definition text;
  v_marker text := E'  )\n  select jsonb_agg(error) into v_blocking from errors;';
  v_extra text := $sql$

    union all
    select jsonb_build_object(
      'code', 'INCOMPLETE_SCOPE_HIERARCHY', 'record_id', person.id,
      'message', 'Nhân viên hoạt động chưa chọn đủ xưởng, khu vực và line'
    )
    from public.vmp_performers person
    where person.is_active and (
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
      and source.support_person_id is null$sql$;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position(v_marker in v_definition) = 0 then
    raise exception 'Không tìm thấy điểm nối errors trong preflight';
  end if;
  execute replace(v_definition, v_marker, v_extra || E'\n' || v_marker);
end
$patch_preflight$;

/* Dashboard trả person_id trong activity._raw cho ProgressEditModal. */
do $patch_dashboard$
declare
  v_signature regprocedure :=
    'public.rpc_get_vmp_dashboard(integer,boolean,boolean)'::regprocedure;
  v_definition text;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position($needle$'owner_person_id', i.owner_person_id$needle$ in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      $old$'qa', i.owner_name,$old$,
      $new$'qa', i.owner_name,
          'owner_person_id', i.owner_person_id,$new$
    );
    if position($needle$'owner_person_id', i.owner_person_id$needle$ in v_definition) = 0 then
      raise exception 'Không thể bổ sung owner_person_id vào dashboard raw';
    end if;
    execute v_definition;
  end if;
  alter function public.rpc_get_vmp_dashboard(integer, boolean, boolean)
    set search_path = public, pg_temp;
end
$patch_dashboard$;

revoke execute on function public.vmp_jsonb_uuid_array(jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.vmp_valid_permission_scope(text[], uuid[], uuid[], uuid[])
  from public, anon, authenticated;
revoke execute on function public.rpc_item_permission_scope_catalog() from public, anon;
revoke execute on function public.rpc_upsert_item_permission_staff(uuid, jsonb, text, integer)
  from public, anon;
revoke execute on function public.rpc_import_item_permission_staff(jsonb, text)
  from public, anon;
revoke execute on function public.rpc_item_permission_directory(text) from public, anon;
revoke execute on function public.rpc_set_item_performer_by_id(text, uuid, text)
  from public, anon;
revoke execute on function public.rpc_upsert_source_object(text, text, jsonb)
  from public, anon;

grant execute on function public.vmp_jsonb_uuid_array(jsonb, text) to service_role;
grant execute on function public.vmp_valid_permission_scope(text[], uuid[], uuid[], uuid[])
  to service_role;
grant execute on function public.rpc_item_permission_scope_catalog()
  to authenticated, service_role;
grant execute on function public.rpc_upsert_item_permission_staff(uuid, jsonb, text, integer)
  to authenticated, service_role;
grant execute on function public.rpc_import_item_permission_staff(jsonb, text)
  to authenticated, service_role;
grant execute on function public.rpc_item_permission_directory(text)
  to authenticated, service_role;
grant execute on function public.rpc_set_item_performer_by_id(text, uuid, text)
  to authenticated, service_role;
grant execute on function public.rpc_upsert_source_object(text, text, jsonb)
  to authenticated, service_role;

do $verify$
begin
  if public.item_permissions_mode() <> 'preview' then
    raise exception 'Migration scope/person_id không được tự bật enforced';
  end if;
  if exists (select 1 from public.vmp_scope_factories)
      or exists (select 1 from public.vmp_scope_areas)
      or exists (select 1 from public.vmp_scope_lines) then
    raise exception 'Migration đã tự sinh dữ liệu hierarchy';
  end if;
  if has_table_privilege('authenticated', 'public.vmp_scope_factories', 'SELECT')
      or has_function_privilege(
        'anon', 'public.rpc_set_item_performer_by_id(text,uuid,text)', 'EXECUTE'
      ) then
    raise exception 'Quyền scope/person_id chưa tối thiểu';
  end if;
end
$verify$;

/* =====================================================================
 * Review hardening: quyền hiệu lực dùng đúng hierarchy canonical.
 * ===================================================================== */

create or replace function public.vmp_item_scope_path_count(p_validation_code text)
returns integer
language sql
stable
set search_path = public, pg_temp
as $fn$
  with target as (
    select object.department, nullif(btrim(object.area), '') as area_code,
           nullif(btrim(object.line), '') as line_code
    from public.vmp_plan_items item
    join public.vmp_objects object on object.code = item.object_code
    where item.validation_code = p_validation_code and item.is_active
  )
  select count(*)::integer
  from target
  join public.vmp_scope_factories factory
    on factory.department_id = target.department and factory.is_active
  join public.vmp_scope_areas area
    on area.factory_id = factory.id and area.is_active
   and (target.area_code is null or area.code = target.area_code)
  left join public.vmp_scope_lines line
    on target.line_code is not null
   and line.area_id = area.id and line.is_active and line.code = target.line_code
  where (target.area_code is not null or target.line_code is not null)
    and (target.line_code is null or line.id is not null)
$fn$;

create or replace function public.vmp_item_scope_matches(
  p_person_id uuid, p_validation_code text
) returns table (
  scope_match boolean,
  factory_match boolean,
  area_match boolean,
  line_match boolean
)
language plpgsql
stable
set search_path = public, pg_temp
as $fn$
declare
  v_department text;
  v_area_code text;
  v_line_code text;
  v_factory_id uuid;
  v_area_id uuid;
  v_line_id uuid;
  v_paths integer;
  v_person public.vmp_performers%rowtype;
begin
  select object.department, nullif(btrim(object.area), ''), nullif(btrim(object.line), '')
  into v_department, v_area_code, v_line_code
  from public.vmp_plan_items item
  join public.vmp_objects object on object.code = item.object_code
  where item.validation_code = p_validation_code and item.is_active;

  if not found or (v_area_code is null and v_line_code is null) then
    return query select false, false, false, false;
    return;
  end if;
  select * into v_person from public.vmp_performers
  where id = p_person_id and is_active;
  if not found then
    return query select false, false, false, false;
    return;
  end if;

  select count(*)::integer,
         (array_agg(factory.id order by factory.id, area.id, line.id))[1],
         (array_agg(area.id order by factory.id, area.id, line.id))[1],
         (array_agg(line.id order by factory.id, area.id, line.id))[1]
  into v_paths, v_factory_id, v_area_id, v_line_id
  from public.vmp_scope_factories factory
  join public.vmp_scope_areas area
    on area.factory_id = factory.id and area.is_active
   and (v_area_code is null or area.code = v_area_code)
  left join public.vmp_scope_lines line
    on v_line_code is not null
   and line.area_id = area.id and line.is_active and line.code = v_line_code
  where factory.is_active and factory.department_id = v_department
    and (v_line_code is null or line.id is not null);

  if v_paths <> 1 then
    return query select false, false, false, false;
    return;
  end if;
  return query select
    coalesce(v_department = any(v_person.scope_departments), false),
    coalesce(v_factory_id = any(v_person.scope_factory_ids), false),
    coalesce(v_area_id = any(v_person.scope_area_ids), false),
    case when v_line_code is null then true
      else coalesce(v_line_id = any(v_person.scope_line_ids), false) end;
end
$fn$;

alter function public.vmp_item_rights(uuid, text)
  rename to vmp_item_rights_before_canonical_scope;
alter function public.vmp_item_rights_before_canonical_scope(uuid, text)
  security invoker;
revoke all on function public.vmp_item_rights_before_canonical_scope(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.vmp_item_rights(p_uid uuid, p_validation_code text)
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
  v_person_id uuid;
  v_person public.vmp_performers%rowtype;
  v_old record;
  v_scope record;
  v_hierarchy_match boolean;
begin
  select role::text into v_role from public.profiles
  where id = p_uid and coalesce(is_active, true);
  select * into v_old
  from public.vmp_item_rights_before_canonical_scope(p_uid, p_validation_code);
  if v_role = 'admin' then
    return query select v_old.can_view, v_old.editable_fields, v_old.view_reason,
      v_old.assignment_sources, v_old.scope_match, v_old.area_match;
    return;
  end if;
  select * into v_person from public.vmp_performers
  where user_id = p_uid and is_active;
  v_person_id := v_person.id;
  /* Legacy rows remain preview-compatible; preflight prevents enforced. */
  if public.item_permissions_mode() = 'preview' and (
    cardinality(v_person.scope_factory_ids) = 0
    or cardinality(v_person.scope_area_ids) = 0
    or cardinality(v_person.scope_line_ids) = 0
  ) then
    return query select v_old.can_view, v_old.editable_fields, v_old.view_reason,
      v_old.assignment_sources, v_old.scope_match, v_old.area_match;
    return;
  end if;
  select * into v_scope
  from public.vmp_item_scope_matches(v_person_id, p_validation_code);
  v_hierarchy_match := coalesce(v_scope.scope_match, false)
    and coalesce(v_scope.factory_match, false)
    and coalesce(v_scope.area_match, false)
    and coalesce(v_scope.line_match, false);
  return query select
    coalesce(v_old.can_view, false) and v_hierarchy_match,
    case when coalesce(v_old.can_view, false) and v_hierarchy_match
      then v_old.editable_fields else '{}'::text[] end,
    case when coalesce(v_old.can_view, false) and not v_hierarchy_match
      then 'Ngoài phạm vi bộ phận/xưởng/khu vực/line canonical'
      else v_old.view_reason end,
    v_old.assignment_sources,
    coalesce(v_old.scope_match, false) and coalesce(v_scope.scope_match, false),
    v_hierarchy_match;
end
$fn$;

create or replace function public.rpc_preview_item_rights(
  p_person_id uuid default null, p_validation_code text default null
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
    return jsonb_build_object('ok', false, 'error',
      'Principal quản lý không hợp lệ hoặc không nhất quán');
  end if;
  if p_person_id is null and p_validation_code is null then
    return jsonb_build_object('ok', false, 'error',
      'Chọn một nhân viên hoặc một hạng mục để xem quyền dự kiến');
  end if;
  select jsonb_agg(jsonb_build_object(
    'person_id', person.id, 'user_id', person.user_id,
    'full_name', person.performer_name, 'validation_code', item.validation_code,
    'can_view', rights.can_view, 'editable_fields', rights.editable_fields,
    'view_reason', rights.view_reason, 'assignment_sources', rights.assignment_sources,
    'scope_match', scope.scope_match, 'factory_match', scope.factory_match,
    'area_match', scope.area_match, 'line_match', scope.line_match
  ) order by person.performer_name, item.validation_code) into v_rows
  from public.vmp_performers person
  cross join public.vmp_visible_plan_items() item
  join public.vmp_objects object on object.code = item.object_code
  cross join lateral public.vmp_item_rights(person.user_id, item.validation_code) rights
  cross join lateral public.vmp_item_scope_matches(person.id, item.validation_code) scope
  where person.is_active and item.is_active
    and (p_person_id is null or person.id = p_person_id)
    and (p_validation_code is null or item.validation_code = p_validation_code)
    and (v_principal.principal_kind = 'admin'
      or (v_principal.principal_kind = 'qa_manager' and person.department = 'qa')
      or (v_principal.principal_kind = 'equipment_manager'
        and person.department = v_principal.profile_department
        and object.department = v_principal.profile_department));
  return jsonb_build_object('ok', true, 'mode', public.item_permissions_mode(),
    'rights', coalesce(v_rows, '[]'::jsonb));
end
$fn$;

do $patch_review_preflight$
declare
  v_signature regprocedure := 'public.rpc_item_permission_preflight()'::regprocedure;
  v_definition text;
  v_marker text := E'  )\n  select jsonb_agg(error) into v_blocking from errors;';
  v_extra text := $sql$

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
          is distinct from person.normalized_full_name))
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
          is distinct from person.normalized_full_name))
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
          is distinct from person.normalized_full_name))
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
          is distinct from person.normalized_full_name))
    )$sql$;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position(v_marker in v_definition) = 0 then
    raise exception 'Không tìm thấy điểm nối review errors trong preflight';
  end if;
  execute replace(v_definition, v_marker, v_extra || E'\n' || v_marker);
end
$patch_review_preflight$;

revoke execute on function public.vmp_item_scope_path_count(text)
  from public, anon, authenticated;
revoke execute on function public.vmp_item_scope_matches(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.vmp_item_rights(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.rpc_preview_item_rights(uuid, text)
  from public, anon;
grant execute on function public.vmp_item_scope_path_count(text) to service_role;
grant execute on function public.vmp_item_scope_matches(uuid, text) to service_role;
grant execute on function public.vmp_item_rights(uuid, text) to service_role;
grant execute on function public.rpc_preview_item_rights(uuid, text)
  to authenticated, service_role;

/* Source upsert là writer đã kiểm role/person_id, không phải reader browser. */
do $allow_source_writer$
declare
  v_signature regprocedure :=
    'public.vmp_unfiltered_security_definer_item_readers()'::regprocedure;
  v_definition text;
  v_marker text :=
    $marker$      ('rpc_set_item_performer(text,text)', 'RPC ghi người thực hiện'),$marker$;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position('rpc_upsert_source_object(text,text,jsonb)' in v_definition) = 0 then
    if position(v_marker in v_definition) = 0 then
      raise exception 'Không tìm thấy allowlist writer trong audit SECURITY DEFINER';
    end if;
    execute replace(v_definition, v_marker, v_marker || E'\n'
      || $new$      ('rpc_upsert_source_object(text,text,jsonb)', 'RPC ghi source và mirror person_id'),$new$);
  end if;
end
$allow_source_writer$;

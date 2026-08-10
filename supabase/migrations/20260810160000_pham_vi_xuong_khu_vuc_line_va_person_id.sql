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
      select 1 from unnest(coalesce(p_departments, '{}'::text[])) id
      left join public.departments department
        on department.id = id and coalesce(department.is_active, true)
      where department.id is null
    )
    and not exists (
      select 1 from unnest(coalesce(p_factories, '{}'::uuid[])) id
      left join public.vmp_scope_factories factory
        on factory.id = id and factory.is_active
      where factory.id is null
        or not (factory.department_id = any(p_departments))
    )
    and not exists (
      select 1 from unnest(coalesce(p_areas, '{}'::uuid[])) id
      left join public.vmp_scope_areas area on area.id = id and area.is_active
      where area.id is null or not (area.factory_id = any(p_factories))
    )
    and not exists (
      select 1 from unnest(coalesce(p_lines, '{}'::uuid[])) id
      left join public.vmp_scope_lines line on line.id = id and line.is_active
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

/* Bản bốn tham số là đường ghi mới; overload ba tham số hiện hữu giữ nguyên. */
create or replace function public.rpc_upsert_item_permission_staff(
  p_person_id uuid,
  p_patch jsonb,
  p_reason text,
  p_expected_version integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor_role text;
  v_old public.vmp_performers%rowtype;
  v_person_id uuid := p_person_id;
  v_result jsonb;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_bad_fields text[];
  v_departments text[];
  v_factories uuid[];
  v_areas uuid[];
  v_lines uuid[];
  v_legacy_areas text[];
  v_new jsonb;
  v_version integer;
begin
  select role::text into v_actor_role from public.profiles
  where id = auth.uid() and coalesce(is_active, true);
  if coalesce(auth.role(), '') <> 'service_role'
      and v_actor_role is distinct from 'admin' then
    return jsonb_build_object(
      'ok', false, 'error_code', 'FORBIDDEN',
      'error', 'Chỉ Admin được sửa hồ sơ trong danh bạ nhân sự & quyền'
    );
  end if;

  select array_agg(key order by key) into v_bad_fields
  from jsonb_object_keys(v_patch) key
  where key <> all(array[
    'full_name', 'employee_code', 'department', 'access_class', 'email',
    'scope_departments', 'scope_factory_ids', 'scope_area_ids',
    'scope_line_ids', 'is_active', 'email_sent_confirmed'
  ]::text[]);
  if v_bad_fields is not null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'PATCH_FIELD_NOT_ALLOWED',
      'error', 'Trường không được phép sửa: ' || array_to_string(v_bad_fields, ', ')
    );
  end if;

  if v_person_id is null then
    if coalesce(p_expected_version, -1) <> 0 then
      return jsonb_build_object(
        'ok', false, 'error_code', 'VERSION_CONFLICT',
        'error', 'Hồ sơ mới phải có expected_version = 0', 'current_version', 0
      );
    end if;
  else
    select * into v_old from public.vmp_performers
    where id = v_person_id for update;
    if not found then
      return jsonb_build_object('ok', false, 'error_code', 'PERSON_NOT_FOUND',
        'error', 'Không tìm thấy nhân viên cần sửa');
    end if;
    if p_expected_version is distinct from v_old.version then
      return jsonb_build_object(
        'ok', false, 'error_code', 'VERSION_CONFLICT',
        'error', 'Hồ sơ đã được cập nhật ở phiên khác',
        'current_version', v_old.version
      );
    end if;
  end if;

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

  if not public.vmp_valid_permission_scope(
    v_departments, v_factories, v_areas, v_lines
  ) then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_SCOPE_HIERARCHY',
      'error', 'Phạm vi phải có đủ đường bộ phận → xưởng → khu vực → line đang hoạt động'
    );
  end if;

  select coalesce(array_agg(distinct code order by code), '{}'::text[])
  into v_legacy_areas
  from (
    select area.code from public.vmp_scope_areas area where area.id = any(v_areas)
    union all
    select line.code from public.vmp_scope_lines line where line.id = any(v_lines)
  ) legacy;

  /* Validator legacy chạy trên '*' tạm thời; giá trị cuối được thu hẹp ngay trong statement. */
  v_result := public.rpc_upsert_item_permission_staff(
    v_person_id,
    (v_patch - 'scope_factory_ids' - 'scope_area_ids' - 'scope_line_ids')
      || jsonb_build_object(
        'scope_departments', to_jsonb(v_departments),
        'access_areas', jsonb_build_array('*')
      ),
    p_reason
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    return v_result;
  end if;
  v_person_id := (v_result->>'person_id')::uuid;
  v_version := case when p_person_id is null then 1 else v_old.version + 1 end;

  update public.vmp_performers
  set scope_departments = v_departments,
      access_areas = v_legacy_areas,
      scope_factory_ids = v_factories,
      scope_area_ids = v_areas,
      scope_line_ids = v_lines,
      version = v_version
  where id = v_person_id;

  select to_jsonb(person) into v_new
  from public.vmp_performers person where id = v_person_id;
  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data,
    change_reason, source, changed_fields
  ) values (
    auth.uid(), 'UPDATE', 'vmp_performers', v_person_id::text,
    case when p_person_id is null then null else to_jsonb(v_old) end,
    v_new, btrim(p_reason), 'dashboard_rpc',
    array(select jsonb_object_keys(v_patch))
  );
  return v_result || jsonb_build_object('version', v_version);
exception
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_SCOPE_ID',
      'error', 'ID phạm vi không đúng định dạng UUID');
  when others then
    return jsonb_build_object('ok', false, 'error_code', 'SAVE_FAILED', 'error', sqlerrm);
end
$fn$;

/* Import Excel dùng cùng validator hierarchy và expected_version với đường lưu đơn. */
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
    v_result := public.rpc_upsert_item_permission_staff(null, v_patch, p_reason, 0);
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
    return jsonb_build_object('ok', false,
      'error', 'Chỉ admin hoặc QA được thêm/sửa danh mục nguồn');
  end if;

  if v_patch ? 'owner_person_id' and nullif(v_patch->>'owner_person_id', '') is not null then
    select * into v_owner from public.vmp_performers
    where id = (v_patch->>'owner_person_id')::uuid and is_active;
    if not found then return jsonb_build_object('ok', false,
      'error', 'QA phụ trách không tồn tại hoặc đã ngừng hoạt động'); end if;
    v_patch := v_patch || jsonb_build_object('owner_name', v_owner.performer_name);
  end if;
  if v_patch ? 'support_person_id' and nullif(v_patch->>'support_person_id', '') is not null then
    select * into v_support from public.vmp_performers
    where id = (v_patch->>'support_person_id')::uuid and is_active;
    if not found then return jsonb_build_object('ok', false,
      'error', 'Người hỗ trợ không tồn tại hoặc đã ngừng hoạt động'); end if;
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
  return v_result;
exception when invalid_text_representation then
  return jsonb_build_object('ok', false, 'error', 'person_id không đúng định dạng UUID');
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

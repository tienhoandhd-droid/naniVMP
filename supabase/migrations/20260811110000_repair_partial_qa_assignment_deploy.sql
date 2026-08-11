/* Forward repair cho trường hợp 111000 đã chạy trước prerequisite 1600.
 * Không xóa dữ liệu nghiệp vụ, không sinh hierarchy và không bật enforced.
 */

do $guard$
declare
  v_scope_relations integer;
  v_added_columns integer;
begin
  if public.item_permissions_mode() <> 'preview' then
    raise exception 'FORWARD_REPAIR_UNSUPPORTED_MODE: chỉ sửa khi mode=preview';
  end if;
  if to_regprocedure(
      'public.rpc_upsert_item_permission_staff(uuid,jsonb,text,integer)'
    ) is null
      or to_regprocedure(
        'public.rpc_set_item_assignment(uuid,text,text,text,text,text)'
      ) is null
      or to_regprocedure('public.vmp_item_rights(uuid,text)') is null
      or to_regprocedure(
        'public.vmp_item_rights_before_assignment_only_qa(uuid,text)'
      ) is null
      or not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'vmp_item_assignments'
          and column_name = 'assignment_role'
      ) then
    raise exception 'FORWARD_REPAIR_UNSUPPORTED_INPUT: prerequisite 111000 chưa đầy đủ';
  end if;
  if to_regprocedure(
      'public.rpc_upsert_item_permission_staff(uuid,jsonb,text)'
    ) is not null
      or to_regprocedure(
        'public.rpc_set_item_assignment(uuid,text,text,text,text)'
      ) is not null then
    raise exception 'FORWARD_REPAIR_UNSUPPORTED_INPUT: còn overload RPC legacy';
  end if;

  select count(*) into v_scope_relations
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname in (
      'vmp_scope_factories', 'vmp_scope_areas', 'vmp_scope_lines'
    )
    and relation.relkind = 'r';
  if v_scope_relations not in (0, 3) then
    raise exception 'FORWARD_REPAIR_UNSUPPORTED_INPUT: hierarchy chỉ tồn tại một phần';
  end if;
  if (v_scope_relations = 0) is distinct from (
    to_regprocedure(
      'public.vmp_item_rights_before_canonical_scope(uuid,text)'
    ) is null
  ) then
    raise exception 'FORWARD_REPAIR_UNSUPPORTED_INPUT: schema và rights chain lệch nhau';
  end if;

  select count(*) into v_added_columns
  from (values
    ('vmp_performers', 'scope_factory_ids'),
    ('vmp_performers', 'scope_area_ids'),
    ('vmp_performers', 'scope_line_ids'),
    ('vmp_performers', 'version'),
    ('vmp_source_objects', 'owner_person_id'),
    ('vmp_source_objects', 'support_person_id'),
    ('vmp_plan_items', 'owner_person_id'),
    ('vmp_plan_items', 'support_person_id')
  ) required(table_name, column_name)
  join information_schema.columns column_info
    on column_info.table_schema = 'public'
   and column_info.table_name = required.table_name
   and column_info.column_name = required.column_name;
  if (v_scope_relations = 0 and v_added_columns <> 0)
      or (v_scope_relations = 3 and v_added_columns <> 8) then
    raise exception
      'FORWARD_REPAIR_UNSUPPORTED_INPUT: prerequisite columns chỉ tồn tại một phần';
  end if;
end
$guard$;

create temp table if not exists vmp_forward_repair_baseline (
  key text primary key,
  value text not null
) on commit drop;
truncate table vmp_forward_repair_baseline;

insert into vmp_forward_repair_baseline(key, value)
select 'assignments_original',
  count(*)::text || ':' || md5(coalesce(
    string_agg(to_jsonb(row_data)::text, '' order by row_data.id), ''
  ))
from public.vmp_item_assignments row_data
union all
select 'performers_original',
  count(*)::text || ':' || md5(coalesce(string_agg(
    (to_jsonb(row_data) - array[
      'scope_factory_ids', 'scope_area_ids', 'scope_line_ids', 'version'
    ])::text, '' order by row_data.id
  ), ''))
from public.vmp_performers row_data
union all
select 'source_objects_original',
  count(*)::text || ':' || md5(coalesce(string_agg(
    (to_jsonb(row_data) - array['owner_person_id', 'support_person_id'])::text,
    '' order by row_data.id
  ), ''))
from public.vmp_source_objects row_data
union all
select 'plan_items_original',
  count(*)::text || ':' || md5(coalesce(string_agg(
    (to_jsonb(row_data) - array['owner_person_id', 'support_person_id'])::text,
    '' order by row_data.validation_code
  ), ''))
from public.vmp_plan_items row_data;

do $capture_hierarchy$
declare
  v_table text;
  v_count bigint;
begin
  foreach v_table in array array[
    'vmp_scope_factories', 'vmp_scope_areas', 'vmp_scope_lines'
  ] loop
    if to_regclass('public.' || v_table) is null then
      v_count := 0;
    else
      execute format('select count(*) from public.%I', v_table) into v_count;
    end if;
    insert into vmp_forward_repair_baseline(key, value)
    values (v_table || '_count', v_count::text);
  end loop;
end
$capture_hierarchy$;

create table if not exists public.vmp_scope_factories (
  id uuid primary key default gen_random_uuid(),
  code text not null check (nullif(btrim(code), '') is not null),
  name text not null check (nullif(btrim(name), '') is not null),
  department_id text not null references public.departments(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, code)
);
create table if not exists public.vmp_scope_areas (
  id uuid primary key default gen_random_uuid(),
  code text not null check (nullif(btrim(code), '') is not null),
  name text not null check (nullif(btrim(name), '') is not null),
  factory_id uuid not null references public.vmp_scope_factories(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (factory_id, code)
);
create table if not exists public.vmp_scope_lines (
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
comment on table public.vmp_scope_areas is
  'Khu vực chuẩn, bắt buộc thuộc một xưởng chuẩn.';
comment on table public.vmp_scope_lines is
  'Line chuẩn, bắt buộc thuộc một khu vực chuẩn.';

do $triggers$
declare
  v_table text;
begin
  foreach v_table in array array[
    'vmp_scope_factories', 'vmp_scope_areas', 'vmp_scope_lines'
  ] loop
    if not exists (
      select 1 from pg_trigger trigger
      join pg_class relation on relation.oid = trigger.tgrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = v_table
        and trigger.tgname = 'set_updated_at' and not trigger.tgisinternal
    ) then
      execute format(
        'create trigger set_updated_at before update on public.%I '
        || 'for each row execute function public.trigger_set_updated_at()',
        v_table
      );
    end if;
  end loop;
end
$triggers$;

alter table public.vmp_scope_factories enable row level security;
alter table public.vmp_scope_areas enable row level security;
alter table public.vmp_scope_lines enable row level security;
revoke all on public.vmp_scope_factories, public.vmp_scope_areas,
  public.vmp_scope_lines from public, anon, authenticated;
grant select, insert, update, delete on public.vmp_scope_factories,
  public.vmp_scope_areas, public.vmp_scope_lines to service_role;

alter table public.vmp_performers
  add column if not exists scope_factory_ids uuid[] not null default '{}'::uuid[],
  add column if not exists scope_area_ids uuid[] not null default '{}'::uuid[],
  add column if not exists scope_line_ids uuid[] not null default '{}'::uuid[],
  add column if not exists version integer not null default 1 check (version > 0);
alter table public.vmp_source_objects
  add column if not exists owner_person_id uuid
    references public.vmp_performers(id) on delete set null,
  add column if not exists support_person_id uuid
    references public.vmp_performers(id) on delete set null;
alter table public.vmp_plan_items
  add column if not exists owner_person_id uuid
    references public.vmp_performers(id) on delete set null,
  add column if not exists support_person_id uuid
    references public.vmp_performers(id) on delete set null;

create index if not exists vmp_source_objects_owner_person_idx
  on public.vmp_source_objects(owner_person_id) where owner_person_id is not null;
create index if not exists vmp_source_objects_support_person_idx
  on public.vmp_source_objects(support_person_id) where support_person_id is not null;
create index if not exists vmp_plan_items_owner_person_idx
  on public.vmp_plan_items(owner_person_id) where owner_person_id is not null;

/* Không ghi đè liên kết đã xác nhận; chỉ nối tên khớp duy nhất khi đích còn null. */
create temp table if not exists vmp_forward_repair_trigger_state (
  table_name text not null,
  trigger_name text not null,
  enabled_state "char" not null,
  primary key (table_name, trigger_name)
) on commit drop;
truncate table vmp_forward_repair_trigger_state;
insert into vmp_forward_repair_trigger_state(
  table_name, trigger_name, enabled_state
)
select relation.relname, trigger.tgname, trigger.tgenabled
from pg_trigger trigger
join pg_class relation on relation.oid = trigger.tgrelid
join pg_namespace namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relname in ('vmp_source_objects', 'vmp_plan_items')
  and not trigger.tgisinternal;

do $suspend_business_triggers$
declare
  v_table text;
begin
  foreach v_table in array array['vmp_source_objects', 'vmp_plan_items'] loop
    execute format('alter table public.%I disable trigger user', v_table);
  end loop;
end
$suspend_business_triggers$;

update public.vmp_source_objects source
set owner_person_id = matched.person_id
from (
  select normalized_full_name, (array_agg(id order by id))[1] as person_id
  from public.vmp_performers where is_active
  group by normalized_full_name having count(*) = 1
) matched
where source.owner_person_id is null
  and nullif(btrim(source.owner_name), '') is not null
  and matched.normalized_full_name =
    public.vmp_normalize_person_name(source.owner_name);
update public.vmp_source_objects source
set support_person_id = matched.person_id
from (
  select normalized_full_name, (array_agg(id order by id))[1] as person_id
  from public.vmp_performers where is_active
  group by normalized_full_name having count(*) = 1
) matched
where source.support_person_id is null
  and nullif(btrim(source.support_name), '') is not null
  and matched.normalized_full_name =
    public.vmp_normalize_person_name(source.support_name);
update public.vmp_plan_items item
set owner_person_id = matched.person_id
from (
  select normalized_full_name, (array_agg(id order by id))[1] as person_id
  from public.vmp_performers where is_active
  group by normalized_full_name having count(*) = 1
) matched
where item.owner_person_id is null
  and nullif(btrim(item.owner_name), '') is not null
  and matched.normalized_full_name =
    public.vmp_normalize_person_name(item.owner_name);
update public.vmp_plan_items item
set support_person_id = matched.person_id
from (
  select normalized_full_name, (array_agg(id order by id))[1] as person_id
  from public.vmp_performers where is_active
  group by normalized_full_name having count(*) = 1
) matched
where item.support_person_id is null
  and nullif(btrim(item.secondary_owner), '') is not null
  and matched.normalized_full_name =
    public.vmp_normalize_person_name(item.secondary_owner);

do $restore_business_triggers$
declare
  v_trigger record;
  v_clause text;
begin
  for v_trigger in
    select * from vmp_forward_repair_trigger_state
    order by table_name, trigger_name
  loop
    v_clause := case v_trigger.enabled_state
      when 'D' then 'disable trigger'
      when 'R' then 'enable replica trigger'
      when 'A' then 'enable always trigger'
      else 'enable trigger'
    end;
    execute format(
      'alter table public.%I %s %I',
      v_trigger.table_name, v_clause, v_trigger.trigger_name
    );
  end loop;
end
$restore_business_triggers$;

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



do $source_writer_guard$
begin
  if to_regprocedure(
      'public.vmp_upsert_source_object_before_person_id(text,text,jsonb)'
    ) is null then
    if to_regprocedure(
        'public.rpc_upsert_source_object(text,text,jsonb)'
      ) is null then
      raise exception 'Thiếu source writer legacy để tạo wrapper person_id';
    end if;
    alter function public.rpc_upsert_source_object(text, text, jsonb)
      rename to vmp_upsert_source_object_before_person_id;
  end if;
  if to_regprocedure(
      'public.vmp_upsert_source_object_before_person_id(text,text,jsonb)'
    ) is null then
    raise exception 'Không tạo được source writer predecessor';
  end if;
end
$source_writer_guard$;
revoke all on function public.vmp_upsert_source_object_before_person_id(
  text, text, jsonb
) from public, anon, authenticated, service_role;

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


do $rights_chain_guard$
begin
  if to_regprocedure(
      'public.vmp_item_rights_before_canonical_scope(uuid,text)'
    ) is null then
    if to_regprocedure(
        'public.vmp_item_rights_before_assignment_only_qa(uuid,text)'
      ) is null then
      raise exception 'Thiếu rights predecessor của partial 111000';
    end if;
    alter function public.vmp_item_rights_before_assignment_only_qa(uuid, text)
      rename to vmp_item_rights_before_canonical_scope;
  end if;
end
$rights_chain_guard$;
create or replace function public.vmp_item_rights_before_canonical_scope(
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
security invoker
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

alter function public.vmp_item_rights_before_canonical_scope(uuid, text)
  security invoker;
revoke all on function public.vmp_item_rights_before_canonical_scope(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.vmp_item_rights_before_assignment_only_qa(p_uid uuid, p_validation_code text)
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
security invoker
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

/* QA chạy trước hierarchy: performer đang hoạt động và liên kết account là
 * canonical principal; assignment dùng performer_id, không dùng scope. */
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
    ) duplicate
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

create or replace function public.rpc_set_item_assignment(
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


do $allow_new_writers$
declare
  v_signature regprocedure :=
    'public.vmp_unfiltered_security_definer_item_readers()'::regprocedure;
  v_definition text;
  v_marker text :=
    $marker$      ('rpc_set_item_performer(text,text)', 'RPC ghi người thực hiện'),$marker$;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position(v_marker in v_definition) = 0 then
    raise exception 'Không tìm thấy allowlist writer trong audit SECURITY DEFINER';
  end if;
  if position('rpc_upsert_source_object(text,text,jsonb)' in v_definition) = 0 then
    v_definition := replace(v_definition, v_marker, v_marker || E'\n'
      || $new$      ('rpc_upsert_source_object(text,text,jsonb)', 'RPC ghi source và mirror person_id'),$new$);
  end if;
  if position('rpc_set_item_assignment(uuid,text,text,text,text,text)' in v_definition) = 0 then
    v_definition := replace(v_definition, v_marker, v_marker || E'\n'
      || $new$      ('rpc_set_item_assignment(uuid,text,text,text,text,text)', 'RPC ghi phân công canonical'),$new$);
  end if;
  if position('rpc_item_assignments(text,uuid)' in v_definition) = 0 then
    v_definition := replace(v_definition, v_marker, v_marker || E'\n'
      || $new$      ('rpc_item_assignments(text,uuid)', 'RPC quản lý đọc phân công canonical'),$new$);
  end if;
  execute v_definition;
end
$allow_new_writers$;


alter function public.vmp_item_rights_before_assignment_only_qa(uuid, text)
  security invoker;
revoke all on function public.vmp_item_rights_before_assignment_only_qa(uuid, text)
  from public, anon, authenticated, service_role;

revoke execute on function public.vmp_jsonb_uuid_array(jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.vmp_valid_permission_scope(
  text[], uuid[], uuid[], uuid[]
) from public, anon, authenticated;
revoke execute on function public.rpc_item_permission_scope_catalog()
  from public, anon;
revoke execute on function public.rpc_set_item_performer_by_id(text, uuid, text)
  from public, anon;
revoke execute on function public.rpc_upsert_source_object(text, text, jsonb)
  from public, anon;
revoke execute on function public.vmp_item_scope_path_count(text)
  from public, anon, authenticated;
revoke execute on function public.vmp_item_scope_matches(uuid, text)
  from public, anon, authenticated;
revoke all on function public.vmp_item_rights(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.rpc_preview_item_rights(uuid, text)
  from public, anon;
revoke execute on function public.rpc_item_permission_preflight()
  from public, anon;
revoke all on function public.rpc_set_item_assignment(
  uuid, text, text, text, text, text
) from public, anon, service_role;

grant execute on function public.vmp_jsonb_uuid_array(jsonb, text)
  to service_role;
grant execute on function public.vmp_valid_permission_scope(
  text[], uuid[], uuid[], uuid[]
) to service_role;
grant execute on function public.rpc_item_permission_scope_catalog()
  to authenticated, service_role;
grant execute on function public.rpc_set_item_performer_by_id(text, uuid, text)
  to authenticated, service_role;
grant execute on function public.rpc_upsert_source_object(text, text, jsonb)
  to authenticated, service_role;
grant execute on function public.vmp_item_scope_path_count(text)
  to service_role;
grant execute on function public.vmp_item_scope_matches(uuid, text)
  to service_role;
grant execute on function public.vmp_item_rights(uuid, text)
  to service_role;
grant execute on function public.rpc_preview_item_rights(uuid, text)
  to authenticated, service_role;
grant execute on function public.rpc_item_permission_preflight()
  to authenticated, service_role;
grant execute on function public.rpc_set_item_assignment(
  uuid, text, text, text, text, text
) to authenticated;

do $verify_schema_contract$
begin
  if exists (
    select 1
    from (values
      ('vmp_performers', 'scope_factory_ids', '_uuid', 'NO', '''{}''::uuid[]'),
      ('vmp_performers', 'scope_area_ids', '_uuid', 'NO', '''{}''::uuid[]'),
      ('vmp_performers', 'scope_line_ids', '_uuid', 'NO', '''{}''::uuid[]'),
      ('vmp_performers', 'version', 'int4', 'NO', '1'),
      ('vmp_source_objects', 'owner_person_id', 'uuid', 'YES', null),
      ('vmp_source_objects', 'support_person_id', 'uuid', 'YES', null),
      ('vmp_plan_items', 'owner_person_id', 'uuid', 'YES', null),
      ('vmp_plan_items', 'support_person_id', 'uuid', 'YES', null),
      ('vmp_item_assignments', 'assignment_role', 'text', 'YES', null),
      ('vmp_scope_factories', 'id', 'uuid', 'NO', 'gen_random_uuid()'),
      ('vmp_scope_factories', 'code', 'text', 'NO', null),
      ('vmp_scope_factories', 'name', 'text', 'NO', null),
      ('vmp_scope_factories', 'department_id', 'text', 'NO', null),
      ('vmp_scope_factories', 'is_active', 'bool', 'NO', 'true'),
      ('vmp_scope_factories', 'created_at', 'timestamptz', 'NO', 'now()'),
      ('vmp_scope_factories', 'updated_at', 'timestamptz', 'NO', 'now()'),
      ('vmp_scope_areas', 'id', 'uuid', 'NO', 'gen_random_uuid()'),
      ('vmp_scope_areas', 'code', 'text', 'NO', null),
      ('vmp_scope_areas', 'name', 'text', 'NO', null),
      ('vmp_scope_areas', 'factory_id', 'uuid', 'NO', null),
      ('vmp_scope_areas', 'is_active', 'bool', 'NO', 'true'),
      ('vmp_scope_areas', 'created_at', 'timestamptz', 'NO', 'now()'),
      ('vmp_scope_areas', 'updated_at', 'timestamptz', 'NO', 'now()'),
      ('vmp_scope_lines', 'id', 'uuid', 'NO', 'gen_random_uuid()'),
      ('vmp_scope_lines', 'code', 'text', 'NO', null),
      ('vmp_scope_lines', 'name', 'text', 'NO', null),
      ('vmp_scope_lines', 'area_id', 'uuid', 'NO', null),
      ('vmp_scope_lines', 'is_active', 'bool', 'NO', 'true'),
      ('vmp_scope_lines', 'created_at', 'timestamptz', 'NO', 'now()'),
      ('vmp_scope_lines', 'updated_at', 'timestamptz', 'NO', 'now()')
    ) expected(table_name, column_name, udt_name, nullable, column_default)
    left join information_schema.columns actual
      on actual.table_schema = 'public'
     and actual.table_name = expected.table_name
     and actual.column_name = expected.column_name
    where actual.column_name is null
      or actual.udt_name is distinct from expected.udt_name
      or actual.is_nullable is distinct from expected.nullable
      or actual.column_default is distinct from expected.column_default
  ) then
    raise exception 'Schema prerequisite có cột sai type/null/default';
  end if;

  if exists (
    select 1
    from (values
      ('vmp_source_objects', 'owner_person_id', 'vmp_performers', 'id', 'n'),
      ('vmp_source_objects', 'support_person_id', 'vmp_performers', 'id', 'n'),
      ('vmp_plan_items', 'owner_person_id', 'vmp_performers', 'id', 'n'),
      ('vmp_plan_items', 'support_person_id', 'vmp_performers', 'id', 'n'),
      ('vmp_scope_factories', 'department_id', 'departments', 'id', 'a'),
      ('vmp_scope_areas', 'factory_id', 'vmp_scope_factories', 'id', 'a'),
      ('vmp_scope_lines', 'area_id', 'vmp_scope_areas', 'id', 'a')
    ) expected(table_name, column_name, ref_table, ref_column, delete_action)
    where not exists (
      select 1
      from pg_constraint constraint_info
      join pg_class relation on relation.oid = constraint_info.conrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      join pg_class ref_relation on ref_relation.oid = constraint_info.confrelid
      join pg_namespace ref_namespace on ref_namespace.oid = ref_relation.relnamespace
      join pg_attribute attribute
        on attribute.attrelid = relation.oid
       and attribute.attnum = constraint_info.conkey[1]
      join pg_attribute ref_attribute
        on ref_attribute.attrelid = ref_relation.oid
       and ref_attribute.attnum = constraint_info.confkey[1]
      where constraint_info.contype = 'f'
        and cardinality(constraint_info.conkey) = 1
        and namespace.nspname = 'public'
        and ref_namespace.nspname = 'public'
        and relation.relname = expected.table_name
        and attribute.attname = expected.column_name
        and ref_relation.relname = expected.ref_table
        and ref_attribute.attname = expected.ref_column
        and constraint_info.confdeltype::text = expected.delete_action
        and constraint_info.convalidated
    )
  ) then
    raise exception 'Schema prerequisite thiếu hoặc sai foreign key';
  end if;

  if not exists (
      select 1 from pg_constraint constraint_info
      where constraint_info.conrelid = 'public.vmp_performers'::regclass
        and constraint_info.contype = 'c' and constraint_info.convalidated
        and pg_get_constraintdef(constraint_info.oid) ~* 'version.*> 0'
    ) or (
      select count(*) from pg_constraint constraint_info
      where constraint_info.conrelid in (
        'public.vmp_scope_factories'::regclass,
        'public.vmp_scope_areas'::regclass,
        'public.vmp_scope_lines'::regclass
      ) and constraint_info.contype = 'p' and constraint_info.convalidated
    ) <> 3
      or not exists (
        select 1 from pg_constraint constraint_info
        where constraint_info.conrelid = 'public.vmp_scope_factories'::regclass
          and constraint_info.contype = 'u'
          and pg_get_constraintdef(constraint_info.oid) = 'UNIQUE (department_id, code)'
      ) or not exists (
        select 1 from pg_constraint constraint_info
        where constraint_info.conrelid = 'public.vmp_scope_areas'::regclass
          and constraint_info.contype = 'u'
          and pg_get_constraintdef(constraint_info.oid) = 'UNIQUE (factory_id, code)'
      ) or not exists (
        select 1 from pg_constraint constraint_info
        where constraint_info.conrelid = 'public.vmp_scope_lines'::regclass
          and constraint_info.contype = 'u'
          and pg_get_constraintdef(constraint_info.oid) = 'UNIQUE (area_id, code)'
      ) or (
        select count(*) from pg_constraint constraint_info
        where constraint_info.conrelid in (
          'public.vmp_scope_factories'::regclass,
          'public.vmp_scope_areas'::regclass,
          'public.vmp_scope_lines'::regclass
        ) and constraint_info.contype = 'c' and constraint_info.convalidated
          and pg_get_constraintdef(constraint_info.oid) ~* 'btrim\((code|name)'
      ) <> 6 then
    raise exception 'Schema prerequisite thiếu check/primary/unique canonical';
  end if;

  if not exists (
      select 1 from pg_constraint constraint_info
      where constraint_info.conrelid = 'public.vmp_item_assignments'::regclass
        and constraint_info.conname = 'vmp_item_assignments_role_check'
        and constraint_info.contype = 'c' and constraint_info.convalidated
        and pg_get_constraintdef(constraint_info.oid) ilike '%assignment_kind%qa%'
        and pg_get_constraintdef(constraint_info.oid) ilike '%primary%collaborator%'
        and pg_get_constraintdef(constraint_info.oid)
          ilike '%equipment_department%assignment_role is null%'
    ) or not exists (
      select 1 from pg_index index_info
      where index_info.indexrelid =
          'public.vmp_item_assignments_one_active_qa_primary'::regclass
        and index_info.indrelid = 'public.vmp_item_assignments'::regclass
        and index_info.indisunique and index_info.indisvalid and index_info.indisready
        and index_info.indnkeyatts = 1
        and pg_get_indexdef(index_info.indexrelid, 1, true) = 'validation_code'
        and pg_get_expr(index_info.indpred, index_info.indrelid)
          ilike '%assignment_kind%qa%assignment_role%primary%is_active%'
    ) or not exists (
      select 1 from pg_index index_info
      where index_info.indexrelid =
          'public.vmp_item_assignments_one_active_qa_person'::regclass
        and index_info.indrelid = 'public.vmp_item_assignments'::regclass
        and index_info.indisunique and index_info.indisvalid and index_info.indisready
        and index_info.indnkeyatts = 3
        and pg_get_indexdef(index_info.indexrelid, 1, true) = 'validation_code'
        and pg_get_indexdef(index_info.indexrelid, 2, true) = 'performer_id'
        and pg_get_indexdef(index_info.indexrelid, 3, true) = 'assignment_kind'
        and pg_get_expr(index_info.indpred, index_info.indrelid)
          ilike '%performer_id is not null%assignment_kind%qa%is_active%'
    ) then
    raise exception 'Assignment role constraint/index không đúng contract canonical';
  end if;

  if exists (
    select 1
    from (values
      ('vmp_source_objects_owner_person_idx', 'vmp_source_objects', 'owner_person_id'),
      ('vmp_source_objects_support_person_idx', 'vmp_source_objects', 'support_person_id'),
      ('vmp_plan_items_owner_person_idx', 'vmp_plan_items', 'owner_person_id')
    ) expected(index_name, table_name, column_name)
    left join pg_class index_relation
      on index_relation.relname = expected.index_name
     and index_relation.relnamespace = 'public'::regnamespace
    left join pg_namespace index_namespace
      on index_namespace.oid = index_relation.relnamespace
     and index_namespace.nspname = 'public'
    left join pg_index index_info on index_info.indexrelid = index_relation.oid
    left join pg_class table_relation
      on table_relation.oid = index_info.indrelid
     and table_relation.relname = expected.table_name
    where index_namespace.oid is null or table_relation.oid is null
      or not index_info.indisvalid or not index_info.indisready
      or lower(pg_get_indexdef(index_relation.oid)) not like
        '%(' || expected.column_name || ') where ('
          || expected.column_name || ' is not null)%'
  ) then
    raise exception 'Schema prerequisite thiếu hoặc sai index person_id';
  end if;

  if exists (
    select 1
    from (values
      ('vmp_scope_factories'), ('vmp_scope_areas'), ('vmp_scope_lines')
    ) expected(table_name)
    where not exists (
      select 1 from pg_trigger trigger_info
      join pg_class relation on relation.oid = trigger_info.tgrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = expected.table_name
        and trigger_info.tgname = 'set_updated_at'
        and not trigger_info.tgisinternal
        and trigger_info.tgenabled = 'O'
        and trigger_info.tgfoid =
          'public.trigger_set_updated_at()'::regprocedure
        and pg_get_triggerdef(trigger_info.oid) ilike
          '%before update on public.%for each row%'
    )
  ) then
    raise exception 'Hierarchy thiếu hoặc sai updated_at trigger';
  end if;
end
$verify_schema_contract$;

create temp table if not exists vmp_forward_repair_after (
  key text primary key,
  value text not null
) on commit drop;
truncate table vmp_forward_repair_after;
insert into vmp_forward_repair_after(key, value)
select 'assignments_original',
  count(*)::text || ':' || md5(coalesce(
    string_agg(to_jsonb(row_data)::text, '' order by row_data.id), ''
  ))
from public.vmp_item_assignments row_data
union all
select 'performers_original',
  count(*)::text || ':' || md5(coalesce(string_agg(
    (to_jsonb(row_data) - array[
      'scope_factory_ids', 'scope_area_ids', 'scope_line_ids', 'version'
    ])::text, '' order by row_data.id
  ), ''))
from public.vmp_performers row_data
union all
select 'source_objects_original',
  count(*)::text || ':' || md5(coalesce(string_agg(
    (to_jsonb(row_data) - array['owner_person_id', 'support_person_id'])::text,
    '' order by row_data.id
  ), ''))
from public.vmp_source_objects row_data
union all
select 'plan_items_original',
  count(*)::text || ':' || md5(coalesce(string_agg(
    (to_jsonb(row_data) - array['owner_person_id', 'support_person_id'])::text,
    '' order by row_data.validation_code
  ), ''))
from public.vmp_plan_items row_data;

do $verify$
declare
  v_table text;
  v_count bigint;
  v_expected text;
  v_assignment_definition text;
  v_refresh_definition text;
  v_preflight_definition text;
  v_final_definition text;
  v_middle_definition text;
  v_changed_original_keys text;
begin
  foreach v_table in array array[
    'vmp_scope_factories', 'vmp_scope_areas', 'vmp_scope_lines'
  ] loop
    execute format('select count(*) from public.%I', v_table) into v_count;
    select value into v_expected from vmp_forward_repair_baseline
    where key = v_table || '_count';
    if v_count::text is distinct from v_expected then
      raise exception 'Forward repair đã tự sinh dữ liệu hierarchy ở %', v_table;
    end if;
  end loop;

  select string_agg(baseline.key, ', ' order by baseline.key)
  into v_changed_original_keys
  from vmp_forward_repair_baseline baseline
    join vmp_forward_repair_after after_state using (key)
    where baseline.value is distinct from after_state.value
      and baseline.key like '%_original';
  if v_changed_original_keys is not null then
    raise exception 'Forward repair đã thay đổi cột dữ liệu gốc: %',
      v_changed_original_keys;
  end if;
  if public.item_permissions_mode() <> 'preview' then
    raise exception 'Forward repair không được bật enforced';
  end if;

  if (
    select count(*) from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'rpc_upsert_item_permission_staff'
  ) <> 1
      or to_regprocedure(
        'public.rpc_upsert_item_permission_staff(uuid,jsonb,text)'
      ) is not null
      or to_regprocedure(
        'public.rpc_upsert_item_permission_staff(uuid,jsonb,text,integer)'
      ) is null
      or (
        select count(*) from pg_proc procedure
        join pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'public'
          and procedure.proname = 'rpc_set_item_assignment'
      ) <> 1
      or to_regprocedure(
        'public.rpc_set_item_assignment(uuid,text,text,text,text)'
      ) is not null
      or to_regprocedure(
        'public.rpc_set_item_assignment(uuid,text,text,text,text,text)'
      ) is null then
    raise exception 'RPC canonical còn thiếu hoặc có overload';
  end if;

  if exists (
    select 1 from (values
      ('vmp_performers', 'scope_factory_ids'),
      ('vmp_performers', 'scope_area_ids'),
      ('vmp_performers', 'scope_line_ids'),
      ('vmp_performers', 'version'),
      ('vmp_source_objects', 'owner_person_id'),
      ('vmp_source_objects', 'support_person_id'),
      ('vmp_plan_items', 'owner_person_id'),
      ('vmp_plan_items', 'support_person_id')
    ) required(table_name, column_name)
    left join information_schema.columns column_info
      on column_info.table_schema = 'public'
     and column_info.table_name = required.table_name
     and column_info.column_name = required.column_name
    where column_info.column_name is null
  ) then
    raise exception 'Thiếu cột prerequisite 1600';
  end if;
  if (
    select count(*) from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'vmp_scope_factories', 'vmp_scope_areas', 'vmp_scope_lines'
      ) and relation.relkind = 'r' and relation.relrowsecurity
  ) <> 3
      or (
        select count(*) from pg_trigger trigger
        join pg_class relation on relation.oid = trigger.tgrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname in (
            'vmp_scope_factories', 'vmp_scope_areas', 'vmp_scope_lines'
          )
          and trigger.tgname = 'set_updated_at' and not trigger.tgisinternal
      ) <> 3 then
    raise exception 'Hierarchy thiếu RLS hoặc updated_at trigger';
  end if;
  if has_table_privilege(
      'authenticated', 'public.vmp_scope_factories', 'SELECT'
    ) or has_table_privilege(
      'anon', 'public.vmp_scope_areas', 'SELECT'
    ) or not has_table_privilege(
      'service_role', 'public.vmp_scope_lines', 'SELECT,INSERT,UPDATE,DELETE'
    ) then
    raise exception 'Quyền hierarchy không tối thiểu';
  end if;

  if to_regprocedure(
      'public.vmp_item_rights_before_canonical_scope(uuid,text)'
    ) is null
      or to_regprocedure(
        'public.vmp_item_rights_before_assignment_only_qa(uuid,text)'
      ) is null then
    raise exception 'Rights chain chưa đủ ba lớp';
  end if;
  select pg_get_functiondef(
    'public.vmp_item_rights(uuid,text)'::regprocedure
  ) into v_final_definition;
  select pg_get_functiondef(
    'public.vmp_item_rights_before_assignment_only_qa(uuid,text)'::regprocedure
  ) into v_middle_definition;
  if position(
      'vmp_item_rights_before_assignment_only_qa' in v_final_definition
    ) = 0
      or position(
        'vmp_item_rights_before_canonical_scope' in v_middle_definition
      ) = 0 then
    raise exception 'Rights chain delegate sai thứ tự';
  end if;
  if has_function_privilege(
      'authenticated', 'public.vmp_item_rights(uuid,text)', 'EXECUTE'
    ) or not has_function_privilege(
      'service_role', 'public.vmp_item_rights(uuid,text)', 'EXECUTE'
    ) or has_function_privilege(
      'service_role',
      'public.vmp_item_rights_before_canonical_scope(uuid,text)', 'EXECUTE'
    ) or has_function_privilege(
      'service_role',
      'public.vmp_item_rights_before_assignment_only_qa(uuid,text)', 'EXECUTE'
    ) then
    raise exception 'Quyền rights chain chưa tối thiểu';
  end if;

  select pg_get_functiondef(
    'public.rpc_set_item_assignment(uuid,text,text,text,text,text)'::regprocedure
  ) into v_assignment_definition;
  if position(E'where id = p_person_id and is_active\n  for update'
      in v_assignment_definition) = 0 then
    raise exception 'Assignment RPC chưa khóa performer trước snapshot';
  end if;
  select pg_get_functiondef(
    'public.rpc_refresh_source_item_assignments()'::regprocedure
  ) into v_refresh_definition;
  if position('from public.vmp_performers person' in v_refresh_definition) = 0
      or position('from public.vmp_plan_items item' in v_refresh_definition) = 0
      or position('from public.vmp_performers person' in v_refresh_definition)
        > position('from public.vmp_plan_items item' in v_refresh_definition)
      or position(E'order by person.id\n  for update' in v_refresh_definition) = 0 then
    raise exception 'Refresh nguồn chưa khóa performer trước item';
  end if;
  select pg_get_functiondef(
    'public.rpc_item_permission_preflight()'::regprocedure
  ) into v_preflight_definition;
  if position('ASSIGNMENT_USER_MISMATCH' in v_preflight_definition) = 0
      or position('ASSIGNMENT_ACCOUNT_MISMATCH' in v_preflight_definition) > 0
      or position('INCOMPLETE_SCOPE_HIERARCHY' in v_preflight_definition) = 0
      or position('DUPLICATE_ACTIVE_QA_PRIMARY' in v_preflight_definition) = 0
      or position('DUPLICATE_ACTIVE_QA_PERSON' in v_preflight_definition) = 0 then
    raise exception 'Preflight canonical thiếu hoặc trùng blocker';
  end if;
  if position(
      $needle$'owner_person_id', i.owner_person_id$needle$
      in pg_get_functiondef(
        'public.rpc_get_vmp_dashboard(integer,boolean,boolean)'::regprocedure
      )
    ) = 0 then
    raise exception 'Dashboard chưa trả owner_person_id';
  end if;
  if exists (
    select 1 from public.vmp_unfiltered_security_definer_item_readers()
  ) then
    raise exception 'SECURITY DEFINER item reader chưa được allowlist rõ';
  end if;
  if not exists (
    select 1 from pg_event_trigger trigger
    where trigger.evtname = 'chan_overload_rpc_tg'
      and trigger.evtenabled = 'O'
  ) then
    raise exception 'Event trigger chống overload phải tồn tại và được bật';
  end if;
end
$verify$;

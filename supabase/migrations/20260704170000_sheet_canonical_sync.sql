-- Google Sheet is the canonical VMP source. This migration stores an exact
-- ordered snapshot, then projects the latest valid snapshot into the existing
-- domain tables without ever writing back to Google Sheet.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.vmp_sheet_sync_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  sheet_id text not null,
  sheet_gid text not null,
  tab_name text not null,
  headers jsonb not null check (jsonb_typeof(headers) = 'array'),
  source_row_count integer not null check (source_row_count >= 0),
  unique_validation_count integer not null check (unique_validation_count >= 0),
  object_count integer not null check (object_count >= 0),
  duplicate_validation_count integer not null default 0 check (duplicate_validation_count >= 0),
  checksum text not null,
  status text not null default 'applying'
    check (status in ('applying', 'completed', 'failed', 'rolled_back')),
  result jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.vmp_sheet_rows (
  sync_run_id uuid not null references public.vmp_sheet_sync_runs(id) on delete cascade,
  sheet_row_number integer not null check (sheet_row_number >= 2),
  values_json jsonb not null check (jsonb_typeof(values_json) = 'array'),
  validation_code text not null,
  object_code text not null,
  row_hash text not null,
  primary key (sync_run_id, sheet_row_number)
);

create index if not exists idx_vmp_sheet_rows_validation_code
  on public.vmp_sheet_rows (validation_code);
create index if not exists idx_vmp_sheet_rows_object_code
  on public.vmp_sheet_rows (object_code);

create table if not exists public.vmp_sheet_sync_backups (
  sync_run_id uuid not null references public.vmp_sheet_sync_runs(id) on delete cascade,
  dataset text not null check (dataset in ('vmp_plan_items', 'vmp_objects')),
  row_count integer not null,
  rows_json jsonb not null check (jsonb_typeof(rows_json) = 'array'),
  created_at timestamptz not null default now(),
  primary key (sync_run_id, dataset)
);

alter table public.vmp_plan_items
  add column if not exists source_sync_run_id uuid references public.vmp_sheet_sync_runs(id) on delete set null,
  add column if not exists source_sheet_row integer,
  add column if not exists source_sheet_data jsonb not null default '{}'::jsonb;

alter table public.vmp_objects
  add column if not exists source_sync_run_id uuid references public.vmp_sheet_sync_runs(id) on delete set null,
  add column if not exists source_sheet_row integer,
  add column if not exists source_sheet_data jsonb not null default '{}'::jsonb;

alter table public.vmp_sheet_sync_runs enable row level security;
alter table public.vmp_sheet_rows enable row level security;
alter table public.vmp_sheet_sync_backups enable row level security;

revoke all on table public.vmp_sheet_sync_runs from anon, authenticated;
revoke all on table public.vmp_sheet_rows from anon, authenticated;
revoke all on table public.vmp_sheet_sync_backups from anon, authenticated;
grant all on table public.vmp_sheet_sync_runs to service_role;
grant all on table public.vmp_sheet_rows to service_role;
grant all on table public.vmp_sheet_sync_backups to service_role;

create or replace function public.vmp_sheet_value(p_values jsonb, p_index integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(btrim(p_values ->> p_index), '');
$$;

create or replace function public.vmp_sheet_date(p_value text)
returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v text := btrim(coalesce(p_value, ''));
  m text[];
begin
  if v = '' then
    return null;
  end if;

  m := regexp_match(v, '^(\d{4})[-/](\d{1,2})[-/](\d{1,2})');
  if m is not null then
    return make_date(m[1]::integer, m[2]::integer, m[3]::integer);
  end if;

  m := regexp_match(v, '^(\d{1,2})[-/](\d{1,2})[-/](\d{4})');
  if m is not null then
    return make_date(m[3]::integer, m[2]::integer, m[1]::integer);
  end if;

  return null;
exception when others then
  return null;
end;
$$;

create or replace function public.vmp_sheet_number(p_value text)
returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v text := replace(btrim(coalesce(p_value, '')), ',', '.');
begin
  if v = '' or v !~ '^[+-]?\d+(\.\d+)?$' then
    return null;
  end if;
  return v::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public.vmp_sheet_status(p_value text)
returns public.phase_status
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v text := lower(btrim(coalesce(p_value, '')));
begin
  if v = ''
     or v ~ '(chưa|chua|không|khong)'
     or v ~ 'not[_ -]?started'
     or v ~ '(chờ|cho|pending|kế hoạch|ke hoach|plan)' then
    return 'not_started'::public.phase_status;
  end if;

  if v ~ '(hoàn thành|hoan thanh|done|đạt|dat|complete|completed|xong|ok)' then
    return 'completed'::public.phase_status;
  end if;

  if v ~ '(đang|dang|progress|in[_ -]?progress|thực hiện|thuc hien|wip)' then
    return 'in_progress'::public.phase_status;
  end if;

  return 'not_started'::public.phase_status;
end;
$$;

create or replace function public.vmp_sheet_classification(p_value text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v text := lower(btrim(coalesce(p_value, '')));
begin
  if v ~ '(quy trình|quy trinh|process|sop|công đoạn|cong doan)' then return 'qt'; end if;
  if v ~ '(kho|warehouse|storage|bảo quản|bao quan)' then return 'kho'; end if;
  if v ~ '(hệ thống|he thong|phụ trợ|phu tro|hvac|utility|khí|khi|nước|nuoc|điều hòa|dieu hoa)' then return 'ht'; end if;
  if v ~ '(vận chuyển|van chuyen|transport|logistics|cold chain|chuỗi lạnh|chuoi lanh)' then return 'vc'; end if;
  return 'tb';
end;
$$;

create or replace function public.vmp_sheet_department(p_value text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v text := lower(btrim(coalesce(p_value, '')));
begin
  if v ~ '(xsx|sản xuất|san xuat|xưởng|xuong|production|(^|[^a-z])sx([^a-z]|$))' then return 'sx'; end if;
  if v ~ '(cơ điện|co dien|mep|kỹ thuật|ky thuat|engineering|cđ|(^|[^a-z])cd([^a-z]|$))' then return 'cd'; end if;
  if v ~ '((^|[^a-z])kho([^a-z]|$)|warehouse)' then return 'kho'; end if;
  if v ~ '((^|[^a-z])rd([^a-z]|$)|r&d|nghiên cứu|nghien cuu|research|qc|kiểm nghiệm|kiem nghiem|lab)' then return 'qc'; end if;
  return 'qa';
end;
$$;

create or replace function public.vmp_sheet_criticality(p_score text, p_report_class text)
returns public.criticality
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  score numeric := public.vmp_sheet_number(p_score);
  report text := lower(btrim(coalesce(p_report_class, '')));
begin
  if score is not null then
    if score >= 7 then return 'high'::public.criticality; end if;
    if score >= 4 then return 'medium'::public.criticality; end if;
    return 'low'::public.criticality;
  end if;

  if report ~ '(vô khuẩn|vo khuan|sterile|aseptic|nhiễm khuẩn|nhiem khuan|micro)' then
    return 'high'::public.criticality;
  end if;
  if report ~ '(không phụ thuộc|khong phu thuoc|độc lập|doc lap|independent)' then
    return 'low'::public.criticality;
  end if;
  return 'medium'::public.criticality;
end;
$$;

create or replace function public.rpc_sync_vmp_sheet_snapshot(
  p_sheet_id text,
  p_sheet_gid text,
  p_tab_name text,
  p_headers jsonb,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_run_id uuid;
  v_source_rows integer;
  v_unique_ids integer;
  v_objects integer;
  v_duplicates integer;
  v_plan_upserts integer := 0;
  v_plan_deactivated integer := 0;
  v_object_upserts integer := 0;
  v_object_deactivated integer := 0;
  v_checksum text;
  v_result jsonb;
begin
  if jsonb_typeof(p_headers) <> 'array' or jsonb_array_length(p_headers) <> 37 then
    raise exception 'VMP_SYNC_INVALID_HEADERS: expected 37 ordered headers';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'VMP_SYNC_INVALID_ROWS: rows must be a JSON array';
  end if;

  v_source_rows := jsonb_array_length(p_rows);
  if v_source_rows < 450 or v_source_rows > 5000 then
    raise exception 'VMP_SYNC_ROW_GUARD: source row count % is outside 450..5000', v_source_rows;
  end if;

  drop table if exists tmp_vmp_sheet_rows;
  create temporary table tmp_vmp_sheet_rows on commit drop as
  select
    (entry ->> 'row_number')::integer as row_number,
    entry -> 'values' as values_json,
    public.vmp_sheet_value(entry -> 'values', 16) as validation_code,
    public.vmp_sheet_value(entry -> 'values', 3) as object_code
  from jsonb_array_elements(p_rows) as x(entry);

  if exists (
    select 1
    from tmp_vmp_sheet_rows
    where row_number < 2
       or jsonb_typeof(values_json) <> 'array'
       or jsonb_array_length(values_json) <> 37
       or validation_code is null
       or object_code is null
  ) then
    raise exception 'VMP_SYNC_SHAPE_GUARD: every row needs row_number, 37 values, ID and object code';
  end if;

  select count(distinct validation_code), count(distinct object_code)
    into v_unique_ids, v_objects
  from tmp_vmp_sheet_rows;
  v_duplicates := v_source_rows - v_unique_ids;

  if v_unique_ids < 450 or v_objects < 200 or v_duplicates > 10 then
    raise exception 'VMP_SYNC_CARDINALITY_GUARD: rows=%, unique_ids=%, objects=%, duplicates=%',
      v_source_rows, v_unique_ids, v_objects, v_duplicates;
  end if;

  v_checksum := encode(
    extensions.digest(convert_to(p_headers::text || p_rows::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.vmp_sheet_sync_runs (
    sheet_id, sheet_gid, tab_name, headers, source_row_count,
    unique_validation_count, object_count, duplicate_validation_count,
    checksum, status
  ) values (
    p_sheet_id, p_sheet_gid, p_tab_name, p_headers, v_source_rows,
    v_unique_ids, v_objects, v_duplicates, v_checksum, 'applying'
  ) returning id into v_run_id;

  insert into public.vmp_sheet_sync_backups (sync_run_id, dataset, row_count, rows_json)
  select v_run_id, 'vmp_plan_items', count(*), coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
  from public.vmp_plan_items p;

  insert into public.vmp_sheet_sync_backups (sync_run_id, dataset, row_count, rows_json)
  select v_run_id, 'vmp_objects', count(*), coalesce(jsonb_agg(to_jsonb(o) order by o.code), '[]'::jsonb)
  from public.vmp_objects o;

  insert into public.vmp_sheet_rows (
    sync_run_id, sheet_row_number, values_json, validation_code, object_code, row_hash
  )
  select
    v_run_id,
    row_number,
    values_json,
    validation_code,
    object_code,
    encode(extensions.digest(convert_to(values_json::text, 'UTF8'), 'sha256'), 'hex')
  from tmp_vmp_sheet_rows
  order by row_number;

  drop table if exists tmp_vmp_source;
  create temporary table tmp_vmp_source on commit drop as
  select distinct on (r.validation_code)
    r.row_number,
    r.values_json,
    r.validation_code,
    r.object_code,
    upper(coalesce(public.vmp_sheet_value(r.values_json, 2), 'PQ')) as validation_type,
    coalesce(public.vmp_sheet_value(r.values_json, 29), public.vmp_sheet_value(r.values_json, 13), 'Không phụ thuộc') as report_class,
    coalesce(public.vmp_sheet_value(r.values_json, 17), public.vmp_sheet_value(r.values_json, 19)) as owner_name,
    public.vmp_sheet_value(r.values_json, 19) as secondary_owner,
    public.vmp_sheet_number(public.vmp_sheet_value(r.values_json, 14)) as effort_days,
    public.vmp_sheet_number(public.vmp_sheet_value(r.values_json, 15))::integer as criticality_score,
    public.vmp_sheet_criticality(
      public.vmp_sheet_value(r.values_json, 15),
      coalesce(public.vmp_sheet_value(r.values_json, 29), public.vmp_sheet_value(r.values_json, 13))
    ) as criticality,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 21)) as deadline_protocol,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 25)) as deadline_validation,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 30)) as deadline_report,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 33)) as deadline_vmp,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 22)) as actual_protocol_date,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 27)) as actual_validation_date,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 31)) as actual_report_date,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 34)) as actual_vmp_date,
    public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 26)) as scheduled_date,
    public.vmp_sheet_status(public.vmp_sheet_value(r.values_json, 23)) as status_protocol,
    public.vmp_sheet_status(public.vmp_sheet_value(r.values_json, 28)) as status_validation,
    public.vmp_sheet_status(public.vmp_sheet_value(r.values_json, 32)) as status_report,
    public.vmp_sheet_status(public.vmp_sheet_value(r.values_json, 35)) as status_vmp,
    coalesce((regexp_match(r.validation_code, '/(20\d{2})'))[1]::integer, extract(year from current_date)::integer) as plan_year,
    jsonb_build_object(
      'row_number', r.row_number,
      'values', r.values_json,
      'state', public.vmp_sheet_value(r.values_json, 8),
      'show', public.vmp_sheet_value(r.values_json, 9),
      'validation_required', public.vmp_sheet_value(r.values_json, 10),
      'entered_year', public.vmp_sheet_value(r.values_json, 12),
      'qa_email', public.vmp_sheet_value(r.values_json, 18),
      'secondary_email', public.vmp_sheet_value(r.values_json, 20),
      'deadline_validation_start', public.vmp_sheet_date(public.vmp_sheet_value(r.values_json, 24)),
      'unknown_flag', public.vmp_sheet_value(r.values_json, 36)
    ) as source_sheet_data
  from tmp_vmp_sheet_rows r
  order by r.validation_code, r.row_number desc;

  insert into public.vmp_objects (
    code, name, classification, department, area, line,
    criticality_score, criticality, frequency_months, is_active,
    source_sync_run_id, source_sheet_row, source_sheet_data
  )
  select distinct on (s.object_code)
    s.object_code,
    coalesce(public.vmp_sheet_value(s.values_json, 4), s.object_code),
    public.vmp_sheet_classification(public.vmp_sheet_value(s.values_json, 1)),
    public.vmp_sheet_department(public.vmp_sheet_value(s.values_json, 5)),
    coalesce(public.vmp_sheet_value(s.values_json, 6), '—'),
    coalesce(public.vmp_sheet_value(s.values_json, 7), '—'),
    s.criticality_score,
    s.criticality,
    coalesce(nullif(public.vmp_sheet_number(public.vmp_sheet_value(s.values_json, 11))::integer, 0), 12),
    true,
    v_run_id,
    s.row_number,
    s.source_sheet_data || jsonb_build_object(
      'object_type', public.vmp_sheet_value(s.values_json, 1),
      'object_name', public.vmp_sheet_value(s.values_json, 4),
      'department', public.vmp_sheet_value(s.values_json, 5),
      'area', public.vmp_sheet_value(s.values_json, 6),
      'line', public.vmp_sheet_value(s.values_json, 7),
      'frequency_months', public.vmp_sheet_value(s.values_json, 11)
    )
  from tmp_vmp_source s
  order by s.object_code, s.row_number
  on conflict (code) do update set
    name = excluded.name,
    classification = excluded.classification,
    department = excluded.department,
    area = excluded.area,
    line = excluded.line,
    criticality_score = excluded.criticality_score,
    criticality = excluded.criticality,
    frequency_months = excluded.frequency_months,
    is_active = true,
    source_sync_run_id = excluded.source_sync_run_id,
    source_sheet_row = excluded.source_sheet_row,
    source_sheet_data = excluded.source_sheet_data,
    updated_at = now();
  get diagnostics v_object_upserts = row_count;

  insert into public.vmp_plan_items (
    id, validation_code, object_code, validation_type, report_class,
    owner_name, secondary_owner, effort_days, criticality_score, criticality,
    deadline_protocol, deadline_validation, deadline_report, deadline_vmp,
    actual_protocol_date, actual_validation_date, actual_report_date, actual_vmp_date,
    scheduled_date, status_protocol, status_validation, status_report, status_vmp,
    is_active, year, missing_from_sheet, missing_since,
    deleted_from_sheet, deleted_at, delete_reason, last_synced,
    source_sync_run_id, source_sheet_row, source_sheet_data
  )
  select
    s.validation_code, s.validation_code, s.object_code, s.validation_type, s.report_class,
    s.owner_name, s.secondary_owner, s.effort_days, s.criticality_score, s.criticality,
    s.deadline_protocol, s.deadline_validation, s.deadline_report, s.deadline_vmp,
    s.actual_protocol_date, s.actual_validation_date, s.actual_report_date, s.actual_vmp_date,
    s.scheduled_date, s.status_protocol, s.status_validation, s.status_report, s.status_vmp,
    true, s.plan_year, false, null,
    false, null, null, now(),
    v_run_id, s.row_number, s.source_sheet_data
  from tmp_vmp_source s
  on conflict (id) do update set
    validation_code = excluded.validation_code,
    object_code = excluded.object_code,
    validation_type = excluded.validation_type,
    report_class = excluded.report_class,
    owner_name = excluded.owner_name,
    secondary_owner = excluded.secondary_owner,
    effort_days = excluded.effort_days,
    criticality_score = excluded.criticality_score,
    criticality = excluded.criticality,
    deadline_protocol = excluded.deadline_protocol,
    deadline_validation = excluded.deadline_validation,
    deadline_report = excluded.deadline_report,
    deadline_vmp = excluded.deadline_vmp,
    actual_protocol_date = excluded.actual_protocol_date,
    actual_validation_date = excluded.actual_validation_date,
    actual_report_date = excluded.actual_report_date,
    actual_vmp_date = excluded.actual_vmp_date,
    scheduled_date = excluded.scheduled_date,
    status_protocol = excluded.status_protocol,
    status_validation = excluded.status_validation,
    status_report = excluded.status_report,
    status_vmp = excluded.status_vmp,
    is_active = true,
    year = excluded.year,
    missing_from_sheet = false,
    missing_since = null,
    deleted_from_sheet = false,
    deleted_at = null,
    delete_reason = null,
    last_synced = now(),
    source_sync_run_id = excluded.source_sync_run_id,
    source_sheet_row = excluded.source_sheet_row,
    source_sheet_data = excluded.source_sheet_data,
    updated_at = now();
  get diagnostics v_plan_upserts = row_count;

  update public.vmp_plan_items p
  set
    is_active = false,
    missing_from_sheet = true,
    missing_since = coalesce(p.missing_since, now()),
    deleted_from_sheet = true,
    deleted_at = coalesce(p.deleted_at, now()),
    delete_reason = 'Absent from canonical Google Sheet snapshot',
    last_synced = now(),
    updated_at = now()
  where not exists (
    select 1 from tmp_vmp_source s where s.validation_code = p.validation_code
  )
  and (
    p.is_active is distinct from false
    or p.missing_from_sheet is distinct from true
    or p.deleted_from_sheet is distinct from true
  );
  get diagnostics v_plan_deactivated = row_count;

  update public.vmp_objects o
  set is_active = false, updated_at = now()
  where not exists (
    select 1 from tmp_vmp_source s where s.object_code = o.code
  )
  and o.is_active is distinct from false;
  get diagnostics v_object_deactivated = row_count;

  v_result := jsonb_build_object(
    'ok', true,
    'sync_run_id', v_run_id,
    'checksum', v_checksum,
    'source_rows', v_source_rows,
    'unique_validation_ids', v_unique_ids,
    'objects_in_sheet', v_objects,
    'duplicate_validation_ids', v_duplicates,
    'plan_upserts', v_plan_upserts,
    'plan_soft_deactivated', v_plan_deactivated,
    'object_upserts', v_object_upserts,
    'object_soft_deactivated', v_object_deactivated
  );

  update public.vmp_sheet_sync_runs
  set status = 'completed', result = v_result, completed_at = now()
  where id = v_run_id;

  return v_result;
end;
$$;

create or replace function public.rpc_rollback_vmp_sheet_sync(p_sync_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan_restored integer := 0;
  v_plan_deactivated integer := 0;
  v_objects_restored integer := 0;
  v_objects_deactivated integer := 0;
begin
  if not exists (
    select 1 from public.vmp_sheet_sync_backups where sync_run_id = p_sync_run_id
  ) then
    raise exception 'VMP_SYNC_BACKUP_NOT_FOUND: %', p_sync_run_id;
  end if;

  drop table if exists tmp_vmp_plan_restore;
  create temporary table tmp_vmp_plan_restore on commit drop as
  select x.*
  from public.vmp_sheet_sync_backups b,
       jsonb_populate_recordset(null::public.vmp_plan_items, b.rows_json) x
  where b.sync_run_id = p_sync_run_id and b.dataset = 'vmp_plan_items';

  update public.vmp_plan_items p
  set
    validation_code = b.validation_code,
    object_code = b.object_code,
    validation_type = b.validation_type,
    report_class = b.report_class,
    owner_name = b.owner_name,
    secondary_owner = b.secondary_owner,
    effort_days = b.effort_days,
    criticality_score = b.criticality_score,
    criticality = b.criticality,
    deadline_protocol = b.deadline_protocol,
    deadline_validation = b.deadline_validation,
    deadline_report = b.deadline_report,
    deadline_vmp = b.deadline_vmp,
    actual_protocol_date = b.actual_protocol_date,
    actual_validation_date = b.actual_validation_date,
    actual_report_date = b.actual_report_date,
    actual_vmp_date = b.actual_vmp_date,
    scheduled_date = b.scheduled_date,
    status_protocol = b.status_protocol,
    status_validation = b.status_validation,
    status_report = b.status_report,
    status_vmp = b.status_vmp,
    is_active = b.is_active,
    year = b.year,
    missing_from_sheet = b.missing_from_sheet,
    missing_since = b.missing_since,
    deleted_from_sheet = b.deleted_from_sheet,
    deleted_at = b.deleted_at,
    delete_reason = b.delete_reason,
    last_synced = b.last_synced,
    source_sync_run_id = b.source_sync_run_id,
    source_sheet_row = b.source_sheet_row,
    source_sheet_data = b.source_sheet_data,
    updated_at = now()
  from tmp_vmp_plan_restore b
  where p.id = b.id;
  get diagnostics v_plan_restored = row_count;

  update public.vmp_plan_items p
  set is_active = false, updated_at = now(),
      delete_reason = 'Created after restored snapshot'
  where not exists (select 1 from tmp_vmp_plan_restore b where b.id = p.id)
    and p.is_active is distinct from false;
  get diagnostics v_plan_deactivated = row_count;

  drop table if exists tmp_vmp_object_restore;
  create temporary table tmp_vmp_object_restore on commit drop as
  select x.*
  from public.vmp_sheet_sync_backups b,
       jsonb_populate_recordset(null::public.vmp_objects, b.rows_json) x
  where b.sync_run_id = p_sync_run_id and b.dataset = 'vmp_objects';

  update public.vmp_objects o
  set
    name = b.name,
    classification = b.classification,
    department = b.department,
    area = b.area,
    line = b.line,
    criticality_score = b.criticality_score,
    criticality = b.criticality,
    frequency_months = b.frequency_months,
    gxp_impact = b.gxp_impact,
    notes = b.notes,
    is_active = b.is_active,
    source_sync_run_id = b.source_sync_run_id,
    source_sheet_row = b.source_sheet_row,
    source_sheet_data = b.source_sheet_data,
    updated_at = now()
  from tmp_vmp_object_restore b
  where o.code = b.code;
  get diagnostics v_objects_restored = row_count;

  update public.vmp_objects o
  set is_active = false, updated_at = now()
  where not exists (select 1 from tmp_vmp_object_restore b where b.code = o.code)
    and o.is_active is distinct from false;
  get diagnostics v_objects_deactivated = row_count;

  update public.vmp_sheet_sync_runs
  set status = 'rolled_back', completed_at = now()
  where id = p_sync_run_id;

  return jsonb_build_object(
    'ok', true,
    'sync_run_id', p_sync_run_id,
    'plan_restored', v_plan_restored,
    'plan_deactivated', v_plan_deactivated,
    'objects_restored', v_objects_restored,
    'objects_deactivated', v_objects_deactivated
  );
end;
$$;

revoke all on function public.rpc_sync_vmp_sheet_snapshot(text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.rpc_rollback_vmp_sheet_sync(uuid) from public, anon, authenticated;
grant execute on function public.rpc_sync_vmp_sheet_snapshot(text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.rpc_rollback_vmp_sheet_sync(uuid) to service_role;

comment on function public.rpc_sync_vmp_sheet_snapshot(text, text, text, jsonb, jsonb)
  is 'Atomically mirrors the canonical Google Sheet snapshot into VMP domain tables with guards and rollback backup.';
comment on function public.rpc_rollback_vmp_sheet_sync(uuid)
  is 'Restores VMP sheet-owned fields from the backup captured immediately before a canonical sync run.';

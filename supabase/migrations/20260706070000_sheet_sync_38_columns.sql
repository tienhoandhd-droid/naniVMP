-- Sheet canonical đã thêm 1 cột ở cuối (index 37:
-- "Không có thẩm định thực tế và hoàn thiện hồ sơ") → tổng 38 cột.
-- Các cột 0..36 giữ nguyên vị trí/ý nghĩa nên chỉ nới hàng rào 37→38.
-- Redefine rpc_sync_vmp_sheet_snapshot (giữ nguyên logic, CREATE OR REPLACE
-- bảo toàn quyền đã cấp cho service_role).

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
  v_plan_deleted integer := 0;
  v_object_upserts integer := 0;
  v_object_deleted integer := 0;
  v_quality_deleted integer := 0;
  v_notifications_deleted integer := 0;
  v_progress_deleted integer := 0;
  v_full_reset boolean;
  v_checksum text;
  v_result jsonb;
begin
  -- One sync at a time. Concurrent schedule/manual runs serialize here.
  perform pg_advisory_xact_lock(hashtext('public.rpc_sync_vmp_sheet_snapshot'));

  if jsonb_typeof(p_headers) <> 'array' or jsonb_array_length(p_headers) <> 38 then
    raise exception 'VMP_SYNC_INVALID_HEADERS: expected 38 ordered headers';
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
       or jsonb_array_length(values_json) <> 38
       or validation_code is null
       or object_code is null
  ) then
    raise exception 'VMP_SYNC_SHAPE_GUARD: every row needs row_number, 38 values, ID and object code';
  end if;

  if (select count(*) from tmp_vmp_sheet_rows)
     <> (select count(distinct row_number) from tmp_vmp_sheet_rows) then
    raise exception 'VMP_SYNC_DUPLICATE_ROW_NUMBER: Sheet row numbers must be unique';
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

  -- No completed canonical run means this is the authorized one-time reset.
  select not exists (
    select 1 from public.vmp_sheet_sync_runs where status = 'completed'
  ) into v_full_reset;

  insert into public.vmp_sheet_sync_runs (
    sheet_id, sheet_gid, tab_name, headers, source_row_count,
    unique_validation_count, object_count, duplicate_validation_count,
    checksum, status
  ) values (
    p_sheet_id, p_sheet_gid, p_tab_name, p_headers, v_source_rows,
    v_unique_ids, v_objects, v_duplicates, v_checksum, 'applying'
  ) returning id into v_run_id;

  insert into public.vmp_sheet_sync_backups (sync_run_id, dataset, row_count, rows_json)
  select v_run_id, 'vmp_plan_items', count(*),
         coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
  from public.vmp_plan_items p;

  insert into public.vmp_sheet_sync_backups (sync_run_id, dataset, row_count, rows_json)
  select v_run_id, 'vmp_objects', count(*),
         coalesce(jsonb_agg(to_jsonb(o) order by o.code), '[]'::jsonb)
  from public.vmp_objects o;

  insert into public.vmp_sheet_sync_backups (sync_run_id, dataset, row_count, rows_json)
  select v_run_id, 'data_quality_issues', count(*),
         coalesce(jsonb_agg(to_jsonb(q) order by q.detected_at, q.id), '[]'::jsonb)
  from public.data_quality_issues q;

  insert into public.vmp_sheet_sync_backups (sync_run_id, dataset, row_count, rows_json)
  select v_run_id, 'vmp_notifications', count(*),
         coalesce(jsonb_agg(to_jsonb(n) order by n.created_at, n.id), '[]'::jsonb)
  from public.vmp_notifications n;

  insert into public.vmp_sheet_sync_backups (sync_run_id, dataset, row_count, rows_json)
  select v_run_id, 'vmp_progress_events', count(*),
         coalesce(jsonb_agg(to_jsonb(e) order by e.changed_at, e.event_id), '[]'::jsonb)
  from public.vmp_progress_events e;

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
    coalesce((regexp_match(r.validation_code, '/(20\d{2})'))[1]::integer,
             extract(year from current_date)::integer) as plan_year,
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

  if v_full_reset then
    delete from public.data_quality_issues;
    get diagnostics v_quality_deleted = row_count;
    delete from public.vmp_notifications;
    get diagnostics v_notifications_deleted = row_count;
    delete from public.vmp_progress_events;
    get diagnostics v_progress_deleted = row_count;
    delete from public.vmp_plan_items;
    get diagnostics v_plan_deleted = row_count;
    delete from public.vmp_objects;
    get diagnostics v_object_deleted = row_count;
  else
    delete from public.data_quality_issues q
    where q.plan_item_id is not null
      and not exists (
        select 1 from tmp_vmp_source s where s.validation_code = q.plan_item_id
      );
    get diagnostics v_quality_deleted = row_count;

    delete from public.vmp_notifications n
    where not exists (
      select 1 from tmp_vmp_source s where s.validation_code = n.plan_item_id
    );
    get diagnostics v_notifications_deleted = row_count;

    delete from public.vmp_progress_events e
    where not exists (
      select 1 from tmp_vmp_source s where s.validation_code = e.plan_item_id
    );
    get diagnostics v_progress_deleted = row_count;

    delete from public.vmp_plan_items p
    where not exists (
      select 1 from tmp_vmp_source s where s.validation_code = p.id
    );
    get diagnostics v_plan_deleted = row_count;

    delete from public.vmp_objects o
    where not exists (
      select 1 from tmp_vmp_source s where s.object_code = o.code
    );
    get diagnostics v_object_deleted = row_count;
  end if;

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

  if (select count(*) from public.vmp_plan_items) <> v_unique_ids
     or (select count(*) from public.vmp_objects) <> v_objects then
    raise exception 'VMP_SYNC_POSTCONDITION_FAILED: plans=%, expected=%, objects=%, expected=%',
      (select count(*) from public.vmp_plan_items), v_unique_ids,
      (select count(*) from public.vmp_objects), v_objects;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'sync_run_id', v_run_id,
    'checksum', v_checksum,
    'full_reset', v_full_reset,
    'source_rows', v_source_rows,
    'unique_validation_ids', v_unique_ids,
    'objects_in_sheet', v_objects,
    'duplicate_validation_ids', v_duplicates,
    'plan_deleted', v_plan_deleted,
    'plan_upserts', v_plan_upserts,
    'object_deleted', v_object_deleted,
    'object_upserts', v_object_upserts,
    'data_quality_deleted', v_quality_deleted,
    'notifications_deleted', v_notifications_deleted,
    'progress_deleted', v_progress_deleted
  );

  update public.vmp_sheet_sync_runs
  set status = 'completed', result = v_result, completed_at = now()
  where id = v_run_id;

  return v_result;
end;
$$;

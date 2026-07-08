-- Preserve and expose the Sheet-only "Bộ phận thực hiện thẩm định" column.
-- The canonical 37-column model remains unchanged; this migration stores the
-- extra parser payload beside a sync run and surfaces it in dashboard _raw.

create table if not exists public.vmp_sheet_row_extras (
  sync_run_id uuid not null references public.vmp_sheet_sync_runs(id) on delete cascade,
  sheet_row_number integer not null check (sheet_row_number >= 2),
  validation_code text not null,
  object_code text not null,
  extra_json jsonb not null default '{}'::jsonb check (jsonb_typeof(extra_json) = 'object'),
  created_at timestamptz not null default now(),
  primary key (sync_run_id, sheet_row_number)
);

create index if not exists idx_vmp_sheet_row_extras_validation_code
  on public.vmp_sheet_row_extras (validation_code);

alter table public.vmp_sheet_row_extras enable row level security;
revoke all on table public.vmp_sheet_row_extras from public, anon, authenticated;
grant all on table public.vmp_sheet_row_extras to service_role;

create or replace function public.rpc_sync_vmp_sheet_snapshot_with_extras(
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
  v_result jsonb;
  v_run_id uuid;
  v_extra_rows integer := 0;
  v_plan_updates integer := 0;
begin
  v_result := public.rpc_sync_vmp_sheet_snapshot(
    p_sheet_id,
    p_sheet_gid,
    p_tab_name,
    p_headers,
    p_rows
  );

  if coalesce((v_result ->> 'skipped')::boolean, false) then
    return v_result;
  end if;

  v_run_id := nullif(v_result ->> 'sync_run_id', '')::uuid;
  if v_run_id is null then
    return v_result;
  end if;

  insert into public.vmp_sheet_row_extras (
    sync_run_id, sheet_row_number, validation_code, object_code, extra_json
  )
  select
    v_run_id,
    (entry ->> 'row_number')::integer,
    public.vmp_sheet_value(entry -> 'values', 16),
    public.vmp_sheet_value(entry -> 'values', 3),
    coalesce(entry -> 'extra', '{}'::jsonb)
  from jsonb_array_elements(p_rows) as x(entry)
  where jsonb_typeof(entry -> 'extra') = 'object'
  on conflict (sync_run_id, sheet_row_number) do update set
    validation_code = excluded.validation_code,
    object_code = excluded.object_code,
    extra_json = excluded.extra_json;
  get diagnostics v_extra_rows = row_count;

  with latest_extra as (
    select distinct on (validation_code)
      validation_code,
      nullif(btrim(extra_json ->> 'execution_department'), '') as execution_department
    from public.vmp_sheet_row_extras
    where sync_run_id = v_run_id
      and nullif(btrim(extra_json ->> 'execution_department'), '') is not null
    order by validation_code, sheet_row_number desc
  )
  update public.vmp_plan_items p
  set source_sheet_data = p.source_sheet_data || jsonb_build_object(
    'bo_phan_thuc_hien_goc', latest_extra.execution_department
  )
  from latest_extra
  where p.source_sync_run_id = v_run_id
    and p.validation_code = latest_extra.validation_code;
  get diagnostics v_plan_updates = row_count;

  v_result := v_result || jsonb_build_object(
    'extra_rows', v_extra_rows,
    'execution_department_updates', v_plan_updates
  );

  update public.vmp_sheet_sync_runs
  set
    result = coalesce(result, '{}'::jsonb) || v_result,
    completed_at = now()
  where id = v_run_id;

  return v_result;
end;
$$;

revoke all on function public.rpc_sync_vmp_sheet_snapshot_with_extras(text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.rpc_sync_vmp_sheet_snapshot_with_extras(text, text, text, jsonb, jsonb)
  to service_role;

comment on function public.rpc_sync_vmp_sheet_snapshot_with_extras(text, text, text, jsonb, jsonb)
  is 'Canonical Sheet sync wrapper that preserves extra non-canonical Sheet columns for dashboard read models.';

create or replace function public.rpc_get_vmp_dashboard(
  p_year integer default (extract(year from now()))::integer,
  p_include_missing boolean default false,
  p_include_cancelled boolean default false
)
returns jsonb
language plpgsql
stable security definer
as $function$
declare
  result jsonb;
begin
  with latest_run as (
    select id
    from vmp_sheet_sync_runs
    where status = 'completed'
    order by created_at desc
    limit 1
  ),
  raw_status as (
    select distinct on (r.validation_code)
      r.validation_code,
      nullif(trim(r.values_json->>5), '')  as bo_phan_goc,
      nullif(trim(r.values_json->>23), '') as tt_de_cuong_goc,
      nullif(trim(r.values_json->>28), '') as tt_tham_dinh_goc,
      nullif(trim(r.values_json->>32), '') as tt_bao_cao_goc,
      nullif(trim(r.values_json->>35), '') as tt_vmp_goc
    from vmp_sheet_rows r
    join latest_run lr on r.sync_run_id = lr.id
    where r.validation_code is not null
    order by r.validation_code, r.sheet_row_number desc
  ),
  visible_items as (
    select pi.*, o.name as object_name, o.classification, o.department as obj_dept,
           o.area, o.line, o.criticality as obj_criticality, o.frequency_months,
           d.short_name as dept_short
    from vmp_plan_items pi
    join vmp_objects o on pi.object_code = o.code
    left join departments d on o.department = d.id
    where pi.year = p_year
      and pi.is_active = true
      and o.is_active = true
      and (p_include_missing or pi.missing_from_sheet = false)
      and (p_include_cancelled or coalesce(pi.item_state, 'active') <> 'cancelled')
  )
  select jsonb_build_object(
    'objects', (
      select coalesce(jsonb_agg(distinct jsonb_build_object(
        'code', o.code, 'name', o.name, 'cls', o.classification,
        'dept', o.department, 'area', o.area, 'line', o.line,
        'crit', case o.criticality when 'high' then 'Cao' when 'medium' then 'TB' else 'Thấp' end,
        'freq', o.frequency_months, 'need', true
      )), '[]'::jsonb)
      from vmp_objects o where o.is_active = true
    ),
    'activities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.validation_code,
        'validation_code', i.validation_code,
        'code', i.object_code,
        'name', i.object_name,
        'vtype', i.validation_type,
        'dept', i.obj_dept,
        'owner', coalesce(i.owner_name, '—'),
        'effort', i.effort_days,
        'score', i.criticality_score,
        'crit', case i.obj_criticality when 'high' then 'Cao' when 'medium' then 'TB' else 'Thấp' end,
        'target', i.deadline_vmp,
        'st', i.computed_status::text,
        'state', coalesce(i.item_state, 'active'),
        'version', i.version,
        'dep', i.report_class,
        'docDone', i.is_doc_complete,
        'mismatch', i.has_mismatch,
        '_raw', jsonb_build_object(
          'version', i.version,
          'ma', i.object_code,
          'loai_td', i.validation_type,
          'qa', i.owner_name,
          'bo_phan', i.obj_dept,
          'bo_phan_goc', rs.bo_phan_goc,
          'bo_phan_thuc_hien_goc', nullif(trim(i.source_sheet_data ->> 'bo_phan_thuc_hien_goc'), ''),
          'phan_loai', i.classification,
          'khu_vuc', i.area,
          'line', i.line,
          'tan_suat', i.frequency_months,
          'dl_vmp', i.deadline_vmp,
          'dl_de_cuong', i.deadline_protocol,
          'dl_bao_cao', i.deadline_report,
          'tt_de_cuong', i.status_protocol::text,
          'tt_tham_dinh', i.status_validation::text,
          'tt_bao_cao', i.status_report::text,
          'tt_vmp', i.status_vmp::text,
          'tt_de_cuong_goc', rs.tt_de_cuong_goc,
          'tt_tham_dinh_goc', rs.tt_tham_dinh_goc,
          'tt_bao_cao_goc', rs.tt_bao_cao_goc,
          'tt_vmp_goc', rs.tt_vmp_goc,
          'ngay_de_cuong', i.actual_protocol_date,
          'ngay_tham_dinh', i.actual_validation_date,
          'ngay_bao_cao', i.actual_report_date,
          'ngay_vmp', i.actual_vmp_date,
          'lich_td', i.scheduled_date,
          'state', coalesce(i.item_state, 'active')
        )
      )), '[]'::jsonb)
      from visible_items i
      left join raw_status rs on rs.validation_code = i.validation_code
    ),
    'source', 'supabase',
    'updated_at', now(),
    'year', p_year
  ) into result;

  return result;
end;
$function$;

-- =====================================================================
--  Chuẩn hoá BỘ PHẬN cho bộ lọc + watermark nhẹ cho polling
--  ---------------------------------------------------------------------
--  "Vấn đề lọc": bộ phận là chuỗi text tự do; frontend regex tách chuỗi
--  (parseDepts) mỗi lần enrich → không index được, dễ lệch giữa web và báo cáo.
--
--  LƯU Ý CỘT: Sheet vận hành RỘNG HƠN 37 cột. 37 cột canonical (values_json) chỉ
--  là tập chuẩn; có ÍT NHẤT 2 chiều bộ phận cần chuẩn hoá:
--    • bo_phan_goc          = "Bộ phận quản lý" — cột 5 TRONG 37 canonical.
--    • bo_phan_thuc_hien_goc = "Bộ phận thực hiện thẩm định" — cột PHỤ NGOÀI 37,
--      lưu ở vmp_plan_items.source_sheet_data (do sync wrapper điền từ extra).
--  Cột thực hiện mới là chỗ "1 hạng mục thuộc nhiều bộ phận" (vd "RD, QA, QC, XSX").
--
--  Migration này đưa logic tách bộ phận về SERVER làm nguồn chân lý duy nhất:
--    1. Hàm vmp_parse_depts() — bản SQL của parseDepts (immutable).
--    2. Cột departments text[] (từ bo_phan_goc) + execution_departments text[]
--       (từ bo_phan_thuc_hien_goc), mỗi cột 1 GIN index — precompute 1 lần lúc
--       ĐỒNG BỘ (không tính lại mỗi lần đọc dashboard).
--    3. Sync wrapper điền cả hai cột (guarded — không làm hỏng canonical).
--    4. rpc_get_vmp_dashboard trả sẵn 'depts' + 'exec_depts' (ưu tiên cột đã lưu,
--       fallback tính tại chỗ) → frontend không phải parseDepts nữa.
--    5. rpc_get_vmp_watermark() — query cực nhẹ để poll 20s so đổi trước khi
--       refetch toàn bộ payload.
--
--  Tính CHẤT: additive, backward-compatible, reversible. Không đổi hợp đồng
--  37 cột canonical, không đổi checksum, không đổi số đếm hậu kiểm.
-- =====================================================================

-- ── 1. Cột chuẩn hoá + index ──────────────────────────────────────────
alter table public.vmp_plan_items
  add column if not exists departments text[];
alter table public.vmp_plan_items
  add column if not exists execution_departments text[];

create index if not exists idx_vmp_plan_items_departments
  on public.vmp_plan_items using gin (departments);
create index if not exists idx_vmp_plan_items_execution_departments
  on public.vmp_plan_items using gin (execution_departments);

comment on column public.vmp_plan_items.departments is
  'Tập bộ phận (sx/cd/kho/rd/qc/qa) suy ra từ Sheet "bộ phận quản lý" (cột 5 canonical) bằng vmp_parse_depts(), precompute lúc sync. Nguồn chân lý cho bộ lọc Bộ phận quản lý.';
comment on column public.vmp_plan_items.execution_departments is
  'Tập bộ phận suy ra từ cột PHỤ "Bộ phận thực hiện thẩm định" (bo_phan_thuc_hien_goc, ngoài 37 canonical). Nguồn chân lý cho chiều "Bộ phận thực hiện". Rỗng nếu Sheet không ghi.';

-- ── 2. Bản SQL của parseDepts() (helpers.js) ──────────────────────────
-- Giữ ĐỒNG NHẤT với src/utils/helpers.js::parseDepts. Mọi thay đổi luật tách
-- bộ phận phải sửa CẢ HAI nơi (xem docs/filter-optimization-plan.md — có gợi ý
-- test parity trên CI).
create or replace function public.vmp_parse_depts(p_raw text)
returns text[]
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  x text := lower(coalesce(p_raw, ''));
  s text[] := '{}';
begin
  if x ~ '(\yxsx\y|xưởng|xuong|sản xuất|san xuat|\ysx\y)' then s := s || 'sx'; end if;
  if x ~ '(cơ điện|co dien|\ycd\y|cđ)'                     then s := s || 'cd'; end if;
  if x ~ '(\ykho\y|warehouse)'                             then s := s || 'kho'; end if;
  if x ~ '(\yrd\y|r&d|nghiên cứu|nghien cuu|research)'     then s := s || 'rd'; end if;
  if x ~ '(\yqc\y|kiểm nghiệm|kiem nghiem)'                then s := s || 'qc'; end if;
  if x ~ 'qlcl'                    then s := s || 'qa'; s := s || 'qc'; end if; -- QLCL = QA + QC
  if x ~ '(\yqa\y|đảm bảo|dam bao)'                        then s := s || 'qa'; end if;
  -- Loại trùng (thứ tự không quan trọng — chỉ dùng để so tập).
  return array(select distinct e from unnest(s) as e);
end;
$$;

comment on function public.vmp_parse_depts(text) is
  'Bản SQL của frontend parseDepts(): tách chuỗi bộ phận gốc thành tập {sx,cd,kho,rd,qc,qa}. QLCL=QA+QC.';

-- ── 3. Sync wrapper: điền departments sau khi snapshot canonical xong ──
--  Tái tạo NGUYÊN VĂN wrapper hiện có (migration 20260708143000) + thêm 1 bước
--  UPDATE departments được BỌC exception để KHÔNG BAO GIỜ làm rollback sync
--  canonical (dữ liệu bộ phận là dẫn xuất, không phải canonical).
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
  v_dept_updates integer := 0;
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

  -- NEW: precompute CẢ HAI tập bộ phận cho bộ lọc:
  --   • departments           ← bo_phan_goc (cột 5 canonical), có fallback dept đối tượng.
  --   • execution_departments ← "Bộ phận thực hiện thẩm định" (extra, ngoài 37 cột),
  --                              KHÔNG fallback (rỗng = Sheet không ghi) — khớp deptGroup().
  -- Bọc exception để lỗi ở đây KHÔNG kéo đổ snapshot canonical (dữ liệu dẫn xuất).
  begin
    with mgmt as (
      select distinct on (r.validation_code)
        r.validation_code,
        public.vmp_parse_depts(nullif(btrim(r.values_json ->> 5), '')) as depts
      from public.vmp_sheet_rows r
      where r.sync_run_id = v_run_id
        and r.validation_code is not null
      order by r.validation_code, r.sheet_row_number desc
    ),
    exec_src as (
      select distinct on (validation_code)
        validation_code,
        public.vmp_parse_depts(nullif(btrim(extra_json ->> 'execution_department'), '')) as depts
      from public.vmp_sheet_row_extras
      where sync_run_id = v_run_id
      order by validation_code, sheet_row_number desc
    )
    update public.vmp_plan_items p
    set departments = case
          when array_length(m.depts, 1) > 0 then m.depts
          else array[coalesce(
            (select o.department from public.vmp_objects o where o.code = p.object_code),
            'qa')]
        end,
        execution_departments = coalesce(e.depts, '{}'::text[])
    from mgmt m
    left join exec_src e on e.validation_code = m.validation_code
    where p.source_sync_run_id = v_run_id
      and p.validation_code = m.validation_code;
    get diagnostics v_dept_updates = row_count;
  exception when others then
    v_dept_updates := -1; -- đánh dấu lỗi mềm, không rollback
  end;

  v_result := v_result || jsonb_build_object(
    'extra_rows', v_extra_rows,
    'execution_department_updates', v_plan_updates,
    'department_updates', v_dept_updates
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

-- ── 4. Read RPC: trả sẵn 'depts' (ưu tiên cột đã lưu, fallback tính tại chỗ) ─
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
        -- Bộ phận QUẢN LÝ (bo_phan_goc): ưu tiên cột precompute; chưa có (chưa sync
        -- lại) thì tính tại chỗ; cuối cùng fallback dept đối tượng — khớp enrich().
        'depts', to_jsonb(coalesce(
          nullif(i.departments, array[]::text[]),
          nullif(public.vmp_parse_depts(rs.bo_phan_goc), array[]::text[]),
          array[coalesce(i.obj_dept, 'qa')]
        )),
        -- Bộ phận THỰC HIỆN (cột phụ ngoài 37): KHÔNG fallback dept đối tượng —
        -- rỗng nghĩa là Sheet chưa ghi, khớp deptGroup(bo_phan_thuc_hien_goc).
        'exec_depts', to_jsonb(coalesce(
          i.execution_departments,
          public.vmp_parse_depts(nullif(trim(i.source_sheet_data ->> 'bo_phan_thuc_hien_goc'), '')),
          '{}'::text[]
        )),
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

-- ── 5. Watermark nhẹ cho polling ──────────────────────────────────────
--  Poll 20s gọi hàm này (vài byte) thay vì kéo cả payload + JSON.stringify.
--  Đổi khi: có sync mới HOẶC admin sửa trực tiếp (max updated_at) HOẶC đổi
--  số lượng. Frontend so chuỗi watermark trước khi refetch full.
create or replace function public.rpc_get_vmp_watermark(
  p_year integer default (extract(year from now()))::integer
)
returns jsonb
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'year', p_year,
    'plan_items', (
      select count(*) from public.vmp_plan_items
      where year = p_year and is_active = true
    ),
    'objects', (
      select count(*) from public.vmp_objects where is_active = true
    ),
    'updated_at', greatest(
      coalesce((select max(updated_at) from public.vmp_plan_items where year = p_year), 'epoch'::timestamptz),
      coalesce((select max(updated_at) from public.vmp_objects), 'epoch'::timestamptz)
    )
  );
$$;

comment on function public.rpc_get_vmp_watermark(integer) is
  'Watermark nhẹ (count + max updated_at) cho web poll — chỉ refetch dashboard khi giá trị đổi.';

-- ── 6. Grants (đồng bộ với rpc_get_vmp_dashboard) ─────────────────────
grant execute on function public.vmp_parse_depts(text)            to anon, authenticated, service_role;
grant execute on function public.rpc_get_vmp_dashboard(integer, boolean, boolean) to anon, authenticated, service_role;
grant execute on function public.rpc_get_vmp_watermark(integer)   to anon, authenticated, service_role;

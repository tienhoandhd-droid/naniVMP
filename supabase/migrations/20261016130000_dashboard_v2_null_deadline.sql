-- =====================================================================
-- 20261016130000_dashboard_v2_null_deadline.sql — KPI v2 BỎ SÓT HẠNG MỤC CHƯA CÓ HẠN
-- ---------------------------------------------------------------------
-- Sự cố 16/10: áp 20260901110000 lên production thì web không tải được
-- dữ liệu. KPI 'documentation' của rpc_get_vmp_dashboard_v2 trả total 461
-- nhưng done 114 + over 302 + todo 40 = 456; bộ kiểm decodeCanonicalDashboard
-- của web (đúng) từ chối. Đã gỡ hàm v2 để web quay về v1 (cùng ngày).
--
-- Nguyên nhân: 5 hạng mục chưa xong và deadline_report NULL. `deadline_report
-- < v_as_of` ra NULL nên `not (...)` cũng NULL — hạng mục rơi khỏi cả 'over'
-- lẫn 'todo'. Sửa: todo = chưa xong và không quá hạn, coi NULL là chưa quá
-- hạn. KPI 'validation' cùng dạng rủi ro (canonical_status NULL) — sửa luôn.
--
-- Thân hàm chép nguyên văn từ 20260901110000 (đã đối chiếu trùng bản từng
-- chạy trên production), chỉ đổi hai dòng 'todo'. Quyền giữ như cũ.
--
-- CHỈ ÁP KHI item_permissions_mode = 'enforced'. Ở 'preview',
-- vmp_visible_plan_items() trả MỌI hạng mục, nên v2 cho nhân viên xưởng thấy
-- 461/461 trong khi v1 hiện lọc theo phạm vi (thử 16/10: quản lý xưởng v1 =
-- 234). Có v2 là web tự chuyển sang dùng nó — bật sớm là mở rộng dữ liệu.
-- =====================================================================

begin;

do $preflight$
begin
  if public.item_permissions_mode() <> 'enforced' then
    raise exception 'PRECONDITION FAILED: item_permissions_mode = % — chỉ áp v2 sau khi bật enforced (xem đầu file)',
      public.item_permissions_mode();
  end if;
end
$preflight$;

create or replace function public.rpc_get_vmp_dashboard_v2(
  p_year integer default extract(year from (now() at time zone 'Asia/Bangkok'))::integer,
  p_include_missing boolean default false
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_as_of date := (now() at time zone 'Asia/Bangkok')::date;
  v_updated_at timestamptz := now();
  v_revision bigint;
  v_result jsonb;
begin
  if p_year is null or p_year < 2000 or p_year > 2200 then
    raise exception using errcode = '22023', message = 'INVALID_YEAR';
  end if;
  if coalesce(auth.role(), '') not in ('', 'service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select revision into v_revision
  from public.vmp_authorization_revision
  where singleton;
  if v_revision is null or v_revision <= 0 then
    raise exception using errcode = '55000', message = 'AUTHORIZATION_REVISION_UNAVAILABLE';
  end if;

  with visible_items as materialized (
    select
      item.*,
      coalesce(
        item.deadline_vmp,
        item.deadline_report,
        item.deadline_validation,
        item.deadline_protocol,
        item.scheduled_date
      ) as canonical_deadline,
      public.vmp_canonical_item_status(item, v_as_of) as canonical_status
    from public.vmp_visible_plan_items() item
    where item.year = p_year
      and item.is_active
      and coalesce(item.item_state, 'active') <> 'cancelled'
      and (p_include_missing or not item.missing_from_sheet)
  ), visible_objects as materialized (
    select distinct on (item.object_code)
      item.object_code,
      source.object_name,
      source.object_kind,
      source.department,
      source.area_code,
      source.line,
      source.criticality_score as source_score,
      source.owner_name as source_owner,
      source.frequency_months,
      object.name as master_name,
      object.classification,
      object.department as master_department
    from visible_items item
    left join public.vmp_source_objects source
      on source.object_code = item.object_code and source.is_active
    left join public.vmp_objects object
      on object.code = item.object_code and object.is_active
    order by item.object_code, source.updated_at desc nulls last
  ), activity_rows as materialized (
    select item.*, object.object_name, object.master_name,
      object.classification, object.master_department,
      object.area_code, object.line, object.frequency_months
    from visible_items item
    left join visible_objects object on object.object_code = item.object_code
  ), payload as (
    select jsonb_build_object(
      'contract_version', 1,
      'year', p_year,
      'updated_at', v_updated_at,
      'authorization_revision', v_revision::text,
      'objects', coalesce((
        select jsonb_agg(jsonb_build_object(
          'code', object.object_code,
          'name', coalesce(object.object_name, object.master_name, object.object_code),
          'cls', coalesce(object.classification, public.vmp_ma_phan_loai(object.object_kind)),
          'dept', coalesce(object.master_department, (public.vmp_parse_depts(object.department))[1], 'qa'),
          'area', object.area_code,
          'line', object.line,
          'crit', case when object.source_score >= 7 then 'Cao'
                       when object.source_score >= 4 then 'TB'
                       when object.source_score is not null then 'Thấp'
                       else 'TB' end,
          'score', object.source_score,
          'owner', object.source_owner,
          'freq', object.frequency_months,
          'need', true
        ) order by object.object_code)
        from visible_objects object
      ), '[]'::jsonb),
      'activities', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', item.validation_code,
          'code', item.object_code,
          'obj', item.object_code,
          'name', coalesce(item.object_name, item.master_name, item.object_code),
          'type', item.validation_type,
          'vtype', item.validation_type,
          'dept', coalesce(item.master_department, 'qa'),
          'depts', to_jsonb(coalesce(item.departments, '{}'::text[])),
          'exec_depts', to_jsonb(coalesce(item.execution_departments, '{}'::text[])),
          'owner', coalesce(nullif(trim(item.owner_name), ''), '—'),
          'support', nullif(trim(item.secondary_owner), ''),
          'group', item.work_group,
          'effort', item.effort_days,
          'score', item.criticality_score,
          'target', item.canonical_deadline,
          'st', item.canonical_status::text,
          'canonical_deadline', item.canonical_deadline,
          'days_left', case when item.canonical_deadline is null then null else item.canonical_deadline - v_as_of end,
          'status_as_of', v_as_of,
          'state', coalesce(item.item_state, 'active'),
          'version', item.version,
          'dep', item.report_class,
          'docDone', item.is_doc_complete,
          'mismatch', item.has_mismatch,
          '_raw', jsonb_build_object(
            'version', item.version,
            'ma', item.object_code,
            'loai_td', item.validation_type,
            'qa', item.owner_name,
            'owner_person_id', item.owner_person_id,
            'ho_tro', item.secondary_owner,
            'nhom_viec', item.work_group,
            'diem_trong_yeu', item.criticality_score,
            'bo_phan', item.master_department,
            'phan_loai', item.classification,
            'khu_vuc', item.area_code,
            'line', item.line,
            'tan_suat', item.frequency_months,
            'dl_vmp', item.deadline_vmp,
            'dl_de_cuong', item.deadline_protocol,
            'dl_tham_dinh', item.deadline_validation,
            'dl_bao_cao', item.deadline_report,
            'tt_de_cuong', item.status_protocol::text,
            'tt_tham_dinh', item.status_validation::text,
            'tt_bao_cao', item.status_report::text,
            'tt_vmp', item.status_vmp::text,
            'ngay_de_cuong', item.actual_protocol_date,
            'ngay_tham_dinh', item.actual_validation_date,
            'ngay_bao_cao', item.actual_report_date,
            'ngay_vmp', item.actual_vmp_date,
            'state', coalesce(item.item_state, 'active')
          )
        ) order by item.validation_code)
        from activity_rows item
      ), '[]'::jsonb),
      'kpi', jsonb_build_object(
        'validation', jsonb_build_object(
          'done', count(*) filter (where canonical_status = 'done'),
          'over', count(*) filter (where canonical_status = 'over'),
          'todo', count(*) filter (where canonical_status is null or canonical_status not in ('done', 'over')),
          'total', count(*)
        ),
        'documentation', jsonb_build_object(
          'done', count(*) filter (where actual_report_date is not null or status_report = 'completed'),
          'over', count(*) filter (where actual_report_date is null and status_report <> 'completed' and deadline_report < v_as_of),
          'todo', count(*) filter (where not (actual_report_date is not null or status_report = 'completed')
                                     and not coalesce(deadline_report < v_as_of, false)),
          'total', count(*)
        ),
        'mismatch_count', count(*) filter (where nullif(trim(has_mismatch), '') is not null)
      )
    ) as body
    from visible_items
  )
  select body into v_result from payload;
  return v_result;
end
$function$;

comment on function public.rpc_get_vmp_dashboard_v2(integer,boolean)
  is 'Versioned fail-closed dashboard read model with canonical status as of Bangkok current date.';

revoke all on function public.vmp_canonical_item_status(public.vmp_plan_items,date) from public, anon, authenticated;
revoke all on function public.rpc_get_vmp_dashboard_v2(integer,boolean) from public, anon;
grant execute on function public.rpc_get_vmp_dashboard_v2(integer,boolean) to authenticated, service_role;

-- Bất biến web đòi: total = done + over + todo cho mọi nhóm KPI.
do $postflight$
declare
  v_admin uuid;
  v_kpi jsonb;
  v_nhom text;
begin
  select id into v_admin from public.profiles
  where public.vmp_business_role(id) = 'admin' and public.vmp_is_active_session(id) limit 1;
  if v_admin is null then
    raise notice 'Không có admin hoạt động để tự kiểm KPI — bỏ qua bước tự kiểm';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_kpi := public.rpc_get_vmp_dashboard_v2(extract(year from (now() at time zone 'Asia/Bangkok'))::int, false) -> 'kpi';
  foreach v_nhom in array array['validation', 'documentation'] loop
    if (v_kpi -> v_nhom ->> 'total')::int
       <> (v_kpi -> v_nhom ->> 'done')::int + (v_kpi -> v_nhom ->> 'over')::int + (v_kpi -> v_nhom ->> 'todo')::int then
      raise exception 'POSTCONDITION FAILED: KPI % lệch: %', v_nhom, v_kpi -> v_nhom;
    end if;
  end loop;
end
$postflight$;

commit;

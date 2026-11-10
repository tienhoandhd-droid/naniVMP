-- =====================================================================
-- Đợt B rà soát 10/11/2026 — Tiến độ / Tổng quan
--
-- Mỗi hàm dưới đây chép NGUYÊN VĂN định nghĩa đang chạy (pg_get_functiondef
-- trên bản sao production, trùng bản cuối trong repo) rồi chỉ chèn phần sửa
-- có ghi chú "B1/B3/B5 (10/11)". Giữ SECURITY DEFINER, search_path; CREATE
-- OR REPLACE giữ nguyên quyền GRANT. Không đổi bảng hay dữ liệu.
--
-- B1  rpc_get_vmp_dashboard: _raw thêm support_person_id và
--     support_person_ids (người hỗ trợ chính + QA hỗ trợ thêm theo đối tượng).
-- B3  rpc_team_overview_summary: hoàn thành = status_vmp completed HOẶC có
--     actual_vmp_date (định nghĩa chốt 07/11).
-- B5  compute_item_status_v2, rpc_due_alerts__five_role_impl_20260824 (phần
--     tính của rpc_due_alerts): CURRENT_DATE → ngày theo Asia/Bangkok.
-- Test: tests/sql/dashboard-nguoi-ho-tro.sql
-- =====================================================================

-- B1
CREATE OR REPLACE FUNCTION public.rpc_get_vmp_dashboard(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer, p_include_missing boolean DEFAULT false, p_include_cancelled boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(),'') not in ('','service_role')
     and not public.vmp_is_active_session(auth.uid()) then
    return public.vmp_session_denial();
  end if;

  with visible_source as materialized (
    select source_object.*,master_object.name master_name,
           master_object.classification master_classification,
           master_object.department master_department
    from public.vmp_source_objects source_object
    left join public.vmp_objects master_object
      on master_object.code=source_object.object_code
     and master_object.is_active
    where source_object.is_active
      and (auth.role()='service_role'
        or source_object.id in (select visible.id from public.vmp_visible_source_ids(auth.uid()) visible))
  ), visible_items as materialized (
    select item.*,source_object.master_name object_name,
           source_object.master_classification classification,
           source_object.master_department obj_dept,
           source_object.area_code area,source_object.line,
           source_object.frequency_months,
           -- B1 (10/11): id đối tượng nguồn để gộp QA hỗ trợ thêm.
           source_object.id source_object_id
    from public.vmp_plan_items item
    join visible_source source_object
      on source_object.object_code=item.object_code
    where item.year=p_year and item.is_active
      and (p_include_missing or not item.missing_from_sheet)
      and (p_include_cancelled
        or coalesce(item.item_state,'active')<>'cancelled')
  )
  select jsonb_build_object(
    'objects',coalesce((select jsonb_agg(jsonb_build_object(
      'code',source_object.object_code,
      'name',source_object.object_name,
      'cls',coalesce(source_object.master_classification,
                     public.vmp_ma_phan_loai(source_object.object_kind)),
      'cls_ten',source_object.object_kind,
      'dept',coalesce(source_object.master_department,
                      (public.vmp_parse_depts(source_object.department))[1],
                      'qa'),
      'dept_ten',source_object.department,
      'area',source_object.area_code,'line',source_object.line,
      'crit',case when source_object.criticality_score>=7 then 'Cao'
                  when source_object.criticality_score>=4 then 'TB'
                  when source_object.criticality_score is not null then 'Thấp'
                  else 'TB' end,
      'score',source_object.criticality_score,
      'owner',source_object.owner_name,
      'freq',source_object.frequency_months,
      'need',source_object.validate_flag='y'
    ) order by source_object.object_code) from visible_source source_object),
      '[]'::jsonb),
    'activities',coalesce((select jsonb_agg(jsonb_build_object(
      'id',item.validation_code,
      'validation_code',item.validation_code,
      'code',item.object_code,
      'name',item.object_name,
      'vtype',item.validation_type,
      'dept',item.obj_dept,
      'cls',coalesce(item.classification,public.vmp_ma_phan_loai(
        (select source.object_kind from visible_source source
         where source.object_code=item.object_code limit 1))),
      'depts',to_jsonb(coalesce(
        nullif(item.departments,array[]::text[]),
        nullif(public.vmp_parse_depts(item.department_text),array[]::text[]),
        array[coalesce(item.obj_dept,'qa')])),
      'exec_depts',to_jsonb(coalesce(
        item.execution_departments,
        public.vmp_parse_depts(nullif(trim(
          item.source_sheet_data->>'bo_phan_thuc_hien_goc'),'')),
        '{}'::text[])),
      'owner',coalesce(nullif(trim(item.owner_name),''),'—'),
      'support',nullif(trim(item.secondary_owner),''),
      'group',item.work_group,'effort',item.effort_days,
      'score',item.criticality_score,
      'crit',case when item.criticality_score>=7 then 'Cao'
                  when item.criticality_score>=4 then 'TB'
                  when item.criticality_score is not null then 'Thấp'
                  else 'TB' end,
      'target',item.deadline_vmp,'st',item.computed_status::text,
      'state',coalesce(item.item_state,'active'),'version',item.version,
      'dep',item.report_class,'docDone',item.is_doc_complete,
      'mismatch',item.has_mismatch,
      '_raw',jsonb_build_object(
        'version',item.version,'ma',item.object_code,
        'loai_td',item.validation_type,'qa',item.owner_name,
        'owner_person_id',item.owner_person_id,
        -- B1 (10/11): người hỗ trợ chính + QA hỗ trợ thêm của đối tượng,
        -- để màn Hôm nay/Tổng quan nhận ra hạng mục "của tôi".
        'support_person_id',item.support_person_id,
        'support_person_ids',coalesce((select jsonb_agg(person.id order by person.id)
          from (select item.support_person_id id
                 where item.support_person_id is not null
                union
                select extra.performer_id
                  from public.vmp_source_supporters extra
                 where extra.source_object_id=item.source_object_id) person),
          '[]'::jsonb),
        'email_qa',(select performer.email
          from public.vmp_performers performer
          where performer.id=item.owner_person_id and performer.is_active
            and performer.email is not null
            and performer.email not like '%.local'),
        'ho_tro',item.secondary_owner,'nhom_viec',item.work_group,
        'diem_trong_yeu',item.criticality_score,'bo_phan',item.obj_dept,
        'bo_phan_goc',item.department_text,
        'bo_phan_thuc_hien_goc',nullif(trim(
          item.source_sheet_data->>'bo_phan_thuc_hien_goc'),''),
        'phan_loai',item.classification,'khu_vuc',item.area,
        'line',item.line,'tan_suat',item.frequency_months,
        'dl_vmp',item.deadline_vmp,'dl_de_cuong',item.deadline_protocol,
        'dl_tham_dinh',item.deadline_validation,
        'dl_bao_cao',item.deadline_report,
        'tt_de_cuong',item.status_protocol::text,
        'tt_tham_dinh',item.status_validation::text,
        'tt_bao_cao',item.status_report::text,'tt_vmp',item.status_vmp::text,
        'tt_de_cuong_goc',item.status_protocol_text,
        'tt_tham_dinh_goc',item.status_validation_text,
        'tt_bao_cao_goc',item.status_report_text,
        'tt_vmp_goc',item.status_vmp_text,
        'ngay_de_cuong',item.actual_protocol_date,
        'ngay_tham_dinh',item.actual_validation_date,
        'ngay_bao_cao',item.actual_report_date,
        'ngay_vmp',item.actual_vmp_date,'lich_td',item.scheduled_date,
        'scheduled_at',item.scheduled_at,
        'state',coalesce(item.item_state,'active'))
    ) order by item.validation_code) from visible_items item),'[]'::jsonb),
    'source','supabase',
    'updated_at',greatest(
      coalesce((select max(updated_at) from visible_source),'epoch'::timestamptz),
      coalesce((select max(updated_at) from visible_items),'epoch'::timestamptz)),
    'authorization_revision',coalesce((select revision
      from public.vmp_authorization_revision where singleton),0),
    'year',p_year
  ) into v_result;
  return v_result;
end
$function$;

-- B3
CREATE OR REPLACE FUNCTION public.rpc_team_overview_summary(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text;
  v_total integer := 0;
  v_completed integer := 0;
  v_rate integer := 0;
  v_updated_at timestamptz;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    null; -- Explicit deployment-verification bypass; no user role is resolved.
  else
    if not public.vmp_is_active_session(auth.uid()) then
      return public.vmp_session_denial();
    end if;
    v_role := public.vmp_business_role(auth.uid());
    if not exists (
      select 1 from public.vmp_screen_permissions as permission
      where permission.business_role = v_role
        and permission.screen_id = 'overview'
        and permission.can_view is true
    ) then
      return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN',
        'error', 'Không có quyền xem Tổng quan');
    end if;
  end if;

  if p_year is null then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_YEAR',
      'error', 'Năm kế hoạch không hợp lệ');
  end if;

  -- 31/08: đếm qua vmp_visible_plan_items() thay vì quét thẳng bảng —
  -- vai data_scope hẹp (assigned/workshop) chỉ thấy tổng hợp CỦA PHẦN
  -- MÌNH ĐƯỢC XEM, không còn rò tổng toàn nhà máy. service_role (bypass
  -- xác minh deploy) không có actor nên đếm thẳng bảng như cũ.
  if coalesce(auth.role(), '') = 'service_role' then
    select count(*)::integer,
           -- B3 (10/11): hoàn thành = trạng thái completed HOẶC có ngày VMP thực tế.
           count(*) filter (where item.status_vmp = 'completed'
                              or item.actual_vmp_date is not null)::integer,
           max(item.updated_at)
      into v_total, v_completed, v_updated_at
    from public.vmp_plan_items as item
    where item.year = p_year
      and item.is_active is true
      and item.missing_from_sheet is not true
      and coalesce(item.item_state, 'active') = 'active';
  else
    select count(*)::integer,
           -- B3 (10/11): hoàn thành = trạng thái completed HOẶC có ngày VMP thực tế.
           count(*) filter (where item.status_vmp = 'completed'
                              or item.actual_vmp_date is not null)::integer,
           max(item.updated_at)
      into v_total, v_completed, v_updated_at
    from public.vmp_visible_plan_items() as item
    where item.year = p_year
      and item.is_active is true
      and item.missing_from_sheet is not true
      and coalesce(item.item_state, 'active') = 'active';
  end if;

  v_rate := case when v_total = 0 then 0
    else round(v_completed * 100.0 / v_total)::integer end;

  return jsonb_build_object(
    'ok', true, 'year', p_year, 'total', v_total,
    'completed', v_completed, 'rate', v_rate, 'updated_at', v_updated_at);
end
$function$;

-- B5
CREATE OR REPLACE FUNCTION public.compute_item_status_v2(item vmp_plan_items)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  -- B5 (10/11): hôm nay theo giờ VN, không theo múi giờ phiên (production UTC).
  v_today DATE := (now() at time zone 'Asia/Bangkok')::date;
  v_deadline DATE := item.deadline_vmp;
BEGIN
  IF item.status_vmp = 'completed' THEN
    RETURN 'done';
  END IF;
  IF v_deadline IS NOT NULL AND v_deadline < v_today THEN
    RETURN 'over';
  END IF;
  IF item.status_protocol IN ('in_progress','completed')
     OR item.status_validation IN ('in_progress','completed')
     OR item.status_report IN ('in_progress','completed') THEN
    RETURN 'prog';
  END IF;
  IF v_deadline IS NOT NULL AND v_deadline <= v_today + 30 THEN
    RETURN 'todo';
  END IF;
  RETURN 'plan';
END;
$function$;

-- B5 (rpc_due_alerts gọi hàm này để tính danh sách)
CREATE OR REPLACE FUNCTION public.rpc_due_alerts__five_role_impl_20260824(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer, p_soon_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- B5 (10/11): hôm nay theo giờ VN, không theo múi giờ phiên (production UTC).
  v_today DATE := (now() at time zone 'Asia/Bangkok')::date;
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x->>'due_date')
    FROM (
      SELECT jsonb_build_object(
        'validation_code', pi.validation_code,
        'object_code',     pi.object_code,
        'object_name',     o.name,
        'validation_type', pi.validation_type,
        'department',      o.department,
        'owner_name',      COALESCE(pi.owner_name, '—'),
        'stage',           st.stage,
        'due_date',        st.due_date,
        'days_left',       (st.due_date - v_today),
        'alert_type',      CASE WHEN st.due_date < v_today THEN 'overdue'
                                ELSE 'due_soon' END
      ) AS x
      FROM public.vmp_visible_plan_items() pi
      JOIN vmp_objects o ON o.code = pi.object_code
      CROSS JOIN LATERAL (
        SELECT s.stage, s.due_date
        FROM (
          VALUES
            ('Đề cương',  pi.deadline_protocol,  pi.status_protocol),
            ('Thẩm định', pi.deadline_validation, pi.status_validation),
            ('Báo cáo',   pi.deadline_report,    pi.status_report),
            ('VMP',       pi.deadline_vmp,       pi.status_vmp)
        ) AS s(stage, due_date, st)
        WHERE s.due_date IS NOT NULL
          AND s.st <> 'completed'
        ORDER BY s.due_date ASC
        LIMIT 1
      ) st
      WHERE pi.is_active = TRUE
        AND COALESCE(pi.missing_from_sheet, FALSE) = FALSE
        AND o.is_active = TRUE
        AND pi.status_vmp <> 'completed'
        -- S1-F FIX: không gửi cảnh báo cho mã Không áp dụng / Đã hủy
        AND COALESCE(pi.item_state, 'active') = 'active'
        -- S2-H FIX: chấp nhận hạng mục năm hiện tại HOẶC deadline cross-year
        AND (pi.year = p_year OR st.due_date BETWEEN v_today - 30 AND v_today + p_soon_days + 30)
        AND st.due_date <= v_today + p_soon_days
    ) q
  ), '[]'::jsonb);
END;
$function$;

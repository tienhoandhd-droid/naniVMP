-- =====================================================================
-- 20260707120000_dashboard_raw_status_text.sql
-- Bổ sung CHỮ GỐC tiếng Việt của 4 cột trạng thái vào rpc_get_vmp_dashboard.
-- ---------------------------------------------------------------------
-- Bối cảnh: vmp_plan_items lưu trạng thái dạng enum (not_started/in_progress/
-- completed/overdue) → mất nhãn gốc ("Chưa tiến hành", "Bổ sung đề cương",
-- "Tạm ngưng"...). Chữ gốc vẫn còn trong vmp_sheet_rows.values_json (mảng
-- 0-index) của lần sync completed mới nhất. Ta join lại theo validation_code
-- và thêm 4 field *_goc vào _raw để dashboard hiển thị đúng chữ.
--   index 23 = Trạng thái đề cương
--   index 28 = Trạng thái thẩm định thực tế
--   index 32 = Trạng thái báo cáo
--   index 35 = Trạng thái VMP
-- Chỉ ĐỌC thêm; không đổi field cũ nên tương thích ngược hoàn toàn.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_get_vmp_dashboard(
  p_year integer DEFAULT (EXTRACT(year FROM now()))::integer,
  p_include_missing boolean DEFAULT false,
  p_include_cancelled boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
AS $function$
DECLARE
  result JSONB;
BEGIN
  WITH latest_run AS (
    SELECT id
    FROM vmp_sheet_sync_runs
    WHERE status = 'completed'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  raw_status AS (
    -- Chữ gốc theo validation_code; nếu ID trùng lấy dòng Sheet cuối cùng.
    SELECT DISTINCT ON (r.validation_code)
      r.validation_code,
      NULLIF(TRIM(r.values_json->>23), '') AS tt_de_cuong_goc,
      NULLIF(TRIM(r.values_json->>28), '') AS tt_tham_dinh_goc,
      NULLIF(TRIM(r.values_json->>32), '') AS tt_bao_cao_goc,
      NULLIF(TRIM(r.values_json->>35), '') AS tt_vmp_goc
    FROM vmp_sheet_rows r
    JOIN latest_run lr ON r.sync_run_id = lr.id
    WHERE r.validation_code IS NOT NULL
    ORDER BY r.validation_code, r.sheet_row_number DESC
  ),
  visible_items AS (
    SELECT pi.*, o.name AS object_name, o.classification, o.department AS obj_dept,
           o.area, o.line, o.criticality AS obj_criticality, o.frequency_months,
           d.short_name AS dept_short
    FROM vmp_plan_items pi
    JOIN vmp_objects o ON pi.object_code = o.code
    LEFT JOIN departments d ON o.department = d.id
    WHERE pi.year = p_year
      AND pi.is_active = TRUE
      AND o.is_active = TRUE
      AND (p_include_missing OR pi.missing_from_sheet = FALSE)
      AND (p_include_cancelled OR COALESCE(pi.item_state, 'active') <> 'cancelled')
  )
  SELECT jsonb_build_object(
    'objects', (
      SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
        'code', o.code, 'name', o.name, 'cls', o.classification,
        'dept', o.department, 'area', o.area, 'line', o.line,
        'crit', CASE o.criticality WHEN 'high' THEN 'Cao' WHEN 'medium' THEN 'TB' ELSE 'Thấp' END,
        'freq', o.frequency_months, 'need', TRUE
      )), '[]'::jsonb)
      FROM vmp_objects o WHERE o.is_active = TRUE
    ),
    'activities', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', i.validation_code,
        'validation_code', i.validation_code,
        'code', i.object_code,
        'name', i.object_name,
        'vtype', i.validation_type,
        'dept', i.obj_dept,
        'owner', COALESCE(i.owner_name, '—'),
        'effort', i.effort_days,
        'score', i.criticality_score,
        'crit', CASE i.obj_criticality WHEN 'high' THEN 'Cao' WHEN 'medium' THEN 'TB' ELSE 'Thấp' END,
        'target', i.deadline_vmp,
        'st', i.computed_status::TEXT,
        'state', COALESCE(i.item_state, 'active'),
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
          'phan_loai', i.classification,
          'khu_vuc', i.area,
          'line', i.line,
          'tan_suat', i.frequency_months,
          'dl_vmp', i.deadline_vmp,
          'dl_de_cuong', i.deadline_protocol,
          'dl_bao_cao', i.deadline_report,
          'tt_de_cuong', i.status_protocol::TEXT,
          'tt_tham_dinh', i.status_validation::TEXT,
          'tt_bao_cao', i.status_report::TEXT,
          'tt_vmp', i.status_vmp::TEXT,
          -- MỚI: chữ gốc tiếng Việt từ Google Sheet (để Tổng quan hiển thị đúng chữ)
          'tt_de_cuong_goc', rs.tt_de_cuong_goc,
          'tt_tham_dinh_goc', rs.tt_tham_dinh_goc,
          'tt_bao_cao_goc', rs.tt_bao_cao_goc,
          'tt_vmp_goc', rs.tt_vmp_goc,
          'ngay_de_cuong', i.actual_protocol_date,
          'ngay_tham_dinh', i.actual_validation_date,
          'ngay_bao_cao', i.actual_report_date,
          'ngay_vmp', i.actual_vmp_date,
          'lich_td', i.scheduled_date,
          'state', COALESCE(i.item_state, 'active')
        )
      )), '[]'::jsonb)
      FROM visible_items i
      LEFT JOIN raw_status rs ON rs.validation_code = i.validation_code
    ),
    'source', 'supabase',
    'updated_at', NOW(),
    'year', p_year
  ) INTO result;

  RETURN result;
END;
$function$;

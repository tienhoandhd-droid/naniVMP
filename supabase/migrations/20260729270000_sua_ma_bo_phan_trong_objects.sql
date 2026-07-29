-- =====================================================================
-- SỬA MÃ BỘ PHẬN TRONG DANH SÁCH ĐỐI TƯỢNG — lỗi do chính đợt đổi nguồn
--
-- Migration 20260729180000 chuyển 'objects' của dashboard từ vmp_objects
-- sang vmp_source_objects để 47 đối tượng mới cũng hiện ra. Nhưng hai
-- bảng ghi bộ phận theo HAI KIỂU KHÁC NHAU:
--
--   vmp_objects.department        →  'xsx' · 'qc' · 'cd' · 'qa' · 'kho'
--   vmp_source_objects.department →  'Xưởng sản xuất' · 'QC' · 'Cơ điện' …
--
-- Frontend lọc bằng DEPTS trong constants/vmp.ts, mà id ở đó là mã ngắn.
-- Sau khi đổi nguồn, phép so a.dept === 'xsx' không bao giờ đúng nữa →
-- MỌI bộ lọc bộ phận trả về rỗng: màn Cảnh báo, phạm vi của Báo cáo &
-- AI, và thanh lọc chung.
--
-- Sửa: vẫn lấy danh sách từ vmp_source_objects (giữ được 47 đối tượng
-- mới), nhưng cột dept ưu tiên mã ngắn của vmp_objects; đối tượng chưa
-- có trong vmp_objects thì suy ra bằng vmp_parse_depts — cùng hàm mà
-- phần activities đang dùng, nên hai chỗ không thể lệch nhau.
--
-- Bài học: đổi NGUỒN mà không đối chiếu ĐỊNH DẠNG thì kiểu dữ liệu vẫn
-- hợp lệ, TypeScript vẫn qua, build vẫn chạy — chỉ có bộ lọc âm thầm trả
-- về rỗng.
-- =====================================================================

create or replace function public.rpc_get_vmp_dashboard(
  p_year integer default (extract(year from now()))::integer,
  p_include_missing boolean default false,
  p_include_cancelled boolean default false
) returns jsonb
language plpgsql stable security definer
as $fn$
declare
  result jsonb;
begin
  with visible_items as (
    select pi.*, o.name as object_name, o.classification, o.department as obj_dept,
           o.area, o.line, o.frequency_months
    from public.vmp_plan_items pi
    join public.vmp_objects o on pi.object_code = o.code
    where pi.year = p_year
      and pi.is_active = true
      and o.is_active = true
      and (p_include_missing or pi.missing_from_sheet = false)
      and (p_include_cancelled or coalesce(pi.item_state, 'active') <> 'cancelled')
  )
  select jsonb_build_object(
    'objects', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', s.object_code, 'name', s.object_name, 'cls', s.object_kind,
        -- Mã ngắn, KHÔNG phải tên dài — frontend lọc theo mã.
        'dept', coalesce(o.department,
                         (public.vmp_parse_depts(s.department))[1], 'qa'),
        'dept_ten', s.department,
        'area', s.area_code, 'line', s.line,
        'crit', case when s.criticality_score >= 7 then 'Cao'
                     when s.criticality_score >= 4 then 'TB'
                     when s.criticality_score is not null then 'Thấp'
                     else 'TB' end,
        'score', s.criticality_score,
        'owner', s.owner_name,
        'freq', s.frequency_months,
        'need', s.validate_flag = 'y'
      ) order by s.object_code), '[]'::jsonb)
      from public.vmp_source_objects s
      left join public.vmp_objects o
        on o.code = s.object_code and o.is_active
      where s.is_active
    ),
    'activities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.validation_code,
        'validation_code', i.validation_code,
        'code', i.object_code,
        'name', i.object_name,
        'vtype', i.validation_type,
        'dept', i.obj_dept,
        'depts', to_jsonb(coalesce(
          nullif(i.departments, array[]::text[]),
          nullif(public.vmp_parse_depts(i.department_text), array[]::text[]),
          array[coalesce(i.obj_dept, 'qa')]
        )),
        'exec_depts', to_jsonb(coalesce(
          i.execution_departments,
          public.vmp_parse_depts(nullif(trim(i.source_sheet_data ->> 'bo_phan_thuc_hien_goc'), '')),
          '{}'::text[]
        )),
        'owner', coalesce(nullif(trim(i.owner_name), ''), '—'),
        'support', nullif(trim(i.secondary_owner), ''),
        'group', i.work_group,
        'effort', i.effort_days,
        'score', i.criticality_score,
        'crit', case when i.criticality_score >= 7 then 'Cao'
                     when i.criticality_score >= 4 then 'TB'
                     when i.criticality_score is not null then 'Thấp'
                     else 'TB' end,
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
          'ho_tro', i.secondary_owner,
          'nhom_viec', i.work_group,
          'diem_trong_yeu', i.criticality_score,
          'bo_phan', i.obj_dept,
          'bo_phan_goc', i.department_text,
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
          'tt_de_cuong_goc', i.status_protocol_text,
          'tt_tham_dinh_goc', i.status_validation_text,
          'tt_bao_cao_goc', i.status_report_text,
          'tt_vmp_goc', i.status_vmp_text,
          'ngay_de_cuong', i.actual_protocol_date,
          'ngay_tham_dinh', i.actual_validation_date,
          'ngay_bao_cao', i.actual_report_date,
          'ngay_vmp', i.actual_vmp_date,
          'lich_td', i.scheduled_date,
          'state', coalesce(i.item_state, 'active')
        )
      )), '[]'::jsonb)
      from visible_items i
    ),
    'source', 'supabase',
    'updated_at', now(),
    'year', p_year
  ) into result;

  return result;
end;
$fn$;

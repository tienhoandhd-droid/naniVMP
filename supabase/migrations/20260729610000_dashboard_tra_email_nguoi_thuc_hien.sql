-- =====================================================================
-- Dashboard trả lại email của người thực hiện
--
-- Trang "Sức khoẻ dữ liệu" đang báo 281 lỗi «QA "X" chưa có email» —
-- đúng bằng số hạng mục CÓ người phụ trách. Không phải 281 người thiếu
-- email: luật kiểm tra trong helpers.ts đọc `_raw.email_qa`, mà RPC
-- dashboard không trả trường đó nữa (nó vốn đến từ cột "Email (QA nhập)"
-- của Google Sheet, bỏ khi chuyển nguồn về Supabase). Trường thiếu →
-- luật hiểu là "không có email" → gắn cờ cho mọi hạng mục.
--
-- Hộp chi tiết ở Timeline cũng đang lặng lẽ giấu dòng email vì cùng lý do.
--
-- Nay lấy email từ tab "Người thực hiện" (khớp theo tên, không phân biệt
-- hoa thường), không có thì lùi về danh bạ nhân sự. Bỏ qua địa chỉ
-- '@...local' — đó là chỗ giữ tạm, hiện ra thì trông như đã có email.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_get_vmp_dashboard(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer, p_include_missing boolean DEFAULT false, p_include_cancelled boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $fn$
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
        'code', s.object_code, 'name', s.object_name,
        -- Mã ngắn, KHÔNG phải tên dài — frontend tra bảng CLS bằng mã.
        'cls', coalesce(o.classification, public.vmp_ma_phan_loai(s.object_kind)),
        'cls_ten', s.object_kind,
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
        -- Mang thẳng phân loại theo hạng mục, KHÔNG để frontend phải tra
        -- ngược qua bảng objects. Một chỗ nối ít đi là một kiểu hỏng ít đi:
        -- trước đây objects hỏng định dạng thì mọi bộ lọc chết theo mà
        -- không có dấu hiệu gì.
        'cls', coalesce(i.classification,
                        public.vmp_ma_phan_loai(
                          (select s.object_kind from public.vmp_source_objects s
                           where s.object_code = i.object_code limit 1))),
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
          -- Email của người thực hiện: lấy từ tab "Người thực hiện", không có
          -- thì lùi về danh bạ nhân sự. Bỏ qua địa chỉ '.local' vì đó là chỗ
          -- giữ tạm lúc dựng bảng phân công, không gửi được thư thật.
          'email_qa', coalesce(
            (select pf.email from public.vmp_performers pf
              where pf.is_active and pf.email is not null and pf.email not like '%.local'
                and lower(btrim(pf.performer_name)) = lower(btrim(i.owner_name)) limit 1),
            (select se.email from public.vmp_staff_emails se
              where se.email is not null and se.email not like '%.local'
                and lower(btrim(se.staff_name)) = lower(btrim(i.owner_name)) limit 1)),
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
          'dl_tham_dinh', i.deadline_validation,
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
$fn$

;

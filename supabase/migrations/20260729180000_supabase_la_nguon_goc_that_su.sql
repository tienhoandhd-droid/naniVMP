-- =====================================================================
-- SUPABASE THÀNH NGUỒN GỐC THẬT SỰ — cắt phụ thuộc Google Sheet trong
-- RPC dashboard.
--
-- ---------------------------------------------------------------------
-- Vấn đề tìm ra khi rà lại web
--
-- Người dùng báo: "nhiều mục chưa cập nhật khi tôi đã đẩy dữ liệu lên
-- supabase làm gốc". Rà ra ba tầng nguyên nhân, tầng nào cũng thật:
--
-- 1) rpc_get_vmp_dashboard vẫn JOIN vmp_sheet_rows của lần đồng bộ gần
--    nhất để lấy bo_phan_goc và 4 cột trạng thái chữ tiếng Việt
--    (tt_de_cuong_goc, tt_tham_dinh_goc, tt_bao_cao_goc, tt_vmp_goc).
--
-- 2) Web ƯU TIÊN chữ *_goc đó, chỉ khi rỗng mới lùi về enum
--    (CompletionDashboard.tsx: `let value = clean(raw[field])`).
--    Nghĩa là: sửa tiến độ trên web ghi vào status_vmp, nhưng biểu đồ
--    vẫn vẽ theo chữ ĐÓNG BĂNG của lần sync Sheet cuối. Đúng triệu chứng
--    "đã sửa mà không thấy đổi".
--
-- 3) Chữ tiếng Việt đó GIÀU HƠN enum 4 giá trị — có "Bổ sung đề cương",
--    "Chờ thẩm định thực tế", "Đang tiến hành báo cáo", "Tạm ngưng",
--    "Lỗi quy trình: Làm báo cáo trước"… Bỏ đi là mất thông tin thật.
--
-- ---------------------------------------------------------------------
-- Cách sửa
--
-- Đưa hẳn chữ trạng thái vào vmp_plan_items thành cột riêng, nạp một lần
-- từ ảnh chụp Sheet cuối cùng, rồi web ghi thẳng vào đó. RPC đọc từ
-- plan_items, không đụng vmp_sheet_rows nữa. Giữ nguyên tên trường
-- *_goc trả về cho web nên frontend không phải sửa, nhưng ý nghĩa đổi
-- từ "chữ đóng băng của Sheet" thành "chữ đang hiệu lực trong DB".
--
-- Đồng thời kéo owner_name / criticality_score / work_group từ
-- vmp_source_objects (nơi QA chấm điểm và phân công) sang plan_items,
-- và cho `crit` suy ra từ điểm trọng yếu 1..9 thay vì cột criticality
-- cũ của vmp_objects — cột đó có 202/217 là 'high' nên vô dụng, khiến
-- màn QRM gần như chỉ có một nhóm.
-- =====================================================================

-- 1. Cột chữ trạng thái đang hiệu lực -------------------------------
alter table public.vmp_plan_items
  add column if not exists status_protocol_text   text,
  add column if not exists status_validation_text text,
  add column if not exists status_report_text     text,
  add column if not exists status_vmp_text        text,
  add column if not exists department_text        text,
  add column if not exists work_group             text;

comment on column public.vmp_plan_items.status_vmp_text is
  'Chữ trạng thái tiếng Việt đang hiệu lực. Giàu hơn enum phase_status '
  '(có "Bổ sung đề cương", "Tạm ngưng", "Chờ báo cáo"…). Web ghi thẳng '
  'vào đây; KHÔNG còn đọc từ ảnh chụp Google Sheet.';

-- 2. Nạp một lần từ ảnh chụp Sheet cuối cùng --------------------------
-- Sau bước này vmp_sheet_rows chỉ còn là lưu trữ lịch sử, không nằm trên
-- đường đọc của web nữa.
with latest_run as (
  select id from public.vmp_sheet_sync_runs
  where status = 'completed' order by created_at desc limit 1
),
snapshot as (
  select distinct on (r.validation_code)
    r.validation_code,
    nullif(trim(r.values_json->>5),  '') as bo_phan,
    nullif(trim(r.values_json->>23), '') as tt_de_cuong,
    nullif(trim(r.values_json->>28), '') as tt_tham_dinh,
    nullif(trim(r.values_json->>32), '') as tt_bao_cao,
    nullif(trim(r.values_json->>35), '') as tt_vmp
  from public.vmp_sheet_rows r
  join latest_run lr on r.sync_run_id = lr.id
  where r.validation_code is not null
  order by r.validation_code, r.sheet_row_number desc
)
update public.vmp_plan_items p set
  status_protocol_text   = coalesce(p.status_protocol_text,   s.tt_de_cuong),
  status_validation_text = coalesce(p.status_validation_text, s.tt_tham_dinh),
  status_report_text     = coalesce(p.status_report_text,     s.tt_bao_cao),
  status_vmp_text        = coalesce(p.status_vmp_text,        s.tt_vmp),
  department_text        = coalesce(p.department_text,        s.bo_phan)
from snapshot s
where s.validation_code = p.validation_code;

-- 3. Kéo phân công và điểm trọng yếu từ danh mục nguồn ----------------
-- vmp_source_objects là nơi QA chấm điểm và phân công người phụ trách.
-- Trước đây hai thứ đó không bao giờ tới được dashboard.
-- Bảng phân công QA trong vmp_source_objects là bản QA chốt, nên nó THẮNG
-- giá trị cũ đọc từ Sheet. Cột owner_name cũ của Sheet chỉ có 5 dòng và
-- toàn viết tắt ("My", "My2", "my") — giữ lại thì bảng phân công có 3 tên
-- khác nhau cho cùng một người.
update public.vmp_plan_items p set
  criticality_score = coalesce(s.criticality_score, p.criticality_score),
  owner_name        = coalesce(s.owner_name, nullif(trim(p.owner_name), '')),
  secondary_owner   = coalesce(s.support_name, nullif(trim(p.secondary_owner), '')),
  work_group        = coalesce(s.work_group, p.work_group)
from public.vmp_source_objects s
where s.object_code = p.object_code;

-- 4. RPC dashboard — không còn đụng vmp_sheet_rows --------------------
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
    -- Danh sách đối tượng lấy từ vmp_source_objects (264 dòng, nơi QA
    -- nhập trên web) chứ không phải vmp_objects (217 dòng, bản cũ sinh
    -- ra từ Sheet) — nếu không thì 47 đối tượng mới không bao giờ hiện.
    'objects', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', s.object_code, 'name', s.object_name, 'cls', s.object_kind,
        'dept', s.department, 'area', s.area_code, 'line', s.line,
        'crit', case when s.criticality_score >= 7 then 'Cao'
                     when s.criticality_score >= 4 then 'TB'
                     when s.criticality_score is not null then 'Thấp'
                     else 'TB' end,
        'score', s.criticality_score,
        'owner', s.owner_name,
        'freq', s.frequency_months, 'need', s.validate_flag = 'y'
      ) order by s.object_code), '[]'::jsonb)
      from public.vmp_source_objects s where s.is_active = true
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
        -- Mức tới hạn suy từ điểm trọng yếu 1..9 — trục duy nhất có sức
        -- phân biệt thật. Cột criticality cũ có 202/217 là 'high'.
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
          -- Chữ trạng thái ĐANG HIỆU LỰC trong DB, không phải ảnh chụp Sheet
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

comment on function public.rpc_get_vmp_dashboard(integer, boolean, boolean) is
  'Dữ liệu dashboard. Từ 2026-07-29 KHÔNG còn đọc vmp_sheet_rows — chữ '
  'trạng thái lấy từ cột *_text của vmp_plan_items, điểm trọng yếu và '
  'người phụ trách lấy từ vmp_plan_items (đã đồng bộ từ vmp_source_objects).';

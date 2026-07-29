-- =====================================================================
-- CỨU 8 DÒNG SHEET BỊ MẤT TRƯỚC KHI NGỪNG ĐỌC SHEET
--
-- Người dùng yêu cầu: "nếu bạn đã lấy đủ dữ liệu từ sheet => ngừng thu
-- dữ liệu từ sheet". Rà lại thì CHƯA đủ — đối chiếu từng tab giữa bản
-- thô (vmp_source_rows) và bảng danh mục (vmp_source_objects) còn 8 dòng
-- không vào được, trong đó 5 dòng có "Thẩm định = Y".
--
-- ---------------------------------------------------------------------
-- Hai nguyên nhân
--
-- 1) TRÙNG MÃ — bản nhập khoá theo mã nên dòng sau ĐÈ dòng trước, dòng
--    trước biến mất không báo gì:
--      · CMTB1106 dùng 2 lần: dòng 74 "May Đóng Bột (Finelus)" bị dòng
--        80 "Máy chiêt rót thể tích trên 100ml" đè.  Thẩm định = Y.
--      · S9.01    dùng 2 lần: dòng 16 "Kho lưu mẫu lão hóa RD" bị dòng
--        17 "Kho lưu mẫu nghiên cứu RD" đè.           Thẩm định = Y.
--
-- 2) KHÔNG CÓ MÃ — không khoá được nên bị bỏ qua:
--      · dòng 11  Tủ sấy dụng cụ 2 cửa  (C2)   Thẩm định = Y
--      · dòng 143 Tủ mát SANAKY         (B1)   Thẩm định = Y
--      · dòng 144 Máy đo quang          (B1)   Thẩm định = Y
--      · dòng 140 Kính hiển vi          (B1)   Thẩm định = N
--      · dòng 141 Tank CIP 150 lít      (B1)   Thẩm định = N, ngưng hoạt động
--      · dòng 142 Tủ ấm memmert         (B1)   Thẩm định = N
--
-- 5 dòng quy trình (22–26) KHÔNG cứu: chúng chỉ có tên và "Loại quy
-- trình", mọi cột khác rỗng, và cả 5 tên đã có sẵn bản đầy đủ với mã
-- TDSX. Đó là dòng nháp trùng, không phải dữ liệu mất.
--
-- ---------------------------------------------------------------------
-- Cách cứu
--
-- Nhập vào với mã TẠM dạng TAM-<tab><dòng> — nhìn là biết chưa phải mã
-- thật, không lẫn với mã đang dùng. Đặt validate_flag = 'n' dù bản gốc
-- ghi 'Y', vì mã tạm mà bật thẩm định thì mã tạm sẽ chui vào
-- validation_code của timeline và ở lại đó vĩnh viễn. Ghi rõ trong note
-- rằng bản gốc yêu cầu thẩm định, và cảnh báo trên web để QA gán mã thật
-- rồi tự bật lại.
--
-- Không tự đặt mã thật: quy tắc đánh mã thiết bị là việc của QA, đoán
-- sai thì sai vĩnh viễn trong hồ sơ GMP.
-- =====================================================================

insert into public.vmp_source_objects (
  object_kind, object_code, object_name, department, area_code, line,
  status, show_flag, validate_flag, validate_reason,
  frequency_months, report_class, workdays, first_month, year_ref,
  source_tab, source_row, extra, note, criticality_source
)
select
  case r.source_tab when '3. DS kho' then 'Kho' else 'Thiết bị' end,
  'TAM-' || case r.source_tab when '3. DS kho' then 'KHO' else 'TB' end
          || lpad(r.row_number::text, 3, '0'),
  coalesce(nullif(trim(r.payload->>'Tên thiết bị'), ''),
           nullif(trim(r.payload->>'Tên Kho'), ''), '(chưa có tên)'),
  nullif(trim(r.payload->>'Bộ phận quản lý'), ''),
  nullif(trim(r.payload->>'Mã khu vực'), ''),
  nullif(trim(r.payload->>'Line'), ''),
  nullif(trim(r.payload->>'Tình trạng'), ''),
  lower(nullif(trim(r.payload->>'Show'), '')),
  'n',                                    -- xem chú thích ở đầu file
  nullif(trim(r.payload->>'Lý do thẩm định'), ''),
  nullif(trim(r.payload->>'Tần suất thẩm định (tháng)'), '')::numeric::integer,
  nullif(trim(r.payload->>'Phân loại báo cáo'), ''),
  nullif(trim(r.payload->>'Số ngày công thẩm định thực tế'), '')::numeric::integer,
  nullif(trim(r.payload->>'Tháng thẩm định đầu tiên trong năm'), '')::numeric::integer,
  nullif(trim(r.payload->>'Năm nhập'), '')::numeric::integer,
  r.source_tab, r.row_number,
  r.payload || jsonb_build_object('_cuu_ho', 'dòng Sheet không vào được bản nhập'),
  'MÃ TẠM — cần QA gán mã thật. Nguồn: ' || r.source_tab || ' dòng ' || r.row_number
    || case when lower(coalesce(trim(r.payload->>'Thẩm định'), '')) = 'y'
            then '. Bản gốc ghi Thẩm định = Y, hãy bật lại sau khi gán mã thật.'
            else '. Bản gốc ghi Thẩm định = N.' end
    || case when coalesce(nullif(trim(r.payload->>'Mã thiết bị'), ''),
                          nullif(trim(r.payload->>'Mã kho'), '')) is null
            then ' Lý do: dòng không có mã.'
            else ' Lý do: mã ' || coalesce(trim(r.payload->>'Mã thiết bị'),
                                           trim(r.payload->>'Mã kho'))
                 || ' bị dòng sau dùng lại nên bị đè.' end,
  'auto'
from public.vmp_source_rows r
where (r.source_tab = '1.DS thiết bị-All' and r.row_number in (11, 74, 140, 141, 142, 143, 144))
   or (r.source_tab = '3. DS kho'         and r.row_number = 16)
on conflict do nothing;

-- Chấm điểm trọng yếu cho các dòng vừa cứu -----------------------------
update public.vmp_source_objects s set
  complexity_score     = public.vmp_score_complexity(s.object_kind, s.object_name, s.report_class),
  quality_impact_score = public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department),
  criticality_score    = public.vmp_score_complexity(s.object_kind, s.object_name, s.report_class)
                       * public.vmp_score_quality_impact(s.object_kind, s.object_name, s.department)
where s.object_code like 'TAM-%' and s.criticality_source = 'auto';

-- Cảnh báo trên web: mã tạm chờ QA gán mã thật -------------------------
-- Thêm khoá 'ma_tam' vào rpc_source_warnings để nó hiện cùng chỗ với các
-- cảnh báo khác ở màn "Danh mục & Nhập liệu", thay vì nằm im trong cột
-- note không ai đọc. Giữ nguyên toàn bộ các cảnh báo đã có.
CREATE OR REPLACE FUNCTION public.rpc_source_warnings(p_year integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_year integer := coalesce(p_year, extract(year from now())::integer);
begin
  return jsonb_build_object(
    'nam', v_year,

    -- Chắc chắn sai: không có tháng đầu tiên thì mọi mốc thời gian đều hỏng
    'thieu_thang_dau', coalesce((
      select jsonb_agg(jsonb_build_object(
               'object_kind', object_kind, 'object_code', object_code,
               'object_name', object_name) order by object_code)
      from public.vmp_source_objects
      where validate_flag = 'y' and is_active and first_month is null), '[]'::jsonb),

    -- Cần người xem: thiết bị/hệ thống có năm nhập KHÔNG PHẢI năm nay và
    -- chưa từng có IQ. Có thể là thiết bị cũ (bình thường), cũng có thể là
    -- năm nhập đó đã bị bỏ lỡ không sinh timeline.
    'chua_tung_iq', coalesce((
      select jsonb_agg(jsonb_build_object(
               'object_kind', s.object_kind, 'object_code', s.object_code,
               'object_name', s.object_name, 'nam_nhap', s.year_ref) order by s.object_code)
      from public.vmp_source_objects s
      where s.validate_flag = 'y' and s.is_active
        and s.object_kind in ('Thiết bị','Hệ thống phụ trợ')
        and s.year_ref is not null
        and s.year_ref <> v_year
        and not exists (select 1 from public.vmp_plan_items p
                         where p.object_code = s.object_code and p.validation_type = 'IQ')
    ), '[]'::jsonb),

    -- Cần người xem: có thẩm định nhưng cờ hiển thị tắt
    'show_tat', coalesce((
      select jsonb_agg(jsonb_build_object(
               'object_kind', object_kind, 'object_code', object_code,
               'object_name', object_name, 'show_flag', show_flag) order by object_code)
      from public.vmp_source_objects
      where validate_flag = 'y' and is_active
        and show_flag is not null and lower(show_flag) <> 'y'), '[]'::jsonb),

    -- Cần người xem: có thẩm định nhưng tình trạng chưa hoạt động
    'chua_hoat_dong', coalesce((
      select jsonb_agg(jsonb_build_object(
               'object_kind', object_kind, 'object_code', object_code,
               'object_name', object_name, 'tinh_trang', status) order by object_code)
      from public.vmp_source_objects
      where validate_flag = 'y' and is_active
        and status is not null and lower(status) like '%chưa%'), '[]'::jsonb),

    -- Chắc chắn cần xử lý: dòng Sheet không vào được bản nhập (trùng mã
    -- hoặc không có mã) đã được cứu vào với mã TẠM. Phải gán mã thật rồi
    -- bật lại Thẩm định — để nguyên thì chúng không bao giờ có timeline.
    'ma_tam', coalesce((
      select jsonb_agg(jsonb_build_object(
               'object_kind', object_kind, 'object_code', object_code,
               'object_name', object_name, 'note', note) order by object_code)
      from public.vmp_source_objects
      where is_active and object_code like 'TAM-%'), '[]'::jsonb)
  );
end;
$function$

;

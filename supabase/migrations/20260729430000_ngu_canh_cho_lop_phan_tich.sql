-- =====================================================================
-- NGỮ CẢNH CHO LỚP AI PHÂN TÍCH CÂU HỎI
--
-- Người dùng muốn: một lớp AI ĐỌC và PHÂN TÍCH câu hỏi trước, rồi mới
-- tới lớp AI thứ hai trả lời.
--
-- Tôi giữ lớp SQL đứng TRƯỚC cả hai — câu nào SQL hiểu được thì vẫn trả
-- lời trong ~20ms và không tốn hạn mức. Lớp AI phân tích chỉ chạy cho
-- những câu SQL bó tay, tức đúng chỗ nó có giá trị.
--
-- Lớp phân tích cần ba thứ để làm việc, gom vào một lần gọi:
--   · lịch sử hội thoại gần đây      → hiểu "cái đó", "còn cái kia"
--   · danh sách thực thể có thật     → biết tên nào là người, mã nào có
--   · bản phân tích SQL đã làm được  → không phải bắt đầu từ số không
--
-- Danh sách thực thể chỉ đưa TÊN NGƯỜI, NHÓM VIỆC, KHU VỰC, LOẠI THẨM
-- ĐỊNH — không đưa 217 tên thiết bị, vì như thế là nhồi cả danh mục vào
-- lời nhắc, vừa tốn token vừa làm loãng.
-- =====================================================================

create or replace function public.rpc_ai_ngu_canh_phan_tich(
  p_question text, p_phien text default null
) returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select jsonb_build_object(
    'cau_hoi', p_question,
    'lich_su', coalesce((
      select jsonb_agg(jsonb_build_object('hoi', cau_hoi, 'y_dinh', y_dinh)
                       order by tao_luc)
      from (select cau_hoi, y_dinh, tao_luc from public.vmp_ai_hoi_thoai
            where phien = p_phien and tao_luc > now() - interval '30 minutes'
            order by tao_luc desc limit 4) t), '[]'::jsonb),
    'phan_tich_so_bo', public.rpc_ai_hieu_cau_hoi(p_question),
    'trong_diem_so_bo', public.rpc_ai_trong_diem(public.rpc_ai_hieu_cau_hoi(p_question)),
    'thuc_the_co_that', jsonb_build_object(
      'nguoi',   (select coalesce(jsonb_agg(distinct gia_tri), '[]'::jsonb)
                  from public.vmp_ai_tu_dien where loai = 'nguoi'),
      'nhom_viec',(select coalesce(jsonb_agg(distinct gia_tri), '[]'::jsonb)
                  from public.vmp_ai_tu_dien where loai = 'nhom_viec'),
      'khu_vuc', (select coalesce(jsonb_agg(distinct gia_tri), '[]'::jsonb)
                  from public.vmp_ai_tu_dien where loai = 'khu_vuc'),
      'loai_td', (select coalesce(jsonb_agg(distinct gia_tri), '[]'::jsonb)
                  from public.vmp_ai_tu_dien where loai = 'loai_td'),
      'bo_phan', (select coalesce(jsonb_agg(distinct gia_tri), '[]'::jsonb)
                  from public.vmp_ai_tu_dien where loai = 'bo_phan')));
$fn$;

revoke execute on function public.rpc_ai_ngu_canh_phan_tich(text, text) from anon, public;
grant  execute on function public.rpc_ai_ngu_canh_phan_tich(text, text)
  to authenticated, service_role;

comment on function public.rpc_ai_ngu_canh_phan_tich(text, text) is
  'Gói ngữ cảnh cho LỚP AI PHÂN TÍCH: lịch sử hội thoại + thực thể có '
  'thật + bản phân tích SQL sơ bộ. Không đưa 217 tên thiết bị — nhồi cả '
  'danh mục vào lời nhắc chỉ làm loãng.';

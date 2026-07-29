-- =====================================================================
-- NGỮ CẢNH GỌN CHO MÔ HÌNH BẬC NHANH
--
-- Groq bậc miễn phí giới hạn 12.000 token/phút. rpc_ai_context trả về
-- toàn bộ: tổng quan + phân bố theo 4 chiều + 25 dòng quá hạn + 25 dòng
-- sắp đến hạn + 25 dòng khớp từ khoá = 13.137 token → vượt hạn mức, mọi
-- câu đi đường nhanh đều hỏng.
--
-- Không phải lỗi hạn mức. Là lỗi thiết kế: mô hình bậc nhanh nhận câu
-- ngắn một ý, nó KHÔNG CẦN cả kho số liệu. Đưa đúng thứ cần dùng thì
-- vừa lọt hạn mức, vừa trả lời nhanh và bám sát hơn.
--
-- Bản gọn giữ: tổng quan, phân bố theo mức trọng yếu, và các dòng khớp
-- từ khoá trong câu hỏi (tối đa 8). Bỏ: ba bảng phân bố còn lại và hai
-- danh sách dài — những thứ chỉ cần khi câu hỏi thật sự rộng, mà câu
-- rộng thì đã được định tuyến sang bậc sâu rồi.
-- =====================================================================

create or replace function public.rpc_ai_context_gon(
  p_question text default null, p_year integer default null
) returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select jsonb_build_object(
    'nam',        c->'nam',
    'tong_quan',  c->'tong_quan',
    'theo_muc_trong_yeu', c->'theo_muc_trong_yeu',
    'dong_khop_cau_hoi',  (
      select coalesce(jsonb_agg(e), '[]'::jsonb)
      from (select e from jsonb_array_elements(c->'dong_khop_cau_hoi') e limit 8) t),
    'luu_y', 'Bản GỌN cho mô hình bậc nhanh. Cần danh sách quá hạn hoặc '
             || 'sắp đến hạn đầy đủ thì nói người dùng hỏi cụ thể hơn.')
  from (select public.rpc_ai_context(p_question, p_year, 8) c) x;
$fn$;

revoke execute on function public.rpc_ai_context_gon(text, integer) from anon, public;
grant  execute on function public.rpc_ai_context_gon(text, integer)
  to authenticated, service_role;

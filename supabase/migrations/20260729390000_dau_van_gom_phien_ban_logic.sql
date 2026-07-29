-- =====================================================================
-- DẤU VÂN ĐỆM PHẢI GỒM CẢ PHIÊN BẢN LOGIC
--
-- Bộ câu hỏi chuẩn bắt được: sau khi sửa định tuyến để câu giải thích
-- luôn đi bậc sâu, câu "vì sao LAF cân 9 điểm" VẪN trả về nội dung sai
-- cũ ("thiết bị đo lường trọng lượng"). Vì đệm còn giữ nó.
--
-- Dấu vân cũ chỉ gồm: số dòng + max(updated_at) + ngày hiện tại. Nó bắt
-- được "DỮ LIỆU đổi", nhưng không bắt được "CÁCH TRẢ LỜI đổi" — mà sửa
-- lời nhắc, sửa định tuyến, sửa mô hình cũng làm câu trả lời cũ hết đúng.
--
-- Thêm PHIÊN BẢN LOGIC vào dấu vân. Mỗi lần sửa gì ảnh hưởng tới nội
-- dung câu trả lời thì tăng số này, toàn bộ đệm cũ tự hết hiệu lực mà
-- không cần xoá bảng.
--
-- Bài học chung: bộ nhớ đệm phải khoá theo MỌI thứ ảnh hưởng tới kết
-- quả, không chỉ dữ liệu đầu vào.
-- =====================================================================

insert into public.system_config (key, value)
values ('ai_phien_ban_logic', '3'::jsonb)
on conflict (key) do update set value = '3'::jsonb;

create or replace function public.vmp_ai_dau_van()
returns text
language sql stable security definer set search_path = public
as $fn$
  select count(*)::text
      || '|' || coalesce(max(updated_at), 'epoch'::timestamptz)::text
      || '|' || current_date::text
      -- Phiên bản logic: sửa lời nhắc / định tuyến / mô hình thì tăng số
      -- này, đệm cũ tự hết hiệu lực.
      || '|v' || coalesce((select value #>> '{}' from public.system_config
                           where key = 'ai_phien_ban_logic'), '0')
  from public.vmp_plan_items where is_active;
$fn$;

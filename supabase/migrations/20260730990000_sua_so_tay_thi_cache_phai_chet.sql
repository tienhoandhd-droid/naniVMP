-- =====================================================================
-- Sửa sổ tay / tri thức thì cache cũng phải chết theo
--
-- Vừa vá sáu mảnh sổ tay để chặn mấy câu trả lời sai, test lại thì ba
-- trong bốn câu vẫn y nguyên lỗi cũ. Không phải sổ tay không ăn — mà là
-- CACHE trả lại bản trả lời cũ, vì trong sáu giờ qua không ai đụng vào
-- vmp_plan_items nên trigger vô hiệu không nổ.
--
-- Lỗ hổng thật: cache chỉ theo dõi DỮ LIỆU, không theo dõi CÁCH TRẢ
-- LỜI. Sửa sổ tay giọng, thêm bí danh, nạp tài liệu mới — tất cả đều
-- làm câu trả lời phải khác đi, mà cache vẫn giữ bản cũ.
--
-- Trong môi trường GMP điều này còn nguy hơn: vá một câu trả lời sai
-- xong tưởng đã xong, người dùng vẫn nhận đúng câu sai đó.
-- =====================================================================

create or replace function public.vmp_cache_nn_vo_hieu()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  update public.vmp_ai_cache_ngu_nghia
  set is_valid = false, invalidated_at = now(),
      invalidated_reason = tg_table_name || ' vua doi'
  where is_valid;
  return null;
end;
$fn$;

-- Sổ tay giọng đổi -> cách trả lời đổi -> cache phải chết
drop trigger if exists cache_nn_vo_hieu on public.vmp_chat_giong;
create trigger cache_nn_vo_hieu
  after insert or update or delete on public.vmp_chat_giong
  for each statement execute function public.vmp_cache_nn_vo_hieu();

-- Bí danh đổi -> hệ khoanh đối tượng khác đi -> cache phải chết
drop trigger if exists cache_nn_vo_hieu on public.vmp_ai_bi_danh;
create trigger cache_nn_vo_hieu
  after insert or update or delete on public.vmp_ai_bi_danh
  for each statement execute function public.vmp_cache_nn_vo_hieu();

-- Kho tri thức đổi -> câu giải thích đổi -> cache phải chết
drop trigger if exists cache_nn_vo_hieu on public.vmp_kb_documents;
create trigger cache_nn_vo_hieu
  after insert or update or delete on public.vmp_kb_documents
  for each statement execute function public.vmp_cache_nn_vo_hieu();

-- Dọn sạch cache hiện tại để lần test sau không dính bản cũ
update public.vmp_ai_cache_ngu_nghia
set is_valid = false, invalidated_at = now(), invalidated_reason = 'vá sổ tay'
where is_valid;

-- =====================================================================
-- Thêm "do_tin" — thang 0..1 dễ đặt ngưỡng hơn điểm RRF thô
--
-- Điểm RRF thô rất khó dùng làm ngưỡng. Một mảnh đứng đầu CẢ HAI đường
-- (vector + từ khoá) được 1/61 + 1/61 = 0.0328. Nhưng nếu câu hỏi không
-- có vector, hoặc chỉ một đường khớp, thì mảnh tốt nhất cũng chỉ được
-- 0.0164 — thấp hơn ngưỡng 0.02 đang dùng. Hệ quả: tra ĐÚNG tài liệu mà
-- vẫn bị coi là "không tra được", Vali từ chối oan và web không hiện
-- nguồn nào.
--
-- Chữa bằng cách chia cho điểm tối đa lý thuyết (đứng đầu cả hai đường)
-- rồi cắt trần ở 1. Từ nay ngưỡng đọc được bằng tiếng người: 0.5 là
-- đứng đầu cả hai đường, 0.2 trở lên là đáng tin.
-- =====================================================================

create or replace function public.rpc_tim_tri_thuc(
  p_cau_hoi text,
  p_vector  text default null,
  p_k       integer default 6
) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $fn$
declare
  v_kq jsonb;
  v_tu_khoa text := public.vmp_khong_dau(coalesce(p_cau_hoi, ''));
  v_toi_da numeric := 2.0 / 61.0;   -- đứng đầu cả hai đường
begin
  with
  theo_vector as (
    select d.id, row_number() over (order by d.embedding <=> p_vector::vector) as hang
    from public.vmp_kb_documents d
    where p_vector is not null and d.embedding is not null
    order by d.embedding <=> p_vector::vector
    limit 30
  ),
  theo_tu_khoa as (
    select d.id,
           row_number() over (order by word_similarity(v_tu_khoa, public.vmp_khong_dau(d.content)) desc) as hang
    from public.vmp_kb_documents d
    where v_tu_khoa <> ''
      and word_similarity(v_tu_khoa, public.vmp_khong_dau(d.content)) > 0.25
    order by word_similarity(v_tu_khoa, public.vmp_khong_dau(d.content)) desc
    limit 30
  ),
  gop as (
    select id, sum(diem) as diem from (
      select id, 1.0 / (60 + hang) as diem from theo_vector
      union all
      select id, 1.0 / (60 + hang) as diem from theo_tu_khoa
    ) t group by id
  )
  select coalesce(jsonb_agg(x order by x.diem desc), '[]'::jsonb) into v_kq
  from (
    select d.id,
           round(g.diem::numeric, 5) as diem,
           least(1.0, round((g.diem / v_toi_da)::numeric, 3)) as do_tin,
           coalesce(d.metadata ->> 'source', 'không rõ nguồn') as nguon,
           coalesce(d.metadata ->> 'heading', '') as muc,
           left(d.content, 1200) as noi_dung
    from gop g join public.vmp_kb_documents d on d.id = g.id
    order by g.diem desc
    limit greatest(1, least(p_k, 12))
  ) x;

  return jsonb_build_object(
    'ok', true,
    'so_manh', jsonb_array_length(v_kq),
    'diem_cao_nhat', coalesce((v_kq -> 0 ->> 'diem')::numeric, 0),
    -- Thang 0..1: dùng cái này để quyết định có đủ căn cứ hay không.
    'do_tin_cao_nhat', coalesce((v_kq -> 0 ->> 'do_tin')::numeric, 0),
    'manh', v_kq);
end;
$fn$;

comment on function public.rpc_tim_tri_thuc(text, text, integer) is
  'Tìm kiếm lai (vector + từ khoá, hợp nhất RRF) trên kho tri thức VMP. Kèm do_tin thang 0..1 để đặt ngưỡng, và nguồn/mục để trích dẫn.';

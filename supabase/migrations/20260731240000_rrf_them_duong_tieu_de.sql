-- RRF thêm đường thứ ba: khớp từ khoá theo TỪNG DÒNG, lấy dòng đậm nhất.
--
-- Ca lộ lỗi: "đề cương phải xong trước ngày chạy bao nhiêu ngày" — mảnh
-- "7. Năm mốc thời gian" (chứa đúng luật 60 ngày) không lọt top 12: so
-- toàn văn thì mảnh dài pha loãng điểm, so đoạn mở đầu thì luật lại nằm
-- GIỮA mảnh (đầu mảnh là khối công thức). Dòng chứa luật mới là nơi cô
-- đọng — so từng dòng rồi lấy max thì câu hỏi trúng luật nổi lên ngay.
-- Ba đường trộn RRF k=60; mẫu số do_tin đổi theo 3 đường (3/61) nên
-- đứng-đầu-một-đường ≈ 0.33 < 0.55 — ngưỡng chip trích dẫn "phải ≥ 2
-- đường cùng chỉ" giữ nguyên ý nghĩa.

create or replace function public.rpc_tim_tri_thuc(p_cau_hoi text, p_vector text default null::text, p_k integer default 6)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_kq jsonb;
  v_tu_khoa text := public.vmp_khong_dau(coalesce(p_cau_hoi, ''));
  v_toi_da numeric := 3.0 / 61.0;   -- đứng đầu cả ba đường
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
  theo_dong as (
    select id, row_number() over (order by sim desc) as hang
    from (
      select d.id, max(word_similarity(v_tu_khoa, public.vmp_khong_dau(dong))) as sim
      from public.vmp_kb_documents d,
           regexp_split_to_table(d.content, E'\n') as dong
      where v_tu_khoa <> '' and length(dong) > 20
      group by d.id
    ) s
    where sim > 0.3
    order by sim desc
    limit 30
  ),
  gop as (
    select id, sum(diem) as diem from (
      select id, 1.0 / (60 + hang) as diem from theo_vector
      union all
      select id, 1.0 / (60 + hang) as diem from theo_tu_khoa
      union all
      select id, 1.0 / (60 + hang) as diem from theo_dong
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
    limit greatest(1, least(p_k, 20))
  ) x;

  return jsonb_build_object(
    'ok', true,
    'so_manh', jsonb_array_length(v_kq),
    'diem_cao_nhat', coalesce((v_kq -> 0 ->> 'diem')::numeric, 0),
    -- Thang 0..1: dùng cái này để quyết định có đủ căn cứ hay không.
    'do_tin_cao_nhat', coalesce((v_kq -> 0 ->> 'do_tin')::numeric, 0),
    'manh', v_kq);
end;
$function$;

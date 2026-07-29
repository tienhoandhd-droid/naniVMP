-- =====================================================================
-- Gợi ý gần đúng: đừng đoán bừa khi câu hỏi quá ngắn
--
-- "xong chưa" đang trả về gợi ý "Tank chứa dịch vỏ, Máy đo điểm nóng
-- chảy" — word_similarity trên một câu hai tiếng thì cái gì cũng giống
-- nhau một tí. Gợi ý sai còn tệ hơn không gợi ý: nó kéo AI đi lạc.
--
-- Chỉ đoán khi câu hỏi có ít nhất hai tiếng đủ dài để mang nghĩa. Và
-- bỏ trùng — danh sách lặp lại cùng một tên trông rất cẩu thả.
-- =====================================================================

create or replace function public.rpc_ai_hieu_tu_khoa(
  p_cau_hoi text,
  p_k       integer default 6
) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $fn$
declare
  v_q        text := regexp_replace(public.vmp_khong_dau(coalesce(p_cau_hoi, '')), '[^a-z0-9]+', ' ', 'g');
  v_nhom     jsonb;
  v_bi_danh  jsonb;
  v_gan      jsonb := '[]'::jsonb;
  v_giai     text := '';
  v_du_dai   integer;
  v_bo_qua   text[] := array[
    'bao','nhieu','cua','cho','cac','nhung','mot','hai','ba','the','nao','gi','la','co','khong',
    'va','hay','thi','ma','o','tai','tu','den','ve','voi','trong','ngoai','tren','duoi','con',
    'da','dang','se','bi','duoc','cai','nay','do','kia','ay','anh','chi','em','toi','ban','minh',
    'xem','giup','cho','biet','hoi','tra','loi','can','muon','phai','nen','lam','sao','tai','vi',
    'hang','muc','tien','do','tham','dinh','thiet','bi','danh','sach','tinh','hinh','tat','ca',
    'ngay','thang','nam','tuan','hom','nay','qua','han','xong','chua','roi','moi','tong','so'
  ];
begin
  with tieng as (
    select distinct t from unnest(string_to_array(btrim(v_q), ' ')) t
    where length(t) >= 3 and not (t = any(v_bo_qua))
  ),
  cum as (
    select distinct btrim(a.t || ' ' || b.t) as t
    from unnest(string_to_array(btrim(v_q), ' ')) with ordinality a(t, i)
    join unnest(string_to_array(btrim(v_q), ' ')) with ordinality b(t, i) on b.i = a.i + 1
    where length(a.t) >= 2 and length(b.t) >= 2
      and not (a.t = any(v_bo_qua)) and not (b.t = any(v_bo_qua))
  ),
  can_do as (select t from tieng union select t from cum),
  khop as (
    select c.t, d.loai, d.gia_tri
    from can_do c join public.vmp_ai_tu_dien d on d.khoa like '%' || c.t || '%'
    union all
    select t.t, d.loai, d.gia_tri
    from (select distinct t from unnest(string_to_array(btrim(v_q), ' ')) t where length(t) = 2) t
    join public.vmp_ai_tu_dien d on d.loai = 'loai_td' and d.khoa = t.t
  ),
  gom as (
    select t, loai, count(distinct gia_tri) as so_khop,
           (array_agg(distinct gia_tri))[1:4] as vi_du
    from khop group by t, loai
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'tu', t, 'loai', loai, 'so_khop', so_khop, 'vi_du', to_jsonb(vi_du))
         order by so_khop, t), '[]'::jsonb)
  into v_nhom
  from (select * from gom order by so_khop, t limit greatest(1, least(p_k, 12))) x;

  select coalesce(jsonb_agg(jsonb_build_object(
           'goi_la', b.bi_danh, 'loai', b.loai, 'that_ra_la', b.gia_tri, 'ghi_chu', b.ghi_chu)), '[]'::jsonb)
  into v_bi_danh
  from public.vmp_ai_bi_danh b
  where (' ' || v_q || ' ') like '%' || b.bi_danh || '%';

  -- Đủ chất liệu để đoán chưa: cần ít nhất hai tiếng dài từ 4 ký tự
  select count(*) into v_du_dai
  from unnest(string_to_array(btrim(v_q), ' ')) t
  where length(t) >= 4 and not (t = any(v_bo_qua));

  if jsonb_array_length(v_nhom) = 0 and jsonb_array_length(v_bi_danh) = 0 and coalesce(v_du_dai, 0) >= 2 then
    select coalesce(jsonb_agg(jsonb_build_object('loai', loai, 'gia_tri', gia_tri, 'diem', round(diem::numeric, 3))
             order by diem desc), '[]'::jsonb)
    into v_gan
    from (
      select distinct on (d.gia_tri) d.loai, d.gia_tri, word_similarity(btrim(v_q), d.khoa) as diem
      from public.vmp_ai_tu_dien d
      where word_similarity(btrim(v_q), d.khoa) > 0.45
      order by d.gia_tri, diem desc
    ) g0
    where true
    limit 5;
  end if;

  if jsonb_array_length(v_nhom) > 0 then
    select v_giai || string_agg(
             format('Chữ "%s" trúng %s mục loại %s (ví dụ: %s).', x ->> 'tu', x ->> 'so_khop', x ->> 'loai',
                    (select string_agg(v, ', ') from jsonb_array_elements_text(x -> 'vi_du') v)), ' ')
    into v_giai from jsonb_array_elements(v_nhom) x;
  end if;

  if jsonb_array_length(v_bi_danh) > 0 then
    select v_giai || ' ' || string_agg(
             case when x ->> 'that_ra_la' is not null
                  then format('Người hỏi gọi "%s" — trong dữ liệu là "%s".', x ->> 'goi_la', x ->> 'that_ra_la')
                  else format('Người hỏi gọi "%s" — là một nhóm %s, chưa rõ cái nào.', x ->> 'goi_la', x ->> 'loai') end
             || coalesce(' (' || (x ->> 'ghi_chu') || ')', ''), ' ')
    into v_giai from jsonb_array_elements(v_bi_danh) x;
  end if;

  if jsonb_array_length(v_gan) > 0 then
    select v_giai || ' Không khớp thẳng được cái nào; gần đúng nhất có: ' || string_agg(x ->> 'gia_tri', ', ') || '. Nên hỏi lại cho chắc.'
    into v_giai from jsonb_array_elements(v_gan) x;
  end if;

  if btrim(coalesce(v_giai, '')) = '' then
    v_giai := 'Câu hỏi không nhắc tới thiết bị, khu vực hay bộ phận cụ thể nào.';
  end if;

  return jsonb_build_object('ok', true, 'nhom', v_nhom, 'bi_danh', v_bi_danh,
                            'gan_dung', v_gan, 'giai_thich', btrim(v_giai));
end;
$fn$;

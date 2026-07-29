-- =====================================================================
-- Chuẩn hoá từ khoá sổ tay giọng — khớp theo TỪ, không khớp theo chuỗi
--
-- Hai lỗi âm thầm lộ ra khi thử:
--
-- 1. Từ khoá viết ' hi ' (có khoảng trắng hai đầu để chỉ khớp nguyên từ)
--    bị Postgres CẮT TRẮNG khi đọc array literal không có dấu nháy —
--    thành 'hi'. Thế là "bao nhiêu hạng mục quá hạn" cũng kích hoạt mảnh
--    Chào hỏi, vì trong "nhiêu" có "hi". Kiểu lỗi này không báo gì cả,
--    chỉ làm giọng lệch dần.
--
-- 2. Vài từ khoá lỡ viết CÓ DẤU ("chấm điểm", "đuối quá", "cả tổ") trong
--    khi hàm so trên bản đã bỏ dấu — nghĩa là chúng không bao giờ khớp,
--    mảnh đó nằm chết trong bảng.
--
-- Sửa gốc: bỏ dấu và đổi mọi ký tự không phải chữ-số thành khoảng trắng
-- ở CẢ HAI phía (câu hỏi và từ khoá), rồi bao từ khoá bằng khoảng trắng.
-- Thành ra khớp theo từ trọn vẹn: " han " không dính vào "hang", " va "
-- không dính vào "vao".
-- =====================================================================

-- Mảnh '^' vốn là chỗ để dành, từ khoá không khớp được gì — bỏ cho sạch.
delete from public.vmp_chat_giong where tu_khoa = '{^}';

update public.vmp_chat_giong
set tu_khoa = (
      select array_agg(distinct ' ' || btrim(
               regexp_replace(public.vmp_khong_dau(k), '[^a-z0-9]+', ' ', 'g')
             ) || ' ')
      from unnest(tu_khoa) k
      where btrim(regexp_replace(public.vmp_khong_dau(k), '[^a-z0-9]+', ' ', 'g')) <> ''
    ),
    updated_at = now()
where tu_khoa <> '{}';

create or replace function public.rpc_lay_giong(
  p_cau_hoi text,
  p_k       integer default 3
) returns jsonb
language sql stable security definer set search_path = public, extensions
as $fn$
  with cau as (
    -- Bỏ dấu, rồi đổi dấu câu thành khoảng trắng: "quá hạn?" -> " qua han "
    select ' ' || regexp_replace(
             public.vmp_khong_dau(coalesce(p_cau_hoi, '')), '[^a-z0-9]+', ' ', 'g'
           ) || ' ' as v
  ),
  nen as (
    select g.ten, g.noi_dung, g.uu_tien, true as la_nen
    from public.vmp_chat_giong g
    where g.bat and g.tu_khoa = '{}'
  ),
  trung as (
    select g.ten, g.noi_dung, g.uu_tien, false as la_nen
    from public.vmp_chat_giong g, cau c
    where g.bat
      and g.tu_khoa <> '{}'
      and exists (
        select 1 from unnest(g.tu_khoa) k
        where c.v like '%' || k || '%'
      )
    order by g.uu_tien
    limit greatest(1, least(p_k, 8))
  ),
  gop as (
    select * from nen
    union all
    select * from trung
  )
  select jsonb_build_object(
    'ok', true,
    'so_manh', count(*) filter (where not la_nen),
    'loi_dan', coalesce(string_agg(noi_dung, E'\n' order by la_nen desc, uu_tien), ''),
    'ten_manh', coalesce(jsonb_agg(ten order by la_nen desc, uu_tien), '[]'::jsonb)
  )
  from gop;
$fn$;

comment on function public.rpc_lay_giong(text, integer) is
  'Trả lời dặn về giọng: TẤT CẢ mảnh nền + tối đa p_k mảnh trúng từ khoá. Khớp theo TỪ trọn vẹn trên bản bỏ dấu.';

-- =====================================================================
-- Sửa rpc_lay_giong: mảnh nền không được ăn tranh chỗ của mảnh tình huống
--
-- Bản đầu xếp chung một rổ rồi cắt theo p_k. Lúc mới có 2 mảnh nền thì
-- không sao. Nạp thêm nhóm tâm trạng xong thành 7 mảnh nền — thế là hỏi
-- "kiệt sức quá, mai lại chạy thẩm định rồi" trả về TOÀN mảnh nền, còn
-- hai mảnh trúng từ khoá thật thì bị cắt mất. Sổ tay dày lên mà tác dụng
-- lại kém đi, đúng kiểu lỗi âm thầm.
--
-- Sửa: hai rổ riêng. Mảnh nền luôn lấy đủ (chúng là chất giọng, không
-- phải gợi ý), p_k chỉ giới hạn mảnh trúng từ khoá.
-- =====================================================================

create or replace function public.rpc_lay_giong(
  p_cau_hoi text,
  p_k       integer default 3
) returns jsonb
language sql stable security definer set search_path = public, extensions
as $fn$
  with cau as (
    select ' ' || public.vmp_khong_dau(coalesce(p_cau_hoi, '')) || ' ' as v
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
  'Trả lời dặn về giọng: TẤT CẢ mảnh nền (chất giọng chung) + tối đa p_k mảnh trúng từ khoá. Mảnh nền không tính vào p_k.';

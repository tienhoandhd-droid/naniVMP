-- =====================================================================
-- SỬA MÃ PHÂN LOẠI TRONG DANH SÁCH ĐỐI TƯỢNG
--
-- Lỗi người dùng gặp: chọn thiết bị thì không hiện gì ở màn Timeline VMP.
--
-- Cùng một kiểu sai với vụ mã bộ phận trước đó, và cũng do đợt đổi nguồn
-- gây ra. Hai bảng ghi phân loại theo HAI KIỂU:
--
--   vmp_objects.classification    → 'tb' · 'qt' · 'kho' · 'ht' · 'vc'
--   vmp_source_objects.object_kind → 'Thiết bị' · 'Quy trình' · 'Kho' …
--
-- Frontend tra bảng CLS trong constants/vmp.ts, mà khoá ở đó là mã ngắn.
-- Sau khi đổi nguồn, CLS['Thiết bị'] trả undefined → mất biểu tượng, mất
-- màu, và mọi bộ lọc theo phân loại đều rỗng.
--
-- Đáng lẽ tôi phải rà cả hai cột định dạng cùng lúc khi sửa vụ bộ phận.
-- Đây là chỗ sửa một nửa: cùng một nguyên nhân, hai triệu chứng, mà lần
-- trước chỉ chữa một.
-- =====================================================================

create or replace function public.vmp_ma_phan_loai(p_kind text)
returns text language sql immutable
as $fn$
  select case lower(trim(coalesce(p_kind, '')))
    when 'thiết bị'          then 'tb'
    when 'quy trình'         then 'qt'
    when 'kho'               then 'kho'
    when 'hệ thống phụ trợ'  then 'ht'
    when 'vận chuyển'        then 'vc'
    else 'tb' end;
$fn$;

comment on function public.vmp_ma_phan_loai(text) is
  'Đổi tên phân loại dài của vmp_source_objects sang mã ngắn mà frontend '
  'dùng làm khoá tra bảng CLS.';

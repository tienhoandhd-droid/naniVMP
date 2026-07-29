-- =====================================================================
-- Bí danh quá ngắn, và máy chấm so chuỗi có dấu bị lệch Unicode
--
-- 1. Bí danh 'kem' -> line Kem/Gel. Câu "ai làm việc KÉM nhất" bỏ dấu
--    thành "kem" nên khoanh trúng dây chuyền Kem/Gel — một câu hỏi xếp
--    hạng người lại khoanh vào một line sản phẩm. Bí danh một tiếng
--    ngắn trùng từ phổ thông thì phải bỏ hoặc kéo dài ra.
--
-- 2. Máy chấm so `danh_sach_gia_tri ? 'Hóa lý 1'` bằng chuỗi CÓ DẤU
--    chính xác. "Hóa" gõ ở hai chỗ khác nhau có thể ra hai chuỗi
--    Unicode khác nhau (tổ hợp NFC/NFD) mà mắt người nhìn y hệt — nên
--    hàm trả ĐÚNG mà vẫn bị chấm trượt. Đổi sang so trên bản bỏ dấu.
-- =====================================================================

update public.vmp_ai_bi_danh set bi_danh = 'kem gel' where bi_danh = 'kem';
delete from public.vmp_ai_bi_danh where bi_danh in ('xit', 'gel');

create or replace function public.rpc_ai_cham_tra_cuu(p_ghi_chu text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $fn$
declare
  r        record;
  v_kq     jsonb;
  v_dat    boolean;
  v_tong   integer := 0;
  v_diem   integer := 0;
  v_truot  jsonb := '[]'::jsonb;
begin
  for r in select * from public.vmp_ai_cau_hoi_vang where bat order by id loop
    v_tong := v_tong + 1;
    v_kq := public.rpc_ai_thong_ke_loc(r.cau_hoi, 3);

    if (r.mong_doi ->> 'khong_khoanh')::boolean is true then
      v_dat := coalesce((v_kq ->> 'so_nhom')::int, 0) = 0;
    else
      -- So trên bản BỎ DẤU: tránh bẫy hai chuỗi Unicode trông giống nhau
      select exists (
        select 1 from jsonb_array_elements(v_kq -> 'thong_ke') t
        where t ->> 'loai' = r.mong_doi ->> 'loai'
          and exists (
            select 1 from jsonb_array_elements_text(t -> 'danh_sach_gia_tri') g
            where public.vmp_khong_dau(g) = public.vmp_khong_dau(r.mong_doi ->> 'gia_tri'))
      ) into v_dat;
    end if;

    if v_dat then
      v_diem := v_diem + 1;
    else
      v_truot := v_truot || jsonb_build_array(jsonb_build_object(
        'cau_hoi', r.cau_hoi, 'nhom', r.nhom, 'mong_doi', r.mong_doi,
        'thuc_te', coalesce((
          select jsonb_agg(jsonb_build_object('loai', t ->> 'loai', 'gia_tri', t ->> 'gia_tri'))
          from jsonb_array_elements(v_kq -> 'thong_ke') t), '[]'::jsonb)));
    end if;
  end loop;

  insert into public.vmp_ai_cham_diem_log (tong, dat, truot, ghi_chu)
  values (v_tong, v_diem, v_truot, p_ghi_chu);

  return jsonb_build_object('ok', true, 'tong', v_tong, 'dat', v_diem,
    'ty_le', case when v_tong > 0 then round(100.0 * v_diem / v_tong, 1) else 0 end,
    'truot', v_truot);
end;
$fn$;

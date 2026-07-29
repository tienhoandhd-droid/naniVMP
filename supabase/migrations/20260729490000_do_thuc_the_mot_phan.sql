-- =====================================================================
-- DÒ THỰC THỂ MỘT PHẦN — "Huệ Nhi" phải ra "Phạm Huệ Nhi"
--
-- ---------------------------------------------------------------------
-- Ca hỏng
--
--   "tìm kiếm Huệ Nhi"  → "Bổn cung lục mãi mà không ra nha"
--   "Phạm Huệ Nhi"      → ra đầy đủ hồ sơ
--
-- Vô lý ở chỗ: cùng một người, chỉ khác cách gọi. Ngoài đời không ai gọi
-- đủ họ tên mỗi lần — người ta nói "Huệ Nhi", "chị Nhi", "Hằng bên C3".
--
-- Nguyên nhân: hệ so nguyên cụm — hỏi phải chứa đủ "pham hue nhi" mới
-- khớp. Câu hỏi chỉ có "hue nhi" nên trượt.
--
-- ---------------------------------------------------------------------
-- Sửa: dò ba mức, chắc chắn trước, mờ dần về sau
--
--   Mức 1  NGUYÊN CỤM   — câu hỏi chứa đủ tên. Chắc nhất, giữ nguyên.
--   Mức 2  MỘT PHẦN     — ≥2 tiếng liên tiếp của tên xuất hiện trong câu.
--                         "hue nhi" nằm trong "pham hue nhi" → khớp.
--                         Đòi 2 tiếng để "Nhi" một mình không quét trúng
--                         mọi tên có chữ Nhi.
--   Mức 3  GẦN GIỐNG    — trigram ≥ 0.45, bắt được gõ sai dấu, thiếu dấu,
--                         viết tắt.
--
-- Khớp ĐÚNG MỘT thì trả lời luôn. Khớp NHIỀU thì hỏi lại kèm danh sách —
-- vẫn tốt hơn đoán bừa một người rồi trả lời sai về người khác.
-- =====================================================================

create or replace function public.rpc_ai_do_thuc_the(
  p_question text, p_loai text default null
) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  q     text := ' ' || public.vmp_khong_dau(coalesce(p_question, '')) || ' ';
  v_ds  jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'loai', loai, 'gia_tri', gia_tri, 'muc', muc, 'diem', round(diem::numeric, 3))
         order by muc, diem desc), '[]'::jsonb)
  into v_ds
  from (
    select distinct on (loai, gia_tri) loai, gia_tri, muc, diem
    from (
      -- Mức 1: nguyên cụm
      select loai, gia_tri, 1 muc, 1.0 diem
      from public.vmp_ai_tu_dien
      where (p_loai is null or loai = p_loai)
        and length(khoa) >= 3 and q like '%' || khoa || '%'

      union all

      -- Mức 2: ≥2 tiếng liên tiếp của tên nằm trong câu hỏi.
      -- Đòi 2 tiếng vì 1 tiếng ("Nhi", "My") quét trúng quá nhiều.
      select d.loai, d.gia_tri, 2 muc,
             0.9 - (0.05 * (array_length(string_to_array(d.khoa, ' '), 1) - n)) diem
      from public.vmp_ai_tu_dien d
      cross join lateral (
        select n, array_to_string((string_to_array(d.khoa, ' '))[i : i + n - 1], ' ') cum
        from generate_series(2, greatest(2, array_length(string_to_array(d.khoa, ' '), 1))) n,
             generate_series(1, greatest(1, array_length(string_to_array(d.khoa, ' '), 1))) i
        where i + n - 1 <= array_length(string_to_array(d.khoa, ' '), 1)
      ) c
      where (p_loai is null or d.loai = p_loai)
        and d.loai in ('nguoi', 'nhom_viec', 'ten_doi_tuong')
        and length(c.cum) >= 5
        and q like '%' || c.cum || '%'

      union all

      -- Mức 3: gần giống, bắt gõ sai dấu / thiếu dấu
      select loai, gia_tri, 3 muc, extensions.similarity(khoa, trim(q)) diem
      from public.vmp_ai_tu_dien
      where (p_loai is null or loai = p_loai)
        and loai in ('nguoi', 'nhom_viec')
        and extensions.similarity(khoa, trim(q)) >= 0.45
    ) t
    order by loai, gia_tri, muc, diem desc
  ) u;

  return jsonb_build_object(
    'so_khop', jsonb_array_length(v_ds),
    'ket_qua', v_ds,
    'chac_chan', case when jsonb_array_length(v_ds) = 1 then v_ds->0 else null end);
end;
$fn$;

revoke execute on function public.rpc_ai_do_thuc_the(text, text) from anon, public;
grant  execute on function public.rpc_ai_do_thuc_the(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Nối vào đường trả lời: gọi tên một phần cũng ra hồ sơ
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_tim_nguoi_mo(
  p_question text, p_year integer default null
) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_do  jsonb := public.rpc_ai_do_thuc_the(p_question, 'nguoi');
  v_n   integer := (v_do->>'so_khop')::int;
  v_ds  text;
begin
  if v_n = 0 then return jsonb_build_object('khop', false); end if;

  -- Đúng một người → trả hồ sơ luôn
  if v_n = 1 then
    return public.rpc_ai_ho_so_nguoi(v_do->'ket_qua'->0->>'gia_tri', p_year)
           || jsonb_build_object('khop', true, 'ten', v_do->'ket_qua'->0->>'gia_tri');
  end if;

  -- Nhiều người → hỏi lại, đừng đoán
  select string_agg('· **' || (e->>'gia_tri') || '**', E'\n')
  into v_ds from jsonb_array_elements(v_do->'ket_qua') e;

  return jsonb_build_object('khop', true, 'nhieu', true,
    'tra_loi', 'Bổn cung thấy có **' || v_n || ' người** hợp với cái tên ngươi nói 🌸'
      || E'\n\n' || v_ds || E'\n\n' || 'Ngươi nói rõ là ai để bổn cung soi cho đúng.');
end;
$fn$;

revoke execute on function public.rpc_ai_tim_nguoi_mo(text, integer) from anon, public;
grant  execute on function public.rpc_ai_tim_nguoi_mo(text, integer) to authenticated, service_role;

insert into public.vmp_ai_bo_kiem (ma, cau_hoi, mong_doi, ghi_chu) values
 ('goi_ten_mot_phan', 'tìm kiếm Huệ Nhi',
  '{"duong":"sql","chua_chuoi":["Phạm Huệ Nhi","hạng mục"],"khong_chua":["lục mãi mà không ra"]}'::jsonb,
  'Gọi tên một phần từng trượt: hệ so nguyên cụm nên "hue nhi" không khớp '
  '"pham hue nhi". Ngoài đời không ai gọi đủ họ tên mỗi lần.')
on conflict (ma) do update set
  cau_hoi = excluded.cau_hoi, mong_doi = excluded.mong_doi, ghi_chu = excluded.ghi_chu;

update public.system_config set value = to_jsonb((value #>> '{}')::int + 1)
where key = 'ai_phien_ban_logic';

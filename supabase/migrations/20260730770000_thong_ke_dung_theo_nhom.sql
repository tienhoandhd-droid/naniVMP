-- =====================================================================
-- ĐẾM ĐÚNG THEO NHÓM — chấm dứt kiểu "đếm trên danh sách đã bị cắt"
--
-- Hai câu trả lời sai thật, cùng một gốc:
--
--   "tank thì đến đâu rồi"  → AI đọc số tổng nhà máy (461) thành số của
--                             riêng nhóm tank.
--   "Nhi có quá tải không"  → AI đọc 8 (số dòng mẫu trả về sau khi cắt)
--                             thành tổng của Nhi. Thật ra Nhi có 22 hạng
--                             mục, 13 đang mở, 8 quá hạn.
--
-- Cả hai đều KHÔNG chữa được bằng cách dặn mô hình. Mô hình đang cần một
-- con số cho nhóm; trong tay nó chỉ có số tổng và một danh sách mẫu, nên
-- nó lấy đại một trong hai. Muốn nó thôi thì phải ĐƯA cho nó con số đúng.
--
-- Hàm này nhận câu hỏi, tự nhận ra đang hỏi về ai / nhóm nào / khu vực
-- nào, rồi ĐẾM THẬT trên toàn bảng — không qua danh sách mẫu, không qua
-- LIMIT. Kèm mức trung bình để trả lời được câu "có quá tải không".
--
-- QUÁ TẢI ≠ QUÁ HẠN. Đây là hai chuyện khác hẳn nhau và AI đang lộn:
--   · quá hạn = việc đã trôi qua ngày phải xong  (nhìn về QUÁ KHỨ)
--   · quá tải = ôm nhiều việc hơn sức làm        (nhìn về TƯƠNG LAI)
-- Một người có thể quá tải mà chưa quá hạn cái nào — và ngược lại.
-- =====================================================================

create or replace function public.rpc_ai_thong_ke_loc(
  p_cau_hoi text,
  p_k       integer default 3
) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $fn$
declare
  v_tk        jsonb := public.rpc_ai_hieu_tu_khoa(p_cau_hoi, 8);
  v_ds        jsonb := '[]'::jsonb;
  v_tb_mo     numeric;
  v_tb_ngay   numeric;
  x           jsonb;
  v_loai      text;
  v_gia_tri   text;
  v_r         record;
begin
  -- Mức trung bình mỗi người, để nói được "nhiều hơn mặt bằng bao nhiêu"
  select round(avg(mo), 1), round(avg(ngay), 1)
  into v_tb_mo, v_tb_ngay
  from (
    select count(*) filter (where computed_status <> 'done') as mo,
           sum(coalesce(effort_days, 0)) filter (where computed_status <> 'done') as ngay
    from public.vmp_plan_items
    where is_active and owner_name is not null
    group by owner_name
  ) t;

  -- Duyệt từng thực thể dò được. Bỏ qua thứ trúng quá rộng (>60 mục) vì
  -- lúc đó câu hỏi chưa đủ hẹp để thống kê có nghĩa.
  for x in
    select e from jsonb_array_elements(v_tk -> 'nhom') e
    where (e ->> 'so_khop')::int <= 60
    order by (e ->> 'so_khop')::int
    limit greatest(1, least(p_k, 5))
  loop
    v_loai := x ->> 'loai';

    -- Chỉ thống kê khi khoanh được về ĐÚNG MỘT giá trị. Nhiều giá trị thì
    -- con số gộp lại vô nghĩa, thà để AI hỏi lại cho hẹp.
    if (x ->> 'so_khop')::int <> 1 then continue; end if;
    v_gia_tri := (x -> 'vi_du' ->> 0);
    if v_gia_tri is null then continue; end if;

    select
      count(*)                                                                   as tong,
      count(*) filter (where i.computed_status = 'done')                         as hoan_thanh,
      count(*) filter (where i.computed_status = 'prog')                         as dang_lam,
      count(*) filter (where i.computed_status in ('plan', 'todo'))              as chua_bat_dau,
      count(*) filter (where i.computed_status = 'over')                         as qua_han,
      count(*) filter (where i.computed_status <> 'done'
                         and i.deadline_vmp <= current_date + 30)                as den_han_30_ngay,
      count(*) filter (where i.computed_status <> 'done'
                         and i.criticality_score >= 7)                           as dang_mo_trong_yeu_cao,
      round(sum(coalesce(i.effort_days, 0))
            filter (where i.computed_status <> 'done'), 1)                       as cong_ngay_con_lai
    into v_r
    from public.vmp_plan_items i
    left join public.vmp_objects o on o.code = i.object_code
    where i.is_active
      and case v_loai
            when 'nguoi'         then i.owner_name = v_gia_tri or i.secondary_owner = v_gia_tri
            when 'nhom_viec'     then i.work_group = v_gia_tri
            when 'loai_td'       then i.validation_type = v_gia_tri
            when 'bo_phan'       then o.department = v_gia_tri
            when 'khu_vuc'       then o.area = v_gia_tri
            when 'line'          then o.line = v_gia_tri
            when 'ten_doi_tuong' then o.name = v_gia_tri
            when 'ma'            then i.object_code = v_gia_tri
            else false
          end;

    if v_r.tong = 0 then continue; end if;

    v_ds := v_ds || jsonb_build_array(jsonb_build_object(
      'loai', v_loai,
      'gia_tri', v_gia_tri,
      'tong', v_r.tong,
      'hoan_thanh', v_r.hoan_thanh,
      'dang_lam', v_r.dang_lam,
      'chua_bat_dau', v_r.chua_bat_dau,
      'qua_han', v_r.qua_han,
      'dang_mo', v_r.tong - v_r.hoan_thanh,
      'den_han_30_ngay', v_r.den_han_30_ngay,
      'dang_mo_trong_yeu_cao', v_r.dang_mo_trong_yeu_cao,
      'cong_ngay_con_lai', v_r.cong_ngay_con_lai,
      -- Chỉ có nghĩa khi hỏi về NGƯỜI
      'trung_binh_moi_nguoi_dang_mo', case when v_loai = 'nguoi' then v_tb_mo end,
      'trung_binh_moi_nguoi_cong_ngay', case when v_loai = 'nguoi' then v_tb_ngay end,
      'gap_may_lan_trung_binh', case
        when v_loai = 'nguoi' and coalesce(v_tb_mo, 0) > 0
        then round(((v_r.tong - v_r.hoan_thanh) / v_tb_mo)::numeric, 2) end
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'so_nhom', jsonb_array_length(v_ds),
    'thong_ke', v_ds,
    'giai_thich_tu_khoa', v_tk ->> 'giai_thich',
    'luu_y', 'Các con số ở đây ĐẾM THẬT trên toàn bộ bảng, không phải đếm '
             || 'trên danh sách mẫu. Dùng thẳng, đừng cộng trừ lại. '
             || 'QUÁ HẠN là việc đã trôi qua ngày phải xong (nhìn quá khứ). '
             || 'QUÁ TẢI là ôm nhiều việc hơn sức làm (nhìn tương lai) — '
             || 'xét dang_mo, den_han_30_ngay, cong_ngay_con_lai và '
             || 'gap_may_lan_trung_binh. Hai chuyện khác nhau, không được lẫn.');
end;
$fn$;

revoke execute on function public.rpc_ai_thong_ke_loc(text, integer) from public, anon;
grant execute on function public.rpc_ai_thong_ke_loc(text, integer) to authenticated, service_role;

comment on function public.rpc_ai_thong_ke_loc(text, integer) is
  'Nhận câu hỏi, tự nhận ra người/nhóm/khu vực đang được hỏi rồi ĐẾM THẬT trên toàn bảng. Kèm mức trung bình để phân biệt quá tải với quá hạn.';

-- =====================================================================
-- Kết luận tải việc bằng LỜI, đừng bắt mô hình tự so sánh số
--
-- Trả về gap_may_lan_trung_binh = 0.31 rồi dặn "dưới 1 là nhẹ hơn mặt
-- bằng" — gpt-4o-mini vẫn kết luận "Nhi đang bị quá tải". Nó đọc thấy
-- 13 việc đang mở, 8 quá hạn, thấy nhiều, nên kết luận theo cảm giác chứ
-- không theo phép so sánh.
--
-- Bài học lặp lại lần thứ ba trong ngày: mô hình nhỏ KHÔNG làm số học và
-- KHÔNG tự phán xét ngưỡng. Cái gì quy được thành luật thì để SQL quyết
-- rồi đưa xuống một câu tiếng Việt gọn — mô hình chỉ việc chép lại.
--
-- Đồng thời đổi tên trường sang tiếng Việt đọc được: mô hình thỉnh
-- thoảng để lộ tên trường ra màn hình ("Gap máy lần trung bình"), tên
-- đọc được thì lộ cũng không thành thảm hoạ.
-- =====================================================================

create or replace function public.rpc_ai_thong_ke_loc(
  p_cau_hoi text,
  p_k       integer default 3
) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $fn$
declare
  v_tk      jsonb := public.rpc_ai_hieu_tu_khoa(p_cau_hoi, 8);
  v_ds      jsonb := '[]'::jsonb;
  v_tb_mo   numeric;
  v_tb_ngay numeric;
  x         jsonb;
  v_loai    text;
  v_gia_tri text;
  v_r       record;
  v_ty      numeric;
  v_muc     text;
  v_nhan    text;
begin
  select round(avg(mo), 1), round(avg(ngay), 1)
  into v_tb_mo, v_tb_ngay
  from (
    select count(*) filter (where computed_status <> 'done') as mo,
           sum(coalesce(effort_days, 0)) filter (where computed_status <> 'done') as ngay
    from public.vmp_plan_items
    where is_active and owner_name is not null
    group by owner_name
  ) t;

  for x in
    select e from jsonb_array_elements(v_tk -> 'nhom') e
    where (e ->> 'so_khop')::int = 1
    order by (e ->> 'so_khop')::int
    limit greatest(1, least(p_k, 5))
  loop
    v_loai := x ->> 'loai';
    v_gia_tri := (x -> 'vi_du' ->> 0);
    if v_gia_tri is null then continue; end if;

    select
      count(*) as tong,
      count(*) filter (where i.computed_status = 'done') as hoan_thanh,
      count(*) filter (where i.computed_status = 'prog') as dang_lam,
      count(*) filter (where i.computed_status in ('plan','todo')) as chua_bat_dau,
      count(*) filter (where i.computed_status = 'over') as qua_han,
      count(*) filter (where i.computed_status <> 'done'
                         and i.deadline_vmp <= current_date + 30) as den_han_30_ngay,
      count(*) filter (where i.computed_status <> 'done'
                         and i.criticality_score >= 7) as dang_mo_trong_yeu_cao,
      round(sum(coalesce(i.effort_days,0)) filter (where i.computed_status <> 'done'), 1) as cong_ngay_con_lai
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

    -- Kết luận tải việc: chỉ có nghĩa khi hỏi về NGƯỜI
    v_muc := null; v_nhan := null; v_ty := null;
    if v_loai = 'nguoi' and coalesce(v_tb_mo, 0) > 0 then
      v_ty := round(((v_r.tong - v_r.hoan_thanh) / v_tb_mo)::numeric, 2);
      v_muc := case
        when v_ty >= 1.5 then 'QUÁ TẢI RÕ RỆT'
        when v_ty >= 1.2 then 'nặng hơn mặt bằng'
        when v_ty >= 0.8 then 'ngang mặt bằng'
        else 'NHẸ HƠN MẶT BẰNG — không quá tải'
      end;
      v_nhan := format(
        '%s hiện ôm %s việc chưa xong, trong khi trung bình mỗi người là %s việc. Vậy %s là %s.',
        v_gia_tri, v_r.tong - v_r.hoan_thanh, v_tb_mo, v_gia_tri, lower(v_muc));
      if v_r.qua_han > 0 then
        v_nhan := v_nhan || format(
          ' Nhưng đó là chuyện tải việc; riêng chuyện trễ hạn thì %s đang có %s hạng mục quá hạn — hai chuyện tách biệt, phải nói cả hai.',
          v_gia_tri, v_r.qua_han);
      else
        v_nhan := v_nhan || format(' Và %s không có hạng mục nào quá hạn.', v_gia_tri);
      end if;
    end if;

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
      'trung_binh_moi_nguoi_dang_mo', case when v_loai='nguoi' then v_tb_mo end,
      'so_lan_so_voi_trung_binh', v_ty,
      -- Hai trường dưới đây là KẾT LUẬN ĐÃ CHỐT. Mô hình chỉ việc chép lại.
      'muc_tai_viec', v_muc,
      'cau_tra_loi_goi_y', v_nhan
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'so_nhom', jsonb_array_length(v_ds),
    'thong_ke', v_ds,
    'giai_thich_tu_khoa', v_tk ->> 'giai_thich',
    'luu_y', 'Các con số ĐẾM THẬT trên toàn bảng — dùng thẳng, đừng cộng trừ lại. '
             || 'Ô "muc_tai_viec" và "cau_tra_loi_goi_y" là KẾT LUẬN ĐÃ CHỐT bằng SQL: '
             || 'cứ theo đó mà nói, TUYỆT ĐỐI không tự phán ngược lại. '
             || 'QUÁ HẠN là việc đã trôi qua hạn (quá khứ); QUÁ TẢI là ôm nhiều việc hơn sức (tương lai).');
end;
$fn$;

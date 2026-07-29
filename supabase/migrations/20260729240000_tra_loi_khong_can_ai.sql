-- =====================================================================
-- LỚP TRẢ LỜI KHÔNG CẦN AI
--
-- Người dùng hỏi đúng: "đôi khi nhất định phải dùng AI không?".
-- Không. Phần lớn câu hỏi hằng ngày về timeline VMP là truy vấn có cấu
-- trúc, và với chúng thì gọi mô hình ngôn ngữ VỪA CHẬM VỪA TỆ HƠN:
--
--   · SQL trả lời trong ~20ms, mô hình mất 3–8 giây
--   · SQL không bao giờ đếm sai, mô hình thì có thể
--   · SQL không tốn hạn mức miễn phí — để dành cho câu thật sự cần suy luận
--
-- Nên đặt một lớp lọc TRƯỚC mô hình. Câu nào khớp mẫu quen thì trả lời
-- thẳng bằng số liệu; câu nào không khớp mới chuyển sang AI.
--
-- Quan trọng: lớp này chỉ nhận khi CHẮC CHẮN hiểu đúng ý. Thà trả
-- khop=false để AI xử lý, còn hơn đoán bừa rồi trả lời lệch câu hỏi.
-- =====================================================================

create or replace function public.rpc_ai_tra_loi_nhanh(
  p_question text,
  p_year integer default null
) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_year integer := coalesce(p_year, extract(year from now())::integer);
  q      text    := public.vmp_khong_dau(coalesce(p_question, ''));
  v_tl   text;
  v_ds   text;
  v_n    integer;
  v_r    record;
begin
  -- ---------------------------------------------------------------
  -- 1. Đếm quá hạn
  -- ---------------------------------------------------------------
  if q ~ '(bao nhieu|may|so luong|dem).*(qua han|tre han)'
     or q ~ '(qua han|tre han).*(bao nhieu|may cai|so luong)' then
    select count(*) into v_n from vmp_plan_items
    where year = v_year and is_active and computed_status = 'over';

    select string_agg('· ' || p.validation_code || ' — ' || o.name
                      || ' (' || coalesce(p.owner_name, 'chưa phân QA') || ', trễ '
                      || (current_date - p.deadline_vmp) || ' ngày)', E'\n')
    into v_ds
    from (select * from vmp_plan_items
          where year = v_year and is_active and computed_status = 'over'
          order by criticality_score desc nulls last, deadline_vmp
          limit 5) p
    join vmp_objects o on o.code = p.object_code;

    v_tl := 'Hiện có **' || v_n || ' hạng mục quá hạn** trong kế hoạch ' || v_year || '.'
         || case when v_n > 0 then E'\n\nNăm nhóm cần xử lý trước (trọng yếu cao nhất, trễ lâu nhất):\n'
                                   || coalesce(v_ds, '') else '' end;
    return jsonb_build_object('khop', true, 'y_dinh', 'dem_qua_han', 'tra_loi', v_tl);
  end if;

  -- ---------------------------------------------------------------
  -- 2. Tỷ lệ hoàn thành
  -- ---------------------------------------------------------------
  if q ~ '(ty le|phan tram|bao nhieu %|tien do chung).*(hoan thanh|xong)'
     or q ~ '(hoan thanh|xong).*(bao nhieu phan tram|ty le)' then
    select 'Kế hoạch ' || v_year || ' đã hoàn thành **'
        || round(100.0 * count(*) filter (where computed_status = 'done')
                 / nullif(count(*), 0)) || '%** — '
        || count(*) filter (where computed_status = 'done') || '/' || count(*)
        || ' hạng mục.' || E'\n\n'
        || '· Quá hạn: ' || count(*) filter (where computed_status = 'over') || E'\n'
        || '· Đang làm: ' || count(*) filter (where computed_status = 'prog') || E'\n'
        || '· Chưa bắt đầu: ' || count(*) filter (where computed_status in ('todo','plan'))
    into v_tl
    from vmp_plan_items where year = v_year and is_active;
    return jsonb_build_object('khop', true, 'y_dinh', 'ty_le_hoan_thanh', 'tra_loi', v_tl);
  end if;

  -- ---------------------------------------------------------------
  -- 3. Ai đang nhiều việc nhất
  -- ---------------------------------------------------------------
  if q ~ '(ai|nguoi nao).*(nhieu viec|nhieu nhat|ganh|tai nhat|ban nhat)'
     or q ~ 'phan cong.*(nhieu nhat|ai)' then
    select string_agg('· **' || nguoi || '** — ' || tong || ' hạng mục ('
                      || xong || ' xong, ' || tre || ' quá hạn)', E'\n' order by tong desc)
    into v_ds
    from (
      select coalesce(owner_name, '(chưa phân công)') nguoi, count(*) tong,
             count(*) filter (where computed_status = 'done') xong,
             count(*) filter (where computed_status = 'over') tre
      from vmp_plan_items where year = v_year and is_active
      group by 1 order by count(*) desc limit 8) t;
    v_tl := 'Khối lượng theo người phụ trách, kế hoạch ' || v_year || E':\n\n' || coalesce(v_ds, '(chưa có dữ liệu)');
    return jsonb_build_object('khop', true, 'y_dinh', 'tai_theo_nguoi', 'tra_loi', v_tl);
  end if;

  -- ---------------------------------------------------------------
  -- 4. Chưa có QA phụ trách
  -- ---------------------------------------------------------------
  if q ~ '(chua co|thieu|khong co).*(qa|nguoi phu trach|phan cong)'
     or q ~ 'chua phan cong' then
    select count(*) into v_n from vmp_plan_items
    where year = v_year and is_active and owner_name is null;

    select string_agg('· ' || bp || ' / ' || coalesce(kv, '—') || ' — ' || n || ' hạng mục', E'\n')
    into v_ds
    from (select o.department bp, o.area kv, count(*) n
          from vmp_plan_items p join vmp_objects o on o.code = p.object_code
          where p.year = v_year and p.is_active and p.owner_name is null
          group by 1, 2 order by count(*) desc limit 8) t;

    v_tl := 'Có **' || v_n || ' hạng mục chưa có QA phụ trách**.'
         || case when v_n > 0 then E'\n\nTập trung ở:\n' || coalesce(v_ds, '')
                 || E'\n\nCách gán nhanh: vào "Danh mục & Nhập liệu", bấm ▼ ở cột Bộ phận '
                 || 'để lọc, chọn tất cả rồi dùng "Đặt giá trị hàng loạt".' else '' end;
    return jsonb_build_object('khop', true, 'y_dinh', 'thieu_qa', 'tra_loi', v_tl);
  end if;

  -- ---------------------------------------------------------------
  -- 5. Sắp đến hạn
  -- ---------------------------------------------------------------
  if q ~ '(sap|gan|toi).*(den han|toi han|dao han|het han)'
     or q ~ 'han trong (30|mot thang|thang toi)' then
    select count(*) into v_n from vmp_plan_items
    where year = v_year and is_active and computed_status <> 'done'
      and deadline_vmp between current_date and current_date + 30;

    select string_agg('· ' || p.validation_code || ' — ' || o.name || ' (còn '
                      || (p.deadline_vmp - current_date) || ' ngày, '
                      || coalesce(p.owner_name, 'chưa phân QA') || ')', E'\n')
    into v_ds
    from (select * from vmp_plan_items
          where year = v_year and is_active and computed_status <> 'done'
            and deadline_vmp between current_date and current_date + 30
          order by deadline_vmp limit 8) p
    join vmp_objects o on o.code = p.object_code;

    v_tl := 'Có **' || v_n || ' hạng mục đến hạn trong 30 ngày tới**.'
         || case when v_n > 0 then E'\n\n' || coalesce(v_ds, '') else '' end;
    return jsonb_build_object('khop', true, 'y_dinh', 'sap_den_han', 'tra_loi', v_tl);
  end if;

  -- ---------------------------------------------------------------
  -- 6. Nhóm trọng yếu cao
  -- ---------------------------------------------------------------
  if q ~ '(trong yeu|diem 9|diem cao|uu tien).*(bao nhieu|the nao|toi dau|tien do)'
     or q ~ 'nhom (trong yeu|uu tien) (cao|9)' then
    select string_agg('· **' || muc || '** — ' || tong || ' hạng mục, xong ' || xong
                      || ' (' || round(100.0 * xong / nullif(tong, 0)) || '%), quá hạn ' || tre,
                      E'\n' order by muc desc)
    into v_ds
    from (
      select case when criticality_score >= 7 then '7–9 (cao)'
                  when criticality_score >= 4 then '4–6 (trung bình)'
                  else '1–3 (thấp)' end muc,
             count(*) tong,
             count(*) filter (where computed_status = 'done') xong,
             count(*) filter (where computed_status = 'over') tre
      from vmp_plan_items
      where year = v_year and is_active and criticality_score is not null
      group by 1) t;
    v_tl := 'Tiến độ theo mức trọng yếu (điểm = phức tạp × ảnh hưởng chất lượng):'
         || E'\n\n' || coalesce(v_ds, '(chưa chấm điểm)');
    return jsonb_build_object('khop', true, 'y_dinh', 'theo_trong_yeu', 'tra_loi', v_tl);
  end if;

  -- ---------------------------------------------------------------
  -- 7. Hỏi về MỘT đối tượng cụ thể — nhận diện qua mã trong câu hỏi
  --
  -- Chỉ nhận khi tìm thấy ĐÚNG MỘT đối tượng khớp. Nhiều hơn một thì
  -- nhường cho AI, vì lúc đó cần hiểu người dùng muốn cái nào.
  -- ---------------------------------------------------------------
  select o.code, o.name, o.department, o.area, o.frequency_months,
         count(*) over () as so_khop
  into v_r
  from vmp_objects o
  where o.is_active
    and length(o.code) >= 4
    and q like '%' || public.vmp_khong_dau(o.code) || '%'
  limit 2;

  if found and v_r.so_khop = 1 then
    select owner_name, criticality_score into v_tl, v_n
    from vmp_plan_items
    where object_code = v_r.code and year = v_year and is_active limit 1;

    return jsonb_build_object('khop', true, 'y_dinh', 'mot_doi_tuong', 'tra_loi',
      '**' || v_r.name || '** (' || v_r.code || ')' || E'\n\n'
      || '· Bộ phận: ' || coalesce(v_r.department, '—')
      || ' · Khu vực: ' || coalesce(v_r.area, '—')
      || ' · Tần suất: ' || coalesce(v_r.frequency_months::text, '—') || ' tháng' || E'\n'
      || '· QA phụ trách: ' || coalesce(v_tl, '**chưa phân công**')
      || ' · Điểm trọng yếu: ' || coalesce(v_n::text, '—') || E'\n\n'
      || 'Các hạng mục thẩm định năm ' || v_year || E':\n'
      || coalesce((
           select string_agg('· ' || p.validation_type || ' — hạn '
                             || to_char(p.deadline_vmp, 'DD/MM/YYYY') || ', '
                             || coalesce(p.status_vmp_text, '—')
                             || case when p.computed_status = 'over'
                                     then ' (QUÁ HẠN ' || (current_date - p.deadline_vmp) || ' ngày)'
                                     else '' end, E'\n' order by p.deadline_vmp)
           from vmp_plan_items p
           where p.object_code = v_r.code and p.year = v_year and p.is_active),
         '(không có hạng mục nào trong năm này)'));
  end if;

  -- Không khớp mẫu nào → để AI xử lý
  return jsonb_build_object('khop', false, 'y_dinh', null, 'tra_loi', null);
end;
$fn$;

comment on function public.rpc_ai_tra_loi_nhanh(text, integer) is
  'Trả lời thẳng bằng SQL các câu hỏi có mẫu quen, KHÔNG gọi mô hình. '
  'Trả khop=false khi không chắc hiểu đúng ý — lúc đó mới chuyển sang AI. '
  'Mục đích: nhanh hơn, không bao giờ đếm sai, và để dành hạn mức miễn phí.';

revoke execute on function public.rpc_ai_tra_loi_nhanh(text, integer) from anon, public;
grant  execute on function public.rpc_ai_tra_loi_nhanh(text, integer)
  to authenticated, service_role;

-- Ghi nhận đường nào đã trả lời, để sau này biết lớp lọc gánh được bao nhiêu
alter table public.vmp_ai_chat_log
  add column if not exists duong_tra_loi text,   -- 'sql' | 'gemini' | 'du_phong'
  add column if not exists y_dinh text;

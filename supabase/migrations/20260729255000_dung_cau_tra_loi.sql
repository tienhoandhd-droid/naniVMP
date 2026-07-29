-- =====================================================================
-- DỰNG CÂU TRẢ LỜI TỪ KẾT QUẢ TỰ NHẬN DIỆN
--
-- Nhận (chỉ số × chiều × bộ lọc) do rpc_ai_hieu_cau_hoi phân tích ra,
-- rồi dựng đúng một câu truy vấn. Không có bảy hàm viết tay cho bảy mẫu
-- câu — chỉ một bộ dựng, nên thêm chiều hay bộ lọc mới là dùng được cho
-- MỌI kiểu câu hỏi, không phải viết lại từng cái.
--
-- Giọng văn: công chúa Vali — dễ thương, ngoan, nhưng con số thì tuyệt
-- đối chính xác vì chúng do SQL đếm chứ không phải mô hình đoán.
-- =====================================================================

create or replace function public.rpc_ai_dung_cau_tra_loi(
  p_question text, p_hieu jsonb, p_year integer default null
) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_year   integer := coalesce(p_year, extract(year from now())::integer);
  v_loc    jsonb   := coalesce(p_hieu->'loc', '{}'::jsonb);
  v_chi_so text    := p_hieu->>'chi_so';
  v_chieu  text    := p_hieu->>'chieu';
  v_where  text    := 'p.year = ' || v_year || ' and p.is_active';
  v_mo_ta  text    := '';
  v_cot    text;
  v_sql    text;
  v_tl     text;
  v_n      integer;
  v_xong   integer;
begin
  -- ---- Dựng mệnh đề lọc từ những gì đã nhận diện ----
  if v_loc ? 'trang_thai' then
    v_where := v_where || format(' and p.computed_status = %L', v_loc->>'trang_thai');
    v_mo_ta := v_mo_ta || case v_loc->>'trang_thai'
                            when 'over' then ' đang quá hạn'
                            when 'done' then ' đã hoàn thành'
                            when 'prog' then ' đang làm'
                            else ' chưa bắt đầu' end;
  end if;
  if v_loc ? 'han_ngay' then
    v_where := v_where || format(
      ' and p.computed_status <> ''done'' and p.deadline_vmp between current_date and current_date + %s',
      (v_loc->>'han_ngay')::integer);
    v_mo_ta := v_mo_ta || ' đến hạn trong ' || (v_loc->>'han_ngay') || ' ngày tới';
  end if;
  if v_loc ? 'chua_co_qa' then
    v_where := v_where || ' and p.owner_name is null';
    v_mo_ta := v_mo_ta || ' chưa có QA phụ trách';
  end if;
  if v_loc ? 'nguoi' then
    v_where := v_where || format(' and p.owner_name = %L', v_loc->>'nguoi');
    v_mo_ta := v_mo_ta || ' của ' || (v_loc->>'nguoi');
  end if;
  if v_loc ? 'nhom_viec' then
    v_where := v_where || format(' and p.work_group = %L', v_loc->>'nhom_viec');
    v_mo_ta := v_mo_ta || ' thuộc nhóm ' || (v_loc->>'nhom_viec');
  end if;
  if v_loc ? 'loai_td' then
    v_where := v_where || format(' and p.validation_type = %L', v_loc->>'loai_td');
    v_mo_ta := v_mo_ta || ' loại ' || (v_loc->>'loai_td');
  end if;
  if v_loc ? 'bo_phan' then
    v_where := v_where || format(' and o.department = %L', v_loc->>'bo_phan');
    v_mo_ta := v_mo_ta || ' ở bộ phận ' || (v_loc->>'bo_phan');
  end if;
  if v_loc ? 'khu_vuc' then
    v_where := v_where || format(' and o.area = %L', v_loc->>'khu_vuc');
    v_mo_ta := v_mo_ta || ' ở khu ' || (v_loc->>'khu_vuc');
  end if;
  if v_loc ? 'line' then
    v_where := v_where || format(' and o.line = %L', v_loc->>'line');
    v_mo_ta := v_mo_ta || ' trên dây chuyền ' || (v_loc->>'line');
  end if;
  if v_loc ? 'ma' then
    v_where := v_where || format(' and p.object_code = %L', v_loc->>'ma');
  end if;
  if v_loc ? 'ten_doi_tuong' and not (v_loc ? 'ma') then
    v_where := v_where || format(' and o.name = %L', v_loc->>'ten_doi_tuong');
  end if;

  -- ---- CHI TIẾT một đối tượng ----
  if v_chi_so = 'chi_tiet' then
    execute format($q$
      select 'Dạ, %1$s đây ạ 💕' || E'\n\n'
          || '· Bộ phận: ' || coalesce(max(o.department), '—')
          || ' · Khu vực: ' || coalesce(max(o.area), '—')
          || ' · Tần suất: ' || coalesce(max(o.frequency_months)::text, '—') || ' tháng' || E'\n'
          || '· QA phụ trách: ' || coalesce(max(p.owner_name), 'chưa có ai nhận ạ')
          || ' · Điểm trọng yếu: ' || coalesce(max(p.criticality_score)::text, '—') || E'\n\n'
          || 'Các hạng mục thẩm định năm %2$s:' || E'\n'
          || coalesce(string_agg('· ' || p.validation_type || ' — hạn '
                 || to_char(p.deadline_vmp, 'DD/MM/YYYY') || ', '
                 || coalesce(p.status_vmp_text, '—')
                 || case when p.computed_status = 'over'
                         then ' (quá hạn ' || (current_date - p.deadline_vmp) || ' ngày rồi ạ 😢)'
                         else '' end, E'\n' order by p.deadline_vmp),
             'chưa có hạng mục nào ạ')
      from vmp_plan_items p join vmp_objects o on o.code = p.object_code
      where %3$s
    $q$, coalesce(v_loc->>'ten_doi_tuong', v_loc->>'ma'), v_year, v_where) into v_tl;
    return jsonb_build_object('khop', true, 'y_dinh', 'chi_tiet', 'nguon', 'sql', 'tra_loi', v_tl);
  end if;

  -- ---- CHIA THEO CHIỀU ----
  if v_chieu is not null then
    v_cot := case v_chieu
      when 'nguoi'     then 'coalesce(p.owner_name, ''(chưa phân công)'')'
      when 'bo_phan'   then 'coalesce(o.department, ''(chưa rõ)'')'
      when 'khu_vuc'   then 'coalesce(o.area, ''(chưa rõ)'')'
      when 'loai_td'   then 'p.validation_type'
      when 'nhom_viec' then 'coalesce(p.work_group, ''(chưa phân nhóm)'')'
      else 'case when p.criticality_score >= 7 then ''7–9 (cao)''
                 when p.criticality_score >= 4 then ''4–6 (trung bình)''
                 else ''1–3 (thấp)'' end' end;

    v_sql := format($q$
      select coalesce(string_agg('· **' || nhan || '** — ' || tong || ' hạng mục'
               || case when %2$L = 'ty_le'
                       then ', xong ' || xong || ' (' || round(100.0*xong/nullif(tong,0)) || '%%)'
                       else '' end
               || case when tre > 0 then ', quá hạn ' || tre else '' end,
               E'\n' order by tong desc), 'chưa có dữ liệu ạ')
      from (
        select %1$s as nhan, count(*) tong,
               count(*) filter (where p.computed_status = 'done') xong,
               count(*) filter (where p.computed_status = 'over') tre
        from vmp_plan_items p join vmp_objects o on o.code = p.object_code
        where %3$s group by 1) t
    $q$, v_cot, v_chi_so, v_where);
    execute v_sql into v_tl;

    return jsonb_build_object('khop', true, 'y_dinh', 'nhom_theo_' || v_chieu,
      'nguon', 'sql',
      'tra_loi', 'Dạ em xin thưa, hạng mục' || v_mo_ta || ' chia theo '
                 || case v_chieu when 'nguoi' then 'người phụ trách'
                                 when 'bo_phan' then 'bộ phận'
                                 when 'khu_vuc' then 'khu vực'
                                 when 'loai_td' then 'loại thẩm định'
                                 when 'nhom_viec' then 'nhóm việc'
                                 else 'mức trọng yếu' end
                 || ' như sau ạ 🌸' || E'\n\n' || v_tl);
  end if;

  -- ---- LIỆT KÊ ----
  if v_chi_so = 'liet_ke' then
    -- Đếm và liệt kê phải tách làm hai: gộp count(*) over () với
    -- string_agg trong cùng một select rồi limit thì con số và danh sách
    -- không còn khớp nhau.
    execute format($q$
      select count(*) from vmp_plan_items p
      join vmp_objects o on o.code = p.object_code where %s
    $q$, v_where) into v_n;

    execute format($q$
      select string_agg('· ' || validation_code || ' — ' || ten
             || ' (' || qa || ', hạn ' || han || ')', E'\n')
      from (
        select p.validation_code, o.name ten,
               coalesce(p.owner_name, 'chưa có QA') qa,
               to_char(p.deadline_vmp, 'DD/MM') han, p.deadline_vmp
        from vmp_plan_items p join vmp_objects o on o.code = p.object_code
        where %s order by p.deadline_vmp limit 15) t
    $q$, v_where) into v_tl;

    return jsonb_build_object('khop', true, 'y_dinh', 'liet_ke', 'nguon', 'sql',
      'tra_loi', 'Dạ, em tìm được **' || coalesce(v_n, 0) || ' hạng mục'
                 || v_mo_ta || '** ạ 🌸' || E'\n\n' || coalesce(v_tl, '(không có mục nào ạ)')
                 || case when coalesce(v_n, 0) > 15
                         then E'\n\n…và ' || (v_n - 15) || ' mục nữa ạ, em hiển thị 15 mục đầu thôi nhé.'
                         else '' end);
  end if;

  -- ---- ĐẾM / TỶ LỆ, không chia chiều ----
  execute format($q$
    select count(*), count(*) filter (where p.computed_status = 'done')
    from vmp_plan_items p join vmp_objects o on o.code = p.object_code
    where %s
  $q$, v_where) into v_n, v_xong;

  if v_chi_so = 'ty_le' then
    v_tl := 'Dạ, hạng mục' || v_mo_ta || ' đã hoàn thành **'
         || coalesce(round(100.0 * v_xong / nullif(v_n, 0))::text, '0')
         || '%** ạ — ' || v_xong || '/' || v_n || ' mục 🌸';
  else
    v_tl := 'Dạ, hiện có **' || v_n || ' hạng mục' || v_mo_ta || '** ạ '
         || case when v_n = 0 then '— sạch sẽ lắm ạ 🎉'
                 when v_loc->>'trang_thai' = 'over' then '😢' else '🌸' end;
  end if;

  return jsonb_build_object('khop', true, 'y_dinh', coalesce(v_chi_so, 'dem'),
    'nguon', 'sql', 'tra_loi', v_tl);
end;
$fn$;

revoke execute on function public.rpc_ai_dung_cau_tra_loi(text, jsonb, integer) from anon, public;
grant  execute on function public.rpc_ai_dung_cau_tra_loi(text, jsonb, integer)
  to authenticated, service_role;

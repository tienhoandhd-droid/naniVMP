-- =====================================================================
-- HỎI LẠI KHI MƠ HỒ, VÀ GỢI Ý CÂU TIẾP THEO
--
-- Hai thứ làm trợ lý bớt máy móc, và cả hai đều KHÔNG cần gọi mô hình:
--
-- 1) HỎI LẠI thay vì đoán bừa
--    "LAF cân ở đâu?" khớp 4 buồng cân khác nhau. Bản cũ chọn đại một
--    cái rồi trả lời rất tự tin — người hỏi không có cách nào biết là
--    đang xem nhầm thiết bị. Nay liệt kê ra và hỏi lại.
--
-- 2) GỢI Ý CÂU TIẾP dựa trên chính câu vừa trả lời
--    Người mới không biết hệ thống trả lời được gì. Đưa 2–3 câu tiếp
--    theo bám sát ngữ cảnh vừa rồi thì họ đi sâu được, thay vì phải tự
--    nghĩ ra câu hỏi đúng cú pháp.
--
-- Gợi ý sinh từ DỮ LIỆU THẬT, không phải danh sách cố định: hỏi về một
-- thiết bị thì gợi ý theo đúng khu vực và QA của thiết bị đó.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Phát hiện mơ hồ: một cụm khớp nhiều đối tượng
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_kiem_mo_ho(p_question text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  q      text := ' ' || public.vmp_khong_dau(coalesce(p_question, '')) || ' ';
  v_cum  text;
  v_ds   jsonb;
  v_n    integer;
begin
  -- Tìm cụm dài nhất trong câu hỏi có khớp tên đối tượng
  select khoa into v_cum
  from public.vmp_ai_tu_dien
  where loai = 'ten_doi_tuong' and length(khoa) >= 4 and q like '%' || khoa || '%'
  order by length(khoa) desc limit 1;

  if v_cum is null then
    return jsonb_build_object('mo_ho', false);
  end if;

  -- Bao nhiêu đối tượng cùng chứa cụm đó?
  select count(*) into v_n
  from public.vmp_objects o
  where o.is_active and public.vmp_khong_dau(o.name) like '%' || v_cum || '%';

  if v_n <= 1 then
    return jsonb_build_object('mo_ho', false);
  end if;

  select jsonb_agg(jsonb_build_object(
           'ma', o.code, 'ten', o.name,
           'khu_vuc', coalesce(o.area, '—'), 'line', coalesce(o.line, '—'))
         order by o.code)
  into v_ds
  from public.vmp_objects o
  where o.is_active and public.vmp_khong_dau(o.name) like '%' || v_cum || '%';

  return jsonb_build_object(
    'mo_ho', true, 'cum', v_cum, 'so_khop', v_n, 'lua_chon', v_ds,
    'cau_hoi_lai',
      'Dạ, em thấy có **' || v_n || ' thiết bị** khớp với ý anh/chị ạ 🌸 '
      || 'Anh/chị muốn hỏi cái nào ạ?' || E'\n\n'
      || (select string_agg('· **' || (e->>'ma') || '** — ' || (e->>'ten')
                            || ' (khu ' || (e->>'khu_vuc') || ', ' || (e->>'line') || ')', E'\n')
          from jsonb_array_elements(v_ds) e)
      || E'\n\nAnh/chị nhắn lại mã giúp em nhé, ví dụ "'
      || (v_ds->0->>'ma') || ' tới hạn khi nào".');
end;
$fn$;

-- ---------------------------------------------------------------------
-- 2. Gợi ý câu hỏi tiếp theo, bám ngữ cảnh vừa trả lời
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_goi_y_tiep(
  p_hieu jsonb, p_year integer default null
) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_year integer := coalesce(p_year, extract(year from now())::integer);
  v_loc  jsonb   := coalesce(p_hieu->'loc', '{}'::jsonb);
  v_chi  text    := p_hieu->>'chi_so';
  v_gy   text[]  := '{}';
  v_ma   text;
  v_qa   text;
  v_kv   text;
begin
  -- Vừa hỏi về MỘT đối tượng → gợi ý đi ngang: cùng khu, cùng người phụ
  -- trách, và lịch tái thẩm định của chính nó
  if v_loc ? 'ma' or v_loc ? 'ten_doi_tuong' then
    select p.object_code, p.owner_name, o.area into v_ma, v_qa, v_kv
    from vmp_plan_items p join vmp_objects o on o.code = p.object_code
    where p.year = v_year and p.is_active
      and (p.object_code = v_loc->>'ma' or o.name = v_loc->>'ten_doi_tuong')
    limit 1;

    if v_kv is not null then
      v_gy := array_append(v_gy, 'Khu ' || v_kv || ' còn hạng mục nào quá hạn?');
    end if;
    if v_qa is not null then
      v_gy := array_append(v_gy, 'Tỷ lệ hoàn thành của ' || v_qa || ' là bao nhiêu?');
    else
      v_gy := array_append(v_gy, 'Còn bao nhiêu hạng mục chưa có QA phụ trách?');
    end if;
    v_gy := array_append(v_gy, 'Vì sao ' || coalesce(v_loc->>'ten_doi_tuong', v_ma)
                               || ' được chấm điểm trọng yếu như vậy?');

  -- Vừa hỏi về quá hạn → gợi ý đi sâu vào nguyên nhân và ai gánh
  elsif v_loc->>'trang_thai' = 'over' then
    v_gy := array_append(v_gy, 'Quá hạn chia theo người phụ trách thế nào?');
    v_gy := array_append(v_gy, 'Nhóm trọng yếu 7–9 quá hạn bao nhiêu?');
    v_gy := array_append(v_gy, 'Liệt kê hạng mục sắp đến hạn 30 ngày');

  -- Vừa xem theo người → gợi ý so sang nhóm việc và tải sắp tới
  elsif p_hieu->>'chieu' = 'nguoi' or (v_loc ? 'nguoi') then
    v_gy := array_append(v_gy, 'Tỷ lệ hoàn thành theo nhóm việc');
    v_gy := array_append(v_gy, 'Liệt kê hạng mục sắp đến hạn 30 ngày');
    v_gy := array_append(v_gy, 'Còn bao nhiêu hạng mục chưa có QA phụ trách?');

  -- Vừa đếm chung → gợi ý bóc tách
  elsif v_chi in ('dem', 'ty_le') then
    v_gy := array_append(v_gy, 'Chia theo người phụ trách xem thế nào?');
    v_gy := array_append(v_gy, 'Nhóm trọng yếu 7–9 đang tới đâu?');
    v_gy := array_append(v_gy, 'Còn bao nhiêu hạng mục quá hạn?');

  else
    v_gy := array_append(v_gy, 'Còn bao nhiêu hạng mục quá hạn?');
    v_gy := array_append(v_gy, 'Tỷ lệ hoàn thành theo người phụ trách');
    v_gy := array_append(v_gy, 'Liệt kê hạng mục sắp đến hạn 30 ngày');
  end if;

  return to_jsonb(v_gy);
end;
$fn$;

-- ---------------------------------------------------------------------
-- 3. Nối vào đường trả lời nhanh
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_tra_loi_nhanh(
  p_question text,
  p_year integer default null
) returns jsonb
language plpgsql volatile security definer set search_path = public
as $fn$
declare
  v_moho jsonb;
  v_hieu jsonb;
  v_dem  jsonb;
  v_kq   jsonb;
begin
  -- 0. Mơ hồ thì HỎI LẠI, không đoán. Trả lời sai một cách tự tin còn
  --    tệ hơn hỏi thêm một câu.
  v_moho := public.rpc_ai_kiem_mo_ho(p_question);
  if (v_moho->>'mo_ho')::boolean then
    return jsonb_build_object(
      'khop', true, 'y_dinh', 'hoi_lai', 'nguon', 'sql',
      'tra_loi', v_moho->>'cau_hoi_lai',
      'goi_y', (select jsonb_agg((e->>'ma') || ' tới hạn khi nào?')
                from jsonb_array_elements(v_moho->'lua_chon') e),
      'vi_sao', 'Cụm "' || (v_moho->>'cum') || '" khớp '
                || (v_moho->>'so_khop') || ' thiết bị — hỏi lại cho chắc.');
  end if;

  v_hieu := public.rpc_ai_hieu_cau_hoi(p_question);

  -- 1. Hiểu được từ dữ liệu → dựng câu trả lời, không tốn AI
  if not (v_hieu->>'can_ai')::boolean then
    v_kq := public.rpc_ai_dung_cau_tra_loi(p_question, v_hieu, p_year);
    return v_kq
      || jsonb_build_object('vi_sao', v_hieu->>'vi_sao')
      || jsonb_build_object('goi_y', public.rpc_ai_goi_y_tiep(v_hieu, p_year));
  end if;

  -- 2. Cần AI — đã hỏi rồi mà dữ liệu chưa đổi thì dùng lại
  v_dem := public.rpc_ai_cache_doc(p_question);
  if (v_dem->>'trung')::boolean then
    return jsonb_build_object(
      'khop', true, 'y_dinh', 'dem', 'nguon', 'dem',
      'tra_loi', v_dem->>'tra_loi',
      'goi_y', public.rpc_ai_goi_y_tiep(v_hieu, p_year),
      'vi_sao', 'Câu này đã hỏi trước đó và dữ liệu chưa đổi kể từ lúc đó '
                || '(' || to_char((v_dem->>'tao_luc')::timestamptz, 'HH24:MI DD/MM') || ') '
                || '— dùng lại câu trả lời cũ, không gọi AI.');
  end if;

  -- 3. Nhường AI, kèm sẵn gợi ý để web hiện sau khi mô hình trả lời
  return jsonb_build_object('khop', false, 'y_dinh', null, 'tra_loi', null,
    'goi_y', public.rpc_ai_goi_y_tiep(v_hieu, p_year),
    'vi_sao', v_hieu->>'vi_sao');
end;
$fn$;

revoke execute on function public.rpc_ai_kiem_mo_ho(text) from anon, public;
revoke execute on function public.rpc_ai_goi_y_tiep(jsonb, integer) from anon, public;
revoke execute on function public.rpc_ai_tra_loi_nhanh(text, integer) from anon, public;
grant execute on function public.rpc_ai_kiem_mo_ho(text) to authenticated, service_role;
grant execute on function public.rpc_ai_goi_y_tiep(jsonb, integer) to authenticated, service_role;
grant execute on function public.rpc_ai_tra_loi_nhanh(text, integer) to authenticated, service_role;

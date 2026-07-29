-- =====================================================================
-- VALI BIẾT NGƯỜI ĐANG NÓI CHUYỆN VỚI MÌNH
--
-- Người dùng hỏi "Tôi là ai?" và "Tôi đang có quyền gì?" — Vali trả lời
-- "không thấy trong dữ liệu". Sai ở thiết kế, không phải ở mô hình: web
-- BIẾT rõ người đăng nhập (tên, email, vai trò, bộ phận) nhưng chưa bao
-- giờ gửi thông tin đó sang, nên trợ lý đang nói chuyện với một người vô
-- danh.
--
-- Thêm hai nhóm câu trả lời được ngay bằng SQL, không tốn AI:
--
--   · VỀ NGƯỜI HỎI — bạn là ai, quyền gì, phụ trách bao nhiêu hạng mục,
--     tiến độ của riêng bạn ra sao
--   · VỀ CHÍNH VALI — em là ai, em làm được gì, em lấy số ở đâu
--
-- Cả hai đều là câu người mới hỏi đầu tiên. Trả lời trống ở đúng câu đầu
-- tiên khiến người ta nghĩ hệ thống rỗng và không quay lại nữa.
-- =====================================================================

create or replace function public.rpc_ai_ve_nguoi_hoi(
  p_question text, p_nguoi jsonb, p_year integer default null
) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_year integer := coalesce(p_year, extract(year from now())::integer);
  q      text    := public.vmp_khong_dau(coalesce(p_question, ''));
  ten    text    := nullif(trim(coalesce(p_nguoi->>'ten', '')), '');
  email  text    := nullif(trim(coalesce(p_nguoi->>'email', '')), '');
  quyen  text    := coalesce(p_nguoi->>'quyen', '');
  bophan text    := nullif(trim(coalesce(p_nguoi->>'bo_phan', '')), '');
  v_tong integer; v_xong integer; v_tre integer;
  v_tl   text;
begin
  -- ---- VỀ CHÍNH VALI ----
  if q ~ '(ban la ai|em la ai|gioi thieu|ban lam duoc gi|em lam duoc gi|giup duoc gi|co the lam gi|chuc nang)' then
    return jsonb_build_object('khop', true, 'y_dinh', 've_vali', 'nguon', 'sql',
      'tra_loi',
      'Dạ, em là **Vali** — trợ lý của hệ giám sát thẩm định VMP ở CPC1 Hà Nội ạ 🌸' || E'\n\n'
      || 'Em giúp anh/chị được mấy việc này:' || E'\n'
      || '· Tra tiến độ — bao nhiêu hạng mục quá hạn, xong bao nhiêu phần trăm, sắp tới có gì đến hạn' || E'\n'
      || '· Tra theo người, theo bộ phận, theo khu vực, theo nhóm việc' || E'\n'
      || '· Tra một thiết bị cụ thể — ai phụ trách, hạn khi nào, điểm trọng yếu bao nhiêu' || E'\n'
      || '· Giải thích luật — cách tính hạn đề cương, cách chấm điểm trọng yếu, các yêu cầu GMP' || E'\n\n'
      || 'Có một điều em xin thưa trước: **em không bao giờ tự nghĩ ra con số**. '
      || 'Mọi con số em đọc thẳng từ database, câu nào không có dữ liệu thì em '
      || 'nói thật là không có, chứ em không đoán ạ. Đây là hồ sơ GMP, một con '
      || 'số sai là thành sai lệch hồ sơ.',
      'goi_y', jsonb_build_array(
        'Tôi đang có quyền gì?',
        'Còn bao nhiêu hạng mục quá hạn?',
        'Deadline đề cương được tính thế nào?'));
  end if;

  if q ~ '(lay so o dau|so lieu tu dau|co chinh xac|tin duoc khong|co dung khong)' then
    return jsonb_build_object('khop', true, 'y_dinh', 've_nguon_so', 'nguon', 'sql',
      'tra_loi',
      'Dạ, mọi con số em nói đều tính bằng SQL trên **toàn bộ bảng** trong '
      || 'Supabase, ngay lúc anh/chị hỏi ạ 🌸' || E'\n\n'
      || 'Em không lấy mẫu, không nhớ số cũ, và không tự cộng trừ. Nếu có câu '
      || 'nào em phải nhờ mô hình AI diễn đạt, thì con số trong đó vẫn do '
      || 'database đưa sang chứ mô hình không được tự tính ạ.' || E'\n\n'
      || 'Anh/chị cứ đối chiếu lại trên bảng bất cứ lúc nào — nếu lệch thì làm '
      || 'ơn báo em, vì lúc đó là dữ liệu có vấn đề chứ không phải em nói sai ạ.');
  end if;

  -- ---- VỀ NGƯỜI HỎI ----
  if q ~ '(toi la ai|minh la ai|ten toi|toi ten gi|em biet toi|biet toi la ai)' then
    if ten is null and email is null then
      return jsonb_build_object('khop', true, 'y_dinh', 've_toi', 'nguon', 'sql',
        'tra_loi', 'Dạ em chưa nhận được thông tin đăng nhập của anh/chị ạ 🌸 '
                || 'Anh/chị thử tải lại trang rồi hỏi em lần nữa giúp em nhé.');
    end if;

    select count(*), count(*) filter (where computed_status = 'done'),
           count(*) filter (where computed_status = 'over')
      into v_tong, v_xong, v_tre
    from vmp_plan_items
    where year = v_year and is_active
      and (owner_name = ten or secondary_owner = ten);

    v_tl := 'Dạ, anh/chị là **' || coalesce(ten, email) || '**'
         || case when bophan is not null then ', bộ phận ' || bophan else '' end
         || ' ạ 🌸' || E'\n\n'
         || '· Quyền trên hệ thống: **'
         || case quyen when 'admin' then 'Quản trị — toàn quyền đọc, nhập, sửa, xoá, sinh timeline, chấm điểm'
                       when 'edit'  then 'Nhập liệu — cập nhật tiến độ và sửa danh mục'
                       when 'view'  then 'Chỉ đọc — xem được mọi màn nhưng không sửa'
                       else coalesce(nullif(quyen, ''), 'chưa rõ') end || '**';

    if v_tong > 0 then
      v_tl := v_tl || E'\n· Đang phụ trách **' || v_tong || ' hạng mục** trong kế hoạch '
                   || v_year || ' — xong ' || v_xong
                   || ' (' || round(100.0 * v_xong / nullif(v_tong, 0)) || '%)'
                   || case when v_tre > 0 then ', còn **' || v_tre || ' mục quá hạn** ạ 😢'
                           else ', không có mục nào quá hạn ạ 🎉' end;
    else
      v_tl := v_tl || E'\n· Hiện chưa có hạng mục nào ghi tên anh/chị làm người phụ trách ạ.';
    end if;

    return jsonb_build_object('khop', true, 'y_dinh', 've_toi', 'nguon', 'sql',
      'tra_loi', v_tl,
      'goi_y', case when v_tong > 0
        then jsonb_build_array(
               'Liệt kê hạng mục quá hạn của ' || ten,
               'Tỷ lệ hoàn thành theo người phụ trách',
               'Liệt kê hạng mục sắp đến hạn 30 ngày')
        else jsonb_build_array(
               'Còn bao nhiêu hạng mục chưa có QA phụ trách?',
               'Còn bao nhiêu hạng mục quá hạn?',
               'Tỷ lệ hoàn thành theo người phụ trách') end);
  end if;

  if q ~ '(quyen gi|co quyen|phan quyen|duoc lam gi|duoc phep|vai tro cua toi|toi lam duoc gi)' then
    return jsonb_build_object('khop', true, 'y_dinh', 've_quyen', 'nguon', 'sql',
      'tra_loi',
      'Dạ, anh/chị đang ở mức **'
      || case quyen when 'admin' then 'Quản trị'
                    when 'edit'  then 'Nhập liệu'
                    when 'view'  then 'Chỉ đọc'
                    else coalesce(nullif(quyen, ''), 'chưa xác định') end
      || '** ạ 🌸' || E'\n\n'
      || case quyen
           when 'admin' then
             '· Xem toàn bộ, không giới hạn bộ phận' || E'\n'
             || '· Cập nhật tiến độ, sửa ngày và trạng thái' || E'\n'
             || '· Thêm / sửa / ngừng dùng đối tượng trong danh mục' || E'\n'
             || '· Sinh timeline cho năm mới, chấm lại điểm trọng yếu' || E'\n'
             || '· Xem nhật ký thao tác và màn sức khoẻ dữ liệu'
           when 'edit' then
             '· Xem toàn bộ' || E'\n'
             || '· Cập nhật tiến độ, sửa ngày và trạng thái' || E'\n'
             || '· Thêm / sửa đối tượng trong danh mục' || E'\n'
             || '· Không sinh timeline và không chấm lại điểm — hai việc đó cần quyền quản trị'
           else
             '· Xem được mọi màn hình và mọi báo cáo' || E'\n'
             || '· Không sửa được dữ liệu — nút cập nhật sẽ mờ đi' || E'\n'
             || '· Cần sửa thì nhờ người có quyền Nhập liệu hoặc Quản trị giúp ạ'
         end
      || E'\n\nMọi thao tác ghi đều đi qua kiểm quyền ở phía máy chủ, nên trình '
      || 'duyệt không ghi thẳng vào bảng được đâu ạ — kể cả khi ai đó sửa giao diện.',
      'goi_y', jsonb_build_array(
        'Tôi là ai?',
        'Còn bao nhiêu hạng mục quá hạn?',
        'Deadline đề cương được tính thế nào?'));
  end if;

  return jsonb_build_object('khop', false);
end;
$fn$;

-- ---------------------------------------------------------------------
-- Nối vào đường trả lời nhanh, đặt TRƯỚC mọi bước khác
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_tra_loi_nhanh(
  p_question text,
  p_year integer default null,
  p_nguoi jsonb default '{}'::jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = public
as $fn$
declare
  v_r    jsonb;
  v_hieu jsonb;
  v_dem  jsonb;
begin
  -- 0. Câu về người hỏi hoặc về chính Vali — trả lời ngay, không tốn AI
  v_r := public.rpc_ai_ve_nguoi_hoi(p_question, coalesce(p_nguoi, '{}'::jsonb), p_year);
  if (v_r->>'khop')::boolean then
    return v_r || jsonb_build_object('vi_sao', 'Câu về người dùng hoặc về trợ lý — trả lời thẳng.');
  end if;

  -- 1. Mơ hồ thì hỏi lại, không đoán
  v_r := public.rpc_ai_kiem_mo_ho(p_question);
  if (v_r->>'mo_ho')::boolean then
    return jsonb_build_object(
      'khop', true, 'y_dinh', 'hoi_lai', 'nguon', 'sql',
      'tra_loi', v_r->>'cau_hoi_lai',
      'goi_y', (select jsonb_agg((e->>'ma') || ' tới hạn khi nào?')
                from jsonb_array_elements(v_r->'lua_chon') e),
      'vi_sao', 'Cụm "' || (v_r->>'cum') || '" khớp ' || (v_r->>'so_khop')
                || ' thiết bị — hỏi lại cho chắc.');
  end if;

  v_hieu := public.rpc_ai_hieu_cau_hoi(p_question);

  -- 2. Hiểu được từ dữ liệu → dựng câu trả lời
  if not (v_hieu->>'can_ai')::boolean then
    return public.rpc_ai_dung_cau_tra_loi(p_question, v_hieu, p_year)
      || jsonb_build_object('vi_sao', v_hieu->>'vi_sao')
      || jsonb_build_object('goi_y', public.rpc_ai_goi_y_tiep(v_hieu, p_year));
  end if;

  -- 3. Đã hỏi rồi mà dữ liệu chưa đổi → dùng lại
  v_dem := public.rpc_ai_cache_doc(p_question);
  if (v_dem->>'trung')::boolean then
    return jsonb_build_object(
      'khop', true, 'y_dinh', 'dem', 'nguon', 'dem',
      'tra_loi', v_dem->>'tra_loi',
      'goi_y', public.rpc_ai_goi_y_tiep(v_hieu, p_year),
      'vi_sao', 'Đã hỏi trước đó, dữ liệu chưa đổi — dùng lại, không gọi AI.');
  end if;

  -- 4. Nhường AI
  return jsonb_build_object('khop', false, 'y_dinh', null, 'tra_loi', null,
    'goi_y', public.rpc_ai_goi_y_tiep(v_hieu, p_year),
    'vi_sao', v_hieu->>'vi_sao');
end;
$fn$;

revoke execute on function public.rpc_ai_ve_nguoi_hoi(text, jsonb, integer) from anon, public;
revoke execute on function public.rpc_ai_tra_loi_nhanh(text, integer, jsonb) from anon, public;
grant execute on function public.rpc_ai_ve_nguoi_hoi(text, jsonb, integer) to authenticated, service_role;
grant execute on function public.rpc_ai_tra_loi_nhanh(text, integer, jsonb) to authenticated, service_role;

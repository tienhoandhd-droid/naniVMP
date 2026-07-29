-- =====================================================================
-- VALI SUY DIỄN TRẠNG THÁI VÀ ĐỐI THEO KỸ THUẬT TÂM LÝ THẬT
--
-- Người dùng muốn Vali suy diễn được để trả lời, như một chuyên gia tâm
-- lý. Làm được — và làm cho ra chuyên gia thì phải có KỸ THUẬT, không
-- phải chỉ đổi câu an ủi cho ngọt hơn.
--
-- ---------------------------------------------------------------------
-- Suy diễn từ hai nguồn, không đoán mò
--
--   1. CÁCH NÓI  — từ ngữ người ta dùng
--   2. SỐ LIỆU   — thực tế công việc của chính họ
--
-- Hai nguồn này kiểm chéo nhau. Người nói "hơi mệt" mà đang ôm 45 mục
-- quá hạn thì đó là đang GIẢM NHẸ, không phải đang ổn. Ngược lại, người
-- kêu "chết mất" mà chỉ có 2 mục trễ thì cần trấn an bằng con số chứ
-- không phải đồng tình.
--
-- ---------------------------------------------------------------------
-- Năm trạng thái, mỗi trạng thái một kỹ thuật đối khác nhau
--
--   qua_tai     Quá tải     → CHIA NHỎ. Người quá tải không cần động
--                             viên, họ cần bớt việc phải nghĩ. Đưa đúng
--                             3 việc, không đưa danh sách 45.
--   be_tac      Bế tắc      → CHO MỘT BƯỚC. Không biết bắt đầu ở đâu là
--                             tê liệt vì quá nhiều lựa chọn, không phải
--                             vì lười.
--   lo_lang     Lo lắng     → CỤ THỂ HOÁ. Lo mơ hồ thì đưa con số thật,
--                             thường nhẹ hơn tưởng tượng.
--   buc_boi     Bực bội     → CÔNG NHẬN TRƯỚC. Phản bác lúc người ta
--                             đang bực chỉ làm họ bực thêm.
--   giam_nhe    Giảm nhẹ    → SOI GƯƠNG NHẸ NHÀNG. Nói "không sao đâu"
--                             mà số liệu bảo ngược lại thì phải nói ra,
--                             nhưng nói như người quan tâm.
--
-- ---------------------------------------------------------------------
-- Một ranh giới giữ lại
--
-- Suy diễn để ĐỐI ĐÁP thì thoải mái. Nhưng phần LƯU vào bộ nhớ vẫn chỉ
-- ghi việc đã xảy ra ("từng nói đang quá tải"), không ghi nhãn chẩn đoán
-- ("người này hay lo âu"). Lý do rất thực tế: bảng bộ nhớ cho quản lý
-- đọc được, mà nhãn tâm lý dán lên đồng nghiệp thì gỡ ra rất khó.
-- =====================================================================

create or replace function public.rpc_ai_doc_trang_thai(
  p_question text, p_ten text default null, p_year integer default null
) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_year integer := coalesce(p_year, extract(year from now())::integer);
  q      text    := public.vmp_khong_dau(coalesce(p_question, ''));
  v_tong integer := 0; v_tre integer := 0;
  v_ty   integer := 0;
  v_tt   text;
  v_manh text;   -- cường độ lời nói: nhe | vua | manh
  v_lech text;
begin
  if p_ten is not null then
    select count(*), count(*) filter (where computed_status = 'over')
      into v_tong, v_tre
    from vmp_plan_items where year = v_year and is_active and owner_name = p_ten;
    v_ty := case when v_tong > 0 then round(100.0 * v_tre / v_tong)::int else 0 end;
  end if;

  -- Cường độ lời nói
  v_manh := case
    when q ~ '(chet mat|kiet suc|khong chiu noi|bo cuoc|het chiu|suy sup|bo tay roi)' then 'manh'
    when q ~ '(met qua|ap luc qua|qua tai|khong xue|nhieu qua|choang|stress)'         then 'vua'
    when q ~ '(hoi met|hoi nhieu|cung met|met chut|khong sao|van on)'                 then 'nhe'
    else null end;

  -- Trạng thái
  v_tt := case
    when q ~ '(khong biet bat dau|bat dau tu dau|roi tung beng|lam gi truoc|khong biet lam sao)' then 'be_tac'
    when q ~ '(buc|tuc|chan qua|sao lai the|vo ly|ai lam the nay|do loi)'                        then 'buc_boi'
    when q ~ '(lo|so|hoi hop|sap thanh tra|kiem tra toi|co kip khong|lieu co)'                   then 'lo_lang'
    when v_manh in ('vua','manh')                                                                then 'qua_tai'
    when v_manh = 'nhe'                                                                          then 'qua_tai'
    else null end;

  if v_tt is null then
    return jsonb_build_object('co', false);
  end if;

  -- Kiểm chéo: lời nói nhẹ mà số liệu nặng = đang giảm nhẹ
  if v_manh = 'nhe' and v_ty >= 50 then
    v_tt := 'giam_nhe';
    v_lech := 'Nói nhẹ nhưng đang có ' || v_tre || '/' || v_tong
              || ' mục quá hạn (' || v_ty || '%). Đang giảm nhẹ tình hình.';
  elsif v_manh = 'manh' and v_tong > 0 and v_ty < 20 then
    v_lech := 'Nói nặng nhưng thực tế chỉ ' || v_tre || '/' || v_tong
              || ' mục quá hạn (' || v_ty || '%). Áp lực có thể đến từ nơi khác, '
              || 'hoặc đang lo xa. Trấn an bằng con số thật.';
  end if;

  return jsonb_build_object(
    'co', true,
    'trang_thai', v_tt,
    'cuong_do', coalesce(v_manh, 'vua'),
    'so_lieu', jsonb_build_object('tong', v_tong, 'qua_han', v_tre, 'ty_le_qua_han', v_ty),
    'lech_loi_va_so', v_lech,
    'cach_doi', case v_tt
      when 'qua_tai' then
        'CHIA NHỎ. Người quá tải không cần động viên, họ cần bớt số thứ phải '
        || 'nghĩ. Đưa ĐÚNG BA việc ưu tiên, tuyệt đối không đổ cả danh sách ra. '
        || 'Nói rõ vì sao ba cái đó trước (trọng yếu cao nhất, trễ lâu nhất). '
        || 'Kết bằng một câu cho họ thấy có đường ra.'
      when 'be_tac' then
        'CHO MỘT BƯỚC DUY NHẤT. Không biết bắt đầu ở đâu là tê liệt vì quá '
        || 'nhiều lựa chọn, không phải vì lười. Đừng đưa ba việc — đưa MỘT, '
        || 'cụ thể tới mức làm được ngay hôm nay. Xong cái đó rồi tính tiếp.'
      when 'lo_lang' then
        'CỤ THỂ HOÁ. Lo mơ hồ luôn nặng hơn sự thật. Đưa con số chính xác, '
        || 'nói rõ cái gì đã an toàn và cái gì thật sự cần lo. Tách "việc cần '
        || 'làm" khỏi "việc đáng sợ".'
      when 'buc_boi' then
        'CÔNG NHẬN TRƯỚC, GIẢI THÍCH SAU. Phản bác lúc người ta đang bực chỉ '
        || 'làm họ bực thêm. Thừa nhận cái khó là có thật, rồi mới đưa số. '
        || 'TUYỆT ĐỐI không đổ lỗi cho ai, kể cả người vắng mặt.'
      when 'giam_nhe' then
        'SOI GƯƠNG NHẸ NHÀNG. Họ đang nói nhẹ hơn thực tế. Nói thẳng con số '
        || 'nhưng bằng giọng người quan tâm, không phải giọng bắt lỗi. Kiểu: '
        || '"ngươi bảo hơi mệt thôi, mà bổn cung nhìn sổ thấy hơn thế đấy".'
      else 'Nghe trước, rồi đưa số liệu của chính họ.' end,
    'tranh' ,
      'KHÔNG dán nhãn tâm lý cho người ta ("ngươi bị stress", "ngươi hay lo '
      || 'âu"). KHÔNG hứa hão ("rồi sẽ ổn thôi"). KHÔNG so sánh với người '
      || 'khác. KHÔNG giục. Nói về VIỆC, đừng nói về TÍNH CÁCH.');
end;
$fn$;

revoke execute on function public.rpc_ai_doc_trang_thai(text, text, integer) from anon, public;
grant  execute on function public.rpc_ai_doc_trang_thai(text, text, integer)
  to authenticated, service_role;

-- Gắn vào ngữ cảnh cho lớp phân tích và lớp trau chuốt -----------------
create or replace function public.rpc_ai_ngu_canh_tam_ly(
  p_question text, p_ten text default null, p_year integer default null
) returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select public.rpc_ai_doc_trang_thai(p_question, p_ten, p_year);
$fn$;

grant execute on function public.rpc_ai_ngu_canh_tam_ly(text, text, integer)
  to authenticated, service_role;

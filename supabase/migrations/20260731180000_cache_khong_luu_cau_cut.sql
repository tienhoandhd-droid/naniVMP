-- Cache ngữ nghĩa: không lưu câu hỏi sống nhờ ngữ cảnh hội thoại.
--
-- Lỗ hổng: cache khoá theo VĂN BẢN THÔ của câu hỏi, nhưng câu trả lời được
-- dựng cho bản ĐÃ NỐI MẠCH của lớp phân tích. "còn OQ?" của người đang nói
-- về KNTB133 bị lưu dưới đúng ba chữ "còn OQ?" — người khác gõ y hệt trong
-- mạch chuyện khác (cùng ngày, giống >= 0.93) sẽ nhận câu trả lời về thiết
-- bị của người trước. Hàm lưu cũ chỉ chặn câu cá nhân (tôi/ta/mình), không
-- chặn câu cụt.
--
-- Hai lưới mới, soi trên câu hỏi thô:
-- 1. Dưới 3 tiếng — "còn OQ?", "KNTB133", "sao nữa" — gần chắc là câu nói
--    tiếp, đứng một mình không đủ nghĩa. Bỏ lưu chỉ tốn vài giây tra lại.
-- 2. Chứa từ trỏ về lượt trước: "cái đó", "nó", "còn lại", "vừa nói"...
--    Soi trên bản CÒN DẤU để "nó" không đè nhầm "no/non" sau khi bỏ dấu.
-- Chỉ sửa đường LƯU: câu bị chặn không bao giờ vào bảng, nên đường tra
-- (rpc_ai_cache_nn_tim) tự trượt, không phải đổi.

create or replace function public.rpc_ai_cache_nn_luu(p_cau_hoi text, p_vector text, p_phan_hoi jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_khoa text := btrim(regexp_replace(public.vmp_khong_dau(coalesce(p_cau_hoi,'')), '[^a-z0-9]+', ' ', 'g'));
  v_tho  text := ' ' || lower(regexp_replace(coalesce(p_cau_hoi,''), '[^[:alnum:]]+', ' ', 'g')) || ' ';
begin
  -- Không có vector / không có nội dung thì thôi
  if p_vector is null or btrim(p_vector) = ''
     or coalesce(btrim(p_phan_hoi ->> 'tra_loi'), '') = '' then
    return jsonb_build_object('luu', false, 'ly_do', 'thieu vector hoac noi dung');
  end if;

  -- Câu cá nhân: trả cho người khác là lộ chuyện riêng — không lưu
  if (' ' || v_khoa || ' ') ~ ' (toi|ta|minh|em|cua toi|cua ta|cua minh|la ai) ' then
    return jsonb_build_object('luu', false, 'ly_do', 'cau ca nhan');
  end if;

  -- Câu quá ngắn: gần chắc là câu nói tiếp mạch cũ, nghĩa nằm ở lượt trước
  if coalesce(array_length(string_to_array(btrim(v_khoa), ' '), 1), 0) < 3 then
    return jsonb_build_object('luu', false, 'ly_do', 'cau qua ngan, de la cau noi tiep');
  end if;

  -- Câu trỏ về lượt trước: câu trả lời chỉ đúng trong đúng mạch chuyện đó
  if exists (
    select 1 from unnest(array[
      ' cái đó ',' cái kia ',' cái này ',' cái ấy ',' con đó ',' máy đó ',' máy này ',' máy kia ',
      ' nó ',' còn lại ',' thế còn ',' vậy còn ',' như trên ',' ở trên ',
      ' vừa rồi ',' vừa nãy ',' ban nãy ',' hồi nãy ',' lượt trước ',' câu trước ',' vừa nói '
    ]) cum where v_tho like '%' || cum || '%'
  ) then
    return jsonb_build_object('luu', false, 'ly_do', 'cau noi tiep mach hoi thoai');
  end if;

  -- Một khoá chỉ giữ bản mới nhất
  update public.vmp_ai_cache_ngu_nghia
  set is_valid = false, invalidated_at = now(), invalidated_reason = 'co ban moi hon'
  where is_valid and cau_hoi_khoa = v_khoa;

  insert into public.vmp_ai_cache_ngu_nghia (cau_hoi, cau_hoi_khoa, vector, phan_hoi)
  values (p_cau_hoi, v_khoa, p_vector::vector, p_phan_hoi);

  return jsonb_build_object('luu', true);
end;
$function$;

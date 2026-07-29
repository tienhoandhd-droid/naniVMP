-- =====================================================================
-- XÃ GIAO VÀ CÂU NGOÀI PHẠM VI — đừng trả lời cụt ngủn
--
-- Chào hỏi, cảm ơn, hỏi thăm, hoặc hỏi chuyện ngoài VMP mà nhận lại
-- "không có trong dữ liệu" thì cuộc trò chuyện chết ngay ở câu đầu.
-- Người dùng cảm thấy đang nói với cái máy tra cứu, không phải một nhân
-- vật.
--
-- Ba nhóm, ba cách đối:
--   · CHÀO HỎI / CẢM ƠN / XÃ GIAO → đáp lại có duyên rồi mời vào việc
--   · NGOÀI PHẠM VI (thời tiết, bóng đá…) → nhận là mình không lo việc
--     đó, nói rõ mình lo việc gì, rồi mời hỏi tiếp. Không phán xét.
--   · KHÔNG HIỂU → thú nhận chưa hiểu và ĐƯA VÍ DỤ cụ thể, thay vì để
--     người ta tự mò cách hỏi cho đúng.
--
-- Nguyên tắc: mỗi câu trả lời phải để lại một lối đi tiếp. Ngõ cụt là
-- chỗ người dùng bỏ cuộc.
-- =====================================================================

create or replace function public.rpc_ai_xa_giao(p_question text, p_nguoi jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  q   text := public.vmp_khong_dau(coalesce(p_question, ''));
  ten text := nullif(trim(coalesce(p_nguoi->>'ten', '')), '');
  goi text := coalesce(ten, 'ngươi');
begin
  -- Chào hỏi
  if q ~ '^\s*(chao|hi|hello|xin chao|alo|halo|hey)\M' or q ~ '^\s*(chao|hi|hello)\s*$' then
    return jsonb_build_object('khop', true, 'y_dinh', 'xa_giao', 'nguon', 'sql',
      'tra_loi', 'Bổn cung nghe đây 🌸 ' || goi
        || ' hôm nay muốn hỏi chuyện gì trong kế hoạch thẩm định?' || E'\n\n'
        || 'Bổn cung nắm rõ tiến độ, người phụ trách, điểm trọng yếu và cả '
        || 'quy tắc tính hạn — cứ hỏi thẳng, không cần vòng vo.',
      'goi_y', jsonb_build_array('Còn bao nhiêu hạng mục quá hạn?',
                                 'Ta là ai?', 'Liệt kê hạng mục sắp đến hạn 30 ngày'));
  end if;

  -- Cảm ơn / khen
  if q ~ '(cam on|cam ơn|thanks|thank you|cuoi cung cung|gioi qua|hay qua|tuyet voi|tot lam)' then
    return jsonb_build_object('khop', true, 'y_dinh', 'xa_giao', 'nguon', 'sql',
      'tra_loi', 'Bổn cung ghi nhận tấm lòng của ' || goi || ' 💕 '
        || 'Có gì cần tra nữa cứ gọi, bổn cung luôn ở đây.',
      'goi_y', jsonb_build_array('Còn bao nhiêu hạng mục quá hạn?',
                                 'Tỷ lệ hoàn thành theo người phụ trách'));
  end if;

  -- Hỏi thăm
  if q ~ '(khoe khong|co khoe|dao nay the nao|ban the nao|met khong|ban on khong)' then
    return jsonb_build_object('khop', true, 'y_dinh', 'xa_giao', 'nguon', 'sql',
      'tra_loi', 'Bổn cung vẫn tốt, cảm ơn ' || goi || ' đã hỏi 🌸 '
        || 'Chỉ hơi bận vì trong kế hoạch còn kha khá hạng mục quá hạn — '
        || goi || ' có muốn xem qua không?',
      'goi_y', jsonb_build_array('Còn bao nhiêu hạng mục quá hạn?',
                                 'Nhóm trọng yếu 7-9 đang tới đâu?'));
  end if;

  -- Xin lỗi / than phiền
  if q ~ '(xin loi|sorry|khong hieu y|ban tra loi sai|sai roi|nham roi)' then
    return jsonb_build_object('khop', true, 'y_dinh', 'xa_giao', 'nguon', 'sql',
      'tra_loi', 'Không sao. Nếu bổn cung trả lời chưa trúng ý thì ' || goi
        || ' nói rõ hơn giúp — ví dụ kèm mã thiết bị, tên người phụ trách, '
        || 'hoặc khu vực. Có mã là bổn cung tra ra ngay, không đoán mò.',
      'goi_y', jsonb_build_array('Thông tin thẩm định KNTB133',
                                 'Liệt kê hạng mục quá hạn của Tào Tiến Hoàn'));
  end if;

  -- Ngoài phạm vi rõ ràng
  if q ~ '(thoi tiet|bong da|nau an|chung khoan|bitcoin|phim|nhac|ca si|tinh yeu|dich benh|gia vang|xo so|tho tinh|ke chuyen cuoi)' then
    return jsonb_build_object('khop', true, 'y_dinh', 'ngoai_pham_vi', 'nguon', 'sql',
      'tra_loi', 'Chuyện đó nằm ngoài cung của bổn cung rồi 🌸 '
        || 'Bổn cung chỉ trông coi kế hoạch thẩm định VMP của CPC1 Hà Nội thôi.'
        || E'\n\n' || 'Nhưng trong phạm vi ấy thì bổn cung nắm khá chắc: tiến độ '
        || 'từng hạng mục, ai phụ trách cái gì, thiết bị nào sắp đến hạn, điểm '
        || 'trọng yếu chấm ra sao, và cả lý do đằng sau mỗi quy tắc.',
      'goi_y', jsonb_build_array('Bổn cung làm được những gì?',
                                 'Còn bao nhiêu hạng mục quá hạn?',
                                 'Deadline đề cương tính thế nào?'));
  end if;

  return jsonb_build_object('khop', false);
end;
$fn$;

-- Câu không hiểu: thú nhận và ĐƯA VÍ DỤ, không để ngõ cụt --------------
create or replace function public.rpc_ai_khong_hieu(p_question text)
returns text
language sql immutable
as $fn$
  select 'Bổn cung đọc mà chưa nắm được ' || quote_literal(p_question)
      || ' muốn hỏi gì 🌸' || E'\n\n'
      || 'Nói theo mấy kiểu này thì bổn cung tra được ngay:' || E'\n'
      || '· Kèm **mã thiết bị** — "KNTB133 tới hạn khi nào"' || E'\n'
      || '· Kèm **tên người** — "Phạm Huệ Nhi còn bao nhiêu việc"' || E'\n'
      || '· Kèm **khu vực** — "khu C1 có gì quá hạn"' || E'\n'
      || '· Hỏi **vì sao** — "vì sao LAF cân được 9 điểm trọng yếu"' || E'\n\n'
      || 'Hoặc cứ nói ý ra, bổn cung sẽ hỏi lại cho rõ.';
$fn$;

revoke execute on function public.rpc_ai_xa_giao(text, jsonb) from anon, public;
revoke execute on function public.rpc_ai_khong_hieu(text) from anon, public;
grant execute on function public.rpc_ai_xa_giao(text, jsonb) to authenticated, service_role;
grant execute on function public.rpc_ai_khong_hieu(text) to authenticated, service_role;

insert into public.vmp_ai_bo_kiem (ma, cau_hoi, mong_doi, ghi_chu) values
 ('xa_giao_chao', 'chào bạn',
  '{"duong":"sql","y_dinh":"xa_giao","khong_chua":["không có trong dữ liệu"]}'::jsonb,
  'Chào hỏi mà nhận "không có trong dữ liệu" thì cuộc trò chuyện chết ở câu đầu.'),
 ('ngoai_pham_vi', 'hôm nay thời tiết thế nào?',
  '{"duong":"sql","y_dinh":"ngoai_pham_vi","chua_chuoi":["thẩm định"]}'::jsonb,
  'Câu ngoài phạm vi phải được đối lại có duyên và mời quay về việc, không cụt ngủn.')
on conflict (ma) do update set
  cau_hoi = excluded.cau_hoi, mong_doi = excluded.mong_doi, ghi_chu = excluded.ghi_chu;

update public.system_config set value = to_jsonb((value #>> '{}')::int + 1)
where key = 'ai_phien_ban_logic';

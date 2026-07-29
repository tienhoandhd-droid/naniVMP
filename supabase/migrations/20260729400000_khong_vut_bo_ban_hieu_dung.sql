-- =====================================================================
-- ĐỪNG VỨT BỎ BẢN PHÂN TÍCH ĐÃ ĐÚNG VÌ VÀI CHỮ VÔ HẠI
--
-- ---------------------------------------------------------------------
-- Ca hỏng người dùng gặp
--
--   Hỏi : "Thông tin thẩm định kntb133"
--   Vali: (đổ ra toàn bộ tổng quan 461 hạng mục, không nhắc gì KNTB133)
--
-- Người dùng nghi "chưa đọc hết câu hỏi đã trả lời". Gần đúng, nhưng
-- nguyên nhân thật còn trớ trêu hơn: hệ ĐÃ ĐỌC ĐÚNG.
--
--   ma = KNTB133 · chi_so = chi_tiet   ← phân tích hoàn toàn chính xác
--   tu_la = [thong, tin]               ← rồi vứt tất cả đi vì hai chữ này
--
-- "thông tin" không có trong danh sách hư từ, nên bị coi là từ chưa hiểu,
-- và luật "còn từ lạ thì nhường AI" đã ném bỏ một bản phân tích đúng.
-- Mô hình nhận câu hỏi trần, gọi công cụ lấy cả kho số liệu rồi đọc lại
-- phần tổng quan — đúng thứ người dùng KHÔNG hỏi.
--
-- ---------------------------------------------------------------------
-- Sửa gốc, không vá danh sách hư từ
--
-- Thêm "thông tin" vào danh sách chỉ chữa đúng câu này, mai có "cho hỏi",
-- "kiểm tra giúp", "xem hộ" lại hỏng tiếp. Vấn đề nằm ở LUẬT, không ở
-- danh sách.
--
-- Luật cũ: còn bất kỳ từ lạ nào → nhường AI.
-- Luật mới: xét theo ĐỘ CHẮC CHẮN của bản phân tích.
--
--   · Đã khoá đúng MỘT mã đối tượng cụ thể → tin. Mã thiết bị là thứ
--     không thể trùng ngẫu nhiên; nó CHÍNH LÀ câu hỏi. Mấy chữ quanh nó
--     ("thông tin", "cho hỏi", "kiểm tra giúp") chỉ là cách nói.
--   · Không có mã, chỉ có chỉ số và bộ lọc chung → giữ nguyên thận
--     trọng, còn từ lạ thì nhường AI. Ở đây từ lạ thật sự có thể mang ý
--     mà ta chưa hiểu.
--
-- Nói cách khác: thận trọng khi mơ hồ, tự tin khi đã có neo chắc.
-- =====================================================================

create or replace function public.rpc_ai_hieu_cau_hoi(p_question text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  q        text := ' ' || public.vmp_khong_dau(coalesce(p_question, '')) || ' ';
  v_chi_so text;
  v_chieu  text;
  v_tt     text;
  v_han    integer;
  v_loc    jsonb := '{}'::jsonb;
  v_hieu   text[] := '{}';
  v_la     text[] := '{}';
  v_neo    boolean := false;   -- đã khoá đúng một đối tượng cụ thể?
  r        record;
  tk       text;
begin
  if q ~ '(vi sao|tai sao|vi the nao|nen |co nen|danh gia|nhan xet|de xuat|goi y|khuyen|so sanh|khac nhau|giai thich|the nao la|co dung|hop ly|rui ro gi|anh huong gi|lam sao de|cach nao)' then
    -- Câu giải thích cũng phải dò thực thể trước khi thoát, để mô hình
    -- biết đang giải thích VỀ CÁI GÌ.
    for r in
      select loai, gia_tri, khoa from public.vmp_ai_tu_dien
      where length(khoa) >= 3 and q like '%' || khoa || '%'
      order by length(khoa) desc
    loop
      continue when v_loc ? r.loai;
      v_loc := v_loc || jsonb_build_object(r.loai, r.gia_tri);
    end loop;
    return jsonb_build_object('can_ai', true, 'chi_so', null, 'loc', v_loc,
      'vi_sao', 'Câu hỏi đòi giải thích hoặc đánh giá, không phải tra số — cần mô hình.');
  end if;

  if    q ~ '(bao nhieu|may cai|so luong|dem |tong so|co may)' then v_chi_so := 'dem';
  elsif q ~ '(ty le|phan tram|bao nhieu %|tien do)'            then v_chi_so := 'ty_le';
  elsif q ~ '(liet ke|danh sach|nhung cai nao|cai nao|gom nhung|cho xem|nao dang|co nhung|co gi|gom gi|co cai gi|nao roi)' then v_chi_so := 'liet_ke';
  end if;

  if    q ~ '(theo nguoi|tung nguoi|moi nguoi|ai |nguoi nao|qa nao)' then v_chieu := 'nguoi';
  elsif q ~ '(theo bo phan|tung bo phan|bo phan nao)'                 then v_chieu := 'bo_phan';
  elsif q ~ '(theo khu|tung khu|khu vuc nao)'                         then v_chieu := 'khu_vuc';
  elsif q ~ '(theo loai|tung loai|loai nao)'                          then v_chieu := 'loai_td';
  elsif q ~ '(theo nhom|tung nhom|nhom nao)'                          then v_chieu := 'nhom_viec';
  elsif q ~ '(trong yeu|muc do rui ro|theo diem)'                     then v_chieu := 'trong_yeu';
  end if;

  if    q ~ '(qua han|tre han|bi tre)'                 then v_tt := 'over';
  elsif q ~ '(hoan thanh|da xong|xong roi|da lam)'     then v_tt := 'done';
  elsif q ~ '(dang lam|dang tien hanh|dang thuc hien)' then v_tt := 'prog';
  elsif q ~ '(chua lam|chua bat dau|chua thuc hien)'   then v_tt := 'todo';
  end if;
  if v_chi_so = 'ty_le' and v_tt = 'done' then v_tt := null; end if;
  if v_tt is not null then
    v_loc  := v_loc || jsonb_build_object('trang_thai', v_tt);
    v_hieu := array_append(v_hieu, 'trạng thái = ' || v_tt);
  end if;

  if    q ~ '(30 ngay|mot thang|thang toi|sap den han|sap toi han|gan den han)' then v_han := 30;
  elsif q ~ '(7 ngay|mot tuan|tuan toi)'  then v_han := 7;
  elsif q ~ '(90 ngay|ba thang|quy toi)'  then v_han := 90;
  end if;
  if v_han is not null then
    v_loc  := v_loc || jsonb_build_object('han_ngay', v_han);
    v_hieu := array_append(v_hieu, 'đến hạn trong ' || v_han || ' ngày');
  end if;

  if q ~ '(chua co qa|chua phan cong|thieu qa|khong co nguoi phu trach|chua co nguoi)' then
    v_loc  := v_loc || jsonb_build_object('chua_co_qa', true);
    v_hieu := array_append(v_hieu, 'chưa có QA phụ trách');
    if v_chi_so is null then v_chi_so := 'dem'; end if;
  end if;

  for r in
    select loai, gia_tri, khoa from public.vmp_ai_tu_dien
    where length(khoa) >= 2
      and (case when length(khoa) >= 4 then q like '%' || khoa || '%'
                else q ~ ('(^|[^a-z0-9])' || khoa || '($|[^a-z0-9])') end)
    order by length(khoa) desc
  loop
    continue when not (case when length(r.khoa) >= 4
                            then q like '%' || r.khoa || '%'
                            else q ~ ('(^|[^a-z0-9])' || r.khoa || '($|[^a-z0-9])') end);
    continue when v_loc ? r.loai;
    v_loc  := v_loc || jsonb_build_object(r.loai, r.gia_tri);
    v_hieu := array_append(v_hieu, r.loai || ' = ' || r.gia_tri);
    -- Mã đối tượng hoặc tên đối tượng đầy đủ = neo chắc
    if r.loai in ('ma', 'ten_doi_tuong') then v_neo := true; end if;
    q := replace(q, r.khoa, ' ');
  end loop;

  for tk in
    select t from regexp_split_to_table(q, '[^a-z0-9]+') t
    where length(t) >= 3
      and t !~ ('^(bao|nhieu|may|cai|nao|dem|tong|luong|le|phan|tram|tien|liet'
             || '|ke|danh|sach|nhung|gom|cho|xem|theo|tung|moi|nguoi|khu|vuc'
             || '|loai|nhom|diem|trong|yeu|muc|rui|qua|han|tre|hoan|thanh'
             || '|xong|roi|lam|dang|thuc|hien|chua|bat|dau|ngay|thang|toi|tuan'
             || '|quy|sap|den|gan|phai|cong|thieu|khong|hang|the|cua|voi|ngoai'
             || '|tai|nay|con|hoac|cac|nhat|thi|duoc|can|vmp|nam|hoach|phu'
             || '|trach|viec|doi|tuong|tren|duoi|tat|gio|khi|dau|nua|luon'
             || '|tinh|trang|thai|thoi|gian|lich|hop|dung|deu|hay|ma|day'
             || '|bay|it|sau|truoc|xa|het|van|cung|neu'
             || '|tham|dinh|cuong|bao|cao|hoso|giai|doan|moc|ket|qua'
             || '|hen|trinh|thong|tin|kiem|tra|giup|hoi|noi|biet|xin|vui|long'
             || '|minh|em|anh|chi|toi|ban|gium|ho|nhe|nha|day|kia|ay)$')
  loop
    v_la := array_append(v_la, tk);
  end loop;

  if v_chi_so is null and v_neo then v_chi_so := 'chi_tiet'; end if;

  if v_chi_so is null then
    -- Vẫn phải trả 'loc': nhánh AI dùng nó để xác định trọng điểm. Không
    -- có loc thì mô hình nhận câu hỏi trần và đổ ra tổng quan toàn nhà máy.
    return jsonb_build_object('can_ai', true, 'chi_so', null, 'loc', v_loc,
      'da_hieu', to_jsonb(v_hieu), 'tu_la', to_jsonb(v_la),
      'vi_sao', 'Không xác định được câu hỏi muốn đếm, tính tỷ lệ hay liệt kê.');
  end if;

  -- ĐIỂM MẤU CHỐT: có neo chắc thì từ lạ không đủ để phủ nhận bản phân
  -- tích. Mã thiết bị không thể trùng ngẫu nhiên — nó CHÍNH LÀ câu hỏi.
  if array_length(v_la, 1) > 0 and not v_neo then
    return jsonb_build_object('can_ai', true, 'chi_so', v_chi_so, 'loc', v_loc,
      'da_hieu', to_jsonb(v_hieu), 'tu_la', to_jsonb(v_la),
      'vi_sao', 'Còn từ chưa có trong dữ liệu: ' || array_to_string(v_la, ', ')
                || ', mà câu hỏi không nhắc tới đối tượng cụ thể nào — nhường '
                || 'mô hình để khỏi trả lời lệch ý.');
  end if;

  return jsonb_build_object(
    'can_ai', false, 'chi_so', v_chi_so, 'chieu', v_chieu, 'loc', v_loc,
    'da_hieu', to_jsonb(v_hieu), 'tu_la', to_jsonb(v_la), 'neo', v_neo,
    'vi_sao', case when v_neo and array_length(v_la, 1) > 0
      then 'Đã khoá đúng đối tượng trong câu hỏi nên trả lời thẳng; mấy chữ "'
           || array_to_string(v_la, ', ') || '" chỉ là cách nói, không đổi ý.'
      else 'Hiểu đủ câu hỏi từ dữ liệu — trả lời thẳng bằng SQL, không tốn AI.' end);
end;
$fn$;

revoke execute on function public.rpc_ai_hieu_cau_hoi(text) from anon, public;
grant  execute on function public.rpc_ai_hieu_cau_hoi(text) to authenticated, service_role;

-- Thêm vào bộ kiểm để lần sau không tái diễn -------------------------
insert into public.vmp_ai_bo_kiem (ma, cau_hoi, mong_doi, ghi_chu) values
 ('neo_ma_co_tu_la', 'Thông tin thẩm định kntb133',
  '{"duong":"sql","y_dinh":"chi_tiet","chua_chuoi":["KNTB133"],"khong_chua":["Tổng số hạng mục"]}'::jsonb,
  'Từng đổ ra toàn bộ tổng quan 461 hạng mục. Hệ đã hiểu đúng ma=KNTB133 '
  'rồi vứt đi vì hai chữ "thông tin" không có trong danh sách hư từ.'),
 ('neo_ma_cach_noi_khac', 'cho hỏi kntb133 kiểm tra tới đâu rồi',
  '{"duong":"sql","y_dinh":"chi_tiet","chua_chuoi":["KNTB133"]}'::jsonb,
  'Cùng lỗi, cách nói khác — kiểm luật chứ không kiểm danh sách hư từ.')
on conflict (ma) do update set
  cau_hoi = excluded.cau_hoi, mong_doi = excluded.mong_doi, ghi_chu = excluded.ghi_chu;

update public.system_config set value = to_jsonb((value #>> '{}')::int + 1)
where key = 'ai_phien_ban_logic';

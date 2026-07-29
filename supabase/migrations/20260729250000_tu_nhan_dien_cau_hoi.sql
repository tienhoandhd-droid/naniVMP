-- =====================================================================
-- TỰ NHẬN DIỆN CÂU HỎI — không dùng mẫu viết tay
--
-- ---------------------------------------------------------------------
-- Vì sao bỏ cách cũ
--
-- Bản trước dò câu hỏi bằng bảy biểu thức chính quy viết tay. Cách đó có
-- hai chỗ chết:
--   · thêm một QA mới, một khu vực mới, một loại thẩm định mới thì hệ
--     không nhận ra — phải sửa mẫu bằng tay
--   · người hỏi diễn đạt khác đi một chút là trượt, dù ý hoàn toàn nằm
--     trong khả năng của SQL
--
-- ---------------------------------------------------------------------
-- Cách mới
--
-- Hệ TỰ DỰNG TỪ ĐIỂN TỪ CHÍNH DATABASE, rồi phân tích câu hỏi thành ba
-- phần: CHỈ SỐ (hỏi cái gì) × CHIỀU (chia theo gì) × BỘ LỌC (giới hạn ở
-- đâu). Đủ ba phần và không còn từ nào lạ thì tự dựng câu SQL trả lời.
--
--   · Tên QA, mã đối tượng, tên thiết bị, bộ phận, khu vực, dây chuyền,
--     loại thẩm định, nhóm việc — ĐỌC THẲNG TỪ BẢNG. Thêm người mới vào
--     danh mục là hệ nhận ra ngay, không phải sửa gì.
--   · Chỉ còn từ ngữ pháp tiếng Việt ("bao nhiêu", "tỷ lệ", "liệt kê",
--     "quá hạn"…) là cố định — nhưng đó là tiếng Việt, không phải dữ
--     liệu, nên nó không đổi khi dữ liệu đổi.
--
-- Có từ nội dung KHÔNG map được vào từ điển, hoặc có từ đòi suy luận
-- ("vì sao", "nên", "đánh giá", "so với") → chuyển sang AI. Nguyên tắc
-- không đổi: thà đẩy sang AI còn hơn trả lời lệch câu hỏi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Từ điển thực thể — sinh từ dữ liệu, không gõ tay
-- ---------------------------------------------------------------------
create or replace view public.vmp_ai_tu_dien as
  select 'nguoi'  as loai, owner_name as gia_tri, public.vmp_khong_dau(owner_name) as khoa
  from vmp_plan_items where owner_name is not null group by owner_name
  union all
  select 'nhom_viec', work_group, public.vmp_khong_dau(work_group)
  from vmp_plan_items where work_group is not null group by work_group
  union all
  select 'loai_td', validation_type, public.vmp_khong_dau(validation_type)
  from vmp_plan_items where validation_type is not null group by validation_type
  union all
  select 'bo_phan', department, public.vmp_khong_dau(department)
  from vmp_objects where department is not null and is_active group by department
  union all
  select 'khu_vuc', area, public.vmp_khong_dau(area)
  from vmp_objects where area is not null and is_active group by area
  union all
  select 'line', line, public.vmp_khong_dau(line)
  from vmp_objects where line is not null and is_active group by line
  union all
  select 'ma', code, public.vmp_khong_dau(code)
  from vmp_objects where is_active and length(code) >= 4
  union all
  select 'ten_doi_tuong', name, public.vmp_khong_dau(name)
  from vmp_objects where is_active and length(name) >= 4;

comment on view public.vmp_ai_tu_dien is
  'Từ điển thực thể sinh thẳng từ dữ liệu: tên QA, nhóm việc, loại thẩm '
  'định, bộ phận, khu vực, dây chuyền, mã và tên đối tượng. Thêm dữ liệu '
  'mới là trợ lý nhận ra ngay, không phải sửa mẫu.';

grant select on public.vmp_ai_tu_dien to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Hiểu câu hỏi: tách thành chỉ số × chiều × bộ lọc
-- ---------------------------------------------------------------------
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
  v_hieu   text[] := '{}';      -- các cụm đã nhận ra
  v_la     text[] := '{}';      -- từ nội dung không nhận ra
  r        record;
  tk       text;
begin
  -- ---- Từ đòi SUY LUẬN → nhường AI ngay, khỏi phân tích tiếp ----
  -- Đây là các câu hỏi mà đúng/sai không nằm ở con số mà ở lập luận.
  if q ~ '(vi sao|tai sao|vi the nao|nen |co nen|danh gia|nhan xet|de xuat|goi y|khuyen|so sanh|khac nhau|giai thich|the nao la|co dung|hop ly|rui ro gi|anh huong gi|lam sao de|cach nao)' then
    return jsonb_build_object('can_ai', true, 'chi_so', null,
      'vi_sao', 'Câu hỏi đòi giải thích hoặc đánh giá, không phải tra số — cần mô hình.');
  end if;

  -- ---- CHỈ SỐ: hỏi cái gì ----
  if    q ~ '(bao nhieu|may cai|so luong|dem |tong so|co may)' then v_chi_so := 'dem';
  elsif q ~ '(ty le|phan tram|bao nhieu %|tien do)'            then v_chi_so := 'ty_le';
  elsif q ~ '(liet ke|danh sach|nhung cai nao|cai nao|gom nhung|cho xem|nao dang|co nhung)' then v_chi_so := 'liet_ke';
  end if;

  -- ---- CHIỀU: chia theo gì ----
  if    q ~ '(theo nguoi|tung nguoi|moi nguoi|ai |nguoi nao|qa nao)'      then v_chieu := 'nguoi';
  elsif q ~ '(theo bo phan|tung bo phan|bo phan nao)'                      then v_chieu := 'bo_phan';
  elsif q ~ '(theo khu|tung khu|khu vuc nao)'                              then v_chieu := 'khu_vuc';
  elsif q ~ '(theo loai|tung loai|loai nao)'                               then v_chieu := 'loai_td';
  elsif q ~ '(theo nhom|tung nhom|nhom nao)'                               then v_chieu := 'nhom_viec';
  elsif q ~ '(trong yeu|muc do rui ro|theo diem)'                          then v_chieu := 'trong_yeu';
  end if;

  -- ---- BỘ LỌC: trạng thái ----
  if    q ~ '(qua han|tre han|bi tre)'                    then v_tt := 'over';
  elsif q ~ '(hoan thanh|da xong|xong roi|da lam)'        then v_tt := 'done';
  elsif q ~ '(dang lam|dang tien hanh|dang thuc hien)'    then v_tt := 'prog';
  elsif q ~ '(chua lam|chua bat dau|chua thuc hien)'      then v_tt := 'todo';
  end if;
  -- "Tỷ lệ HOÀN THÀNH" — ở đây "hoàn thành" là thứ đang đo, không phải
  -- bộ lọc. Giữ nó làm bộ lọc thì mẫu số chỉ còn dòng đã xong, và mọi
  -- tỷ lệ đều ra 100%.
  if v_chi_so = 'ty_le' and v_tt = 'done' then v_tt := null; end if;

  if v_tt is not null then
    v_loc := v_loc || jsonb_build_object('trang_thai', v_tt);
    v_hieu := v_hieu || ('trạng thái = ' || v_tt);
  end if;

  -- ---- BỘ LỌC: mốc thời gian ----
  if q ~ '(30 ngay|mot thang|thang toi|sap den han|sap toi han|gan den han)' then
    v_han := 30;
  elsif q ~ '(7 ngay|mot tuan|tuan toi)' then
    v_han := 7;
  elsif q ~ '(90 ngay|ba thang|quy toi)' then
    v_han := 90;
  end if;
  if v_han is not null then
    v_loc := v_loc || jsonb_build_object('han_ngay', v_han);
    v_hieu := v_hieu || ('đến hạn trong ' || v_han || ' ngày');
  end if;

  -- ---- BỘ LỌC: chưa phân công ----
  if q ~ '(chua co qa|chua phan cong|thieu qa|khong co nguoi phu trach|chua co nguoi)' then
    v_loc := v_loc || jsonb_build_object('chua_co_qa', true);
    v_hieu := v_hieu || 'chưa có QA phụ trách';
    if v_chi_so is null then v_chi_so := 'dem'; end if;
  end if;

  -- ---- BỘ LỌC: thực thể, dò bằng TỪ ĐIỂN SINH TỪ DỮ LIỆU ----
  -- Ưu tiên cụm dài trước để "Tôn Nữ Thiện My" không bị cắt thành "My".
  -- Cụm ngắn (IQ, OQ, C1, B2…) phải khớp NGUYÊN TỪ, nếu không "iq" sẽ
  -- trúng bên trong "thiet bi iq..." hoặc bất kỳ chữ nào chứa hai ký tự đó.
  for r in
    select loai, gia_tri, khoa from public.vmp_ai_tu_dien
    where length(khoa) >= 2
      and (case when length(khoa) >= 4
                then q like '%' || khoa || '%'
                else q ~ ('(^|[^a-z0-9])' || khoa || '($|[^a-z0-9])') end)
    order by length(khoa) desc
  loop
    -- Bỏ qua nếu cụm này nằm trọn trong một cụm đã nhận (tránh trùng)
    if not exists (select 1 from unnest(v_hieu) h where h like '%' || r.gia_tri || '%') then
      v_loc  := v_loc || jsonb_build_object(r.loai, r.gia_tri);
      v_hieu := v_hieu || (r.loai || ' = ' || r.gia_tri);
      -- Xoá khỏi câu để không tính là từ lạ ở bước sau
      q := replace(q, r.khoa, ' ');
    end if;
  end loop;

  -- ---- Còn từ nội dung nào chưa hiểu không? ----
  -- Bỏ hư từ và từ ngữ pháp đã dùng ở trên. Còn sót từ có nghĩa nghĩa là
  -- câu hỏi vượt ra ngoài thứ SQL nắm được → nhường AI.
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
             || '|thang|nao|bao|gio|het|hen|lich|trinh)$')
  loop
    v_la := v_la || tk;
  end loop;

  -- ---- Hỏi về một đối tượng cụ thể mà không kèm chỉ số ----
  -- "HT-01 tới hạn khi nào?" không có từ đếm/tỷ lệ/liệt kê, nhưng đã
  -- nhận ra đúng một đối tượng thì đó là yêu cầu xem chi tiết.
  if v_chi_so is null and (v_loc ? 'ma' or v_loc ? 'ten_doi_tuong') then
    v_chi_so := 'chi_tiet';
  end if;

  -- ---- Kết luận ----
  if v_chi_so is null then
    return jsonb_build_object('can_ai', true, 'chi_so', null,
      'da_hieu', to_jsonb(v_hieu), 'tu_la', to_jsonb(v_la),
      'vi_sao', 'Không xác định được câu hỏi muốn đếm, tính tỷ lệ hay liệt kê — cần mô hình đọc hiểu.');
  end if;

  if array_length(v_la, 1) > 0 then
    return jsonb_build_object('can_ai', true, 'chi_so', v_chi_so,
      'da_hieu', to_jsonb(v_hieu), 'tu_la', to_jsonb(v_la),
      'vi_sao', 'Còn từ chưa có trong dữ liệu: ' || array_to_string(v_la, ', ')
                || ' — nhường mô hình để khỏi trả lời lệch ý.');
  end if;

  return jsonb_build_object(
    'can_ai', false, 'chi_so', v_chi_so, 'chieu', v_chieu, 'loc', v_loc,
    'da_hieu', to_jsonb(v_hieu), 'tu_la', '[]'::jsonb,
    'vi_sao', 'Hiểu đủ câu hỏi từ dữ liệu — trả lời thẳng bằng SQL, không tốn AI.');
end;
$fn$;

comment on function public.rpc_ai_hieu_cau_hoi(text) is
  'Phân tích câu hỏi thành chỉ số × chiều × bộ lọc, dùng từ điển sinh từ '
  'chính dữ liệu. Trả can_ai=true khi còn từ chưa hiểu hoặc câu đòi suy luận.';

revoke execute on function public.rpc_ai_hieu_cau_hoi(text) from anon, public;
grant  execute on function public.rpc_ai_hieu_cau_hoi(text) to authenticated, service_role;

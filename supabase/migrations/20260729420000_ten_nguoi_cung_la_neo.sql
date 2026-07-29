-- =====================================================================
-- TÊN NGƯỜI CŨNG LÀ NEO CHẮC — và hồ sơ một người
--
-- ---------------------------------------------------------------------
-- Ca hỏng
--
--   Hỏi : "bạn biết phạm huệ nhi không?"
--   Vali: "Dạ em không biết thông tin về Phạm Huệ Nhi trong dữ liệu ạ"
--
-- Trong khi Phạm Huệ Nhi đang phụ trách 22 hạng mục. Truy ra:
--
--   loc = {"nguoi": "Phạm Huệ Nhi"}   ← ĐÃ NHẬN RA
--   chi_so = null                      ← nhưng không biết hỏi cái gì
--   → đẩy sang AI, mà ngữ cảnh có sẵn 8 dòng của cô ấy, AI vẫn nói không biết
--
-- Hai lỗi chồng nhau:
--   1. Thang trọng điểm xếp tên người ở bậc 3, nhưng luật "neo chắc" chỉ
--      công nhận bậc 1-2 (mã và tên thiết bị). Tên riêng đầy đủ cũng
--      không trùng ngẫu nhiên — gọi ra tên một người LÀ đã hỏi về người
--      đó, y như gọi ra mã thiết bị.
--   2. Không có kiểu trả lời "hồ sơ một người", nên dù có nhận ra cũng
--      chẳng biết dựng câu gì.
--
-- ---------------------------------------------------------------------
-- Sửa
--
-- · Neo chắc mở rộng: mã · tên thiết bị · TÊN NGƯỜI · NHÓM VIỆC
-- · Thêm kiểu 'ho_so_nguoi': người này phụ trách bao nhiêu, xong bao
--   nhiêu, quá hạn bao nhiêu, ở nhóm việc nào, khu vực nào
--
-- Nguyên tắc chung rút ra: hễ câu hỏi gọi ra được MỘT thực thể có thật
-- trong dữ liệu, thì đó chính là câu hỏi — dù không có động từ nào cho
-- biết muốn đếm hay liệt kê. "Phạm Huệ Nhi" một mình đã là một câu hỏi
-- hoàn chỉnh.
-- =====================================================================

create or replace function public.rpc_ai_ho_so_nguoi(
  p_ten text, p_year integer default null
) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_year integer := coalesce(p_year, extract(year from now())::integer);
  v_tong integer; v_xong integer; v_tre integer; v_sap integer;
  v_nhom text; v_kv text; v_ho_tro integer;
begin
  select count(*), count(*) filter (where p.computed_status = 'done'),
         count(*) filter (where p.computed_status = 'over'),
         count(*) filter (where p.computed_status <> 'done'
                            and p.deadline_vmp between current_date and current_date + 30)
    into v_tong, v_xong, v_tre, v_sap
  from vmp_plan_items p
  where p.year = v_year and p.is_active and p.owner_name = p_ten;

  select count(*) into v_ho_tro from vmp_plan_items
  where year = v_year and is_active and secondary_owner = p_ten;

  select string_agg(distinct work_group, ' · ') into v_nhom
  from vmp_plan_items
  where year = v_year and is_active and owner_name = p_ten and work_group is not null;

  select string_agg(distinct o.area, ', ') into v_kv
  from vmp_plan_items p join vmp_objects o on o.code = p.object_code
  where p.year = v_year and p.is_active and p.owner_name = p_ten and o.area is not null;

  if v_tong = 0 and v_ho_tro = 0 then
    return jsonb_build_object('co', false);
  end if;

  return jsonb_build_object('co', true, 'tra_loi',
    'Dạ có ạ 🌸 **' || p_ten || '** là một QA trong kế hoạch thẩm định '
    || v_year || ' đây ạ.' || E'\n\n'
    || '· Đang phụ trách chính: **' || v_tong || ' hạng mục**'
    || case when v_ho_tro > 0 then ', hỗ trợ thêm ' || v_ho_tro || ' hạng mục' else '' end
    || E'\n'
    || '· Đã xong: ' || v_xong
    || case when v_tong > 0 then ' (' || round(100.0 * v_xong / v_tong) || '%)' else '' end
    || case when v_tre > 0 then ' · **quá hạn ' || v_tre || '** ạ 😢'
            else ' · không có mục nào quá hạn ạ 🎉' end || E'\n'
    || case when v_sap > 0 then '· Sắp đến hạn 30 ngày tới: ' || v_sap || ' mục' || E'\n' else '' end
    || case when v_nhom is not null then '· Nhóm việc: ' || v_nhom || E'\n' else '' end
    || case when v_kv is not null then '· Khu vực: ' || v_kv else '' end,
    'goi_y', jsonb_build_array(
      'Liệt kê hạng mục quá hạn của ' || p_ten,
      p_ten || ' còn bao nhiêu việc sắp đến hạn?',
      'Tỷ lệ hoàn thành theo người phụ trách'));
end;
$fn$;

-- Neo chắc mở rộng + kiểu hồ sơ người ---------------------------------
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
  v_neo    boolean := false;
  r        record;
  tk       text;
begin
  if q ~ '(vi sao|tai sao|vi the nao|nen |co nen|danh gia|nhan xet|de xuat|goi y|khuyen|so sanh|khac nhau|giai thich|the nao la|co dung|hop ly|rui ro gi|anh huong gi|lam sao de|cach nao)' then
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

  if    q ~ '(theo nguoi|tung nguoi|moi nguoi|nguoi nao|qa nao)' then v_chieu := 'nguoi';
  elsif q ~ '(theo bo phan|tung bo phan|bo phan nao)'            then v_chieu := 'bo_phan';
  elsif q ~ '(theo khu|tung khu|khu vuc nao)'                    then v_chieu := 'khu_vuc';
  elsif q ~ '(theo loai|tung loai|loai nao)'                     then v_chieu := 'loai_td';
  elsif q ~ '(theo nhom|tung nhom|nhom nao)'                     then v_chieu := 'nhom_viec';
  elsif q ~ '(trong yeu|muc do rui ro|theo diem)'                then v_chieu := 'trong_yeu';
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
    -- NEO CHẮC: mã, tên thiết bị, tên người, nhóm việc. Tên riêng đầy đủ
    -- không trùng ngẫu nhiên — gọi ra tên ai LÀ đã hỏi về người đó.
    if r.loai in ('ma', 'ten_doi_tuong', 'nguoi', 'nhom_viec') then v_neo := true; end if;
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
             || '|minh|em|anh|chi|toi|ban|gium|ho|nhe|nha|kia|ay)$')
  loop
    v_la := array_append(v_la, tk);
  end loop;

  -- "ai làm", "ai phụ trách" → chia theo người
  if v_chieu is null and q ~ '(^| )ai (lam|phu|dang|se|chiu)' then v_chieu := 'nguoi'; end if;

  -- Gọi ra một thực thể mà không nói muốn biết gì thì tự chọn kiểu trả
  -- lời hợp với LOẠI thực thể đó:
  --   người              → hồ sơ người
  --   mã / tên thiết bị  → chi tiết thiết bị
  --   nhóm việc, khu vực → liệt kê (không có "chi tiết" cho một nhóm)
  if v_chi_so is null then
    if    v_loc ? 'nguoi'                              then v_chi_so := 'ho_so_nguoi';
    elsif v_loc ? 'ma' or v_loc ? 'ten_doi_tuong'      then v_chi_so := 'chi_tiet';
    elsif v_neo or v_loc ? 'khu_vuc' or v_loc ? 'line' then v_chi_so := 'liet_ke';
    end if;
  end if;

  -- Chốt chặn: 'chi_tiet' chỉ có nghĩa khi biết ĐÚNG một thiết bị. Không
  -- có mã lẫn tên mà vẫn để chi_tiet thì câu trả lời sẽ trống tên.
  if v_chi_so = 'chi_tiet' and not (v_loc ? 'ma' or v_loc ? 'ten_doi_tuong') then
    v_chi_so := 'liet_ke';
  end if;

  if v_chi_so is null then
    return jsonb_build_object('can_ai', true, 'chi_so', null, 'loc', v_loc,
      'da_hieu', to_jsonb(v_hieu), 'tu_la', to_jsonb(v_la),
      'vi_sao', 'Không xác định được câu hỏi muốn đếm, tính tỷ lệ hay liệt kê.');
  end if;

  if array_length(v_la, 1) > 0 and not v_neo then
    return jsonb_build_object('can_ai', true, 'chi_so', v_chi_so, 'loc', v_loc,
      'da_hieu', to_jsonb(v_hieu), 'tu_la', to_jsonb(v_la),
      'vi_sao', 'Còn từ chưa có trong dữ liệu: ' || array_to_string(v_la, ', ')
                || ', mà câu hỏi không nhắc tới đối tượng cụ thể nào.');
  end if;

  return jsonb_build_object(
    'can_ai', false, 'chi_so', v_chi_so, 'chieu', v_chieu, 'loc', v_loc,
    'da_hieu', to_jsonb(v_hieu), 'tu_la', to_jsonb(v_la), 'neo', v_neo,
    'vi_sao', case when v_neo and array_length(v_la, 1) > 0
      then 'Đã khoá đúng thực thể trong câu hỏi nên trả lời thẳng; mấy chữ "'
           || array_to_string(v_la, ', ') || '" chỉ là cách nói.'
      else 'Hiểu đủ câu hỏi từ dữ liệu — trả lời thẳng bằng SQL, không tốn AI.' end);
end;
$fn$;

-- Bộ dựng câu trả lời nhận thêm kiểu hồ sơ người ----------------------
create or replace function public.rpc_ai_dung_cau_tra_loi(
  p_question text, p_hieu jsonb, p_year integer default null
) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare v_hs jsonb;
begin
  if (p_hieu->>'chi_so') = 'ho_so_nguoi' then
    v_hs := public.rpc_ai_ho_so_nguoi(p_hieu->'loc'->>'nguoi', p_year);
    if (v_hs->>'co')::boolean then
      return jsonb_build_object('khop', true, 'y_dinh', 'ho_so_nguoi',
        'nguon', 'sql', 'tra_loi', v_hs->>'tra_loi', 'goi_y', v_hs->'goi_y');
    end if;
  end if;
  return public.rpc_ai_dung_cau_tra_loi_goc(p_question, p_hieu, p_year);
end;
$fn$;

insert into public.vmp_ai_bo_kiem (ma, cau_hoi, mong_doi, ghi_chu) values
 ('biet_nguoi', 'bạn biết phạm huệ nhi không?',
  '{"duong":"sql","y_dinh":"ho_so_nguoi","chua_chuoi":["Phạm Huệ Nhi","hạng mục"],"khong_chua":["không biết"]}'::jsonb,
  'Từng trả lời "không biết" dù cô ấy phụ trách 22 hạng mục. Hệ đã nhận ra '
  'nguoi=Phạm Huệ Nhi nhưng chi_so=null nên đẩy sang AI, AI cũng nói không biết.')
on conflict (ma) do update set
  cau_hoi = excluded.cau_hoi, mong_doi = excluded.mong_doi, ghi_chu = excluded.ghi_chu;

update public.system_config set value = to_jsonb((value #>> '{}')::int + 1)
where key = 'ai_phien_ban_logic';

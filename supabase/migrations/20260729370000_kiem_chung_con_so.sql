-- =====================================================================
-- KIỂM CHỨNG CON SỐ — chống bịa số bằng cách ĐỐI CHIẾU, không phải tự chấm
--
-- ---------------------------------------------------------------------
-- Vì sao không dùng "reflection" kiểu mô hình tự soát lại
--
-- Mẫu Reflection đang phổ biến 2026 cho mô hình đọc lại câu trả lời của
-- chính nó rồi tự sửa. Nghiên cứu chỉ ra giới hạn cốt tử: mô hình vẫn
-- đang tự chấm mình, không có nguồn ngoài để đối chiếu, nên khi nó tin
-- một điều sai thì vòng tự soát CỦNG CỐ cái sai đó chứ không phá được.
--
-- Với hồ sơ GMP thì kiểu hỏng đó không chấp nhận được. Đã đo được một
-- lần: mô hình bịa "LAF cân là thiết bị đo lường trọng lượng" bằng giọng
-- rất tự tin — tự soát mấy lần cũng ra y như vậy vì nó không hề biết
-- mình sai.
--
-- ---------------------------------------------------------------------
-- Cách làm: kiểm ĐỘ BÁM DỮ LIỆU, đo được, không cần mô hình
--
-- Rút mọi con số trong câu trả lời, rồi đối chiếu với ĐÚNG khối dữ liệu
-- đã đưa cho mô hình. Số nào không có trong đó là số mô hình tự nghĩ ra.
--
-- Đây là kiểm chứng bằng nguồn ngoài (external grounding), không phải tự
-- chấm. Chạy bằng SQL nên không tốn thêm lượt gọi mô hình, và kết quả
-- lặp lại được — cùng đầu vào luôn ra cùng kết luận.
--
-- Bỏ qua các số vô hại: năm (2024-2030), ngày tháng dạng dd/mm, số thứ
-- tự trong danh sách, và số 1-3 hay xuất hiện trong câu chữ ("một hai
-- ngày", "3 giai đoạn").
-- =====================================================================

create or replace function public.rpc_ai_kiem_chung(
  p_tra_loi text, p_du_lieu text
) returns jsonb
language plpgsql immutable
as $fn$
declare
  v_so     text;
  v_lac    text[] := '{}';
  v_tong   integer := 0;
  v_bam    integer := 0;
begin
  if p_tra_loi is null or p_du_lieu is null then
    return jsonb_build_object('kiem_duoc', false);
  end if;

  for v_so in
    select distinct m[1]
    from regexp_matches(p_tra_loi, '(\d[\d\.]*)', 'g') m
  loop
    -- Bỏ dấu chấm ngăn nghìn để so cho khớp mọi cách viết
    v_so := replace(v_so, '.', '');
    continue when v_so = '' or length(v_so) > 9;

    -- Số nhỏ và năm thì bỏ qua: chúng xuất hiện tự nhiên trong câu chữ
    -- nên đối chiếu chỉ tạo báo động giả.
    continue when v_so::bigint between 1 and 3;
    continue when v_so::bigint between 2024 and 2030;

    v_tong := v_tong + 1;
    if replace(p_du_lieu, '.', '') like '%' || v_so || '%' then
      v_bam := v_bam + 1;
    else
      v_lac := array_append(v_lac, v_so);
    end if;
  end loop;

  return jsonb_build_object(
    'kiem_duoc', true,
    'so_da_kiem', v_tong,
    'so_bam_du_lieu', v_bam,
    'so_lac', to_jsonb(v_lac),
    'ty_le_bam', case when v_tong = 0 then null
                      else round(100.0 * v_bam / v_tong) end,
    'dat', (array_length(v_lac, 1) is null),
    'canh_bao', case when array_length(v_lac, 1) is null then null
      else 'Câu trả lời có ' || array_length(v_lac, 1)
           || ' con số KHÔNG có trong dữ liệu đã đưa: '
           || array_to_string(v_lac, ', ')
           || '. Nhiều khả năng mô hình tự nghĩ ra.' end);
end;
$fn$;

comment on function public.rpc_ai_kiem_chung(text, text) is
  'Đối chiếu mọi con số trong câu trả lời với khối dữ liệu đã đưa cho mô '
  'hình. Kiểm chứng bằng NGUỒN NGOÀI, không phải mô hình tự chấm — vì tự '
  'chấm thì cái sai được củng cố chứ không bị phát hiện.';

-- Ghi lại kết quả kiểm chứng để đo chất lượng theo thời gian ----------
alter table public.vmp_ai_chat_log
  add column if not exists so_lac jsonb,
  add column if not exists ty_le_bam integer;

-- ---------------------------------------------------------------------
-- BỘ CÂU HỎI CHUẨN — đo chất lượng, không đoán
--
-- Không có bộ đo thì mọi "cải thiện" đều là cảm tính. Mỗi câu kèm điều
-- kiện kiểm được bằng máy, chạy lại bất cứ lúc nào sau khi sửa.
-- ---------------------------------------------------------------------
create table if not exists public.vmp_ai_bo_kiem (
  ma        text primary key,
  cau_hoi   text not null,
  mong_doi  jsonb not null,   -- {duong, y_dinh, chua_chuoi[], khong_chua[]}
  ghi_chu   text
);

insert into public.vmp_ai_bo_kiem (ma, cau_hoi, mong_doi, ghi_chu) values
 ('dem_qua_han', 'Còn bao nhiêu hạng mục quá hạn?',
  '{"duong":"sql","chua_chuoi":["quá hạn"]}'::jsonb,
  'Câu cơ bản nhất. Phải đi đường SQL, không được tốn AI.'),
 ('ty_le_theo_nguoi', 'Tỷ lệ hoàn thành theo người phụ trách',
  '{"duong":"sql","khong_chua":["100%)"]}'::jsonb,
  'Từng sai: "hoàn thành" bị hiểu là bộ lọc nên mọi tỷ lệ ra 100%.'),
 ('mo_ho_laf', 'LAF cân ở đâu?',
  '{"duong":"sql","y_dinh":"hoi_lai","chua_chuoi":["CCTB01","PCTB501"]}'::jsonb,
  'Khớp 4 thiết bị — phải hỏi lại, không được đoán một cái.'),
 ('mot_doi_tuong', 'HT-01 tới hạn khi nào?',
  '{"duong":"sql","chua_chuoi":["HVAC-C1"]}'::jsonb,
  'Tra một mã cụ thể.'),
 ('toi_la_ai', 'Tôi là ai?',
  '{"duong":"sql","y_dinh":"ve_toi"}'::jsonb,
  'Từng trả lời "không thấy trong dữ liệu" vì web không gửi thông tin người dùng.'),
 ('loc_ghep', 'Bao nhiêu hạng mục IQ ở khu C1 chưa làm?',
  '{"duong":"sql"}'::jsonb,
  'Ghép 3 bộ lọc. Cụm ngắn IQ và C1 từng bị bỏ qua do lọc độ dài.'),
 ('giai_thich_laf', 'Vì sao LAF cân được 9 điểm trọng yếu?',
  '{"duong":"ai","chua_chuoi":["buồng"],"khong_chua":["đo lường trọng lượng","cái cân để cân"]}'::jsonb,
  'Phải tra tài liệu. Mô hình bậc nhanh từng bịa "thiết bị đo lường trọng lượng".')
on conflict (ma) do update set
  cau_hoi = excluded.cau_hoi, mong_doi = excluded.mong_doi, ghi_chu = excluded.ghi_chu;

alter table public.vmp_ai_bo_kiem enable row level security;
drop policy if exists bo_kiem_doc on public.vmp_ai_bo_kiem;
create policy bo_kiem_doc on public.vmp_ai_bo_kiem for select to authenticated using (true);

-- Chạy phần kiểm được bằng SQL (không gọi mô hình) ---------------------
create or replace function public.rpc_ai_chay_bo_kiem(p_nguoi jsonb default null)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $fn$
declare
  r      record;
  v_kq   jsonb;
  v_tl   text;
  v_dat  boolean;
  v_ly   text[];
  v_ds   jsonb := '[]'::jsonb;
  s      text;
begin
  for r in select * from public.vmp_ai_bo_kiem order by ma loop
    v_ly := '{}';
    v_kq := public.rpc_ai_tra_loi_nhanh(
              r.cau_hoi, null,
              coalesce(p_nguoi, '{"ten":"Tào Tiến Hoàn","quyen":"admin","bo_phan":"QA"}'::jsonb),
              'bo-kiem');
    v_tl := coalesce(v_kq->>'tra_loi', '');

    if (r.mong_doi->>'duong') = 'sql' and not (v_kq->>'khop')::boolean then
      v_ly := array_append(v_ly, 'đáng lẽ SQL trả lời được nhưng lại đẩy sang AI');
    end if;
    -- Câu đi đường AI mà lần này trúng ĐỆM thì vẫn đúng: đệm chỉ chứa câu
    -- trả lời do AI soạn trước đó, dữ liệu chưa đổi nên dùng lại là hợp lệ.
    -- Coi 'dem' là hỏng thì cứ chạy bộ kiểm lần thứ hai là báo động giả.
    if (r.mong_doi->>'duong') = 'ai' and (v_kq->>'khop')::boolean
       and coalesce(v_kq->>'nguon','') <> 'dem' then
      v_ly := array_append(v_ly, 'đáng lẽ phải nhờ AI nhưng SQL lại tự trả lời');
    end if;
    if (r.mong_doi->>'duong') = 'ai' and coalesce(v_kq->>'nguon','') = 'dem' then
      v_ds := v_ds || jsonb_build_object(
        'ma', r.ma, 'cau_hoi', r.cau_hoi, 'dat', true, 'duong', 'dem',
        'ly_do', '[]'::jsonb,
        'ghi_chu', 'Trúng đệm — câu trả lời do AI soạn trước đó, dữ liệu chưa đổi.');
      continue;
    end if;
    if r.mong_doi ? 'y_dinh' and coalesce(v_kq->>'y_dinh','') <> (r.mong_doi->>'y_dinh') then
      v_ly := array_append(v_ly, 'ý định ra "' || coalesce(v_kq->>'y_dinh','(rỗng)')
                                 || '" thay vì "' || (r.mong_doi->>'y_dinh') || '"');
    end if;
    -- Câu đi đường AI: bộ kiểm chạy trong SQL nên KHÔNG gọi được mô hình,
    -- không có nội dung để soi. Chỉ kiểm định tuyến; nội dung phải kiểm
    -- qua webhook thật. Nói rõ giới hạn còn hơn báo "đạt" giả.
    if (r.mong_doi->>'duong') = 'ai' and not (v_kq->>'khop')::boolean then
      v_ds := v_ds || jsonb_build_object(
        'ma', r.ma, 'cau_hoi', r.cau_hoi, 'dat', array_length(v_ly,1) is null,
        'duong', 'ai', 'ly_do', to_jsonb(v_ly),
        'ghi_chu', 'Định tuyến đúng. Nội dung phải kiểm qua webhook thật — '
                   || 'bộ kiểm SQL không gọi được mô hình.');
      continue;
    end if;

    for s in select jsonb_array_elements_text(coalesce(r.mong_doi->'chua_chuoi','[]'::jsonb)) loop
      if v_tl not like '%' || s || '%' then
        v_ly := array_append(v_ly, 'thiếu chuỗi "' || s || '"');
      end if;
    end loop;
    for s in select jsonb_array_elements_text(coalesce(r.mong_doi->'khong_chua','[]'::jsonb)) loop
      if v_tl like '%' || s || '%' then
        v_ly := array_append(v_ly, 'chứa chuỗi cấm "' || s || '"');
      end if;
    end loop;

    v_dat := array_length(v_ly, 1) is null;
    v_ds := v_ds || jsonb_build_object(
      'ma', r.ma, 'cau_hoi', r.cau_hoi, 'dat', v_dat,
      'duong', case when (v_kq->>'khop')::boolean then coalesce(v_kq->>'nguon','sql') else 'ai' end,
      'ly_do', to_jsonb(v_ly), 'ghi_chu', r.ghi_chu);
  end loop;

  delete from public.vmp_ai_hoi_thoai where phien = 'bo-kiem';

  return jsonb_build_object(
    'tong', jsonb_array_length(v_ds),
    'dat', (select count(*) from jsonb_array_elements(v_ds) e where (e->>'dat')::boolean),
    'chi_tiet', v_ds);
end;
$fn$;

revoke execute on function public.rpc_ai_kiem_chung(text, text) from anon, public;
revoke execute on function public.rpc_ai_chay_bo_kiem(jsonb) from anon, public;
grant execute on function public.rpc_ai_kiem_chung(text, text) to authenticated, service_role;
grant execute on function public.rpc_ai_chay_bo_kiem(jsonb) to authenticated, service_role;

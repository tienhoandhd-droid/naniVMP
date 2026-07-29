-- =====================================================================
-- BỘ CÂU HỎI VÀNG — máy chấm điểm tra cứu, học từ dự án Du_bao_thoi_tiet
--
-- Vấn đề gốc: mỗi lần sửa tầng nhận diện từ khoá là phải thử tay vài
-- chục câu, và cái sửa hôm nay có thể âm thầm làm hỏng câu đã đúng hôm
-- qua. Dự án thời tiết giải bằng eval harness: bảng golden_questions
-- ghi sẵn "câu này PHẢI ra nguồn nào", một hàm chạy cả bộ và chấm
-- Hit@k. Sai là thấy ngay, không cần nhớ.
--
-- VMP nhỏ hơn nhiều nên máy chấm cũng gọn hơn: dữ liệu tra cứu là
-- 512 thực thể chứ không phải kho tài liệu, nên thứ cần chấm không
-- phải "chunk nào được xếp hạng cao" mà là "TẦNG NHẬN DIỆN có khoanh
-- đúng đối tượng không". Đếm đã là SQL, khoanh đúng thì số đúng.
--
-- Ba loại câu trong bộ (theo đúng khuyến nghị golden dataset):
--   1. Câu có đối tượng rõ      → phải khoanh ra đúng loại + giá trị
--   2. Câu toàn nhà máy         → phải KHÔNG khoanh (khoanh bừa là lỗi)
--   3. Câu ngoài dữ liệu        → phải không khoanh, để AI biết đường
--                                  nói thật và hỏi lại
-- =====================================================================

create table if not exists public.vmp_ai_cau_hoi_vang (
  id         bigserial primary key,
  cau_hoi    text not null unique,
  -- Kỳ vọng: loai+gia_tri khi phải khoanh ra một đối tượng;
  -- {"khong_khoanh": true} khi câu hỏi KHÔNG được khoanh vào đâu.
  mong_doi   jsonb not null,
  nhom       text not null default 'doi_tuong',   -- doi_tuong | toan_cuc | ngoai_du_lieu
  bat        boolean not null default true,
  ghi_chu    text,
  created_at timestamptz not null default now()
);

comment on table public.vmp_ai_cau_hoi_vang is
  'Bộ câu hỏi vàng chấm tầng nhận diện từ khoá. Thêm câu mới MỖI KHI có câu trả lời sai ngoài thực tế — đó là cách bộ này lớn lên.';

create table if not exists public.vmp_ai_cham_diem_log (
  id         bigserial primary key,
  chay_luc   timestamptz not null default now(),
  tong       integer not null,
  dat        integer not null,
  truot      jsonb not null default '[]'::jsonb,
  ghi_chu    text
);

alter table public.vmp_ai_cau_hoi_vang enable row level security;
alter table public.vmp_ai_cham_diem_log enable row level security;
drop policy if exists chv_doc on public.vmp_ai_cau_hoi_vang;
create policy chv_doc on public.vmp_ai_cau_hoi_vang for select to authenticated using (true);
drop policy if exists cdl_doc on public.vmp_ai_cham_diem_log;
create policy cdl_doc on public.vmp_ai_cham_diem_log for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- Máy chấm: chạy cả bộ qua rpc_ai_thong_ke_loc rồi so với kỳ vọng
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_cham_tra_cuu(p_ghi_chu text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $fn$
declare
  r        record;
  v_kq     jsonb;
  v_dat    boolean;
  v_tong   integer := 0;
  v_diem   integer := 0;
  v_truot  jsonb := '[]'::jsonb;
begin
  for r in select * from public.vmp_ai_cau_hoi_vang where bat order by id loop
    v_tong := v_tong + 1;
    v_kq := public.rpc_ai_thong_ke_loc(r.cau_hoi, 3);

    if (r.mong_doi ->> 'khong_khoanh')::boolean is true then
      -- Câu này KHÔNG được khoanh vào đối tượng nào
      v_dat := coalesce((v_kq ->> 'so_nhom')::int, 0) = 0;
    else
      -- Phải có một phần tử đúng loại và chứa đúng giá trị
      select exists (
        select 1 from jsonb_array_elements(v_kq -> 'thong_ke') t
        where t ->> 'loai' = r.mong_doi ->> 'loai'
          and t -> 'danh_sach_gia_tri' ? (r.mong_doi ->> 'gia_tri')
      ) into v_dat;
    end if;

    if v_dat then
      v_diem := v_diem + 1;
    else
      v_truot := v_truot || jsonb_build_array(jsonb_build_object(
        'cau_hoi', r.cau_hoi,
        'mong_doi', r.mong_doi,
        'thuc_te', coalesce((
          select jsonb_agg(jsonb_build_object('loai', t ->> 'loai', 'gia_tri', t ->> 'gia_tri'))
          from jsonb_array_elements(v_kq -> 'thong_ke') t), '[]'::jsonb)));
    end if;
  end loop;

  insert into public.vmp_ai_cham_diem_log (tong, dat, truot, ghi_chu)
  values (v_tong, v_diem, v_truot, p_ghi_chu);

  return jsonb_build_object(
    'ok', true, 'tong', v_tong, 'dat', v_diem,
    'ty_le', case when v_tong > 0 then round(100.0 * v_diem / v_tong, 1) else 0 end,
    'truot', v_truot);
end;
$fn$;

revoke execute on function public.rpc_ai_cham_tra_cuu(text) from public, anon;
grant execute on function public.rpc_ai_cham_tra_cuu(text) to authenticated, service_role;

comment on function public.rpc_ai_cham_tra_cuu(text) is
  'Chạy cả bộ câu hỏi vàng qua tầng nhận diện rồi chấm. Gọi SAU MỖI LẦN sửa rpc_ai_hieu_tu_khoa / rpc_ai_thong_ke_loc / từ điển / bí danh.';

-- ---------------------------------------------------------------------
-- Nạp bộ đầu tiên — gồm đủ các câu ĐÃ TỪNG SAI ngoài thực tế
-- ---------------------------------------------------------------------
delete from public.vmp_ai_cau_hoi_vang;

insert into public.vmp_ai_cau_hoi_vang (cau_hoi, mong_doi, nhom, ghi_chu) values
-- Người — gồm cả câu từng sai thật
('Nhi có đang quá tải không',            '{"loai":"nguoi","gia_tri":"Phạm Huệ Nhi"}',      'doi_tuong', 'Từng trả lời tự mâu thuẫn'),
('Hằng có bận không',                    '{"loai":"nguoi","gia_tri":"Lương Minh Hằng"}',   'doi_tuong', 'Tên một tiếng từng bị lọc nhầm'),
('Tôn Nữ Thiện My còn bao nhiêu việc',   '{"loai":"nguoi","gia_tri":"Tôn Nữ Thiện My"}',   'doi_tuong', null),
('Lê Xuân Đức có quá tải không',         '{"loai":"nguoi","gia_tri":"Lê Xuân Đức"}',       'doi_tuong', 'Từng bị cộng nhầm vai hỗ trợ'),
('việc của Hương đến đâu rồi',           '{"loai":"nguoi","gia_tri":"Nguyễn Thị Hương"}',  'doi_tuong', null),

-- Bộ phận — mã hai ký tự và bí danh
('bên QA còn bao nhiêu việc',            '{"loai":"bo_phan","gia_tri":"qa"}',              'doi_tuong', 'Mã 2 ký tự từng không bắt'),
('QC đã xong bao nhiêu',                 '{"loai":"bo_phan","gia_tri":"qc"}',              'doi_tuong', null),
('kcs còn việc gì không',                '{"loai":"bo_phan","gia_tri":"qc"}',              'doi_tuong', 'Bí danh dân dã'),
('cơ điện có gì quá hạn',                '{"loai":"bo_phan","gia_tri":"cd"}',              'doi_tuong', null),
('xưởng sản xuất đến đâu rồi',           '{"loai":"bo_phan","gia_tri":"xsx"}',             'doi_tuong', null),

-- Nhóm việc / hệ thống
('hệ thống tank đến đâu rồi',            '{"loai":"nhom_viec","gia_tri":"Hệ thống tank"}', 'doi_tuong', 'Từng bị gán số toàn nhà máy'),
('nồi hấp làm xong chưa',                '{"loai":"nhom_viec","gia_tri":"Hệ thống nồi hấp/tủ hấp"}', 'doi_tuong', null),
('khí nén thẩm định đến đâu',            '{"loai":"nhom_viec","gia_tri":"Hệ thống khí nén, khí nito, hơi tinh khiết"}', 'doi_tuong', null),
('nước tinh khiết còn gì chưa làm',      '{"loai":"nhom_viec","gia_tri":"Hệ thống nước tinh khiết, nước cất"}', 'doi_tuong', null),
('buồng cân đã IQ chưa',                 '{"loai":"nhom_viec","gia_tri":"Laf A, isolator, passbox, BSC"}', 'doi_tuong', 'Bí danh + mã 2 ký tự'),

-- Line / khu vực — gộp nhiều giá trị
('line BFS đến đâu rồi',                 '{"loai":"line","gia_tri":"BFS"}',                'doi_tuong', 'Từng trả rỗng vì trúng 3 giá trị'),
('khu B3 thế nào',                       '{"loai":"khu_vuc","gia_tri":"B3"}',              'doi_tuong', null),
('khu vực vi sinh có quá hạn không',     '{"loai":"khu_vuc","gia_tri":"Vi sinh"}',         'doi_tuong', null),

-- Thiết bị cụ thể — cụm dài thắng cụm ngắn
('máy ép vỉ đến đâu',                    '{"loai":"ten_doi_tuong","gia_tri":"Máy Ép Vỉ"}', 'doi_tuong', 'Chữ "máy" từng nuốt cả cụm'),
('nồi hấp HGD 133 đã IQ chưa',           '{"loai":"ten_doi_tuong","gia_tri":"Nồi hấp HGD 133"}', 'doi_tuong', null),
('KNTB133 thế nào rồi',                  '{"loai":"ma","gia_tri":"KNTB133"}',              'doi_tuong', null),

-- Loại thẩm định
('IQ còn bao nhiêu chưa làm',            '{"loai":"loai_td","gia_tri":"IQ"}',              'doi_tuong', null),
('PV đến đâu rồi',                       '{"loai":"loai_td","gia_tri":"PV"}',              'doi_tuong', null),

-- Toàn nhà máy — KHÔNG được khoanh bừa vào một đối tượng
('bao nhiêu hạng mục quá hạn',           '{"khong_khoanh":true}',                          'toan_cuc', 'Khoanh bừa là lỗi'),
('còn bao nhiêu chưa bắt đầu',           '{"khong_khoanh":true}',                          'toan_cuc', null),
('30 ngày tới có gì gấp',                '{"khong_khoanh":true}',                          'toan_cuc', null),
('ai đang ôm nhiều việc nhất',           '{"khong_khoanh":true}',                          'toan_cuc', 'Câu xếp hạng, không khoanh một người'),

-- Ngoài dữ liệu — phải biết là mình không có để hỏi lại / nói thật
('giá vàng hôm nay bao nhiêu',           '{"khong_khoanh":true}',                          'ngoai_du_lieu', null),
('áp suất khí nén hiện tại là bao nhiêu','{"khong_khoanh":true}',                          'ngoai_du_lieu', 'Số vận hành nằm ở BMS, không ở VMP'),
('lương của Nhi bao nhiêu',              '{"loai":"nguoi","gia_tri":"Phạm Huệ Nhi"}',      'ngoai_du_lieu', 'Khoanh đúng người nhưng sổ tay chặn chuyện lương');

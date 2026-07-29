-- =====================================================================
-- LỚP HIỂU TỪ KHOÁ — dò cả khi người hỏi chỉ gõ MỘT PHẦN
--
-- Từ điển thực thể (vmp_ai_tu_dien, 512 mục) đang khớp một chiều: lấy
-- từng mục trong từ điển rồi xem nó có nằm trong câu hỏi không. Cách đó
-- chỉ ăn khi người ta gõ TRỌN tên — "Tank pha chế 1000L", "LAF cân
-- nguyên liệu". Mà thực tế không ai gõ vậy. Người ta gõ "tank", "nồi
-- hấp", "laf", "máy đóng", "KNTB" — và hệ trả về không khớp gì cả, rồi
-- AI trả lời trớt quớt vì không biết câu hỏi đang nói về cái gì.
--
-- Lớp này khớp CHIỀU NGƯỢC LẠI: lấy từng tiếng trong câu hỏi rồi tìm
-- xem tiếng đó nằm trong tên/mã nào. "tank" ra 23 đối tượng, "nồi hấp"
-- ra 6, "KNTB" ra 180 mã. Rồi gói lại thành một đoạn tiếng Việt kể cho
-- AI nghe: câu hỏi này đang nhắc tới nhóm nào, có bao nhiêu cái, ví dụ
-- vài cái. AI đọc xong mới biết đường mà tra và mà hỏi lại cho trúng.
--
-- Kèm hai thứ nữa:
--   * BÍ DANH — cách gọi dân dã không suy ra được từ dữ liệu ("kcs" là
--     qc, "buồng cân" là LAF cân, "nước RO" là nước tinh khiết).
--   * GỢI Ý GẦN ĐÚNG — gõ sai dấu, sai chính tả thì vẫn đoán ra được,
--     để không rơi vào cảnh "hỏi mà hệ không phát hiện".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bí danh: cách gọi dân dã → giá trị chuẩn trong dữ liệu
-- ---------------------------------------------------------------------
create table if not exists public.vmp_ai_bi_danh (
  id       bigserial primary key,
  bi_danh  text not null,          -- viết KHÔNG DẤU, chữ thường
  loai     text not null,          -- bo_phan | loai_td | nhom_viec | khu_vuc | line | ten_doi_tuong | ma
  gia_tri  text,                   -- giá trị chuẩn; để trống nếu chỉ là gợi ý nhóm
  ghi_chu  text,
  unique (bi_danh, loai, gia_tri)
);

comment on table public.vmp_ai_bi_danh is
  'Cách gọi dân dã của người dùng ánh xạ về giá trị chuẩn. Thứ này không suy ra được từ dữ liệu nên phải chép tay.';

create index if not exists vmp_ai_bi_danh_idx on public.vmp_ai_bi_danh (bi_danh);

alter table public.vmp_ai_bi_danh enable row level security;
drop policy if exists vmp_ai_bi_danh_doc on public.vmp_ai_bi_danh;
create policy vmp_ai_bi_danh_doc on public.vmp_ai_bi_danh
  for select to authenticated using (true);

delete from public.vmp_ai_bi_danh;

insert into public.vmp_ai_bi_danh (bi_danh, loai, gia_tri, ghi_chu) values
-- Bộ phận
('kcs',                 'bo_phan', 'qc',  'tên gọi cũ của kiểm nghiệm'),
('kiem nghiem',         'bo_phan', 'qc',  null),
('kiem tra chat luong', 'bo_phan', 'qc',  null),
('dam bao chat luong',  'bo_phan', 'qa',  null),
('co dien',             'bo_phan', 'cd',  null),
('ky thuat',            'bo_phan', 'cd',  null),
('bao tri',             'bo_phan', 'cd',  null),
('xuong',               'bo_phan', 'xsx', null),
('xuong san xuat',      'bo_phan', 'xsx', null),
('san xuat',            'bo_phan', 'xsx', null),
('thu kho',             'bo_phan', 'kho', null),
('nha kho',             'bo_phan', 'kho', null),

-- Loại thẩm định
('tham dinh lap dat',   'loai_td', 'IQ',      null),
('lap dat',             'loai_td', 'IQ',      null),
('tham dinh van hanh',  'loai_td', 'OQ',      null),
('van hanh',            'loai_td', 'OQ',      null),
('tham dinh hieu nang', 'loai_td', 'PQ',      null),
('hieu nang',           'loai_td', 'PQ',      null),
('tham dinh quy trinh', 'loai_td', 'PV',      null),
('tham dinh thiet ke',  'loai_td', 'DQ',      null),
('nghiem thu',          'loai_td', 'FAT/SAT', null),
('bao quan',            'loai_td', 'GSP',     null),
('phan phoi',           'loai_td', 'GDP',     null),

-- Nhóm công việc
('nuoc ro',        'nhom_viec', 'Hệ thống nước tinh khiết, nước cất', null),
('nuoc tinh khiet','nhom_viec', 'Hệ thống nước tinh khiết, nước cất', null),
('nuoc cat',       'nhom_viec', 'Hệ thống nước tinh khiết, nước cất', null),
('he nuoc',        'nhom_viec', 'Hệ thống nước tinh khiết, nước cất', null),
('nuoc thai',      'nhom_viec', 'Hệ thống nước thải',                 null),
('khi nen',        'nhom_viec', 'Hệ thống khí nén, khí nito, hơi tinh khiết', null),
('nito',           'nhom_viec', 'Hệ thống khí nén, khí nito, hơi tinh khiết', null),
('hoi tinh khiet', 'nhom_viec', 'Hệ thống khí nén, khí nito, hơi tinh khiết', null),
('noi hap',        'nhom_viec', 'Hệ thống nồi hấp/tủ hấp',            null),
('tu hap',         'nhom_viec', 'Hệ thống nồi hấp/tủ hấp',            null),
('tiet trung',     'nhom_viec', 'Hệ thống nồi hấp/tủ hấp',            null),
('bon',            'nhom_viec', 'Hệ thống tank',                      null),
('buong can',      'nhom_viec', 'Laf A, isolator, passbox, BSC',      'LAF cân là buồng cân khí sạch, không phải cái cân'),
('tu cay',         'nhom_viec', 'Laf A, isolator, passbox, BSC',      null),
('tu an toan sinh hoc', 'nhom_viec', 'Laf A, isolator, passbox, BSC', null),
('ve sinh',        'nhom_viec', 'Quy trình sản xuất + Quy trình vệ sinh', null),
('lam sach',       'nhom_viec', 'Quy trình sản xuất + Quy trình vệ sinh', null),

-- Khu vực / dây chuyền
('hoa ly',   'khu_vuc', null, 'có Hóa lý 1 và Hóa lý 2'),
('vi sinh',  'khu_vuc', 'Vi sinh', null),
('thoi tui', 'line',    'BFS',     'blow-fill-seal'),
('tui mem',  'line',    'Softbag', null),
('kem',      'line',    'Kem/Gel (X1)', null),
('thuoc mo', 'line',    'Kem/Gel (X1)', null),
('khi dung', 'line',    'Khí dung (X6)', null),
('vien dat', 'line',    'Viên đặt (X10)', null),
('nang mem', 'line',    'Nang mềm (X2)', null),

-- Thiết bị hay gọi tắt
('hplc',       'ten_doi_tuong', null, 'sắc ký lỏng hiệu năng cao'),
('sac ky',     'ten_doi_tuong', null, null),
('may dap',    'ten_doi_tuong', null, null),
('may ep vi',  'ten_doi_tuong', null, null),
('tu say',     'ten_doi_tuong', null, null),
('may dong',   'ten_doi_tuong', null, null),
('may chiet',  'ten_doi_tuong', null, null),
('kho lanh',   'ten_doi_tuong', null, null),
('dieu hoa',   'ten_doi_tuong', null, 'HVAC'),
('hvac',       'ten_doi_tuong', null, null);

-- ---------------------------------------------------------------------
-- 2. Hiểu từ khoá trong câu hỏi
--
-- Trả về ba thứ:
--   nhom      — từ khoá trong câu hỏi trúng vào nhóm nào, bao nhiêu cái
--   bi_danh   — cách gọi dân dã đã quy được về giá trị chuẩn
--   gan_dung  — khi không trúng gì, đoán vài cái gần nhất
--   giai_thich— gói cả ba thành một đoạn tiếng Việt cho AI đọc
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_hieu_tu_khoa(
  p_cau_hoi text,
  p_k       integer default 6
) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $fn$
declare
  v_q        text := regexp_replace(public.vmp_khong_dau(coalesce(p_cau_hoi, '')), '[^a-z0-9]+', ' ', 'g');
  v_nhom     jsonb;
  v_bi_danh  jsonb;
  v_gan      jsonb;
  v_giai     text := '';
  -- Tiếng vô nghĩa với việc dò thực thể: hỏi cái gì cũng có
  v_bo_qua   text[] := array[
    'bao','nhieu','cua','cho','cac','nhung','mot','hai','ba','the','nao','gi','la','co','khong',
    'va','hay','thi','ma','o','tai','tu','den','ve','voi','trong','ngoai','tren','duoi','con',
    'da','dang','se','bi','duoc','cai','nay','do','kia','ay','anh','chi','em','toi','ban','minh',
    'xem','giup','cho','biet','hoi','tra','loi','can','muon','phai','nen','lam','sao','tai','vi',
    'hang','muc','tien','do','tham','dinh','thiet','bi','danh','sach','tinh','hinh','tat','ca',
    'ngay','thang','nam','tuan','hom','nay','qua','han','xong','chua','roi','moi','tong','so'
  ];
begin
  -- --- Khớp ngược: tiếng trong câu hỏi nằm trong tên/mã nào ---
  with tieng as (
    select distinct t
    from unnest(string_to_array(btrim(v_q), ' ')) t
    where length(t) >= 3 and not (t = any(v_bo_qua))
  ),
  -- Ghép thêm cụm hai tiếng liền nhau ("noi hap", "may dong", "kho lanh")
  cum as (
    select distinct btrim(a.t || ' ' || b.t) as t
    from unnest(string_to_array(btrim(v_q), ' ')) with ordinality a(t, i)
    join unnest(string_to_array(btrim(v_q), ' ')) with ordinality b(t, i) on b.i = a.i + 1
    where length(a.t) >= 2 and length(b.t) >= 2
      and not (a.t = any(v_bo_qua)) and not (b.t = any(v_bo_qua))
  ),
  can_do as (
    select t from tieng union select t from cum
  ),
  khop as (
    select c.t, d.loai, d.gia_tri
    from can_do c
    join public.vmp_ai_tu_dien d on d.khoa like '%' || c.t || '%'
  ),
  gom as (
    select t, loai, count(*) as so_khop,
           (array_agg(gia_tri order by length(gia_tri)))[1:4] as vi_du
    from khop
    group by t, loai
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'tu', t, 'loai', loai, 'so_khop', so_khop, 'vi_du', to_jsonb(vi_du))
         order by so_khop, t), '[]'::jsonb)
  into v_nhom
  from (select * from gom order by so_khop, t limit greatest(1, least(p_k, 12))) x;

  -- --- Bí danh ---
  select coalesce(jsonb_agg(jsonb_build_object(
           'goi_la', b.bi_danh, 'loai', b.loai, 'that_ra_la', b.gia_tri, 'ghi_chu', b.ghi_chu)), '[]'::jsonb)
  into v_bi_danh
  from public.vmp_ai_bi_danh b
  where (' ' || v_q || ' ') like '%' || b.bi_danh || '%';

  -- --- Gợi ý gần đúng: chỉ chạy khi chẳng khớp được gì ---
  if jsonb_array_length(v_nhom) = 0 and jsonb_array_length(v_bi_danh) = 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'loai', loai, 'gia_tri', gia_tri, 'diem', round(diem::numeric, 3))
           order by diem desc), '[]'::jsonb)
    into v_gan
    from (
      select d.loai, d.gia_tri, word_similarity(btrim(v_q), d.khoa) as diem
      from public.vmp_ai_tu_dien d
      where word_similarity(btrim(v_q), d.khoa) > 0.4
      order by diem desc
      limit 5
    ) g;
  else
    v_gan := '[]'::jsonb;
  end if;

  -- --- Gói thành lời kể cho AI ---
  if jsonb_array_length(v_nhom) > 0 then
    select v_giai || string_agg(
             format('Chữ "%s" trúng %s mục loại %s (ví dụ: %s).',
                    x ->> 'tu', x ->> 'so_khop', x ->> 'loai',
                    (select string_agg(v, ', ') from jsonb_array_elements_text(x -> 'vi_du') v)),
             ' ')
    into v_giai
    from jsonb_array_elements(v_nhom) x;
  end if;

  if jsonb_array_length(v_bi_danh) > 0 then
    select v_giai || ' ' || string_agg(
             case when x ->> 'that_ra_la' is not null
                  then format('Người hỏi gọi "%s" — trong dữ liệu là "%s".', x ->> 'goi_la', x ->> 'that_ra_la')
                  else format('Người hỏi gọi "%s" — là một nhóm %s, chưa rõ cái nào.', x ->> 'goi_la', x ->> 'loai')
             end
             || coalesce(' (' || (x ->> 'ghi_chu') || ')', ''),
             ' ')
    into v_giai
    from jsonb_array_elements(v_bi_danh) x;
  end if;

  if jsonb_array_length(v_gan) > 0 then
    select v_giai || ' Không khớp thẳng được cái nào; gần đúng nhất có: ' || string_agg(x ->> 'gia_tri', ', ') || '. Nên hỏi lại cho chắc.'
    into v_giai
    from jsonb_array_elements(v_gan) x;
  end if;

  if btrim(coalesce(v_giai, '')) = '' then
    v_giai := 'Câu hỏi không nhắc tới thiết bị, khu vực hay bộ phận cụ thể nào.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'nhom', v_nhom,
    'bi_danh', v_bi_danh,
    'gan_dung', v_gan,
    'giai_thich', btrim(v_giai)
  );
end;
$fn$;

revoke execute on function public.rpc_ai_hieu_tu_khoa(text, integer) from public, anon;
grant execute on function public.rpc_ai_hieu_tu_khoa(text, integer) to authenticated, service_role;

comment on function public.rpc_ai_hieu_tu_khoa(text, integer) is
  'Dò từ khoá trong câu hỏi theo CHIỀU NGƯỢC (tiếng trong câu hỏi nằm trong tên/mã nào), kèm bí danh và gợi ý gần đúng. Trả sẵn đoạn giải thích tiếng Việt để ghép vào prompt.';

-- =====================================================================
-- MỞ RỘNG CÂU HỎI — một ý, nhiều cách nói
--
-- ---------------------------------------------------------------------
-- Vì sao cần
--
-- Sửa riêng lẻ từng ca ("Huệ Nhi" → "Phạm Huệ Nhi") thì mai lại vấp ca
-- khác: "trễ hạn" không khớp "quá hạn", "kiểm định" không khớp "thẩm
-- định", "máy" không khớp "thiết bị", "ai làm" không khớp "người phụ
-- trách". Mỗi lần vá một chỗ là một lần chờ người dùng vấp trước.
--
-- Gốc vấn đề: hệ dò theo ĐÚNG CHỮ người ta gõ. Mà một ý trong tiếng Việt
-- có năm bảy cách nói, chưa kể tiếng Anh xen vào (overdue, validation,
-- equipment) và cách gõ không dấu.
--
-- ---------------------------------------------------------------------
-- Cách làm: THÊM chứ không THAY
--
-- Nhận ra từ đồng nghĩa rồi CHÈN THÊM từ chuẩn vào cuối câu, giữ nguyên
-- chữ gốc. Ví dụ:
--
--   "còn mấy cái bị trễ hạn"
--   → "còn mấy cái bị trễ hạn [qua han]"
--
-- Vì sao thêm mà không thay: chữ gốc còn nguyên thì bước dò thực thể vẫn
-- chạy đúng (tên riêng không bị đụng vào), mà bước dò ý định lại bắt
-- được từ chuẩn. Thay chữ thì dễ phá mất tên người, tên thiết bị.
--
-- Bảng từ đồng nghĩa nằm trong database nên QA thêm được cách gọi mới mà
-- không phải sửa hàm.
-- =====================================================================

create table if not exists public.vmp_ai_dong_nghia (
  id       bigint generated always as identity primary key,
  tu_chuan text not null,          -- dạng đã bỏ dấu, là thứ luật đang dò
  cach_goi text not null,          -- cách nói khác, đã bỏ dấu
  nhom     text,                   -- để đọc cho dễ, không dùng khi dò
  bat      boolean not null default true,
  unique (tu_chuan, cach_goi)
);

alter table public.vmp_ai_dong_nghia enable row level security;
drop policy if exists dong_nghia_doc on public.vmp_ai_dong_nghia;
create policy dong_nghia_doc on public.vmp_ai_dong_nghia
  for select to authenticated using (true);

comment on table public.vmp_ai_dong_nghia is
  'Từ đồng nghĩa để mở rộng câu hỏi. Cả hai cột đều lưu dạng ĐÃ BỎ DẤU vì '
  'luật dò chạy trên chuỗi bỏ dấu. Thêm dòng là dùng ngay, không sửa hàm.';

insert into public.vmp_ai_dong_nghia (tu_chuan, cach_goi, nhom) values
 -- trạng thái
 ('qua han','tre han','trang_thai'), ('qua han','bi tre','trang_thai'),
 ('qua han','cham tien do','trang_thai'), ('qua han','overdue','trang_thai'),
 ('qua han','tre deadline','trang_thai'), ('qua han','het han','trang_thai'),
 ('hoan thanh','da xong','trang_thai'), ('hoan thanh','ket thuc','trang_thai'),
 ('hoan thanh','done','trang_thai'), ('hoan thanh','da hoan tat','trang_thai'),
 ('dang lam','dang chay','trang_thai'), ('dang lam','in progress','trang_thai'),
 ('dang lam','dang xu ly','trang_thai'),
 ('chua lam','chua dong gi','trang_thai'), ('chua lam','chua trien khai','trang_thai'),
 ('chua lam','todo','trang_thai'), ('chua lam','de do','trang_thai'),

 -- chỉ số
 ('bao nhieu','may','chi_so'), ('bao nhieu','so luong bao nhieu','chi_so'),
 ('bao nhieu','dem giup','chi_so'), ('bao nhieu','tong cong','chi_so'),
 ('liet ke','cho xem','chi_so'), ('liet ke','ke ra','chi_so'),
 ('liet ke','show','chi_so'), ('liet ke','gom nhung gi','chi_so'),
 ('liet ke','co nhung cai nao','chi_so'),
 ('ty le','phan tram','chi_so'), ('ty le','dat bao nhieu','chi_so'),

 -- chiều
 ('theo nguoi','ai lam','chieu'), ('theo nguoi','ai phu trach','chieu'),
 ('theo nguoi','ai chiu trach nhiem','chieu'), ('theo nguoi','theo qa','chieu'),
 ('theo nguoi','tung ca nhan','chieu'),
 ('theo khu','theo zone','chieu'), ('theo khu','theo area','chieu'),
 ('theo bo phan','theo phong ban','chieu'), ('theo bo phan','theo don vi','chieu'),
 ('theo loai','theo kieu','chieu'), ('theo loai','theo hinh thuc','chieu'),
 ('trong yeu','muc do quan trong','chieu'), ('trong yeu','criticality','chieu'),
 ('trong yeu','do uu tien','chieu'), ('trong yeu','muc do rui ro','chieu'),

 -- nghiệp vụ
 ('tham dinh','kiem dinh','nghiep_vu'), ('tham dinh','validation','nghiep_vu'),
 ('tham dinh','danh gia thiet bi','nghiep_vu'), ('tham dinh','qualification','nghiep_vu'),
 ('thiet bi','may moc','nghiep_vu'), ('thiet bi','equipment','nghiep_vu'),
 ('thiet bi','he thong','nghiep_vu'),
 ('nguoi phu trach','qa phu trach','nghiep_vu'), ('nguoi phu trach','chu tri','nghiep_vu'),
 ('nguoi phu trach','nguoi lam','nghiep_vu'), ('nguoi phu trach','owner','nghiep_vu'),
 ('de cuong','protocol','nghiep_vu'), ('bao cao','report','nghiep_vu'),
 ('sap den han','gan het han','thoi_gian'), ('sap den han','toi han','thoi_gian'),
 ('sap den han','deadline gan','thoi_gian'), ('sap den han','sap toi','thoi_gian'),
 ('chua co qa','chua phan cong ai','nghiep_vu'), ('chua co qa','bo trong nguoi','nghiep_vu'),
 ('chua co qa','khong ai nhan','nghiep_vu')
on conflict (tu_chuan, cach_goi) do nothing;

-- ---------------------------------------------------------------------
-- Mở rộng: THÊM từ chuẩn vào cuối, giữ nguyên chữ gốc
-- ---------------------------------------------------------------------
create or replace function public.rpc_ai_mo_rong_cau_hoi(p_question text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  q      text := ' ' || public.vmp_khong_dau(coalesce(p_question, '')) || ' ';
  v_them text[] := '{}';
  r      record;
begin
  for r in
    select distinct tu_chuan, cach_goi
    from public.vmp_ai_dong_nghia
    where bat and q like '%' || cach_goi || '%'
    order by tu_chuan
  loop
    -- Từ chuẩn đã có sẵn trong câu thì khỏi thêm
    continue when q like '%' || r.tu_chuan || '%';
    continue when r.tu_chuan = any(v_them);
    v_them := array_append(v_them, r.tu_chuan);
  end loop;

  if array_length(v_them, 1) is null then
    return jsonb_build_object('co_mo_rong', false, 'cau_hoi', p_question, 'them', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'co_mo_rong', true,
    -- Nối vào CUỐI, giữ nguyên chữ gốc: bước dò thực thể vẫn chạy đúng
    -- trên tên riêng, mà bước dò ý định lại bắt được từ chuẩn.
    'cau_hoi', p_question || ' ' || array_to_string(v_them, ' '),
    'them', to_jsonb(v_them),
    'vi_sao', 'Nhận ra cách gọi khác, thêm từ chuẩn: '
              || array_to_string(v_them, ', '));
end;
$fn$;

revoke execute on function public.rpc_ai_mo_rong_cau_hoi(text) from anon, public;
grant  execute on function public.rpc_ai_mo_rong_cau_hoi(text) to authenticated, service_role;

insert into public.vmp_ai_bo_kiem (ma, cau_hoi, mong_doi, ghi_chu) values
 ('dong_nghia_tre_han', 'còn mấy cái bị trễ hạn',
  '{"duong":"sql","chua_chuoi":["quá hạn"]}'::jsonb,
  '"trễ hạn" là cách nói phổ biến hơn "quá hạn" nhưng luật chỉ dò "quá hạn".'),
 ('dong_nghia_ai_lam', 'ai làm nhiều nhất',
  '{"duong":"sql","chua_chuoi":["hạng mục"]}'::jsonb,
  '"ai làm" phải hiểu là chia theo người phụ trách.')
on conflict (ma) do update set
  cau_hoi = excluded.cau_hoi, mong_doi = excluded.mong_doi, ghi_chu = excluded.ghi_chu;

update public.system_config set value = to_jsonb((value #>> '{}')::int + 1)
where key = 'ai_phien_ban_logic';

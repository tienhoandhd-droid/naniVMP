\set ON_ERROR_STOP on
-- =====================================================================
-- Danh mục: thêm đối tượng TRÙNG MÃ phải báo lỗi, không âm thầm ghi đè.
-- Lỗi gốc: rpc_save_catalog_object__five_role_impl_20260824 coi "tìm thấy
-- bản ghi + không gửi version" là sửa bình thường, nên form "Thêm mới" gõ
-- trùng mã sẽ thay tên/thuộc tính của đối tượng đang có.
-- CHỈ chạy trên bản sao production (dựa vào đối tượng HT-15 và dữ liệu có sẵn),
-- trong một giao dịch rồi ROLLBACK.
-- =====================================================================
begin;
set local lock_timeout = '5s';
select set_config('request.jwt.claims', json_build_object('role','authenticated','sub',(
  select p.id::text from public.profiles p
  where public.vmp_business_role(p.id) = 'admin' and p.is_active
  order by p.id limit 1))::text, true);
select set_config('request.jwt.claim.sub', (
  select p.id::text from public.profiles p
  where public.vmp_business_role(p.id) = 'admin' and p.is_active
  order by p.id limit 1), true);

create temp table kq(buoc text, res jsonb) on commit drop;
create temp table truoc on commit drop as
  select object_kind, object_code, object_name, version
  from public.vmp_source_objects where object_code = 'HT-15';

-- Ca 1: gọi lại mã đã có, KHÔNG gửi version -> phải bị chặn, tên giữ nguyên.
insert into kq select 'trung_ma', public.rpc_save_catalog_object(
  t.object_kind, t.object_code, '{"object_name":"TEN BI GHI DE"}'::jsonb,
  'Test: thêm trùng mã', null) from truoc t;
do $$
declare v jsonb := (select res from kq where buoc = 'trung_ma');
begin
  assert v->>'ok' = 'false' and v->>'error_code' = 'OBJECT_EXISTS',
    'A1 ca1: trùng mã phải trả OBJECT_EXISTS, thấy: ' || v::text;
  assert (v->>'current_version')::int = (select version from truoc),
    'A1 ca1: phải trả current_version';
  assert (select object_name from public.vmp_source_objects where object_code = 'HT-15')
       = (select object_name from truoc), 'A1 ca1: tên đối tượng bị ghi đè';
end $$;

-- Ca 2: sửa với version đúng -> đạt.
insert into kq select 'sua_dung', public.rpc_save_catalog_object(
  t.object_kind, t.object_code, '{"note":"A1 test ghi chu"}'::jsonb,
  'Test: sửa đúng version', t.version) from truoc t;
do $$
declare v jsonb := (select res from kq where buoc = 'sua_dung');
begin
  assert v->>'ok' = 'true', 'A1 ca2: sửa đúng version phải đạt, thấy: ' || v::text;
end $$;

-- Ca 3: sửa với version sai -> VERSION_CONFLICT.
insert into kq select 'sua_sai', public.rpc_save_catalog_object(
  t.object_kind, t.object_code, '{"note":"A1 test sai"}'::jsonb,
  'Test: sai version', t.version + 100) from truoc t;
do $$
declare v jsonb := (select res from kq where buoc = 'sua_sai');
begin
  assert v->>'ok' = 'false' and v->>'error_code' = 'VERSION_CONFLICT',
    'A1 ca3: version sai phải VERSION_CONFLICT, thấy: ' || v::text;
end $$;

-- Ca 4: mã mới -> tạo được.
insert into kq select 'ma_moi', public.rpc_save_catalog_object('Thiết bị', 'ZZA1-MOI',
  '{"object_name":"Thiết bị thử A1","department":"Xưởng sản xuất","area_code":"C1","line":"BFS","status":"Hoạt động","show_flag":"Y","validate_flag":"y","frequency_months":12,"year_ref":2023,"report_class":"Nhiễm khuẩn","workdays":3,"first_month":4}'::jsonb,
  'Test: mã mới', null);
do $$
declare v jsonb := (select res from kq where buoc = 'ma_moi');
begin
  assert v->>'ok' = 'true', 'A1 ca4: mã mới phải tạo được, thấy: ' || v::text;
  assert exists (select 1 from public.vmp_source_objects where object_code = 'ZZA1-MOI'),
    'A1 ca4: không thấy đối tượng mới';
end $$;

-- Ca 5: tạo lần hai cùng mã mới (không version) -> OBJECT_EXISTS.
insert into kq select 'ma_moi_lan2', public.rpc_save_catalog_object('Thiết bị', 'ZZA1-MOI',
  '{"object_name":"Ghi đè lần hai"}'::jsonb, 'Test: tạo lại', null);
do $$
declare v jsonb := (select res from kq where buoc = 'ma_moi_lan2');
begin
  assert v->>'error_code' = 'OBJECT_EXISTS', 'A1 ca5: tạo lại phải OBJECT_EXISTS, thấy: ' || v::text;
  assert (select object_name from public.vmp_source_objects where object_code = 'ZZA1-MOI')
       = 'Thiết bị thử A1', 'A1 ca5: tên bị ghi đè';
end $$;

-- Ca 6: luồng service (role service_role) sửa đối tượng có sẵn, version null
-- -> KHÔNG bị OBJECT_EXISTS (vẫn đi tiếp bước kiểm sau, ở đây là ghi thành công).
select set_config('request.jwt.claims', json_build_object('role','service_role','sub',
  (select admin_id from (select p.id::text admin_id from public.profiles p
    where public.vmp_business_role(p.id)='admin' and p.is_active order by p.id limit 1) a))::text, true);
insert into kq select 'service', public.rpc_save_catalog_object(
  t.object_kind, t.object_code, '{"note":"A1 test service"}'::jsonb,
  'Test: service version null', null) from truoc t;
do $$
declare v jsonb := (select res from kq where buoc = 'service');
begin
  assert coalesce(v->>'error_code','') <> 'OBJECT_EXISTS',
    'A1 ca6: service_role không được bị chặn OBJECT_EXISTS, thấy: ' || v::text;
end $$;

select 'A1 PASS' as ket_qua;
rollback;

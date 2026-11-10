\set ON_ERROR_STOP on
-- =====================================================================
-- Phạm vi xưởng: THU HỒI phải luôn làm được.
-- Lỗi gốc: rpc_set_source_workshop_scope_grant chạy kiểm SCOPE_NOT_FOUND
-- (khu vực còn đối tượng hoạt động) và PERSON_NOT_ELIGIBLE (người còn
-- hoạt động) cả khi p_is_active = false. Ngừng hết đối tượng của khu vực
-- hoặc khoá tài khoản xong thì không thu hồi được phạm vi đã cấp.
-- Chạy trên bản sao production, trong một giao dịch rồi ROLLBACK.
-- =====================================================================
begin;
set local lock_timeout = '5s';

create temp table nguoi on commit drop as
select
  (select p.id from public.profiles p
    where public.vmp_business_role(p.id) = 'admin' and p.is_active
    order by p.id limit 1) as admin_id,
  'cd486434-bee1-4616-86a3-f2d4c8fbb1fb'::uuid as pf_a,   -- workshop_manager
  '94fa2f06-c835-4f18-8200-dcccd37cf2f3'::uuid as pf_b;   -- workshop_staff
grant select on nguoi to public;
create temp table kq(buoc text, res jsonb) on commit drop;
grant all on kq to public;

-- Hai khu vực thử, mỗi khu vực một thiết bị hoạt động.
insert into public.departments(id,name,short_name)
values ('ZZA2_DEPT','A2 thử phạm vi xưởng','ZZA2');
insert into public.vmp_objects(code,name,classification,department,area,line,frequency_months)
values ('ZZA2-1','A2 thử 1','tb','ZZA2_DEPT','ZZA2_AREA1',null,12),
       ('ZZA2-2','A2 thử 2','tb','ZZA2_DEPT','ZZA2_AREA2',null,12);
insert into public.vmp_source_objects(
  id,object_kind,object_code,object_name,department,area_code,line,
  validate_flag,frequency_months,report_class,workdays,first_month,year_ref,
  source_tab,source_row,version,timeline_revision,timeline_applied_revision)
values
 ('9a020000-0000-4000-8000-000000000001','Thiết bị','ZZA2-1','A2 thử 1','ZZA2_DEPT','ZZA2_AREA1',null,'y',12,'Hóa lý',5,1,2026,'a2-test',9001,1,0,0),
 ('9a020000-0000-4000-8000-000000000002','Thiết bị','ZZA2-2','A2 thử 2','ZZA2_DEPT','ZZA2_AREA2',null,'y',12,'Hóa lý',5,1,2026,'a2-test',9002,1,0,0);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub',(select admin_id from nguoi),'role','authenticated')::text, true);

insert into kq select 'cap_1', public.rpc_set_source_workshop_scope_grant(
  null,(select pf_a from nguoi),'ZZA2_DEPT','ZZA2_AREA1',null,true,'Test: cấp 1',null);
insert into kq select 'cap_2', public.rpc_set_source_workshop_scope_grant(
  null,(select pf_b from nguoi),'ZZA2_DEPT','ZZA2_AREA2',null,true,'Test: cấp 2',null);
do $$
begin
  assert (select res->>'ok' from kq where buoc='cap_1')='true', 'A2 cấp 1: '||(select res::text from kq where buoc='cap_1');
  assert (select res->>'ok' from kq where buoc='cap_2')='true', 'A2 cấp 2: '||(select res::text from kq where buoc='cap_2');
end $$;

-- Ngừng hết đối tượng khu vực 1; khoá tài khoản người của khu vực 2.
reset role;
update public.vmp_source_objects set is_active=false where object_code='ZZA2-1';
update public.profiles set is_active=false
 where id=(select user_id from public.vmp_performers where id=(select pf_b from nguoi));
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub',(select admin_id from nguoi),'role','authenticated')::text, true);

-- Ca 1: thu hồi khi khu vực không còn đối tượng hoạt động.
insert into kq select 'thu_1', public.rpc_set_source_workshop_scope_grant(
  (select (res->>'grant_id')::uuid from kq where buoc='cap_1'),(select pf_a from nguoi),
  'ZZA2_DEPT','ZZA2_AREA1',null,false,'Test: thu hồi khi hết đối tượng',
  (select (res->>'version')::int from kq where buoc='cap_1'));
do $$
declare v jsonb := (select res from kq where buoc='thu_1');
begin
  assert v->>'ok'='true' and v->>'is_active'='false',
    'A2 ca1: thu hồi khi hết đối tượng phải đạt, thấy: '||v::text;
end $$;

-- Ca 2: thu hồi khi tài khoản người nhận đã bị khoá.
insert into kq select 'thu_2', public.rpc_set_source_workshop_scope_grant(
  (select (res->>'grant_id')::uuid from kq where buoc='cap_2'),(select pf_b from nguoi),
  'ZZA2_DEPT','ZZA2_AREA2',null,false,'Test: thu hồi khi tài khoản khoá',
  (select (res->>'version')::int from kq where buoc='cap_2'));
do $$
declare v jsonb := (select res from kq where buoc='thu_2');
begin
  assert v->>'ok'='true' and v->>'is_active'='false',
    'A2 ca2: thu hồi khi tài khoản khoá phải đạt, thấy: '||v::text;
end $$;

-- Ca 3: cấp mới vẫn bị chặn như cũ.
insert into kq select 'cap_khu_vuc_het', public.rpc_set_source_workshop_scope_grant(
  null,(select pf_a from nguoi),'ZZA2_DEPT','ZZA2_AREA1',null,true,'Test: cấp vào khu vực hết đối tượng',null);
insert into kq select 'cap_nguoi_khoa', public.rpc_set_source_workshop_scope_grant(
  null,(select pf_b from nguoi),'ZZA2_DEPT','ZZA2_AREA2',null,true,'Test: cấp cho người khoá',null);
do $$
begin
  assert (select res->>'error_code' from kq where buoc='cap_khu_vuc_het')='SCOPE_NOT_FOUND',
    'A2 ca3a: cấp vào khu vực hết đối tượng phải SCOPE_NOT_FOUND, thấy: '||(select res::text from kq where buoc='cap_khu_vuc_het');
  assert (select res->>'error_code' from kq where buoc='cap_nguoi_khoa')='PERSON_NOT_ELIGIBLE',
    'A2 ca3b: cấp cho người khoá phải PERSON_NOT_ELIGIBLE, thấy: '||(select res::text from kq where buoc='cap_nguoi_khoa');
end $$;

-- Ca 4: thu hồi vẫn bắt buộc lý do và version.
insert into kq select 'thu_thieu_ly_do', public.rpc_set_source_workshop_scope_grant(
  (select (res->>'grant_id')::uuid from kq where buoc='cap_1'),(select pf_a from nguoi),
  'ZZA2_DEPT','ZZA2_AREA1',null,false,'',
  (select (res->>'version')::int from kq where buoc='thu_1'));
insert into kq select 'thu_sai_version', public.rpc_set_source_workshop_scope_grant(
  (select (res->>'grant_id')::uuid from kq where buoc='cap_1'),(select pf_a from nguoi),
  'ZZA2_DEPT','ZZA2_AREA1',null,false,'Test: sai version',null);
do $$
begin
  assert (select res->>'error_code' from kq where buoc='thu_thieu_ly_do')='REASON_REQUIRED',
    'A2 ca4a: thiếu lý do phải REASON_REQUIRED';
  assert (select res->>'error_code' from kq where buoc='thu_sai_version')='VERSION_CONFLICT',
    'A2 ca4b: thiếu version phải VERSION_CONFLICT, thấy: '||(select res::text from kq where buoc='thu_sai_version');
end $$;

select 'A2 PASS' as ket_qua;
rollback;

\set ON_ERROR_STOP on
-- =====================================================================
-- Kiểm migration 20261023120000_quyen_xem_mot_lan.sql trên DB THỬ.
-- Với MỌI tài khoản (profiles) — kể cả tài khoản tắt/vai lạ — tập đối tượng
-- vmp_visible_source_ids(uid) phải TRÙNG KHÍT tập id mà luật cũ
-- vmp_can_view_source_object(uid, id) cho là xem được. Chạy bằng JWT của
-- chính người đó (luật đòi uid = auth.uid()); chạy bằng vai chủ vì hàm mới
-- cố ý không cấp cho authenticated. ROLLBACK cuối.
-- =====================================================================
begin;
\o /dev/null
create temp table ket_qua (stt serial, ten text, dat boolean, chi_tiet text) on commit drop;
grant insert, select on ket_qua to authenticated, anon;
grant usage on sequence ket_qua_stt_seq to authenticated, anon;

-- Fixture: dữ liệu thật chưa có xưởng được cấp phạm vi → thêm c…05 (workshop_staff,
-- phạm vi khu của 1 thiết bị) và c…03 (qa_staff, chỉ là "QA hỗ trợ thêm" của 1 đối tượng).
insert into public.vmp_email_cho_phep(email, ghi_chu)
select 'quyenxem-' || n || '@example.test', 'SQL test only' from generate_series(3, 5) n on conflict do nothing;
insert into auth.users(id, aud, role, email, created_at, updated_at)
select ('c0231023-1000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'authenticated', 'authenticated',
       'quyenxem-' || n || '@example.test', now(), now()
from generate_series(3, 5, 2) n on conflict do nothing;
insert into public.profiles(id, full_name, email, role, department, is_active)
select ('c0231023-1000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Quyen xem ' || n,
       'quyenxem-' || n || '@example.test', 'department_user'::public.user_role,
       case when n = 5 then 'xsx' else 'qa' end, true
from generate_series(3, 5, 2) n;
update public.vmp_performers set
  access_class = case right(user_id::text, 1) when '5' then 'workshop_staff' else 'qa_progress_editor' end,
  department = case when right(user_id::text, 1) = '5' then 'xsx' else 'qa' end, is_active = true
where user_id::text like 'c0231023-1000-%';
insert into public.vmp_source_workshop_scope_grants(performer_id, department, department_key, area_code, area_key, change_reason)
select f.id, s.department, public.vmp_source_scope_key(s.department), s.area_code, public.vmp_source_scope_key(s.area_code), 'SQL test only'
  from public.vmp_performers f,
       (select * from public.vmp_source_objects where is_active and department is not null and area_code is not null
         order by object_code limit 1) s
 where f.user_id = 'c0231023-1000-4000-8000-000000000005';
insert into public.vmp_source_supporters(source_object_id, performer_id, ly_do)
select (select id from public.vmp_source_objects where is_active order by object_code desc limit 1), f.id, 'SQL test only'
  from public.vmp_performers f where f.user_id = 'c0231023-1000-4000-8000-000000000003';

do $$
declare r record; v_cu int; v_moi int; v_lech int;
begin
  for r in select p.id, coalesce(public.vmp_business_role(p.id), '(không vai)') vai from public.profiles p loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    select count(*) into v_cu from public.vmp_source_objects s where public.vmp_can_view_source_object(r.id, s.id);
    select count(*) into v_moi from public.vmp_visible_source_ids(r.id);
    select count(*) into v_lech from (
      (select s.id from public.vmp_source_objects s where public.vmp_can_view_source_object(r.id, s.id)
       except select v.id from public.vmp_visible_source_ids(r.id) v)
      union all
      (select v.id from public.vmp_visible_source_ids(r.id) v
       except select s.id from public.vmp_source_objects s where public.vmp_can_view_source_object(r.id, s.id))) d;
    insert into ket_qua(ten, dat, chi_tiet) values (format('%s (%s): tập id trùng khít', left(r.id::text, 8), r.vai),
      v_lech = 0 and v_cu = v_moi, format('cũ %s · mới %s · lệch %s', v_cu, v_moi, v_lech));
    -- Gọi hộ người khác (uid ≠ auth.uid()) thì cả hai đều rỗng.
    select count(*) into v_moi from public.vmp_visible_source_ids('00000000-0000-4000-8000-000000000000');
    insert into ket_qua(ten, dat, chi_tiet) values (format('%s: hỏi hộ uid khác → rỗng', left(r.id::text, 8)), v_moi = 0, v_moi::text);
  end loop;
end $$;

select set_config('request.jwt.claims', '', true);
set local role anon;
insert into ket_qua(ten, dat, chi_tiet) values ('fixture: xưởng thử và QA hỗ trợ thêm thử đều thấy ≥1 đối tượng',
  (select bool_and(chi_tiet not like 'cũ 0 %') from ket_qua where ten like 'c0231023%tập id%'),
  (select string_agg(chi_tiet, ' / ') from ket_qua where ten like 'c0231023%tập id%'));
insert into ket_qua(ten, dat) values ('anon không gọi được hàm', not has_function_privilege('anon', 'public.vmp_visible_source_ids(uuid)', 'execute'));
insert into ket_qua(ten, dat) values ('authenticated không gọi thẳng được hàm', not has_function_privilege('authenticated', 'public.vmp_visible_source_ids(uuid)', 'execute'));
reset role;

\o
select stt, case when dat then 'PASS' else 'FAIL' end kq, ten, chi_tiet from ket_qua order by stt;
select count(*) filter (where dat) || '/' || count(*) || ' PASS' tong_ket from ket_qua;
rollback;

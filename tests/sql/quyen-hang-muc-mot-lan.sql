\set ON_ERROR_STOP on
-- =====================================================================
-- Kiểm migration 20261023150000_quyen_hang_muc_mot_lan.sql trên DB THỬ.
-- Với MỌI tài khoản (profiles thật + fixture), ở cả hai chế độ quyền
-- (preview/enforced) và sau khi làm lệch dữ liệu hạng mục/Source:
--   1. vmp_can_view_item_codes(uid)      = tập mã vmp_can_view_item(uid, mã)
--   2. vmp_can_view_plan_item_codes(uid) = tập mã vmp_can_view_plan_item(uid, mã)
--      (kể cả hỏi hộ uid khác → cùng rỗng)
--   3. vmp_visible_plan_items()          = tập dòng theo biểu thức cũ
--   4. rpc_my_editable_progress_rights() của Admin = vmp_item_rights từng dòng.
-- Chạy bằng JWT của chính người đó; vai chủ vì hàm mới cố ý không cấp cho
-- authenticated. ROLLBACK cuối.
-- =====================================================================
begin;
\o /dev/null
create temp table ket_qua (stt serial, ten text, dat boolean, chi_tiet text) on commit drop;
grant insert, select on ket_qua to authenticated, anon;
grant usage on sequence ket_qua_stt_seq to authenticated, anon;

-- Fixture tài khoản (c0231023-1500-…-0n): những nhánh dữ liệu thật chưa có.
--   03 qa_staff chỉ là "QA hỗ trợ thêm"     05 workshop_staff phạm vi khu
--   06 workshop_manager phạm vi khu + line  07 Quản lý QA (qa_manager)
--   08 vai lạ: hồ sơ view_only              09 viewer (vai đăng nhập bị loại)
--   10 Admin đã tắt                          11 QA mất hồ sơ nhân sự hoạt động
insert into public.vmp_email_cho_phep(email, ghi_chu)
select 'quyenhm-' || n || '@example.test', 'SQL test only' from generate_series(3, 11) n on conflict do nothing;
insert into auth.users(id, aud, role, email, created_at, updated_at)
select ('c0231023-1500-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'authenticated', 'authenticated',
       'quyenhm-' || n || '@example.test', now(), now()
from generate_series(3, 11) n where n <> 4 on conflict do nothing;
insert into public.profiles(id, full_name, email, role, department, is_active)
select ('c0231023-1500-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Quyen hang muc ' || n,
       'quyenhm-' || n || '@example.test',
       (case n when 7 then 'qa_manager' when 9 then 'viewer' when 10 then 'admin' else 'department_user' end)::public.user_role,
       case n when 5 then 'qc' when 6 then 'xsx' else 'qa' end,
       n <> 10
from generate_series(3, 11) n where n <> 4;
update public.vmp_performers f set
  access_class = case right(f.user_id::text, 2)
                   when '05' then 'workshop_staff' when '06' then 'equipment_manager'
                   when '07' then 'qa_manager' when '08' then 'view_only' else 'qa_progress_editor' end,
  department = case right(f.user_id::text, 2) when '05' then 'qc' when '06' then 'xsx' else 'qa' end,
  is_active = right(f.user_id::text, 2) <> '11'
where f.user_id::text like 'c0231023-1500-%';
-- Phạm vi xưởng: 05 cấp theo khu của 1 Source; 06 cấp theo khu + line của 1 Source có line.
insert into public.vmp_source_workshop_scope_grants(performer_id, department, department_key, area_code, area_key, change_reason)
select f.id, s.department, public.vmp_source_scope_key(s.department), s.area_code, public.vmp_source_scope_key(s.area_code), 'SQL test only'
  from public.vmp_performers f,
       (select * from public.vmp_source_objects where is_active and department is not null and area_code is not null
         order by object_code limit 1) s
 where f.user_id = 'c0231023-1500-4000-8000-000000000005';
insert into public.vmp_source_workshop_scope_grants(performer_id, department, department_key, area_code, area_key, line, line_key, change_reason)
select f.id, s.department, public.vmp_source_scope_key(s.department), s.area_code, public.vmp_source_scope_key(s.area_code),
       s.line, public.vmp_source_scope_key(s.line), 'SQL test only'
  from public.vmp_performers f,
       (select * from public.vmp_source_objects where is_active and department is not null and area_code is not null
           and nullif(btrim(line), '') is not null
         order by object_code desc limit 1) s
 where f.user_id = 'c0231023-1500-4000-8000-000000000006';
insert into public.vmp_source_supporters(source_object_id, performer_id, ly_do)
select (select id from public.vmp_source_objects where is_active order by object_code desc limit 1), f.id, 'SQL test only'
  from public.vmp_performers f where f.user_id = 'c0231023-1500-4000-8000-000000000003';

-- So khớp cho mọi tài khoản trong trạng thái dữ liệu hiện tại (p_nhan ghi vào tên).
create function pg_temp.so_khop(p_nhan text) returns void language plpgsql as $f$
declare r record; v_cu int; v_moi int; v_lech int; v_loi_cu text; v_loi_moi text;
begin
  for r in select p.id, coalesce(public.vmp_business_role(p.id), '(không vai)') vai,
                  public.vmp_is_active_session(p.id) hoat_dong
             from public.profiles p order by p.id loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.id, 'role', 'authenticated', 'aal', 'aal2')::text, true);

    -- 1. vmp_can_view_item
    select count(*) into v_lech from (
      (select distinct i.validation_code from public.vmp_plan_items i where public.vmp_can_view_item(r.id, i.validation_code)
       except select v.validation_code from public.vmp_can_view_item_codes(r.id) v)
      union all
      (select v.validation_code from public.vmp_can_view_item_codes(r.id) v
       except select i.validation_code from public.vmp_plan_items i where public.vmp_can_view_item(r.id, i.validation_code))) d;
    select count(*) into v_moi from public.vmp_can_view_item_codes(r.id);
    insert into ket_qua(ten, dat, chi_tiet) values (format('%s %s (%s): can_view_item trùng khít', p_nhan, left(r.id::text, 8), r.vai),
      v_lech = 0, format('mới %s · lệch %s', v_moi, v_lech));

    -- 2. vmp_can_view_plan_item — chính mình và hỏi hộ uid khác
    select count(*) into v_lech from (
      (select distinct i.validation_code from public.vmp_plan_items i where public.vmp_can_view_plan_item(r.id, i.validation_code)
       except select v.validation_code from public.vmp_can_view_plan_item_codes(r.id) v)
      union all
      (select v.validation_code from public.vmp_can_view_plan_item_codes(r.id) v
       except select i.validation_code from public.vmp_plan_items i where public.vmp_can_view_plan_item(r.id, i.validation_code))) d;
    select count(*) into v_moi from public.vmp_can_view_plan_item_codes(r.id);
    select count(*) into v_cu from public.vmp_can_view_plan_item_codes('00000000-0000-4000-8000-000000000000');
    insert into ket_qua(ten, dat, chi_tiet) values (format('%s %s (%s): can_view_plan_item trùng khít; hỏi hộ → rỗng', p_nhan, left(r.id::text, 8), r.vai),
      v_lech = 0 and v_cu = 0, format('mới %s · lệch %s · hỏi hộ %s', v_moi, v_lech, v_cu));

    -- 3. vmp_visible_plan_items() so với biểu thức cũ (cùng lỗi nếu phiên không hoạt động)
    v_loi_cu := null; v_loi_moi := null; v_lech := null;
    begin
      select count(*) into v_lech from (
        (select i.id from public.vmp_plan_items i
          where public.item_permissions_mode() = 'preview' or auth.role() = 'service_role'
             or public.vmp_can_view_item(auth.uid(), i.validation_code) or public.is_admin()
         except select v.id from public.vmp_visible_plan_items() v)
        union all
        (select v.id from public.vmp_visible_plan_items() v
         except select i.id from public.vmp_plan_items i
          where public.item_permissions_mode() = 'preview' or auth.role() = 'service_role'
             or public.vmp_can_view_item(auth.uid(), i.validation_code) or public.is_admin())) d;
    exception when others then
      v_loi_cu := sqlstate || ' ' || sqlerrm;   -- ghi lại để so, không bỏ qua
    end;
    if v_loi_cu is not null then
      begin
        perform count(*) from public.vmp_visible_plan_items();
      exception when others then
        v_loi_moi := sqlstate || ' ' || sqlerrm;
      end;
    end if;
    insert into ket_qua(ten, dat, chi_tiet) values (format('%s %s (%s): vmp_visible_plan_items như cũ', p_nhan, left(r.id::text, 8), r.vai),
      coalesce(v_lech = 0, v_loi_cu is not distinct from v_loi_moi and v_loi_cu is not null),
      coalesce('lệch ' || v_lech, 'cùng lỗi: ' || v_loi_cu || ' / ' || coalesce(v_loi_moi, '(không lỗi)')));

    -- 4. Quyền tiến độ của Admin: kết quả mới = vmp_item_rights từng dòng
    if r.vai = 'admin' then
      insert into ket_qua(ten, dat, chi_tiet)
      select format('%s %s (admin): quyền tiến độ = từng dòng', p_nhan, left(r.id::text, 8)),
             moi is not distinct from cu, format('%s dòng', jsonb_array_length(moi))
        from (select public.rpc_my_editable_progress_rights() -> 'rights' moi,
                     coalesce((select jsonb_agg(jsonb_build_object(
                        'validation_code', i.validation_code,
                        'editable_fields', to_jsonb(rights.editable_fields),
                        'view_reason', rights.view_reason) order by i.validation_code)
                       from public.vmp_plan_items i
                       cross join lateral public.vmp_item_rights(r.id, i.validation_code) rights
                      where i.is_active is true and rights.can_view
                        and cardinality(coalesce(rights.editable_fields, '{}'::text[])) > 0), '[]'::jsonb) cu) x;
    end if;
  end loop;
end $f$;

-- A. Dữ liệu thật + fixture, chế độ hiện tại (preview).
select pg_temp.so_khop('A');
-- B. Chế độ enforced.
update public.system_config set value = '"enforced"'::jsonb where key = 'item_permissions_mode';
select pg_temp.so_khop('B');
-- C. Làm lệch dữ liệu: 1 hạng mục tắt; 1 Source tắt (hạng mục mất Source);
--    (2 Source hoạt động cùng mã không tạo được: chỉ mục uq_vmp_source_objects_active_object_code);
--    phạm vi xưởng của 05 hết hạn; Quản lý QA mất quyền manage_qa_assignment.
--    Trigger guard chặn các trạng thái này khi vận hành, nên tắt trigger tạm
--    (replica) để thử luật ở cả trạng thái dữ liệu "không nên có".
set local session_replication_role = replica;
update public.vmp_plan_items set is_active = false
 where id = (select id from public.vmp_plan_items order by validation_code limit 1 offset 1);
update public.vmp_source_objects set is_active = false
 where id = (select id from public.vmp_source_objects where is_active order by object_code limit 1 offset 2);
update public.vmp_source_workshop_scope_grants set valid_from = now() - interval '2 day', expires_at = now() - interval '1 day'
 where performer_id = (select id from public.vmp_performers where user_id = 'c0231023-1500-4000-8000-000000000005');
update public.vmp_screen_permissions set actions = array_remove(actions, 'manage_qa_assignment')
 where business_role = 'qa_manager' and screen_id = 'source';
set local session_replication_role = origin;
select pg_temp.so_khop('C');

select set_config('request.jwt.claims', '', true);
insert into ket_qua(ten, dat, chi_tiet) values ('fixture: xưởng 05/06, QA hỗ trợ thêm 03, Quản lý QA 07 đều thấy ≥1 hạng mục ở A',
  (select bool_and(chi_tiet not like 'mới 0 %') from ket_qua
    where ten ~ '^A c0231023 \((qa_staff|workshop_staff|workshop_manager|qa_manager)\): can_view_plan_item'),
  (select string_agg(ten || ' → ' || chi_tiet, ' / ') from ket_qua where ten ~ '^A c0231023 .*can_view_plan_item'));
insert into ket_qua(ten, dat, chi_tiet) values ('fixture: đủ vai thử (admin, qa_manager, qa_staff, xưởng ×2, không vai)',
  (select count(distinct substring(ten from '\((.*)\)')) >= 6 from ket_qua where ten like 'A %can_view_item%'),
  (select string_agg(distinct substring(ten from '\((.*)\)'), ', ') from ket_qua where ten like 'A %can_view_item%'));
set local role anon;
insert into ket_qua(ten, dat) values ('anon không gọi được 2 hàm mới',
  not has_function_privilege('anon', 'public.vmp_can_view_item_codes(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.vmp_can_view_plan_item_codes(uuid)', 'execute'));
insert into ket_qua(ten, dat) values ('authenticated không gọi thẳng được 2 hàm mới',
  not has_function_privilege('authenticated', 'public.vmp_can_view_item_codes(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.vmp_can_view_plan_item_codes(uuid)', 'execute'));
reset role;

\o
select stt, case when dat then 'PASS' else 'FAIL' end kq, ten, chi_tiet from ket_qua order by stt;
select count(*) filter (where dat) || '/' || count(*) || ' PASS' tong_ket from ket_qua;
rollback;

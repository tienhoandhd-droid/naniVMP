\set ON_ERROR_STOP on
-- =====================================================================
-- Kiểm migration 20261023090000_tro_ly_vmp_moi.sql (JWT giả).
-- CHỈ chạy trên DB THỬ (bản sao production). Toàn bộ trong MỘT giao dịch
-- rồi ROLLBACK: người dùng thử và nhật ký thử không ở lại.
--
-- Số của trợ lý được so với rpc_get_vmp_dashboard (đường web đang dùng),
-- tính lại theo luật classifyVmpDeadline — hai đường code độc lập.
--
-- Người dùng thử: c…01 admin · c…02 qa_manager · c…03 qa_staff
--   c…05 workshop_staff (phạm vi 1 thiết bị) · c…06 đã tắt
-- =====================================================================

begin;
\o /dev/null

create temp table ket_qua (
  stt serial, muc text not null, ten text not null, dat boolean not null, chi_tiet text
) on commit drop;
grant select, insert on ket_qua to authenticated, service_role, anon;
grant usage on sequence ket_qua_stt_seq to authenticated, service_role, anon;

create function pg_temp.ghi(p_muc text, p_ten text, p_dat boolean, p_chi_tiet text default null)
returns void language sql as $$
  insert into pg_temp.ket_qua(muc, ten, dat, chi_tiet)
  values (p_muc, p_ten, coalesce(p_dat, false), p_chi_tiet)
$$;

create function pg_temp.vai(n integer) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', 'c0231023-0000-4000-8000-' || lpad(n::text, 12, '0'),
    'role', 'authenticated', 'aal', 'aal1')::text, true)
$$;

create function pg_temp.hoi(p_cong_cu text, p_tham_so jsonb default '{}') returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  v := public.rpc_tro_ly_tra_loi(p_cong_cu, p_tham_so);
  return coalesce(v, 'null'::jsonb);
exception when others then
  return jsonb_build_object('sqlstate', sqlstate, 'loi', sqlerrm);
end $$;

-- Câu lệnh có ném lỗi không (bắt lỗi để giao dịch không hỏng).
create function pg_temp.loi_khi(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end $$;

-- Số kỳ vọng tính từ dashboard của chính người hỏi, theo luật classifyVmpDeadline.
create function pg_temp.ky_vong() returns jsonb language sql as $$
  with a as (
    select x,
           ((x->'_raw'->>'tt_vmp') = 'completed' or (x->'_raw'->>'ngay_vmp') is not null) xong,
           (x->'_raw'->>'dl_vmp')::date - (now() at time zone 'Asia/Bangkok')::date con
      from jsonb_array_elements(public.rpc_get_vmp_dashboard(
             extract(year from (now() at time zone 'Asia/Bangkok'))::int)->'activities') x
     where coalesce(x->>'state', 'active') = 'active'
  )
  select jsonb_build_object(
    'tong', count(*), 'xong', count(*) filter (where xong),
    'qua_han', count(*) filter (where not xong and con < 0),
    'sap_han', count(*) filter (where not xong and con between 0 and 30),
    'sap_han_7', count(*) filter (where not xong and con between 0 and 7),
    'qua_han_xsx', count(*) filter (where not xong and con < 0 and x->'depts' ? 'xsx'),
    'chua_han', count(*) filter (where not xong and con is null))
  from a
$$;

-- ---------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------
create temp table truoc on commit drop as
select (select md5(string_agg(t::text, '|' order by t.id)) from public.vmp_plan_items t) md5_dot,
       (select md5(string_agg(t::text, '|' order by t.code)) from public.vmp_objects t) md5_tb,
       (select md5(string_agg(t::text, '|' order by t.id)) from public.vmp_change_records t) md5_cc;

insert into public.vmp_email_cho_phep(email, ghi_chu)
select 'troly1023-' || n || '@example.test', 'SQL test only'
from generate_series(1, 6) n on conflict do nothing;
insert into auth.users(id, aud, role, email, created_at, updated_at)
select ('c0231023-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', 'troly1023-' || n || '@example.test', now(), now()
from generate_series(1, 6) n on conflict do nothing;
insert into public.profiles(id, full_name, email, role, department, is_active)
select ('c0231023-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'Tro ly thu ' || n, 'troly1023-' || n || '@example.test',
       (case n when 1 then 'admin' when 2 then 'qa_manager' else 'department_user' end)::public.user_role,
       case when n = 5 then 'xsx' else 'qa' end,
       n <> 6
from generate_series(1, 6) n;
update public.vmp_performers set
  access_class = case right(user_id::text, 1)
    when '1' then 'view_only' when '2' then 'qa_manager' when '3' then 'qa_progress_editor'
    when '5' then 'workshop_staff' else 'qa_progress_editor' end,
  department = case when right(user_id::text, 1) = '5' then 'xsx' else 'qa' end,
  is_active = right(user_id::text, 1) <> '6'
where user_id::text like 'c0231023-%';

-- Thiết bị A (có hạng mục năm nay) cho phạm vi c…05; thiết bị B khác phạm vi.
create temp table moc on commit drop as
with ung_vien as (
  select o.code, o.name, max(s.department) dept
    from public.vmp_objects o
    join public.vmp_source_objects s on s.object_code = o.code and s.is_active
   where o.is_active
     and exists (select 1 from public.vmp_plan_items p where p.object_code = o.code and p.is_active
                   and p.year = extract(year from (now() at time zone 'Asia/Bangkok'))::int
                   and not p.missing_from_sheet and coalesce(p.item_state, 'active') <> 'cancelled')
   group by o.code, o.name having count(*) = 1),
a as (select * from ung_vien order by code limit 1),
b as (select u.* from ung_vien u, a
       where public.vmp_source_scope_key(u.dept) is distinct from public.vmp_source_scope_key(a.dept)
       order by u.code limit 1)
select a.code tb_a, a.name ten_a, b.code tb_b from a, b;
grant select on moc, truoc to authenticated, service_role, anon;

insert into public.vmp_source_workshop_scope_grants(
  performer_id, department, department_key, area_code, area_key, change_reason)
select f.id, s.department, public.vmp_source_scope_key(s.department),
       s.area_code, public.vmp_source_scope_key(s.area_code), 'SQL test only'
from public.vmp_performers f, public.vmp_source_objects s
where f.user_id = 'c0231023-0000-4000-8000-000000000005'
  and s.object_code = (select tb_a from moc) and s.is_active
limit 1;

-- Việc của tôi: một QA thật (qa_staff) đang có việc quá hạn hoặc sắp đến hạn.
-- Chỉ đọc; dùng JWT của họ trong giao dịch này.
create temp table viec on commit drop as
select pf.user_id, pf.id performer_id, count(*) so
  from public.vmp_plan_items i
  join public.vmp_performers pf on pf.id = i.owner_person_id and pf.is_active and pf.user_id is not null
 where i.is_active and not i.missing_from_sheet and coalesce(i.item_state, 'active') = 'active'
   and i.actual_vmp_date is null and i.status_vmp::text <> 'completed'
   and i.deadline_vmp <= (now() at time zone 'Asia/Bangkok')::date + 7
   and i.year = extract(year from (now() at time zone 'Asia/Bangkok'))::int
   and public.vmp_business_role(pf.user_id) = 'qa_staff'
 group by pf.user_id, pf.id
 order by count(*) desc, pf.user_id limit 1;
grant select on viec to authenticated, service_role, anon;

-- Số đếm trực tiếp (đọc bảng bằng quyền chủ, trước khi đổi sang vai authenticated).
create temp table dem on commit drop as
select (select count(*) from public.vmp_change_records where needs_validation) cc_tat_ca,
       (select count(*) from public.vmp_change_records where needs_validation
           and removed_from_sheet_at is null and handling_status in ('cho_xu_ly', 'dang_tham_dinh')) cc_mo,
       (select owner_name from public.vmp_plan_items where owner_name is not null and is_active
         group by owner_name order by count(*) desc limit 1) nguoi_nhieu,
       (select count(*) from public.vmp_change_records where needs_validation) cc_admin;
grant select on dem to authenticated, service_role, anon;

-- Dữ liệu thật không có 2 người trùng một từ trong tên → tạm gán người hỗ trợ
-- "Thử <tên cuối của người nhiều việc>" cho 1 hạng mục để kiểm "khớp nhiều người".
-- Trả lại nguyên trạng trước bước so dấu vân tay (mục 6).
create temp table tam_ho_tro on commit drop as
select i.id, i.secondary_owner cu,
       regexp_replace(btrim((select nguoi_nhieu from dem)), '^.*\s', '') tu_chung
  from public.vmp_plan_items i
 where i.is_active and coalesce(i.item_state, 'active') = 'active' and not i.missing_from_sheet
   and i.year = extract(year from (now() at time zone 'Asia/Bangkok'))::int
   and i.actual_vmp_date is null and i.deadline_vmp < (now() at time zone 'Asia/Bangkok')::date
   and btrim(coalesce(i.owner_name, '')) <> (select nguoi_nhieu from dem)
 order by i.id limit 1;
grant select on tam_ho_tro to authenticated, service_role, anon;
-- Dấu vân tay kế hoạch trừ đúng 1 dòng gán tạm (trigger đổi updated_at/version của dòng đó).
create temp table truoc_dot on commit drop as
select md5(string_agg(t::text, '|' order by t.id)) md5_dot
  from public.vmp_plan_items t where t.id <> (select id from tam_ho_tro);
update public.vmp_plan_items set secondary_owner = 'Thử ' || (select tu_chung from tam_ho_tro)
 where id = (select id from tam_ho_tro);

select pg_temp.ghi('0', 'fixture: có thiết bị A, B khác phạm vi và 1 QA thật có việc gần hạn',
  (select tb_a is not null and tb_b is not null from moc) and (select count(*) = 1 from viec),
  (select tb_a || ' / ' || tb_b from moc));

-- ---------------------------------------------------------------------
-- 1. Quyền gọi hàm
-- ---------------------------------------------------------------------
select pg_temp.ghi('1', 'anon không gọi được 3 RPC trợ lý',
  not has_function_privilege('anon', 'public.rpc_tro_ly_tra_loi(text,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_tro_ly_ghi_nhat_ky(text,text,jsonb,text,text,boolean,integer,integer)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_tro_ly_danh_gia(bigint,smallint)', 'execute'));
select pg_temp.ghi('1', 'authenticated không gọi thẳng được 9 hàm nội bộ nhận p_uid',
  not has_function_privilege('authenticated', 'public.vmp_tl_hang_muc(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.vmp_tl_ten_khop(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.vmp_tl_tong_quan(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.vmp_tl_danh_sach(uuid,text,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.vmp_tl_tien_do(uuid,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.vmp_tl_thiet_bi(uuid,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.vmp_tl_theo_nguoi(uuid,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.vmp_tl_viec_cua_toi(uuid,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.vmp_tl_thay_doi(uuid,jsonb)', 'execute'));
select pg_temp.ghi('1', 'so tên: phải trùng nguyên từ ("Hoa" không khớp "Hoàn", "An" không khớp "Xuân")',
  not public.vmp_tl_khop_ten('Tào Tiến Hoàn', 'Hoa') and not public.vmp_tl_khop_ten('Lê Xuân Đức', 'An')
  and public.vmp_tl_khop_ten('Lương Minh Hằng', 'hang') and public.vmp_tl_khop_ten('Lương Minh Hằng', 'minh hằng'));
select pg_temp.ghi('1', 'authenticated không đọc thẳng được bảng nhật ký',
  not has_table_privilege('authenticated', 'public.vmp_tro_ly_nhat_ky', 'select'));

set local role authenticated;

-- ---------------------------------------------------------------------
-- 2. Admin: số khớp dashboard
-- ---------------------------------------------------------------------
select pg_temp.vai(1);
create temp table kq_admin on commit drop as
select pg_temp.ky_vong() kv, pg_temp.hoi('tong_quan') tq, pg_temp.hoi('qua_han') qh,
       pg_temp.hoi('sap_den_han', '{"so_ngay":30}') sh, pg_temp.hoi('sap_den_han', '{"so_ngay":7}') sh7,
       pg_temp.hoi('qua_han', '{"bo_phan":"xsx"}') qhx, pg_temp.hoi('tien_do', '{"theo":"loai"}') td;
select pg_temp.ghi('2', 'admin: tổng/xong/quá hạn/sắp hạn/chưa hạn = dashboard',
  (select (tq->'so_lieu'->>'tong')::int = (kv->>'tong')::int
      and (tq->'so_lieu'->>'xong')::int = (kv->>'xong')::int
      and (tq->'so_lieu'->>'qua_han')::int = (kv->>'qua_han')::int
      and (tq->'so_lieu'->>'sap_han')::int = (kv->>'sap_han')::int
      and (tq->'so_lieu'->>'chua_han')::int = (kv->>'chua_han')::int from kq_admin),
  (select (tq->'so_lieu')::text || ' vs ' || kv::text from kq_admin));
select pg_temp.ghi('2', 'admin: tổng > 0 (bản sao có dữ liệu thật)',
  (select (kv->>'tong')::int > 0 from kq_admin));
select pg_temp.ghi('2', 'admin: danh sách quá hạn đếm đúng, bảng ≤ 50 dòng',
  (select (qh->'bang'->>'tong_dong')::int = (kv->>'qua_han')::int
      and jsonb_array_length(qh->'bang'->'dong') = least((kv->>'qua_han')::int, 50) from kq_admin),
  (select qh->'bang'->>'tong_dong' from kq_admin));
select pg_temp.ghi('2', 'admin: quá hạn xếp trễ nhiều nhất trước',
  (select (qh->'bang'->'dong'->0->>'con') like 'trễ %' from kq_admin));
select pg_temp.ghi('2', 'admin: sắp đến hạn 30 / 7 ngày đếm đúng',
  (select (sh->'bang'->>'tong_dong')::int = (kv->>'sap_han')::int
      and coalesce((sh7->'bang'->>'tong_dong')::int, 0) = (kv->>'sap_han_7')::int from kq_admin),
  (select coalesce(sh->'bang'->>'tong_dong', '0') || '/' || coalesce(sh7->'bang'->>'tong_dong', '0') from kq_admin));
select pg_temp.ghi('2', 'admin: lọc bộ phận xsx đếm đúng, nhãn hiểu là có "Xưởng sản xuất"',
  (select coalesce((qhx->'bang'->>'tong_dong')::int, 0) = (kv->>'qua_han_xsx')::int
      and qhx->>'hieu_la' like '%Xưởng sản xuất%' from kq_admin),
  (select coalesce(qhx->'bang'->>'tong_dong', '0') || ' vs ' || (kv->>'qua_han_xsx') from kq_admin));
select pg_temp.ghi('2', 'admin: tiến độ theo loại cộng lại = tổng',
  (select sum((d->>'tong')::int) = (kv->>'tong')::int
     from kq_admin, jsonb_array_elements(td->'bang'->'dong') d group by kv));
select pg_temp.ghi('2', 'admin: kết quả có nguồn, công cụ, tham số',
  (select qhx->>'nguon' like 'Kế hoạch VMP năm %' and qhx->>'cong_cu' = 'qua_han'
      and qhx->'tham_so' = '{"bo_phan":"xsx"}' from kq_admin));

-- Thiết bị
select pg_temp.ghi('2', 'thiết bị: gõ đúng mã → 1 đối tượng, có bảng hạng mục',
  (select r->>'hieu_la' like '%' || (select tb_a from moc) || '%'
      and (r->'bang'->>'tong_dong')::int >= 1 and r->'hoi_lai' is null
     from (select pg_temp.hoi('thiet_bi', jsonb_build_object('tu_khoa', lower((select tb_a from moc))))) r(r)));
select pg_temp.ghi('2', 'thiết bị: từ khoá chung → hỏi lại tối đa 8 lựa chọn',
  (select jsonb_array_length(r->'hoi_lai') between 2 and 8
      and r->'hoi_lai'->0->>'cong_cu' = 'thiet_bi'
     from (select pg_temp.hoi('thiet_bi', '{"tu_khoa":"tank"}')) r(r)),
  (select r->>'tra_loi' from (select pg_temp.hoi('thiet_bi', '{"tu_khoa":"tank"}')) r(r)));
select pg_temp.ghi('2', 'thiết bị: gõ không dấu vẫn khớp tên có dấu',
  (select (r->'bang') is not null or (r->'hoi_lai') is not null
     from (select pg_temp.hoi('thiet_bi', jsonb_build_object('tu_khoa',
             public.vmp_tl_chuan((select ten_a from moc))))) r(r)));
select pg_temp.ghi('2', 'thiết bị: không khớp → báo không thấy',
  (select r->>'tra_loi' like 'Không thấy%' from (select pg_temp.hoi('thiet_bi', '{"tu_khoa":"zzqqxx"}')) r(r)));

-- Phiếu thay đổi: so với đếm trực tiếp
select pg_temp.ghi('2', 'thay đổi (tất cả) = số phiếu cần thẩm định',
  (select coalesce((r->'bang'->>'tong_dong')::int, 0) =
          (select cc_tat_ca from dem)
     from (select pg_temp.hoi('thay_doi', '{"loc":"tat_ca"}')) r(r)));
select pg_temp.ghi('2', 'thay đổi (đang mở) = phiếu chưa bỏ, chờ/đang thẩm định',
  (select coalesce((r->'bang'->>'tong_dong')::int, 0) =
          (select cc_mo from dem)
     from (select pg_temp.hoi('thay_doi')) r(r)));

-- Người phụ trách
select pg_temp.ghi('2', 'theo người: một tên có thật → đúng số hạng mục của tên đó',
  (select (r->>'tra_loi') like '%phụ trách ' ||
          (select count(*) from jsonb_array_elements(public.rpc_get_vmp_dashboard(
             extract(year from (now() at time zone 'Asia/Bangkok'))::int)->'activities') x
            where btrim(x->'_raw'->>'qa') = t.ten and coalesce(x->>'state', 'active') = 'active') || ' hạng mục%'
     from (select nguoi_nhieu ten from dem) t,
          lateral (select pg_temp.hoi('theo_nguoi', jsonb_build_object('ten', t.ten))) r(r)));

-- ---------------------------------------------------------------------
-- 3. Kiểm tham số (đầu ra AI không được tin)
-- ---------------------------------------------------------------------
select pg_temp.ghi('3', 'công cụ lạ bị từ chối', (pg_temp.hoi('xoa_du_lieu')->>'ok') = 'false');
select pg_temp.ghi('3', 'bộ phận lạ bị từ chối, không lặng lẽ bỏ lọc',
  (pg_temp.hoi('qua_han', '{"bo_phan":"abc"}')->>'ok') = 'false');
select pg_temp.ghi('3', 'số ngày ngoài 1–180 bị từ chối',
  (pg_temp.hoi('sap_den_han', '{"so_ngay":999}')->>'ok') = 'false'
  and (pg_temp.hoi('sap_den_han', '{"so_ngay":"7; drop"}')->>'ok') = 'false');
select pg_temp.ghi('3', 'tham số không thuộc công cụ bị từ chối',
  (pg_temp.hoi('tong_quan', '{"bo_phan":"xsx"}')->>'ok') = 'false');
select pg_temp.ghi('3', 'giá trị là object/array bị từ chối',
  (pg_temp.hoi('qua_han', '{"nguoi":{"a":1}}')->>'ok') = 'false');
select pg_temp.ghi('3', 'khoá rỗng/null do AI điền thừa được bỏ qua',
  (pg_temp.hoi('qua_han', '{"bo_phan":null,"nguoi":""}')->>'ok') = 'true');
select pg_temp.ghi('3', 'thiết bị thiếu từ khoá bị từ chối',
  (pg_temp.hoi('thiet_bi', '{"tu_khoa":" "}')->>'ok') = 'false');
-- Lọc theo người
select pg_temp.ghi('3', 'lọc người bằng một từ chung của nhiều tên → hỏi lại, không gộp số',
  (select r->'hoi_lai' is not null and jsonb_array_length(r->'hoi_lai') >= 2 and r->'bang' is null
     from (select pg_temp.hoi('qua_han', jsonb_build_object('nguoi', (select tu_chung from tam_ho_tro)))) r(r)),
  (select tu_chung from tam_ho_tro));
select pg_temp.ghi('3', 'lọc người bằng tên đầy đủ → đúng số quá hạn của người đó (chính hoặc hỗ trợ, theo dashboard)',
  (select coalesce((r->'bang'->>'tong_dong')::int, 0) = (
      select count(*) from jsonb_array_elements(public.rpc_get_vmp_dashboard(
               extract(year from (now() at time zone 'Asia/Bangkok'))::int)->'activities') x
       where coalesce(x->>'state', 'active') = 'active'
         and (btrim(x->'_raw'->>'qa') = (select nguoi_nhieu from dem) or btrim(x->'_raw'->>'ho_tro') = (select nguoi_nhieu from dem))
         and not ((x->'_raw'->>'tt_vmp') = 'completed' or (x->'_raw'->>'ngay_vmp') is not null)
         and (x->'_raw'->>'dl_vmp')::date < (now() at time zone 'Asia/Bangkok')::date)
     from (select pg_temp.hoi('qua_han', jsonb_build_object('nguoi', (select nguoi_nhieu from dem)))) r(r)));
select pg_temp.ghi('3', 'lọc người không có thật → báo không thấy',
  (pg_temp.hoi('qua_han', '{"nguoi":"Zyxw"}')->>'tra_loi') like 'Không thấy người%');

-- ---------------------------------------------------------------------
-- 4. Phạm vi theo vai
-- ---------------------------------------------------------------------
select pg_temp.vai(5);
select pg_temp.ghi('4', 'workshop_staff: số khớp dashboard của chính họ và nhỏ hơn admin',
  (select (r->'so_lieu'->>'tong')::int = (pg_temp.ky_vong()->>'tong')::int
      and (r->'so_lieu'->>'qua_han')::int = (pg_temp.ky_vong()->>'qua_han')::int
      and (r->'so_lieu'->>'tong')::int < (select (kv->>'tong')::int from kq_admin)
     from (select pg_temp.hoi('tong_quan')) r(r)),
  (select r->'so_lieu'->>'tong' from (select pg_temp.hoi('tong_quan')) r(r)));
select pg_temp.ghi('4', 'workshop_staff: không tra được thiết bị ngoài phạm vi',
  (pg_temp.hoi('thiet_bi', jsonb_build_object('tu_khoa', (select tb_b from moc)))->>'tra_loi') like 'Không thấy%');
select pg_temp.ghi('4', 'workshop_staff: phiếu thay đổi chỉ trong phạm vi (ít hơn admin)',
  (select coalesce((r->'bang'->>'tong_dong')::int, 0) < (select cc_admin from dem)
     from (select pg_temp.hoi('thay_doi', '{"loc":"tat_ca"}')) r(r)));
select pg_temp.ghi('4', 'workshop_staff: không thấy tên người phụ trách ngoài phạm vi',
  (select r->>'tra_loi' like 'Không thấy%' or (r->>'tra_loi') not like '%phụ trách ' || (select (kv->>'tong') from kq_admin) || '%'
     from (select pg_temp.hoi('theo_nguoi', jsonb_build_object('ten', (select nguoi_nhieu from dem)))) r(r)),
  (select r->>'tra_loi' from (select pg_temp.hoi('theo_nguoi', jsonb_build_object('ten', (select nguoi_nhieu from dem)))) r(r)));
select pg_temp.ghi('4', 'workshop_staff: tra được thiết bị trong phạm vi',
  (pg_temp.hoi('thiet_bi', jsonb_build_object('tu_khoa', (select tb_a from moc)))->'bang') is not null);

select set_config('request.jwt.claims', json_build_object(
  'sub', (select user_id from viec), 'role', 'authenticated', 'aal', 'aal1')::text, true);
select pg_temp.ghi('4', 'qa_staff thật: việc của tôi = việc chưa xong, hạn ≤ 7 ngày, của chính họ (theo dashboard)',
  (select coalesce((r->'bang'->>'tong_dong')::int, 0) = (
      select count(*) from jsonb_array_elements(public.rpc_get_vmp_dashboard(
               extract(year from (now() at time zone 'Asia/Bangkok'))::int)->'activities') x
       where coalesce(x->>'state', 'active') = 'active'
         and (x->'_raw'->>'owner_person_id')::uuid = (select performer_id from viec)
         and not ((x->'_raw'->>'tt_vmp') = 'completed' or (x->'_raw'->>'ngay_vmp') is not null)
         and (x->'_raw'->>'dl_vmp')::date <= (now() at time zone 'Asia/Bangkok')::date + 7)
      and coalesce((r->'bang'->>'tong_dong')::int, 0) > 0
     from (select pg_temp.hoi('viec_cua_toi')) r(r)),
  (select r->>'tra_loi' from (select pg_temp.hoi('viec_cua_toi')) r(r)));
select pg_temp.vai(2);
select pg_temp.ghi('4', 'qa_manager thử không phụ trách việc nào → không lộ việc của người khác',
  (select r->'bang' is null and r->>'tra_loi' like 'Bạn không có việc%' from (select pg_temp.hoi('viec_cua_toi')) r(r)),
  (select r->>'tra_loi' from (select pg_temp.hoi('viec_cua_toi')) r(r)));

select pg_temp.vai(6);
select pg_temp.ghi('4', 'tài khoản đã tắt bị từ chối', (pg_temp.hoi('tong_quan')->>'ok') = 'false');
select set_config('request.jwt.claims', '', true);
select pg_temp.ghi('4', 'không đăng nhập bị từ chối', (pg_temp.hoi('tong_quan')->>'ok') = 'false');

-- ---------------------------------------------------------------------
-- 5. Nhật ký và đánh giá
-- ---------------------------------------------------------------------
select pg_temp.vai(3);
create temp table nk on commit drop as
select (public.rpc_tro_ly_ghi_nhat_ky('bao nhiêu quá hạn', 'qua_han', '{}', 'ai', 'gemini', true, 5, 900)->>'id')::bigint id;
grant select on nk to authenticated;
select pg_temp.ghi('5', 'ghi nhật ký trả id', (select id is not null from nk));
select pg_temp.ghi('5', 'chính người hỏi đánh giá được',
  (public.rpc_tro_ly_danh_gia((select id from nk), 1::smallint)->>'ok') = 'true');
select pg_temp.vai(2);
select pg_temp.ghi('5', 'người khác không đánh giá được lượt của c…03',
  (public.rpc_tro_ly_danh_gia((select id from nk), -1::smallint)->>'ok') = 'false');
select pg_temp.ghi('5', 'đường lạ bị chặn bởi ràng buộc',
  pg_temp.loi_khi('select public.rpc_tro_ly_ghi_nhat_ky(''x'', null, null, ''hack'', null, true, 0, 0)'));
reset role;
select pg_temp.ghi('5', 'dòng nhật ký đúng người, đúng điểm',
  (select user_id = 'c0231023-0000-4000-8000-000000000003' and danh_gia = 1
     from public.vmp_tro_ly_nhat_ky where id = (select id from nk)));

update public.vmp_plan_items set secondary_owner = (select cu from tam_ho_tro)
 where id = (select id from tam_ho_tro);

-- ---------------------------------------------------------------------
-- 6. Không đổi dữ liệu gốc (ngoài việc gắn tạm ở fixture)
-- ---------------------------------------------------------------------
 select pg_temp.ghi('6', 'kế hoạch, danh mục thiết bị và phiếu thay đổi không đổi',
  (select (select md5_dot from truoc_dot) = (select md5(string_agg(t::text, '|' order by t.id))
                                               from public.vmp_plan_items t where t.id <> (select id from tam_ho_tro))
      and md5_tb = (select md5(string_agg(t::text, '|' order by t.code)) from public.vmp_objects t)
      and md5_cc is not distinct from (select md5(string_agg(t::text, '|' order by t.id)) from public.vmp_change_records t)
     from truoc));

\o
select stt, muc, case when dat then 'PASS' else 'FAIL' end kq, ten, left(coalesce(chi_tiet, ''), 160) chi_tiet
  from ket_qua order by stt;
select count(*) filter (where dat) || '/' || count(*) || ' PASS' tong_ket from ket_qua;
rollback;

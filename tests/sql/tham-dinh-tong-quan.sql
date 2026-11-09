-- Trang Tổng quan Thẩm định thực tế (migration 20261110100000).
-- Chạy trên BẢN SAO production (có dữ liệu đợt thật). Chỉ đọc; mọi thứ tạm
-- nằm trong MỘT giao dịch và ROLLBACK ở cuối. Đóng vai bằng
-- request.jwt.claims (như PostgREST) + role authenticated.
-- Mỗi ca in PASS/FAIL; cuối file raise nếu có ca FAIL (thoát mã ≠ 0).
\set ON_ERROR_STOP on
begin;

create temp table t_kq(stt serial primary key, ca text not null, dat boolean not null, chi_tiet text);
grant all on t_kq to authenticated;
grant usage on sequence t_kq_stt_seq to authenticated;

create function pg_temp.ok(p_ca text, p_dat boolean, p_chi_tiet text default null) returns void language plpgsql as $$
begin
  insert into t_kq(ca, dat, chi_tiet) values (p_ca, coalesce(p_dat, false), p_chi_tiet);
  raise notice '%', case when coalesce(p_dat, false) then 'PASS ' || p_ca
    else 'FAIL ' || p_ca || ' — ' || coalesce(left(p_chi_tiet, 600), '') end;
end $$;
create function pg_temp.as_user(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select null::void;
$$;

-- 1. Hàm có tồn tại (RED trước migration).
select pg_temp.ok('01 có hàm public.cpc1_overview(integer)',
  to_regprocedure('public.cpc1_overview(integer)') is not null);
select pg_temp.ok('02 có hàm cpc1_private.run_item_progress(uuid,text)',
  to_regprocedure('cpc1_private.run_item_progress(uuid,text)') is not null);

-- Từ đây cần hàm mới; dừng sớm (FAIL đã ghi) nếu chưa có.
do $$ begin
  if to_regprocedure('public.cpc1_overview(integer)') is null then
    raise exception 'RED: chưa có hàm cpc1_overview — các ca sau bỏ qua.';
  end if;
end $$;

-- Lưu kết quả của từng tài khoản thật để so khi đóng vai.
create temp table t_ai(uid uuid primary key, vai text);
insert into t_ai select id, public.vmp_business_role(id) from public.profiles where is_active;
grant select on t_ai to authenticated;
create temp table t_ra(uid uuid, list_ids text[], tq jsonb, loi text, ds jsonb);
grant all on t_ra to authenticated;

grant execute on all functions in schema pg_temp to authenticated;
set local role authenticated;

do $$
declare a record; ids text[]; tq jsonb; m text; ds jsonb;
begin
  for a in select * from t_ai loop
    perform pg_temp.as_user(a.uid);
    begin
      -- Hồ sơ cpc1_run_list cho thấy, chỉ đợt bắt đầu năm 2026.
      ds := public.cpc1_run_list();
      select coalesce(array_agg(it->>'record_id' order by it->>'record_id'), '{}') into ids
      from jsonb_array_elements(ds) r
      cross join lateral jsonb_array_elements(r->'items') it
      where left(r->>'started_on', 4) = '2026';
      tq := public.cpc1_overview(2026);
      insert into t_ra values (a.uid, ids, tq, null, ds);
    exception when others then
      get stacked diagnostics m = returned_sqlstate;
      insert into t_ra values (a.uid, null, null, m, null);
    end;
  end loop;
end $$;

reset role;

-- 4. QA/Admin: tập hồ sơ ở Tổng quan = tập hồ sơ ở danh sách đợt (cùng quyền).
select pg_temp.ok('04 ' || a.vai || ' ' || left(a.uid::text, 8) || ': hồ sơ Tổng quan = hồ sơ danh sách đợt',
  r.loi is null and r.list_ids = coalesce((
    select array_agg(x->>'record_id' order by x->>'record_id')
    from jsonb_array_elements(r.tq->'systems') s cross join lateral jsonb_array_elements(s->'runs') x), '{}'),
  coalesce(r.loi, '') || ' list=' || coalesce(r.list_ids::text, '') || ' tq=' || coalesce(r.tq::text, ''))
from t_ai a join t_ra r using (uid) where a.vai in ('admin', 'qa_manager', 'qa_staff');

-- 3. Cùng một người xem: cộng tiến độ các hệ thống của một đợt ở Tổng quan
--    = tiến độ cả đợt ở danh sách đợt (cpc1_run_progress, đã lọc theo quyền).
select pg_temp.ok('03 ' || a.vai || ' ' || left(a.uid::text, 8) || ': tổng tiến độ theo hệ thống = tiến độ cả đợt',
  r.loi is null and not exists (
    select 1 from jsonb_array_elements(r.ds) d
    cross join lateral (
      select sum((x->'progress'->>'total')::int) total, sum((x->'progress'->>'complete')::int) complete,
             sum((x->'progress'->>'fail')::int) fail, sum((x->'progress'->>'invalid')::int) invalid,
             bool_and((x->'progress'->>'controls_ready')::boolean) controls_ready
      from jsonb_array_elements(r.tq->'systems') s cross join lateral jsonb_array_elements(s->'runs') x
      where x->>'run_id' = d->>'id') t
    where left(d->>'started_on', 4) = '2026'
      and ((d->'progress'->>'total')::int <> t.total or (d->'progress'->>'complete')::int <> t.complete
        or (d->'progress'->>'fail')::int <> t.fail or (d->'progress'->>'invalid')::int <> t.invalid
        or (d->'progress'->>'controls_ready')::boolean <> t.controls_ready)),
  coalesce(r.loi, '') || ' ' || coalesce(jsonb_array_length(r.ds)::text, '') || ' đợt')
from t_ai a join t_ra r using (uid) where a.vai in ('admin', 'qa_manager', 'qa_staff');

-- 5. Tài khoản xưởng: bị chặn như các RPC thẩm định khác.
select pg_temp.ok('05 ' || a.vai || ' ' || left(a.uid::text, 8) || ': bị chặn 42501', r.loi = '42501', coalesce(r.loi, 'không lỗi'))
from t_ai a join t_ra r using (uid) where coalesce(a.vai, '') not in ('admin', 'qa_manager', 'qa_staff');

-- 6. Admin thấy đủ 3 hệ thống theo thứ tự khí nén, nitơ, hơi; hơi gồm HT-14 + HT-15.
select pg_temp.ok('06 Admin: 3 hệ thống đúng thứ tự, hơi = HT-14 + HT-15',
  (select jsonb_agg(s->>'system') from jsonb_array_elements(r.tq->'systems') s) = '["air","nitrogen","steam"]'
  and r.tq->'systems'->2->'objects' = '["HT-14","HT-15"]', r.tq::text)
from t_ra r where r.uid = '32faba9b-7441-419e-afab-dbb452623b3e';

-- 7. Admin: hạng mục PQ của năm khớp kế hoạch VMP (đếm trực tiếp từ bảng).
select pg_temp.ok('07 Admin: hạng mục PQ ' || (s->>'system') || ' khớp kế hoạch VMP',
  jsonb_array_length(s->'pq_items') = (
    select count(*) from public.vmp_plan_items p join cpc1_private.pq_system_objects o
      on o.object_code = p.object_code and o.system = s->>'system'
    where upper(btrim(p.validation_type)) = 'PQ' and p.year = 2026 and p.is_active and p.item_state = 'active'
      and not coalesce(p.deleted_from_sheet, false)), (s->'pq_items')::text)
from t_ra r cross join lateral jsonb_array_elements(r.tq->'systems') s
where r.uid = '32faba9b-7441-419e-afab-dbb452623b3e';

-- 8. Mỗi dòng đợt: tiến độ + trạng thái ký trùng hàm gốc.
select pg_temp.ok('08 Admin: tiến độ/ký của từng dòng đợt trùng hàm gốc',
  bool_and(x->'progress' = cpc1_private.run_item_progress((x->>'run_id')::uuid, s->>'system')
    and x->'sign_state' = cpc1_private.record_sign_state((x->>'record_id')::uuid, (x->>'version')::int)->'trang_thai'),
  count(*)::text || ' dòng')
from t_ra r cross join lateral jsonb_array_elements(r.tq->'systems') s
cross join lateral jsonb_array_elements(s->'runs') x
where r.uid = '32faba9b-7441-419e-afab-dbb452623b3e';

-- 9. Năm không hợp lệ bị từ chối; năm không có đợt trả mảng rỗng.
set local role authenticated;
select pg_temp.as_user('32faba9b-7441-419e-afab-dbb452623b3e');
do $$
declare st text; tq jsonb;
begin
  begin
    perform public.cpc1_overview(null);
    perform pg_temp.ok('09 năm null bị từ chối', false, 'không lỗi');
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    perform pg_temp.ok('09 năm null bị từ chối', st = '23514', st);
  end;
  tq := public.cpc1_overview(2001);
  perform pg_temp.ok('10 năm không có đợt: runs rỗng, vẫn đủ 3 hệ thống',
    jsonb_array_length(tq->'systems') = 3
    and not exists (select 1 from jsonb_array_elements(tq->'systems') s where jsonb_array_length(s->'runs') > 0),
    tq::text);
end $$;
reset role;

-- 11. Không ai ngoài authenticated gọi được; hàm phụ không lộ ra ngoài.
select pg_temp.ok('11 anon không gọi được cpc1_overview',
  not has_function_privilege('anon', 'public.cpc1_overview(integer)', 'execute'));
select pg_temp.ok('12 authenticated không gọi trực tiếp run_item_progress',
  not has_function_privilege('authenticated', 'cpc1_private.run_item_progress(uuid,text)', 'execute'));

-- Tổng kết.
do $$
declare n_fail int; n_all int;
begin
  select count(*) filter (where not dat), count(*) into n_fail, n_all from t_kq;
  raise notice 'TỔNG: % ca, % FAIL', n_all, n_fail;
  if n_fail > 0 then raise exception 'Có % ca FAIL', n_fail; end if;
end $$;
rollback;

-- Nhật ký thẩm định hiện ký kiểm tra / duyệt / mở lại (migration 20261110140000).
-- Chạy trên BẢN SAO production; mọi thứ trong một giao dịch, ROLLBACK cuối.
\set ON_ERROR_STOP on
begin;
create temp table t_kq(stt serial primary key, ca text not null, dat boolean not null, chi_tiet text);
grant all on t_kq to authenticated; grant usage on sequence t_kq_stt_seq to authenticated;
create function pg_temp.ok(p_ca text, p_dat boolean, p_chi_tiet text default null) returns void language plpgsql as $$
begin
  insert into t_kq(ca, dat, chi_tiet) values (p_ca, coalesce(p_dat, false), p_chi_tiet);
  raise notice '%', case when coalesce(p_dat, false) then 'PASS ' || p_ca
    else 'FAIL ' || p_ca || ' — ' || coalesce(left(p_chi_tiet, 600), '') end;
end $$;
-- Chữ ký thử trên hồ sơ hơi 03/2026 (bảng chỉ thêm; ROLLBACK cuối file).
insert into cpc1_private.record_signatures(record_id, version, y_nghia, actor_id, ho_ten, vai, ly_do, ma_deviation, xac_thuc_luc, created_at)
select r.id, r.version, x.y, '32faba9b-7441-419e-afab-dbb452623b3e', 'Thử', 'admin', x.ly_do, x.dev, now(), now() - x.lui
from public.cpc1_records r, (values ('kiem_tra', null, null, interval '3 min'), ('duyet', null, 'DEV-THU-01', interval '2 min'),
  ('mo_lai', 'Lý do thử mở lại', null, interval '1 min')) x(y, ly_do, dev, lui)
where r.id = '40bde8cb-c9fe-4f7e-bb31-43e030821c07';
select set_config('request.jwt.claims', jsonb_build_object('sub', '32faba9b-7441-419e-afab-dbb452623b3e', 'role', 'authenticated')::text, true);
set local role authenticated;
create temp table t_rows as select x from jsonb_array_elements(public.cpc1_audit_trail('steam', null, null, 1000)->'rows') x;
reset role;
select pg_temp.ok('01 nhật ký có ký ' || y.c, exists (select 1 from t_rows where x->>'loai' = 'ky' and x->>'chi_tiet' = y.c
  and x->>'he_thong' = 'steam' and x->>'ho_so' = '40bde8cb-c9fe-4f7e-bb31-43e030821c07' and x->>'nguoi' <> 'Không rõ'),
  (select string_agg(x::text, ' ') from t_rows where x->>'loai' = 'ky'))
from (values ('kiem_tra'), ('duyet · DEV-THU-01'), ('mo_lai')) y(c);
select pg_temp.ok('02 mở lại có lý do', exists (select 1 from t_rows where x->>'chi_tiet' = 'mo_lai' and x->>'ly_do' = 'Lý do thử mở lại'));
select pg_temp.ok('03 lọc hệ thống khí không thấy chữ ký hồ sơ hơi',
  not exists (select 1 from jsonb_array_elements(public.cpc1_audit_trail('air', null, null, 1000)->'rows') x where x->>'loai' = 'ky'));
select pg_temp.ok('04 sự kiện cũ vẫn còn (lưu, đợt)', exists (select 1 from t_rows where x->>'loai' = 'luu')
  and exists (select 1 from t_rows where x->>'loai' = 'dot'));
-- Người không có quyền PQ trên hồ sơ hơi (department_user, record_pq_right = false) không thấy chữ ký của hồ sơ đó.
select set_config('request.jwt.claims', jsonb_build_object('sub', 'e12b7187-c0f5-4bb3-9005-05520fc4c53f', 'role', 'authenticated')::text, true);
set local role authenticated;
create temp table t_khong_quyen(n int);
do $$ begin
  insert into t_khong_quyen select count(*) from jsonb_array_elements(public.cpc1_audit_trail('steam', null, null, 1000)->'rows') x
    where x->>'loai' = 'ky';
exception when others then insert into t_khong_quyen values (0); raise notice 'người không quyền bị từ chối: %', sqlerrm;
end $$;
reset role;
select pg_temp.ok('05 không có quyền PQ hồ sơ hơi → không thấy chữ ký',
  not cpc1_private.record_pq_right('40bde8cb-c9fe-4f7e-bb31-43e030821c07', false) and (select n from t_khong_quyen) = 0);
do $$
declare n_fail int; n_all int;
begin
  select count(*) filter (where not dat), count(*) into n_fail, n_all from t_kq;
  raise notice 'TỔNG: % ca, % FAIL', n_all, n_fail;
  if n_fail > 0 then raise exception 'Có % ca FAIL', n_fail; end if;
end $$;
rollback;
